// Import files in Supabase Storage (the private "imports" bucket), read and written with the secret key. Used by the
// web app's import routes and by claritia-intel, which have SUPABASE_URL and SUPABASE_SECRET_KEY.

const base = () => {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  const key = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
  if (!url || !key) throw new Error("Storage is not set up on this server");
  return { url, key };
};

const objectUrl = (url: string, path: string) => `${url}/storage/v1/object/imports/${path.split("/").map(encodeURIComponent).join("/")}`;

/** Paths look like <workspace id>/<upload id>/<file name>. */
export const validPath = (ws: string, path: unknown): path is string =>
  typeof path === "string" && path.length < 500 && path.startsWith(`${ws}/`) && !path.includes("..") && path.split("/").length === 3;

/** Calls that answer at once wait this long; a download waits this long for its first byte. */
const CALL_MS = 15_000;
const OPEN_MS = 30_000;

/** The caller's signal (a job's lease and the worker's stop) and a timeout, as one signal. */
const within = (ms: number, signal?: AbortSignal) => (signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms));

export async function fileSize(path: string, signal?: AbortSignal): Promise<number | null> {
  const { url, key } = base();
  const res = await fetch(objectUrl(url, path), { method: "HEAD", headers: { Authorization: `Bearer ${key}`, apikey: key }, signal: within(CALL_MS, signal) });
  if (!res.ok) return null;
  const n = Number(res.headers.get("content-length"));
  return Number.isFinite(n) ? n : null;
}

/** A download that stops when `signal` does, and fails if the first byte takes longer than OPEN_MS. */
async function download(path: string, signal: AbortSignal | undefined, headers: Record<string, string> = {}): Promise<Response> {
  const { url, key } = base();
  const opened = new AbortController();
  const timer = setTimeout(() => opened.abort(new Error("Storage didn't answer")), OPEN_MS);
  try {
    return await fetch(objectUrl(url, path), { headers: { Authorization: `Bearer ${key}`, apikey: key, ...headers }, signal: signal ? AbortSignal.any([signal, opened.signal]) : opened.signal });
  } finally {
    clearTimeout(timer);
  }
}

const gone = (status: number) => (status === 404 || status === 400 ? "The file is gone. Upload it again." : `Couldn't read the file (${status})`);

export async function openFile(path: string, signal?: AbortSignal): Promise<ReadableStream<Uint8Array>> {
  const res = await download(path, signal);
  if (!res.ok || !res.body) throw new Error(gone(res.status));
  return res.body;
}

/** The file from byte `offset` on. `offset` in the answer is where it really starts (0 when storage sent all of it). */
export async function openFileFrom(path: string, offset: number, signal?: AbortSignal): Promise<{ stream: ReadableStream<Uint8Array>; offset: number }> {
  if (offset <= 0) return { stream: await openFile(path, signal), offset: 0 };
  const res = await download(path, signal, { Range: `bytes=${offset}-` });
  if (res.status === 416) return { stream: new ReadableStream({ start: (c) => c.close() }), offset };
  if (!res.ok || !res.body) throw new Error(gone(res.status));
  const range = /^bytes (\d+)-/.exec(res.headers.get("content-range") ?? "");
  if (res.status === 206 && range && Number(range[1]) === offset) return { stream: res.body, offset };
  // Storage ignored the range: the whole file came.
  if (res.status === 206) {
    await res.body.cancel().catch(() => {});
    return { stream: await openFile(path, signal), offset: 0 };
  }
  return { stream: res.body, offset: 0 };
}

export async function putFile(path: string, body: string, contentType: string, signal?: AbortSignal): Promise<void> {
  const { url, key } = base();
  const res = await fetch(objectUrl(url, path), { method: "POST", headers: { Authorization: `Bearer ${key}`, apikey: key, "content-type": contentType, "x-upsert": "true" }, body, signal: within(60_000, signal) });
  if (!res.ok) throw new Error(`Couldn't save the file (${res.status})`);
}

export async function removeFiles(paths: string[], signal?: AbortSignal): Promise<void> {
  if (!paths.length) return;
  const { url, key } = base();
  await fetch(`${url}/storage/v1/object/imports`, { method: "DELETE", headers: { Authorization: `Bearer ${key}`, apikey: key, "content-type": "application/json" }, body: JSON.stringify({ prefixes: paths }), signal: within(CALL_MS, signal) });
}
