import { readFile } from "fs/promises";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type PresetSeed = {
  key: string;
  ui?: {
    name?: string;
    subtitle?: string;
    collection?: string;
    tags?: string[];
  };
  enabled?: boolean;
  version?: number;
  [key: string]: unknown;
};

type SeedFile = {
  presets: PresetSeed[];
};

async function main() {
  const seedPath = path.join(process.cwd(), "seed", "presets.seed.json");
  const raw = await readFile(seedPath, "utf8");
  const seedData: SeedFile = JSON.parse(raw);

  if (!Array.isArray(seedData.presets)) {
    throw new Error("Invalid seed file format: presets array missing.");
  }

  for (const preset of seedData.presets) {
    await prisma.preset.upsert({
      where: { key: preset.key },
      update: {
        name: preset.ui?.name || preset.key,
        subtitle: preset.ui?.subtitle || null,
        collection: preset.ui?.collection || null,
        tags: preset.ui?.tags || [],
        enabled: preset.enabled ?? true,
        version: preset.version ?? 1,
        config: preset as unknown as object
      },
      create: {
        key: preset.key,
        name: preset.ui?.name || preset.key,
        subtitle: preset.ui?.subtitle || null,
        collection: preset.ui?.collection || null,
        tags: preset.ui?.tags || [],
        enabled: preset.enabled ?? true,
        version: preset.version ?? 1,
        config: preset as unknown as object
      }
    });
  }

  console.log(`Seeded ${seedData.presets.length} presets.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
