/**
 * EXPERIMENT / SPIKE — reference-conditioned generation.
 *
 * Question: Can fal-ai/nano-banana-pro/edit (multi-image conditioning) produce
 * design-team-quality sermon series plates when conditioned on 3-5 owned
 * reference images from our library?
 *
 * This script DOES NOT touch production Round 1, validation, or the DB.
 * It writes outputs to /tmp/graceled-reference-conditioned/<timestamp>/.
 *
 * Usage:
 *   node --import tsx scripts/experiment-reference-conditioned-generation.ts
 *     # dry run — prints prompts and selected references, no API calls.
 *
 *   node --import tsx scripts/experiment-reference-conditioned-generation.ts --live
 *     # makes paid FAL calls (1 per mode, default 4 modes = 4 calls).
 *
 *   node --import tsx scripts/experiment-reference-conditioned-generation.ts --live --modes typography_led,minimal_editorial
 *     # restrict modes
 */

import { config as dotenvConfig } from "dotenv";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, resolve } from "path";
import { fal } from "@fal-ai/client";

// Load .env.local first (Next.js convention), fall back to .env.
dotenvConfig({ path: resolve(__dirname, "..", ".env.local") });
dotenvConfig({ path: resolve(__dirname, "..", ".env") });

// ----- CONFIG -----------------------------------------------------------------

const REPO_ROOT = resolve(__dirname, "..");
const REF_THUMBS_DIR = join(REPO_ROOT, "public", "reference-thumbs");
const CURATION_PATH = join(REPO_ROOT, "reference_library", "curation.json");

const MODEL_ID = "fal-ai/nano-banana-pro/edit";
const FALLBACK_MODEL_ID = "fal-ai/nano-banana/edit";

const TS = new Date().toISOString().replace(/[:.]/g, "-");
const OUT_DIR = `/tmp/graceled-reference-conditioned/${TS}`;

// Brief: Gospel of John
const BRIEF = {
  id: "gospel-of-john",
  seriesTitle: "The Gospel of John",
  scripture: "John 1",
  oneLineDescription:
    "An expository series through John: light entering darkness, the Word made flesh, the I AM statements.",
  motifSeed:
    "light, water, bread, vine, shepherd, door, way; restraint over symbolism",
};

// Per-mode reference selection. All IDs verified present in curation.json.
const MODE_REFS: Record<string, { cluster: string; refs: string[] }> = {
  typography_led: {
    cluster: "bold_type",
    // Pro-tier bold_type examples — title IS the design.
    refs: ["ref_0002", "ref_0033", "ref_0093", "ref_0098"],
  },
  graphic_symbol: {
    cluster: "illustration",
    // Pro-tier illustration / mark-leaning references.
    refs: ["ref_0023", "ref_0086", "ref_0011", "ref_0038"],
  },
  minimal_editorial: {
    cluster: "minimal",
    refs: ["ref_0001", "ref_0048", "ref_0118", "ref_0143"],
  },
  modern_abstract: {
    cluster: "modern_abstract",
    refs: ["ref_0004", "ref_0031", "ref_0072", "ref_0055"],
  },
};

// ----- PROMPT BUILDER ---------------------------------------------------------

const SHARED_HARD_RULES = `
HARD RULES:
- Output must contain ZERO readable text, letters, glyphs, runes, sigils, or pseudo-text.
- Do NOT render the series title or any title/subtitle. Typography is added later by a separate system.
- This is a DESIGN PLATE for a sermon-series visual identity, not an illustration of a Bible scene.
- Avoid stock-religious clichés (rays of light through clouds, open Bible photo, white dove, glowing cross).
- Avoid cinematic-photo-with-overlay aesthetic. Avoid generic motivational background.
- Treat the reference images as the QUALITY BAR for craft, restraint, and design intent — not as content to copy.
- Match the design-system DNA of the references (composition, palette range, restraint, type-readiness),
  but invent a NEW composition. Do not reproduce any reference.
`.trim();

function buildPromptForMode(mode: string): string {
  const brief = `Series brief: "${BRIEF.seriesTitle}". ${BRIEF.oneLineDescription}
Permitted motif vocabulary (use sparingly, never literally): ${BRIEF.motifSeed}.`;

  const modeIntent: Record<string, string> = {
    typography_led: `INTENT: A typography-first plate. Generate a quiet, structured background field that is COMPOSED for a large, bold display title to land as the hero element. Strong negative space for type. Subtle texture or color block only. No imagery competing for attention. Think editorial cover, design-team poster.`,

    graphic_symbol: `INTENT: A single-mark plate. Generate a confident, modern, vector-feeling graphic mark or geometric symbol — abstract enough that it does not depict a Bible scene literally. Place it OFF-CENTER on a clean field, leaving room for a typography lockup. Print-design quality, not illustration-stock.`,

    minimal_editorial: `INTENT: A minimal editorial plate. Restraint, near-monochrome, generous white space, one quiet visual decision (a single subtle gradient, a single small detail, a single material texture). It must feel intentional and high-end, like a museum publication or premium magazine cover, not empty.`,

    modern_abstract: `INTENT: A modern abstract atmosphere. Non-photographic. Could be an organic gradient field, soft volumetric color, a controlled geometric pattern, or a quiet textile/material study. Mood-forward but composed for type to land cleanly. Sophisticated palette, no clichéd church gradients.`,
  };

  return `${brief}

DESIGN MODE: ${mode}
${modeIntent[mode] ?? ""}

${SHARED_HARD_RULES}

Reference images attached are owned design references showing the QUALITY BAR for the "${MODE_REFS[mode]?.cluster}" cluster of our reference library. Match their craft level. Do not match their content.`.trim();
}

