import "server-only";

import { fal } from "@fal-ai/client";

type FluxDevOutput = {
  images: Array<{ url: string }>;
};

export async function generateFalImage(
  prompt: string,
  width: number,
  height: number
): Promise<string> {
  const apiKey = process.env.FAL_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("FAL_API_KEY is not configured");
  }

  fal.config({ credentials: apiKey });

  const result = await fal.subscribe("fal-ai/flux/dev", {
    input: {
      prompt,
      image_size: { width, height },
      num_inference_steps: 28,
      guidance_scale: 3.5,
    },
  });

  const output = (result as { data: FluxDevOutput }).data;
  const imageUrl = output?.images?.[0]?.url;
  if (!imageUrl) {
    throw new Error("fal.ai flux/dev returned no image URL");
  }

  let fetchResponse: Response | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    fetchResponse = await fetch(imageUrl);
    if (fetchResponse.ok) break;
    if (attempt < 3) await new Promise((r) => setTimeout(r, 2000));
  }
  if (!fetchResponse || !fetchResponse.ok) {
    throw new Error(
      `Failed to fetch fal.ai image after 3 attempts: ${fetchResponse?.status} ${fetchResponse?.statusText}`
    );
  }

  const arrayBuffer = await fetchResponse.arrayBuffer();
  return Buffer.from(arrayBuffer).toString("base64");
}
