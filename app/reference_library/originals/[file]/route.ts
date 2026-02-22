import { readFile } from "fs/promises";
import path from "path";
import { loadReferenceIndex } from "@/lib/referenceCuration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeFileName(rawValue: string): string | null {
  const decoded = decodeURIComponent(rawValue || "").trim();
  if (!decoded || decoded.includes("/") || decoded.includes("\\")) {
    return null;
  }
  return decoded;
}

function normalizeRelativePath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\/+/, "");
}

function fileNameFromPath(value: string): string {
  return path.posix.basename(normalizeRelativePath(value));
}

function resolveWorkspacePath(relativePath: string): string | null {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized) {
    return null;
  }
  const root = process.cwd();
  const absolute = path.resolve(root, normalized);
  const rootPrefix = `${root}${path.sep}`;
  if (absolute !== root && !absolute.startsWith(rootPrefix)) {
    return null;
  }
  return absolute;
}

function mimeTypeFromFileName(fileName: string): string {
  const extension = path.extname(fileName).toLowerCase();
  if (extension === ".png") {
    return "image/png";
  }
  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }
  if (extension === ".webp") {
    return "image/webp";
  }
  return "application/octet-stream";
}

export async function GET(_: Request, context: { params: Promise<{ file: string }> }) {
  const params = await context.params;
  const fileName = sanitizeFileName(params.file);
  if (!fileName) {
    return new Response("Invalid file name", { status: 400 });
  }

  const index = await loadReferenceIndex();
  const match = index.find((item) => {
    const rawName = fileNameFromPath(item.rawPath);
    const normalizedName = fileNameFromPath(item.normalizedPath);
    const thumbName = fileNameFromPath(item.thumbPath);
    return fileName === rawName || fileName === normalizedName || fileName === thumbName;
  });

  if (!match) {
    return new Response("Reference not found", { status: 404 });
  }

  const candidates = [match.rawPath, match.normalizedPath, match.thumbPath];
  for (const candidate of candidates) {
    const candidateName = fileNameFromPath(candidate);
    if (candidateName !== fileName) {
      continue;
    }
    const absolutePath = resolveWorkspacePath(candidate);
    if (!absolutePath) {
      continue;
    }
    const bytes = await readFile(absolutePath).catch(() => null);
    if (!bytes) {
      continue;
    }
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": mimeTypeFromFileName(fileName),
        "Cache-Control": "public, max-age=86400"
      }
    });
  }

  return new Response("Reference file unavailable", { status: 404 });
}
