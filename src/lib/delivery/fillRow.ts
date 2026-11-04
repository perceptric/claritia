// A form fill as a row (docs/integrations-plan.md step 2), for Google Sheets, Airtable and Notion: the same cells as
// the CSV export (src/lib/forms/results.ts), a question by its label, a choice by its label, a file by its name.
// Where the fill came from (the channel, page, referrer, UTM and click ids) adds its columns only when the fill has them.

import { answerText, fillColumns, META_KEYS } from "../forms/results.ts";
import type { Form } from "../forms/schema.ts";
import { channelLabel } from "../share/channels.ts";
import type { FillRow } from "../sources/types.ts";

export function fillRow(fill: { id: string; created_at: string; values: Record<string, unknown>; hidden: Record<string, string> | null }, form: { name: string; body: Form | null }): FillRow {
  const cols = form.body ? fillColumns([{ version: 0, body: form.body }]) : [];
  const used = new Set<string>(["Sent at", "Fill ID", "Form"]);
  // Two questions with one label stay two columns.
  const name = (label: string) => {
    let n = label.trim().slice(0, 100) || "Question";
    for (let i = 2; used.has(n); i++) n = `${label.trim().slice(0, 95)} (${i})`;
    used.add(n);
    return n;
  };
  const cells = cols.map((c) => ({ name: name(c.label), value: answerText(c, fill.values?.[c.key]) }));
  for (const k of META_KEYS) {
    const v = fill.hidden?.[k];
    // Where it came from reads as words in a sheet: "Came from: QR code".
    if (k === "channel") {
      if (channelLabel(v)) cells.push({ name: name("Came from"), value: channelLabel(v) });
      continue;
    }
    if (typeof v === "string" && v.trim()) cells.push({ name: name(k), value: v.trim().slice(0, 2000) });
  }
  return { id: fill.id, at: new Date(fill.created_at).toISOString(), form: form.name, cells };
}
