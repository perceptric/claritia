import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// The <claritia-form> and <claritia-book> script, built by scripts/build-forms.mts after next build (into
// .next/static/forms) and by `npm run build:forms` while developing (into .forms). It's served two ways:
//   /forms/v1.<hash>.js  the build's own copy, cached for good (the hash is its content's); the hosted form page and
//                        the embed use it
//   /forms/v1.js         the address customers paste, cached 5 minutes, so a new build reaches every site soon

export type FormsScript = { code: Uint8Array; hash: string };

let kept: FormsScript | null = null;

export const scriptHash = (code: Uint8Array) => createHash("sha256").update(code).digest("hex").slice(0, 12);

/** The built script and its hash, or null when it isn't built. Kept in production; read again while developing. */
export async function formsScript(): Promise<FormsScript | null> {
  if (kept) return kept;
  for (const dir of [[".next", "static", "forms"], [".forms"]]) {
    try {
      const code = new Uint8Array(await readFile(join(process.cwd(), ...dir, "v1.js")));
      const s = { code, hash: scriptHash(code) };
      if (process.env.NODE_ENV === "production") kept = s;
      return s;
    } catch {}
  }
  return null;
}

/** The versioned address of the script, or the plain one when it isn't built. */
export async function formsScriptPath(): Promise<string> {
  const s = await formsScript();
  return s ? `/forms/v1.${s.hash}.js` : "/forms/v1.js";
}

const VERSIONED = /^v1\.([0-9a-f]{12})\.js$/;

/**
 * The script's answer for /forms/<file>: the plain address with a short cache, the current hash cached for good,
 * and an older hash (a page cached before a deploy) with the current script and a short cache, so it never breaks.
 */
export async function scriptResponse(file: string, built?: FormsScript | null): Promise<Response> {
  const m = VERSIONED.exec(file);
  if (file !== "v1.js" && !m) return new Response("Not found", { status: 404 });
  const s = built === undefined ? await formsScript() : built;
  if (!s) return new Response("// Form script not built. Run: npm run build:forms\n", { status: 503, headers: { "content-type": "text/javascript" } });
  const forever = !!m && m[1] === s.hash;
  return new Response(s.code as BodyInit, {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": forever ? "public, max-age=31536000, immutable" : "public, max-age=300, stale-while-revalidate=86400",
      "access-control-allow-origin": "*",
    },
  });
}
