import { readFile } from "node:fs/promises";
import { join } from "node:path";

// The <claritia-form> script, built by scripts/build-forms.mts after next build (into .next/static/forms) and by
// `npm run build:forms` while developing (into .forms).

let code: Uint8Array | null = null;

async function load(): Promise<Uint8Array | null> {
  if (code) return code;
  for (const dir of [[".next", "static", "forms"], [".forms"]]) {
    try {
      const buf = new Uint8Array(await readFile(join(process.cwd(), ...dir, "v1.js")));
      // Cached in production only, so a rebuild while developing shows at once.
      if (process.env.NODE_ENV === "production") code = buf;
      return buf;
    } catch {}
  }
  return null;
}

export async function GET() {
  const body = await load();
  if (!body) return new Response("// Form script not built. Run: npm run build:forms\n", { status: 503, headers: { "content-type": "text/javascript" } });
  return new Response(body as BodyInit, {
    headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "public, max-age=300, stale-while-revalidate=86400", "access-control-allow-origin": "*" },
  });
}
