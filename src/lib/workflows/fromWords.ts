// Automations from a sentence (docs/email-studio-plan.md Part 6): a person types what should happen ("when someone
// signs up for the workshop, send what to bring two days later, stop if they book") and Tia answers with one tool call
// that describes a draft workflow: its trigger, a column of emails and delays, and whether it stops on a booking.
// The answer is turned into a workflow body here and checked by cleanBody, so only real triggers and steps survive.
// Forms, meeting types and lists are named by id from the workspace's own lists; a button goes to one of the
// workspace's forms or meetings by id (its address comes from the server), or to an address the person typed. Every
// email starts unapproved and marked as made by AI, so nothing sends until a person reads it. Server only; tests pass a
// scripted model.

import type Anthropic from "@anthropic-ai/sdk";
import { usageOf, type Usage } from "../ai/cache.ts";
import type { Model } from "../ai/chatModel.ts";
import { cleanBody } from "./check.ts";
import type { Body } from "./types.ts";

export type Target = { id: string; name: string; url?: string };
export type FromWordsCtx = {
  forms: Target[];
  meetings: Target[];
  lists: Target[];
  /** The brand's name and written brief: the emails' voice. */
  brand?: { name: string; brief?: string } | null;
};
export type FromWords = { name: string; body: Body } | { error: string };

export const AUTOMATION_SYSTEM = `You turn one person's description of an automation into a draft workflow for Claritia, a tool for forms, meetings and email. You answer only by calling make_automation once.

- The trigger is one of: form (someone sends a form), not_booked (someone sends a form and doesn't book a meeting after), meeting (a meeting is booked, canceled, held or a no-show), list (someone joins a list), clicked (someone clicks an email). Name forms, meeting types and lists only by the ids listed; leave the ids empty to mean any.
- Steps run top to bottom: email, or wait (days and hours). Put a wait between emails. Keep it to what was asked, at most 8 steps.
- Set stop_when_booked when the person wants it to stop once someone books, or when the emails ask people to book.
- Each email: a short subject, preview text, 1 to 4 short paragraphs and, when it helps, one button. Write in the brand's voice from its brief, plainly, with no hype and no exclamation marks. Greet with {{first_name|there}}. Never invent prices, dates, names or facts; write a clear placeholder like [your date] instead.
- A button leads to one of the listed forms or meetings by link_kind and link_id, or to a web address only when the person typed that address.
- Name the workflow in a few words.`;

const STEP = {
  type: "object",
  properties: {
    type: { type: "string", enum: ["email", "wait"] },
    days: { type: "integer", minimum: 0, maximum: 60 },
    hours: { type: "integer", minimum: 0, maximum: 23 },
    subject: { type: "string" },
    preview: { type: "string" },
    paragraphs: { type: "array", items: { type: "string" }, maxItems: 4 },
    button_label: { type: "string" },
    link_kind: { type: "string", enum: ["form", "meeting", "url"] },
    link_id: { type: "string" },
    url: { type: "string" },
  },
  required: ["type"],
} as const;

export const AUTOMATION_TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "make_automation",
    description: "The draft workflow: its name, trigger, steps and whether it stops when someone books.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        trigger: {
          type: "object",
          properties: {
            kind: { type: "string", enum: ["form", "not_booked", "meeting", "list", "clicked"] },
            ids: { type: "array", items: { type: "string" } },
            meeting_events: { type: "array", items: { type: "string", enum: ["booked", "canceled", "held", "no_show"] } },
          },
          required: ["kind"],
        },
        stop_when_booked: { type: "boolean" },
        steps: { type: "array", items: STEP, minItems: 1, maxItems: 8 },
      },
      required: ["name", "trigger", "steps"],
    },
  },
];

