import assert from "node:assert/strict";
import sharp from "sharp";
import { buildFinalSvg } from "../lib/final-deliverables";
import { getFontPairing } from "../lib/lockups/fonts";
import { normalizePrimaryFontFamily } from "../lib/lockups/font-registry";
import { getLockupPresetById } from "../lib/lockups/presets";
import { buildCleanMinimalDesignDoc } from "../lib/templates/type-clean-min";

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function svgFontFamilies(svg: string): string[] {
  const families: string[] = [];
  const regex = /font-family="([^"]+)"/g;
  let match = regex.exec(svg);
  while (match) {
    families.push(normalizePrimaryFontFamily(match[1]));
    match = regex.exec(svg);
  }
  return unique(families).sort((a, b) => a.localeCompare(b));
}

function pairingsEqual(
  left: { titleFont: string; subtitleFont: string; accentFont?: string },
  right: { titleFont: string; subtitleFont: string; accentFont?: string }
): boolean {
  return (
    left.titleFont === right.titleFont &&
    left.subtitleFont === right.subtitleFont &&
    (left.accentFont || "") === (right.accentFont || "")
  );
}

async function main() {
  const preset = getLockupPresetById("modern_editorial");

  const pairingA = getFontPairing(preset, preset.styleFamily, preset.id, "font-seed-a");
  let pairingB = getFontPairing(preset, preset.styleFamily, preset.id, "font-seed-b");
  let seedB = "font-seed-b";

  for (let index = 0; index < 24 && pairingsEqual(pairingA, pairingB); index += 1) {
    seedB = `font-seed-b-${index}`;
    pairingB = getFontPairing(preset, preset.styleFamily, preset.id, seedB);
  }

  assert(!pairingsEqual(pairingA, pairingB), "Failed to resolve two distinct seeded font pairings.");

  const sharedParams = {
    width: 1080,
    height: 1080,
    content: {
      title: "Grace In The Wilderness",
      subtitle: "Week 3",
      passage: "Psalm 27"
    },
    palette: {
      primary: "#0F172A",
      secondary: "#334155",
      tertiary: "#475569",
      rule: "#CBD5E1",
      accent: "#0F172A",
      autoScrim: false,
      scrimTint: "#FFFFFF" as const
    },
    backgroundImagePath: null,
    lockupPresetId: preset.id,
    styleFamily: preset.styleFamily
  };

  const designDocA = buildCleanMinimalDesignDoc({
    ...sharedParams,
    fontSeed: "font-seed-a"
  });
  const designDocB = buildCleanMinimalDesignDoc({
    ...sharedParams,
    fontSeed: seedB
  });

  const svgA = await buildFinalSvg(designDocA);
  const svgB = await buildFinalSvg(designDocB);

  const familiesA = svgFontFamilies(svgA);
  const familiesB = svgFontFamilies(svgB);
  console.log("resolved-fonts-a:", familiesA.join(", "));
  console.log("resolved-fonts-b:", familiesB.join(", "));

  const pngA = await sharp(Buffer.from(svgA)).png().toBuffer();
  const pngB = await sharp(Buffer.from(svgB)).png().toBuffer();

  assert(!pngA.equals(pngB), "Rendered PNG outputs are identical; expected visible typography differences.");
  console.log("font-render-check: ok");
}

main().catch((error) => {
  console.error("font-render-check: failed");
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
