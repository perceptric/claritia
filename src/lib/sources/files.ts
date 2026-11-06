// File tools (docs/integrations-plan.md, Next step 9): each fill's uploads copied into a folder named after the fill
// (form, day, fill id) inside the folder picked in the form's Sync tab. Google Drive (drive.file: only folders
// Claritia made), OneDrive, Dropbox, Box and Amazon S3 (the team's bucket, with a key that can write).
//   A file over 4 MB goes in parts (Drive's resumable upload, OneDrive's upload session, Dropbox's upload session, S3
// multipart over 8 MB; Box takes our largest, 20 MB, in one). A part that fails is sent again from where the tool
// says it stopped. A run again after a timeout looks for the folder and each file by name first, so nothing is
// copied twice. Endpoints are from each tool's docs and are rechecked against a real account (check).

import { createHash, createHmac } from "node:crypto";
import type { Connector, CopyFile, CopyFill, Ctx, RowTarget } from "./types.ts";

export type { CopyFile, CopyFill };

export const CHUNK = 4 * 1024 * 1024;
const MAX_FAILS = 3;

/** The fill's folder: "Book a demo 2026-11-06 1a2b3c4d". */
export const fillFolder = (form: string, at: string, id: string) =>
  `${form.replace(/[\\/:*?"<>|#%]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Form"} ${new Date(at).toISOString().slice(0, 10)} ${id.slice(0, 8)}`;

/** A refusal that won't change by trying again (the same flag chat alerts use). */
const refusal = (message: string) => Object.assign(new Error(message), { refused: true });
const transient = (status: number) => status === 429 || status >= 500;
class Hiccup extends Error {}
const raw = (ctx: Ctx) => {
  if (!ctx.raw) throw new Error("This connection can't upload files.");
  return ctx.raw.bind(ctx);
};
const enc = encodeURIComponent;
const jsonOf = async <T>(r: Response): Promise<T> => (await r.json().catch(() => ({}))) as T;

/** Throws for an answer that isn't ok: a hiccup (429, 5xx) to try again, anything else as the tool's words. */
async function ok(r: Response, what: string): Promise<Response> {
  if (r.ok) return r;
  const text = await r.text().catch(() => "");
  if (transient(r.status)) throw new Hiccup(`${what} answered ${r.status}.`);
  throw Object.assign(new Error(`${what}: ${text.slice(0, 200) || `answered ${r.status}`}`), { status: r.status });
}

/**
 * Send a file in parts. `put` sends one part and answers the next offset (or "done"); `where` asks the tool how
 * much it has after a failure. A failed part is sent again from there, up to MAX_FAILS times.
 */
async function parts(total: number, size: number, put: (from: number, to: number) => Promise<number | "done">, where: () => Promise<number | "done">): Promise<void> {
  let at = 0;
  let fails = 0;
  while (at < total) {
    const to = Math.min(at + size, total);
    try {
      const next = await put(at, to);
      if (next === "done") return;
      at = next;
    } catch (e) {
      if (!(e instanceof Hiccup) && !(e instanceof TypeError) && (e as Error).name !== "TimeoutError") throw e;
      if (++fails > MAX_FAILS) throw e;
      const next = await where();
      if (next === "done") return;
      at = next;
    }
  }
}

// Google Drive -------------------------------------------------------------------------------------------------

const DRIVE = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UP = "https://www.googleapis.com/upload/drive/v3/files";
const FOLDER = "application/vnd.google-apps.folder";
const dq = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
const driveUrl = (id: string) => `https://drive.google.com/drive/folders/${id}`;

async function driveFind(ctx: Ctx, parent: string, name: string, folder: boolean): Promise<string | null> {
  const q = `name = '${dq(name)}' and '${dq(parent)}' in parents and trashed = false${folder ? ` and mimeType = '${FOLDER}'` : ""}`;
  const d = await ctx.api<{ files?: { id: string }[] }>(`${DRIVE}?q=${enc(q)}&fields=files(id)&pageSize=1&spaces=drive`);
  return d.files?.[0]?.id ?? null;
}

