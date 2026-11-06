// Work tools (docs/integrations-plan.md, Next step 10): a form fill becomes one item in the place picked in the form's
// Sync tab: a Linear issue, a Trello card, a ClickUp task, a monday.com item, a SmartSuite record, a Zendesk or
// Freshdesk ticket, or an Intercom conversation. They use the sheets' shape (`targets` to pick from, `append` per fill),
// so deliveries, retries and Send again work as for every other tool. The item carries every answer and the fill's
// id; a run again after a lost answer looks for that id first and makes no second item. A place that's gone fails
// with what to do. Endpoints, fields and links are from each tool's docs and are checked against a real account
// before launch (check).

import type { Connector, Ctx, FillRow, RowTarget } from "./types.ts";

export type AppendOpts = { retry: boolean; person?: { email: string | null; name: string | null } | null; link?: string };
type Made = { externalId: string; url?: string };

const status = (e: unknown) => (e as { status?: number })?.status ?? 0;
const gone = (what: string) => new Error(`The ${what} is gone. Pick another one in the form's Sync tab.`);
/** A refusal that means the picked place isn't there anymore. */
const isGone = (e: unknown) => status(e) === 404 || /not found|does not exist|invalid id|model not found|Entity not found/i.test(String((e as Error)?.message ?? ""));

/** The short id a title carries, so a run again can find the item by it. */
export const shortId = (id: string) => id.replace(/-/g, "").slice(0, 8);

/** The item's title, from the form and the person, with the fill's short id. */
export function workTitle(row: FillRow, o: AppendOpts): string {
  const who = o.person?.name || o.person?.email || "";
  return `${row.form}${who ? `: ${who}` : ""} (#${shortId(row.id)})`.slice(0, 250);
}

