// Studio forms in more than one language and the access rules (docs/studio-v2-plan.md 6.4): translations publish with
// the form when they keep the same questions and answers, and contact answers get the right keyboard and autofill.

import assert from "node:assert/strict";
import { test } from "node:test";
import { checkForm, type Form } from "../src/lib/forms/schema.ts";
import { checkStudioPage } from "../src/lib/studio/check.ts";
import { cleanPage, pageForm } from "../src/lib/studio/page.ts";

const EN = `<form><label for="em">Email</label><input id="em" name="email" data-cl-save="email" required><p>Size</p><label><input type="radio" name="size" value="small"> Small</label><label><input type="radio" name="size" value="big"> Big</label><button type="submit">Send</button><section data-cl-thanks hidden>Thanks</section></form>`;
const FR = EN.replace(">Email<", ">E-mail<").replace(">Size<", ">Taille<").replace("> Small<", "> Petite<").replace("> Big<", "> Grande<").replace(">Send<", ">Envoyer<").replace(">Thanks<", ">Merci<");
const AR = EN.replace(">Email<", ">البريد الإلكتروني<").replace(">Send<", ">إرسال<");

test("contact answers get the right keyboard and the browser's autofill", () => {
  const html = cleanPage(`<input name="email" data-cl-save="email"><input name="tel" data-cl-save="phone" type="text"><input name="fn" data-cl-save="first_name" autocomplete="off">`).html;
  assert.ok(html.includes('autocomplete="email"') && html.includes('type="email"'));
  assert.ok(html.includes('autocomplete="tel"') && html.includes('type="tel"'));
  assert.ok(html.includes('autocomplete="off"') && !html.includes('autocomplete="given-name"'));
});

test("languages publish with the form; bad codes and the page's own language are dropped", () => {
  const { form } = pageForm({ html: EN, css: "", brand: "", after: { kind: "thanks" }, lang: "en", langs: { fr: FR, ar: AR, en: EN, "not a code": FR } });
  const r = checkForm(form);
  assert.ok("form" in r, JSON.stringify("errors" in r ? r.errors : null));
  const pg = (r as { form: Form }).form.page!;
  assert.equal(pg.lang, "en");
  assert.deepEqual(Object.keys(pg.langs ?? {}).sort(), ["ar", "fr"]);
  assert.ok(pg.langs!.fr!.includes("Envoyer") && !pg.langs!.fr!.includes("<script"));
});

test("a translation must keep the same questions and answers", () => {
  const codes = (langs: Record<string, string>) => checkStudioPage({ html: EN, after: { kind: "thanks" }, meetings: null, langs }).map((i) => `${i.level}:${i.code}`);
  assert.ok(!codes({ fr: FR, ar: AR }).some((c) => c.startsWith("error:")));
  assert.ok(codes({ fr: FR.replace('value="big"', 'value="grande"') }).includes("error:lang-differs"));
  assert.ok(codes({ fr: FR.replace(/<label><input type="radio" name="size" value="big">[^<]*<\/label>/, "") }).includes("error:lang-differs"));
});
