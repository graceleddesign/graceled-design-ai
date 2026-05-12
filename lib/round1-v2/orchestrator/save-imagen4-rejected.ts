/**
 * Dev/test-only: persist a raw rejected Imagen 4 output to the local
 * filesystem so it can be inspected without marking it as a production asset.
 *
 * Active when NODE_ENV !== "production".
 * Also active in production if IMAGEN4_DEBUG_REJECTED_OUTPUTS=true is
 * explicitly set (e.g. in a staging environment); absent by default.
 *
 * Files are written to:
 *   <cwd>/tmp/imagen4-rejected/<generationId>-raw.png
 *
 * This path is intentionally inside tmp/ so it is never committed and is
 * excluded by .gitignore. Do not create Asset DB rows for these files.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export function isImagen4DebugSaveEnabled(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.IMAGEN4_DEBUG_REJECTED_OUTPUTS?.trim().toLowerCase() === "true";
}

/**
 * Saves raw rejected Imagen 4 bytes for local inspection.
 * Returns the absolute path written, or null if saving was skipped/disabled.
 * Never throws — callers must treat failure as non-fatal.
 */
export async function saveImagen4RejectedBytes(
  generationId: string,
  bytes: Buffer
): Promise<string | null> {
  if (!isImagen4DebugSaveEnabled()) return null;
  try {
    const dir = join(process.cwd(), "tmp", "imagen4-rejected");
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, `${generationId}-raw.png`);
    await writeFile(filePath, bytes);
    return filePath;
  } catch {
    return null;
  }
}
