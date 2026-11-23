import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { same } from "./sign.ts";

/** Whether a call comes from the database (pg_net), which sends the shared secret kept in app_config. */
export async function fromDatabase(sb: SupabaseClient, request: Request): Promise<boolean> {
  const { data } = await sb.from("app_config").select("value").eq("key", "github_sync_secret").maybeSingle<{ value: string }>();
  const want = data?.value ?? "";
  return want.length > 0 && same(want, request.headers.get("x-claritia-sync") ?? "");
}