/** Every answer as plain lines (Markdown where the tool reads it), then the fill's id and the link to it. */
export function workText(row: FillRow, o: AppendOpts, md = true): string {
  const b = (s: string) => (md ? `**${s}**` : s);
  const lines = row.cells.filter((c) => c.value).map((c) => `${b(c.name)}: ${c.value.slice(0, 2000)}`);
  return [...lines, "", `Fill ID: ${row.id}`, ...(o.link ? [md ? `[Open in Claritia](${o.link})` : `Open in Claritia: ${o.link}`] : [])].join("\n").slice(0, 60_000);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const workHtml = (row: FillRow, o: AppendOpts) =>
  [...row.cells.filter((c) => c.value).map((c) => `<p><strong>${esc(c.name)}</strong><br>${esc(c.value.slice(0, 2000)).replace(/\n/g, "<br>")}</p>`), `<p>Fill ID: ${row.id}</p>`, ...(o.link ? [`<p><a href="${esc(o.link)}">Open in Claritia</a></p>`] : [])].join("");

// Linear -------------------------------------------------------------------------------------------------------

async function linearQ<T>(ctx: Ctx, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  // A signed-in app sends Bearer; a pasted personal key goes as it is (check).
  const init = { method: "POST", body: JSON.stringify({ query, variables }) };
  const r = await (ctx.creds.type === "oauth" ? ctx.api<{ data?: T; errors?: { message: string }[] }>("https://api.linear.app/graphql", init) : ctx.api<{ data?: T; errors?: { message: string }[] }>("https://api.linear.app/graphql", { ...init, auth: false, headers: { authorization: ctx.secret("api_key") } }));
  if (r.errors?.length) throw Object.assign(new Error(`Linear: ${r.errors[0]!.message}`), { status: /not found/i.test(r.errors[0]!.message) ? 404 : 400 });
  return r.data as T;
}

export const linear: Connector = {
  kind: "linear",
  objects: [],
  gapMs: 200,
  async account(ctx) {
    const d = await linearQ<{ viewer: { organization: { id: string; name: string } } }>(ctx, "query { viewer { organization { id name } } }");
    return { id: d.viewer.organization.id, label: d.viewer.organization.name };
  },
  async targets(ctx) {
    const d = await linearQ<{ teams: { nodes: { id: string; name: string; key: string }[] } }>(ctx, "query { teams(first: 100) { nodes { id name key } } }");
    return d.teams.nodes.map((t) => ({ id: t.id, name: `${t.name} (${t.key})` }));
  },
  async append(ctx, target, row, o: AppendOpts) {
    try {
      if (o.retry) {
        const f = await linearQ<{ issues: { nodes: { id: string; url: string }[] } }>(ctx, "query ($t: ID, $s: String) { issues(first: 1, filter: { team: { id: { eq: $t } }, description: { contains: $s } }) { nodes { id url } } }", { t: target.id, s: `Fill ID: ${row.id}` });
        const hit = f.issues.nodes[0];
        if (hit) return { externalId: hit.id, url: hit.url };
      }
      const d = await linearQ<{ issueCreate: { success: boolean; issue: { id: string; url: string } | null } }>(ctx, "mutation ($i: IssueCreateInput!) { issueCreate(input: $i) { success issue { id url } } }", {
        i: { teamId: target.id, title: workTitle(row, o), description: workText(row, o) },
      });
      if (!d.issueCreate.issue) throw new Error("Linear didn't make the issue.");
      return { externalId: d.issueCreate.issue.id, url: d.issueCreate.issue.url } as Made;
    } catch (e) {
      throw isGone(e) ? gone("Linear team") : e;
    }
  },
  defaults: { contact: {} },
};

// Trello -------------------------------------------------------------------------------------------------------

const trello = <T>(ctx: Ctx, path: string, init: RequestInit = {}, q: Record<string, string> = {}) =>
  ctx.api<T>(`https://api.trello.com/1${path}?${new URLSearchParams({ ...q, key: ctx.secret("api_key"), token: ctx.secret("token") })}`, { ...init, auth: false });

export const trelloWork: Connector = {
  kind: "trello",
  objects: [],
  gapMs: 120,
  async account(ctx) {
    const d = await trello<{ id: string; fullName?: string; username: string }>(ctx, "/members/me", {}, { fields: "id,fullName,username" });
    return { id: d.id, label: d.fullName || d.username };
  },
  async targets(ctx) {
    const boards = await trello<{ id: string; name: string; lists?: { id: string; name: string }[] }[]>(ctx, "/members/me/boards", {}, { filter: "open", fields: "name", lists: "open" });
    return boards.flatMap((b) => (b.lists ?? []).map((l) => ({ id: l.id, name: `${b.name} / ${l.name}` })));
  },
  async append(ctx, target, row, o: AppendOpts) {
    try {
      if (o.retry) {
        const cards = await trello<{ id: string; desc: string; shortUrl: string }[]>(ctx, `/lists/${encodeURIComponent(target.id)}/cards`, {}, { fields: "desc,shortUrl" });
        const hit = cards.find((c) => c.desc.includes(`Fill ID: ${row.id}`));
        if (hit) return { externalId: hit.id, url: hit.shortUrl };
      }
      const c = await trello<{ id: string; shortUrl: string }>(ctx, "/cards", { method: "POST" }, { idList: target.id, name: workTitle(row, o), desc: workText(row, o).slice(0, 16_000), pos: "top" });
      return { externalId: c.id, url: c.shortUrl } as Made;
    } catch (e) {
      throw isGone(e) ? gone("Trello list") : e;
    }
  },
  defaults: { contact: {} },
};

// ClickUp ------------------------------------------------------------------------------------------------------

/** ClickUp takes its token as it is, signed in or pasted (check). */
const clickup = async <T>(ctx: Ctx, path: string, init: RequestInit = {}) => ctx.api<T>(`https://api.clickup.com/api/v2${path}`, { ...init, auth: false, headers: { authorization: await ctx.token() } });

export const clickupWork: Connector = {
  kind: "clickup",
  objects: [],
  gapMs: 650,
  async account(ctx) {
    const d = await clickup<{ user: { id: number; username?: string; email?: string } }>(ctx, "/user");
    return { id: String(d.user.id), label: d.user.username ?? d.user.email ?? "ClickUp" };
  },
  async targets(ctx) {
    const out: RowTarget[] = [];
    const teams = (await clickup<{ teams: { id: string; name: string }[] }>(ctx, "/team")).teams ?? [];
    for (const t of teams.slice(0, 5)) {
      const spaces = (await clickup<{ spaces: { id: string; name: string }[] }>(ctx, `/team/${t.id}/space?archived=false`)).spaces ?? [];
      for (const s of spaces.slice(0, 20)) {
        const lists = (await clickup<{ lists: { id: string; name: string }[] }>(ctx, `/space/${s.id}/list?archived=false`)).lists ?? [];
        for (const l of lists) out.push({ id: l.id, name: `${s.name} / ${l.name}` });
        const folders = (await clickup<{ folders: { name: string; lists: { id: string; name: string }[] }[] }>(ctx, `/space/${s.id}/folder?archived=false`)).folders ?? [];
        for (const f of folders) for (const l of f.lists ?? []) out.push({ id: l.id, name: `${s.name} / ${f.name} / ${l.name}` });
      }
    }
    return out;
  },
  async append(ctx, target, row, o: AppendOpts) {
    try {
      if (o.retry) {
        const d = await clickup<{ tasks: { id: string; url: string; name: string }[] }>(ctx, `/list/${encodeURIComponent(target.id)}/task?archived=false&include_closed=true`);
        const hit = d.tasks.find((t) => t.name.endsWith(`(#${shortId(row.id)})`));
        if (hit) return { externalId: hit.id, url: hit.url };
      }
      const t = await clickup<{ id: string; url: string }>(ctx, `/list/${encodeURIComponent(target.id)}/task`, { method: "POST", body: JSON.stringify({ name: workTitle(row, o), markdown_description: workText(row, o) }) });
      return { externalId: t.id, url: t.url } as Made;
    } catch (e) {
      throw isGone(e) ? gone("ClickUp list") : e;
    }
  },
  defaults: { contact: {} },
};

// monday.com (work boards) -------------------------------------------------------------------------------------

async function monday<T>(ctx: Ctx, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const r = await ctx.api<{ data?: T; errors?: { message: string }[]; error_message?: string }>("https://api.monday.com/v2", {
    method: "POST",
    auth: false,
    headers: { authorization: ctx.secret("api_key"), "API-Version": "2024-10" },
    body: JSON.stringify({ query, variables }),
  });
  const err = r.errors?.[0]?.message ?? r.error_message;
  if (err) throw Object.assign(new Error(`monday: ${err}`), { status: /not found|does not exist/i.test(err) ? 404 : 400 });
  return r.data as T;
}

export const mondayWork: Connector = {
  kind: "monday_work",
  objects: [],
  gapMs: 300,
  async account(ctx) {
    const d = await monday<{ me: { account: { slug: string; name: string } } }>(ctx, "query { me { account { slug name } } }");
    return { id: d.me.account.slug, label: d.me.account.name };
  },
  async targets(ctx) {
    const d = await monday<{ boards: { id: string; name: string }[] }>(ctx, "query { boards(limit: 200, state: active) { id name } }");
    return d.boards.map((b) => ({ id: b.id, name: b.name }));
  },
  async append(ctx, target, row, o: AppendOpts) {
    const title = workTitle(row, o);
    try {
      if (o.retry) {
        const f = await monday<{ items_page_by_column_values: { items: { id: string }[] } }>(ctx, "query ($b: ID!, $v: [String]!) { items_page_by_column_values(board_id: $b, limit: 1, columns: [{ column_id: \"name\", column_values: $v }]) { items { id } } }", { b: target.id, v: [title] });
        const hit = f.items_page_by_column_values.items[0];
        if (hit) return { externalId: `${target.id}:${hit.id}` };
      }
      const made = await monday<{ create_item: { id: string } }>(ctx, "mutation ($b: ID!, $n: String!) { create_item(board_id: $b, item_name: $n) { id } }", { b: target.id, n: title });
      // The answers as the item's first update.
      await monday(ctx, "mutation ($i: ID!, $t: String!) { create_update(item_id: $i, body: $t) { id } }", { i: made.create_item.id, t: workHtml(row, o) });
      return { externalId: `${target.id}:${made.create_item.id}` };
    } catch (e) {
      throw isGone(e) ? gone("monday.com board") : e;
    }
  },
  link(s, id) {
    const [board, item] = id.split(":");
    return /^[a-z0-9-]+$/.test(s.account ?? "") && board && item ? `https://${s.account}.monday.com/boards/${board}/pulses/${item}` : undefined;
  },
  defaults: { contact: {} },
};

// SmartSuite ---------------------------------------------------------------------------------------------------

const smart = <T>(ctx: Ctx, path: string, init: RequestInit = {}) =>
  ctx.api<T>(`https://app.smartsuite.com/api/v1${path}`, { ...init, auth: false, headers: { authorization: `Token ${ctx.secret("api_key")}`, "ACCOUNT-ID": ctx.secret("workspace") } });

export const smartsuite: Connector = {
  kind: "smartsuite",
  objects: [],
  gapMs: 300,
  async account(ctx) {
    await smart(ctx, "/applications/");
    return { id: ctx.secret("workspace"), label: `SmartSuite ${ctx.secret("workspace")}` };
  },
  async targets(ctx) {
    const apps = await smart<{ id: string; name: string; solution: string }[]>(ctx, "/applications/");
    return apps.map((a) => ({ id: a.id, name: a.name, url: `https://app.smartsuite.com/${ctx.secret("workspace")}/solution/${a.solution}/${a.id}` }));
  },
  async append(ctx, target, row, o: AppendOpts) {
    const title = workTitle(row, o);
    try {
      if (o.retry) {
        const f = await smart<{ items: { id: string }[] }>(ctx, `/applications/${encodeURIComponent(target.id)}/records/list/`, {
          method: "POST",
          body: JSON.stringify({ filter: { operator: "and", fields: [{ field: "title", comparison: "is", value: title }] } }),
        });
        if (f.items?.[0]) return { externalId: f.items[0].id };
      }
      // The table's first long text field gets the answers (check).
      const app = await smart<{ structure?: { slug: string; field_type: string }[] }>(ctx, `/applications/${encodeURIComponent(target.id)}/`);
      const long = app.structure?.find((f) => f.field_type === "textareafield" || f.field_type === "richtextareafield")?.slug;
      const r = await smart<{ id: string }>(ctx, `/applications/${encodeURIComponent(target.id)}/records/`, { method: "POST", body: JSON.stringify({ title, ...(long ? { [long]: workText(row, o, false) } : {}) }) });
      return { externalId: r.id };
    } catch (e) {
      throw isGone(e) ? gone("SmartSuite table") : e;
    }
  },
  defaults: { contact: {} },
};

// Zendesk ------------------------------------------------------------------------------------------------------

const ZD = /^[a-z0-9][a-z0-9-]{0,62}$/;
const zdSub = (ctx: Ctx) => {
  const s = ctx.secret("subdomain").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\.zendesk\.com.*$/, "");
  if (!ZD.test(s)) throw new Error("Use your Zendesk address, like acme or acme.zendesk.com.");
  return s;
};
const zd = <T>(ctx: Ctx, path: string, init: RequestInit = {}) =>
  ctx.api<T>(`https://${zdSub(ctx)}.zendesk.com/api/v2${path}`, { ...init, auth: false, headers: { authorization: `Basic ${Buffer.from(`${ctx.secret("email")}/token:${ctx.secret("api_token")}`).toString("base64")}` } });

