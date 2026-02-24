import sharp from "sharp";

export const PREVIEW_SHAPES = ["square", "wide", "tall"] as const;
export type PreviewShape = (typeof PREVIEW_SHAPES)[number];

export const PREVIEW_DIMENSIONS: Record<PreviewShape, { width: number; height: number }> = {
  square: { width: 1080, height: 1080 },
  wide: { width: 1920, height: 1080 },
  tall: { width: 1080, height: 1920 }
};

type LockupAlign = "left" | "center" | "right";
export type LockupIntegrationMode = "clean" | "stamp" | "plate" | "mask" | "cutout" | "grid_lock";

const LOCKUP_RENDER_SCALE = 2;
const LOCKUP_TRIM_MARGIN_PCT = 0.03;
const CHANNELS_RGBA = 4;
const LIGHT_BACKGROUND_LUMINANCE_THRESHOLD = 0.6;
const DARK_BACKGROUND_LUMINANCE_THRESHOLD = 0.4;
const MIN_MULTIPLY_CONTRAST_FOR_STAMP = 0.06;

export type LockupSafeRegionRatio = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export const LOCKUP_SAFE_REGION_RATIOS: Record<PreviewShape, LockupSafeRegionRatio> = {
  wide: {
    left: 0.09,
    top: 0.12,
    width: 0.5,
    height: 0.7
  },
  tall: {
    left: 0.11,
    top: 0.08,
    width: 0.78,
    height: 0.34
  },
  square: {
    left: 0.11,
    top: 0.17,
    width: 0.7,
    height: 0.56
  }
};

type RawRgba = {
  data: Buffer;
  width: number;
  height: number;
};

type AlphaBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
  imageWidth: number;
  imageHeight: number;
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

function lockupSafeRegion(
  shape: PreviewShape,
  width: number,
  height: number,
  safeRegionOverride?: LockupSafeRegionRatio
) {
  const ratio = safeRegionOverride || LOCKUP_SAFE_REGION_RATIOS[shape];
  return {
    left: Math.round(width * ratio.left),
    top: Math.round(height * ratio.top),
    width: Math.round(width * ratio.width),
    height: Math.round(height * ratio.height)
  };
}

function luminanceFromRgb(red: number, green: number, blue: number): number {
  return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
}

function averageRegionLuminance(raw: RawRgba, region: { left: number; top: number; width: number; height: number }): number {
  const left = clamp(Math.round(region.left), 0, Math.max(0, raw.width - 1));
  const top = clamp(Math.round(region.top), 0, Math.max(0, raw.height - 1));
  const right = clamp(left + Math.max(1, Math.round(region.width)), left + 1, raw.width);
  const bottom = clamp(top + Math.max(1, Math.round(region.height)), top + 1, raw.height);

  let total = 0;
  let count = 0;

  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const index = (y * raw.width + x) * CHANNELS_RGBA;
      total += luminanceFromRgb(raw.data[index], raw.data[index + 1], raw.data[index + 2]);
      count += 1;
    }
  }

  if (count <= 0) {
    return 0.5;
  }

  return total / count;
}

function integrationPlateTint(isLightBackground: boolean): string {
  return isLightBackground ? "#0F172A" : "#F8FAFC";
}

function integrationPlateOpacity(mode: LockupIntegrationMode, isLightBackground: boolean): number {
  if (mode === "cutout") {
    return isLightBackground ? 0.74 : 0.84;
  }
  if (mode === "mask") {
    return isLightBackground ? 0.42 : 0.54;
  }
  return isLightBackground ? 0.24 : 0.32;
}

