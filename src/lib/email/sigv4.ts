// AWS Signature Version 4 for one JSON request (https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv-create-signed-request.html).
// Enough for the SES v2 API: no query-string signing, no chunked bodies.

import { createHash, createHmac } from "node:crypto";

export type Credentials = { accessKeyId: string; secretAccessKey: string; sessionToken?: string };

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const hmac = (key: Buffer | string, s: string) => createHmac("sha256", key).update(s, "utf8").digest();

// RFC 3986: encode everything but unreserved characters, each path segment on its own.
const encodeSegment = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** Headers to add to the request, including Authorization. `now` is for tests. */
export function signRequest(o: {
  method: string;
  url: string;
  body: string;
  region: string;
  service: string;
  creds: Credentials;
  headers?: Record<string, string>;
  now?: Date;
}): Record<string, string> {
  const u = new URL(o.url);
  const amzDate = (o.now ?? new Date()).toISOString().replace(/[:-]|\.\d{3}/g, "");
  const day = amzDate.slice(0, 8);
  const headers: Record<string, string> = { ...(o.headers ?? {}), host: u.host, "x-amz-date": amzDate, "x-amz-content-sha256": sha256(o.body) };
  if (o.creds.sessionToken) headers["x-amz-security-token"] = o.creds.sessionToken;
  const names = Object.keys(headers).map((k) => k.toLowerCase()).sort();
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v.trim().replace(/\s+/g, " ")]));
  const path = u.pathname.split("/").map((p) => encodeSegment(decodeURIComponent(p))).join("/") || "/";
  const query = [...u.searchParams.entries()]
    .map(([k, v]) => [encodeSegment(k), encodeSegment(v)])
    .sort(([a, x], [b, y]) => (a === b ? (x < y ? -1 : 1) : a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const canonical = [o.method.toUpperCase(), path, query, names.map((n) => `${n}:${lower[n]}\n`).join(""), names.join(";"), headers["x-amz-content-sha256"]].join("\n");
  const scope = `${day}/${o.region}/${o.service}/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n");
  const key = hmac(hmac(hmac(hmac(`AWS4${o.creds.secretAccessKey}`, day), o.region), o.service), "aws4_request");
  const signature = createHmac("sha256", key).update(toSign, "utf8").digest("hex");
  delete headers.host;
  return { ...headers, authorization: `AWS4-HMAC-SHA256 Credential=${o.creds.accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}` };
}
