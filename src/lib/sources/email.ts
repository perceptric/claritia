// Email tools (docs/contact-sources.md Part 5): contacts with their consent and their lists, unsubscribes and
// bounces first. Mailchimp, Klaviyo, ActiveCampaign, Brevo, Kit and MailerLite. Endpoints and fields are
// rechecked against a real account before launch ("check").

import { createHash } from "node:crypto";
import { qs, readCursor } from "./ctx.ts";
import { AuthError, RateLimited, type Connector, type Ctx, type Page, type PushChange, type PushOptions, type PushResult, type RawRecord } from "./types.ts";

const since5 = (iso: string) => new Date(Date.parse(iso) - 300_000).toISOString();
const newest = (rs: { updatedAt?: string | null }[], m: string) => rs.reduce((x, r) => ((r.updatedAt ?? "") > x ? (r.updatedAt as string) : x), m);

// Mailchimp ---------------------------------------------------------------------------------------------------

const endpoints = new Map<string, string>();
async function mcBase(ctx: Ctx) {
  if (ctx.creds.type === "key") {
    const dc = ctx.secret("api_key").split("-").pop() ?? "";
    if (!/^[a-z]{2}\d{1,3}$/.test(dc)) throw new Error("That doesn't look like a Mailchimp API key (it ends in -us21 or similar).");
    return `https://${dc}.api.mailchimp.com/3.0`;
  }
  // A signed-in account says which data center it lives in.
  const tok = await ctx.token();
  if (!endpoints.has(tok)) {
    const m = await ctx.api<{ api_endpoint: string }>("https://login.mailchimp.com/oauth2/metadata", { headers: { authorization: `OAuth ${tok}` }, auth: false });
    endpoints.set(tok, m.api_endpoint);
  }
  return `${endpoints.get(tok)}/3.0`;
}
const mcAuth = (ctx: Ctx) => (ctx.creds.type === "key" ? { headers: { authorization: `Basic ${Buffer.from(`any:${ctx.secret("api_key")}`).toString("base64")}` }, auth: false } : {});

type McMember = { id: string; email_address: string; status: string; merge_fields: Record<string, unknown>; location?: { country_code?: string }; last_changed: string };

export const mailchimp: Connector = {
  kind: "mailchimp",
  objects: ["contacts"],
  gapMs: 150,
  async account(ctx) {
    const d = await ctx.api<{ account_id: string; account_name: string }>(`${await mcBase(ctx)}/`, mcAuth(ctx));
    return { id: d.account_id, label: d.account_name };
  },
  async pull(ctx, _object, cursor): Promise<Page> {
    // Audience by audience; each member carries its audience, which becomes a list here.
    const c = readCursor<{ lists: { id: string; name: string }[] | null; i: number; offset: number; since: Record<string, string>; max: string }>(cursor, { lists: null, i: 0, offset: 0, since: {}, max: "" });
    const base = await mcBase(ctx);
    const lists = c.lists ?? (await ctx.api<{ lists: { id: string; name: string }[] }>(`${base}/lists?count=1000&fields=lists.id,lists.name`, mcAuth(ctx))).lists;
    const list = lists[c.i];
    if (!list) return { records: [], cursor: JSON.stringify({ ...c, lists: null, i: 0, offset: 0 }), more: false };
    const d = await ctx.api<{ members: McMember[]; total_items: number }>(
      `${base}/lists/${list.id}/members?${qs({ count: 1000, offset: c.offset, since_last_changed: c.since[list.id] ?? null, fields: "members.id,members.email_address,members.status,members.merge_fields,members.location,members.last_changed,total_items" })}`,
      mcAuth(ctx),
    );
    const records: RawRecord[] = (d.members ?? []).map((m) => ({
      id: m.id,
      updatedAt: m.last_changed,
      data: { email: m.email_address, status: m.status, FNAME: m.merge_fields?.FNAME ?? null, LNAME: m.merge_fields?.LNAME ?? null, PHONE: m.merge_fields?.PHONE ?? null, COMPANY: m.merge_fields?.COMPANY ?? null, country: m.location?.country_code ?? null },
      lists: [{ id: list.id, name: list.name }],
    }));
    const max = newest(records, c.max);
    if (c.offset + 1000 < d.total_items) return { records, cursor: JSON.stringify({ ...c, lists, offset: c.offset + 1000, max }), more: true };
    const since = { ...c.since, ...(max ? { [list.id]: since5(max) } : {}) };
    const next = c.i + 1;
    return { records, cursor: JSON.stringify({ lists: next < lists.length ? lists : null, i: next < lists.length ? next : 0, offset: 0, since, max: "" }), more: next < lists.length };
  },
  consent(r) {
    const s = String(r.data.status ?? "");
    return s === "subscribed" ? "opt_in" : s === "unsubscribed" ? "unsubscribed" : s === "cleaned" ? "bounced" : "none";
  },
  defaults: { contact: { email: "email", FNAME: "first_name", LNAME: "last_name", PHONE: "phone", COMPANY: "company", country: "country" } },
};

