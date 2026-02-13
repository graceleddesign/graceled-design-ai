import { buildFinalPng } from "@/lib/final-deliverables";
import { loadAuthorizedFinalDesign } from "@/lib/final-deliverables-api";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const finalDesign = await loadAuthorizedFinalDesign(id);

  if (!finalDesign.ok) {
    return finalDesign.response;
  }

  const pngBuffer = await buildFinalPng(finalDesign.designDoc);
  const responseBody = new Uint8Array(pngBuffer);

  return new Response(responseBody, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": 'attachment; filename="final.png"',
      "Cache-Control": "no-store"
    }
  });
}
