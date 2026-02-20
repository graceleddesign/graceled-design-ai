import Link from "next/link";
import { notFound } from "next/navigation";
import { approveFinalDesignAction } from "@/app/app/projects/actions";
import { DirectionOptionCard } from "@/components/direction-option-card";
import { requireSession } from "@/lib/auth";
import { optionLabel } from "@/lib/option-label";
import { prisma } from "@/lib/prisma";

type PreviewFields = {
  square: string;
  wide: string;
  tall: string;
};

type GenerationAssetRecord = {
  kind: "IMAGE" | "BACKGROUND" | "LOCKUP" | "ZIP" | "OTHER";
  slot: string | null;
  file_path: string;
};

type OptionDesignSpecSummary = {
  wantsTitleStage: boolean;
  wantsSeriesMark: boolean;
  lockupLayout: string | null;
  motifFocus: string[];
};

const OPTION_TINTS = [
  "from-emerald-200 to-emerald-50",
  "from-amber-200 to-amber-50",
  "from-sky-200 to-sky-50",
  "from-rose-200 to-rose-50",
  "from-violet-200 to-violet-50",
  "from-slate-300 to-slate-100"
];

function normalizeAssetUrl(filePath: string): string {
  const trimmed = filePath.trim();
  if (!trimmed) {
    return "";
  }

  if (/^https?:\/\//i.test(trimmed) || /^data:/i.test(trimmed)) {
    return trimmed;
  }

  return trimmed.startsWith("/") ? trimmed : `/${trimmed.replace(/^\/+/, "")}`;
}

function readAssetPreview(assets: GenerationAssetRecord[]): PreviewFields {
  const resolved: Record<PreviewShape, { final: string; background: string }> = {
    square: { final: "", background: "" },
    wide: { final: "", background: "" },
    tall: { final: "", background: "" }
  };

  const imageLikeAssets = assets.filter(
    (asset) => (asset.kind === "IMAGE" || asset.kind === "BACKGROUND") && Boolean(asset.file_path?.trim())
  );
  const fallback = imageLikeAssets[0] ? normalizeAssetUrl(imageLikeAssets[0].file_path) : "";

  for (const asset of imageLikeAssets) {
    const slot = asset.slot?.trim().toLowerCase();
    const filePath = normalizeAssetUrl(asset.file_path);
    if (!filePath) {
      continue;
    }

    if (slot === "square" || slot === "square_main") {
      if (!resolved.square.final) {
        resolved.square.final = filePath;
      }
      continue;
    }
    if (slot === "wide" || slot === "wide_main" || slot === "widescreen" || slot === "widescreen_main") {
      if (!resolved.wide.final) {
        resolved.wide.final = filePath;
      }
      continue;
    }
    if (slot === "tall" || slot === "tall_main" || slot === "vertical" || slot === "vertical_main") {
      if (!resolved.tall.final) {
        resolved.tall.final = filePath;
      }
      continue;
    }
    if (slot === "square_bg") {
      if (!resolved.square.background) {
        resolved.square.background = filePath;
      }
      continue;
    }
    if (slot === "wide_bg" || slot === "widescreen_bg") {
      if (!resolved.wide.background) {
        resolved.wide.background = filePath;
      }
      continue;
    }
    if (slot === "tall_bg" || slot === "vertical_bg") {
      if (!resolved.tall.background) {
        resolved.tall.background = filePath;
      }
    }
  }

  return {
    square: resolved.square.final || resolved.square.background || fallback,
    wide: resolved.wide.final || resolved.wide.background || fallback,
    tall: resolved.tall.final || resolved.tall.background || fallback
  };
}

