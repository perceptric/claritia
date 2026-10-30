"use client";

// The form's Settings sheet (docs/forms-plan.md Part 6): Team alerts (email the people picked, post in Slack), the
// Auto-reply (with a preview in the brand's look), Spam and security, and Data (how long submissions are kept, and
// deleting every one). Each change is an op, so undo works and nothing goes out until the form is published.

import type { SupabaseClient } from "@supabase/supabase-js";
import { useState } from "react";
import { DEFAULT_KEEP, DEFAULT_NOTIFY, DEFAULT_REPLY, MERGE_TAGS, merge, type Keep } from "@/lib/forms/notify";
import type { Op } from "@/lib/forms/ops";
import type { Form } from "@/lib/forms/schema";
import { X } from "../../Icons";
import { askConfirm } from "../Dialogs";
import { Button, ErrorNote, errorText, Input, must, Segmented, Toggle } from "../ui";
import { SpamSettings } from "./FormSettings";
import { AREA, Group, Row, Section } from "./SettingsParts";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const KEEPS: { value: string; label: string }[] = [
  { value: "30", label: "30 days" },
  { value: "365", label: "1 year" },
  { value: "1095", label: "3 years" },
  { value: "forever", label: "Forever" },
];
const SAMPLE = { first_name: "Maya", name: "Maya Chen", email: "maya@linear.app", company: "Linear" };

/** Tag buttons that add {{tag}} at the end of a field. */
function Tags({ onAdd }: { onAdd: (tag: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {MERGE_TAGS.map((t) => (
        <button key={t} type="button" onClick={() => onAdd(t === "first_name" ? "{{first_name|there}}" : `{{${t}}}`)} className="h-6 rounded-full border border-line px-2.5 text-[11.5px] text-body transition-colors duration-[140ms] hover:border-ink hover:text-ink">
          {t}
        </button>
      ))}
    </div>
  );
}

export function TeamAlerts({ form, apply }: { form: Form; apply: (op: Op) => void }) {
  const n = { ...DEFAULT_NOTIFY, ...form.notify };
  const [adding, setAdding] = useState("");
  const add = () => {
    const v = adding.trim().toLowerCase();
    if (!EMAIL.test(v)) return;
    if (!n.to.includes(v)) apply({ op: "set_notify", notify: { to: [...n.to, v].slice(0, 10) } });
    setAdding("");
  };
  return (
    <Section id="alerts" title="Team alerts" aside={<Toggle label="Team alerts" on={n.on} onChange={(v) => apply({ op: "set_notify", notify: { on: v } })} />}>
      {n.on ? (
        <>
          <Group label="Send to">
            <div className="flex flex-wrap items-center gap-1.5">
              {n.to.map((e) => (
                <span key={e} className="inline-flex h-7 items-center gap-1 rounded-full bg-paper-deep pr-1 pl-2.5 text-[12.5px] text-ink">
                  {e}
                  <button type="button" aria-label={`Remove ${e}`} onClick={() => apply({ op: "set_notify", notify: { to: n.to.filter((x) => x !== e) } })} className="flex size-5 items-center justify-center rounded-full text-muted hover:bg-line hover:text-ink">
                    <X size={11} />
                  </button>
                </span>
              ))}
              <Input
                aria-label="Add an email"
                value={adding}
                placeholder="Add an email"
                onChange={(e) => setAdding(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    add();
                  }
                }}
                onBlur={add}
                className="h-8 w-56"
              />
            </div>
          </Group>
          <Group label="Subject" htmlFor="alert-subject">
            <Input id="alert-subject" value={n.subject} onChange={(e) => apply({ op: "set_notify", notify: { subject: e.target.value } })} className="h-10" />
            <Tags onAdd={(t) => apply({ op: "set_notify", notify: { subject: `${n.subject} ${t}`.trim() } })} />
          </Group>
          <div className="-my-2 flex flex-col divide-y divide-line">
            <div className="py-2">
              <Row label="Include every answer">
                <Toggle label="Include every answer" on={n.answers} onChange={(v) => apply({ op: "set_notify", notify: { answers: v } })} />
              </Row>
            </div>
            <div className="py-2">
              <Row label="Post in the Routing Slack channel">
                <Toggle label="Post in the Routing Slack channel" on={n.slack} onChange={(v) => apply({ op: "set_notify", notify: { slack: v } })} />
              </Row>
            </div>
          </div>
        </>
      ) : null}
    </Section>
  );
}

