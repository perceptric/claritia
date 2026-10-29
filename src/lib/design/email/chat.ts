// Making and changing emails with AI (docs/design-system.md Part 7.2). Claude changes the email only through tools,
// each one an op (ops.ts, edit.ts, components.ts) checked before it applies; a refused op goes back with the reason
// and the model fixes it in the same turn. It uses the brand's variables, classes and components first: a raw color
// is refused unless the person asked for one. When it's done, the design check runs, and the model gets one pass to
// fix what its changes caused. It never writes HTML or CSS. Server only; tests pass a scripted model.

import type Anthropic from "@anthropic-ai/sdk";
import { addUsage, usageOf, type Usage } from "../../ai/cache.ts";
import type { Tokens } from "../../forms/brand.ts";
import { checkEmailDesign } from "../check.ts";
import type { Level } from "../edit.ts";
import { allVariables, type DesignSystem } from "../model.ts";
import { isProp, propDef, type Prop } from "../props.ts";
import { varRef } from "../values.ts";
import { componentUseOf, insertComponent, setProp as setUseProp } from "./components.ts";
import { BLOCK_TYPES, isEmailPart, type BlockType, type EmailPartKey } from "./parts.ts";
import { newBlock, PROP_KEYS, readBlock, readEmailDoc, type Block, type EmailDoc } from "./doc.ts";
import { addEmailClass, setEmailProp } from "./edit.ts";
import { addBlock, findEl, moveBlock, removeEl, setColumns, setSettings, updateBlock } from "./ops.ts";
import { EMAIL_TEMPLATES } from "./templates.ts";

export const EMAIL_CHAT_MODEL = "claude-sonnet-5-5";
const MAX_ROUNDS = 8;

export type EmailChatCtx = {
  doc: EmailDoc;
  system: DesignSystem;
  tokens: Partial<Tokens>;
  subject: string;
  /** The brand brief and kit name, when there is one. */
  brand?: { name: string; brief?: string } | null;
  history: { role: "user" | "assistant"; text: string }[];
  confirmed?: boolean;
  /** A screenshot of an email to build (Part 7.5): base64, checked by its bytes before it gets here. */
  image?: { type: "image/png" | "image/jpeg" | "image/gif" | "image/webp"; data: string };
};
export type EmailChatResult = { doc: EmailDoc; system: DesignSystem; subject: string; lines: string[]; reply: string; ask?: { question: string; choices: string[] } };
export type Model = (params: { system: Anthropic.Beta.BetaTextBlockParam[]; tools: Anthropic.Beta.BetaTool[]; messages: Anthropic.Beta.BetaMessageParam[] }) => Promise<Anthropic.Beta.BetaMessage>;

const CONTENT = {
  type: "object",
  description:
    "The block's content. heading: text, level (1-3). text: html (p, b, i, a href, ul, li only). button and meeting: label, url, align. image: src (https), alt, url, width. list: items, ordered. quote: text, cite. product: title, text, price, url, button. event: title, when, where, url, button. signature: name, title, company. footer: text, address. spacer: height.",
} as const;
const STYLE_PROPS = "color, background-color, font-size, font-weight, line-height, letter-spacing, text-align, text-transform, padding-top/right/bottom/left, margin-top/bottom, border-top-width/style/color (and the other sides), border-*-radius, width, max-width, height";

