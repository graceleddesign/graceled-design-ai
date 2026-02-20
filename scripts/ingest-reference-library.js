/* eslint-disable no-console */
const { createHash } = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const JSZip = require("jszip");
const OpenAI = require("openai").default;
const sharp = require("sharp");

const ZIP_ROOT = path.resolve(
  process.cwd(),
  process.env.REFERENCE_ZIP_DIR || process.env.REF_LIBRARY_ZIP_DIR || "reference_zips"
);
const PUBLIC_LIBRARY_DIR = path.join(process.cwd(), "public", "reference-library");
const INDEX_FILE = path.join(process.cwd(), "data", "reference-library.json");
const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const STYLE_TAGS = ["minimal", "illustrative", "photo", "bold-typography", "textured"];

function toPosixPath(value) {
  return value.split(path.sep).join(path.posix.sep);
}

function normalizeStyleTag(value) {
  if (STYLE_TAGS.includes(value)) {
    return value;
  }
  return "minimal";
}

function fallbackStyleTag(fileName) {
  const text = fileName.toLowerCase();
  if (/(illustration|illustrative|line|draw|engrave|ornament|icon)/.test(text)) {
    return "illustrative";
  }
  if (/(photo|film|cinematic|landscape|portrait)/.test(text)) {
    return "photo";
  }
  if (/(texture|grain|paper|stone|riso)/.test(text)) {
    return "textured";
  }
  if (/(type|typography|brutalist|editorial|swiss)/.test(text)) {
    return "bold-typography";
  }
  return "minimal";
}

function parseResponseText(response) {
  if (response && typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  if (!response || !Array.isArray(response.output)) {
    return "";
  }

  const chunks = [];
  for (const item of response.output) {
    if (!item || !Array.isArray(item.content)) {
      continue;
    }
    for (const segment of item.content) {
      if (segment && typeof segment.text === "string" && segment.text.trim()) {
        chunks.push(segment.text.trim());
      }
    }
  }
  return chunks.join("\n").trim();
}

function parseStyleTag(text) {
  if (!text.trim()) {
    return null;
  }

  const normalized = text.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/i, "").trim();
  try {
    const parsed = JSON.parse(normalized);
    return normalizeStyleTag(parsed.styleTag);
  } catch {
    const lowered = normalized.toLowerCase();
    for (const tag of STYLE_TAGS) {
      if (lowered.includes(tag)) {
        return tag;
      }
    }
  }
  return null;
}

async function classifyStyleTag(client, imageBuffer, originalName) {
  if (!client) {
    return fallbackStyleTag(originalName);
  }

  try {
    const response = await client.responses.create({
      model: process.env.OPENAI_MAIN_MODEL || "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                'Classify this sermon-graphic reference as exactly one of: minimal, illustrative, photo, bold-typography, textured. Return JSON only: {"styleTag":"..."}'
            },
            {
              type: "input_image",
              image_url: `data:image/jpeg;base64,${imageBuffer.toString("base64")}`,
              detail: "low"
            }
          ]
        }
      ]
    });
    return parseStyleTag(parseResponseText(response)) || fallbackStyleTag(originalName);
  } catch {
    return fallbackStyleTag(originalName);
  }
}

function extensionOf(fileName) {
  return path.extname(fileName).toLowerCase();
}

function isUsableZipPath(zipPath) {
  const normalized = toPosixPath(zipPath);
  if (!normalized || normalized.startsWith("__MACOSX/")) {
    return false;
  }
  const base = path.basename(normalized);
  if (!base || base.startsWith(".")) {
    return false;
  }
  return ALLOWED_EXTENSIONS.has(extensionOf(base));
}

async function ensureCleanOutput() {
  await fs.rm(PUBLIC_LIBRARY_DIR, { recursive: true, force: true });
  await fs.mkdir(PUBLIC_LIBRARY_DIR, { recursive: true });
  await fs.mkdir(path.dirname(INDEX_FILE), { recursive: true });
}

