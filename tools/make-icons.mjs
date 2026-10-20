// Generates PNG app icons (teal square with a white medical cross) without dependencies.
// Usage: node tools/make-icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const OUT = path.resolve(import.meta.dirname, '..', 'public', 'icons');
const BG = [15, 118, 110];
const FG = [255, 255, 255];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// rounded = corner radius as a share of size (0 for full-bleed maskable icons)
// cross = cross arm length as a share of size
function icon(size, { rounded, cross }) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const r = rounded * size;
  const arm = (cross * size) / 2;
  const thick = arm * 0.36;
  const c = size / 2;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const px = x + 0.5, py = y + 0.5;
      // rounded-corner mask
      const dx = Math.max(r - px, px - (size - r), 0);
      const dy = Math.max(r - py, py - (size - r), 0);
      const inside = r === 0 || dx * dx + dy * dy <= r * r;
      const inCross = (Math.abs(px - c) <= thick && Math.abs(py - c) <= arm) ||
        (Math.abs(py - c) <= thick && Math.abs(px - c) <= arm);
      const col = inCross ? FG : BG;
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = col[0]; raw[o + 1] = col[1]; raw[o + 2] = col[2];
      raw[o + 3] = inside ? 255 : 0;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'icon-192.png'), icon(192, { rounded: 0.22, cross: 0.56 }));
fs.writeFileSync(path.join(OUT, 'icon-512.png'), icon(512, { rounded: 0.22, cross: 0.56 }));
fs.writeFileSync(path.join(OUT, 'icon-maskable-512.png'), icon(512, { rounded: 0, cross: 0.44 }));
fs.writeFileSync(path.join(OUT, 'apple-touch-icon.png'), icon(180, { rounded: 0, cross: 0.52 }));
console.log('icons written to', OUT);
