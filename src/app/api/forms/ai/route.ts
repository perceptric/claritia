import Anthropic from "@anthropic-ai/sdk";
import { addUsage, cachedStep, hashKey, usageOf, type Usage } from "@/lib/ai/cache";
import { isMember } from "@/lib/contacts/server";
import { askQuestions, BUILD_MODEL, buildForm, defaultQuestions, GOALS, pickPages, readPage, writeBrief, type Brief, type Caller, type Goal } from "@/lib/forms/aiBuild";
import { hostIsPrivate } from "@/lib/privateNet";
import { requireUser } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";

// The AI form builder (docs/ai-form-builder.md). POST { workspaceId, mode, ... }:
//   read   { url }                              → { brief }       the site's home page and up to 4 more, into a brief
//   ask    { brief, goal, note }                → { questions }   3 to 5 questions for this business and goal
//   build  { brief, goal, note, answers, site } → { name, form, summary }  built, checked and fixed until it passes
// Every model call goes through the step cache. Without a key, read answers no brief, ask answers set questions, and
// build says it can't, so New form never hangs.

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
    const text = (await res.text()).slice(0, MAX_PAGE);
    return { url: u.href, html: text };
  }
  return null;
}

function claude(): Caller | null {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 180_000 });
  return async (p) => {
    const res = await client.beta.messages.create({
      model: BUILD_MODEL,
      max_tokens: p.maxTokens,
      ...(p.schema ? { output_config: { effort: p.effort, format: { type: "json_schema", schema: p.schema } } } : { output_config: { effort: p.effort } }),
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: p.system, cache_control: { type: "ephemeral" } }],
      messages: p.history ?? [{ role: "user", content: p.user }],
    } as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming);
    if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") return null;
    return { text: res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join(""), usage: res.usage };
  };
}

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
  const goal = GOALS.some((g) => g.value === b.goal) ? (b.goal as Goal) : "leads";
  const note = typeof b.note === "string" ? b.note.trim().slice(0, 1000) : "";
  const brief = b.brief && typeof b.brief === "object" ? (b.brief as Brief) : null;

  if (b.mode === "read") {
    const raw = typeof b.url === "string" ? b.url.trim() : "";
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    } catch {
      return bad("Enter the site's address, like acme.com.");
    }
    if (!url.hostname.includes(".") || url.username) return bad("Enter the site's address, like acme.com.");
    const home = await fetchPage(url.href);
    if (!home) return Response.json({ brief: null, error: "Couldn't read that site. You can go on without it." });
    const first = readPage(home.html, home.url);
    const more = (await Promise.all(pickPages(first.links).map((u) => fetchPage(u)))).filter((x): x is { url: string; html: string } => !!x).map((p) => ({ url: p.url, ...readPage(p.html, p.url) }));
    const pages = [{ url: home.url, ...first }, ...more];
    if (!model) return Response.json({ brief: null, pages: pages.length });
    const input = { url: home.url, pages: pages.map((p) => ({ url: p.url, title: p.title, text: p.text })), images: [...new Set(pages.flatMap((p) => p.images))].slice(0, 20) };
    try {
      const r = await cachedStep(rpc, ws, "form_ai_brief", hashKey(BUILD_MODEL, "brief-1", input), async () => {
        let usage = ZERO;
        const wrapped: Caller = async (p) => {
          const out = await model(p);
          if (out) usage = addUsage(usage, usageOf(out.usage));
          return out;
        };
        const brief = await writeBrief(wrapped, input);
        return { result: brief, model: BUILD_MODEL, usage, keep: !!brief };
      });
      return Response.json({ brief: r.result, pages: pages.length });
    } catch {
      return Response.json({ brief: null, pages: pages.length });
    }
  }

  if (b.mode === "ask") {
    if (!model) return Response.json({ questions: defaultQuestions(goal) });
    try {
      const r = await cachedStep(rpc, ws, "form_ai_ask", hashKey(BUILD_MODEL, "ask-1", brief, goal, note), async () => {
        let usage = ZERO;
        const questions = await askQuestions(async (p) => {
          const out = await model(p);
          if (out) usage = addUsage(usage, usageOf(out.usage));
          return out;
        }, brief, goal, note);
        return { result: questions, model: BUILD_MODEL, usage };
      });
      return Response.json({ questions: r.result });
    } catch {
      return Response.json({ questions: defaultQuestions(goal) });
    }
  }

  if (b.mode === "build") {
    if (!model) return bad("The AI builder isn't set up on this server.", 503);
    const answers = b.answers && typeof b.answers === "object" ? (b.answers as Record<string, string | string[]>) : {};
    const site = typeof b.site === "string" ? b.site.slice(0, 200) : "";
    try {
      const r = await cachedStep(rpc, ws, "form_ai_build", hashKey(BUILD_MODEL, "build-1", brief, goal, note, answers, site), async () => {
        const built = await buildForm(model, { brief, goal, note, answers, site });
        const usage = (built?.usage ?? []).reduce((a, u) => addUsage(a, usageOf(u)), ZERO);
        return { result: built ? { name: built.name, form: built.form, summary: built.summary } : null, model: BUILD_MODEL, usage, keep: !!built };
      });
      if (!r.result) return bad("Couldn't build a form that passes the checks. Try again, or add a note about what you need.", 422);
      return Response.json(r.result);
    } catch {
      return bad("The builder didn't answer. Try again in a moment.", 503);
    }
  }
  return bad("Unknown mode.");
}
