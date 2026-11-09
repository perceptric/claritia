import { makeKey } from "@/lib/apiKeys";
import { allowed, clientIp } from "@/lib/forms/server";
import { clientSecret, findClient, loadRegistered, pkceOk, sameSecret, sha256 } from "@/lib/oauth/clients";
import { serviceClient } from "@/lib/serviceClient";

// The code-for-key trade (RFC 6749 4.1.3) for Zapier, Make, Activepieces and the MCP apps that registered
// themselves (ChatGPT, Claude: no secret, the PKCE check instead). The access token is an API key named
// after the app; it never expires, so there is no refresh token. A code works once: a second use revokes its key.

const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache", "Access-Control-Allow-Origin": "*" };
const fail = (error: string, description: string, status = 400) => Response.json({ error, error_description: description }, { status, headers: NO_STORE });

async function params(request: Request): Promise<Record<string, string>> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const j = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(j).filter(([, v]) => typeof v === "string")) as Record<string, string>;
  }
  return Object.fromEntries(new URLSearchParams(await request.text().catch(() => "")));
}

export async function POST(request: Request) {
  if (!allowed(`oauth-token:${clientIp(request)}`, 30)) return fail("slow_down", "Too many tries. Wait a minute.", 429);
  const p = await params(request);
  // The client's id and secret: in the body, or as HTTP Basic.
  const basic = request.headers.get("authorization")?.match(/^Basic\s+(.+)$/i)?.[1];
  if (basic) {
    const [id, ...rest] = Buffer.from(basic, "base64").toString("utf8").split(":");
    p.client_id ??= decodeURIComponent(id ?? "");
    p.client_secret ??= decodeURIComponent(rest.join(":"));
  }
  const db = serviceClient();
  if (!db) return fail("server_error", "Not set up.", 503);
  const client = await findClient(p.client_id, loadRegistered(db)).catch(() => undefined);
  if (client === undefined) return fail("server_error", "Try again.", 503);
  const secret = client && !client.public ? clientSecret(client) : null;
  if (!client || (!client.public && (!secret || !p.client_secret || !sameSecret(p.client_secret, secret)))) return fail("invalid_client", "Unknown app or wrong secret.", 401);
  if (p.grant_type !== "authorization_code") return fail("unsupported_grant_type", "Only authorization_code.");
  if (!p.code) return fail("invalid_request", "Send the code.");
  const codeHash = sha256(p.code);
  const used = await db.rpc("oauth_code_use", { p_hash: codeHash, p_client: client.id });
  if (used.error) return fail("server_error", "Try again.", 500);
  const c = used.data as { ok?: boolean; replay?: boolean; redirect_uri?: string; challenge?: string | null } | null;
  if (!c?.ok) return fail("invalid_grant", c?.replay ? "This code was already used." : "The code is wrong or expired.");
  if (p.redirect_uri && p.redirect_uri !== c.redirect_uri) return fail("invalid_grant", "The return address doesn't match.");
  if (client.public && !c.challenge) return fail("invalid_grant", "The code check is missing.");
  if (!pkceOk(c.challenge ?? null, p.code_verifier)) return fail("invalid_grant", "The code check doesn't match.");
  const { key, hash, prefix } = makeKey();
  const made = await db.rpc("oauth_key_make", { p_hash: codeHash, p_name: client.name, p_prefix: prefix, p_key_hash: hash });
  if (made.error) return made.error.message.includes("too_many_keys") ? fail("invalid_grant", "This workspace has 20 API keys. Revoke one in Settings first.") : fail("server_error", "Try again.", 500);
  return Response.json({ access_token: key, token_type: "Bearer", scope: "forms" }, { headers: NO_STORE });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Max-Age": "86400" } });
}
