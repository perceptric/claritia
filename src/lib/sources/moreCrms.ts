// More CRMs for form leads (docs/integrations-plan.md, Next step 4): Zoho CRM, Dynamics 365, GoHighLevel,
// Freshsales, Copper, Keap and monday CRM. Each takes new contacts from Claritia like Pipedrive and Close do
// (src/lib/sources/crms.ts): the person is found by email before anything is made, so the same person twice is one
// record and a retry after a lost answer updates the record it made. A record deleted on their side since comes
// back "gone", and the delivery makes it again. Each has a link back to the record. Endpoints, fields and links are
// from each tool's docs and are rechecked against a real account before launch (check).

import { refreshRequest } from "./oauth.ts";
import type { Connector, Ctx, PushChange, PushResult, SourceRow } from "./types.ts";

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const gone = () => Object.assign(new Error("The record is gone."), { status: 404 });
const isGone = (e: unknown) => [404, 410].includes((e as { status?: number })?.status ?? 0);

/** A form lead as the tools take it: the mapping's columns (defaults below), cleaned. */
export type Person = { email?: string; first?: string; last?: string; name: string; phone?: string; title?: string; company?: string };
export function personOf(v: Record<string, unknown>): Person {
  const email = str(v.email),
    first = str(v.first_name),
    last = str(v.last_name);
  return { email, first, last, name: [first, last].filter(Boolean).join(" ") || email || "Unknown", phone: str(v.phone), title: str(v.title), company: str(v.company) };
}

/**
 * Each change through `one`, which updates the record it's given (throwing a 404 when it's gone) or finds or makes
 * one, and answers its id. One bad row never stops the rest.
 */
async function each(changes: PushChange[], one: (p: Person, id: string | null) => Promise<string | null>): Promise<PushResult[]> {
  const out: PushResult[] = [];
  for (const c of changes) {
    try {
      const id = await one(personOf(c.values), c.externalId);
      out.push(id ? { localId: c.localId, externalId: id } : { localId: c.localId, error: "The tool didn't take this contact." });
    } catch (e) {
      if (c.externalId && isGone(e)) out.push({ localId: c.localId, gone: true });
      else out.push({ localId: c.localId, error: String((e as Error).message ?? e).slice(0, 300) });
    }
  }
  return out;
}

const CONTACT = { email: "email", first_name: "first_name", last_name: "last_name", phone: "phone", title: "title", company: "company" } as const;
const WRITABLE = Object.keys(CONTACT);

// Zoho CRM ----------------------------------------------------------------------------------------------------

const zoho = (ctx: Ctx) => `${/^https:\/\/www\.zohoapis\.[a-z.]+$/.test(ctx.secret("api_domain")) ? ctx.secret("api_domain") : "https://www.zohoapis.com"}/crm/v6`;
type ZohoAnswer = { data?: { code?: string; status?: string; message?: string; details?: { id?: string; api_name?: string } }[] };

/** Zoho answers 200 with a status per record; a record that isn't there anymore is INVALID_DATA on its id. */
function zohoId(r: ZohoAnswer): string {
  const d = r.data?.[0];
  if (d?.code === "SUCCESS" || d?.code === "DUPLICATE_DATA") return d.details?.id ?? "";
  if (d?.code === "INVALID_DATA" && d.details?.api_name === "id") throw gone();
  throw new Error(`Zoho: ${d?.message ?? "it didn't take the lead"}`);
}

