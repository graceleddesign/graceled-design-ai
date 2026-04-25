import "server-only";

import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
// Type-only imports are erased at compile time — safe on the startup path.
import type { Prisma } from "@prisma/client";
import type { ScoutGenerationResult } from "./run-scout-batch";
import type { ScoutEvalResult } from "../eval/evaluate-scout";
import type { Round1Engine, Round1V2Result } from "../types";
import type { ProductionBackgroundValidationEvidence } from "@/lib/production-valid-option";

// ── Constants ─────────────────────────────────────────────────────────────────

const WIDE_WIDTH = 1920;
const WIDE_HEIGHT = 1080;
// Square/tall assets are generated at export time, not during Round 1 direction preview.

// ── Internal helpers ──────────────────────────────────────────────────────────

async function writeV2File(fileName: string, png: Buffer): Promise<string> {
  const dir = path.join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, fileName), png);
  return path.posix.join("uploads", fileName);
}

// Sentinel eval for scouts whose generation failed — selectScouts checks
// result.status === "failed" first so rejectReasons is never inspected here.
function makeFailedGenerationEval(): ScoutEvalResult {
  return {
    hardReject: true,
    rejectReasons: ["stats_unavailable"],
    toneScore: 0,
    structureScore: 0,
    marginScore: 0,
    compositeScore: 0,
    imageStats: null,
    textDetected: false,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export function resolveRound1Engine(projectOverride?: string | null): Round1Engine {
  const override = projectOverride?.trim().toLowerCase();
  if (override === "v2" || override === "v1") return override;
  const env = process.env.ROUND1_ENGINE?.trim().toLowerCase();
  return env === "v2" ? "v2" : "v1";
}

export class RoundOneV2NotImplementedError extends Error {
  constructor() {
    super("Round 1 V2 engine is not yet implemented");
    this.name = "RoundOneV2NotImplementedError";
  }
}

export async function runRoundOneV2(projectId: string): Promise<Round1V2Result> {
  console.log(`[v2] start project=${projectId}`);

  // All heavy runtime imports are deferred to here so they never land on the
  // startup module graph. They load once on first invocation and are cached.
  const { prisma } = await import("@/lib/prisma");
  const { normalizeBrief } = await import("../briefs/normalize-brief");
  const { buildScoutPlan } = await import("./build-scout-plan");
  const { runScoutBatch } = await import("./run-scout-batch");
  const { evaluateScout } = await import("../eval/evaluate-scout");
  const { selectScouts } = await import("./select-scouts");
  const { runRebuildBatch } = await import("./run-rebuild-batch");
  const {
    computeCleanMinimalLayout,
    chooseTextPaletteForBackground,
    buildCleanMinimalOverlaySvg,
    buildCleanMinimalDesignDoc,
  } = await import("@/lib/templates/type-clean-min");
  const { renderTrimmedLockupPngFromSvg, composeLockupOnBackground } = await import(
    "@/lib/lockup-compositor"
  );
  const { evaluateBackgroundAcceptance } = await import("@/lib/production-valid-option");
  const storage = await import("../storage");

  // ── 1. Look up project ─────────────────────────────────────────────────────

  const project = await prisma.project.findFirst({
    where: { id: projectId },
    select: {
      id: true,
      series_title: true,
      series_subtitle: true,
      scripture_passages: true,
      series_description: true,
      designNotes: true,
      avoidColors: true,
    },
  });

  if (!project) {
    return { error: "Project not found" };
  }

  // ── 2. Normalize brief ─────────────────────────────────────────────────────

  const brief = normalizeBrief({
    title: project.series_title,
    subtitle: project.series_subtitle,
    scripturePassages: project.scripture_passages,
    description: project.series_description,
    designNotes: project.designNotes,
    avoidColors: project.avoidColors,
    toneHint: null,
    motifHints: [],
    negativeHintExtras: [],
  });

  console.log(`[v2] brief: title="${brief.title}" tone=${brief.toneTarget} motifs=[${brief.motifs.join(",")}]`);

  // ── 3. Build scout plan ────────────────────────────────────────────────────

  const runSeed = randomUUID();
  const plan = buildScoutPlan({
    runSeed,
    tone: brief.toneTarget,
    motifs: brief.motifs,
    negativeHints: brief.negativeHints,
  });

  console.log(`[v2] scout plan: ${plan.slots.length} slots tone=${plan.tone}`);

  // ── 4. Generate scouts (Flux Schnell via FAL) ──────────────────────────────

  const { falFluxSchnellProvider } = await import("../providers/fal-flux-schnell");
  const scoutBatch = await runScoutBatch(plan, falFluxSchnellProvider);

  console.log(`[v2] scouts: ${scoutBatch.successCount}/${scoutBatch.results.length} succeeded in ${scoutBatch.totalLatencyMs}ms`);

  // ── 5. Evaluate scouts ─────────────────────────────────────────────────────

  const evals: ScoutEvalResult[] = await Promise.all(
    scoutBatch.results.map((result: ScoutGenerationResult) => {
      if (result.status === "failed" || !result.imageBytes) {
        return Promise.resolve(makeFailedGenerationEval());
      }
      return evaluateScout({ slot: result.slot, imageBytes: result.imageBytes });
    })
  );

  const acceptedCount = evals.filter((e) => !e.hardReject).length;
  console.log(`[v2] eval: ${acceptedCount}/${evals.length} passed`);

  // ── 6. Select A/B/C ────────────────────────────────────────────────────────

  const selection = selectScouts(plan, scoutBatch.results, evals);

  console.log(
    `[v2] selected: [${selection.selected.map((s) => `${s.label}=${s.grammarKey}`).join(" ")}]` +
      ` shortfall=${selection.shortfall} rejected=${selection.rejected.length}`
  );

  if (selection.selected.length === 0) {
    console.warn(`[v2] shortfall=3 — no viable scouts after evaluation`);
    return { error: "Round 1 V2: all scouts failed evaluation — shortfall=3" };
  }

  // ── 7. Create Generation records (one per selected option) ─────────────────

  const generationIds = selection.selected.map(() => randomUUID());

  await prisma.$transaction(
    selection.selected.map((scout, i) =>
      prisma.generation.create({
        data: {
          id: generationIds[i],
          projectId,
          round: 1,
          status: "RUNNING",
          input: {
            v2: true,
            runSeed,
            optionLabel: scout.label,
            grammarKey: scout.grammarKey,
            diversityFamily: scout.diversityFamily,
            compositeScore: scout.compositeScore,
          } as unknown as Prisma.InputJsonValue,
        },
      })
    )
  );

  console.log(`[v2] created ${generationIds.length} generation records`);

  // ── 8. Persist scout runs + evals (best-effort; non-blocking) ──────────────

  const scoutRunIdBySlotIndex = new Map<number, string>();

  for (let i = 0; i < selection.selected.length; i++) {
    const scout = selection.selected[i];
    const generationId = generationIds[i];
    try {
      const scoutRun = await storage.createScoutRun(
        storage.buildCreateScoutRunInput({
          generationId,
          runSeed,
          slotIndex: scout.slotIndex,
          slot: scout.slot,
          providerId: "fal.flux-schnell",
          prompt: scout.result.prompt,
        })
      );
      await storage.updateScoutRunResult(
        storage.buildUpdateScoutRunResultInput(scoutRun.id, scout.result)
      );
      await storage.createScoutEval(
        storage.buildCreateScoutEvalInput(scoutRun.id, scout.eval)
      );
      scoutRunIdBySlotIndex.set(scout.slotIndex, scoutRun.id);
    } catch (err) {
      console.warn(`[v2] scout run persistence failed for ${scout.label}: ${String(err)}`);
    }
  }

  // ── 9. Rebuild selected scouts (Nano Banana Pro → Nano Banana fallback) ────

  const { falNanaBananaPro } = await import("../providers/fal-nano-banana-pro");
  const { falNanaBanana } = await import("../providers/fal-nano-banana");

  const rebuildBatch = await runRebuildBatch(
    brief,
    selection.selected,
    falNanaBananaPro,
    falNanaBanana
    // No generationId option — per-lane persistence is handled below
  );

  console.log(
    `[v2] rebuild: ${rebuildBatch.successCount}/${rebuildBatch.results.length} succeeded in ${rebuildBatch.totalLatencyMs}ms`
  );

  // ── 10. Per-lane: persist rebuild attempt + lockup composition + settle ─────

  const DEFAULT_PALETTE: {
    primary: string;
    secondary: string;
    tertiary: string;
    rule: string;
    accent: string;
    autoScrim: boolean;
    scrimTint: "#FFFFFF" | "#000000";
    forceTitleOutline: boolean;
    forceTitleShadow: boolean;
    forceSubtitleShadow: boolean;
    safeVariantApplied: boolean;
  } = {
    primary: "#F8FAFC",
    secondary: "#E2E8F0",
    tertiary: "#CBD5E1",
    rule: "#F8FAFC",
    accent: "#F8FAFC",
    autoScrim: false,
    scrimTint: "#000000",
    forceTitleOutline: false,
    forceTitleShadow: false,
    forceSubtitleShadow: false,
    safeVariantApplied: false,
  };

  const buildV2FailedOutput = (
    reason: string,
    label: string,
    bgEvidence?: ProductionBackgroundValidationEvidence
  ): object => {
    const content = { title: brief.title, subtitle: brief.subtitle, passage: brief.scripturePassages };
    const designDoc = buildCleanMinimalDesignDoc({
      width: WIDE_WIDTH,
      height: WIDE_HEIGHT,
      content,
      palette: DEFAULT_PALETTE,
      backgroundImagePath: null,
    });
    return {
      status: "FAILED",
      designDoc,
      designDocByShape: { wide: designDoc },
      notes: `V2 lane ${label} failed: ${reason}`,
      meta: {
        styleRefCount: 0,
        usedStylePaths: [],
        // Persist real background evidence when available so the UI shows the
        // honest failure reason (e.g. background_text_detected) rather than
        // background_text_check_missing.
        ...(bgEvidence ? { productionValidation: { background: bgEvidence } } : {}),
        debug: { v2: true, failureReason: reason },
      },
    };
  };

  const laneLog: string[] = [];

  for (let i = 0; i < selection.selected.length; i++) {
    const scout = selection.selected[i];
    const rebuildResult = rebuildBatch.results[i];
    const generationId = generationIds[i];

    // Persist rebuild attempt record (best-effort)
    try {
      const rebuildAttempt = await storage.createRebuildAttempt(
        storage.buildCreateRebuildAttemptInput({
          generationId,
          selected: scout,
          scoutRunId: scoutRunIdBySlotIndex.get(scout.slotIndex),
          providerId:
            rebuildResult.providerId ??
            (rebuildResult.usedFallback ? "fal.nano-banana" : "fal.nano-banana-pro"),
          attemptOrder: 0,
        })
      );
      await storage.updateRebuildAttemptResult({
        id: rebuildAttempt.id,
        status: rebuildResult.status === "success" ? "SUCCESS" : "FAILED",
        failureReason: rebuildResult.error ?? undefined,
        latencyMs: rebuildResult.latencyMs,
        providerModel: rebuildResult.providerModel,
      });
    } catch (err) {
      console.warn(`[v2] rebuild attempt persistence failed for ${scout.label}: ${String(err)}`);
    }

    if (rebuildResult.status === "failed" || !rebuildResult.imageBytes) {
      const reason = rebuildResult.error ?? "unknown";
      console.warn(`[v2] lane ${scout.label} rebuild failed: ${reason}`);

      await prisma.generation.update({
        where: { id: generationId },
        data: {
          status: "FAILED",
          output: buildV2FailedOutput(`Rebuild failed: ${reason}`, scout.label) as unknown as Prisma.InputJsonValue,
        },
      });

      laneLog.push(`${scout.label}=failed(rebuild:${reason.slice(0, 40)})`);
      continue;
    }

    // Background acceptance: evaluate rebuilt image before committing to COMPLETED
    try {
      const rawBackgroundPng = rebuildResult.imageBytes;

      // Re-evaluate the rebuilt image using the same scout eval infrastructure.
      // This produces honest textFree/scaffoldFree/motifPresent/toneFit evidence.
      const rebuildEval = await evaluateScout({ slot: scout.slot, imageBytes: rawBackgroundPng });

      const backgroundEvidence: ProductionBackgroundValidationEvidence = {
        source: "generated",
        sourceGenerationId: null,
        textFree: !rebuildEval.rejectReasons.includes("text_artifact_detected"),
        scaffoldFree: !rebuildEval.rejectReasons.includes("scaffold_collapse"),
        motifPresent: !rebuildEval.rejectReasons.includes("design_presence_absent"),
        toneFit: !rebuildEval.rejectReasons.includes("tone_implausible"),
        referenceFit: null,
      };

      const acceptance = evaluateBackgroundAcceptance({ evidence: backgroundEvidence });

      // ── Text-detection retry (V2 only) ───────────────────────────────────────
      // When the only (or one of the) rejection reasons is background_text_detected,
      // retry once with a stronger text-removal prompt before giving up.
      let textRetryMeta: {
        attempted: boolean;
        originalRejectionReason: string | null;
        retryRejectionReason: string | null;
        retryBecameAccepted: boolean;
      } = { attempted: false, originalRejectionReason: null, retryRejectionReason: null, retryBecameAccepted: false };

      let acceptedBackgroundPng = rawBackgroundPng;
      let finalBackgroundEvidence = backgroundEvidence;

      if (!acceptance.accepted && acceptance.invalidReasons.includes("background_text_detected")) {
        const originalRejectionReason = acceptance.invalidReasons.join("; ");
        textRetryMeta = { attempted: true, originalRejectionReason, retryRejectionReason: null, retryBecameAccepted: false };

        const { runV2BackgroundTextRetry, textRetrySeed } = await import("./run-text-retry");
        const retryResult = await runV2BackgroundTextRetry({
          scout,
          negativeHints: brief.negativeHints,
          primaryProvider: falNanaBananaPro,
          fallbackProvider: falNanaBanana,
          retrySeed: textRetrySeed(scout.slot.seed),
          evalFn: (args) => evaluateScout(args),
          acceptanceFn: (args) => evaluateBackgroundAcceptance(args),
        });

        console.log(`[v2] lane ${scout.label} text-retry: status=${retryResult.status}`);

        if (retryResult.status === "accepted" && retryResult.imageBytes && retryResult.backgroundEvidence) {
          acceptedBackgroundPng = retryResult.imageBytes;
          finalBackgroundEvidence = retryResult.backgroundEvidence;
          textRetryMeta = { ...textRetryMeta, retryRejectionReason: null, retryBecameAccepted: true };
        } else {
          const retryRejectionReason =
            retryResult.status === "rejected"
              ? (retryResult.retryRejectionReasons ?? []).join("; ")
              : (retryResult.error ?? "generation_failed");
          textRetryMeta = { ...textRetryMeta, retryRejectionReason, retryBecameAccepted: false };

          // Use the retry's evidence if available (more informative), else original
          const persistEvidence = retryResult.backgroundEvidence ?? backgroundEvidence;
          const reason = `Background acceptance failed after text retry: ${retryRejectionReason}`;
          console.warn(`[v2] lane ${scout.label} text-retry also failed: ${retryRejectionReason}`);

          await prisma.generation.update({
            where: { id: generationId },
            data: {
              status: "FAILED",
              output: {
                ...buildV2FailedOutput(reason, scout.label, persistEvidence),
                meta: {
                  ...(buildV2FailedOutput(reason, scout.label, persistEvidence) as any).meta,
                  debug: {
                    v2: true,
                    failureReason: reason,
                    textRetry: textRetryMeta,
                  },
                },
              } as unknown as Prisma.InputJsonValue,
            },
          });

          laneLog.push(`${scout.label}=failed(text-retry:${retryRejectionReason.slice(0, 60)})`);
          continue;
        }
      } else if (!acceptance.accepted) {
        const reason = acceptance.invalidReasons.join("; ");
        console.warn(`[v2] lane ${scout.label} background rejected: ${reason}`);

        await prisma.generation.update({
          where: { id: generationId },
          data: {
            status: "FAILED",
            output: buildV2FailedOutput(`Background acceptance failed: ${reason}`, scout.label, backgroundEvidence) as unknown as Prisma.InputJsonValue,
          },
        });

        laneLog.push(`${scout.label}=failed(acceptance:${reason.slice(0, 60)})`);
        continue;
      }

      // Acceptance passed — compose wide lockup and settle as direction preview (COMPLETED).
      // Round 1 V2 produces a wide-only direction preview. Square/vertical are generated at export.
      const content = {
        title: brief.title,
        subtitle: brief.subtitle,
        passage: brief.scripturePassages,
      };

      // Wide lockup
      const wideLayout = computeCleanMinimalLayout({ width: WIDE_WIDTH, height: WIDE_HEIGHT, content });
      const widePalette = await chooseTextPaletteForBackground({
        backgroundPng: acceptedBackgroundPng,
        sampleRegion: wideLayout.textRegion,
        width: WIDE_WIDTH,
        height: WIDE_HEIGHT,
      });
      const wideLockupSvg = buildCleanMinimalOverlaySvg({ width: WIDE_WIDTH, height: WIDE_HEIGHT, content, palette: widePalette });
      const { png: lockupPng } = await renderTrimmedLockupPngFromSvg(wideLockupSvg);
      const wideFinalPng = await composeLockupOnBackground({
        backgroundPng: acceptedBackgroundPng,
        lockupPng,
        shape: "wide",
        width: WIDE_WIDTH,
        height: WIDE_HEIGHT,
        align: "left",
        integrationMode: "clean",
      });

      // Write wide-only files (3 assets — direction preview contract)
      const prefix = generationId;
      const bgPath = await writeV2File(`${prefix}-wide-bg.png`, acceptedBackgroundPng);
      const lockupPath = await writeV2File(`${prefix}-lockup.png`, lockupPng);
      const wideFinPath = await writeV2File(`${prefix}-wide.png`, wideFinalPng);

      // Wide design doc
      const wideDesignDoc = buildCleanMinimalDesignDoc({ width: WIDE_WIDTH, height: WIDE_HEIGHT, content, palette: widePalette, backgroundImagePath: bgPath });

      const lockupEvidence = {
        source: "generated" as const,
        sourceGenerationId: null,
        textIntegrity: true,   // SVG-rendered lockup — content is deterministically correct
        fitPass: true,          // template-controlled layout
        insideTitleSafeWithMargin: null,
        notTooSmall: null,
      };

      const completedOutput = {
        status: "COMPLETED",
        designDoc: wideDesignDoc,
        designDocByShape: { wide: wideDesignDoc },
        notes: `V2 lane ${scout.label} (${scout.grammarKey}) score=${scout.compositeScore.toFixed(3)} fallback=${rebuildResult.usedFallback}`,
        // Only wide preview path — square/vertical are generated at export time.
        preview: {
          widescreen_main: wideFinPath,
        },
        meta: {
          styleRefCount: 0,
          usedStylePaths: [],
          productionValidation: {
            // Stage marker: wide-only direction preview — square/vertical not yet generated.
            stage: "direction_preview",
            background: finalBackgroundEvidence,
            lockup: lockupEvidence,
            aspects: {
              // Only widescreen is validated in Round 1. Square/vertical are generated at export.
              widescreen: { provenance: "rendered" },
            },
          },
          debug: {
            v2: true,
            grammarKey: scout.grammarKey,
            diversityFamily: scout.diversityFamily,
            compositeScore: scout.compositeScore,
            usedFallback: rebuildResult.usedFallback,
            providerModel: rebuildResult.providerModel,
            backgroundSource: "generated",
            lockupSource: "generated",
            generationLifecycleState: "GENERATION_COMPLETED",
            backgroundFailureReason: null,
            textRetry: textRetryMeta,
            // Wide asset present; square/vertical intentionally not generated in Round 1.
            aspectAssets: {
              widescreen: "ok",
            },
            squareVerticalNotGenerated: "round1_direction_preview_only",
          },
        },
      };

      await prisma.$transaction(async (tx) => {
        await tx.generation.update({
          where: { id: generationId },
          data: {
            status: "COMPLETED",
            output: completedOutput as unknown as Prisma.InputJsonValue,
          },
        });
        // Direction preview: 3 assets only (wide_bg, series_lockup, wide).
        // Square/vertical assets are created during export, not Round 1.
        await tx.asset.createMany({
          data: [
            { projectId, generationId, kind: "BACKGROUND", slot: "wide_bg",       file_path: bgPath,      mime_type: "image/png", width: WIDE_WIDTH, height: WIDE_HEIGHT },
            { projectId, generationId, kind: "LOCKUP",     slot: "series_lockup", file_path: lockupPath,  mime_type: "image/png", width: null,       height: null        },
            { projectId, generationId, kind: "IMAGE",      slot: "wide",          file_path: wideFinPath, mime_type: "image/png", width: WIDE_WIDTH, height: WIDE_HEIGHT },
          ],
        });
      });

      laneLog.push(`${scout.label}=completed(${rebuildResult.usedFallback ? "fallback" : "primary"})`);
      console.log(`[v2] lane ${scout.label} settled: wide=${wideFinPath}`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`[v2] lane ${scout.label} composition/settlement error: ${reason}`);

      try {
        await prisma.generation.update({
          where: { id: generationId },
          data: {
            status: "FAILED",
            output: buildV2FailedOutput(`Composition failed: ${reason}`, scout.label) as unknown as Prisma.InputJsonValue,
          },
        });
      } catch (settleErr) {
        console.error(`[v2] lane ${scout.label} failed to settle: ${String(settleErr)}`);
      }

      laneLog.push(`${scout.label}=failed(composition:${reason.slice(0, 40)})`);
    }
  }

  const completedCount = laneLog.filter((l) => l.includes("=completed")).length;
  console.log(`[v2] done: ${completedCount}/${selection.selected.length} lanes completed [${laneLog.join(" ")}]`);

  return {};
}
