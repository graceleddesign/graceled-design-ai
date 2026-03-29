import {
  normalizeImageProviderError,
  preflightImageProvider,
  resolveImageProviderConfig
} from "@/lib/image-provider";
import { generatePngFromPrompt } from "@/lib/openai-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const preflightOnly = url.searchParams.get("preflight") === "1";
  const simulate = url.searchParams.get("simulate");
  const overrideModel = url.searchParams.get("model")?.trim() || "";
  const originalModel = process.env.OPENAI_IMAGE_MODEL;

  try {
    if (overrideModel) {
      process.env.OPENAI_IMAGE_MODEL = overrideModel;
    }

    if (simulate === "rate_limit") {
      const simulatedError = normalizeImageProviderError({
        status: 429,
        message: "Simulated rate limit for debug verification"
      });
      return Response.json(
        {
          ok: false,
          simulated: true,
          provider: simulatedError.provider,
          model: simulatedError.model,
          providerPath: simulatedError.providerPath,
          failureReason: simulatedError.failureReason,
          message: simulatedError.message
        },
        { status: 429 }
      );
    }

    if (preflightOnly) {
      const result = await preflightImageProvider({ ttlMs: 0 });
      const config = resolveImageProviderConfig();
      return Response.json({
        ...result,
        config: {
          provider: config.provider,
          model: config.model,
          providerPath: config.providerPath,
          usingDefaultModel: config.usingDefaultModel
        }
      });
    }

    if (!process.env.OPENAI_API_KEY?.trim()) {
      return Response.json({ error: "missing key" }, { status: 500 });
    }

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
    const normalizedError = normalizeImageProviderError(error);
    return Response.json(
      {
        error: normalizedError.message,
        failureReason: normalizedError.failureReason,
        provider: normalizedError.provider,
        model: normalizedError.model,
        providerPath: normalizedError.providerPath
      },
      { status: normalizedError.status || 500 }
    );
  } finally {
    if (overrideModel) {
      if (typeof originalModel === "string") {
        process.env.OPENAI_IMAGE_MODEL = originalModel;
      } else {
        delete process.env.OPENAI_IMAGE_MODEL;
      }
    }
  }
}
