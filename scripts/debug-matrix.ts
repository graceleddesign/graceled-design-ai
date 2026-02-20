import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { getDirectionTemplateCatalog, planDirectionSet } from "../lib/direction-planner";
import { buildOverlayDisplayContent } from "../lib/overlay-lines";
import { buildCleanMinimalOverlaySvg, computeCleanMinimalLayout, type CleanMinimalTextPalette } from "../lib/templates/type-clean-min";

type PreviewShape = "square" | "wide" | "tall";

const OUTPUT_DIR = path.join(process.cwd(), "public", "debug", "matrix");
const SHAPES: readonly PreviewShape[] = ["square", "wide", "tall"];
const DIMENSIONS: Record<PreviewShape, { width: number; height: number }> = {
  square: { width: 1080, height: 1080 },
  wide: { width: 1920, height: 1080 },
  tall: { width: 1080, height: 1920 }
};
const TITLES = ["Ruth", "James", "Advent", "Psalm 23", "Vision & Values", "The Gospel", "Prayer"] as const;
const MIN_TITLE_AREA_PCT = 0.018;

const TEST_PALETTE: CleanMinimalTextPalette = {
  primary: "#0F172A",
  secondary: "#1E293B",
  tertiary: "#334155",
  rule: "#334155",
  accent: "#0F172A",
  autoScrim: false,
  scrimTint: "#FFFFFF"
};

function assertNoThinFrameOrGuideLikeMarks(svg: string): void {
  if (/<rect[^>]*stroke-width="1(?:\.\d+)?"/i.test(svg)) {
    throw new Error("Detected thin rectangular frame stroke in overlay SVG.");
  }

  if (/<rect[^>]*\bwidth="1"[^>]*\bheight="\d{2,}"/i.test(svg) || /<rect[^>]*\bheight="1"[^>]*\bwidth="\d{2,}"/i.test(svg)) {
    throw new Error("Detected guide-like 1px line ornament in overlay SVG.");
  }
}

function assertTitlePresentAndLegible(params: {
  title: string;
  runSeed: string;
  optionIndex: number;
  lockupPresetId: string;
  templateStyleFamily: "clean-min" | "editorial-photo" | "modern-collage" | "illustrated-heritage";
}): void {
  for (const shape of SHAPES) {
    const dimensions = DIMENSIONS[shape];
    const layout = computeCleanMinimalLayout({
      width: dimensions.width,
      height: dimensions.height,
      content: {
        title: params.title,
        subtitle: "",
        passage: ""
      },
      lockupPresetId: params.lockupPresetId,
      styleFamily: params.templateStyleFamily,
      fontSeed: `${params.runSeed}|${params.optionIndex}|${shape}`
    });

    const titleBlocks = layout.blocks.filter((block) => block.key === "title" && block.lines.some((line) => line.trim()));
    if (titleBlocks.length === 0) {
      throw new Error(`Missing title block for ${params.title} (${shape}).`);
    }

    const totalTitleArea = titleBlocks.reduce((sum, block) => sum + block.w * block.h, 0);
    const canvasArea = dimensions.width * dimensions.height;
    if (totalTitleArea / canvasArea < MIN_TITLE_AREA_PCT) {
      throw new Error(`Title area below threshold for ${params.title} (${shape}).`);
    }

    const svg = buildCleanMinimalOverlaySvg({
      width: dimensions.width,
      height: dimensions.height,
      content: {
        title: params.title,
        subtitle: "",
        passage: ""
      },
      palette: TEST_PALETTE,
      lockupPresetId: params.lockupPresetId,
      styleFamily: params.templateStyleFamily,
      fontSeed: `${params.runSeed}|${params.optionIndex}|${shape}`
    });
    assertNoThinFrameOrGuideLikeMarks(svg);
  }
}

function fingerprint(
  directions: Array<{ styleFamily?: string; compositionType: string; presetKey: string; lockupPresetId: string }>
): string {
  return directions
    .map(
      (direction) =>
        `${direction.styleFamily || "unassigned"}:${direction.compositionType}:${direction.presetKey}:${direction.lockupPresetId}`
    )
    .join("|");
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const enabledPresetKeys = [...new Set(getDirectionTemplateCatalog().map((template) => template.presetKey))];
  const report: {
    generatedAt: string;
    titles: string[];
    changedRate: number;
    pass: boolean;
    runs: Array<{
      title: string;
      runASeed: string;
      runBSeed: string;
      changedOnRestart: boolean;
      runA: unknown;
      runB: unknown;
    }>;
  } = {
    generatedAt: new Date().toISOString(),
    titles: [...TITLES],
    changedRate: 0,
    pass: false,
    runs: []
  };

  let changedCount = 0;

  for (const title of TITLES) {
    const display = buildOverlayDisplayContent({ title, subtitle: "", scripturePassages: "" });
    const runASeed = randomUUID();
    const runBSeed = randomUUID();
    const runA = planDirectionSet({ runSeed: runASeed, enabledPresetKeys, optionCount: 3 });
    const runB = planDirectionSet({ runSeed: runBSeed, enabledPresetKeys, optionCount: 3 });

    const runAStyleFamilies = new Set(runA.map((direction) => direction.styleFamily));
    const runBStyleFamilies = new Set(runB.map((direction) => direction.styleFamily));
    if (runAStyleFamilies.size !== 3 || runBStyleFamilies.size !== 3) {
      throw new Error(`A/B/C style family diversity failed for title '${title}'.`);
    }

    for (const [optionIndex, direction] of runA.entries()) {
      assertTitlePresentAndLegible({
        title: display.title,
        runSeed: runASeed,
        optionIndex,
        lockupPresetId: direction.lockupPresetId,
        templateStyleFamily: direction.templateStyleFamily
      });
    }

    for (const [optionIndex, direction] of runB.entries()) {
      assertTitlePresentAndLegible({
        title: display.title,
        runSeed: runBSeed,
        optionIndex,
        lockupPresetId: direction.lockupPresetId,
        templateStyleFamily: direction.templateStyleFamily
      });
    }

    const changedOnRestart = fingerprint(runA) !== fingerprint(runB);
    if (changedOnRestart) {
      changedCount += 1;
    }

    report.runs.push({
      title,
      runASeed,
      runBSeed,
      changedOnRestart,
      runA,
      runB
    });
  }

  report.changedRate = changedCount / TITLES.length;
  report.pass = report.changedRate >= 0.8;

  await writeFile(path.join(OUTPUT_DIR, "report.json"), `${JSON.stringify(report, null, 2)}\n`);

  console.log(`Matrix titles: ${TITLES.length}`);
  console.log(`Restart diversity rate: ${(report.changedRate * 100).toFixed(1)}%`);
  console.log(`Pass threshold (>= 80%): ${report.pass ? "PASS" : "FAIL"}`);
  console.log(`Report: ${path.join(OUTPUT_DIR, "report.json")}`);

  if (!report.pass) {
    throw new Error("Restart diversity threshold failed (< 80%).");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