export const EMAIL_CHAT_TOOLS: Anthropic.Beta.BetaTool[] = [
  { name: "add_block", description: "Add a block after a block, or as a new section at an index.", input_schema: { type: "object", properties: { type: { type: "string", enum: [...BLOCK_TYPES.filter((t) => t !== "html")] }, content: CONTENT, after_block_id: { type: "string" }, section_index: { type: "integer", minimum: 0 } }, required: ["type"] } },
  { name: "update_block", description: "Change a block's content by its id.", input_schema: { type: "object", properties: { block_id: { type: "string" }, content: CONTENT }, required: ["block_id", "content"] } },
  { name: "remove_block", description: "Remove a block or a whole section by its id.", input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  { name: "move_block", description: "Move a block to just after another block.", input_schema: { type: "object", properties: { block_id: { type: "string" }, after_block_id: { type: "string" } }, required: ["block_id", "after_block_id"] } },
  { name: "set_columns", description: "Split a section into columns by their widths in percent, like [50, 50].", input_schema: { type: "object", properties: { section_id: { type: "string" }, widths: { type: "array", items: { type: "number" }, minItems: 1, maxItems: 4 } }, required: ["section_id", "widths"] } },
  {
    name: "set_style",
    description: `Style a part of an element ("email" for the page and the email box). Values are variables ($id) first. A raw color only when the person asked for that color: then raw: true. Properties: ${STYLE_PROPS}.`,
    input_schema: {
      type: "object",
      properties: {
        element_id: { type: "string" },
        part: { type: "string", description: "body, content, section, column, heading, text, link, button, image, divider, list, quote, social, card, card-title, muted, footer" },
        property: { type: "string" },
        value: { type: "string", description: 'A value, a variable like "$accent", or "" to clear.' },
        on: { type: "string", enum: ["this", "class", "all_emails"], description: "this: only this element. class: the element's last class. all_emails: every email on the brand." },
        breakpoint: { type: "string", enum: ["desktop", "phone"] },
        state: { type: "string", enum: ["none", "hover", "dark"] },
        raw: { type: "boolean" },
      },
      required: ["element_id", "part", "property", "value"],
    },
  },
  { name: "add_class", description: "Put a class on an element by name (made if new), so its looks can be shared.", input_schema: { type: "object", properties: { element_id: { type: "string" }, name: { type: "string" } }, required: ["element_id", "name"] } },
  { name: "use_component", description: "Put in one of the brand's components as a new section at an index.", input_schema: { type: "object", properties: { component_id: { type: "string" }, section_index: { type: "integer", minimum: 0 } }, required: ["component_id"] } },
  { name: "use_template", description: "Start over from a template. Replacing an email with content needs the person's yes (call ask first).", input_schema: { type: "object", properties: { template: { type: "string", enum: EMAIL_TEMPLATES.map((t) => t.key) } }, required: ["template"] } },
  { name: "set_subject", description: "Set the subject line and the preview text.", input_schema: { type: "object", properties: { subject: { type: "string" }, preheader: { type: "string" } } } },
  { name: "ask", description: "Ask the person one question with 2 to 4 choices, then stop.", input_schema: { type: "object", properties: { question: { type: "string" }, choices: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 } }, required: ["question", "choices"] } },
];

export const EMAIL_CHAT_SYSTEM = `You make and change marketing emails in Claritia with a person who is not technical. You change the email only by calling tools; each change is checked, and a refused change comes back with the reason so you can fix it. You never write HTML or CSS.

How emails work here:
- An email is sections (rows) of columns of blocks. Each block, section and column has an id.
- Looks come from the brand's design system: variables (colors, fonts, sizes) and classes. Use variables ($id) and existing classes first. Use a raw color only when the person asks for that exact color, and pass raw: true.
- Every marketing email needs the Footer block. Merge tags look like {{first_name|there}} and always need a fallback after the bar.
- Write plainly and briefly. Never invent facts, prices, numbers, quotes or customer names; leave a clear placeholder like "Your price" instead, and say so.
- With a screenshot: rebuild its layout and words with blocks in the brand's variables. Don't copy its colors unless the person asks; leave pictures as Image blocks without a picture, and say so.
- When you're done, say in one or two sentences what you changed.`;

const str = (v: unknown) => (typeof v === "string" ? v : undefined);

