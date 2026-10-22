// The form chat (docs/form-builder.md 4.2). Claude edits the form only through tools, and each tool is one op
// (src/lib/forms/ops.ts) that is checked before it applies: an op that would leave the form with a new problem is
// refused and the error goes back to the model, which fixes it in the same turn. The model never writes HTML or CSS.
// It asks before three things: turning off the consent box, removing a field past fills used, and replacing the
// whole form with a template. Server only.

import type Anthropic from "@anthropic-ai/sdk";
import { addUsage, usageOf, type Usage } from "../ai/cache.ts";
import { applyStrict, describeOp, type FieldInput, type Op } from "./ops.ts";
import { allFields, CONTACT_KEYS, FIELD_TYPES, type FieldType, type Form, type Rule } from "./schema.ts";
import { TEMPLATES } from "./templates.ts";

export const CHAT_MODEL = "claude-sonnet-5-5";
const MAX_ROUNDS = 6;

export type ChatCtx = {
  form: Form;
  custom: { key: string; label: string; type: string }[];
  brand?: { name: string; source_url: string | null; site_forms: { url: string; fields: { label: string; type: string }[]; button?: string }[] } | null;
  /** Connected tools and the form's destinations, by name. */
  tools: string[];
  destinations: string[];
  history: { role: "user" | "assistant"; text: string }[];
  /** The person said yes to the last question. */
  confirmed?: boolean;
  /** Field keys that past fills used. */
  usedKeys?: string[];
};

export type ChatResult = { form: Form; ops: Op[]; lines: string[]; reply: string; ask?: { question: string; choices: string[] } };

/** One model call. The route passes Claude; tests pass a script. */
export type Model = (params: { system: Anthropic.Beta.BetaTextBlockParam[]; tools: Anthropic.Beta.BetaTool[]; messages: Anthropic.Beta.BetaMessageParam[] }) => Promise<Anthropic.Beta.BetaMessage>;

const TYPES = FIELD_TYPES.map((t) => t.value);
const FIELD_PROPS = {
  type: { type: "string", enum: TYPES },
  label: { type: "string" },
  key: { type: "string", description: `Where the answer saves: one of ${CONTACT_KEYS.map((c) => c.key).join(", ")}, or f.<custom field key>. Leave it out for a question of its own.` },
  required: { type: "boolean" },
  placeholder: { type: "string" },
  help: { type: "string" },
  options: { type: "array", items: { type: "string" }, description: "For choice and multi fields." },
  width: { type: "string", enum: ["full", "half"] },
  check: { type: "string", enum: ["work_email"], description: "Email fields: refuse free email addresses." },
  hidden: {
    type: "object",
    properties: { from: { type: "string", enum: ["param", "page", "referrer", "static"] }, name: { type: "string" }, value: { type: "string" } },
    required: ["from"],
  },
} as const;

