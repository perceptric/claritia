// Sending one delivery (docs/form-builder.md Part 7): a form submission to one destination. Connected tools go
// through the sources push (the same mapping, links and sync log as the two-way sync), so a lead lands once and a
// retry after a timeout updates the record it made. Slack gets a message; a webhook gets a signed POST.
//   The answer says what the jobs queue should do: done, skipped, failed for good (a refusal that won't change), or
//   retry (the other side was down, slow or rate limited).

import { createHmac } from "node:crypto";
import { hostIsPrivate } from "../privateNet.ts";
import { unseal } from "../seal.ts";
import { crmPlan, isCrmVendor, listProperties, sendCrmFields } from "../sources/properties.ts";
import { deps, type RunOpts } from "../sources/run.ts";
import { call, push, type Deps, type PushOutcome } from "../sources/sync.ts";
import { AuthError, RateLimited } from "../sources/types.ts";
import { allFields, isContent, type Form } from "../forms/schema.ts";
import { DUPLICATE, pushOptions, rulesOf } from "./rules.ts";

export type Taken = {
  /** allow_duplicate: Create anyway was clicked on a possible duplicate. */
  delivery: { id: string; attempts: number; external_id: string | null; allow_duplicate?: boolean };
  destination: { id: string; kind: "source" | "slack" | "webhook"; source_id: string | null; name: string; config: Record<string, unknown>; mode: string };
  sealed: string | null;
  submission: { id: string; created_at: string; values: Record<string, unknown>; hidden: Record<string, unknown>; consent?: { given?: boolean }; test: boolean; form_version: number; contact_id: string | null };
  form: { id: string | null; name: string | null; body: Form | null } | null;
  contact: { id: string; email: string | null; first_name: string | null; last_name: string | null; title: string | null; phone: string | null; country: string | null; company: string | null; company_domain: string | null } | null;
};

/** notes: linked CRM fields that didn't go, with why (also in the source's sync log). */
export type Result = { status: "done"; externalId?: string; externalUrl?: string; notes?: string[] } | { status: "skipped"; reason: string } | { status: "failed"; error: string } | { status: "retry"; error: string; retryAfterS?: number };

export type SendDeps = { run: RunOpts; fetcher?: typeof fetch; resolve?: Parameters<typeof hostIsPrivate>[1] };

const TIMEOUT_MS = 15_000;

/** The answers with their labels, in the form's order, for messages people read. */
export function labeled(t: Taken): { label: string; key: string; value: string }[] {
  const fields = t.form?.body ? allFields(t.form.body) : [];
  const out: { label: string; key: string; value: string }[] = [];
  const seen = new Set<string>();
  const show = (v: unknown) => (Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v));
  for (const f of fields) {
    const v = t.submission.values[f.key];
    if (v === undefined || v === null || v === "") continue;
    out.push({ label: f.label || f.key, key: f.key, value: show(v) });
    seen.add(f.key);
  }
  // Answers to fields removed since keep their key as the label.
  for (const [k, v] of Object.entries(t.submission.values)) if (!seen.has(k) && v !== undefined && v !== null && v !== "") out.push({ label: k, key: k, value: show(v) });
  return out;
}

/** The JSON a webhook gets. Stable: receivers build on it. */
export function webhookBody(t: Taken) {
  return {
    event: "form.submitted",
    delivery_id: t.delivery.id,
    submission_id: t.submission.id,
    submitted_at: t.submission.created_at,
    test: t.submission.test,
    form: { id: t.form?.id ?? null, name: t.form?.name ?? null, version: t.submission.form_version },
    answers: t.submission.values,
    fields: labeled(t),
    meta: t.submission.hidden,
    contact: t.contact,
  };
}

/** Header value for a webhook: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">. */
export function signature(secret: string, body: string, at = Math.floor(Date.now() / 1000)): string {
  return `t=${at},v1=${createHmac("sha256", secret).update(`${at}.${body}`).digest("hex")}`;
}

// Connectors turn a failed call into the contact's error message; these mean the tool was down, slow or busy.
const TRANSIENT = /trying again later|answered (5\d\d|429|408)|rate limit|socket|ECONN|ETIMEDOUT|EAI_AGAIN|fetch failed|network|timed? ?out|Stopped/i;

const transient = (status: number) => status === 408 || status === 425 || status === 429 || status >= 500;
const retryAfter = (res: Response) => {
  const n = Number(res.headers.get("retry-after"));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 21_600) : undefined;
};

