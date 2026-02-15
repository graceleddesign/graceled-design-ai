import { generateTexturePreset } from "@/lib/generators/presets/simple-builders";
import type { PresetGenerator } from "@/lib/generators/presets/shared";

export const generateIllusEngravedV1: PresetGenerator = (context) => generateTexturePreset(context, "engraved");
