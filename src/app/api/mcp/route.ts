import { requireKey } from "@/lib/apiAuth";
import { mcp } from "@/lib/mcpTools";
import { CORS, mcpSignIn } from "@/lib/oauth/meta";
import { clientIp } from "@/lib/forms/server";
import { guestMcp, SIGNED_IN_TOOLS } from "@/lib/forms/guestMcp";
import { serviceClient } from "@/lib/serviceClient";

// Up to 45 seconds waiting for runs, plus the time to start them.
export const maxDuration = 60;

/**
 * The Claritia MCP server, for ChatGPT, Claude, Claude Code, Cursor and other agents (Streamable HTTP, JSON answers).
 *   claude mcp add --transport http claritia https://app.tryclaritia.com/api/mcp --header "Authorization: Bearer clr_..."
 * Without a key it's the guest server (src/lib/forms/guestMcp.ts): forms made before signing up. Calling a signed-in
 * tool there, or sending a wrong key, answers 401 with where to sign in (src/lib/oauth/meta.ts), so ChatGPT and Claude
 * show Connect.
 */
export async function POST(request: Request) {
  if (!request.headers.get("authorization")) {
    const body = await request.text();
    if (wantsSignIn(body)) return mcpSignIn();
    const sb = serviceClient();
    if (!sb) return Response.json({ error: "Not set up." }, { status: 503, headers: CORS });
    const reply = await guestMcp({ sb, ip: clientIp(request) }, body);
    return reply === null ? new Response(null, { status: 202, headers: CORS }) : Response.json(reply, { headers: CORS });
  }
  const caller = await requireKey(request);
  if ("denied" in caller) return caller.denied.status === 401 ? mcpSignIn() : caller.denied;
  const reply = await mcp(caller, await request.text());
  return reply === null ? new Response(null, { status: 202, headers: CORS }) : Response.json(reply, { headers: CORS });
}

// No server-sent stream and no sessions: every answer comes back on its POST.
export function GET() {
  return new Response(null, { status: 405, headers: { Allow: "POST", ...CORS } });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export function DELETE() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}

/** Whether a guest's message calls a tool that needs sign-in. */
function wantsSignIn(body: string): boolean {
  try {
    const p = JSON.parse(body) as unknown;
    return (Array.isArray(p) ? p : [p]).some((m) => !!m && typeof m === "object" && (m as { method?: unknown }).method === "tools/call" && SIGNED_IN_TOOLS.includes(String((m as { params?: { name?: unknown } }).params?.name)));
  } catch {
    return false;
  }
}
