import fs from "node:fs";
import path from "node:path";
import {
  GOOGLE_FONT_ASSETS,
  GOOGLE_FONT_ASSET_MANIFEST_RELATIVE_PATH,
  LOCAL_FONT_ASSETS,
  getFontAssetSource,
  inferFontTagsFromFamilyName,
  mergeFontAssets,
  toPublicFontPath,
  upsertFontFamilyVariants,
  type FontAsset
} from "../src/design/fonts/font-assets";
import { fetchGoogleFontsWoff2 } from "../src/design/fonts/google-fonts-fetch";

type Command = "add" | "sync";

type ParsedArgs = {
  command: Command;
  family: string | null;
  weights: number[];
  ital: boolean;
  subsets: string[];
  auto: boolean;
};

type FamilyRequest = {
  family: string;
  weights: Set<number>;
  ital: boolean;
};

const MANIFEST_PATH = path.join(process.cwd(), GOOGLE_FONT_ASSET_MANIFEST_RELATIVE_PATH);
const LOCKUP_FONTS_PATH = path.join(process.cwd(), "lib", "lockups", "fonts.ts");

function parseWeights(value: string | undefined): number[] {
  if (!value) {
    return [];
  }

  const parsed = value
    .split(",")
    .map((entry) => Number.parseInt(entry.trim(), 10))
    .filter((weight) => Number.isFinite(weight))
    .map((weight) => Math.max(100, Math.min(900, Math.round(weight / 100) * 100)));

  return [...new Set(parsed)].sort((left, right) => left - right);
}

function parseCsv(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseArgs(argv: string[]): ParsedArgs {
  const [commandRaw, ...rest] = argv;
  if (commandRaw !== "add" && commandRaw !== "sync") {
    throw new Error("Usage: fetch-fonts-google.ts <add|sync> [--family \"Name\"] [--weights \"400,700\"] [--ital] [--subsets \"latin\"] [--auto]");
  }

  let family: string | null = null;
  let weights: number[] = [];
  let ital = false;
  let subsets: string[] = [];
  let auto = false;

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === "--family") {
      family = (rest[index + 1] || "").trim() || null;
      index += 1;
      continue;
    }
    if (token === "--weights") {
      weights = parseWeights(rest[index + 1]);
      index += 1;
      continue;
    }
    if (token === "--subsets") {
      subsets = parseCsv(rest[index + 1]);
      index += 1;
      continue;
    }
    if (token === "--ital") {
      ital = true;
      continue;
    }
    if (token === "--auto") {
      auto = true;
      continue;
    }
  }

  return {
    command: commandRaw,
    family,
    weights,
    ital,
    subsets,
    auto
  };
}

function isLocalFontFileMissing(asset: FontAsset): boolean {
  const publicPath = toPublicFontPath(asset.file);
  if (/^https?:\/\//i.test(publicPath)) {
    return false;
  }
  const absolutePath = path.resolve(process.cwd(), "public", publicPath.replace(/^\/+/, ""));
  return !fs.existsSync(absolutePath);
}