// Klaviyo -----------------------------------------------------------------------------------------------------

const kvHeaders = (ctx: Ctx) => ({ headers: { authorization: `Klaviyo-API-Key ${ctx.secret("api_key")}`, revision: "2024-10-15" }, auth: false });
type KvProfile = {
  id: string;
  attributes: {
    email: string | null;
    first_name: string | null;
    last_name: string | null;
    phone_number: string | null;
    title: string | null;
    organization: string | null;
    location?: { country?: string | null };
    updated: string;
    subscriptions?: { email?: { marketing?: { consent?: string; suppression?: { reason: string }[] } } };
  };
};

export const klaviyo: Connector = {
  kind: "klaviyo",
  objects: ["contacts"],
  gapMs: 400,
  async account(ctx) {
    const d = await ctx.api<{ data: { id: string; attributes: { contact_information?: { organization_name?: string } } }[] }>("https://a.klaviyo.com/api/accounts", kvHeaders(ctx));
    const a = d.data[0];
    return { id: a?.id ?? "", label: a?.attributes.contact_information?.organization_name ?? "Klaviyo" };
  },
  async pull(ctx, _object, cursor): Promise<Page> {
    const c = readCursor<{ next: string | null; since: string | null; max: string }>(cursor, { next: null, since: null, max: "" });
    const first = `https://a.klaviyo.com/api/profiles?${qs({ "page[size]": 100, sort: "updated", "additional-fields[profile]": "subscriptions", filter: c.since ? `greater-than(updated,${c.since})` : null })}`;
    const d = await ctx.api<{ data: KvProfile[]; links?: { next?: string | null } }>(c.next ?? first, kvHeaders(ctx));
    const records = (d.data ?? []).map((p) => ({
      id: p.id,
      updatedAt: p.attributes.updated,
      data: {
        email: p.attributes.email,
        first_name: p.attributes.first_name,
        last_name: p.attributes.last_name,
        phone_number: p.attributes.phone_number,
        title: p.attributes.title,
        organization: p.attributes.organization,
        country: p.attributes.location?.country ?? null,
        consent: p.attributes.subscriptions?.email?.marketing?.consent ?? null,
        suppression: p.attributes.subscriptions?.email?.marketing?.suppression?.[0]?.reason ?? null,
      },
    }));
    const max = newest(records, c.max);
    if (d.links?.next) return { records, cursor: JSON.stringify({ ...c, next: d.links.next, max }), more: true };
    return { records, cursor: JSON.stringify({ next: null, since: max ? since5(max) : c.since, max: "" }), more: false };
  },
  consent(r) {
    const sup = String(r.data.suppression ?? "");
    if (sup === "HARD_BOUNCE" || sup === "INVALID_EMAIL") return "bounced";
    if (sup) return "unsubscribed";
    const s = String(r.data.consent ?? "");
    return s === "SUBSCRIBED" ? "opt_in" : s === "UNSUBSCRIBED" ? "unsubscribed" : null;
  },
  defaults: { contact: { email: "email", first_name: "first_name", last_name: "last_name", phone_number: "phone", title: "title", organization: "company", country: "country" } },
};

// ActiveCampaign ----------------------------------------------------------------------------------------------

