"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { generateRoundTwoAction, type RoundFeedbackActionState } from "@/app/app/projects/actions";

type GenerationFeedbackFormProps = {
  projectId: string;
  currentRound: number;
  chosenGenerationId?: string;
  chosenDirectionLabel?: string;
};

const initialState: RoundFeedbackActionState = {};

export function GenerationFeedbackForm({
  projectId,
  currentRound,
  chosenGenerationId,
  chosenDirectionLabel
}: GenerationFeedbackFormProps) {
  const [expressiveness, setExpressiveness] = useState(50);
  const [temperature, setTemperature] = useState(50);
  const [state, action, pending] = useActionState(generateRoundTwoAction.bind(null, projectId), initialState);

  return (
    <form action={action} className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h1 className="text-xl font-semibold">Round {currentRound} Feedback</h1>
        <p className="text-sm text-slate-600">Tell the system what to adjust before generating Round {currentRound + 1}.</p>
        {chosenDirectionLabel ? (
          <p className="mt-2 text-sm text-slate-700">
            Chosen direction: <span className="font-medium">{chosenDirectionLabel}</span>
          </p>
        ) : null}
      </div>

      <input type="hidden" name="currentRound" value={currentRound} />
      {chosenGenerationId ? <input type="hidden" name="chosenGenerationId" value={chosenGenerationId} /> : null}

      <div className="space-y-2">
        <label htmlFor="feedbackText" className="text-sm font-medium text-slate-700">
          What would you like changed?
        </label>
        <textarea
          id="feedbackText"
          name="feedbackText"
          rows={4}
          className="w-full rounded-md border border-slate-300 px-3 py-2"
          placeholder="Keep the same direction, but tighten hierarchy and reduce clutter."
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-700">Emphasis</legend>
        <div className="flex gap-3">
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="radio" name="emphasis" value="title" defaultChecked />
            Title
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="radio" name="emphasis" value="quote" />
            Quote
          </label>
        </div>
      </fieldset>

      <div className="space-y-2">
        <label htmlFor="expressiveness" className="text-sm font-medium text-slate-700">
          More minimal vs more expressive
        </label>
        <input
          id="expressiveness"
          name="expressiveness"
          type="range"
          min={0}
          max={100}
          value={expressiveness}
          onChange={(event) => setExpressiveness(Number(event.target.value))}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-slate-500">
          <span>More minimal</span>
          <span>{expressiveness}</span>
          <span>More expressive</span>
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="temperature" className="text-sm font-medium text-slate-700">
          Warmer vs cooler
        </label>
        <input
          id="temperature"
          name="temperature"
          type="range"
          min={0}
          max={100}
          value={temperature}
          onChange={(event) => setTemperature(Number(event.target.value))}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-slate-500">
          <span>Cooler</span>
          <span>{temperature}</span>
          <span>Warmer</span>
        </div>
      </div>

      {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-pine px-4 py-2 font-medium text-white disabled:opacity-60"
        >
          {pending ? "Generating Round 2..." : "Generate Round 2 (3 options)"}
        </button>
        <Link href={`/app/projects/${projectId}/generations`} className="text-sm text-slate-600">
          Back to generations
        </Link>
      </div>
    </form>
  );
}
