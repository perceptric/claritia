import { cachedStep, hashKey } from "@/lib/ai/cache";
import { isMember } from "@/lib/contacts/server";
import { EMAIL_CHAT_MODEL, EMAIL_CHAT_SYSTEM, EMAIL_CHAT_TOOLS, runEmailChat, type EmailChatCtx, type EmailChatResult } from "@/lib/design/email/chat";
import { readEmailDoc } from "@/lib/design/email/doc";
import { readSystem } from "@/lib/design/model";
import { cleanTokens } from "@/lib/forms/brand";
import { claudeChat } from "@/lib/forms/claude";
import { requireUser } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";

// One AI turn on an email built with blocks (docs/design-system.md Part 7.2): POST { workspaceId, ref?, doc, subject,
// message, history?, confirmed?, variants? }. The email and the brand kit's draft styles go to runEmailChat through
// the step cache, so the same request replays without calling the model. Each change is saved as a version under
// `ref` (with the email as it was before the first one). With variants: 3, three different takes come back to pick
// from (for an A/B send).

const bad = (error: string, status = 400) => Response.json({ error }, { status });
const REF = /^(wf:[0-9a-f-]{36}:[A-Za-z0-9_-]{1,40}|tpl:[0-9a-f-]{36})$/;

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const text = await request.text();
  if (text.length > 900_000) return bad("That email is too big.", 413);
  const b = (JSON.parse(text || "{}") ?? {}) as { workspaceId?: unknown; ref?: unknown; doc?: unknown; subject?: unknown; message?: unknown; history?: unknown; confirmed?: unknown; variants?: unknown };
  if (!(await isMember(auth, b.workspaceId))) return bad("Workspace not found.", 404);
  const ws = b.workspaceId as string;
  const message = typeof b.message === "string" ? b.message.trim().slice(0, 4000) : "";
  if (!message) return bad("Say what to change.");
  const db = serviceClient();
  if (!db) return bad("The server is not set up for this.", 500);
  const model = claudeChat();
  if (!model) return bad("The AI isn't set up on the server (ANTHROPIC_API_KEY).", 503);

  const doc = readEmailDoc(b.doc, { allowHtml: true });
  const { data: kits } = await db.from("brand_kits").select("id, name, tokens, notes, design").eq("workspace_id", ws).order("created_at");
  const kit = (kits ?? []).find((k) => k.id === doc.kitId) ?? (kits ?? [])[0];
  const tokens = cleanTokens(kit?.tokens ?? {}).tokens;
  const system = readSystem(kit?.design ?? {}, tokens);
  const history = (Array.isArray(b.history) ? b.history : [])
    .filter((h): h is { role: "user" | "assistant"; text: string } => !!h && (h.role === "user" || h.role === "assistant") && typeof h.text === "string")
    .slice(-10);
  const ctx: EmailChatCtx = {
    doc,
    system,
    tokens,
    subject: typeof b.subject === "string" ? b.subject.slice(0, 200) : "",
    brand: kit ? { name: kit.name as string, brief: ((kit.notes as string[] | null) ?? []).join("\n") } : null,
    history,
    confirmed: b.confirmed === true,
  };
  const rpc = (fn: string, args: Record<string, unknown>) => db.rpc(fn, args);
  const count = b.variants === 3 ? 3 : 1;
  const turn = async (i: number): Promise<EmailChatResult> => {
    const ask = count > 1 ? `${message}\n\n(Version ${i + 1} of 3: make this one clearly different from the other two in tone and layout.)` : message;
    const key = hashKey(EMAIL_CHAT_MODEL, EMAIL_CHAT_SYSTEM, EMAIL_CHAT_TOOLS, ctx, ask);
    return (
      await cachedStep(rpc, ws, "email_chat", key, async () => {
        const { usage, ...result } = await runEmailChat(model, ask, ctx);
        return { result, model: EMAIL_CHAT_MODEL, usage, keep: !!result.reply && !result.ask };
      })
    ).result;
  };
  let outs: EmailChatResult[];
  try {
    outs = await Promise.all(Array.from({ length: count }, (_, i) => turn(i)));
  } catch (e) {
    return bad(`The AI didn't answer: ${e instanceof Error ? e.message.slice(0, 200) : "try again"}`, 502);
  }
  const ref = typeof b.ref === "string" && REF.test(b.ref) ? b.ref : null;
  if (ref && count === 1 && outs[0]!.lines.length) {
    const { count: n } = await db.from("email_versions").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("ref", ref);
    if (!n) await db.rpc("email_version_add", { p_ws: ws, p_user: auth.user.id, p_ref: ref, p_doc: doc, p_subject: ctx.subject, p_note: "Before the AI", p_ai: false });
    await db.rpc("email_version_add", { p_ws: ws, p_user: auth.user.id, p_ref: ref, p_doc: outs[0]!.doc, p_subject: outs[0]!.subject, p_note: message.slice(0, 300), p_ai: true });
  }
  const out = (r: EmailChatResult) => ({ doc: r.doc, system: JSON.stringify(r.system) === JSON.stringify(system) ? null : r.system, subject: r.subject, reply: r.reply, lines: r.lines, ask: r.ask ?? null });
  return Response.json(count === 1 ? out(outs[0]!) : { variants: outs.map(out) });
}
