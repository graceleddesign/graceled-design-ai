import type { DesignDoc } from "@/lib/design-doc";
import { generateAbstractFlowFieldV1 } from "@/lib/generators/presets/abstract-flow-field-v1";
import { generateAbstractGradientModernV1 } from "@/lib/generators/presets/abstract-gradient-modern-v1";
import { generateGeoShapesNegativeV1 } from "@/lib/generators/presets/geo-shapes-negative-v1";
import { generateIllusEngravedV1 } from "@/lib/generators/presets/illus-engraved-v1";
import { generateIllusFlatMinV1 } from "@/lib/generators/presets/illus-flat-min-v1";
import { generateMarkIconAbstractV1 } from "@/lib/generators/presets/mark-icon-abstract-v1";
import { generatePhotoColorBlockV1 } from "@/lib/generators/presets/photo-color-block-v1";
import { generatePhotoLandscapeMinV1 } from "@/lib/generators/presets/photo-landscape-min-v1";
import { generatePhotoMonoAccentV1 } from "@/lib/generators/presets/photo-mono-accent-v1";
import { generatePhotoVeilCinematicV1 } from "@/lib/generators/presets/photo-veil-cinematic-v1";
import { generatePhotoWarmFilmV1 } from "@/lib/generators/presets/photo-warm-film-v1";
import { generateSeasonalLiturgicalV1 } from "@/lib/generators/presets/seasonal-liturgical-v1";
import {
  createPresetContext,
  createTitleLayer,
  createSubtitleLayer,
  getPaletteColor,
  createBaseDoc,
  type DesignDocByShape,
  type GenerateDesignDocForPresetParams,
  type PresetGenerator,
  type PresetKey
} from "@/lib/generators/presets/shared";
import { generateTexturePrintRisoV1 } from "@/lib/generators/presets/texture-print-riso-v1";
import { generateTextureStoneModernV1 } from "@/lib/generators/presets/texture-stone-modern-v1";
import { generateTypeBrutalistV1 } from "@/lib/generators/presets/type-brutalist-v1";
import { generateTypeBwHighContrastV1 } from "@/lib/generators/presets/type-bw-high-contrast-v1";
import { generateTypeCleanMinV1 } from "@/lib/generators/presets/type-clean-min-v1";
import { generateTypeEditorialV1 } from "@/lib/generators/presets/type-editorial-v1";
import { generateTypeSwissGridV1 } from "@/lib/generators/presets/type-swiss-grid-v1";
import { generateTypeTextSystemV1 } from "@/lib/generators/presets/type-text-system-v1";

const PRESET_GENERATORS: Record<PresetKey, PresetGenerator> = {
  mark_icon_abstract_v1: generateMarkIconAbstractV1,
  geo_shapes_negative_v1: generateGeoShapesNegativeV1,
  abstract_flow_field_v1: generateAbstractFlowFieldV1,
  abstract_gradient_modern_v1: generateAbstractGradientModernV1,
  texture_print_riso_v1: generateTexturePrintRisoV1,
  texture_stone_modern_v1: generateTextureStoneModernV1,
  type_bw_high_contrast_v1: generateTypeBwHighContrastV1,
  type_brutalist_v1: generateTypeBrutalistV1,
  type_clean_min_v1: generateTypeCleanMinV1,
  type_editorial_v1: generateTypeEditorialV1,
  type_swiss_grid_v1: generateTypeSwissGridV1,
  type_text_system_v1: generateTypeTextSystemV1,
  illus_engraved_v1: generateIllusEngravedV1,
  illus_flat_min_v1: generateIllusFlatMinV1,
  photo_veil_cinematic_v1: generatePhotoVeilCinematicV1,
  photo_landscape_min_v1: generatePhotoLandscapeMinV1,
  photo_mono_accent_v1: generatePhotoMonoAccentV1,
  photo_color_block_v1: generatePhotoColorBlockV1,
  photo_warm_film_v1: generatePhotoWarmFilmV1,
  seasonal_liturgical_v1: generateSeasonalLiturgicalV1
};

type GenerateDesignDocForPresetInput = Omit<GenerateDesignDocForPresetParams, "presetKey"> & {
  presetKey: string;
};

type GeneratedPresetOutput = {
  designDoc: DesignDoc;
  designDocByShape?: DesignDocByShape;
  notes: string;
  preview?: {
    square_main?: string;
    widescreen_main?: string;
    vertical_main?: string;
  };
};

function isPresetKey(value: string): value is PresetKey {
  return Object.prototype.hasOwnProperty.call(PRESET_GENERATORS, value);
}

function buildUnknownPresetFallback(params: GenerateDesignDocForPresetInput): GeneratedPresetOutput {
  const context = createPresetContext({
    ...params,
    presetKey: "type_clean_min_v1"
  });

  return {
    designDoc: createBaseDoc("#F8FAFC", [
      {
        type: "shape",
        x: 120,
        y: 120,
        w: 1680,
        h: 840,
        shape: "rect",
        fill: "#FFFFFF",
        stroke: "#CBD5E1",
        strokeWidth: 2
      },
      createTitleLayer({
        x: 180,
        y: 250,
        w: 1400,
        h: 260,
        text: context.title,
        color: getPaletteColor(context, 0, "#0F172A"),
        fontSize: 102,
        fontWeight: 700,
        fontFamily: "Arial"
      }),
      createSubtitleLayer({
        x: 186,
        y: 580,
        w: 1320,
        h: 220,
        text: `${context.subtitle}${context.scripture ? `\n${context.scripture}` : ""}`,
        color: "#334155",
        fontSize: 34,
        fontWeight: 500,
        fontFamily: "Arial"
      })
    ]),
    notes: `Fallback generator used for unknown preset key: ${params.presetKey}`
  };
}

export function generatePresetOutputForPreset(params: GenerateDesignDocForPresetInput): GeneratedPresetOutput {
  if (!isPresetKey(params.presetKey)) {
    return buildUnknownPresetFallback(params);
  }

  const context = createPresetContext({
    ...params,
    presetKey: params.presetKey
  });

  const output = PRESET_GENERATORS[params.presetKey](context);
  return output;
}

export function generateDesignDocForPreset(params: GenerateDesignDocForPresetInput): DesignDoc {
  return generatePresetOutputForPreset(params).designDoc;
}
