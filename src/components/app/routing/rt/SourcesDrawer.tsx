"use client";

// Where leads come from › Manage (docs/routing-workflow.md Section 8): each source this policy's draft serves, with
// its outcome (assign only, or assign and show the owner's calendar), its meeting type by name, its field mapping by
// stable field id and type, and what happens when there are no times. These are the same staged connection rows
// Forms edits; each change is staged with its own revision and goes live when this policy is published.

import { useState } from "react";
import { effectiveSource, fieldOf, type SourceRow } from "@/lib/routing/screenModel";
import { X } from "../../../Icons";
import { Choice } from "../../inbound/parts";
import type { Option } from "../../Select";
import { Sheet } from "../../Sheet";
import { askConfirm } from "../../Dialogs";
import { Badge, ErrorNote, IconButton, type ViewProps } from "../../ui";
import { rt, type FormInfo, type Screen } from "./api";
import { Row } from "./parts";

type Mapping = SourceRow["mappings"][number];

const TYPE_WORDS: Record<string, string> = { email: "Email", integer: "Number", range: "Range", country: "Country", text: "Text", enum: "Choice" };

/** The routing fields a form answer can fill, with the mapping type each form field type gives it. */
function targetsFor(f: FormInfo["fields"][number]): { target: string; type: string }[] {
  const t = f.type;
  const out: { target: string; type: string }[] = [];
  if (t === "email") out.push({ target: "contact.email", type: "email" });
  if (t === "country" || t === "dropdown" || t === "choice" || t === "text") out.push({ target: "lead.country", type: "country" });
  if (t === "number" || t === "calc") out.push({ target: "company.employees", type: "integer" });
  if (t === "choice" || t === "dropdown") out.push({ target: "company.employees", type: "range" });
  if (t === "text" || t === "number") out.push({ target: "company.employees", type: t === "number" ? "integer" : "range" });
  return out;
}

/** A first mapping for a form just connected: its email, country and company-size questions, by field id. */
export function suggestMappings(form: FormInfo | undefined): Mapping[] {
  if (!form) return [];
  const out: Mapping[] = [];
  for (const f of form.fields) {
    const k = `${f.key} ${f.label}`.toLowerCase();
    if (f.type === "email" || f.key === "email") out.push({ field: f.id, target: "contact.email", type: "email" });
    else if (f.type === "country" || /country/.test(k)) out.push({ field: f.id, target: "lead.country", type: "country" });
    else if (/employees|company[_ ]size|team size|headcount/.test(k)) out.push({ field: f.id, target: "company.employees", type: f.type === "number" ? "integer" : "range" });
  }
  return out;
}

