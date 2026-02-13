import { buildFinalBundle } from "@/lib/final-deliverables";
import { loadAuthorizedFinalDesign } from "@/lib/final-deliverables-api";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const finalDesign = await loadAuthorizedFinalDesign(id);

  if (!finalDesign.ok) {
    return finalDesign.response;
  }

  const zipBuffer = await buildFinalBundle(finalDesign.designDoc);

  return new Response(zipBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="final-bundle.zip"',
      "Cache-Control": "no-store"
    }
  });
}
