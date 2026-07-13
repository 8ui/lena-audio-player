// Generates the app icons with zero dependencies.
//
// The artwork is the app itself: dark background, a centred band of waveform
// bars in the app's blue, and the red playhead line down the middle. It is all
// axis-aligned rectangles, so it rasterises directly into a pixel buffer — no
// SVG renderer or image library needed. PNG is then assembled by hand
// (IHDR + IDAT of zlib-deflated scanlines + IEND), which keeps the icons
// reproducible from source instead of being opaque committed binaries.
//
// Run: node scripts/gen-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const BG = [0x12, 0x14, 0x1a]; // app background
const WAVE = [0x5a, 0xa0, 0xff]; // waveform blue
const HEAD = [0xff, 0x5a, 0x5a]; // playhead red

// Fixed, hand-picked bar heights (fraction of the half-height). Deterministic —
// the icon must not change between runs.
const BARS = [
  0.25, 0.45, 0.32, 0.7, 0.52, 0.88, 0.61, 0.96,
  0.55, 0.8, 0.4, 0.66, 0.3, 0.5, 0.22, 0.38,
];

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size) {
  const px = Buffer.alloc(size * size * 3);
  const put = (x, y, [r, g, b]) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 3;
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
  };

  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) put(x, y, BG);

  const mid = size / 2;
  const pad = Math.round(size * 0.14);
  const span = size - pad * 2;
  const slot = span / BARS.length;
  const barW = Math.max(1, Math.round(slot * 0.55));
  const maxH = size * 0.3;

  BARS.forEach((h, i) => {
    const cx = Math.round(pad + slot * (i + 0.5));
    const half = Math.max(1, Math.round(h * maxH));
    const x0 = cx - Math.floor(barW / 2);
    for (let x = x0; x < x0 + barW; x++) {
      for (let y = Math.round(mid - half); y < Math.round(mid + half); y++) put(x, y, WAVE);
    }
  });

  // Playhead: the fixed red centre line — the core idea of the app.
  const hw = Math.max(1, Math.round(size * 0.016));
  for (let x = Math.round(mid - hw); x < Math.round(mid + hw); x++) {
    for (let y = Math.round(size * 0.16); y < Math.round(size * 0.84); y++) put(x, y, HEAD);
  }

  // Raw scanlines, each prefixed with filter byte 0 (None).
  const raw = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    const o = y * (1 + size * 3);
    raw[o] = 0;
    px.copy(raw, o + 1, y * size * 3, (y + 1) * size * 3);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2 = truecolour RGB, NO alpha (iOS wants opaque)
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180], // iPhone @3x; iOS downscales for the other slots
]) {
  writeFileSync(resolve(OUT, name), png(size));
  console.log(`wrote ${name} (${size}x${size})`);
}
