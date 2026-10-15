// Dependency-free PNG icon generator. Mirrors assets/icon.svg procedurally
// (4x4 supersampled antialiasing) and writes PNGs with node:zlib.
// Outputs (gitignored): public/icons/{icon-192,icon-512,icon-maskable-512,apple-touch-icon}.png
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const NAVY = [0x0b, 0x2e, 0x4a];
const CREAM = [0xf8, 0xf5, 0xec];
const GOLD = [0xd4, 0xaf, 0x37];
const RED = [0xc0, 0x39, 0x2b];

// Two overlapping playing cards on navy felt: a back card (red diamond) tilted left and a front
// card (navy spade) tilted right, inside a gold ring. Mirrors assets/icon.svg.
const CARD = { w: 196, h: 280, r: 26 };
const BACK = { cx: 214, cy: 262, deg: -14 };
const FRONT = { cx: 300, cy: 256, deg: 10 };

/** Signed-distance style test: point inside rounded rect (x,y,w,h,r)? */
function inRoundRect(px, py, x, y, w, h, r) {
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  return (
    (px - cx) ** 2 + (py - cy) ** 2 <= r * r && px >= x && px <= x + w && py >= y && py <= y + h
  );
}

/** Point relative to a card centre, in the card's own (unrotated) frame. */
function local(px, py, { cx, cy, deg }) {
  const t = (-deg * Math.PI) / 180;
  const dx = px - cx;
  const dy = py - cy;
  return [dx * Math.cos(t) - dy * Math.sin(t), dx * Math.sin(t) + dy * Math.cos(t)];
}

function inCard(px, py, pose, grow = 0) {
  const [x, y] = local(px, py, pose);
  const { w, h, r } = CARD;
  return inRoundRect(x, y, -w / 2 - grow, -h / 2 - grow, w + 2 * grow, h + 2 * grow, r + grow);
}

function inTriangle(x, y, [ax, ay], [bx, by], [cx, cy]) {
  const d = (x1, y1, x2, y2) => (x - x2) * (y1 - y2) - (x1 - x2) * (y - y2);
  const d1 = d(ax, ay, bx, by);
  const d2 = d(bx, by, cx, cy);
  const d3 = d(cx, cy, ax, ay);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

/** A spade: a tip triangle, two lobes and a stem. (x,y) is relative to the pip centre. */
function inSpade(x, y) {
  return (
    inTriangle(x, y, [0, -74], [-66, 14], [66, 14]) ||
    Math.hypot(x + 33, y - 14) <= 35 ||
    Math.hypot(x - 33, y - 14) <= 35 ||
    inTriangle(x, y, [0, 10], [-20, 76], [20, 76])
  );
}

/**
 * Colour of the design at point (px,py) in 512-space, or null when transparent.
 * rounded: clip the navy tile to rx=96 (else full-bleed square).
 * ring: draw the gold ring (skipped for maskable, it would be cropped).
 */
function sample(px, py, { rounded, ring }) {
  if (rounded ? !inRoundRect(px, py, 0, 0, 512, 512, 96) : false) return null;
  if (ring && Math.abs(Math.hypot(px - 256, py - 256) - 236) <= 4) return GOLD;
  if (inCard(px, py, FRONT)) {
    const [x, y] = local(px, py, FRONT);
    return inSpade(x, y + 6) ? NAVY : CREAM;
  }
  // Navy outline around the front card separates it from the back card.
  if (inCard(px, py, FRONT, 7)) return NAVY;
  if (inCard(px, py, BACK)) {
    const [x, y] = local(px, py, BACK);
    return Math.abs(x + 44) / 32 + Math.abs(y + 40) / 46 <= 1 ? RED : CREAM;
  }
  return NAVY;
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
          if (scale < 1 && (px < 0 || px > 512 || py < 0 || py > 512)) c = NAVY;
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
  // Maskable: full-bleed navy, design inside the 80% safe zone, no ring.
  'icon-maskable-512.png': [512, { rounded: false, ring: false, scale: 0.7 }],
  // iOS applies its own mask and dislikes transparency: full-bleed.
  'apple-touch-icon.png': [180, { rounded: false, ring: false, scale: 0.9 }],
};
for (const [name, [size, opts]] of Object.entries(icons)) {
  writeFileSync(outDir + name, encodePng(size, render(size, opts)));
}
console.log(`gen-icons: wrote ${Object.keys(icons).length} icons to public/icons/`);
