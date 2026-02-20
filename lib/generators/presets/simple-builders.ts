import type { DesignLayer } from "@/lib/design-doc";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  createBaseDoc,
  createGradientBandLayers,
  createLogoLayers,
  createNoiseLayers,
  createSubtitleLayer,
  createTitleLayer,
  darkenHex,
  getPaletteColor,
  lightenHex,
  mixHex,
  type PresetGeneratorContext,
  type PresetGeneratorOutput
} from "@/lib/generators/presets/shared";

type TypePresetVariant = "clean" | "editorial" | "bw" | "brutalist" | "system";
type AbstractPresetVariant = "gradient" | "mark";
type TexturePresetVariant = "stone" | "engraved";
type PhotoPresetVariant = "veil" | "landscape" | "mono" | "warm";

export function generateTypePreset(context: PresetGeneratorContext, variant: TypePresetVariant): PresetGeneratorOutput {
  const ink = variant === "bw" ? "#000000" : darkenHex(getPaletteColor(context, 0, "#0F172A"), 0.15);
  const paper = variant === "bw" ? "#FFFFFF" : lightenHex(getPaletteColor(context, 2, "#F8FAFC"), 0.1);
  const accent = variant === "bw" ? "#111827" : getPaletteColor(context, 3, "#2563EB");
  const layers: DesignLayer[] = [];

  if (variant === "brutalist") {
    layers.push(
      {
        type: "shape",
        x: 0,
        y: 0,
        w: CANVAS_WIDTH,
        h: 220,
        shape: "rect",
        fill: accent,
        stroke: accent,
        strokeWidth: 0
      },
      {
        type: "shape",
        x: 0,
        y: CANVAS_HEIGHT - 220,
        w: CANVAS_WIDTH,
        h: 220,
        shape: "rect",
        fill: darkenHex(accent, 0.16),
        stroke: darkenHex(accent, 0.16),
        strokeWidth: 0
      }
    );
  }

  if (variant === "system") {
    const steps = 10;
    for (let index = 0; index < steps; index += 1) {
      const y = 120 + index * 80 + context.rng.int(-4, 4);
      const color = mixHex(ink, paper, 0.7);
      layers.push({
        type: "shape",
        x: 120,
        y,
        w: 1680,
        h: 1,
        shape: "rect",
        fill: color,
        stroke: color,
        strokeWidth: 0
      });
    }
  }

  if (variant === "editorial") {
    layers.push({
      type: "shape",
      x: 180,
      y: 130,
      w: 26,
      h: 820,
      shape: "rect",
      fill: accent,
      stroke: accent,
      strokeWidth: 0
    });
  }

  if (variant === "clean") {
    layers.push({
      type: "shape",
      x: 120,
      y: 120,
      w: 1680,
      h: 840,
      shape: "rect",
      fill: mixHex(paper, accent, 0.06),
      stroke: mixHex(ink, paper, 0.7),
      strokeWidth: 2
    });
  }

  layers.push(
    createTitleLayer({
      x: 230,
      y: variant === "brutalist" ? 270 : 240,
      w: 1460,
      h: 330,
      text: context.title,
      color: ink,
      fontFamily: variant === "editorial" ? "Georgia" : "Arial",
      fontWeight: variant === "brutalist" ? 900 : 700,
      fontSize: 112 + context.rng.int(-10, 10),
      rotation: variant === "brutalist" ? context.rng.float(-1.5, 1.5) : 0
    }),
    createSubtitleLayer({
      x: 236,
      y: 640,
      w: 1320,
      h: 180,
      text: `${context.subtitle}${context.scripture ? `\n${context.scripture}` : ""}`,
      color: mixHex(ink, accent, 0.25),
      fontFamily: variant === "editorial" ? "Georgia" : "Arial",
      fontWeight: 500,
      fontSize: 34
    }),
    ...createLogoLayers(context, 1570, 80, 210, 92)
  );

  const notesByVariant: Record<TypePresetVariant, string> = {
    clean: "Type clean minimal layout with generous margin system.",
    editorial: "Editorial serif hierarchy with restrained accent rule.",
    bw: "Black and white high-contrast typographic hierarchy.",
    brutalist: "Brutalist type stack with heavy edge bars.",
    system: "Text system rhythm template for repeatable weekly variants."
  };

  return {
    designDoc: createBaseDoc(paper, layers),
    notes: notesByVariant[variant]
  };
}

