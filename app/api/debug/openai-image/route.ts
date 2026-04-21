import {
  extractGeneratedImageB64,
  normalizeImageProviderError,
  PREFLIGHT_PROMPT,
  preflightImageProvider,
  resolveImageProviderConfig
} from "@/lib/image-provider";
import { getOpenAI } from "@/lib/openai";
import { generatePngFromPrompt } from "@/lib/openai-image";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode");
  const preflightOnly = url.searchParams.get("preflight") === "1";
  const simulate = url.searchParams.get("simulate");
  const overrideModel = url.searchParams.get("model")?.trim() || "";
  const originalModel = process.env.OPENAI_IMAGE_MODEL;

  try {
    if (overrideModel) {
      process.env.OPENAI_IMAGE_MODEL = overrideModel;
    }

    if (mode === "eval") {
      if (!process.env.OPENAI_API_KEY?.trim()) {
        return Response.json({ error: "missing key" }, { status: 500 });
      }
      const config = resolveImageProviderConfig();
      const response = await getOpenAI().images.generate({
        model: config.model,
        quality: "medium",
        size: "1024x1024",
        prompt: "Abstract atmospheric background for a church sermon series. Rich tonal depth, painterly texture, symbolic motifs suggesting light and redemption. No text, no letters, no words, no logos.",
        n: 1,
        background: "opaque"
      });
      const b64 = extractGeneratedImageB64(response);
      const imageBuffer = Buffer.from(b64, "base64");

      const { runDebugScaffoldCheck, runDebugTextCheck } = await import("@/app/app/projects/generation-actions.impl");
      const [scaffoldResult, textResult] = await Promise.all([
        runDebugScaffoldCheck(imageBuffer),
        runDebugTextCheck(imageBuffer)
      ]);

      return Response.json({
        model: config.model,
        quality: "medium",
        imageSizeBytes: imageBuffer.length,
        luminanceStdDev: scaffoldResult.luminanceStdDev,
        edgeDensity: scaffoldResult.edgeDensity,
        meanLuminance: scaffoldResult.meanLuminance,
        meanSaturation: scaffoldResult.meanSaturation,
        motifEdgeRatio: scaffoldResult.motifEdgeRatio,
        scaffoldFree: scaffoldResult.scaffoldFree,
        scaffoldFailReason: scaffoldResult.scaffoldFailReason,
        manualLuminanceStdDev: scaffoldResult.manualLuminanceStdDev,
        pass1ComponentCount: textResult.pass1ComponentCount,
        pass2ComponentCount: textResult.pass2ComponentCount,
        textFree: textResult.textFree,
        textFailReason: textResult.textFailReason,
        overallPass: scaffoldResult.scaffoldFree && textResult.textFree
      });
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
