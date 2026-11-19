import { appBase } from "@/lib/billing";
import { CATALOG, entryOf } from "@/lib/sources/catalog";
import { viaComposio } from "@/lib/sources/composio";
import { connectLink } from "@/lib/sources/composioConnect";
import { oauthReady, oauthUrl, signState } from "@/lib/sources/oauth";
import { connectSource, isOwner } from "@/lib/sources/server";
import type { Creds, Settings } from "@/lib/sources/types";
import { requireUser } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";
import { lockFor, planRefusal } from "@/lib/planGate";
import { toolFeature } from "@/lib/plans";

// Connect a tool: POST { workspaceId, kind, keys?, hookSecret?, settings? }. A tool that signs in on Composio
// (src/lib/sources/composio.ts) returns Composio's connect page, which asks for the sign-in or the key and comes back
// to /api/sources/composio; a tool with Claritia's own sign-in returns its link; one connected by key is checked and
// saved now; a webhook tool gets its URL. GET ?workspaceId: the kinds that connect on
// Composio on this server, and the workspace's rows of them to reconnect. Tools are on Starter and up, Salesforce on
// Business, the webhook and Google Forms import on every plan (docs/pricing.md): a lower plan gets 402 with the line,
// before any sign-in page opens.

const bad = (error: string, status = 400) => Response.json({ error }, { status });

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const composio = CATALOG.filter((e) => viaComposio(e.kind)).map((e) => e.kind);
  // The owner's rows of those tools still signed in the old way, or in Error (a sign-in Composio lost): their cards
  // offer Reconnect.
  const ws = new URL(request.url).searchParams.get("workspaceId");
  let reconnect: string[] = [];
  const db = serviceClient();
  if (composio.length && ws && db && (await isOwner(auth.sb, auth.user.id, ws))) {
    const { data, error } = await db.from("sources").select("id").eq("workspace_id", ws).in("kind", composio).or("composio_account.is.null,status.eq.error").neq("status", "disconnected");
    // Before 167_composio.sql runs, the column isn't there: nothing to offer yet.
    if (!error) reconnect = ((data ?? []) as { id: string }[]).map((r) => r.id);
  }
  return Response.json({ composio, reconnect });
}

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const body = (await request.json().catch(() => ({}))) as { workspaceId?: unknown; kind?: unknown; keys?: Record<string, unknown>; hookSecret?: unknown; settings?: Settings };
  if (!(await isOwner(auth.sb, auth.user.id, body.workspaceId))) return bad("Only owners can connect tools.", 403);
  const ws = body.workspaceId as string;
  const kind = typeof body.kind === "string" ? body.kind : "";
  const e = entryOf(kind);
  if (!e) return bad("Unknown tool.");
  const db = serviceClient();
  if (!db) return bad("The server is not set up for this.", 500);
  const redirect = `${appBase()}/api/sources/callback`;
  const locked = await lockFor((fn, args) => db.rpc(fn, args), ws, toolFeature(kind));
  if (locked) return bad(locked, 402);

  try {
    if (kind === "omniscient") {
      const base = process.env.OMNISCIENT_URL?.trim().replace(/\/+$/, "") || "https://app.tryomniscient.com";
      const state = signState({ ws, user: auth.user.id, kind });
      return Response.json({ url: `${base}/connect?${new URLSearchParams({ app: "claritia", redirect_uri: redirect, state })}` });
    }
    const keys = body.keys && typeof body.keys === "object" ? body.keys : null;
    if (!keys && viaComposio(kind)) {
      // The way back carries the signed workspace and tool; the account it names is checked against them there.
      const back = `${appBase()}/api/sources/composio?${new URLSearchParams({ state: signState({ ws, user: auth.user.id, kind }) })}`;
      return Response.json({ url: (await connectLink(kind, ws, back)).url });
    }
    if (e.oauth && !keys) {
      if (!oauthReady(kind)) return bad(`${e.label} sign-in isn't set up yet. Use a key instead.`);
      return Response.json({ url: oauthUrl(kind, redirect, { ws, user: auth.user.id, kind }) });
    }
    let creds: Creds;
    if (e.hook) creds = { type: "hook" };
    else {
      const values: Record<string, string> = {};
      for (const f of e.keys ?? []) {
        const v = typeof keys?.[f.key] === "string" ? (keys[f.key] as string).trim() : "";
        if (!v && !f.optional) return bad(`Fill in ${f.label}.`);
        if (v) values[f.key] = v.slice(0, f.multiline ? 10_000 : 500);
      }
      creds = { type: "key", values };
    }
    const hookSecret = typeof body.hookSecret === "string" && body.hookSecret.trim() ? body.hookSecret.trim().slice(0, 300) : null;
    const s = await connectSource(db, { ws, user: auth.user.id, kind, creds, settings: body.settings, hookSecret });
    return Response.json({ id: s.id, label: s.label });
  } catch (err) {
    const line = planRefusal(err instanceof Error ? err.message : null);
    if (line) return bad(line, 402);
    return bad(err instanceof Error ? err.message.slice(0, 300) : "Could not connect.", 502);
  }
}
