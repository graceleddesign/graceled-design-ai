import { access } from "fs/promises";
import { loadIndex, resolveReferenceAbsolutePath } from "@/lib/referenceLibrary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const refs = await loadIndex();
  const sample = refs.slice(0, 3);

  let hasThumbs = sample.length > 0;
  for (const item of sample) {
    const absoluteThumbPath = resolveReferenceAbsolutePath(item.thumbPath);
    const exists = await access(absoluteThumbPath)
      .then(() => true)
      .catch(() => false);
    if (!exists) {
      hasThumbs = false;
      break;
    }
  }

  return Response.json({
    count: refs.length,
    sample,
    hasThumbs
  });
}
