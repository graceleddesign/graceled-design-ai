"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

const TIERS = ["pro", "experimental", "fun"] as const;
const CLUSTERS = [
  "minimal",
  "editorial_photo",
  "bold_type",
  "illustration",
  "modern_abstract",
  "cinematic",
  "architectural",
  "retro_print",
  "texture",
  "other"
] as const;

type Tier = (typeof TIERS)[number];
type Cluster = (typeof CLUSTERS)[number];

type ReferenceRow = {
  id: string;
  thumbUrl: string;
  width: number;
  height: number;
  tier: Tier;
  cluster: Cluster;
  tags: string[];
  styleTags: string[];
};

type EditableReference = Omit<ReferenceRow, "tags"> & {
  tagsText: string;
};

type BaselineMap = Record<
  string,
  {
    tier: Tier;
    cluster: Cluster;
    tags: string[];
  }
>;

function normalizeTagsFromText(value: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const segment of value.split(",")) {
    const normalized = segment.trim();
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function buildBaseline(rows: EditableReference[]): BaselineMap {
  const result: BaselineMap = {};
  for (const row of rows) {
    result[row.id] = {
      tier: row.tier,
      cluster: row.cluster,
      tags: normalizeTagsFromText(row.tagsText)
    };
  }
  return result;
}

function equalStringArrays(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) {
      return false;
    }
  }
  return true;
}

function isCurated(row: EditableReference): boolean {
  return row.tier !== "experimental" || row.cluster !== "other" || normalizeTagsFromText(row.tagsText).length > 0;
}

type BulkTier = Tier | "unchanged";
type BulkCluster = Cluster | "unchanged";

type ReferenceCurationEditorProps = {
  initialReferences: ReferenceRow[];
};

