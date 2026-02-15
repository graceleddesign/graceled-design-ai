import type { DesignDoc, DesignLayer } from "@/lib/design-doc";
import {
  createNoiseLayers,
  createSeededRandom,
  darkenHex,
  getPaletteColor,
  lightenHex,
  mixHex,
  type DesignDocByShape,
  type DesignDocShape,
  type PresetGenerator,
  type SeededRandom
} from "@/lib/generators/presets/shared";

type ShapeDimensions = {
  width: number;
  height: number;
};

type ShapeLayout = {
  marginX: number;
  marginY: number;
  columns: number;
  gutter: number;
  titleTop: number;
  titleHeight: number;
  titleStartCol: number;
  titleSpanCols: number;
  mainStartCol: number;
  mainSpanCols: number;
  sideStartCol: number;
  sideSpanCols: number;
  showSideDescription: boolean;
};

type PaletteSet = {
  background: string;
  panel: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  grid: string;
};

type TitleFit = {
  text: string;
  fontSize: number;
  lineHeight: number;
  lineCount: number;
};

const SHAPE_DIMENSIONS: Record<DesignDocShape, ShapeDimensions> = {
  square: { width: 1080, height: 1080 },
  wide: { width: 1920, height: 1080 },
  tall: { width: 1080, height: 1920 }
};

function clamp(input: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, input));
}

function normalizeCopy(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toWords(value: string): string[] {
  const normalized = normalizeCopy(value);
  return normalized ? normalized.split(" ") : [];
}

function parseHex(color: string): [number, number, number] {
  const match = /^#([0-9a-fA-F]{6})$/.exec(color.trim());
  if (!match) {
    return [15, 23, 42];
  }

  const hex = match[1];
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16)
  ];
}

function channelToLinear(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(color: string): number {
  const [r, g, b] = parseHex(color);
  return 0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b);
}

function buildPaletteSet(base: string, accentInput: string): PaletteSet {
  const darkBackground = luminance(base) < 0.43;
  const background = darkBackground ? darkenHex(base, 0.16) : lightenHex(base, 0.16);
  const accent =
    Math.abs(luminance(accentInput) - luminance(background)) < 0.16
      ? (darkBackground ? lightenHex(accentInput, 0.34) : darkenHex(accentInput, 0.28))
      : accentInput;

  return {
    background,
    panel: darkBackground ? mixHex(background, "#FFFFFF", 0.04) : mixHex(background, "#FFFFFF", 0.58),
    textPrimary: darkBackground ? "#F8FAFC" : "#0F172A",
    textSecondary: darkBackground ? mixHex("#FFFFFF", accent, 0.28) : mixHex("#0F172A", accent, 0.36),
    textMuted: darkBackground ? mixHex("#FFFFFF", background, 0.38) : mixHex("#0F172A", background, 0.45),
    accent,
    grid: darkBackground ? mixHex(background, "#FFFFFF", 0.15) : mixHex(background, "#0F172A", 0.12)
  };
}

function wrapWords(words: string[], maxChars: number): string[] {
  if (words.length === 0) {
    return [];
  }

  const lines: string[] = [];
  let currentWords: string[] = [];

  for (const word of words) {
    const candidate = currentWords.length === 0 ? word : `${currentWords.join(" ")} ${word}`;
    if (candidate.length <= maxChars || currentWords.length === 0) {
      currentWords.push(word);
      continue;
    }

    lines.push(currentWords.join(" "));
    currentWords = [word];
  }

  if (currentWords.length > 0) {
    lines.push(currentWords.join(" "));
  }

  return lines;
}

function avoidWidow(lines: string[], maxChars: number): string[] {
  if (lines.length < 2) {
    return lines;
  }

  const result = [...lines];
  const lastIndex = result.length - 1;
  const previousIndex = result.length - 2;
  const lastWords = toWords(result[lastIndex]);
  const previousWords = toWords(result[previousIndex]);

  if (lastWords.length >= 2 || previousWords.length < 3) {
    return result;
  }

  const movedWord = previousWords.pop();
  if (!movedWord) {
    return result;
  }

  const newLastLine = `${movedWord} ${result[lastIndex]}`.trim();
  if (newLastLine.length > maxChars + 4) {
    previousWords.push(movedWord);
    return result;
  }

  result[previousIndex] = previousWords.join(" ");
  result[lastIndex] = newLastLine;
  return result;
}

