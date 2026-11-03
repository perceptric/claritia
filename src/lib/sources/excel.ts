// Excel Online as a form destination (docs/integrations-plan.md step 2c): a row per form fill in a workbook in
// OneDrive or SharePoint, through Microsoft Graph and the same Microsoft sign-in meetings use. The rows go into an
// Excel table named ClaritiaFills on its own "Claritia fills" sheet, made the first time, so the team's own sheets are
// never touched. Rows are added with the table's own add, which never overwrites a row another fill wrote at the same
// moment. A question added later adds a column at the end; a run again looks for its Fill ID first. A value that
// starts with =, +, - or @ goes in with Excel's ' text mark, so it never runs as a formula. Endpoints "check" against a
// real account.

import { rowCells } from "./rows.ts";
import { AuthError, RateLimited, type Connector, type Ctx, type RowTarget } from "./types.ts";

const GRAPH = "https://graph.microsoft.com/v1.0";
export const TABLE = "ClaritiaFills";
export const SHEET = "Claritia fills";
const enc = encodeURIComponent;

/** The workbook's address in Graph from a target id ("driveId!itemId"). */
function book(target: RowTarget): string {
  const [drive, item] = target.id.split("!");
  if (!drive || !item) throw new Error("Pick the workbook again in the form's Sync tab.");
  return `${GRAPH}/drives/${enc(drive)}/items/${enc(item)}/workbook`;
}

/** A sharing link as Graph's share id: "u!" and the link in base64url. */
export const shareId = (link: string) => `u!${Buffer.from(link).toString("base64url")}`;

type Item = { id: string; name: string; webUrl?: string; parentReference?: { driveId?: string } };
const asTarget = (d: Item): RowTarget => ({ id: `${d.parentReference?.driveId ?? ""}!${d.id}`, name: d.name.replace(/\.xlsx$/i, ""), ...(d.webUrl ? { url: d.webUrl } : {}) });

