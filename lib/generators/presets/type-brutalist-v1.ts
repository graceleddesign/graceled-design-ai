import { generateTypePreset } from "@/lib/generators/presets/simple-builders";
import type { PresetGenerator } from "@/lib/generators/presets/shared";

export const generateTypeBrutalistV1: PresetGenerator = (context) => generateTypePreset(context, "brutalist");
