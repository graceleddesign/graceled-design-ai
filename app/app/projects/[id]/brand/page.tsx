import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function ProjectBrandKitPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  const project = await prisma.project.findFirst({
    where: {
      id,
      organizationId: session.organizationId
    },
    select: {
      id: true
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

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        <p>Brand Kit is now managed in Settings.</p>
        <div className="mt-3">
          <Link href="/app/settings" className="inline-flex rounded-md border border-amber-300 bg-white px-3 py-1.5 font-medium">
            Go to Settings
          </Link>
        </div>
      </div>
    </section>
  );
}
