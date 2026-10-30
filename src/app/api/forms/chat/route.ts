import { cachedStep, hashKey } from "@/lib/ai/cache";
import { isMember } from "@/lib/contacts/server";
import { CHAT_MODEL, CHAT_SYSTEM, CHAT_TOOLS, runChat, type ChatCtx, type ChatResult } from "@/lib/forms/chat";
import { claudeChat } from "@/lib/forms/claude";
import { emptyForm, type Form } from "@/lib/forms/schema";
import { cleanTokens } from "@/lib/forms/brand";
import { callNewer } from "@/lib/forms/newer";
import { readSystem } from "@/lib/design/model";
import { requireUser } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";

// One change asked of a form: POST { workspaceId, id, rev, message, confirmed? } (docs/form-builder.md 4.2). The
// builder's AI bar saves its draft first and sends the draft_rev it holds; the changes are saved as the next draft and
// come back with the new rev. Nothing of the conversation is kept: each ask reads the form as it is now. The same
// request on the same form replays from the step cache.

const bad = (error: string, status = 400) => Response.json({ error }, { status });

type Db = NonNullable<ReturnType<typeof serviceClient>>;

/** The answer keys the form's last 300 fills used: the keys alone from the database (090), else read from the fills. */
async function usedKeysOf(db: Db, rpc: (fn: string, args: Record<string, unknown>) => ReturnType<Db["rpc"]>, form: string): Promise<string[]> {
  const keys = await callNewer(rpc, "form_submission_keys", { p_form: form });
  if (keys && !keys.error) return [...((keys.data as string[] | null) ?? [])].sort();
  const fills = await db.from("submissions").select("values").eq("form_id", form).eq("spam", false).order("created_at", { ascending: false }).limit(300);
  return [...new Set(((fills.data ?? []) as { values: Record<string, unknown> }[]).flatMap((s) => Object.keys(s.values ?? {})))].sort();
}

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const b = (await request.json().catch(() => ({}))) as { workspaceId?: unknown; id?: unknown; rev?: unknown; message?: unknown; confirmed?: unknown };
  if (!(await isMember(auth, b.workspaceId))) return bad("Workspace not found.", 404);
  const ws = b.workspaceId as string;
  if (typeof b.id !== "string" || !/^[0-9a-f-]{36}$/.test(b.id)) return bad("Form not found.", 404);
  const message = typeof b.message === "string" ? b.message.trim().slice(0, 4000) : "";
  if (!message) return bad("Say what to change.");
  const db = serviceClient();
  if (!db) return bad("The server is not set up for this.", 500);
  const model = claudeChat();
  if (!model) return bad("The chat isn't set up on the server (ANTHROPIC_API_KEY).", 503);

  const { data: f } = await db.from("forms").select("id, name, draft, draft_rev, brand_kit_id").eq("id", b.id).eq("workspace_id", ws).maybeSingle();
  if (!f) return bad("Form not found.", 404);
  if (typeof b.rev === "number" && b.rev !== f.draft_rev) return bad("This form changed in another window. Reload to see the latest.", 409);
  const rpc = (fn: string, args: Record<string, unknown>) => db.rpc(fn, args);
  const [custom, kit, sources, dests, usedKeys] = await Promise.all([
    db.from("fields").select("key, label, type").eq("workspace_id", ws).eq("object", "contact"),
    f.brand_kit_id ? db.from("brand_kits").select("name, source_url, site_forms, tokens, design, design_rev").eq("id", f.brand_kit_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from("sources").select("name").eq("workspace_id", ws).neq("status", "disconnected"),
    db.from("form_destinations").select("name").eq("form_id", f.id),
    usedKeysOf(db, rpc, f.id),
  ]);
  const draft = f.draft as Partial<Form>;
  const k = kit.data as { name: string; source_url: string | null; site_forms: unknown; tokens?: unknown; design?: unknown; design_rev?: number } | null;
  const tokens = cleanTokens((k?.tokens ?? {}) as object).tokens;
  const ctx: ChatCtx = {
    form: draft && Array.isArray(draft.steps) ? (draft as Form) : emptyForm(),
    custom: (custom.data ?? []) as ChatCtx["custom"],
    brand: k ? ({ name: k.name, source_url: k.source_url, site_forms: k.site_forms } as ChatCtx["brand"]) : null,
    // Styles at "all forms" or a class change the kit's design system; without a kit only this form's own styles.
    ...(k ? { system: readSystem(k.design ?? {}, tokens), tokens } : { tokens }),
    tools: ((sources.data ?? []) as { name: string }[]).map((s) => s.name),
    destinations: ((dests.data ?? []) as { name: string }[]).map((d) => d.name),
    history: [],
    confirmed: b.confirmed === true,
    usedKeys,
  };
  let out: ChatResult;
  try {
    const key = hashKey(CHAT_MODEL, CHAT_SYSTEM, CHAT_TOOLS, ctx, message);
    out = (
      await cachedStep(rpc, ws, "form_chat", key, async () => {
        const r = await runChat(model, message, ctx);
        const { usage, ...result } = r;
        return { result, model: CHAT_MODEL, usage, keep: !!result.reply };
      })
    ).result;
  } catch (e) {
    return bad(`The chat didn't answer: ${e instanceof Error ? e.message.slice(0, 200) : "try again"}`, 502);
  }

  // The chat changed the brand's styles: save the kit's draft (refused if someone saved it since).
  if (out.system && k && f.brand_kit_id) {
    const saved = await db.rpc("brand_kit_design_save", { p_user: auth.user.id, p_id: f.brand_kit_id, p_design: out.system, p_rev: k.design_rev ?? 0 });
    if (saved.error) return bad(/Changed elsewhere/.test(saved.error.message) ? "Someone changed the brand's styles at the same time. Try again." : "Try again in a moment.", 409);
  }
  let rev = f.draft_rev as number;
  if (out.lines.length) {
    const saved = await auth.sb.rpc("form_save", { p_id: f.id, p_name: f.name, p_draft: out.form, p_rev: rev, p_brand_kit: f.brand_kit_id });
    if (saved.error) return bad(saved.error.message, 409);
    rev = saved.data as number;
  }
  return Response.json({ form: out.form, rev, reply: out.reply, lines: out.lines, ask: out.ask ?? null, styles: !!out.system });
}
