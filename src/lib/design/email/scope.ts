// What Tia may change in one turn on the canvas (docs/email-canvas-b5.md section 2.3). The chips the person added
// say it: a part (block or section) lets her change that part's words, links, pictures and own styles, and nothing
// else; an email lets her change anything inside it. Brand-wide changes (a class, "Every heading", a component, the
// brand's styles) need the person's yes first. The checks run inside the chat's tools on the server, before and after
// each change, so they hold whatever the model tries. Pure.

import type { DesignSystem } from "../model.ts";
import type { EmailDoc, Section } from "./doc.ts";
import { findEl } from "./ops.ts";

export type Scope = { kind: "email" } | { kind: "parts"; ids: string[] };

const ID = /^[a-z0-9]{1,24}$/;

/** A scope from a request body; anything odd is the whole email. */
export function readScope(raw: unknown): Scope {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  if (r.kind === "parts" && Array.isArray(r.ids)) {
    const ids = [...new Set(r.ids.filter((x): x is string => typeof x === "string" && ID.test(x)))].slice(0, 20);
    if (ids.length) return { kind: "parts", ids };
  }
  return { kind: "email" };
}

/** Every element id a parts scope covers: the parts, and the columns and blocks inside a section part. */
export function scopeIds(doc: EmailDoc, scope: Scope): Set<string> | null {
  if (scope.kind === "email") return null;
  const out = new Set<string>();
  for (const id of scope.ids) {
    const f = findEl(doc, id);
    if (!f) continue;
    out.add(id);
    if (!f.block) {
      const s: Section = f.section;
      const cols = f.column ? [f.column] : s.columns;
      for (const c of cols) {
        out.add(c.id);
        for (const b of c.blocks) out.add(b.id);
      }
    }
  }
  return out;
}

const PART_TOOLS = new Set(["update_block", "set_style", "link_to"]);

/**
 * Before a tool runs: why it's refused under this scope, or null. Part scopes allow changing words, links, pictures
 * and styles of the parts; structure changes and the subject belong to the whole email.
 */
export function scopeRefusal(scope: Scope | undefined, tool: string, input: Record<string, unknown>, doc: EmailDoc): string | null {
  if (!scope || scope.kind === "email") return null;
  const ids = scopeIds(doc, scope)!;
  if (!PART_TOOLS.has(tool)) return `Only the parts the person added can change (${scope.ids.join(", ")}): their words, links, pictures and looks. Adding, moving or removing blocks, and the subject, aren't part of this.`;
  const target = String(input.block_id ?? input.element_id ?? "");
  if (!ids.has(target)) return `${target || "That"} isn't one of the parts the person added (${scope.ids.join(", ")}).`;
  if (tool === "set_style" && (input.on === "all_emails" || input.on === "class")) return "Changes for every email need the person's yes. Change only this part's own look, or call ask first.";
  return null;
}

/** The document with the scoped elements' content, styles and classes taken out, to compare what's outside them. */
function outside(doc: EmailDoc, ids: Set<string>): unknown {
  const strip = JSON.parse(JSON.stringify(doc)) as EmailDoc;
  for (const s of strip.sections) {
    if (ids.has(s.id)) {
      s.columns = [];
      continue;
    }
    for (const c of s.columns) c.blocks = c.blocks.map((b) => (ids.has(b.id) ? ({ id: b.id } as never) : b));
  }
  for (const id of ids) {
    delete strip.styles?.[id];
    delete strip.classes?.[id];
  }
  return strip;
}

/**
 * After a tool ran: why its change breaks the scope, or null. A part scope keeps everything outside the parts (and
 * the subject) as it was; any scope keeps the brand's styles unless the person said yes.
 */
export function scopeBreach(scope: Scope | undefined, before: { doc: EmailDoc; system: DesignSystem; subject: string }, after: { doc: EmailDoc; system: DesignSystem; subject: string }, confirmed: boolean): string | null {
  if (!scope) return null;
  if (!confirmed && JSON.stringify(before.system) !== JSON.stringify(after.system)) return "That changes every email on the brand. Ask the person first (call ask), and do it once they say yes.";
  if (scope.kind === "email") return null;
  const ids = scopeIds(before.doc, scope)!;
  if (after.subject !== before.subject) return "The subject belongs to the whole email; it isn't part of what the person added.";
  if (JSON.stringify(outside(before.doc, ids)) !== JSON.stringify(outside(after.doc, ids))) return "That changes something outside the parts the person added.";
  return null;
}

/** The words for the model: what this turn may change, and the other emails in the same turn. */
export function scopeContext(doc: EmailDoc, scope: Scope | undefined, turnWith: { name: string; subject: string }[]): string {
  const lines: string[] = [];
  if (scope?.kind === "parts") {
    const parts = scope.ids.map((id) => {
      const f = findEl(doc, id);
      return f?.block ? `${id} (${f.block.type})` : f?.column ? `${id} (column)` : `${id} (section)`;
    });
    lines.push(`Change only these parts, and only their words, links, pictures and looks: ${parts.join(", ")}.`);
  }
  if (turnWith.length) lines.push(`This turn also changes these emails in the same group, so keep the tone and look matching: ${turnWith.map((t) => `${t.name} (subject: ${t.subject || "none"})`).join("; ")}.`);
  return lines.join("\n");
}
