import { toCsv } from "@/lib/contacts/csv";
import { cleanFilters, csvHead, csvRow, fillColumns, type ExportFill } from "@/lib/forms/results";
import type { Form } from "@/lib/forms/schema";
import { requireUser } from "@/lib/serverAuth";

// Export answers (docs/forms-plan.md 1.1): every answer of the fills that match the Results filters, as a CSV that
// streams in pages of 1,000, so a form with a hundred thousand fills downloads in steady memory. Read as the signed-in
// member, so row level security decides what they get. GET ?filters=<json>.

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PAGE = 1000;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ID.test(id)) return Response.json({ error: "Form not found." }, { status: 404 });
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const sb = auth.sb;
  let filters;
  try {
    filters = cleanFilters(JSON.parse(new URL(request.url).searchParams.get("filters") || "{}"));
  } catch {
    filters = cleanFilters({});
  }
  const [form, versions] = await Promise.all([sb.from("forms").select("name").eq("id", id).maybeSingle(), sb.from("form_versions").select("version, body").eq("form_id", id)]);
  if (!form.data) return Response.json({ error: "Form not found." }, { status: 404 });
  const cols = fillColumns((versions.data ?? []) as { version: number; body: Form }[]);
  const enc = new TextEncoder();
  let after: { at: string; id: string } | null = null;
  let started = false;
  const stream = new ReadableStream<Uint8Array>({
    async pull(ctl) {
      if (!started) {
        started = true;
        ctl.enqueue(enc.encode("﻿" + toCsv(csvHead(cols))));
        return;
      }
      const { data: ids, error } = await sb.rpc("form_fill_ids", { p_form: id, p_filters: filters, p_after_at: after?.at ?? null, p_after_id: after?.id ?? null, p_limit: PAGE });
      if (error) return ctl.error(new Error(error.message));
      const list = (ids ?? []) as string[];
      if (!list.length) return ctl.close();
      const { data: rows, error: e2 } = await sb.from("submissions").select("id, created_at, values, hidden").in("id", list);
      if (e2) return ctl.error(new Error(e2.message));
      const byId = new Map(((rows ?? []) as ExportFill[]).map((r) => [r.id, r]));
      const page = list.map((x) => byId.get(x)).filter((r): r is ExportFill => !!r);
      if (page.length) ctl.enqueue(enc.encode(toCsv(page.map((s) => csvRow(cols, s)))));
      const last = byId.get(list[list.length - 1]);
      if (!last || list.length < PAGE) return ctl.close();
      after = { at: last.created_at, id: last.id };
    },
  });
  const name = `${(form.data.name as string).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "form"}-answers-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(stream, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" } });
}
