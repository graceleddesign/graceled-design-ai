import { generatePhotoPreset } from "@/lib/generators/presets/simple-builders";
import type { PresetGenerator } from "@/lib/generators/presets/shared";

export const generatePhotoVeilCinematicV1: PresetGenerator = (context) => generatePhotoPreset(context, "veil");
