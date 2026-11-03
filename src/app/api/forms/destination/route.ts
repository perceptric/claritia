import { randomBytes } from "node:crypto";
import { isMember } from "@/lib/contacts/server";
import { hostIsPrivate } from "@/lib/privateNet";
import { seal } from "@/lib/seal";
import { requireUser } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";
import { cleanTags, listOf, NEW_RULES, rulesOf, targetOf } from "@/lib/delivery/rules";

// Add or change where a form's leads go: POST { workspaceId, formId, id?, kind, sourceId?, name, url?, rules?, list?, tags? }
// (docs/form-builder.md 7.1). Addresses are sealed; only the host is kept where people can see it. A new webhook
// gets a signing secret, shown once in the answer. A new CRM destination starts with the safe sync rules (7.4);
// `rules` changes them on an existing one. An email tool's `list` ({ id, name }) and `tags` are kept beside them.

const bad = (error: string, status = 400) => Response.json({ error }, { status });

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const b = (await request.json().catch(() => ({}))) as { workspaceId?: unknown; formId?: unknown; id?: unknown; kind?: unknown; sourceId?: unknown; name?: unknown; url?: unknown; rules?: unknown; list?: unknown; tags?: unknown; target?: unknown };
  if (!(await isMember(auth, b.workspaceId))) return bad("Workspace not found.", 404);
  const kind = b.kind === "source" || b.kind === "slack" || b.kind === "webhook" ? b.kind : null;
  if (!kind) return bad("Pick where leads go.");
  if (typeof b.formId !== "string" || !/^[0-9a-f-]{36}$/.test(b.formId)) return bad("Form not found.", 404);
  const id = typeof b.id === "string" && /^[0-9a-f-]{36}$/.test(b.id) ? b.id : null;
  const db = serviceClient();
  if (!db) return bad("The server is not set up for this.", 500);
  const name = typeof b.name === "string" && b.name.trim() ? b.name.trim().slice(0, 120) : kind === "slack" ? "Slack" : kind === "webhook" ? "Webhook" : "Tool";
  let config: Record<string, unknown> = kind === "source" && !id ? { rules: NEW_RULES } : {};
  let sealed: string | null = null;
  let secret: string | undefined;
  const url = typeof b.url === "string" ? b.url.trim() : "";
  if (kind === "slack" && (url || !id)) {
    if (!/^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]+$/.test(url)) return bad("Paste a Slack webhook address (https://hooks.slack.com/services/…).");
    sealed = seal(JSON.stringify({ url }));
  }
  if (kind === "webhook" && (url || !id)) {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return bad("Enter the full address, starting with https://.");
    }
    if (u.protocol !== "https:" || u.username || u.password) return bad("Webhooks need an https:// address.");
    if (await hostIsPrivate(u.hostname)) return bad("That address is on a private network.");
    secret = `whsec_${randomBytes(24).toString("base64url")}`;
    sealed = seal(JSON.stringify({ url: u.href, secret }));
    config = { host: u.hostname };
  }
  let keep = !!(sealed || !id);
  if (b.rules !== undefined && id && kind === "source") {
    const rules = rulesOf({ rules: b.rules });
    if (!rules) return bad("Pick what happens when the record exists.");
    const { data: row } = await db.from("form_destinations").select("config").eq("id", id).eq("form_id", b.formId).maybeSingle();
    if (!row) return bad("Destination not found.", 404);
    config = { ...((row as { config: Record<string, unknown> }).config ?? {}), rules };
    keep = true;
  }
  // An email tool's list and tags, or a sheet's or database's target, on a new destination or an existing one.
  if (kind === "source" && (b.list !== undefined || b.tags !== undefined || b.target !== undefined)) {
    let cur: Record<string, unknown> = config;
    if (id && !(b.rules !== undefined)) {
      const { data: row } = await db.from("form_destinations").select("config").eq("id", id).eq("form_id", b.formId).maybeSingle();
      if (!row) return bad("Destination not found.", 404);
      cur = (row as { config: Record<string, unknown> }).config ?? {};
    }
    const pick = listOf({ list: b.list, tags: b.tags });
    if (b.list !== undefined && !pick.list) return bad("Pick a list.");
    const target = b.target !== undefined ? targetOf({ target: b.target }) : null;
    if (b.target !== undefined && !target) return bad("Pick where rows go.");
    config = { ...cur, ...(b.list !== undefined ? { list: pick.list } : {}), ...(b.tags !== undefined ? { tags: cleanTags(b.tags) } : {}), ...(target ? { target } : {}) };
    keep = true;
  }
  const { data, error } = await db.rpc("form_destination_save", {
    p_user: auth.user.id,
    p_form: b.formId,
    p_id: id,
    p_kind: kind,
    p_source: kind === "source" ? b.sourceId : null,
    p_name: name,
    p_config: keep ? config : null,
    p_mode: "upsert",
    p_sealed: sealed,
  });
  if (error) return bad(error.message);
  return Response.json({ id: data as string, ...(secret ? { secret } : {}) });
}
