// Documents and signing (docs/integrations-plan.md, Next step 11): a document per fill from the team's own template.
//   Google Docs: the template doc's link is pasted in the form's Sync tab. Each fill reads it (documents.get), makes a
//   new doc, and writes its paragraphs with the tags filled, keeping each run's bold, italic and underline and each
//   paragraph's heading style. Tables, pictures, lists and colors stay in the template. The new doc is marked with
//   the fill's id (a Drive app property), so a retry finds it instead of making a second.
//   DocuSign: an envelope from the picked template to the fill's person, as its first signer role, with text tabs
//   whose labels match the answers' filled in; marked with a claritia_fill custom field, so a retry finds it.
//   PandaDoc: a document from the picked template with the answers as tokens and the person as recipient. PandaDoc
//   takes a few seconds to make the draft, so the delivery waits and tries again until it's a draft, then sends it;
//   marked with claritia_fill metadata, so a retry finds it. Endpoints are from each tool's docs (check).

import { docName, fillTags, missingNote, tagValues } from "../documents/tags.ts";
import type { Connector, Ctx, RowTarget } from "./types.ts";

export type DocOut = { externalId: string; url?: string; notes?: string[] } | { wait: number; reason: string };

const status = (e: unknown) => (e as { status?: number })?.status ?? 0;
const refusal = (message: string) => Object.assign(new Error(message), { refused: true });

// Google Docs --------------------------------------------------------------------------------------------------

const DOCS = "https://docs.googleapis.com/v1/documents";
const DRIVE = "https://www.googleapis.com/drive/v3/files";

type Run = { text: string; bold?: boolean; italic?: boolean; underline?: boolean };
type Para = { style: string; runs: Run[] };
type GDoc = {
  documentId: string;
  title?: string;
  body?: { content?: { endIndex?: number; paragraph?: { paragraphStyle?: { namedStyleType?: string }; elements?: { textRun?: { content?: string; textStyle?: { bold?: boolean; italic?: boolean; underline?: boolean } } }[] } }[] };
};

/** The template's paragraphs: text runs with the styles that carry over. */
export function paragraphsOf(d: GDoc): Para[] {
  const out: Para[] = [];
  for (const c of d.body?.content ?? []) {
    const p = c.paragraph;
    if (!p) continue;
    const runs = (p.elements ?? []).flatMap((e) => (e.textRun?.content ? [{ text: e.textRun.content, ...e.textRun.textStyle }] : []));
    out.push({ style: p.paragraphStyle?.namedStyleType ?? "NORMAL_TEXT", runs });
  }
  return out;
}

/**
 * The new doc's requests: all the text at once, then each styled run and each heading. A tag split across runs (a
 * bold word inside it) is filled with the first run's style.
 */
export function docRequests(paras: Para[], values: Map<string, string>, missing: Set<string>): object[] {
  const runs: (Run & { para: number })[] = [];
  paras.forEach((p, i) => {
    // Merge runs a tag crosses, so each tag sits inside one run.
    let cur: (Run & { para: number }) | null = null;
    let open = false;
    for (const r of p.runs) {
      if (cur && open) cur.text += r.text;
      else {
        cur = { ...r, para: i };
        runs.push(cur);
      }
      open = (cur.text.match(/\{\{/g) ?? []).length > (cur.text.match(/\}\}/g) ?? []).length;
    }
  });
  const filled = runs.map((r) => ({ ...r, text: fillTags(r.text, values, missing) }));
  const text = filled.map((r) => r.text).join("");
  const reqs: object[] = [];
  if (!text) return reqs;
  reqs.push({ insertText: { location: { index: 1 }, text } });
  // Google counts in UTF-16 units, as JavaScript strings do.
  let at = 1;
  const spans = new Map<number, [number, number]>();
  for (const r of filled) {
    const len = r.text.length;
    if (len && (r.bold || r.italic || r.underline))
      reqs.push({ updateTextStyle: { range: { startIndex: at, endIndex: at + len }, textStyle: { bold: !!r.bold, italic: !!r.italic, underline: !!r.underline }, fields: "bold,italic,underline" } });
    spans.set(r.para, [spans.get(r.para)?.[0] ?? at, at + len]);
    at += len;
  }
  for (const [i, [s, e]] of spans) {
    const style = paras[i]!.style;
    if (style !== "NORMAL_TEXT" && e > s) reqs.push({ updateParagraphStyle: { range: { startIndex: s, endIndex: e }, paragraphStyle: { namedStyleType: style }, fields: "namedStyleType" } });
  }
  return reqs;
}

export const docUrl = (id: string) => `https://docs.google.com/document/d/${id}/edit`;

