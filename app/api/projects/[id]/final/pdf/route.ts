import { buildFinalPdf } from "@/lib/final-deliverables";
import { loadAuthorizedFinalDesign } from "@/lib/final-deliverables-api";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const finalDesign = await loadAuthorizedFinalDesign(id);

  if (!finalDesign.ok) {
    return finalDesign.response;
  }

  const pdfBuffer = await buildFinalPdf(finalDesign.designDoc);
  const responseBody = new Uint8Array(pdfBuffer);

  return new Response(responseBody, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="final.pdf"',
      "Cache-Control": "no-store"
    }
  });
}
