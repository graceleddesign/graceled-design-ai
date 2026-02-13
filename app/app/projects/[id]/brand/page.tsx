import Link from "next/link";
import { notFound } from "next/navigation";
import { BrandKitForm } from "@/components/brand-kit-form";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function parsePalette(paletteJson: string | null): string[] {
  if (!paletteJson) {
    return [];
  }

  try {
    const parsed = JSON.parse(paletteJson);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((color): color is string => typeof color === "string");
  } catch {
    return [];
  }
}

export default async function ProjectBrandKitPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  const project = await prisma.project.findFirst({
    where: {
      id,
      organizationId: session.organizationId
    },
    include: {
      brandKit: true
    }
  });

  if (!project) {
    notFound();
  }

  return (
    <section className="mx-auto max-w-2xl space-y-4">
      <Link href={`/app/projects/${project.id}`} className="text-sm text-slate-600">
        Back to project
      </Link>

      <BrandKitForm
        projectId={project.id}
        projectTitle={project.series_title}
        initialWebsiteUrl={project.brandKit?.websiteUrl}
        initialLogoPath={project.brandKit?.logoPath}
        initialPalette={parsePalette(project.brandKit?.paletteJson || null)}
        initialTypographyDirection={project.brandKit?.typographyDirection || "match_site"}
      />
    </section>
  );
}