export const zohoCrm: Connector = {
  kind: "zoho",
  objects: ["contacts"],
  gapMs: 250,
  async account(ctx) {
    const d = await ctx.api<{ org?: { id: string; company_name?: string }[] }>(`${zoho(ctx)}/org`);
    const o = d.org?.[0];
    return { id: o?.id ?? "", label: o?.company_name ?? "Zoho CRM" };
  },
  push: (ctx, changes) =>
    each(changes, async (p, id) => {
      const rec = {
        Last_Name: p.last ?? p.name,
        ...(p.first ? { First_Name: p.first } : {}),
        ...(p.email ? { Email: p.email } : {}),
        ...(p.phone ? { Phone: p.phone } : {}),
        ...(p.title ? { Designation: p.title } : {}),
        Company: p.company ?? p.email?.split("@")[1] ?? p.name,
        Lead_Source: "Claritia",
      };
      if (!id && p.email) {
        // No match is an empty answer (204).
        const found = await ctx.api<{ data?: { id: string }[] } | null>(`${zoho(ctx)}/Leads/search?email=${encodeURIComponent(p.email)}`);
        id = found?.data?.[0]?.id ?? null;
      }
      if (id) return zohoId(await ctx.api<ZohoAnswer>(`${zoho(ctx)}/Leads/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify({ data: [rec] }) })) || id;
      return zohoId(await ctx.api<ZohoAnswer>(`${zoho(ctx)}/Leads`, { method: "POST", body: JSON.stringify({ data: [rec], trigger: ["workflow"] }) }));
    }),
  writable: WRITABLE,
  link(s, id, secret) {
    const tld = /^https:\/\/www\.zohoapis\.([a-z.]+)$/.exec(secret("api_domain"))?.[1] ?? "com";
    return /^\d+$/.test(s.account ?? "") ? `https://crm.zoho.${tld}/crm/org${s.account}/tab/Leads/${id}` : undefined;
  },
  defaults: { contact: { ...CONTACT } },
};

// Dynamics 365 ------------------------------------------------------------------------------------------------

const DYN = /^https:\/\/[a-z0-9-]+\.crm[0-9]*\.dynamics\.com$/;
type Dv = { url: string; token: string };
const dvTokens = new WeakMap<Ctx, Promise<Dv>>();

/** A token for the team's own Dynamics address (the connection's account), from the same Microsoft sign-in. */
function dataverse(ctx: Ctx): Promise<Dv> {
  const url = ctx.source.account ?? "";
  let p = dvTokens.get(ctx);
  if (!p) {
    p = (async () => {
      if (!DYN.test(url)) throw new Error("Connect Dynamics 365 again.");
      if (ctx.creds.type !== "oauth" || !ctx.creds.refresh) throw Object.assign(new Error("Sign in to Dynamics 365 again."), { status: 401 });
      const r = refreshRequest("dynamics", ctx.creds.refresh, `${url}/user_impersonation offline_access`);
      const t = await ctx.api<{ access_token?: string }>(r.url, { method: "POST", auth: false, headers: { "content-type": "application/x-www-form-urlencoded" }, body: r.body });
      if (!t.access_token) throw Object.assign(new Error("Sign in to Dynamics 365 again."), { status: 401 });
      return { url, token: t.access_token };
    })();
    p.catch(() => dvTokens.delete(ctx));
    dvTokens.set(ctx, p);
  }
  return p;
}

export const dynamics: Connector = {
  kind: "dynamics",
  objects: ["contacts"],
  gapMs: 250,
  async account(ctx) {
    // The first Dynamics environment the person can open; its address is the connection's account.
    const d = await ctx.api<{ value?: { Url: string; FriendlyName?: string }[] }>("https://globaldisco.crm.dynamics.com/api/discovery/v2.0/Instances");
    const i = (d.value ?? []).find((x) => DYN.test(x.Url.replace(/\/+$/, "")));
    if (!i) throw new Error("This Microsoft account has no Dynamics 365 environment.");
    return { id: i.Url.replace(/\/+$/, ""), label: i.FriendlyName ?? i.Url };
  },
  async push(ctx, changes) {
    const dv = await dataverse(ctx);
    const call = <T>(path: string, init: RequestInit = {}) =>
      ctx.api<T>(`${dv.url}/api/data/v9.2${path}`, { ...init, auth: false, headers: { authorization: `Bearer ${dv.token}`, "OData-MaxVersion": "4.0", "OData-Version": "4.0", ...(init.headers as Record<string, string>) } });
    return each(changes, async (p, id) => {
      const rec = {
        ...(p.first ? { firstname: p.first } : {}),
        lastname: p.last ?? p.name,
        ...(p.email ? { emailaddress1: p.email } : {}),
        ...(p.phone ? { telephone1: p.phone } : {}),
        ...(p.title ? { jobtitle: p.title } : {}),
        ...(p.company ? { companyname: p.company } : {}),
        subject: "Form lead from Claritia",
      };
      if (!id && p.email) {
        const found = await call<{ value?: { leadid: string }[] }>(`/leads?$select=leadid&$top=1&$filter=${encodeURIComponent(`emailaddress1 eq '${p.email.replace(/'/g, "''")}'`)}`);
        id = found.value?.[0]?.leadid ?? null;
      }
      if (id) {
        await call(`/leads(${encodeURIComponent(id)})`, { method: "PATCH", body: JSON.stringify(rec), headers: { "If-Match": "*" } });
        return id;
      }
      const made = await call<{ leadid?: string }>("/leads", { method: "POST", body: JSON.stringify(rec), headers: { Prefer: "return=representation" } });
      return made.leadid ?? null;
    });
  },
  writable: WRITABLE,
  link: (s, id) => (DYN.test(s.account ?? "") && /^[0-9a-f-]{36}$/.test(id) ? `${s.account}/main.aspx?etn=lead&pagetype=entityrecord&id=${id}` : undefined),
  defaults: { contact: { ...CONTACT } },
};

// GoHighLevel -------------------------------------------------------------------------------------------------

const GHL = "https://services.leadconnectorhq.com";
const GHL_HEADERS = { Version: "2021-07-28" };

export const goHighLevel: Connector = {
  kind: "gohighlevel",
  objects: ["contacts"],
  gapMs: 150,
  async account(ctx) {
    const loc = ctx.secret("locationId");
    if (!loc) throw new Error("Pick a sub-account when you sign in to GoHighLevel.");
    const d = await ctx.api<{ location?: { id: string; name?: string } }>(`${GHL}/locations/${encodeURIComponent(loc)}`, { headers: GHL_HEADERS });
    return { id: loc, label: d.location?.name ?? "GoHighLevel" };
  },
  push: (ctx, changes) =>
    each(changes, async (p, id) => {
      const rec = { ...(p.first ? { firstName: p.first } : {}), ...(p.last ? { lastName: p.last } : {}), ...(p.phone ? { phone: p.phone } : {}), ...(p.company ? { companyName: p.company } : {}) };
      // Upsert finds the person by email itself (the sub-account's duplicate setting), so a repeat is one contact.
      if (p.email) {
        const d = await ctx.api<{ contact?: { id: string } }>(`${GHL}/contacts/upsert`, { method: "POST", headers: GHL_HEADERS, body: JSON.stringify({ ...rec, email: p.email, locationId: ctx.secret("locationId"), source: "Claritia" }) });
        return d.contact?.id ?? null;
      }
      if (!id) return null;
      await ctx.api(`${GHL}/contacts/${encodeURIComponent(id)}`, { method: "PUT", headers: GHL_HEADERS, body: JSON.stringify(rec) });
      return id;
    }),
  writable: WRITABLE,
  link: (s, id) => (s.account ? `https://app.gohighlevel.com/v2/location/${encodeURIComponent(s.account)}/contacts/detail/${encodeURIComponent(id)}` : undefined),
  defaults: { contact: { ...CONTACT } },
};

// Freshsales --------------------------------------------------------------------------------------------------

const FS_DOMAIN = /^[a-z0-9-]+\.(myfreshworks\.com|freshsales\.io)$/;
const fsDomain = (ctx: Ctx) => {
  const d = ctx.secret("domain").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!FS_DOMAIN.test(d)) throw new Error("Use your Freshsales address, like acme.myfreshworks.com.");
  return d;
};
const fs = <T>(ctx: Ctx, path: string, init: RequestInit = {}) =>
  ctx.api<T>(`https://${fsDomain(ctx)}/crm/sales/api${path}`, { ...init, auth: false, headers: { authorization: `Token token=${ctx.secret("api_key")}` } });

export const freshsales: Connector = {
  kind: "freshsales",
  objects: ["contacts"],
  gapMs: 300,
  async account(ctx) {
    await fs(ctx, "/selector/owners");
    return { id: fsDomain(ctx), label: fsDomain(ctx) };
  },
  push: (ctx, changes) =>
    each(changes, async (p, id) => {
      const contact = { ...(p.first ? { first_name: p.first } : {}), ...(p.last ? { last_name: p.last } : {}), ...(p.phone ? { mobile_number: p.phone } : {}), ...(p.title ? { job_title: p.title } : {}) };
      if (p.email) {
        const d = await fs<{ contact?: { id: number } }>(ctx, "/contacts/upsert", { method: "POST", body: JSON.stringify({ unique_identifier: { emails: p.email }, contact: { ...contact, emails: p.email } }) });
        return d.contact?.id ? String(d.contact.id) : null;
      }
      if (!id) return null;
      await fs(ctx, `/contacts/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify({ contact }) });
      return id;
    }),
  writable: WRITABLE,
  link: (s, id) => (FS_DOMAIN.test(s.account ?? "") ? `https://${s.account}/crm/sales/contacts/${encodeURIComponent(id)}` : undefined),
  defaults: { contact: { ...CONTACT } },
};

// Copper ------------------------------------------------------------------------------------------------------

const copper = <T>(ctx: Ctx, path: string, init: RequestInit = {}) =>
  ctx.api<T>(`https://api.copper.com/developer_api/v1${path}`, {
    ...init,
    auth: false,
    headers: { "X-PW-AccessToken": ctx.secret("api_key"), "X-PW-Application": "developer_api", "X-PW-UserEmail": ctx.secret("email") },
  });

export const copperCrm: Connector = {
  kind: "copper",
  objects: ["contacts"],
  gapMs: 300,
  async account(ctx) {
    const d = await copper<{ id: number; name?: string }>(ctx, "/account");
    return { id: String(d.id), label: d.name ?? "Copper" };
  },
  push: (ctx, changes) =>
    each(changes, async (p, id) => {
      const rec = {
        name: p.name,
        ...(p.first ? { first_name: p.first } : {}),
        ...(p.last ? { last_name: p.last } : {}),
        ...(p.email ? { emails: [{ email: p.email, category: "work" }] } : {}),
        ...(p.phone ? { phone_numbers: [{ number: p.phone, category: "work" }] } : {}),
        ...(p.title ? { title: p.title } : {}),
        ...(p.company ? { company_name: p.company } : {}),
      };
      if (!id && p.email) {
        // No match is a 404.
        id = await copper<{ id: number }>(ctx, "/people/fetch_by_email", { method: "POST", body: JSON.stringify({ email: p.email }) }).then(
          (d) => String(d.id),
          (e) => {
            if (isGone(e)) return null;
            throw e;
          },
        );
      }
      if (id) {
        await copper(ctx, `/people/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(rec) });
        return id;
      }
      const made = await copper<{ id?: number }>(ctx, "/people", { method: "POST", body: JSON.stringify(rec) });
      return made.id ? String(made.id) : null;
    }),
  writable: WRITABLE,
  link: (s, id) => (/^\d+$/.test(s.account ?? "") ? `https://app.copper.com/companies/${s.account}/app#/person/${encodeURIComponent(id)}` : undefined),
  defaults: { contact: { ...CONTACT } },
};

// Keap --------------------------------------------------------------------------------------------------------

const KEAP = "https://api.infusionsoft.com/crm/rest/v1";

export const keap: Connector = {
  kind: "keap",
  objects: ["contacts"],
  gapMs: 250,
  async account(ctx) {
    const d = await ctx.api<{ name?: string; email?: string }>(`${KEAP}/account/profile`);
    return { id: d.email ?? d.name ?? "keap", label: d.name ?? "Keap" };
  },
  push: (ctx, changes) =>
    each(changes, async (p, id) => {
      const rec = {
        ...(p.first ? { given_name: p.first } : {}),
        ...(p.last ? { family_name: p.last } : {}),
        ...(p.phone ? { phone_numbers: [{ number: p.phone, field: "PHONE1" }] } : {}),
        ...(p.title ? { job_title: p.title } : {}),
      };
      // Keap's create-or-update matches on the email, so a repeat is one contact.
      if (p.email) {
        const d = await ctx.api<{ id?: number }>(`${KEAP}/contacts`, { method: "PUT", body: JSON.stringify({ ...rec, email_addresses: [{ email: p.email, field: "EMAIL1" }], duplicate_option: "Email", source_type: "API" }) });
        return d.id ? String(d.id) : null;
      }
      if (!id) return null;
      await ctx.api(`${KEAP}/contacts/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(rec) });
      return id;
    }),
  writable: WRITABLE,
  defaults: { contact: { ...CONTACT } },
};

// monday CRM --------------------------------------------------------------------------------------------------

type Col = { id: string; title: string; type: string };
type Board = { id: string; cols: Col[] };
const boards = new WeakMap<Ctx, Promise<Board>>();

async function gql<T>(ctx: Ctx, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const r = await ctx.api<{ data?: T; errors?: { message: string }[]; error_message?: string }>("https://api.monday.com/v2", {
    method: "POST",
    auth: false,
    headers: { authorization: ctx.secret("api_key"), "API-Version": "2024-10" },
    body: JSON.stringify({ query, variables }),
  });
  const err = r.errors?.[0]?.message ?? r.error_message;
  if (err) throw /not found|does not exist/i.test(err) ? gone() : new Error(`monday: ${err}`);
  return r.data as T;
}

/** The board leads go to: the one pasted at connect (its link or id), else the account's board named Leads. */
function boardOf(ctx: Ctx): Promise<Board> {
  let p = boards.get(ctx);
  if (!p) {
    p = (async () => {
      const typed = /(\d{6,})/.exec(ctx.secret("board") ?? "")?.[1];
      const id = typed ?? (await gql<{ boards: { id: string; name: string }[] }>(ctx, "query { boards(limit: 200) { id name } }")).boards.find((b) => /^leads$/i.test(b.name.trim()))?.id;
      if (!id) throw new Error("Paste the Leads board's link in Settings › Integrations, or name a board Leads.");
      const d = await gql<{ boards: { columns: Col[] }[] }>(ctx, "query ($b: [ID!]) { boards(ids: $b) { columns { id title type } } }", { b: [id] });
      return { id, cols: d.boards[0]?.columns ?? [] };
    })();
    p.catch(() => boards.delete(ctx));
    boards.set(ctx, p);
  }
  return p;
}

/** The lead's cells on the board: email and phone by their column types, job title and company by their names. */
export function mondayCells(b: Board, p: Person): Record<string, unknown> {
  const by = (f: (c: Col) => boolean) => b.cols.find(f)?.id;
  const out: Record<string, unknown> = {};
  const email = by((c) => c.type === "email"),
    phone = by((c) => c.type === "phone"),
    title = by((c) => c.type === "text" && /title|position|role/i.test(c.title)),
    company = by((c) => c.type === "text" && /company|organi[sz]ation|account/i.test(c.title));
  if (email && p.email) out[email] = { email: p.email, text: p.email };
  if (phone && p.phone) out[phone] = { phone: p.phone.replace(/[^\d+]/g, "") };
  if (title && p.title) out[title] = p.title;
  if (company && p.company) out[company] = p.company;
  return out;
}

export const mondayCrm: Connector = {
  kind: "monday",
  objects: ["contacts"],
  gapMs: 300,
  async account(ctx) {
    const d = await gql<{ me: { account: { slug: string; name: string } } }>(ctx, "query { me { account { slug name } } }");
    await boardOf(ctx);
    return { id: d.me.account.slug, label: d.me.account.name };
  },
  async push(ctx, changes) {
    const b = await boardOf(ctx);
    const emailCol = b.cols.find((c) => c.type === "email")?.id;
    return each(changes, async (p, ext) => {
      // Kept as board:item, so the link and an update know the board.
      let item = ext?.startsWith(`${b.id}:`) ? ext.slice(b.id.length + 1) : null;
      const cells = JSON.stringify({ ...mondayCells(b, p), name: p.name });
      if (!item && p.email && emailCol) {
        const d = await gql<{ items_page_by_column_values: { items: { id: string }[] } }>(
          ctx,
          "query ($b: ID!, $c: String!, $v: [String]!) { items_page_by_column_values(board_id: $b, limit: 1, columns: [{ column_id: $c, column_values: $v }]) { items { id } } }",
          { b: b.id, c: emailCol, v: [p.email] },
        );
        item = d.items_page_by_column_values.items[0]?.id ?? null;
      }
      if (item) {
        await gql(ctx, "mutation ($b: ID!, $i: ID!, $v: JSON!) { change_multiple_column_values(board_id: $b, item_id: $i, column_values: $v) { id } }", { b: b.id, i: item, v: cells });
        return `${b.id}:${item}`;
      }
      const d = await gql<{ create_item: { id: string } }>(ctx, "mutation ($b: ID!, $n: String!, $v: JSON!) { create_item(board_id: $b, item_name: $n, column_values: $v) { id } }", { b: b.id, n: p.name, v: cells });
      return d.create_item?.id ? `${b.id}:${d.create_item.id}` : null;
    });
  },
  writable: WRITABLE,
  link(s: SourceRow, id: string) {
    const [board, item] = id.split(":");
    return /^[a-z0-9-]+$/.test(s.account ?? "") && board && item ? `https://${s.account}.monday.com/boards/${board}/pulses/${item}` : undefined;
  },
  defaults: { contact: { ...CONTACT } },
};

export const MORE_CRMS = [zohoCrm, dynamics, goHighLevel, freshsales, copperCrm, keap, mondayCrm];
