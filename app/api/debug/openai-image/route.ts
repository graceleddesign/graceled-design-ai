import { generatePngFromPrompt } from "@/lib/openai-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return Response.json({ error: "missing key" }, { status: 500 });
  }

  try {
    const pngBuffer = await generatePngFromPrompt({
      prompt:
        "Draw a premium, modern, minimal sermon series graphic background. no text, no letters, no words, no typography, no signage, no watermarks. Subtle gradient + clean shapes.",
      size: "1024x1024",
      quality: "medium"
    });

    return new Response(new Uint8Array(pngBuffer), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "OpenAI image generation failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
