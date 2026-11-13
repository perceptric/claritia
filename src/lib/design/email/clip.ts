// Copy, cut and paste on the canvas, and moving an element between emails (docs/email-canvas-b4.md sections 5.7
// and 8): what a copy holds, how it goes on the clipboard (as JSON, as a marker inside HTML for browsers that keep
// only standard types, and as plain words), how it's read back, and how it's put into an email. A paste is never
// trusted: it's read through the same checks as a saved email, gets new ids, and keeps classes and component uses
// only where the target's brand kit has them. Also where a paste or a new block lands. Pure.

import type { Tokens } from "../../forms/brand.ts";
import type { DesignSystem } from "../model.ts";
import { blockText } from "./compile.ts";
import { EMAIL_LIMITS, newEmailId, readEmailDoc, type Block, type EmailDoc, type Section } from "./doc.ts";
import { escapeText } from "./html.ts";
import { findEl, freshEl, removeEl, type Place } from "./ops.ts";

export type Clip = {
  claritia: "email-clip";
  v: 1;
  kind: "block" | "section";
  el: Block | Section;
  styles: Record<string, unknown>;
  classes: Record<string, string[]>;
  kit: string | null;
  ws: string;
  from: string;
};
export const CLIP_TYPE = "application/x-claritia-email+json";
export const MAX_CLIP = 1_000_000;

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const idsOf = (el: Block | Section): string[] => ("columns" in el ? [el.id, ...el.columns.flatMap((c) => [c.id, ...c.blocks.map((b) => b.id)])] : [el.id]);
const blockCount = (doc: EmailDoc) => doc.sections.reduce((n, s) => n + s.columns.reduce((m, c) => m + c.blocks.length, 0), 0);

/** A copy of a block or section (a column copies its section), with its own styles and classes. */
export function makeClip(doc: EmailDoc, id: string, ctx: { kit: string | null; ws: string; from: string }): Clip | null {
  const f = findEl(doc, id);
  if (!f) return null;
  const el: Block | Section = f.block ?? f.section;
  const styles: Record<string, unknown> = {};
  const classes: Record<string, string[]> = {};
  for (const x of idsOf(el)) {
    if (doc.styles?.[x]) styles[x] = clone(doc.styles[x]);
    if (doc.classes?.[x]) classes[x] = [...doc.classes[x]];
  }
  return { claritia: "email-clip", v: 1, kind: f.block ? "block" : "section", el: clone(el), styles, classes, ...ctx };
}

/** The words of a copy, for other apps: the email's own plain-text build of each block. */
export function clipWords(clip: Clip): string {
  const blocks = "columns" in clip.el ? clip.el.columns.flatMap((c) => c.blocks) : [clip.el];
  return blocks
    .map((b) => blockText(b))
    .filter((t) => t && t.trim())
    .join("\n\n");
}

const toBase64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const fromBase64 = (b: string) => new TextDecoder().decode(Uint8Array.from(atob(b), (c) => c.charCodeAt(0)));

