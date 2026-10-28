// Components (docs/design-system.md Part 2.4): a section saved once and used in many emails. A use links to the
// component, so changing the component (and publishing styles) changes every email that uses it on its next build;
// sends already made keep their frozen HTML. A use can change the words, links and pictures the component allows
// (props), unless it's locked. Detach turns a use into an ordinary section. Pure functions, tested in
// tests/email-design.test.ts.

import { LIMITS, newClassId, type DesignSystem, type EmailComponent, type EmailStyles } from "../model.ts";
import { cleanHtml } from "./html.ts";
import { newEmailId, PROP_KEYS, readBlock, type Block, type Column, type EmailDoc, type Section } from "./doc.ts";
import { findEl } from "./ops.ts";

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const components = (s: DesignSystem) => s.email?.components ?? [];

/** A short id from two others, the same every time: a use's copy of a component block. */
export function copyId(sectionId: string, blockId: string): string {
  let h = 2166136261;
  for (const ch of `${sectionId}/${blockId}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return `k${h.toString(36)}`;
}

/** A component's block with a use's props put in, read back safely. */
function withProps(b: Block, props: Record<string, string> | undefined, locked: boolean): Block {
  if (!props || locked) return b;
  const allowed = PROP_KEYS[b.type] ?? [];
  const patch = Object.fromEntries(Object.entries(props).filter(([k]) => allowed.includes(k)).map(([k, v]) => [k, k === "html" ? cleanHtml(v, "rich") : v]));
  return readBlock({ ...b, ...patch }, new Set(), false) ?? b;
}

/**
 * The email with each component use filled in from its component: fresh ids for the copies, the use's props, and
 * the component's styles and classes under those ids. A use whose component is gone keeps its last copy.
 */
export function expandComponents(doc: EmailDoc, system: DesignSystem): EmailDoc {
  if (!doc.sections.some((s) => s.component && !s.component.edit)) return doc;
  const next = clone(doc);
  for (const s of next.sections) {
    const use = s.component;
    if (!use || use.edit) continue;
    const comp = components(system).find((c) => c.id === use.id);
    if (!comp) continue;
    s.columns = comp.columns.map((c) => ({
      id: copyId(s.id, c.id),
      width: c.width,
      blocks: c.blocks.map((b) => ({ ...withProps(b, use.props?.[b.id], !!comp.locked), id: copyId(s.id, b.id) })),
    }));
    s.stackOnPhone = comp.stackOnPhone;
    for (const c of comp.columns)
      for (const el of [c.id, ...c.blocks.map((b) => b.id)]) {
        const st = comp.styles?.[el];
        const cl = comp.classes?.[el];
        if (st) (next.styles ??= {})[copyId(s.id, el)] = clone(st);
        if (cl) (next.classes ??= {})[copyId(s.id, el)] = [...cl];
      }
  }
  return next;
}

/** Save a section as a new component and make the section a use of it. */
export function saveAsComponent(e: { system: DesignSystem; doc: EmailDoc }, sectionId: string, name: string): { system: DesignSystem; doc: EmailDoc } | { error: string } {
  const clean = name.trim().slice(0, LIMITS.nameLen);
  if (!clean) return { error: "Name the component." };
  const list = components(e.system);
  if (list.length >= 100) return { error: "This design system has 100 components." };
  if (list.some((c) => c.name.toLowerCase() === clean.toLowerCase())) return { error: "Another component has that name." };
  const s = e.doc.sections.find((x) => x.id === sectionId);
  if (!s) return { error: "Pick a section." };
  if (s.columns.some((c) => c.blocks.some((b) => b.type === "html"))) return { error: "Components can't hold HTML blocks." };
  const ids = s.columns.flatMap((c) => [c.id, ...c.blocks.map((b) => b.id)]);
  const pick = <T>(m: Record<string, T> | undefined) => Object.fromEntries(ids.filter((i) => m?.[i]).map((i) => [i, clone(m![i]!)])) as Record<string, T>;
  const styles = pick<EmailStyles>(e.doc.styles);
  const classes = pick<string[]>(e.doc.classes);
  const id = newClassId({ ...e.system, classes: [...e.system.classes, ...list.map((c) => ({ id: c.id, name: c.name, styles: {} }))] });
  const comp: EmailComponent = { id, name: clean, columns: clone(s.columns), stackOnPhone: s.stackOnPhone, ...(Object.keys(styles).length ? { styles } : {}), ...(Object.keys(classes).length ? { classes } : {}) };
  const em = e.system.email ?? { globals: {}, classes: [] };
  const system: DesignSystem = { ...e.system, email: { ...em, components: [...list, comp] } };
  const doc = clone(e.doc);
  const ds = doc.sections.find((x) => x.id === sectionId)!;
  ds.component = { id };
  for (const i of ids) {
    delete doc.styles?.[i];
    delete doc.classes?.[i];
  }
  // The section's own blocks now come from the component under fresh ids; its copy stays for the case it's deleted.
  ds.columns = comp.columns.map((c) => ({ id: copyId(ds.id, c.id), width: c.width, blocks: c.blocks.map((b) => ({ ...b, id: copyId(ds.id, b.id) })) }));
  return { system, doc: tidy(doc) };
}

/** Put a use of a component in as a new section at a place. */
export function insertComponent(doc: EmailDoc, system: DesignSystem, componentId: string, at: number): { doc: EmailDoc; id: string } | null {
  const comp = components(system).find((c) => c.id === componentId);
  if (!comp) return null;
  const id = newEmailId();
  const section: Section = { id, stackOnPhone: comp.stackOnPhone, component: { id: comp.id }, columns: comp.columns.map((c) => ({ id: copyId(id, c.id), width: c.width, blocks: c.blocks.map((b) => ({ ...b, id: copyId(id, b.id) })) })) };
  const next = clone(doc);
  next.sections.splice(Math.max(0, Math.min(at, next.sections.length)), 0, section);
  return { doc: next, id };
}

/** Change one prop of a use (a block's words, link or picture), by the component's block id. "" puts it back. */
export function setProp(doc: EmailDoc, sectionId: string, blockId: string, key: string, value: string): EmailDoc {
  const next = clone(doc);
  const s = next.sections.find((x) => x.id === sectionId);
  if (!s?.component) return doc;
  const props = (s.component.props ??= {});
  const p = (props[blockId] ??= {});
  if (value === "") delete p[key];
  else p[key] = value;
  if (!Object.keys(p).length) delete props[blockId];
  if (!Object.keys(props).length) delete s.component.props;
  return next;
}

/** Turn a use into an ordinary section: its blocks, props and styles copied in. */
export function detach(doc: EmailDoc, system: DesignSystem, sectionId: string): EmailDoc {
  const s = doc.sections.find((x) => x.id === sectionId);
  if (!s?.component) return doc;
  const one = { ...doc, sections: [s] };
  const expanded = expandComponents(one, system);
  const next = clone(doc);
  const i = next.sections.findIndex((x) => x.id === sectionId);
  const { component: _c, ...plain } = expanded.sections[0]!;
  void _c;
  next.sections[i] = plain;
  for (const c of plain.columns)
    for (const el of [c.id, ...c.blocks.map((b) => b.id)]) {
      if (expanded.styles?.[el]) (next.styles ??= {})[el] = expanded.styles[el]!;
      if (expanded.classes?.[el]) (next.classes ??= {})[el] = expanded.classes[el]!;
    }
  return tidy(next);
}

/** Start changing a component in place: the use becomes editable blocks, mapped back to the component's ids. */
export function startEdit(doc: EmailDoc, system: DesignSystem, sectionId: string): EmailDoc {
  const s = doc.sections.find((x) => x.id === sectionId);
  const comp = s?.component && components(system).find((c) => c.id === s.component!.id);
  if (!s || !comp) return doc;
  const map: Record<string, string> = {};
  for (const c of comp.columns) for (const el of [c.id, ...c.blocks.map((b) => b.id)]) map[copyId(s.id, el)] = el;
  // Without the use's props: the component itself is being changed.
  const base = expandComponents({ ...doc, sections: [{ ...s, component: { id: comp.id } }] }, system);
  const next = clone(doc);
  const i = next.sections.findIndex((x) => x.id === sectionId);
  next.sections[i] = { ...base.sections[0]!, component: { ...s.component!, edit: map } };
  for (const id of Object.keys(map)) {
    if (base.styles?.[id]) (next.styles ??= {})[id] = base.styles[id]!;
    else delete next.styles?.[id];
    if (base.classes?.[id]) (next.classes ??= {})[id] = base.classes[id]!;
    else delete next.classes?.[id];
  }
  return tidy(next);
}

/** Save the changes back to the component (every use gets them) and link the section again. */
export function finishEdit(e: { system: DesignSystem; doc: EmailDoc }, sectionId: string): { system: DesignSystem; doc: EmailDoc } {
  const s = e.doc.sections.find((x) => x.id === sectionId);
  const map = s?.component?.edit;
  const list = components(e.system);
  const comp = s?.component && list.find((c) => c.id === s.component!.id);
  if (!s || !map || !comp) return e;
  const back = (id: string) => map[id] ?? id;
  const columns: Column[] = s.columns.map((c) => ({ id: back(c.id), width: c.width, blocks: c.blocks.filter((b) => b.type !== "html").map((b) => ({ ...b, id: back(b.id) })) }));
  const styles: Record<string, EmailStyles> = {};
  const classes: Record<string, string[]> = {};
  for (const c of s.columns)
    for (const el of [c.id, ...c.blocks.map((b) => b.id)]) {
      if (e.doc.styles?.[el]) styles[back(el)] = clone(e.doc.styles[el]!);
      if (e.doc.classes?.[el]) classes[back(el)] = [...e.doc.classes[el]!];
    }
  const updated: EmailComponent = { ...comp, columns, stackOnPhone: s.stackOnPhone, styles, classes };
  if (!Object.keys(styles).length) delete updated.styles;
  if (!Object.keys(classes).length) delete updated.classes;
  const system: DesignSystem = { ...e.system, email: { ...(e.system.email ?? { globals: {}, classes: [] }), components: list.map((c) => (c.id === comp.id ? updated : c)) } };
  return { system, doc: relink(e.doc, sectionId, system) };
}

/** Leave editing without saving: the use is linked again as it was. */
export function cancelEdit(doc: EmailDoc, system: DesignSystem, sectionId: string): EmailDoc {
  return relink(doc, sectionId, system);
}

function relink(doc: EmailDoc, sectionId: string, system: DesignSystem): EmailDoc {
  const next = clone(doc);
  const s = next.sections.find((x) => x.id === sectionId);
  if (!s?.component) return doc;
  for (const c of s.columns)
    for (const el of [c.id, ...c.blocks.map((b) => b.id)]) {
      delete next.styles?.[el];
      delete next.classes?.[el];
    }
  const { edit: _e, ...use } = s.component;
  void _e;
  s.component = use;
  const comp = components(system).find((c) => c.id === use.id);
  if (comp) s.columns = comp.columns.map((c) => ({ id: copyId(s.id, c.id), width: c.width, blocks: c.blocks.map((b) => ({ ...b, id: copyId(s.id, b.id) })) }));
  return tidy(next);
}

/** Delete a component; its uses keep their last copy and become ordinary sections. */
export function deleteComponent(e: { system: DesignSystem; doc: EmailDoc }, componentId: string): { system: DesignSystem; doc: EmailDoc } {
  let doc = e.doc;
  for (const s of e.doc.sections) if (s.component?.id === componentId) doc = detach(doc, e.system, s.id);
  const em = e.system.email ?? { globals: {}, classes: [] };
  return { system: { ...e.system, email: { ...em, components: components(e.system).filter((c) => c.id !== componentId) } }, doc };
}

export function lockComponent(system: DesignSystem, componentId: string, locked: boolean): DesignSystem {
  const em = system.email ?? { globals: {}, classes: [] };
  return { ...system, email: { ...em, components: components(system).map((c) => (c.id === componentId ? { ...c, ...(locked ? { locked: true } : { locked: undefined }) } : c)) } };
}

/** The use a picked element belongs to, if any: its section, component and the component's block id. */
export function componentUseOf(doc: EmailDoc, system: DesignSystem, id: string): { section: Section; component: EmailComponent; blockId?: string } | null {
  const f = findEl(doc, id);
  const s = f?.section;
  if (!s?.component || s.component.edit) return null;
  const component = components(system).find((c) => c.id === s.component!.id);
  if (!component) return null;
  const blockId = f?.block ? component.columns.flatMap((c) => c.blocks).find((b) => copyId(s.id, b.id) === id)?.id : undefined;
  return { section: s, component, ...(blockId ? { blockId } : {}) };
}

function tidy(doc: EmailDoc): EmailDoc {
  if (doc.styles && !Object.keys(doc.styles).length) delete doc.styles;
  if (doc.classes && !Object.keys(doc.classes).length) delete doc.classes;
  return doc;
}
