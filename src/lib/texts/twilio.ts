// Sending texts with Twilio (docs/integrations-plan.md, Next step 3): Claritia's own account and toll-free number
// (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM or TWILIO_MESSAGING_SID), or a team's own Twilio connected
// in Settings › Integrations, which WhatsApp needs (its approved templates live there). Twilio takes no idempotency
// key, so a send with no answer is "unknown" and never sent again; a 429 or 5xx was not taken and is tried again.

import { createHmac, timingSafeEqual } from "node:crypto";

export type TwilioAccount = { sid: string; token: string; from?: string; messagingSid?: string; whatsappFrom?: string; own: boolean };

export function twilioFromEnv(env: NodeJS.ProcessEnv = process.env): TwilioAccount | null {
  const sid = env.TWILIO_ACCOUNT_SID?.trim(),
    token = env.TWILIO_AUTH_TOKEN?.trim(),
    from = env.TWILIO_FROM?.trim(),
    messagingSid = env.TWILIO_MESSAGING_SID?.trim();
  if (!sid || !token || (!from && !messagingSid)) return null;
  return { sid, token, ...(from ? { from } : {}), ...(messagingSid ? { messagingSid } : {}), own: false };
}

/** A team's Twilio from its connection's keys. */
export function twilioFromKeys(v: (k: string) => string): TwilioAccount | null {
  const sid = v("account_sid").trim(),
    token = v("auth_token").trim(),
    from = v("from").trim(),
    wa = v("whatsapp_from").trim();
  if (!/^AC[0-9a-f]{32}$/.test(sid) || !token) return null;
  const messaging = /^MG[0-9a-f]{32}$/.test(from);
  return { sid, token, ...(from && !messaging ? { from } : {}), ...(messaging ? { messagingSid: from } : {}), ...(wa ? { whatsappFrom: wa.replace(/^whatsapp:/, "") } : {}), own: true };
}

export type TextOut =
  | { status: "sent"; sid: string; from: string }
  | { status: "retry"; error: string; retryAfterS?: number }
  | { status: "failed"; error: string; code?: number }
  | { status: "unknown"; error: string };

/** Twilio's code for a number that replied STOP to this sender. */
export const STOPPED = 21610;

export async function sendText(
  a: TwilioAccount,
  m: { channel: "sms" | "whatsapp"; to: string; body?: string | null; template?: string | null; vars?: Record<string, string>; statusCallback?: string },
  fetcher: typeof fetch = fetch,
): Promise<TextOut> {
  const wa = m.channel === "whatsapp";
  if (wa && !a.whatsappFrom) return { status: "failed", error: "Add a WhatsApp sender to the Twilio connection." };
  const from = wa ? a.whatsappFrom! : (a.messagingSid ?? a.from ?? "");
  const p = new URLSearchParams();
  p.set("To", wa ? `whatsapp:${m.to}` : m.to);
  if (wa) p.set("From", `whatsapp:${from}`);
  else if (a.messagingSid) p.set("MessagingServiceSid", a.messagingSid);
  else p.set("From", from);
  if (m.template) {
    p.set("ContentSid", m.template);
    p.set("ContentVariables", JSON.stringify(m.vars ?? {}));
  } else p.set("Body", m.body ?? "");
  if (m.statusCallback) p.set("StatusCallback", m.statusCallback);
  let res: Response;
  try {
    res = await fetcher(`https://api.twilio.com/2010-04-01/Accounts/${a.sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${a.sid}:${a.token}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: p.toString(),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    return { status: "unknown", error: (e as Error).name === "TimeoutError" ? "No answer from Twilio within 15 seconds." : "Couldn't reach Twilio." };
  }
  const j = (await res.json().catch(() => ({}))) as { sid?: string; from?: string; code?: number; message?: string };
  if (res.ok && j.sid) return { status: "sent", sid: j.sid, from: wa ? from : (j.from ?? from) };
  if (res.status === 429 || res.status >= 500) {
    const n = Number(res.headers.get("retry-after"));
    return { status: "retry", error: `Twilio answered ${res.status}.`, ...(Number.isFinite(n) && n > 0 ? { retryAfterS: Math.min(n, 3600) } : {}) };
  }
  return { status: "failed", error: `Twilio: ${j.message ?? `answered ${res.status}`}`.slice(0, 300), ...(typeof j.code === "number" ? { code: j.code } : {}) };
}

/** X-Twilio-Signature: base64 HMAC-SHA1 of the address and the sorted form fields. */
export function twilioSignature(token: string, url: string, params: Record<string, string>): string {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  return createHmac("sha1", token).update(data, "utf8").digest("base64");
}

export function signatureOk(token: string, url: string, params: Record<string, string>, header: string | null): boolean {
  if (!header) return false;
  const want = Buffer.from(twilioSignature(token, url, params));
  const got = Buffer.from(header);
  return want.length === got.length && timingSafeEqual(want, got);
}
