import { listStyleRefs } from "@/lib/style-library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const refs = await listStyleRefs();

  return Response.json({
    totalRefs: refs.length,
    sampleRefs: refs.slice(0, 12).map((ref) => ref.path),
    ok: true
  });
}