export const CHAT_TOOLS: Anthropic.Beta.BetaTool[] = [
  { name: "add_field", description: "Add a field. Without step it goes at the end of the last step.", input_schema: { type: "object", properties: { field: { type: "object", properties: FIELD_PROPS, required: ["type", "label"] }, step: { type: "integer", minimum: 0 }, after_field_id: { type: "string" } }, required: ["field"] } },
  { name: "update_field", description: "Change a field by its id.", input_schema: { type: "object", properties: { field_id: { type: "string" }, changes: { type: "object", properties: FIELD_PROPS } }, required: ["field_id", "changes"] } },
  { name: "remove_field", description: "Remove a field by its id. The email field can't be removed.", input_schema: { type: "object", properties: { field_id: { type: "string" } }, required: ["field_id"] } },
  { name: "move_field", description: "Move a field to a step (0-based) and position.", input_schema: { type: "object", properties: { field_id: { type: "string" }, step: { type: "integer", minimum: 0 }, index: { type: "integer", minimum: 0 } }, required: ["field_id", "step", "index"] } },
  { name: "add_step", description: "Add a step at the end, for a multi-step form.", input_schema: { type: "object", properties: { title: { type: "string" } } } },
  { name: "rename_step", description: "Set a step's title.", input_schema: { type: "object", properties: { step: { type: "integer", minimum: 0 }, title: { type: "string" } }, required: ["step", "title"] } },
  { name: "remove_step", description: "Remove a step; its fields join the step before.", input_schema: { type: "object", properties: { step: { type: "integer", minimum: 0 } }, required: ["step"] } },
  {
    name: "set_rule",
    description: "Show, hide or require a field depending on another field's answer. Pass rule_id to change an existing rule.",
    input_schema: {
      type: "object",
      properties: {
        rule_id: { type: "string" },
        target_field_id: { type: "string" },
        action: { type: "string", enum: ["show", "hide", "require"] },
        when_field_id: { type: "string" },
        op: { type: "string", enum: ["is", "is_not", "filled", "empty"] },
        value: { type: "string" },
      },
      required: ["target_field_id", "action", "when_field_id", "op"],
    },
  },
  { name: "remove_rule", description: "Remove a rule by its id.", input_schema: { type: "object", properties: { rule_id: { type: "string" } }, required: ["rule_id"] } },
  { name: "set_layout", description: "Labels above or inside the fields, and the form's width.", input_schema: { type: "object", properties: { labels: { type: "string", enum: ["above", "inside"] }, width: { type: "string", enum: ["narrow", "wide"] } } } },
  { name: "set_text", description: "The form's title, intro line and button label. An empty string clears the title or intro.", input_schema: { type: "object", properties: { title: { type: "string" }, intro: { type: "string" }, button: { type: "string" } } } },
  { name: "set_consent", description: "The email consent box: by_region shows it where the law asks, always, or off.", input_schema: { type: "object", properties: { mode: { type: "string", enum: ["by_region", "always", "off"] }, label: { type: "string" } } } },
  { name: "set_spam", description: "Spam checks: the fastest a person could fill it, and Cloudflare Turnstile.", input_schema: { type: "object", properties: { min_seconds: { type: "integer", minimum: 0, maximum: 30 }, turnstile: { type: "boolean" } } } },
  {
    name: "set_after",
    description: "What visitors see after they send it: a message, or a page to open.",
    input_schema: { type: "object", properties: { kind: { type: "string", enum: ["message", "redirect"] }, title: { type: "string" }, text: { type: "string" }, url: { type: "string" } }, required: ["kind"] },
  },
  {
    name: "set_meeting",
    description: "Book a meeting after the submit on Calendly, Cal.com, HubSpot Meetings, SavvyCal or another link; per_owner books with the contact's owner when they have a link. Pass off: true to stop booking.",
    input_schema: { type: "object", properties: { tool: { type: "string", enum: ["calendly", "calcom", "hubspot_meetings", "savvycal", "link"] }, url: { type: "string" }, per_owner: { type: "boolean" }, off: { type: "boolean" } } },
  },
  { name: "use_template", description: `Replace the whole form with a template: ${TEMPLATES.map((t) => `${t.key} (${t.name})`).join(", ")}.`, input_schema: { type: "object", properties: { template: { type: "string", enum: TEMPLATES.map((t) => t.key) } }, required: ["template"] } },
  {
    name: "ask",
    description: "Ask the person one question with 2 to 4 short answers to click. Use it before turning off consent, removing a field past fills used, or replacing the form, and when the request is unclear.",
    input_schema: { type: "object", properties: { question: { type: "string" }, choices: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 } }, required: ["question", "choices"] },
  },
];

export const CHAT_SYSTEM = `You build lead forms in Claritia with a person who is not technical. You change the form only by calling tools; every change is checked, and a refused change comes back with the reason so you can fix it. You never write HTML or CSS: Claritia draws the form and styles it from the brand kit.

Make forms short. Every field costs fills. Don't ask for what Claritia can fill in from a work email: company size, industry and country come from enrichment. For B2B demo and sales forms, check that emails are work emails. Required fields are only the ones sales truly needs.

Use the site's own words when the site's forms are listed (their button text and labels), else plain short labels in sentence case.

Before you turn off the consent box, remove a field that past fills used, or replace the whole form with a template, call ask and wait. When a request is unclear, call ask with a few likely answers. Don't call ask for small changes you can simply make.

Claritia sends every lead to its contacts; other tools are added in the form's Destinations tab, which you can't change. Say so if asked.

After your changes, reply in one or two short sentences of plain words that say what changed. No emoji, no lists, no field ids.`;

const str = (v: unknown) => (typeof v === "string" ? v : undefined);

function fieldInput(raw: Record<string, unknown>): Partial<FieldInput> {
  const out: Record<string, unknown> = {};
  for (const k of ["type", "label", "key", "placeholder", "help", "width", "check"] as const) if (typeof raw[k] === "string") out[k] = raw[k];
  if (typeof raw.required === "boolean") out.required = raw.required;
  if (Array.isArray(raw.options)) out.options = raw.options.filter((o) => typeof o === "string").map((o) => ({ value: o, label: o }));
  if (raw.hidden && typeof raw.hidden === "object") out.hidden = raw.hidden;
  return out as Partial<FieldInput>;
}