/** What the model sees: the email, its looks and what the brand offers, in short. */
export function emailContext(ctx: EmailChatCtx, doc: EmailDoc, subject: string): string {
  const vars = allVariables(ctx.system, ctx.tokens).map((v) => `$${v.id} (${v.name}, ${v.kind}): ${v.value}`);
  const classes = (ctx.system.email?.classes ?? []).map((c) => c.name);
  const comps = (ctx.system.email?.components ?? []).map((c) => `${c.id}: ${c.name}`);
  return [
    ctx.brand ? `Brand: ${ctx.brand.name}${ctx.brand.brief ? `\nBrief: ${ctx.brand.brief.slice(0, 3000)}` : ""}` : "",
    `Subject: ${subject || "(none)"}`,
    `Variables:\n${vars.join("\n")}`,
    classes.length ? `Email classes: ${classes.join(", ")}` : "",
    comps.length ? `Components:\n${comps.join("\n")}` : "",
    `The email now:\n${JSON.stringify(doc)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

type Ok = { doc: EmailDoc; system: DesignSystem; subject?: string; line: string };

function applyTool(name: string, input: Record<string, unknown>, doc: EmailDoc, system: DesignSystem, ctx: EmailChatCtx): Ok | { error: string } {
  switch (name) {
    case "add_block": {
      const type = input.type as BlockType;
      if (!BLOCK_TYPES.includes(type) || type === "html") return { error: "Unknown block type." };
      const base = newBlock(type);
      const block = readBlock({ ...base, ...((input.content as object) ?? {}), id: base.id, type }, new Set(), false);
      if (!block) return { error: "That block's content doesn't fit." };
      const after = str(input.after_block_id);
      if (after) {
        const f = findEl(doc, after);
        if (!f?.block) return { error: `No block ${after}.` };
        return { doc: addBlock(doc, block, { column: f.column!.id, index: f.bi! + 1 }), system, line: `Added a ${type}` };
      }
      const footerAt = doc.sections.findIndex((s) => s.columns.some((c) => c.blocks.some((b) => b.type === "footer")));
      const at = typeof input.section_index === "number" ? input.section_index : footerAt >= 0 ? footerAt : doc.sections.length;
      return { doc: addBlock(doc, block, { section: at }), system, line: `Added a ${type}` };
    }
    case "update_block": {
      const id = str(input.block_id) ?? "";
      const f = findEl(doc, id);
      if (!f?.block) return { error: `No block ${id}.` };
      // A block from a component: this email's own words for it, when the component allows.
      const use = componentUseOf(doc, system, id);
      if (use?.blockId) {
        if (use.component.locked) return { error: `That block comes from the component ${use.component.name}, which is locked.` };
        const keys = PROP_KEYS[f.block.type] ?? [];
        const changes = Object.entries((input.content as Record<string, unknown>) ?? {}).filter(([k, v]) => keys.includes(k) && typeof v === "string");
        if (!changes.length) return { error: `In the component ${use.component.name}, only ${keys.join(", ") || "nothing"} can change here.` };
        let next = doc;
        for (const [k, v] of changes) next = setUseProp(next, use.section.id, use.blockId, k, v as string);
        return { doc: next, system, line: `Changed the ${f.block.type}` };
      }
      const merged = readBlock({ ...f.block, ...((input.content as object) ?? {}), id, type: f.block.type }, new Set(), f.block.type === "html");
      if (!merged) return { error: "That content doesn't fit this block." };
      return { doc: updateBlock(doc, id, merged as Partial<Block>), system, line: `Changed the ${f.block.type}` };
    }
    case "remove_block": {
      const id = str(input.id) ?? "";
      const f = findEl(doc, id);
      if (!f || (f.column && !f.block)) return { error: `No block or section ${id}.` };
      if (f.block?.type === "footer") return { error: "Marketing emails need the Footer block." };
      return { doc: removeEl(doc, id), system, line: f.block ? `Removed a ${f.block.type}` : "Removed a section" };
    }
    case "move_block": {
      const id = str(input.block_id) ?? "";
      const after = findEl(doc, str(input.after_block_id) ?? "");
      if (!findEl(doc, id)?.block || !after?.block) return { error: "Name two blocks." };
      return { doc: moveBlock(doc, id, { column: after.column!.id, index: after.bi! + 1 }), system, line: "Moved a block" };
    }
    case "set_columns": {
      const id = str(input.section_id) ?? "";
      if (!doc.sections.some((s) => s.id === id)) return { error: `No section ${id}.` };
      const widths = (Array.isArray(input.widths) ? input.widths : []).map(Number).filter((n) => n > 0);
      if (!widths.length) return { error: "Give the widths." };
      return { doc: setColumns(doc, id, widths), system, line: `Split a section into ${widths.length} column${widths.length > 1 ? "s" : ""}` };
    }
    case "set_style": {
      const id = str(input.element_id) ?? "";
      const part = str(input.part) as EmailPartKey;
      const prop = str(input.property) as Prop;
      const value = str(input.value) ?? "";
      if (id !== "email" && !findEl(doc, id)) return { error: `No element ${id}.` };
      if (!isEmailPart(part)) return { error: "Unknown part." };
      if (!isProp(prop) || propDef(prop).email === false) return { error: `${prop} can't be set in emails.` };
      if (propDef(prop).kind === "color" && value && !varRef(value) && input.raw !== true) {
        const colors = allVariables(system, ctx.tokens).filter((v) => v.kind === "color").map((v) => `$${v.id}`);
        return { error: `Use a color variable (${colors.join(", ")}), or pass raw: true if the person asked for this color.` };
      }
      const on = input.on === "all_emails" ? "all" : input.on === "class" ? "class" : "this";
      let level: Level = { kind: "element" };
      if (on === "all") level = { kind: "global" };
      if (on === "class") {
        const cls = doc.classes?.[id]?.at(-1);
        if (!cls) return { error: "That element has no class. Call add_class first." };
        level = { kind: "class", id: cls };
      }
      const bp = input.breakpoint === "phone" ? "phone" : "base";
      const state = input.state === "hover" || input.state === "dark" ? input.state : undefined;
      const r = setEmailProp({ system, doc }, ctx.tokens, level, id, part, bp, state, prop, value);
      if (!r) return { error: `${value} isn't a value ${prop} takes.` };
      return { doc: r.doc, system: r.system, line: `Styled ${on === "all" ? "every email's" : "the"} ${part}` };
    }
    case "add_class": {
      const id = str(input.element_id) ?? "";
      if (id !== "email" && !findEl(doc, id)) return { error: `No element ${id}.` };
      const r = addEmailClass({ system, doc }, id, str(input.name) ?? "");
      if ("error" in r) return r;
      return { doc: r.doc, system: r.system, line: `Added the class ${str(input.name)}` };
    }
    case "use_component": {
      const at = typeof input.section_index === "number" ? input.section_index : doc.sections.length;
      const r = insertComponent(doc, system, str(input.component_id) ?? "", at);
      if (!r) return { error: "No such component." };
      return { doc: r.doc, system, line: "Added a component" };
    }
    case "use_template": {
      const t = EMAIL_TEMPLATES.find((x) => x.key === input.template);
      if (!t) return { error: "Unknown template." };
      const hasContent = doc.sections.some((s) => s.columns.some((c) => c.blocks.some((b) => b.type !== "footer" && b.type !== "logo")));
      if (hasContent && !ctx.confirmed) return { error: "Replacing the email needs the person's yes. Call ask first." };
      return { doc: { ...t.make(), ...(doc.kitId ? { kitId: doc.kitId } : {}) }, system, line: `Started from the ${t.name} template` };
    }
    case "set_subject": {
      const subject = str(input.subject)?.trim().slice(0, 200);
      const pre = str(input.preheader);
      return { doc: pre !== undefined ? setSettings(doc, { preheader: pre.trim().slice(0, 200) }) : doc, system, ...(subject ? { subject } : {}), line: "Changed the subject" };
    }
    default:
      return { error: "Unknown tool." };
  }
}

