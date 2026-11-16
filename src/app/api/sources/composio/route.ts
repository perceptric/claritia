import { appBase } from "@/lib/billing";
import { activeAccount, composioCreds, dropAccount } from "@/lib/sources/composioConnect";
import { readState } from "@/lib/sources/oauth";
import { connectSource } from "@/lib/sources/server";
import { serviceClient } from "@/lib/serviceClient";

// Back from Composio's connect page (src/app/api/sources/connect): the signed state says which workspace and tool;
// the connected account Composio names must be that workspace's, for that tool, and ACTIVE before it's saved. Then
// the source is connected as any other (its account checked through the proxy, its first pull started), and a
// Composio account it replaces is removed, as is a new one that didn't connect. Back to Settings › Integrations.

export async function GET(request: Request) {
  const url = new URL(request.url);
  const go = (q: Record<string, string>) => Response.redirect(`${appBase()}/settings/sources?${new URLSearchParams(q)}`, 302);
  const state = readState(url.searchParams.get("state"));
  if (!state) return go({ error: "The sign-in link expired. Try again." });
  const id = url.searchParams.get("connected_account_id") ?? "";
  if (url.searchParams.get("status") === "failed" || !id) return go({ error: "Access was not allowed." });
  const db = serviceClient();
  if (!db) return go({ error: "Could not connect." });
  let made = "";
  let old: string | null | undefined = null;
  try {
    const before = await db.from("sources").select("composio_account").eq("workspace_id", state.ws).eq("kind", state.kind).maybeSingle();
    old = (before.data as { composio_account?: string | null } | null)?.composio_account;
    const account = await activeAccount(state.kind, state.ws, id);
    made = account.id;
    const creds = await composioCreds(state.kind, state.ws, account);
    const s = await connectSource(db, { ws: state.ws, user: state.user, kind: state.kind, creds });
    if (old && old !== id) await dropAccount(old);
    return go({ connected: s.id });
  } catch (e) {
    // The workspace's own new account that didn't connect isn't kept at Composio either (never the one in use).
    if (made && made !== old) await dropAccount(made);
    return go({ error: e instanceof Error ? e.message.slice(0, 200) : "Could not connect." });
  }
}
