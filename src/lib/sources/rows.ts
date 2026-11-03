// Sheets and databases (docs/integrations-plan.md step 2): a row per form fill in Google Sheets, Airtable or Notion.
// The first columns are Sent at, Fill ID and Form, then one per question by its label; a question added later adds a
// column at the end, and nothing already there moves. A delivery that runs again (it may have landed before a
// timeout) looks for its Fill ID first, so it never adds a second row. Values go in as plain text (Sheets' RAW), so an
// answer that starts with "=" stays text and never runs as a formula. Endpoints "check" against a real account.

import { AuthError, RateLimited, type Connector, type Ctx, type FillRow, type RowTarget } from "./types.ts";

export const FIXED = ["Sent at", "Fill ID", "Form"] as const;
/** A fill's row as ordered name and value pairs: the fixed columns, then the questions. */
export const rowCells = (row: FillRow) => [
  { name: "Sent at", value: row.at },
  { name: "Fill ID", value: row.id },
  { name: "Form", value: row.form },
  ...row.cells,
];

const enc = encodeURIComponent;
/** A sheet tab's A1 name: quoted, with its own quotes doubled. */
const tab = (sheet: string) => `'${sheet.replace(/'/g, "''")}'`;
/** Column number (0-based) to its letters: 0 → A, 26 → AA. */
export function colName(i: number): string {
  let n = i + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// Google Sheets ------------------------------------------------------------------------------------------------

const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";

/** A new spreadsheet for a form, with one tab, its header row written. */
export async function createSheet(ctx: Ctx, title: string): Promise<RowTarget> {
  const d = await ctx.api<{ spreadsheetId: string; spreadsheetUrl: string; sheets: { properties: { title: string } }[] }>(SHEETS, {
    method: "POST",
    body: JSON.stringify({ properties: { title: title.slice(0, 200) || "Claritia" }, sheets: [{ properties: { title: "Fills", gridProperties: { frozenRowCount: 1 } } }] }),
  });
  const sheet = d.sheets?.[0]?.properties.title ?? "Fills";
  await ctx.api(`${SHEETS}/${d.spreadsheetId}/values/${enc(`${tab(sheet)}!A1`)}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values: [[...FIXED]] }) });
  return { id: d.spreadsheetId, name: title, url: d.spreadsheetUrl, sheet };
}

/** A spreadsheet from its link (or id): its name, address and first tab. */
export async function sheetFromLink(ctx: Ctx, link: string): Promise<RowTarget> {
  const id = /\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/.exec(link)?.[1] ?? (/^[A-Za-z0-9_-]{20,}$/.test(link.trim()) ? link.trim() : null);
  if (!id) throw new Error("Paste the spreadsheet's link from your browser.");
  const d = await ctx.api<{ properties: { title: string }; spreadsheetUrl: string; sheets: { properties: { title: string } }[] }>(`${SHEETS}/${id}?fields=properties.title,spreadsheetUrl,sheets.properties.title`);
  return { id, name: d.properties.title, url: d.spreadsheetUrl, sheet: d.sheets?.[0]?.properties.title ?? "Sheet1" };
}

export const googleSheets: Connector = {
  kind: "google_sheets",
  objects: [],
  gapMs: 250,
  async account(ctx) {
    const d = await ctx.api<{ id: string; email: string }>("https://www.googleapis.com/oauth2/v2/userinfo");
    return { id: d.id, label: d.email };
  },
  async append(ctx, target, row, o) {
    const sheet = target.sheet || "Sheet1";
    const base = `${SHEETS}/${target.id}/values`;
    // The header row; columns the questions need are added at its end.
    const head = (await ctx.api<{ values?: string[][] }>(`${base}/${enc(`${tab(sheet)}!1:1`)}`)).values?.[0] ?? [];
    const cells = rowCells(row);
    const header = [...head];
    for (const c of cells) if (!header.includes(c.name)) header.push(c.name);
    if (header.length !== head.length) await ctx.api(`${base}/${enc(`${tab(sheet)}!A1`)}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values: [header] }) });
    // Run again: the fill may be there already (its Fill ID in its column).
    const idCol = colName(header.indexOf("Fill ID"));
    if (o.retry) {
      const ids = (await ctx.api<{ values?: string[][] }>(`${base}/${enc(`${tab(sheet)}!${idCol}:${idCol}`)}`)).values ?? [];
      const at = ids.findIndex((r) => r[0] === row.id);
      if (at > 0) return { externalId: `${sheet}!A${at + 1}` };
    }
    const byName = new Map(cells.map((c) => [c.name, c.value]));
    const line = header.map((h) => byName.get(h) ?? "");
    const d = await ctx.api<{ updates?: { updatedRange?: string } }>(`${base}/${enc(`${tab(sheet)}!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: "POST", body: JSON.stringify({ values: [line] }) });
    return { externalId: d.updates?.updatedRange ?? `${sheet}!${row.id}` };
  },
  defaults: { contact: {} },
};

