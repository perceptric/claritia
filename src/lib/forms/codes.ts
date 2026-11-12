import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { alertsFrom } from "../alertSender.ts";
import { sesDomains, systemSend } from "../email/senders.ts";
import { allFields, type Field, type Form } from "./schema.ts";

// Email and phone codes (docs/fields-plan.md Part 3): a field set to "Verify with a code" sends a 6-digit code to the
// email (Resend) or the phone (Twilio Verify), and the form sends only once it's typed. A typed code that checks out
// gets a proof, signed here and good for an hour, which the send carries; the submit checks the proof, so the same
// send can be tried again (a slow network, the browser's queue) without asking twice.

const WINDOW = 10 * 60 * 1000;
const PROOF_MS = 60 * 60 * 1000;
const secret = () => process.env.FORM_CODE_SECRET?.trim() || process.env.SECRETS_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
const hmac = (s: string) => createHmac("sha256", secret()).update(s).digest();
const norm = (field: Field, to: string) => (field.type === "phone" ? to.replace(/[^\d+]/g, "") : to.trim().toLowerCase());

/** Codes by email need Resend (or SES for the codes' domain) and a secret; by text message, Twilio Verify. */
export const emailCodesReady = () => (!!process.env.RESEND_API_KEY?.trim() || (!!process.env.AWS_ACCESS_KEY_ID?.trim() && sesDomains()(alertsFrom()))) && !!secret();
export const smsCodesReady = () => !!secret() && !!process.env.TWILIO_ACCOUNT_SID?.trim() && !!process.env.TWILIO_AUTH_TOKEN?.trim() && !!process.env.TWILIO_VERIFY_SID?.trim();
/** Whether the form asks for a code on this field: it's set to, and the server can send one. */
export const codeAsked = (f: Field) => !!f.verify && (f.type === "email" ? emailCodesReady() : f.type === "phone" ? smsCodesReady() : false);

/** The email code for a field and address in a 10-minute window. */
export function emailCode(form: string, field: Field, to: string, at = Date.now()): string {
  const n = hmac(`code|${form}|${field.id}|${norm(field, to)}|${Math.floor(at / WINDOW)}`).readUInt32BE(0) % 1_000_000;
  return String(n).padStart(6, "0");
}

/** A typed email code: this window's or either of the two before it (up to 30 minutes). */
export const emailCodeOk = (form: string, field: Field, to: string, code: string, at = Date.now()) => [0, 1, 2].some((k) => emailCode(form, field, to, at - k * WINDOW) === code);

/** Proof that the code for this field and value was typed: "<expiry>.<signature>". */
export function proofFor(form: string, field: Field, to: string, at = Date.now()): string {
  const exp = at + PROOF_MS;
  return `${exp}.${hmac(`proof|${form}|${field.id}|${norm(field, to)}|${exp}`).toString("base64url")}`;
}

export function proofOk(form: string, field: Field, to: string, proof: unknown, at = Date.now()): boolean {
  if (typeof proof !== "string" || proof.length > 200) return false;
  const [e, sig] = proof.split(".");
  const exp = Number(e);
  if (!Number.isFinite(exp) || exp < at || exp > at + PROOF_MS + 60_000 || !sig) return false;
  const want = hmac(`proof|${form}|${field.id}|${norm(field, to)}|${exp}`);
  const got = Buffer.from(sig, "base64url");
  return got.length === want.length && timingSafeEqual(got, want);
}

/**
 * The fields of a send that need a proof and don't have one, as errors by field id. `answers` by field id, `codes`
 * the proofs the browser sent.
 */
export function missingProofs(form: string, body: Form, answers: Record<string, unknown>, codes: unknown, at = Date.now()): Record<string, string> {
  const c = (codes && typeof codes === "object" && !Array.isArray(codes) ? codes : {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const f of allFields(body)) {
    if (!codeAsked(f)) continue;
    const v = typeof answers[f.id] === "string" ? (answers[f.id] as string).trim() : "";
    if (v && !proofOk(form, f, v, c[f.id], at)) out[f.id] = "Enter the code we sent to confirm it.";
  }
  return out;
}

export async function sendEmailCode(to: string, code: string, formName: string, fetchFn: typeof fetch = fetch): Promise<boolean> {
  if (!emailCodesReady()) return false;
  const text = `Your code for ${formName || "the form"} is ${code}. It works for 30 minutes.`;
  const html = `<p style="font:16px/1.5 Inter,system-ui,sans-serif">Your code for ${formName.replace(/[<>&"]/g, "") || "the form"} is</p><p style="font:600 28px/1.2 Inter,system-ui,sans-serif;letter-spacing:4px">${code}</p><p style="font:14px/1.5 Inter,system-ui,sans-serif;color:#666">It works for 30 minutes.</p>`;
  // Through SES when the codes' domain is on it (EMAIL_SES_DOMAINS), else Resend (src/lib/email/senders.ts).
  return (await systemSend({ from: alertsFrom(), to: [to], subject: `${code} is your code`, text, html }, { fetchFn })) === null;
}

const twilio = (path: string, body: Record<string, string>, fetchFn: typeof fetch) =>
  fetchFn(`https://verify.twilio.com/v2/Services/${process.env.TWILIO_VERIFY_SID!.trim()}/${path}`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${process.env.TWILIO_ACCOUNT_SID!.trim()}:${process.env.TWILIO_AUTH_TOKEN!.trim()}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);

/** A phone number as Twilio takes it (+ and digits), or null. */
export const e164 = (raw: string) => {
  const v = raw.replace(/[^\d+]/g, "");
  return /^\+[1-9]\d{6,14}$/.test(v) ? v : null;
};

export async function startSms(to: string, fetchFn: typeof fetch = fetch): Promise<boolean> {
  const res = await twilio("Verifications", { To: to, Channel: "sms" }, fetchFn);
  return !!res?.ok;
}

export async function checkSms(to: string, code: string, fetchFn: typeof fetch = fetch): Promise<boolean> {
  const res = await twilio("VerificationCheck", { To: to, Code: code }, fetchFn);
  if (!res?.ok) return false;
  const j = (await res.json().catch(() => ({}))) as { status?: string };
  return j.status === "approved";
}
