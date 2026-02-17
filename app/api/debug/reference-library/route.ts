import { loadReferenceIndex, pickReferences } from "@/lib/reference-library";
import { access } from "fs/promises";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const refs = await loadReferenceIndex();
  const sample = await pickReferences({ count: 6, mode: "clean-minimal" });
  const indexPath = path.join(process.cwd(), "reference", "index.json");
  const hasIndex = await access(indexPath)
    .then(() => true)
    .catch(() => false);

  return Response.json({
    referenceCount: refs.length,
    hasIndex,
    sample: sample.map((item) => item.relativePath)
  });
}
