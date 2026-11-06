import { appBase } from "@/lib/billing";
import { isMember } from "@/lib/contacts/server";
import { isProvider, mailboxUrl } from "@/lib/mailbox/server";
import { requireUser } from "@/lib/serverAuth";

// Connect your own Gmail or Outlook to send from it (docs/integrations-plan.md, Next step 6): { workspaceId, provider }
// answers the sign-in link.

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const b = ((await request.json().catch(() => null)) ?? {}) as { workspaceId?: unknown; provider?: unknown };
  if (!(await isMember(auth, b.workspaceId))) return Response.json({ error: "Workspace not found." }, { status: 404 });
  if (!isProvider(b.provider)) return Response.json({ error: "Pick Gmail or Outlook." }, { status: 400 });
  const url = mailboxUrl(b.provider, `${appBase()}/api/mailbox/callback`, { ws: b.workspaceId as string, user: auth.user.id });
  if (!url) return Response.json({ error: `${b.provider === "gmail" ? "Gmail" : "Outlook"} sign-in isn't set up yet.` }, { status: 400 });
  return Response.json({ url });
}
