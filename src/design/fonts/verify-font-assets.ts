import fs from "fs";
import path from "path";
import { FONT_ASSETS, getFontAssetSource, toPublicFontPath } from "@/src/design/fonts/font-assets";

type MissingEntry = {
  id: string;
  family: string;
  style: "normal" | "italic";
  weight: number;
  source: "local" | "google";
  file: string;
  absolutePath: string;
};

function main(): void {
  const projectRoot = process.cwd();
  const publicRoot = path.join(projectRoot, "public");
  const missing: MissingEntry[] = [];
  const duplicateIds = new Set<string>();
  const seenIds = new Set<string>();

  for (const asset of FONT_ASSETS) {
    if (seenIds.has(asset.id)) {
      duplicateIds.add(asset.id);
    }
    seenIds.add(asset.id);

    const publicPath = toPublicFontPath(asset.file);
    if (/^https?:\/\//i.test(publicPath)) {
      continue;
    }

    const absolutePath = path.resolve(publicRoot, publicPath.replace(/^\/+/, ""));
    if (!fs.existsSync(absolutePath)) {
      missing.push({
        id: asset.id,
        family: asset.family,
        style: asset.style,
        weight: asset.weight,
        source: getFontAssetSource(asset),
        file: publicPath,
        absolutePath
      });
    }
  }

  if (duplicateIds.size > 0) {
    console.error("Duplicate font asset ids found:");
    for (const id of [...duplicateIds].sort((a, b) => a.localeCompare(b))) {
      console.error(`- ${id}`);
    }
    process.exit(1);
  }

  if (missing.length > 0) {
    console.error(`Missing font files (${missing.length}):`);
    for (const entry of missing) {
      console.error(`- ${entry.id}: expected ${entry.file} at ${entry.absolutePath}`);
    }

    const missingGoogle = missing.filter((entry) => entry.source === "google");
    if (missingGoogle.length > 0) {
      const byFamily = new Map<string, { weights: Set<number>; ital: boolean }>();
      for (const entry of missingGoogle) {
        const key = entry.family.toLowerCase();
        const current = byFamily.get(key) || { weights: new Set<number>(), ital: false };
        current.weights.add(entry.weight);
        if (entry.style === "italic") {
          current.ital = true;
        }
        byFamily.set(key, current);
      }

      console.error("\nGoogle font files are missing. Fetch cached WOFF2 files with:");
      console.error("  npm run fonts:sync");
      console.error("or fetch specific families:");
      for (const [key, value] of [...byFamily.entries()].sort((left, right) => left[0].localeCompare(right[0]))) {
        const family = missingGoogle.find((entry) => entry.family.toLowerCase() === key)?.family || key;
        const weights = [...value.weights].sort((a, b) => a - b).join(",");
        console.error(`  npm run fonts:add -- --family \"${family}\" --weights \"${weights}\"${value.ital ? " --ital" : ""}`);
      }
    } else {
      console.error("\nNo Google entries were detected for the missing files.");
      console.error("Add local files under public/fonts or configure these families via fonts:add.");
    }

    process.exit(1);
  }

  console.log(`verify-font-assets: ok (${FONT_ASSETS.length} assets found)`);
}

main();