/** A tool call as an op, or why it can't be one. `use_template` and `ask` are handled by the loop. */
export function toOp(name: string, input: Record<string, unknown>): Op | { error: string } {
  switch (name) {
    case "add_field": {
      const f = fieldInput((input.field ?? {}) as Record<string, unknown>);
      if (!f.type || !TYPES.includes(f.type as FieldType)) return { error: "field.type must be one of " + TYPES.join(", ") };
      if (!f.label) return { error: "field.label is needed." };
      return { op: "add_field", field: f as FieldInput, ...(typeof input.step === "number" ? { step: input.step } : {}), ...(str(input.after_field_id) ? { after: str(input.after_field_id) } : {}) };
    }
    case "update_field":
      return { op: "update_field", id: str(input.field_id) ?? "", patch: fieldInput((input.changes ?? {}) as Record<string, unknown>) };
    case "remove_field":
      return { op: "remove_field", id: str(input.field_id) ?? "" };
    case "move_field":
      return { op: "move_field", id: str(input.field_id) ?? "", step: Number(input.step), index: Number(input.index) };
    case "add_step":
      return { op: "add_step", ...(str(input.title) ? { title: str(input.title) } : {}) };
    case "rename_step":
      return { op: "update_step", index: Number(input.step), title: str(input.title) ?? "" };
    case "remove_step":
      return { op: "remove_step", index: Number(input.step) };
    case "set_rule": {
      const op = str(input.op) as Rule["when"]["op"];
      return {
        op: "set_rule",
        rule: {
          ...(str(input.rule_id) ? { id: str(input.rule_id) } : {}),
          when: { field: str(input.when_field_id) ?? "", op, ...(op === "is" || op === "is_not" ? { value: str(input.value) ?? "" } : {}) },
          then: { action: str(input.action) as Rule["then"]["action"], field: str(input.target_field_id) ?? "" },
        },
      };
    }
    case "remove_rule":
      return { op: "remove_rule", id: str(input.rule_id) ?? "" };
    case "set_layout":
      return { op: "set_layout", ...(input.labels === "above" || input.labels === "inside" ? { labels: input.labels } : {}), ...(input.width === "narrow" || input.width === "wide" ? { width: input.width } : {}) };
    case "set_text":
      return { op: "set_copy", ...(str(input.title) !== undefined ? { title: str(input.title) } : {}), ...(str(input.intro) !== undefined ? { intro: str(input.intro) } : {}), ...(str(input.button) ? { submit: str(input.button) } : {}) };
    case "set_consent":
      return { op: "set_consent", ...(["by_region", "always", "off"].includes(input.mode as string) ? { mode: input.mode as Form["consent"]["mode"] } : {}), ...(str(input.label) ? { label: str(input.label) } : {}) };
    case "set_spam":
      return { op: "set_spam", ...(typeof input.min_seconds === "number" ? { minSeconds: input.min_seconds } : {}), ...(typeof input.turnstile === "boolean" ? { turnstile: input.turnstile } : {}) };
    case "set_after":
      return input.kind === "redirect"
        ? { op: "set_after", end: { kind: "redirect", url: str(input.url) ?? "" } }
        : { op: "set_after", end: { kind: "message", title: str(input.title) || "Thanks, we got it.", ...(str(input.text) ? { text: str(input.text) } : {}) } };
    case "set_meeting":
      if (input.off === true) return { op: "set_schedule", schedule: null };
      if (!["calendly", "calcom", "hubspot_meetings", "savvycal", "link"].includes(input.tool as string)) return { error: "Pick a tool: calendly, calcom, hubspot_meetings, savvycal or link." };
      return { op: "set_schedule", schedule: { tool: input.tool as "calendly", url: str(input.url) ?? "", perOwner: input.per_owner !== false } };
    default:
      return { error: `Unknown tool ${name}.` };
  }
}

/** The changing part of the prompt: the form as it is now and what the workspace has. */
export function contextText(ctx: ChatCtx): string {
  const parts = [`Current form (field and rule ids are for your tools only):\n${JSON.stringify(ctx.form)}`];
  if (ctx.custom.length) parts.push(`Custom contact fields (key: label, type): ${ctx.custom.map((c) => `f.${c.key}: ${c.label}, ${c.type}`).join("; ")}`);
  if (ctx.brand?.site_forms?.length)
    parts.push(
      `Forms found on ${ctx.brand.source_url ?? "the site"}:\n${ctx.brand.site_forms
        .slice(0, 5)
        .map((f) => `- ${f.url}: ${f.fields.map((x) => `${x.label || "(no label)"} [${x.type}]`).join(", ")}${f.button ? `; button "${f.button}"` : ""}`)
        .join("\n")}`,
    );
  parts.push(`Connected tools: ${ctx.tools.join(", ") || "none"}. This form sends to: Claritia contacts${ctx.destinations.length ? `, ${ctx.destinations.join(", ")}` : ""}.`);
  if (ctx.usedKeys?.length) parts.push(`Past fills used these keys: ${ctx.usedKeys.join(", ")}.`);
  return parts.join("\n\n");
}

