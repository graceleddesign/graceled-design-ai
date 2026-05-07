/**
 * BENCHMARK — Imagen 4 text-to-image design prior audit.
 *
 * Question: Does Imagen 4 (fal-ai/imagen4/preview) have a stronger
 * out-of-the-box design prior for sermon-series background/key-art plates
 * than the prior Nano Banana Pro/edit reference-conditioned spike?
 *
 * This script does NOT touch production Round 1, validation, or the DB.
 * Outputs are written to tmp/imagen4-benchmark/<timestamp>/.
 *
 * Usage:
 *   node --import tsx scripts/benchmark-imagen4.mts
 *     # dry run — prints preflight report and prompts, no paid calls.
 *
 *   node --import tsx scripts/benchmark-imagen4.mts --live
 *     # makes paid FAL calls (4 calls max, ~$0.24 estimated).
 *
 * Hard cost ceiling: $1.00 total / 4 paid calls max.
 */

import { config as dotenvConfig } from "dotenv";
import { writeFileSync, mkdirSync } from "fs";
import { join, resolve } from "path";
import { fal } from "@fal-ai/client";

// Load .env.local first (Next.js convention), fall back to .env.
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
const OUT_DIR = join(REPO_ROOT, "tmp", "imagen4-benchmark", TS);

// ---- SHARED HARD RULES -------------------------------------------------------

const SHARED_RULES = `
HARD RULES:
- Output must be a text-free sermon-series background/key-art/design plate.
- Do NOT render the series title.
- Do NOT render readable text, letters, numbers, captions, scripture references, logos, watermarks, signs, banners, typographic fragments, or pseudo-letterforms of any kind.
- This image will be used as a separated background/key-art plate; typography will be composited by the app — leave no pre-baked text.
- Avoid generic AI church backgrounds, stock-photo clichés, worship-gradient clichés, generic logo marks, and cinematic-background-with-overlay-space filler.
- Aim for premium modern church design sensibility — as if a professional church design team made it intentionally for a real sermon series.
`.trim();

// ---- PROMPT SET --------------------------------------------------------------

const PROMPTS: Array<{ id: string; mode: string; body: string }> = [
  {
    id: "A",
    mode: "typography_editorial",
    body: `A text-free sermon series design plate for "The Gospel of John." Editorial, premium, structured, high taste. The visual idea may suggest Word, light, life, witness, incarnation, or revelation without rendering any letters or typography. Strong composition for a future title lockup. Sophisticated restraint. Not a plain wallpaper. Not a poster with text removed.

${SHARED_RULES}`,
  },
  {
    id: "B",
    mode: "graphic_symbol",
    body: `A text-free sermon series design plate for "The Gospel of John." Create a confident graphic-symbol composition, not a generic logo mark. The symbol may suggest light, witness, Word, lamb, cross, door, vine, or life with restraint. Premium visual identity energy, but not corporate logo stock art. Strong negative space and intentional asymmetry.

${SHARED_RULES}`,
  },
  {
    id: "C",
    mode: "minimal_editorial",
    body: `A text-free sermon series design plate for "The Gospel of John." Minimal editorial restraint, strong negative space, premium composition, not stock photography. The visual idea may suggest light entering darkness, witness, incarnation, life, or revelation. Clean, art-directed, quiet, intentional. Avoid water-droplet stock imagery, generic open Bible photos, and literal religious clipart.

${SHARED_RULES}`,
  },
  {
    id: "D",
    mode: "modern_abstract",
    body: `A text-free sermon series design plate for "The Gospel of John." Modern abstract composition with intentional structure, premium church design, not a worship-gradient background. The visual idea may suggest light, life, Word, water, vine, witness, or revelation. Use abstract form, contrast, rhythm, depth, or shape language with discipline. Avoid generic glowing purple/orange church backgrounds.

${SHARED_RULES}`,
  },
];

// ---- COST PREFLIGHT ----------------------------------------------------------

const COST_PER_IMAGE_LOW = 0.04;
const COST_PER_IMAGE_HIGH = 0.08;
const MAX_CALLS = 4;
const HARD_CEILING = 1.0;

const estimatedLow = PROMPTS.length * COST_PER_IMAGE_LOW;
const estimatedHigh = PROMPTS.length * COST_PER_IMAGE_HIGH;

