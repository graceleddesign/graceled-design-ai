import { generateAbstractPreset } from "@/lib/generators/presets/simple-builders";
import type { PresetGenerator } from "@/lib/generators/presets/shared";

export const generateAbstractGradientModernV1: PresetGenerator = (context) => generateAbstractPreset(context, "gradient");
