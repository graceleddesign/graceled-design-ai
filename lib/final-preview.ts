import sharp from "sharp";
import type { DesignDoc } from "@/lib/design-doc";
import { buildFinalSvg } from "@/lib/final-deliverables";
import { resizeCoverWithFocalPoint } from "@/lib/image-cover";

function normalizeDimension(value: number): number {
  if (!Number.isFinite(value) || Number.isNaN(value)) {
    return 1;
  }

  return Math.max(1, Math.round(value));
}

export async function renderPreviewPng(params: {
  designDoc: DesignDoc;
  backgroundPngBuffer: Buffer;
  outputWidth: number;
  outputHeight: number;
}): Promise<Buffer> {
  const width = normalizeDimension(params.outputWidth);
  const height = normalizeDimension(params.outputHeight);

  const resizedBackground = await resizeCoverWithFocalPoint({
    input: params.backgroundPngBuffer,
    width,
    height
  });

  const overlaySvg = await buildFinalSvg(params.designDoc, {
    includeBackground: false,
    includeImages: false
  });
  const overlayPng = await sharp(Buffer.from(overlaySvg))
    .resize({
      width,
      height,
      fit: "fill"
    })
    .png()
    .toBuffer();

  return sharp(resizedBackground)
    .composite([{ input: overlayPng, top: 0, left: 0 }])
    .png()
    .toBuffer();
}
