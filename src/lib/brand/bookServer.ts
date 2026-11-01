import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { cachedStep, hashKey, usageOf } from "../ai/cache.ts";
import type { Rpc } from "../jobs.ts";
import { APP_URL } from "../site.ts";
import { BOOK_MODEL, bookInput, tokensFromBook, writeBook, type BrandBook, type Caller } from "./book.ts";
import { extractBrand } from "./deep.ts";
import { fetchMore, type Fetched } from "./fetchSite.ts";

// Writing a kit's brand book on the server (docs/brand-capture.md): the rest of the site, the deep read, Claude's book
// through the step cache, then the book, font files, tokens and logo onto the kit. Runs after the scan route answers.

function claude(): Caller | null {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 120_000 });
  return async (p) => {
    const res = await client.beta.messages.create({
      model: BOOK_MODEL,
      max_tokens: p.maxTokens,
      output_config: { effort: "medium", format: { type: "json_schema", schema: p.schema } },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: p.system,
      messages: [{ role: "user", content: p.user }],
    } as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming);
    if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") return null;
    return { text: res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join(""), usage: res.usage };
  };
}

type Db = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>; from: (t: string) => { update: (v: Record<string, unknown>) => { eq: (k: string, v: string) => PromiseLike<unknown> } } };

export async function writeKitBook(db: Db, ws: string, kit: string, home: Fetched): Promise<BrandBook | null> {
  const rpc: Rpc = (fn, args) => db.rpc(fn, args) as ReturnType<Rpc>;
  await db.rpc("brand_kit_reading", { p_kit: kit });
  const all = await fetchMore(home).catch(() => home);
  const raw = extractBrand(all.pages, all.sheets);
  const call = claude();
  let book: BrandBook | null = null;
  if (call) {
    const r = await cachedStep(rpc, ws, "brand_book", hashKey(BOOK_MODEL, "book-1", bookInput(raw)), async () => {
      let usage = usageOf(null);
      const b = await writeBook(async (p) => {
        const out = await call(p);
        if (out) usage = usageOf(out.usage as Parameters<typeof usageOf>[0]);
        return out;
      }, raw);
      return { result: b, model: BOOK_MODEL, usage, keep: !!b };
    }).catch(() => null);
    book = r?.result ?? null;
  }
  const families = book ? [book.type.heading.family, book.type.body.family] : [];
  const own = raw.faces.filter((f) => families.some((x) => x.toLowerCase() === f.family.toLowerCase()));
  // The site's own font files when it has them for the book's fonts, else its Google Fonts link.
  const fontUrl = own.length ? `${APP_URL}/api/brand/fonts/${kit}` : raw.googleFonts;
  const tokens = book ? tokensFromBook(book, fontUrl) : null;
  const saved = await db.rpc("brand_kit_book", { p_kit: kit, p_book: book, p_faces: own, p_tokens: tokens, p_logo_svg: raw.logo.svg, p_logo_url: raw.logo.src ?? raw.icons.touch ?? raw.icons.favicon });
  // Before 108: keep the tokens at least.
  if (saved.error && tokens) await db.from("brand_kits").update({ tokens, scan_status: "done", updated_at: new Date().toISOString() }).eq("id", kit);
  return book;
}