async function driveUpload(ctx: Ctx, folder: string, f: CopyFile): Promise<void> {
  const r = raw(ctx);
  const meta = JSON.stringify({ name: f.name, parents: [folder] });
  if (f.bytes.length <= CHUNK) {
    const b = `clr${Date.now().toString(36)}`;
    const body = Buffer.concat([
      Buffer.from(`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${b}\r\nContent-Type: ${f.type}\r\n\r\n`),
      Buffer.from(f.bytes),
      Buffer.from(`\r\n--${b}--`),
    ]);
    await ok(await r(`${DRIVE_UP}?uploadType=multipart&fields=id`, { method: "POST", headers: { "content-type": `multipart/related; boundary=${b}` }, body }), "Drive");
    return;
  }
  const start = await ok(
    await r(`${DRIVE_UP}?uploadType=resumable&fields=id`, { method: "POST", headers: { "content-type": "application/json; charset=UTF-8", "x-upload-content-type": f.type, "x-upload-content-length": String(f.bytes.length) }, body: meta }),
    "Drive",
  );
  const session = start.headers.get("location");
  if (!session) throw new Error("Drive didn't start the upload.");
  const total = f.bytes.length;
  // Drive answers 308 with the bytes it has ("bytes=0-N") until the last part.
  const after = (res: Response): number | "done" => {
    if (res.status === 200 || res.status === 201) return "done";
    const m = /bytes=0-(\d+)/.exec(res.headers.get("range") ?? "");
    return m ? Number(m[1]) + 1 : 0;
  };
  await parts(
    total,
    CHUNK,
    async (from, to) => {
      const res = await r(session, { method: "PUT", headers: { "content-range": `bytes ${from}-${to - 1}/${total}` }, body: Buffer.from(f.bytes.subarray(from, to)) });
      if (res.status === 308 || res.ok) return after(res);
      await ok(res, "Drive");
      return after(res);
    },
    async () => after(await r(session, { method: "PUT", headers: { "content-range": `bytes */${total}` } })),
  );
}

export const googleDrive: Connector = {
  kind: "google_drive",
  objects: [],
  gapMs: 150,
  async account(ctx) {
    const d = await ctx.api<{ id: string; email: string }>("https://www.googleapis.com/oauth2/v2/userinfo");
    return { id: d.id, label: d.email };
  },
  async makeFolder(ctx, name) {
    const d = await ctx.api<{ id: string; name: string }>(`${DRIVE}?fields=id,name`, { method: "POST", body: JSON.stringify({ name: name || "Claritia uploads", mimeType: FOLDER }) });
    return { id: d.id, name: d.name, url: driveUrl(d.id) };
  },
  async copy(ctx, target, fill) {
    if (!target) throw refusal("Pick a Drive folder.");
    const parent = await ctx.api<{ trashed?: boolean }>(`${DRIVE}/${enc(target.id)}?fields=id,trashed`).catch((e) => {
      if ((e as { status?: number }).status === 404) return { trashed: true };
      throw e;
    });
    if (parent.trashed) throw refusal(`The Drive folder ${target.name} is gone.`);
    const sub = (await driveFind(ctx, target.id, fill.folder, true)) ?? (await ctx.api<{ id: string }>(`${DRIVE}?fields=id`, { method: "POST", body: JSON.stringify({ name: fill.folder, mimeType: FOLDER, parents: [target.id] }) })).id;
    for (const f of fill.files) if (!(await driveFind(ctx, sub, f.name, false))) await driveUpload(ctx, sub, f);
    return { id: sub, url: driveUrl(sub) };
  },
  defaults: { contact: {} },
};

// OneDrive -----------------------------------------------------------------------------------------------------

const OD = "https://graph.microsoft.com/v1.0/me/drive";
/** OneDrive's parts are multiples of 320 KiB: 12 of them. */
export const OD_CHUNK = 12 * 320 * 1024;
const odPath = (folder: string, name: string) => `${OD}/items/${enc(folder)}:/${enc(name)}`;

