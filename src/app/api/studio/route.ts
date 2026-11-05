import Anthropic from "@anthropic-ai/sdk";
import { cachedStep, hashKey, usageOf, type Usage } from "@/lib/ai/cache";
import { sourceText } from "@/lib/brand/sourceSkin";
import { isMember } from "@/lib/contacts/server";
import { checkForm } from "@/lib/forms/schema";
import { cleaningCtx } from "@/lib/contacts/server";
import { checkStudioPage, errorsIn } from "@/lib/studio/check";
import { readProfile } from "@/lib/studio/industries";
import { pageForm, teamAlert, type PageAfter } from "@/lib/studio/page";
import { persistStudio } from "@/lib/studio/persist";
import { forgetPublic } from "@/lib/forms/server";
import { turnstileSiteKey } from "@/lib/forms/server";
import { BRAND_RULES, CHAT_RULES, STUDIO_MODEL, TRANSLATE_RULES } from "@/lib/studio/prompts";
import { hostOf, readSite, readSource } from "@/lib/studio/site";
import { requireUser } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";

// Form Studio (docs/forms-chat-plan.md). POST { workspaceId, mode, ... }:
//   site    { url }                  → { site, name, logo }   the quick look the owner confirms: name and real logo, no AI
//   confirm { url, name, logoUrl?, logoSvg? } → { kitId }      the confirmed brand saved as a brand kit (the runner's
//                                                               browser read starts too)
//   scan    { url }                  → { kitId }               a site that turns simple readers away: the runner reads it
//                                                               in a browser; the page checks back for its name and logo
//   look    { kitId, fresh? }        → stream: { say, css }     the confirmed site's page source read into its brand CSS
//                                                               (fresh: read again, past the cache)
//   chat    { turns, brand, built, files? } → stream: { t } deltas, then { done }   the form designer (Tia, on Claude
//                                                               Opus); brand is the chat's cached brand block
//   translate { texts, lang }         → { texts }               the form's words in another language
//   chat-save { chat: { id, name, state, brandId, formId, body } } → { ok }   one chat with Tia (112)
//   chat-delete { id }               → { ok }
//   brand-css { kitId, css }         → { ok }                  the brand's CSS, edited in Code
//   brand-profile { kitId, profile } → { ok }                  the brand's industry, language and country (113)
//   convert { formId }               → { formId, lost }          an older form's draft as a studio page (Part 8)
//   save    { formId?, name, html, css, brand, after, kitId } → { formId }   the studio form as a real form's draft;
//                                                               /api/forms/publish then makes it live
// Streams are lines of JSON with a heartbeat, so no proxy ends a long Opus answer. Every Claude call goes through the
// step cache: the same inputs replay the saved answer.

export const maxDuration = 300;
const bad = (error: string, status = 400) => Response.json({ error }, { status });
const ZERO: Usage = { input: 0, output: 0, cache_read: 0, cache_write: 0 };
const UUID = /^[0-9a-f-]{36}$/;

type Turn = { role: "user" | "assistant"; content: string };
type Block = { type: "text"; text: string } | { type: "image"; source: { type: "base64"; media_type: string; data: string } } | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string }; title?: string };
type Msg = { role: "user" | "assistant"; content: string | Block[] };
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const MAX_IMAGE = 5 * 1024 * 1024;
const MAX_PDF = 10 * 1024 * 1024;

function client(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  return apiKey ? new Anthropic({ apiKey, maxRetries: 1, timeout: 280_000 }) : null;
}

/** Stream one Opus answer: text deltas to `onText`, the whole text at the end. */
/**
 * Stream one Opus answer. The rules and the brand block (its CSS, the industry, the meeting types: the same for every
 * message in a chat) are cached, and so is the conversation up to the last answer, so each new message pays full price
 * only for the form as it is now and the new words.
 */
