"use client";

import { useActionState, useMemo, useState } from "react";
import { generateRoundOneAction, type GenerationActionState } from "@/app/app/projects/actions";

type PresetLane = {
  id: string;
  key: string;
  name: string;
  subtitle: string | null;
  collection: string | null;
};

type DesignDirectionsFormProps = {
  projectId: string;
  presets: PresetLane[];
};

const COLLECTION_ORDER = ["Essentials", "Photo", "Abstract & Texture", "Illustration", "Seasonal"];
const initialState: GenerationActionState = {};

export function DesignDirectionsForm({ projectId, presets }: DesignDirectionsFormProps) {
  const [state, action, pending] = useActionState(generateRoundOneAction.bind(null, projectId), initialState);
  const [selectedPresetKeys, setSelectedPresetKeys] = useState<string[]>(() => presets.slice(0, 3).map((preset) => preset.key));

  const groupedPresets = useMemo(() => {
    const groups = new Map<string, PresetLane[]>();

    for (const collection of COLLECTION_ORDER) {
      groups.set(collection, []);
    }

    for (const preset of presets) {
      const collection = preset.collection || "Other";
      const current = groups.get(collection) || [];
      current.push(preset);
      groups.set(collection, current);
    }

    return Array.from(groups.entries()).filter(([, list]) => list.length > 0);
  }, [presets]);

  const togglePreset = (key: string) => {
    setSelectedPresetKeys((current) => {
      if (current.includes(key)) {
        return current.filter((item) => item !== key);
      }

      if (current.length >= 3) {
        return current;
      }

      return [...current, key];
    });
  };

  return (
    <form action={action} className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold">Design Directions</h2>
        <p className="text-sm text-slate-600">Pick exactly 3 preset lanes for Round 1.</p>
      </div>

      <p className="text-sm text-slate-700">
        Selected: <span className="font-semibold">{selectedPresetKeys.length}/3</span>
      </p>

      <div className="space-y-4">
        {groupedPresets.map(([collection, collectionPresets]) => (
          <div key={collection} className="space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{collection}</h3>
            <div className="grid gap-2 md:grid-cols-2">
              {collectionPresets.map((preset) => {
                const isSelected = selectedPresetKeys.includes(preset.key);
                const isAtLimit = !isSelected && selectedPresetKeys.length >= 3;

                return (
                  <label
                    key={preset.id}
                    className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${
                      isSelected ? "border-pine bg-green-50" : "border-slate-200 bg-white"
                    } ${isAtLimit ? "opacity-60" : "cursor-pointer"}`}
                  >
                    <input
                      type="checkbox"
                      name="selectedPresetKeys"
                      value={preset.key}
                      checked={isSelected}
                      disabled={isAtLimit}
                      onChange={() => togglePreset(preset.key)}
                      className="mt-0.5 h-4 w-4"
                    />
                    <span>
                      <span className="block font-medium text-slate-800">{preset.name}</span>
                      <span className="block text-xs text-slate-600">{preset.subtitle || preset.key}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}

      <button
        type="submit"
        disabled={pending || selectedPresetKeys.length !== 3 || presets.length < 3}
        className="rounded-md bg-pine px-4 py-2 font-medium text-white disabled:opacity-60"
      >
        {pending ? "Generating Round 1..." : "Generate Round 1 (3 options)"}
      </button>
    </form>
  );
}
