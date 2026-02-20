import sharp from "sharp";

export type FocalPoint = {
  x: number;
  y: number;
};

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function normalizeFocalPoint(focalPoint: FocalPoint | undefined): FocalPoint {
  return {
    x: clamp(focalPoint?.x ?? 0.5, 0, 1),
    y: clamp(focalPoint?.y ?? 0.5, 0, 1)
  };
}

function resolveCoverCrop(params: {
  sourceWidth: number;
  sourceHeight: number;
  targetWidth: number;
  targetHeight: number;
  focalPoint?: FocalPoint;
}): { left: number; top: number; width: number; height: number } {
  const sourceWidth = Math.max(1, Math.round(params.sourceWidth));
  const sourceHeight = Math.max(1, Math.round(params.sourceHeight));
  const targetWidth = Math.max(1, Math.round(params.targetWidth));
  const targetHeight = Math.max(1, Math.round(params.targetHeight));

  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = targetWidth / targetHeight;

  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;

  if (sourceRatio > targetRatio) {
    cropWidth = Math.max(1, Math.round(sourceHeight * targetRatio));
  } else if (sourceRatio < targetRatio) {
    cropHeight = Math.max(1, Math.round(sourceWidth / targetRatio));
  }

  const focal = normalizeFocalPoint(params.focalPoint);
  const focalX = Math.round(focal.x * sourceWidth);
  const focalY = Math.round(focal.y * sourceHeight);

  const left = clamp(Math.round(focalX - cropWidth / 2), 0, Math.max(0, sourceWidth - cropWidth));
  const top = clamp(Math.round(focalY - cropHeight / 2), 0, Math.max(0, sourceHeight - cropHeight));

  return {
    left,
    top,
    width: cropWidth,
    height: cropHeight
  };
}

export async function resizeCoverWithFocalPoint(params: {
  input: Buffer;
  width: number;
  height: number;
  focalPoint?: FocalPoint;
}): Promise<Buffer> {
  const width = Math.max(1, Math.round(params.width));
  const height = Math.max(1, Math.round(params.height));

  const metadata = await sharp(params.input, { failOn: "none" }).metadata();
  const sourceWidth = metadata.width;
  const sourceHeight = metadata.height;

  if (!sourceWidth || !sourceHeight) {
    return sharp(params.input, { failOn: "none" })
      .resize({
        width,
        height,
        fit: "cover",
        position: "center"
      })
      .png()
      .toBuffer();
  }

  const crop = resolveCoverCrop({
    sourceWidth,
    sourceHeight,
    targetWidth: width,
    targetHeight: height,
    focalPoint: params.focalPoint
  });

  return sharp(params.input, { failOn: "none" })
    .extract(crop)
    .resize({
      width,
      height,
      fit: "fill"
    })
    .png()
    .toBuffer();
}