export function generatePhotoPreset(context: PresetGeneratorContext, variant: PhotoPresetVariant): PresetGeneratorOutput {
  const dark = darkenHex(getPaletteColor(context, 0, "#0F172A"), 0.16);
  const light = lightenHex(getPaletteColor(context, 2, "#CBD5E1"), 0.18);
  const accent = getPaletteColor(context, 4, "#F59E0B");
  const photoX = 70 + context.rng.int(-20, 20);
  const photoY = 70 + context.rng.int(-18, 24);
  const photoW = CANVAS_WIDTH - 140;
  const photoH = CANVAS_HEIGHT - 140;

  const layers: DesignLayer[] = [
    {
      type: "shape",
      x: photoX,
      y: photoY,
      w: photoW,
      h: photoH,
      shape: "rect",
      fill: variant === "mono" ? mixHex(dark, light, 0.35) : mixHex(light, accent, 0.2),
      stroke: mixHex(dark, light, 0.4),
      strokeWidth: 2
    },
    {
      type: "shape",
      x: photoX + 44,
      y: photoY + 42,
      w: photoW - 88,
      h: photoH - 84,
      shape: "rect",
      fill: mixHex(dark, light, variant === "warm" ? 0.3 : 0.24),
      stroke: mixHex(dark, "#FFFFFF", 0.18),
      strokeWidth: 1
    },
    createTitleLayer({
      x: 160,
      y: 240,
      w: 1220,
      h: 280,
      text: context.title,
      color: "#FFFFFF",
      fontSize: variant === "landscape" ? 92 : 104,
      fontWeight: 800,
      fontFamily: "Arial"
    })
  ];

  if (variant === "veil") {
    layers.push({
      type: "shape",
      x: 120,
      y: 180,
      w: 1640,
      h: 760,
      shape: "rect",
      fill: mixHex(dark, "#000000", 0.3),
      stroke: mixHex(dark, "#FFFFFF", 0.1),
      strokeWidth: 0
    });
  }

  if (variant === "landscape") {
    layers.push({
      type: "shape",
      x: 130,
      y: 640,
      w: 1660,
      h: 220,
      shape: "rect",
      fill: mixHex(light, "#FFFFFF", 0.1),
      stroke: mixHex(dark, "#FFFFFF", 0.25),
      strokeWidth: 1
    });
  }

  if (variant === "mono") {
    layers.push({
      type: "shape",
      x: 1420,
      y: 190,
      w: 220,
      h: 620,
      shape: "rect",
      fill: accent,
      stroke: accent,
      strokeWidth: 0
    });
  }

  if (variant === "warm") {
    layers.push(...createGradientBandLayers({
      from: mixHex(accent, "#F59E0B", 0.4),
      to: mixHex(accent, "#7C2D12", 0.25),
      bandCount: 18,
      direction: "horizontal",
      rotation: context.rng.float(-3, 3)
    }));
  }

  layers.push(
    createSubtitleLayer({
      x: 164,
      y: 620,
      w: 1280,
      h: 210,
      text: `${context.subtitle}${context.scripture ? `\n${context.scripture}` : ""}`,
      color: variant === "warm" ? "#FEF3C7" : mixHex("#FFFFFF", accent, 0.22),
      fontWeight: 500,
      fontSize: 32,
      fontFamily: variant === "warm" ? "Georgia" : "Arial"
    }),
    ...createLogoLayers(context, 1570, 78, 210, 90)
  );

  const notesByVariant: Record<PhotoPresetVariant, string> = {
    veil: "Cinematic photo composition with readable veil overlays.",
    landscape: "Landscape-led photo minimal composition with restrained text field.",
    mono: "Monochrome photo treatment with accent bar interaction.",
    warm: "Warm film tone photo treatment with editorial overlays."
  };

  return {
    designDoc: createBaseDoc(variant === "warm" ? "#2B1A12" : dark, layers),
    notes: notesByVariant[variant]
  };
}

export function generateAbstractPreset(context: PresetGeneratorContext, variant: AbstractPresetVariant): PresetGeneratorOutput {
  const base = darkenHex(getPaletteColor(context, 0, "#0F172A"), 0.1);
  const accentA = getPaletteColor(context, 3, "#38BDF8");
  const accentB = getPaletteColor(context, 5, "#22C55E");
  const layers: DesignLayer[] = [];

  if (variant === "gradient") {
    layers.push(
      ...createGradientBandLayers({
        from: mixHex(base, accentA, 0.24),
        to: mixHex(base, accentB, 0.34),
        bandCount: 24,
        direction: context.rng.bool(0.5) ? "horizontal" : "vertical",
        rotation: context.rng.float(-8, 8)
      })
    );
  }

  if (variant === "mark") {
    const ringColor = mixHex(accentA, "#FFFFFF", 0.1);
    for (let index = 0; index < 5; index += 1) {
      const size = 440 + index * 110;
      layers.push({
        type: "shape",
        x: 220 + index * 130,
        y: 110 + index * 42,
        w: size,
        h: 72,
        shape: "rect",
        fill: ringColor,
        stroke: ringColor,
        strokeWidth: 0,
        rotation: 30 + index * 7
      });
    }

    layers.push({
      type: "shape",
      x: 210,
      y: 210,
      w: 420,
      h: 420,
      shape: "rect",
      fill: mixHex(accentB, base, 0.35),
      stroke: mixHex(accentA, "#FFFFFF", 0.2),
      strokeWidth: 4,
      rotation: context.rng.float(-8, 8)
    });
  }

  layers.push(
    createTitleLayer({
      x: variant === "mark" ? 700 : 170,
      y: 250,
      w: variant === "mark" ? 1040 : 1480,
      h: 300,
      text: context.title,
      color: "#FFFFFF",
      fontFamily: "Arial",
      fontWeight: 700,
      fontSize: 102 + context.rng.int(-8, 10)
    }),
    createSubtitleLayer({
      x: variant === "mark" ? 706 : 176,
      y: 620,
      w: variant === "mark" ? 980 : 1320,
      h: 180,
      text: `${context.subtitle}${context.scripture ? `\n${context.scripture}` : ""}`,
      color: mixHex("#FFFFFF", accentA, 0.22),
      fontFamily: "Arial",
      fontWeight: 500,
      fontSize: 32
    }),
    ...createLogoLayers(context, 1570, 78, 206, 90)
  );

  return {
    designDoc: createBaseDoc(base, layers),
    notes:
      variant === "gradient"
        ? "Modern abstract gradient field with seeded angle and stop variation."
        : "Abstract mark-led composition with geometric icon system."
  };
}

