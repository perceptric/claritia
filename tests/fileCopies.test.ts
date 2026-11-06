// File copies (docs/integrations-plan.md, Next step 9; src/lib/sources/files.ts): each tool's requests, files in parts
// with one part failing once and sent again from where the tool says it stopped, no second copy on a run again, a
// folder that's gone failing with what to do, and S3's signature against AWS's own published example.
import assert from "node:assert/strict";
import { test } from "node:test";
import { makeCtx } from "../src/lib/sources/ctx.ts";
import { amazonS3, box, CHUNK, dropbox, fillFolder, googleDrive, headerJson, oneDrive, S3_PART, signV4, type CopyFill } from "../src/lib/sources/files.ts";
import type { Creds, SourceRow } from "../src/lib/sources/types.ts";
import { sendDelivery, type Taken } from "../src/lib/delivery/send.ts";
import type { Rpc } from "../src/lib/jobs.ts";
import { seal } from "../src/lib/seal.ts";

type Call = { url: string; method: string; headers: Headers; body: unknown };
type Route = [RegExp, (c: Call, n: number) => Response];
function tool(routes: Route[]) {
  const calls: Call[] = [];
  const counts = new Map<number, number>();
  const fetcher = (async (url: string, init: RequestInit = {}) => {
    const c: Call = { url, method: init.method ?? "GET", headers: new Headers(init.headers), body: init.body };
    calls.push(c);
    const i = routes.findIndex(([re]) => re.test(`${c.method} ${url}`));
    if (i < 0) return new Response(JSON.stringify({ message: `no route ${c.method} ${url}` }), { status: 500 });
    counts.set(i, (counts.get(i) ?? 0) + 1);
    return routes[i]![1](c, counts.get(i)!);
  }) as unknown as typeof fetch;
  return { calls, fetcher };
}
const json = (j: unknown, status = 200, h: Record<string, string> = {}) => new Response(j === null ? null : JSON.stringify(j), { status, headers: { "content-type": "application/json", ...h } });
const src = (kind: string): SourceRow => ({ id: "s1", workspace_id: "ws1", kind, name: kind, account: null, status: "active", settings: {}, cursors: {}, push_cursor: null });
const oauth: Creds = { type: "oauth", access: "tok", refresh: "r", expiresAt: Date.now() + 3600_000 };
const ctx = (kind: string, fetcher: typeof fetch, creds: Creds = oauth) => makeCtx({ source: src(kind), creds, fetcher, sleep: async () => {} });
const bytes = (n: number) => Uint8Array.from({ length: n }, (_, i) => i % 251);
const fill = (n = 10, name = "cv.pdf"): CopyFill => ({ folder: "Book a demo 2026-11-06 1a2b3c4d", files: [{ name, type: "application/pdf", bytes: bytes(n) }] });

test("S3's signature matches AWS's published example (GET Object with a Range)", () => {
  const empty = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  const auth = signV4({
    method: "GET",
    host: "examplebucket.s3.amazonaws.com",
    path: "/test.txt",
    headers: { host: "examplebucket.s3.amazonaws.com", range: "bytes=0-9", "x-amz-content-sha256": empty, "x-amz-date": "20130524T000000Z" },
    payloadHash: empty,
    amzDate: "20130524T000000Z",
    region: "us-east-1",
    service: "s3",
    accessKey: "AKIAIOSFODNN7EXAMPLE",
    secret: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  });
  assert.equal(auth, "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41");
  assert.equal(fillFolder("Book / a: demo", "2026-11-06T12:00:00Z", "1a2b3c4d-0000"), "Book a demo 2026-11-06 1a2b3c4d");
  assert.equal(headerJson({ path: "/Café" }), '{"path":"/Caf\\u00e9"}');
});

test("Drive: the fill's folder found or made, a small file in one multipart call, nothing twice on a run again", async () => {
  let made = false;
  const t = tool([
    [/GET .*\/drive\/v3\/files\/root1\?/, () => json({ id: "root1", trashed: false })],
    [/GET .*\/drive\/v3\/files\?q=/, (c) => (decodeURIComponent(c.url).includes("mimeType = 'application/vnd.google-apps.folder'") ? json({ files: made ? [{ id: "sub1" }] : [] }) : json({ files: made ? [{ id: "f1" }] : [] }))],
    [/POST .*\/drive\/v3\/files\?fields=id$/, () => json({ id: "sub1" })],
    [/POST .*upload\/drive\/v3\/files\?uploadType=multipart/, () => ((made = true), json({ id: "f1" }))],
  ]);
  const c = ctx("google_drive", t.fetcher);
  assert.deepEqual(await googleDrive.copy!(c, { id: "root1", name: "Uploads" }, fill()), { id: "sub1", url: "https://drive.google.com/drive/folders/sub1" });
  const up = t.calls.find((x) => x.url.includes("uploadType=multipart"))!;
  assert.match(up.headers.get("content-type")!, /^multipart\/related; boundary=/);
  assert.ok(Buffer.from(up.body as Uint8Array).toString("latin1").includes('"parents":["sub1"]'));
  const before = t.calls.length;
  await googleDrive.copy!(c, { id: "root1", name: "Uploads" }, fill());
  assert.equal(t.calls.slice(before).filter((x) => x.method === "POST").length, 0, "a run again copies nothing");
});