const acBase = (ctx: Ctx) => {
  const u = ctx.secret("url").replace(/\/+$/, "");
  if (!/^https:\/\/[a-z0-9-]+\.(api-us1|activehosted)\.com$|^https:\/\/[a-z0-9-]+\.api-[a-z]+\d*\.com$/i.test(u)) throw new Error("Use the API URL from ActiveCampaign › Settings › Developer.");
  return `${u}/api/3`;
};
const acHeaders = (ctx: Ctx) => ({ headers: { "api-token": ctx.secret("api_key") }, auth: false });

export const activecampaign: Connector = {
  kind: "activecampaign",
  objects: ["contacts"],
  gapMs: 250,
  async account(ctx) {
    const d = await ctx.api<{ user: { id: string; email: string } }>(`${acBase(ctx)}/users/me`, acHeaders(ctx));
    return { id: new URL(ctx.secret("url")).hostname, label: d.user?.email ?? new URL(ctx.secret("url")).hostname };
  },
  async pull(ctx, _object, cursor): Promise<Page> {
    const c = readCursor<{ offset: number; since: string | null; max: string }>(cursor, { offset: 0, since: null, max: "" });
    const d = await ctx.api<{ contacts: { id: string; email: string; firstName: string; lastName: string; phone: string; orgname?: string; udate: string }[]; meta: { total: string } }>(
      `${acBase(ctx)}/contacts?${qs({ limit: 100, offset: c.offset, "orders[udate]": "ASC", "filters[updated_after]": c.since })}`,
      acHeaders(ctx),
    );
    const records = (d.contacts ?? []).map((x) => ({ id: x.id, updatedAt: x.udate, data: { email: x.email, firstName: x.firstName, lastName: x.lastName, phone: x.phone, orgname: x.orgname ?? null } }));
    const max = newest(records, c.max);
    if (c.offset + 100 < Number(d.meta?.total ?? 0)) return { records, cursor: JSON.stringify({ ...c, offset: c.offset + 100, max }), more: true };
    return { records, cursor: JSON.stringify({ offset: 0, since: max ? max.slice(0, 19).replace("T", " ") : c.since, max: "" }), more: false };
  },
  defaults: { contact: { email: "email", firstName: "first_name", lastName: "last_name", phone: "phone", orgname: "company" } },
};

// Brevo -------------------------------------------------------------------------------------------------------

const brevoHeaders = (ctx: Ctx) => ({ headers: { "api-key": ctx.secret("api_key") }, auth: false });

export const brevo: Connector = {
  kind: "brevo",
  objects: ["contacts"],
  gapMs: 150,
  async account(ctx) {
    const d = await ctx.api<{ email: string; companyName: string }>("https://api.brevo.com/v3/account", brevoHeaders(ctx));
    return { id: d.email, label: d.companyName || d.email };
  },
  async pull(ctx, _object, cursor): Promise<Page> {
    const c = readCursor<{ offset: number; since: string | null; max: string }>(cursor, { offset: 0, since: null, max: "" });
    const d = await ctx.api<{ contacts: { id: number; email: string; emailBlacklisted: boolean; attributes: Record<string, unknown>; modifiedAt: string }[]; count: number }>(
      `https://api.brevo.com/v3/contacts?${qs({ limit: 1000, offset: c.offset, sort: "asc", modifiedSince: c.since })}`,
      brevoHeaders(ctx),
    );
    const records = (d.contacts ?? []).map((x) => ({
      id: String(x.id),
      updatedAt: x.modifiedAt,
      data: { email: x.email, blacklisted: x.emailBlacklisted, FIRSTNAME: x.attributes?.FIRSTNAME ?? null, LASTNAME: x.attributes?.LASTNAME ?? null, SMS: x.attributes?.SMS ?? null, COMPANY: x.attributes?.COMPANY ?? null },
    }));
    const max = newest(records, c.max);
    if (c.offset + 1000 < (d.count ?? 0)) return { records, cursor: JSON.stringify({ ...c, offset: c.offset + 1000, max }), more: true };
    return { records, cursor: JSON.stringify({ offset: 0, since: max ? since5(max) : c.since, max: "" }), more: false };
  },
  consent: (r) => (r.data.blacklisted === true ? "unsubscribed" : null),
  defaults: { contact: { email: "email", FIRSTNAME: "first_name", LASTNAME: "last_name", SMS: "phone", COMPANY: "company" } },
};

// Kit (ConvertKit) --------------------------------------------------------------------------------------------

