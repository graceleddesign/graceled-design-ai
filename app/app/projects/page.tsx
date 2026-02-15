import Link from "next/link";
import { deleteProjectAction } from "@/app/app/projects/actions";
import { DeleteProjectButton } from "@/components/delete-project-button";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function ProjectsPage() {
  const session = await requireSession();
  const projects = await prisma.project.findMany({
    where: { organizationId: session.organizationId },
    orderBy: { createdAt: "desc" }
  });

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Projects</h1>
          <p className="text-sm text-slate-600">Manage your series setup and creative runs.</p>
        </div>
        <Link href="/app/projects/new" className="rounded-md bg-pine px-4 py-2 font-medium text-white">
          New Project
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="mb-3 text-slate-600">No projects yet.</p>
          <Link href="/app/projects/new">Create your first project</Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {projects.map((project) => (
            <article key={project.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow">
              <Link href={`/app/projects/${project.id}`} className="block">
                <h2 className="text-lg font-semibold">{project.series_title}</h2>
                {project.series_subtitle ? <p className="mt-1 text-sm text-slate-600">{project.series_subtitle}</p> : null}
                <p className="mt-3 text-xs text-slate-500">
                  Created {new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(project.createdAt)}
                </p>
              </Link>

              <div className="mt-4 flex items-center justify-between gap-2">
                <Link
                  href={`/app/projects/${project.id}`}
                  className="inline-flex rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Open
                </Link>
                <form action={deleteProjectAction.bind(null, project.id)}>
                  <DeleteProjectButton projectTitle={project.series_title} />
                </form>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