test("flaky: Drive's resumable upload; a part that fails once is sent again from where Drive says it stopped", async () => {
  const total = CHUNK * 2 + 1000;
  const ranges: string[] = [];
  const t = tool([
    [/GET .*\/drive\/v3\/files\/root1\?/, () => json({ id: "root1" })],
    [/GET .*\/drive\/v3\/files\?q=/, (c) => json({ files: decodeURIComponent(c.url).includes("folder") ? [{ id: "sub1" }] : [] })],
    [/POST .*uploadType=resumable/, () => new Response(null, { status: 200, headers: { location: "https://www.googleapis.com/upload/session/xyz" } })],
    [
      /PUT https:\/\/www\.googleapis\.com\/upload\/session\/xyz/,
      (c, n) => {
        const r = c.headers.get("content-range")!;
        ranges.push(r);
        if (r === `bytes */${total}`) return new Response(null, { status: 308, headers: { range: `bytes=0-${CHUNK - 1}` } });
        if (n === 2) return new Response("busy", { status: 503 });
        const end = Number(/-(\d+)\//.exec(r)![1]);
        return end === total - 1 ? json({ id: "f1" }) : new Response(null, { status: 308, headers: { range: `bytes=0-${end}` } });
      },
    ],
  ]);
  await googleDrive.copy!(ctx("google_drive", t.fetcher), { id: "root1", name: "Uploads" }, fill(total));
  assert.deepEqual(ranges, [`bytes 0-${CHUNK - 1}/${total}`, `bytes ${CHUNK}-${2 * CHUNK - 1}/${total}`, `bytes */${total}`, `bytes ${CHUNK}-${2 * CHUNK - 1}/${total}`, `bytes ${2 * CHUNK}-${total - 1}/${total}`]);
});

test("a folder that's gone fails with what to do: Drive in the trash, OneDrive and Box not found", async () => {
  const drive = tool([[/GET .*\/drive\/v3\/files\/root1\?/, () => json({ id: "root1", trashed: true })]]);
  await assert.rejects(googleDrive.copy!(ctx("google_drive", drive.fetcher), { id: "root1", name: "Uploads" }, fill()), (e) => (e as { refused?: boolean }).refused === true && /Uploads is gone/.test((e as Error).message));
  const od = tool([[/GET .*\/items\/f9\?/, () => json({ error: { code: "itemNotFound" } }, 404)]]);
  await assert.rejects(oneDrive.copy!(ctx("onedrive", od.fetcher), { id: "f9", name: "Leads" }, fill()), /Leads is gone/);
  const bx = tool([[/GET .*\/folders\/77\?/, () => json({ type: "error" }, 404)]]);
  await assert.rejects(box.copy!(ctx("box", bx.fetcher), { id: "77", name: "Leads" }, fill()), /Leads is gone/);
});

test("OneDrive: an upload session in 320 KiB multiples, resumed from nextExpectedRanges after a failure", async () => {
  const total = CHUNK + 5000;
  const sent: string[] = [];
  const t = tool([
    [/GET .*\/me\/drive\/items\/root9\?/, () => json({ id: "root9" })],
    [/GET .*\/items\/root9:\/Book/, () => json({ id: "sub9", webUrl: "https://onedrive.live.com/sub9" })],
    [/GET .*\/items\/sub9:\/cv\.pdf/, () => json({ error: {} }, 404)],
    [/POST .*createUploadSession/, () => json({ uploadUrl: "https://upload.onedrive.test/s1" })],
    [/GET https:\/\/upload\.onedrive\.test\/s1/, () => json({ nextExpectedRanges: [`${3 * 1310720}-`] })],
    [
      /PUT https:\/\/upload\.onedrive\.test\/s1/,
      (c, n) => {
        const r = c.headers.get("content-range")!;
        sent.push(r);
        assert.equal(c.headers.get("authorization"), null, "the session address needs no sign-in");
        if (n === 2) throw new TypeError("fetch failed");
        const end = Number(/-(\d+)\//.exec(r)![1]);
        return end === total - 1 ? json({ id: "f1" }, 201) : json({ nextExpectedRanges: [`${end + 1}-`] }, 202);
      },
    ],
  ]);
  const r = await oneDrive.copy!(ctx("onedrive", t.fetcher), { id: "root9", name: "Uploads" }, fill(total));
  assert.deepEqual(r, { id: "sub9", url: "https://onedrive.live.com/sub9" });
  const size = 3 * 1310720;
  assert.deepEqual(sent, [`bytes 0-${size - 1}/${total}`, `bytes ${size}-${total - 1}/${total}`, `bytes ${size}-${total - 1}/${total}`]);
});

test("Dropbox: a session whose lost answer is corrected by Dropbox's offset; an existing file is left", async () => {
  const total = CHUNK * 3;
  const offsets: number[] = [];
  const t = tool([
    [/POST .*\/files\/create_folder_v2/, () => json({ error_summary: "path/conflict/folder/" }, 409)],
    [/POST .*\/files\/get_metadata/, (c) => (String(c.body).includes("old.pdf") ? json({ ".tag": "file" }) : json({ error_summary: "path/not_found/" }, 409))],
    [/POST .*upload_session\/start/, () => json({ session_id: "sess1" })],
    [
      /POST .*upload_session\/append_v2/,
      (c, n) => {
        const off = JSON.parse(c.headers.get("dropbox-api-arg")!).cursor.offset;
        offsets.push(off);
        if (n === 1) return json({}, 503);
        if (n === 2) return json({ error_summary: "incorrect_offset/", error: { ".tag": "incorrect_offset", correct_offset: 2 * CHUNK } }, 409);
        return json(null);
      },
    ],
    [/POST .*upload_session\/finish/, (c) => (offsets.push(JSON.parse(c.headers.get("dropbox-api-arg")!).cursor.offset), json({ id: "id:1" }))],
    [/POST .*content\.dropboxapi\.com\/2\/files\/upload$/, () => json({ id: "id:2" })],
  ]);
  const c = ctx("dropbox", t.fetcher);
  const r = await dropbox.copy!(c, { id: "/Uploads", name: "/Uploads" }, { folder: "F", files: [{ name: "big.bin", type: "application/octet-stream", bytes: bytes(total) }, { name: "old.pdf", type: "application/pdf", bytes: bytes(5) }] });
  assert.equal(r.id, "/Uploads/F");
  assert.deepEqual(offsets, [CHUNK, CHUNK, 2 * CHUNK], "the second part went before its 503: Dropbox's offset moves on");
  assert.equal(t.calls.filter((x) => x.url.endsWith("/files/upload")).length, 0, "old.pdf was there already");
});

test("Box: a folder already there by name is used; a file already there is skipped", async () => {
  const t = tool([
    [/GET .*\/folders\/77\?fields=id/, () => json({ id: "77" })],
    [/POST .*\/2\.0\/folders\?/, () => json({ type: "error", context_info: { conflicts: [{ id: "88" }] } }, 409)],
    [/GET .*\/folders\/88\/items/, () => json({ entries: [{ name: "old.pdf" }] })],
    [/POST https:\/\/upload\.box\.com/, () => json({ entries: [{ id: "f1" }] }, 201)],
  ]);
  const r = await box.copy!(ctx("box", t.fetcher), { id: "77", name: "Leads" }, { folder: "F", files: [{ name: "old.pdf", type: "application/pdf", bytes: bytes(3) }, { name: "new.pdf", type: "application/pdf", bytes: bytes(3) }] });
  assert.deepEqual(r, { id: "88", url: "https://app.box.com/folder/88" });
  const up = t.calls.filter((c) => c.url.startsWith("https://upload.box.com"));
  assert.equal(up.length, 1);
  assert.ok(up[0]!.body instanceof FormData);
  assert.match(String((up[0]!.body as FormData).get("attributes")), /"name":"new\.pdf","parent":\{"id":"88"\}/);
});

test("S3: signed calls to the team's bucket; multipart over 8 MB with a part sent again; an existing key skipped", async () => {
  const keys: Creds = { type: "key", values: { access_key_id: "AKID", secret_access_key: "secret", region: "eu-west-1", bucket: "acme-leads", prefix: "claritia" } };
  const partsSent: string[] = [];
  const t = tool([
    [/HEAD https:\/\/acme-leads\.s3\.eu-west-1\.amazonaws\.com\/claritia\/F\/old\.pdf/, () => new Response(null, { status: 200 })],
    [/HEAD /, () => new Response(null, { status: 404 })],
    [/POST .*\?uploads$/, () => new Response("<InitiateMultipartUploadResult><UploadId>up-1</UploadId></InitiateMultipartUploadResult>", { status: 200 })],
    [/PUT .*partNumber=/, (c, n) => (partsSent.push(new URL(c.url).searchParams.get("partNumber")!), n === 2 ? new Response("busy", { status: 503 }) : new Response(null, { status: 200, headers: { etag: `"e${n}"` } }))],
    [/POST .*\?uploadId=up-1$/, () => new Response("<CompleteMultipartUploadResult/>", { status: 200 })],
    [/PUT /, () => new Response(null, { status: 200 })],
  ]);
  const r = await amazonS3.copy!(ctx("s3", t.fetcher, keys), null, { folder: "F", files: [{ name: "old.pdf", type: "application/pdf", bytes: bytes(3) }, { name: "big.bin", type: "application/octet-stream", bytes: bytes(S3_PART + 100) }] });
  assert.equal(r.id, "claritia/F/");
  assert.deepEqual(partsSent, ["1", "2", "2"], "part 2 failed once and went again under its own number");
  const put = t.calls.find((c) => c.method === "PUT")!;
  assert.match(put.headers.get("authorization")!, /^AWS4-HMAC-SHA256 Credential=AKID\/\d{8}\/eu-west-1\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
  const done = t.calls.find((c) => c.method === "POST" && /\?uploadId=up-1$/.test(c.url))!;
  assert.match(String(done.body), /<Part><PartNumber>2<\/PartNumber><ETag>"e3"<\/ETag><\/Part>/);
  await assert.rejects(amazonS3.copy!(ctx("s3", t.fetcher, { type: "key", values: { ...keys.values, bucket: "Bad_Bucket" } }), null, fill()), /bucket's name/);
});

test("the delivery: a fill's uploads read from storage and copied; a fill with none is skipped", async () => {
  process.env.SECRETS_KEY ??= "k".repeat(40);
  const env = { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY };
  process.env.SUPABASE_URL = "https://db.supabase.test";
  process.env.SUPABASE_SECRET_KEY = "sb_secret";
  const UP = "11111111-2222-4333-8444-555555555555";
  const rpc: Rpc = async (fn) => {
    if (fn === "source_load") return { data: { source: src("google_drive"), sealed: seal(JSON.stringify(oauth)), mappings: [] }, error: null };
    if (fn === "form_uploads_of") return { data: [{ id: UP, path: "ws1/f1/abc", name: "cv.pdf", kind: "application/pdf" }], error: null };
    return { data: null, error: null };
  };
  const t = tool([
    [/GET https:\/\/db\.supabase\.test\/storage\/v1\/object\/form-uploads\/ws1\/f1\/abc/, (c) => (assert.equal(c.headers.get("apikey"), "sb_secret"), new Response(bytes(10)))],
    [/GET .*\/drive\/v3\/files\/root1\?/, () => json({ id: "root1" })],
    [/GET .*\/drive\/v3\/files\?q=/, () => json({ files: [] })],
    [/POST .*\/drive\/v3\/files\?fields=id$/, () => json({ id: "sub1" })],
    [/POST .*uploadType=multipart/, () => json({ id: "f1" })],
  ]);
  const taken = (values: Record<string, unknown>): Taken => ({
    delivery: { id: "d1", attempts: 1, external_id: null },
    destination: { id: "dest1", kind: "source", source_id: "s1", name: "Google Drive", config: { target: { id: "root1", name: "Uploads" } }, mode: "upsert" },
    sealed: null,
    submission: { id: "aaaaaaaa-1111-4111-8111-111111111111", created_at: "2026-11-06T12:00:00Z", values, hidden: {}, test: false, form_version: 1, contact_id: null },
    form: { id: "f1", name: "Book a demo", body: null },
    contact: null,
  });
  const deps = { run: { rpc, clean: async () => ({ custom: [] }) as never, fetcher: t.fetcher, sleep: async () => {} }, fetcher: t.fetcher };
  assert.deepEqual(await sendDelivery(taken({ cv: `up_${UP}:cv.pdf` }), deps), { status: "done", externalId: "sub1", externalUrl: "https://drive.google.com/drive/folders/sub1" });
  const made = t.calls.find((c) => c.method === "POST" && c.url.endsWith("fields=id"))!;
  assert.match(String(made.body), /"name":"Book a demo 2026-11-06 aaaaaaaa"/);
  assert.deepEqual(await sendDelivery(taken({ name: "Ada" }), deps), { status: "skipped", reason: "No files on this fill." });
  Object.assign(process.env, env);
});
