import Link from "next/link";
import { notFound } from "next/navigation";
import { GenerationFeedbackForm } from "@/components/generation-feedback-form";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function toRound(rawRound: string | undefined): number {
  if (!rawRound) {
    return 1;
  }

  const parsed = Number.parseInt(rawRound, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export default async function GenerationFeedbackPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ round?: string; generationId?: string }>;
}) {
  // Placeholder route protection for generation flow.
  const session = await requireSession();
  const { id } = await params;
  const { round: rawRound, generationId } = await searchParams;

  const project = await prisma.project.findFirst({
    where: {
      id,
      organizationId: session.organizationId
    },
    select: {
      id: true,
      series_title: true
    }
  });

  if (!project) {
    notFound();
  }

  const round = toRound(rawRound);
  const chosenGeneration = generationId
    ? await prisma.generation.findFirst({
        where: {
          id: generationId,
          projectId: project.id
        },
        select: {
          id: true,
          preset: {
            select: {
              name: true,
              subtitle: true
            }
          }
        }
      })
    : null;

  return (
    <section className="mx-auto max-w-3xl space-y-4">
      <Link href={`/app/projects/${project.id}/generations`} className="text-sm text-slate-600">
        Back to generations
      </Link>

      <GenerationFeedbackForm
        projectId={project.id}
        currentRound={round}
        chosenGenerationId={chosenGeneration?.id}
        chosenDirectionLabel={
          chosenGeneration ? `${chosenGeneration.preset?.name || "Direction"}${chosenGeneration.preset?.subtitle ? ` - ${chosenGeneration.preset.subtitle}` : ""}` : undefined
        }
      />
    </section>
  );
}
