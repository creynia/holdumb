// Dependency-free PNG icon generator. Mirrors assets/icon.svg procedurally
// (4x4 supersampled antialiasing) and writes PNGs with node:zlib.
// Outputs (gitignored): public/icons/{icon-192,icon-512,icon-maskable-512,apple-touch-icon}.png
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const GREEN = [0x0b, 0x2e, 0x4a];
const CREAM = [0xf8, 0xf5, 0xec];
const GOLD = [0xd4, 0xaf, 0x37];
const PIPS = [
  [170, 170],
  [342, 170],
  [256, 256],
  [170, 342],
  [342, 342],
];

/** Signed-distance style test: point inside rounded rect (x,y,w,h,r)? */
function inRoundRect(px, py, x, y, w, h, r) {
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  return (
    (px - cx) ** 2 + (py - cy) ** 2 <= r * r && px >= x && px <= x + w && py >= y && py <= y + h
  );
}

/**
 * Colour of the design at point (px,py) in 512-space, or null when transparent.
 * rounded: clip the green tile to rx=96 (else full-bleed square).
 * ring: draw the gold ring (skipped for maskable, it would be cropped).
 */
function sample(px, py, { rounded, ring }) {
  if (rounded ? !inRoundRect(px, py, 0, 0, 512, 512, 96) : false) return null;
  const d = Math.hypot(px - 256, py - 256);
  if (ring && Math.abs(d - 236) <= 4) return GOLD;
  for (const [cx, cy] of PIPS) if (Math.hypot(px - cx, py - cy) <= 34) return GREEN;
  if (inRoundRect(px, py, 96, 96, 320, 320, 56)) return CREAM;
  return GREEN;
}

/** @returns {Uint8Array} RGBA pixels */
function render(size, { rounded = true, ring = true, scale = 1 } = {}) {
  const SS = 4;
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          // pixel -> design space, shrinking the design about the centre by `scale`
          const ux = ((x + (sx + 0.5) / SS) / size) * 512;
          const uy = ((y + (sy + 0.5) / SS) / size) * 512;
          const px = 256 + (ux - 256) / scale;
          const py = 256 + (uy - 256) / scale;
          let c;
          if (scale < 1 && (px < 0 || px > 512 || py < 0 || py > 512)) c = GREEN;
          else c = sample(px, py, { rounded, ring });
          if (c) {
            r += c[0];
            g += c[1];
            b += c[2];
            a += 1;
          }
        }
      }
      const i = (y * size + x) * 4;
      const n = SS * SS;
      if (a > 0) {
        out[i] = Math.round(r / a);
        out[i + 1] = Math.round(g / a);
        out[i + 2] = Math.round(b / a);
        out[i + 3] = Math.round((a / n) * 255);
      }
    }
  }
  return out;
}

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = fileURLToPath(new URL('../public/icons/', import.meta.url));
mkdirSync(outDir, { recursive: true });
const icons = {
  'icon-192.png': [192, {}],
  'icon-512.png': [512, {}],
  // Maskable: full-bleed green, design inside the 80% safe zone, no ring.
  'icon-maskable-512.png': [512, { rounded: false, ring: false, scale: 0.7 }],
  // iOS applies its own mask and dislikes transparency: full-bleed.
  'apple-touch-icon.png': [180, { rounded: false, ring: false, scale: 0.9 }],
};
for (const [name, [size, opts]] of Object.entries(icons)) {
  writeFileSync(outDir + name, encodePng(size, render(size, opts)));
}
console.log(`gen-icons: wrote ${Object.keys(icons).length} icons to public/icons/`);