function scoreLineBalance(lines: string[]): number {
  if (lines.length <= 1) {
    return 0;
  }

  const lengths = lines.map((line) => line.length);
  const mean = lengths.reduce((sum, value) => sum + value, 0) / lengths.length;
  return lengths.reduce((sum, value) => sum + Math.abs(value - mean), 0);
}

function fitTitleText(params: {
  title: string;
  width: number;
  maxHeight: number;
  minSize: number;
  maxSize: number;
}): TitleFit {
  const words = toWords(params.title);
  if (words.length === 0) {
    return {
      text: "Untitled Series",
      fontSize: params.minSize,
      lineHeight: Math.round(params.minSize * 1.18),
      lineCount: 1
    };
  }

  let bestFit: TitleFit | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let fontSize = params.maxSize; fontSize >= params.minSize; fontSize -= 2) {
    const maxChars = Math.max(7, Math.floor(params.width / (fontSize * 0.57)));
    const wrapped = avoidWidow(wrapWords(words, maxChars), maxChars);
    if (wrapped.length === 0 || wrapped.length > 3) {
      continue;
    }

    const lineHeight = Math.round(fontSize * 1.18);
    const usedHeight = wrapped.length * lineHeight;
    if (usedHeight > params.maxHeight) {
      continue;
    }

    const widowPenalty = toWords(wrapped[wrapped.length - 1]).length === 1 ? 16 : 0;
    const score = fontSize * 5 - scoreLineBalance(wrapped) - widowPenalty;
    if (score > bestScore) {
      bestScore = score;
      bestFit = {
        text: wrapped.join("\n"),
        fontSize,
        lineHeight,
        lineCount: wrapped.length
      };
    }
  }

  if (bestFit) {
    return bestFit;
  }

  const fallbackFontSize = params.minSize;
  const fallbackLines = wrapWords(words, Math.max(8, Math.floor(params.width / (fallbackFontSize * 0.57)))).slice(0, 3);
  return {
    text: fallbackLines.join("\n"),
    fontSize: fallbackFontSize,
    lineHeight: Math.round(fallbackFontSize * 1.18),
    lineCount: fallbackLines.length || 1
  };
}

function clampWrappedCopy(text: string, maxChars: number, maxLines: number): string {
  const words = toWords(text);
  if (words.length === 0) {
    return "";
  }

  const wrapped = avoidWidow(wrapWords(words, maxChars), maxChars);
  if (wrapped.length <= maxLines) {
    return wrapped.join("\n");
  }

  const clamped = wrapped.slice(0, maxLines);
  const lastIndex = clamped.length - 1;
  let lastLine = clamped[lastIndex];

  while (lastLine.length > maxChars - 1 && lastLine.includes(" ")) {
    lastLine = lastLine.slice(0, lastLine.lastIndexOf(" "));
  }

  clamped[lastIndex] = `${lastLine.replace(/[.,;:!?-]+$/, "")}…`;
  return clamped.join("\n");
}

function getShapeLayout(shape: DesignDocShape, dimensions: ShapeDimensions, rng: SeededRandom): ShapeLayout {
  if (shape === "wide") {
    return {
      marginX: 138 + rng.int(-10, 10),
      marginY: 86 + rng.int(-8, 8),
      columns: 12,
      gutter: 16,
      titleTop: 210 + rng.int(-10, 14),
      titleHeight: 340,
      titleStartCol: 0,
      titleSpanCols: 7,
      mainStartCol: 0,
      mainSpanCols: 7,
      sideStartCol: 8,
      sideSpanCols: 4,
      showSideDescription: true
    };
  }

  if (shape === "tall") {
    return {
      marginX: 92 + rng.int(-6, 8),
      marginY: 134 + rng.int(-12, 12),
      columns: 8,
      gutter: 12,
      titleTop: 300 + rng.int(-16, 20),
      titleHeight: 560,
      titleStartCol: 0,
      titleSpanCols: 8,
      mainStartCol: 0,
      mainSpanCols: 8,
      sideStartCol: 0,
      sideSpanCols: 8,
      showSideDescription: false
    };
  }

  return {
    marginX: 92 + rng.int(-8, 8),
    marginY: 92 + rng.int(-8, 8),
    columns: 8,
    gutter: 14,
    titleTop: 210 + rng.int(-10, 14),
    titleHeight: 360,
    titleStartCol: 0,
    titleSpanCols: 8,
    mainStartCol: 0,
    mainSpanCols: 8,
    sideStartCol: 0,
    sideSpanCols: 8,
    showSideDescription: false
  };
}

