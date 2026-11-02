// Industry recipes for Form Studio (src/lib/studio/industries.ts, docs/studio-v2-plan.md 6.1 and 6.3): the site's
// industry, language and country are read and cleaned, Tia gets the recipe, and the form check follows the industry.

import assert from "node:assert/strict";
import { test } from "node:test";
import { checkStudioPage } from "../src/lib/studio/check.ts";
import { INDUSTRIES, industryOf, isRtl, profileWords, readProfile, recipeText } from "../src/lib/studio/industries.ts";

test("twelve industries and Other, each with ideas and what Tia adds", () => {
  assert.equal(INDUSTRIES.length, 13);
  for (const i of INDUSTRIES) assert.ok(i.forms.length >= 2 && i.adds && i.name, i.key);
  assert.equal(industryOf("nope").key, "general");
});

test("the profile from the site is cleaned: unknown industries are Other, bad codes are dropped", () => {
  assert.deepEqual(readProfile('{"industry":"health","language":"en","country":"ca","languages":["en","fr","xx-yy-zz"]}'), { industry: "health", language: "en", country: "CA", languages: ["en", "fr"] });
  assert.deepEqual(readProfile({ industry: "space mining", language: "klingon" }), { industry: "general", language: "en", country: "", languages: ["en"] });
  assert.equal(readProfile("not json"), null);
  assert.equal(profileWords({ industry: "health", language: "en", country: "CA", languages: ["en", "fr"] }), "Healthcare and dental in Canada, English and French");
  assert.ok(isRtl("ar") && isRtl("he-IL") && !isRtl("en"));
});

test("Tia reads the recipe: language, what to add and the rule", () => {
  const t = recipeText({ industry: "recruiting", language: "fr", country: "FR", languages: ["fr", "en"] });
  assert.ok(t.includes("Recruiting and HR") && t.includes("Write the form in French") && t.includes("résumé file block") && t.includes("No age"));
  assert.equal(recipeText(null), "");
});

const page = (extra: string) => `<form><label for="em">Email</label><input id="em" name="email" type="email" required>${extra}<button type="submit">Send</button><section data-cl-thanks hidden>Thanks</section></form>`;
const run = (extra: string, industry: string) => checkStudioPage({ html: page(extra), after: { kind: "thanks" }, meetings: null, industry }).map((i) => `${i.level}:${i.code}`);

test("hiring, lending and housing stop protected questions; elsewhere they're a note", () => {
  const dob = '<label for="d">Date of birth</label><input id="d" name="dob" type="date">';
  assert.ok(run(dob, "recruiting").includes("error:protected"));
  assert.ok(run(dob, "finance").includes("error:protected"));
  assert.ok(run(dob, "realestate").includes("error:protected"));
  assert.ok(run(dob, "events").includes("warning:protected"));
});

test("law firms get a note to say the form doesn't make them a client; schools to ask for a parent", () => {
  assert.ok(run("", "legal").includes("warning:legal-notice"));
  assert.ok(!run("<p>Sending this form doesn't make you a client.</p>", "legal").includes("warning:legal-notice"));
  const grade = '<label for="g">Grade</label><input id="g" name="grade">';
  assert.ok(run(grade, "education").includes("warning:parent"));
  assert.ok(!run(`${grade}<label for="p">Parent or guardian email</label><input id="p" name="parent" type="email">`, "education").includes("warning:parent"));
});