export function SourcesDrawer({ session, ws, d, policyId, ro, onClose, onStaged }: Pick<ViewProps, "session" | "ws"> & { d: Screen; policyId: string; ro: boolean; onClose: () => void; onStaged: () => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const mine = d.sources.map((s) => ({ s, eff: effectiveSource(s, policyId) })).filter((x) => x.eff.connected);
  const meetings: Option<string>[] = d.meetingTypes.map((m) => ({ value: m.id, label: `${m.name}${m.minutes ? ` · ${m.minutes} min` : ""}` }));
  const policyName = (id: string | null) => d.policies.find((p) => p.id === id)?.name ?? null;

  const stage = async (o: { s?: SourceRow; form?: string; handoff?: boolean; enabled: boolean; outcome: "assign_only" | "assign_and_calendar"; meeting: string | null; mappings?: Mapping[]; noSlots?: Record<string, unknown> }) => {
    setError("");
    setBusy(true);
    try {
      await rt(session, ws.id, "rt_stage", {
        policy: policyId,
        source: o.handoff || o.s?.kind === "handoff" ? { kind: "handoff" } : { kind: "form", form: o.form ?? o.s?.form_id },
        enabled: o.enabled,
        outcome: o.outcome,
        meeting: o.meeting,
        ...(o.mappings ? { mappings: o.mappings } : {}),
        ...(o.noSlots ? { noSlots: o.noSlots } : {}),
        // A disconnected form keeps a safe outcome: its new leads go to Needs review (Section 8).
        ...(!o.enabled && !(o.handoff || o.s?.kind === "handoff") ? { whenOff: "review" } : {}),
        revision: o.s ? o.s.draft_revision : null,
      });
      onStaged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't stage the change.");
    } finally {
      setBusy(false);
    }
  };

  const connectable: Option<string>[] = [
    ...d.forms
      .filter((f) => !mine.some((x) => x.s.form_id === f.id))
      .map((f) => {
        const s = d.sources.find((x) => x.form_id === f.id);
        const elsewhere = s?.enabled ? policyName(s.policy_id) : null;
        return { value: `f:${f.id}`, label: f.name, hint: elsewhere ? `Now on ${elsewhere}. Moves here when you publish.` : f.status === "live" ? undefined : "Not published yet", group: "Forms" };
      }),
    ...(mine.some((x) => x.s.kind === "handoff") ? [] : [{ value: "handoff", label: "Internal handoff", hint: "Contacts › Route & book", group: " " }]),
  ];

  return (
    <Sheet title="Where leads come from" onClose={onClose} width={620}>
      <div className="flex flex-col gap-3 p-4 text-[13px]">
        <ErrorNote message={error} />
        {mine.map(({ s, eff }) => {
          const form = d.forms.find((f) => f.id === s.form_id);
          const calendar = eff.outcome === "assign_and_calendar";
          const set = (p: Partial<{ enabled: boolean; outcome: "assign_only" | "assign_and_calendar"; meeting: string | null; mappings: Mapping[]; noSlots: Record<string, unknown> }>) =>
            void stage({ s, enabled: p.enabled ?? eff.enabled, outcome: p.outcome ?? eff.outcome, meeting: p.meeting !== undefined ? p.meeting : eff.meetingTypeId, mappings: p.mappings ?? (s.kind === "form" ? eff.mappings : undefined), noSlots: p.noSlots ?? (s.kind === "form" ? eff.noSlots : undefined) });
          const ns = eff.noSlots as { abandonTask?: boolean; abandonAfter?: number };
          const unfinished = ns.abandonTask ? String(ns.abandonAfter ?? 30) : "off";
          return (
            <section key={s.id} className={`rounded-[10px] border border-line bg-card ${eff.enabled ? "" : "opacity-60"}`}>
              <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
                <h3 className="min-w-0 flex-1 truncate font-semibold text-ink">{s.name}</h3>
                {eff.pending ? (
                  <Badge tone="amber" dot>
                    Pending change
                  </Badge>
                ) : null}
                {s.kind === "handoff" ? (
                  <Badge>Contacts › Route &amp; book</Badge>
                ) : (
                  <Choice<string>
                    label={`${s.name} outcome`}
                    value={eff.outcome}
                    align="right"
                    disabled={ro || busy}
                    options={[
                      { value: "assign_only", label: "Assign only", hint: "Thank-you message after submit" },
                      { value: "assign_and_calendar", label: "Assign and show calendar", hint: "The assigned owner's times" },
                    ]}
                    onChange={(v) => {
                      const outcome = v === "assign_and_calendar" ? "assign_and_calendar" : "assign_only";
                      if (outcome === "assign_and_calendar" && !eff.meetingTypeId && !d.meetingTypes[0]) return setError("Make a meeting type in Meetings first.");
                      set({ outcome, meeting: outcome === "assign_and_calendar" ? (eff.meetingTypeId ?? d.meetingTypes[0]!.id) : eff.meetingTypeId });
                    }}
                  />
                )}
                {!ro ? (
                  <IconButton
                    label={eff.enabled ? `Disconnect ${s.name}` : `Connect ${s.name}`}
                    disabled={busy}
                    onClick={async () => {
                      if (eff.enabled && s.kind === "form" && !(await askConfirm(`Disconnect ${s.name}?`, { body: "New leads from this form go to Needs review.", ok: "Disconnect" }))) return;
                      set({ enabled: !eff.enabled });
                    }}
                  >
                    <X size={12} />
                  </IconButton>
                ) : null}
              </header>
              {s.kind === "handoff" ? (
                <Row label="Meeting type">
                  <Choice<string>
                    label="Handoff meeting type"
                    value={calendar ? (eff.meetingTypeId ?? "") : ""}
                    align="right"
                    disabled={ro || busy}
                    options={[{ value: "", label: "None", hint: "Assign without a meeting" }, ...meetings]}
                    onChange={(v) => set({ outcome: v ? "assign_and_calendar" : "assign_only", meeting: v || null })}
                  />
                </Row>
              ) : null}
              {s.kind === "form" && calendar ? (
                <>
                  <Row label="Meeting type">
                    <Choice<string> label={`${s.name} meeting type`} value={eff.meetingTypeId ?? ""} placeholder="Select" align="right" disabled={ro || busy} options={meetings} onChange={(v) => set({ meeting: v })} />
                  </Row>
                  <Row label="No slots" line="Thanks — your rep will contact you to arrange a time.">
                    <Badge>Follow-up task</Badge>
                  </Row>
                  <Row label="Unfinished booking">
                    <Choice<string>
                      label={`${s.name} unfinished booking`}
                      value={unfinished}
                      align="right"
                      disabled={ro || busy}
                      options={[
                        { value: "off", label: "No follow-up" },
                        { value: "30", label: "Follow-up task after 30 min" },
                        { value: "60", label: "Follow-up task after 1 hour" },
                        { value: "120", label: "Follow-up task after 2 hours" },
                      ]}
                      onChange={(v) => set({ noSlots: { ...eff.noSlots, abandonTask: v !== "off", abandonAfter: v === "off" ? 30 : Number(v) } })}
                    />
                  </Row>
                </>
              ) : null}
              {s.kind === "form" ? <MappingTable form={form} mappings={eff.mappings} fields={d.fields} ro={ro || busy} onChange={(m) => set({ mappings: m })} /> : null}
            </section>
          );
        })}
        {!ro && connectable.length ? (
          <div>
            <Choice<string>
              label="Connect a source"
              value=""
              placeholder="Connect a source"
              menuWidth={280}
              disabled={busy}
              options={connectable}
              onChange={(v) => {
                if (v === "handoff") {
                  const h = d.sources.find((x) => x.kind === "handoff");
                  return void stage({ s: h, handoff: true, enabled: true, outcome: "assign_only", meeting: null });
                }
                const id = v.slice(2);
                const s = d.sources.find((x) => x.form_id === id);
                void stage({ s, form: id, enabled: true, outcome: s?.outcome ?? "assign_only", meeting: s?.outcome === "assign_and_calendar" ? s.meeting_type_id : null, mappings: s?.mappings?.length ? s.mappings : suggestMappings(d.forms.find((f) => f.id === id)) });
              }}
            />
          </div>
        ) : null}
        <span className="text-[12px] text-muted">Changes here are staged in the draft and go live when you publish.</span>
      </div>
    </Sheet>
  );
}

function MappingTable({ form, mappings, fields, ro, onChange }: { form: FormInfo | undefined; mappings: Mapping[]; fields: Screen["fields"]; ro: boolean; onChange: (m: Mapping[]) => void }) {
  const label = (target: string) => (target === "contact.email" ? "Contact email" : target === "lead.country" ? "Company country" : fieldOf(target, fields).label);
  const fieldLabel = (id: string) => form?.fields.find((f) => f.id === id)?.label ?? "Removed field";
  const unmapped = (form?.fields ?? []).filter((f) => !mappings.some((m) => m.field === f.id) && targetsFor(f).length);
  return (
    <div className="overflow-x-auto border-t border-line">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            {["Form field", "Routing field", "Type", ""].map((h, i) => (
              <th key={i} className="border-b border-line px-4 py-2 text-left text-[11.5px] font-medium text-muted">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&_tr:last-child_td]:border-b-0">
          {mappings.map((m, i) => {
            const f = form?.fields.find((x) => x.id === m.field);
            const options = f ? targetsFor(f).map((t) => ({ value: `${t.target}|${t.type}`, label: label(t.target), hint: TYPE_WORDS[t.type] })) : [];
            return (
              <tr key={`${m.field}-${i}`}>
                <td className="border-b border-line px-4 py-2">{fieldLabel(m.field)}</td>
                <td className="border-b border-line px-4 py-2">
                  {ro || !options.length ? (
                    label(m.target)
                  ) : (
                    <Choice<string>
                      label={`${fieldLabel(m.field)} routing field`}
                      look="word"
                      value={`${m.target}|${m.type}`}
                      options={options.some((o) => o.value === `${m.target}|${m.type}`) ? options : [{ value: `${m.target}|${m.type}`, label: label(m.target) }, ...options]}
                      onChange={(v) => {
                        const [target, type] = v.split("|");
                        onChange(mappings.map((x, k) => (k === i ? { ...x, target: target!, type: type! } : x)));
                      }}
                    />
                  )}
                </td>
                <td className="border-b border-line px-4 py-2 text-muted">{TYPE_WORDS[m.type] ?? m.type}</td>
                <td className="w-10 border-b border-line px-2 py-2">
                  {!ro ? (
                    <IconButton label={`Stop mapping ${fieldLabel(m.field)}`} onClick={() => onChange(mappings.filter((_, k) => k !== i))}>
                      <X size={11} />
                    </IconButton>
                  ) : null}
                </td>
              </tr>
            );
          })}
          {!mappings.length ? (
            <tr>
              <td colSpan={4} className="px-4 py-3 text-muted">
                No fields mapped
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      {!ro && unmapped.length ? (
        <div className="border-t border-line px-4 py-2">
          <Choice<string>
            label="Map a form field"
            value=""
            look="word"
            placeholder="Map a field"
            options={unmapped.map((f) => ({ value: f.id, label: f.label }))}
            onChange={(id) => {
              const f = form!.fields.find((x) => x.id === id)!;
              const t = targetsFor(f)[0]!;
              onChange([...mappings, { field: f.id, target: t.target, type: t.type }]);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