/** The clipboard's three ways: our JSON type, HTML with a marker (and readable words), and plain words. */
export function clipToClipboard(clip: Clip): { json: string; html: string; text: string } {
  const json = JSON.stringify(clip);
  const text = clipWords(clip);
  const readable = text
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((p) => `<p>${escapeText(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return { json, html: `<div data-claritia-clip="${toBase64(json)}">${readable}</div>`, text };
}

/** A copy read back from the clipboard: our JSON type first, then the HTML marker. Null when there's none. */
export function clipFromClipboard(data: { json?: string | null; html?: string | null }): Clip | null {
  const tryRead = (raw: string | null | undefined): Clip | null => {
    if (!raw || raw.length > MAX_CLIP) return null;
    try {
      const c = JSON.parse(raw) as Partial<Clip>;
      if (c?.claritia !== "email-clip" || c.v !== 1 || (c.kind !== "block" && c.kind !== "section") || !c.el || typeof c.el !== "object") return null;
      return {
        claritia: "email-clip",
        v: 1,
        kind: c.kind,
        el: c.el,
        styles: c.styles && typeof c.styles === "object" ? c.styles : {},
        classes: c.classes && typeof c.classes === "object" ? c.classes : {},
        kit: typeof c.kit === "string" ? c.kit : null,
        ws: typeof c.ws === "string" ? c.ws : "",
        from: typeof c.from === "string" ? c.from : "",
      };
    } catch {
      return null;
    }
  };
  const fromJson = tryRead(data.json);
  if (fromJson) return fromJson;
  const m = data.html ? /data-claritia-clip="([A-Za-z0-9+/=]{1,1400000})"/.exec(data.html) : null;
  if (!m) return null;
  try {
    return tryRead(fromBase64(m[1]!));
  } catch {
    return null;
  }
}

/** What the target email's brand allows: classes only from the same kit, components only the kit has. */
export type PutRules = { sameKit: boolean; system: DesignSystem; tokens?: Partial<Tokens> };

/**
 * Puts a copy into a document at a place, with new ids: a block into a column (or into a new section of its own), a
 * section at a section index (a column place puts it after that column's section). Read through the same checks as a
 * saved email first.
 */
export function putClip(doc: EmailDoc, clip: Clip, at: Place, rules: PutRules): { doc: EmailDoc; id: string } | { error: "full" | "empty" } {
  // 1. The checks a saved email goes through, on a one-section document holding the copy. Classes come only from the
  // same kit, and only those it has.
  const known = new Set((rules.system.email?.classes ?? []).map((c) => c.id));
  const kept: Record<string, string[]> = {};
  if (rules.sameKit) for (const [k, list] of Object.entries(clip.classes ?? {})) if (Array.isArray(list)) kept[k] = list.filter((c) => known.has(c));
  const wrapped =
    clip.kind === "section"
      ? { sections: [clip.el], styles: clip.styles, classes: kept }
      : { sections: [{ id: newEmailId(), stackOnPhone: true, columns: [{ id: newEmailId(), width: 100, blocks: [clip.el] }] }], styles: clip.styles, classes: kept };
  const temp = readEmailDoc(wrapped, { allowHtml: true, system: rules.system, tokens: rules.tokens });
  const section = temp.sections[0];
  let el: Block | Section | undefined = clip.kind === "section" ? section : section?.columns[0]?.blocks[0];
  if (!el) return { error: "empty" };
  // 2. A component use stays only when the target's kit has that component; otherwise it's plain blocks.
  if (clip.kind === "section") {
    const s = el as Section;
    const has = rules.system.email?.components?.some((c) => c.id === s.component?.id);
    if (s.component && (!rules.sameKit || !has)) delete s.component;
  }
  // 3. Room for it.
  const adding = clip.kind === "section" ? (el as Section).columns.reduce((n, c) => n + c.blocks.length, 0) : 1;
  const makesSection = clip.kind === "section" || "section" in at;
  if (blockCount(doc) + adding > EMAIL_LIMITS.blocks || (makesSection && doc.sections.length >= EMAIL_LIMITS.sections)) return { error: "full" };
  // 4. New ids, with their styles and classes.
  const next = clone(doc);
  const styles = (next.styles ??= {}) as Record<string, unknown>;
  const classes = (next.classes ??= {});
  el = freshEl(el, styles, classes, temp);
  // 5. In its place.
  if (clip.kind === "section") {
    let index: number;
    if ("section" in at) index = at.section;
    else {
      const f = findEl(next, at.column);
      index = f ? f.si + 1 : next.sections.length;
    }
    next.sections.splice(Math.max(0, Math.min(index, next.sections.length)), 0, el as Section);
  } else if ("section" in at) {
    next.sections.splice(Math.max(0, Math.min(at.section, next.sections.length)), 0, { id: newEmailId(), stackOnPhone: true, columns: [{ id: newEmailId(), width: 100, blocks: [el as Block] }] });
  } else {
    const f = findEl(next, at.column);
    if (!f?.column) return { error: "empty" };
    f.column.blocks.splice(Math.max(0, Math.min(at.index, f.column.blocks.length)), 0, el as Block);
  }
  if (!Object.keys(next.styles!).length) delete next.styles;
  if (!Object.keys(next.classes!).length) delete next.classes;
  return { doc: next, id: el.id };
}

/** Moves an element from one email into another (with new ids there); the first email loses it. */
export function transferEl(from: EmailDoc, to: EmailDoc, id: string, at: Place, rules: PutRules): { from: EmailDoc; to: EmailDoc; id: string } | { error: "full" | "missing" | "empty" } {
  const clip = makeClip(from, id, { kit: null, ws: "", from: "" });
  if (!clip) return { error: "missing" };
  const put = putClip(to, clip, at, rules);
  if ("error" in put) return put;
  return { from: removeEl(from, clip.el.id), to: put.doc, id: put.id };
}

/** Copies an element into an email (the same one or another) at a place, with new ids. */
export function copyElTo(from: EmailDoc, to: EmailDoc, id: string, at: Place, rules: PutRules): { to: EmailDoc; id: string } | { error: "full" | "missing" | "empty" } {
  const clip = makeClip(from, id, { kit: null, ws: "", from: "" });
  if (!clip) return { error: "missing" };
  const put = putClip(to, clip, at, rules);
  return "error" in put ? put : { to: put.doc, id: put.id };
}

/** The section a new section lands before when nothing inside the email is picked: the footer's, or the end. */
export function footerIndex(doc: EmailDoc): number {
  const i = doc.sections.findIndex((s) => s.columns.some((c) => c.blocks.some((b) => b.type === "footer")));
  return i >= 0 ? i : doc.sections.length;
}

/**
 * Where a paste, or a new block from the + panel, lands (docs/email-canvas-b4.md sections 7.4 and 8.6): after the
 * picked block; at the end of the picked column; at the end of the picked section's first column (after it, for a
 * component use); before the footer when the email is picked. Sections always land between sections.
 */
export function pastePlace(doc: EmailDoc, picked: string | null, kind: "block" | "section"): Place {
  const f = picked && picked !== "email" ? findEl(doc, picked) : null;
  if (!f) return { section: footerIndex(doc) };
  if (kind === "section") return { section: f.si + 1 };
  if (f.block) return { column: f.column!.id, index: f.bi! + 1 };
  if (f.column) return { column: f.column.id, index: f.column.blocks.length };
  if (f.section.component && !f.section.component.edit) return { section: f.si + 1 };
  const first = f.section.columns[0]!;
  return { column: first.id, index: first.blocks.length };
}
