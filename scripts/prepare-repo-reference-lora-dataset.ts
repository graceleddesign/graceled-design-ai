/**
 * prepare-repo-reference-lora-dataset.ts
 *
 * Prepares a clean local LoRA training dataset from the repo's existing flat
 * reference library images. Does NOT train, upload, call FAL, or mutate
 * Dropbox / production files.
 *
 * Usage:
 *   node --import tsx scripts/prepare-repo-reference-lora-dataset.ts [options]
 *
 * Options:
 *   --index         path to index.json       (default: reference_library/index.json)
 *   --curation      path to curation.json    (default: reference_library/curation.json)
 *   --out-dir       output folder            (default: tmp/lora-repo-reference-dataset)
 *   --source        normalized|raw|style_anchor  (default: normalized)
 *   --tiers         pro,experimental,all     (default: pro)
 *   --clusters      comma-separated list     (default: all clusters)
 *   --include-uncurated  true|false          (default: false)
 *   --max-images    integer cap              (default: unlimited)
 */

import fs from "fs";
import path from "path";
import JSZip from "jszip";
import sharp from "sharp";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IndexEntry {
  id: string;
  rawPath: string;
  normalizedPath: string;
  thumbPath: string;
  width: number;
  height: number;
  aspect: number;
  fileSize: number;
  dHash: string;
  styleTags: string[];
  styleAnchorPath?: string;
}

interface CurationItem {
  tier: "pro" | "experimental";
  cluster: string;
  tags: string[];
}

interface CurationData {
  version: number;
  items: Record<string, CurationItem>;
}

interface ManifestRow {
  ref_id: string;
  original_path: string;
  copied_path: string;
  caption_path: string;
  tier: string;
  cluster: string;
  width: number;
  height: number;
  aspect: number;
  fileSize: number;
  dHash: string;
  styleTags: string;
  included: boolean;
  exclusion_reason: string;
}

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

