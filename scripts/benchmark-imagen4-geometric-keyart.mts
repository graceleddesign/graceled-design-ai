/**
 * BENCHMARK — Imagen 4 geometric key-art spike.
 *
 * Question: Can Imagen 4 reliably produce text-free, modern abstract sermon-series
 * background/key-art plates when the prompt is tightly constrained around geometric
 * structure, directional light, negative space, and non-literal Gospel-of-John themes?
 *
 * Context:
 * - Prior benchmark (benchmark-imagen4.mts): failed 0/4 — every output had readable title text.
 * - Text-suppression follow-up (benchmark-imagen4-text-suppression.mts): 3/3 text-free,
 *   but only 1/3 passed quality bar (weakly). Only promising direction: structured modern
 *   abstract / geometric key art. Failures: vine/branch decorative illustration, UI-like panels.
 *
 * This script does NOT touch production Round 1, validation, or the DB.
 * Outputs are written to tmp/imagen4-geometric-keyart-spike/<timestamp>/.
 *
 * Usage:
 *   node --import tsx scripts/benchmark-imagen4-geometric-keyart.mts
 *     # dry run — prints preflight report, no paid calls.
 *
 *   node --import tsx scripts/benchmark-imagen4-geometric-keyart.mts --live
 *     # makes 5 paid FAL calls. Estimated cost ~$0.20–$0.40.
 *
 * Hard cost ceiling: $0.50 total / 5 paid calls max.
 */

import { config as dotenvConfig } from "dotenv";
import { writeFileSync, mkdirSync } from "fs";
import { join, resolve } from "path";
import { fal } from "@fal-ai/client";

const REPO_ROOT = resolve(decodeURIComponent(new URL(".", import.meta.url).pathname), "..");
dotenvConfig({ path: join(REPO_ROOT, ".env.local") });
dotenvConfig({ path: join(REPO_ROOT, ".env") });

// ---- CONFIG ------------------------------------------------------------------

const MODEL_ID = "fal-ai/imagen4/preview";
const ASPECT_RATIO = "16:9";
const RESOLUTION = "2K";
const OUTPUT_FORMAT = "png";
const LIVE_MODE = process.argv.includes("--live");

const TS = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const OUT_DIR = join(REPO_ROOT, "tmp", "imagen4-geometric-keyart-spike", TS);

// ---- SHARED TEXT-SUPPRESSION PREFIX ------------------------------------------

const TEXT_FREE_PREFIX =
  "TEXT-FREE IMAGE ONLY. Pure abstract background/key-art plate. " +
  "No readable text. No letters. No numbers. No words. No logos. No captions. " +
  "No watermarks. No handwriting. No inscriptions. No signs. No banners. " +
  "No book-cover layout. No poster layout. No UI panels. No typography-like marks. " +
  "No pseudo-letterforms. " +
  "If any text would appear, remove it completely and replace it with abstract shape, texture, light, or negative space.";

// ---- PROMPT SET — 5 geometric / structured modern abstract prompts -----------

