// Uploaded images (docs/design-system.md Parts 6 and 10): what a file is comes from its first bytes, never its name;
// its width and height come from its header; photos lose their metadata (where they were taken) before they're
// stored. Only PNG, JPEG, GIF and WebP get in, up to 5 MB. Runs on the server.

export const MAX_ASSET_BYTES = 5 * 1024 * 1024;
export type Sniffed = { type: "image/png" | "image/jpeg" | "image/gif" | "image/webp"; ext: "png" | "jpg" | "gif" | "webp"; width: number; height: number };

const u16be = (b: Uint8Array, i: number) => (b[i]! << 8) | b[i + 1]!;
const u16le = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8);
const u24le = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16);
const u32be = (b: Uint8Array, i: number) => ((b[i]! << 24) >>> 0) + (b[i + 1]! << 16) + (b[i + 2]! << 8) + b[i + 3]!;
const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));

/** What an image is and how big, from its bytes; null for anything else. */
export function sniffImage(b: Uint8Array): Sniffed | null {
  if (b.length < 24) return null;
  // PNG: signature, then the IHDR chunk.
  if (b[0] === 0x89 && ascii(b, 1, 3) === "PNG" && ascii(b, 12, 4) === "IHDR") return ok("image/png", "png", u32be(b, 16), u32be(b, 20));
  // GIF87a / GIF89a.
  if (ascii(b, 0, 4) === "GIF8" && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return ok("image/gif", "gif", u16le(b, 6), u16le(b, 8));
  // WebP: RIFF....WEBP, then VP8 , VP8L or VP8X.
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP" && b.length >= 30) {
    const kind = ascii(b, 12, 4);
    if (kind === "VP8 " && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) return ok("image/webp", "webp", u16le(b, 26) & 0x3fff, u16le(b, 28) & 0x3fff);
    if (kind === "VP8L" && b[20] === 0x2f) {
      const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24);
      return ok("image/webp", "webp", (bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
    }
    if (kind === "VP8X") return ok("image/webp", "webp", u24le(b, 24) + 1, u24le(b, 27) + 1);
    return null;
  }
  // JPEG: walk the segments to a start-of-frame marker.
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1]!;
      if (marker === 0xd9 || marker === 0xda) return null;
      const len = u16be(b, i + 2);
      if ((marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)) return ok("image/jpeg", "jpg", u16be(b, i + 7), u16be(b, i + 5));
      i += 2 + len;
    }
  }
  return null;
}

function ok(type: Sniffed["type"], ext: Sniffed["ext"], width: number, height: number): Sniffed | null {
  return width > 0 && height > 0 && width <= 20000 && height <= 20000 ? { type, ext, width, height } : null;
}

/**
 * A JPEG without its metadata segments (APP1 to APP15: Exif with GPS, XMP, maker notes) and comments; the picture
 * itself is untouched. Other types come back as they are.
 */
export function stripImageMeta(b: Uint8Array): Uint8Array {
  if (!(b[0] === 0xff && b[1] === 0xd8)) return b;
  const parts: Uint8Array[] = [b.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return b;
    const marker = b[i + 1]!;
    // Start of scan: everything after is the picture.
    if (marker === 0xda) {
      parts.push(b.subarray(i));
      break;
    }
    const len = u16be(b, i + 2);
    const seg = b.subarray(i, i + 2 + len);
    const drop = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (!drop) parts.push(seg);
    i += 2 + len;
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
