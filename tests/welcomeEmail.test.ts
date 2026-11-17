// The welcome email after the guided setup (src/lib/team/welcome.ts). They prove: the button opens the form just made
// (only a real id, never anything pasted into the job), names are escaped, and the text part says the same.
import { test } from "node:test";
import assert from "node:assert/strict";
import { welcomeEmail } from "../src/lib/team/welcome.ts";

const FORM = "0f8fad5b-d9cb-469f-a165-70867728950e";

test("the button opens the form just made, else Forms", () => {
  const m = welcomeEmail({ name: "Ana Lima", workspace: "Acme", base: "https://app.tryclaritia.com/", form: FORM });
  assert.equal(m.subject, "Welcome to Claritia");
  assert.match(m.html, new RegExp(`https://app.tryclaritia.com/forms/${FORM}`));
  assert.match(m.html, /Open your form/);
  assert.match(m.html, /Hi Ana,/);
  assert.match(m.text, /Open your form: https:\/\/app.tryclaritia.com\/forms\//);
  const none = welcomeEmail({ name: null, workspace: "Acme", base: "https://app.tryclaritia.com", form: "javascript:alert(1)" });
  assert.match(none.html, /href="https:\/\/app.tryclaritia.com\/forms"/);
  assert.match(none.html, /Open Claritia/);
  assert.match(none.html, /Hi, thanks/);
  assert.doesNotMatch(none.html, /javascript/);
});

test("names are escaped", () => {
  const m = welcomeEmail({ name: "<b>Ana</b>", workspace: "A&B <Co>", base: "https://app.tryclaritia.com", form: null });
  assert.doesNotMatch(m.html, /<b>Ana/);
  assert.match(m.html, /A&amp;B &lt;Co&gt; is ready/);
});
