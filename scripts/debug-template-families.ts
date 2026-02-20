import { mkdir, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { buildFinalSvg } from "../lib/final-deliverables";
import { renderTemplate, buildBackgroundPrompt, type TemplateAspect, type TemplateBrief } from "../lib/templates";
import {
  chooseTextPaletteForBackground,
  computeCleanMinimalLayout,
  resolveLockupPaletteForBackground
} from "../lib/templates/type-clean-min";

const OUTPUT_DIR = path.join(process.cwd(), "public", "debug", "template-families");
const ASPECTS: readonly TemplateAspect[] = ["square", "wide", "tall"];
const STYLE_FAMILIES = ["editorial-photo", "modern-collage", "illustrated-heritage"] as const;

const DIMENSIONS: Record<TemplateAspect, { width: number; height: number }> = {
  square: { width: 1080, height: 1080 },
  wide: { width: 1920, height: 1080 },
  tall: { width: 1080, height: 1920 }
};

const PRESET_BY_STYLE: Record<(typeof STYLE_FAMILIES)[number], string> = {
  "editorial-photo": "boxed_titleplate",
  "modern-collage": "modern_condensed_monument",
  "illustrated-heritage": "handmade_organic"
};

const BRIEF: Omit<TemplateBrief, "lockupPresetId"> = {
  title: "Ruth",
  subtitle: "God Lovingly Provides",
  scripture: "Ruth 1:1-22",
  keywords: ["providence", "harvest", "mercy", "restoration", "loyalty"],
  palette: ["#111827", "#374151", "#F8F3E8", "#B45309", "#0EA5E9", "#84CC16"]
};

function backgroundSvg(styleFamily: (typeof STYLE_FAMILIES)[number], aspect: TemplateAspect): string {
  const { width, height } = DIMENSIONS[aspect];

  if (styleFamily === "editorial-photo") {
    return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0B1325"/>
      <stop offset="55%" stop-color="#1F2D46"/>
      <stop offset="100%" stop-color="#5B4636"/>
    </linearGradient>
    <radialGradient id="glow" cx="70%" cy="35%" r="52%">
      <stop offset="0%" stop-color="#F8E7C0" stop-opacity="0.32"/>
      <stop offset="100%" stop-color="#F8E7C0" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect width="${width}" height="${height}" fill="url(#glow)"/>
  <rect x="${Math.round(width * 0.58)}" y="${Math.round(height * 0.12)}" width="${Math.round(width * 0.3)}" height="${Math.round(height * 0.74)}" fill="#F5E6C8" opacity="0.12"/>
  <rect x="${Math.round(width * 0.62)}" y="${Math.round(height * 0.18)}" width="${Math.round(width * 0.2)}" height="${Math.round(height * 0.56)}" fill="#F5E6C8" opacity="0.14"/>
</svg>`;
  }

  if (styleFamily === "modern-collage") {
    return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#F4F0E8"/>
  <rect x="${Math.round(width * 0.6)}" y="${Math.round(height * 0.08)}" width="${Math.round(width * 0.28)}" height="${Math.round(height * 0.24)}" fill="#0EA5E9" transform="rotate(-5 ${Math.round(width * 0.74)} ${Math.round(height * 0.2)})"/>
  <rect x="${Math.round(width * 0.62)}" y="${Math.round(height * 0.42)}" width="${Math.round(width * 0.24)}" height="${Math.round(height * 0.2)}" fill="#F97316" transform="rotate(4 ${Math.round(width * 0.74)} ${Math.round(height * 0.52)})"/>
  <rect x="${Math.round(width * 0.54)}" y="${Math.round(height * 0.72)}" width="${Math.round(width * 0.26)}" height="${Math.round(height * 0.12)}" fill="#84CC16" transform="rotate(-2 ${Math.round(width * 0.67)} ${Math.round(height * 0.78)})"/>
  <g stroke="#6B7280" stroke-opacity="0.2">
    ${Array.from({ length: 7 })
      .map((_, row) => {
        const y = Math.round(height * 0.08 + (height * 0.78 * row) / 6);
        return `<line x1="${Math.round(width * 0.54)}" y1="${y}" x2="${Math.round(width * 0.9)}" y2="${y}"/>`;
      })
      .join("\n")}
  </g>
</svg>`;
  }

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#F8F2E7"/>
  <rect x="20" y="20" width="${width - 40}" height="${height - 40}" fill="none" stroke="#8B6A3E" stroke-width="2"/>
  <rect x="34" y="34" width="${width - 68}" height="${height - 68}" fill="none" stroke="#B68C55" stroke-width="1"/>
  ${Array.from({ length: aspect === "wide" ? 22 : 28 })
    .map((_, row) => {
      const y = Math.round((height / (aspect === "wide" ? 22 : 28)) * row);
      return `<rect x="0" y="${y}" width="${width}" height="1" fill="#7C6650" opacity="0.08"/>`;
    })
    .join("\n")}
  <rect x="${Math.round(width * 0.84)}" y="${Math.round(height * 0.22)}" width="2" height="${Math.round(height * 0.56)}" fill="#8B6A3E"/>
  ${Array.from({ length: 14 })
    .map((_, i) => {
      const y = Math.round(height * 0.24 + i * ((height * 0.52) / 14));
      const left = i % 2 === 0;
      const x = Math.round(width * 0.84 + (left ? -14 : 2));
      const r = left ? -24 : 24;
      return `<rect x="${x}" y="${y}" width="12" height="2" fill="#B68C55" transform="rotate(${r} ${x + 6} ${y + 1})"/>`;
    })
    .join("\n")}
</svg>`;
}

async function renderBackground(styleFamily: (typeof STYLE_FAMILIES)[number], aspect: TemplateAspect): Promise<Buffer> {
  return sharp(Buffer.from(backgroundSvg(styleFamily, aspect))).png().toBuffer();
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  for (const styleFamily of STYLE_FAMILIES) {
    const brief: TemplateBrief = {
      ...BRIEF,
      lockupPresetId: PRESET_BY_STYLE[styleFamily]
    };

    const stylePrompt = buildBackgroundPrompt(brief, styleFamily);
    await writeFile(path.join(OUTPUT_DIR, `${styleFamily}-prompt.txt`), `${stylePrompt}\n`);
    const masterAspect: TemplateAspect = "wide";
    const masterDimensions = DIMENSIONS[masterAspect];
    const masterBackground = await renderBackground(styleFamily, masterAspect);
    const masterLayout = computeCleanMinimalLayout({
      width: masterDimensions.width,
      height: masterDimensions.height,
      content: {
        title: BRIEF.title,
        subtitle: BRIEF.subtitle,
        passage: BRIEF.scripture
      },
      lockupPresetId: PRESET_BY_STYLE[styleFamily],
      styleFamily
    });
    const resolvedLockupPalette = await resolveLockupPaletteForBackground({
      backgroundPng: masterBackground,
      sampleRegion: masterLayout.textRegion,
      width: masterDimensions.width,
      height: masterDimensions.height
    });

    for (const aspect of ASPECTS) {
      const { width, height } = DIMENSIONS[aspect];
      const backgroundPng = await renderBackground(styleFamily, aspect);
      const backgroundRelativePath = path.posix.join("debug", "template-families", `${styleFamily}-${aspect}-bg.png`);
      await writeFile(path.join(OUTPUT_DIR, `${styleFamily}-${aspect}-bg.png`), backgroundPng);

      const layout = computeCleanMinimalLayout({
        width,
        height,
        content: {
          title: BRIEF.title,
          subtitle: BRIEF.subtitle,
          passage: BRIEF.scripture
        },
        lockupPresetId: PRESET_BY_STYLE[styleFamily],
        styleFamily
      });
      const textPalette = await chooseTextPaletteForBackground({
        backgroundPng,
        sampleRegion: layout.textRegion,
        width,
        height,
        resolvedPalette: resolvedLockupPalette
      });

      const designDoc = renderTemplate(styleFamily, brief, 0, aspect, {
        backgroundImagePath: backgroundRelativePath,
        textPalette
      });
      const svg = await buildFinalSvg(designDoc);
      const finalPng = await sharp(Buffer.from(svg)).png().toBuffer();
      await writeFile(path.join(OUTPUT_DIR, `${styleFamily}-${aspect}-final.png`), finalPng);

      console.log(`Saved ${styleFamily}-${aspect}-bg.png and ${styleFamily}-${aspect}-final.png`);
    }
  }

  console.log(`Done. Outputs saved in ${OUTPUT_DIR}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
