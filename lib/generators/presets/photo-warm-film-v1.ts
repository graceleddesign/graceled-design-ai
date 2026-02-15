import { generatePhotoPreset } from "@/lib/generators/presets/simple-builders";
import type { PresetGenerator } from "@/lib/generators/presets/shared";

export const generatePhotoWarmFilmV1: PresetGenerator = (context) => generatePhotoPreset(context, "warm");