function integrationPlateBounds(params: {
  canvasWidth: number;
  canvasHeight: number;
  lockupBounds: AlphaBounds;
  lockupLeft: number;
  lockupTop: number;
  mode: LockupIntegrationMode;
}): { left: number; top: number; width: number; height: number; radius: number } {
  const padScale = params.mode === "cutout" ? 0.26 : params.mode === "mask" ? 0.22 : 0.18;
  const padX = clamp(Math.round(params.lockupBounds.width * padScale), 10, Math.round(params.canvasWidth * 0.09));
  const padY = clamp(Math.round(params.lockupBounds.height * (padScale + 0.05)), 10, Math.round(params.canvasHeight * 0.09));
  const anchorLeft = params.lockupLeft + params.lockupBounds.left;
  const anchorTop = params.lockupTop + params.lockupBounds.top;
  const anchorRight = anchorLeft + params.lockupBounds.width;
  const anchorBottom = anchorTop + params.lockupBounds.height;
  const left = clamp(anchorLeft - padX, 0, Math.max(0, params.canvasWidth - 1));
  const top = clamp(anchorTop - padY, 0, Math.max(0, params.canvasHeight - 1));
  const right = clamp(anchorRight + padX, left + 1, params.canvasWidth);
  const bottom = clamp(anchorBottom + padY, top + 1, params.canvasHeight);
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);
  const radius = clamp(Math.round(Math.min(width, height) * 0.16), 8, 64);
  return { left, top, width, height, radius };
}

async function buildTitleIntegrationOverlay(params: {
  canvasWidth: number;
  canvasHeight: number;
  lockupPng: Buffer;
  lockupLeft: number;
  lockupTop: number;
  mode: "plate" | "mask" | "cutout";
  isLightBackground: boolean;
}): Promise<Buffer | null> {
  const bounds = await findAlphaBounds(params.lockupPng);
  if (!bounds) {
    return null;
  }
  const plate = integrationPlateBounds({
    canvasWidth: params.canvasWidth,
    canvasHeight: params.canvasHeight,
    lockupBounds: bounds,
    lockupLeft: params.lockupLeft,
    lockupTop: params.lockupTop,
    mode: params.mode
  });
  const fill = integrationPlateTint(params.isLightBackground);
  const opacity = integrationPlateOpacity(params.mode, params.isLightBackground);
  const plateSvg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${params.canvasWidth}" height="${params.canvasHeight}" viewBox="0 0 ${params.canvasWidth} ${params.canvasHeight}">`,
    `<rect x="${plate.left}" y="${plate.top}" width="${plate.width}" height="${plate.height}" rx="${plate.radius}" ry="${plate.radius}" fill="${fill}" fill-opacity="${opacity.toFixed(3)}" />`,
    "</svg>"
  ].join("");
  const platePng = await sharp(Buffer.from(plateSvg), { failOn: "none" })
    .png()
    .toBuffer();
  if (params.mode === "mask" || params.mode === "cutout") {
    return sharp(platePng, { failOn: "none" })
      .composite([
        {
          input: params.lockupPng,
          left: params.lockupLeft,
          top: params.lockupTop,
          blend: "dest-out"
        }
      ])
      .png()
      .toBuffer();
  }
  return platePng;
}

function estimateMultiplyContrast(params: { backgroundRaw: RawRgba; lockupRaw: RawRgba; left: number; top: number }): number {
  const left = clamp(Math.round(params.left), 0, Math.max(0, params.backgroundRaw.width - params.lockupRaw.width));
  const top = clamp(Math.round(params.top), 0, Math.max(0, params.backgroundRaw.height - params.lockupRaw.height));
  let totalDelta = 0;
  let totalWeight = 0;

  for (let y = 0; y < params.lockupRaw.height; y += 1) {
    for (let x = 0; x < params.lockupRaw.width; x += 1) {
      const lockupIndex = (y * params.lockupRaw.width + x) * CHANNELS_RGBA;
      const sourceAlpha = params.lockupRaw.data[lockupIndex + 3] / 255;
      if (sourceAlpha <= 0.01) {
        continue;
      }

      const backgroundIndex = ((top + y) * params.backgroundRaw.width + (left + x)) * CHANNELS_RGBA;
      const backgroundLuminance = luminanceFromRgb(
        params.backgroundRaw.data[backgroundIndex],
        params.backgroundRaw.data[backgroundIndex + 1],
        params.backgroundRaw.data[backgroundIndex + 2]
      );
      const lockupLuminance = luminanceFromRgb(
        params.lockupRaw.data[lockupIndex],
        params.lockupRaw.data[lockupIndex + 1],
        params.lockupRaw.data[lockupIndex + 2]
      );

      const multiplyLuminance = backgroundLuminance * (1 - sourceAlpha * (1 - lockupLuminance));
      const delta = Math.abs(backgroundLuminance - multiplyLuminance);
      totalDelta += delta * sourceAlpha;
      totalWeight += sourceAlpha;
    }
  }

  if (totalWeight <= 0) {
    return 0;
  }

  return totalDelta / totalWeight;
}

