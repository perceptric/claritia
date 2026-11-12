import { cachedStep, hashKey, OutOfCredits } from "@/lib/ai/cache";
import { CHAT_MODEL } from "@/lib/ai/chatModel";
import { appBase } from "@/lib/billing";
import { isMember } from "@/lib/contacts/server";
import { claudeChat } from "@/lib/forms/claude";
import { bookingUrl } from "@/lib/meetings/links";
import { viaLink } from "@/lib/share/channels";
import { requireUser } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";
import { AUTOMATION_SYSTEM, AUTOMATION_TOOLS, automationFromWords, type FromWords, type FromWordsCtx } from "@/lib/workflows/fromWords";

// An automation from a sentence (docs/email-studio-plan.md Part 6): POST { workspaceId, words } answers { name, body }
// for a draft workflow, or { error }. The workspace's forms, meeting types and lists (by id, with the forms' and
// meetings' public addresses) and its brand brief go to the model through the step cache, so the same words on the
// same workspace replay without a call. The person's own client saves the draft, so nothing is saved here.

const bad = (error: string, status = 400) => Response.json({ error }, { status });

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const b = (await request.json().catch(() => ({}))) as { workspaceId?: unknown; words?: unknown };
  if (!(await isMember(auth, b.workspaceId))) return bad("Workspace not found.", 404);
  const ws = b.workspaceId as string;
  const words = typeof b.words === "string" ? b.words.trim().slice(0, 2000) : "";
  if (words.length < 8) return bad("Say what should happen, in a sentence or two.");
  const db = serviceClient();
  if (!db) return bad("The server is not set up for this.", 500);
  const model = claudeChat();
  if (!model) return bad("The AI isn't set up on the server (ANTHROPIC_API_KEY).", 503);

  const base = appBase();
  const [forms, types, lists, slug, kit] = await Promise.all([
    db.from("forms").select("id, name, status").eq("workspace_id", ws).order("updated_at", { ascending: false }).limit(40),
    db.from("meeting_types").select("id, name, slug").eq("workspace_id", ws).eq("active", true).order("created_at").limit(40),
    db.from("lists").select("id, name").eq("workspace_id", ws).order("name").limit(60),
    db.from("workspaces").select("booking_slug").eq("id", ws).maybeSingle(),
    db.from("brand_kits").select("name, brief, notes").eq("workspace_id", ws).order("created_at").limit(1).maybeSingle(),
  ]);
  const wsSlug = (slug.data as { booking_slug?: string | null } | null)?.booking_slug ?? null;
  const k = kit.data as { name: string; brief: string | null; notes: string[] | null } | null;
  const ctx: FromWordsCtx = {
    // Every form can start an automation; only live ones get a button, since a draft has no page yet.
    forms: ((forms.data ?? []) as { id: string; name: string; status: string }[]).map((f) => ({ id: f.id, name: f.name, ...(f.status === "live" ? { url: viaLink(`${base}/f/${f.id}`, "email") } : {}) })),
    meetings: ((types.data ?? []) as { id: string; name: string; slug: string }[]).map((t) => ({ id: t.id, name: t.name, ...(wsSlug ? { url: bookingUrl(base, { workspace: wsSlug, type: t.slug }) } : {}) })),
    lists: (lists.data ?? []) as { id: string; name: string }[],
    brand: k ? { name: k.name, brief: k.brief || (k.notes ?? []).join("\n") } : null,
  };
  const rpc = (fn: string, args: Record<string, unknown>) => db.rpc(fn, args);
  try {
    const key = hashKey(CHAT_MODEL, AUTOMATION_SYSTEM, AUTOMATION_TOOLS, ctx, words);
    const { result } = await cachedStep<FromWords>(rpc, ws, "automation_build", key, async () => {
      const { usage, ...r } = await automationFromWords(model, words, ctx);
      return { result: r, model: CHAT_MODEL, usage, keep: !("error" in r) };
    });
    if ("error" in result) return bad(result.error);
    return Response.json(result);
  } catch (e) {
    if (e instanceof OutOfCredits) return bad(e.message, 402);
    const msg = e instanceof Error ? e.message : "";
    return bad(`Tia didn't answer: ${msg.slice(0, 200) || "try again"}`, 502);
  }
}
