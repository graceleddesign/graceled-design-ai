import { generateTypePreset } from "@/lib/generators/presets/simple-builders";
import type { PresetGenerator } from "@/lib/generators/presets/shared";

export const generateTypeBwHighContrastV1: PresetGenerator = (context) => generateTypePreset(context, "bw");
