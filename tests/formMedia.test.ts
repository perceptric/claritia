// Photos on forms (docs/forms-media-plan.md, src/lib/forms/media.ts): only the library's and the starter photos get
// in, a page never takes "behind", the widths and focus read safely, and the page cleaner drops anything else.
import assert from "node:assert/strict";
import { test } from "node:test";
import { focusOf, layoutOf, mediaOk, sizedUrl, srcsetOf, STARTER_PHOTOS, widthsOf } from "../src/lib/forms/media.ts";
import { cleanPage } from "../src/lib/studio/page.ts";

const WS = "0192f3a1-0000-7000-8000-000000000001";
const ID = "0192f3a1-0000-7000-8000-0000000000aa";
const LIB = `https://abc.supabase.co/storage/v1/object/public/assets/${WS}/${ID}.jpg`;

test("a form shows only library and starter photos", () => {
  assert.ok(mediaOk(LIB));
  assert.ok(mediaOk(`${STARTER_PHOTOS}team-at-desk.jpg`));
  for (const bad of [
    "http://abc.supabase.co/storage/v1/object/public/assets/" + `${WS}/${ID}.jpg`,
    "https://evil.example/tracker.gif",
    `https://abc.supabase.co/storage/v1/object/public/uploads/${WS}/${ID}.jpg`,
    `https://abc.supabase.co/storage/v1/object/public/assets/${WS}/../x.jpg`,
    `${LIB}?t=1`,
    `https://user:pw@abc.supabase.co/storage/v1/object/public/assets/${WS}/${ID}.jpg`,
    `${STARTER_PHOTOS}../secret.jpg`,
    `${STARTER_PHOTOS}photo.svg`,
    "javascript:alert(1)",
    "",
  ])
    assert.equal(mediaOk(bad), false, bad);
});

test("layouts: pages take a side or the top, the welcome and end screens may go behind", () => {
  assert.equal(layoutOf("left", false), "left");
  assert.equal(layoutOf("behind", false), "behind");
  assert.equal(layoutOf("behind", true), "top");
  assert.equal(layoutOf("sideways", false), null);
});

test("widths, srcset and focus", () => {
  assert.deepEqual(widthsOf(LIB, "640,1280,1920"), [640, 1280, 1920]);
  assert.deepEqual(widthsOf(LIB, "640,999,abc"), [640]);
  assert.deepEqual(widthsOf(LIB, undefined), []);
  assert.deepEqual(widthsOf(`${STARTER_PHOTOS}a.jpg`, undefined), [640, 1280, 1920]);
  assert.equal(sizedUrl(LIB, 640), LIB.replace(".jpg", "-640.webp"));
  assert.equal(srcsetOf(LIB, []), "");
  assert.equal(srcsetOf(LIB, [640, 1280]), `${sizedUrl(LIB, 640)} 640w, ${sizedUrl(LIB, 1280)} 1280w`);
  assert.equal(focusOf("30,70"), "30% 70%");
  assert.equal(focusOf("300,-5"), "50% 50%");
  assert.equal(focusOf("120,5"), "100% 5%");
});

test("the page cleaner keeps an allowed photo with its settings and drops anything else", () => {
  const ok = cleanPage(`<div class="page"><section data-cl-cover data-cl-media="${LIB}" data-cl-layout="left" data-cl-focus="40,30" data-cl-sizes="640,1280,1920" data-cl-alt="A team at a desk"><h1>Hi</h1><button data-cl-start>Start</button></section></div>`).html;
  assert.match(ok, new RegExp(`data-cl-media="${LIB.replace(/[.?]/g, "\\$&")}"`));
  assert.match(ok, /data-cl-layout="left"/);
  assert.match(ok, /data-cl-focus="40,30"/);
  assert.match(ok, /data-cl-sizes="640,1280,1920"/);
  assert.match(ok, /data-cl-cover/);
  assert.match(ok, /<button data-cl-start type="button">Start<\/button>/);
  const bad = cleanPage(`<section data-cl-cover data-cl-media="https://evil.example/x.jpg" data-cl-layout="sideways" data-cl-focus="a,b" data-cl-sizes="1,2"><h1>Hi</h1></section>`).html;
  assert.doesNotMatch(bad, /evil|data-cl-media|data-cl-layout|data-cl-focus|data-cl-sizes/);
  // A picture other than the logo still never gets in as an <img>.
  assert.doesNotMatch(cleanPage(`<img src="${LIB}" alt="x"><p>Hi</p>`).html, /<img/);
});

test("an upload is kept at the widths smaller than it, in WebP; a GIF keeps only its original", async () => {
  const { photoWidths, sniffImage } = await import("../src/lib/design/assets.ts");
  assert.deepEqual(photoWidths({ type: "image/jpeg", width: 4000 }), [640, 1280, 1920]);
  assert.deepEqual(photoWidths({ type: "image/png", width: 1300 }), [640, 1280]);
  assert.deepEqual(photoWidths({ type: "image/jpeg", width: 500 }), []);
  assert.deepEqual(photoWidths({ type: "image/gif", width: 4000 }), []);
  const sharp = (await import("sharp")).default;
  const jpg = new Uint8Array(await sharp({ create: { width: 2000, height: 1200, channels: 3, background: { r: 200, g: 100, b: 50 } } }).jpeg().toBuffer());
  const out = await sharp(jpg).rotate().resize({ width: 640, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
  const s = sniffImage(new Uint8Array(out));
  assert.equal(s?.type, "image/webp");
  assert.equal(s?.width, 640);
  assert.equal(s?.height, 384);
});

test("the form check stops Publish while a photo has no words for screen readers", async () => {
  const { checkStudioPage } = await import("../src/lib/studio/check.ts");
  const html = (alt: string) => `<div class="page"><section data-cl-cover data-cl-media="${LIB}" data-cl-layout="left"${alt}><h1 class="heading">Hi</h1><button type="button" data-cl-start>Start</button></section><form><input name="email" type="email" data-cl-save="email"><button type="submit">Send</button></form></div>`;
  const without = checkStudioPage({ html: html(""), after: { kind: "thanks" }, meetings: [] });
  assert.ok(without.some((i) => i.code === "photo-alt" && i.level === "error" && i.text.startsWith("The welcome screen's photo")));
  const withAlt = checkStudioPage({ html: html(' data-cl-alt="Two people at a desk"'), after: { kind: "thanks" }, meetings: [] });
  assert.ok(!withAlt.some((i) => i.code === "photo-alt"));
});