const PROMPTS: Array<{ id: string; mode: string; body: string }> = [
  {
    id: "1",
    mode: "intersecting_planes",
    body:
      TEXT_FREE_PREFIX +
      "\n\n" +
      "Create a premium modern abstract church design plate built from intersecting " +
      "translucent planes, diagonal structure, and directional light entering darkness. " +
      "Sophisticated editorial composition, restrained palette, calm negative space for " +
      "a separate typography compositor. " +
      "Visual themes: light, witness, revelation, life. " +
      "Not a worship gradient. Not a corporate wallpaper. Not a logo. No literal religious clipart.",
  },
  {
    id: "2",
    mode: "threshold_doorway",
    body:
      TEXT_FREE_PREFIX +
      "\n\n" +
      "Create a text-free abstract key-art plate using geometric threshold forms, " +
      "doorway-like negative space, and a controlled beam of light. " +
      "The visual should suggest passage, revelation, and life without literal illustration. " +
      "Premium sermon-series design sensibility, spacious composition, strong focal structure. " +
      "Not a photo scene. Not a church logo. Not UI. No rectangular app-like panels.",
  },
  {
    id: "3",
    mode: "prism_refraction",
    body:
      TEXT_FREE_PREFIX +
      "\n\n" +
      "Create a premium abstract design plate using prism-like refraction, layered glassy geometry, " +
      "restrained contrast, and a single directional light source. " +
      "The visual should suggest light revealed through darkness and testimony/witness through abstract form. " +
      "Strong composition, designed negative space, modern editorial restraint. " +
      "Not a generic gradient. Not stock spirituality.",
  },
  {
    id: "4",
    mode: "vine_curved_planes",
    body:
      TEXT_FREE_PREFIX +
      "\n\n" +
      "Create a modern abstract key-art plate with subtle vine-inspired curved planes and " +
      "branching rhythm, but do not draw literal vines, leaves, flowers, or Art Nouveau decoration. " +
      "Use refined geometric curves, restrained texture, directional light, and spacious negative areas. " +
      "Premium church design team quality. Not decorative wallpaper. Not botanical illustration.",
  },
  {
    id: "5",
    mode: "water_life",
    body:
      TEXT_FREE_PREFIX +
      "\n\n" +
      "Create a text-free modern abstract design plate inspired by water and life, but do not show " +
      "water droplets, oceans, rivers, baptism photos, or stock water imagery. " +
      "Use reflective planes, subtle rippling geometry, restrained blue/neutral palette, " +
      "directional light, and strong negative space. " +
      "Designed, architectural, premium. Not cinematic stock photography.",
  },
];

// ---- COST PREFLIGHT ----------------------------------------------------------

const COST_PER_IMAGE_LOW = 0.04;
const COST_PER_IMAGE_HIGH = 0.08;
const MAX_CALLS = 5;
const HARD_CEILING = 0.50;

const estimatedLow = PROMPTS.length * COST_PER_IMAGE_LOW;
const estimatedHigh = PROMPTS.length * COST_PER_IMAGE_HIGH;