export const kit: Connector = {
  kind: "kit",
  objects: ["contacts", "suppressions"],
  gapMs: 600,
  async account(ctx) {
    const d = await ctx.api<{ name: string; primary_email_address: string }>(`https://api.convertkit.com/v3/account?${qs({ api_secret: ctx.secret("api_key") })}`, { auth: false });
    return { id: d.primary_email_address, label: d.name || d.primary_email_address };
  },
  async pull(ctx, object, cursor): Promise<Page> {
    // Unsubscribes come from the cancelled list; everyone else from the subscriber list by last update.
    const c = readCursor<{ page: number; since: string | null; max: string }>(cursor, { page: 1, since: null, max: "" });
    const path = object === "suppressions" ? "/subscribers" : "/subscribers";
    const d = await ctx.api<{ subscribers: { id: number; first_name: string | null; email_address: string; state: string; created_at: string; fields: Record<string, unknown> }[]; total_pages: number }>(
      `https://api.convertkit.com/v3${path}?${qs({ api_secret: ctx.secret("api_key"), page: c.page, sort_order: "asc", sort_field: "updated_at", updated_from: c.since, subscriber_state: object === "suppressions" ? "cancelled" : null })}`,
      { auth: false },
    );
    const records: RawRecord[] = (d.subscribers ?? []).map((s) =>
      object === "suppressions"
        ? { id: String(s.id), data: { email: s.email_address, reason: "unsubscribed" } }
        : { id: String(s.id), updatedAt: s.created_at, data: { email: s.email_address, first_name: s.first_name, state: s.state, ...(s.fields ?? {}) } },
    );
    if (c.page < (d.total_pages ?? 1)) return { records, cursor: JSON.stringify({ ...c, page: c.page + 1 }), more: true };
    return { records, cursor: JSON.stringify({ page: 1, since: new Date(Date.now() - 86_400_000).toISOString().slice(0, 10), max: "" }), more: false };
  },
  consent(r) {
    const s = String(r.data.state ?? "");
    return s === "active" ? "opt_in" : s === "cancelled" || s === "complained" ? "unsubscribed" : s === "bounced" ? "bounced" : null;
  },
  defaults: { contact: { email: "email", first_name: "first_name" } },
};

// MailerLite --------------------------------------------------------------------------------------------------

export const mailerlite: Connector = {
  kind: "mailerlite",
  objects: ["contacts"],
  gapMs: 600,
  async account(ctx) {
    await ctx.api("https://connect.mailerlite.com/api/subscribers?limit=1");
    return { id: `ml-${ctx.secret("api_key").slice(-6)}`, label: "MailerLite" };
  },
  async pull(ctx, _object, cursor): Promise<Page> {
    // MailerLite has no "changed since" on this list; each run reads it all and unchanged rows are skipped.
    const c = readCursor<{ next: string | null }>(cursor, { next: null });
    const d = await ctx.api<{ data: { id: string; email: string; status: string; fields: Record<string, unknown>; updated_at: string }[]; meta: { next_cursor: string | null } }>(
      `https://connect.mailerlite.com/api/subscribers?${qs({ limit: 1000, cursor: c.next })}`,
    );
    const records = (d.data ?? []).map((s) => ({ id: s.id, updatedAt: s.updated_at, data: { email: s.email, status: s.status, name: s.fields?.name ?? null, last_name: s.fields?.last_name ?? null, company: s.fields?.company ?? null, country: s.fields?.country ?? null, phone: s.fields?.phone ?? null } }));
    const next = d.meta?.next_cursor ?? null;
    return { records, cursor: next ? JSON.stringify({ next }) : null, more: !!next };
  },
  consent(r) {
    const s = String(r.data.status ?? "");
    return s === "active" ? "opt_in" : s === "unsubscribed" || s === "junk" ? "unsubscribed" : s === "bounced" ? "bounced" : null;
  },
  defaults: { contact: { email: "email", name: "first_name", last_name: "last_name", company: "company", country: "country", phone: "phone" } },
};