async function odFind(ctx: Ctx, folder: string, name: string): Promise<{ id: string; webUrl?: string } | null> {
  const res = await raw(ctx)(`${odPath(folder, name)}?$select=id,webUrl`);
  if (res.status === 404) return null;
  return jsonOf<{ id: string; webUrl?: string }>(await ok(res, "OneDrive"));
}

async function odUpload(ctx: Ctx, folder: string, f: CopyFile): Promise<void> {
  const r = raw(ctx);
  if (f.bytes.length <= CHUNK) {
    await ok(await r(`${odPath(folder, f.name)}:/content?@microsoft.graph.conflictBehavior=fail`, { method: "PUT", headers: { "content-type": f.type }, body: Buffer.from(f.bytes) }), "OneDrive");
    return;
  }
  const s = await jsonOf<{ uploadUrl?: string }>(
    await ok(await r(`${odPath(folder, f.name)}:/createUploadSession`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "fail" } }) }), "OneDrive"),
  );
  if (!s.uploadUrl) throw new Error("OneDrive didn't start the upload.");
  const total = f.bytes.length;
  const next = async (res: Response): Promise<number | "done"> => {
    if (res.status === 200 || res.status === 201) return "done";
    const j = await jsonOf<{ nextExpectedRanges?: string[] }>(res);
    const m = /^(\d+)-/.exec(j.nextExpectedRanges?.[0] ?? "");
    return m ? Number(m[1]) : 0;
  };
  // The session address carries its own key: no sign-in on these calls.
  await parts(
    total,
    OD_CHUNK,
    async (from, to) => next(await ok(await r(s.uploadUrl!, { method: "PUT", auth: false, headers: { "content-range": `bytes ${from}-${to - 1}/${total}` }, body: Buffer.from(f.bytes.subarray(from, to)) }), "OneDrive")),
    // The session's own status answers 200 while it's still open: only its next range counts.
    async () => {
      const j = await jsonOf<{ nextExpectedRanges?: string[] }>(await ok(await r(s.uploadUrl!, { auth: false }), "OneDrive"));
      const m = /^(\d+)-/.exec(j.nextExpectedRanges?.[0] ?? "");
      return m ? Number(m[1]) : 0;
    },
  );
}

export const oneDrive: Connector = {
  kind: "onedrive",
  objects: [],
  gapMs: 150,
  async account(ctx) {
    const d = await ctx.api<{ id: string; mail?: string; userPrincipalName?: string }>("https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName");
    return { id: d.id, label: d.mail ?? d.userPrincipalName ?? "OneDrive" };
  },
  async targets(ctx) {
    const d = await ctx.api<{ value?: { id: string; name: string; webUrl?: string; folder?: object }[] }>(`${OD}/root/children?$select=id,name,webUrl,folder&$top=200`);
    return (d.value ?? []).filter((x) => x.folder).map((x) => ({ id: x.id, name: x.name, ...(x.webUrl ? { url: x.webUrl } : {}) }));
  },
  async makeFolder(ctx, name) {
    const d = await ctx.api<{ id: string; name: string; webUrl?: string }>(`${OD}/root/children`, { method: "POST", body: JSON.stringify({ name: name || "Claritia uploads", folder: {}, "@microsoft.graph.conflictBehavior": "rename" }) });
    return { id: d.id, name: d.name, ...(d.webUrl ? { url: d.webUrl } : {}) };
  },
  async copy(ctx, target, fill) {
    if (!target) throw refusal("Pick a OneDrive folder.");
    const parent = await raw(ctx)(`${OD}/items/${enc(target.id)}?$select=id`);
    if (parent.status === 404) throw refusal(`The OneDrive folder ${target.name} is gone.`);
    await ok(parent, "OneDrive");
    let sub = await odFind(ctx, target.id, fill.folder);
    if (!sub) sub = await ctx.api<{ id: string; webUrl?: string }>(`${OD}/items/${enc(target.id)}/children`, { method: "POST", body: JSON.stringify({ name: fill.folder, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }) });
    for (const f of fill.files) if (!(await odFind(ctx, sub.id, f.name))) await odUpload(ctx, sub.id, f);
    return { id: sub.id, ...(sub.webUrl ? { url: sub.webUrl } : {}) };
  },
  defaults: { contact: {} },
};