export function ReferenceCurationEditor({ initialReferences }: ReferenceCurationEditorProps) {
  const [items, setItems] = useState<EditableReference[]>(
    initialReferences.map((item) => ({
      ...item,
      tagsText: item.tags.join(", ")
    }))
  );
  const [baseline, setBaseline] = useState<BaselineMap>(() => buildBaseline(items));

  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<Tier | "all">("all");
  const [clusterFilter, setClusterFilter] = useState<Cluster | "all">("all");
  const [onlyCuratedFilter, setOnlyCuratedFilter] = useState(false);
  const [bulkTier, setBulkTier] = useState<BulkTier>("unchanged");
  const [bulkCluster, setBulkCluster] = useState<BulkCluster>("unchanged");

  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      if (tierFilter !== "all" && item.tier !== tierFilter) {
        return false;
      }
      if (clusterFilter !== "all" && item.cluster !== clusterFilter) {
        return false;
      }
      if (onlyCuratedFilter && !isCurated(item)) {
        return false;
      }
      if (!query) {
        return true;
      }
      const haystack = `${item.id} ${item.tagsText} ${item.styleTags.join(" ")}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [items, search, tierFilter, clusterFilter, onlyCuratedFilter]);

  const dirtyIds = useMemo(() => {
    const dirty = new Set<string>();
    for (const item of items) {
      const previous = baseline[item.id];
      const nextTags = normalizeTagsFromText(item.tagsText);
      if (!previous) {
        dirty.add(item.id);
        continue;
      }
      if (item.tier !== previous.tier || item.cluster !== previous.cluster || !equalStringArrays(nextTags, previous.tags)) {
        dirty.add(item.id);
      }
    }
    return dirty;
  }, [items, baseline]);

  const proCount = useMemo(() => items.filter((item) => item.tier === "pro").length, [items]);
  const curatedCount = useMemo(() => items.filter((item) => isCurated(item)).length, [items]);

  function updateItem(id: string, patch: Partial<EditableReference>) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function applyBulkToVisible() {
    if (bulkTier === "unchanged" && bulkCluster === "unchanged") {
      return;
    }

    const visibleIds = new Set(filtered.map((item) => item.id));
    setItems((prev) =>
      prev.map((item) => {
        if (!visibleIds.has(item.id)) {
          return item;
        }
        return {
          ...item,
          tier: bulkTier === "unchanged" ? item.tier : bulkTier,
          cluster: bulkCluster === "unchanged" ? item.cluster : bulkCluster
        };
      })
    );
  }

  async function handleSave() {
    setIsSaving(true);
    setSaveError(null);
    setSaveMessage(null);

    try {
      const payload = Object.fromEntries(
        items.map((item) => [
          item.id,
          {
            tier: item.tier,
            cluster: item.cluster,
            tags: normalizeTagsFromText(item.tagsText)
          }
        ])
      );

      const response = await fetch("/api/admin/reference-curation", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ items: payload })
      });

      const result = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string; count?: number }
        | null;

      if (!response.ok || !result?.ok) {
        const message = result?.error || "Unable to save curation";
        throw new Error(message);
      }

      setBaseline(buildBaseline(items));
      setSaveMessage(`Saved ${result.count ?? 0} curated entries.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save curation";
      setSaveError(message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-48 flex-col gap-1 text-sm">
            <span className="text-slate-600">Search</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ref id or tags"
              className="rounded-md border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="flex min-w-40 flex-col gap-1 text-sm">
            <span className="text-slate-600">Tier</span>
            <select
              value={tierFilter}
              onChange={(event) => setTierFilter(event.target.value as Tier | "all")}
              className="rounded-md border border-slate-300 px-3 py-2"
            >
              <option value="all">all</option>
              {TIERS.map((tier) => (
                <option key={tier} value={tier}>
                  {tier}
                </option>
              ))}
            </select>
          </label>

          <label className="flex min-w-44 flex-col gap-1 text-sm">
            <span className="text-slate-600">Cluster</span>
            <select
              value={clusterFilter}
              onChange={(event) => setClusterFilter(event.target.value as Cluster | "all")}
              className="rounded-md border border-slate-300 px-3 py-2"
            >
              <option value="all">all</option>
              {CLUSTERS.map((cluster) => (
                <option key={cluster} value={cluster}>
                  {cluster}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={onlyCuratedFilter}
              onChange={(event) => setOnlyCuratedFilter(event.target.checked)}
            />
            only curated
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-200 pt-4">
          <label className="flex min-w-40 flex-col gap-1 text-sm">
            <span className="text-slate-600">Bulk tier (visible)</span>
            <select
              value={bulkTier}
              onChange={(event) => setBulkTier(event.target.value as BulkTier)}
              className="rounded-md border border-slate-300 px-3 py-2"
            >
              <option value="unchanged">unchanged</option>
              {TIERS.map((tier) => (
                <option key={tier} value={tier}>
                  {tier}
                </option>
              ))}
            </select>
          </label>

          <label className="flex min-w-44 flex-col gap-1 text-sm">
            <span className="text-slate-600">Bulk cluster (visible)</span>
            <select
              value={bulkCluster}
              onChange={(event) => setBulkCluster(event.target.value as BulkCluster)}
              className="rounded-md border border-slate-300 px-3 py-2"
            >
              <option value="unchanged">unchanged</option>
              {CLUSTERS.map((cluster) => (
                <option key={cluster} value={cluster}>
                  {cluster}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={applyBulkToVisible}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700"
          >
            Apply to visible
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4 text-sm">
          <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">total: {items.length}</span>
          <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">pro: {proCount}</span>
          <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">curated: {curatedCount}</span>
          <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">dirty: {dirtyIds.size}</span>
          <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">visible: {filtered.length}</span>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="ml-auto rounded-md bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-60"
          >
            {isSaving ? "Saving..." : "Save curation"}
          </button>
        </div>

        {saveMessage ? <p className="mt-2 text-sm text-emerald-700">{saveMessage}</p> : null}
        {saveError ? <p className="mt-2 text-sm text-red-700">{saveError}</p> : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map((item) => (
          <article
            key={item.id}
            className={`rounded-xl border bg-white p-3 ${
              dirtyIds.has(item.id) ? "border-amber-400 shadow-[0_0_0_1px_rgba(251,191,36,0.35)]" : "border-slate-200"
            }`}
          >
            <div className="mb-2 overflow-hidden rounded-md border border-slate-200">
              <Image
                src={item.thumbUrl}
                alt={item.id}
                className="h-auto w-full bg-slate-100"
                width={item.width}
                height={item.height}
                loading="lazy"
              />
            </div>

            <div className="space-y-2">
              <div>
                <p className="text-sm font-medium">{item.id}</p>
                <p className="text-xs text-slate-500">{item.styleTags.join(", ") || "no style tags"}</p>
              </div>

              <label className="flex flex-col gap-1 text-xs text-slate-600">
                Tier
                <select
                  value={item.tier}
                  onChange={(event) => updateItem(item.id, { tier: event.target.value as Tier })}
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
                >
                  {TIERS.map((tier) => (
                    <option key={tier} value={tier}>
                      {tier}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-xs text-slate-600">
                Cluster
                <select
                  value={item.cluster}
                  onChange={(event) => updateItem(item.id, { cluster: event.target.value as Cluster })}
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
                >
                  {CLUSTERS.map((cluster) => (
                    <option key={cluster} value={cluster}>
                      {cluster}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-xs text-slate-600">
                Tags (comma separated)
                <input
                  value={item.tagsText}
                  onChange={(event) => updateItem(item.id, { tagsText: event.target.value })}
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
                  placeholder="minimal, geometric, type"
                />
              </label>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