function buildPreflightReport(): string {
  return `# Imagen 4 Geometric Key-Art Spike — Preflight Report

**Date:** ${new Date().toISOString()}
**Mode:** ${LIVE_MODE ? "LIVE (paid calls)" : "DRY RUN (no paid calls)"}

## Context

Prior results:
- benchmark-imagen4.mts: failed 0/4 — every output had readable title text.
- benchmark-imagen4-text-suppression.mts: 3/3 text-free, 1/3 quality pass (weakly).
  Only promising direction: structured modern abstract / geometric key art.
  Failures: vine/branch decorative illustration, UI-like panel artifacts.

This spike asks: can Imagen 4 reliably produce text-free, modern abstract key-art plates
when the prompt is tightly constrained around geometric structure, directional light,
negative space, and non-literal Gospel-of-John themes?

## Endpoint

- Model ID: \`${MODEL_ID}\`
- Endpoint type: text-to-image only (no reference conditioning)
- Aspect ratio: ${ASPECT_RATIO} | Resolution: ${RESOLUTION} | Format: ${OUTPUT_FORMAT}

## Cost ceiling check

| Item | Value |
|---|---|
| Hard ceiling | $${HARD_CEILING.toFixed(2)} |
| Max paid calls | ${MAX_CALLS} |
| Calls planned | ${PROMPTS.length} |
| Est. cost per image | $${COST_PER_IMAGE_LOW}–$${COST_PER_IMAGE_HIGH} |
| Est. total (low) | $${estimatedLow.toFixed(2)} |
| Est. total (high) | $${estimatedHigh.toFixed(2)} |
| Within ceiling? | ${estimatedHigh <= HARD_CEILING ? "✅ YES" : "❌ NO — DO NOT RUN"} |

## Prompt set

${PROMPTS.map((p) => `### Prompt ${p.id} — ${p.mode}\n\n\`\`\`\n${p.body}\n\`\`\``).join("\n\n")}

## Generation settings

- Aspect ratio: ${ASPECT_RATIO}
- Resolution: ${RESOLUTION}
- Output format: ${OUTPUT_FORMAT}
- Num images per call: 1
- No seed (non-deterministic)
- No reference image inputs
`;
}

// ---- FAL CALL ----------------------------------------------------------------

type Imagen4Output = {
  images: Array<{ url: string; content_type?: string; file_name?: string; file_size?: number }>;
  description?: string;
};

async function generateOne(promptId: string, promptBody: string): Promise<{
  imageUrl: string;
  imageBytes: Buffer;
  description: string;
  latencyMs: number;
}> {
  const apiKey = process.env.FAL_API_KEY?.trim();
  if (!apiKey) throw new Error("FAL_API_KEY is not configured");
  fal.config({ credentials: apiKey });

  const started = Date.now();
  console.log(`  [${promptId}] Calling ${MODEL_ID}...`);

  const raw = await fal.subscribe(MODEL_ID, {
    input: {
      prompt: promptBody,
      aspect_ratio: ASPECT_RATIO,
      resolution: RESOLUTION,
      num_images: 1,
      output_format: OUTPUT_FORMAT,
    },
  });

  const latencyMs = Date.now() - started;
  const output = (raw as { data: Imagen4Output }).data;
  const imageUrl = output?.images?.[0]?.url;
  if (!imageUrl) throw new Error(`Prompt ${promptId}: no image URL in response`);

  console.log(`  [${promptId}] Response in ${latencyMs}ms. Fetching bytes...`);

  let imageBytes: Buffer | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(imageUrl);
    if (res.ok) { imageBytes = Buffer.from(await res.arrayBuffer()); break; }
    if (attempt < 3) await new Promise((r) => setTimeout(r, 1500));
  }
  if (!imageBytes) throw new Error(`Prompt ${promptId}: failed to fetch image from ${imageUrl}`);

  return { imageUrl, imageBytes, description: output?.description ?? "", latencyMs };
}

// ---- EVAL STUB ---------------------------------------------------------------

function buildEvalStub(results: Array<{
  id: string; mode: string; imageFile: string; latencyMs: number; description: string; error?: string;
}>): string {
  const rows = results.map((r) => {
    if (r.error) return `| ${r.id} | ${r.mode} | ERROR | — | — | — | — | — | — |`;
    return `| ${r.id} | ${r.mode} | ${r.imageFile} | ${r.latencyMs}ms | PENDING | PENDING | PENDING | PENDING | PENDING |`;
  }).join("\n");

  return `# Imagen 4 Geometric Key-Art Spike — Evaluation Report

**Date:** ${new Date().toISOString()}
**Endpoint:** \`${MODEL_ID}\`
**Focus:** geometric/structured modern abstract — tightly constrained prompts, non-literal Gospel-of-John themes
**Paid calls:** ${results.length}
**Estimated cost:** ~$${(results.length * 0.06).toFixed(2)}

---

## Prior benchmark results (for comparison)

| Benchmark | Text-free? | Quality pass |
|---|---|---|
| benchmark-imagen4 (0/4) | No — all had readable title text | 0/4 |
| benchmark-imagen4-text-suppression (3/3 text-free) | Yes | 1/3 (weakly) |
| This spike | TBD | TBD |

---

## Output files

${results.filter((r) => !r.error).map((r) => `- \`${r.imageFile}\` — Prompt ${r.id} (${r.mode}), ${r.latencyMs}ms`).join("\n")}

---

## Pass criteria (strict — all 5 required)

1. Completely text-free, no pseudo-text artifacts
2. Not generic worship-gradient, corporate wallpaper, stock background, logo, UI, or clipart
3. Strong modern abstract composition
4. Useful as a separated background/key-art plate for a later typography lockup
5. Gospel-of-John thematic resonance (light, life, witness, revelation, way/threshold, water/life, vine/life) through abstract ideas — no literal cliché

A pass must satisfy ALL 5 criteria. "Better than previous bad outputs" is not a pass.

---

## Results table

| ID | Mode | File | Latency | text-free | non-generic | strong-comp | plate-useful | thematic | **PASS?** |
|---|---|---|---|---|---|---|---|---|---|
${rows}

---

## Failure modes (fill in after visual inspection)

| ID | Mode | Main failure mode |
|---|---|---|
| 1 | intersecting_planes | |
| 2 | threshold_doorway | |
| 3 | prism_refraction | |
| 4 | vine_curved_planes | |
| 5 | water_life | |

---

## Pass count

- Passes: **PENDING** / ${results.filter((r) => !r.error).length}

---

## Decision threshold

