"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { generateRoundTwoAction, type RoundFeedbackActionState } from "@/app/app/projects/actions";
import { STYLE_DIRECTION_OPTIONS } from "@/lib/style-direction";

type GenerationFeedbackFormProps = {
  projectId: string;
  currentRound: number;
  chosenGenerationId?: string;
  chosenDirectionLabel?: string;
};

const initialState: RoundFeedbackActionState = {};
type EmphasisValue = "title" | "quote";

function defaultsForEmphasis(emphasis: EmphasisValue): { regenerateLockup: boolean; regenerateBackground: boolean } {
  if (emphasis === "title") {
    return {
      regenerateLockup: true,
      regenerateBackground: false
    };
  }

  return {
    regenerateLockup: false,
    regenerateBackground: false
  };
}

export function GenerationFeedbackForm({
  projectId,
  currentRound,
  chosenGenerationId,
  chosenDirectionLabel
}: GenerationFeedbackFormProps) {
  const [emphasis, setEmphasis] = useState<EmphasisValue>("title");
  const [regenerateLockup, setRegenerateLockup] = useState<boolean>(() => defaultsForEmphasis("title").regenerateLockup);
  const [regenerateBackground, setRegenerateBackground] = useState<boolean>(
    () => defaultsForEmphasis("title").regenerateBackground
  );
  const [manualLockupSelection, setManualLockupSelection] = useState(false);
  const [manualBackgroundSelection, setManualBackgroundSelection] = useState(false);
  const [expressiveness, setExpressiveness] = useState(50);
  const [temperature, setTemperature] = useState(50);
  const [state, action, pending] = useActionState(generateRoundTwoAction.bind(null, projectId), initialState);

  const handleEmphasisChange = (nextEmphasis: EmphasisValue) => {
    setEmphasis(nextEmphasis);
    const defaults = defaultsForEmphasis(nextEmphasis);

    if (!manualLockupSelection) {
      setRegenerateLockup(defaults.regenerateLockup);
    }
    if (!manualBackgroundSelection) {
      setRegenerateBackground(defaults.regenerateBackground);
    }
  };

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
      <input type="hidden" name="regenerateLockup" value={regenerateLockup ? "true" : "false"} />
      <input
        type="hidden"
        name="explicitNewTitleStyle"
        value={manualLockupSelection && regenerateLockup ? "true" : "false"}
      />
      <input type="hidden" name="regenerateBackground" value={regenerateBackground ? "true" : "false"} />

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
        <legend className="text-sm font-medium text-slate-700">Primary focus</legend>
        <div className="flex gap-3">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="emphasis"
              value="title"
              checked={emphasis === "title"}
              onChange={() => handleEmphasisChange("title")}
            />
            Series title & subtitle
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="emphasis"
              value="quote"
              checked={emphasis === "quote"}
              onChange={() => handleEmphasisChange("quote")}
            />
            Background artwork
          </label>
        </div>
        <p className="text-xs text-slate-500">This sets smart defaults below. You can override in Advanced.</p>
      </fieldset>

      <div className="space-y-2">
        <label htmlFor="styleDirection" className="text-sm font-medium text-slate-700">
          Style direction (optional)
        </label>
        <select id="styleDirection" name="styleDirection" defaultValue="SURPRISE" className="w-full rounded-md border border-slate-300 px-3 py-2">
          {STYLE_DIRECTION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

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

      <details className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-slate-700">Advanced (optional)</summary>
        <div className="mt-3 space-y-3">
          <label htmlFor="regenerateLockupToggle" className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              id="regenerateLockupToggle"
              type="checkbox"
              checked={regenerateLockup}
              onChange={(event) => {
                setManualLockupSelection(true);
                setRegenerateLockup(event.target.checked);
              }}
            />
            Try a new title style
          </label>
          <label htmlFor="regenerateBackgroundToggle" className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              id="regenerateBackgroundToggle"
              type="checkbox"
              checked={regenerateBackground}
              onChange={(event) => {
                setManualBackgroundSelection(true);
                setRegenerateBackground(event.target.checked);
              }}
            />
            Try new artwork
          </label>
          <p className="text-xs text-slate-500">Unchecked items will be kept the same.</p>
        </div>
      </details>

      {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-pine px-4 py-2 font-medium text-white disabled:opacity-60"
        >
          {pending ? "Generating next round..." : "Generate next round"}
        </button>
        <Link href={`/app/projects/${projectId}/generations`} className="text-sm text-slate-600">
          Back to generations
        </Link>
      </div>
    </form>
  );
}
