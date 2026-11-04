// Builds <claritia-form> (src/lib/forms/element.ts) and <claritia-book> (src/lib/meetings/bookElement.ts) into one
// script, .next/static/forms/v1.js, served at /forms/v1.js
// (src/app/forms/v1.js/route.ts). Runs after next build, which clears .next. `--dev` writes .forms/v1.js instead,
// for next dev. Fails over 23 KB gzipped (20 KB until calc fields, richer rules and field numbers, docs/forms-plan.md).
import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

// 32 KB with screens and result blocks (docs/interactive-forms-plan.md Part 2); 34 KB with studio pages
// (docs/forms-chat-plan.md); 36 KB with their languages and access rules (docs/studio-v2-plan.md 6.4); 38 KB with full
// page, slider, popover, side tab and full screen on phones (docs/sharing-plan.md); 39 KB with window.Claritia and
// its events (docs/embed.md); 41 KB with the no-code builder's rules: limits, shuffle and answers in text
// (src/lib/studio/builder.ts).
const LIMIT = 41 * 1024;
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = process.argv.includes("--dev") ? join(root, ".forms") : join(root, ".next", "static", "forms");

export async function buildForms(): Promise<Uint8Array> {
  const res = await build({
    // One script for forms and booking (docs/meetings-scheduler.md 1.8).
    stdin: { contents: 'import "./forms/element.ts";\nimport "./meetings/bookElement.ts";\nimport "./embed/api.ts";\n', resolveDir: join(root, "src", "lib"), sourcefile: "v1.ts", loader: "ts" },
    bundle: true,
    minify: true,
    format: "iife",
    target: "es2020",
    legalComments: "none",
    write: false,
  });
  return res.outputFiles[0].contents;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const code = await buildForms();
  const gz = gzipSync(code, { level: 9 }).length;
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "v1.js"), code);
  console.log(`forms v1.js ${code.length} bytes, ${gz} gzipped (limit ${LIMIT})`);
  if (gz > LIMIT) {
    console.error(`forms v1.js is ${gz - LIMIT} bytes over the ${LIMIT} byte limit.`);
    process.exit(1);
  }
}