function buildPreflightReport(): string {
  return `# Imagen 4 Benchmark — Preflight Report

**Date:** ${new Date().toISOString()}
**Mode:** ${LIVE_MODE ? "LIVE (paid calls)" : "DRY RUN (no paid calls)"}

## Endpoint verification

- Model ID: \`${MODEL_ID}\`
- Status: Confirmed in \`@fal-ai/client\` v1.9.5 endpoint type definitions (\`Imagen4PreviewInput\` / \`Imagen4PreviewOutput\`)
- Aspect ratio support: 16:9 ✅
- Resolution: 2K ✅
- Text-to-image only (no image conditioning, no LoRA)

## Cost ceiling check

| Item | Value |
|---|---|
| Hard ceiling | $${HARD_CEILING.toFixed(2)} |
| Max paid calls | ${MAX_CALLS} |
| Calls planned | ${PROMPTS.length} |
| Estimated cost per image | $${COST_PER_IMAGE_LOW}–$${COST_PER_IMAGE_HIGH} |
| Estimated total (low) | $${estimatedLow.toFixed(2)} |
| Estimated total (high) | $${estimatedHigh.toFixed(2)} |
| Within ceiling? | ${estimatedHigh <= HARD_CEILING ? "✅ YES" : "❌ NO — DO NOT RUN"} |

## Prompt set

${PROMPTS.map((p) => `### Prompt ${p.id} — ${p.mode}\n\n\`\`\`\n${p.body}\n\`\`\``).join("\n\n")}

## Generation settings

- Aspect ratio: ${ASPECT_RATIO}
- Resolution: ${RESOLUTION}
- Output format: ${OUTPUT_FORMAT}
- Num images per call: 1
- No seed (non-deterministic)
- No references, no conditioning
`;
}

// ---- FAL CALL ----------------------------------------------------------------

type Imagen4Output = {
  images: Array<{ url: string; content_type?: string; file_name?: string; file_size?: number }>;
  description?: string;
};

async function generateOne(
  promptId: string,
  promptBody: string
): Promise<{
  imageUrl: string;
  imageBytes: Buffer;
  description: string;
  latencyMs: number;
  raw: unknown;
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

  console.log(`  [${promptId}] Response received in ${latencyMs}ms. Fetching image bytes...`);

  // Fetch image bytes.
  let imageBytes: Buffer | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(imageUrl);
    if (res.ok) {
      imageBytes = Buffer.from(await res.arrayBuffer());
      break;
    }
    if (attempt < 3) await new Promise((r) => setTimeout(r, 1500));
  }
  if (!imageBytes) throw new Error(`Prompt ${promptId}: failed to fetch image bytes from ${imageUrl}`);

  return {
    imageUrl,
    imageBytes,
    description: output?.description ?? "",
    latencyMs,
    raw,
  };
}

// ---- MAIN --------------------------------------------------------------------

async function main() {
  console.log("\n=== Imagen 4 Benchmark ===");
  console.log(`Mode: ${LIVE_MODE ? "LIVE" : "DRY RUN"}`);
  console.log(`Endpoint: ${MODEL_ID}`);
  console.log(`Output: ${OUT_DIR}\n`);

  // Cost preflight gate.
  if (estimatedHigh > HARD_CEILING) {
    console.error(`ABORT: estimated max cost $${estimatedHigh.toFixed(2)} exceeds hard ceiling $${HARD_CEILING.toFixed(2)}.`);
    process.exit(1);
  }
  console.log(`Preflight: estimated cost $${estimatedLow.toFixed(2)}–$${estimatedHigh.toFixed(2)} (ceiling $${HARD_CEILING.toFixed(2)}) ✅`);

  // Always write output dir and preflight report.
  mkdirSync(OUT_DIR, { recursive: true });
  const preflightReport = buildPreflightReport();
  writeFileSync(join(OUT_DIR, "preflight-report.md"), preflightReport, "utf-8");
  console.log(`Preflight report written: ${join(OUT_DIR, "preflight-report.md")}`);

  if (!LIVE_MODE) {
    console.log("\nDRY RUN — no paid calls made. Re-run with --live to execute.\n");
    process.exit(0);
  }

  // Live generation.
  const results: Array<{
    id: string;
    mode: string;
    imageFile: string;
    latencyMs: number;
    description: string;
    error?: string;
  }> = [];

  let callCount = 0;
  for (const p of PROMPTS) {
    if (callCount >= MAX_CALLS) {
      console.warn(`MAX_CALLS (${MAX_CALLS}) reached — stopping.`);
      break;
    }

    try {
      console.log(`\nPrompt ${p.id} (${p.mode}):`);
      const result = await generateOne(p.id, p.body);
      callCount++;

      const imageFile = `output-${p.id}-${p.mode}.png`;
      const imagePath = join(OUT_DIR, imageFile);
      writeFileSync(imagePath, result.imageBytes);
      console.log(`  [${p.id}] Saved: ${imagePath} (${result.imageBytes.length} bytes, ${result.latencyMs}ms)`);

      // Save provider response (no secrets — just model output metadata).
      const responseFile = `provider-response-${p.id}-${p.mode}.json`;
      writeFileSync(
        join(OUT_DIR, responseFile),
        JSON.stringify(
          {
            promptId: p.id,
            mode: p.mode,
            model: MODEL_ID,
            aspectRatio: ASPECT_RATIO,
            resolution: RESOLUTION,
            imageUrl: result.imageUrl,
            imageBytes: result.imageBytes.length,
            latencyMs: result.latencyMs,
            description: result.description,
            timestamp: new Date().toISOString(),
          },
          null,
          2
        ),
        "utf-8"
      );

      results.push({
        id: p.id,
        mode: p.mode,
        imageFile,
        latencyMs: result.latencyMs,
        description: result.description,
      });
    } catch (err) {
      callCount++; // count failed calls against budget
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  [${p.id}] ERROR: ${msg}`);
      results.push({ id: p.id, mode: p.mode, imageFile: "", latencyMs: 0, description: "", error: msg });
    }
  }

  // Write a results stub (evaluation-report.md must be filled in after visual inspection).
  const evalStub = buildEvalStub(results);
  writeFileSync(join(OUT_DIR, "evaluation-report.md"), evalStub, "utf-8");
  console.log(`\nEvaluation report stub written: ${join(OUT_DIR, "evaluation-report.md")}`);

  console.log(`\n=== Benchmark complete ===`);
  console.log(`Paid calls made: ${callCount}`);
  console.log(`Output folder: ${OUT_DIR}`);
  console.log(`\nNEXT: Visually inspect outputs and fill in evaluation-report.md.\n`);
}

