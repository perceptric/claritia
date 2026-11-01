import Anthropic from "@anthropic-ai/sdk";
import { addUsage, cachedStep, hashKey, usageOf, type Usage } from "@/lib/ai/cache";
import { isMember } from "@/lib/contacts/server";
import { lintSpec, type Spec } from "@/lib/forms/spec";
import { BUILD_MODEL, buildForm, editForm, pickPages, planForm, readPage, writeBrief, type Brief, type Caller, type Plan } from "@/lib/forms/specAi";
import { hostIsPrivate } from "@/lib/privateNet";
import { requireUser } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";

// New form's AI (docs/forms.md Part 6). POST { workspaceId, mode, ... }:
//   brief { url }                         → { brief }        the site read into a short brief (none without a site)
//   plan  { note, brief, kitId? }         → a stream of lines: { thinking } as Claude thinks, then { plan } or { error }
//   build { note, brief, plan, kitId? }   → { name, spec, thanks, questions, changed }   checked, fixed once
//   edit  { spec, ask, brief?, needEmail } → { spec, reply, changed }   small edits, all or none
// Every model call goes through the step cache: the same inputs replay the saved answer and never call the model.

export const maxDuration = 300;
const bad = (error: string, status = 400) => Response.json({ error }, { status });
const MAX_PAGE = 1_500_000;
const ZERO: Usage = { input: 0, output: 0, cache_read: 0, cache_write: 0 };

/** One page, refusing private addresses at every redirect, with a size and time limit. */
async function fetchPage(url: string): Promise<{ url: string; html: string } | null> {
  let at = url;
  for (let hop = 0; hop < 4; hop++) {
    const u = new URL(at);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (await hostIsPrivate(u.hostname)) return null;
    const res = await fetch(u, { redirect: "manual", signal: AbortSignal.timeout(8000), headers: { "user-agent": "ClaritiaFormBuilder/1.0 (+https://tryclaritia.com)", accept: "text/html" } }).catch(() => null);
    if (!res) return null;
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      at = new URL(res.headers.get("location")!, u).href;
      continue;
    }
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return null;
    return { url: u.href, html: (await res.text()).slice(0, MAX_PAGE) };
  }
  return null;
}

/** Claude: JSON answers through a schema, with adaptive thinking; streamed when the caller wants the thinking. */
function claude(): Caller | null {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 240_000 });
  return async (p) => {
    const params = {
      model: BUILD_MODEL,
      max_tokens: p.maxTokens,
      thinking: { type: "adaptive", display: p.onThinking ? "summarized" : "omitted" },
      output_config: { effort: p.effort, ...(p.schema ? { format: { type: "json_schema", schema: p.schema } } : {}) },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: p.system, cache_control: { type: "ephemeral" } }],
      messages: p.history ?? [{ role: "user", content: p.user }],
    } as unknown as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
    let res: Anthropic.Beta.BetaMessage;
    if (p.onThinking) {
      const stream = client.beta.messages.stream(params as unknown as Anthropic.Beta.Messages.MessageCreateParamsStreaming);
      for await (const ev of stream) if (ev.type === "content_block_delta" && ev.delta.type === "thinking_delta" && ev.delta.thinking) p.onThinking(ev.delta.thinking);
      res = await stream.finalMessage();
    } else res = await client.beta.messages.create(params);
    if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") return null;
    return {
      text: res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join(""),
      thinking: res.content.flatMap((b) => (b.type === "thinking" ? [b.thinking] : [])).join("\n\n"),
      usage: res.usage,
    };
  };
}

