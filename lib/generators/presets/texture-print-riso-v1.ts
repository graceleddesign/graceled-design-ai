import type { DesignLayer } from "@/lib/design-doc";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  createBaseDoc,
  createLogoLayers,
  createNoiseLayers,
  createSubtitleLayer,
  createTitleLayer,
  darkenHex,
  getPaletteColor,
  lightenHex,
  mixHex,
  type PresetGenerator
} from "@/lib/generators/presets/shared";

export const generateTexturePrintRisoV1: PresetGenerator = (context) => {
  const paper = "#F5F1E8";
  const inkA = getPaletteColor(context, 0, "#1E3A8A");
  const inkB = getPaletteColor(context, 4, "#EA580C");
  const inkC = getPaletteColor(context, 5, "#16A34A");
  const darkInk = darkenHex(inkA, 0.32);

  const layers: DesignLayer[] = [
    {
      type: "shape",
      x: 110,
      y: 120,
      w: 1680,
      h: 840,
      shape: "rect",
      fill: lightenHex(inkA, 0.4),
      stroke: "#000000",
      strokeWidth: 0,
      rotation: context.rng.float(-3, 3)
    },
    {
      type: "shape",
      x: 130 + context.rng.int(-14, 16),
      y: 110 + context.rng.int(-14, 14),
      w: 1680,
      h: 840,
      shape: "rect",
      fill: lightenHex(inkB, 0.36),
      stroke: "#000000",
      strokeWidth: 0,
      rotation: context.rng.float(-3, 3)
    },
    {
      type: "shape",
      x: 118 + context.rng.int(-18, 18),
      y: 124 + context.rng.int(-18, 18),
      w: 1680,
      h: 840,
      shape: "rect",
      fill: lightenHex(inkC, 0.4),
      stroke: "#000000",
      strokeWidth: 0,
      rotation: context.rng.float(-3, 3)
    },
    ...createNoiseLayers({
      rng: context.rng,
      count: 580 + context.rng.int(0, 180),
      colorA: mixHex(darkInk, paper, 0.4),
      colorB: mixHex(inkB, paper, 0.56),
      minSize: 1,
      maxSize: 4,
      area: { x: 90, y: 90, w: CANVAS_WIDTH - 180, h: CANVAS_HEIGHT - 180 }
    }),
    {
      type: "shape",
      x: 260,
      y: 264,
      w: 1280,
      h: 520,
      shape: "rect",
      fill: paper,
      stroke: mixHex(darkInk, paper, 0.42),
      strokeWidth: 3
    }
  ];

  const misregisterX = context.rng.int(-8, 8);
  const misregisterY = context.rng.int(-8, 8);
  layers.push(
    createTitleLayer({
      x: 312 + misregisterX,
      y: 336 + misregisterY,
      w: 1180,
      h: 260,
      text: context.title,
      color: mixHex(inkB, darkInk, 0.2),
      fontFamily: "Arial",
      fontWeight: 800,
      fontSize: 104
    }),
    createTitleLayer({
      x: 306,
      y: 330,
      w: 1180,
      h: 260,
      text: context.title,
      color: darkInk,
      fontFamily: "Arial",
      fontWeight: 800,
      fontSize: 104
    }),
    createSubtitleLayer({
      x: 314,
      y: 640,
      w: 1140,
      h: 170,
      text: `${context.subtitle}${context.scripture ? `\n${context.scripture}` : ""}`,
      color: darkenHex(inkA, 0.2),
      fontFamily: "Arial",
      fontWeight: 600,
      fontSize: 32
    }),
    ...createLogoLayers(context, 1540, 148, 200, 92)
  );

  return {
    designDoc: createBaseDoc(paper, layers),
    notes: "Riso-style print composition with seeded misregistration and grain intensity variation."
  };
};
