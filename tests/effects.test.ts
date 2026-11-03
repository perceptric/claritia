// Effects return nothing or a cleanup function. Chrome now returns a promise from scrollIntoView (and other scroll
// calls), so `useEffect(() => el.scrollIntoView())` hands React a promise, which it calls on unmount and crashes the
// app on the next page change. Effects that scroll, play or animate use a block body.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? files(join(dir, n)) : /\.tsx?$/.test(n) ? [join(dir, n)] : []));

const PROMISE = /\.(scrollIntoView|scrollTo|scrollBy|scroll|play|animate|requestFullscreen)\(/;

test("no effect returns a promise", () => {
  const bad: string[] = [];
  for (const f of [...files("src/components"), ...files("src/app")]) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/use(?:Layout)?Effect\(\s*\(\)\s*=>(?!\s*(?:\{|\(\)\s*=>))/g)) {
      const body = src.slice(m.index + m[0].length).split(/,\s*\[|\);/)[0];
      if (PROMISE.test(body)) bad.push(`${f}:${src.slice(0, m.index).split("\n").length}`);
    }
  }
  assert.deepEqual(bad, []);
});
