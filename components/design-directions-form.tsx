"use client";

import { useActionState } from "react";
import { generateRoundOneAction, type GenerationActionState } from "@/app/app/projects/actions";

type DesignDirectionsFormProps = {
  projectId: string;
  showGlobalBrandKitCallout?: boolean;
};

const initialState: GenerationActionState = {};

export function DesignDirectionsForm({ projectId, showGlobalBrandKitCallout = false }: DesignDirectionsFormProps) {
  const [state, action, pending] = useActionState(generateRoundOneAction.bind(null, projectId), initialState);

  return (
    <form action={action} className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold">Design Directions</h2>
        <p className="text-sm text-slate-600">
          Style Library Mode automatically selects diverse references and generates three options for Round 1.
        </p>
      </div>
      {showGlobalBrandKitCallout ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Brand-aligned mode works best when you set up Church Brand Kit in Settings.
        </div>
      ) : null}

      {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}

      <button type="submit" disabled={pending} className="rounded-md bg-pine px-4 py-2 font-medium text-white disabled:opacity-60">
        {pending ? "Generating options..." : "Generate 3 options"}
      </button>
    </form>
  );
}