export const zendesk: Connector = {
  kind: "zendesk",
  objects: [],
  gapMs: 150,
  async account(ctx) {
    const d = await zd<{ user: { id: number; email: string } }>(ctx, "/users/me.json");
    if (!d.user?.id) throw new Error("Zendesk didn't take this email and API token.");
    return { id: zdSub(ctx), label: `${zdSub(ctx)}.zendesk.com` };
  },
  async targets(ctx) {
    const d = await zd<{ groups: { id: number; name: string }[] }>(ctx, "/groups.json");
    return [{ id: "any", name: "No group" }, ...(d.groups ?? []).map((g) => ({ id: String(g.id), name: g.name }))];
  },
  async append(ctx, target, row, o: AppendOpts) {
    try {
      // The fill's id is the ticket's external id, so a run again finds it.
      if (o.retry) {
        const f = await zd<{ tickets: { id: number }[] }>(ctx, `/tickets.json?external_id=${encodeURIComponent(row.id)}`);
        if (f.tickets?.[0]) return { externalId: String(f.tickets[0].id) };
      }
      const t = await zd<{ ticket: { id: number } }>(ctx, "/tickets.json", {
        method: "POST",
        body: JSON.stringify({
          ticket: {
            subject: workTitle(row, o),
            comment: { body: workText(row, o, false) },
            external_id: row.id,
            ...(o.person?.email ? { requester: { email: o.person.email, ...(o.person.name ? { name: o.person.name } : {}) } } : {}),
            ...(target.id !== "any" ? { group_id: Number(target.id) } : {}),
          },
        }),
      });
      return { externalId: String(t.ticket.id) };
    } catch (e) {
      throw isGone(e) ? gone("Zendesk group") : e;
    }
  },
  link: (s, id) => (ZD.test(s.account ?? "") ? `https://${s.account}.zendesk.com/agent/tickets/${encodeURIComponent(id)}` : undefined),
  defaults: { contact: {} },
};

