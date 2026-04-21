export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { loadAuthorizedFinalDesign } = await import("@/lib/final-deliverables-api");
  const { buildFinalSvg } = await import("@/lib/final-deliverables");
  const finalDesign = await loadAuthorizedFinalDesign(id);

  if (!finalDesign.ok) {
    return finalDesign.response;
  }

  const svg = await buildFinalSvg(finalDesign.designDoc);

  return new Response(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Content-Disposition": 'attachment; filename="final.svg"',
      "Cache-Control": "no-store"
    }
  });
}
