import { CORS, serverMeta } from "@/lib/oauth/meta";

// The sign-in server's addresses (RFC 8414), for MCP apps. Some apps read the OpenID address first: the same list.
export function GET() {
  return Response.json(serverMeta(), { headers: { ...CORS, "Cache-Control": "public, max-age=3600" } });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
