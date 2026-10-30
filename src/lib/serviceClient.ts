import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./serverAuth.ts";

// One client for the whole process: it holds no session (the secret key is its only credential), so every request
// can share it instead of building a new one.
let shared: { id: string; sb: SupabaseClient } | null = null;

/** A Supabase client with the secret key, for work no signed-in person's row security covers. Null when it isn't set up. */
export function serviceClient(): SupabaseClient | null {
  const url = supabaseUrl();
  // SUPABASE_SERVICE_ROLE_KEY is the older name for the same key.
  const key = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
  if (!url || !key) return null;
  const id = `${url}|${key}`;
  if (shared?.id === id) return shared.sb;
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  shared = { id, sb };
  return sb;
}
