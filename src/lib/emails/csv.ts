// CSV files for Audiences › Import (docs/email-studio-plan.md, the Brew comparison, step 2). Read in the browser: the
// delimiter (comma, semicolon or tab) from the header line, quoted values with commas, quotes and line breaks inside,
// and Excel's byte-order mark. Each column is matched to a field by its header, and a person can change the match.

export type Csv = { head: string[]; rows: string[][] };
export type Field = "email" | "first_name" | "last_name" | "full_name" | "phone" | "custom" | "skip";
export type Person = { email: string; first_name?: string; last_name?: string; phone?: string; fields?: Record<string, string> };

export const FIELD_LABEL: Record<Field, string> = { email: "Email", first_name: "First name", last_name: "Last name", full_name: "Full name", phone: "Phone", custom: "Custom field", skip: "Leave out" };
export const MAX_ROWS = 5000;

export function parseCsv(raw: string): Csv {
  const text = raw.replace(/^﻿/, "");
  const first = text.slice(0, text.search(/\r?\n/) === -1 ? text.length : text.search(/\r?\n/));
  const count = (ch: string) => first.split(ch).length - 1;
  const sep = [",", ";", "\t"].sort((a, b) => count(b) - count(a))[0]!;
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"' && cur.trim() === "") {
      quoted = true;
      cur = "";
    } else if (ch === sep) {
      row.push(cur.trim());
      cur = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur.trim());
      cur = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else cur += ch;
  }
  row.push(cur.trim());
  if (row.some((x) => x !== "")) rows.push(row);
  const head = (rows.shift() ?? []).map((h, i) => h || `Column ${i + 1}`);
  return { head, rows };
}

/** A field for each column from its header; a field already taken goes to the later column as a custom field. */
export function guessFields(head: string[]): Field[] {
  const one = (h: string): Field => {
    const s = h.toLowerCase().replace(/[^a-z]/g, "");
    if (/^(e?mail|emailaddress|mailaddress|workemail|primaryemail)$/.test(s) || (/email/.test(s) && !/opt|consent|status|type/.test(s))) return "email";
    if (/^(firstname|first|givenname|forename|fname)$/.test(s)) return "first_name";
    if (/^(lastname|last|surname|familyname|lname)$/.test(s)) return "last_name";
    if (/^(name|fullname|contactname|clientname)$/.test(s)) return "full_name";
    if (/phone|mobile|cell|tel/.test(s)) return "phone";
    return "custom";
  };
  const seen = new Set<Field>();
  return head.map((h) => {
    const f = one(h);
    if (f !== "custom" && seen.has(f)) return "custom";
    seen.add(f);
    return f;
  });
}

/** A header as a custom field's key: lower case, words joined by _. */
export const fieldKey = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "field";

/** The people in the file, by the picked fields. Rows without an email column value come out with an empty email. */
export function peopleFrom(csv: Csv, fields: Field[]): Person[] {
  return csv.rows.slice(0, MAX_ROWS).map((r) => {
    const p: Person = { email: "" };
    const custom: Record<string, string> = {};
    fields.forEach((f, i) => {
      const v = (r[i] ?? "").trim();
      if (!v) return;
      if (f === "email") p.email = v;
      else if (f === "first_name") p.first_name = v;
      else if (f === "last_name") p.last_name = v;
      else if (f === "phone") p.phone = v;
      else if (f === "full_name") {
        const [a, ...b] = v.split(/\s+/);
        p.first_name ??= a;
        if (b.length) p.last_name ??= b.join(" ");
      } else if (f === "custom") custom[fieldKey(csv.head[i] ?? "")] = v;
    });
    if (Object.keys(custom).length) p.fields = custom;
    return p;
  });
}
