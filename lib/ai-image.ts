import OpenAI from "openai";

type Shape = "square" | "wide" | "tall";

const SIZE_BY_SHAPE = {
  square: "1024x1024",
  wide: "1536x1024",
  tall: "1024x1536"
} as const;

const PROMPT_BY_PRESET: Record<string, string> = {
  type_clean_min_v1:
    "Clean minimal editorial design background, subtle paper grain, thin rules, modern layout cues, lots of negative space, one accent color.",
  abstract_gradient_modern_v1: "Modern smooth gradient field with soft grain and subtle lighting.",
  geo_shapes_negative_v1: "Bold geometric negative-space shapes, modern style, subtle texture.",
  mark_icon_abstract_v1: "Abstract non-religious generic symbol or mark with tasteful texture, centered or off-center.",
  illus_flat_min_v1: "Minimal flat illustration elements with simple shapes, tasteful and modern, not childish.",
  photo_color_block_v1:
    "Cinematic photographic-style synthetic background with an area of calm negative space for typography."
};

function buildPrompt(params: {
  presetKey: string;
  seriesTitle: string;
  seriesSubtitle?: string | null;
  scripture?: string | null;
  palette?: string[];
}): string {
  const artDirection =
    PROMPT_BY_PRESET[params.presetKey] ||
    "Modern church-appropriate abstract background with intentional composition, tasteful texture, and clear negative space for typography.";
  const paletteHint =
    params.palette && params.palette.length > 0
      ? `Color palette guidance: ${params.palette.join(", ")}.`
      : "Color palette guidance: refined modern neutrals with one tasteful accent.";

  const hints = [params.seriesSubtitle, params.scripture]
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    .join(" | ");
  const thematicHint = hints ? `Supplemental theme hints: ${hints}.` : "";

  return [
    "Create high-quality background art for a sermon series design preview.",
    artDirection,
    "Visual intent: PixelPreacher/SundaySocial quality, clean, intentional, premium, church-appropriate, and contemporary.",
    paletteHint,
    `Theme inspired by: ${params.seriesTitle}.`,
    thematicHint,
    "NO TEXT. Do not include any words, letters, numbers, logos, symbols with text, or watermarks."
  ]
    .filter(Boolean)
    .join(" ");
}

export async function generateBackgroundPng(params: {
  presetKey: string;
  shape: Shape;
  seriesTitle: string;
  seriesSubtitle?: string | null;
  scripture?: string | null;
  palette?: string[];
}): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const client = new OpenAI({ apiKey });
  const prompt = buildPrompt(params);
  const result = await client.images.generate({
    model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1-mini",
    prompt,
    size: SIZE_BY_SHAPE[params.shape],
    quality: (process.env.OPENAI_IMAGE_QUALITY as "low" | "medium" | "high" | "auto") ?? "medium",
    response_format: "b64_json"
  });

  const b64 = result.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error("No image returned");
  }

  return Buffer.from(b64, "base64");
}

export type { Shape };
