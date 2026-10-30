// Screens stay small: nothing a "use client" file pulls in (directly or through other files) may reach server-only
// code, which drags the Anthropic SDK and Node's crypto polyfills into the browser (136 KB gzip once, from
// enrichment's qualify settings). Settings screens share live in plain files like src/lib/enrich/qualifyRules.ts.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { test } from "node:test";

const ROOT = resolve(import.meta.dirname, "..");
const SERVER_FILES = ["src/lib/seal.ts", "src/lib/ai/cache.ts", "src/lib/enrich/qualify.ts", "src/lib/serviceClient.ts", "src/lib/serverAuth.ts"];
const SERVER_PACKAGES = ["@anthropic-ai/sdk", "node:crypto", "crypto", "pg", "stripe", "server-only"];

const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? files(join(dir, n)) : /\.tsx?$/.test(n) ? [join(dir, n)] : []));

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? join(ROOT, "src", spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(from), spec) : null;
  if (!base) return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) if (existsSync(c) && statSync(c).isFile()) return c;
  return null;
}

const IMPORT = /(?:^|\n)\s*(?:import|export)\s+(?!type\b)(?:[^"';]*?\sfrom\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

test("no screen reaches server-only code", () => {
  const seen = new Map<string, string | null>();
  const bad: string[] = [];
  const walk = (file: string, chain: string[]) => {
    if (seen.has(file)) return;
    seen.set(file, null);
    // Code shown as text (install snippets in template strings) is not an import.
    const src = readFileSync(file, "utf8").replace(/`(?:\\[\s\S]|[^`\\])*`/g, "``");
    for (const m of src.matchAll(IMPORT)) {
      const spec = m[1] ?? m[2]!;
      // A type-only import line pulls in no code.
      if (/^\s*import\s+type\b/.test(m[0].trim())) continue;
      if (SERVER_PACKAGES.includes(spec)) {
        bad.push([...chain, relative(ROOT, file), spec].join(" > "));
        continue;
      }
      const to = resolveImport(file, spec);
      if (!to) continue;
      if (SERVER_FILES.includes(relative(ROOT, to))) {
        bad.push([...chain, relative(ROOT, file), relative(ROOT, to)].join(" > "));
        continue;
      }
      walk(to, [...chain, relative(ROOT, file)]);
    }
  };
  for (const f of files(join(ROOT, "src/components/app"))) if (/^\s*["']use client["']/.test(readFileSync(f, "utf8"))) walk(f, []);
  assert.deepEqual(bad, []);
});
