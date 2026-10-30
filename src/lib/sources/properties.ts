// A connected CRM's contact fields, for linking form answers to them (docs/form-studio.md 2.1, "Data"):
//   - list: read live from the CRM's API (HubSpot properties, Salesforce describe of Lead and Contact, Omniscient's
//     contact fields), kept 10 minutes per source. A failed read is never kept.
//   - fit: which form fields can fill which property, and the reason when one can't.
//   - send: after a delivery made or found the CRM record, the linked answers go to their properties. A property
//     the CRM no longer has, a read-only one or a value it refuses is skipped with the reason; the rest still go.
//     The overwrite policy holds where the CRM lets us read the record first (HubSpot, Salesforce, Omniscient);
//     Omniscient's API itself never replaces a value its contact already has, so "Overwrite" acts as "Only fill if
//     empty" there.
// Browser-safe: reads and writes take a connector context, and nothing here imports server code.

import { OTHER } from "../forms/values.ts";
import { overwriteOf } from "../forms/overwrite.ts";
import { policyFor, type SyncRules } from "../delivery/rules.ts";
import { allFields, isContent, type Choice, type FieldType, type Form, type Overwrite } from "../forms/schema.ts";
import { AuthError, RateLimited, type Ctx } from "./types.ts";

export const CRM_VENDORS = ["hubspot", "salesforce", "omniscient"] as const;
export type CrmVendor = (typeof CRM_VENDORS)[number];
export const isCrmVendor = (k: string): k is CrmVendor => (CRM_VENDORS as readonly string[]).includes(k);
export const VENDOR: Record<CrmVendor, { label: string; domain: string }> = {
  hubspot: { label: "HubSpot", domain: "hubspot.com" },
  salesforce: { label: "Salesforce", domain: "salesforce.com" },
  omniscient: { label: "Omniscient", domain: "tryomniscient.com" },
};

/** What a property holds, the same words for every CRM. */
export type PropKind = "text" | "textarea" | "email" | "phone" | "url" | "number" | "date" | "datetime" | "bool" | "enum" | "multi";
export const KIND_LABEL: Record<PropKind, string> = {
  text: "Text",
  textarea: "Long text",
  email: "Email",
  phone: "Phone",
  url: "Link",
  number: "Number",
  date: "Date",
  datetime: "Date and time",
  bool: "Yes or no",
  enum: "Pick one",
  multi: "Pick many",
};

export type CrmProperty = {
  /** The CRM's own name for it: firstname, Budget__c. */
  name: string;
  label: string;
  kind: PropKind;
  options?: Choice[];
  readOnly?: boolean;
  /** Salesforce: which of Lead and Contact have it. */
  objects?: ("Lead" | "Contact")[];
};

// Lists ----------------------------------------------------------------------------------------------------------

type HsProp = {
  name: string;
  label?: string;
  type?: string;
  fieldType?: string;
  options?: { label?: string; value?: string; hidden?: boolean }[];
  hidden?: boolean;
  archived?: boolean;
  calculated?: boolean;
  modificationMetadata?: { readOnlyValue?: boolean };
};

/** The record's own id and email are set by the contact itself, never by an answer. */
const IDENTITY: Record<CrmVendor, Set<string>> = {
  hubspot: new Set(["email", "hs_object_id"]),
  salesforce: new Set(["Id", "Email"]),
  omniscient: new Set(["email"]),
};

const sorted = (xs: CrmProperty[]) => xs.sort((a, b) => Number(!!a.readOnly) - Number(!!b.readOnly) || a.label.localeCompare(b.label));

export function hubspotProperties(results: HsProp[]): CrmProperty[] {
  const out: CrmProperty[] = [];
  for (const p of results ?? []) {
    if (!p?.name || p.hidden || p.archived || IDENTITY.hubspot.has(p.name)) continue;
    const t = p.type ?? "string";
    const ft = p.fieldType ?? "";
    const kind: PropKind =
      t === "enumeration" ? (ft === "checkbox" ? "multi" : ft === "booleancheckbox" ? "bool" : "enum")
      : t === "bool" || ft === "booleancheckbox" ? "bool"
      : t === "number" ? "number"
      : t === "date" ? "date"
      : t === "datetime" ? "datetime"
      : t === "phone_number" || ft === "phonenumber" ? "phone"
      : ft === "textarea" ? "textarea"
      : "text";
    const options = kind === "enum" || kind === "multi" ? (p.options ?? []).filter((o) => !o.hidden && o.value != null).map((o) => ({ value: String(o.value), label: String(o.label ?? o.value) })) : undefined;
    out.push({ name: p.name, label: p.label || p.name, kind, ...(options ? { options } : {}), ...(p.modificationMetadata?.readOnlyValue || p.calculated ? { readOnly: true } : {}) });
  }
  return sorted(out);
}

