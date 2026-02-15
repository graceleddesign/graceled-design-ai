import { generateTexturePreset } from "@/lib/generators/presets/simple-builders";
import type { PresetGenerator } from "@/lib/generators/presets/shared";

export const generateTextureStoneModernV1: PresetGenerator = (context) => generateTexturePreset(context, "stone");