async function post(url: string, body: string, headers: Record<string, string>, fetcher: typeof fetch): Promise<Result | Response> {
  try {
    return await fetcher(url, { method: "POST", headers: { "content-type": "application/json", "user-agent": "Claritia-Forms/1", ...headers }, body, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    return { status: "retry", error: (e as Error).name === "TimeoutError" ? "No answer within 15 seconds." : `Couldn't reach it: ${(e as Error).message}`.slice(0, 300) };
  }
}

function recordUrl(kind: string, account: string | null, externalId: string, secret: (k: string) => string): string | undefined {
  if (kind === "hubspot" && account && /^\d+$/.test(account)) return `https://app.hubspot.com/contacts/${account}/record/0-1/${externalId}`;
  if (kind === "salesforce") {
    const u = secret("instance_url");
    if (/^https:\/\/[a-z0-9.-]+\.(salesforce|force)\.com$/i.test(u) && /^[A-Za-z0-9]{15,18}$/.test(externalId)) return `${u}/${externalId}`;
  }
  return undefined;
}

async function toSource(t: Taken, d: SendDeps): Promise<Result> {
  if (!t.contact) return { status: "skipped", reason: "No contact to send." };
  const dep = await deps(d.run, t.destination.source_id!);
  if (!dep) return { status: "failed", error: `Connect ${t.destination.name} again.` };
  if (!dep.connector.push) return { status: "failed", error: `${t.destination.name} doesn't take new contacts from Claritia yet.` };
  if (dep.ctx.source.status === "paused") return { status: "retry", error: `${t.destination.name} is paused in Settings › Tools.`, retryAfterS: 1800 };
  const outcome = new Map<string, PushOutcome>();
  try {
    const linked = linkedFields(t, dep.ctx.source.id);
    // "Never" may still fill a record this delivery makes: was the contact linked to one before?
    const rules = rulesOf(t.destination.config);
    const options = pushOptions(rules, t.submission.consent?.given === true);
    const checkDuplicate = rules?.match === "email_name" && !t.delivery.allow_duplicate && !!dep.connector.similar && !!t.contact.first_name && !!t.contact.last_name && !!t.contact.company_domain;
    const wasLinked = linked.some((f) => (f.overwrite ?? rules?.exists) === "never") || checkDuplicate
      ? !!(await call<{ external_id: string | null }[]>(dep.rpc, "push_candidates", { p_source: dep.ctx.source.id, p_after: null, p_limit: 1, p_ids: [t.contact.id] }))[0]?.external_id
      : true;
    // Not linked yet: someone with the same name at the same company domain may already be there under another email.
    if (checkDuplicate && !wasLinked) {
      const email = (t.contact.email ?? "").toLowerCase();
      const hits = (await dep.connector.similar!(dep.ctx, { first: t.contact.first_name!, last: t.contact.last_name!, domain: t.contact.company_domain! })).filter((x) => (x.email ?? "").toLowerCase() !== email);
      if (hits.length) {
        const h = hits[0]!;
        return { status: "failed", error: `${DUPLICATE} in ${t.destination.name}: ${h.name}${h.email ? ` (${h.email})` : ""}. Create anyway, or update that record in ${t.destination.name}.`.slice(0, 500) };
      }
    }
    await push(dep, { ids: [t.contact.id], force: true, outcome, options });
    let o = outcome.get(t.contact.id);
    let gone = false;
    // Deleted on their side since we last linked it: the link is gone now, so this sends it again as new.
    if (o?.gone) {
      gone = true;
      outcome.clear();
      await push(dep, { ids: [t.contact.id], force: true, outcome, options });
      o = outcome.get(t.contact.id);
    }
    if (!o) return { status: "retry", error: "The contact wasn't ready to send." };
    if (o.error) return TRANSIENT.test(o.error) ? { status: "retry", error: o.error } : { status: "failed", error: o.error };
    const notes = linked.length && o.externalId ? await toCrmFields(t, dep, o.externalId, !wasLinked || gone) : [];
    return {
      status: "done",
      externalId: o.externalId,
      externalUrl: o.externalId ? recordUrl(dep.ctx.source.kind, dep.ctx.source.account, o.externalId, dep.ctx.secret) : undefined,
      ...(notes.length ? { notes } : {}),
    };
  } catch (e) {
    if (e instanceof AuthError) return { status: "failed", error: `Sign in to ${t.destination.name} again: ${e.message}`.slice(0, 500) };
    if (e instanceof RateLimited) return { status: "retry", error: e.message, retryAfterS: e.retryAfterS };
    return { status: "retry", error: String((e as Error).message ?? e).slice(0, 500) };
  }
}

/** The form's fields linked to a property on this CRM source. */
function linkedFields(t: Taken, sourceId: string) {
  return t.form?.body ? allFields(t.form.body).filter((f) => !isContent(f.type) && f.crm?.source === sourceId) : [];
}

/**
 * Answers linked to CRM properties, after the contact landed (src/lib/sources/properties.ts). What the CRM can't
 * take is skipped and logged with why, and the delivery still counts as done: the contact is there. A CRM that's
 * down or busy throws, so the whole delivery tries again (the contact push is skipped then: nothing changed).
 */
async function toCrmFields(t: Taken, dep: Deps, externalId: string, isNew: boolean): Promise<string[]> {
  const src = dep.ctx.source;
  if (!isCrmVendor(src.kind) || !t.form?.body || !t.contact) return [];
  // The field list tells a deleted property from a bad value; when it can't be read, the CRM's answer decides.
  const props = await listProperties(dep.ctx).catch((e) => {
    if (e instanceof AuthError) throw e;
    return null;
  });
  const plan = crmPlan(t.form.body, t.submission.values, src.id, src.kind, props, rulesOf(t.destination.config));
  const r = await sendCrmFields(dep.ctx, src.kind, { id: externalId, localId: t.contact.id, email: t.contact.email, isNew }, plan.send, props);
  const skipped = [...plan.skip, ...r.skip];
  if (skipped.length)
    await call(dep.rpc, "sync_log_add", {
      p_source: src.id,
      p_rows: skipped.map((s) => ({ direction: "out", object: "contact", local_id: t.contact!.id, external_id: externalId, action: "error", fields: [s.property], error: `${s.label}: ${s.reason}`.slice(0, 1000) })),
    });
  return skipped.map((s) => `${s.label}: ${s.reason}`);
}

async function toSlack(t: Taken, d: SendDeps): Promise<Result> {
  const name = t.form?.name ?? "A form";
  const who = t.contact ? [t.contact.first_name, t.contact.last_name].filter(Boolean).join(" ") || t.contact.email : null;
  return slackNote(t.sealed, `${t.submission.test ? "[Test] " : ""}New fill on ${name}${who ? `: ${who}` : ""}`, labeled(t), d.fetcher);
}

/** One message to a form's Slack destination: a bold line and up to 20 labeled rows. */
export async function slackNote(sealed: string | null, text: string, rows: { label: string; value: string }[], fetcher: typeof fetch = fetch): Promise<Result> {
  const { url } = JSON.parse(unseal(sealed ?? "")) as { url?: string };
  if (!url || !/^https:\/\/hooks\.slack\.com\/services\//.test(url)) return { status: "failed", error: "Add the Slack webhook address again." };
  const r = rows.slice(0, 20);
  const body = JSON.stringify({
    text,
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: `*${esc(text)}*` } },
      ...(r.length ? [{ type: "section", fields: r.slice(0, 10).map((x) => ({ type: "mrkdwn", text: `*${esc(x.label)}*\n${esc(x.value).slice(0, 500)}` })) }] : []),
      ...(r.length > 10 ? [{ type: "section", fields: r.slice(10, 20).map((x) => ({ type: "mrkdwn", text: `*${esc(x.label)}*\n${esc(x.value).slice(0, 500)}` })) }] : []),
    ],
  });
  const res = await post(url, body, {}, fetcher);
  if (!(res instanceof Response)) return res;
  if (res.ok) return { status: "done" };
  const why = (await res.text().catch(() => "")).slice(0, 200);
  if (transient(res.status)) return { status: "retry", error: `Slack answered ${res.status}.`, retryAfterS: retryAfter(res) };
  return { status: "failed", error: /no_service|invalid_token|channel_not_found|action_prohibited/.test(why) ? "The Slack webhook was removed. Add it again." : `Slack answered ${res.status}: ${why}` };
}

