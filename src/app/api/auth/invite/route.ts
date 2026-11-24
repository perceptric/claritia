import { serviceClient } from "@/lib/serviceClient";
import { isUuid } from "@/lib/uuid";

// The sign-up page for an invite (/signup?invite=<id>, from the invite email; docs/signup.md): GET ?id= answers the
// team's name, who invited and the invited email, for an invite still open (invite_info, 133_signup.sql). The id is
// a random UUID only the email holds. Anything else answers 404, so the page falls back to plain sign-up.

const noStore = { "Cache-Control": "no-store" };
type Info = { email: string; workspace: string; inviter: string | null };

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id")?.toLowerCase() ?? "";
  const db = serviceClient();
  if (!isUuid(id) || !db) return Response.json({ error: "Invite not found." }, { status: 404, headers: noStore });
  for (let i = 0; i < 2; i++) {
    const { data, error } = await db.rpc("invite_info", { p_id: id, p_sent_for: null }).abortSignal(AbortSignal.timeout(4000));
    if (!error) {
      const info = data as Info | null;
      if (!info) break;
      // The inviter's name or email, never their email when a name is there.
      return Response.json({ workspace: info.workspace, inviter: info.inviter, email: info.email }, { headers: noStore });
    }
    if (i === 1) console.error("auth invite:", error.message);
  }
  return Response.json({ error: "Invite not found." }, { status: 404, headers: noStore });
}
