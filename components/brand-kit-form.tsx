"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { saveBrandKitAction, type BrandKitActionState } from "@/app/app/projects/actions";

type TypographyDirection = "match_site" | "graceled_defaults";

type BrandKitFormProps = {
  projectId: string;
  projectTitle: string;
  initialWebsiteUrl?: string;
  initialLogoPath?: string | null;
  initialPalette?: string[];
  initialTypographyDirection?: TypographyDirection;
};

const HEX_COLOR_REGEX = /^#(?:[0-9A-F]{3}|[0-9A-F]{6})$/;
const initialState: BrandKitActionState = {};

function normalizeHex(input: string): string {
  const trimmed = input.trim().toUpperCase();
  if (!trimmed) {
    return trimmed;
  }
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

function toPublicPath(relativePath: string): string {
  return relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
}

export function BrandKitForm({
  projectId,
  projectTitle,
  initialWebsiteUrl,
  initialLogoPath,
  initialPalette = [],
  initialTypographyDirection = "match_site"
}: BrandKitFormProps) {
  const [colors, setColors] = useState<string[]>(initialPalette);
  const [newColor, setNewColor] = useState("");
  const [paletteError, setPaletteError] = useState<string>();
  const [state, action, pending] = useActionState(saveBrandKitAction.bind(null, projectId), initialState);

  const addColor = () => {
    const normalized = normalizeHex(newColor);
    if (!normalized) {
      return;
    }
    if (!HEX_COLOR_REGEX.test(normalized)) {
      setPaletteError("Use a valid hex color, like #14532D.");
      return;
    }
    if (colors.includes(normalized)) {
      setPaletteError("That color is already in your palette.");
      return;
    }

    setColors((current) => [...current, normalized]);
    setNewColor("");
    setPaletteError(undefined);
  };

  const removeColor = (color: string) => {
    setColors((current) => current.filter((item) => item !== color));
    setPaletteError(undefined);
  };

  return (
    <form
      action={action}
      className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step 2 of 2</p>
      <div>
        <h1 className="text-xl font-semibold">Brand Kit</h1>
        <p className="text-sm text-slate-600">Configure the visual direction for {projectTitle}.</p>
      </div>

      <div className="space-y-2">
        <label htmlFor="website_url" className="text-sm font-medium text-slate-700">
          Website URL <span className="text-red-600">*</span>
        </label>
        <input
          id="website_url"
          name="website_url"
          type="text"
          inputMode="url"
          required
          defaultValue={initialWebsiteUrl}
          placeholder="https://yourchurch.org"
          className="w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="logo_upload" className="text-sm font-medium text-slate-700">
          Logo Upload
        </label>
        <input
          id="logo_upload"
          name="logo_upload"
          type="file"
          accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml"
          className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-pine file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
        />
        {initialLogoPath ? (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Current Logo</p>
            <img src={toPublicPath(initialLogoPath)} alt="Current logo" className="mt-2 max-h-14 w-auto" />
          </div>
        ) : null}
      </div>

      <div className="space-y-3">
        <label htmlFor="new_color" className="text-sm font-medium text-slate-700">
          Palette
        </label>
        <div className="flex gap-2">
          <input
            id="new_color"
            value={newColor}
            onChange={(event) => setNewColor(event.target.value)}
            placeholder="#14532D"
            className="flex-1 rounded-md border border-slate-300 px-3 py-2"
          />
          <button
            type="button"
            onClick={addColor}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
          >
            Add
          </button>
        </div>

        {colors.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {colors.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => removeColor(color)}
                className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1 text-sm"
                title="Remove color"
              >
                <span className="h-4 w-4 rounded-full border border-slate-300" style={{ backgroundColor: color }} />
                <span>{color}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No colors added yet.</p>
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor="typography_direction" className="text-sm font-medium text-slate-700">
          Typography Direction
        </label>
        <select
          id="typography_direction"
          name="typography_direction"
          defaultValue={initialTypographyDirection}
          className="w-full rounded-md border border-slate-300 px-3 py-2"
        >
          <option value="match_site">Match site</option>
          <option value="graceled_defaults">GraceLed defaults</option>
        </select>
      </div>

      <input type="hidden" name="palette_json" value={JSON.stringify(colors)} />

      {paletteError ? <p className="text-sm text-red-700">{paletteError}</p> : null}
      {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-pine px-4 py-2 font-medium text-white disabled:opacity-60"
        >
          {pending ? "Saving brand kit..." : "Save Brand Kit"}
        </button>
        <Link href={`/app/projects/${projectId}`} className="text-sm text-slate-600">
          Cancel
        </Link>
      </div>
    </form>
  );
}
