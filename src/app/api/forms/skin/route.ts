import Anthropic from "@anthropic-ai/sdk";
import { cachedStep, hashKey, usageOf } from "@/lib/ai/cache";
import { fetchText } from "@/lib/brand/fetchSite";
import { stylesheets } from "@/lib/brand/quick";
import { readSkin } from "@/lib/brand/skin";
import { googleFontSheets, pageSource, SKIN_MODEL, skinFromSource, type SourceCaller } from "@/lib/brand/sourceSkin";
import { isMember } from "@/lib/contacts/server";
import { requireUser } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";

// A brand kit's look (docs/forms.md, Styling): POST { workspaceId, kitId, fresh? } → { skin, measuring }.
// Two reads at once:
//   1. The runner's browser read (brand_scan): it opens the site, measures the real buttons, inputs and fonts, and
//      Claude copies them. The best look, in a minute or two, when the runner is up. Started when the kit has none.
//   2. The page source: the page and every stylesheet go to Claude here, and its stylesheet is kept on the kit at once.
// The browser read replaces the page-source one when it lands. `measuring` says it's on its way. Every failure is
// logged and answered with what went wrong.

export const maxDuration = 300;
const bad = (error: string, status = 400) => Response.json({ error }, { status });

function claude(): SourceCaller | null {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 240_000 });
  return async (p) => {
    const res = await client.beta.messages.create({
      model: SKIN_MODEL,
      max_tokens: p.maxTokens,
      output_config: { effort: "medium", format: { type: "json_schema", schema: p.schema } },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: p.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: p.user }],
    } as unknown as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming);
    if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") return null;
    return { text: res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join(""), usage: res.usage };
  };
}

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const b = (await request.json().catch(() => ({}))) as { workspaceId?: unknown; kitId?: unknown; fresh?: unknown };
  if (!(await isMember(auth, b.workspaceId))) return bad("Workspace not found.", 404);
  const ws = b.workspaceId as string;
  if (typeof b.kitId !== "string" || !/^[0-9a-f-]{36}$/.test(b.kitId)) return bad("Brand not found.", 404);
  const db = serviceClient();
  if (!db) return bad("The server is not set up for this.", 500);
  const { data: kit } = await db.from("brand_kits").select("id, source_url, skin, tokens, scan_status").eq("id", b.kitId).eq("workspace_id", ws).maybeSingle();
  if (!kit) return bad("Brand not found.", 404);
  const k = kit as { id: string; source_url: string | null; skin?: unknown; tokens?: Record<string, unknown> | null; scan_status?: string | null };
  if (!k.source_url) return bad("This brand has no website to copy from.");
  const have = readSkin(k.skin) ? (k.skin as { via?: string }) : null;
  const measured = !!have && have.via !== "source";
  if (measured && b.fresh !== true) return Response.json({ skin: k.skin, measuring: false });
  // 1. The browser read, unless one is already running.
  let measuring = k.scan_status === "scanning";
  if (!measuring) {
    const started = await db.rpc("brand_scan_start", { p_user: auth.user.id, p_ws: ws, p_url: /^https?:\/\//i.test(k.source_url) ? k.source_url : `https://${k.source_url}`, p_kit: k.id, p_form: null });
    if (started.error) console.error(`form skin: the browser read didn't start for ${k.id}: ${started.error.message}`);
    measuring = !started.error;
  }
  if (have && b.fresh !== true) return Response.json({ skin: k.skin, measuring });
  const model = claude();
  if (!model) {
    console.error("form skin: ANTHROPIC_API_KEY isn't set");
    return bad("The AI isn't set up on this server.", 503);
  }

  const page = await fetchText(/^https?:\/\//i.test(k.source_url) ? k.source_url : `https://${k.source_url}`, "text/html", 3_000_000, 10_000);
  if (!page || !/<html|<body|<head/i.test(page.text)) {
    console.error(`form skin: couldn't open ${k.source_url}`);
    return Response.json({ error: "Couldn't open that website.", measuring }, { status: 422 });
  }
  const links = [...stylesheets(page.text, page.url, 10), ...googleFontSheets(page.text, page.url)];
  const sheets = (await Promise.all(links.map((u) => fetchText(u, "text/css,*/*;q=0.1", 2_000_000, 8000)))).filter((x): x is { url: string; text: string } => !!x && !/<html/i.test(x.text.slice(0, 200)));
  // The colors and font already read from the live site, so a page built by scripts still gets its brand.
  const colors = Object.fromEntries(Object.entries(k.tokens ?? {}).filter(([, v]) => typeof v === "string" && v.length <= 120)) as Record<string, string>;
  const src = { ...pageSource(page.url, page.text, sheets), colors };
  try {
    const day = new Date().toISOString().slice(0, 10);
    const r = await cachedStep((fn, args) => db.rpc(fn, args), ws, "form_source_skin", hashKey(SKIN_MODEL, "source-skin-2", src.url, day, src.css.map((c) => c.url), colors), async () => {
      const out = await skinFromSource(model, src);
      return { result: out ? { css: out.css, faces: out.faces, notes: out.notes } : null, model: SKIN_MODEL, usage: out ? usageOf(out.usage) : usageOf(undefined), keep: !!out };
    });
    if (!r.result) {
      console.error(`form skin: Claude's stylesheet for ${src.url} couldn't be used (${src.css.length} stylesheets, ${src.html.length} chars of HTML)`);
      return Response.json({ error: "Couldn't copy that site's look. Try again.", measuring }, { status: 422 });
    }
    const skin = { css: r.result.css, faces: r.result.faces, at: new Date().toISOString(), from: page.url, notes: r.result.notes, via: "source" };
    const saved = await db.rpc("brand_kit_skin", { p_kit: k.id, p_skin: skin });
    if (saved.error) {
      const direct = await db.from("brand_kits").update({ skin, updated_at: new Date().toISOString() }).eq("id", k.id);
      if (direct.error) {
        console.error(`form skin: couldn't save on ${k.id}: ${direct.error.message}`);
        return bad("Couldn't save the look.", 500);
      }
    }
    return Response.json({ skin, measuring });
  } catch (e) {
    console.error(`form skin: ${(e as Error).message}`);
    return Response.json({ error: "The AI didn't answer. Try again in a moment.", measuring }, { status: 503 });
  }
}
