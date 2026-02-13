import Link from "next/link";
import { notFound } from "next/navigation";
import { approveFinalDesignAction } from "@/app/app/projects/actions";
import { GenerationPreviewPane } from "@/components/generation-preview-pane";
import { requireSession } from "@/lib/auth";
import { optionLabel } from "@/lib/option-label";
import { prisma } from "@/lib/prisma";

type PreviewFields = {
  square_main: string;
  widescreen_main: string;
  vertical_main: string;
};

const OPTION_TINTS = [
  "from-emerald-200 to-emerald-50",
  "from-amber-200 to-amber-50",
  "from-sky-200 to-sky-50",
  "from-rose-200 to-rose-50",
  "from-violet-200 to-violet-50",
  "from-slate-300 to-slate-100"
];

function readPreview(output: unknown): PreviewFields {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return {
      square_main: "",
      widescreen_main: "",
      vertical_main: ""
    };
  }

  const preview = (output as { preview?: unknown }).preview;
  if (!preview || typeof preview !== "object" || Array.isArray(preview)) {
    return {
      square_main: "",
      widescreen_main: "",
      vertical_main: ""
    };
  }

  return {
    square_main: typeof (preview as { square_main?: unknown }).square_main === "string" ? (preview as { square_main: string }).square_main : "",
    widescreen_main:
      typeof (preview as { widescreen_main?: unknown }).widescreen_main === "string"
        ? (preview as { widescreen_main: string }).widescreen_main
        : "",
    vertical_main:
      typeof (preview as { vertical_main?: unknown }).vertical_main === "string" ? (preview as { vertical_main: string }).vertical_main : ""
  };
}

type PreviewSlot = "square" | "widescreen" | "vertical";

function getGenerationPreviewUrl(projectId: string, generationId: string, slot: PreviewSlot): string {
  return `/api/projects/${projectId}/generations/${generationId}/preview/png?slot=${slot}`;
}

function DeliverableDownloadLink({
  href,
  label,
  disabled
}: {
  href: string;
  label: string;
  disabled: boolean;
}) {
  if (disabled) {
    return (
      <span className="inline-flex cursor-not-allowed rounded-md border border-slate-200 bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-400">
        {label}
      </span>
    );
  }

  return (
    <a href={href} className="inline-flex rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
      {label}
    </a>
  );
}

export default async function ProjectGenerationsPage({ params }: { params: Promise<{ id: string }> }) {
  // Placeholder route protection for generation flow.
  const session = await requireSession();
  const { id } = await params;

  const project = await prisma.project.findFirst({
    where: {
      id,
      organizationId: session.organizationId
    },
    select: {
      id: true,
      series_title: true,
      finalDesign: {
        select: {
          id: true,
          generationId: true,
          round: true,
          optionKey: true,
          optionLabel: true,
          updatedAt: true
        }
      }
    }
  });

  if (!project) {
    notFound();
  }

  const generations = await prisma.generation.findMany({
    where: {
      projectId: project.id
    },
    select: {
      id: true,
      round: true,
      output: true,
      createdAt: true,
      preset: {
        select: {
          name: true,
          subtitle: true,
          key: true
        }
      }
    },
    orderBy: [{ round: "desc" }, { createdAt: "asc" }]
  });

  const rounds = new Map<number, typeof generations>();
  for (const generation of generations) {
    const existing = rounds.get(generation.round) || [];
    existing.push(generation);
    rounds.set(generation.round, existing);
  }

  const roundEntries = Array.from(rounds.entries()).map(([round, roundGenerations]) => [
    round,
    [...roundGenerations].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  ] as const);

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">Project Generations</p>
          <h1 className="text-2xl font-semibold">{project.series_title}</h1>
        </div>
        <Link href={`/app/projects/${project.id}`} className="text-sm text-slate-600">
          Back to project
        </Link>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Final Deliverables</h2>
            {project.finalDesign ? (
              <p className="text-sm text-slate-600">
                Approved: {project.finalDesign.optionLabel} from round {project.finalDesign.round} (updated{" "}
                {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(project.finalDesign.updatedAt)})
              </p>
            ) : (
              <p className="text-sm text-slate-600">No final design approved yet.</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <DeliverableDownloadLink href={`/api/projects/${project.id}/final/pptx`} label="Download PPTX" disabled={!project.finalDesign} />
            <DeliverableDownloadLink href={`/api/projects/${project.id}/final/svg`} label="Download SVG" disabled={!project.finalDesign} />
            <DeliverableDownloadLink href={`/api/projects/${project.id}/final/bundle`} label="Download ZIP" disabled={!project.finalDesign} />
          </div>
        </div>
      </div>

      {roundEntries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-slate-600">No generations yet. Start Round 1 from the project overview page.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {roundEntries.map(([round, roundGenerations], roundIndex) => (
            <div key={round} className="space-y-3">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold">Round {round}</h2>
                {roundIndex === 0 ? (
                  <span className="rounded-full bg-pine/10 px-2 py-0.5 text-xs font-medium text-pine">Latest</span>
                ) : null}
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {roundGenerations.map((generation, optionIndex) => {
                  const optionKey = String.fromCharCode(65 + optionIndex);
                  const label = optionLabel(optionIndex);
                  const tintClass = OPTION_TINTS[optionIndex % OPTION_TINTS.length];
                  const preview = readPreview(generation.output);
                  const isApprovedFinal =
                    project.finalDesign?.generationId === generation.id ||
                    (project.finalDesign?.round === round && project.finalDesign.optionKey === optionKey);

                  return (
                    <article key={generation.id} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                          {isApprovedFinal ? (
                            <span className="rounded-full bg-pine/10 px-2 py-0.5 text-xs font-medium text-pine">Final</span>
                          ) : null}
                        </div>
                        <h3 className="text-base font-semibold text-slate-900">{generation.preset?.name || "Custom direction"}</h3>
                        <p className="text-sm text-slate-600">{generation.preset?.subtitle || generation.preset?.key || "Preset unavailable"}</p>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <GenerationPreviewPane
                          label="Square"
                          placeholderAsset={preview.square_main}
                          imageUrl={getGenerationPreviewUrl(project.id, generation.id, "square")}
                          aspectClass="aspect-square"
                          tintClass={tintClass}
                        />
                        <GenerationPreviewPane
                          label="Widescreen"
                          placeholderAsset={preview.widescreen_main}
                          imageUrl={getGenerationPreviewUrl(project.id, generation.id, "widescreen")}
                          aspectClass="aspect-[16/9]"
                          tintClass={tintClass}
                        />
                        <GenerationPreviewPane
                          label="Vertical"
                          placeholderAsset={preview.vertical_main}
                          imageUrl={getGenerationPreviewUrl(project.id, generation.id, "vertical")}
                          aspectClass="aspect-[9/16]"
                          tintClass={tintClass}
                        />
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/app/projects/${project.id}/feedback?round=${round}&generationId=${generation.id}`}
                          className="inline-flex rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700"
                        >
                          Choose this direction
                        </Link>
                        <form action={approveFinalDesignAction.bind(null, project.id, generation.id, optionKey)}>
                          <button
                            type="submit"
                            className="inline-flex rounded-md bg-pine px-3 py-1.5 text-sm font-medium text-white hover:bg-pine/90"
                          >
                            Approve as Final
                          </button>
                        </form>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