// Freshdesk ----------------------------------------------------------------------------------------------------

const FD = /^[a-z0-9-]+\.freshdesk\.com$/;
const fdDomain = (ctx: Ctx) => {
  const d = ctx.secret("domain").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!FD.test(d)) throw new Error("Use your Freshdesk address, like acme.freshdesk.com.");
  return d;
};
const fd = <T>(ctx: Ctx, path: string, init: RequestInit = {}) =>
  ctx.api<T>(`https://${fdDomain(ctx)}/api/v2${path}`, { ...init, auth: false, headers: { authorization: `Basic ${Buffer.from(`${ctx.secret("api_key")}:X`).toString("base64")}` } });
/** The tag a fill's ticket carries, so a run again finds it. */
export const fdTag = (id: string) => `claritia_${shortId(id)}`;

export const freshdesk: Connector = {
  kind: "freshdesk",
  objects: [],
  gapMs: 300,
  async account(ctx) {
    await fd(ctx, "/groups");
    return { id: fdDomain(ctx), label: fdDomain(ctx) };
  },
  async targets(ctx) {
    const groups = await fd<{ id: number; name: string }[]>(ctx, "/groups");
    return [{ id: "any", name: "No group" }, ...groups.map((g) => ({ id: String(g.id), name: g.name }))];
  },
  async append(ctx, target, row, o: AppendOpts) {
    if (!o.person?.email) throw new Error("Freshdesk needs the person's email to make a ticket.");
    try {
      if (o.retry) {
        const f = await fd<{ results: { id: number }[] }>(ctx, `/search/tickets?query=${encodeURIComponent(`"tag:'${fdTag(row.id)}'"`)}`);
        if (f.results?.[0]) return { externalId: String(f.results[0].id) };
      }
      const t = await fd<{ id: number }>(ctx, "/tickets", {
        method: "POST",
        body: JSON.stringify({ subject: workTitle(row, o), description: workHtml(row, o), email: o.person.email, ...(o.person.name ? { name: o.person.name } : {}), status: 2, priority: 1, tags: [fdTag(row.id)], ...(target.id !== "any" ? { group_id: Number(target.id) } : {}) }),
      });
      return { externalId: String(t.id) };
    } catch (e) {
      throw isGone(e) ? gone("Freshdesk group") : e;
    }
  },
  link: (s, id) => (FD.test(s.account ?? "") ? `https://${s.account}/a/tickets/${encodeURIComponent(id)}` : undefined),
  defaults: { contact: {} },
};

