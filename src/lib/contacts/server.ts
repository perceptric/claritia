import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CustomField } from "../records/fields.ts";
import type { Ctx } from "./import.ts";

// What the contacts routes share: what cleaning needs from the workspace.

/** The workspace's custom contact fields and its own and partner domains. */
export async function cleaningCtx(sb: SupabaseClient, ws: string): Promise<Ctx> {
  const [fields, settings] = await Promise.all([
    sb.from("fields").select("key, label, type, options").eq("workspace_id", ws).eq("object", "contact"),
    sb.from("identity_settings").select("own_domains, partner_domains").eq("workspace_id", ws).maybeSingle(),
  ]);
  if (fields.error) throw new Error(fields.error.message);
  return {
    custom: (fields.data ?? []) as CustomField[],
    own_domains: (settings.data?.own_domains as string[] | undefined) ?? [],
    partner_domains: (settings.data?.partner_domains as string[] | undefined) ?? [],
  };
}
