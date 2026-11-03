// Changes to an email document's structure (docs/design-system.md Part 4.1): add, move, copy and remove blocks and
// sections, change a section's columns, and change one block's content. Each returns a new document and leaves the
// input alone, so the builder's undo keeps whole copies. Everything a person or the AI changes goes through these,
// then readEmailDoc on save.

import { EMAIL_LIMITS, newEmailId, newSection, type Block, type Column, type EmailDoc, type Section } from "./doc.ts";

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const blockCount = (doc: EmailDoc) => doc.sections.reduce((n, s) => n + s.columns.reduce((m, c) => m + c.blocks.length, 0), 0);

/** Where an element is: its section, column and place. */
export function findEl(doc: EmailDoc, id: string): { section: Section; si: number; column?: Column; ci?: number; block?: Block; bi?: number } | null {
  for (const [si, section] of doc.sections.entries()) {
    if (section.id === id) return { section, si };
    for (const [ci, column] of section.columns.entries()) {
      if (column.id === id) return { section, si, column, ci };
      const bi = column.blocks.findIndex((b) => b.id === id);
      if (bi >= 0) return { section, si, column, ci, block: column.blocks[bi], bi };
    }
  }
  return null;
}

/** A copy with every id new, so a copy never shares styles or ids with what it came from. */
function fresh<T extends { id: string }>(x: T, styles: Record<string, unknown>, classes: Record<string, string[]>, doc: EmailDoc): T {
  const c = clone(x) as T & { columns?: Column[]; blocks?: Block[] };
  const map = (old: string) => {
    const id = newEmailId();
    if (doc.styles?.[old]) styles[id] = clone(doc.styles[old]);
    if (doc.classes?.[old]) classes[id] = [...doc.classes[old]];
    return id;
  };
  c.id = map(x.id);
  for (const col of c.columns ?? []) {
    col.id = map(col.id);
    for (const b of col.blocks) b.id = map(b.id);
  }
  for (const b of c.blocks ?? []) b.id = map(b.id);
  return c;
}

export type Place = { column: string; index: number } | { section: number };

/** Add a block in a column at a place, or as a new section at a place. */
export function addBlock(doc: EmailDoc, block: Block, at: Place): EmailDoc {
  if (blockCount(doc) >= EMAIL_LIMITS.blocks) return doc;
  const next = clone(doc);
  if ("section" in at) {
    if (next.sections.length >= EMAIL_LIMITS.sections) return doc;
    next.sections.splice(Math.max(0, Math.min(at.section, next.sections.length)), 0, newSection([block]));
    return next;
  }
  const f = findEl(next, at.column);
  if (!f?.column) return doc;
  f.column.blocks.splice(Math.max(0, Math.min(at.index, f.column.blocks.length)), 0, block);
  return next;
}

/** Move a block to a column and place (counted before it's taken out). */
export function moveBlock(doc: EmailDoc, id: string, at: Place): EmailDoc {
  const f = findEl(doc, id);
  if (!f?.block || !f.column) return doc;
  let next = clone(doc);
  const from = findEl(next, id)!;
  const [block] = from.column!.blocks.splice(from.bi!, 1);
  if ("section" in at) return addBlock(next, block!, at);
  // Moving down inside the same column: the place shifts by the one taken out.
  const index = at.column === f.column.id && at.index > f.bi! ? at.index - 1 : at.index;
  next = addBlock(next, block!, { column: at.column, index });
  return next;
}

export function moveSection(doc: EmailDoc, id: string, to: number): EmailDoc {
  const si = doc.sections.findIndex((s) => s.id === id);
  if (si < 0) return doc;
  const next = clone(doc);
  const [s] = next.sections.splice(si, 1);
  next.sections.splice(Math.max(0, Math.min(to > si ? to - 1 : to, next.sections.length)), 0, s!);
  return next;
}

