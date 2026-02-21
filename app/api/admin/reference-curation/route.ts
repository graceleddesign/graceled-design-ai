import { getSession } from "@/lib/auth";
import {
  isDefaultCurationItem,
  loadCuration,
  normalizeCurationItem,
  saveCuration,
  type ReferenceCurationItem
} from "@/lib/referenceCuration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isAdminRole(role: string): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminRole(session.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (!isRecord(payload) || !isRecord(payload.items)) {
    return Response.json({ error: "Expected { items: { ... } }" }, { status: 400 });
  }

  const current = await loadCuration();
  const mergedItems: Record<string, ReferenceCurationItem> = { ...current.items };

  for (const [rawId, rawItem] of Object.entries(payload.items)) {
    const id = rawId.trim();
    if (!id) {
      continue;
    }

    const normalized = normalizeCurationItem(rawItem);
    if (isDefaultCurationItem(normalized)) {
      delete mergedItems[id];
      continue;
    }
    mergedItems[id] = normalized;
  }

  const saved = await saveCuration(mergedItems);
  return Response.json({
    ok: true,
    version: saved.version,
    count: Object.keys(saved.items).length
  });
}