/** The template from its link, for the Sync tab. */
export async function docFromLink(ctx: Ctx, link: string): Promise<RowTarget> {
  const id = /\/document\/d\/([A-Za-z0-9_-]{20,})/.exec(link)?.[1] ?? (/^[A-Za-z0-9_-]{20,}$/.test(link.trim()) ? link.trim() : null);
  if (!id) throw new Error("Paste the template doc's link from your browser.");
  const d = await ctx.api<GDoc>(`${DOCS}/${id}?fields=documentId,title`);
  return { id, name: d.title ?? "Template", url: docUrl(id) };
}

export const googleDocs: Connector = {
  kind: "google_docs",
  objects: [],
  gapMs: 250,
  async account(ctx) {
    const d = await ctx.api<{ id: string; email: string }>("https://www.googleapis.com/oauth2/v2/userinfo");
    return { id: d.id, label: d.email };
  },
  async document(ctx, target, fill) {
    let tpl: GDoc;
    try {
      tpl = await ctx.api<GDoc>(`${DOCS}/${encodeURIComponent(target.id)}`);
    } catch (e) {
      if (status(e) === 404) throw refusal("The template doc is gone. Paste another one in the form's Sync tab.");
      throw e;
    }
    const missing = new Set<string>();
    const reqs = docRequests(paragraphsOf(tpl), tagValues(fill), missing);
    // A run again: the doc this fill made, by its app property.
    const q = `appProperties has { key='claritia_fill' and value='${fill.id}' } and trashed = false`;
    const found = (await ctx.api<{ files?: { id: string }[] }>(`${DRIVE}?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`)).files?.[0]?.id;
    let id = found;
    if (id) {
      const cur = await ctx.api<GDoc>(`${DOCS}/${id}?fields=body.content(endIndex)`);
      const end = (cur.body?.content ?? []).reduce((m, c) => Math.max(m, c.endIndex ?? 0), 0);
      // Already written: done. Made but empty (the run stopped between the two): write it now.
      if (end > 2) return { externalId: id, url: docUrl(id), notes: missingNote(missing) };
    } else {
      id = (await ctx.api<{ documentId: string }>(DOCS, { method: "POST", body: JSON.stringify({ title: docName(fill) }) })).documentId;
      await ctx.api(`${DRIVE}/${id}`, { method: "PATCH", body: JSON.stringify({ appProperties: { claritia_fill: fill.id } }) });
    }
    if (reqs.length) await ctx.api(`${DOCS}/${id}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: reqs }) });
    return { externalId: id, url: docUrl(id), notes: missingNote(missing) };
  },
  defaults: { contact: {} },
};

// DocuSign -----------------------------------------------------------------------------------------------------

type DsAccount = { account_id: string; account_name?: string; base_uri: string; is_default?: boolean };
const dsAccounts = new WeakMap<Ctx, Promise<DsAccount>>();

/** The account the sign-in belongs to (the default one) and its own API address. */
function dsAccount(ctx: Ctx): Promise<DsAccount> {
  let p = dsAccounts.get(ctx);
  if (!p) {
    p = ctx.api<{ accounts?: DsAccount[] }>("https://account.docusign.com/oauth/userinfo").then((d) => {
      const a = (d.accounts ?? []).find((x) => x.is_default) ?? d.accounts?.[0];
      if (!a || !/^https:\/\/[a-z0-9.-]+\.docusign\.net$/.test(a.base_uri)) throw new Error("This DocuSign sign-in has no account.");
      return a;
    });
    p.catch(() => dsAccounts.delete(ctx));
    dsAccounts.set(ctx, p);
  }
  return p;
}
const dsBase = async (ctx: Ctx) => {
  const a = await dsAccount(ctx);
  return `${a.base_uri}/restapi/v2.1/accounts/${a.account_id}`;
};
const dsLink = (id: string) => `https://app.docusign.com/documents/details/${id}`;

export const docusign: Connector = {
  kind: "docusign",
  objects: [],
  gapMs: 250,
  async account(ctx) {
    const a = await dsAccount(ctx);
    return { id: a.account_id, label: a.account_name ?? "DocuSign" };
  },
  async targets(ctx) {
    const d = await ctx.api<{ envelopeTemplates?: { templateId: string; name: string }[] }>(`${await dsBase(ctx)}/templates?count=100`);
    return (d.envelopeTemplates ?? []).map((t) => ({ id: t.templateId, name: t.name }));
  },
  async document(ctx, target, fill, o) {
    if (!fill.email) throw refusal("This fill has no email to send the document to.");
    const base = await dsBase(ctx);
    if (o.retry) {
      const from = new Date(Date.parse(fill.at) - 86_400_000).toISOString();
      const d = await ctx.api<{ envelopes?: { envelopeId: string }[] }>(`${base}/envelopes?from_date=${encodeURIComponent(from)}&custom_field=${encodeURIComponent(`claritia_fill=${fill.id}`)}`);
      const id = d.envelopes?.[0]?.envelopeId;
      if (id) return { externalId: id, url: dsLink(id) };
    }
    let roles: { signers?: { roleName?: string }[] };
    try {
      roles = await ctx.api(`${base}/templates/${encodeURIComponent(target.id)}/recipients`);
    } catch (e) {
      if (status(e) === 404) throw refusal("The DocuSign template is gone. Pick another one in the form's Sync tab.");
      throw e;
    }
    const roleName = roles.signers?.[0]?.roleName;
    if (!roleName) throw refusal("The DocuSign template has no signer role. Add one in DocuSign.");
    const textTabs = fill.fields.filter((f) => f.value).map((f) => ({ tabLabel: f.label, value: f.value }));
    const made = await ctx.api<{ envelopeId?: string }>(`${base}/envelopes`, {
      method: "POST",
      body: JSON.stringify({
        templateId: target.id,
        status: "sent",
        templateRoles: [{ roleName, email: fill.email, name: fill.name || fill.email, tabs: { textTabs } }],
        customFields: { textCustomFields: [{ name: "claritia_fill", value: fill.id, show: "false" }] },
      }),
    });
    if (!made.envelopeId) throw new Error("DocuSign didn't make the envelope.");
    return { externalId: made.envelopeId, url: dsLink(made.envelopeId) };
  },
  defaults: { contact: {} },
};

// PandaDoc -----------------------------------------------------------------------------------------------------

const PD = "https://api.pandadoc.com/public/v1";
const pd = <T>(ctx: Ctx, path: string, init: RequestInit = {}) => ctx.api<T>(`${PD}${path}`, { ...init, auth: false, headers: { authorization: `API-Key ${ctx.secret("api_key")}` } });
const pdLink = (id: string) => `https://app.pandadoc.com/a/#/documents/${id}`;
/** How long the delivery waits for PandaDoc to finish the draft. */
export const PD_WAIT_S = 5;

export const pandadoc: Connector = {
  kind: "pandadoc",
  objects: [],
  gapMs: 300,
  async account(ctx) {
    const d = await pd<{ user_id?: string; email?: string; workspace_name?: string }>(ctx, "/members/current");
    return { id: d.user_id ?? d.email ?? "pandadoc", label: d.workspace_name ?? d.email ?? "PandaDoc" };
  },
  async targets(ctx) {
    const d = await pd<{ results?: { id: string; name: string }[] }>(ctx, "/templates?count=100");
    return (d.results ?? []).map((t) => ({ id: t.id, name: t.name }));
  },
  async document(ctx, target, fill) {
    if (!fill.email) throw refusal("This fill has no email to send the document to.");
    // This fill's document, made on an earlier try, by its metadata.
    const found = (await pd<{ results?: { id: string; status: string }[] }>(ctx, `/documents?metadata_claritia_fill=${encodeURIComponent(fill.id)}&count=1`)).results?.[0];
    let id = found?.id;
    let st = found?.status;
    if (!id) {
      let roles: { roles?: { name: string }[] };
      try {
        roles = await pd(ctx, `/templates/${encodeURIComponent(target.id)}/details`);
      } catch (e) {
        if (status(e) === 404) throw refusal("The PandaDoc template is gone. Pick another one in the form's Sync tab.");
        throw e;
      }
      const [first, ...rest] = (fill.name ?? "").split(" ");
      const made = await pd<{ id: string; status: string }>(ctx, "/documents", {
        method: "POST",
        body: JSON.stringify({
          name: docName(fill),
          template_uuid: target.id,
          recipients: [{ email: fill.email, ...(first ? { first_name: first } : {}), ...(rest.length ? { last_name: rest.join(" ") } : {}), ...(roles.roles?.[0]?.name ? { role: roles.roles[0].name } : {}) }],
          tokens: fill.fields.filter((f) => f.value).map((f) => ({ name: f.label, value: f.value })),
          metadata: { claritia_fill: fill.id },
        }),
      });
      id = made.id;
      st = made.status;
    }
    if (st === "document.uploaded") {
      st = (await pd<{ status: string }>(ctx, `/documents/${id}`)).status;
      if (st === "document.uploaded") return { wait: PD_WAIT_S, reason: "PandaDoc is still making the document." };
    }
    if (st === "document.draft") await pd(ctx, `/documents/${id}/send`, { method: "POST", body: JSON.stringify({ silent: false }) });
    return { externalId: id!, url: pdLink(id!) };
  },
  defaults: { contact: {} },
};

export const DOC_TOOLS = [googleDocs, docusign, pandadoc];