// Airtable -----------------------------------------------------------------------------------------------------

const AT = "https://api.airtable.com/v0";
type AtTable = { id: string; name: string; fields: { id: string; name: string; type: string }[] };

export const airtable: Connector = {
  kind: "airtable",
  objects: [],
  // Five calls a second per base: a fifth of a second apart.
  gapMs: 220,
  async account(ctx) {
    const d = await ctx.api<{ id: string; email?: string }>(`${AT}/meta/whoami`);
    return { id: d.id, label: d.email ?? "Airtable" };
  },
  async targets(ctx) {
    const bases = (await ctx.api<{ bases: { id: string; name: string; permissionLevel: string }[] }>(`${AT}/meta/bases`)).bases ?? [];
    const out: RowTarget[] = [];
    for (const b of bases.filter((x) => x.permissionLevel !== "read" && x.permissionLevel !== "comment").slice(0, 25)) {
      const tables = (await ctx.api<{ tables: AtTable[] }>(`${AT}/meta/bases/${b.id}/tables`)).tables ?? [];
      for (const t of tables) out.push({ id: `${b.id}/${t.id}`, name: `${b.name} / ${t.name}`, url: `https://airtable.com/${b.id}/${t.id}` });
    }
    return out;
  },
  async append(ctx, target, row, o) {
    const [base, table] = target.id.split("/");
    if (!base || !table) throw new Error("Pick the table again in the form's Sync tab.");
    const t = ((await ctx.api<{ tables: AtTable[] }>(`${AT}/meta/bases/${base}/tables`)).tables ?? []).find((x) => x.id === table);
    if (!t) throw new Error("That table is gone from Airtable. Pick another in the form's Sync tab.");
    const cells = rowCells(row);
    const have = new Set(t.fields.map((f) => f.name));
    for (const c of cells) {
      if (have.has(c.name)) continue;
      try {
        await ctx.api(`${AT}/meta/bases/${base}/tables/${table}/fields`, { method: "POST", body: JSON.stringify({ name: c.name, type: "multilineText" }) });
      } catch (e) {
        // Made by another fill at the same moment: it's there now either way.
        if (e instanceof AuthError || e instanceof RateLimited) throw e;
      }
      have.add(c.name);
    }
    if (o.retry) {
      const found = await ctx.api<{ records: { id: string }[] }>(`${AT}/${base}/${table}?filterByFormula=${enc(`{Fill ID}='${row.id.replace(/'/g, "")}'`)}&maxRecords=1`);
      if (found.records?.[0]) return { externalId: found.records[0].id };
    }
    const fields = Object.fromEntries(cells.filter((c) => c.value !== "").map((c) => [c.name, c.value]));
    const d = await ctx.api<{ records: { id: string }[] }>(`${AT}/${base}/${table}`, { method: "POST", body: JSON.stringify({ records: [{ fields }], typecast: true }) });
    const id = d.records?.[0]?.id;
    if (!id) throw new Error("Airtable didn't take this fill.");
    return { externalId: id };
  },
  defaults: { contact: {} },
};

// Notion -------------------------------------------------------------------------------------------------------

