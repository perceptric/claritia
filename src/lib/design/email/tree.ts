// An email's structure, for the canvas's Layout tab and its keys (docs/email-canvas-b2.md sections 2 and 4): the layer
// tree (Body › Container › Section › Column › blocks), reading order for ↑ and ↓, stepping out and in, siblings for
// Tab, moving up and down across columns and sections, and where a dragged layer may land. Pure; runs in the browser
// and on the server.

import { htmlToText } from "./html.ts";
import type { Block, EmailDoc, Section } from "./doc.ts";
import { findEl, moveBlock, moveSection } from "./ops.ts";
import type { BlockType } from "./parts.ts";

export type LayerKind = "body" | "container" | "section" | "column" | BlockType;
export type Layer = {
  /** The element's id; Body and Container are the email's own parts ("email"). */
  id: string;
  /** The email part a click on this row picks (body or content for the email; null picks the element's first part). */
  part: "body" | "content" | null;
  kind: LayerKind;
  /** Its first words, its picture's file name, or nothing. */
  words: string;
  /** A component use's name. */
  component?: string;
  /** Shown only on one screen, or only to some people. */
  only?: "phone" | "desktop";
  when?: boolean;
  /** A section with one column: that column's id (its blocks are listed right under the section). */
  column?: string;
  children: Layer[];
};

export const KIND_LABEL: Record<LayerKind, string> = {
  body: "Body",
  container: "Container",
  section: "Section",
  column: "Column",
  heading: "Heading",
  text: "Text",
  button: "Button",
  image: "Image",
  logo: "Logo",
  divider: "Divider",
  spacer: "Spacer",
  list: "List",
  quote: "Quote",
  social: "Social links",
  video: "Video",
  product: "Product",
  event: "Event",
  meeting: "Meeting button",
  signature: "Signature",
  footer: "Footer",
  html: "HTML",
};

