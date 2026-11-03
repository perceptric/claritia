// Checks new gallery templates before they join the catalog (docs/form-templates-plan.md Part 9).
// Run: node scripts/check-templates.ts src/lib/forms/gallery/templates/<file>.ts <EXPORT_NAME> [id,id]
// With ids, only those templates are checked (the rest of the file still counts as this file).
// Each template must pass the form check in its own style, have real menus, ask for an email when it's a lead form,
// score when it's a quiz, and not repeat another template's questions in a category or reuse an id.
import { TEMPLATES, withMenus } from "../src/lib/forms/gallery/catalog.ts";
import { templateForm } from "../src/lib/forms/gallery/convert.ts";
import { pathProblems } from "../src/lib/forms/gallery/paths.ts";
import { isCategory, isSub, isTeam, subParent } from "../src/lib/forms/gallery/taxonomy.ts";
import { themeById, THEMES } from "../src/lib/forms/gallery/themes.ts";
import { INDUSTRIES, type FormTemplate } from "../src/lib/forms/gallery/types.ts";
import { allFields, checkForm } from "../src/lib/forms/schema.ts";

const [file, name, only] = process.argv.slice(2);
if (!file || !name) throw new Error("Usage: node scripts/check-templates.ts <file> <EXPORT_NAME>");
const mod = (await import(new URL(`../${file}`, import.meta.url).href)) as Record<string, FormTemplate[]>;
if (!Array.isArray(mod[name])) throw new Error(`${file} has no export ${name}`);
const all = mod[name].map(withMenus);
const pick = only ? new Set(only.split(",")) : null;
const list = pick ? all.filter((t) => pick.has(t.id)) : all;
if (pick && list.length !== pick.size) throw new Error(`not in ${name}: ${[...pick].filter((x) => !list.some((t) => t.id === x)).join(", ")}`);

const problems: string[] = [];
const bad = (t: FormTemplate, m: string) => problems.push(`${t.id}: ${m}`);
// The rest of the catalog: everything outside this file, so the file can be checked before and after it joins.
const fileIds = new Set(all.map((t) => t.id));
const others = TEMPLATES.filter((t) => !fileIds.has(t.id));
const ids = new Set(others.map((t) => t.id));
const seen = new Map<string, string>();
for (const t of others) {
  const qs = t.schema.pages.flatMap((p) => p.fields.map((f) => f.label.toLowerCase())).join("|");
  for (const c of t.categories ?? []) seen.set(`${c}:${qs}`, t.id);
}
const mine = new Set<string>();
for (const t of list) {
  if (ids.has(t.id)) bad(t, "the id is taken");
  if (mine.has(t.id)) bad(t, "the id repeats in this file");
  mine.add(t.id);
  if (!/^[a-z_]+\.[a-z0-9-]+$/.test(t.id)) bad(t, "ids look like industry.name-in-dashes");
  if (!INDUSTRIES.some((x) => x.value === t.industry)) bad(t, `unknown industry ${t.industry}`);
  if (t.id.split(".")[0] !== t.industry) bad(t, "the id starts with its industry");
  const cats = t.categories ?? [];
  if (cats.length < 1 || cats.length > 3) bad(t, "1 to 3 categories");
  for (const c of cats) if (!isCategory(c)) bad(t, `unknown category ${c}`);
  const teams = t.teams ?? [];
  if (teams.length < 1 || teams.length > 3) bad(t, "1 to 3 teams");
  for (const x of teams) if (!isTeam(x)) bad(t, `unknown team ${x}`);
  for (const s of t.subs ?? []) {
    if (!isSub(s)) bad(t, `unknown sub-industry ${s}`);
    else if (![t.industry, ...(t.also ?? [])].includes(subParent(s)!)) bad(t, `${s} belongs to ${subParent(s)}, not ${t.industry}`);
  }
  if (t.blurb.length > 80) bad(t, "keep the blurb under 80 characters");
  if (/[\u{1F300}-\u{1FAFF}]/u.test(JSON.stringify(t))) bad(t, "no emoji");
  for (const th of [themeById("paper"), ...THEMES.slice(0, 3)]) {
    const r = checkForm(JSON.parse(JSON.stringify(templateForm(t, th))));
    if ("errors" in r) {
      bad(t, `form check: ${r.errors.join("; ")}`);
      break;
    }
  }
  const f = templateForm(t);
  const n = t.schema.pages.flatMap((p) => p.fields);
  if (t.tags.includes("lead") && !t.internal && !allFields(f).find((x) => x.key === "email")?.required) bad(t, "a lead form asks for a required email (email())");
  if (t.tags.includes("quiz") && !t.schema.end.score?.length && !n.some((x) => x.kind === "calc")) bad(t, "a quiz has score bands in end.score");
  if (t.schema.end.score?.length && !n.some((x) => x.points?.length)) bad(t, "score bands need points on the choices");
  for (const p of t.schema.pages) if (p.fields.length > 14) bad(t, "at most 14 fields on a page");
  for (const m of pathProblems(t)) bad(t, m);
  if (t.schema.pages.length > 1 && t.schema.pages.some((p) => !p.title)) bad(t, "every page of a multi-page form has a title");
  if (t.schema.pages.length > 8) bad(t, "at most 8 pages");
  if (n.filter((x) => x.kind === "payment").length > 1) bad(t, "one payment per form");
  const qs = n.map((x) => x.label.toLowerCase()).join("|");
  for (const c of cats) {
    const k = `${c}:${qs}`;
    if (seen.has(k)) bad(t, `asks the same questions as ${seen.get(k)} in ${c}`);
    seen.set(k, t.id);
  }
}
if (problems.length) {
  console.log(problems.join("\n"));
  process.exit(1);
}
console.log(`${list.length} templates pass`);
