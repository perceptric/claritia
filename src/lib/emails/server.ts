import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cachedStep, hashKey } from "../ai/cache.ts";
import { appBase } from "../billing.ts";
import { EMAIL_CHAT_MODEL, EMAIL_CHAT_SYSTEM, EMAIL_CHAT_TOOLS, runEmailChat, type EmailChatCtx, type EmailChatResult, type Model } from "../design/email/chat.ts";
import type { EmailDoc } from "../design/email/doc.ts";
import { compileWithKit, loadKits } from "../design/email/server.ts";
import { readSystem } from "../design/model.ts";
import { extractLinks } from "../email/track.ts";
import { cleanTokens } from "../forms/brand.ts";
import { bookingUrl } from "../meetings/links.ts";
import { viaLink } from "../share/channels.ts";

// What the Email Studio's server parts share (docs/email-studio-plan.md Parts 3, 5 and 9): the brand and the forms
// and meetings a button can lead to for one email (the studio's chat and the MCP tools), one chat turn through the
// step cache, and an email's blocks made into what's sent (the send route and the MCP tools).

/** The email's brand kit (the one it names, else the workspace's first), its styles, and the link targets. */
export async function emailChatParts(db: SupabaseClient, ws: string, doc: EmailDoc): Promise<Pick<EmailChatCtx, "system" | "tokens" | "brand" | "links">> {
  const cols = "id, name, tokens, notes, brief, design";
  const base = appBase();
  const [named, first, forms, types, slug] = await Promise.all([
    doc.kitId ? db.from("brand_kits").select(cols).eq("workspace_id", ws).eq("id", doc.kitId).maybeSingle() : Promise.resolve({ data: null }),
    db.from("brand_kits").select(cols).eq("workspace_id", ws).order("created_at").limit(1).maybeSingle(),
    // A failed read leaves a list empty, and link_to then says there's nothing to link to.
    db.from("forms").select("id, name").eq("workspace_id", ws).eq("status", "live").order("updated_at", { ascending: false }).limit(40),
    db.from("meeting_types").select("id, name, slug").eq("workspace_id", ws).eq("active", true).order("created_at").limit(40),
    db.from("workspaces").select("booking_slug").eq("id", ws).maybeSingle(),
  ]);
  const kit = (named.data ?? first.data) as { name: string; tokens: unknown; notes: string[] | null; brief: string | null; design: unknown } | null;
  const tokens = cleanTokens((kit?.tokens ?? {}) as object).tokens;
  const wsSlug = (slug.data as { booking_slug?: string | null } | null)?.booking_slug ?? null;
  return {
    tokens,
    system: readSystem(kit?.design ?? {}, tokens),
    brand: kit ? { name: kit.name, brief: kit.brief || (kit.notes ?? []).join("\n") } : null,
    links: {
      forms: ((forms.data ?? []) as { id: string; name: string }[]).map((f) => ({ id: f.id, name: f.name, url: viaLink(`${base}/f/${f.id}`, "email") })),
      meetings: wsSlug ? ((types.data ?? []) as { id: string; name: string; slug: string }[]).map((t) => ({ id: t.id, name: t.name, url: bookingUrl(base, { workspace: wsSlug, type: t.slug }) })) : [],
    },
  };
}

/** One chat turn on an email through the step cache: the same request replays without calling the model. */
export async function emailChatTurn(db: SupabaseClient, model: Model, ws: string, ctx: EmailChatCtx, message: string): Promise<EmailChatResult> {
  const rpc = (fn: string, args: Record<string, unknown>) => db.rpc(fn, args);
  const key = hashKey(EMAIL_CHAT_MODEL, EMAIL_CHAT_SYSTEM, EMAIL_CHAT_TOOLS, ctx, message);
  return (
    await cachedStep(rpc, ws, "email_chat", key, async () => {
      const { usage, ...result } = await runEmailChat(model, message, ctx);
      return { result, model: EMAIL_CHAT_MODEL, usage, keep: !!result.reply && !result.ask };
    })
  ).result;
}

/** An email's blocks made into what goes out (the same draft styles the builder shows), or the check's first block. */
export async function buildForSend(db: SupabaseClient, ws: string, doc: EmailDoc): Promise<{ html: string; text: string; links: string[]; preheader: string } | { error: string }> {
  const kits = await loadKits(db, ws, [doc.kitId]);
  let built;
  try {
    built = compileWithKit(doc, kits, "draft");
  } catch {
    return { error: "This email couldn't be built." };
  }
  const blocked = built.notes.find((n) => n.level === "block");
  if (blocked) return { error: blocked.text };
  return { html: built.html, text: built.text, links: extractLinks(built.html), preheader: doc.settings.preheader ?? "" };
}
