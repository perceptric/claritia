// Builds <claritia-form> (src/lib/forms/element.ts) and <claritia-book> (src/lib/meetings/bookElement.ts) into one
// script, .next/static/forms/v1.js, served at /forms/v1.js
// (src/app/forms/v1.js/route.ts). Runs after next build, which clears .next. `--dev` writes .forms/v1.js instead,
// for next dev. Fails over 23 KB gzipped (20 KB until calc fields, richer rules and field numbers, docs/forms-plan.md).
import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";

// 32 KB with screens and result blocks (docs/interactive-forms-plan.md Part 2); 34 KB with studio pages
// (docs/forms-chat-plan.md); 36 KB with their languages and access rules (docs/studio-v2-plan.md 6.4); 38 KB with full
// page, slider, popover, side tab and full screen on phones (docs/sharing-plan.md); 39 KB with window.Claritia and
// its events (docs/embed.md); 41 KB with the no-code builder's rules: limits, shuffle and answers in text
// (src/lib/studio/builder.ts); 44 KB with the fields plan's loader for x1.js, email and phone codes, videos, long
// lists and the page's timer, review, formats and date rules (docs/fields-plan.md).
const LIMIT = 44 * 1024;
// The second part (src/lib/forms/extras.ts, x1.js): the fields that need more than an input (docs/fields-plan.md),
// loaded only on forms that have one.
const X_LIMIT = 16 * 1024;
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = process.argv.includes("--dev") ? join(root, ".forms") : join(root, ".next", "static", "forms");

const hashOf = (code: Uint8Array) => createHash("sha256").update(code).digest("hex").slice(0, 12);

/** The second part, x1.js. */
export async function buildExtras(): Promise<Uint8Array> {
  const res = await build({ entryPoints: [join(root, "src", "lib", "forms", "extras.ts")], bundle: true, minify: true, format: "iife", target: "es2020", legalComments: "none", write: false });
  return res.outputFiles[0].contents;
}

export async function buildForms(x1?: Uint8Array): Promise<Uint8Array> {
  const x = x1 ?? (await buildExtras());
  const res = await build({
    define: { __X1__: JSON.stringify(hashOf(x)) },
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
  const x1 = await buildExtras();
  const code = await buildForms(x1);
  const gz = gzipSync(code, { level: 9 }).length;
  const xgz = gzipSync(x1, { level: 9 }).length;
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "v1.js"), code);
  writeFileSync(join(out, "x1.js"), x1);
  console.log(`forms v1.js ${code.length} bytes, ${gz} gzipped (limit ${LIMIT}); x1.js ${x1.length} bytes, ${xgz} gzipped (limit ${X_LIMIT})`);
  if (gz > LIMIT) {
    console.error(`forms v1.js is ${gz - LIMIT} bytes over the ${LIMIT} byte limit.`);
    process.exit(1);
  }
  if (xgz > X_LIMIT) {
    console.error(`forms x1.js is ${xgz - X_LIMIT} bytes over the ${X_LIMIT} byte limit.`);
    process.exit(1);
  }
}