/** A workbook from its link (Excel's Share or the address bar). */
export async function workbookFromLink(ctx: Ctx, link: string): Promise<RowTarget> {
  const l = link.trim();
  if (!/^https:\/\/([a-z0-9-]+\.)*(sharepoint\.com|onedrive\.live\.com|1drv\.ms|office\.com|live\.com|cloud\.microsoft)\//i.test(l)) throw new Error("Paste the workbook's link from Excel's Share button.");
  const d = await ctx.api<Item>(`${GRAPH}/shares/${shareId(l)}/driveItem?$select=id,name,webUrl,parentReference`);
  if (!/\.xlsx$/i.test(d.name)) throw new Error("That link isn't an Excel workbook (.xlsx).");
  if (!d.parentReference?.driveId) throw new Error("Microsoft didn't say where that workbook is. Try its link from Excel's Share button.");
  return asTarget(d);
}

/** Something to try again: Excel sometimes answers a busy workbook with a refusal that clears in a moment. */
const again = (why: string) => new Error(`${why}; trying again later.`);

/** The ClaritiaFills table's header, made with its sheet the first time. */
async function header(ctx: Ctx, base: string): Promise<string[]> {
  const read = async () => (await ctx.api<{ values?: string[][] }>(`${base}/tables/${TABLE}/headerRowRange?$select=values`)).values?.[0]?.map(String) ?? [];
  try {
    return await read();
  } catch (e) {
    if ((e as { status?: number }).status !== 404) throw e;
  }
  try {
    try {
      await ctx.api(`${base}/worksheets/add`, { method: "POST", body: JSON.stringify({ name: SHEET }) });
    } catch (e) {
      if ((e as { status?: number }).status === 404) throw Object.assign(new Error("That workbook is gone from OneDrive. Pick another in the form's Sync tab."), { gone: true });
      // Made by another fill a moment ago.
      if (e instanceof AuthError || e instanceof RateLimited || ![400, 409].includes((e as { status?: number }).status ?? 0)) throw e;
    }
    const t = await ctx.api<{ id: string }>(`${base}/worksheets/${enc(`'${SHEET}'`)}/tables/add`, { method: "POST", body: JSON.stringify({ address: `'${SHEET}'!A1:C1`, hasHeaders: true }) });
    await ctx.api(`${base}/tables/${enc(t.id)}`, { method: "PATCH", body: JSON.stringify({ name: TABLE }) });
    await ctx.api(`${base}/tables/${TABLE}/headerRowRange`, { method: "PATCH", body: JSON.stringify({ values: [["Sent at", "Fill ID", "Form"]] }) });
    return ["Sent at", "Fill ID", "Form"];
  } catch (e) {
    if (e instanceof AuthError || e instanceof RateLimited || (e as { gone?: boolean }).gone) throw e;
    // Two first fills at once: the other one made it. Otherwise this run tries again.
    try {
      return await read();
    } catch {
      throw again(`Couldn't make the ${TABLE} table: ${String((e as Error).message ?? e).slice(0, 200)}`);
    }
  }
}

/** A value as Excel should keep it: text that looks like a formula gets Excel's ' text mark. */
export const cell = (v: string) => (/^[=+\-@]/.test(v) ? `'${v}` : v);

export const excel: Connector = {
  kind: "excel",
  objects: [],
  gapMs: 250,
  async account(ctx) {
    const d = await ctx.api<{ id: string; mail?: string | null; userPrincipalName?: string }>(`${GRAPH}/me?$select=id,mail,userPrincipalName`);
    return { id: d.id, label: d.mail || d.userPrincipalName || "Microsoft" };
  },
  async targets(ctx) {
    const d = await ctx.api<{ value: Item[] }>(`${GRAPH}/me/drive/root/search(q='.xlsx')?$select=id,name,webUrl,parentReference&$top=200`);
    return (d.value ?? []).filter((x) => /\.xlsx$/i.test(x.name) && x.parentReference?.driveId).map(asTarget);
  },
  async append(ctx, target, row, o) {
    const base = book(target);
    const head = await header(ctx, base);
    const cells = rowCells(row);
    // Columns the questions need, at the end; one made by another fill a moment ago is fine.
    const names = [...head];
    let rename = false;
    for (const c of cells) {
      if (names.includes(c.name)) continue;
      try {
        const col = await ctx.api<{ name?: string }>(`${base}/tables/${TABLE}/columns/add`, { method: "POST", body: JSON.stringify({ index: null, name: c.name }) });
        // An Excel that names it Column4 gets the header written below.
        if (col?.name !== c.name) rename = true;
      } catch (e) {
        if (e instanceof AuthError || e instanceof RateLimited) throw e;
        const now = (await ctx.api<{ values?: string[][] }>(`${base}/tables/${TABLE}/headerRowRange?$select=values`)).values?.[0]?.map(String) ?? [];
        if (!now.includes(c.name)) throw e;
        names.splice(0, names.length, ...now);
        continue;
      }
      names.push(c.name);
    }
    if (rename) await ctx.api(`${base}/tables/${TABLE}/headerRowRange`, { method: "PATCH", body: JSON.stringify({ values: [names] }) });
    // Run again: the fill may be there already (its Fill ID in its column).
    if (o.retry) {
      const ids = (await ctx.api<{ values?: unknown[][] }>(`${base}/tables/${TABLE}/columns/${enc("Fill ID")}/dataBodyRange?$select=values`)).values ?? [];
      const at = ids.findIndex((r) => String(r[0]) === row.id);
      if (at >= 0) return { externalId: `${TABLE}!${at}` };
    }
    const byName = new Map(cells.map((c) => [c.name, c.value]));
    const line = names.map((n) => cell(byName.get(n) ?? ""));
    const d = await ctx.api<{ index?: number }>(`${base}/tables/${TABLE}/rows/add`, { method: "POST", body: JSON.stringify({ index: null, values: [line] }) });
    return { externalId: `${TABLE}!${d.index ?? row.id}` };
  },
  defaults: { contact: {} },
};
