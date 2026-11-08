// The gallery's menus as filters, for the app and the website (docs/form-templates-plan.md Part 1). Picking more than
// one value in a menu widens the results; picking in two menus narrows them. Each count is the number of templates a
// pick would show, given the other menus' picks.

import { TEMPLATES, industryLabel, templateTheme } from "./catalog.ts";
import { CATEGORIES, DOES, FAMILIES, FEATURES, LAYOUTS, LENGTHS, MIN_SHOWN, SUBS, TEAMS, categoryLabel, facetsOf, familyLabel, subLabel, teamLabel, type Facets } from "./taxonomy.ts";
import { INDUSTRIES, type FormTemplate } from "./types.ts";

export type Menu = "family" | "category" | "industry" | "sub" | "team" | "does" | "feature" | "layout" | "length";
export type Picks = Partial<Record<Menu, string[]>>;
export type Sort = "popular" | "new" | "az";

export type MenuValue = { id: string; label: string; parent?: string };
export type MenuDef = {
  id: Menu;
  label: string;
  values: MenuValue[];
  nested?: Menu;
};

/** The menus in order. Category holds its families, Industry its sub-industries. */
export const MENUS: MenuDef[] = [
  {
    id: "family",
    label: "Category",
    values: FAMILIES.map((f) => ({ id: f.id, label: f.label })),
    nested: "category",
  },
  {
    id: "category",
    label: "Category",
    values: CATEGORIES.map((c) => ({
      id: c.id,
      label: c.label,
      parent: c.family,
    })),
  },
  {
    id: "industry",
    label: "Industry",
    values: INDUSTRIES.map((i) => ({ id: i.value, label: i.label })),
    nested: "sub",
  },
  {
    id: "sub",
    label: "Industry",
    values: SUBS.map((s) => ({ id: s.id, label: s.label, parent: s.parent })),
  },
  {
    id: "team",
    label: "Team",
    values: TEAMS.map((t) => ({ id: t.id, label: t.label })),
  },
  {
    id: "does",
    label: "What it does next",
    values: DOES.map((d) => ({ id: d.id, label: d.label })),
  },
  {
    id: "feature",
    label: "Features",
    values: FEATURES.map((f) => ({ id: f.id, label: f.label })),
  },
  {
    id: "layout",
    label: "Layout",
    values: LAYOUTS.map((l) => ({ id: l.id, label: l.label })),
  },
  {
    id: "length",
    label: "Length",
    values: LENGTHS.map((l) => ({ id: l.id, label: l.label })),
  },
];
export const MENU_IDS = MENUS.map((m) => m.id);
export const isMenu = (x: string): x is Menu => (MENU_IDS as string[]).includes(x);

const FACETS = new Map<string, Facets>();
export const facets = (t: FormTemplate): Facets => {
  let f = FACETS.get(t.id);
  if (!f) FACETS.set(t.id, (f = facetsOf(t)));
  return f;
};

/** A template's values in one menu. */
export function valuesIn(t: FormTemplate, m: Menu): string[] {
  const f = facets(t);
  switch (m) {
    case "family":
      return f.families;
    case "category":
      return f.categories;
    case "industry":
      return f.industries;
    case "sub":
      return f.subs;
    case "team":
      return f.teams;
    case "does":
      return f.does;
    case "feature":
      return f.features;
    case "layout":
      return [f.layout];
    case "length":
      return [f.length];
  }
}

/** The label of a value in a menu. */
export function valueLabel(m: Menu, id: string): string {
  if (m === "family") return familyLabel(id);
  if (m === "category") return categoryLabel(id);
  if (m === "industry") return industryLabel(id as never);
  if (m === "sub") return subLabel(id);
  if (m === "team") return teamLabel(id);
  return MENUS.find((x) => x.id === m)?.values.find((v) => v.id === id)?.label ?? id;
}

const flat = (s: string) =>
  s
    .toLowerCase()
    .replace(/[-–—_/]+/g, " ")
    .replace(/\s+/g, " ");

