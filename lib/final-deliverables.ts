import fs from "fs/promises";
import path from "path";
import JSZip from "jszip";
import PptxGenJS from "pptxgenjs";
import sharp from "sharp";
import type { DesignDoc } from "@/lib/design-doc";
import { buildEmbeddedFontFaceCss } from "@/lib/lockups/font-registry";

const PX_PER_INCH = 96;

function stripHash(hex: string): string {
  return hex.replace(/^#/, "").toUpperCase();
}

function isHexColor(value: string): boolean {
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}

function toPptColor(value: string, fallback: string): string {
  return isHexColor(value) ? stripHash(value) : stripHash(fallback);
}

function usesPaintReference(value: string, referenceId: string): boolean {
  const normalized = value.replace(/\s+/g, "");
  return normalized.toLowerCase() === `url(#${referenceId.toLowerCase()})`;
}

function pxToInches(px: number): number {
  return px / PX_PER_INCH;
}

function pxToPoints(px: number): number {
  return (px * 72) / PX_PER_INCH;
}

function normalizeDimension(value: number): number {
  if (!Number.isFinite(value) || Number.isNaN(value)) {
    return 1;
  }

  return Math.max(1, Math.round(value));
}

function formatPdfNumber(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  if (Number.isInteger(rounded)) {
    return String(rounded);
  }

  return rounded.toFixed(3).replace(/\.?0+$/, "");
}

function escapeXml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeXmlText(input: string): string {
  return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function layerRotationTransform(layer: { x: number; y: number; w: number; h: number; rotation?: number }): string {
  const rotation = typeof layer.rotation === "number" ? layer.rotation : 0;
  if (!rotation) {
    return "";
  }

  const cx = layer.x + layer.w / 2;
  const cy = layer.y + layer.h / 2;
  return ` transform="rotate(${rotation} ${cx} ${cy})"`;
}

function getPublicFilePath(assetPath: string): string | null {
  if (/^https?:\/\//i.test(assetPath)) {
    return null;
  }

  const publicRoot = path.join(process.cwd(), "public");
  const relativePath = assetPath.replace(/^\/+/, "");
  const absolutePath = path.resolve(publicRoot, relativePath);
  const publicPrefix = `${publicRoot}${path.sep}`;

  if (absolutePath !== publicRoot && !absolutePath.startsWith(publicPrefix)) {
    return null;
  }

  return absolutePath;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function publicFileToDataUri(publicPath: string, mimeType: string): Promise<string> {
  const clean = publicPath.startsWith("/") ? publicPath.slice(1) : publicPath;
  const abs = path.join(process.cwd(), "public", clean);
  const bytes = await fs.readFile(abs);
  return `data:${mimeType};base64,${bytes.toString("base64")}`;
}

function detectMimeType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".png") {
    return "image/png";
  }
  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }
  if (extension === ".svg") {
    return "image/svg+xml";
  }
  if (extension === ".webp") {
    return "image/webp";
  }
  return "application/octet-stream";
}

async function resolveSvgImageHref(src: string): Promise<string> {
  if (/^data:/i.test(src) || /^https?:\/\//i.test(src)) {
    return src;
  }

  const filePath = getPublicFilePath(src);
  if (!filePath || !(await fileExists(filePath))) {
    return src;
  }

  const bytes = await fs.readFile(filePath);
  const mimeType = detectMimeType(filePath);
  return `data:${mimeType};base64,${bytes.toString("base64")}`;
}

async function buildFinalPngFromSvg(svg: string, width: number, height: number): Promise<Buffer> {
  return sharp(Buffer.from(svg))
    .resize({
      width,
      height,
      fit: "fill"
    })
    .png()
    .toBuffer();
}