async function readZipFiles() {
  const entries = await fs.readdir(ZIP_ROOT, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".zip"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}

async function normalizeToJpeg(buffer) {
  return sharp(buffer, { failOn: "none" })
    .rotate()
    .toColorspace("srgb")
    .resize({
      width: 1600,
      height: 1600,
      fit: "inside",
      withoutEnlargement: true
    })
    .jpeg({
      quality: 82,
      chromaSubsampling: "4:4:4",
      mozjpeg: true
    })
    .toBuffer();
}

async function computeDHash(imageBuffer) {
  const { data, info } = await sharp(imageBuffer, { failOn: "none" })
    .resize({
      width: 9,
      height: 8,
      fit: "fill"
    })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (!info || info.width !== 9 || info.height !== 8) {
    return null;
  }

  const bits = [];
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const left = data[y * 9 + x];
      const right = data[y * 9 + x + 1];
      bits.push(left > right ? "1" : "0");
    }
  }

  const binary = bits.join("");
  let hex = "";
  for (let i = 0; i < binary.length; i += 4) {
    hex += Number.parseInt(binary.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

async function main() {
  await ensureCleanOutput();

  const zipFiles = await readZipFiles();
  if (zipFiles.length === 0) {
    throw new Error(`No zip files found in ${ZIP_ROOT}`);
  }

  const apiKey = process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.trim() : "";
  const client = apiKey ? new OpenAI({ apiKey }) : null;
  const items = [];
  const seenHashes = new Set();
  let scannedCount = 0;
  let imageEntryCount = 0;
  let dedupedCount = 0;

  for (const zipFile of zipFiles) {
    const zipPath = path.join(ZIP_ROOT, zipFile);
    const zipBuffer = await fs.readFile(zipPath);
    const zip = await JSZip.loadAsync(zipBuffer);
    const fileEntries = Object.values(zip.files).filter((entry) => !entry.dir && isUsableZipPath(entry.name));

    scannedCount += 1;
    imageEntryCount += fileEntries.length;

    for (const entry of fileEntries) {
      const sourceBuffer = await entry.async("nodebuffer");
      const normalizedBuffer = await normalizeToJpeg(sourceBuffer);
      const sha1 = createHash("sha1").update(normalizedBuffer).digest("hex");

      if (seenHashes.has(sha1)) {
        dedupedCount += 1;
        continue;
      }
      seenHashes.add(sha1);

      const outputFile = `${sha1}.jpg`;
      const relativePath = toPosixPath(path.join("public", "reference-library", outputFile));
      const absolutePath = path.join(PUBLIC_LIBRARY_DIR, outputFile);
      await fs.writeFile(absolutePath, normalizedBuffer);

      const metadata = await sharp(normalizedBuffer, { failOn: "none" }).metadata();
      const width = metadata.width || 0;
      const height = metadata.height || 0;
      if (width <= 0 || height <= 0) {
        continue;
      }

      const styleTag = await classifyStyleTag(client, normalizedBuffer, entry.name);
      const dHash = await computeDHash(normalizedBuffer);

      items.push({
        id: sha1.slice(0, 16),
        path: relativePath,
        width,
        height,
        sourceZip: zipFile,
        originalName: path.basename(entry.name),
        styleTag,
        styleTags: [styleTag],
        dHash: dHash || undefined,
        aspect: Math.round((width / height) * 10000) / 10000,
        fileSize: normalizedBuffer.length
      });
    }
  }

  items.sort((a, b) => a.path.localeCompare(b.path, "en", { sensitivity: "base" }));
  await fs.writeFile(INDEX_FILE, `${JSON.stringify(items, null, 2)}\n`, "utf8");

  console.log(`Zip files scanned: ${scannedCount}`);
  console.log(`Image entries found: ${imageEntryCount}`);
  console.log(`Unique images ingested: ${items.length}`);
  console.log(`Duplicates skipped: ${dedupedCount}`);
  console.log(`Library dir: ${toPosixPath(path.relative(process.cwd(), PUBLIC_LIBRARY_DIR))}`);
  console.log(`Index file: ${toPosixPath(path.relative(process.cwd(), INDEX_FILE))}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