function buildEvalStub(
  results: Array<{
    id: string;
    mode: string;
    imageFile: string;
    latencyMs: number;
    description: string;
    error?: string;
  }>
): string {
  const rows = results
    .map((r) => {
      if (r.error) {
        return `| ${r.id} | ${r.mode} | ERROR: ${r.error} | — | — | — | — | — | — | — | — |`;
      }
      return `| ${r.id} | ${r.mode} | ${r.imageFile} | ${r.latencyMs}ms | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |`;
    })
    .join("\n");

  return `# Imagen 4 Benchmark — Evaluation Report

**Date:** ${new Date().toISOString()}
**Endpoint:** \`${MODEL_ID}\`
**Benchmark brief:** The Gospel of John sermon series — text-free background/key-art plates
**Paid calls:** ${results.length}
**Estimated cost:** $${(results.length * 0.06).toFixed(2)} (at ~$0.06/image estimate)

---

## Output files

${results.filter((r) => !r.error).map((r) => `- \`${r.imageFile}\` — Prompt ${r.id} (${r.mode}), ${r.latencyMs}ms`).join("\n")}

---

## Evaluation rubric

For each output:
- **text-free**: pass/fail — any readable text, letters, pseudo-letterforms
- **pseudo-text artifacts**: none/minor/major
- **non-stock / non-generic**: pass/fail — stock photo, worship gradient, generic logo
- **sermon-series-design feel**: pass/fail — does it feel like a church design team made it?
- **composition strength**: pass/fail — would a title lockup work here?
- **motif/theme fit** (Gospel of John): pass/fail — light, Word, witness, life, etc.
- **usefulness as background plate**: pass/fail — does it function as a separated background?

> A pass means it plausibly looks like a professional church design team intentionally made a usable sermon-series background/key-art plate. Do not grade on a curve.

---

## Results table

| ID | Mode | File | Latency | text-free | pseudo-text | non-stock | design-feel | composition | motif-fit | plate-useful |
|---|---|---|---|---|---|---|---|---|---|---|
${rows}

---

## Failure modes

*(Fill in after visual inspection)*

| ID | Mode | Main failure mode if failed |
|---|---|---|
| A | typography_editorial | |
| B | graphic_symbol | |
| C | minimal_editorial | |
| D | modern_abstract | |

---

## Comparison vs. Nano Banana Pro/edit reference-conditioned spike

| Mode | Nano Banana result | Imagen 4 result |
|---|---|---|
| typography_editorial | marginally best but wallpaper-like | |
| graphic_symbol | failed — generic stock-vector/logo | |
| minimal_editorial | failed — stock water droplet / cinematic drift | |
| modern_abstract | failed — generic worship-gradient | |

---

## Pass count

- Passes: **PENDING** / 4

---

## Decision threshold applied

- 0/4: Imagen 4 is not promising.
- 1/4: Not enough unless the pass is exceptional.
- 2/4: Inspect failure pattern.
- 3–4/4: Imagen 4 becomes a serious candidate for V2 background/key-art generation.

---

## Final recommendation

*(Fill in after scoring)*

**[ ] 1. Reject Imagen 4 path.**
**[ ] 2. Run one more Imagen 4 controlled benchmark.**
**[ ] 3. Consider Imagen 4 as candidate for V2 background/key-art generation.**
**[ ] 4. Return to clean-subset LoRA experiment.**
**[ ] 5. Dataset/source preparation is needed before further paid generation tests.**

---

## Notes

*(Fill in observations, surprising findings, texture of failures, etc.)*
`;
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
