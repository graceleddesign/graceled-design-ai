import "server-only";

import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeBrief } from "../briefs/normalize-brief";
import { buildScoutPlan } from "./build-scout-plan";
import { runScoutBatch } from "./run-scout-batch";
import type { ScoutGenerationResult } from "./run-scout-batch";
import { evaluateScout } from "../eval/evaluate-scout";
import type { ScoutEvalResult } from "../eval/evaluate-scout";
import { selectScouts } from "./select-scouts";
import { runRebuildBatch } from "./run-rebuild-batch";
import {
  computeCleanMinimalLayout,
  chooseTextPaletteForBackground,
  buildCleanMinimalOverlaySvg,
  buildCleanMinimalDesignDoc,
} from "@/lib/templates/type-clean-min";
import {
  renderTrimmedLockupPngFromSvg,
  composeLockupOnBackground,
} from "@/lib/lockup-compositor";
import {
  createScoutRun,
  updateScoutRunResult,
  createScoutEval,
  createRebuildAttempt,
  updateRebuildAttemptResult,
  buildCreateScoutRunInput,
  buildUpdateScoutRunResultInput,
  buildCreateScoutEvalInput,
  buildCreateRebuildAttemptInput,
} from "../storage";
import type { Round1Engine, Round1V2Result } from "../types";

// ── Constants ─────────────────────────────────────────────────────────────────