// Intercom -----------------------------------------------------------------------------------------------------

const IC = { "intercom-version": "2.11" };

/** An Intercom conversation per fill, from the person (found by email, else made as a lead). */
export async function intercomAppend(ctx: Ctx, _target: RowTarget, row: FillRow, o: AppendOpts): Promise<Made> {
  const email = o.person?.email;
  if (!email) throw new Error("Intercom needs the person's email to open a conversation.");
  if (o.retry) {
    const f = await ctx.api<{ conversations?: { id: string }[] }>("https://api.intercom.io/conversations/search", {
      method: "POST",
      headers: IC,
      body: JSON.stringify({ query: { field: "source.body", operator: "~", value: row.id } }),
    });
    if (f.conversations?.[0]) return { externalId: f.conversations[0].id };
  }
  const found = await ctx.api<{ data?: { id: string }[] }>("https://api.intercom.io/contacts/search", { method: "POST", headers: IC, body: JSON.stringify({ query: { field: "email", operator: "=", value: email } }) });
  const contact = found.data?.[0]?.id ?? (await ctx.api<{ id: string }>("https://api.intercom.io/contacts", { method: "POST", headers: IC, body: JSON.stringify({ role: "lead", email, ...(o.person?.name ? { name: o.person.name } : {}) }) })).id;
  const c = await ctx.api<{ conversation_id?: string; id?: string }>("https://api.intercom.io/conversations", {
    method: "POST",
    headers: IC,
    body: JSON.stringify({ from: { type: "contact", id: contact }, body: workHtml(row, o) }),
  });
  return { externalId: c.conversation_id ?? c.id ?? "" };
}

/** The one place an Intercom fill goes: the workspace's inbox. */
export const INTERCOM_INBOX: RowTarget = { id: "inbox", name: "Inbox" };

export const WORK_TOOLS = [linear, trelloWork, clickupWork, mondayWork, smartsuite, zendesk, freshdesk];