function readDesignSpecSummary(output: unknown): OptionDesignSpecSummary {
  const fallback: OptionDesignSpecSummary = {
    wantsTitleStage: false,
    wantsSeriesMark: false,
    lockupLayout: null,
    motifFocus: []
  };
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return fallback;
  }

  const meta = (output as { meta?: unknown }).meta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return fallback;
  }

  const designSpec = (meta as { designSpec?: unknown }).designSpec;
  if (!designSpec || typeof designSpec !== "object" || Array.isArray(designSpec)) {
    return fallback;
  }

  const nestedDirectionSpec = (
    designSpec as {
      directionSpec?:
        | {
            wantsTitleStage?: unknown;
            wantsSeriesMark?: unknown;
            lockupLayout?: unknown;
            motifFocus?: unknown;
          }
        | null;
    }
  ).directionSpec;
  const directWantsTitleStage = (designSpec as { wantsTitleStage?: unknown }).wantsTitleStage;
  const directWantsSeriesMark = (designSpec as { wantsSeriesMark?: unknown }).wantsSeriesMark;
  const directLockupLayout = (designSpec as { lockupLayout?: unknown }).lockupLayout;
  const directMotifFocus = (designSpec as { motifFocus?: unknown }).motifFocus;
  const nestedWantsTitleStage = nestedDirectionSpec?.wantsTitleStage;
  const nestedWantsSeriesMark = nestedDirectionSpec?.wantsSeriesMark;
  const nestedLockupLayout = nestedDirectionSpec?.lockupLayout;
  const nestedMotifFocus = nestedDirectionSpec?.motifFocus;

  const lockupLayoutCandidate = typeof directLockupLayout === "string" ? directLockupLayout : nestedLockupLayout;
  const motifFocusCandidate = Array.isArray(directMotifFocus) ? directMotifFocus : nestedMotifFocus;
  const motifFocus = Array.isArray(motifFocusCandidate)
    ? motifFocusCandidate
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
        .slice(0, 2)
    : [];

  return {
    wantsTitleStage: directWantsTitleStage === true || nestedWantsTitleStage === true,
    wantsSeriesMark: directWantsSeriesMark === true || nestedWantsSeriesMark === true,
    lockupLayout: typeof lockupLayoutCandidate === "string" && lockupLayoutCandidate.trim() ? lockupLayoutCandidate : null,
    motifFocus
  };
}

type PreviewShape = "square" | "wide" | "tall";

function getGenerationPreviewUrl(
  projectId: string,
  generationId: string,
  shape: PreviewShape,
  updatedAt: Date,
  assetUrl?: string,
  options?: { debugStage?: boolean }
): string {
  if (options?.debugStage) {
    return `/api/projects/${projectId}/generations/${generationId}/preview?shape=${shape}&debugStage=1&v=${updatedAt.getTime()}`;
  }

  if (assetUrl) {
    const separator = assetUrl.includes("?") ? "&" : "?";
    return `${assetUrl}${separator}v=${updatedAt.getTime()}`;
  }

  return `/api/projects/${projectId}/generations/${generationId}/preview?shape=${shape}&v=${updatedAt.getTime()}`;
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

export default async function ProjectGenerationsPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ debugStage?: string }>;
}) {
  // Placeholder route protection for generation flow.
  const session = await requireSession();
  const { id } = await params;
  const { debugStage } = await searchParams;
  const debugStageEnabled = process.env.NODE_ENV !== "production" && debugStage === "1";

  const project = await prisma.project.findFirst({
    where: {
      id,
      organizationId: session.organizationId
    },
    select: {
      id: true,
      series_title: true,
      brandMode: true,
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
      updatedAt: true,
      assets: {
        select: {
          kind: true,
          slot: true,
          file_path: true
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
            <p className="text-xs text-slate-500">Available after you finalize a design.</p>
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
          {!project.finalDesign ? <p className="w-full text-right text-xs text-slate-500">Finalize to unlock downloads.</p> : null}
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
                  const preview = readAssetPreview(generation.assets);
                  const isApprovedFinal =
                    project.finalDesign?.generationId === generation.id ||
                    (project.finalDesign?.round === round && project.finalDesign.optionKey === optionKey);
                  const styleRefCount = (
                    generation.output as { meta?: { styleRefCount?: unknown } } | null
                  )?.meta?.styleRefCount;
                  const designSpecSummary = readDesignSpecSummary(generation.output);
                  const previewUrls = {
                    square: getGenerationPreviewUrl(project.id, generation.id, "square", generation.updatedAt, preview.square, {
                      debugStage: debugStageEnabled
                    }),
                    wide: getGenerationPreviewUrl(project.id, generation.id, "wide", generation.updatedAt, preview.wide, {
                      debugStage: debugStageEnabled
                    }),
                    tall: getGenerationPreviewUrl(project.id, generation.id, "tall", generation.updatedAt, preview.tall, {
                      debugStage: debugStageEnabled
                    })
                  };
                  const finalizeAction = approveFinalDesignAction.bind(null, project.id, generation.id, optionKey);

                  return (
                    <DirectionOptionCard
                      key={generation.id}
                      projectId={project.id}
                      round={round}
                      generationId={generation.id}
                      optionLabel={label}
                      tintClass={tintClass}
                      isApprovedFinal={isApprovedFinal}
                      styleRefCount={typeof styleRefCount === "number" ? styleRefCount : null}
                      isTitleStage={designSpecSummary.wantsTitleStage}
                      wantsSeriesMark={designSpecSummary.wantsSeriesMark}
                      lockupLayout={designSpecSummary.lockupLayout}
                      motifFocus={designSpecSummary.motifFocus}
                      brandMode={project.brandMode === "brand" ? "brand" : "fresh"}
                      previewUrls={previewUrls}
                      finalizeAction={finalizeAction}
                    />
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