export type SfField = {
  name: string;
  label?: string;
  type?: string;
  updateable?: boolean;
  createable?: boolean;
  calculated?: boolean;
  picklistValues?: { value: string; label?: string | null; active?: boolean }[];
};

const SF_KIND: Record<string, PropKind> = {
  string: "text",
  combobox: "text",
  textarea: "textarea",
  email: "email",
  phone: "phone",
  url: "url",
  boolean: "bool",
  int: "number",
  double: "number",
  currency: "number",
  percent: "number",
  long: "number",
  date: "date",
  datetime: "datetime",
  picklist: "enum",
  multipicklist: "multi",
};

/** Lead and Contact fields as one list: a new contact lands as a Lead, one Salesforce already has may be either. */
export function salesforceProperties(byObject: Partial<Record<"Lead" | "Contact", SfField[]>>): CrmProperty[] {
  const out = new Map<string, CrmProperty>();
  for (const obj of ["Lead", "Contact"] as const) {
    for (const f of byObject[obj] ?? []) {
      const kind = SF_KIND[f.type ?? ""];
      if (!f?.name || !kind || IDENTITY.salesforce.has(f.name)) continue;
      const have = out.get(f.name);
      if (have) {
        have.objects = [...(have.objects ?? []), obj];
        continue;
      }
      const options = kind === "enum" || kind === "multi" ? (f.picklistValues ?? []).filter((o) => o.active !== false).map((o) => ({ value: o.value, label: o.label || o.value })) : undefined;
      out.set(f.name, { name: f.name, label: f.label || f.name, kind, ...(options ? { options } : {}), ...((!f.updateable && !f.createable) || f.calculated ? { readOnly: true } : {}), objects: [obj] });
    }
  }
  return sorted([...out.values()]);
}

type OmniField = { key: string; label?: string; type?: string; options?: unknown; read_only?: boolean };
const OMNI_KIND: Record<string, PropKind> = { text: "text", long_text: "textarea", email: "email", phone: "phone", url: "url", number: "number", currency: "number", date: "date", checkbox: "bool", select: "enum", multi_select: "multi" };

/**
 * Omniscient's contact fields: the ones its contact API sets (name, title, phone), and its custom contact fields when
 * its API lists them (an object keyed "person" in /api/v1/objects).
 */
export function omniscientProperties(objects: { key?: string; fields?: OmniField[] }[] | null): CrmProperty[] {
  const out: CrmProperty[] = [
    { name: "name", label: "Name", kind: "text" },
    { name: "title", label: "Title", kind: "text" },
    { name: "phone", label: "Phone", kind: "phone" },
  ];
  const person = (objects ?? []).find((o) => o?.key === "person");
  for (const f of person?.fields ?? []) {
    const kind = OMNI_KIND[f.type ?? ""] ?? null;
    if (!f?.key || !kind || out.some((x) => x.name === f.key) || IDENTITY.omniscient.has(f.key)) continue;
    const options = Array.isArray(f.options)
      ? (f.options as unknown[]).flatMap((o) => (typeof o === "string" ? [{ value: o, label: o }] : o && typeof o === "object" && "value" in o ? [{ value: String((o as Choice).value), label: String((o as Choice).label ?? (o as Choice).value) }] : []))
      : undefined;
    out.push({ name: f.key, label: f.label || f.key, kind, ...(options?.length ? { options } : {}), ...(f.read_only ? { readOnly: true } : {}) });
  }
  return sorted(out);
}

export const SF_API = "v61.0";
const HUBSPOT = "https://api.hubapi.com";

function sfBase(ctx: Ctx) {
  const u = ctx.secret("instance_url");
  if (!/^https:\/\/[a-z0-9.-]+\.(salesforce|force)\.com$/i.test(u)) throw new AuthError("Sign in to Salesforce again.");
  return `${u}/services/data/${SF_API}`;
}

