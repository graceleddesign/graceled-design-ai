export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { loadAuthorizedFinalDesign } = await import("@/lib/final-deliverables-api");
  const { buildFinalPptx } = await import("@/lib/final-deliverables");
  const finalDesign = await loadAuthorizedFinalDesign(id);

  if (!finalDesign.ok) {
    return finalDesign.response;
  }

  const pptxBuffer = await buildFinalPptx(finalDesign.designDoc);
  const responseBody = new Uint8Array(pptxBuffer);

  return new Response(responseBody, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": 'attachment; filename="final.pptx"',
      "Cache-Control": "no-store"
    }
  });
}