async function resolveImageSize(png: Buffer): Promise<{ width: number; height: number }> {
  const metadata = await sharp(png, { failOn: "none" }).metadata();
  return {
    width: Math.max(1, Math.round(metadata.width || 1)),
    height: Math.max(1, Math.round(metadata.height || 1))
  };
}

function parseNumericDimension(value: string): number | null {
  const match = value.match(/^\s*([0-9]+(?:\.[0-9]+)?)\s*(?:px)?\s*$/i);
  if (!match) {
    return null;
  }
  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function extractSvgDimensions(svg: string): { width: number; height: number } | null {
  const svgTagMatch = svg.match(/<svg\b[^>]*>/i);
  if (!svgTagMatch) {
    return null;
  }
  const tag = svgTagMatch[0];
  const widthAttr = tag.match(/\bwidth\s*=\s*"([^"]+)"/i)?.[1] || tag.match(/\bwidth\s*=\s*'([^']+)'/i)?.[1];
  const heightAttr = tag.match(/\bheight\s*=\s*"([^"]+)"/i)?.[1] || tag.match(/\bheight\s*=\s*'([^']+)'/i)?.[1];

  const width = widthAttr ? parseNumericDimension(widthAttr) : null;
  const height = heightAttr ? parseNumericDimension(heightAttr) : null;
  if (width && height) {
    return { width, height };
  }

  const viewBoxMatch = tag.match(/\bviewBox\s*=\s*"([^"]+)"/i) || tag.match(/\bviewBox\s*=\s*'([^']+)'/i);
  if (!viewBoxMatch?.[1]) {
    return null;
  }
  const parts = viewBoxMatch[1].trim().split(/[\s,]+/).map((part) => Number.parseFloat(part));
  if (parts.length !== 4 || !parts.every((part) => Number.isFinite(part))) {
    return null;
  }
  const viewWidth = parts[2];
  const viewHeight = parts[3];
  if (viewWidth <= 0 || viewHeight <= 0) {
    return null;
  }
  return { width: viewWidth, height: viewHeight };
}