/** Salesforce's describe of one object: every field with its type, picklist values and whether it can be set. */
export async function describeSObject(ctx: Ctx, type: "Lead" | "Contact"): Promise<SfField[]> {
  const d = await ctx.api<{ fields?: SfField[] }>(`${sfBase(ctx)}/sobjects/${type}/describe`);
  return d?.fields ?? [];
}

function omniBase(ctx: Ctx) {
  const u = ctx.secret("url") || "https://app.tryomniscient.com";
  if (!/^https:\/\//.test(u) && !/^http:\/\/localhost/.test(u)) throw new AuthError("Connect Omniscient again.");
  return u.replace(/\/+$/, "");
}
const omniAuth = (ctx: Ctx) => ({ authorization: `Bearer ${ctx.secret("api_key")}` });

const TTL_MS = 10 * 60_000;
const cache = new Map<string, { at: number; props: CrmProperty[] }>();

/** Forget what was read (tests, and after a person asks to read again). */
export function forgetProperties(sourceId?: string) {
  if (sourceId) cache.delete(sourceId);
  else cache.clear();
}

/** The source's contact properties, from the CRM's API or from the last 10 minutes. Throws when the read fails. */
export async function listProperties(ctx: Ctx, o: { now?: number; fresh?: boolean } = {}): Promise<CrmProperty[]> {
  const kind = ctx.source.kind;
  if (!isCrmVendor(kind)) throw new Error(`${ctx.source.name} has no fields to link.`);
  const now = o.now ?? Date.now();
  const hit = cache.get(ctx.source.id);
  if (hit && !o.fresh && now - hit.at < TTL_MS) return hit.props;
  let props: CrmProperty[];
  let keep = true;
  if (kind === "hubspot") {
    const d = await ctx.api<{ results?: HsProp[] }>(`${HUBSPOT}/crm/v3/properties/contacts`);
    props = hubspotProperties(d?.results ?? []);
  } else if (kind === "salesforce") {
    const [lead, contact] = await Promise.allSettled([describeSObject(ctx, "Lead"), describeSObject(ctx, "Contact")]);
    // An org without Leads still has Contacts, and the other way round; both failing is the error.
    if (lead.status === "rejected" && contact.status === "rejected") throw lead.reason;
    props = salesforceProperties({ Lead: lead.status === "fulfilled" ? lead.value : [], Contact: contact.status === "fulfilled" ? contact.value : [] });
  } else {
    let objects: { key?: string; fields?: OmniField[] }[] | null = null;
    try {
      objects = (await ctx.api<{ data?: { key?: string; fields?: OmniField[] }[] }>(`${omniBase(ctx)}/api/v1/objects`, { headers: omniAuth(ctx), auth: false }))?.data ?? null;
    } catch (e) {
      // Its contact API always takes these; custom fields wait for the next read.
      if (e instanceof AuthError) throw e;
      keep = false;
    }
    props = omniscientProperties(objects);
  }
  if (keep) cache.set(ctx.source.id, { at: now, props });
  return props;
}

/** Why a read of the fields failed, in words for the picker. */
export function propertyError(kind: string, e: unknown): string {
  const who = isCrmVendor(kind) ? VENDOR[kind].label : "The tool";
  const msg = String((e as Error)?.message ?? e);
  if (e instanceof AuthError) return `Connect ${who} again to read its fields.`;
  if (e instanceof RateLimited) return `${who} is busy. Try again in a minute.`;
  if (msg === "Stopped" || /TimeoutError|AbortError|aborted|timed? ?out/i.test(`${(e as Error)?.name} ${msg}`)) return `${who} didn't answer in time. Try again.`;
  return `${who} couldn't list its fields: ${msg}`.slice(0, 300);
}

/** The fields, or the error to show in their place. Never throws. */
export async function readProperties(ctx: Ctx, o: { now?: number; fresh?: boolean } = {}): Promise<{ properties: CrmProperty[] } | { error: string }> {
  try {
    return { properties: await listProperties(ctx, o) };
  } catch (e) {
    return { error: propertyError(ctx.source.kind, e) };
  }
}

// Fit ------------------------------------------------------------------------------------------------------------

const TAKES: Record<PropKind, string> = {
  text: "Takes text",
  textarea: "Takes text",
  email: "Takes an email",
  phone: "Takes a phone number",
  url: "Takes a link",
  number: "Takes a number",
  date: "Takes a date",
  datetime: "Takes a date",
  bool: "Takes yes or no",
  enum: "Takes one of its options",
  multi: "Takes several options",
};

const ACCEPTS: Partial<Record<FieldType, PropKind[]>> = {
  text: ["text", "textarea"],
  textarea: ["textarea", "text"],
  email: ["email", "text", "textarea"],
  phone: ["phone", "text"],
  url: ["url", "text", "textarea"],
  country: ["text", "enum"],
  hidden: ["text", "textarea", "enum"],
  number: ["number", "text"],
  rating: ["number", "text"],
  date: ["date", "datetime", "text"],
  checkbox: ["bool", "text"],
  choice: ["enum", "text"],
  dropdown: ["enum", "text"],
  multi: ["multi", "text", "textarea"],
};

/** Why a field of this type can't fill the property, or null when it can. */
export function propertyFit(type: FieldType, p: CrmProperty): string | null {
  if (p.readOnly) return "Read-only";
  const ok = ACCEPTS[type];
  if (!ok) return "Saves nothing";
  return ok.includes(p.kind) ? null : TAKES[p.kind];
}

// Values ---------------------------------------------------------------------------------------------------------

const YES = new Set(["true", "yes", "y", "1", "on"]);
const NO = new Set(["false", "no", "n", "0", "off"]);

/** An answer matched to one of the property's options, by its value or its label. */
function option(p: CrmProperty, raw: string): string | null {
  if (!p.options?.length) return raw;
  const s = raw.trim().toLowerCase();
  return p.options.find((o) => o.value.toLowerCase() === s)?.value ?? p.options.find((o) => o.label.toLowerCase() === s)?.value ?? null;
}

/** An answer as the CRM takes it for this property, or why it can't go. */
export function crmValue(vendor: CrmVendor, p: CrmProperty, v: unknown): { value: unknown } | { skip: string } {
  const notOption = (x: string) => ({ skip: `"${x.startsWith(OTHER) ? x.slice(OTHER.length) : x}" isn't one of its options` });
  if (p.kind === "multi") {
    const list = Array.isArray(v) ? v.map(String) : String(v ?? "").split(/[;,]/).map((x) => x.trim()).filter(Boolean);
    const out: string[] = [];
    for (const x of list) {
      const m = option(p, x);
      if (m === null) return notOption(x);
      out.push(m);
    }
    return { value: vendor === "omniscient" ? out : out.join(";") };
  }
  if (Array.isArray(v)) v = v.join(", ");
  if (p.kind === "bool") {
    const b = typeof v === "boolean" ? v : YES.has(String(v).trim().toLowerCase()) ? true : NO.has(String(v).trim().toLowerCase()) ? false : null;
    if (b === null) return { skip: "Not yes or no" };
    return { value: vendor === "hubspot" ? String(b) : b };
  }
  if (typeof v === "boolean") v = v ? "Yes" : "No";
  if (p.kind === "number") {
    const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, "").trim());
    if (!Number.isFinite(n) || String(v).trim() === "") return { skip: "Not a number" };
    return { value: vendor === "hubspot" ? String(n) : n };
  }
  const s = String(v ?? "").trim();
  if (p.kind === "date" || p.kind === "datetime") {
    if (!/^\d{4}-\d{2}-\d{2}/.test(s) || Number.isNaN(Date.parse(s.slice(0, 10)))) return { skip: "Not a date" };
    return { value: p.kind === "date" ? s.slice(0, 10) : s.length === 10 ? `${s}T00:00:00Z` : s };
  }
  if (p.kind === "enum") {
    const m = option(p, s);
    return m === null ? notOption(s) : { value: m };
  }
  return { value: s };
}

