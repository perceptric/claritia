import Anthropic from "@anthropic-ai/sdk";
import { cachedStep, hashKey, usageOf } from "@/lib/ai/cache";
import { isMember } from "@/lib/contacts/server";
import { buildForm, cleanCopy, cleanExtra, GOALS, PLACES, readQuestion, type Answers } from "@/lib/forms/interview";
import { requireUser } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";

// The two small AI jobs behind the questions (docs/form-builder-v2.md Part 2): POST { workspaceId, mode: "question",
// text } types a written question as a field (Claude Haiku 5.5), and { mode: "copy", answers, site } writes the
// form's words in the site's voice once, at the end (Claude Sonnet 5.5). Both go through the step cache and answer
// with the rules-based result when the model isn't set up or doesn't answer, so the form never waits on AI.

const QUESTION_MODEL = "claude-haiku-5-5";
const COPY_MODEL = "claude-sonnet-5-5";
const bad = (error: string, status = 400) => Response.json({ error }, { status });

const QUESTION_SCHEMA = {
  type: "object",
  properties: {
    label: { type: "string", description: "The question as the visitor reads it, short, in sentence case." },
    type: { type: "string", enum: ["text", "textarea", "choice", "multi", "number", "date", "url", "checkbox"] },
    options: { type: "array", items: { type: "string" }, description: "Choices for choice or multi, 2 to 8 of them. Empty otherwise." },
  },
  required: ["label", "type", "options"],
  additionalProperties: false,
};

const COPY_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    intro: { type: "string" },
    submit: { type: "string", description: "The button, 1 to 4 words." },
    thanks_title: { type: "string" },
    thanks_text: { type: "string" },
    labels: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" } }, required: ["id", "label"], additionalProperties: false } },
  },
  required: ["title", "intro", "submit", "thanks_title", "thanks_text", "labels"],
  additionalProperties: false,
};

async function ask(model: string, effort: "low" | "medium", system: string, user: string, schema: object, maxTokens: number) {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 20_000 });
  const res = await client.beta.messages.create({
    model,
    max_tokens: maxTokens,
    output_config: { effort, format: { type: "json_schema", schema } },
    ...(model === COPY_MODEL ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {}),
    system,
    messages: [{ role: "user", content: user }],
  } as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming);
  if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") return null;
  const text = res.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") return null;
  return { output: JSON.parse(text.text) as unknown, usage: usageOf(res.usage) };
}

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const b = (await request.json().catch(() => ({}))) as { workspaceId?: unknown; mode?: unknown; text?: unknown; answers?: unknown; site?: unknown };
  if (!(await isMember(auth, b.workspaceId))) return bad("Workspace not found.", 404);
  const ws = b.workspaceId as string;
  const db = serviceClient();
  const rpc = db ? (fn: string, args: Record<string, unknown>) => db.rpc(fn, args) : null;

  if (b.mode === "question") {
    const text = typeof b.text === "string" ? b.text.trim().slice(0, 300) : "";
    if (!text) return bad("Type a question.");
    const fallback = readQuestion(text);
    if (!rpc || !process.env.ANTHROPIC_API_KEY) return Response.json({ field: fallback });
    const system =
      "You turn one question a business wants to ask on a web form into a form field. Keep the person's meaning and wording; fix only case and punctuation. Pick the field type a visitor can answer fastest: choice for one of a few known answers, multi for several, number, date, url, checkbox for one yes, textarea for open answers, text otherwise. Give choices only when the answers are a short known list.";
    try {
      const r = await cachedStep(rpc, ws, "form_question", hashKey(QUESTION_MODEL, system, text), async () => {
        const out = await ask(QUESTION_MODEL, "low", system, text, QUESTION_SCHEMA, 2000);
        return { result: out?.output ?? null, model: QUESTION_MODEL, usage: out?.usage ?? { input: 0, output: 0, cache_read: 0, cache_write: 0 }, keep: !!out };
      });
      return Response.json({ field: cleanExtra(r.result, text) ?? fallback });
    } catch {
      return Response.json({ field: fallback });
    }
  }

  if (b.mode === "copy") {
    const answers = b.answers as Answers;
    if (!answers || typeof answers !== "object" || !GOALS[answers.goal]) return bad("Bad answers.");
    let form;
    try {
      form = buildForm(answers);
    } catch {
      return bad("Bad answers.");
    }
    if (!rpc || !process.env.ANTHROPIC_API_KEY) return Response.json({ copy: {} });
    const site = typeof b.site === "string" ? b.site.trim().slice(0, 200) : "";
    const [kit] = site ? (((await db!.from("brand_kits").select("notes, site_forms").eq("workspace_id", ws).ilike("source_url", `%${site.replace(/[%_]/g, "")}%`).limit(1)).data ?? []) as { notes: string[]; site_forms: unknown }[]) : [];
    const system =
      "You write the words on a web form for a company's site: a short title and intro, the button, the thank-you title and line, and the field labels. Plain words, sentence case, no exclamation marks, no emoji, no hype. Labels say what to type in two to four words. The button says what happens (Book a demo, Get the guide). Keep each field's meaning; return a label for every field id you are given.";
    const user = JSON.stringify({
      goal: GOALS[answers.goal].label,
      placement: PLACES.find((p) => p.value === answers.place)?.label,
      site,
      site_notes: kit?.notes ?? [],
      forms_on_site: kit?.site_forms ?? [],
      fields: form.steps.flatMap((s) => s.fields).map((f) => ({ id: f.id, label: f.label, type: f.type })),
      next_step: answers.after.kind === "meeting" ? "they pick a meeting time right after" : answers.after.kind === "redirect" ? "they go to another page" : "they see a thank-you message",
    });
    try {
      const r = await cachedStep(rpc, ws, "form_copy", hashKey(COPY_MODEL, system, user), async () => {
        const out = await ask(COPY_MODEL, "low", system, user, COPY_SCHEMA, 4000);
        return { result: out?.output ?? null, model: COPY_MODEL, usage: out?.usage ?? { input: 0, output: 0, cache_read: 0, cache_write: 0 }, keep: !!out };
      });
      return Response.json({ copy: cleanCopy(r.result, form) });
    } catch {
      return Response.json({ copy: {} });
    }
  }
  return bad("Unknown mode.");
}
