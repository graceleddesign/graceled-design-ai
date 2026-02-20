import type { DesignLayer } from "@/lib/design-doc";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  createBaseDoc,
  createLogoLayers,
  createSubtitleLayer,
  createTitleLayer,
  darkenHex,
  getPaletteColor,
  lightenHex,
  mixHex,
  type PresetGenerator
} from "@/lib/generators/presets/shared";

export const generatePhotoColorBlockV1: PresetGenerator = (context) => {
  const background = "#111827";
  const photoTone = mixHex(getPaletteColor(context, 0, "#334155"), "#94A3B8", 0.35);
  const block = getPaletteColor(context, 4, "#F97316");
  const secondary = getPaletteColor(context, 3, "#38BDF8");
  const photoX = 160 + context.rng.int(-30, 40);
  const photoY = 90 + context.rng.int(-20, 24);
  const photoW = 1220 + context.rng.int(-90, 120);
  const photoH = 900 + context.rng.int(-70, 80);

  const layers: DesignLayer[] = [
    {
      type: "shape",
      x: photoX,
      y: photoY,
      w: photoW,
      h: photoH,
      shape: "rect",
      fill: photoTone,
      stroke: lightenHex(photoTone, 0.12),
      strokeWidth: 2
    },
    {
      type: "shape",
      x: photoX + 36,
      y: photoY + 32,
      w: photoW - 72,
      h: photoH - 64,
      shape: "rect",
      fill: mixHex(photoTone, "#000000", 0.2),
      stroke: mixHex(photoTone, "#FFFFFF", 0.12),
      strokeWidth: 1
    },
    {
      type: "shape",
      x: photoX + photoW - 560,
      y: photoY + photoH - 360,
      w: 620,
      h: 330,
      shape: "rect",
      fill: block,
      stroke: darkenHex(block, 0.18),
      strokeWidth: 2,
      rotation: context.rng.float(-6, 6)
    },
    {
      type: "shape",
      x: photoX + photoW - 610,
      y: photoY + 120,
      w: 360,
      h: 64,
      shape: "rect",
      fill: secondary,
      stroke: secondary,
      strokeWidth: 0,
      rotation: context.rng.float(-4, 4)
    },
    createTitleLayer({
      x: photoX + photoW - 520,
      y: photoY + photoH - 320,
      w: 520,
      h: 240,
      text: context.title,
      color: "#111827",
      fontFamily: "Arial",
      fontSize: 90 + context.rng.int(-6, 8),
      fontWeight: 800
    }),
    createSubtitleLayer({
      x: photoX + photoW - 520,
      y: photoY + photoH - 92,
      w: 520,
      h: 120,
      text: `${context.subtitle}${context.scripture ? `\n${context.scripture}` : ""}`,
      color: darkenHex(block, 0.6),
      fontFamily: "Arial",
      fontSize: 30,
      fontWeight: 600
    }),
    ...createLogoLayers(context, CANVAS_WIDTH - 278, 74, 194, 88)
  ];

  return {
    designDoc: createBaseDoc(background, layers),
    notes: "Photo-window composition with interacting color-block typography treatment."
  };
};
