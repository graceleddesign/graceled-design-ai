"use client";

import { useActionState } from "react";
import { createProjectAction, type ProjectActionState } from "@/app/app/projects/actions";

const initialState: ProjectActionState = {};

export function ProjectForm() {
  const [state, action, pending] = useActionState(createProjectAction, initialState);

  return (
    <form action={action} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Project setup</p>
      <h1 className="text-xl font-semibold">New Project</h1>
      <p className="text-sm text-slate-600">Add your series details and pick your design approach.</p>

      <div className="space-y-2">
        <label htmlFor="series_title" className="text-sm font-medium text-slate-700">
          Series Title <span className="text-red-600">*</span>
        </label>
        <input
          id="series_title"
          name="series_title"
          required
          className="w-full rounded-md border border-slate-300 px-3 py-2"
          placeholder="Faith in the Wilderness"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="series_subtitle" className="text-sm font-medium text-slate-700">
          Series Subtitle
        </label>
        <input
          id="series_subtitle"
          name="series_subtitle"
          className="w-full rounded-md border border-slate-300 px-3 py-2"
          placeholder="Learning to trust God in uncertain seasons"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="scripture_passages" className="text-sm font-medium text-slate-700">
          Scripture Passages
        </label>
        <input
          id="scripture_passages"
          name="scripture_passages"
          className="w-full rounded-md border border-slate-300 px-3 py-2"
          placeholder="Psalm 23; Exodus 13:17-22"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="series_description" className="text-sm font-medium text-slate-700">
          Series Description
        </label>
        <textarea
          id="series_description"
          name="series_description"
          rows={4}
          className="w-full rounded-md border border-slate-300 px-3 py-2"
          placeholder="A four-week journey through stories of faithfulness in transition."
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="brandMode" className="text-sm font-medium text-slate-700">
          Design approach
        </label>
        <select id="brandMode" name="brandMode" defaultValue="fresh" className="w-full rounded-md border border-slate-300 px-3 py-2">
          <option value="fresh">Fresh series look (recommended)</option>
          <option value="brand">Brand-aligned (use Church Brand Kit)</option>
        </select>
        <p className="text-xs text-slate-500">You can create series that match your church brand—or explore a fresh look.</p>
      </div>

      <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <h2 className="text-sm font-semibold text-slate-700">Series Preferences (optional)</h2>

        <div className="space-y-2">
          <label htmlFor="preferredAccentColors" className="text-sm font-medium text-slate-700">
            Preferred Accent Colors
          </label>
          <input
            id="preferredAccentColors"
            name="preferredAccentColors"
            className="w-full rounded-md border border-slate-300 px-3 py-2"
            placeholder="#14532D, #C2410C, navy"
          />
          <p className="text-xs text-slate-500">Hex codes and/or names, comma-separated.</p>
        </div>

        <div className="space-y-2">
          <label htmlFor="avoidColors" className="text-sm font-medium text-slate-700">
            Avoid Colors
          </label>
          <input
            id="avoidColors"
            name="avoidColors"
            className="w-full rounded-md border border-slate-300 px-3 py-2"
            placeholder="neon green, hot pink"
          />
          <p className="text-xs text-slate-500">Comma-separated.</p>
        </div>

        <div className="space-y-2">
          <label htmlFor="designNotes" className="text-sm font-medium text-slate-700">
            Design Notes
          </label>
          <textarea
            id="designNotes"
            name="designNotes"
            rows={2}
            className="w-full rounded-md border border-slate-300 px-3 py-2"
            placeholder="Keep the tone warm and hopeful. Avoid harsh contrast."
          />
          <p className="text-xs text-slate-500">1-2 sentences.</p>
        </div>
      </div>

      {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-pine px-4 py-2 font-medium text-white disabled:opacity-60"
      >
        {pending ? "Creating project..." : "Create Project"}
      </button>
    </form>
  );
}
