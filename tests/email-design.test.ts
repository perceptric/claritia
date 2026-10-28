// Emails on the design system (docs/design-system.md Part 4): the document keeps only safe blocks, links and text;
// the compiler inlines the values the cascade picks, writes phone, hover and dark rules, builds Outlook's markup,
// guards the size, and makes the plain text; conditional parts show only for the people they're for.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readSystem } from "../src/lib/design/model.ts";
import { applyConditions, compileEmail, emailText, MAX_EMAIL_BYTES } from "../src/lib/design/email/compile.ts";
import { condHolds, docFromBody, emptyEmailDoc, newBlock, readEmailDoc, type EmailDoc } from "../src/lib/design/email/doc.ts";
import { cleanHtml, htmlToText, safeHref } from "../src/lib/design/email/html.ts";
import { resolveEmail } from "../src/lib/design/email/style.ts";
import { DEFAULT_TOKENS } from "../src/lib/forms/brand.ts";

const sys = (raw: object = {}) => readSystem(raw, DEFAULT_TOKENS);
const doc = (raw: object) => readEmailDoc({ settings: {}, ...raw }, { allowHtml: true });
const one = (blocks: object[], extra: object = {}) => doc({ sections: [{ id: "s1", columns: [{ id: "c1", width: 100, blocks }] }], ...extra });

test("rich text: only allowed tags and safe links survive", () => {
  assert.equal(cleanHtml('<p>Hi <b>there</b><script>alert(1)</script></p>'), "<p>Hi <b>there</b></p>");
  assert.equal(cleanHtml('<a href="javascript:alert(1)">x</a>'), "x");
  assert.equal(cleanHtml('<a href="https://a.io/?q=1&r=2" onclick="x()">go</a>'), '<a href="https://a.io/?q=1&amp;r=2">go</a>');
  assert.equal(cleanHtml('<img src="https://a.io/x.png" onerror="x">'), "", "no images in rich text");
  assert.equal(cleanHtml('<img src="https://a.io/x.png" onerror="x">', "block"), '<img src="https://a.io/x.png">');
  assert.equal(cleanHtml('<img src="http://a.io/x.png">', "block"), "<img>", "http images are dropped");
  assert.equal(cleanHtml('<div style="color:red;background:url(x)">a</div>', "block"), '<div style="color:red">a</div>');
  assert.equal(cleanHtml("<b>open"), "<b>open</b>", "open tags are closed");
  assert.equal(cleanHtml("1 < 2 & 3"), "1 &lt; 2 &amp; 3");
  assert.equal(cleanHtml('<iframe src="https://x"></iframe><style>body{}</style>ok'), "ok");
  assert.equal(cleanHtml("<!-- <script>x</script> -->ok"), "ok");
  assert.equal(safeHref("{{unsubscribe_url}}"), "{{unsubscribe_url}}");
  assert.equal(safeHref("mailto:a@b.io"), "mailto:a@b.io");
  assert.equal(safeHref('https://a.io/"><script>'), null);
  assert.equal(htmlToText('<p>Hi <a href="https://a.io">there</a></p><ul><li>One</li></ul>'), "Hi there (https://a.io)\n- One");
});

test("documents: unknown blocks, repeated ids and unsafe values never get through", () => {
  const d = readEmailDoc(
    {
      settings: { width: 999, preheader: "Line\none" },
      sections: [
        {
          id: "s1",
          columns: [
            { id: "c1", width: 30, blocks: [{ id: "b1", type: "heading", text: "<b>Hi</b>", level: 9 }, { id: "b1", type: "text", html: "dup" }, { id: "b2", type: "nope" }, { id: "b3", type: "html", html: "<p>x</p>" }] },
            { id: "c2", width: 30, blocks: [{ id: "b4", type: "button", label: "Go", url: "javascript:alert(1)" }] },
          ],
        },
        { id: "s1", columns: [{ id: "c3", blocks: [] }] },
      ],
      styles: { b1: { heading: { base: { color: "red;}x{" , "font-size": "20px" } } }, ghost: { text: { base: { color: "#000000" } } } },
    },
    {},
  );
  assert.equal(d.settings.width, 600);
  assert.equal(d.settings.preheader, "Line one");
  assert.equal(d.sections.length, 1, "a repeated section id is dropped");
  const [c1, c2] = d.sections[0]!.columns;
  assert.deepEqual(c1!.blocks.map((b) => b.id), ["b1"], "repeated ids, unknown types and HTML (not owners) are dropped");
  assert.equal((c1!.blocks[0] as { level: number }).level, 2);
  assert.equal((c2!.blocks[0] as { url: string }).url, "");
  assert.equal(c1!.width + c2!.width, 100, "widths add up to 100");
  assert.deepEqual(d.styles, { b1: { heading: { base: { "font-size": "20px" } } } });
  const owners = readEmailDoc({ sections: [{ id: "s", columns: [{ id: "c", blocks: [{ id: "h", type: "html", html: "<p onclick=x>ok</p>" }] }] }] }, { allowHtml: true });
  assert.equal((owners.sections[0]!.columns[0]!.blocks[0] as { html: string }).html, "<p>ok</p>");
});

