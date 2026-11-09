import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mcpServer, ToolError, type Tool } from "../mcpProtocol.ts";
import { APP_URL } from "../site.ts";
import { findTemplates, GUEST_KEY, guestForm, guestIpHash, guestKeyHash, newGuestKey, STYLE_IDS } from "./guest.ts";

// The MCP server for someone who hasn't signed in (docs/mcp.md, "Forms before sign-up"): ChatGPT or Claude finds a
// template or writes the page, and the form goes live at once with a claim link. Signed-in tools are listed too;
// calling one starts the sign-in (src/app/api/mcp/route.ts answers 401).

export type GuestCtx = { sb: SupabaseClient; ip: string };

const str = { type: "string" } as const;
export const SIGNED_IN_TOOLS = ["list_forms", "get_answers"];

const links = (id: string, key: string) => ({ live: `${APP_URL}/f/${id}`, claim: `${APP_URL}/claim/${key}`, embed: `<script src="${APP_URL}/forms/v1.js" async></script>\n<claritia-form form-id="${id}"></claritia-form>` });

const guestTools: Tool<GuestCtx>[] = [
  {
    name: "find_form_template",
    title: "Find a form template",
    description: "Use it first when someone asks for a form, survey, sign-up, booking request, RSVP, quiz or intake. Searches Claritia's 740 ready-made forms and gives the best matches with their ids for create_form.",
    inputSchema: { type: "object", properties: { query: { ...str, description: "What the form is for, in a few words: 'yoga class sign-up', 'wedding photography inquiry'." } }, required: ["query"] },
    readOnly: true,
    async run(_ctx, args) {
      const q = typeof args.query === "string" ? args.query.slice(0, 200) : "";
      const list = findTemplates(q);
      if (!list.length) return { text: "No close template. Call create_form with html: the whole page." , data: { templates: [] } };
      return { text: list.map((t) => `${t.name} (${t.questions} questions): ${t.blurb} id: ${t.id}`).join("\n"), data: { templates: list } };
    },
  },
  {
    name: "create_form",
    title: "Create a form",
    description:
      "Make a live Claritia form anyone can fill, with no account needed. Pass template (an id from find_form_template) or html (the whole page: inputs with name and a label, data-cl-save=\"email\" on the email, a submit button, and a <section data-cl-thanks hidden> thank-you). " +
      `Optional style: ${STYLE_IDS.join(", ")}. ` +
      "Returns the live link to share, the claim link for the person (claiming signs them up free and shows the answers), and a key to pass to update_form. Show the person both links. Forms can't ask for passwords, cards or codes.",
    inputSchema: {
      type: "object",
      properties: { name: { ...str, description: "The form's title." }, template: str, html: str, css: { ...str, description: "Extra CSS for the page (optional)." }, style: { type: "string", enum: STYLE_IDS } },
      required: ["name"],
    },
    async run(ctx, args) {
      const name = typeof args.name === "string" && args.name.trim() ? args.name.trim().slice(0, 120) : "Untitled form";
      const made = guestForm({ name, template: typeof args.template === "string" ? args.template : undefined, html: typeof args.html === "string" ? args.html : undefined, css: typeof args.css === "string" ? args.css : undefined, style: typeof args.style === "string" ? args.style : undefined });
      if ("error" in made) throw new ToolError(made.error);
      const { key, hash } = newGuestKey();
      const { data, error } = await ctx.sb.rpc("guest_form_make", { p_name: name, p_token_hash: hash, p_ip_hash: guestIpHash(ctx.ip), p_body: made.form });
      if (error) throw error.message.includes("too_many_guest_forms") ? new ToolError("This connection made 20 forms today. Sign in to Claritia to make more.") : new Error("Couldn't make the form. Try again.");
      const id = data as string;
      const l = links(id, key);
      return {
        text: `${name} is live: ${l.live}\nClaim it (free, keeps the answers): ${l.claim}\nQuestions: ${made.questions.join(", ")}\nUnclaimed forms close after 14 days. form_id: ${id} key: ${key}`,
        data: { form_id: id, key, live_url: l.live, claim_url: l.claim, embed: l.embed, questions: made.questions },
      };
    },
  },
  {
    name: "update_form",
    title: "Update a form",
    description: "Change a form made with create_form before it's claimed: a new template, new html, a new style or name. Pass the form_id and key create_form gave. The live link stays the same.",
    inputSchema: { type: "object", properties: { form_id: str, key: str, name: str, template: str, html: str, css: str, style: { type: "string", enum: STYLE_IDS } }, required: ["form_id", "key"] },
    async run(ctx, args) {
      const id = typeof args.form_id === "string" ? args.form_id.trim() : "";
      const key = typeof args.key === "string" ? args.key.trim() : "";
      if (!/^[0-9a-f-]{36}$/.test(id) || !GUEST_KEY.test(key)) throw new ToolError("Pass the form_id and key create_form gave.");
      const name = typeof args.name === "string" ? args.name.trim().slice(0, 120) : "";
      const made = guestForm({ name, template: typeof args.template === "string" ? args.template : undefined, html: typeof args.html === "string" ? args.html : undefined, css: typeof args.css === "string" ? args.css : undefined, style: typeof args.style === "string" ? args.style : undefined });
      if ("error" in made) throw new ToolError(made.error);
      const { data, error } = await ctx.sb.rpc("guest_form_update", { p_form: id, p_token_hash: guestKeyHash(key), p_name: name, p_body: made.form });
      if (error) throw error.message.includes("guest_form_not_found") ? new ToolError("That form was claimed, closed, or the key is wrong. Once claimed, it's changed in Claritia.") : new Error("Couldn't save the form. Try again.");
      const l = links(id, key);
      return { text: `Updated (version ${data}): ${l.live}\nQuestions: ${made.questions.join(", ")}`, data: { form_id: id, version: data, live_url: l.live, claim_url: l.claim, questions: made.questions } };
    },
  },
  // Listed so apps know they exist; calling one without signing in answers 401, which starts the sign-in.
  { name: "list_forms", title: "List forms", description: "The forms in your Claritia workspace (needs sign-in).", inputSchema: { type: "object", properties: {} }, readOnly: true, run: async () => { throw new ToolError("Sign in to Claritia first."); } },
  { name: "get_answers", title: "Get answers", description: "A form's latest answers (needs sign-in).", inputSchema: { type: "object", properties: { form: str, limit: { type: "number" } }, required: ["form"] }, readOnly: true, run: async () => { throw new ToolError("Sign in to Claritia first."); } },
];

export const guestMcp = mcpServer<GuestCtx>({
  name: "claritia",
  title: "Claritia",
  version: "0.2.0",
  instructions:
    "Claritia makes forms that go live at once, with no account needed: find_form_template, then create_form with its id (or with html you write). " +
    "Give the person the live link to share and the claim link to see the answers. Change it with update_form. Signing in to Claritia unlocks list_forms and get_answers.",
  tools: guestTools,
});