function readLockupFontIds(): string[] {
  if (!fs.existsSync(LOCKUP_FONTS_PATH)) {
    return [];
  }

  const source = fs.readFileSync(LOCKUP_FONTS_PATH, "utf8");
  const ids = new Set<string>();
  const regex = /(?:titleFontId|subtitleFontId|accentFontId)\s*:\s*["'`]([^"'`]+)["'`]/g;
  let match = regex.exec(source);

  while (match) {
    ids.add(match[1]);
    match = regex.exec(source);
  }

  return [...ids].sort((left, right) => left.localeCompare(right));
}

function requestForAsset(requests: Map<string, FamilyRequest>, asset: FontAsset): FamilyRequest {
  const key = asset.family.trim().toLowerCase();
  const existing = requests.get(key);
  if (existing) {
    return existing;
  }

  const created: FamilyRequest = {
    family: asset.family,
    weights: new Set<number>(),
    ital: false
  };
  requests.set(key, created);
  return created;
}

function addAssetToRequest(requests: Map<string, FamilyRequest>, asset: FontAsset): void {
  const request = requestForAsset(requests, asset);
  request.weights.add(asset.weight);
  if (asset.style === "italic") {
    request.ital = true;
  }
}

function sortedRequests(requests: Map<string, FamilyRequest>): FamilyRequest[] {
  return [...requests.values()].sort((left, right) => left.family.localeCompare(right.family));
}

function writeGoogleManifest(assets: readonly FontAsset[]): void {
  const payload = assets
    .filter((asset) => getFontAssetSource(asset) === "google")
    .map((asset) => ({
      ...asset,
      source: "google" as const
    }))
    .sort((left, right) => {
      const familyCompare = left.family.localeCompare(right.family);
      if (familyCompare !== 0) {
        return familyCompare;
      }
      if (left.weight !== right.weight) {
        return left.weight - right.weight;
      }
      if (left.style !== right.style) {
        return left.style === "normal" ? -1 : 1;
      }
      return left.id.localeCompare(right.id);
    });

  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function familyTags(family: string, allAssets: readonly FontAsset[]): string[] {
  const existing = allAssets.find((asset) => asset.family.trim().toLowerCase() === family.trim().toLowerCase());
  return existing?.tags?.length ? existing.tags : inferFontTagsFromFamilyName(family);
}

function printFetched(result: { family: string; variants: Array<{ weight: number; style: string; relPath: string }> }): void {
  const summary = result.variants
    .map((variant) => `${variant.style}:${variant.weight}`)
    .sort((left, right) => left.localeCompare(right))
    .join(", ");
  console.log(`fetched ${result.family} -> ${summary}`);
}

async function runAdd(args: ParsedArgs): Promise<void> {
  if (!args.family) {
    throw new Error("fonts:add requires --family \"Family Name\".");
  }

  const weights = args.weights.length > 0 ? args.weights : [400, 700];
  const result = await fetchGoogleFontsWoff2({
    family: args.family,
    weights,
    ital: args.ital,
    subsets: args.subsets
  });

  let googleAssets: FontAsset[] = [...GOOGLE_FONT_ASSETS];
  const allAssets = mergeFontAssets(LOCAL_FONT_ASSETS, googleAssets);

  googleAssets = upsertFontFamilyVariants({
    existingAssets: googleAssets,
    idSourceAssets: allAssets,
    family: result.family,
    source: "google",
    familyTags: familyTags(result.family, allAssets),
    variants: result.variants.map((variant) => ({
      weight: variant.weight,
      style: variant.style,
      file: variant.relPath
    }))
  });

  writeGoogleManifest(googleAssets);
  printFetched(result);
  console.log(`updated manifest: ${GOOGLE_FONT_ASSET_MANIFEST_RELATIVE_PATH}`);
}

async function runSync(args: ParsedArgs): Promise<void> {
  let googleAssets: FontAsset[] = [...GOOGLE_FONT_ASSETS];
  let allAssets = mergeFontAssets(LOCAL_FONT_ASSETS, googleAssets);
  let manifestChanged = false;
  const attemptedFamilies = new Set<string>();

  const fetchAndUpsert = async (request: FamilyRequest): Promise<boolean> => {
    const weights = [...request.weights].sort((left, right) => left - right);
    if (weights.length === 0) {
      return false;
    }

    const result = await fetchGoogleFontsWoff2({
      family: request.family,
      weights,
      ital: request.ital
    });

    googleAssets = upsertFontFamilyVariants({
      existingAssets: googleAssets,
      idSourceAssets: allAssets,
      family: result.family,
      source: "google",
      familyTags: familyTags(result.family, allAssets),
      variants: result.variants.map((variant) => ({
        weight: variant.weight,
        style: variant.style,
        file: variant.relPath
      }))
    });

    allAssets = mergeFontAssets(LOCAL_FONT_ASSETS, googleAssets);
    manifestChanged = true;
    printFetched(result);
    return true;
  };

  const missingGoogleRequests = new Map<string, FamilyRequest>();
  for (const asset of allAssets) {
    if (getFontAssetSource(asset) !== "google") {
      continue;
    }
    if (!isLocalFontFileMissing(asset)) {
      continue;
    }
    addAssetToRequest(missingGoogleRequests, asset);
  }

  for (const request of sortedRequests(missingGoogleRequests)) {
    const requestKey = request.family.trim().toLowerCase();
    if (attemptedFamilies.has(requestKey)) {
      continue;
    }
    attemptedFamilies.add(requestKey);
    try {
      await fetchAndUpsert(request);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`warning: failed to sync google family ${request.family}: ${message}`);
    }
  }

  const referencedIds = readLockupFontIds();
  const referencedMissingRequests = new Map<string, FamilyRequest>();
  const missingIdWarnings: string[] = [];

  for (const id of referencedIds) {
    const asset = allAssets.find((entry) => entry.id === id);
    if (!asset) {
      missingIdWarnings.push(id);
      continue;
    }

    if (isLocalFontFileMissing(asset)) {
      addAssetToRequest(referencedMissingRequests, asset);
    }
  }

  if (missingIdWarnings.length > 0) {
    console.warn("warning: lockup font IDs missing from manifest:");
    for (const id of missingIdWarnings) {
      console.warn(`- ${id}`);
    }
  }

  for (const request of sortedRequests(referencedMissingRequests)) {
    const requestKey = request.family.trim().toLowerCase();
    if (attemptedFamilies.has(requestKey)) {
      continue;
    }
    attemptedFamilies.add(requestKey);
    const familyAssets = allAssets.filter((asset) => asset.family.toLowerCase() === request.family.toLowerCase());
    const isGoogleFamily = familyAssets.some((asset) => getFontAssetSource(asset) === "google");

    if (isGoogleFamily) {
      try {
        await fetchAndUpsert(request);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`warning: failed to fetch configured google family ${request.family}: ${message}`);
      }
      continue;
    }

    if (!args.auto) {
      const weights = [...request.weights].sort((left, right) => left - right).join(",");
      const italFlag = request.ital ? " --ital" : "";
      console.warn(
        `warning: ${request.family} is referenced but not present locally and not configured for auto-fetch (not a Google Font / not configured).`
      );
      console.warn(`  hint: npm run fonts:add -- --family \"${request.family}\" --weights \"${weights}\"${italFlag}`);
      console.warn(`  or:   npm run fonts:sync -- --auto`);
      continue;
    }

    try {
      await fetchAndUpsert(request);
    } catch {
      console.warn(`warning: ${request.family} is not a Google Font / not configured for auto-fetch`);
    }
  }

  if (manifestChanged) {
    writeGoogleManifest(googleAssets);
    console.log(`updated manifest: ${GOOGLE_FONT_ASSET_MANIFEST_RELATIVE_PATH}`);
  }

  const missingAfterSync = allAssets.filter((asset) => isLocalFontFileMissing(asset));
  if (missingAfterSync.length === 0) {
    console.log("fonts:sync complete (all manifest files present)");
    return;
  }

  const googleMissing = missingAfterSync.filter((asset) => getFontAssetSource(asset) === "google").length;
  console.log(
    `fonts:sync complete (${missingAfterSync.length} files still missing${googleMissing ? `, ${googleMissing} google entries` : ""})`
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === "add") {
    await runAdd(args);
    return;
  }
  await runSync(args);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