export function generateTexturePreset(context: PresetGeneratorContext, variant: TexturePresetVariant): PresetGeneratorOutput {
  const base = variant === "stone" ? "#E2E8F0" : "#F7F4ED";
  const ink = darkenHex(getPaletteColor(context, 0, "#334155"), 0.2);
  const accent = getPaletteColor(context, 4, "#F59E0B");

  const layers: DesignLayer[] = [
    {
      type: "shape",
      x: 90,
      y: 90,
      w: 1740,
      h: 900,
      shape: "rect",
      fill: mixHex(base, ink, variant === "stone" ? 0.15 : 0.08),
      stroke: mixHex(ink, "#FFFFFF", 0.34),
      strokeWidth: 2,
      rotation: context.rng.float(-2, 2)
    },
    ...createNoiseLayers({
      rng: context.rng,
      count: variant === "stone" ? 660 : 740,
      colorA: mixHex(ink, base, 0.5),
      colorB: mixHex(accent, base, 0.65),
      minSize: 1,
      maxSize: variant === "stone" ? 5 : 3,
      area: { x: 100, y: 100, w: 1720, h: 880 }
    }),
    createTitleLayer({
      x: 180,
      y: 240,
      w: 1320,
      h: 320,
      text: context.title,
      color: ink,
      fontFamily: variant === "engraved" ? "Georgia" : "Arial",
      fontWeight: 700,
      fontSize: 102
    }),
    createSubtitleLayer({
      x: 186,
      y: 600,
      w: 1200,
      h: 190,
      text: `${context.subtitle}${context.scripture ? `\n${context.scripture}` : ""}`,
      color: mixHex(ink, accent, 0.28),
      fontFamily: variant === "engraved" ? "Georgia" : "Arial",
      fontWeight: 500,
      fontSize: 32
    }),
    ...createLogoLayers(context, 1570, 84, 206, 90)
  ];

  return {
    designDoc: createBaseDoc(base, layers),
    notes: variant === "stone" ? "Stone-modern textured field with seeded scale and contrast." : "Engraved illustration texture stub with etched grain pattern."
  };
}

export function generateSeasonalPreset(context: PresetGeneratorContext): PresetGeneratorOutput {
  const liturgicalPalette = ["#6B21A8", "#14532D", "#B91C1C", "#1D4ED8", "#B45309"];
  const season = context.rng.pick(["Advent", "Lent", "Easter", "Pentecost", "Ordinary Time"]);
  const seasonColor = liturgicalPalette[["Advent", "Lent", "Easter", "Pentecost", "Ordinary Time"].indexOf(season)];
  const base = mixHex("#0F172A", seasonColor, 0.2);

  const layers: DesignLayer[] = [
    ...createGradientBandLayers({
      from: mixHex(base, seasonColor, 0.25),
      to: mixHex(base, "#FFFFFF", 0.08),
      bandCount: 20,
      direction: "vertical",
      rotation: context.rng.float(-4, 4)
    }),
    {
      type: "shape",
      x: 200,
      y: 120,
      w: 1520,
      h: 840,
      shape: "rect",
      fill: mixHex(base, "#000000", 0.2),
      stroke: mixHex(seasonColor, "#FFFFFF", 0.3),
      strokeWidth: 2
    },
    createTitleLayer({
      x: 270,
      y: 260,
      w: 1380,
      h: 300,
      text: context.title,
      color: "#FFFFFF",
      fontFamily: "Georgia",
      fontWeight: 700,
      fontSize: 102
    }),
    createSubtitleLayer({
      x: 276,
      y: 620,
      w: 1320,
      h: 200,
      text: `${context.subtitle}${context.scripture ? `\n${context.scripture}` : ""}`,
      color: mixHex("#FFFFFF", seasonColor, 0.35),
      fontFamily: "Georgia",
      fontWeight: 500,
      fontSize: 32
    }),
    ...createLogoLayers(context, 1568, 82, 206, 90)
  ];

  return {
    designDoc: createBaseDoc(base, layers),
    notes: "Season-aware liturgical palette and motif treatment with seeded seasonal tone."
  };
}
