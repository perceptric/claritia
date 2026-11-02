import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bookBrand, type BookBrand } from "./brandPage.ts";

// The brand a booking page draws with (src/lib/meetings/brandPage.ts), checked on the server when the page loads: the
// workspace's plan, and the stylesheet of the kit the page uses (the same order as book_kit in 107: the form's kit,
// else the brand the page picked, else the workspace's brand, else its newest kit). Kept 30 s per workspace and form, like the page's own read. Any
// read that fails gives Claritia's look, never an error.

const TTL = 30_000;
const kept = new Map<string, { at: number; value: Promise<BookBrand> }>();
const NONE: BookBrand = { paid: false, css: "", fonts: [] };

async function read(db: SupabaseClient, ws: string, form: string | null, page: string | null): Promise<BookBrand> {
  const [bill, w, f] = await Promise.all([
    db.from("workspace_billing").select("plan").eq("workspace_id", ws).maybeSingle(),
    db.from("workspaces").select("brand_kit_id").eq("id", ws).maybeSingle(),
    form ? db.from("forms").select("brand_kit_id").eq("id", form).eq("workspace_id", ws).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const plan = (bill.data as { plan?: string } | null)?.plan ?? "free";
  if (!bookBrand(plan, "").paid) return NONE;
  // A form's own brand first (the page opened from it), then the brand the page picked, then the workspace's.
  const pick = (f.data as { brand_kit_id?: string | null } | null)?.brand_kit_id ?? page ?? (w.data as { brand_kit_id?: string | null } | null)?.brand_kit_id ?? null;
  const one = async (cols: string) => {
    const q = db.from("brand_kits").select(cols).eq("workspace_id", ws);
    return pick ? await q.eq("id", pick).maybeSingle() : await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
  };
  // Before 112 there's no studio_css column: the paid look with the kit's colors and no stylesheet.
  let k = await one("id, tokens, logo_url, design_live, studio_css");
  if (k.error) k = await one("id, tokens, logo_url, design_live");
  // A picked brand that was deleted since: the workspace's own instead.
  if (!k.error && !k.data && page && pick === page) return read(db, ws, form, null);
  const row = (k.error ? null : k.data) as { tokens?: Record<string, unknown> | null; logo_url?: string | null; design_live?: unknown; studio_css?: string | null } | null;
  const b = bookBrand(plan, row?.studio_css ?? "");
  return row ? { ...b, kit: { tokens: row.tokens ?? {}, logo_url: row.logo_url ?? null, design: row.design_live ?? {} } } : b;
}

/** The brand for a workspace's page: the form it was opened from, the brand the page picked (`page`), its own. */
export function loadBookBrand(db: SupabaseClient | null, ws: string, form: string | null, page: string | null = null, now = Date.now()): Promise<BookBrand> {
  if (!db) return Promise.resolve(NONE);
  const key = `${ws}?${form ?? ""}&${page ?? ""}`;
  const hit = kept.get(key);
  if (hit && now - hit.at < TTL) return hit.value;
  const value = read(db, ws, form, page).catch(() => NONE);
  if (kept.size > 5000) kept.clear();
  kept.set(key, { at: now, value });
  return value;
}

/** Forget the kept brands (after a plan or the brand's look changes on this server). */
export const invalidateBookBrands = () => kept.clear();
