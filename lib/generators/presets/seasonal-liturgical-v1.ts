import { generateSeasonalPreset } from "@/lib/generators/presets/simple-builders";
import type { PresetGenerator } from "@/lib/generators/presets/shared";

export const generateSeasonalLiturgicalV1: PresetGenerator = (context) => generateSeasonalPreset(context);
