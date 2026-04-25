import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveProductionValidOption,
  resolveProductionValidOptionStatus,
  validateDirectionPreviewContract,
  validateExportPackageContract,
} from "@/lib/production-valid-option";
import type { GenerationAssetRecord } from "@/lib/production-valid-option";

function buildFallbackLikeOutput(phase: "RUNNING" | "SETTLED") {
  return {
    status: "FALLBACK" as const,
    meta: {
      execution: {
        version: 1 as const,
        phase,
        activeAttemptToken: phase === "RUNNING" ? "attempt-token" : null,
        activeAttemptNumber: 1
      },
      debug: {
        backgroundSource: "fallback" as const,
        lockupSource: "fallback" as const
      }
    }
  };
}

test("terminal failed rows do not read as in progress when execution metadata is stale", () => {
  const staleRunningOutput = buildFallbackLikeOutput("RUNNING");

  assert.equal(
    resolveProductionValidOptionStatus({
      output: staleRunningOutput,
      dbStatus: "FAILED"
    }),
    "FALLBACK"
  );
});

test("active rows still read as in progress while the DB status is running", () => {
  const runningOutput = buildFallbackLikeOutput("RUNNING");

  assert.equal(
    resolveProductionValidOptionStatus({
      output: runningOutput,
      dbStatus: "RUNNING"
    }),
    "IN_PROGRESS"
  );
});

// ── Direction Preview Contract (wide-only, Round 1) ──────────────────────────

// Minimal canonical design doc (normalizeDesignDoc requires at least one valid layer)
const MINIMAL_DESIGN_DOC = {
  width: 1920,
  height: 1080,
  layers: [{ type: "text", text: "Test Title", x: 100, y: 200, w: 600, h: 120 }],
};

function buildDirectionPreviewOutput(bgOverrides?: Partial<{
  textFree: boolean | null;
  scaffoldFree: boolean | null;
  motifPresent: boolean | null;
  toneFit: boolean | null;
}>) {
  return {
    status: "COMPLETED",
    designDoc: MINIMAL_DESIGN_DOC,
    preview: {
      widescreen_main: "/uploads/gen-wide.png",
    },
    meta: {
      styleRefCount: 0,
      usedStylePaths: [],
      productionValidation: {
        stage: "direction_preview",
        background: {
          source: "generated",
          sourceGenerationId: null,
          textFree: bgOverrides?.textFree ?? true,
          scaffoldFree: bgOverrides?.scaffoldFree ?? true,
          motifPresent: bgOverrides?.motifPresent ?? true,
          toneFit: bgOverrides?.toneFit ?? true,
          referenceFit: null,
        },
        lockup: {
          source: "generated",
          sourceGenerationId: null,
          textIntegrity: true,
          fitPass: true,
          insideTitleSafeWithMargin: null,
          notTooSmall: null,
        },
        aspects: {
          widescreen: { provenance: "rendered" },
          // square/vertical intentionally absent — direction preview only
        },
      },
      debug: {
        backgroundSource: "generated",
        lockupSource: "generated",
        generationLifecycleState: "GENERATION_COMPLETED",
        aspectAssets: { widescreen: "ok" },
        squareVerticalNotGenerated: "round1_direction_preview_only",
      },
    },
  };
}

const WIDE_ASSETS: GenerationAssetRecord[] = [
  { kind: "BACKGROUND", slot: "wide_bg",       file_path: "uploads/gen-wide-bg.png" },
  { kind: "LOCKUP",     slot: "series_lockup", file_path: "uploads/gen-lockup.png" },
  { kind: "IMAGE",      slot: "wide",           file_path: "uploads/gen-wide.png" },
];

const ALL_7_ASSETS: GenerationAssetRecord[] = [
  ...WIDE_ASSETS,
  { kind: "BACKGROUND", slot: "square_bg", file_path: "uploads/gen-square-bg.png" },
  { kind: "BACKGROUND", slot: "tall_bg",   file_path: "uploads/gen-tall-bg.png" },
  { kind: "IMAGE",      slot: "square",    file_path: "uploads/gen-square.png" },
  { kind: "IMAGE",      slot: "tall",      file_path: "uploads/gen-tall.png" },
];

test("direction_preview with wide_bg + lockup + wide + widescreen evidence resolves COMPLETED", () => {
  const output = buildDirectionPreviewOutput();
  const result = resolveProductionValidOption({
    output,
    dbStatus: "COMPLETED",
    assets: WIDE_ASSETS,
  });

  assert.equal(result.valid, true);
  assert.equal(result.status, "COMPLETED");
  assert.equal(result.stage, "direction_preview");
  assert.equal(result.aspects.widescreen.valid, true);
  assert.equal(result.invalidReasons.length, 0);
});

