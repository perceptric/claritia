// The claritia-intel image (worker-intel/Dockerfile) holds only what its COPY lines name. A file or package left out
// crashes the worker at start, and every job stops. This lays the files out the way the Dockerfile does, then follows
// every import from worker-intel/index.ts (dynamic ones too) and checks each one resolves inside that layout, and that
// each package it needs is in worker-intel/package.json.
import assert from "node:assert/strict";
import { builtinModules } from "node:module";
import { cpSync, globSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { build } from "esbuild";

const root = join(import.meta.dirname, "..");

test("every import the worker reaches is in its image", async () => {
  const dir = mkdtempSync(join(tmpdir(), "intel-image-"));
  try {
    for (const line of readFileSync(join(root, "worker-intel/Dockerfile"), "utf8").split("\n")) {
      const m = /^COPY\s+(.+)$/.exec(line.trim());
      if (!m) continue;
      const parts = m[1]!.split(/\s+/);
      const dest = join(dir, parts.pop()!);
      for (const src of parts.flatMap((p) => (p.includes("*") ? globSync(p, { cwd: root }) : [p]))) {
        const from = join(root, src);
        const isDir = statSync(from).isDirectory();
        const to = dest.endsWith("/") || parts.length > 1 || src.includes("*") ? join(dest, isDir ? "" : src.split("/").pop()!) : dest;
        mkdirSync(isDir ? to : dirname(to), { recursive: true });
        cpSync(from, to, { recursive: true, filter: (f) => !f.includes("node_modules") });
      }
    }
    const r = await build({ entryPoints: [join(dir, "worker-intel/index.ts")], bundle: true, platform: "node", format: "esm", write: false, metafile: true, packages: "external", logLevel: "silent" });
    const deps = new Set(Object.keys(JSON.parse(readFileSync(join(root, "worker-intel/package.json"), "utf8")).dependencies ?? {}));
    const builtins = new Set(builtinModules);
    const missing = new Set<string>();
    for (const input of Object.values(r.metafile.inputs))
      for (const i of input.imports) {
        if (!i.external) continue;
        const name = i.path.startsWith("@") ? i.path.split("/").slice(0, 2).join("/") : i.path.split("/")[0]!;
        if (!name.startsWith("node:") && !builtins.has(name) && !deps.has(name)) missing.add(name);
      }
    assert.deepEqual([...missing], [], "packages the worker imports but its package.json doesn't list");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
