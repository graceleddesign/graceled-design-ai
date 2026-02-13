import Link from "next/link";
import { notFound } from "next/navigation";
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

function PlaceholderPane({
  label,
  asset,
  aspectClass,
  tintClass
}: {
  label: string;
  asset: string;
  aspectClass: string;
  tintClass: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-md border border-slate-200 bg-gradient-to-br ${tintClass} ${aspectClass}`}>
      <span className="absolute left-2 top-2 rounded bg-white/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
        {label}
      </span>
      <span className="absolute bottom-2 right-2 max-w-[85%] truncate text-[10px] text-slate-600">{asset || "stub"}</span>
    </div>
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
      series_title: true
    }
  });

  if (!project) {
    notFound();
  }

  const generations = await prisma.generation.findMany({
    where: {
      projectId: project.id
    },
    include: {
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
                  const label = optionLabel(optionIndex);
                  const tintClass = OPTION_TINTS[optionIndex % OPTION_TINTS.length];
                  const preview = readPreview(generation.output);

                  return (
                    <article key={generation.id} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                        <h3 className="text-base font-semibold text-slate-900">{generation.preset?.name || "Custom direction"}</h3>
                        <p className="text-sm text-slate-600">{generation.preset?.subtitle || generation.preset?.key || "Preset unavailable"}</p>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <PlaceholderPane label="Square" asset={preview.square_main} aspectClass="aspect-square" tintClass={tintClass} />
                        <PlaceholderPane
                          label="Widescreen"
                          asset={preview.widescreen_main}
                          aspectClass="aspect-[16/9]"
                          tintClass={tintClass}
                        />
                        <PlaceholderPane label="Vertical" asset={preview.vertical_main} aspectClass="aspect-[9/16]" tintClass={tintClass} />
                      </div>

                      <Link
                        href={`/app/projects/${project.id}/feedback?round=${round}&generationId=${generation.id}`}
                        className="inline-flex rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700"
                      >
                        Choose this direction
                      </Link>
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
