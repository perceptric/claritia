// "Team members", never "reps" (src/lib/words.ts): teams aren't only sales. Every string and JSX text in Meetings,
// Routing, Workflows, Reports and Forms, and in the router, routing, workflow and meeting libraries, is read; a word
// "rep" or "reps" in anything a person could see fails. Code names (router_reps, the "rep" action) stay as they are.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { anyoneOn, count, OLD_WHOLE_TEAM, WHOLE_TEAM } from "../src/lib/words.ts";
import { cleanBody } from "../src/lib/router/check.ts";

const root = new URL("../src/", import.meta.url).pathname;
const DIRS = ["components/app/meetings", "components/app/scheduling", "components/app/routing", "components/app/workflows", "components/app/reports", "components/app/forms", "components/book", "lib/router", "lib/routing", "lib/workflows", "lib/meetings"];
const files = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? files(join(d, f)) : /\.tsx?$/.test(f) ? [join(d, f)] : []));
const WORD = /\b[Rr]eps?\b/;

/** The text a person could read: string literals and JSX text, with comments left out. */
export function readable(src: string): string[] {
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => (/^\s*\/\//.test(l) ? "" : l.replace(/\s\/\/\s.*$/, "")))
    .join("\n");
  const out: string[] = [];
  for (const m of code.matchAll(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)) out.push(m[1] ?? m[2] ?? m[3] ?? "");
  for (const m of code.matchAll(/>([^<>{}]+)</g)) out.push(m[1]!);
  return out
    .map((t) => {
      // Code inside a template's \${...} isn't words; drop it (inner braces first).
      let x = t;
      for (let i = 0; i < 4; i++) x = x.replace(/\$\{[^{}]*\}/g, " ");
      return x;
    })
    // A stretch that is really code between two quotes (a mismatched pair) isn't words either.
    .filter((t) => !/;\s*\n|=>|\?\.|\|\||&&|\b(const|return|case)\b/.test(t))
    // A bare lowercase token ("rep", "rep:", "reps") is a code name, not words.
    .filter((t) => /\s/.test(t.trim()) || /^[A-Z]/.test(t.trim()));
}

test("no 'rep' or 'reps' in anything people read in Meetings, Routing, Workflows, Reports or Forms", () => {
  const found: string[] = [];
  for (const d of DIRS) for (const f of files(join(root, d))) for (const t of readable(readFileSync(f, "utf8"))) if (WORD.test(t)) found.push(`${f.slice(root.length)}: ${t.trim().slice(0, 80)}`);
  assert.deepEqual(found, []);
});

test("the guard itself catches words and lets code names through", () => {
  assert.deepEqual(readable(`const a = "Pick a rep"; const b = "rep"; // a rep\nconst c = <b>Reps</b>;`).filter((t) => WORD.test(t)), ["Pick a rep", "Reps"]);
});

test("counts and the starting team read plainly", () => {
  assert.equal(count(1, "team member"), "1 team member");
  assert.equal(count(3, "team member"), "3 team members");
  assert.equal(anyoneOn(WHOLE_TEAM), "anyone on the team");
  assert.equal(anyoneOn("Enterprise"), "anyone on Enterprise");
  for (const old of OLD_WHOLE_TEAM) {
    const b = cleanBody({ queues: [{ id: "q_everyone", name: old, method: "rr", members: [] }] });
    assert.equal(b.queues[0]!.name, WHOLE_TEAM, `${old} reads as ${WHOLE_TEAM}`);
  }
  const renamed = cleanBody({ queues: [{ id: "q_everyone", name: "Closers", method: "rr", members: [] }] });
  assert.equal(renamed.queues[0]!.name, "Closers", "a team someone renamed keeps its name");
});