- 0–1/5 genuinely strong → stop Imagen 4 path; move to clean-subset LoRA.
- 2/5 genuinely strong → Imagen 4 promising but unstable; consider bounded retry/rerank path.
- 3+/5 genuinely strong → Imagen 4 becomes a serious candidate for narrow modern_abstract/key-art lane.

---

## Recommendation

- [ ] 1. Stop Imagen 4 path; move to clean-subset LoRA.
- [ ] 2. Run one more Imagen 4 control test.
- [ ] 3. Pursue narrow Imagen 4 modern_abstract integration/rerank spike.
- [ ] 4. No further paid generation until strategy changes.

---

## Notes

*(Fill in after visual inspection)*
`;
}

// ---- MAIN --------------------------------------------------------------------

async function main() {
  console.log("\n=== Imagen 4 Geometric Key-Art Spike ===");
  console.log(`Mode: ${LIVE_MODE ? "LIVE" : "DRY RUN"}`);
  console.log(`Endpoint: ${MODEL_ID}`);
  console.log(`Prompts: ${PROMPTS.length} (geometric/structured modern abstract)`);
  console.log(`Output: ${OUT_DIR}\n`);

  if (estimatedHigh > HARD_CEILING) {
    console.error(`ABORT: est. max cost $${estimatedHigh.toFixed(2)} exceeds hard ceiling $${HARD_CEILING.toFixed(2)}.`);
    process.exit(1);
  }
  console.log(`Preflight: est. $${estimatedLow.toFixed(2)}–$${estimatedHigh.toFixed(2)} (ceiling $${HARD_CEILING.toFixed(2)}) ✅`);

  mkdirSync(OUT_DIR, { recursive: true });

  // Write individual prompt files
  for (const p of PROMPTS) {
    writeFileSync(join(OUT_DIR, `prompt_${p.id}.txt`), p.body, "utf-8");
  }

  writeFileSync(join(OUT_DIR, "preflight-report.md"), buildPreflightReport(), "utf-8");
  console.log(`Preflight report: ${join(OUT_DIR, "preflight-report.md")}`);

  if (!LIVE_MODE) {
    console.log("\nDRY RUN — no paid calls. Re-run with --live to execute.\n");
    process.exit(0);
  }

  const results: Array<{
    id: string; mode: string; imageFile: string; latencyMs: number; description: string; error?: string;
  }> = [];

  let callCount = 0;
  for (const p of PROMPTS) {
    if (callCount >= MAX_CALLS) { console.warn(`MAX_CALLS (${MAX_CALLS}) reached.`); break; }

    console.log(`\nPrompt ${p.id} (${p.mode}):`);
    try {
      const result = await generateOne(p.id, p.body);
      callCount++;

      const imageFile = `output-${p.id}-${p.mode}.png`;
      writeFileSync(join(OUT_DIR, imageFile), result.imageBytes);
      console.log(`  [${p.id}] Saved: ${join(OUT_DIR, imageFile)} (${(result.imageBytes.length / 1024).toFixed(0)} KB)`);

      writeFileSync(
        join(OUT_DIR, `provider-response-${p.id}-${p.mode}.json`),
        JSON.stringify({
          promptId: p.id, mode: p.mode, model: MODEL_ID,
          aspectRatio: ASPECT_RATIO, resolution: RESOLUTION,
          imageUrl: result.imageUrl, imageSizeBytes: result.imageBytes.length,
          latencyMs: result.latencyMs, description: result.description,
          timestamp: new Date().toISOString(),
        }, null, 2),
        "utf-8"
      );

      results.push({ id: p.id, mode: p.mode, imageFile, latencyMs: result.latencyMs, description: result.description });
    } catch (err) {
      callCount++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  [${p.id}] ERROR: ${msg}`);
      results.push({ id: p.id, mode: p.mode, imageFile: "", latencyMs: 0, description: "", error: msg });
    }
  }

  writeFileSync(join(OUT_DIR, "imagen4-geometric-keyart-report.md"), buildEvalStub(results), "utf-8");
  console.log(`\nEvaluation stub: ${join(OUT_DIR, "imagen4-geometric-keyart-report.md")}`);
  console.log(`\n=== Done — ${callCount} paid calls. Est. cost ~$${(callCount * 0.06).toFixed(2)}. Output: ${OUT_DIR}\n`);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