async function opus(c: Anthropic, system: string, messages: Msg[], maxTokens: number, effort: "low" | "medium" | "high", onText: (delta: string) => void, brand = ""): Promise<{ text: string; usage: Usage; stop: string | null }> {
  const cache = { type: "ephemeral" as const };
  const lastAnswer = messages.map((m) => m.role).lastIndexOf("assistant");
  const msgs = messages.map((m, i) => (i === lastAnswer && typeof m.content === "string" ? { role: m.role, content: [{ type: "text", text: m.content, cache_control: cache }] } : m));
  const stream = c.beta.messages.stream({
    model: STUDIO_MODEL,
    max_tokens: maxTokens,
    output_config: { effort },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [{ type: "text", text: system, cache_control: cache }, ...(brand ? [{ type: "text", text: brand, cache_control: cache }] : [])],
    messages: msgs,
  } as unknown as Anthropic.Beta.Messages.MessageCreateParamsStreaming);
  for await (const ev of stream) if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") onText(ev.delta.text);
  const res = await stream.finalMessage();
  return { text: res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join(""), usage: usageOf(res.usage), stop: res.stop_reason };
}

/** A response of JSON lines, with a heartbeat every 15 seconds while Claude thinks. */
function lines(run: (send: (o: unknown) => void) => Promise<void>): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      const send = (o: unknown) => {
        try {
          ctrl.enqueue(enc.encode(`${JSON.stringify(o)}\n`));
        } catch {}
      };
      const beat = setInterval(() => send({ beat: 1 }), 15_000);
      try {
        await run(send);
      } catch (e) {
        console.error(`studio: ${(e as Error).message}`);
        send({ error: "Tia didn't finish. Try again." });
      } finally {
        clearInterval(beat);
        try {
          ctrl.close();
        } catch {}
      }
    },
  });
  return new Response(body, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}

