import { cachedStep, hashKey } from "@/lib/ai/cache";
import { isMember } from "@/lib/contacts/server";
import { EMAIL_CHAT_MODEL, EMAIL_CHAT_SYSTEM, EMAIL_CHAT_TOOLS, runEmailChat, type EmailChatCtx } from "@/lib/design/email/chat";
import { buildMessage, planSeries, readPlan, seriesStartDoc, SERIES_MODEL, SERIES_SYSTEM, PLAN_TOOL, type PlanItem } from "@/lib/design/email/series";
import { claudeChat } from "@/lib/forms/claude";
import { emailChatParts } from "@/lib/emails/server";
import { requireUser } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";

// Many new emails from one prompt (docs/email-canvas-b5.md section 3). POST { workspaceId, step: "plan", message,
// group, history? } plans a series (names, subjects, one line each, at most 10) or answers with a question;
// POST { workspaceId, step: "build", items, index, message, kitId? } writes one email of the plan through the email
// chat and sends it back, for the browser to save as a draft in the group. Both go through the step cache.

const bad = (error: string, status = 400) => Response.json({ error }, { status });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const text = await request.text();
  if (text.length > 200_000) return bad("That's too big.", 413);
  const b = (JSON.parse(text || "{}") ?? {}) as { workspaceId?: unknown; step?: unknown; message?: unknown; group?: unknown; history?: unknown; items?: unknown; index?: unknown; kitId?: unknown };
  if (!(await isMember(auth, b.workspaceId))) return bad("Workspace not found.", 404);
  const ws = b.workspaceId as string;
  const message = typeof b.message === "string" ? b.message.trim().slice(0, 4000) : "";
  if (!message) return bad("Say what to write.");
  const db = serviceClient();
  if (!db) return bad("The server is not set up for this.", 500);
  const model = claudeChat();
  if (!model) return bad("The AI isn't set up on the server (ANTHROPIC_API_KEY).", 503);
  const rpc = (fn: string, args: Record<string, unknown>) => db.rpc(fn, args);
  const history = (Array.isArray(b.history) ? b.history : [])
    .filter((h): h is { role: "user" | "assistant"; text: string } => !!h && (h.role === "user" || h.role === "assistant") && typeof h.text === "string")
    .slice(-10);

  try {
    if (b.step === "plan") {
      const parts = await emailChatParts(db, ws, seriesStartDoc(0));
      const ctx = { group: typeof b.group === "string" ? b.group.slice(0, 200) : "", brand: parts.brand ?? null, history };
      const key = hashKey(SERIES_MODEL, SERIES_SYSTEM, PLAN_TOOL, ctx, message);
      const r = await cachedStep(rpc, ws, "email_series_plan", key, async () => {
        const { usage, ...result } = await planSeries(model, message, ctx);
        return { result, model: SERIES_MODEL, usage, keep: result.plan.length > 0 };
      });
      return Response.json(r.result);
    }
    if (b.step === "build") {
      const items: PlanItem[] = readPlan({ emails: b.items });
      const index = typeof b.index === "number" && Number.isInteger(b.index) ? b.index : -1;
      if (!items[index]) return bad("Pick an email of the plan.");
      const kitId = typeof b.kitId === "string" && UUID.test(b.kitId) ? b.kitId : undefined;
      const doc = seriesStartDoc(index, kitId);
      const parts = await emailChatParts(db, ws, doc);
      const ctx: EmailChatCtx = { doc, ...parts, subject: items[index]!.subject, history: [], confirmed: true };
      const ask = buildMessage(items, index, message);
      const key = hashKey(EMAIL_CHAT_MODEL, EMAIL_CHAT_SYSTEM, EMAIL_CHAT_TOOLS, ctx, ask);
      const r = await cachedStep(rpc, ws, "email_series_build", key, async () => {
        const { usage, ...result } = await runEmailChat(model, ask, ctx);
        return { result: { doc: result.doc, subject: result.subject || items[index]!.subject }, model: EMAIL_CHAT_MODEL, usage, keep: result.lines.length > 0 };
      });
      return Response.json(r.result);
    }
    return bad("Unknown step.");
  } catch (e) {
    return bad(`The AI didn't answer: ${e instanceof Error ? e.message.slice(0, 200) : "try again"}`, 502);
  }
}
