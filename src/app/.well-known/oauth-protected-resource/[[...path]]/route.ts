import { CORS, resourceMeta } from "@/lib/oauth/meta";

// The MCP server's sign-in (RFC 9728), at /.well-known/oauth-protected-resource and with the server's path after it.
export function GET() {
  return Response.json(resourceMeta(), { headers: { ...CORS, "Cache-Control": "public, max-age=3600" } });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
