import { randomUUID } from "node:crypto";
import { checkAnswers, MAX_FILE_BYTES } from "@/lib/forms/answers";
import { cleaningCtx } from "@/lib/contacts/server";
import { allFields } from "@/lib/forms/logic";
import { submitForm, type LiveForm } from "@/lib/forms/submit";
import type { FileRef } from "@/lib/forms/types";
import { burst, ipHash, visitorOf } from "@/lib/forms/visitor";
import { serviceClient } from "@/lib/serviceClient";

// A visitor sends a live form (docs/form-templates.md Part 1). multipart/form-data: slug, payload (JSON:
// answers, ticked, token, hp, started, meta) and one part per file named file:<field key>. Answers are checked
// again here; files go to storage only after the answers pass, and come back out if the submission fails.

export const runtime = "nodejs";

const bad = (status: number, body: object) => Response.json(body, { status });
const META_KEYS = new Set(["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "page", "referrer", "gclid", "fbclid", "li_fat_id"]);

async function turnstileOk(token: string, ip: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET?.trim();
  if (!secret) return true;
  if (!token) return false;
  for (let i = 0; i < 3; i++) {
    try {
      const body = new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) });
      const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body, signal: AbortSignal.timeout(8000) });
      if (r.status >= 500) throw new Error(String(r.status));
      return !!((await r.json()) as { success?: boolean }).success;
    } catch {
      await new Promise((res) => setTimeout(res, 400 * 2 ** i));
    }
  }
  // Cloudflare unreachable: let people through rather than lose a real lead; the rate limits still hold.
  return true;
}

const safeName = (n: string) => n.replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, "_").slice(-120) || "file";

export async function POST(request: Request) {
  const db = serviceClient();
  if (!db) return bad(503, { ok: false, error: "Forms aren't set up on this server yet." });
  if (Number(request.headers.get("content-length") ?? 0) > 55 * 1024 * 1024) return bad(413, { ok: false, error: "The files are too large. Each can be up to 10 MB." });

  let slug = "";
  let payload: Record<string, unknown> = {};
  const parts = new Map<string, File[]>();
  try {
    const ct = request.headers.get("content-type") ?? "";
    if (ct.includes("multipart/form-data")) {
      const fd = await request.formData();
      slug = String(fd.get("slug") ?? "");
      payload = JSON.parse(String(fd.get("payload") ?? "{}")) as Record<string, unknown>;
      for (const [k, v] of fd.entries()) if (k.startsWith("file:") && typeof v !== "string") parts.set(k.slice(5), [...(parts.get(k.slice(5)) ?? []), v]);
    } else {
      const j = (await request.json()) as { slug?: string; payload?: Record<string, unknown> };
      slug = String(j.slug ?? "");
      payload = j.payload ?? {};
    }
  } catch {
    return bad(400, { ok: false, error: "We couldn't read the form. Reload the page and try again." });
  }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 60) return bad(404, { ok: false, error: "This form is closed." });

  const { data: row } = await db.from("forms").select("id, workspace_id, schema, settings, status").eq("slug", slug).maybeSingle();
  if (!row || row.status !== "live") return bad(404, { ok: false, error: "This form is closed." });
  const form = row as LiveForm & { status: string };

  // Bots: the hidden box filled in, or the whole form sent in under two seconds. They get a quiet yes.
  const started = Number(payload.started ?? 0);
  if ((typeof payload.hp === "string" && payload.hp.trim()) || (started > 0 && Date.now() - started < 2000)) return Response.json({ ok: true, score: null });

  const who = visitorOf(request.headers);
  if (burst(who.ip)) return bad(429, { ok: false, error: "Too many tries. Wait a minute and send again." });
  if (!(await turnstileOk(String(payload.token ?? ""), who.ip))) return bad(400, { ok: false, error: "Please confirm you're human and send again." });

  const raw = (payload.answers && typeof payload.answers === "object" ? payload.answers : {}) as Record<string, unknown>;
  const fileFields = allFields(form.schema).filter((f) => f.kind === "file" || f.kind === "signature");
  for (const f of fileFields) {
    const list = parts.get(f.key) ?? [];
    raw[f.key] = list.length ? list.map((x) => ({ name: x.name, size: x.size, type: x.type || "application/octet-stream", path: "" })) : undefined;
  }
  // Check before anything is stored.
  const pre = checkAnswers(form.schema, raw);
  if (Object.keys(pre.errors).length) return bad(400, { ok: false, errors: pre.errors });

  // Files the answers kept go to storage; the rest are dropped.
  const uploaded: string[] = [];
  const cleanup = async () => {
    if (uploaded.length) await db.storage.from("form-files").remove(uploaded);
  };
  try {
    for (const f of fileFields) {
      if (!pre.answers[f.key]) continue;
      const refs: FileRef[] = [];
      for (const x of parts.get(f.key) ?? []) {
        if (x.size > MAX_FILE_BYTES) return bad(400, { ok: false, errors: { [f.key]: "Files can be up to 10 MB." } });
        const path = `${form.workspace_id}/${form.id}/${randomUUID()}/${safeName(x.name)}`;
        let err: { message: string } | null = null;
        for (let i = 0; i < 3; i++) {
          ({ error: err } = await db.storage.from("form-files").upload(path, x, { contentType: x.type || "application/octet-stream", upsert: false }));
          if (!err) break;
          await new Promise((res) => setTimeout(res, 400 * 2 ** i));
        }
        if (err) throw new Error(err.message);
        uploaded.push(path);
        refs.push({ name: x.name.slice(0, 200), path, size: x.size, type: x.type || "application/octet-stream" });
      }
      raw[f.key] = refs;
    }

    const meta: Record<string, string> = {};
    const m = (payload.meta && typeof payload.meta === "object" ? payload.meta : {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(m)) if (META_KEYS.has(k) && typeof v === "string" && v) meta[k] = v.slice(0, 500);
    if (who.country) meta.country = who.country;
    meta.policy = who.region;
    const ua = request.headers.get("user-agent");
    if (ua) meta.ua = ua.slice(0, 300);

    const ctx = await cleaningCtx(db, form.workspace_id);
    const r = await submitForm(
      { rpc: (fn, args) => db.rpc(fn, args), ctx },
      { form, raw, region: who.region, country: who.country, ticked: payload.ticked === true, meta, ipHash: ipHash(who.ip, form.workspace_id) },
    );
    if (!r.ok) {
      await cleanup();
      return "errors" in r ? bad(400, { ok: false, errors: r.errors }) : bad(r.status, { ok: false, error: r.error });
    }
    return Response.json({ ok: true, score: r.score, redirect: form.schema.end?.redirect || undefined });
  } catch (e) {
    await cleanup().catch(() => {});
    console.error("form submit failed", slug, e instanceof Error ? e.message : e);
    return bad(500, { ok: false, error: "We couldn't save your answers. Try again in a moment." });
  }
}