const cleanBrief = (raw: unknown): Brief | null => (raw && typeof raw === "object" && typeof (raw as Brief).name === "string" ? (raw as Brief) : null);
const cleanSpec = (raw: unknown): Spec | null => {
  const s = raw as Spec | null;
  return s && typeof s === "object" && Array.isArray(s.steps) && typeof s.submit === "string" ? s : null;
};

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (!(await isMember(auth, b.workspaceId))) return bad("Workspace not found.", 404);
  const ws = b.workspaceId as string;
  const db = serviceClient();
  if (!db) return bad("The server is not set up for this.", 500);
  const rpc = (fn: string, args: Record<string, unknown>) => db.rpc(fn, args);
  const model = claude();
  const note = typeof b.note === "string" ? b.note.trim().slice(0, 1000) : "";
  const brief = cleanBrief(b.brief);
  /** A model call that adds up what it used. */
  const counted = (usage: { value: Usage }): Caller => async (p) => {
    const out = await model!(p);
    if (out) usage.value = addUsage(usage.value, usageOf(out.usage));
    return out;
  };
  /** The kit's brand book (docs/brand-capture.md), when the site has been read deeply. */
  const bookOf = async (raw: unknown): Promise<unknown> => {
    const kitId = typeof raw === "string" && /^[0-9a-f-]{36}$/.test(raw) ? raw : null;
    if (!kitId) return null;
    const k = (await db.from("brand_kits").select("book").eq("id", kitId).eq("workspace_id", ws).maybeSingle()).data as { book?: unknown } | null;
    return k?.book ?? null;
  };

  if (b.mode === "brief") {
    const raw = typeof b.url === "string" ? b.url.trim() : "";
    if (!raw) return Response.json({ brief: null });
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    } catch {
      return bad("Enter the site's address, like acme.com.");
    }
    if (!url.hostname.includes(".") || url.username) return bad("Enter the site's address, like acme.com.");
    if (!model) return Response.json({ brief: null });
    const home = await fetchPage(url.href);
    if (!home) return Response.json({ brief: null });
    const first = readPage(home.html, home.url);
    const more = (await Promise.all(pickPages(first.links, 3).map((u) => fetchPage(u)))).filter((x): x is { url: string; html: string } => !!x).map((p) => ({ url: p.url, ...readPage(p.html, p.url) }));
    const pages = [{ url: home.url, ...first }, ...more];
    const input = { url: home.url, pages: pages.map((p) => ({ url: p.url, title: p.title, text: p.text })), images: [...new Set(pages.flatMap((p) => p.images))].slice(0, 20) };
    try {
      // Kept per site and day, so a second form on the same site skips the read.
      const day = new Date().toISOString().slice(0, 10);
      const r = await cachedStep(rpc, ws, "form_new_brief", hashKey(BUILD_MODEL, "brief-2", url.hostname, day), async () => {
        const usage = { value: ZERO };
        const out = await writeBrief(counted(usage), input);
        return { result: out, model: BUILD_MODEL, usage: usage.value, keep: !!out };
      });
      return Response.json({ brief: r.result });
    } catch {
      return Response.json({ brief: null });
    }
  }

  if (b.mode === "plan") {
    if (!model) return bad("The AI builder isn't set up on this server.", 503);
    if (!note) return bad("Describe your form first.");
    const book = await bookOf(b.kitId);
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(ctrl) {
        const send = (o: unknown) => ctrl.enqueue(enc.encode(`${JSON.stringify(o)}\n`));
        // A line every 15 seconds while Claude thinks quietly, so no proxy closes the request.
        const beat = setInterval(() => send({ beat: 1 }), 15_000);
        try {
          const r = await cachedStep(rpc, ws, "form_new_plan", hashKey(BUILD_MODEL, "plan-1", brief, book, note), async () => {
            const usage = { value: ZERO };
            const out = await planForm(counted(usage), { brief, note, book }, (t) => send({ thinking: t }));
            return { result: out, model: BUILD_MODEL, usage: usage.value, keep: !!out };
          });
          if (!r.result) send({ error: "Couldn't plan that form. Try again, or say a little more." });
          else {
            // From the cache: the thinking it had, all at once.
            if (r.cached && r.result.thinking) send({ thinking: r.result.thinking });
            send({ plan: r.result.plan });
          }
        } catch {
          send({ error: "The builder didn't answer. Try again in a moment." });
        } finally {
          clearInterval(beat);
          ctrl.close();
        }
      },
    });
    return new Response(body, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
  }

  if (b.mode === "build") {
    if (!model) return bad("The AI builder isn't set up on this server.", 503);
    const plan = b.plan as Plan | null;
    if (!note || !plan || !Array.isArray(plan.steps)) return bad("Plan the form first.");
    const book = await bookOf(b.kitId);
    try {
      const r = await cachedStep(rpc, ws, "form_new_build", hashKey(BUILD_MODEL, "build-1", brief, book, note, plan), async () => {
        const usage = { value: ZERO };
        const out = await buildForm(counted(usage), { brief, note, plan, book });
        return { result: out, model: BUILD_MODEL, usage: usage.value, keep: !!out };
      });
      if (!r.result) return bad("Couldn't build a form that passes the checks. Try again.", 422);
      return Response.json(r.result);
    } catch {
      return bad("The builder didn't answer. Try again in a moment.", 503);
    }
  }

  if (b.mode === "edit") {
    if (!model) return bad("The AI builder isn't set up on this server.", 503);
    const spec = cleanSpec(b.spec);
    const ask = typeof b.ask === "string" ? b.ask.trim().slice(0, 1000) : "";
    const needEmail = b.needEmail !== false;
    if (!spec) return bad("The form can't be read.");
    if (!ask) return bad("Say what to change.");
    // Only a form that passes the checker goes in, so a bad answer is always Claude's to fix.
    const problems = lintSpec(spec, { needEmail });
    if (problems.length) return bad(problems[0]!.text);
    try {
      const r = await cachedStep(rpc, ws, "form_new_edit", hashKey(BUILD_MODEL, "edit-1", spec, ask, brief, needEmail), async () => {
        const usage = { value: ZERO };
        const out = await editForm(counted(usage), { spec, ask, brief, needEmail });
        return { result: out, model: BUILD_MODEL, usage: usage.value, keep: !("error" in out) };
      });
      if ("error" in r.result) return bad(r.result.error, 422);
      return Response.json(r.result);
    } catch {
      return bad("The builder didn't answer. Try again in a moment.", 503);
    }
  }
  return bad("Unknown mode.");
}
