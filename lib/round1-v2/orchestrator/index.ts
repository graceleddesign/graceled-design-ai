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
import type { BackfillDebugMeta, TextRetryMeta } from "./lane-backfill";
import { ROUND1_V2_CONFIG } from "../config";

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
  const { buildBackfillPool, selectEligibleBackfill, runLaneWithBackfill } = await import("./lane-backfill");
  const { planDesignModes } = await import("./plan-design-modes");
  const {
    getDesignModeLockupRecipe,
    getDesignModeLockupRecipeOverride,
    shouldSuppressAutoScrim,
  } = await import("./design-mode-lockup-recipes");
  const { planBriefSignals } = await import("../briefs/plan-brief-signals");
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

  // ── 2. Plan brief signals + normalize brief ────────────────────────────────

  // Deterministic tone/motif planner — no LLM calls.
  // Infers toneHint and motifHints from project text fields so scout planning
  // and rebuild prompts receive real visual direction rather than neutral/empty defaults.
  const briefSignals = planBriefSignals({
    title: project.series_title,
    subtitle: project.series_subtitle,
    scripturePassages: project.scripture_passages,
    description: project.series_description,
    designNotes: project.designNotes,
  });

  console.log(
    `[v2] brief signals: tone=${briefSignals.toneHint} (${briefSignals.debug.toneSource})` +
    ` motifs=[${briefSignals.motifHints.join(",")}]` +
    ` signals=[${briefSignals.debug.toneSignalWords.join(",")}]`
  );

  const brief = normalizeBrief({
    title: project.series_title,
    subtitle: project.series_subtitle,
    scripturePassages: project.scripture_passages,
    description: project.series_description,
    designNotes: project.designNotes,
    avoidColors: project.avoidColors,
    toneHint: briefSignals.toneHint,
    motifHints: briefSignals.motifHints,
    negativeHintExtras: [],
  });

  console.log(`[v2] brief: title="${brief.title}" tone=${brief.toneTarget} motifs=[${brief.motifs.join(",")}]`);

  const runSeed = randomUUID();

  // ── 2b. Plan design modes (A/B/C lane identity) ───────────────────────────
  // Metadata only in phase 1 — does not change prompt or compositor behavior.

  const designModePlan = planDesignModes({
    title: project.series_title,
    subtitle: project.series_subtitle,
    scripturePassages: project.scripture_passages,
    description: project.series_description,
    designNotes: project.designNotes,
    toneHint: briefSignals.toneHint,
    motifHints: briefSignals.motifHints,
    runSeed,
  });

  console.log(`[v2] design modes: ${designModePlan.summary} distinct=${designModePlan.allDistinct}`);

  // ── 3. Build scout plan (lane-aware) ───────────────────────────────────────

  const plan = buildScoutPlan({
    runSeed,
    tone: brief.toneTarget,
    motifs: brief.motifs,
    negativeHints: brief.negativeHints,
    lanes: designModePlan.lanes.map((l) => ({ laneKey: l.lane, designMode: l.mode })),
    slotsPerLane: 3,
  });

  console.log(
    `[v2] scout plan: ${plan.slots.length} slots tone=${plan.tone} laneAware=${plan.laneAware}`
  );

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
            plannedTone: briefSignals.toneHint,
            plannedMotifs: briefSignals.motifHints,
            plannerDebug: briefSignals.debug,
            designMode: designModePlan.lanes[i]?.mode ?? null,
            designModePlan: {
              summary: designModePlan.summary,
              allDistinct: designModePlan.allDistinct,
              lane: designModePlan.lanes[i] ?? null,
            },
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
  //      Backfill loop: if a lane fails, try eligible non-selected scouts.

  const { falNanaBananaPro } = await import("../providers/fal-nano-banana-pro");
  const { falNanaBanana } = await import("../providers/fal-nano-banana");

  // Build the backfill pool from non-selected scouts that passed eval.
  const selectedSlotIndices = new Set(selection.selected.map((s) => s.slotIndex));
  const backfillPool = buildBackfillPool({
    plan,
    results: scoutBatch.results,
    evals,
    selectedSlotIndices,
  });

  console.log(`[v2] backfill pool: ${backfillPool.length} candidates available`);

  // Track which scout slot indices are committed to completed lanes.
  // No scout may be used by more than one completed lane.
  const completedSlotIndices = new Set<number>();

  // ── 10. Per-lane: backfill loop + lockup composition + settle ──────────────

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
    const generationId = generationIds[i];

    // Resolve this lane's planned DesignMode and lockup recipe.
    const laneDesignMode = designModePlan.lanes[i]?.mode;
    const lockupRecipe = laneDesignMode ? getDesignModeLockupRecipe(laneDesignMode) : null;
    console.log(
      `[v2] lane ${scout.label} mode=${laneDesignMode ?? "(none)"} ` +
      `promptDirective=${laneDesignMode ? "true" : "false"} ` +
      `lockupRecipe=${lockupRecipe?.label ?? "(default)"}`
    );

    // Grammar keys used by this lane and by already-completed lanes — for diversity preference.
    const completedGrammarKeys = new Set<string>();
    for (const si of completedSlotIndices) {
      const cs = selection.selected.find((s) => s.slotIndex === si);
      if (cs) completedGrammarKeys.add(cs.grammarKey);
    }
    const preferNotGrammarKeys = new Set([scout.grammarKey, ...completedGrammarKeys]);

    const {
      candidates: eligibleBackfills,
      diversityRelaxed: poolDiversityRelaxed,
      modeRelaxed: poolModeRelaxed,
    } = selectEligibleBackfill({
      pool: backfillPool,
      completedSlotIndices,
      preferNotGrammarKeys,
      laneLabel: scout.label,
      maxCount: ROUND1_V2_CONFIG.laneBackfillBudget,
    });

    console.log(
      `[v2] lane ${scout.label}: primary slot=${scout.slotIndex} backfill_pool=${eligibleBackfills.length} diversityRelaxed=${poolDiversityRelaxed} modeRelaxed=${poolModeRelaxed}`
    );

    const laneResult = await runLaneWithBackfill({
      laneLabel: scout.label,
      primaryScout: scout,
      backfillCandidates: eligibleBackfills,
      budget: ROUND1_V2_CONFIG.laneBackfillBudget,
      negativeHints: brief.negativeHints,
      primaryProvider: falNanaBananaPro,
      fallbackProvider: falNanaBanana,
      rebuildFallbackBudget: ROUND1_V2_CONFIG.rebuildFallbackBudget,
      preferNotGrammarKeys,
      designMode: laneDesignMode,
      evalFn: (args) => evaluateScout(args),
      acceptanceFn: (args) => evaluateBackgroundAcceptance(args),
    });

    // Persist a rebuild attempt record (best-effort; reflects the accepted/last attempt)
    try {
      const usedSlotIndex =
        laneResult.status === "accepted" ? laneResult.usedScoutSlotIndex : scout.slotIndex;
      const providerId =
        laneResult.status === "accepted"
          ? laneResult.providerId
          : laneResult.status === "exhausted" && laneResult.backfillDebug.attemptCount === 0
          ? "fal.nano-banana-pro"
          : "fal.nano-banana-pro";
      const rebuildAttempt = await storage.createRebuildAttempt(
        storage.buildCreateRebuildAttemptInput({
          generationId,
          selected: scout,
          scoutRunId: scoutRunIdBySlotIndex.get(usedSlotIndex),
          providerId,
          attemptOrder: 0,
        })
      );
      await storage.updateRebuildAttemptResult({
        id: rebuildAttempt.id,
        status: laneResult.status === "accepted" ? "SUCCESS" : "FAILED",
        failureReason:
          laneResult.status === "exhausted" ? laneResult.lastFailureReason : undefined,
        providerModel:
          laneResult.status === "accepted" ? laneResult.providerModel : undefined,
      });
    } catch (err) {
      console.warn(`[v2] rebuild attempt persistence failed for ${scout.label}: ${String(err)}`);
    }

    if (laneResult.status === "exhausted") {
      const reason = laneResult.lastFailureReason;
      console.warn(
        `[v2] lane ${scout.label} exhausted all candidates: ${reason} attempts=${laneResult.backfillDebug.attemptCount}`
      );

      const failedOutput = buildV2FailedOutput(reason, scout.label, laneResult.lastFailureEvidence);
      const failedOutputWithBackfill = {
        ...failedOutput,
        meta: {
          ...(failedOutput as any).meta,
          debug: {
            ...(failedOutput as any).meta?.debug,
            textRetry: laneResult.textRetryMeta,
            backfill: laneResult.backfillDebug,
            designMode: designModePlan.lanes[i]?.mode ?? null,
          },
        },
      };

      await prisma.generation.update({
        where: { id: generationId },
        data: {
          status: "FAILED",
          output: failedOutputWithBackfill as unknown as Prisma.InputJsonValue,
        },
      });

      laneLog.push(
        `${scout.label}=failed(exhausted[${laneResult.backfillDebug.attemptCount}]:${reason.slice(0, 60)})`
      );
      continue;
    }

    // laneResult.status === "accepted" — compose lockup and settle as COMPLETED.
    // Track the used scout so it cannot be reused for other lanes.
    completedSlotIndices.add(laneResult.usedScoutSlotIndex);

    const acceptedBackgroundPng = laneResult.imageBytes;
    const finalBackgroundEvidence = laneResult.backgroundEvidence;
    const textRetryMeta: TextRetryMeta = laneResult.textRetryMeta;
    const backfillDebug: BackfillDebugMeta = laneResult.backfillDebug;

    try {
      const content = {
        title: brief.title,
        subtitle: brief.subtitle,
        passage: brief.scripturePassages,
      };

      // Wide lockup composition — DesignMode-aware FULL recipe, alignment, integration,
      // and scrim suppression. Override recipe (titleScale/clamps/placement) is what
      // makes typography_led visibly type-dominant and minimal_editorial visibly refined.
      const lockupPresetId = lockupRecipe?.lockupPresetId ?? null;
      const lockupAlign = lockupRecipe?.align ?? "left";
      const lockupIntegrationMode = lockupRecipe?.integrationMode ?? "clean";
      const fullRecipeOverride = laneDesignMode
        ? getDesignModeLockupRecipeOverride(laneDesignMode)
        : undefined;
      const suppressScrim = laneDesignMode ? shouldSuppressAutoScrim(laneDesignMode) : false;

      const wideLayout = computeCleanMinimalLayout({
        width: WIDE_WIDTH,
        height: WIDE_HEIGHT,
        content,
        lockupRecipe: fullRecipeOverride,
        lockupPresetId,
      });
      const sampledPalette = await chooseTextPaletteForBackground({
        backgroundPng: acceptedBackgroundPng,
        sampleRegion: wideLayout.textRegion,
        width: WIDE_WIDTH,
        height: WIDE_HEIGHT,
      });
      // Apply mode-specific scrim suppression: typography_led / minimal_editorial
      // must NOT get the default dark translucent box behind the title.
      const widePalette = suppressScrim
        ? { ...sampledPalette, autoScrim: false }
        : sampledPalette;
      const wideLockupSvg = buildCleanMinimalOverlaySvg({
        width: WIDE_WIDTH,
        height: WIDE_HEIGHT,
        content,
        palette: widePalette,
        lockupRecipe: fullRecipeOverride,
        lockupPresetId,
      });
      const { png: lockupPng } = await renderTrimmedLockupPngFromSvg(wideLockupSvg);
      const wideFinalPng = await composeLockupOnBackground({
        backgroundPng: acceptedBackgroundPng,
        lockupPng,
        shape: "wide",
        width: WIDE_WIDTH,
        height: WIDE_HEIGHT,
        align: lockupAlign,
        integrationMode: lockupIntegrationMode,
      });

      // Write wide-only files (3 assets — direction preview contract)
      const prefix = generationId;
      const bgPath = await writeV2File(`${prefix}-wide-bg.png`, acceptedBackgroundPng);
      const lockupPath = await writeV2File(`${prefix}-lockup.png`, lockupPng);
      const wideFinPath = await writeV2File(`${prefix}-wide.png`, wideFinalPng);

      // Wide design doc
      const wideDesignDoc = buildCleanMinimalDesignDoc({
        width: WIDE_WIDTH, height: WIDE_HEIGHT, content, palette: widePalette, backgroundImagePath: bgPath,
      });

      const lockupEvidence = {
        source: "generated" as const,
        sourceGenerationId: null,
        textIntegrity: true,
        fitPass: true,
        insideTitleSafeWithMargin: null,
        notTooSmall: null,
      };

      // Use the accepted scout's metadata (may differ from primary if backfill was used)
      const usedGrammarKey = laneResult.usedGrammarKey;
      const usedDiversityFamily = laneResult.usedDiversityFamily;
      const usedCompositeScore = laneResult.usedCompositeScore;
      const usedBackfill = laneResult.backfillDebug.finalOutcome === "backfill";

      const completedOutput = {
        status: "COMPLETED",
        designDoc: wideDesignDoc,
        designDocByShape: { wide: wideDesignDoc },
        notes: `V2 lane ${scout.label} (${usedGrammarKey}) score=${usedCompositeScore.toFixed(3)} usedBackfill=${usedBackfill}`,
        preview: { widescreen_main: wideFinPath },
        meta: {
          styleRefCount: 0,
          usedStylePaths: [],
          productionValidation: {
            stage: "direction_preview",
            background: finalBackgroundEvidence,
            lockup: lockupEvidence,
            aspects: { widescreen: { provenance: "rendered" } },
          },
          debug: {
            v2: true,
            grammarKey: usedGrammarKey,
            diversityFamily: usedDiversityFamily,
            compositeScore: usedCompositeScore,
            usedFallback: laneResult.usedFallback,
            providerModel: laneResult.providerModel,
            backgroundSource: "generated",
            lockupSource: "generated",
            generationLifecycleState: "GENERATION_COMPLETED",
            backgroundFailureReason: null,
            textRetry: textRetryMeta,
            backfill: backfillDebug,
            planner: briefSignals.debug,
            plannedTone: briefSignals.toneHint,
            plannedMotifs: briefSignals.motifHints,
            designMode: designModePlan.lanes[i]?.mode ?? null,
            designModePlan: {
              summary: designModePlan.summary,
              allDistinct: designModePlan.allDistinct,
              lane: designModePlan.lanes[i] ?? null,
            },
            lockupRecipe: lockupRecipe
              ? {
                  label: lockupRecipe.label,
                  lockupPresetId: lockupRecipe.lockupPresetId,
                  align: lockupRecipe.align,
                  integrationMode: lockupRecipe.integrationMode,
                  titleDominant: lockupRecipe.titleDominant,
                  scrimSuppressed: suppressScrim,
                  recipeOverrideApplied: !!fullRecipeOverride,
                }
              : null,
            backfillModeRelaxed: poolModeRelaxed,
            aspectAssets: { widescreen: "ok" },
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
        await tx.asset.createMany({
          data: [
            { projectId, generationId, kind: "BACKGROUND", slot: "wide_bg",       file_path: bgPath,      mime_type: "image/png", width: WIDE_WIDTH, height: WIDE_HEIGHT },
            { projectId, generationId, kind: "LOCKUP",     slot: "series_lockup", file_path: lockupPath,  mime_type: "image/png", width: null,       height: null        },
            { projectId, generationId, kind: "IMAGE",      slot: "wide",          file_path: wideFinPath, mime_type: "image/png", width: WIDE_WIDTH, height: WIDE_HEIGHT },
          ],
        });
      });

      const backfillNote = usedBackfill
        ? `backfill[slot=${laneResult.usedScoutSlotIndex}]`
        : laneResult.usedFallback ? "fallback" : "primary";
      laneLog.push(`${scout.label}=completed(${backfillNote})`);
      console.log(`[v2] lane ${scout.label} settled: wide=${wideFinPath} backfill=${usedBackfill}`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`[v2] lane ${scout.label} composition/settlement error: ${reason}`);
      // Remove from completedSlotIndices since this lane didn't actually complete
      completedSlotIndices.delete(laneResult.usedScoutSlotIndex);

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