/** Remove a block, column's content, or section, with its styles and classes. */
export function removeEl(doc: EmailDoc, id: string): EmailDoc {
  const f = findEl(doc, id);
  if (!f) return doc;
  const next = clone(doc);
  const g = findEl(next, id)!;
  const gone: string[] = [];
  if (g.block) {
    g.column!.blocks.splice(g.bi!, 1);
    gone.push(id);
  } else if (!g.column) {
    next.sections.splice(g.si, 1);
    gone.push(g.section.id, ...g.section.columns.flatMap((c) => [c.id, ...c.blocks.map((b) => b.id)]));
  } else return doc;
  for (const x of gone) {
    delete next.styles?.[x];
    delete next.classes?.[x];
  }
  if (next.styles && !Object.keys(next.styles).length) delete next.styles;
  if (next.classes && !Object.keys(next.classes).length) delete next.classes;
  return next;
}

/** Copy a block or section right after itself; returns the copy's id too. */
export function duplicateEl(doc: EmailDoc, id: string): { doc: EmailDoc; id: string | null } {
  const f = findEl(doc, id);
  if (!f || (f.column && !f.block) || blockCount(doc) >= EMAIL_LIMITS.blocks) return { doc, id: null };
  const next = clone(doc);
  const styles = (next.styles ??= {}) as Record<string, unknown>;
  const classes = (next.classes ??= {});
  const g = findEl(next, id)!;
  let copyId: string;
  if (g.block) {
    const c = fresh(g.block, styles, classes, doc);
    g.column!.blocks.splice(g.bi! + 1, 0, c);
    copyId = c.id;
  } else {
    if (next.sections.length >= EMAIL_LIMITS.sections) return { doc, id: null };
    const c = fresh(g.section, styles, classes, doc);
    next.sections.splice(g.si + 1, 0, c);
    copyId = c.id;
  }
  if (!Object.keys(next.styles!).length) delete next.styles;
  if (!Object.keys(next.classes!).length) delete next.classes;
  return { doc: next, id: copyId };
}

/** Change one block's content (not its id or type). */
export function updateBlock(doc: EmailDoc, id: string, patch: Partial<Block>): EmailDoc {
  const f = findEl(doc, id);
  if (!f?.block) return doc;
  const next = clone(doc);
  const g = findEl(next, id)!;
  const { id: _i, type: _t, ...rest } = patch as Record<string, unknown>;
  void _i;
  void _t;
  g.column!.blocks[g.bi!] = { ...g.block!, ...rest } as Block;
  return next;
}

export function updateSection(doc: EmailDoc, id: string, patch: Partial<Pick<Section, "stackOnPhone" | "hideOn" | "showIf">>): EmailDoc {
  const next = clone(doc);
  const s = next.sections.find((x) => x.id === id);
  if (!s) return doc;
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === null) delete (s as Record<string, unknown>)[k];
    else (s as Record<string, unknown>)[k] = v;
  }
  return next;
}

/**
 * A section's columns: 1 to 4, with widths. Blocks from columns that go away move into the last one kept, so
 * nothing written is lost.
 */
export function setColumns(doc: EmailDoc, id: string, widths: number[]): EmailDoc {
  const ws = widths.slice(0, EMAIL_LIMITS.columns).map((w) => Math.max(10, Math.round(w)));
  if (!ws.length) return doc;
  const next = clone(doc);
  const s = next.sections.find((x) => x.id === id);
  if (!s) return doc;
  const total = ws.reduce((a, b) => a + b, 0);
  const cols: Column[] = ws.map((w, i) => ({ id: s.columns[i]?.id ?? newEmailId(), width: Math.round((w / total) * 100), blocks: s.columns[i]?.blocks ?? [] }));
  for (const extra of s.columns.slice(ws.length)) cols[cols.length - 1]!.blocks.push(...extra.blocks);
  cols[cols.length - 1]!.width = 100 - cols.slice(0, -1).reduce((n, c) => n + c.width, 0);
  s.columns = cols;
  return next;
}

export function setSettings(doc: EmailDoc, patch: Partial<EmailDoc["settings"]>): EmailDoc {
  return { ...doc, settings: { ...doc.settings, ...patch } };
}