const tag = (text: string, name: string) => {
  const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(text);
  return m ? m[1]!.trim() : null;
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

  if (b.mode === "site") {
    const r = await readSite(String(b.url ?? ""));
    if ("error" in r) return Response.json({ error: r.error, browser: true }, { status: 422 });
    return Response.json({ url: r.url, site: r.site, name: r.name, logo: r.logo, logoUrl: r.logoUrl, logoSvg: r.logoSvg });
  }

  if (b.mode === "confirm" || b.mode === "scan") {
    const host = hostOf(String(b.url ?? ""));
    if (!host) return bad("Enter the site's address, like acme.com.");
    // A site the workspace already has keeps its brand: read again, never a second copy.
    const { data: had } = await db.from("brand_kits").select("id, source_url").eq("workspace_id", ws);
    const same = ((had ?? []) as { id: string; source_url: string | null }[]).find((k) => k.source_url && hostOf(k.source_url) === host);
    const started = await db.rpc("brand_scan_start", { p_user: auth.user.id, p_ws: ws, p_url: `https://${host}`, p_kit: same?.id ?? null, p_form: null });
    if (started.error) return bad(started.error.message);
    const kitId = started.data as string;
    if (b.mode === "confirm") {
      const name = String(b.name ?? "").trim().slice(0, 120) || host;
      const logoUrl = typeof b.logoUrl === "string" && /^https:\/\/[^\s"'<>]+$/.test(b.logoUrl) ? b.logoUrl.slice(0, 1000) : null;
      const logoSvg = typeof b.logoSvg === "string" && /^\s*<svg[\s>]/i.test(b.logoSvg) && b.logoSvg.length <= 60_000 ? b.logoSvg : null;
      const patch: Record<string, unknown> = { name, updated_at: new Date().toISOString() };
      if (logoUrl) patch.logo_url = logoUrl;
      if (logoSvg) patch.logo_svg = logoSvg;
      const up = await db.from("brand_kits").update(patch).eq("id", kitId).eq("workspace_id", ws);
      if (up.error) {
        // Before 108 there's no logo_svg column: keep the name and the picture.
        await db.from("brand_kits").update({ name, ...(logoUrl ? { logo_url: logoUrl } : {}) }).eq("id", kitId).eq("workspace_id", ws);
      }
    }
    return Response.json({ kitId });
  }

  if (b.mode === "chat-save") {
    // One chat with Tia (docs/studio-v2-plan.md, Part 2): its page, what was said, and its form once published.
    const c = (b.chat && typeof b.chat === "object" ? b.chat : {}) as Record<string, unknown>;
    const id = typeof c.id === "string" && UUID.test(c.id) ? c.id : "";
    if (!id) return bad("The chat can't be read.");
    const body = c.body && typeof c.body === "object" ? (c.body as Record<string, unknown>) : {};
    if (JSON.stringify(body).length > 1_900_000) return bad("This chat is too long to save. Start a new chat for big changes.");
    const kit = typeof c.brandId === "string" && UUID.test(c.brandId) ? c.brandId : null;
    const form = typeof c.formId === "string" && UUID.test(c.formId) ? c.formId : null;
    if (kit && !(await db.from("brand_kits").select("id").eq("id", kit).eq("workspace_id", ws).maybeSingle()).data) return bad("Brand not found.", 404);
    if (form && !(await db.from("forms").select("id").eq("id", form).eq("workspace_id", ws).maybeSingle()).data) return bad("Form not found.", 404);
    const had = await db.from("form_chats").select("workspace_id").eq("id", id).maybeSingle();
    if (had.error) return Response.json({ error: "Chats aren't set up on this server yet.", missing: true }, { status: 503 });
    if (had.data && (had.data as { workspace_id: string }).workspace_id !== ws) return bad("Chat not found.", 404);
    const state = ["new", "draft", "live", "changed"].includes(c.state as string) ? (c.state as string) : "draft";
    const row = { id, workspace_id: ws, form_id: form, brand_kit_id: kit, name: String(c.name ?? "").trim().slice(0, 120) || "New form", state, body, updated_at: new Date().toISOString() };
    const up = had.data ? await db.from("form_chats").update(row).eq("id", id) : await db.from("form_chats").insert({ ...row, created_by: auth.user.id });
    if (up.error) return bad(up.error.message, 500);
    return Response.json({ ok: true });
  }

  if (b.mode === "brand-css") {
    const kitId = typeof b.kitId === "string" && UUID.test(b.kitId) ? b.kitId : "";
    const css = typeof b.css === "string" ? b.css.slice(0, 200_000) : "";
    if (!kitId || !css.trim()) return bad("Brand not found.", 404);
    const up = await db.from("brand_kits").update({ studio_css: css }).eq("id", kitId).eq("workspace_id", ws);
    if (up.error) return Response.json({ error: "Brand CSS isn't kept on this server yet.", missing: true }, { status: 503 });
    return Response.json({ ok: true });
  }

  if (b.mode === "brand-profile") {
    const kitId = typeof b.kitId === "string" && UUID.test(b.kitId) ? b.kitId : "";
    const profile = readProfile(b.profile);
    if (!kitId || !profile) return bad("Brand not found.", 404);
    const up = await db.from("brand_kits").update({ studio_profile: profile }).eq("id", kitId).eq("workspace_id", ws);
    if (up.error) return Response.json({ error: "The brand's industry isn't kept on this server yet.", missing: true }, { status: 503 });
    return Response.json({ ok: true });
  }

  if (b.mode === "chat-delete") {
    const id = typeof b.id === "string" && UUID.test(b.id) ? b.id : "";
    if (!id) return bad("Chat not found.", 404);
    const del = await db.from("form_chats").delete().eq("id", id).eq("workspace_id", ws);
    if (del.error) return Response.json({ error: "Chats aren't set up on this server yet.", missing: true }, { status: 503 });
    return Response.json({ ok: true });
  }

  if (b.mode === "convert") {
    // An older form opened in the Studio (docs/forms-chat-plan.md Part 8): its draft becomes a studio page in its
    // brand's stylesheet (a gallery style's, or the plain one), keeping every field id and what its Settings set, and
    // its live version is kept as the page visitors already get (src/lib/studio/persist.ts). Answers { formId, lost }
    // with what the page couldn't hold, in plain words.
    const formId = typeof b.formId === "string" && UUID.test(b.formId) ? b.formId : "";
    const { data: row } = await db.from("forms").select("id, draft, kind").eq("id", formId).eq("workspace_id", ws).maybeSingle();
    const had = row as { id: string; draft: Record<string, unknown> | null; kind: string | null } | null;
    if (!had?.draft) return bad("Form not found.", 404);
    if (had.kind === "captured" || had.draft.capture) return bad("This form is your site's own; it has no page to build.");
    const r = await persistStudio(db, formId);
    if (r.error) return bad(r.error, 400);
    if (r.live) forgetPublic(formId);
    return Response.json({ formId, lost: r.lost });
  }

  if (b.mode === "save") {
    // The studio form as a real form: its page cleaned, its questions read into fields, checked like every form.
    const html = typeof b.html === "string" ? b.html : "";
    if (!html.trim()) return bad("Build the form first.");
    const after = (b.after && typeof b.after === "object" ? b.after : { kind: "thanks" }) as PageAfter;
    const name = String(b.name ?? "").trim().slice(0, 120) || "New form";
    // The form check, again on the server (docs/studio-v2-plan.md 6.5): no broken form goes live.
    const types = await db.from("meeting_types").select("id, name").eq("workspace_id", ws).eq("active", true);
    const kitIn = typeof b.kitId === "string" && UUID.test(b.kitId) ? b.kitId : "";
    const prof = kitIn ? ((await db.from("brand_kits").select("studio_profile").eq("id", kitIn).eq("workspace_id", ws).maybeSingle()).data as { studio_profile?: unknown } | null) : null;
    const langs = b.langs && typeof b.langs === "object" ? (Object.fromEntries(Object.entries(b.langs as Record<string, unknown>).filter(([, v]) => typeof v === "string").slice(0, 6)) as Record<string, string>) : {};
    const issues = checkStudioPage({ html, after, meetings: types.error ? null : ((types.data ?? []) as { id: string; name: string }[]), industry: readProfile(prof?.studio_profile)?.industry ?? null, langs });
    const errs = errorsIn(issues);
    if (errs.length) return Response.json({ error: errs[0]!.text, issues: errs }, { status: 400 });
    // A question keeps its field id when it's renamed or Tia writes the page again: the ids the form had last time.
    const formIdIn = typeof b.formId === "string" && UUID.test(b.formId) ? b.formId : "";
    const prev = formIdIn ? ((await db.from("forms").select("draft").eq("id", formIdIn).eq("workspace_id", ws).maybeSingle()).data as { draft?: { page?: { ids?: Record<string, string>; after?: { always?: unknown } }; notify?: unknown; reply?: unknown; keep?: unknown; share?: unknown; consent?: unknown; spam?: unknown; access?: unknown; track?: unknown } } | null) : null;
    const turnstile = !!turnstileSiteKey() && !!process.env.TURNSTILE_SECRET_KEY?.trim();
    const { form: draft, questions } = pageForm({ html, css: String(b.css ?? ""), brand: String(b.brand ?? ""), after, title: name, prevIds: prev?.draft?.page?.ids ?? {}, turnstile, lang: typeof b.lang === "string" ? b.lang : undefined, langs });
    if (!questions.length) return bad("The form has no questions to send.");
    // What the form's other tabs set stays: the auto-reply, how long it keeps sends, the link preview, and its team
    // alert until Always do sets one.
    for (const k of ["reply", "keep", "notify", "share"] as const) if (prev?.draft?.[k] !== undefined && !(k in draft)) (draft as Record<string, unknown>)[k] = prev.draft[k];
    // Consent, the spam checks, Access and Tracking are the Settings tab's: a Studio save keeps what it set.
    for (const k of ["consent", "spam", "access", "track"] as const) if (prev?.draft?.[k] !== undefined) (draft as Record<string, unknown>)[k] = prev.draft[k];
    // Email the team and Post to Slack are the same team alert as the form's Settings, so the last place it changed
    // wins: Always do left as it was keeps the alert Settings set, and a change here keeps the alert's subject.
    const alert = teamAlert(prev?.draft?.notify, (draft as { notify?: unknown }).notify, after.always, prev?.draft?.page?.after?.always);
    if (alert) (draft as Record<string, unknown>).notify = alert;
    const ctx = await cleaningCtx(db, ws);
    const r = checkForm(draft, { custom: ctx.custom });
    if ("errors" in r) return bad(r.errors[0]!, 400);
    const kitId = typeof b.kitId === "string" && UUID.test(b.kitId) ? b.kitId : null;
    const formId = typeof b.formId === "string" && UUID.test(b.formId) ? b.formId : "";
    if (formId) {
      const { data: had } = await db.from("forms").select("id, draft_rev").eq("id", formId).eq("workspace_id", ws).maybeSingle();
      if (had) {
        const up = await db
          .from("forms")
          .update({ name, draft: r.form, brand_kit_id: kitId, draft_rev: ((had as { draft_rev: number }).draft_rev ?? 0) + 1, updated_at: new Date().toISOString() })
          .eq("id", formId)
          .eq("workspace_id", ws);
        if (up.error) return bad(up.error.message, 500);
        return Response.json({ formId });
      }
    }
    const ins = await db.from("forms").insert({ workspace_id: ws, name, draft: r.form, brand_kit_id: kitId, created_by: auth.user.id, kind: "built" }).select("id").single();
    if (ins.error) return bad(ins.error.message, 500);
    return Response.json({ formId: (ins.data as { id: string }).id });
  }

  const c = client();
  if (!c) {
    console.error("studio: ANTHROPIC_API_KEY isn't set");
    return bad("Tia isn't set up on this server.", 503);
  }

  if (b.mode === "look") {
    const kitId = typeof b.kitId === "string" && UUID.test(b.kitId) ? b.kitId : "";
    const { data: kit } = await db.from("brand_kits").select("id, name, source_url, tokens").eq("id", kitId).eq("workspace_id", ws).maybeSingle();
    const k = kit as { id: string; name: string; source_url: string | null; tokens: Record<string, unknown> | null } | null;
    if (!k?.source_url) return bad("Brand not found.", 404);
    return lines(async (send) => {
      const src = await readSource(k.source_url!);
      const colors = Object.fromEntries(Object.entries(k.tokens ?? {}).filter(([, v]) => typeof v === "string" && v.length <= 120)) as Record<string, string>;
      const input = src ? sourceText({ ...src, colors }) : `SITE ${k.source_url}\nCOLORS ${JSON.stringify(colors)}\n(The page couldn't be read.)`;
      const user = `BRAND: ${k.name} (${k.source_url})\n\n${input.slice(0, 240_000)}`;
      const day = new Date().toISOString().slice(0, 10);
      const r = await cachedStep(rpc, ws, "studio_look", hashKey(STUDIO_MODEL, "look-1", k.source_url, day, user.length, b.fresh === true ? Date.now() : 0), async () => {
        let usage = ZERO;
        const out = await opus(c, BRAND_RULES, [{ role: "user", content: user }], 16000, "medium", () => send({ working: 1 }));
        usage = out.usage;
        const css = tag(out.text, "brand_css");
        return { result: css ? { css, say: tag(out.text, "say") ?? "", profile: readProfile(tag(out.text, "profile")) } : null, model: STUDIO_MODEL, usage, keep: !!css };
      });
      if (!r.result) return send({ error: `Couldn't read ${k.name}'s look. Try again.` });
      // Kept on the brand (112), so every chat and teammate shares it. Before 112, the page keeps it.
      await db.from("brand_kits").update({ studio_css: r.result.css }).eq("id", k.id).eq("workspace_id", ws);
      // The industry, language and country (113), kept unless the owner already set them.
      const profile = (r.result as { profile?: ReturnType<typeof readProfile> }).profile ?? null;
      if (profile) await db.from("brand_kits").update({ studio_profile: profile }).eq("id", k.id).eq("workspace_id", ws).is("studio_profile", null);
      send({ css: r.result.css, say: r.result.say, profile, faces: src?.faces ?? [] });
    });
  }

  if (b.mode === "chat") {
    const turns = (Array.isArray(b.turns) ? b.turns : [])
      .filter((t): t is Turn => !!t && typeof t === "object" && ((t as Turn).role === "user" || (t as Turn).role === "assistant") && typeof (t as Turn).content === "string" && !!(t as Turn).content.trim())
      .slice(-30)
      .map((t) => ({ role: t.role, content: t.content.slice(0, 200_000) }));
    if (!turns.length || turns[0]!.role !== "user" || turns.at(-1)!.role !== "user") return bad("The chat can't be read.");
    const brand = typeof b.brand === "string" ? b.brand.slice(0, 220_000) : "";
    // Files the owner attached to this message: pictures and PDFs Tia reads (text files come inside the words).
    const files: Block[] = [];
    for (const f of (Array.isArray(b.files) ? b.files : []).slice(0, 5)) {
      const o = (f && typeof f === "object" ? f : {}) as Record<string, unknown>;
      const type = String(o.type ?? ""), data = typeof o.data === "string" ? o.data : "", name = String(o.name ?? "file").slice(0, 120);
      if (!/^[A-Za-z0-9+/=]+$/.test(data)) return bad(`${name} couldn't be read.`);
      const size = Math.floor((data.length * 3) / 4);
      if (IMAGE_TYPES.has(type)) {
        if (size > MAX_IMAGE) return bad(`${name} is over 5 MB. Attach a smaller picture.`);
        files.push({ type: "image", source: { type: "base64", media_type: type, data } });
      } else if (type === "application/pdf") {
        if (size > MAX_PDF) return bad(`${name} is over 10 MB. Attach a smaller PDF.`);
        files.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data }, title: name });
      } else return bad(`${name} isn't a picture or a PDF.`);
    }
    const messages: Msg[] = turns.map((t, i) => (i === turns.length - 1 && files.length ? { role: t.role, content: [...files, { type: "text", text: t.content }] } : t));
    // A change to a built form needs little thinking; a first build, a file to read or a big ask gets more.
    const effort = b.built === true && !files.length && turns.at(-1)!.content.length < 60_000 ? "low" : "medium";
    return lines(async (send) => {
      const r = await cachedStep(rpc, ws, "studio_chat", hashKey(STUDIO_MODEL, "chat-3", effort, brand, turns, files.map((f) => ("source" in f ? f.source.data : ""))), async () => {
        const out = await opus(c, CHAT_RULES, messages, 32000, effort, (d) => send({ t: d }), brand);
        if (out.stop === "refusal") return { result: null, model: STUDIO_MODEL, usage: out.usage, keep: false };
        return { result: { text: out.text, cut: out.stop === "max_tokens" }, model: STUDIO_MODEL, usage: out.usage, keep: out.stop !== "max_tokens" };
      });
      if (!r.result) return send({ error: "Tia couldn't answer that. Try saying it another way." });
      // From the cache: the whole answer at once.
      if (r.cached) send({ t: r.result.text });
      send({ done: r.result.text, cut: r.result.cut });
    });
  }
  if (b.mode === "translate") {
    // Only the words go out and come back (no markup), so a translation costs a fraction of the whole page.
    const texts = (Array.isArray(b.texts) ? b.texts : []).slice(0, 600).map((t) => String(t ?? "").slice(0, 2000));
    const lang = typeof b.lang === "string" ? b.lang.slice(0, 40) : "";
    if (!texts.length || !lang) return bad("Nothing to translate.");
    const r = await cachedStep(rpc, ws, "studio_translate", hashKey(STUDIO_MODEL, "tr-1", lang, texts), async () => {
      const out = await opus(c, TRANSLATE_RULES, [{ role: "user", content: `Language: ${lang}\n${JSON.stringify(texts)}` }], 16000, "low", () => {});
      const m = /\[[\s\S]*\]/.exec(out.text);
      let list: unknown = null;
      try {
        list = m ? JSON.parse(m[0]) : null;
      } catch {}
      const ok = Array.isArray(list) && list.length === texts.length && list.every((x) => typeof x === "string");
      return { result: ok ? (list as string[]) : null, model: STUDIO_MODEL, usage: out.usage, keep: ok };
    });
    if (!r.result) return bad("Tia couldn't translate the form. Try again.", 502);
    return Response.json({ texts: r.result });
  }

  return bad("Unknown mode.");
}
