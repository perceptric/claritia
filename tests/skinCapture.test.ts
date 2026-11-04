// What the site read picks up for a brand's Form Studio stylesheet (src/lib/brand/skinCapture.ts, read by
// src/lib/brand/sourceSkin.ts): @font-face files in stylesheets, the pages likely to hold a form, and pages merged by role.
import assert from "node:assert/strict";
import { test } from "node:test";
import { facesIn, formPages, mergeSources, type SkinSource } from "../src/lib/brand/skinCapture.ts";

test("the capture finds @font-face files in stylesheets and the pages that hold forms", () => {
  const faces = facesIn('@font-face{font-family:"Brand Sans";src:url(../fonts/brand.woff2) format("woff2"),url(x.woff);font-weight:700}', "https://cdn.acme.com/css/app.css");
  assert.deepEqual(faces, [{ family: "Brand Sans", weight: "700", style: "normal", src: "https://cdn.acme.com/fonts/brand.woff2" }]);
  const pages = formPages(
    [
      { href: "https://www.acme.com/handbook", text: "Handbook" },
      { href: "https://www.acme.com/log-in", text: "Log in" },
      { href: "https://www.acme.com/register", text: "Get started" },
      { href: "https://other.com/contact", text: "Contact" },
      { href: "https://acme.com/contact#form", text: "Contact us" },
    ],
    "https://www.acme.com/",
  );
  assert.deepEqual(pages, ["https://www.acme.com/register", "https://acme.com/contact", "https://www.acme.com/log-in"]);
});

const SRC: SkinSource = {
  url: "https://www.duolingo.com/",
  page: { color: "rgb(75, 75, 75)" },
  parts: [
    { role: "primary", text: "GET STARTED", self: { fontFamily: "duolingo-sans, sans-serif" }, boxFrom: "before", box: { backgroundColor: "rgb(88, 204, 2)", boxShadow: "rgb(88, 167, 0) 0px 4px 0px 0px" }, pressed: { boxShadow: "none" }, shot: "iVBORw0KGgo=" },
    { role: "input", text: "Email", self: {}, boxFrom: "parent", box: { backgroundColor: "rgb(247, 247, 247)" } },
  ],
  faces: [{ family: "duolingo-sans", weight: "100 900", style: "normal", src: "https://cdn.example.com/a.woff2" }],
};

test("pages merge by role, keeping each font once", () => {
  const merged = mergeSources([SRC, { ...SRC, url: "https://www.duolingo.com/log-in", parts: [{ ...SRC.parts[1]!, text: "Password" }, { role: "card", text: "Spanish", self: {}, boxFrom: "self", box: {} }] }]);
  assert.deepEqual(merged?.parts.map((p) => `${p.role}:${p.text}`), ["primary:GET STARTED", "input:Email", "card:Spanish"]);
  assert.equal(merged?.faces.length, 1);
});