const NOTION = "https://api.notion.com/v1";
const nh = { headers: { "notion-version": "2022-06-28" } };
type NProp = { type: string };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A value as the property's own type wants it; null when it can't hold it (left out). */
function notionValue(type: string, v: string): unknown {
  const text = [{ type: "text", text: { content: v.slice(0, 2000) } }];
  switch (type) {
    case "title":
      return { title: text };
    case "rich_text":
      return { rich_text: text };
    case "email":
      return EMAIL.test(v) ? { email: v } : null;
    case "phone_number":
      return { phone_number: v.slice(0, 100) };
    case "url":
      return /^https?:\/\//.test(v) ? { url: v.slice(0, 2000) } : null;
    case "number":
      return Number.isFinite(Number(v)) && v.trim() !== "" ? { number: Number(v) } : null;
    case "checkbox":
      return { checkbox: /^(yes|true|1)$/i.test(v) };
    case "select":
      return { select: { name: v.replace(/,/g, " ").slice(0, 100) } };
    case "multi_select":
      return { multi_select: v.split(/,\s*/).filter(Boolean).slice(0, 50).map((name) => ({ name: name.slice(0, 100) })) };
    case "date":
      return /^\d{4}-\d{2}-\d{2}/.test(v) ? { date: { start: v } } : null;
    default:
      return null;
  }
}

export const notion: Connector = {
  kind: "notion",
  objects: [],
  gapMs: 350,
  async account(ctx) {
    const d = await ctx.api<{ id: string; name?: string; bot?: { workspace_name?: string } }>(`${NOTION}/users/me`, nh);
    return { id: d.id, label: d.bot?.workspace_name ?? d.name ?? "Notion" };
  },
  async targets(ctx) {
    const d = await ctx.api<{ results: { id: string; url?: string; title?: { plain_text: string }[] }[] }>(`${NOTION}/search`, { ...nh, method: "POST", body: JSON.stringify({ filter: { property: "object", value: "database" }, page_size: 100 }) });
    return (d.results ?? []).map((r) => ({ id: r.id, name: (r.title ?? []).map((t) => t.plain_text).join("") || "Untitled", url: r.url }));
  },
  async append(ctx, target, row, o) {
    const db = await ctx.api<{ properties: Record<string, NProp> }>(`${NOTION}/databases/${target.id}`, nh);
    const props = { ...db.properties };
    const titleName = Object.entries(props).find(([, p]) => p.type === "title")?.[0] ?? "Name";
    const cells = rowCells(row);
    // Columns it doesn't have yet, as text.
    const missing = Object.fromEntries(cells.filter((c) => !props[c.name] && c.name !== titleName).map((c) => [c.name, { rich_text: {} }]));
    if (Object.keys(missing).length) {
      await ctx.api(`${NOTION}/databases/${target.id}`, { ...nh, method: "PATCH", body: JSON.stringify({ properties: missing }) });
      for (const k of Object.keys(missing)) props[k] = { type: "rich_text" };
    }
    if (o.retry && props["Fill ID"]?.type === "rich_text") {
      const found = await ctx.api<{ results: { id: string }[] }>(`${NOTION}/databases/${target.id}/query`, { ...nh, method: "POST", body: JSON.stringify({ filter: { property: "Fill ID", rich_text: { equals: row.id } }, page_size: 1 }) });
      if (found.results?.[0]) return { externalId: found.results[0].id };
    }
    // The page's title: who sent it, else the form and when.
    const who = row.cells.find((c) => /e-?mail/i.test(c.name) && EMAIL.test(c.value))?.value ?? row.cells.find((c) => /name/i.test(c.name) && c.value.trim())?.value;
    const properties: Record<string, unknown> = { [titleName]: notionValue("title", who ?? `${row.form}, ${row.at.slice(0, 16).replace("T", " ")}`) };
    for (const c of cells) {
      const p = props[c.name];
      if (!p || c.name === titleName || c.value === "") continue;
      const v = notionValue(p.type, c.value);
      if (v) properties[c.name] = v;
    }
    const d = await ctx.api<{ id: string }>(`${NOTION}/pages`, { ...nh, method: "POST", body: JSON.stringify({ parent: { database_id: target.id }, properties }) });
    return { externalId: d.id };
  },
  defaults: { contact: {} },
};
