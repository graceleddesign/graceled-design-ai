import sharp from "sharp";

function normalizeHexHash(value: string): string {
  return value.trim().toLowerCase().replace(/^0x/, "");
}

const NIBBLE_POPCOUNT = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4] as const;

export function hammingDistanceHash(left: string, right: string): number {
  const normalizedLeft = normalizeHexHash(left);
  const normalizedRight = normalizeHexHash(right);
  const width = Math.max(normalizedLeft.length, normalizedRight.length, 16);
  const paddedLeft = normalizedLeft.padStart(width, "0");
  const paddedRight = normalizedRight.padStart(width, "0");

  let count = 0;
  for (let index = 0; index < width; index += 1) {
    const leftNibble = Number.parseInt(paddedLeft[index], 16);
    const rightNibble = Number.parseInt(paddedRight[index], 16);
    if (Number.isNaN(leftNibble) || Number.isNaN(rightNibble)) {
      continue;
    }
    count += NIBBLE_POPCOUNT[leftNibble ^ rightNibble];
  }

  return count;
}

export async function computeDHashFromBuffer(buffer: Buffer): Promise<string> {
  const { data, info } = await sharp(buffer, { failOn: "none" })
    .resize({
      width: 9,
      height: 8,
      fit: "fill"
    })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.width !== 9 || info.height !== 8) {
    return "0000000000000000";
  }

  let bits = "";

  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const left = data[row * 9 + col];
      const right = data[row * 9 + col + 1];
      bits += left > right ? "1" : "0";
    }
  }

  const normalizedBits = bits.padEnd(64, "0").slice(0, 64);
  let hash = "";
  for (let index = 0; index < normalizedBits.length; index += 4) {
    const nibble = normalizedBits.slice(index, index + 4);
    hash += Number.parseInt(nibble, 2).toString(16);
  }
  return hash.padStart(16, "0");
}