test("direction_preview missing wide productionValidation evidence cannot be COMPLETED", () => {
  const output = buildDirectionPreviewOutput({ textFree: false });
  const result = resolveProductionValidOption({
    output,
    dbStatus: "COMPLETED",
    assets: WIDE_ASSETS,
  });

  assert.equal(result.valid, false);
  assert.ok(result.invalidReasons.some((r) => r.includes("background_text_detected")),
    `expected background_text_detected in ${result.invalidReasons.join(", ")}`);
});

test("direction_preview missing square/vertical assets is NOT failed for that reason", () => {
  const output = buildDirectionPreviewOutput();
  const result = resolveProductionValidOption({
    output,
    dbStatus: "COMPLETED",
    assets: WIDE_ASSETS, // only 3 assets — no square/vertical
  });

  // Should be valid — square/vertical are not required at direction_preview stage
  assert.equal(result.valid, true);
  // Square/vertical aspect reasons should not appear in top-level invalidReasons
  assert.ok(!result.invalidReasons.some((r) => r.includes("square") || r.includes("vertical")),
    `unexpected square/vertical reason in ${result.invalidReasons.join(", ")}`);
});

test("direction_preview resolved as valid does NOT count as export-ready", () => {
  const output = buildDirectionPreviewOutput();
  const result = resolveProductionValidOption({
    output,
    dbStatus: "COMPLETED",
    assets: WIDE_ASSETS,
  });

  // Valid as a direction preview, but not export-eligible
  assert.equal(result.valid, true);
  assert.equal(result.export.eligible, false);
  assert.ok(result.export.missingSlots.includes("square"), "square should be a missing export slot");
  assert.ok(result.export.missingSlots.includes("tall"), "tall should be a missing export slot");
});

test("export_package missing square/vertical assets is not export-ready", () => {
  // A full-stage output with all 7 assets should be export-ready
  const output = {
    status: "COMPLETED",
    designDoc: MINIMAL_DESIGN_DOC,
    preview: {
      widescreen_main: "/uploads/gen-wide.png",
      square_main: "/uploads/gen-square.png",
      vertical_main: "/uploads/gen-tall.png",
    },
    meta: {
      styleRefCount: 0,
      usedStylePaths: [],
      productionValidation: {
        stage: "export_package",
        background: {
          source: "generated", sourceGenerationId: null,
          textFree: true, scaffoldFree: true, motifPresent: true, toneFit: true, referenceFit: null,
        },
        lockup: {
          source: "generated", sourceGenerationId: null,
          textIntegrity: true, fitPass: true, insideTitleSafeWithMargin: null, notTooSmall: null,
        },
        aspects: {
          widescreen: { provenance: "rendered" },
          square: { provenance: "rendered" },
          vertical: { provenance: "rendered" },
        },
      },
      debug: {
        backgroundSource: "generated", lockupSource: "generated",
        aspectAssets: { widescreen: "ok", square: "ok", vertical: "ok" },
      },
    },
  };

  // With only 3 assets (missing square/tall), export is blocked even if stage says export_package
  const resultIncomplete = resolveProductionValidOption({
    output,
    dbStatus: "COMPLETED",
    assets: WIDE_ASSETS,
  });
  assert.equal(resultIncomplete.export.eligible, false);
  assert.ok(resultIncomplete.export.missingSlots.includes("square"));
  assert.ok(resultIncomplete.export.missingSlots.includes("tall"));

  // With all 7 assets, export is eligible
  const resultComplete = resolveProductionValidOption({
    output,
    dbStatus: "COMPLETED",
    assets: ALL_7_ASSETS,
  });
  assert.equal(resultComplete.valid, true);
  assert.equal(resultComplete.export.eligible, true);
  assert.equal(resultComplete.export.missingSlots.length, 0);
});

test("validateDirectionPreviewContract returns valid for correct wide-only direction", () => {
  const result = validateDirectionPreviewContract({
    output: buildDirectionPreviewOutput(),
    dbStatus: "COMPLETED",
    assets: WIDE_ASSETS,
  });
  assert.equal(result.valid, true);
  assert.equal(result.invalidReasons.length, 0);
});

test("validateDirectionPreviewContract returns invalid when background_text_detected", () => {
  const result = validateDirectionPreviewContract({
    output: buildDirectionPreviewOutput({ textFree: false }),
    dbStatus: "COMPLETED",
    assets: WIDE_ASSETS,
  });
  assert.equal(result.valid, false);
  assert.ok(result.invalidReasons.some((r) => r.includes("background_text_detected")));
});

test("validateExportPackageContract reports missing square/tall as not export-ready", () => {
  const result = validateExportPackageContract({
    output: buildDirectionPreviewOutput(),
    assets: WIDE_ASSETS,
  });
  assert.equal(result.valid, false);
  assert.ok(result.missingSlots.includes("square"));
  assert.ok(result.missingSlots.includes("tall"));
});
