import { allowed, clientIp } from "@/lib/forms/server";
import { checkRegistration, newClientId } from "@/lib/oauth/clients";
import { CORS } from "@/lib/oauth/meta";
import { serviceClient } from "@/lib/serviceClient";

// An MCP app (ChatGPT, Claude) registers itself before it signs in (RFC 7591, 141_mcp_oauth_clients.sql): its name
// and return addresses in, a client id out. No secret: its sign-in carries a PKCE check instead.

const fail = (error: string, description: string, status = 400) => Response.json({ error, error_description: description }, { status, headers: { ...CORS, "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  if (!allowed(`oauth-register:${clientIp(request)}`, 10)) return fail("slow_down", "Too many tries. Wait a minute.", 429);
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || typeof b !== "object" || Array.isArray(b)) return fail("invalid_client_metadata", "Send the app's details as JSON.");
  const r = checkRegistration(b);
  if ("error" in r) return fail(r.error, r.description);
  const db = serviceClient();
  if (!db) return fail("server_error", "Not set up.", 503);
  const id = newClientId();
  const { error } = await db.rpc("oauth_client_add", { p_id: id, p_name: r.name, p_redirects: r.redirects });
  if (error) return fail("server_error", "Try again.", 500);
  return Response.json(
    {
      client_id: id,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: r.name,
      redirect_uris: r.redirects,
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: "forms",
    },
    { status: 201, headers: { ...CORS, "Cache-Control": "no-store" } },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
