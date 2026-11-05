import "server-only";
import { unseal } from "../seal.ts";
import { serviceClient } from "../serviceClient.ts";
import type { Creds } from "../sources/types.ts";
import { APP_URL } from "../site.ts";
import { signatureOk } from "./twilio.ts";

// Twilio's webhooks (docs/integrations-plan.md, Next step 3): the form fields, checked against the signature with the
// auth token of the account they came from, Claritia's own or a team's connected Twilio.

/** The addresses Twilio may have signed: the app's own, and the one the request came in on. */
function urlsOf(request: Request): string[] {
  const u = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? u.host;
  const proto = request.headers.get("x-forwarded-proto") ?? u.protocol.replace(":", "");
  return [...new Set([`${APP_URL}${u.pathname}${u.search}`, `${proto}://${host}${u.pathname}${u.search}`])];
}

export async function twilioRequest(request: Request): Promise<{ params: Record<string, string>; db: NonNullable<ReturnType<typeof serviceClient>> } | null> {
  const params = Object.fromEntries(new URLSearchParams(await request.text().catch(() => "")));
  const db = serviceClient();
  if (!db) return null;
  const account = params.AccountSid ?? "";
  let token: string | null = null;
  if (account && account === process.env.TWILIO_ACCOUNT_SID?.trim()) token = process.env.TWILIO_AUTH_TOKEN?.trim() || null;
  else if (/^AC[0-9a-f]{32}$/.test(account)) {
    const { data } = await db.rpc("text_source_for", { p_account: account });
    const sealed = (data as { sealed?: string } | null)?.sealed;
    if (sealed) {
      try {
        const c = JSON.parse(unseal(sealed)) as Creds;
        token = c.type === "key" ? c.values.auth_token?.trim() || null : null;
      } catch {
        token = null;
      }
    }
  }
  if (!token) return null;
  const sig = request.headers.get("x-twilio-signature");
  return urlsOf(request).some((url) => signatureOk(token!, url, params, sig)) ? { params, db } : null;
}

export const twiml = (message?: string) =>
  new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${message ? `<Message>${message.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</Message>` : ""}</Response>`, {
    headers: { "content-type": "text/xml" },
  });
