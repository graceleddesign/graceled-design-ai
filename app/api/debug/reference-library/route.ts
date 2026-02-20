import { access } from "fs/promises";
import path from "path";
import { loadIndex, sampleRefsForOption } from "@/lib/referenceLibrary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const refs = await loadIndex();
  const sample = await sampleRefsForOption({
    projectId: "debug",
    round: 1,
    optionIndex: 0,
    n: 3
  });
  const indexPath = path.join(process.cwd(), "data", "reference-library.json");
  const hasIndex = await access(indexPath)
    .then(() => true)
    .catch(() => false);

  return Response.json({
    referenceCount: refs.length,
    hasIndex,
    sample: sample.map((item) => item.path)
  });
}
