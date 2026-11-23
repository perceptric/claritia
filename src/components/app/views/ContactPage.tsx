"use client";

// One contact: its page with fields, history and visits, and the side panel for a new or edited contact.

import { useState } from "react";
import { BASES, BASIS_LABEL, type Basis } from "@/lib/contacts/consent";
import { fullName, type ContactRow } from "@/lib/contacts/fields";
import { LIFECYCLES, type AnyField, type CustomField } from "@/lib/records/fields";
import { Contact } from "../../Icons";
import { askConfirm } from "../Dialogs";
import { Select } from "../Select";
import { Avatar, Badge, Button, CardHead, Empty, ErrorNote, errorText, Field, Input, Loading, must, Page, Panel, postJson, timeAgo, useLoad, type Tone, type ViewProps } from "../ui";
import type { Link } from "../records/FieldInput";
import { useMeta } from "../records/meta";
import { FieldsPanel, HistoryPanel, sourceLabel, type Change } from "../records/RecordParts";
import { SidePanel } from "../records/SidePanel";
import { type Row } from "../records/RecordTable";
import { activeTime } from "./VisitorsView";

const LIFECYCLE_LABEL = Object.fromEntries(LIFECYCLES.map((l) => [l.value, l.label]));

const LIFECYCLE_TONE: Record<string, Tone> = { customer: "green", opportunity: "brand", sql: "brand", mql: "violet" };

const BASIS_TONE: Record<Basis, Tone> = { opt_in: "green", soft_opt_in: "green", legitimate_interest: "gray", none: "amber" };

const displayName = (c: { first_name: string | null; last_name: string | null; email: string | null }) => fullName(c) ?? c.email ?? "Contact";

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

// Side panels -----------------------------------------------------------------------------------------------------

type FormState = Record<string, string>;

const FORM_FIELDS: [key: string, label: string][] = [
  ["email", "Email"],
  ["first_name", "First name"],
  ["last_name", "Last name"],
  ["title", "Title"],
  ["company", "Company"],
  ["website", "Company website"],
  ["phone", "Phone"],
  ["country", "Country"],
  ["region", "State or region"],
  ["lead_status", "Lead status"],
];

/** Add a contact, or edit one when `initial` is given. Only changed values are sent. */
export function ContactPanel({
  session,
  wsId,
  custom,
  id,
  initial,
  onClose,
}: {
  session: ViewProps["session"];
  wsId: string;
  custom: CustomField[];
  id?: string;
  initial?: { form: FormState; fields: FormState };
  onClose: (id?: string) => void;
}) {
  const start = initial ?? { form: { lifecycle: "" }, fields: {} };
  const [form, setForm] = useState<FormState>(start.form);
  const [fields, setFields] = useState<FormState>(start.fields);
  const [basis, setBasis] = useState<Basis>("none");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    const changed = Object.fromEntries(Object.entries(form).filter(([k, v]) => (start.form[k] ?? "") !== v));
    const changedFields = Object.fromEntries(Object.entries(fields).filter(([k, v]) => (start.fields[k] ?? "") !== v));
    const payload = { ...changed, ...(Object.keys(changedFields).length ? { fields: changedFields } : {}), ...(id ? {} : { basis }) };
    try {
      if (id && !Object.keys(payload).length) return onClose(id);
      const r = await postJson<{ id: string }>(session, "/api/contacts", { workspaceId: wsId, ...(id ? { id } : {}), form: payload });
      onClose(r.id);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SidePanel
      title={id ? "Edit contact" : "Add contact"}
      onClose={() => onClose()}
      footer={
        <>
          <Button variant="plain" onClick={() => onClose()}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || !form.email?.trim()}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <ErrorNote message={error} />
        {FORM_FIELDS.map(([key, label]) => (
          <Field key={key} label={label}>
            <Input value={form[key] ?? ""} onChange={(e) => setForm({ ...form, [key]: e.target.value })} type={key === "email" ? "email" : "text"} autoFocus={key === "email" && !id} />
          </Field>
        ))}
        <Field label="Lifecycle">
          <Select<string>
            value={form.lifecycle ?? ""}
            onChange={(v) => setForm({ ...form, lifecycle: v })}
            ariaLabel="Lifecycle"
            options={[{ value: "", label: "None" }, ...LIFECYCLES]} className="w-full"
          />
        </Field>
        {!id ? (
          <Field label="Email consent">
            <Select<Basis> value={basis} onChange={setBasis} ariaLabel="Email consent" options={BASES} className="w-full" />
          </Field>
        ) : null}
        {custom.map((f) => (
          <Field key={f.key} label={f.label}>
            {f.type === "select" || f.type === "checkbox" ? (
              <Select<string>
                value={fields[f.key] ?? ""}
                onChange={(v) => setFields({ ...fields, [f.key]: v })}
                ariaLabel={f.label}
                options={[
                  { value: "", label: "None" },
                  ...(f.type === "checkbox" ? [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }] : (f.options ?? []).map((o) => (typeof o === "string" ? { value: o, label: o } : o))),
                ]} className="w-full"
              />
            ) : (
              <Input value={fields[f.key] ?? ""} onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })} placeholder={f.type === "date" ? "2026-03-31" : undefined} inputMode={f.type === "number" ? "decimal" : undefined} />
            )}
          </Field>
        ))}
        <button type="submit" className="hidden" />
      </form>
    </SidePanel>
  );
}

