// Calendar providers for Meetings (docs/meetings-scheduler.md 1.1 to 1.3): pick the provider for a connected account,
// with its sealed sign-in opened, refreshed when it runs out, saved back, and the account turned to "reconnect" when
// the provider says the sign-in is gone. The 'fake' provider (src/lib/meetings/provider.ts) answers from the cached
// busy times, so the local stack and the tests book end to end without a real account.

import { createHmac, timingSafeEqual } from "node:crypto";
import type { Rpc } from "../../jobs.ts";
import { seal, unseal } from "../../seal.ts";
import { fakeProvider, ReconnectError, type BusySpan } from "../provider.ts";
import { googleProvider } from "./google.ts";
import type { HttpOpts, Tok } from "./http.ts";
import { microsoftProvider } from "./microsoft.ts";
import type { Channel, FullProvider, ZoomClient } from "./types.ts";
import { zoomClient } from "./zoom.ts";

export type { Channel, FullProvider, OwnCalendar, ZoomClient } from "./types.ts";
export type { Tok } from "./http.ts";
export { ReconnectError };

export type ProviderKind = "google" | "microsoft" | "zoom" | "fake";

export type AccountRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  provider: ProviderKind;
  account_email: string;
  status: "ok" | "reconnect";
  channels: Record<string, Channel>;
  watch_due: string | null;
  sealed: string | null;
  lists: { calendar_id: string; name: string; busy: boolean; write: boolean }[];
};

export const sealToken = (t: Tok) => seal(JSON.stringify(t));

export function openToken(sealed: string | null | undefined): Tok | null {
  if (!sealed) return null;
  const t = JSON.parse(unseal(sealed)) as Partial<Tok>;
  return typeof t.access === "string" ? { access: t.access, refresh: t.refresh ?? null, expiresAt: Number(t.expiresAt) || 0 } : null;
}

export type ProviderOpts = HttpOpts & {
  /** The fake provider's busy times (from busy_blocks). */
  fakeBusy?: BusySpan[];
};

/** One fake calendar per account in this process, so a local booking's event can be moved and canceled. */
const fakes = new Map<string, ReturnType<typeof fakeProvider>>();

function asFull(p: ReturnType<typeof fakeProvider>): FullProvider {
  return Object.assign(p, {
    async busyBy(ids: string[], from: number, to: number) {
      const spans = await p.busy(ids, from, to);
      return Object.fromEntries(ids.slice(0, 1).map((id) => [id, spans]));
    },
    async update(calendarId: string, eventId: string, c: { start: number; end: number; guests?: string[]; lead?: { email: string } }) {
      await p.move(calendarId, eventId, c.start, c.end);
      const e = p.events.get(eventId);
      if (e && (c.guests || c.lead)) e.guests = [...(c.lead ? [c.lead.email] : []), ...(c.guests ?? [])];
    },
  });
}

/** The calendar provider for an account. Zoom isn't a calendar: use zoomFor. */
export function providerFor(account: Pick<AccountRow, "id" | "provider">, token: Tok | null, o: ProviderOpts = {}): FullProvider {
  switch (account.provider) {
    case "google":
      return googleProvider(token, o);
    case "microsoft":
      return microsoftProvider(token, o);
    case "fake": {
      if (o.fakeBusy) return asFull(fakeProvider({ busy: o.fakeBusy }));
      let p = fakes.get(account.id);
      if (!p) fakes.set(account.id, (p = fakeProvider()));
      return asFull(p);
    }
    default:
      throw new Error(`${account.provider} has no calendar`);
  }
}

export const zoomFor = (token: Tok | null, o: HttpOpts = {}): ZoomClient => zoomClient(token, o);

// Reading and saving through the database -------------------------------------------------------------------------

async function call<T>(rpc: Rpc, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

export const loadAccount = (rpc: Rpc, id: string) => call<AccountRow | null>(rpc, "calendar_account", { p_account: id });

/** Wire an account's provider to the database: refreshed tokens are sealed and saved, and a race is re-read. */
export function storeOpts(rpc: Rpc, accountId: string, o: HttpOpts = {}): HttpOpts {
  return {
    ...o,
    save: async (t) => void (await call(rpc, "calendar_token_save", { p_account: accountId, p_sealed: sealToken(t) })),
    reload: async () => openToken((await loadAccount(rpc, accountId))?.sealed),
  };
}

export function openProvider(rpc: Rpc, a: AccountRow, o: ProviderOpts = {}): FullProvider {
  return providerFor(a, a.provider === "fake" ? null : openToken(a.sealed), a.provider === "fake" ? o : { ...storeOpts(rpc, a.id, o), fakeBusy: o.fakeBusy });
}

export function openZoom(rpc: Rpc, a: AccountRow, o: HttpOpts = {}): ZoomClient {
  return zoomFor(openToken(a.sealed), storeOpts(rpc, a.id, o));
}

/** The account's sign-in is gone. True the first time (the person is told once, by the job this queues). */
export const markReconnect = (rpc: Rpc, accountId: string, reason: string) =>
  call<boolean>(rpc, "calendar_reconnect", { p_account: accountId, p_reason: reason.slice(0, 300) });

// Push channels ---------------------------------------------------------------------------------------------------

function hookKey() {
  const k = process.env.SECRETS_KEY?.trim() ?? "";
  if (k.length < 32) throw new Error("Add SECRETS_KEY (32 or more random characters) on Render.");
  return k;
}

/** The secret a push channel carries (Google's channel token, Graph's clientState): the account, signed. */
export function channelToken(accountId: string) {
  const sig = createHmac("sha256", `calendar-hook:${hookKey()}`).update(accountId).digest("base64url");
  return `${accountId}.${sig}`;
}

/** The account a channel token speaks for, or null when it isn't ours. */
export function readChannelToken(token: string | null | undefined): string | null {
  const [account, sig] = (token ?? "").split(".");
  if (!account || !sig || !/^[0-9a-f-]{36}$/.test(account)) return null;
  const want = Buffer.from(channelToken(account).split(".")[1]!);
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got) ? account : null;
}

/** Where providers push to; null when the app isn't on a public https address (local runs rely on the refresh). */
export function hookAddress(base = process.env.APP_URL?.trim().replace(/\/+$/, "") || "https://app.tryclaritia.com") {
  return base.startsWith("https://") ? `${base}/api/calendar/hook` : null;
}
