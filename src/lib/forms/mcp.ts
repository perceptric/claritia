import "server-only";
import type { ApiCaller } from "../apiAuth.ts";
import { ToolError, type Tool } from "../mcpProtocol.ts";
import { APP_URL } from "../site.ts";
import { applyStrict, describeOp, type Op } from "./ops.ts";
import { checkForm, emptyForm, unsetConstants, type Form } from "./schema.ts";
import { TEMPLATES } from "./templates.ts";
import { DEFAULT_BRAND_CSS } from "../studio/brandDefault.ts";
import { formToPage } from "../studio/fromForm.ts";
import { pageForm, type PageAfter } from "../studio/page.ts";

// Forms on the MCP server (docs/form-builder.md 4.3). Every form is a Form Studio page (docs/forms-chat-plan.md):
// create_form makes one, set_form_page writes its HTML under the same contract Tia writes to, and edit_form's ops only
// change forms made before the Studio. Publishing needs a key made by a workspace owner.

type Row = { id: string; name: string; status: string; version: number; draft: Form; draft_rev: number };

async function findForm(ctx: ApiCaller, ref: unknown): Promise<Row> {
  if (typeof ref !== "string" || !ref.trim()) throw new ToolError("Pass form: the form's name or id.");
  const q = ctx.sb.from("forms").select("id, name, status, version, draft, draft_rev").eq("workspace_id", ctx.workspaceId);
  const { data, error } = /^[0-9a-f-]{36}$/.test(ref.trim()) ? await q.eq("id", ref.trim()) : await q.ilike("name", ref.trim().replace(/[%_\\]/g, "\\$&"));
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Row[];
  if (!rows.length) throw new ToolError(`Form ${ref} not found. Call list_forms to see them.`);
  if (rows.length > 1) throw new ToolError(`More than one form is called ${ref}. Pass its id.`);
  return rows[0]!;
}

const customOf = async (ctx: ApiCaller) => ((await ctx.sb.from("fields").select("key").eq("workspace_id", ctx.workspaceId).eq("object", "contact")).data ?? []) as { key: string }[];