// Dropbox ------------------------------------------------------------------------------------------------------

const DBX = "https://api.dropboxapi.com/2";
const DBX_UP = "https://content.dropboxapi.com/2";
/** Dropbox-API-Arg must be ASCII: everything else as \u escapes. */
export const headerJson = (v: unknown) => JSON.stringify(v).replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
type DbxError = { error_summary?: string; error?: { ".tag"?: string; correct_offset?: number } };

async function dbx<T>(ctx: Ctx, path: string, body: unknown): Promise<{ status: number; data: T & DbxError }> {
  const res = await raw(ctx)(`${DBX}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (transient(res.status)) throw new Hiccup(`Dropbox answered ${res.status}.`);
  const data = await jsonOf<T & DbxError>(res);
  if (!res.ok && res.status !== 409) throw Object.assign(new Error(`Dropbox: ${data.error_summary ?? res.status}`), { status: res.status });
  return { status: res.status, data };
}

async function dbxUpload(ctx: Ctx, path: string, f: CopyFile): Promise<void> {
  const r = raw(ctx);
  const send = async (url: string, arg: unknown, from: number, to: number) => r(`${DBX_UP}${url}`, { method: "POST", headers: { "content-type": "application/octet-stream", "dropbox-api-arg": headerJson(arg) }, body: Buffer.from(f.bytes.subarray(from, to)) });
  const commit = { path, mode: "add", autorename: false, mute: true };
  if (f.bytes.length <= CHUNK) {
    await ok(await send("/files/upload", commit, 0, f.bytes.length), "Dropbox");
    return;
  }
  const total = f.bytes.length;
  const first = await jsonOf<{ session_id?: string }>(await ok(await send("/files/upload_session/start", { close: false }, 0, CHUNK), "Dropbox"));
  const id = first.session_id;
  if (!id) throw new Error("Dropbox didn't start the upload.");
  let known = CHUNK;
  await parts(
    total - CHUNK,
    CHUNK,
    async (from0, to0) => {
      const from = from0 + CHUNK,
        to = to0 + CHUNK;
      const last = to >= total;
      const res = last
        ? await send("/files/upload_session/finish", { cursor: { session_id: id, offset: from }, commit }, from, to)
        : await send("/files/upload_session/append_v2", { cursor: { session_id: id, offset: from }, close: false }, from, to);
      if (res.status === 409) {
        // A part that went before its answer was lost: Dropbox says where it is.
        const e = await jsonOf<DbxError>(res);
        if (e.error?.[".tag"] === "incorrect_offset" && typeof e.error.correct_offset === "number") {
          known = e.error.correct_offset;
          return known - CHUNK;
        }
        throw new Error(`Dropbox: ${e.error_summary ?? "it refused the part"}`);
      }
      await ok(res, "Dropbox");
      known = to;
      return last ? "done" : to - CHUNK;
    },
    // Send the same part again; a 409 above corrects the offset when it had arrived.
    async () => known - CHUNK,
  );
}

export const dropbox: Connector = {
  kind: "dropbox",
  objects: [],
  gapMs: 200,
  async account(ctx) {
    const res = await ok(await raw(ctx)(`${DBX}/users/get_current_account`, { method: "POST" }), "Dropbox");
    const d = await jsonOf<{ account_id: string; email?: string }>(res);
    return { id: d.account_id, label: d.email ?? "Dropbox" };
  },
  async targets(ctx) {
    const { data } = await dbx<{ entries?: { ".tag": string; path_display: string; name: string }[] }>(ctx, "/files/list_folder", { path: "", limit: 200 });
    return (data.entries ?? []).filter((e) => e[".tag"] === "folder").map((e) => ({ id: e.path_display, name: e.path_display, url: `https://www.dropbox.com/home${encodeURI(e.path_display)}` }));
  },
  async makeFolder(ctx, name) {
    const { data } = await dbx<{ metadata?: { path_display: string } }>(ctx, "/files/create_folder_v2", { path: `/${name || "Claritia uploads"}`, autorename: true });
    const p = data.metadata?.path_display ?? `/${name}`;
    return { id: p, name: p, url: `https://www.dropbox.com/home${encodeURI(p)}` };
  },
  async copy(ctx, target, fill) {
    if (!target) throw refusal("Pick a Dropbox folder.");
    const sub = `${target.id.replace(/\/+$/, "")}/${fill.folder}`;
    const made = await dbx(ctx, "/files/create_folder_v2", { path: sub, autorename: false });
    if (made.status === 409 && !/path\/conflict/.test(made.data.error_summary ?? "")) throw refusal(`Dropbox: ${made.data.error_summary ?? "it refused the folder"}`);
    for (const f of fill.files) {
      const there = await dbx(ctx, "/files/get_metadata", { path: `${sub}/${f.name}` });
      if (there.status === 200) continue;
      await dbxUpload(ctx, `${sub}/${f.name}`, f);
    }
    return { id: sub, url: `https://www.dropbox.com/home${encodeURI(sub)}` };
  },
  defaults: { contact: {} },
};