/** One chat turn: model calls with every tool call applied in order and checked, then one pass on the design check. */
export async function runEmailChat(model: Model, message: string, ctx: EmailChatCtx): Promise<EmailChatResult & { usage: Usage }> {
  let doc = ctx.doc;
  let system = ctx.system;
  let subject = ctx.subject;
  const lines: string[] = [];
  let usage: Usage = { input: 0, output: 0, cache_read: 0, cache_write: 0 };
  let ask: EmailChatResult["ask"];
  let reply = "";
  const before = new Set(checkEmailDesign(system, doc, ctx.tokens).map((n) => n.text));
  let checked = false;
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...ctx.history.slice(-10).map((h) => ({ role: h.role, content: h.text.slice(0, 2000) }) as Anthropic.Beta.BetaMessageParam),
    {
      role: "user",
      content: [
        ...(ctx.image ? [{ type: "image" as const, source: { type: "base64" as const, media_type: ctx.image.type, data: ctx.image.data } }] : []),
        { type: "text" as const, text: `${emailContext(ctx, doc, subject)}\n\nThe person says:\n${message.slice(0, 4000)}` },
      ],
    },
  ];
  while (messages.length && messages[0]!.role !== "user") messages.shift();

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await model({ system: [{ type: "text", text: EMAIL_CHAT_SYSTEM, cache_control: { type: "ephemeral" } }], tools: EMAIL_CHAT_TOOLS, messages });
    usage = addUsage(usage, usageOf(res.usage));
    if (res.stop_reason === "refusal") {
      reply = "I can't help with that one.";
      break;
    }
    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
    const calls = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (!calls.length || res.stop_reason !== "tool_use") {
      reply = text;
      // The design check: one pass to fix what this turn's changes caused.
      const caused = checkEmailDesign(system, doc, ctx.tokens).filter((n) => !before.has(n.text));
      if (lines.length && caused.length && !checked && round < MAX_ROUNDS - 1) {
        checked = true;
        messages.push({ role: "assistant", content: res.content as Anthropic.Beta.BetaContentBlockParam[] });
        messages.push({ role: "user", content: `The design check found these after your changes:\n${caused.map((n) => `- ${n.text}${n.id ? ` (${n.id})` : ""}`).join("\n")}\nFix what you caused, then say what you changed.` });
        continue;
      }
      break;
    }
    messages.push({ role: "assistant", content: res.content as Anthropic.Beta.BetaContentBlockParam[] });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const c of calls) {
      const input = (c.input ?? {}) as Record<string, unknown>;
      if (c.name === "ask") {
        const choices = (Array.isArray(input.choices) ? input.choices : []).filter((x): x is string => typeof x === "string" && !!x.trim()).slice(0, 4);
        if (str(input.question) && choices.length >= 2) {
          ask = { question: str(input.question)!.slice(0, 300), choices: choices.map((x) => x.slice(0, 60)) };
          results.push({ type: "tool_result", tool_use_id: c.id, content: "Shown to the person. Wait for the answer." });
        } else results.push({ type: "tool_result", tool_use_id: c.id, content: "Pass a question and 2 to 4 choices.", is_error: true });
        continue;
      }
      const r = applyTool(c.name, input, doc, system, ctx);
      if ("error" in r) {
        results.push({ type: "tool_result", tool_use_id: c.id, content: r.error, is_error: true });
        continue;
      }
      // Read back through the same checks as a save.
      doc = readEmailDoc(r.doc, { allowHtml: true });
      system = r.system;
      if (r.subject) subject = r.subject;
      lines.push(r.line);
      results.push({ type: "tool_result", tool_use_id: c.id, content: `Done. The email is now:\n${JSON.stringify(doc)}` });
    }
    messages.push({ role: "user", content: results });
    if (ask) {
      reply = text || ask.question;
      break;
    }
  }
  return { doc, system, subject, lines, reply, ...(ask ? { ask } : {}), usage };
}
