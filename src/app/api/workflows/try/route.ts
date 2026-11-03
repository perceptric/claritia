import { requireUser } from "@/lib/serverAuth";
import { cleanBody } from "@/lib/workflows/check";
import { fillMerge, tracePath } from "@/lib/workflows/engine";
import { valuesOf, type Facts } from "@/lib/workflows/facts";

// Try a contact (docs/enrich-workflows-reports.md 2.4): POST { body, contactId } answers the path that contact would
// take through the draft, with each email as they'd read it. Nothing is sent or saved.

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
  return Response.json({
    entered: t.entered,
    goal: t.goal,
    lines: t.lines.map((l) => ({
      step: l.step.id,
      path: l.path ?? null,
      note: l.note ?? null,
      email:
        l.step.kind === "email"
          ? { subject: fillMerge(l.step.email.subject, vars), paragraphs: l.step.email.paragraphs.map((p) => fillMerge(p, vars)), cta: l.step.email.cta_label ? fillMerge(l.step.email.cta_label, vars) : null, suppressed: f.contact.suppressed }
          : null,
    })),
  });
}
