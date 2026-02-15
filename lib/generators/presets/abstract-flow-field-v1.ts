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

export const generateAbstractFlowFieldV1: PresetGenerator = (context) => {
  const base = darkenHex(getPaletteColor(context, 0, "#0F172A"), 0.2);
  const accentA = getPaletteColor(context, 3, "#06B6D4");
  const accentB = getPaletteColor(context, 4, "#F97316");
  const accentC = getPaletteColor(context, 5, "#22C55E");
  const layers: DesignLayer[] = [];

  const blobCount = 8 + context.rng.int(0, 4);
  for (let index = 0; index < blobCount; index += 1) {
    const blobWidth = context.rng.float(240, 560);
    const blobHeight = context.rng.float(140, 360);
    const fill = context.rng.pick([
      mixHex(accentA, base, context.rng.float(0.45, 0.75)),
      mixHex(accentB, base, context.rng.float(0.4, 0.72)),
      mixHex(accentC, base, context.rng.float(0.4, 0.7))
    ]);

    layers.push({
      type: "shape",
      x: context.rng.float(-120, CANVAS_WIDTH - 120),
      y: context.rng.float(-100, CANVAS_HEIGHT - 80),
      w: blobWidth,
      h: blobHeight,
      shape: "rect",
      fill,
      stroke: fill,
      strokeWidth: 0,
      rotation: context.rng.float(-34, 34)
    });
  }

  const lineCount = 34 + context.rng.int(0, 14);
  const lineTilt = context.rng.float(-20, 20);
  for (let index = 0; index < lineCount; index += 1) {
    const y = (CANVAS_HEIGHT / lineCount) * index + context.rng.float(-14, 14);
    const lineColor = lightenHex(mixHex(base, "#FFFFFF", context.rng.float(0.12, 0.25)), context.rng.float(0.02, 0.12));

    layers.push({
      type: "shape",
      x: -60,
      y,
      w: CANVAS_WIDTH + 120,
      h: context.rng.float(2, 8),
      shape: "rect",
      fill: lineColor,
      stroke: lineColor,
      strokeWidth: 0,
      rotation: lineTilt + context.rng.float(-9, 9)
    });
  }

  const textPanelColor = mixHex(base, "#FFFFFF", 0.1);
  layers.push({
    type: "shape",
    x: 120,
    y: 130,
    w: 920,
    h: 820,
    shape: "rect",
    fill: textPanelColor,
    stroke: lightenHex(textPanelColor, 0.24),
    strokeWidth: 2,
    rotation: context.rng.float(-3, 3)
  });

  layers.push(
    createTitleLayer({
      x: 180,
      y: 220 + context.rng.int(-18, 16),
      w: 760,
      h: 360,
      text: context.title,
      color: "#FFFFFF",
      fontSize: 96 + context.rng.int(-6, 8),
      fontWeight: 700,
      fontFamily: "Arial"
    }),
    createSubtitleLayer({
      x: 180,
      y: 640,
      w: 760,
      h: 220,
      text: `${context.subtitle}${context.scripture ? `\n${context.scripture}` : ""}`,
      color: mixHex("#FFFFFF", accentA, 0.2),
      fontSize: 34,
      fontWeight: 500,
      fontFamily: "Arial"
    }),
    ...createLogoLayers(context, 1600, 84, 220, 110)
  );

  return {
    designDoc: createBaseDoc(base, layers),
    notes: "Flow-field abstract with layered blobs and directional line rhythm."
  };
};