// ----- HELPERS ----------------------------------------------------------------

function loadCuration(): Record<string, { tier: string; cluster: string }> {
  const raw = JSON.parse(readFileSync(CURATION_PATH, "utf8"));
  return raw.items;
}

function refPath(refId: string): string {
  // Try a few plausible extensions; reference-thumbs are .png by index inspection.
  const png = join(REF_THUMBS_DIR, `${refId}.png`);
  if (existsSync(png)) return png;
  const jpg = join(REF_THUMBS_DIR, `${refId}.jpg`);
  if (existsSync(jpg)) return jpg;
  throw new Error(`Reference image not found for ${refId}`);
}

async function uploadRefToFal(refId: string): Promise<string> {
  const buf = readFileSync(refPath(refId));
  // Construct a Blob with PNG mime; @fal-ai/client storage.upload accepts Blob.
  const blob = new Blob([new Uint8Array(buf)], { type: "image/png" });
  // Fal SDK expects a File-like with a name in some paths; attach a name.
  (blob as Blob & { name?: string }).name = `${refId}.png`;
  const url = await fal.storage.upload(blob as Blob);
  return url;
}

async function generateForMode(mode: string): Promise<{
  ok: boolean;
  imageBytes?: Buffer;
  prompt: string;
  refIds: string[];
  refUrls: string[];
  providerModel: string;
  responseMeta?: unknown;
  error?: string;
  latencyMs: number;
}> {
  const refIds = MODE_REFS[mode].refs;
  const prompt = buildPromptForMode(mode);

  const started = Date.now();
  try {
    const refUrls: string[] = [];
    for (const id of refIds) {
      const url = await uploadRefToFal(id);
      refUrls.push(url);
    }

    let raw: unknown;
    let providerModel = MODEL_ID;
    try {
      raw = await fal.subscribe(MODEL_ID, {
        input: {
          prompt,
          image_urls: refUrls,
          aspect_ratio: "16:9",
          resolution: "2K",
          num_images: 1,
          output_format: "png",
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[${mode}] Pro edit failed (${msg}); falling back to ${FALLBACK_MODEL_ID}`);
      providerModel = FALLBACK_MODEL_ID;
      raw = await fal.subscribe(FALLBACK_MODEL_ID, {
        input: {
          prompt,
          image_urls: refUrls,
          aspect_ratio: "16:9",
          num_images: 1,
          output_format: "png",
        },
      });
    }

    const latencyMs = Date.now() - started;
    const data = (raw as { data: { images: Array<{ url: string }> } }).data;
    const imageUrl = data?.images?.[0]?.url;
    if (!imageUrl) {
      return {
        ok: false,
        prompt,
        refIds,
        refUrls,
        providerModel,
        error: "no image url in response",
        latencyMs,
      };
    }
    const res = await fetch(imageUrl);
    const imageBytes = Buffer.from(await res.arrayBuffer());
    return {
      ok: true,
      imageBytes,
      prompt,
      refIds,
      refUrls,
      providerModel,
      responseMeta: data,
      latencyMs,
    };
  } catch (err) {
    return {
      ok: false,
      prompt,
      refIds,
      refUrls: [],
      providerModel: MODEL_ID,
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - started,
    };
  }
}

// ----- RUBRIC (manual scoring) ------------------------------------------------

const RUBRIC_MD = `# Reference-Conditioned Generation Rubric (manual score)

Score each output 1–5 on each axis. A "pass" requires all must-haves AND avg >= 3.5.

## Must-haves (any failure = disqualified)
- [ ] Compositionally distinct from "background + title overlay"
- [ ] ZERO readable text, pseudo-text, or letter-like artifacts
- [ ] Suitable as a typography-lockup base without additional design work

## Scored axes (1–5)
- composition strength
- typography readiness (negative space, hierarchy zones)
- sermon-series identity feel
- resemblance to owned reference-library quality
- non-genericness (not stock church / not Canva / not Unsplash mood)
- motif relevance (visible but not literal)
- design-team intentionality (could a real designer have made this?)

## Disqualifiers (auto-fail)
- readable text or pseudo-text
- literal stock-like motif
- cinematic drift (photo with negative space for title)
- generic inspirational background
- style without structure
- too close to a specific reference (copying)

## Decision thresholds
- 0/4 modes pass → reject reference-conditioned path
- 1/4 → one more targeted run only if exceptional
- 2/4 different modes → pursue with critic loop
- 2/4 same mode → selective integration
- 3–4/4 → strong pursue signal
`;

// ----- MAIN -------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const live = args.includes("--live");
  const modesArg = args.find((a) => a.startsWith("--modes="));
  const modes = modesArg
    ? modesArg.split("=")[1].split(",")
    : Object.keys(MODE_REFS);

  // Validate references exist before any API calls.
  const curation = loadCuration();
  for (const m of modes) {
    if (!MODE_REFS[m]) throw new Error(`Unknown mode: ${m}`);
    for (const id of MODE_REFS[m].refs) {
      if (!curation[id]) throw new Error(`${id} missing from curation.json`);
      // Verify file exists.
      refPath(id);
    }
  }

  mkdirSync(OUT_DIR, { recursive: true });

  console.log(`[experiment] Output dir: ${OUT_DIR}`);
  console.log(`[experiment] Modes:     ${modes.join(", ")}`);
  console.log(`[experiment] Live:      ${live}`);
  console.log(`[experiment] Provider:  ${MODEL_ID} (fallback ${FALLBACK_MODEL_ID})`);
  console.log("");

  if (!live) {
    console.log("[experiment] DRY RUN. Pass --live to make paid FAL calls.\n");
    for (const m of modes) {
      console.log(`---- mode: ${m} ----`);
      console.log(`refs: ${MODE_REFS[m].refs.join(", ")} (cluster=${MODE_REFS[m].cluster})`);
      console.log(buildPromptForMode(m));
      console.log("");
    }
    writeFileSync(join(OUT_DIR, "RUBRIC.md"), RUBRIC_MD);
    writeFileSync(
      join(OUT_DIR, "DRYRUN.md"),
      `# Dry run\n\nModes: ${modes.join(", ")}\nProvider: ${MODEL_ID}\nNo API calls were made.\n`
    );
    return;
  }

  // Live path
  const apiKey = process.env.FAL_API_KEY?.trim();
  if (!apiKey) throw new Error("FAL_API_KEY missing — refusing to run --live");
  fal.config({ credentials: apiKey });

  const summary: Array<Record<string, unknown>> = [];
  let calls = 0;

  for (const mode of modes) {
    console.log(`[experiment] generating ${mode}…`);
    const result = await generateForMode(mode);
    calls += 1;

    const modeDir = join(OUT_DIR, mode);
    mkdirSync(modeDir, { recursive: true });

    writeFileSync(join(modeDir, "prompt.txt"), result.prompt);
    writeFileSync(
      join(modeDir, "meta.json"),
      JSON.stringify(
        {
          mode,
          ok: result.ok,
          providerModel: result.providerModel,
          refIds: result.refIds,
          refUrls: result.refUrls,
          latencyMs: result.latencyMs,
          error: result.error ?? null,
          responseMeta: result.responseMeta ?? null,
        },
        null,
        2
      )
    );
    if (result.ok && result.imageBytes) {
      writeFileSync(join(modeDir, "output.png"), result.imageBytes);
      console.log(`  ok — ${result.imageBytes.length} bytes (${result.latencyMs}ms)`);
    } else {
      console.warn(`  FAIL — ${result.error}`);
    }
    summary.push({
      mode,
      ok: result.ok,
      providerModel: result.providerModel,
      refs: result.refIds,
      latencyMs: result.latencyMs,
      error: result.error ?? null,
    });
  }

  writeFileSync(join(OUT_DIR, "RUBRIC.md"), RUBRIC_MD);
  writeFileSync(
    join(OUT_DIR, "REPORT.md"),
    [
      `# Reference-Conditioned Generation Spike — ${TS}`,
      ``,
      `Brief: ${BRIEF.seriesTitle} (${BRIEF.id})`,
      `Provider: ${MODEL_ID} (fallback ${FALLBACK_MODEL_ID})`,
      `Total provider calls: ${calls}`,
      `Output dir: ${OUT_DIR}`,
      ``,
      `## Per-mode results`,
      ...summary.map(
        (s) =>
          `- **${s.mode}** — ok=${s.ok}, model=${s.providerModel}, refs=[${(s.refs as string[]).join(", ")}], latency=${s.latencyMs}ms${s.error ? `, error=${s.error}` : ""}`
      ),
      ``,
      `Score outputs against \`RUBRIC.md\` and record decision (pursue / selective / reject).`,
    ].join("\n")
  );

  console.log(`\n[experiment] done. Summary at ${OUT_DIR}/REPORT.md`);
  console.log(`[experiment] total provider calls: ${calls}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