// Lists (docs/integrations-plan.md step 1) ----------------------------------------------------------------------
// A form fill (or a workflow) adds the person to one list of the tool, with its tags where the tool keeps tags.
// Marketing permission follows the destination: with `marketing` off (no consent box ticked), Mailchimp keeps them
// as transactional and Klaviyo adds them to the list without a subscription; the tools that only hold subscribers
// (ActiveCampaign, Brevo, Kit, MailerLite) leave them out, and the delivery says why. An existing person's
// subscription is never changed here: someone who unsubscribed stays unsubscribed. Endpoints "check" as above.

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const e164 = (v: unknown) => (typeof v === "string" && /^\+[1-9]\d{7,14}$/.test(v.replace(/[\s().-]/g, "")) ? v.replace(/[\s().-]/g, "") : undefined);
const clean = <T extends Record<string, unknown>>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== "")) as Partial<T>;
const NO_CONSENT = "Not added: no email consent on this fill.";
const NO_LIST = "Pick a list in the form's Sync tab.";

/** One result per change; sign-in and rate limits go up so the delivery stops or waits, anything else is this fill's error. */
async function eachChange(changes: PushChange[], o: PushOptions | undefined, one: (c: PushChange, email: string, list: string) => Promise<PushResult>): Promise<PushResult[]> {
  const out: PushResult[] = [];
  for (const c of changes) {
    const email = text(c.values.email)?.toLowerCase();
    if (!email) {
      out.push({ localId: c.localId, error: "This fill has no email." });
      continue;
    }
    if (!o?.list) {
      out.push({ localId: c.localId, error: NO_LIST });
      continue;
    }
    try {
      out.push(await one(c, email, o.list));
    } catch (e) {
      if (e instanceof AuthError || e instanceof RateLimited) throw e;
      out.push({ localId: c.localId, error: String((e as Error).message ?? e).slice(0, 300) });
    }
  }
  return out;
}

const tagsOf = (o?: PushOptions) => [...new Set((o?.tags ?? []).map((t) => t.trim()).filter(Boolean))].slice(0, 10);

// Mailchimp: an audience; the member is upserted by its email's hash, merge fields only where the audience has them.
const mcHash = (email: string) => createHash("md5").update(email.toLowerCase()).digest("hex");
Object.assign(mailchimp, {
  tags: true,
  async audiences(ctx: Ctx) {
    const d = await ctx.api<{ lists: { id: string; name: string }[] }>(`${await mcBase(ctx)}/lists?count=1000&fields=lists.id,lists.name`, mcAuth(ctx));
    return (d.lists ?? []).map((l) => ({ id: l.id, name: l.name }));
  },
  async push(ctx: Ctx, changes: PushChange[], o?: PushOptions) {
    const base = await mcBase(ctx);
    let tagsHere: Set<string> | null = null;
    return eachChange(changes, o, async (c, email, list) => {
      tagsHere ??= new Set((await ctx.api<{ merge_fields: { tag: string }[] }>(`${base}/lists/${list}/merge-fields?count=100&fields=merge_fields.tag`, mcAuth(ctx))).merge_fields?.map((m) => m.tag) ?? []);
      const merge = clean({ FNAME: text(c.values.FNAME), LNAME: text(c.values.LNAME), PHONE: text(c.values.PHONE), COMPANY: text(c.values.COMPANY) });
      const fields = Object.fromEntries(Object.entries(merge).filter(([k]) => tagsHere!.has(k)));
      const hash = mcHash(email);
      await ctx.api(`${base}/lists/${list}/members/${hash}`, { ...mcAuth(ctx), method: "PUT", body: JSON.stringify({ email_address: email, status_if_new: o?.marketing ? "subscribed" : "transactional", ...(Object.keys(fields).length ? { merge_fields: fields } : {}) }) });
      const tags = tagsOf(o);
      if (tags.length) await ctx.api(`${base}/lists/${list}/members/${hash}/tags`, { ...mcAuth(ctx), method: "POST", body: JSON.stringify({ tags: tags.map((name) => ({ name, status: "active" })) }) });
      return { localId: c.localId, externalId: hash };
    });
  },
});