/** Slack mrkdwn: the three characters it reads as control text. */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function toWebhook(t: Taken, d: SendDeps): Promise<Result> {
  const { url, secret } = JSON.parse(unseal(t.sealed ?? "")) as { url?: string; secret?: string };
  let u: URL;
  try {
    u = new URL(url ?? "");
  } catch {
    return { status: "failed", error: "Add the webhook address again." };
  }
  if (u.protocol !== "https:" || u.username || u.password) return { status: "failed", error: "Webhooks need an https:// address." };
  if (await hostIsPrivate(u.hostname, d.resolve)) return { status: "failed", error: "That address is on a private network." };
  const body = JSON.stringify(webhookBody(t));
  const res = await post(u.href, body, { "x-claritia-delivery": t.delivery.id, "x-claritia-event": "form.submitted", ...(secret ? { "x-claritia-signature": signature(secret, body) } : {}) }, d.fetcher ?? fetch);
  if (!(res instanceof Response)) return res;
  if (res.ok) return { status: "done" };
  if (res.status >= 300 && res.status < 400) return { status: "failed", error: `It answered ${res.status} (a redirect). Use the final address.` };
  if (transient(res.status)) return { status: "retry", error: `It answered ${res.status}.`, retryAfterS: retryAfter(res) };
  return { status: "failed", error: `It answered ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}` };
}

export async function sendDelivery(t: Taken, d: SendDeps): Promise<Result> {
  try {
    if (t.destination.kind === "source") return await toSource(t, d);
    if (t.destination.kind === "slack") return await toSlack(t, d);
    if (t.destination.kind === "webhook") return await toWebhook(t, d);
    return { status: "failed", error: "Unknown destination." };
  } catch (e) {
    // A secret that won't unseal won't unseal next time either.
    if (/secret is not in a format|Unsupported state|unable to authenticate/i.test(String((e as Error).message))) return { status: "failed", error: "Add this destination's address again." };
    return { status: "retry", error: String((e as Error).message ?? e).slice(0, 500) };
  }
}
