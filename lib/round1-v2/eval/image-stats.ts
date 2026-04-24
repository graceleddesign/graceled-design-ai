import sharp from "sharp";

// Sample size for pixel analysis — matches V1 for calibration consistency.
const SAMPLE_SIZE = 64;

// Sobel-like gradient threshold — matches V1.
const EDGE_MAGNITUDE_THRESHOLD = 68;

export interface ScoutImageStats {
  sampleCount: number;
  meanLuminance: number;    // 0–255
  meanSaturation: number;  // 0–255
  sepiaLikelihood: number; // 0–1
  luminanceStdDev: number;
  edgeDensity: number;     // fraction of edge-sample pixels above gradient threshold
}

function rgbToHSV(r: number, g: number, b: number): { hue: number; saturation: number } {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  const saturation = max <= 0 ? 0 : (delta / max) * 255;
  if (delta <= 0) return { hue: 0, saturation };
  let hue = 0;
  if (max === rn) hue = 60 * (((gn - bn) / delta) % 6);
  else if (max === gn) hue = 60 * ((bn - rn) / delta + 2);
  else hue = 60 * ((rn - gn) / delta + 4);
  if (hue < 0) hue += 360;
  return { hue, saturation };
}

export async function computeScoutImageStats(imageBytes: Buffer): Promise<ScoutImageStats | null> {
  try {
    const { data, info } = await sharp(imageBytes, { failOn: "none" })
      .resize({ width: SAMPLE_SIZE, height: SAMPLE_SIZE, fit: "fill" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const w = Math.max(1, info.width || SAMPLE_SIZE);
    const h = Math.max(1, info.height || SAMPLE_SIZE);
    const ch = Math.max(4, info.channels || 4);
    const total = w * h;
    const lum = new Float32Array(total);
    const opaque = new Uint8Array(total);

    let sampleCount = 0, lumSum = 0, satSum = 0, sepiaCount = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const pi = y * w + x;
        const off = pi * ch;
        const alpha = data[off + 3];
        const r = data[off], g = data[off + 1], b = data[off + 2];
        const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        lum[pi] = l;
        if (alpha <= 10) continue;
        opaque[pi] = 1;
        const { hue, saturation } = rgbToHSV(r, g, b);
        sampleCount++;
        lumSum += l;
        satSum += saturation;
        if (hue >= 15 && hue <= 55 && saturation >= 20 && saturation <= 120 && l > 120) sepiaCount++;
      }
    }

    if (sampleCount === 0) return null;
    const meanLuminance = lumSum / sampleCount;

    let varSum = 0;
    for (let i = 0; i < total; i++) {
      if (!opaque[i]) continue;
      const d = lum[i] - meanLuminance;
      varSum += d * d;
    }
    const luminanceStdDev = Math.sqrt(varSum / sampleCount);

    let edgeCount = 0, edgeSamples = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (!opaque[i] || !opaque[i - 1] || !opaque[i + 1] || !opaque[i - w] || !opaque[i + w]) continue;
        edgeSamples++;
        const gx = Math.abs(lum[i + 1] - lum[i - 1]);
        const gy = Math.abs(lum[i + w] - lum[i - w]);
        if (gx + gy >= EDGE_MAGNITUDE_THRESHOLD) edgeCount++;
      }
    }

    return {
      sampleCount,
      meanLuminance,
      meanSaturation: satSum / sampleCount,
      sepiaLikelihood: sepiaCount / sampleCount,
      luminanceStdDev,
      edgeDensity: edgeSamples > 0 ? edgeCount / edgeSamples : 0,
    };
  } catch {
    return null;
  }
}

// Simplified text-artifact detection for scouts.
// Divides the image into small windows; counts windows where gradient density
// exceeds the threshold. Full V1 connected-component detection runs at rebuild stage.
const TEXT_WINDOW_PX = 8;
const TEXT_PIXEL_GRADIENT_THRESHOLD = 40;
const TEXT_WINDOW_DENSITY_THRESHOLD = 0.30;
const TEXT_DENSE_WINDOW_RATIO_THRESHOLD = 0.14;

export async function detectTextArtifact(imageBytes: Buffer): Promise<boolean> {
  try {
    const { data, info } = await sharp(imageBytes, { failOn: "none" })
      .resize({ width: 128, height: 72, fit: "fill" })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const w = info.width || 128;
    const h = info.height || 72;

    let denseWindows = 0, totalWindows = 0;
    for (let wy = 0; wy + TEXT_WINDOW_PX <= h; wy += TEXT_WINDOW_PX) {
      for (let wx = 0; wx + TEXT_WINDOW_PX <= w; wx += TEXT_WINDOW_PX) {
        let highGradientPixels = 0, windowPixels = 0;
        for (let y = wy + 1; y < wy + TEXT_WINDOW_PX - 1; y++) {
          for (let x = wx + 1; x < wx + TEXT_WINDOW_PX - 1; x++) {
            const i = y * w + x;
            const gx = Math.abs(data[i + 1] - data[i - 1]);
            const gy = Math.abs(data[i + w] - data[i - w]);
            if (gx + gy >= TEXT_PIXEL_GRADIENT_THRESHOLD) highGradientPixels++;
            windowPixels++;
          }
        }
        totalWindows++;
        if (windowPixels > 0 && highGradientPixels / windowPixels >= TEXT_WINDOW_DENSITY_THRESHOLD) denseWindows++;
      }
    }

    return totalWindows > 0 && denseWindows / totalWindows >= TEXT_DENSE_WINDOW_RATIO_THRESHOLD;
  } catch {
    return false; // fail open for scouts — text check at rebuild is authoritative
  }
}
