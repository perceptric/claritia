import { backTo, checkAuthorize, clientSecret, findClient, loadRegistered, newCode, sha256 } from "@/lib/oauth/clients";
import { requireUser, roleIn } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";

// The approve screen (/oauth/authorize) for Zapier, Make, Activepieces and the MCP apps that registered themselves
// (ChatGPT, Claude; src/lib/oauth/clients.ts).
//   { action: "check", ...query }: the app's name, or what's wrong with its request.
//   { action: "allow", workspaceId, ...query }: a one-time code; answers where to send the person back.
//   { action: "deny", ...query }: answers where to send the person back, with access_denied.

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const b = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const db = serviceClient();
  if (!db) return Response.json({ error: "Not set up." }, { status: 503 });
  const found = await findClient(b.client_id, loadRegistered(db)).catch(() => undefined);
  if (found === undefined) return Response.json({ error: "Couldn't read the app. Try again." }, { status: 503 });
  const q = checkAuthorize(b, found);
  if ("error" in q) return Response.json({ error: q.error }, { status: 400 });
  if (!q.client.public && !clientSecret(q.client)) return Response.json({ error: `${q.client.name} isn't set up on this server yet.` }, { status: 503 });
  if (b.action === "check") return Response.json({ client: { id: q.client.id, name: q.client.name, domain: q.client.domain, ...(q.client.public ? { public: true } : {}) } });
  if (b.action === "deny") return Response.json({ redirect: backTo(q.redirect, { error: "access_denied", state: q.state }) });
  if (b.action !== "allow") return Response.json({ error: "Bad request." }, { status: 400 });
  const ws = b.workspaceId;
  if (!(await roleIn(auth, ws))) return Response.json({ error: "Workspace not found." }, { status: 404 });
  const code = newCode();
  const { error } = await db.rpc("oauth_code_add", { p_hash: sha256(code), p_client: q.client.id, p_ws: ws, p_user: auth.user.id, p_redirect: q.redirect, p_challenge: q.challenge ?? "" });
  if (error) return Response.json({ error: "Couldn't connect. Try again." }, { status: 500 });
  return Response.json({ redirect: backTo(q.redirect, { code, state: q.state }) });
}