// Box ----------------------------------------------------------------------------------------------------------

const BOX = "https://api.box.com/2.0";
const boxUrl = (id: string) => `https://app.box.com/folder/${id}`;

/** A folder in a parent, or the one already there by that name (Box answers 409 with its id). */
async function boxFolder(ctx: Ctx, parent: string, name: string): Promise<string> {
  const res = await raw(ctx)(`${BOX}/folders?fields=id`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, parent: { id: parent } }) });
  if (res.status === 409) {
    const j = await jsonOf<{ context_info?: { conflicts?: { id: string }[] } }>(res);
    const id = j.context_info?.conflicts?.[0]?.id;
    if (id) return id;
  }
  if (res.status === 404) throw refusal("The Box folder is gone.");
  return (await jsonOf<{ id: string }>(await ok(res, "Box"))).id;
}

export const box: Connector = {
  kind: "box",
  objects: [],
  gapMs: 150,
  async account(ctx) {
    const d = await ctx.api<{ id: string; login?: string }>(`${BOX}/users/me?fields=id,login`);
    return { id: d.id, label: d.login ?? "Box" };
  },
  async targets(ctx) {
    const d = await ctx.api<{ entries?: { type: string; id: string; name: string }[] }>(`${BOX}/folders/0/items?fields=type,name&limit=200`);
    return (d.entries ?? []).filter((e) => e.type === "folder").map((e) => ({ id: e.id, name: e.name, url: boxUrl(e.id) }));
  },
  async makeFolder(ctx, name) {
    const id = await boxFolder(ctx, "0", name || "Claritia uploads");
    return { id, name: name || "Claritia uploads", url: boxUrl(id) };
  },
  async copy(ctx, target, fill) {
    if (!target) throw refusal("Pick a Box folder.");
    const parent = await raw(ctx)(`${BOX}/folders/${enc(target.id)}?fields=id`);
    if (parent.status === 404) throw refusal(`The Box folder ${target.name} is gone.`);
    await ok(parent, "Box");
    const sub = await boxFolder(ctx, target.id, fill.folder);
    const have = new Set(((await ctx.api<{ entries?: { name: string }[] }>(`${BOX}/folders/${enc(sub)}/items?fields=name&limit=1000`)).entries ?? []).map((e) => e.name));
    for (const f of fill.files) {
      if (have.has(f.name)) continue;
      const form = new FormData();
      form.append("attributes", JSON.stringify({ name: f.name, parent: { id: sub } }));
      form.append("file", new Blob([Buffer.from(f.bytes)], { type: f.type }), f.name);
      const res = await raw(ctx)("https://upload.box.com/api/2.0/files/content?fields=id", { method: "POST", body: form });
      // A copy that landed before its answer was lost is already there by name.
      if (res.status === 409) continue;
      await ok(res, "Box");
    }
    return { id: sub, url: boxUrl(sub) };
  },
  defaults: { contact: {} },
};

