import { requireUser } from "@/lib/serverAuth";
import { cleanBody } from "@/lib/workflows/check";
import { fillMerge, tracePath, waitUntil } from "@/lib/workflows/engine";
import { compileWithKit, loadKits } from "@/lib/design/email/server";
import { serviceClient } from "@/lib/serviceClient";
import { valuesOf, type Facts } from "@/lib/workflows/facts";

// Try a contact (docs/enrich-workflows-reports.md 2.4): POST { body, contactId } answers the path that contact would
// take through the draft, with each email as they'd read it (its design built in the brand kit, merge fields filled)
// and when each Delay would end if they entered now (docs/email-unify-plan.md, E4: the panel's Test tab). Nothing is
// sent or saved.

const bad = (error: string, status = 400) => Response.json({ error }, { status });

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const b = (await request.json().catch(() => ({}))) as { body?: unknown; contactId?: unknown };
  const id = typeof b.contactId === "string" && /^[0-9a-f-]{36}$/.test(b.contactId) ? b.contactId : "";
  if (!id) return bad("Pick a contact.");
  const { data, error } = await auth.sb.rpc("workflow_preview_facts", { p_contact: id });
  if (error || !data) return bad("Contact not found.", 404);
  const f = data as Facts;
  const body = cleanBody(b.body);
  const values = valuesOf(f);
  const t = tracePath(body, { values, lifecycle: f.contact.lifecycle, outcome: f.contact.qualify_outcome, booked: false, timezone: f.tz }, id);
  const vars = { first_name: f.contact.first_name, last_name: f.contact.last_name, company: (f.company?.name as string | undefined) ?? null, title: f.contact.title };
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const htmlVars = Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, v ? esc(v) : v]));
  // Emails with a design are built with the brand kit's draft styles, as the canvas shows them.
  const db = serviceClient();
  const docs = t.lines.flatMap((l) => (l.step.kind === "email" && l.step.email.doc ? [l.step.email.doc] : []));
  const ws = docs.length ? ((await auth.sb.from("contacts").select("workspace_id").eq("id", id).maybeSingle()).data as { workspace_id: string } | null)?.workspace_id : null;
  const kits = db && ws ? await loadKits(db, ws, docs.map((d) => d.kitId)).catch(() => []) : [];
  // Delays end at times counted from now, in the contact's zone; a "before the meeting" Delay has no clock time here.
  let clock = Date.now();
  const ends = new Map<string, number>();
  for (const l of t.lines) if (l.step.kind === "wait" && l.step.before !== "meeting") ends.set(l.step.id, (clock = waitUntil(l.step, clock, f.tz)));
  const build = (doc: NonNullable<Extract<(typeof t.lines)[number]["step"], { kind: "email" }>["email"]["doc"]>) => {
    try {
      return fillMerge(compileWithKit(doc, kits, "draft").html, htmlVars);
    } catch {
      return null;
    }
  };
  return Response.json({
    entered: t.entered,
    goal: t.goal,
    who: { name: [f.contact.first_name, f.contact.last_name].filter(Boolean).join(" "), email: f.contact.email, tz: f.tz },
    lines: t.lines.map((l) => ({
      step: l.step.id,
      path: l.path ?? null,
      note: l.note ?? null,
      at: ends.has(l.step.id) ? new Date(ends.get(l.step.id)!).toISOString() : null,
      email:
        l.step.kind === "email"
          ? { subject: fillMerge(l.step.email.subject, vars), paragraphs: l.step.email.paragraphs.map((p) => fillMerge(p, vars)), cta: l.step.email.cta_label ? fillMerge(l.step.email.cta_label, vars) : null, suppressed: f.contact.suppressed, html: l.step.email.doc ? build(l.step.email.doc) : null }
          : null,
    })),
  });
}