function buildSinglePagePdfFromJpeg(jpegBuffer: Buffer, widthPx: number, heightPx: number): Buffer {
  const widthPt = pxToPoints(widthPx);
  const heightPt = pxToPoints(heightPx);
  const contentStream = `q
${formatPdfNumber(widthPt)} 0 0 ${formatPdfNumber(heightPt)} 0 0 cm
/Im0 Do
Q
`;
  const contentBuffer = Buffer.from(contentStream, "utf-8");
  const objectOffsets: number[] = [];
  const chunks: Buffer[] = [];
  let currentOffset = 0;

  const pushChunk = (chunk: string | Buffer) => {
    const bufferChunk = typeof chunk === "string" ? Buffer.from(chunk, "binary") : chunk;
    chunks.push(bufferChunk);
    currentOffset += bufferChunk.length;
  };

  const beginObject = (objectId: number) => {
    objectOffsets[objectId] = currentOffset;
    pushChunk(`${objectId} 0 obj\n`);
  };

  pushChunk("%PDF-1.4\n%\xFF\xFF\xFF\xFF\n");

  beginObject(1);
  pushChunk("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  beginObject(2);
  pushChunk("<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");

  beginObject(3);
  pushChunk(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${formatPdfNumber(widthPt)} ${formatPdfNumber(heightPt)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`
  );

  beginObject(4);
  pushChunk(
    `<< /Type /XObject /Subtype /Image /Width ${widthPx} /Height ${heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBuffer.length} >>\nstream\n`
  );
  pushChunk(jpegBuffer);
  pushChunk("\nendstream\nendobj\n");

  beginObject(5);
  pushChunk(`<< /Length ${contentBuffer.length} >>\nstream\n`);
  pushChunk(contentBuffer);
  pushChunk("endstream\nendobj\n");

  const xrefOffset = currentOffset;
  const objectCount = 5;

  pushChunk(`xref\n0 ${objectCount + 1}\n`);
  pushChunk("0000000000 65535 f \n");

  for (let objectId = 1; objectId <= objectCount; objectId += 1) {
    const offset = objectOffsets[objectId] ?? 0;
    pushChunk(`${String(offset).padStart(10, "0")} 00000 n \n`);
  }

  pushChunk(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
  return Buffer.concat(chunks);
}

async function buildFinalPdfFromSvg(svg: string, width: number, height: number): Promise<Buffer> {
  const jpegBuffer = await sharp(Buffer.from(svg))
    .resize({
      width,
      height,
      fit: "fill"
    })
    .jpeg({
      quality: 100,
      chromaSubsampling: "4:4:4"
    })
    .toBuffer();

  return buildSinglePagePdfFromJpeg(jpegBuffer, width, height);
}

export async function buildFinalPptx(designDoc: DesignDoc): Promise<Buffer> {
  const pptx = new PptxGenJS();
  const layoutName = "FINAL_DESIGN";

  pptx.defineLayout({
    name: layoutName,
    width: pxToInches(designDoc.width),
    height: pxToInches(designDoc.height)
  });
  pptx.layout = layoutName;

  const slide = pptx.addSlide();
  slide.background = {
    color: stripHash(designDoc.background.color)
  };

  for (const layer of designDoc.layers) {
    if (isGuideLayer(layer)) {
      continue;
    }

    const x = pxToInches(layer.x);
    const y = pxToInches(layer.y);
    const w = pxToInches(layer.w);
    const h = pxToInches(layer.h);

    if (layer.type === "text") {
      slide.addText(layer.text, {
        x,
        y,
        w,
        h,
        align: layer.align,
        bold: layer.fontWeight >= 600,
        color: stripHash(layer.color),
        fontFace: layer.fontFamily,
        fontSize: pxToPoints(layer.fontSize)
      });
      continue;
    }

    if (layer.type === "shape") {
      slide.addShape(pptx.ShapeType.rect, {
        x,
        y,
        w,
        h,
        fill: {
          color: toPptColor(layer.fill, "#FFFFFF")
        },
        line: {
          color: toPptColor(layer.stroke, "#000000"),
          pt: pxToPoints(layer.strokeWidth)
        }
      });
      continue;
    }

    const localPath = getPublicFilePath(layer.src);
    if (localPath && (await fileExists(localPath))) {
      slide.addImage({
        path: localPath,
        x,
        y,
        w,
        h
      });
      continue;
    }

    if (/^data:/i.test(layer.src) || /^https?:\/\//i.test(layer.src)) {
      slide.addImage({
        path: layer.src,
        x,
        y,
        w,
        h
      });
    }
  }

  const bufferLike = (await pptx.write({ outputType: "nodebuffer" })) as Buffer | ArrayBuffer;
  if (Buffer.isBuffer(bufferLike)) {
    return bufferLike;
  }

  return Buffer.from(bufferLike);
}

type BuildFinalSvgOptions = {
  includeBackground?: boolean;
  includeImages?: boolean;
};

function isGuideLayer(layer: DesignDoc["layers"][number]): boolean {
  return layer.purpose === "guide";
}

export async function buildFinalSvg(designDoc: DesignDoc, options: BuildFinalSvgOptions = {}): Promise<string> {
  const includeBackground = options.includeBackground ?? true;
  const includeImages = options.includeImages ?? true;
  const svgParts: string[] = [];
  const hasScrim = designDoc.layers.some(
    (layer) =>
      !isGuideLayer(layer) &&
      layer.type === "shape" &&
      (usesPaintReference(layer.fill, "scrim") || usesPaintReference(layer.stroke, "scrim"))
  );
  const hasScrimTall = designDoc.layers.some(
    (layer) =>
      !isGuideLayer(layer) &&
      layer.type === "shape" &&
      (usesPaintReference(layer.fill, "scrimTall") || usesPaintReference(layer.stroke, "scrimTall"))
  );
  const fontFaceCss = buildEmbeddedFontFaceCss(
    designDoc.layers.flatMap((layer) =>
      !isGuideLayer(layer) && layer.type === "text"
        ? [
            {
              family: layer.fontFamily,
              weight: layer.fontWeight
            }
          ]
        : []
    )
  );

  svgParts.push('<?xml version="1.0" encoding="UTF-8"?>');
  svgParts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${designDoc.width}" height="${designDoc.height}" viewBox="0 0 ${designDoc.width} ${designDoc.height}">`
  );
  if (hasScrim || hasScrimTall || fontFaceCss) {
    svgParts.push("<defs>");
    if (fontFaceCss) {
      svgParts.push(`<style type="text/css">${escapeXmlText(fontFaceCss)}</style>`);
    }
    if (hasScrim) {
      svgParts.push('<linearGradient id="scrim" x1="0" y1="0" x2="1" y2="0">');
      svgParts.push('<stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.18" />');
      svgParts.push('<stop offset="55%" stop-color="#FFFFFF" stop-opacity="0.08" />');
      svgParts.push('<stop offset="100%" stop-color="#FFFFFF" stop-opacity="0.00" />');
      svgParts.push("</linearGradient>");
    }
    if (hasScrimTall) {
      svgParts.push('<linearGradient id="scrimTall" x1="0" y1="0" x2="0" y2="1">');
      svgParts.push('<stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.20" />');
      svgParts.push('<stop offset="45%" stop-color="#FFFFFF" stop-opacity="0.09" />');
      svgParts.push('<stop offset="100%" stop-color="#FFFFFF" stop-opacity="0.00" />');
      svgParts.push("</linearGradient>");
    }
    svgParts.push("</defs>");
  }
  if (includeBackground) {
    svgParts.push(`<rect x="0" y="0" width="${designDoc.width}" height="${designDoc.height}" fill="${escapeXml(designDoc.background.color)}" />`);
  }
  if (designDoc.backgroundImagePath) {
    try {
      const backgroundImageHref = await publicFileToDataUri(designDoc.backgroundImagePath, "image/png");
      svgParts.push(
        `<image href="${escapeXml(backgroundImageHref)}" x="0" y="0" width="${designDoc.width}" height="${designDoc.height}" preserveAspectRatio="xMidYMid slice" />`
      );
    } catch {
      // Ignore missing/unreadable backgrounds so exports can still render foreground layers.
    }
  }

  for (const [index, layer] of designDoc.layers.entries()) {
    if (isGuideLayer(layer)) {
      continue;
    }

    svgParts.push(`<g id="layer-${index + 1}">`);

    if (layer.type === "shape") {
      svgParts.push(
        `<rect x="${layer.x}" y="${layer.y}" width="${layer.w}" height="${layer.h}" fill="${escapeXml(layer.fill)}" stroke="${escapeXml(layer.stroke)}" stroke-width="${layer.strokeWidth}"${layerRotationTransform(layer)} />`
      );
      svgParts.push("</g>");
      continue;
    }

    if (layer.type === "image") {
      if (!includeImages) {
        svgParts.push("</g>");
        continue;
      }
      const href = await resolveSvgImageHref(layer.src);
      svgParts.push(
        `<image x="${layer.x}" y="${layer.y}" width="${layer.w}" height="${layer.h}" href="${escapeXml(href)}" preserveAspectRatio="xMidYMid meet"${layerRotationTransform(layer)} />`
      );
      svgParts.push("</g>");
      continue;
    }

    const lines = layer.text.split(/\r?\n/);
    const x = layer.align === "center" ? layer.x + layer.w / 2 : layer.align === "right" ? layer.x + layer.w : layer.x;
    const anchor = layer.align === "center" ? "middle" : layer.align === "right" ? "end" : "start";
    const lineHeight = layer.fontSize * 1.25;
    const firstBaseline = layer.y + layer.fontSize;
    const letterSpacing =
      typeof layer.letterSpacing === "number" && Number.isFinite(layer.letterSpacing)
        ? ` letter-spacing="${layer.letterSpacing}"`
        : "";
    const fillOpacity =
      typeof layer.opacity === "number" && Number.isFinite(layer.opacity) && layer.opacity >= 0 && layer.opacity <= 1
        ? ` fill-opacity="${layer.opacity.toFixed(3)}"`
        : "";

    svgParts.push(
      `<text x="${x}" y="${firstBaseline}" fill="${escapeXml(layer.color)}" font-family="${escapeXml(layer.fontFamily || "Inter")}" font-size="${layer.fontSize}" font-weight="${layer.fontWeight}" text-anchor="${anchor}"${letterSpacing}${fillOpacity}${layerRotationTransform(layer)}>`
    );

    for (const [lineIndex, line] of lines.entries()) {
      const lineY = lineIndex === 0 ? firstBaseline : firstBaseline + lineIndex * lineHeight;
      svgParts.push(`<tspan x="${x}" y="${lineY}">${escapeXml(line)}</tspan>`);
    }

    svgParts.push("</text>");
    svgParts.push("</g>");
  }

  svgParts.push("</svg>");

  return svgParts.join("\n");
}

export async function buildFinalPng(designDoc: DesignDoc): Promise<Buffer> {
  const svg = await buildFinalSvg(designDoc);
  const width = normalizeDimension(designDoc.width);
  const height = normalizeDimension(designDoc.height);
  return buildFinalPngFromSvg(svg, width, height);
}

export async function buildFinalPdf(designDoc: DesignDoc): Promise<Buffer> {
  const svg = await buildFinalSvg(designDoc);
  const width = normalizeDimension(designDoc.width);
  const height = normalizeDimension(designDoc.height);
  return buildFinalPdfFromSvg(svg, width, height);
}

export async function buildFinalBundle(designDoc: DesignDoc): Promise<Buffer> {
  const width = normalizeDimension(designDoc.width);
  const height = normalizeDimension(designDoc.height);
  const svgString = await buildFinalSvg(designDoc);
  const [pptxBuffer, pngBuffer, pdfBuffer] = await Promise.all([
    buildFinalPptx(designDoc),
    buildFinalPngFromSvg(svgString, width, height),
    buildFinalPdfFromSvg(svgString, width, height)
  ]);
  const zip = new JSZip();

  zip.file("final.pptx", pptxBuffer);
  zip.file("final.svg", svgString);
  zip.file("final.png", pngBuffer);
  zip.file("final.pdf", pdfBuffer);

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