// The contact page ------------------------------------------------------------------------------------------------

type Detail = {
  moved_to?: string;
  contact: ContactRow & { email_clean: string; timezone: string | null; score_reasons: unknown; company_id: string | null; owner: string | null };
  company: { id: string; name: string | null; domain: string | null; industry: string | null; size: string | null; account_id: string | null; fit: number | null; intent: number | null; stage: string | null } | null;
  person: { id: string; level: string | null } | null;
  writes: Record<string, { source: string; at: string }>;
  history: Change[];
  fields: CustomField[];
  links: Record<string, Link[]>;
  consents: { channel: string; basis: Basis; status: string; source: string; at: string }[];
  suppressed: { reason: string; source: string; at: string } | null;
  topics: { name: string; status: string; at: string }[];
  segments: { id: string; name: string; kind: string; entered_at: string }[];
  events: { kind: string; data: Record<string, unknown>; source: string; at: string }[];
  visits: { id: string; started_at: string; pageviews: number; engaged_s: number; referrer_host: string | null; pages: string[] }[];
};

const EVENT_LABEL: Record<string, string> = { "contact.created": "Added" };

export function ContactPage({ sb, ws, session, id, navigate, back: backRoute = "contacts" }: ViewProps & { back?: "contacts" | "leads" }) {
  const detail = useLoad(async () => must(await sb.rpc("contact_detail", { p_id: id })) as Detail, id);
  const meta = useMeta(sb, ws.id, "contact");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const back = { label: backRoute === "leads" ? "Leads" : "Contacts", onClick: () => navigate(backRoute) };

  if (detail.data?.moved_to) {
    navigate(backRoute, detail.data.moved_to);
    return null;
  }
  if (detail.error || meta.error || !detail.data || !meta.data) {
    return (
      <Page icon={<Contact size={14} />} title="Contact" back={back}>
        {detail.error || meta.error ? <ErrorNote message={detail.error || meta.error} /> : <Loading />}
      </Page>
    );
  }
  const d = detail.data;
  const c = d.contact;
  const name = displayName(c);
  const consent = d.consents[0];
  const fields = meta.data.fields;
  const record: Row = { ...(c as unknown as Row), company_name: d.company?.name ?? d.company?.domain ?? null, company_domain: d.company?.domain ?? null, fit: d.company?.fit ?? null, intent: d.company?.intent ?? null, industry: d.company?.industry ?? null, size: d.company?.size ?? null };
  const stage = fields.find((f) => f.key === "lead_status");

  async function remove() {
    if (!(await askConfirm(`Remove ${name}?`, { ok: "Remove", danger: true }))) return;
    try {
      must(await sb.rpc("contacts_delete", { p_ws: ws.id, p_ids: [id] }));
      navigate(backRoute);
    } catch (e) {
      setError(errorText(e));
    }
  }
  const save = async (f: AnyField, v: unknown) => {
    must(await sb.rpc("record_set", { p_object: "contact", p_id: id, p_key: f.key, p_value: v ?? null }));
    detail.reload();
  };

  const timeline = [
    ...d.events.map((e) => ({ at: e.at, key: `e${e.at}${e.kind}`, node: <span>{`${EVENT_LABEL[e.kind] ?? e.kind} · ${sourceLabel(e.source)}`}</span> })),
    ...d.visits.map((v) => ({
      at: v.started_at,
      key: v.id,
      node: (
        <span className="flex flex-col gap-1">
          <span>
            Visited · {v.pageviews} {v.pageviews === 1 ? "page" : "pages"} · {activeTime(v.engaged_s)}
            {v.referrer_host ? <span className="text-faint"> · {v.referrer_host}</span> : null}
          </span>
          <span className="flex flex-wrap gap-x-3 font-mono text-[12px] text-body">
            {v.pages.map((p, i) => (
              <span key={i}>{p}</span>
            ))}
          </span>
        </span>
      ),
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const edit = {
    form: {
      email: c.email ?? "",
      first_name: c.first_name ?? "",
      last_name: c.last_name ?? "",
      title: c.title ?? "",
      company: d.company?.name ?? "",
      website: d.company?.domain ?? "",
      phone: c.phone ?? "",
      country: c.country ?? "",
      region: c.region ?? "",
      lead_status: c.lead_status ?? "",
      lifecycle: c.lifecycle ?? "",
    },
    fields: Object.fromEntries(d.fields.filter((f) => f.type !== "relation").map((f) => [f.key, c.fields?.[f.key] == null ? "" : f.type === "checkbox" ? (c.fields[f.key] ? "yes" : "no") : Array.isArray(c.fields[f.key]) ? (c.fields[f.key] as string[]).join(", ") : String(c.fields[f.key])])),
  };

  return (
    <Page
      icon={<Contact size={14} />}
      title={name}
      back={back}
      actions={
        <>
          <Button variant="ghost" className="h-7 px-2.5" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button variant="danger" className="h-7 px-2.5" onClick={remove}>
            Remove
          </Button>
        </>
      }
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <ErrorNote message={error} />
        <Panel>
          <div className="flex flex-wrap items-start gap-x-10 gap-y-4 p-5">
            <div className="flex min-w-0 items-start gap-3">
              <Avatar label={name} size={40} />
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-[20px] font-medium tracking-[-0.02em]">{name}</span>
                <span className="text-[13px] text-muted">{[c.title, d.company?.name ?? d.company?.domain, c.country].filter(Boolean).join(" · ") || c.email}</span>
                <span className="mt-1 flex flex-wrap gap-1.5">
                  {c.lifecycle ? <Badge tone={LIFECYCLE_TONE[c.lifecycle] ?? "gray"}>{LIFECYCLE_LABEL[c.lifecycle] ?? c.lifecycle}</Badge> : null}
                  {consent ? <Badge tone={BASIS_TONE[consent.basis]}>{BASIS_LABEL[consent.basis]}</Badge> : null}
                  {d.suppressed ? <Badge tone="red">{d.suppressed.reason}</Badge> : null}
                  {d.person ? <Badge tone="brand">On site</Badge> : null}
                </span>
              </div>
            </div>
            {[
              ["Score", c.score],
              ["Fit", d.company?.fit ?? null],
              ["Intent", d.company?.intent ?? null],
            ].map(([label, v]) => (
              <div key={label as string} className="flex flex-col gap-1">
                <span className="label-mono">{label}</span>
                <span className="font-mono text-[24px] tabular-nums">{v ?? "—"}</span>
              </div>
            ))}
          </div>
          {stage ? <StageBar stages={stage.options} value={c.lead_status} onPick={(v) => void save(stage, v).catch((e) => setError(errorText(e)))} /> : null}
        </Panel>

        <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
          <div className="flex flex-col gap-5">
            <Panel>
              <CardHead label="Timeline" count={timeline.length} />
              {!timeline.length ? (
                <Empty title="Nothing yet" />
              ) : (
                <ol className="divide-y divide-line">
                  {timeline.map((t) => (
                    <li key={t.key} className="flex gap-4 px-4 py-3 text-[13px]">
                      <span className="w-32 shrink-0 font-mono text-[12px] whitespace-nowrap text-muted">{new Date(t.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                      {t.node}
                    </li>
                  ))}
                </ol>
              )}
            </Panel>
            <HistoryPanel history={d.history} fields={fields} people={meta.data.people} />
          </div>

          <div className="flex flex-col gap-5">
            <FieldsPanel
              sb={sb}
              wsId={ws.id}
              record={record}
              fields={fields}
              layout={meta.data.layout}
              writes={d.writes}
              links={d.links}
              skip={["name", "known", "segment", "fit", "intent", "score"]}
              onSave={save}
              onCustomize={() => navigate("settings", "fields")}
            />

            {d.company ? (
              <Panel>
                <CardHead label="Company">
                  <Button variant="plain" className="h-7 px-2" onClick={() => navigate("companies", d.company!.id)}>
                    Open
                  </Button>
                  {d.company.account_id ? (
                    <Button variant="plain" className="h-7 px-2" onClick={() => navigate("accounts", d.company!.account_id!)}>
                      Intent
                    </Button>
                  ) : null}
                </CardHead>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 px-4 py-3 text-[13px]">
                  {[
                    ["Name", d.company.name],
                    ["Domain", d.company.domain],
                    ["Industry", d.company.industry],
                    ["Size", d.company.size],
                    ["Stage", d.company.stage],
                  ].map(([k, v]) => (
                    <div key={k as string} className="contents">
                      <dt className="text-muted">{k}</dt>
                      <dd>{v ?? "—"}</dd>
                    </div>
                  ))}
                </dl>
              </Panel>
            ) : null}

            <Panel>
              <CardHead label="Email consent" />
              {!d.consents.length ? (
                <p className="px-4 py-3 text-[13px] text-faint">—</p>
              ) : (
                <ul className="divide-y divide-line">
                  {d.consents.map((k, i) => (
                    <li key={i} className="flex items-center gap-2 px-4 py-2.5 text-[13px]">
                      <Badge tone={BASIS_TONE[k.basis]}>{BASIS_LABEL[k.basis]}</Badge>
                      <span className="text-muted">{sourceLabel(k.source)}</span>
                      <span className="ml-auto font-mono text-[11.5px] text-faint">{fmtDate(k.at)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {d.topics.length ? (
                <ul className="border-t border-line px-4 py-2 text-[13px]">
                  {d.topics.map((t) => (
                    <li key={t.name} className="flex justify-between py-1">
                      <span>{t.name}</span>
                      <Badge tone={t.status === "subscribed" ? "green" : "gray"}>{t.status}</Badge>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Panel>

            <Panel>
              <CardHead label="Lists and segments" count={d.segments.length} />
              {!d.segments.length ? (
                <p className="px-4 py-3 text-[13px] text-faint">—</p>
              ) : (
                <ul className="divide-y divide-line">
                  {d.segments.map((g) => (
                    <li key={g.id} className="flex justify-between px-4 py-2.5 text-[13px]">
                      <span>{g.name}</span>
                      <span className="font-mono text-[11.5px] text-faint">{timeAgo(g.entered_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      </div>
      {editing ? (
        <ContactPanel
          session={session}
          wsId={ws.id}
          custom={d.fields.filter((f) => f.type !== "relation")}
          id={id}
          initial={edit}
          onClose={(saved) => {
            setEditing(false);
            if (saved) detail.reload();
          }}
        />
      ) : null}
    </Page>
  );
}

/** The lead stages as one bar; the current stage is filled, a click moves the lead. */
function StageBar({ stages, value, onPick }: { stages: { value: string; label: string; kind?: string }[]; value: string | null; onPick: (v: string) => void }) {
  return (
    <div className="flex border-t border-line">
      {stages.map((s, i) => {
        const on = s.value === value;
        return (
          <button
            key={s.value}
            type="button"
            onClick={() => !on && onPick(s.value)}
            className={`h-9 flex-1 truncate px-2 text-[12.5px] font-medium ${i ? "border-l border-line" : ""} ${
              on ? (s.kind === "lost" ? "bg-danger-soft text-danger" : s.kind === "won" ? "bg-success-soft text-success" : "bg-ink text-white") : "text-muted hover:bg-hover hover:text-ink"
            }`}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