// Send -----------------------------------------------------------------------------------------------------------

export type CrmSend = { property: string; label: string; value: unknown; policy: Overwrite; field: string };
export type CrmSkip = { property: string; label: string; reason: string };

const answered = (v: unknown) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && !v.length);

/**
 * A pick's answer as the CRM's values, through the field's choice map: a mapped choice goes as its CRM value, one
 * mapped to "" goes as nothing, and one the map doesn't name goes as itself.
 */
export function mapChoices(v: unknown, map: Record<string, string> | undefined): unknown {
  if (!map) return v;
  const one = (x: unknown) => (typeof x === "string" && Object.prototype.hasOwnProperty.call(map, x) ? map[x] : x);
  if (Array.isArray(v)) return v.map(one).filter((x) => x !== "");
  return one(v);
}

/**
 * The answers a fill sends to one CRM source: fields linked to a property on it, in the form's order. Two fields on
 * one property: the first in the form's order whose answer the property takes goes; the other is skipped and says so. `props` null means the list
 * couldn't be read; then nothing is skipped up front and the CRM's own answer decides.
 */
export function crmPlan(form: Pick<Form, "steps">, values: Record<string, unknown>, source: string, vendor: CrmVendor, props: CrmProperty[] | null, rules: SyncRules | null = null): { send: CrmSend[]; skip: CrmSkip[] } {
  const send: CrmSend[] = [];
  const skip: CrmSkip[] = [];
  const by = props ? new Map(props.map((p) => [p.name, p])) : null;
  const who = VENDOR[vendor].label;
  const taken = new Map<string, string>();
  for (const f of allFields(form)) {
    if (isContent(f.type) || !f.crm || f.crm.source !== source) continue;
    const v = mapChoices(values[f.key], f.crm.map);
    if (!answered(v)) continue;
    const label = f.crm.label || f.crm.property;
    const first = taken.get(f.crm.property);
    if (first !== undefined) {
      skip.push({ property: f.crm.property, label, reason: `Two fields link here; the answer to "${first}" went.` });
      continue;
    }
    const known = by?.get(f.crm.property);
    if (by && !known) {
      skip.push({ property: f.crm.property, label, reason: `${who} no longer has this field.` });
      continue;
    }
    const p: CrmProperty = known ?? { name: f.crm.property, label, kind: "text" };
    if (known?.readOnly) {
      skip.push({ property: p.name, label, reason: `It's read-only in ${who}.` });
      continue;
    }
    const c = known ? crmValue(vendor, p, v) : { value: Array.isArray(v) ? (vendor === "omniscient" ? v : v.join(";")) : typeof v === "boolean" && vendor === "hubspot" ? String(v) : v };
    if ("skip" in c) {
      skip.push({ property: p.name, label, reason: `${c.skip}.` });
      continue;
    }
    taken.set(p.name, f.label || p.name);
    send.push({ property: p.name, label, value: c.value, policy: policyFor(f, rules, overwriteOf(f)), field: f.id });
  }
  return { send, skip };
}

