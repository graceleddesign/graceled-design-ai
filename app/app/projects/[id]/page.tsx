import Link from "next/link";
import { notFound } from "next/navigation";
import { DesignDirectionsForm } from "@/components/design-directions-form";
import { resolveEffectiveBrandKit } from "@/lib/brand-kit";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  const project = await prisma.project.findFirst({
    where: {
      id,
      organizationId: session.organizationId
    },
    include: {
      brandKit: true,
      generations: {
        orderBy: { createdAt: "desc" },
        take: 10
      },
      assets: {
        orderBy: { createdAt: "desc" },
        take: 10
      }
    }
  });

  if (!project) {
    notFound();
  }

  const effectiveBrandKit = await resolveEffectiveBrandKit({
    organizationId: session.organizationId,
    projectId: project.id,
    projectBrandKit: project.brandKit
  });
  const isBrandMode = project.brandMode === "brand";
  const showSeriesPreferences = Boolean(project.preferredAccentColors || project.avoidColors || project.designNotes);
  const showGlobalBrandKitCallout = isBrandMode && effectiveBrandKit?.source !== "organization";

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">Project</p>
          <h1 className="text-2xl font-semibold">{project.series_title}</h1>
          {project.series_subtitle ? <p className="text-slate-600">{project.series_subtitle}</p> : null}
        </div>
        <Link href="/app/projects" className="text-sm">
          Back to projects
        </Link>
      </div>

      <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-6 md:grid-cols-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Series Fields</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div>
              <dt className="font-medium text-slate-700">Series Title</dt>
              <dd>{project.series_title}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-700">Series Subtitle</dt>
              <dd>{project.series_subtitle || "-"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-700">Scripture Passages</dt>
              <dd>{project.scripture_passages || "-"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-700">Series Description</dt>
              <dd className="whitespace-pre-wrap">{project.series_description || "-"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-700">Design Approach</dt>
              <dd>{isBrandMode ? "Brand-aligned" : "Fresh series look"}</dd>
            </div>
          </dl>

          <h2 className="mt-5 text-sm font-semibold uppercase tracking-wide text-slate-500">Series Preferences</h2>
          {showSeriesPreferences ? (
            <dl className="mt-3 space-y-2 text-sm">
              {project.preferredAccentColors ? (
                <div>
                  <dt className="font-medium text-slate-700">Preferred Colors</dt>
                  <dd>{project.preferredAccentColors}</dd>
                </div>
              ) : null}
              {project.avoidColors ? (
                <div>
                  <dt className="font-medium text-slate-700">Avoid Colors</dt>
                  <dd>{project.avoidColors}</dd>
                </div>
              ) : null}
              {project.designNotes ? (
                <div>
                  <dt className="font-medium text-slate-700">Notes</dt>
                  <dd className="whitespace-pre-wrap">{project.designNotes}</dd>
                </div>
              ) : null}
            </dl>
          ) : (
            <p className="mt-3 text-sm text-slate-500">No series preferences added.</p>
          )}
        </div>

        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Design Status</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {isBrandMode ? (
              <li>
                Brand Kit:{" "}
                <Link href="/app/settings" className="underline">
                  {effectiveBrandKit ? "Using Church Brand Kit guidance" : "No Church Brand Kit configured"}
                </Link>
              </li>
            ) : (
              <li>Brand Kit: Optional in fresh mode (not applied to prompts).</li>
            )}
            {isBrandMode && effectiveBrandKit && effectiveBrandKit.source !== "organization" ? (
              <li className="text-amber-700">Global Church Brand Kit is recommended; currently using a non-global Brand Kit source.</li>
            ) : null}
            <li>Generations: {project.generations.length}</li>
            <li>Assets: {project.assets.length}</li>
          </ul>
          <div className="mt-4">
            <Link
              href="/app/settings"
              className="inline-flex rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
            >
              Manage Church Brand Kit
            </Link>
            <Link
              href={`/app/projects/${project.id}/generations`}
              className="ml-2 inline-flex rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
            >
              View Generations
            </Link>
          </div>
        </div>
      </div>

      <DesignDirectionsForm projectId={project.id} showGlobalBrandKitCallout={showGlobalBrandKitCallout} />
    </section>
  );
}
