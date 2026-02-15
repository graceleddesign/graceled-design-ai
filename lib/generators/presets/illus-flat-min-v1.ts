import type { DesignLayer } from "@/lib/design-doc";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  createBaseDoc,
  createLogoLayers,
  createSubtitleLayer,
  createTitleLayer,
  getPaletteColor,
  lightenHex,
  mixHex,
  type PresetGenerator
} from "@/lib/generators/presets/shared";

export const generateIllusFlatMinV1: PresetGenerator = (context) => {
  const sky = lightenHex(getPaletteColor(context, 2, "#E2E8F0"), 0.2);
  const hillA = getPaletteColor(context, 5, "#22C55E");
  const hillB = getPaletteColor(context, 3, "#0EA5E9");
  const ground = mixHex(hillA, "#0F172A", 0.4);
  const sun = getPaletteColor(context, 4, "#F59E0B");
  const titleColor = "#0F172A";

  const horizon = 620 + context.rng.int(-50, 60);

  const layers: DesignLayer[] = [
    {
      type: "shape",
      x: -200,
      y: horizon - 80,
      w: 1160,
      h: 640,
      shape: "rect",
      fill: hillA,
      stroke: hillA,
      strokeWidth: 0,
      rotation: context.rng.float(-8, 6)
    },
    {
      type: "shape",
      x: 640,
      y: horizon - 110,
      w: 1500,
      h: 700,
      shape: "rect",
      fill: hillB,
      stroke: hillB,
      strokeWidth: 0,
      rotation: context.rng.float(-7, 7)
    },
    {
      type: "shape",
      x: -80,
      y: horizon + 120,
      w: CANVAS_WIDTH + 200,
      h: 520,
      shape: "rect",
      fill: ground,
      stroke: ground,
      strokeWidth: 0
    },
    {
      type: "shape",
      x: 1430 + context.rng.int(-90, 90),
      y: 132 + context.rng.int(-40, 50),
      w: 210,
      h: 210,
      shape: "rect",
      fill: sun,
      stroke: sun,
      strokeWidth: 0,
      rotation: context.rng.float(0, 45)
    },
    {
      type: "shape",
      x: 900,
      y: 460,
      w: 230,
      h: 460,
      shape: "rect",
      fill: mixHex(ground, "#000000", 0.15),
      stroke: "#000000",
      strokeWidth: 0,
      rotation: context.rng.float(-5, 5)
    },
    {
      type: "shape",
      x: 1030,
      y: 340,
      w: 160,
      h: 620,
      shape: "rect",
      fill: mixHex(ground, "#000000", 0.24),
      stroke: "#000000",
      strokeWidth: 0,
      rotation: context.rng.float(-5, 5)
    },
    createTitleLayer({
      x: 150,
      y: 150,
      w: 980,
      h: 250,
      text: context.title,
      color: titleColor,
      fontSize: 112 + context.rng.int(-10, 8),
      fontWeight: 800,
      fontFamily: "Arial"
    }),
    createSubtitleLayer({
      x: 154,
      y: 410,
      w: 800,
      h: 170,
      text: `${context.subtitle}${context.scripture ? `\n${context.scripture}` : ""}`,
      color: mixHex(titleColor, hillB, 0.34),
      fontSize: 34,
      fontWeight: 600,
      fontFamily: "Arial"
    }),
    ...createLogoLayers(context, CANVAS_WIDTH - 280, 72, 190, 88)
  ];

  return {
    designDoc: createBaseDoc(sky, layers),
    notes: "Flat minimal illustration scene built from editable geometric layers."
  };
};