function columnMetrics(layout: ShapeLayout, width: number) {
  const innerWidth = width - layout.marginX * 2;
  const columnWidth = (innerWidth - layout.gutter * (layout.columns - 1)) / layout.columns;

  const columnX = (start: number) => layout.marginX + (columnWidth + layout.gutter) * start;
  const columnSpanWidth = (span: number) => columnWidth * span + layout.gutter * (span - 1);

  return { innerWidth, columnWidth, columnX, columnSpanWidth };
}

function createGradientLayers(
  dimensions: ShapeDimensions,
  palette: PaletteSet,
  shape: DesignDocShape,
  rng: SeededRandom
): DesignLayer[] {
  const bandCount = shape === "tall" ? 24 : 18;
  const bands: DesignLayer[] = [];
  const step = dimensions.height / bandCount;
  const target = luminance(palette.background) < 0.4 ? lightenHex(palette.accent, 0.4) : darkenHex(palette.accent, 0.32);

  for (let index = 0; index < bandCount; index += 1) {
    const t = bandCount <= 1 ? 0 : index / (bandCount - 1);
    const edgeFactor = Math.abs(0.5 - t) * 2;
    const blend = 0.012 + edgeFactor * 0.05 + rng.float(0, 0.01);
    const color = mixHex(palette.background, target, blend);

    bands.push({
      type: "shape",
      x: 0,
      y: index * step,
      w: dimensions.width,
      h: step + 1,
      shape: "rect",
      fill: color,
      stroke: color,
      strokeWidth: 0
    });
  }

  return bands;
}

function createGridLayers(
  layout: ShapeLayout,
  dimensions: ShapeDimensions,
  palette: PaletteSet,
  rng: SeededRandom
): DesignLayer[] {
  const { columnX, columnSpanWidth } = columnMetrics(layout, dimensions.width);
  const safeHeight = dimensions.height - layout.marginY * 2;
  const safeWidth = columnSpanWidth(layout.columns);
  const layers: DesignLayer[] = [];

  layers.push({
    type: "shape",
    x: layout.marginX,
    y: layout.marginY,
    w: safeWidth,
    h: safeHeight,
    shape: "rect",
    fill: palette.panel,
    stroke: palette.grid,
    strokeWidth: 1
  });

  for (let col = 1; col < layout.columns; col += 1) {
    if (layout.columns >= 10 && col % 2 !== 0) {
      continue;
    }

    const x = columnX(col) - layout.gutter / 2;
    layers.push({
      type: "shape",
      x,
      y: layout.marginY,
      w: 1,
      h: safeHeight,
      shape: "rect",
      fill: palette.grid,
      stroke: palette.grid,
      strokeWidth: 0
    });
  }

  const horizontalLines = layout.columns >= 10 ? 8 : 6;
  for (let row = 1; row < horizontalLines; row += 1) {
    const y =
      layout.marginY +
      (safeHeight / horizontalLines) * row +
      rng.float(-1.2, 1.2);
    layers.push({
      type: "shape",
      x: layout.marginX,
      y,
      w: safeWidth,
      h: 1,
      shape: "rect",
      fill: mixHex(palette.grid, palette.panel, 0.26),
      stroke: mixHex(palette.grid, palette.panel, 0.26),
      strokeWidth: 0
    });
  }

  return layers;
}

