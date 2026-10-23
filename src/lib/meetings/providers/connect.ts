// Connecting and managing a person's calendars (docs/meetings-scheduler.md 1.1): the sign-in link, saving the sign-in
// with its calendar list, the busy and write choices, refresh now, and disconnect. Each takes the jobs queue's Rpc
// (the service client in /api/calendar/*, Postgres in tests) after the route has checked who's calling.

import { enqueueJob, type Rpc } from "../../jobs.ts";
import { oauthExchange, oauthReady, oauthUrl, type State } from "../../sources/oauth.ts";
import type { HttpOpts } from "./http.ts";
import { loadAccount, openProvider, openToken, providerFor, sealToken, zoomFor, type AccountRow } from "./index.ts";

export type Caller = { ws: string; user: string; role: "owner" | "member"; email?: string };
export type Connectable = "google" | "microsoft" | "zoom";

export class CalendarRefused extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const KIND_OF: Record<string, Connectable> = { google_calendar: "google", microsoft_calendar: "microsoft", zoom: "zoom" };
const NAME: Record<Connectable, string> = { google: "Google Calendar", microsoft: "Outlook Calendar", zoom: "Zoom" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The fake calendar is for the local stack and tests only. */
export const fakeAllowed = () => process.env.NODE_ENV !== "production" || process.env.CALENDAR_FAKE === "1";

async function call<T>(rpc: Rpc, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(fn, args);
  if (error) {
    if (error.message.includes("not_member")) throw new CalendarRefused(404, "Workspace not found.");
    throw new Error(`${fn}: ${error.message}`);
  }
  return data as T;
}

const queueSync = async (rpc: Rpc, a: { id: string; workspace_id: string }, lists = false) => {
  await enqueueJob(rpc, { workspaceId: a.workspace_id, kind: "calendar_refresh", key: a.id, payload: { account: a.id, ...(lists ? { lists: true } : {}) }, maxAttempts: 3 });
  await enqueueJob(rpc, { workspaceId: a.workspace_id, kind: "calendar_watch", key: a.id, payload: { account: a.id }, maxAttempts: 3 });
};

/**
 * Start connecting: the provider's sign-in link. The fake provider (local stack and tests) connects at once with
 * one calendar, busy and written to.
 */
export async function startConnect(rpc: Rpc, c: Caller, provider: string, redirect: string): Promise<{ url: string } | { id: string }> {
  if (provider === "fake") {
    if (!fakeAllowed()) throw new CalendarRefused(400, "Unknown calendar.");
    const id = await call<string>(rpc, "calendar_connect", {
      p_ws: c.ws, p_user: c.user, p_provider: "fake", p_email: c.email || `${c.user}@calendar.test`, p_sealed: sealToken({ access: "fake", refresh: null, expiresAt: 0 }),
      p_calendars: [{ id: "primary", name: "Work", primary: true, own: true }],
    });
    return { id };
  }
  const kind = Object.entries(KIND_OF).find(([, v]) => v === provider)?.[0];
  if (!kind) throw new CalendarRefused(400, "Unknown calendar.");
  if (!oauthReady(kind)) throw new CalendarRefused(400, `${NAME[provider as Connectable]} sign-in isn't set up yet.`);
  return { url: oauthUrl(kind, redirect, { ws: c.ws, user: c.user, kind }) };
}

/**
 * The provider sent the person back with a code: trade it for tokens, read the account's email and calendars, save
 * it all (a reconnect turns the same account back to ok), and queue the first busy read and push channels.
 */
export async function finishConnect(rpc: Rpc, o: { state: State; code: string; redirect: string; fallbackEmail?: string; http?: HttpOpts }): Promise<{ id: string; provider: Connectable }> {
  const provider = KIND_OF[o.state.kind];
  if (!provider) throw new CalendarRefused(400, "Unknown calendar.");
  const t = await oauthExchange(o.state.kind, o.code, o.redirect, o.state.verifier, o.http?.fetcher);
  const tok = { access: t.access, refresh: t.refresh, expiresAt: t.expiresAt };
  let email: string | null;
  let calendars: unknown[] = [];
  if (provider === "zoom") email = await zoomFor(tok, o.http).email();
  else {
    const p = providerFor({ id: "", provider }, tok, o.http);
    [email, calendars] = await Promise.all([p.email!(), p.calendars()]);
  }
  email = email || o.fallbackEmail || "";
  if (!email) throw new Error(`${NAME[provider]} didn't say which account this is.`);
  const id = await call<string>(rpc, "calendar_connect", {
    p_ws: o.state.ws, p_user: o.state.user, p_provider: provider, p_email: email, p_sealed: sealToken(tok), p_calendars: calendars,
  });
  if (provider !== "zoom") await queueSync(rpc, { id, workspace_id: o.state.ws });
  return { id, provider };
}

/** The account, when the caller may change it: their own, or (for disconnect) anyone's in a workspace they own. */
async function accountFor(rpc: Rpc, c: Caller, id: unknown, ownerToo = false): Promise<AccountRow> {
  const a = typeof id === "string" && UUID.test(id) ? await loadAccount(rpc, id) : null;
  if (!a || a.workspace_id !== c.ws) throw new CalendarRefused(404, "Calendar not found.");
  if (a.user_id !== c.user && !(ownerToo && c.role === "owner")) throw new CalendarRefused(403, "Only the person who connected this calendar can change it.");
  return a;
}

/** The person's choices: which calendars count as busy, and the one new events go to. */
export async function saveLists(rpc: Rpc, c: Caller, accountId: unknown, rows: unknown): Promise<void> {
  const a = await accountFor(rpc, c, accountId);
  if (!Array.isArray(rows) || rows.length > 200) throw new CalendarRefused(400, "Pick the calendars again.");
  const known = new Set(a.lists.map((l) => l.calendar_id));
  const clean = rows
    .filter((r): r is { id: string; busy?: unknown; write?: unknown } => !!r && typeof r === "object" && typeof (r as { id?: unknown }).id === "string" && known.has((r as { id: string }).id))
    .map((r) => ({ id: r.id, ...(typeof r.busy === "boolean" ? { busy: r.busy } : {}), ...(typeof r.write === "boolean" ? { write: r.write } : {}) }));
  if (clean.filter((r) => r.write).length > 1) throw new CalendarRefused(400, "Pick one calendar for new events.");
  await call(rpc, "calendar_lists_save", { p_account: a.id, p_rows: clean });
  if (a.provider !== "zoom" && a.status === "ok") await queueSync(rpc, a);
}

/** Read busy times now, and pick up calendars added since connecting. */
export async function refreshNow(rpc: Rpc, c: Caller, accountId: unknown): Promise<void> {
  const a = await accountFor(rpc, c, accountId);
  if (a.provider === "zoom") return;
  if (a.status !== "ok") throw new CalendarRefused(409, "Reconnect this calendar first.");
  await enqueueJob(rpc, { workspaceId: a.workspace_id, kind: "calendar_refresh", key: a.id, payload: { account: a.id, lists: true }, maxAttempts: 3 });
}

/**
 * Disconnect: stop the push channels and give the sign-in back to the provider (both best effort, a few seconds at
 * most), then delete the account with its token, lists and busy times.
 */
export async function disconnect(rpc: Rpc, c: Caller, accountId: unknown, http: HttpOpts = {}): Promise<void> {
  const a = await accountFor(rpc, c, accountId, true);
  const quick = { ...http, timeoutMs: 3000 };
  if (a.provider === "google" || a.provider === "microsoft") {
    const p = openProvider(rpc, a, quick);
    await Promise.allSettled(Object.values(a.channels ?? {}).map((ch) => p.unwatch?.(ch)));
  }
  await revoke(a, quick).catch(() => undefined);
  await call(rpc, "calendar_disconnect", { p_account: a.id });
}

async function revoke(a: AccountRow, http: HttpOpts) {
  if (a.provider !== "google" && a.provider !== "zoom") return;
  const t = openToken(a.sealed);
  if (!t) return;
  const fetcher = http.fetcher ?? fetch;
  const signal = AbortSignal.timeout(http.timeoutMs ?? 3000);
  if (a.provider === "google") {
    await fetcher(`https://oauth2.googleapis.com/revoke?${new URLSearchParams({ token: t.refresh ?? t.access })}`, { method: "POST", signal });
  } else {
    const id = process.env.ZOOM_CLIENT_ID?.trim() ?? "";
    const secret = process.env.ZOOM_CLIENT_SECRET?.trim() ?? "";
    await fetcher(`https://zoom.us/oauth/revoke?${new URLSearchParams({ token: t.access })}`, {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}` },
      signal,
    });
  }
}