export const formTools: Tool<ApiCaller>[] = [
  {
    name: "list_forms",
    title: "List forms",
    description: "The workspace's lead forms with their state (draft, live, paused) and published version.",
    inputSchema: { type: "object", properties: {} },
    readOnly: true,
    async run(ctx) {
      const { data, error } = await ctx.sb.from("forms").select("id, name, status, version, updated_at").eq("workspace_id", ctx.workspaceId).order("updated_at", { ascending: false });
      if (error) throw new Error(error.message);
      const forms = (data ?? []) as { id: string; name: string; status: string; version: number }[];
      return { text: forms.length ? forms.map((f) => `${f.name} (${f.status}, version ${f.version}) ${f.id}`).join("\n") : "No forms yet. Make one with create_form.", data: { forms } };
    },
  },
  {
    name: "get_form",
    title: "Get a form",
    description: "A form's draft as JSON (steps, fields with their ids, rules, layout, consent, after-submit) and whether it differs from the live version.",
    inputSchema: { type: "object", properties: { form: { type: "string", description: "Form name or id." } }, required: ["form"] },
    readOnly: true,
    async run(ctx, args) {
      const f = await findForm(ctx, args.form);
      const check = checkForm(f.draft, { custom: await customOf(ctx) });
      return { text: `# ${f.name} (${f.status})\n\`\`\`json\n${JSON.stringify(f.draft, null, 2)}\n\`\`\`${"errors" in check ? `\nProblems: ${check.errors.join(" ")}` : ""}`, data: { id: f.id, draft: f.draft, problems: "errors" in check ? check.errors : [] } };
    },
  },
  {
    name: "create_form",
    title: "Create a form",
    description: `Make a draft Form Studio form, blank or from a starting point: ${TEMPLATES.map((t) => t.key).join(", ")}. Change it with set_form_page (its HTML), then publish_form.`,
    inputSchema: { type: "object", properties: { name: { type: "string" }, template: { type: "string", enum: TEMPLATES.map((t) => t.key) } }, required: ["name"] },
    async run(ctx, args) {
      const name = typeof args.name === "string" && args.name.trim() ? args.name.trim().slice(0, 120) : "Untitled form";
      const t = TEMPLATES.find((x) => x.key === args.template);
      // A studio page in the workspace's first brand (or the plain look), so it opens in the Studio like every form.
      const { data: kits } = await ctx.sb.from("brand_kits").select("id, studio_css, source_url").eq("workspace_id", ctx.workspaceId).order("created_at");
      const kit = ((kits ?? []) as { id: string; studio_css: string | null; source_url: string | null }[]).find((k) => k.source_url && k.studio_css) ?? null;
      const base = checkForm(t ? t.form() : emptyForm());
      if ("errors" in base) throw new Error(base.errors[0]);
      const conv = formToPage(base.form);
      const made = checkForm(pageForm({ html: conv.html, css: conv.css, brand: kit?.studio_css ?? DEFAULT_BRAND_CSS, after: conv.after, title: name }).form);
      if ("errors" in made) throw new Error(made.errors[0]);
      const { data, error } = await ctx.sb.from("forms").insert({ workspace_id: ctx.workspaceId, name, draft: made.form, brand_kit_id: kit?.id ?? null, kind: "built" }).select("id").single();
      if (error) throw new Error(error.message);
      return { text: `Made ${name}: ${APP_URL}/forms/${data.id}`, data: { id: data.id } };
    },
  },
  {
    name: "edit_form",
    title: "Edit a form",
    description:
      "Change a form's draft with ops, applied in order. Each op is one of: add_field {field: {type, label, key?, required?, options?: [{value, label, score?}], calc?: {formula, format?, currency?, decimals?}, optionsBy?: {field, map?: {answer: [{value, label}]}, preset?: regions}}}, update_field {id, patch}, remove_field {id}, move_field {id, step, index}, add_step {title?}, update_step {index, title, skip?: {when, to}}, remove_step {index}, set_rule {rule: {when: {field, op, value?, value2?, values?}, group?: {logic: all|any, when: [conditions]}, then: {action, field}}}, remove_rule {id}, set_layout {labels?, width?, mode?: screens|null, auto?, cover?: {title, text?, button?}|null}, set_constants {constants: [{id, name, value|null, format?: money|percent, private?}]}, set_results {results: {show: instant|after_contact, outcomes: [{id, title, text?, when?: {logic: all|any, conds: [conditions]}, meeting?}]} | null} (the last outcome has no when: everyone else), set_copy {title?, intro?, submit?}, set_consent {mode?, label?}, set_spam {minSeconds?, turnstile?}, set_after {end}. Rule ops: is, is_not, filled, empty, contains, not_contains, starts_with, ends_with, gt, gte, lt, lte, between (value and value2), before, after, within_days (value is days), any_of, none_of (values). A calc formula reads other fields as {id} and settings as {@id}: + - * / ( ), comparisons, and, or, min, max, sum, round, ceil, floor, abs, if, ifempty. Fields can also be type html (content: {html}, a cleaned full-width section) and type result (result: {kind: metric|meter|summary|bars|outcome|email, field?, fields?, max?}) on a step with result: true; choices can take cards: true, image and needs; numbers can take slider: true with valid min and max, and unit money|percent. An op that would add a problem is refused and nothing after it applies.",
    inputSchema: { type: "object", properties: { form: { type: "string" }, ops: { type: "array", items: { type: "object" }, minItems: 1, maxItems: 50 } }, required: ["form", "ops"] },
    async run(ctx, args) {
      const f = await findForm(ctx, args.form);
      if (f.draft?.page) throw new ToolError("This form is a Form Studio page. Change it with set_form_page (its HTML), or in the app.");
      const custom = await customOf(ctx);
      let form = f.draft && Array.isArray(f.draft.steps) ? f.draft : emptyForm();
      const lines: string[] = [];
      for (const [i, raw] of (Array.isArray(args.ops) ? args.ops : []).entries()) {
        const op = raw as Op;
        const r = applyStrict(form, op, { custom });
        if ("error" in r) throw new ToolError(`Op ${i + 1} (${String(op?.op)}) was refused: ${r.error}${lines.length ? ` Nothing was saved; ops before it were fine.` : ""}`);
        lines.push(describeOp(op, form));
        form = r.form;
      }
      const { data, error } = await ctx.sb.from("forms").update({ draft: form, draft_rev: f.draft_rev + 1, updated_at: new Date().toISOString() }).eq("id", f.id).eq("draft_rev", f.draft_rev).select("id");
      if (error) throw new Error(error.message);
      if (!data?.length) throw new ToolError("The form changed while you edited it. Call get_form and try again.");
      return { text: lines.join("\n"), data: { id: f.id, draft: form } };
    },
  },
  {
    name: "set_form_page",
    title: "Set a form's page",
    description:
      "Write a Form Studio form's page: its whole HTML (and, optionally, its own CSS). The contract is Tia's: inputs with unique names and labels, data-cl-save on contact answers, data-cl-step sections with data-cl-next and data-cl-back, data-cl-show-if conditions, a <section data-cl-thanks hidden>, and Claritia blocks as <div data-cl-field=\"TYPE\" data-cl-name=\"...\" data-cl-label=\"...\">, where TYPE is file, phone, address, date, time, daterange, rating, signature, country, calc (data-cl-formula=\"{guests} * 38\"), payment (data-cl-from=\"calc name\" or data-cl-amount), result, grid, ranking or hidden. Questions keep their ids by data-cl-id. The brand's stylesheet stays as it is.",
    inputSchema: { type: "object", properties: { form: { type: "string" }, html: { type: "string" }, css: { type: "string" } }, required: ["form", "html"] },
    async run(ctx, args) {
      const f = await findForm(ctx, args.form);
      const page = f.draft?.page;
      if (!page) throw new ToolError("This form was made before Form Studio. Open it in the app once to move it into the Studio.");
      if (typeof args.html !== "string" || !args.html.trim()) throw new ToolError("Pass html: the whole page.");
      const { form: next, questions } = pageForm({ html: args.html, css: typeof args.css === "string" ? args.css : page.css, brand: page.brand, after: (page.after ?? { kind: "thanks" }) as PageAfter, title: f.name, prevIds: page.ids });
      if (!questions.length) throw new ToolError("The page has no questions to send.");
      for (const k of ["reply", "keep", "notify", "share", "consent", "spam"] as const) if (f.draft[k] !== undefined) (next as Record<string, unknown>)[k] = f.draft[k];
      const check = checkForm(next, { custom: await customOf(ctx) });
      if ("errors" in check) throw new ToolError(`The page was refused: ${check.errors.join(" ")}`);
      const { data, error } = await ctx.sb.from("forms").update({ draft: check.form, draft_rev: f.draft_rev + 1, updated_at: new Date().toISOString() }).eq("id", f.id).eq("draft_rev", f.draft_rev).select("id");
      if (error) throw new Error(error.message);
      if (!data?.length) throw new ToolError("The form changed while you edited it. Call get_form and try again.");
      return { text: `Saved ${f.name}'s page: ${questions.length} questions.`, data: { id: f.id, questions: questions.map((q) => ({ name: q.name, id: q.id, label: q.label, required: q.required })) } };
    },
  },
  {
    name: "get_answers",
    title: "Get answers",
    description: "A form's latest answers, newest first (spam and tests left out).",
    inputSchema: { type: "object", properties: { form: { type: "string", description: "Form name or id." }, limit: { type: "number", description: "How many, 1 to 50. Default 20." } }, required: ["form"] },
    readOnly: true,
    async run(ctx, args) {
      const f = await findForm(ctx, args.form);
      const n = Math.min(50, Math.max(1, Math.floor(Number(args.limit) || 20)));
      const { data, error } = await ctx.sb.from("submissions").select("id, created_at, values").eq("workspace_id", ctx.workspaceId).eq("form_id", f.id).eq("spam", false).eq("test", false).order("created_at", { ascending: false }).limit(n);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as { id: string; created_at: string; values: Record<string, unknown> }[];
      if (!rows.length) return { text: `${f.name} has no answers yet.`, data: { answers: [] } };
      const line = (r: (typeof rows)[number]) => `${r.created_at.slice(0, 16).replace("T", " ")}: ${Object.entries(r.values ?? {}).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`).join("; ")}`;
      return { text: `${f.name}, ${rows.length} latest answers:\n${rows.map(line).join("\n")}`, data: { answers: rows } };
    },
  },
  {
    name: "publish_form",
    title: "Publish a form",
    description: "Make the draft live. Needs a key made by a workspace owner. Returns the embed code.",
    inputSchema: { type: "object", properties: { form: { type: "string" } }, required: ["form"] },
    async run(ctx, args) {
      const f = await findForm(ctx, args.form);
      const { data: key } = await ctx.sb.from("api_keys").select("created_by").eq("id", ctx.keyId).maybeSingle();
      const { data: m } = key?.created_by ? await ctx.sb.from("workspace_members").select("role").eq("workspace_id", ctx.workspaceId).eq("user_id", key.created_by).maybeSingle() : { data: null };
      if (m?.role !== "owner") throw new ToolError("Publishing needs a key made by a workspace owner. Publish it in the app instead.");
      const check = checkForm(f.draft, { custom: await customOf(ctx) });
      if ("errors" in check) throw new ToolError(`Fix these first: ${check.errors.join(" ")}`);
      const unset = unsetConstants(check.form);
      if (unset.length) throw new ToolError(`Set these first: ${unset.map((c) => c.name).join(", ")}.`);
      const { data, error } = await ctx.sb.rpc("form_publish", { p_id: f.id, p_user: key!.created_by, p_body: check.form });
      if (error) throw new Error(error.message);
      const embed = `<script src="${APP_URL}/forms/v1.js" async></script>\n<claritia-form form-id="${f.id}"></claritia-form>`;
      return { text: `${f.name} is live (version ${data}).\n${embed}\nLink: ${APP_URL}/f/${f.id}`, data: { version: data, embed } };
    },
  },
];