const WIDE_WIDTH = 1920;
const WIDE_HEIGHT = 1080;

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
          } as Prisma.InputJsonValue,
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
      const scoutRun = await createScoutRun(
        buildCreateScoutRunInput({
          generationId,
          runSeed,
          slotIndex: scout.slotIndex,
          slot: scout.slot,
          providerId: "fal.flux-schnell",
          prompt: scout.result.prompt,
        })
      );
      await updateScoutRunResult(buildUpdateScoutRunResultInput(scoutRun.id, scout.result));
      await createScoutEval(buildCreateScoutEvalInput(scoutRun.id, scout.eval));
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
    // No generationId option — we handle per-lane persistence below
  );

  console.log(
    `[v2] rebuild: ${rebuildBatch.successCount}/${rebuildBatch.results.length} succeeded in ${rebuildBatch.totalLatencyMs}ms`
  );

  // ── 10. Per-lane: persist rebuild attempt + lockup composition + settle ─────

  const laneLog: string[] = [];

  for (let i = 0; i < selection.selected.length; i++) {
    const scout = selection.selected[i];
    const rebuildResult = rebuildBatch.results[i];
    const generationId = generationIds[i];

    // Persist rebuild attempt record (best-effort)
    try {
      const rebuildAttempt = await createRebuildAttempt(
        buildCreateRebuildAttemptInput({
          generationId,
          selected: scout,
          scoutRunId: scoutRunIdBySlotIndex.get(scout.slotIndex),
          providerId: rebuildResult.providerId ?? (rebuildResult.usedFallback ? "fal.nano-banana" : "fal.nano-banana-pro"),
          attemptOrder: 0,
        })
      );
      await updateRebuildAttemptResult({
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

      const failedOutput = buildV2FailedOutput(brief, `Rebuild failed: ${reason}`, scout.label);
      await prisma.generation.update({
        where: { id: generationId },
        data: { status: "FAILED", output: failedOutput as Prisma.InputJsonValue },
      });

      laneLog.push(`${scout.label}=failed(rebuild:${reason.slice(0, 40)})`);
      continue;
    }

    // Lockup composition for wide background
    try {
      const backgroundPng = rebuildResult.imageBytes;
      const content = {
        title: brief.title,
        subtitle: brief.subtitle,
        passage: brief.scripturePassages,
      };

      const layout = computeCleanMinimalLayout({ width: WIDE_WIDTH, height: WIDE_HEIGHT, content });

      const palette = await chooseTextPaletteForBackground({
        backgroundPng,
        sampleRegion: layout.textRegion,
        width: WIDE_WIDTH,
        height: WIDE_HEIGHT,
      });

      const lockupSvg = buildCleanMinimalOverlaySvg({ width: WIDE_WIDTH, height: WIDE_HEIGHT, content, palette });
      const { png: lockupPng } = await renderTrimmedLockupPngFromSvg(lockupSvg);

      const finalPng = await composeLockupOnBackground({
        backgroundPng,
        lockupPng,
        shape: "wide",
        width: WIDE_WIDTH,
        height: WIDE_HEIGHT,
        align: "left",
        integrationMode: "clean",
      });

      // Write files to public/uploads
      const prefix = generationId;
      const bgPath = await writeV2File(`${prefix}-wide-bg.png`, backgroundPng);
      const lockupPath = await writeV2File(`${prefix}-lockup.png`, lockupPng);
      const finalPath = await writeV2File(`${prefix}-wide.png`, finalPng);

      // Build DesignDoc from layout + palette
      const designDoc = buildCleanMinimalDesignDoc({
        width: WIDE_WIDTH,
        height: WIDE_HEIGHT,
        content,
        palette,
        backgroundImagePath: bgPath,
      });

      const completedOutput = {
        status: "COMPLETED",
        designDoc,
        designDocByShape: { wide: designDoc },
        notes: `V2 lane ${scout.label} (${scout.grammarKey}) score=${scout.compositeScore.toFixed(3)} fallback=${rebuildResult.usedFallback}`,
        meta: {
          styleRefCount: 0,
          usedStylePaths: [],
          debug: {
            v2: true,
            grammarKey: scout.grammarKey,
            diversityFamily: scout.diversityFamily,
            compositeScore: scout.compositeScore,
            usedFallback: rebuildResult.usedFallback,
            providerModel: rebuildResult.providerModel,
          },
        },
      };

      await prisma.$transaction(async (tx) => {
        await tx.generation.update({
          where: { id: generationId },
          data: { status: "COMPLETED", output: completedOutput as Prisma.InputJsonValue },
        });
        await tx.asset.createMany({
          data: [
            {
              projectId,
              generationId,
              kind: "BACKGROUND",
              slot: "wide_bg",
              file_path: bgPath,
              mime_type: "image/png",
              width: WIDE_WIDTH,
              height: WIDE_HEIGHT,
            },
            {
              projectId,
              generationId,
              kind: "LOCKUP",
              slot: "series_lockup",
              file_path: lockupPath,
              mime_type: "image/png",
              width: null,
              height: null,
            },
            {
              projectId,
              generationId,
              kind: "IMAGE",
              slot: "wide",
              file_path: finalPath,
              mime_type: "image/png",
              width: WIDE_WIDTH,
              height: WIDE_HEIGHT,
            },
          ],
        });
      });

      laneLog.push(`${scout.label}=completed(${rebuildResult.usedFallback ? "fallback" : "primary"})`);
      console.log(`[v2] lane ${scout.label} settled: ${finalPath}`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`[v2] lane ${scout.label} lockup/settlement error: ${reason}`);

      const failedOutput = buildV2FailedOutput(brief, `Lockup/settlement failed: ${reason}`, scout.label);
      try {
        await prisma.generation.update({
          where: { id: generationId },
          data: { status: "FAILED", output: failedOutput as Prisma.InputJsonValue },
        });
      } catch (settleErr) {
        console.error(`[v2] lane ${scout.label} failed to settle: ${String(settleErr)}`);
      }

      laneLog.push(`${scout.label}=failed(lockup:${reason.slice(0, 40)})`);
    }
  }

  const completedCount = laneLog.filter((l) => l.includes("=completed")).length;
  console.log(`[v2] done: ${completedCount}/${selection.selected.length} lanes completed [${laneLog.join(" ")}]`);

  return {};
}

// ── Output helpers ────────────────────────────────────────────────────────────

function buildV2FailedOutput(
  brief: { title: string; subtitle: string | null; scripturePassages: string | null },
  reason: string,
  label: string
): object {
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
      debug: { v2: true, failureReason: reason },
    },
  };
}

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
