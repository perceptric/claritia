// The last check before a campaign goes (src/lib/emails/sendCheck.ts, docs/email-studio-plan.md Part 10).
import assert from "node:assert/strict";
import { test } from "node:test";
import { readEmailDoc, type Block, type EmailDoc } from "../src/lib/design/email/doc.ts";
import { EMAIL_TEMPLATES } from "../src/lib/design/email/library.ts";
import { linkWorks, placeholdersIn, sendCheck } from "../src/lib/emails/sendCheck.ts";

let n = 0;
const doc = (blocks: Partial<Block>[], preheader = ""): EmailDoc => {
  const d = readEmailDoc({});
  return { ...d, settings: { ...d.settings, preheader }, sections: [{ id: `s${n++}`, columns: [{ id: `c${n++}`, width: 100, blocks: blocks.map((b) => ({ id: `b${n++}`, ...b }) as Block) }] }] } as EmailDoc;
};
const LONG = "<p>Spring is here and the workshop opens next week. Bring your laptop, a notebook and the questions you have about planning the garden this year with us.</p>";

test("links: real hosts, mail, phone and merge tags work; the template's https:// and # don't", () => {
  for (const ok of ["https://acme.com", "https://acme.com/a?b=1#c", "http://sub.acme.co.uk", "mailto:ana@acme.io", "tel:+1 512 555 0100", "{{booking_url}}", "{{unsubscribe_url}}", "https://{{workspace}}.acme.com"]) assert.ok(linkWorks(ok), ok);
  for (const no of ["", "https://", "#", "acme.com", "https://localhost", "javascript:alert(1)", "https://acme", "[your link]"]) assert.ok(!linkWorks(no), no);
});

test("placeholders: brackets with words, never merge tags or numbers", () => {
  assert.deepEqual(placeholdersIn("On [date] at [time], see [1] and {{first_name|[there]}}"), ["[date]", "[time]"]);
});

test("a template sent as it comes stops: placeholders and links to fill in", () => {
  const t = EMAIL_TEMPLATES.find((x) => x.make().sections.some((s) => s.columns.some((c) => c.blocks.some((b) => b.type === "button"))))!;
  const r = sendCheck(t.make(), "Hello");
  assert.ok(r.stops.some((s) => /no working link/.test(s)), t.key);
});

test("a filled email passes; a placeholder in the subject stops it; broken text links stop it", () => {
  const good = doc([{ type: "text", html: LONG }, { type: "button", label: "Book a time", url: "https://acme.com/book", align: "left" }, { type: "footer" }]);
  assert.deepEqual(sendCheck(good, "Spring workshop"), { stops: [], warns: [] });
  assert.match(sendCheck(good, "Spring workshop on [date]").stops[0]!, /Fill in \[date\]/);
  const text = doc([{ type: "text", html: `${LONG}<p><a href="https://">here</a></p>` }, { type: "footer" }]);
  assert.deepEqual(sendCheck(text, "Hi").stops, ["A link in the text goes to a broken address."]);
});

test("warnings: only pictures, no alt text, merge tags without a fallback", () => {
  const pics = doc([{ type: "image", src: "https://acme.com/a.png", alt: "", align: "center" }, { type: "text", html: "<p>Hi {{first_name}}</p>" }, { type: "footer" }]);
  const r = sendCheck(pics, "Look");
  assert.deepEqual(r.stops, []);
  assert.equal(r.warns.length, 3);
  assert.match(r.warns[0]!, /mostly pictures/);
});
