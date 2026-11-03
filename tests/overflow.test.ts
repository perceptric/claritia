// Nothing spills out of its box (CLAUDE.md, Rule: nothing spills out of its box). A row of buttons that can't wrap
// pushes its last button past the card's edge on a narrow card: Integrations' "Webhook URL" and "Disconnect" did.
// This reads every screen's source and fails on a flex row that can't wrap and holds buttons it can't fit: one pushed
// right and kept from shrinking (ml-auto with shrink-0) with two or more buttons, or any row with three or more.
// Header and footer bars (a fixed height and a top or bottom rule) are left out: they span the page.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".tsx") ? [p] : [];
  });

/** Rows that can spill: file:line and why. */
export function spills(src: string, file = ""): string[] {
  const lines = src.split("\n");
  const out: string[] = [];
  lines.forEach((l, i) => {
    const m = /^(\s*)<(span|div)\b[^>]*className=[{"`]([^>]*)/.exec(l);
    if (!m) return;
    const cls = m[3]!;
    if (!/(^|[\s"`])(inline-)?flex(?=[\s"`]|$)/.test(cls) || /flex-wrap|flex-col|\bgrid\b|(^|\s)hidden(\s|$)/.test(cls)) return;
    if (/border-[bt]\b/.test(cls) && /\bh-/.test(cls)) return;
    if (/\/>\s*$/.test(l) || new RegExp(`</${m[2]}>`).test(l)) return;
    const indent = m[1]!.length;
    const close = new RegExp(`^\\s{${indent}}</${m[2]}>`);
    let buttons = 0;
    for (let j = i + 1; j < Math.min(i + 60, lines.length); j++) {
      if (close.test(lines[j]!)) break;
      buttons += (lines[j]!.match(/<Button\b/g) ?? []).length;
    }
    const pinned = /\bml-auto\b/.test(cls) && /\bshrink-0\b/.test(cls);
    if ((pinned && buttons >= 2) || buttons >= 3) out.push(`${file}:${i + 1} holds ${buttons} buttons in a row that can't wrap`);
  });
  return out;
}

test("no row of buttons can push past its card's edge", () => {
  const bad = files("src/components").flatMap((f) => spills(readFileSync(f, "utf8"), f));
  assert.deepEqual(bad, [], `Add flex-wrap (and min-w-0) to these rows:\n${bad.join("\n")}`);
});

test("the check catches Integrations' old card row and passes its new one", () => {
  const old = `
<div className="flex min-w-0 flex-wrap items-center gap-3">
  <span className="ml-auto flex shrink-0 items-center gap-2">
    <Button>Webhook URL</Button>
    <Button>Disconnect</Button>
  </span>
</div>`;
  assert.equal(spills(old).length, 1);
  const fixed = old.replace("ml-auto flex shrink-0 items-center gap-2", "flex min-w-0 flex-wrap items-center gap-2");
  assert.deepEqual(spills(fixed), []);
});
