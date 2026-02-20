export type StyleDirection =
  | "SURPRISE"
  | "MINIMAL"
  | "PHOTO"
  | "ILLUSTRATION"
  | "ABSTRACT"
  | "BOLD_TYPE"
  | "SEASONAL";

export const STYLE_DIRECTION_OPTIONS: ReadonlyArray<{ value: StyleDirection; label: string }> = [
  { value: "SURPRISE", label: "Surprise me" },
  { value: "MINIMAL", label: "Minimal" },
  { value: "PHOTO", label: "Photo" },
  { value: "ILLUSTRATION", label: "Illustration" },
  { value: "ABSTRACT", label: "Abstract" },
  { value: "BOLD_TYPE", label: "Bold Type" },
  { value: "SEASONAL", label: "Seasonal" }
];

export function normalizeStyleDirection(value: unknown): StyleDirection {
  if (typeof value !== "string") {
    return "SURPRISE";
  }

  const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, "_");

  if (normalized === "MINIMAL") {
    return "MINIMAL";
  }
  if (normalized === "PHOTO") {
    return "PHOTO";
  }
  if (normalized === "ILLUSTRATION") {
    return "ILLUSTRATION";
  }
  if (normalized === "ABSTRACT") {
    return "ABSTRACT";
  }
  if (normalized === "BOLD_TYPE") {
    return "BOLD_TYPE";
  }
  if (normalized === "SEASONAL") {
    return "SEASONAL";
  }

  if (normalized === "OPTION_A" || normalized === "OPTION_B" || normalized === "OPTION_C" || normalized === "DIFFERENT") {
    return "SURPRISE";
  }

  return "SURPRISE";
}
