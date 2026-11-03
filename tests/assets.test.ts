// Uploaded images (docs/design-system.md Parts 6 and 10): files are known by their bytes, sized from their headers,
// and photos lose where they were taken.
import assert from "node:assert/strict";
import { test } from "node:test";
import { sniffImage, stripImageMeta } from "../src/lib/design/assets.ts";

const png = (w: number, h: number) => {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  return b;
};
const gif = (w: number, h: number) => {
  const b = new Uint8Array(26);
  b.set([...Buffer.from("GIF89a")]);
  new DataView(b.buffer).setUint16(6, w, true);
  new DataView(b.buffer).setUint16(8, h, true);
  return b;
};
const seg = (marker: number, body: number[]) => [0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 255, ...body];
const jpeg = (w: number, h: number, extra: number[] = []) =>
  new Uint8Array([0xff, 0xd8, ...seg(0xe0, [...Buffer.from("JFIF\0"), 1, 1, 0, 0, 1, 0, 1, 0, 0]), ...extra, ...seg(0xc0, [8, h >> 8, h & 255, w >> 8, w & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]), ...seg(0xda, [1, 1, 0]), 1, 2, 3, 0xff, 0xd9]);
const webpX = (w: number, h: number) => {
  const b = new Uint8Array(30);
  b.set([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBPVP8X")]);
  b[24] = (w - 1) & 255;
  b[25] = ((w - 1) >> 8) & 255;
  b[27] = (h - 1) & 255;
  b[28] = ((h - 1) >> 8) & 255;
  return b;
};

test("images are known by their bytes and sized from their headers", () => {
  assert.deepEqual(sniffImage(png(640, 320)), { type: "image/png", ext: "png", width: 640, height: 320 });
  assert.deepEqual(sniffImage(gif(10, 20)), { type: "image/gif", ext: "gif", width: 10, height: 20 });
  assert.deepEqual(sniffImage(jpeg(1200, 800)), { type: "image/jpeg", ext: "jpg", width: 1200, height: 800 });
  assert.deepEqual(sniffImage(webpX(300, 200)), { type: "image/webp", ext: "webp", width: 300, height: 200 });
  assert.equal(sniffImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')), null, "SVG can carry script");
  assert.equal(sniffImage(new TextEncoder().encode("<html><body>not an image at all, but long enough</body></html>")), null);
  assert.equal(sniffImage(png(0, 10)), null, "a zero size isn't an image");
  assert.equal(sniffImage(png(99999, 10)), null);
});

test("photos lose their metadata, the picture stays", () => {
  const gps = seg(0xe1, [...Buffer.from("Exif\0\0"), ...Buffer.from("GPS 37.7749 -122.4194")]);
  const comment = seg(0xfe, [...Buffer.from("taken at home")]);
  const withMeta = jpeg(100, 50, [...gps, ...comment]);
  const clean = stripImageMeta(withMeta);
  assert.ok(!Buffer.from(clean).includes(Buffer.from("GPS")));
  assert.ok(!Buffer.from(clean).includes(Buffer.from("taken at home")));
  assert.deepEqual(Buffer.from(clean), Buffer.from(jpeg(100, 50)), "only the metadata went");
  assert.deepEqual(sniffImage(clean), { type: "image/jpeg", ext: "jpg", width: 100, height: 50 });
  const p = png(1, 1);
  assert.equal(stripImageMeta(p), p);
});
