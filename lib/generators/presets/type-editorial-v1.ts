import { generateTypePreset } from "@/lib/generators/presets/simple-builders";
import type { PresetGenerator } from "@/lib/generators/presets/shared";

export const generateTypeEditorialV1: PresetGenerator = (context) => generateTypePreset(context, "editorial");