/** What the model reads besides the person's words: the ids it may use. */
export function automationContext(ctx: FromWordsCtx): string {
  const list = (title: string, xs: Target[]) => (xs.length ? `${title}:\n${xs.map((x) => `${x.id}: ${x.name}`).join("\n")}` : `${title}: none`);
  return [
    ctx.brand ? `Brand: ${ctx.brand.name}${ctx.brand.brief ? `\nBrief: ${ctx.brand.brief.slice(0, 3000)}` : ""}` : "",
    list("Forms", ctx.forms),
    list("Meeting types", ctx.meetings),
    list("Lists", ctx.lists),
  ]
    .filter(Boolean)
    .join("\n\n");
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
let n = 0;
const stepId = () => `s${Date.now().toString(36)}${(n++).toString(36)}`;

/** The tool call turned into a checked workflow body, or why it can't be used. `typed` is the person's words. */
export function bodyFromTool(input: Record<string, unknown>, ctx: FromWordsCtx, typed: string): FromWords {
  const t = (input.trigger && typeof input.trigger === "object" ? input.trigger : {}) as Record<string, unknown>;
  const pick = (xs: Target[]) => (Array.isArray(t.ids) ? t.ids : []).filter((id): id is string => typeof id === "string" && xs.some((x) => x.id === id));
  const trigger =
    t.kind === "form" || t.kind === "not_booked"
      ? { kind: t.kind, forms: pick(ctx.forms) }
      : t.kind === "meeting"
        ? { kind: "meeting", events: Array.isArray(t.meeting_events) && t.meeting_events.length ? t.meeting_events : ["booked"], types: pick(ctx.meetings) }
        : t.kind === "list"
          ? { kind: "list", lists: pick(ctx.lists).slice(0, 1) }
          : t.kind === "clicked"
            ? { kind: "clicked", emails: [] }
            : null;
  if (!trigger) return { error: "Say what starts it: a form, a booking, a list or a click." };
  const steps: unknown[] = [];
  for (const raw of (Array.isArray(input.steps) ? input.steps : []).slice(0, 8)) {
    const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    if (s.type === "wait") {
      const days = Math.max(0, Math.min(60, Math.round(Number(s.days) || 0)));
      const hours = Math.max(0, Math.min(23, Math.round(Number(s.hours) || 0)));
      if (days || hours) steps.push({ id: stepId(), kind: "wait", days, hours });
      continue;
    }
    if (s.type !== "email") continue;
    const subject = str(s.subject, 200);
    const paragraphs = (Array.isArray(s.paragraphs) ? s.paragraphs : []).map((p) => str(p, 2000)).filter(Boolean).slice(0, 4);
    if (!subject || !paragraphs.length) continue;
    // A button's address: a listed form or meeting by id, or an address the person typed themselves.
    const target = s.link_kind === "form" ? ctx.forms.find((f) => f.id === s.link_id) : s.link_kind === "meeting" ? ctx.meetings.find((m) => m.id === s.link_id) : null;
    const typedUrl = s.link_kind === "url" && typeof s.url === "string" && /^https:\/\/\S+$/.test(s.url.trim()) && typed.includes(s.url.trim().replace(/^https:\/\//, "")) ? s.url.trim() : "";
    const url = target?.url ?? typedUrl;
    const label = url ? str(s.button_label, 60) || (s.link_kind === "meeting" ? "Book a time" : target?.name ?? "Open") : "";
    steps.push({ id: stepId(), kind: "email", email: { subject, preheader: str(s.preview, 200), paragraphs, cta_label: label, cta_url: url }, from: "team", approved: false, ai: true });
  }
  if (!steps.some((s) => (s as { kind: string }).kind === "email")) return { error: "Tia couldn't write an email for that. Say what the emails should be about." };
  // A delay at the end does nothing; drop it.
  while ((steps.at(-1) as { kind: string } | undefined)?.kind === "wait") steps.pop();
  const body = cleanBody({ trigger, steps, goals: input.stop_when_booked === true ? [{ kind: "meeting_booked" }] : [], entry: { mode: "once", gapDays: 30 } });
  if (!body.trigger) return { error: "Say what starts it: a form, a booking, a list or a click." };
  return { name: str(input.name, 120) || "New automation", body };
}

/** One call to the model, then the answer checked. */
export async function automationFromWords(model: Model, words: string, ctx: FromWordsCtx): Promise<FromWords & { usage: Usage }> {
  const msg = await model({
    system: [{ type: "text", text: AUTOMATION_SYSTEM, cache_control: { type: "ephemeral" } }],
    tools: AUTOMATION_TOOLS,
    messages: [{ role: "user", content: `${automationContext(ctx)}\n\nWhat the person wants:\n${words}` }],
  });
  const usage = usageOf(msg.usage);
  const call = msg.content.find((c): c is Anthropic.Beta.BetaToolUseBlock => c.type === "tool_use" && c.name === "make_automation");
  if (!call) return { error: "Tia didn't build it. Try saying it another way.", usage };
  return { ...bodyFromTool(call.input as Record<string, unknown>, ctx, words), usage };
}