// Amazon S3 ----------------------------------------------------------------------------------------------------

const sha256 = (b: string | Uint8Array) => createHash("sha256").update(b).digest("hex");
const hmac = (k: string | Buffer, s: string) => createHmac("sha256", k).update(s, "utf8").digest();
const rfc3986 = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export type SigInput = { method: string; host: string; path: string; query?: Record<string, string>; headers: Record<string, string>; payloadHash: string; amzDate: string; region: string; service: string; accessKey: string; secret: string };

/** AWS Signature Version 4: the Authorization header for one request. Headers are lowercase and include host. */
export function signV4(i: SigInput): string {
  const day = i.amzDate.slice(0, 8);
  const scope = `${day}/${i.region}/${i.service}/aws4_request`;
  const names = Object.keys(i.headers).map((h) => h.toLowerCase()).sort();
  const byName = Object.fromEntries(Object.entries(i.headers).map(([k, v]) => [k.toLowerCase(), v]));
  const canonicalHeaders = names.map((h) => `${h}:${String(byName[h]).trim().replace(/\s+/g, " ")}\n`).join("");
  const query = Object.entries(i.query ?? {})
    .map(([k, v]) => [rfc3986(k), rfc3986(v)])
    .sort(([a], [b]) => (a! < b! ? -1 : a! > b! ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const path = i.path.split("/").map(rfc3986).join("/") || "/";
  const canonical = [i.method, path, query, canonicalHeaders, names.join(";"), i.payloadHash].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", i.amzDate, scope, sha256(canonical)].join("\n");
  const key = hmac(hmac(hmac(hmac(`AWS4${i.secret}`, day), i.region), i.service), "aws4_request");
  const sig = createHmac("sha256", key).update(toSign, "utf8").digest("hex");
  return `AWS4-HMAC-SHA256 Credential=${i.accessKey}/${scope}, SignedHeaders=${names.join(";")}, Signature=${sig}`;
}

type S3Keys = { accessKey: string; secret: string; region: string; bucket: string; prefix: string };
function s3Keys(ctx: Ctx): S3Keys {
  const k = { accessKey: ctx.secret("access_key_id").trim(), secret: ctx.secret("secret_access_key").trim(), region: ctx.secret("region").trim() || "us-east-1", bucket: ctx.secret("bucket").trim(), prefix: ctx.secret("prefix").trim().replace(/^\/+/, "") };
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(k.bucket)) throw refusal("Add the bucket's name in Settings › Integrations.");
  if (!/^[a-z]{2}(-[a-z]+)+-\d$/.test(k.region)) throw refusal("Add the bucket's region, like us-east-1.");
  if (k.prefix && !k.prefix.endsWith("/")) k.prefix += "/";
  return k;
}

/** One signed call to the bucket. */
async function s3(ctx: Ctx, k: S3Keys, method: string, key: string, o: { query?: Record<string, string>; body?: Uint8Array | string; type?: string; now?: Date } = {}): Promise<Response> {
  const host = `${k.bucket}.s3.${k.region}.amazonaws.com`;
  const amzDate = (o.now ?? new Date()).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const payloadHash = sha256(o.body ?? "");
  const headers: Record<string, string> = { host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate, ...(o.type ? { "content-type": o.type } : {}) };
  const path = `/${key}`;
  const authorization = signV4({ method, host, path, query: o.query, headers, payloadHash, amzDate, region: k.region, service: "s3", accessKey: k.accessKey, secret: k.secret });
  const qs = Object.entries(o.query ?? {}).map(([a, b]) => (b === "" ? rfc3986(a) : `${rfc3986(a)}=${rfc3986(b)}`)).join("&");
  // fetch sets Host itself.
  const send = Object.fromEntries(Object.entries(headers).filter(([h]) => h !== "host"));
  return raw(ctx)(`https://${host}${path.split("/").map(rfc3986).join("/")}${qs ? `?${qs}` : ""}`, {
    method,
    auth: false,
    headers: { ...send, authorization },
    ...(o.body !== undefined ? { body: typeof o.body === "string" ? o.body : Buffer.from(o.body) } : {}),
  });
}

/** S3 parts are at least 5 MB; ours are 8. */
export const S3_PART = 8 * 1024 * 1024;

async function s3Put(ctx: Ctx, k: S3Keys, key: string, f: CopyFile): Promise<void> {
  if (f.bytes.length <= S3_PART) {
    await ok(await s3(ctx, k, "PUT", key, { body: f.bytes, type: f.type }), "S3");
    return;
  }
  const started = await (await ok(await s3(ctx, k, "POST", key, { query: { uploads: "" }, type: f.type }), "S3")).text();
  const id = /<UploadId>([^<]+)<\/UploadId>/.exec(started)?.[1];
  if (!id) throw new Error("S3 didn't start the upload.");
  const etags: string[] = [];
  let part = 1;
  // A part is sent again under its own number: S3 keeps the last one.
  await parts(
    f.bytes.length,
    S3_PART,
    async (from, to) => {
      const res = await ok(await s3(ctx, k, "PUT", key, { query: { partNumber: String(part), uploadId: id }, body: f.bytes.subarray(from, to) }), "S3");
      etags[part - 1] = res.headers.get("etag") ?? "";
      part++;
      return to;
    },
    async () => (part - 1) * S3_PART,
  );
  const xml = `<CompleteMultipartUpload>${etags.map((e, i) => `<Part><PartNumber>${i + 1}</PartNumber><ETag>${e}</ETag></Part>`).join("")}</CompleteMultipartUpload>`;
  await ok(await s3(ctx, k, "POST", key, { query: { uploadId: id }, body: xml, type: "application/xml" }), "S3");
}

export const amazonS3: Connector = {
  kind: "s3",
  objects: [],
  gapMs: 50,
  async account(ctx) {
    const k = s3Keys(ctx);
    const res = await s3(ctx, k, "HEAD", "");
    if (res.status === 403) throw new Error("That key can't reach the bucket.");
    if (res.status === 404 || res.status === 301) throw new Error("No bucket by that name in that region.");
    await ok(res, "S3");
    return { id: k.bucket, label: `${k.bucket} (S3)` };
  },
  async copy(ctx, _target, fill) {
    const k = s3Keys(ctx);
    const base = `${k.prefix}${fill.folder}/`;
    for (const f of fill.files) {
      const key = `${base}${f.name}`;
      const head = await s3(ctx, k, "HEAD", key);
      if (head.ok) continue;
      if (head.status !== 404 && head.status !== 403) await ok(head, "S3");
      await s3Put(ctx, k, key, f);
    }
    return { id: base, url: `https://s3.console.aws.amazon.com/s3/buckets/${k.bucket}?region=${k.region}&prefix=${enc(base)}` };
  },
  defaults: { contact: {} },
};

export const FILE_TOOLS = [googleDrive, oneDrive, dropbox, box, amazonS3];

/** A form upload's bytes, from the private form-uploads bucket (worker and server). */
export async function readUpload(path: string, fetcher: typeof fetch = fetch, env: NodeJS.ProcessEnv = process.env): Promise<Uint8Array> {
  const url = env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  const key = (env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
  if (!url || !key) throw new Error("File storage isn't set up on the worker (SUPABASE_URL and SUPABASE_SECRET_KEY).");
  const res = await fetcher(`${url}/storage/v1/object/form-uploads/${path.split("/").map(enc).join("/")}`, { headers: { authorization: `Bearer ${key}`, apikey: key }, signal: AbortSignal.timeout(60_000) });
  if (res.status === 404 || res.status === 400) throw refusal("The file is gone from the form's uploads.");
  if (!res.ok) throw new Error(`File storage answered ${res.status}.`);
  return new Uint8Array(await res.arrayBuffer());
}

export type { RowTarget };
