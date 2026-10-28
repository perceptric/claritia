// The email document (docs/design-system.md Part 4.1): sections of columns of blocks, with the email's own styles and
// classes keyed by element id (as forms do), on a brand kit's design system. HTML is made from it by compile.ts; the
// document is what people, the builder and the AI edit. `readEmailDoc` keeps only known blocks, safe links, clean
// rich text and checked styles, within the limits, so anything saved or sent has been through it. Runs in the
// browser and on the server.

import { readEmailStyles, readSystem, allVariables, varKinds, type DesignSystem, type EmailStyles } from "../model.ts";
import type { Tokens } from "../../forms/brand.ts";
import { cleanHtml, safeHref } from "./html.ts";
import { BLOCK_TYPES, type BlockType } from "./parts.ts";

export const EMAIL_LIMITS = { sections: 40, columns: 4, blocks: 200, text: 20_000, html: 50_000 };

/** The contact fields a condition can test: what the send knows about each person. */
export const COND_FIELDS = ["first_name", "last_name", "company", "title"] as const;
export type CondField = (typeof COND_FIELDS)[number];
export type EmailCond = { field: CondField; op: "is" | "is_not" | "contains" | "is_set" | "is_not_set"; value?: string };
export const COND_OPS: EmailCond["op"][] = ["is", "is_not", "contains", "is_set", "is_not_set"];

type Base = { id: string; showIf?: EmailCond; hideOn?: "phone" | "desktop" };
export type Align = "left" | "center" | "right";
export type SocialKind = "linkedin" | "x" | "facebook" | "instagram" | "youtube" | "github" | "website";
export const SOCIAL_KINDS: SocialKind[] = ["linkedin", "x", "facebook", "instagram", "youtube", "github", "website"];

export type Block = Base &
  (
    | { type: "heading"; text: string; level: 1 | 2 | 3 }
    | { type: "text"; html: string }
    | { type: "button"; label: string; url: string; align: Align; full?: boolean }
    | { type: "image"; src: string; alt: string; url?: string; width?: number; align: Align }
    | { type: "logo"; src?: string; alt: string; url?: string; width: number; align: Align }
    | { type: "divider" }
    | { type: "spacer"; height: number }
    | { type: "list"; items: string[]; ordered: boolean }
    | { type: "quote"; text: string; cite?: string }
    | { type: "social"; links: { kind: SocialKind; url: string }[]; align: Align }
    | { type: "video"; url: string; thumb: string; alt: string }
    | { type: "product"; title: string; text?: string; price?: string; image?: string; url: string; button: string }
    | { type: "event"; title: string; when: string; where?: string; url: string; button: string }
    | { type: "meeting"; label: string; url: string; align: Align }
    | { type: "signature"; name: string; title?: string; company?: string; image?: string }
    | { type: "footer"; text?: string; address?: string }
    | { type: "html"; html: string }
  );

export type Column = { id: string; width: number; blocks: Block[] };
export type Section = Base & { columns: Column[]; stackOnPhone: boolean };
export type EmailSettings = { width: 600 | 640 | 700; align: "center" | "left"; darkMode: "auto" | "off"; preheader: string; lang: string };
export type EmailDoc = {
  v: 1;
  /** The brand kit whose design system styles it; the workspace's first kit when unset. */
  kitId?: string;
  settings: EmailSettings;
  sections: Section[];
  /** Element id ("email" for the email's own parts) → classes, and → part styles. */
  classes?: Record<string, string[]>;
  styles?: Record<string, EmailStyles>;
};

// Reading --------------------------------------------------------------------------------------------------------------

