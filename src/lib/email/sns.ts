// Amazon SNS messages, checked before anything trusts them
// (https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message.html): the certificate must come from
// an SNS host over HTTPS, the signature must match, and the topic must be ours.

import { createVerify } from "node:crypto";

export type SnsMessage = {
  Type: "Notification" | "SubscriptionConfirmation" | "UnsubscribeConfirmation";
  MessageId: string;
  TopicArn: string;
  Message: string;
  Timestamp: string;
  Signature: string;
  SignatureVersion: "1" | "2";
  SigningCertURL: string;
  Subject?: string;
  SubscribeURL?: string;
  Token?: string;
};

const SNS_HOST = /^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/;

/** An SNS URL we may fetch: the signing certificate, or the link that confirms a subscription. */
export function snsUrl(raw: unknown, pem = false): URL | null {
  if (typeof raw !== "string") return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || !SNS_HOST.test(u.hostname) || u.port) return null;
    if (pem && !u.pathname.endsWith(".pem")) return null;
    return u;
  } catch {
    return null;
  }
}

export function stringToSign(m: SnsMessage): string {
  const keys =
    m.Type === "Notification"
      ? (["Message", "MessageId", ...(m.Subject !== undefined ? ["Subject"] : []), "Timestamp", "TopicArn", "Type"] as const)
      : (["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"] as const);
  return keys.map((k) => `${k}\n${(m as Record<string, unknown>)[k] ?? ""}\n`).join("");
}

const certs = new Map<string, { pem: string; at: number }>();

export type Verified = { ok: true; message: SnsMessage } | { ok: false; error: string };

/** Parse and check one SNS POST body. `fetchFn` fetches the certificate (cached for a day). */
export async function verifySns(body: string, topicArn: string, fetchFn: typeof fetch = fetch): Promise<Verified> {
  let m: SnsMessage;
  try {
    m = JSON.parse(body) as SnsMessage;
  } catch {
    return { ok: false, error: "Not JSON" };
  }
  if (!m || typeof m !== "object" || !["Notification", "SubscriptionConfirmation", "UnsubscribeConfirmation"].includes(m.Type)) return { ok: false, error: "Not an SNS message" };
  for (const k of ["MessageId", "TopicArn", "Message", "Timestamp", "Signature"] as const) {
    if (typeof m[k] !== "string" || !m[k]) return { ok: false, error: `Missing ${k}` };
  }
  if (m.TopicArn !== topicArn) return { ok: false, error: "Wrong topic" };
  if (m.SignatureVersion !== "1" && m.SignatureVersion !== "2") return { ok: false, error: "Unknown signature version" };
  const certUrl = snsUrl(m.SigningCertURL, true);
  if (!certUrl) return { ok: false, error: "Certificate URL is not an SNS URL" };

  let pem = certs.get(certUrl.href);
  if (!pem || Date.now() - pem.at > 86400_000) {
    const res = await fetchFn(certUrl.href, { redirect: "error", signal: AbortSignal.timeout(10_000) }).catch(() => null);
    const text = res?.ok ? await res.text() : "";
    if (!text.includes("BEGIN CERTIFICATE")) return { ok: false, error: "Couldn't fetch the certificate" };
    pem = { pem: text, at: Date.now() };
    if (certs.size > 50) certs.clear();
    certs.set(certUrl.href, pem);
  }
  let good = false;
  try {
    good = createVerify(m.SignatureVersion === "1" ? "RSA-SHA1" : "RSA-SHA256")
      .update(stringToSign(m), "utf8")
      .verify(pem.pem, m.Signature, "base64");
  } catch {
    good = false;
  }
  return good ? { ok: true, message: m } : { ok: false, error: "Bad signature" };
}
