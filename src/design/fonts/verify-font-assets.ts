import fs from "fs";
import path from "path";
import { FONT_ASSETS, toPublicFontPath } from "@/src/design/fonts/font-assets";

function main(): void {
  const projectRoot = process.cwd();
  const publicRoot = path.join(projectRoot, "public");
  const missing: Array<{ id: string; file: string; absolutePath: string }> = [];
  const duplicateIds = new Set<string>();
  const seenIds = new Set<string>();

  for (const asset of FONT_ASSETS) {
    if (seenIds.has(asset.id)) {
      duplicateIds.add(asset.id);
    }
    seenIds.add(asset.id);

    const publicPath = toPublicFontPath(asset.file);
    const absolutePath = path.resolve(publicRoot, publicPath.replace(/^\/+/, ""));
    if (!fs.existsSync(absolutePath)) {
      missing.push({
        id: asset.id,
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
    process.exit(1);
  }

  console.log(`verify-font-assets: ok (${FONT_ASSETS.length} assets found)`);
}

main();