const fileName = (url: string) => decodeURIComponent(url.split(/[?#]/)[0]!.split("/").pop() ?? "");

/** A block's first words (or its picture's file name), as the layer tree shows it. */
export function blockWords(b: Block): string {
  switch (b.type) {
    case "heading":
      return b.text;
    case "text":
      return htmlToText(b.html).replace(/\s+/g, " ").trim();
    case "button":
    case "meeting":
      return b.label;
    case "image":
      return b.alt || fileName(b.src);
    case "logo":
      return b.alt || (b.src ? fileName(b.src) : "");
    case "list":
      return b.items[0] ?? "";
    case "quote":
      return b.text;
    case "social":
      return b.links.length ? `${b.links.length} ${b.links.length === 1 ? "link" : "links"}` : "";
    case "video":
      return b.alt || fileName(b.url);
    case "product":
    case "event":
      return b.title;
    case "signature":
      return b.name;
    case "footer":
      return b.text ?? "";
    case "spacer":
      return `${b.height} px`;
    case "divider":
    case "html":
      return "";
  }
}

const hidden = (x: { hideOn?: "phone" | "desktop"; showIf?: unknown }) => ({ ...(x.hideOn ? { only: x.hideOn === "phone" ? ("desktop" as const) : ("phone" as const) } : {}), ...(x.showIf ? { when: true } : {}) });

/** The layer tree. A section with one column lists its blocks under it; with several, a Column row for each. */
export function layerTree(doc: EmailDoc, componentName?: (id: string) => string | undefined): Layer {
  const sections = doc.sections.map((s) => sectionLayer(s, componentName));
  return { id: "email", part: "body", kind: "body", words: "", children: [{ id: "email", part: "content", kind: "container", words: "", children: sections }] };
}

function sectionLayer(s: Section, componentName?: (id: string) => string | undefined): Layer {
  const blocks = (bs: Block[]): Layer[] => bs.map((b) => ({ id: b.id, part: null, kind: b.type, words: blockWords(b), ...hidden(b), children: [] }));
  const comp = s.component ? componentName?.(s.component.id) : undefined;
  return {
    id: s.id,
    part: null,
    kind: "section",
    words: s.columns.length > 1 ? `${s.columns.length} columns` : "",
    ...(comp ? { component: comp } : {}),
    ...hidden(s),
    ...(s.columns.length === 1 ? { column: s.columns[0]!.id } : {}),
    children: s.columns.length > 1 ? s.columns.map((c, i) => ({ id: c.id, part: null, kind: "column" as const, words: `${i + 1}`, children: blocks(c.blocks) })) : blocks(s.columns[0]?.blocks ?? []),
  };
}

/** Every block in reading order: section by section, column by column. */
export function blocksInOrder(doc: EmailDoc): string[] {
  return doc.sections.flatMap((s) => s.columns.flatMap((c) => c.blocks.map((b) => b.id)));
}

/** The element before or after this one at its own level, in reading order (blocks cross columns and sections). */
export function nextInOrder(doc: EmailDoc, id: string, dir: 1 | -1): string | null {
  const f = findEl(doc, id);
  if (!f) return null;
  if (f.block) {
    const all = blocksInOrder(doc);
    return all[all.indexOf(id) + dir] ?? null;
  }
  if (f.column) {
    const cols = doc.sections.flatMap((s) => (s.columns.length > 1 ? s.columns.map((c) => c.id) : []));
    return cols[cols.indexOf(id) + dir] ?? null;
  }
  return doc.sections[f.si + dir]?.id ?? null;
}

/** One level out: a block to its column (when its section has several) or its section; a section to the email. */
export function parentOf(doc: EmailDoc, id: string): string | null {
  if (id === "email") return null;
  const f = findEl(doc, id);
  if (!f) return null;
  if (f.block) return f.section.columns.length > 1 ? f.column!.id : f.section.id;
  if (f.column) return f.section.id;
  return "email";
}

/** One level in: the email to its first section, a section to its first column (several) or block, a column to its first block. */
export function firstChildOf(doc: EmailDoc, id: string): string | null {
  if (id === "email") return doc.sections[0]?.id ?? null;
  const f = findEl(doc, id);
  if (!f || f.block) return null;
  if (f.column) return f.column.blocks[0]?.id ?? null;
  return f.section.columns.length > 1 ? (f.section.columns[0]?.id ?? null) : (f.section.columns[0]?.blocks[0]?.id ?? null);
}

/** The next or previous element with the same parent, going round (Tab). */
export function siblingOf(doc: EmailDoc, id: string, dir: 1 | -1): string | null {
  const f = findEl(doc, id);
  if (!f) return null;
  const list = f.block ? f.column!.blocks.map((b) => b.id) : f.column ? f.section.columns.map((c) => c.id) : doc.sections.map((s) => s.id);
  const i = list.indexOf(id);
  return list[(i + dir + list.length) % list.length] ?? null;
}

/**
 * Moves a block or section one step up or down. A block at the top or bottom of its column goes to the end of the
 * column before or the start of the column after (across sections); a section swaps with its neighbor.
 */
export function moveStep(doc: EmailDoc, id: string, dir: 1 | -1): EmailDoc {
  const f = findEl(doc, id);
  if (!f) return doc;
  if (!f.block) return f.column ? doc : moveSection(doc, id, f.si + (dir > 0 ? 2 : -1));
  const col = f.column!;
  const inside = dir < 0 ? f.bi! > 0 : f.bi! < col.blocks.length - 1;
  if (inside) return moveBlock(doc, id, { column: col.id, index: f.bi! + (dir > 0 ? 2 : -1) });
  const cols = doc.sections.flatMap((s) => s.columns);
  const ci = cols.findIndex((c) => c.id === col.id);
  const to = cols[ci + dir];
  if (!to) return doc;
  return moveBlock(doc, id, { column: to.id, index: dir > 0 ? 0 : to.blocks.length });
}

/** Where a dragged layer lands: sections only among sections (before index), blocks into a column at an index. */
export type Drop = { section: number } | { column: string; index: number };
export function canDrop(doc: EmailDoc, dragId: string, drop: Drop): boolean {
  const f = findEl(doc, dragId);
  if (!f || (f.column && !f.block)) return false;
  return f.block ? "column" in drop && !!findEl(doc, drop.column)?.column : "section" in drop;
}
export function applyDrop(doc: EmailDoc, dragId: string, drop: Drop): EmailDoc {
  if (!canDrop(doc, dragId, drop)) return doc;
  if ("section" in drop) return moveSection(doc, dragId, drop.section);
  // The index is the slot before the block is taken out; moveBlock accounts for the shift in its own column.
  return moveBlock(doc, dragId, { column: drop.column, index: drop.index });
}

/** The kind of an element, for the canvas's tag and the panel's title. */
export function kindOf(doc: EmailDoc, id: string): LayerKind | "email" | null {
  if (id === "email") return "email";
  const f = findEl(doc, id);
  if (!f) return null;
  return f.block ? f.block.type : f.column ? "column" : "section";
}