function buildShapeDoc(
  shape: DesignDocShape,
  context: Parameters<PresetGenerator>[0],
  palette: PaletteSet
): DesignDoc {
  const dimensions = SHAPE_DIMENSIONS[shape];
  const shapeSeed = (context.seed ^ (shape === "square" ? 173 : shape === "wide" ? 947 : 1489)) >>> 0;
  const rng = createSeededRandom(shapeSeed);
  const layout = getShapeLayout(shape, dimensions, rng);
  const { columnX, columnSpanWidth } = columnMetrics(layout, dimensions.width);

  const titleX = columnX(layout.titleStartCol);
  const titleW = columnSpanWidth(layout.titleSpanCols);
  const titleFit = fitTitleText({
    title: context.title,
    width: titleW,
    maxHeight: layout.titleHeight,
    minSize: shape === "wide" ? 66 : shape === "square" ? 54 : 64,
    maxSize: shape === "wide" ? 140 : shape === "square" ? 112 : 126
  });

  const subtitleFontSize = clamp(Math.round(titleFit.fontSize * 0.3), 26, shape === "wide" ? 40 : 38);
  const scriptureFontSize = clamp(Math.round(subtitleFontSize * 0.86), 20, 32);
  const descriptionFontSize = clamp(Math.round(scriptureFontSize * 0.84), 17, 26);

  const mainX = columnX(layout.mainStartCol);
  const mainW = columnSpanWidth(layout.mainSpanCols);
  const safeBottom = dimensions.height - layout.marginY;
  const titleBlockHeight = titleFit.lineCount * titleFit.lineHeight;
  const titleY = layout.titleTop;
  const metaStartY = titleY + titleBlockHeight + (shape === "tall" ? 72 : 54);

  const subtitleText = clampWrappedCopy(context.subtitle, Math.max(18, Math.floor(mainW / (subtitleFontSize * 0.56))), 2);
  const scriptureText = clampWrappedCopy(context.scripture, Math.max(18, Math.floor(mainW / (scriptureFontSize * 0.56))), shape === "tall" ? 3 : 2);
  const descriptionText = clampWrappedCopy(context.description, Math.max(16, Math.floor(mainW / (descriptionFontSize * 0.54))), shape === "tall" ? 4 : 3);

  const layers: DesignLayer[] = [
    ...createGradientLayers(dimensions, palette, shape, rng),
    ...createGridLayers(layout, dimensions, palette, rng),
    ...createNoiseLayers({
      rng,
      count: shape === "wide" ? 52 : shape === "tall" ? 46 : 42,
      colorA: mixHex(palette.background, palette.textPrimary, 0.08),
      colorB: mixHex(palette.background, palette.accent, 0.08),
      minSize: 1,
      maxSize: shape === "wide" ? 2.4 : 2.1,
      area: {
        x: layout.marginX + 8,
        y: layout.marginY + 8,
        w: dimensions.width - layout.marginX * 2 - 16,
        h: dimensions.height - layout.marginY * 2 - 16
      }
    }),
    {
      type: "shape",
      x: layout.marginX + 28,
      y: layout.marginY + 46 + rng.float(-2, 2),
      w: shape === "wide" ? 560 : 290,
      h: 2,
      shape: "rect",
      fill: palette.accent,
      stroke: palette.accent,
      strokeWidth: 0
    },
    {
      type: "text",
      x: titleX,
      y: titleY,
      w: titleW,
      h: layout.titleHeight,
      text: titleFit.text,
      fontSize: titleFit.fontSize,
      fontFamily: "Arial",
      fontWeight: 800,
      color: palette.textPrimary,
      align: "left"
    }
  ];

  let currentY = metaStartY;

  if (subtitleText) {
    const subtitleLines = subtitleText.split("\n").length;
    layers.push({
      type: "text",
      x: mainX,
      y: currentY,
      w: mainW,
      h: subtitleLines * subtitleFontSize * 1.25 + 8,
      text: subtitleText,
      fontSize: subtitleFontSize,
      fontFamily: "Arial",
      fontWeight: 600,
      color: palette.textSecondary,
      align: "left"
    });
    currentY += subtitleLines * subtitleFontSize * 1.26 + 20;
  }

  if (scriptureText) {
    const scriptureLines = scriptureText.split("\n").length;
    layers.push({
      type: "text",
      x: mainX,
      y: currentY,
      w: mainW,
      h: scriptureLines * scriptureFontSize * 1.25 + 6,
      text: scriptureText,
      fontSize: scriptureFontSize,
      fontFamily: "Georgia",
      fontWeight: 500,
      color: palette.textSecondary,
      align: "left"
    });
    currentY += scriptureLines * scriptureFontSize * 1.24 + 24;
  }

  if (layout.showSideDescription && descriptionText) {
    const sideX = columnX(layout.sideStartCol);
    const sideW = columnSpanWidth(layout.sideSpanCols);
    layers.push(
      {
        type: "shape",
        x: sideX - 14,
        y: layout.marginY + 126,
        w: 2,
        h: dimensions.height - layout.marginY * 2 - 210,
        shape: "rect",
        fill: mixHex(palette.accent, palette.panel, 0.34),
        stroke: mixHex(palette.accent, palette.panel, 0.34),
        strokeWidth: 0
      },
      {
        type: "text",
        x: sideX + 18,
        y: layout.marginY + 174,
        w: sideW - 24,
        h: dimensions.height - layout.marginY * 2 - 230,
        text: descriptionText,
        fontSize: descriptionFontSize,
        fontFamily: "Arial",
        fontWeight: 500,
        color: palette.textMuted,
        align: "left"
      }
    );
  } else if (descriptionText && currentY < safeBottom - 70) {
    const descriptionLines = descriptionText.split("\n").length;
    layers.push({
      type: "text",
      x: mainX,
      y: Math.min(currentY, safeBottom - descriptionLines * descriptionFontSize * 1.24 - 20),
      w: mainW,
      h: descriptionLines * descriptionFontSize * 1.24 + 8,
      text: descriptionText,
      fontSize: descriptionFontSize,
      fontFamily: "Arial",
      fontWeight: 500,
      color: palette.textMuted,
      align: "left"
    });
  }

  const cornerSize = shape === "tall" ? 34 : 28;
  const cornerX = dimensions.width - layout.marginX - cornerSize - 2;
  const cornerY = layout.marginY + 20;
  layers.push(
    {
      type: "shape",
      x: cornerX,
      y: cornerY,
      w: cornerSize,
      h: 2,
      shape: "rect",
      fill: mixHex(palette.accent, palette.textPrimary, 0.34),
      stroke: mixHex(palette.accent, palette.textPrimary, 0.34),
      strokeWidth: 0
    },
    {
      type: "shape",
      x: cornerX + cornerSize - 2,
      y: cornerY,
      w: 2,
      h: cornerSize,
      shape: "rect",
      fill: mixHex(palette.accent, palette.textPrimary, 0.34),
      stroke: mixHex(palette.accent, palette.textPrimary, 0.34),
      strokeWidth: 0
    }
  );

  if (context.logoSrc) {
    layers.push({
      type: "image",
      x: dimensions.width - layout.marginX - 176,
      y: dimensions.height - layout.marginY - 84,
      w: 176,
      h: 74,
      src: context.logoSrc
    });
  }

  return {
    width: dimensions.width,
    height: dimensions.height,
    background: {
      color: palette.background
    },
    layers
  };
}

export const generateTypeCleanMinV1: PresetGenerator = (context) => {
  const dominantBackground = getPaletteColor(context, 0, "#0F172A");
  const accentSource = getPaletteColor(context, 3, getPaletteColor(context, 1, "#2563EB"));
  const palette = buildPaletteSet(dominantBackground, accentSource);

  const designDocByShape: DesignDocByShape = {
    square: buildShapeDoc("square", context, palette),
    wide: buildShapeDoc("wide", context, palette),
    tall: buildShapeDoc("tall", context, palette)
  };

  return {
    designDoc: designDocByShape.wide,
    designDocByShape,
    notes:
      "Clean minimal template with seeded grid rhythm, safe-margin hierarchy, and shape-specific title fitting."
  };
};