export function AutoReply({ form, apply }: { form: Form; apply: (op: Op) => void }) {
  const r = { ...DEFAULT_REPLY, ...form.reply };
  const set = (reply: Partial<typeof r>) => apply({ op: "set_reply", reply });
  const vals = { ...SAMPLE, form: form.title || "Form" };
  return (
    <Section id="reply" title="Auto-reply" aside={<Toggle label="Auto-reply" on={r.on} onChange={(v) => set({ on: v, ...(v && !r.body ? { body: DEFAULT_REPLY.body } : {}) })} />}>
      {r.on ? (
        <>
          <Group label="From">
            <Segmented<"owner" | "team">
              label="From"
              value={r.from}
              options={[
                { value: "owner", label: "The routed rep" },
                { value: "team", label: "The team" },
              ]}
              onChange={(v) => set({ from: v })}
            />
          </Group>
          <Group label="Subject" htmlFor="reply-subject">
            <Input id="reply-subject" value={r.subject} onChange={(e) => set({ subject: e.target.value })} className="h-10" />
          </Group>
          <Group label="Message" htmlFor="reply-body">
            <textarea id="reply-body" rows={6} value={r.body} onChange={(e) => set({ body: e.target.value })} className={AREA} />
            <Tags onAdd={(t) => set({ body: `${r.body}${r.body.endsWith(" ") || !r.body ? "" : " "}${t}` })} />
          </Group>
          <div className="-my-2 flex flex-col divide-y divide-line">
            <div className="py-2">
              <Row label="Add the rep's booking link">
                <Toggle label="Add the rep's booking link" on={r.book} onChange={(v) => set({ book: v })} />
              </Row>
            </div>
            <div className="py-2">
              <Row label="Only to work emails">
                <Toggle label="Only to work emails" on={r.workOnly} onChange={(v) => set({ workOnly: v })} />
              </Row>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className="font-mono text-[10.5px] tracking-[0.06em] text-faint uppercase">Preview</span>
            <div className="rounded-[10px] border border-line bg-paper p-4">
              <p className="text-[12px] text-muted">{merge(r.subject, vals)}</p>
              <div className="mt-3 flex flex-col gap-3 rounded-lg border border-line bg-card px-4 py-4 text-[13.5px] leading-[1.55] text-ink">
                {merge(r.body, vals)
                  .split(/\n{2,}/)
                  .filter((p) => p.trim())
                  .map((p, i) => (
                    <p key={i} className="whitespace-pre-line">
                      {p}
                    </p>
                  ))}
                {r.book ? <span className="inline-flex h-9 items-center self-start rounded-full bg-ink px-4 text-[13px] font-medium text-paper">Pick a time</span> : null}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </Section>
  );
}

export function MoreSpam({ form, apply }: { form: Form; apply: (op: Op) => void }) {
  const sites = form.spam.sites ?? [];
  const [site, setSite] = useState("");
  const addSite = () => {
    const v = site
      .trim()
      .toLowerCase()
      .replace(/^[a-z]+:\/\//, "")
      .replace(/[/?#].*$/, "")
      .replace(/^www\./, "");
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v) && !sites.includes(v)) apply({ op: "set_spam", sites: [...sites, v].slice(0, 20) });
    setSite("");
  };
  const limited = form.spam.perHour !== undefined;
  return (
    <Section id="security" title="Security">
      <div className="-my-2 flex flex-col divide-y divide-line">
        <div className="py-2">
          <Row label="Refuse free email addresses">
            <Toggle label="Refuse free email addresses" on={!!form.spam.blockFree} onChange={(v) => apply({ op: "set_spam", blockFree: v })} />
          </Row>
        </div>
        <div className="py-2">
          <Row label="Limit submissions per hour">
            <span className="flex items-center gap-2">
              {limited ? (
                <Input
                  aria-label="Submissions per hour"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={form.spam.perHour}
                  onChange={(e) => {
                    const v = Math.round(Number(e.target.value));
                    if (e.target.value !== "" && v >= 1) apply({ op: "set_spam", perHour: Math.min(v, 10000) });
                  }}
                  className="h-9 w-20 text-right tabular-nums"
                />
              ) : null}
              <Toggle label="Limit submissions per hour" on={limited} onChange={(v) => apply({ op: "set_spam", perHour: v ? 60 : null })} />
            </span>
          </Row>
        </div>
      </div>
      <Group label="Only take submissions from" htmlFor="form-sites">
        <div className="flex flex-wrap items-center gap-1.5">
          {sites.map((s) => (
            <span key={s} className="inline-flex h-7 items-center gap-1 rounded-full bg-paper-deep pr-1 pl-2.5 text-[12.5px] text-ink">
              {s}
              <button type="button" aria-label={`Remove ${s}`} onClick={() => apply({ op: "set_spam", sites: sites.filter((x) => x !== s) })} className="flex size-5 items-center justify-center rounded-full text-muted hover:bg-line hover:text-ink">
                <X size={11} />
              </button>
            </span>
          ))}
          <Input
            id="form-sites"
            value={site}
            placeholder={sites.length ? "Add a site" : "Any site"}
            onChange={(e) => setSite(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSite();
              }
            }}
            onBlur={addSite}
            className="h-8 w-48"
          />
        </div>
      </Group>
    </Section>
  );
}

export function DataSettings({ form, apply, sb, formId, onCleared }: { form: Form; apply: (op: Op) => void; sb: SupabaseClient; formId: string; onCleared: () => void }) {
  const keep: Keep = { ...DEFAULT_KEEP, ...form.keep };
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const clear = async () => {
    if (!(await askConfirm("Delete every submission of this form?", { body: "Contacts stay.", ok: "Delete all", danger: true }))) return;
    setBusy(true);
    setError("");
    try {
      must(await sb.rpc("form_submissions_clear", { p_form: formId }));
      onCleared();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section id="data" title="Data">
      <Group label="Keep submissions for">
        <Segmented<string> label="Keep submissions for" value={keep.days === null ? "forever" : String(keep.days)} options={KEEPS} onChange={(v) => apply({ op: "set_keep", keep: { days: v === "forever" ? null : Number(v) } })} />
      </Group>
      <Row label="Delete every submission">
        <Button variant="danger" size="sm" disabled={busy} onClick={() => void clear()}>
          {busy ? "Deleting" : "Delete all"}
        </Button>
      </Row>
      <ErrorNote message={error} />
    </Section>
  );
}

export function FormRules(p: { form: Form; apply: (op: Op) => void; sb: SupabaseClient; formId: string; onCleared: () => void }) {
  return (
    <div className="flex flex-col gap-6">
      <TeamAlerts form={p.form} apply={p.apply} />
      <AutoReply form={p.form} apply={p.apply} />
      <SpamSettings form={p.form} apply={p.apply} />
      <MoreSpam form={p.form} apply={p.apply} />
      <DataSettings {...p} />
    </div>
  );
}