function parseArgs(): Record<string, string> {
  const args = process.argv.slice(2);
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const val = args[i + 1] && !args[i + 1].startsWith("--") ? args[++i] : "true";
      result[key] = val;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Caption strategy
// ---------------------------------------------------------------------------

const CLUSTER_PHRASES: Record<string, string> = {
  minimal: "minimal editorial restraint, clean negative space",
  bold_type: "bold typography-led sermon series design",
  modern_abstract: "modern abstract composition, premium visual system",
  cinematic: "cinematic atmospheric church series art",
  illustration: "illustrative sermon series design, expressive crafted artwork",
  editorial_photo: "editorial photo composite sermon series design",
  architectural: "architectural structural composition",
  retro_print: "retro print-inspired sermon series design",
};

const BASE_CAPTION =
  "graceled-sermon-style sermon series graphic, premium church design, professional ministry design system";

function buildCaption(cluster: string): string {
  const clusterPhrase = CLUSTER_PHRASES[cluster];
  if (clusterPhrase) {
    return `${BASE_CAPTION}, ${clusterPhrase}`;
  }
  return BASE_CAPTION;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png"]);

function ext(p: string): string {
  return path.extname(p).toLowerCase();
}

function resolveSourcePath(entry: IndexEntry, source: string, repoRoot: string): string {
  if (source === "raw") {
    return path.join(repoRoot, entry.rawPath);
  }
  if (source === "style_anchor") {
    if (!entry.styleAnchorPath) return "";
    // styleAnchorPath may have a leading slash in the JSON
    const rel = entry.styleAnchorPath.replace(/^\//, "");
    return path.join(repoRoot, rel);
  }
  // default: normalized
  return path.join(repoRoot, entry.normalizedPath);
}

function sanitizeId(id: string): string {
  return id.replace(/[^a-z0-9_]/gi, "_");
}

function zeroPad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

function safeCluster(cluster: string): string {
  return (cluster || "unknown").replace(/[^a-z0-9_]/gi, "_");
}

function escapeCsv(value: string | number | boolean): string {
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function rowToCsv(row: ManifestRow): string {
  return [
    row.ref_id,
    row.original_path,
    row.copied_path,
    row.caption_path,
    row.tier,
    row.cluster,
    row.width,
    row.height,
    row.aspect,
    row.fileSize,
    row.dHash,
    row.styleTags,
    row.included,
    row.exclusion_reason,
  ]
    .map(escapeCsv)
    .join(",");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs();

  const repoRoot = process.cwd();
  const indexPath = path.join(repoRoot, args["index"] ?? "reference_library/index.json");
  const curationPath = path.join(repoRoot, args["curation"] ?? "reference_library/curation.json");
  const outDir = path.join(repoRoot, args["out-dir"] ?? "tmp/lora-repo-reference-dataset");
  const source: "normalized" | "raw" | "style_anchor" =
    (args["source"] as "normalized" | "raw" | "style_anchor") ?? "normalized";
  const tiersArg = (args["tiers"] ?? "pro").split(",").map((t) => t.trim());
  const includeAll = tiersArg.includes("all");
  const allowedTiers = includeAll ? ["pro", "experimental"] : tiersArg;
  const clustersFilter =
    args["clusters"] ? args["clusters"].split(",").map((c) => c.trim()) : null;
  const includeUncurated = (args["include-uncurated"] ?? "false") === "true";
  const maxImages = args["max-images"] ? parseInt(args["max-images"], 10) : Infinity;

  console.log("\n=== GraceLed LoRA Dataset Prep ===");
  console.log(`  index:             ${indexPath}`);
  console.log(`  curation:          ${curationPath}`);
  console.log(`  out-dir:           ${outDir}`);
  console.log(`  source:            ${source}`);
  console.log(`  tiers:             ${allowedTiers.join(", ")}`);
  console.log(`  clusters filter:   ${clustersFilter ? clustersFilter.join(", ") : "all"}`);
  console.log(`  include-uncurated: ${includeUncurated}`);
  console.log(`  max-images:        ${isFinite(maxImages) ? maxImages : "unlimited"}`);
  console.log();

  // --- Load index ---
  const indexRaw = fs.readFileSync(indexPath, "utf-8");
  const indexEntries: IndexEntry[] = JSON.parse(indexRaw);
  console.log(`Loaded index: ${indexEntries.length} total refs`);

  // --- Load curation ---
  const curationRaw = fs.readFileSync(curationPath, "utf-8");
  const curation: CurationData = JSON.parse(curationRaw);
  const curationItems = curation.items ?? {};
  const totalCurated = Object.keys(curationItems).length;
  console.log(`Loaded curation: ${totalCurated} curated refs`);

  // Build id -> IndexEntry lookup
  const indexById: Record<string, IndexEntry> = {};
  for (const entry of indexEntries) {
    indexById[entry.id] = entry;
  }

  // --- Prepare output dir ---
  fs.mkdirSync(outDir, { recursive: true });

  // --- Selection pass ---
  const manifestRows: ManifestRow[] = [];
  const included: Array<{ entry: IndexEntry; curation: CurationItem; destName: string; srcPath: string }> = [];
  const excludedReasons: Record<string, number> = {};

  function addExclusion(reason: string, row: ManifestRow) {
    row.included = false;
    row.exclusion_reason = reason;
    excludedReasons[reason] = (excludedReasons[reason] ?? 0) + 1;
    manifestRows.push(row);
  }

  // Process all index entries
  for (const entry of indexEntries) {
    const curationEntry = curationItems[entry.id];

    const baseRow: ManifestRow = {
      ref_id: entry.id,
      original_path: "",
      copied_path: "",
      caption_path: "",
      tier: curationEntry?.tier ?? "uncurated",
      cluster: curationEntry?.cluster ?? "",
      width: entry.width,
      height: entry.height,
      aspect: entry.aspect,
      fileSize: entry.fileSize,
      dHash: entry.dHash,
      styleTags: (entry.styleTags ?? []).join("|"),
      included: false,
      exclusion_reason: "",
    };

    // Uncurated check
    if (!curationEntry) {
      if (!includeUncurated) {
        addExclusion("uncurated", baseRow);
        continue;
      }
      // treat uncurated as "pro" for tier purposes if include-uncurated is set
    }

    // Tier check
    const tier = curationEntry?.tier ?? "uncurated";
    if (!includeAll && curationEntry && !allowedTiers.includes(tier)) {
      addExclusion(`tier_excluded:${tier}`, baseRow);
      continue;
    }

    // Cluster filter
    const cluster = curationEntry?.cluster ?? "unknown";
    if (clustersFilter && !clustersFilter.includes(cluster)) {
      addExclusion(`cluster_filtered:${cluster}`, baseRow);
      continue;
    }

    // Resolve source path
    const srcPath = resolveSourcePath(entry, source, repoRoot);
    baseRow.original_path = srcPath;

    if (!srcPath) {
      addExclusion("no_source_path", baseRow);
      continue;
    }

    // Extension check
    if (!ALLOWED_EXT.has(ext(srcPath))) {
      addExclusion(`bad_extension:${ext(srcPath)}`, baseRow);
      continue;
    }

    // File existence check
    if (!fs.existsSync(srcPath)) {
      addExclusion("file_missing", baseRow);
      continue;
    }

    // Max images cap check (applied to included count before adding this one)
    if (included.length >= maxImages) {
      addExclusion("max_images_cap", baseRow);
      continue;
    }

    // Include it
    const seqNum = included.length + 1;
    const destName = `gl_ref_${zeroPad(seqNum, 4)}_${sanitizeId(entry.id)}_${safeCluster(cluster)}${ext(srcPath)}`;
    baseRow.copied_path = path.join(outDir, destName);
    baseRow.caption_path = path.join(outDir, destName.replace(/\.(jpg|jpeg|png)$/i, ".txt"));
    baseRow.included = true;
    baseRow.exclusion_reason = "";

    included.push({ entry, curation: curationEntry ?? { tier: "uncurated", cluster, tags: [] }, destName, srcPath });
    manifestRows.push(baseRow);
  }

  console.log(`\nSelection: ${included.length} included, ${manifestRows.length - included.length} excluded`);
  console.log("Exclusion reasons:", excludedReasons);

  // --- Copy images and write captions ---
  console.log("\nCopying images and writing captions...");
  let copied = 0;
  for (const item of included) {
    const destPath = path.join(outDir, item.destName);
    const captionPath = destPath.replace(/\.(jpg|jpeg|png)$/i, ".txt");
    fs.copyFileSync(item.srcPath, destPath);
    const caption = buildCaption(item.curation.cluster);
    fs.writeFileSync(captionPath, caption, "utf-8");
    copied++;
    if (copied % 10 === 0) process.stdout.write(`  ${copied}/${included.length}\r`);
  }
  console.log(`  ${copied}/${included.length} — done`);

  // --- Verify: every image has a .txt ---
  let missingCaptions = 0;
  for (const item of included) {
    const destPath = path.join(outDir, item.destName);
    const captionPath = destPath.replace(/\.(jpg|jpeg|png)$/i, ".txt");
    if (!fs.existsSync(captionPath)) {
      console.error(`  MISSING CAPTION: ${captionPath}`);
      missingCaptions++;
    }
  }
  if (missingCaptions === 0) {
    console.log("  Caption verification: OK — every image has a matching .txt");
  } else {
    console.error(`  Caption verification: FAILED — ${missingCaptions} missing`);
  }

  // --- Verify: no disallowed file types in outDir ---
  const DISALLOWED_EXT = new Set([".psd", ".ai", ".pdf", ".svg", ".eps"]);
  const allOutFiles = fs.readdirSync(outDir);
  const badFiles = allOutFiles.filter((f) => DISALLOWED_EXT.has(path.extname(f).toLowerCase()));
  if (badFiles.length > 0) {
    console.error("  DISALLOWED FILES in output:", badFiles);
  } else {
    console.log("  Extension verification: OK — no PSD/AI/PDF/SVG files");
  }

  // --- Cluster counts ---
  const clusterCounts: Record<string, number> = {};
  const tierCounts: Record<string, number> = {};
  for (const item of included) {
    const c = item.curation.cluster || "unknown";
    const t = item.curation.tier || "uncurated";
    clusterCounts[c] = (clusterCounts[c] ?? 0) + 1;
    tierCounts[t] = (tierCounts[t] ?? 0) + 1;
  }

  // --- dataset-manifest.csv ---
  const csvHeader = [
    "ref_id", "original_path", "copied_path", "caption_path",
    "tier", "cluster", "width", "height", "aspect", "fileSize",
    "dHash", "styleTags", "included", "exclusion_reason",
  ].join(",");
  const csvLines = [csvHeader, ...manifestRows.map(rowToCsv)];
  const csvPath = path.join(outDir, "dataset-manifest.csv");
  fs.writeFileSync(csvPath, csvLines.join("\n"), "utf-8");
  console.log(`\nWrote manifest: ${csvPath}`);

  // --- dataset-summary.md ---
  const totalRefs = indexEntries.length;
  const includedCount = included.length;
  const excludedCount = manifestRows.length - includedCount;
  const enoughForExperiment = includedCount >= 20;

  const summaryLines: string[] = [
    "# GraceLed LoRA Dataset Summary",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Counts",
    "",
    `- Total refs in index: ${totalRefs}`,
    `- Total curated refs: ${totalCurated}`,
    `- Included: ${includedCount}`,
    `- Excluded: ${excludedCount}`,
    "",
    "## Included by Tier",
    "",
    ...Object.entries(tierCounts).map(([t, n]) => `- ${t}: ${n}`),
    "",
    "## Included by Cluster",
    "",
    ...Object.entries(clusterCounts).map(([c, n]) => `- ${c}: ${n}`),
    "",
    "## Exclusions by Reason",
    "",
    ...Object.entries(excludedReasons).map(([r, n]) => `- ${r}: ${n}`),
    "",
    "## Configuration",
    "",
    `- Source mode: ${source}`,
    `- Tiers: ${allowedTiers.join(", ")}`,
    `- Clusters filter: ${clustersFilter ? clustersFilter.join(", ") : "all"}`,
    `- Include-uncurated: ${includeUncurated}`,
    `- Max images: ${isFinite(maxImages) ? maxImages : "unlimited"}`,
    `- Output folder: ${outDir}`,
    `- Output zip: ${path.join(outDir, "repo-reference-lora-dataset.zip")}`,
    "",
    "## Pseudo-Text Contamination Warning",
    "",
    "⚠️  Many of the reference images in this library are final sermon series graphics",
    "    that contain styled title text, scripture references, and series names.",
    "    Training a LoRA on these images as-is will teach the model to associate the",
    "    graceled-sermon-style token with text-bearing imagery.",
    "",
    "    Captions include cluster-specific phrases (e.g. 'bold typography-led') that",
    "    may reinforce pseudo-text risk in bold_type and editorial_photo clusters.",
    "",
    "    This is intentional for this experiment — we are testing whether the LoRA",
    "    learns the general design prior despite text contamination.",
    "",
    "    If you want to reduce pseudo-text risk:",
    "    - Use --clusters minimal,modern_abstract,cinematic,illustration,architectural",
    "    - Pre-process images to mask/blur text regions before training.",
    "",
    "## Readiness Assessment",
    "",
    enoughForExperiment
      ? `✅  ${includedCount} images included — probably enough for a first capped LoRA experiment (target: 20–100 images for a concept LoRA).`
      : `⚠️  Only ${includedCount} images included — may be too few for a reliable LoRA experiment. Consider lowering --tiers or --include-uncurated true.`,
    "",
    "## Clusters at a Glance",
    "",
    ...Object.entries(clusterCounts).map(([c, n]) => {
      const risk = ["bold_type", "editorial_photo", "retro_print"].includes(c)
        ? " ⚠️  (higher pseudo-text risk)"
        : "";
      return `- **${c}**: ${n} images${risk}`;
    }),
  ];

  const summaryPath = path.join(outDir, "dataset-summary.md");
  fs.writeFileSync(summaryPath, summaryLines.join("\n"), "utf-8");
  console.log(`Wrote summary: ${summaryPath}`);

  // --- Create zip ---
  console.log("\nBuilding zip...");
  const zip = new JSZip();

  // Add all files in outDir except the zip itself
  const zipName = "repo-reference-lora-dataset.zip";
  const zipPath = path.join(outDir, zipName);

  const filesToZip = fs.readdirSync(outDir).filter((f) => f !== zipName);
  for (const fname of filesToZip) {
    const fpath = path.join(outDir, fname);
    const stat = fs.statSync(fpath);
    if (stat.isFile()) {
      zip.file(fname, fs.readFileSync(fpath));
    }
  }

  const zipBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  fs.writeFileSync(zipPath, zipBuffer);
  const zipSizeMB = (zipBuffer.length / 1024 / 1024).toFixed(1);
  console.log(`Wrote zip: ${zipPath} (${zipSizeMB} MB)`);

  // --- Final report ---
  console.log("\n=== FINAL REPORT ===");
  console.log(`Total refs found:      ${totalRefs}`);
  console.log(`Curated refs found:    ${totalCurated}`);
  console.log(`Included image count:  ${includedCount}`);
  console.log(`Excluded count:        ${excludedCount}`);
  console.log("Count by cluster:");
  for (const [c, n] of Object.entries(clusterCounts)) {
    console.log(`  ${c}: ${n}`);
  }
  console.log(`\nOutput folder: ${outDir}`);
  console.log(`Output zip:    ${zipPath}`);
  console.log(
    `\nReady for paid LoRA experiment: ${enoughForExperiment ? "YES — " + includedCount + " images (20+ threshold met)" : "NO — too few images"}`
  );
  console.log("\nNOT committed. NOT pushed. Script only — no dataset files committed.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