/** Whether an op needs the person's yes first. */
function needsYes(op: Op, form: Form, ctx: ChatCtx): string | null {
  if (op.op === "set_consent" && op.mode === "off" && form.consent.mode !== "off") return "Turning off the consent box";
  if (op.op === "remove_field") {
    const f = allFields(form).find((x) => x.id === op.id);
    if (f && ctx.usedKeys?.includes(f.key)) return `Removing ${f.label}, which past fills used,`;
  }
  return null;
}

/** One chat turn: up to six model calls, every tool call applied in order and checked. */
export async function runChat(model: Model, message: string, ctx: ChatCtx): Promise<ChatResult & { usage: Usage }> {
  let form = ctx.form;
  const ops: Op[] = [];
  const lines: string[] = [];
  let usage: Usage = { input: 0, output: 0, cache_read: 0, cache_write: 0 };
  let ask: ChatResult["ask"];
  let reply = "";
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...ctx.history.slice(-10).map((h) => ({ role: h.role, content: h.text.slice(0, 2000) }) as Anthropic.Beta.BetaMessageParam),
    { role: "user", content: `${contextText(ctx)}\n\nThe person says:\n${message.slice(0, 4000)}` },
  ];
  // History must start with the person and alternate.
  while (messages.length && messages[0].role !== "user") messages.shift();

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await model({ system: [{ type: "text", text: CHAT_SYSTEM, cache_control: { type: "ephemeral" } }], tools: CHAT_TOOLS, messages });
    usage = addUsage(usage, usageOf(res.usage));
    if (res.stop_reason === "refusal") {
      reply = "I can't help with that one.";
      break;
    }
    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
    const calls = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (!calls.length || res.stop_reason !== "tool_use") {
      reply = text;
      break;
    }
    messages.push({ role: "assistant", content: res.content as Anthropic.Beta.BetaContentBlockParam[] });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const c of calls) {
      const input = (c.input ?? {}) as Record<string, unknown>;
      const fail = (error: string) => results.push({ type: "tool_result", tool_use_id: c.id, content: error, is_error: true });
      if (c.name === "ask") {
        const choices = (Array.isArray(input.choices) ? input.choices : []).filter((x): x is string => typeof x === "string" && !!x.trim()).slice(0, 4);
        if (str(input.question) && choices.length >= 2) {
          ask = { question: str(input.question)!.slice(0, 300), choices: choices.map((x) => x.slice(0, 60)) };
          results.push({ type: "tool_result", tool_use_id: c.id, content: "Shown to the person. Wait for the answer." });
        } else fail("Pass a question and 2 to 4 choices.");
        continue;
      }
      if (c.name === "use_template") {
        const t = TEMPLATES.find((x) => x.key === input.template);
        if (!t) {
          fail("Unknown template.");
          continue;
        }
        if (allFields(form).length > 1 && !ctx.confirmed) {
          fail("Replacing the whole form needs the person's yes. Call ask first.");
          continue;
        }
        form = t.form();
        lines.push(`Started from the ${t.name} template`);
        results.push({ type: "tool_result", tool_use_id: c.id, content: `Done. The form is now:\n${JSON.stringify(form)}` });
        continue;
      }
      const op = toOp(c.name, input);
      if ("error" in op) {
        fail(op.error);
        continue;
      }
      const yes = needsYes(op, form, ctx);
      if (yes && !ctx.confirmed) {
        fail(`${yes} needs the person's yes. Call ask first.`);
        continue;
      }
      const r = applyStrict(form, op);
      if ("error" in r) {
        fail(r.error);
        continue;
      }
      lines.push(describeOp(op, form));
      const before = new Set(allFields(form).map((f) => f.id));
      form = r.form;
      ops.push(op);
      const fresh = allFields(form).find((f) => !before.has(f.id));
      results.push({ type: "tool_result", tool_use_id: c.id, content: fresh ? `Done. New field id: ${fresh.id}` : "Done." });
    }
    messages.push({ role: "user", content: results });
    if (ask) {
      reply = text || ask.question;
      break;
    }
    if (round === MAX_ROUNDS - 1) reply = text || (lines.length ? "Done." : "I couldn't finish that. Try saying it another way.");
  }
  return { form, ops, lines, reply: reply.slice(0, 1000) || (lines.length ? "Done." : ""), ask, usage };
}
