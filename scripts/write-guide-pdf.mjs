#!/usr/bin/env node
/**
 * Writes public/cree-sanctum-guide.txt (double-spaced body) and
 * public/cree-sanctum-guide.pdf (logo, then title, then author block).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { inflateSync, deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const src = readFileSync(join(repoRoot, "docs/guide-source.txt"), "utf8")
  .replace(/\r\n/g, "\n")
  .replace(/\n+$/, "");
const rawLines = src.split("\n");

// Double-spaced body: one blank line after every content line.
// Source paragraph blanks are skipped so we do not quadruple-space.
const doubled = [];
for (const ln of rawLines) {
  if (ln.trim() === "") continue;
  doubled.push(ln);
  doubled.push("");
}
while (doubled.length && doubled[doubled.length - 1] === "") doubled.pop();
writeFileSync(
  join(repoRoot, "public/cree-sanctum-guide.txt"),
  doubled.join("\n") + "\n",
);

function wrapLine(t, width) {
  const out = [];
  if (t.length <= width) return [t];
  let rest = t;
  while (rest.length > width) {
    let cut = rest.lastIndexOf(" ", width);
    if (cut < 20) cut = width;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest) out.push(rest);
  return out;
}

const wrapped = [];
for (const ln of rawLines) {
  if (ln.trim() === "") {
    wrapped.push("");
    continue;
  }
  wrapped.push(...wrapLine(ln.replace(/\t/g, "  "), 86));
}

function decodePng(buf) {
  if (buf[0] !== 0x89 || buf[1] !== 0x50) throw new Error("not png");
  let off = 8;
  let w = 0,
    h = 0,
    bit = 0,
    ctype = 0;
  const idats = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      bit = data[8];
      ctype = data[9];
    } else if (type === "IDAT") idats.push(data);
    else if (type === "IEND") break;
    off += 12 + len;
  }
  const inflated = inflateSync(Buffer.concat(idats));
  const bpp = ctype === 6 ? 4 : ctype === 2 ? 3 : 1;
  const stride = w * bpp;
  const rgba = Buffer.alloc(w * h * 4);
  let srcOff = 0;
  let prev = Buffer.alloc(stride);
  function paeth(a, b, c) {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
  }
  for (let y = 0; y < h; y++) {
    const filter = inflated[srcOff++];
    const row = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const raw = inflated[srcOff++];
      const a = x >= bpp ? row[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let val = raw;
      if (filter === 1) val = (raw + a) & 255;
      else if (filter === 2) val = (raw + b) & 255;
      else if (filter === 3) val = (raw + ((a + b) >> 1)) & 255;
      else if (filter === 4) val = (raw + paeth(a, b, c)) & 255;
      row[x] = val;
    }
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (ctype === 6) {
        rgba[i * 4] = row[x * 4];
        rgba[i * 4 + 1] = row[x * 4 + 1];
        rgba[i * 4 + 2] = row[x * 4 + 2];
        rgba[i * 4 + 3] = row[x * 4 + 3];
      } else if (ctype === 2) {
        rgba[i * 4] = row[x * 3];
        rgba[i * 4 + 1] = row[x * 3 + 1];
        rgba[i * 4 + 2] = row[x * 3 + 2];
        rgba[i * 4 + 3] = 255;
      }
    }
    prev = row;
  }
  return { w, h, rgba };
}

function scaleRgb(src, sw, sh, dw, dh) {
  const out = Buffer.alloc(dw * dh * 3);
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(sh - 1, Math.floor((y * sh) / dh));
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(sw - 1, Math.floor((x * sw) / dw));
      const i = (sy * sw + sx) * 4;
      const o = (y * dw + x) * 3;
      const a = src[i + 3] / 255;
      out[o] = Math.round(src[i] * a + 255 * (1 - a));
      out[o + 1] = Math.round(src[i + 1] * a + 255 * (1 - a));
      out[o + 2] = Math.round(src[i + 2] * a + 255 * (1 - a));
    }
  }
  return out;
}

const png = decodePng(readFileSync(join(repoRoot, "public/logo.png")));
const logoW = 96;
const logoH = 96;
const logoRgb = scaleRgb(png.rgba, png.w, png.h, logoW, logoH);
const logoFlate = deflateSync(logoRgb);

function escapePdf(s) {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

const pageW = 612;
const pageH = 792;
const left = 54;
const leading = 20; // 10pt Times, double-spaced body
const linesFirst = 26;
const linesRest = 34;

const pages = [];
let i = 0;
pages.push(wrapped.slice(0, linesFirst));
i = linesFirst;
while (i < wrapped.length) {
  pages.push(wrapped.slice(i, i + linesRest));
  i += linesRest;
}

function pageStream(pageLines, isFirst) {
  let s = "";
  let y = isFirst ? 628 : 720;
  if (isFirst) {
    const imgX = (pageW - 72) / 2;
    s += `q 72 0 0 72 ${imgX.toFixed(2)} 704 cm /Im1 Do Q\n`;
  }
  s += "BT\n";
  pageLines.forEach((ln, idx) => {
    const line = ln.length === 0 ? " " : ln;
    const isTitle = isFirst && idx === 1;
    const isSub = isFirst && idx === 2;
    if (isTitle) {
      s += `/F2 14 Tf 1 0 0 1 ${left} ${y} Tm (${escapePdf(line)}) Tj\n`;
    } else if (isSub) {
      s += `/F2 12 Tf 1 0 0 1 ${left} ${y} Tm (${escapePdf(line)}) Tj\n`;
    } else {
      s += `/F1 10 Tf 1 0 0 1 ${left} ${y} Tm (${escapePdf(line)}) Tj\n`;
    }
    y -= leading;
  });
  s += "ET\n";
  return s;
}

const fontId = 3 + pages.length * 2;
const fontBId = fontId + 1;
const imgId = fontBId + 1;
const body = [];
const offsets = [0];
function writeObj(n, raw) {
  offsets[n] = Buffer.byteLength(body.join(""), "latin1");
  body.push(`${n} 0 obj\n${raw}\nendobj\n`);
}

body.push("%PDF-1.4\n");
writeObj(1, "<< /Type /Catalog /Pages 2 0 R >>");
const kidRefs = pages.map((_, n) => `${3 + n * 2} 0 R`).join(" ");
writeObj(2, `<< /Type /Pages /Kids [${kidRefs}] /Count ${pages.length} >>`);

for (let n = 0; n < pages.length; n++) {
  const pageId = 3 + n * 2;
  const contId = pageId + 1;
  const stream = pageStream(pages[n], n === 0);
  const len = Buffer.byteLength(stream, "latin1");
  const res =
    n === 0
      ? `/Font << /F1 ${fontId} 0 R /F2 ${fontBId} 0 R >> /XObject << /Im1 ${imgId} 0 R >>`
      : `/Font << /F1 ${fontId} 0 R /F2 ${fontBId} 0 R >>`;
  writeObj(
    pageId,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents ${contId} 0 R /Resources << ${res} >> >>`,
  );
  writeObj(contId, `<< /Length ${len} >>\nstream\n${stream}endstream`);
}
writeObj(fontId, "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>");
writeObj(fontBId, "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>");
writeObj(
  imgId,
  `<< /Type /XObject /Subtype /Image /Width ${logoW} /Height ${logoH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${logoFlate.length} >>\nstream\n`,
);
body[body.length - 1] = body[body.length - 1].replace(/\nendobj\n$/, "");
body.push(logoFlate.toString("latin1"));
body.push("\nendstream\nendobj\n");

const xrefAt = Buffer.byteLength(body.join(""), "latin1");
const count = imgId + 1;
let xref = `xref\n0 ${count}\n`;
xref += "0000000000 65535 f \n";
for (let n = 1; n < count; n++) {
  xref += String(offsets[n] || 0).padStart(10, "0") + " 00000 n \n";
}
body.push(xref);
body.push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);
writeFileSync(join(repoRoot, "public/cree-sanctum-guide.pdf"), body.join(""), "latin1");
console.log(
  "pdf pages",
  pages.length,
  "bytes",
  Buffer.byteLength(body.join(""), "latin1"),
  "txt lines",
  doubled.length,
);
