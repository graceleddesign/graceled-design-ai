/**
 * BENCHMARK — Imagen 4 text-suppression follow-up (modern_abstract only).
 *
 * Question: Can Imagen 4 produce a genuinely text-free modern abstract
 * sermon-series background/key-art plate if the prompt never includes
 * a title-like phrase?
 *
 * Context: The prior benchmark (scripts/benchmark-imagen4.mts) failed 0/4
 * because every output rendered readable title text. The modern_abstract
 * variant (D) had a strong design prior but text in the corner. This
 * follow-up tests whether text suppression via prompt restructuring solves it.
 *
 * This script does NOT touch production Round 1, validation, or the DB.
 * Outputs are written to tmp/imagen4-text-suppression-followup/<timestamp>/.
 *
 * Usage:
 *   node --import tsx scripts/benchmark-imagen4-text-suppression.mts
 *     # dry run — prints preflight report and prompts, no paid calls.
 *
 *   node --import tsx scripts/benchmark-imagen4-text-suppression.mts --live
 *     # makes 3 paid FAL calls. Estimated cost ~$0.18–$0.24.
 *
 * Hard cost ceiling: $0.25 total / 3 paid calls max.
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
const OUT_DIR = join(REPO_ROOT, "tmp", "imagen4-text-suppression-followup", TS);

// ---- TEXT-SUPPRESSION PREFIX -------------------------------------------------
// Leads every prompt. No series title. No title-like phrase. Hard negation first.

const TEXT_FREE_PREFIX =
  "TEXT-FREE IMAGE ONLY. Pure abstract background/key-art plate. " +
  "No readable text. No letters. No numbers. No words. No logos. No captions. " +
  "No watermarks. No handwriting. No inscriptions. No signs. No banners. " +
  "No book-cover layout. No poster layout. No typography-like marks. No pseudo-letterforms. " +
  "If any text would appear, remove it completely and replace it with abstract shape, texture, light, or negative space.";

// ---- PROMPT SET — 3 modern_abstract variants, no series title ----------------

const PROMPTS: Array<{ id: string; mode: string; body: string }> = [
  {
    id: "1",
    mode: "modern_abstract_structured",
    body:
      TEXT_FREE_PREFIX +
      "\n\n" +
      "Create a premium modern abstract church design plate with intentional structure, " +
      "asymmetry, layered geometric forms, restrained contrast, and calm negative space " +
      "for a separate typography compositor. " +
      "Visual themes: light entering darkness, witness, revelation, life. " +
      "Sophisticated, art-directed, not a generic worship gradient.",
  },
  {
    id: "2",
    mode: "modern_abstract_symbolic",
    body:
      TEXT_FREE_PREFIX +
      "\n\n" +
      "Create a text-free modern abstract key-art plate with a subtle symbolic structure " +
      "inspired by light, life, vine/branch, witness, and revelation. " +
      "Use disciplined shape language, depth, rhythm, and negative space. " +
      "Premium church design team quality. " +
      "Not a corporate logo, not clipart, not a stock icon, not a poster.",
  },
  {
    id: "3",
    mode: "modern_abstract_minimal",
    body:
      TEXT_FREE_PREFIX +
      "\n\n" +
      "Create a minimal editorial abstract background plate with strong composition, " +
      "spacious negative areas, refined texture, and one clear visual idea: " +
      "light, life, revelation, or witness expressed without literal illustration. " +
      "High-end church sermon-series design sensibility, but absolutely no text or typography.",
  },
];

// ---- COST PREFLIGHT ----------------------------------------------------------

const COST_PER_IMAGE_LOW = 0.04;
const COST_PER_IMAGE_HIGH = 0.08;
const MAX_CALLS = 3;
const HARD_CEILING = 0.25;

const estimatedLow = PROMPTS.length * COST_PER_IMAGE_LOW;
const estimatedHigh = PROMPTS.length * COST_PER_IMAGE_HIGH;

function buildPreflightReport(): string {
  return `# Imagen 4 Text-Suppression Follow-Up — Preflight Report

**Date:** ${new Date().toISOString()}
**Mode:** ${LIVE_MODE ? "LIVE (paid calls)" : "DRY RUN (no paid calls)"}

## Context

Prior benchmark (scripts/benchmark-imagen4.mts) failed 0/4 on text-free criterion.
Every output rendered the series title. Modern abstract variant (D) had a strong design
prior but corner text. This follow-up tests text suppression via:
1. Hard text-prohibition prefix at prompt start
2. No series title or book name anywhere in the prompt
3. Visual/thematic language only (light, life, witness, revelation, vine/branch, water as abstractions)
4. Three modern_abstract variants only

## Endpoint verification

- Model ID: \`${MODEL_ID}\`
- Status: Confirmed in \`@fal-ai/client\` v1.9.5 endpoint types (\`Imagen4PreviewInput\` / \`Imagen4PreviewOutput\`)
- Aspect ratio 16:9 ✅  Resolution 2K ✅  Text-to-image only ✅

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
- No references, no conditioning
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
    if (r.error) return `| ${r.id} | ${r.mode} | ERROR: ${r.error} | — | — | — | — | — | — | — |`;
    return `| ${r.id} | ${r.mode} | ${r.imageFile} | ${r.latencyMs}ms | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |`;
  }).join("\n");

  return `# Imagen 4 Text-Suppression Follow-Up — Evaluation Report

**Date:** ${new Date().toISOString()}
**Endpoint:** \`${MODEL_ID}\`
**Focus:** modern_abstract text suppression — no series title in any prompt
**Paid calls:** ${results.length}
**Estimated cost:** ~$${(results.length * 0.06).toFixed(2)}

---

## Output files

${results.filter((r) => !r.error).map((r) => `- \`${r.imageFile}\` — Prompt ${r.id} (${r.mode}), ${r.latencyMs}ms`).join("\n")}

---

## Pass criteria (strict)

- No readable text
- No pseudo-title or text fragments
- Not a generic worship-gradient filler
- Plausible professional church design team quality
- Usable as a separated background/key-art plate

---

## Results table

| ID | Mode | File | Latency | text-free | pseudo-text | abstract-prior | non-stock | composition | plate-useful | **PASS?** |
|---|---|---|---|---|---|---|---|---|---|---|
${rows}

---

## Failure modes (fill in after visual inspection)

| ID | Mode | Main failure mode |
|---|---|---|
| 1 | modern_abstract_structured | |
| 2 | modern_abstract_symbolic | |
| 3 | modern_abstract_minimal | |

---

## Pass count

- Passes: **PENDING** / ${results.filter((r) => !r.error).length}

---

## Final recommendation

- [ ] 1. Reject Imagen 4 path due to unavoidable text rendering or generic output.
- [ ] 2. Imagen 4 is promising only for modern_abstract/key-art plates; consider a narrow integration spike later.
- [ ] 3. Run one more Imagen 4 prompt-control test.
- [ ] 4. Return to clean-subset LoRA experiment.

---

## Notes

*(Fill in after visual inspection)*
`;
}

// ---- MAIN --------------------------------------------------------------------

async function main() {
  console.log("\n=== Imagen 4 Text-Suppression Follow-Up ===");
  console.log(`Mode: ${LIVE_MODE ? "LIVE" : "DRY RUN"}`);
  console.log(`Endpoint: ${MODEL_ID}`);
  console.log(`Prompts: ${PROMPTS.length} (modern_abstract variants, no series title)`);
  console.log(`Output: ${OUT_DIR}\n`);

  if (estimatedHigh > HARD_CEILING) {
    console.error(`ABORT: est. max cost $${estimatedHigh.toFixed(2)} exceeds hard ceiling $${HARD_CEILING.toFixed(2)}.`);
    process.exit(1);
  }
  console.log(`Preflight: est. $${estimatedLow.toFixed(2)}–$${estimatedHigh.toFixed(2)} (ceiling $${HARD_CEILING.toFixed(2)}) ✅`);

  mkdirSync(OUT_DIR, { recursive: true });
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
      console.log(`  [${p.id}] Saved: ${join(OUT_DIR, imageFile)} (${result.imageBytes.length} bytes)`);

      writeFileSync(
        join(OUT_DIR, `provider-response-${p.id}-${p.mode}.json`),
        JSON.stringify({
          promptId: p.id, mode: p.mode, model: MODEL_ID,
          aspectRatio: ASPECT_RATIO, resolution: RESOLUTION,
          imageUrl: result.imageUrl, imageBytes: result.imageBytes.length,
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

  writeFileSync(join(OUT_DIR, "evaluation-report.md"), buildEvalStub(results), "utf-8");
  console.log(`\nEvaluation stub: ${join(OUT_DIR, "evaluation-report.md")}`);
  console.log(`\n=== Done — ${callCount} paid calls. Output: ${OUT_DIR}\n`);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