const ID = /^[a-z0-9]{1,24}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, max) : "");
const line = (v: unknown, max: number) => str(v, max).replace(/[\r\n]+/g, " ").trim();
const num = (v: unknown, lo: number, hi: number, d: number) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Math.round(Math.min(hi, Math.max(lo, Number(v)))) : d);
const pick = <T extends string | number>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
const href = (v: unknown) => safeHref(str(v, 2000)) ?? "";
const img = (v: unknown) => {
  const s = str(v, 1500).trim();
  return /^https:\/\/[^\s"'<>`]{4,1500}$/.test(s) ? s : "";
};
const ALIGNS = ["left", "center", "right"] as const;

function readCond(raw: unknown): EmailCond | undefined {
  const r = obj(raw);
  if (!r) return undefined;
  const field = pick(r.field, COND_FIELDS, "" as CondField);
  const op = pick(r.op, COND_OPS, "" as EmailCond["op"]);
  if (!field || !op) return undefined;
  const value = line(r.value, 200);
  if ((op === "is" || op === "is_not" || op === "contains") && !value) return undefined;
  return { field, op, ...(op === "is_set" || op === "is_not_set" ? {} : { value }) };
}

function readBase(r: Record<string, unknown>, seen: Set<string>): Base | null {
  const id = str(r.id, 24);
  if (!ID.test(id) || seen.has(id) || id === "email") return null;
  seen.add(id);
  const showIf = readCond(r.showIf);
  const hideOn = r.hideOn === "phone" || r.hideOn === "desktop" ? r.hideOn : undefined;
  return { id, ...(showIf ? { showIf } : {}), ...(hideOn ? { hideOn } : {}) };
}

/** One block, made safe; null for an unknown type. `html` blocks stay only when `allowHtml` (owners). */
export function readBlock(raw: unknown, seen: Set<string>, allowHtml: boolean): Block | null {
  const r = obj(raw);
  if (!r) return null;
  const type = pick(r.type, BLOCK_TYPES, "" as BlockType);
  if (!type || (type === "html" && !allowHtml)) return null;
  const base = readBase(r, seen);
  if (!base) return null;
  const align = pick(r.align, ALIGNS, "left");
  switch (type) {
    case "heading":
      return { ...base, type, text: line(r.text, 500), level: pick(r.level, [1, 2, 3] as const, 2) };
    case "text":
      return { ...base, type, html: cleanHtml(str(r.html, EMAIL_LIMITS.text), "rich") };
    case "button":
      return { ...base, type, label: line(r.label, 80), url: href(r.url), align, ...(r.full === true ? { full: true } : {}) };
    case "image": {
      const url = href(r.url);
      const width = r.width === undefined ? undefined : num(r.width, 20, 1400, 600);
      return { ...base, type, src: img(r.src), alt: line(r.alt, 300), align, ...(url ? { url } : {}), ...(width ? { width } : {}) };
    }
    case "logo": {
      const url = href(r.url);
      const src = img(r.src);
      return { ...base, type, alt: line(r.alt, 300), width: num(r.width, 40, 400, 120), align, ...(src ? { src } : {}), ...(url ? { url } : {}) };
    }
    case "divider":
      return { ...base, type };
    case "spacer":
      return { ...base, type, height: num(r.height, 4, 200, 24) };
    case "list":
      return { ...base, type, items: (Array.isArray(r.items) ? r.items : []).slice(0, 30).map((x) => line(x, 500)), ordered: r.ordered === true };
    case "quote": {
      const cite = line(r.cite, 120);
      return { ...base, type, text: str(r.text, 1000).trim(), ...(cite ? { cite } : {}) };
    }
    case "social":
      return {
        ...base,
        type,
        align,
        links: (Array.isArray(r.links) ? r.links : [])
          .slice(0, 8)
          .map((l) => obj(l))
          .filter((l): l is Record<string, unknown> => !!l)
          .map((l) => ({ kind: pick(l.kind, SOCIAL_KINDS, "website"), url: href(l.url) }))
          .filter((l) => l.url),
      };
    case "video":
      return { ...base, type, url: href(r.url), thumb: img(r.thumb), alt: line(r.alt, 300) };
    case "product": {
      const text = str(r.text, 600).trim();
      const price = line(r.price, 40);
      const image = img(r.image);
      return { ...base, type, title: line(r.title, 120), url: href(r.url), button: line(r.button, 60) || "View", ...(text ? { text } : {}), ...(price ? { price } : {}), ...(image ? { image } : {}) };
    }
    case "event": {
      const where = line(r.where, 200);
      return { ...base, type, title: line(r.title, 120), when: line(r.when, 120), url: href(r.url), button: line(r.button, 60) || "Save my seat", ...(where ? { where } : {}) };
    }
    case "meeting":
      return { ...base, type, label: line(r.label, 80) || "Book a time", url: href(r.url), align };
    case "signature": {
      const title = line(r.title, 120);
      const company = line(r.company, 120);
      const image = img(r.image);
      return { ...base, type, name: line(r.name, 120), ...(title ? { title } : {}), ...(company ? { company } : {}), ...(image ? { image } : {}) };
    }
    case "footer": {
      const text = str(r.text, 500).trim();
      const address = line(r.address, 300);
      return { ...base, type, ...(text ? { text } : {}), ...(address ? { address } : {}) };
    }
    case "html":
      return { ...base, type, html: cleanHtml(str(r.html, EMAIL_LIMITS.html), "block") };
  }
}

const DEFAULT_SETTINGS: EmailSettings = { width: 600, align: "center", darkMode: "auto", preheader: "", lang: "en" };

/**
 * An email document as saved or edited, made safe. With a design system, element styles keep only variables it has;
 * `allowHtml` keeps HTML blocks (only owners may add them; the server decides).
 */
export function readEmailDoc(raw: unknown, opts: { system?: DesignSystem; tokens?: Partial<Tokens>; allowHtml?: boolean } = {}): EmailDoc {
  const r = obj(raw) ?? {};
  const st = obj(r.settings) ?? {};
  const settings: EmailSettings = {
    width: pick(st.width, [600, 640, 700] as const, 600),
    align: pick(st.align, ["center", "left"] as const, "center"),
    darkMode: pick(st.darkMode, ["auto", "off"] as const, "auto"),
    preheader: line(st.preheader, 200),
    lang: /^[a-z]{2}(-[A-Z]{2})?$/.test(str(st.lang, 5)) ? str(st.lang, 5) : DEFAULT_SETTINGS.lang,
  };
  const seen = new Set<string>();
  let blocks = 0;
  const sections: Section[] = [];
  for (const s of Array.isArray(r.sections) ? r.sections.slice(0, EMAIL_LIMITS.sections) : []) {
    const so = obj(s);
    if (!so) continue;
    const base = readBase(so, seen);
    if (!base) continue;
    const columns: Column[] = [];
    for (const c of Array.isArray(so.columns) ? so.columns.slice(0, EMAIL_LIMITS.columns) : []) {
      const co = obj(c);
      if (!co) continue;
      const id = str(co.id, 24);
      if (!ID.test(id) || seen.has(id)) continue;
      seen.add(id);
      const list: Block[] = [];
      for (const b of Array.isArray(co.blocks) ? co.blocks : []) {
        if (blocks >= EMAIL_LIMITS.blocks) break;
        const block = readBlock(b, seen, !!opts.allowHtml);
        if (block) {
          list.push(block);
          blocks++;
        }
      }
      columns.push({ id, width: num(co.width, 10, 100, 100), blocks: list });
    }
    if (!columns.length) continue;
    // Widths always add up to 100.
    const total = columns.reduce((n, c) => n + c.width, 0);
    let left = 100;
    columns.forEach((c, i) => {
      c.width = i === columns.length - 1 ? left : Math.max(10, Math.round((c.width / total) * 100));
      left -= c.width;
    });
    sections.push({ ...base, columns, stackOnPhone: so.stackOnPhone !== false });
  }
  const ids = new Set([...seen, "email"]);
  const vars = opts.system ? varKinds(allVariables(opts.system, opts.tokens)) : undefined;
  const classIds = opts.system?.email ? new Set(opts.system.email.classes.map((c) => c.id)) : null;
  const classes: Record<string, string[]> = {};
  for (const [el, list] of Object.entries(obj(r.classes) ?? {})) {
    if (!ids.has(el) || !Array.isArray(list)) continue;
    const picked = [...new Set(list.filter((c): c is string => typeof c === "string" && ID.test(c) && (!classIds || classIds.has(c))))].slice(0, 6);
    if (picked.length) classes[el] = picked;
  }
  const styles: Record<string, EmailStyles> = {};
  for (const [el, ps] of Object.entries(obj(r.styles) ?? {})) {
    if (!ids.has(el)) continue;
    const clean = readEmailStyles(ps, vars);
    if (Object.keys(clean).length) styles[el] = clean;
  }
  const kitId = typeof r.kitId === "string" && UUID.test(r.kitId) ? r.kitId : undefined;
  return {
    v: 1,
    ...(kitId ? { kitId } : {}),
    settings,
    sections,
    ...(Object.keys(classes).length ? { classes } : {}),
    ...(Object.keys(styles).length ? { styles } : {}),
  };
}

// Making ---------------------------------------------------------------------------------------------------------------

export const newEmailId = () => Math.random().toString(36).slice(2, 10).padEnd(8, "0");

/** A new block of a type, with words to start from. */
export function newBlock(type: BlockType, id = newEmailId()): Block {
  const raw: Record<BlockType, Record<string, unknown>> = {
    heading: { text: "A clear headline", level: 2 },
    text: { html: "<p>Write something worth reading.</p>" },
    button: { label: "Learn more", url: "https://", align: "left" },
    image: { src: "", alt: "", align: "center" },
    logo: { alt: "Logo", width: 120, align: "left" },
    divider: {},
    spacer: { height: 24 },
    list: { items: ["First point", "Second point"], ordered: false },
    quote: { text: "A short quote from a happy customer.", cite: "Name, Company" },
    social: { links: [], align: "center" },
    video: { url: "", thumb: "", alt: "Watch the video" },
    product: { title: "Product name", text: "One line about it.", url: "https://", button: "View" },
    event: { title: "Event name", when: "Thursday, 10am", url: "https://", button: "Save my seat" },
    meeting: { label: "Book a time", url: "https://", align: "left" },
    signature: { name: "Your name", title: "Your title" },
    footer: {},
    html: { html: "" },
  };
  return { id, type, ...raw[type] } as Block;
}

export function newSection(blocks: Block[] = [], id = newEmailId()): Section {
  return { id, stackOnPhone: true, columns: [{ id: newEmailId(), width: 100, blocks }] };
}

export function emptyEmailDoc(): EmailDoc {
  return { v: 1, settings: { ...DEFAULT_SETTINGS }, sections: [newSection([newBlock("heading"), newBlock("text"), newBlock("button")]), newSection([newBlock("footer")])] };
}

/** Today's simple email (subject, preheader, paragraphs, one button) as a document, so it opens in the builder. */
export function docFromBody(body: { preheader: string; paragraphs: string[]; cta_label: string; cta_url: string }): EmailDoc {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const paras = body.paragraphs.map((p) => p.trim()).filter(Boolean);
  const blocks: Block[] = paras.length ? [{ id: newEmailId(), type: "text", html: paras.map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("") }] : [];
  if (body.cta_label.trim() && body.cta_url.trim()) blocks.push({ id: newEmailId(), type: "button", label: body.cta_label.trim(), url: safeHref(body.cta_url) ?? "", align: "left" });
  return { v: 1, settings: { ...DEFAULT_SETTINGS, preheader: body.preheader.trim().slice(0, 200) }, sections: [newSection(blocks)] };
}

/** Every element in order: the sections, their columns and blocks. */
export function* elements(doc: EmailDoc): Generator<{ id: string; kind: BlockType | "section" | "column"; block?: Block; section: Section }> {
  for (const s of doc.sections) {
    yield { id: s.id, kind: "section", section: s };
    for (const c of s.columns) {
      yield { id: c.id, kind: "column", section: s };
      for (const b of c.blocks) yield { id: b.id, kind: b.type, block: b, section: s };
    }
  }
}

/** Whether a condition holds for one person. Missing values are empty. */
export function condHolds(c: EmailCond, vars: Record<string, string | null | undefined>): boolean {
  const v = (vars[c.field] ?? "").trim().toLowerCase();
  const want = (c.value ?? "").trim().toLowerCase();
  switch (c.op) {
    case "is":
      return v === want;
    case "is_not":
      return v !== want;
    case "contains":
      return !!want && v.includes(want);
    case "is_set":
      return !!v;
    case "is_not_set":
      return !v;
  }
}

/** The design system an email uses, read safely from its brand kit's published design. */
export const emailSystem = (design: unknown, tokens: Partial<Tokens>) => readSystem(design, tokens);
