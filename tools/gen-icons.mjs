/*
 * Küchenzettel-Icons (kein CDN, prozedural): kühles Teal, ein Notiz-Zettel mit
 * Ruling + Eselsohr. Lauf: node tools/gen-icons.mjs
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "icons");
mkdirSync(OUT, { recursive: true });

function png(size, draw) {
  const W = size, H = size, raw = Buffer.alloc(H * (1 + W * 4));
  for (let y = 0; y < H; y++) { raw[y * (1 + W * 4)] = 0;
    for (let x = 0; x < W; x++) { const [r, g, b, a] = draw(x / W, y / H); const o = y * (1 + W * 4) + 1 + x * 4; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a; } }
  const crcTab = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc = buf => { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = crcTab[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
function draw(u, v) {
  // Teal-Grund
  let col = [15, 118, 110]; if ((u + v) / 2 > .5) col = [11, 90, 84];
  // weißer Zettel mit Eselsohr (oben rechts)
  const inCard = u > .24 && u < .76 && v > .22 && v < .8;
  const foldX = u > .62 && v < .38 && (u - .62) + (v - .22) < .16; // Ecke fehlt
  if (inCard && !foldX) {
    col = [246, 249, 250];
    // Ruling (Teal-Linien)
    const ry = (v - .28) / .085; if (v > .3 && Math.abs(ry - Math.round(ry)) < .07) col = [180, 214, 210];
    // roter Rand-Strich links
    if (u > .3 && u < .315) col = [217, 138, 43];
  }
  if (foldX && u > .6 && v > .2 && v < .4) { const d = (u - .6) + (v - .2); if (d > .12 && d < .17) col = [11, 90, 84]; if (d <= .12 && u > .62) col = [210, 228, 226]; }
  return [col[0], col[1], col[2], 255];
}
for (const s of [192, 512]) writeFileSync(join(OUT, `icon-${s}.png`), png(s, draw));
console.log("Küchenzettel-Icons geschrieben.");