/** Words people type for a thing, beside the words a template uses. */
const ALSO: Record<string, string> = {
  "sign up": "signup register registration join",
  signup: "sign up register",
  register: "registration signup",
  booking: "book appointment schedule",
  appointment: "book booking schedule",
  quote: "estimate price pricing",
  estimate: "quote price pricing",
  survey: "questionnaire poll",
  feedback: "review survey opinion",
  application: "apply",
  waiver: "release liability",
  donation: "donate give",
  order: "buy purchase",
  rsvp: "invite invitation",
  intake: "onboarding new client",
  quiz: "test assessment score",
  scorecard: "assessment score",
};

const HAY = new Map<string, string>();
function hay(t: FormTemplate): string {
  let h = HAY.get(t.id);
  if (h !== undefined) return h;
  const f = facets(t);
  const parts = [
    t.name,
    t.blurb,
    ...f.industries.map((i) => industryLabel(i)),
    ...f.subs.map(subLabel),
    ...f.categories.map(categoryLabel),
    ...f.families.map(familyLabel),
    ...f.teams.map(teamLabel),
    ...t.schema.pages.flatMap((p) => p.fields.map((x) => x.label)),
  ];
  h = flat(parts.join(" "));
  h = `${h} ${Object.entries(ALSO)
    .filter(([k]) => h!.includes(k))
    .map(([, v]) => v)
    .join(" ")}`;
  HAY.set(t.id, h);
  return h;
}

/** Whether the words all appear in the template's name, words, menus or questions. */
export function matchesText(t: FormTemplate, text: string): boolean {
  const words = flat(text).split(" ").filter(Boolean);
  if (!words.length) return true;
  const h = hay(t);
  return words.every((w) => h.includes(w));
}

/** Whether a template fits the picks, leaving one menu out (for that menu's counts). */
function fits(t: FormTemplate, picks: Picks, skip?: Menu): boolean {
  for (const m of MENU_IDS) {
    if (m === skip) continue;
    // Category: a family and a category inside it widen together.
    if (m === "category" && skip === "family") continue;
    if (m === "family" && skip === "category") continue;
    if (m === "sub" && skip === "industry") continue;
    if (m === "industry" && skip === "sub") continue;
    const want = picks[m];
    if (!want?.length) continue;
    if (m === "family" || m === "category") {
      if (!fitsPair(t, picks.family, picks.category, "family", "category")) return false;
      continue;
    }
    if (m === "industry" || m === "sub") {
      if (!fitsPair(t, picks.industry, picks.sub, "industry", "sub")) return false;
      continue;
    }
    const have = valuesIn(t, m);
    if (!want.some((w) => have.includes(w))) return false;
  }
  return true;
}

/** A parent menu and its nested one count as one menu: any picked parent or child is enough. */
function fitsPair(t: FormTemplate, a: string[] | undefined, b: string[] | undefined, ma: Menu, mb: Menu): boolean {
  if (!a?.length && !b?.length) return true;
  const ha = valuesIn(t, ma);
  const hb = valuesIn(t, mb);
  return (a ?? []).some((x) => ha.includes(x)) || (b ?? []).some((x) => hb.includes(x));
}

/** Usage counts from the app (Use template clicks), when it has them. */
export type Usage = Record<string, number>;
/** "Most used" sorts by real use only once a template has this many. */
export const MIN_USES = 25;

export function filterTemplates(picks: Picks, text = "", sort: Sort = "popular", usage: Usage = {}, list: FormTemplate[] = TEMPLATES): FormTemplate[] {
  const out = list.filter((t) => fits(t, picks) && matchesText(t, text));
  if (sort === "az") return [...out].sort((a, b) => a.name.localeCompare(b.name));
  if (sort === "new") return [...out].sort((a, b) => (b.added ?? "").localeCompare(a.added ?? ""));
  const used = (t: FormTemplate) => ((usage[t.id] ?? 0) >= MIN_USES ? usage[t.id]! : 0);
  const ranked = out
    .map((t, i) => ({ t, i }))
    .sort((a, b) => used(b.t) - used(a.t) || Number(!!b.t.featured) - Number(!!a.t.featured) || a.i - b.i)
    .map((x) => x.t);
  // Browsing (no words typed): templates with real use keep their order, the rest are mixed so the grid shows every
  // kind of form. A search keeps its best matches first.
  const n = ranked.findIndex((t) => !used(t));
  return text.trim() || n < 0 ? ranked : [...ranked.slice(0, n), ...mixTemplates(ranked.slice(n))];
}