const blank = (v: unknown) => v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && !v.length);

/** A refusal from the CRM about what was sent, as opposed to the CRM being down, busy or the sign-in failing. */
function refused(e: unknown): boolean {
  if (e instanceof AuthError || e instanceof RateLimited) return false;
  const status = (e as { status?: number }).status;
  return typeof status === "number" && status >= 400 && status < 500 && ![401, 403, 408, 425, 429].includes(status);
}
const message = (e: unknown) => String((e as Error)?.message ?? e).slice(0, 300);

/** The CRM record a delivery made or found. */
export type CrmRecord = { id: string; localId: string; email?: string | null; isNew: boolean };

async function readCurrent(ctx: Ctx, vendor: CrmVendor, r: CrmRecord, names: string[]): Promise<Record<string, unknown>> {
  if (vendor === "hubspot") {
    const d = await ctx.api<{ properties?: Record<string, unknown> }>(`${HUBSPOT}/crm/v3/objects/contacts/${encodeURIComponent(r.id)}?properties=${names.map(encodeURIComponent).join(",")}`);
    return d?.properties ?? {};
  }
  if (vendor === "salesforce") {
    const type = r.id.startsWith("00Q") ? "Lead" : "Contact";
    return (await ctx.api<Record<string, unknown>>(`${sfBase(ctx)}/sobjects/${type}/${encodeURIComponent(r.id)}?fields=${names.map(encodeURIComponent).join(",")}`)) ?? {};
  }
  const d = await ctx.api<{ data?: { name?: unknown; title?: unknown; phone?: unknown; fields?: Record<string, unknown> }[] }>(`${omniBase(ctx)}/api/v1/contacts?email=${encodeURIComponent(r.email ?? "")}`, { headers: omniAuth(ctx), auth: false });
  const c = d?.data?.[0];
  return c ? { ...(c.fields ?? {}), name: c.name, title: c.title, phone: c.phone } : {};
}

