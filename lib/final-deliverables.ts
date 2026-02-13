import { access, readFile } from "fs/promises";
import path from "path";
import JSZip from "jszip";
import PptxGenJS from "pptxgenjs";
import type { DesignDoc } from "@/lib/design-doc";

const PX_PER_INCH = 96;

function stripHash(hex: string): string {
  return hex.replace(/^#/, "").toUpperCase();
}

function pxToInches(px: number): number {
  return px / PX_PER_INCH;
}

function pxToPoints(px: number): number {
  return (px * 72) / PX_PER_INCH;
}

function escapeXml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
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
    await access(filePath);
    return true;
  } catch {
    return false;
  }
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

  const bytes = await readFile(filePath);
  const mimeType = detectMimeType(filePath);
  return `data:${mimeType};base64,${bytes.toString("base64")}`;
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
          color: stripHash(layer.fill)
        },
        line: {
          color: stripHash(layer.stroke),
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

export async function buildFinalSvg(designDoc: DesignDoc): Promise<string> {
  const svgParts: string[] = [];

  svgParts.push('<?xml version="1.0" encoding="UTF-8"?>');
  svgParts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${designDoc.width}" height="${designDoc.height}" viewBox="0 0 ${designDoc.width} ${designDoc.height}">`
  );
  svgParts.push(`<rect x="0" y="0" width="${designDoc.width}" height="${designDoc.height}" fill="${escapeXml(designDoc.background.color)}" />`);

  for (const [index, layer] of designDoc.layers.entries()) {
    svgParts.push(`<g id="layer-${index + 1}">`);

    if (layer.type === "shape") {
      svgParts.push(
        `<rect x="${layer.x}" y="${layer.y}" width="${layer.w}" height="${layer.h}" fill="${escapeXml(layer.fill)}" stroke="${escapeXml(layer.stroke)}" stroke-width="${layer.strokeWidth}" />`
      );
      svgParts.push("</g>");
      continue;
    }

    if (layer.type === "image") {
      const href = await resolveSvgImageHref(layer.src);
      svgParts.push(
        `<image x="${layer.x}" y="${layer.y}" width="${layer.w}" height="${layer.h}" href="${escapeXml(href)}" preserveAspectRatio="xMidYMid meet" />`
      );
      svgParts.push("</g>");
      continue;
    }

    const lines = layer.text.split(/\r?\n/);
    const x = layer.align === "center" ? layer.x + layer.w / 2 : layer.align === "right" ? layer.x + layer.w : layer.x;
    const anchor = layer.align === "center" ? "middle" : layer.align === "right" ? "end" : "start";
    const lineHeight = layer.fontSize * 1.25;
    const firstBaseline = layer.y + layer.fontSize;

    svgParts.push(
      `<text x="${x}" y="${firstBaseline}" fill="${escapeXml(layer.color)}" font-family="${escapeXml(layer.fontFamily || "Arial")}" font-size="${layer.fontSize}" font-weight="${layer.fontWeight}" text-anchor="${anchor}">`
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

export async function buildFinalBundle(designDoc: DesignDoc): Promise<Buffer> {
  const [pptxBuffer, svgString] = await Promise.all([buildFinalPptx(designDoc), buildFinalSvg(designDoc)]);
  const zip = new JSZip();

  zip.file("final.pptx", pptxBuffer);
  zip.file("final.svg", svgString);

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