test("documents: today's simple emails open as blocks", () => {
  const d = docFromBody({ preheader: "Pre", paragraphs: ["Hi {{first_name|there}},", "Line <two>"], cta_label: "Book", cta_url: "https://a.io" });
  assert.equal(d.settings.preheader, "Pre");
  const blocks = d.sections[0]!.columns[0]!.blocks;
  assert.deepEqual(blocks.map((b) => b.type), ["text", "button"]);
  assert.equal((blocks[0] as { html: string }).html, "<p>Hi {{first_name|there}},</p><p>Line &lt;two&gt;</p>");
  assert.deepEqual(readEmailDoc(d), d, "it reads back the same");
});

test("compiler: inline values follow the cascade, phone and hover go in the style block", () => {
  const system = sys({
    variables: [{ id: "brand", name: "Brand", kind: "color", value: "#3355ff", dark: "#99aaff" }],
    email: {
      globals: { heading: { base: { color: "$brand" }, phone: { "line-height": "1.1" } }, button: { "base:hover": { "background-color": "#000000" } } },
      classes: [{ id: "k1", name: "Big", styles: { heading: { base: { "font-size": "40px" } } } }],
    },
  });
  const d = one([{ id: "h1", type: "heading", text: "Hello & welcome", level: 1 }, { id: "bt", type: "button", label: "Go", url: "https://a.io" }], {
    classes: { h1: ["k1"] },
    styles: { h1: { heading: { base: { "letter-spacing": "1px", "margin-bottom": "12px" } } } },
  });
  const r = resolveEmail(system, d, { id: "h1", part: "heading" }, "base");
  assert.equal(r.color?.value, "$brand");
  assert.equal(r["font-size"]?.source.level, "class");
  const { html, notes } = compileEmail(system, d, { tokens: DEFAULT_TOKENS });
  const h = /<h1 class="ch1-heading" style="margin:0;([^"]*)">Hello &amp; welcome<\/h1>/.exec(html);
  assert.ok(h, "the heading is there, escaped, with its class");
  assert.match(h![1]!, /color:#3355ff/, "a variable is written as its value");
  assert.match(h![1]!, /font-size:40px/, "the class beats the global style");
  assert.match(h![1]!, /letter-spacing:1px/);
  assert.doesNotMatch(h![1]!, /margin-bottom/, "margins move to the wrapper cell");
  assert.match(html, /padding:0 0 12px 0;/, "as padding");
  assert.match(html, /@media \(max-width:480px\)\{[^\n]*\.ch1-heading\{line-height:1\.1 !important\}/, "the phone value is a rule");
  assert.match(html, /@media \(hover:hover\)\{\.cbt-button:hover\{background-color:#000000 !important\}\}/);
  assert.match(html, /@media \(prefers-color-scheme:dark\)\{[^\n]*\.ch1-heading\{color:#99aaff !important\}/, "the variable's dark value is the dark rule");
  assert.match(html, /\[data-ogsc\] \.ch1-heading\{color:#99aaff !important\}/, "and Outlook.com's");
  assert.match(html, /<v:roundrect [^>]*href="https:\/\/a\.io"/, "Outlook gets a VML button");
  assert.match(html, /<!--\[if !mso\]><!--><a href="https:\/\/a\.io"/);
  assert.ok(notes.some((n) => /Footer/.test(n.text)), "a missing footer is noted");
});

test("compiler: columns, visibility, footer, plain text and size", () => {
  const d = doc({
    sections: [
      {
        id: "s1",
        columns: [
          { id: "c1", width: 50, blocks: [{ id: "t1", type: "text", html: '<p>Left <a href="https://a.io">link</a></p>' }] },
          { id: "c2", width: 50, blocks: [{ id: "i1", type: "image", src: "https://cdn.io/x.png", alt: "", width: 300 }] },
        ],
      },
      { id: "s2", hideOn: "phone", columns: [{ id: "c3", blocks: [{ id: "f1", type: "footer", address: "1 Main St" }] }] },
    ],
  });
  const { html, text, size, notes } = compileEmail(sys(), d, { tokens: DEFAULT_TOKENS });
  assert.match(html, /<!--\[if mso\]><td width="268" valign="top"><!\[endif\]-->/, "ghost table cells for Outlook");
  assert.equal((html.match(/class="clr-col clr-stack"/g) ?? []).length, 2, "both columns stack on phones");
  assert.match(html, /<a style="[^"]*color:#[0-9a-f]{6}[^"]*" href="https:\/\/a\.io">link<\/a>/, "links get the link style inline");
  assert.match(html, /<div class="clr-hp">/, "hidden on phones");
  assert.match(html, /href="\{\{unsubscribe_url\}\}"/);
  assert.ok(notes.some((n) => /alt text/.test(n.text)));
  assert.equal(text, "Left link (https://a.io)\n\n1 Main St\nUnsubscribe: {{unsubscribe_url}}");
  assert.ok(size > 1000 && size < 20_000);
  const big = one(Array.from({ length: 199 }, (_, i) => ({ id: `t${i}`, type: "text", html: `<p>${"word ".repeat(120)}</p>` })));
  const out = compileEmail(sys(), big, { tokens: DEFAULT_TOKENS });
  assert.ok(out.size > MAX_EMAIL_BYTES && out.notes.some((n) => n.level === "block"), "an email over 95 KB is blocked");
});

test("compiler: nothing written into an email can break out of its place", () => {
  const d = one([
    { id: "h", type: "heading", text: '</h2><script>alert(1)</script>' },
    { id: "b", type: "button", label: '"><img src=x onerror=1>', url: 'https://a.io/"onmouseover="x' },
    { id: "i", type: "image", src: 'https://a.io/x.png" onerror="x', alt: '"><b>' },
    { id: "t", type: "text", html: '<a href="https://a.io" style="x">a</a><img src=x onerror=1>' },
  ]);
  const { html } = compileEmail(sys(), d, { tokens: DEFAULT_TOKENS });
  // Words stay words (escaped); no tag or attribute gets in.
  assert.doesNotMatch(html, /<script|<img src=x|<b>|<[^>]* onerror=|<[^>]* onmouseover=|"onmouseover/);
});

test("conditions: each person sees only the parts meant for them, in HTML and text", () => {
  assert.equal(condHolds({ field: "company", op: "contains", value: "acme" }, { company: "ACME Inc" }), true);
  assert.equal(condHolds({ field: "title", op: "is_set" }, { title: "  " }), false);
  const d = doc({
    sections: [
      { id: "s1", columns: [{ id: "c1", blocks: [{ id: "a", type: "heading", text: "For all" }, { id: "b", type: "heading", text: "Hi Acme", showIf: { field: "company", op: "is", value: "Acme" } }] }] },
      { id: "s2", showIf: { field: "title", op: "is_set" }, columns: [{ id: "c2", blocks: [{ id: "c", type: "heading", text: "Has a title", showIf: { field: "company", op: "is_not", value: "Acme" } }] }] },
    ],
  });
  const { html } = compileEmail(sys(), d, { tokens: DEFAULT_TOKENS });
  const text = emailText(d);
  const forAcme = applyConditions(html, { company: "Acme", title: "CEO" });
  assert.match(forAcme, /Hi Acme/);
  assert.doesNotMatch(forAcme, /Has a title/, "a nested condition still applies");
  assert.doesNotMatch(forAcme, /clr-if|clr-end/);
  const other = applyConditions(html, { company: "Other", title: "CEO" });
  assert.doesNotMatch(other, /Hi Acme/);
  assert.match(other, /Has a title/);
  assert.doesNotMatch(applyConditions(html, {}), /Has a title|Hi Acme/);
  assert.equal(applyConditions(text, { company: "Acme" }), "For all\n\nHi Acme\n\n");
  // A damaged marker drops its content instead of showing it to everyone.
  assert.equal(applyConditions("a<!--clr-if:%7Bbroken-->secret<!--clr-end-->b", {}), "ab");
  assert.equal(applyConditions("no markers", {}), "no markers");
});

test("compiler: every new block compiles, and the starting email has no blocking notes", () => {
  const start: EmailDoc = emptyEmailDoc();
  const r = compileEmail(sys(), start, { tokens: DEFAULT_TOKENS });
  assert.ok(!r.notes.some((n) => n.level === "block"));
  for (const type of ["heading", "text", "button", "image", "logo", "divider", "spacer", "list", "quote", "social", "video", "product", "event", "meeting", "signature", "footer", "html"] as const) {
    const d = readEmailDoc(one([newBlock(type, "x1")]), { allowHtml: true });
    assert.equal(d.sections[0]!.columns[0]!.blocks.length, 1, `${type} reads back`);
    const out = compileEmail(sys(), d, { tokens: DEFAULT_TOKENS, logo: "https://cdn.io/logo.png" });
    assert.ok(out.html.includes("</html>"), `${type} compiles`);
  }
});

test("email edits: a value lands at its level; classes go on by name; bad values change nothing", async () => {
  const { setEmailProp, addEmailClass, removeEmailClass, emailOrigin, emailOwnValue } = await import("../src/lib/design/email/edit.ts");
  const e0 = { system: sys(), doc: one([{ id: "h1", type: "heading", text: "Hi" }]) };
  const el = setEmailProp(e0, DEFAULT_TOKENS, { kind: "element" }, "h1", "heading", "phone", "dark", "color", "#ff0000")!;
  assert.deepEqual(el.doc.styles, { h1: { heading: { "phone:dark": { color: "#ff0000" } } } });
  assert.equal(setEmailProp(e0, DEFAULT_TOKENS, { kind: "element" }, "h1", "heading", "base", undefined, "color", "red;}x{"), null);
  const g = setEmailProp(e0, DEFAULT_TOKENS, { kind: "global" }, "h1", "heading", "base", undefined, "border-top-width", "2px")!;
  assert.deepEqual(g.system.email?.globals.heading?.base, { "border-top-width": "2px", "border-top-style": "solid" });
  assert.equal(emailOrigin(g, { kind: "element" }, "h1", "heading", "base", undefined, "border-top-width"), "global");
  const c = addEmailClass(e0, "h1", "Hero");
  assert.ok(!("error" in c));
  const cid = c.system.email!.classes[0]!.id;
  const cs = setEmailProp(c, DEFAULT_TOKENS, { kind: "class", id: cid }, "h1", "heading", "base", undefined, "font-size", "40px")!;
  assert.equal(emailOwnValue(cs, { kind: "class", id: cid }, "h1", "heading", "base", undefined, "font-size"), "40px");
  assert.match(compileEmail(cs.system, cs.doc, { tokens: DEFAULT_TOKENS }).html, /font-size:40px/);
  // What the edits make reads back the same through the saved-design checks.
  assert.deepEqual(readSystem(cs.system, DEFAULT_TOKENS).email, cs.system.email);
  assert.deepEqual(readEmailDoc(cs.doc, { system: cs.system, tokens: DEFAULT_TOKENS }).classes, { h1: [cid] });
  assert.equal(removeEmailClass(cs, "h1", cid).doc.classes, undefined);
});

test("structure: add, move, copy, remove and change columns without losing anything", async () => {
  const ops = await import("../src/lib/design/email/ops.ts");
  let d = doc({ sections: [{ id: "s1", columns: [{ id: "c1", blocks: [{ id: "a", type: "heading", text: "A" }, { id: "b", type: "heading", text: "B" }, { id: "c", type: "heading", text: "C" }] }] }], styles: { a: { heading: { base: { color: "#ff0000" } } } } });
  const order = (x: EmailDoc) => x.sections.flatMap((s) => s.columns.flatMap((c) => c.blocks.map((b) => b.id)));
  assert.deepEqual(order(ops.moveBlock(d, "a", { column: "c1", index: 3 })), ["b", "c", "a"], "moving down counts the place before it's taken out");
  assert.deepEqual(order(ops.moveBlock(d, "c", { column: "c1", index: 0 })), ["c", "a", "b"]);
  const dup = ops.duplicateEl(d, "a");
  assert.equal(order(dup.doc).length, 4);
  assert.notEqual(dup.id, "a");
  assert.deepEqual(dup.doc.styles?.[dup.id!], d.styles?.a, "a copy keeps the looks under its own id");
  const two = ops.setColumns(d, "s1", [50, 50]);
  assert.equal(two.sections[0]!.columns.length, 2);
  const back = ops.setColumns(ops.addBlock(two, newBlock("divider", "z"), { column: two.sections[0]!.columns[1]!.id, index: 0 }), "s1", [100]);
  assert.deepEqual(order(back), ["a", "b", "c", "z"], "blocks from a removed column move into the one kept");
  d = ops.removeEl(d, "a");
  assert.equal(d.styles, undefined, "a removed block's styles go too");
  assert.deepEqual(order(ops.removeEl(ops.addBlock(d, newBlock("text", "t"), { section: 1 }), d.sections[0]!.id)), ["t"]);
  const u = ops.updateBlock(d, "b", { text: "New", id: "hack", type: "html" } as never);
  assert.deepEqual(u.sections[0]!.columns[0]!.blocks[0], { id: "b", type: "heading", text: "New", level: 2 });
  assert.deepEqual(readEmailDoc(dup.doc), dup.doc, "every change reads back the same");
});

test("client view: what a mail app ignores is left out, and fonts fall back to the safe ones", () => {
  const system = sys({ email: { globals: { heading: { base: { "box-shadow": "0 1px 2px #000000", "border-top-left-radius": "8px", "font-family": "'Poppins', Arial, sans-serif" } } } } });
  const d = one([{ id: "h", type: "heading", text: "Hi" }]);
  const all = compileEmail(system, d, { tokens: DEFAULT_TOKENS }).html;
  assert.match(all, /box-shadow:0 1px 2px #000000/);
  const outlook = compileEmail(system, d, { tokens: DEFAULT_TOKENS, client: "outlook" }).html;
  assert.doesNotMatch(outlook, /box-shadow|border-top-left-radius:8px/);
  assert.match(outlook, /<h2 [^>]*font-family:Arial, sans-serif/);
  const apple = compileEmail(system, d, { tokens: DEFAULT_TOKENS, client: "apple" }).html;
  assert.match(apple, /box-shadow:0 1px 2px #000000/, "Apple Mail draws shadows");
});

test("design check: hard-to-read text, alt text, buttons, small text, links, merge tags and near colors", async () => {
  const { checkEmailDesign, checkFormDesign, hex } = await import("../src/lib/design/check.ts");
  assert.equal(hex("rgb(255, 0, 0)"), "#ff0000");
  assert.equal(hex("#abc"), "#aabbcc");
  assert.equal(hex("rgba(0,0,0,0.5)"), null, "see-through colors aren't judged");
  const system = sys({ variables: [{ id: "brand", name: "Brand", kind: "color", value: "#3355ff", dark: "#202020" }], email: { globals: { content: { "base:dark": { "background-color": "#111111" } } } } });
  const d = doc({
    sections: [
      {
        id: "s1",
        columns: [
          {
            id: "c1",
            blocks: [
              { id: "h", type: "heading", text: "Hi {{first_name}}" },
              { id: "i", type: "image", src: "https://cdn.io/x.png", alt: "" },
              { id: "b1", type: "button", label: "One", url: "http://a.io" },
              { id: "b2", type: "button", label: "Two", url: "https://a.io" },
              { id: "t", type: "text", html: '<p>x <a href="https://a.io"></a></p>' },
            ],
          },
        ],
      },
    ],
    styles: { h: { heading: { base: { color: "#eeeeee" }, "base:dark": { color: "$brand" } } }, t: { text: { phone: { "font-size": "12px" }, base: { color: "#3356fe" } } } },
  });
  const notes = checkEmailDesign(system, d, DEFAULT_TOKENS);
  const has = (re: RegExp, id?: string) => notes.some((n) => re.test(n.text) && (id === undefined || n.id === id));
  assert.ok(has(/hard to read \(/, "h"), "light gray on white");
  assert.ok(notes.some((n) => n.id === "h" && /dark mode/.test(n.text)), "a variable's dark value on the dark background");
  assert.ok(has(/alt text/, "i"));
  assert.ok(has(/more than one main button/, "s1"));
  assert.ok(has(/http:\/\//, "b1"));
  assert.ok(has(/12px on phones/, "t"));
  assert.ok(has(/no words/, "t"));
  assert.ok(has(/nearly Brand/, "t"));
  assert.ok(has(/Give \{\{first_name\}\} a fallback/));
  assert.ok(notes.some((n) => n.level === "block" && /Footer/.test(n.text)));
  assert.ok(!checkEmailDesign(system, d, DEFAULT_TOKENS, { marketing: false }).some((n) => n.level === "block"));
  // The starting email passes.
  const start = (await import("../src/lib/design/email/doc.ts")).emptyEmailDoc();
  assert.deepEqual(checkEmailDesign(sys(), start, DEFAULT_TOKENS).filter((n) => !/button is/.test(n.text)), []);
  // Forms.
  const { checkForm, emptyForm } = await import("../src/lib/forms/schema.ts");
  const r = checkForm({ ...emptyForm(), steps: [{ id: "s", fields: [{ id: "a", key: "email", type: "email", label: "Email", required: true }] }], design: { styles: { a: { label: { base: { color: "#dddddd" } }, input: { phone: { "min-height": "30px" } } } } } });
  assert.ok("form" in r);
  const fn = checkFormDesign(sys(), r.form, DEFAULT_TOKENS);
  assert.ok(fn.some((n) => /label of Email is hard to read/.test(n.text)));
  assert.ok(fn.some((n) => /30px tall on phones/.test(n.text)));
});
