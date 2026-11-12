import { readEmailDoc } from "@/lib/design/email/doc";
import { compileWithKit, loadKits } from "@/lib/design/email/server";
import { notReady, sendReady } from "@/lib/email/ready";
import { extractLinks } from "@/lib/email/track";
import { requireUser, roleIn } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";

// Send or schedule a campaign draft (docs/email-studio-plan.md Part 5): POST { workspaceId, emailId, lists, everyone,
// topicId, sendAt }. The draft's blocks are made into HTML here (the same draft styles the builder showed), sending is
// checked ready, and email_campaign_send (151) freezes the audience and queues it in one transaction. A repeat of the
// same send answers what the first queued.

const UUID = /^[0-9a-f-]{36}$/;
const bad = (error: string, status = 400) => Response.json({ error }, { status });

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const b = (await request.json().catch(() => ({}))) as { workspaceId?: unknown; emailId?: unknown; lists?: unknown; everyone?: unknown; topicId?: unknown; sendAt?: unknown };
  const ws = typeof b.workspaceId === "string" && UUID.test(b.workspaceId) ? b.workspaceId : null;
  const id = typeof b.emailId === "string" && UUID.test(b.emailId) ? b.emailId : null;
  if (!ws || !id) return bad("Email not found.", 404);
  const role = await roleIn(auth, ws);
  if (!role) return bad("Workspace not found.", 404);
  const db = serviceClient();
  if (!db) return bad("The server is not set up for this.", 500);
  const lists = (Array.isArray(b.lists) ? b.lists : []).filter((x): x is string => typeof x === "string" && UUID.test(x)).slice(0, 50);
  const everyone = b.everyone === true;
  const topic = typeof b.topicId === "string" && UUID.test(b.topicId) ? b.topicId : null;
  const at = typeof b.sendAt === "string" && !Number.isNaN(Date.parse(b.sendAt)) ? new Date(b.sendAt).toISOString() : null;
  if (at && Date.parse(at) < Date.now() - 60_000) return bad("Pick a time in the future.");

  const [row, ready] = await Promise.all([db.from("emails").select("id, subject, doc, status").eq("id", id).eq("workspace_id", ws).eq("kind", "broadcast").maybeSingle(), sendReady(db, ws)]);
  if (row.error) return bad(row.error.message, 500);
  if (!row.data) return bad("Email not found.", 404);
  const no = notReady(ready);
  if (no) return no;
  const doc = readEmailDoc(row.data.doc ?? {}, { allowHtml: true });
  const kits = await loadKits(db, ws, [doc.kitId]);
  let built;
  try {
    built = compileWithKit(doc, kits, "draft");
  } catch {
    return bad("This email couldn't be built.");
  }
  const blocked = built.notes.find((n) => n.level === "block");
  if (blocked) return bad(blocked.text);
  const { data, error } = await db.rpc("email_campaign_send", {
    p_ws: ws,
    p_user: auth.user.id,
    p_email: id,
    p_values: { subject: row.data.subject, preheader: doc.settings.preheader, html: built.html, text: built.text, links: extractLinks(built.html), lists, everyone, topic_id: topic, send_at: at },
  });
  if (error) {
    const known = /Add a subject|The email is empty|Pick who gets it|Pick a time|Topic not found|List not found|Nobody is in that audience/.exec(error.message);
    return bad(known ? `${known[0]}.` : error.message, known ? 400 : 500);
  }
  return Response.json(data);
}
