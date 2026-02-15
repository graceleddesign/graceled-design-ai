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

export const generateGeoShapesNegativeV1: PresetGenerator = (context) => {
  const background = "#F8FAFC";
  const dark = darkenHex(getPaletteColor(context, 0, "#0F172A"), 0.2);
  const accent = getPaletteColor(context, 4, "#F97316");
  const support = getPaletteColor(context, 3, "#2563EB");

  const centerX = 520 + context.rng.int(-70, 70);
  const centerY = 210 + context.rng.int(-50, 50);
  const centerW = 940 + context.rng.int(-80, 120);
  const centerH = 670 + context.rng.int(-70, 80);

  const layers: DesignLayer[] = [
    {
      type: "shape",
      x: -180,
      y: -180,
      w: 760,
      h: 640,
      shape: "rect",
      fill: dark,
      stroke: dark,
      strokeWidth: 0,
      rotation: context.rng.float(-16, 12)
    },
    {
      type: "shape",
      x: CANVAS_WIDTH - 620,
      y: -170,
      w: 860,
      h: 540,
      shape: "rect",
      fill: mixHex(dark, accent, 0.14),
      stroke: mixHex(dark, accent, 0.14),
      strokeWidth: 0,
      rotation: context.rng.float(-14, 16)
    },
    {
      type: "shape",
      x: -120,
      y: CANVAS_HEIGHT - 360,
      w: 820,
      h: 520,
      shape: "rect",
      fill: mixHex(dark, support, 0.2),
      stroke: mixHex(dark, support, 0.2),
      strokeWidth: 0,
      rotation: context.rng.float(-10, 16)
    },
    {
      type: "shape",
      x: CANVAS_WIDTH - 760,
      y: CANVAS_HEIGHT - 350,
      w: 960,
      h: 580,
      shape: "rect",
      fill: lightenHex(dark, 0.08),
      stroke: lightenHex(dark, 0.08),
      strokeWidth: 0,
      rotation: context.rng.float(-12, 14)
    },
    {
      type: "shape",
      x: centerX,
      y: centerY,
      w: centerW,
      h: centerH,
      shape: "rect",
      fill: background,
      stroke: mixHex(dark, "#FFFFFF", 0.32),
      strokeWidth: 4,
      rotation: context.rng.float(-2.5, 2.5)
    },
    {
      type: "shape",
      x: centerX + 56,
      y: centerY + centerH - 150,
      w: 260,
      h: 26,
      shape: "rect",
      fill: accent,
      stroke: accent,
      strokeWidth: 0,
      rotation: context.rng.float(-2.2, 2.2)
    }
  ];

  layers.push(
    createTitleLayer({
      x: centerX + 52,
      y: centerY + 66,
      w: centerW - 120,
      h: 360,
      text: context.title,
      color: dark,
      fontFamily: "Arial",
      fontSize: 108 + context.rng.int(-10, 6),
      fontWeight: 800
    }),
    createSubtitleLayer({
      x: centerX + 52,
      y: centerY + centerH - 220,
      w: centerW - 120,
      h: 180,
      text: `${context.subtitle}${context.scripture ? `\n${context.scripture}` : ""}`,
      color: mixHex(dark, support, 0.3),
      fontFamily: "Arial",
      fontSize: 34,
      fontWeight: 600
    }),
    ...createLogoLayers(context, CANVAS_WIDTH - 300, 76, 200, 92)
  );

  return {
    designDoc: createBaseDoc(background, layers),
    notes: "Negative-space geometry composition with oversized edge forms and central breathing room."
  };
};
