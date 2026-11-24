// Gera icons/icon-192.png e icons/icon-512.png (pixel art de uma torre), sem dependências.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const ART = [
  '.....prrr...',
  '.....prr....',
  '.....p......',
  '..s.sps.s...',
  '..Sssssss...',
  '..Sssssss...',
  '..SsDDDss...',
  '..SsDDDss...',
  '..Sssssss...',
  '..Sssssss...',
  'gggggggggggg',
  'dddddddddddd',
];
const PAL = { s: [189, 184, 174], S: [143, 138, 128], D: [58, 47, 42], p: [90, 70, 48], r: [229, 72, 77], g: [108, 191, 74], d: [138, 90, 51] };
const SKY_TOP = [27, 42, 58], SKY_BOTTOM = [61, 143, 209];

function pixel(x, y, size) {
  const cell = size / 16, gx = Math.floor(x / cell) - 2, gy = Math.floor(y / cell) - 2;
  if (gy >= 11) return PAL.d;
  if (gy === 10) return PAL.g;
  const ch = gy >= 0 && gx >= 0 && gx < 12 ? ART[gy][gx] : '.';
  if (ch !== '.') return PAL[ch];
  const t = y / size;
  return SKY_TOP.map((c, i) => Math.round(c + (SKY_BOTTOM[i] - c) * t));
}

const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) pixel(x, y, size).forEach((v, i) => { raw[y * (size * 3 + 1) + 1 + x * 3 + i] = v; });
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
mkdirSync('icons', { recursive: true });
for (const s of [192, 512]) writeFileSync(`icons/icon-${s}.png`, png(s));
console.log('Ícones gerados.');
