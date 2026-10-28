// Imports (docs/design-system.md Part 7.5): emails from elsewhere become blocks, safely, and nothing unknown is lost.
import assert from "node:assert/strict";
import { test } from "node:test";
import { compileEmail } from "../src/lib/design/email/compile.ts";
import { importAny, importEml, importHtml, importMjml } from "../src/lib/design/email/import.ts";
import { readEmailDoc, type EmailDoc } from "../src/lib/design/email/doc.ts";
import { readSystem } from "../src/lib/design/model.ts";
import { DEFAULT_TOKENS } from "../src/lib/forms/brand.ts";

const blocks = (d: EmailDoc) => d.sections.flatMap((s) => s.columns.flatMap((c) => c.blocks));
const types = (d: EmailDoc) => blocks(d).map((b) => b.type);

test("HTML: headings, text, buttons, images, lists, columns and their looks", () => {
  const html = `<!doctype html><html><head><title>Spring update</title><style>.x{color:red}</style></head><body>
  <div style="display:none">Peek inside</div>
  <table width="600"><tr><td>
    <img src="https://cdn.acme.io/logo.png" alt="Acme" width="120">
    <h1 style="color:#112233;font-size:30px;text-align:center">Spring update</h1>
    <p style="color:#444444">Hi <b>there</b>, here's <a href="https://acme.io/news">what's new</a>.</p>
    <table><tr><td bgcolor="#3355ff"><a href="https://acme.io/go" style="color:#ffffff;padding:12px 20px;display:inline-block">Read more</a></td></tr></table>
    <ul><li>One</li><li>Two</li></ul>
    <hr>
    <img src="https://t.acme.io/open.gif" width="1" height="1">
  </td></tr>
  <tr><td width="50%"><p>Left side</p></td><td width="50%"><img src="https://cdn.acme.io/pic.jpg" alt="Pic"></td></tr>
  </table>
  <script>alert(1)</script><p onclick="x()">Unsubscribe <a href="javascript:void(0)">here</a></p>
  </body></html>`;
  const r = importHtml(html);
  assert.equal(r.subject, "Spring update");
  assert.equal(r.doc.settings.preheader, "Peek inside");
  assert.deepEqual(types(r.doc), ["image", "heading", "text", "button", "list", "divider", "text", "image", "text", "footer"]);
  const bs = blocks(r.doc);
  const heading = bs.find((b) => b.type === "heading")!;
  assert.deepEqual(r.doc.styles?.[heading.id], { heading: { base: { color: "#112233", "font-size": "30px", "text-align": "center" } } }, "its looks become its own styles");
  const text = bs.find((b) => b.type === "text") as { html: string };
  assert.equal(text.html, '<p>Hi <b>there</b>, here\'s <a href="https://acme.io/news">what\'s new</a>.</p>');
  assert.deepEqual(bs.find((b) => b.type === "button"), { id: bs.find((b) => b.type === "button")!.id, type: "button", label: "Read more", url: "https://acme.io/go", align: "left" });
  assert.equal(r.doc.sections.filter((s) => s.columns.length === 2).length, 1, "a row of two cells becomes two columns");
  assert.ok(!JSON.stringify(r.doc).includes("javascript") && !JSON.stringify(r.doc).includes("alert"), "nothing unsafe comes in");
  assert.ok(!bs.some((b) => b.type === "image" && (b as { src: string }).src.includes("open.gif")), "tracking pixels stay out");
  assert.deepEqual(readEmailDoc(r.doc, { allowHtml: true }), r.doc);
  assert.ok(compileEmail(readSystem({}, DEFAULT_TOKENS), r.doc, { tokens: DEFAULT_TOKENS }).html.includes("Spring update"));
});

test("MJML: tag for tag", () => {
  const mjml = `<mjml><mj-head><mj-title>Launch</mj-title><mj-preview>It's here</mj-preview><mj-attributes><mj-all font-family="Arial"/></mj-attributes></mj-head>
  <mj-body><mj-section><mj-column width="40%"><mj-image src="https://cdn.io/a.png" alt="A" href="https://a.io"/></mj-column>
  <mj-column width="60%"><mj-text color="#222222" font-size="18px"><h2>Big news</h2><p>Some <i>words</i>.</p></mj-text><mj-button href="https://a.io/b" background-color="#ff0000">Go now</mj-button></mj-column></mj-section>
  <mj-section><mj-column><mj-divider/><mj-spacer height="30px"/><mj-social><mj-social-element name="twitter" href="https://x.com/a">X</mj-social-element><mj-social-element name="linkedin" href="https://linkedin.com/a">In</mj-social-element></mj-social><mj-raw><p onclick="x">Raw</p></mj-raw></mj-column></mj-section></mj-body></mjml>`;
  const r = importMjml(mjml);
  assert.equal(r.subject, "Launch");
  assert.equal(r.doc.settings.preheader, "It's here");
  assert.deepEqual(r.doc.sections[0]!.columns.map((c) => c.width), [40, 60]);
  assert.deepEqual(types(r.doc), ["image", "text", "button", "divider", "spacer", "social", "html", "footer"]);
  const social = blocks(r.doc).find((b) => b.type === "social") as { links: { kind: string }[] };
  assert.deepEqual(social.links.map((l) => l.kind), ["x", "linkedin"]);
  const button = blocks(r.doc).find((b) => b.type === "button")!;
  assert.deepEqual(r.doc.styles?.[button.id], { button: { base: { "background-color": "#ff0000" } } });
  assert.equal((blocks(r.doc).find((b) => b.type === "html") as { html: string }).html, "<p>Raw</p>");
  assert.equal(importAny(mjml).subject, "Launch", "pasted MJML is recognized");
});

test(".eml: the subject and the HTML part, whatever the encoding", () => {
  const eml = [
    "From: News <news@acme.io>",
    "Subject: =?utf-8?B?" + Buffer.from("Café news").toString("base64") + "?=",
    "MIME-Version: 1.0",
    'Content-Type: multipart/alternative; boundary="b1"',
    "",
    "--b1",
    "Content-Type: text/plain; charset=utf-8",
    "",
    "Plain words",
    "--b1",
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: quoted-printable",
    "",
    "<h1>Caf=C3=A9 news</h1><p>A long line that goes on=",
    " and on</p>",
    "--b1--",
  ].join("\r\n");
  const r = importEml(eml);
  assert.equal(r.subject, "Café news");
  assert.deepEqual(types(r.doc), ["heading", "text", "footer"]);
  assert.equal((blocks(r.doc)[0] as { text: string }).text, "Café news");
  assert.match((blocks(r.doc)[1] as { html: string }).html, /goes on and on/);
  assert.equal(importAny(eml).subject, "Café news", "a pasted .eml is recognized");
  const plain = importEml("Subject: Hi\r\nContent-Type: text/plain\r\n\r\nFirst para\r\n\r\nSecond <b>para</b>");
  assert.deepEqual(types(plain.doc), ["text", "text", "footer"]);
  assert.equal((blocks(plain.doc)[1] as { html: string }).html, "<p>Second &lt;b&gt;para&lt;/b&gt;</p>");
});
