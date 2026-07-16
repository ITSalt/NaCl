#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetRoot = path.join(repoRoot, "codex-plugin-src", "package", "assets");
const check = process.argv.slice(2).includes("--check");
if (process.argv.slice(2).some((argument) => argument !== "--check")) {
  throw new Error("Only --check is supported.");
}

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_TABLE = new Uint32Array(256);
for (let value = 0; value < 256; value += 1) {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
  CRC_TABLE[value] = crc >>> 0;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function adler32(buffer) {
  let left = 1;
  let right = 0;
  for (const byte of buffer) {
    left = (left + byte) % 65521;
    right = (right + left) % 65521;
  }
  return ((right << 16) | left) >>> 0;
}

// Stored DEFLATE blocks make the generated PNG bytes independent of the host
// zlib version. Assets are larger than compressed artwork but reproducible on
// every supported Node runtime.
function deterministicZlib(buffer) {
  const blocks = [Buffer.from([0x78, 0x01])];
  for (let offset = 0; offset < buffer.length;) {
    const length = Math.min(65535, buffer.length - offset);
    const final = offset + length === buffer.length;
    const header = Buffer.alloc(5);
    header[0] = final ? 1 : 0;
    header.writeUInt16LE(length, 1);
    header.writeUInt16LE((~length) & 0xffff, 3);
    blocks.push(header, buffer.subarray(offset, offset + length));
    offset += length;
  }
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(adler32(buffer));
  blocks.push(checksum);
  return Buffer.concat(blocks);
}

function interpolate(top, bottom, amount) {
  return top.map((value, index) => Math.round(value + (bottom[index] - value) * amount));
}

function insideRoundedSquare(x, y, margin, radius) {
  const left = margin;
  const top = margin;
  const right = 1 - margin;
  const bottom = 1 - margin;
  const closestX = Math.max(left + radius, Math.min(right - radius, x));
  const closestY = Math.max(top + radius, Math.min(bottom - radius, y));
  return Math.hypot(x - closestX, y - closestY) <= radius;
}

function distanceToSegment(x, y, left, right) {
  const dx = right[0] - left[0];
  const dy = right[1] - left[1];
  const denominator = dx * dx + dy * dy;
  const amount = denominator === 0 ? 0 : Math.max(0, Math.min(1, ((x - left[0]) * dx + (y - left[1]) * dy) / denominator));
  return Math.hypot(x - (left[0] + amount * dx), y - (left[1] + amount * dy));
}

function sampleMark(x, y, palette) {
  if (!insideRoundedSquare(x, y, 0.035, 0.16)) return [0, 0, 0, 0];
  let color = [...interpolate(palette.backgroundTop, palette.backgroundBottom, y), 255];
  const points = {
    top: [0.5, 0.19],
    left: [0.23, 0.37],
    right: [0.77, 0.37],
    center: [0.5, 0.5],
    bottomLeft: [0.32, 0.74],
    bottomRight: [0.68, 0.74],
  };
  const edges = [
    [points.top, points.left], [points.top, points.right],
    [points.left, points.center], [points.right, points.center],
    [points.left, points.bottomLeft], [points.right, points.bottomRight],
    [points.center, points.bottomLeft], [points.center, points.bottomRight],
    [points.bottomLeft, points.bottomRight],
  ];
  if (edges.some(([left, right]) => distanceToSegment(x, y, left, right) <= 0.018)) {
    color = [...palette.line, 255];
  }
  const nodes = [points.top, points.left, points.right, points.bottomLeft, points.bottomRight];
  for (const point of nodes) {
    const distance = Math.hypot(x - point[0], y - point[1]);
    if (distance <= 0.058) color = [...palette.node, 255];
    if (distance <= 0.027) color = [...palette.nodeCore, 255];
  }
  const centerDistance = Math.hypot(x - points.center[0], y - points.center[1]);
  if (centerDistance <= 0.076) color = [...palette.center, 255];
  if (centerDistance <= 0.031) color = [...palette.centerCore, 255];
  return color;
}

function render(width, palette) {
  const height = width;
  const pixels = Buffer.alloc(width * height * 4);
  const offsets = [0.125, 0.375, 0.625, 0.875];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const totals = [0, 0, 0, 0];
      for (const offsetY of offsets) {
        for (const offsetX of offsets) {
          const sample = sampleMark((x + offsetX) / width, (y + offsetY) / height, palette);
          for (let channel = 0; channel < 4; channel += 1) totals[channel] += sample[channel];
        }
      }
      const index = (y * width + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) pixels[index + channel] = Math.round(totals[channel] / 16);
    }
  }
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const outputOffset = y * (1 + width * 4);
    raw[outputOffset] = 0;
    pixels.copy(raw, outputOffset + 1, y * width * 4, (y + 1) * width * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", header),
    chunk("IDAT", deterministicZlib(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const darkPalette = {
  backgroundTop: [10, 34, 55],
  backgroundBottom: [3, 14, 25],
  line: [91, 215, 197],
  node: [245, 181, 66],
  nodeCore: [255, 246, 220],
  center: [117, 104, 238],
  centerCore: [242, 240, 255],
};
const lightPalette = {
  backgroundTop: [246, 249, 250],
  backgroundBottom: [222, 235, 237],
  line: [17, 70, 84],
  node: [9, 143, 131],
  nodeCore: [231, 255, 250],
  center: [80, 70, 190],
  centerCore: [248, 247, 255],
};
const assets = new Map([
  ["composer-icon.png", render(128, darkPalette)],
  ["logo.png", render(256, lightPalette)],
  ["logo-dark.png", render(256, darkPalette)],
]);

if (check) {
  for (const [name, expected] of assets) {
    const actual = await readFile(path.join(assetRoot, name)).catch(() => null);
    if (!actual || !actual.equals(expected)) throw new Error(`Generated asset drift: ${name}`);
  }
  process.stdout.write(`Codex plugin assets are deterministic (${assets.size} PNG files).\n`);
} else {
  await mkdir(assetRoot, { recursive: true, mode: 0o755 });
  for (const [name, content] of assets) await writeFile(path.join(assetRoot, name), content, { mode: 0o644 });
  process.stdout.write(`Generated ${assets.size} deterministic Codex plugin PNG assets.\n`);
}