const OMNI_TOP = new Set(["name", "title", "phone"]);

async function write(ctx: Ctx, vendor: CrmVendor, r: CrmRecord, values: Record<string, unknown>) {
  if (vendor === "hubspot") {
    await ctx.api(`${HUBSPOT}/crm/v3/objects/contacts/${encodeURIComponent(r.id)}`, { method: "PATCH", body: JSON.stringify({ properties: values }) });
  } else if (vendor === "salesforce") {
    await ctx.api(`${sfBase(ctx)}/sobjects/${r.id.startsWith("00Q") ? "Lead" : "Contact"}/${encodeURIComponent(r.id)}`, { method: "PATCH", body: JSON.stringify(values) });
  } else {
    const top = Object.fromEntries(Object.entries(values).filter(([k]) => OMNI_TOP.has(k)));
    const fields = Object.fromEntries(Object.entries(values).filter(([k]) => !OMNI_TOP.has(k)));
    await ctx.api(`${omniBase(ctx)}/api/v1/contacts`, {
      method: "POST",
      headers: omniAuth(ctx),
      auth: false,
      body: JSON.stringify({ email: r.email, ...top, ...(Object.keys(fields).length ? { fields } : {}), source: "claritia", external_id: r.localId }),
    });
  }
}

/**
 * Send planned answers to one CRM record. `isNew`: the record had no link to this contact before this delivery,
 * so "Never" may still fill it. Returns what went, what the policy held back and what the CRM refused (with why).
 * Throws when the CRM is down, busy or the sign-in failed, so the delivery tries again; a second try sends the same
 * values, so it changes nothing twice.
 */
export async function sendCrmFields(
  ctx: Ctx,
  vendor: CrmVendor,
  record: CrmRecord,
  plan: CrmSend[],
  props: CrmProperty[] | null,
): Promise<{ sent: string[]; held: string[]; skip: CrmSkip[] }> {
  const out = { sent: [] as string[], held: [] as string[], skip: [] as CrmSkip[] };
  let todo = plan;
  // Salesforce: a Lead and a Contact have their own fields.
  if (vendor === "salesforce") {
    const type = record.id.startsWith("00Q") ? "Lead" : "Contact";
    const by = props ? new Map(props.map((p) => [p.name, p])) : null;
    todo = plan.filter((s) => {
      const objs = by?.get(s.property)?.objects;
      if (!objs || objs.includes(type)) return true;
      out.skip.push({ property: s.property, label: s.label, reason: `Salesforce ${type === "Lead" ? "Leads" : "Contacts"} don't have this field.` });
      return false;
    });
  }
  if (!todo.length) return out;
  if (todo.some((s) => s.policy !== "always")) {
    let current: Record<string, unknown> | null = null;
    try {
      current = await readCurrent(ctx, vendor, record, todo.map((s) => s.property));
    } catch (e) {
      if (!refused(e)) throw e;
    }
    todo = todo.filter((s) => {
      if (s.policy === "always") return true;
      // Unread means unknown: an answer that may only fill a blank waits rather than risk replacing a value.
      const empty = current !== null && blank(current[s.property]);
      if (empty && (s.policy === "if_empty" || record.isNew)) return true;
      out.held.push(s.property);
      return false;
    });
  }
  if (!todo.length) return out;
  try {
    await write(ctx, vendor, record, Object.fromEntries(todo.map((s) => [s.property, s.value])));
    out.sent.push(...todo.map((s) => s.property));
    return out;
  } catch (e) {
    if (!refused(e)) throw e;
    if (todo.length === 1) {
      out.skip.push({ property: todo[0].property, label: todo[0].label, reason: message(e) });
      return out;
    }
  }
  // One bad value refuses the whole write: send them one by one to find it, and keep the rest.
  for (const s of todo) {
    try {
      await write(ctx, vendor, record, { [s.property]: s.value });
      out.sent.push(s.property);
    } catch (e) {
      if (!refused(e)) throw e;
      out.skip.push({ property: s.property, label: s.label, reason: message(e) });
    }
  }
  return out;
}
