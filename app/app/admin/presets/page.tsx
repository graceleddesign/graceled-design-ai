import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function AdminPresetsPage() {
  const session = await requireSession();
  if (session.role !== "OWNER" && session.role !== "ADMIN") {
    notFound();
  }

  const presets = await prisma.preset.findMany({
    where: {
      OR: [{ organizationId: null }, { organizationId: session.organizationId }]
    },
    orderBy: [{ collection: "asc" }, { name: "asc" }]
  });

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Preset Library</h1>
        <p className="text-sm text-slate-600">
          Loaded presets available to your organization. Seed from <code>/seed/presets.seed.json</code>.
        </p>
      </div>

      {presets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
          No presets found. Run <code>npm run db:seed</code> after Prisma setup.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-700">Name</th>
                <th className="px-4 py-3 text-left font-medium text-slate-700">Collection</th>
                <th className="px-4 py-3 text-left font-medium text-slate-700">Tags</th>
                <th className="px-4 py-3 text-left font-medium text-slate-700">Version</th>
                <th className="px-4 py-3 text-left font-medium text-slate-700">Enabled</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {presets.map((preset) => (
                <tr key={preset.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{preset.name}</div>
                    <div className="text-xs text-slate-500">{preset.key}</div>
                  </td>
                  <td className="px-4 py-3">{preset.collection || "-"}</td>
                  <td className="px-4 py-3">
                    {Array.isArray(preset.tags) ? preset.tags.join(", ") : "-"}
                  </td>
                  <td className="px-4 py-3">v{preset.version}</td>
                  <td className="px-4 py-3">{preset.enabled ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