// Klaviyo: the profile is made or updated, then subscribed to the list with consent, or only added to it without.
Object.assign(klaviyo, {
  async audiences(ctx: Ctx) {
    const out: { id: string; name: string }[] = [];
    let next: string | null = "https://a.klaviyo.com/api/lists?fields[list]=name";
    for (let i = 0; next && i < 10; i++) {
      const d: { data: { id: string; attributes: { name: string } }[]; links?: { next?: string | null } } = await ctx.api(next, kvHeaders(ctx));
      out.push(...(d.data ?? []).map((l) => ({ id: l.id, name: l.attributes.name })));
      next = d.links?.next ?? null;
    }
    return out;
  },
  async push(ctx: Ctx, changes: PushChange[], o?: PushOptions) {
    const h = kvHeaders(ctx);
    const json = (body: unknown) => ({ ...h, headers: { ...h.headers, "content-type": "application/vnd.api+json", accept: "application/vnd.api+json" }, method: "POST", body: JSON.stringify(body) });
    return eachChange(changes, o, async (c, email, list) => {
      const attributes = clean({ email, first_name: text(c.values.first_name), last_name: text(c.values.last_name), phone_number: e164(c.values.phone_number), organization: text(c.values.organization), title: text(c.values.title) });
      const made = await ctx.api<{ data?: { id?: string } }>("https://a.klaviyo.com/api/profile-import", json({ data: { type: "profile", attributes } }));
      const id = made?.data?.id;
      if (!id) return { localId: c.localId, error: "Klaviyo didn't take this person." };
      if (o?.marketing)
        await ctx.api("https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs", json({ data: { type: "profile-subscription-bulk-create-job", attributes: { profiles: { data: [{ type: "profile", attributes: { email, subscriptions: { email: { marketing: { consent: "SUBSCRIBED" } } } } }] } }, relationships: { list: { data: { type: "list", id: list } } } } }));
      else await ctx.api(`https://a.klaviyo.com/api/lists/${list}/relationships/profiles`, json({ data: [{ type: "profile", id }] }));
      return { localId: c.localId, externalId: id };
    });
  },
});

// ActiveCampaign: synced by email, subscribed to the list, tags found or made by name.
Object.assign(activecampaign, {
  tags: true,
  async audiences(ctx: Ctx) {
    const d = await ctx.api<{ lists: { id: string; name: string }[] }>(`${acBase(ctx)}/lists?limit=100`, acHeaders(ctx));
    return (d.lists ?? []).map((l) => ({ id: String(l.id), name: l.name }));
  },
  async push(ctx: Ctx, changes: PushChange[], o?: PushOptions) {
    const base = acBase(ctx);
    const post = <T,>(path: string, body: unknown) => ctx.api<T>(`${base}${path}`, { ...acHeaders(ctx), method: "POST", body: JSON.stringify(body) });
    const tagIds = new Map<string, string>();
    const tagId = async (name: string) => {
      if (tagIds.has(name)) return tagIds.get(name)!;
      const found = await ctx.api<{ tags: { id: string; tag: string }[] }>(`${base}/tags?${qs({ search: name })}`, acHeaders(ctx));
      const id = found.tags?.find((t) => t.tag.toLowerCase() === name.toLowerCase())?.id ?? (await post<{ tag: { id: string } }>("/tags", { tag: { tag: name, tagType: "contact", description: "" } })).tag.id;
      tagIds.set(name, String(id));
      return String(id);
    };
    return eachChange(changes, o, async (c, email, list) => {
      if (!o?.marketing) return { localId: c.localId, skipped: NO_CONSENT };
      const synced = await post<{ contact?: { id?: string } }>("/contact/sync", { contact: clean({ email, firstName: text(c.values.firstName), lastName: text(c.values.lastName), phone: text(c.values.phone) }) });
      const id = synced?.contact?.id;
      if (!id) return { localId: c.localId, error: "ActiveCampaign didn't take this person." };
      await post("/contactLists", { contactList: { list, contact: id, status: 1 } });
      for (const t of tagsOf(o)) await post("/contactTags", { contactTag: { contact: id, tag: await tagId(t) } });
      return { localId: c.localId, externalId: String(id) };
    });
  },
});

