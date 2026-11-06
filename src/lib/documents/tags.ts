// Documents from a fill (docs/integrations-plan.md, Next step 11): {{Question label}} tags in a team's template are
// filled with the fill's answers, plus {{email}}, {{name}} and {{date}}. A tag with no answer is left blank and listed,
// so the delivery can say which. Runs anywhere.

/** One fill as a document gets it: the person, and each answer by its question's label. */
export type DocFill = { id: string; at: string; form: string; email: string | null; name: string | null; fields: { label: string; key: string; value: string }[] };

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
export const TAG = /\{\{\s*([^{}]{1,200}?)\s*\}\}/g;

/** The value for each tag a fill can fill: its labels and keys, and the three it always has. */
export function tagValues(f: DocFill): Map<string, string> {
  const m = new Map<string, string>();
  for (const x of f.fields) {
    if (!m.has(norm(x.label))) m.set(norm(x.label), x.value);
    if (!m.has(norm(x.key))) m.set(norm(x.key), x.value);
  }
  m.set("email", f.email ?? "");
  m.set("name", f.name ?? "");
  m.set("date", f.at.slice(0, 10));
  return m;
}

/** Fill a text's tags; `missing` collects the tags that had no answer (left blank). */
export function fillTags(text: string, values: Map<string, string>, missing: Set<string>): string {
  return text.replace(TAG, (_m, k: string) => {
    const v = values.get(norm(k));
    if (v === undefined || v === "") missing.add(k.trim());
    return v ?? "";
  });
}

/** The note a delivery keeps for the tags left blank. */
export const missingNote = (missing: Set<string>) => (missing.size ? [`No answer for ${[...missing].map((t) => `{{${t}}}`).join(", ")}; left blank.`] : []);

/** A document's name: the form and the person (or the fill's day). */
export const docName = (f: DocFill) => `${f.form} - ${f.name || f.email || f.at.slice(0, 10)}`.slice(0, 200);
