// A PDF copy of a fill (docs/form-kinds-plan.md step 3): the form's name, when it was sent, each question and its
// answer, and a drawn signature as a picture. Written by hand (PDF 1.4, the built-in Helvetica fonts), so it needs no
// browser and no service, and runs on the web server. Text outside Latin-1 shows as "?" (the built-in fonts' limit).

import { inflateSync, deflateSync } from "node:zlib";

export type PdfLine = { label: string; value: string; image?: Uint8Array | null };
export type PdfDoc = { title: string; sub: string; lines: PdfLine[]; footer?: string };

const W = 612;
const H = 792;
const M = 56;
const WIDTH = W - M * 2;

/** Text as a PDF string: Latin-1 only, with ( ) and \ escaped. */
const pdfText = (s: string) =>
  `(${[...s]
    .map((c) => (c.charCodeAt(0) > 255 ? "?" : c))
    .join("")
    .replace(/[\\()]/g, (c) => `\\${c}`)
    .replace(/[\r\n\t]/g, " ")})`;

/** Helvetica's widths are about half the size for most letters; this keeps lines inside the margin. */
const textWidth = (s: string, size: number) => [...s].reduce((w, c) => w + (/[ijlI.,:;'!|]/.test(c) ? 0.28 : /[mwMW@]/.test(c) ? 0.85 : /[A-Z0-9]/.test(c) ? 0.66 : 0.53), 0) * size;

/** Words into lines that fit the width; long words are cut. */
export function wrap(text: string, size: number, width = WIDTH): string[] {
  const out: string[] = [];
  for (const para of text.split(/\n/)) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      let w = word;
      while (textWidth(w, size) > width) {
        const n = Math.max(1, Math.floor((w.length * width) / textWidth(w, size)) - 1);
        if (line) {
          out.push(line);
          line = "";
        }
        out.push(w.slice(0, n));
        w = w.slice(n);
      }
      const next = line ? `${line} ${w}` : w;
      if (textWidth(next, size) > width) {
        out.push(line);
        line = w;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

/** An 8-bit RGB or RGBA PNG as RGB on white, for the PDF. Null for anything else. */
export function pngToRgb(png: Uint8Array): { width: number; height: number; rgb: Buffer } | null {
  const b = Buffer.from(png);
  if (b.length < 33 || b.readUInt32BE(0) !== 0x89504e47) return null;
  let at = 8;
  let width = 0;
  let height = 0;
  let type = -1;
  const idat: Buffer[] = [];
  while (at + 8 <= b.length) {
    const len = b.readUInt32BE(at);
    const kind = b.toString("latin1", at + 4, at + 8);
    const data = b.subarray(at + 8, at + 8 + len);
    if (kind === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[12] !== 0) return null;
      type = data[9]!;
    } else if (kind === "IDAT") idat.push(data);
    else if (kind === "IEND") break;
    at += 12 + len;
  }
  const bpp = type === 6 ? 4 : type === 2 ? 3 : 0;
  if (!bpp || !width || !height || width > 4000 || height > 4000) return null;
  let raw: Buffer;
  try {
    raw = inflateSync(Buffer.concat(idat));
  } catch {
    return null;
  }
  const stride = width * bpp;
  if (raw.length < (stride + 1) * height) return null;
  const px = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)]!;
    const src = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp]! : 0;
      const up = y ? px[(y - 1) * stride + x]! : 0;
      const c = x >= bpp && y ? px[(y - 1) * stride + x - bpp]! : 0;
      const v = raw[src + x]!;
      const p = a + up - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - up);
      const pc = Math.abs(p - c);
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? up : c;
      px[y * stride + x] = (f === 0 ? v : f === 1 ? v + a : f === 2 ? v + up : f === 3 ? v + ((a + up) >> 1) : f === 4 ? v + paeth : v) & 255;
    }
  }
  const rgb = Buffer.alloc(width * height * 3);
  for (let i = 0, j = 0; i < px.length; i += bpp, j += 3) {
    const alpha = bpp === 4 ? px[i + 3]! / 255 : 1;
    for (let k = 0; k < 3; k++) rgb[j + k] = Math.round(px[i + k]! * alpha + 255 * (1 - alpha));
  }
  return { width, height, rgb };
}

/** The PDF's bytes. */
export function makePdf(doc: PdfDoc): Uint8Array {
  type Img = { w: number; h: number; data: Buffer };
  const images: Img[] = [];
  const pages: string[] = [];
  let ops: string[] = [];
  let y = H - M;
  const newPage = () => {
    if (ops.length) pages.push(ops.join("\n"));
    ops = [];
    y = H - M;
  };
  const room = (h: number) => {
    if (y - h < M + 24) newPage();
  };
  const text = (s: string, size: number, bold = false, gray = 0) => {
    for (const line of wrap(s, size)) {
      room(size * 1.35);
      y -= size * 1.35;
      ops.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${gray} g ${M} ${y.toFixed(1)} Td ${pdfText(line)} Tj ET`);
    }
  };
  text(doc.title, 18, true);
  y -= 2;
  text(doc.sub, 10, false, 0.45);
  y -= 14;
  for (const l of doc.lines) {
    room(40);
    text(l.label, 9, true, 0.45);
    y -= 2;
    const img = l.image ? pngToRgb(l.image) : null;
    if (img) {
      const w = Math.min(220, img.width);
      const h = (img.height / img.width) * w;
      room(h + 6);
      y -= h + 4;
      images.push({ w: img.width, h: img.height, data: deflateSync(img.rgb) });
      ops.push(`q ${w.toFixed(1)} 0 0 ${h.toFixed(1)} ${M} ${y.toFixed(1)} cm /Im${images.length} Do Q`);
    } else text(l.value || "-", 11);
    y -= 10;
    ops.push(`0.9 G 0.5 w ${M} ${(y + 4).toFixed(1)} m ${W - M} ${(y + 4).toFixed(1)} l S`);
  }
  if (doc.footer) {
    y -= 8;
    text(doc.footer, 8, false, 0.55);
  }
  newPage();

  // Objects: 1 catalog, 2 pages, 3-4 fonts, then images, then each page and its content.
  const objs: (string | Buffer)[] = [];
  const add = (o: string | Buffer) => (objs.push(o), objs.length);
  add("<< /Type /Catalog /Pages 2 0 R >>");
  add("");
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const imgIds = images.map((im) => add(Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${im.data.length} >>\nstream\n`, "latin1"), im.data, Buffer.from("\nendstream", "latin1")])));
  const xobj = imgIds.length ? `/XObject << ${imgIds.map((id, i) => `/Im${i + 1} ${id} 0 R`).join(" ")} >>` : "";
  const pageIds: number[] = [];
  for (const content of pages) {
    const body = Buffer.from(content, "latin1");
    const cid = add(Buffer.concat([Buffer.from(`<< /Length ${body.length} >>\nstream\n`, "latin1"), body, Buffer.from("\nendstream", "latin1")]));
    pageIds.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> ${xobj} >> /Contents ${cid} 0 R >>`));
  }
  objs[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  const parts: Buffer[] = [Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1")];
  const offsets: number[] = [];
  let len = parts[0]!.length;
  objs.forEach((o, i) => {
    offsets.push(len);
    const b = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, "latin1"), typeof o === "string" ? Buffer.from(o, "latin1") : o, Buffer.from("\nendobj\n", "latin1")]);
    parts.push(b);
    len += b.length;
  });
  const xref = [`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`, ...offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`)].join("");
  parts.push(Buffer.from(`${xref}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${len}\n%%EOF\n`, "latin1"));
  return new Uint8Array(Buffer.concat(parts));
}
