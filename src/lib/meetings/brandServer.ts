import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bookBrand, type BookBrand } from "./brandPage.ts";

// The brand a booking page draws with (src/lib/meetings/brandPage.ts), checked on the server when the page loads: the
// workspace's plan, and the stylesheet of the kit the page uses (the same order as book_kit in 107: the form's kit,
// else the workspace's brand, else its newest kit). Kept 30 s per workspace and form, like the page's own read. Any
// read that fails gives Claritia's look, never an error.

const TTL = 30_000;
const kept = new Map<string, { at: number; value: Promise<BookBrand> }>();
const NONE: BookBrand = { paid: false, css: "", fonts: [] };

async function read(db: SupabaseClient, ws: string, form: string | null): Promise<BookBrand> {
  const [bill, w, f] = await Promise.all([
    db.from("workspace_billing").select("plan").eq("workspace_id", ws).maybeSingle(),
    db.from("workspaces").select("brand_kit_id").eq("id", ws).maybeSingle(),
    form ? db.from("forms").select("brand_kit_id").eq("id", form).eq("workspace_id", ws).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const plan = (bill.data as { plan?: string } | null)?.plan ?? "free";
  if (!bookBrand(plan, "").paid) return NONE;
  const pick = (f.data as { brand_kit_id?: string | null } | null)?.brand_kit_id ?? (w.data as { brand_kit_id?: string | null } | null)?.brand_kit_id ?? null;
  const q = db.from("brand_kits").select("studio_css").eq("workspace_id", ws);
  const k = pick ? await q.eq("id", pick).maybeSingle() : await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
  // Before 112 there's no studio_css column: the paid look without the brand's stylesheet.
  return bookBrand(plan, k.error ? "" : ((k.data as { studio_css?: string | null } | null)?.studio_css ?? ""));
}

export function loadBookBrand(db: SupabaseClient | null, ws: string, form: string | null, now = Date.now()): Promise<BookBrand> {
  if (!db) return Promise.resolve(NONE);
  const key = `${ws}?${form ?? ""}`;
  const hit = kept.get(key);
  if (hit && now - hit.at < TTL) return hit.value;
  const value = read(db, ws, form).catch(() => NONE);
  if (kept.size > 5000) kept.clear();
  kept.set(key, { at: now, value });
  return value;
}

/** Forget the kept brands (after a plan or the brand's look changes on this server). */
export const invalidateBookBrands = () => kept.clear();