// Brevo: made or updated by email with the list; first and last name only (the attributes every account has).
Object.assign(brevo, {
  async audiences(ctx: Ctx) {
    const d = await ctx.api<{ lists?: { id: number; name: string }[] }>("https://api.brevo.com/v3/contacts/lists?limit=50&offset=0", brevoHeaders(ctx));
    return (d.lists ?? []).map((l) => ({ id: String(l.id), name: l.name }));
  },
  async push(ctx: Ctx, changes: PushChange[], o?: PushOptions) {
    return eachChange(changes, o, async (c, email, list) => {
      if (!o?.marketing) return { localId: c.localId, skipped: NO_CONSENT };
      const attributes = clean({ FIRSTNAME: text(c.values.FIRSTNAME), LASTNAME: text(c.values.LASTNAME) });
      const made = await ctx.api<{ id?: number } | null>("https://api.brevo.com/v3/contacts", { ...brevoHeaders(ctx), method: "POST", body: JSON.stringify({ email, updateEnabled: true, listIds: [Number(list)], ...(Object.keys(attributes).length ? { attributes } : {}) }) });
      // An update answers 204 with no body: the id is read by email.
      const id = made?.id ?? (await ctx.api<{ id: number }>(`https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`, brevoHeaders(ctx))).id;
      return { localId: c.localId, externalId: String(id) };
    });
  },
});

// Kit: subscribed through one of its forms, tags found or made by name.
const kitUrl = (ctx: Ctx, path: string, q: Record<string, string | number | null> = {}) => `https://api.convertkit.com/v3${path}?${qs({ api_secret: ctx.secret("api_key"), ...q })}`;
Object.assign(kit, {
  tags: true,
  async audiences(ctx: Ctx) {
    const d = await ctx.api<{ forms: { id: number; name: string }[] }>(kitUrl(ctx, "/forms"), { auth: false });
    return (d.forms ?? []).map((f) => ({ id: String(f.id), name: f.name }));
  },
  async push(ctx: Ctx, changes: PushChange[], o?: PushOptions) {
    let tags: Map<string, number> | null = null;
    const tagId = async (name: string) => {
      tags ??= new Map(((await ctx.api<{ tags: { id: number; name: string }[] }>(kitUrl(ctx, "/tags"), { auth: false })).tags ?? []).map((t) => [t.name.toLowerCase(), t.id]));
      const had = tags.get(name.toLowerCase());
      if (had) return had;
      const made = await ctx.api<{ id: number }>(kitUrl(ctx, "/tags"), { auth: false, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ api_secret: ctx.secret("api_key"), tag: { name } }) });
      tags.set(name.toLowerCase(), made.id);
      return made.id;
    };
    return eachChange(changes, o, async (c, email, list) => {
      if (!o?.marketing) return { localId: c.localId, skipped: NO_CONSENT };
      const tagIds = [];
      for (const t of tagsOf(o)) tagIds.push(await tagId(t));
      const d = await ctx.api<{ subscription?: { subscriber?: { id?: number } } }>(`https://api.convertkit.com/v3/forms/${encodeURIComponent(list)}/subscribe`, { auth: false, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(clean({ api_secret: ctx.secret("api_key"), email, first_name: text(c.values.first_name), ...(tagIds.length ? { tags: tagIds } : {}) })) });
      const id = d?.subscription?.subscriber?.id;
      return id ? { localId: c.localId, externalId: String(id) } : { localId: c.localId, error: "Kit didn't take this person." };
    });
  },
});

// MailerLite: upserted with the group.
Object.assign(mailerlite, {
  async audiences(ctx: Ctx) {
    const d = await ctx.api<{ data: { id: string; name: string }[] }>("https://connect.mailerlite.com/api/groups?limit=100");
    return (d.data ?? []).map((g) => ({ id: String(g.id), name: g.name }));
  },
  async push(ctx: Ctx, changes: PushChange[], o?: PushOptions) {
    return eachChange(changes, o, async (c, email, list) => {
      if (!o?.marketing) return { localId: c.localId, skipped: NO_CONSENT };
      const fields = clean({ name: text(c.values.name), last_name: text(c.values.last_name), company: text(c.values.company), country: text(c.values.country), phone: text(c.values.phone) });
      const d = await ctx.api<{ data?: { id?: string } }>("https://connect.mailerlite.com/api/subscribers", { method: "POST", body: JSON.stringify({ email, groups: [list], ...(Object.keys(fields).length ? { fields } : {}) }) });
      const id = d?.data?.id;
      return id ? { localId: c.localId, externalId: String(id) } : { localId: c.localId, error: "MailerLite didn't take this person." };
    });
  },
});