async function toRawRgba(input: Buffer): Promise<RawRgba> {
  const { data, info } = await sharp(input, { failOn: "none" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    data,
    width: Math.max(1, Math.round(info.width || 1)),
    height: Math.max(1, Math.round(info.height || 1))
  };
}

function premultiplyRgba(data: Buffer): Buffer {
  const output = Buffer.from(data);
  for (let index = 0; index < output.length; index += CHANNELS_RGBA) {
    const alpha = output[index + 3];
    if (alpha >= 255) {
      continue;
    }
    if (alpha <= 0) {
      output[index] = 0;
      output[index + 1] = 0;
      output[index + 2] = 0;
      continue;
    }
    output[index] = Math.round((output[index] * alpha) / 255);
    output[index + 1] = Math.round((output[index + 1] * alpha) / 255);
    output[index + 2] = Math.round((output[index + 2] * alpha) / 255);
  }
  return output;
}

function unpremultiplyRgba(data: Buffer): Buffer {
  const output = Buffer.from(data);
  for (let index = 0; index < output.length; index += CHANNELS_RGBA) {
    const alpha = output[index + 3];
    if (alpha >= 255) {
      continue;
    }
    if (alpha <= 0) {
      output[index] = 0;
      output[index + 1] = 0;
      output[index + 2] = 0;
      continue;
    }
    output[index] = clamp(Math.round((output[index] * 255) / alpha), 0, 255);
    output[index + 1] = clamp(Math.round((output[index + 1] * 255) / alpha), 0, 255);
    output[index + 2] = clamp(Math.round((output[index + 2] * 255) / alpha), 0, 255);
  }
  return output;
}

async function resizeWithSafeAlpha(inputPng: Buffer, width: number, height: number): Promise<Buffer> {
  const raw = await toRawRgba(inputPng);
  const premultiplied = premultiplyRgba(raw.data);
  const resizedPremultiplied = await sharp(premultiplied, {
    raw: {
      width: raw.width,
      height: raw.height,
      channels: CHANNELS_RGBA
    },
    failOn: "none"
  })
    .resize({
      width,
      height,
      fit: "contain",
      kernel: sharp.kernel.lanczos3
    })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const unpremultiplied = unpremultiplyRgba(resizedPremultiplied.data);
  return sharp(unpremultiplied, {
    raw: {
      width: Math.max(1, Math.round(resizedPremultiplied.info.width || width)),
      height: Math.max(1, Math.round(resizedPremultiplied.info.height || height)),
      channels: CHANNELS_RGBA
    },
    failOn: "none"
  })
    .png()
    .toBuffer();
}

async function findAlphaBounds(inputPng: Buffer): Promise<AlphaBounds | null> {
  const raw = await toRawRgba(inputPng);
  let minX = raw.width;
  let minY = raw.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < raw.height; y += 1) {
    for (let x = 0; x < raw.width; x += 1) {
      const index = (y * raw.width + x) * CHANNELS_RGBA + 3;
      if (raw.data[index] <= 0) {
        continue;
      }
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) {
    return null;
  }

  return {
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    imageWidth: raw.width,
    imageHeight: raw.height
  };
}

async function trimPngWithAlphaMargin(inputPng: Buffer, marginPct: number): Promise<{ png: Buffer; width: number; height: number }> {
  const bounds = await findAlphaBounds(inputPng);
  if (!bounds) {
    const size = await resolveImageSize(inputPng);
    return {
      png: inputPng,
      width: size.width,
      height: size.height
    };
  }

  const maxDim = Math.max(bounds.width, bounds.height);
  const minMargin = Math.max(1, Math.round(maxDim * 0.02));
  const maxMargin = Math.max(minMargin, Math.round(maxDim * 0.04));
  const margin = clamp(Math.round(maxDim * marginPct), minMargin, maxMargin);
  const left = clamp(bounds.left - margin, 0, Math.max(0, bounds.imageWidth - 1));
  const top = clamp(bounds.top - margin, 0, Math.max(0, bounds.imageHeight - 1));
  const right = clamp(bounds.left + bounds.width + margin, 1, bounds.imageWidth);
  const bottom = clamp(bounds.top + bounds.height + margin, 1, bounds.imageHeight);
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);

  const trimmed = await sharp(inputPng, { failOn: "none" })
    .extract({ left, top, width, height })
    .png()
    .toBuffer();

  return {
    png: trimmed,
    width,
    height
  };
}

async function buildSubtleShadow(
  lockupPng: Buffer,
  options?: { alphaScale?: number; blurRadius?: number }
): Promise<Buffer> {
  const raw = await toRawRgba(lockupPng);
  const alphaScale = clamp(options?.alphaScale ?? 0.18, 0, 1);
  const blurRadius = Math.max(0.6, options?.blurRadius ?? 1.4);
  const shadowRaw = Buffer.alloc(raw.data.length);
  for (let index = 0; index < raw.data.length; index += CHANNELS_RGBA) {
    const alpha = raw.data[index + 3];
    shadowRaw[index] = 0;
    shadowRaw[index + 1] = 0;
    shadowRaw[index + 2] = 0;
    shadowRaw[index + 3] = Math.round(alpha * alphaScale);
  }

  return sharp(shadowRaw, {
    raw: {
      width: raw.width,
      height: raw.height,
      channels: CHANNELS_RGBA
    },
    failOn: "none"
  })
    .blur(blurRadius)
    .png()
    .toBuffer();
}