/** How far ahead the mix looks for a template unlike the last few. */
const MIX_WINDOW = 160;
/** How many cards back the mix compares against. */
const MIX_BACK = 6;

/**
 * The same templates in an order where neighbors differ: a different group, a welcome photo or a plain form in turn,
 * one page, steps and one question at a time, a different style and industry, and features not shown just before
 * (a calculator, a payment, a score, a signature). Earlier templates still come first when they fit. Same input, same order.
 */
export function mixTemplates(list: FormTemplate[]): FormTemplate[] {
  const left = [...list];
  const out: FormTemplate[] = [];
  const photo = (t: FormTemplate) => !!t.schema.cover?.photo;
  while (left.length) {
    const back = out.slice(-MIX_BACK);
    let best = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < Math.min(left.length, MIX_WINDOW); i++) {
      const t = left[i]!;
      const f = facets(t);
      let s = -0.03 * i;
      back.forEach((p, k) => {
        const g = facets(p);
        const near = MIX_BACK - (back.length - 1 - k); // the last card weighs most
        if (g.families[0] === f.families[0]) s -= 1.2 * near;
        if (g.industries[0] === f.industries[0]) s -= 0.6 * near;
        if (templateTheme(p) === templateTheme(t)) s -= 0.5 * near;
        if (g.layout === f.layout && f.layout === "one") s -= 0.15 * near;
      });
      const last = back.slice(-2);
      if (last.length === 2 && last.every((p) => photo(p) === photo(t))) s -= 10;
      else if (last.length && photo(last[last.length - 1]!) === photo(t)) s -= 4;
      // A group missing from the last dozen cards comes back sooner.
      if (!out.slice(-12).some((p) => facets(p).families.includes(f.families[0]!))) s += 3;
      const seen = new Set(back.flatMap((p) => facets(p).features));
      s += Math.min(3, f.features.filter((x) => !seen.has(x)).length) * 0.8;
      if (s > bestScore) {
        bestScore = s;
        best = i;
      }
    }
    out.push(left.splice(best, 1)[0]!);
  }
  return out;
}

/** For each menu value: how many templates picking it would show, given the other menus and the words. */
export function menuCounts(picks: Picks, text = "", list: FormTemplate[] = TEMPLATES): Record<Menu, Record<string, number>> {
  const out = Object.fromEntries(MENU_IDS.map((m) => [m, {} as Record<string, number>])) as Record<Menu, Record<string, number>>;
  const texted = text ? list.filter((t) => matchesText(t, text)) : list;
  for (const m of MENU_IDS) {
    for (const t of texted) {
      if (!fits(t, picks, m)) continue;
      for (const v of valuesIn(t, m)) out[m][v] = (out[m][v] ?? 0) + 1;
    }
  }
  return out;
}

/** How many templates in the whole catalog have each value. */
export function totals(list: FormTemplate[] = TEMPLATES): Record<Menu, Record<string, number>> {
  return menuCounts({}, "", list);
}

/** The values a menu shows: MIN_SHOWN or more templates in the whole catalog. */
export function shownValues(m: Menu, list: FormTemplate[] = TEMPLATES): MenuValue[] {
  const all = totals(list)[m];
  return (MENUS.find((x) => x.id === m)?.values ?? []).filter((v) => (all[v.id] ?? 0) >= MIN_SHOWN);
}

/** Picks as a query string (?category=waiver,consent&team=hr) and back. */
export function picksToQuery(p: Picks): string {
  const q = new URLSearchParams();
  for (const m of MENU_IDS) if (p[m]?.length) q.set(m, p[m]!.join(","));
  return q.toString();
}
export function picksFromQuery(q: URLSearchParams): Picks {
  const p: Picks = {};
  for (const m of MENU_IDS) {
    const v = q.get(m);
    if (!v) continue;
    const ok = new Set((MENUS.find((x) => x.id === m)?.values ?? []).map((x) => x.id));
    const list = v.split(",").filter((x) => ok.has(x));
    if (list.length) p[m] = list;
  }
  return p;
}
