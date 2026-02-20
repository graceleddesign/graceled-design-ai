import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type TypographyDirectionValue = "match_site" | "graceled_defaults";

export type BrandKitSnapshot = {
  websiteUrl: string;
  logoPath: string | null;
  paletteJson: string;
  typographyDirection: TypographyDirectionValue;
};

export type EffectiveBrandKit = BrandKitSnapshot & {
  source: "organization" | "project" | "project_fallback";
};

type ResolveEffectiveBrandKitParams = {
  organizationId: string;
  projectId?: string;
  projectBrandKit?: BrandKitSnapshot | null;
};

type LatestProjectBrandKit = BrandKitSnapshot & {
  projectId: string;
  projectTitle: string;
};

let hasWarnedMissingOrganizationBrandKitTable = false;

export function parsePaletteJson(raw: string | null | undefined): string[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    return [];
  }
}

async function findProjectBrandKitByProjectId(organizationId: string, projectId: string): Promise<BrandKitSnapshot | null> {
  return prisma.brandKit.findFirst({
    where: {
      organizationId,
      projectId
    },
    select: {
      websiteUrl: true,
      logoPath: true,
      paletteJson: true,
      typographyDirection: true
    }
  });
}

export async function findLatestProjectBrandKit(organizationId: string): Promise<LatestProjectBrandKit | null> {
  const record = await prisma.brandKit.findFirst({
    where: {
      organizationId
    },
    orderBy: {
      updatedAt: "desc"
    },
    select: {
      projectId: true,
      websiteUrl: true,
      logoPath: true,
      paletteJson: true,
      typographyDirection: true,
      project: {
        select: {
          series_title: true
        }
      }
    }
  });

  if (!record) {
    return null;
  }

  return {
    projectId: record.projectId,
    projectTitle: record.project.series_title,
    websiteUrl: record.websiteUrl,
    logoPath: record.logoPath,
    paletteJson: record.paletteJson,
    typographyDirection: record.typographyDirection
  };
}

export async function resolveEffectiveBrandKit(params: ResolveEffectiveBrandKitParams): Promise<EffectiveBrandKit | null> {
  let organizationBrandKit: BrandKitSnapshot | null = null;

  try {
    organizationBrandKit = await prisma.organizationBrandKit.findUnique({
      where: {
        organizationId: params.organizationId
      },
      select: {
        websiteUrl: true,
        logoPath: true,
        paletteJson: true,
        typographyDirection: true
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021") {
      if (!hasWarnedMissingOrganizationBrandKitTable) {
        console.warn(
          "[brand-kit] OrganizationBrandKit table is missing. Run Prisma migrations to enable organization brand kits."
        );
        hasWarnedMissingOrganizationBrandKitTable = true;
      }
    } else {
      throw error;
    }
  }

  if (organizationBrandKit) {
    return {
      ...organizationBrandKit,
      source: "organization"
    };
  }

  const projectBrandKit =
    params.projectBrandKit ||
    (params.projectId ? await findProjectBrandKitByProjectId(params.organizationId, params.projectId) : null);

  if (projectBrandKit) {
    return {
      ...projectBrandKit,
      source: "project"
    };
  }

  const fallbackBrandKit = await findLatestProjectBrandKit(params.organizationId);
  if (fallbackBrandKit) {
    return {
      websiteUrl: fallbackBrandKit.websiteUrl,
      logoPath: fallbackBrandKit.logoPath,
      paletteJson: fallbackBrandKit.paletteJson,
      typographyDirection: fallbackBrandKit.typographyDirection,
      source: "project_fallback"
    };
  }

  return null;
}
