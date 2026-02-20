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
  mixHex,
  type PresetGenerator
} from "@/lib/generators/presets/shared";

export const generateTypeSwissGridV1: PresetGenerator = (context) => {
  const base = "#F8FAFC";
  const ink = darkenHex(getPaletteColor(context, 0, "#0F172A"), 0.22);
  const accent = getPaletteColor(context, 3, "#2563EB");
  const warmAccent = getPaletteColor(context, 4, "#F59E0B");

  const columns = 12;
  const gutter = 18;
  const margins = {
    left: 86 + context.rng.int(-18, 18),
    top: 76 + context.rng.int(-14, 14),
    right: 90,
    bottom: 86
  };

  const usableWidth = CANVAS_WIDTH - margins.left - margins.right;
  const columnWidth = (usableWidth - gutter * (columns - 1)) / columns;
  const rowHeight = 66 + context.rng.int(-4, 6);

  const layers: DesignLayer[] = [];
  for (let col = 0; col <= columns; col += 1) {
    const x = margins.left + col * (columnWidth + gutter) - gutter / 2;
    const gridColor = mixHex("#CBD5E1", ink, 0.2);
    layers.push({
      type: "shape",
      x,
      y: margins.top,
      w: 1,
      h: CANVAS_HEIGHT - margins.top - margins.bottom,
      shape: "rect",
      fill: gridColor,
      stroke: gridColor,
      strokeWidth: 0
    });
  }

  for (let row = 0; row <= 12; row += 1) {
    const y = margins.top + row * rowHeight;
    const gridColor = mixHex("#CBD5E1", ink, 0.22);
    layers.push({
      type: "shape",
      x: margins.left,
      y,
      w: usableWidth,
      h: 1,
      shape: "rect",
      fill: gridColor,
      stroke: gridColor,
      strokeWidth: 0
    });
  }

  const moduleOffset = context.rng.int(0, 2);
  const titleX = margins.left + (columnWidth + gutter) * (1 + moduleOffset);
  const titleW = (columnWidth + gutter) * (8 - moduleOffset) - gutter;

  layers.push(
    {
      type: "shape",
      x: margins.left,
      y: margins.top,
      w: (columnWidth + gutter) * 2 - gutter,
      h: rowHeight * 2.4,
      shape: "rect",
      fill: accent,
      stroke: accent,
      strokeWidth: 0
    },
    {
      type: "shape",
      x: margins.left + (columnWidth + gutter) * 9,
      y: margins.top + rowHeight * 8,
      w: (columnWidth + gutter) * 3 - gutter,
      h: rowHeight * 3,
      shape: "rect",
      fill: warmAccent,
      stroke: warmAccent,
      strokeWidth: 0
    },
    createTitleLayer({
      x: titleX,
      y: margins.top + rowHeight * 1.5,
      w: titleW,
      h: rowHeight * 5,
      text: context.title,
      color: ink,
      fontFamily: "Arial",
      fontWeight: 800,
      fontSize: 112 + context.rng.int(-10, 10)
    }),
    createSubtitleLayer({
      x: titleX,
      y: margins.top + rowHeight * 8,
      w: titleW,
      h: rowHeight * 2.8,
      text: `${context.subtitle}${context.scripture ? `\n${context.scripture}` : ""}`,
      color: mixHex(ink, accent, 0.32),
      fontFamily: "Arial",
      fontWeight: 600,
      fontSize: 32
    }),
    ...createLogoLayers(context, CANVAS_WIDTH - 280, CANVAS_HEIGHT - 146, 190, 84)
  );

  return {
    designDoc: createBaseDoc(base, layers),
    notes: "Swiss grid poster system with seeded grid offsets and typographic rhythm changes."
  };
};