async function buildSubtleLightOuterGlow(
  lockupPng: Buffer,
  options?: { alphaScale?: number; blurRadius?: number; innerCut?: number }
): Promise<Buffer> {
  const raw = await toRawRgba(lockupPng);
  const alphaScale = clamp(options?.alphaScale ?? 0.16, 0, 1);
  const blurRadius = Math.max(0.8, options?.blurRadius ?? 1.9);
  const innerCut = clamp(options?.innerCut ?? 0.74, 0, 1);
  const alphaMask = Buffer.alloc(raw.width * raw.height);

  for (let y = 0; y < raw.height; y += 1) {
    for (let x = 0; x < raw.width; x += 1) {
      const pixelIndex = y * raw.width + x;
      alphaMask[pixelIndex] = raw.data[pixelIndex * CHANNELS_RGBA + 3];
    }
  }

  const blurred = await sharp(alphaMask, {
    raw: {
      width: raw.width,
      height: raw.height,
      channels: 1
    },
    failOn: "none"
  })
    .blur(blurRadius)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const glowRaw = Buffer.alloc(raw.data.length);
  for (let index = 0; index < raw.data.length; index += CHANNELS_RGBA) {
    const pixelIndex = index / CHANNELS_RGBA;
    const originalAlpha = alphaMask[pixelIndex];
    const blurredAlpha = blurred.data[pixelIndex];
    const outerAlpha = clamp(Math.round((blurredAlpha - originalAlpha * innerCut) * alphaScale), 0, 255);
    glowRaw[index] = 255;
    glowRaw[index + 1] = 255;
    glowRaw[index + 2] = 255;
    glowRaw[index + 3] = outerAlpha;
  }

  return sharp(glowRaw, {
    raw: {
      width: raw.width,
      height: raw.height,
      channels: CHANNELS_RGBA
    },
    failOn: "none"
  })
    .png()
    .toBuffer();
}

async function scaleOverlayAlpha(lockupPng: Buffer, factor: number): Promise<Buffer> {
  const raw = await toRawRgba(lockupPng);
  const output = Buffer.from(raw.data);
  for (let index = 0; index < output.length; index += CHANNELS_RGBA) {
    output[index + 3] = clamp(Math.round(output[index + 3] * factor), 0, 255);
  }
  return sharp(output, {
    raw: {
      width: raw.width,
      height: raw.height,
      channels: CHANNELS_RGBA
    },
    failOn: "none"
  })
    .png()
    .toBuffer();
}

export async function renderTrimmedLockupPngFromSvg(svg: string): Promise<{ png: Buffer; width: number; height: number }> {
  const svgDimensions = extractSvgDimensions(svg);
  const renderTarget = svgDimensions
    ? {
        width: Math.max(1, Math.round(svgDimensions.width * LOCKUP_RENDER_SCALE)),
        height: Math.max(1, Math.round(svgDimensions.height * LOCKUP_RENDER_SCALE))
      }
    : null;

  const basePng = await sharp(Buffer.from(svg), { failOn: "none" })
    .resize(
      renderTarget
        ? {
            width: renderTarget.width,
            height: renderTarget.height,
            fit: "fill",
            kernel: sharp.kernel.lanczos3
          }
        : undefined
    )
    .png()
    .toBuffer();

  return trimPngWithAlphaMargin(basePng, LOCKUP_TRIM_MARGIN_PCT);
}

