import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { getCuratedReferences } from "@/lib/referenceCuration";
import { ReferenceCurationEditor } from "./reference-curation-editor";

export default async function AdminReferenceCurationPage() {
  const session = await requireSession();
  if (session.role !== "OWNER" && session.role !== "ADMIN") {
    notFound();
  }

  const references = await getCuratedReferences();

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Reference Curation</h1>
        <p className="text-sm text-slate-600">
          Internal tool to assign tier/cluster metadata on top of <code>reference_library/index.json</code>. Saves to{" "}
          <code>reference_library/curation.json</code>.
        </p>
      </div>

      <ReferenceCurationEditor initialReferences={references} />
    </section>
  );
}