export async function composeLockupOnBackground(params: {
  backgroundPng: Buffer;
  lockupPng: Buffer;
  shape: PreviewShape;
  width: number;
  height: number;
  align?: LockupAlign;
  integrationMode?: LockupIntegrationMode;
  safeRegionOverride?: LockupSafeRegionRatio;
}): Promise<Buffer> {
  const safeRegion = lockupSafeRegion(params.shape, params.width, params.height, params.safeRegionOverride);
  const backgroundCanvas = await sharp(params.backgroundPng, { failOn: "none" })
    .ensureAlpha()
    .resize({
      width: params.width,
      height: params.height,
      fit: "fill",
      position: "center",
      kernel: sharp.kernel.lanczos3
    })
    .png()
    .toBuffer();
  const backgroundRaw = await toRawRgba(backgroundCanvas);
  const lockupSize = await resolveImageSize(params.lockupPng);
  const safeWidth = Math.max(1, safeRegion.width);
  const safeHeight = Math.max(1, safeRegion.height);
  const scale = clamp(
    Math.min(safeWidth / Math.max(1, lockupSize.width), safeHeight / Math.max(1, lockupSize.height)),
    0.1,
    4
  );
  const targetWidth = Math.max(1, Math.round(lockupSize.width * scale));
  const targetHeight = Math.max(1, Math.round(lockupSize.height * scale));
  // Resize in premultiplied space so antialiasing doesn't create matte halos on transparent edges.
  const resizedLockup = await resizeWithSafeAlpha(params.lockupPng, targetWidth, targetHeight);

  const align = params.align || "left";
  const left =
    align === "center"
      ? safeRegion.left + Math.round((safeWidth - targetWidth) / 2)
      : align === "right"
        ? safeRegion.left + (safeWidth - targetWidth)
        : safeRegion.left;
  const top = safeRegion.top + Math.round((safeHeight - targetHeight) / 2);
  let safeLeft = clamp(left, 0, Math.max(0, params.width - targetWidth));
  let safeTop = clamp(top, 0, Math.max(0, params.height - targetHeight));
  const integrationMode = params.integrationMode || "clean";
  if (integrationMode === "grid_lock") {
    const gridUnit = Math.max(8, Math.round(Math.min(safeWidth, safeHeight) * 0.05));
    safeLeft = clamp(Math.round(safeLeft / gridUnit) * gridUnit, 0, Math.max(0, params.width - targetWidth));
    safeTop = clamp(Math.round(safeTop / gridUnit) * gridUnit, 0, Math.max(0, params.height - targetHeight));
  }
  const averageBackgroundLuminance = averageRegionLuminance(backgroundRaw, {
    left: safeLeft,
    top: safeTop,
    width: targetWidth,
    height: targetHeight
  });
  const isLightBackground = averageBackgroundLuminance > LIGHT_BACKGROUND_LUMINANCE_THRESHOLD;
  const isDarkBackground = averageBackgroundLuminance < DARK_BACKGROUND_LUMINANCE_THRESHOLD;
  const overlays: sharp.OverlayOptions[] = [];
  let usesKnockoutIntegration = false;

  if (integrationMode === "plate" || integrationMode === "mask" || integrationMode === "cutout") {
    const integrationOverlay = await buildTitleIntegrationOverlay({
      canvasWidth: params.width,
      canvasHeight: params.height,
      lockupPng: resizedLockup,
      lockupLeft: safeLeft,
      lockupTop: safeTop,
      mode: integrationMode,
      isLightBackground
    });
    if (integrationOverlay) {
      overlays.push({
        input: integrationOverlay,
        blend: "over"
      });
      usesKnockoutIntegration = integrationMode === "mask" || integrationMode === "cutout";
    }
  }

  const applyLegibleNormalBlend = async (sourceLockupPng: Buffer) => {
    if (isDarkBackground) {
      const glow = await buildSubtleLightOuterGlow(sourceLockupPng, {
        alphaScale: 0.16,
        blurRadius: 1.9,
        innerCut: 0.74
      });
      overlays.push({
        input: glow,
        left: safeLeft,
        top: safeTop,
        blend: "over"
      });
    }

    const shadow = await buildSubtleShadow(sourceLockupPng, {
      alphaScale: isLightBackground ? 0.24 : 0.18,
      blurRadius: isLightBackground ? 1.6 : 1.4
    });
    overlays.push({
      input: shadow,
      left: clamp(safeLeft + 1, 0, Math.max(0, params.width - targetWidth)),
      top: clamp(safeTop + 1, 0, Math.max(0, params.height - targetHeight)),
      blend: "over"
    });
    overlays.push({
      input: sourceLockupPng,
      left: safeLeft,
      top: safeTop,
      blend: "over"
    });
  };

  if (integrationMode === "stamp") {
    const stampLockup = await scaleOverlayAlpha(resizedLockup, 0.94);
    const stampRaw = await toRawRgba(stampLockup);
    const estimatedMultiplyContrast = estimateMultiplyContrast({
      backgroundRaw,
      lockupRaw: stampRaw,
      left: safeLeft,
      top: safeTop
    });
    if (estimatedMultiplyContrast < MIN_MULTIPLY_CONTRAST_FOR_STAMP) {
      await applyLegibleNormalBlend(resizedLockup);
    } else {
      overlays.push({
        input: stampLockup,
        left: safeLeft,
        top: safeTop,
        blend: "multiply"
      });
    }
  } else if (integrationMode === "mask" || integrationMode === "cutout") {
    if (!usesKnockoutIntegration) {
      await applyLegibleNormalBlend(resizedLockup);
    }
  } else {
    await applyLegibleNormalBlend(resizedLockup);
  }

  return sharp(backgroundCanvas, { failOn: "none" })
    .composite(overlays)
    .png()
    .toBuffer();
}
