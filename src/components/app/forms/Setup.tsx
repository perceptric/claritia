"use client";

// Settings (docs/forms-plan.md Part 6): a list on the left with icons (Access, Team alerts, Auto-reply, Consent, Spam
// and security, Data; what happens after a submit is On Submission on Build), the one picked on the right. Every change is an op on the draft, so it saves,
// undoes and publishes like the rest of the form.

import { useState } from "react";
import { DEFAULT_NOTIFY, DEFAULT_REPLY, merge } from "@/lib/forms/notify";
import type { Op } from "@/lib/forms/ops";
import { allFields, DEFAULT_CONSENT, type Form } from "@/lib/forms/schema";
import type { RouterBody } from "@/lib/router/types";
import { BrandLogo } from "../BrandLogo";
import { CLOSED } from "@/lib/forms/access";
import { DatePick } from "../DatePick";
import { askText } from "../Dialogs";
import { Badge, ErrorNote, errorText, must, useLoad, type ViewProps } from "../ui";
import { Ic } from "./ic";
import { AREA, Box, CARD, CROW, CSTACK, GHOST_SM, GHOST_SM_RED, IN, IN_FIT, RowText, Seg, useNote, Tg } from "./parts";

export type SetupSub = "access" | "alerts" | "reply" | "consent" | "spam" | "data";

type Props = ViewProps & {
  form: Form;
  apply: (ops: Op | Op[], words?: string) => boolean;
  sub: SetupSub;
  setSub: (s: SetupSub) => void;
  formId: string;
  types: { id: string; name: string; active: boolean; settings?: { lengths?: number[] } }[];
  routing: RouterBody | null;
  onReview: () => void;
  subs: number;
  name: string;
  /** Pause the form, from Access: whether it's paused, and the switch (it asks first). Null before it's published. */
  paused?: boolean | null;
  onStatus?: (s: "live" | "paused") => void;
};

export function Setup(p: Props) {
  const { form, sub, setSub } = p;
  const items: [SetupSub, string, string, boolean?][] = [
    ["access", "clock", "Access", !!form.access || !!p.paused],
    ["alerts", "bell", "Team alerts", !!form.notify?.on],
    ["reply", "reply", "Auto-reply", !!form.reply?.on],
    ["consent", "shield", "Consent"],
    ["spam", "lock", "Spam and security"],
    ["data", "data", "Data"],
  ];
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] max-[860px]:grid-cols-1 max-[860px]:grid-rows-[auto_minmax(0,1fr)]">
      <nav aria-label="Settings" className="flex flex-col gap-[2px] overflow-y-auto border-r border-line px-[8px] py-[12px] max-[860px]:flex-row max-[860px]:overflow-x-auto max-[860px]:border-r-0 max-[860px]:border-b max-[860px]:p-[8px]">
        {items.map(([v, i, l, on]) => (
          <button
            key={v}
            type="button"
            aria-current={sub === v ? "page" : undefined}
            onClick={() => setSub(v)}
            className={`flex h-[34px] w-full items-center gap-[9px] rounded-lg px-[10px] text-left whitespace-nowrap transition-colors duration-[120ms] max-[860px]:w-auto max-[860px]:shrink-0 ${sub === v ? "bg-paper-deep font-medium text-ink" : "text-body hover:bg-paper"}`}
          >
            <Ic n={i} />
            {l}
            {on ? <span title="On" aria-label="On" className="ml-auto size-[6px] rounded-full bg-signal max-[860px]:ml-[4px]" /> : null}
          </button>
        ))}
      </nav>
      <div className="min-w-0 overflow-y-auto px-[16px] pt-[20px] pb-[32px] sm:px-[clamp(16px,3vw,32px)]">
        <div className="flex max-w-[760px] flex-col gap-[16px]">
          {sub === "access" ? <AccessPane {...p} /> : sub === "alerts" ? <Alerts {...p} /> : sub === "reply" ? <Reply {...p} /> : sub === "consent" ? <Consent {...p} /> : sub === "spam" ? <Spam {...p} /> : <Data {...p} />}
        </div>
      </div>
    </div>
  );
}

const H3 = ({ children }: { children: React.ReactNode }) => <h3 className="m-0 text-[15px] font-semibold tracking-[-0.01em] text-ink">{children}</h3>;
const Sub = ({ children }: { children: React.ReactNode }) => <p className="-mt-[10px] mb-0 text-[12.5px] text-muted">{children}</p>;
const Label = ({ children }: { children: React.ReactNode }) => <label className="text-[12px] font-medium text-muted">{children}</label>;




const EMAIL = /^[^\s@<>()",;:]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

const pad2 = (n: number) => String(n).padStart(2, "0");
/** An ISO time as this computer's day and time, for the pickers. */
const localParts = (iso?: string) => {
  if (!iso) return { day: "", time: "09:00" };
  const d = new Date(iso);
  return { day: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`, time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}` };
};
const toIso = (day: string, time: string) => new Date(`${day}T${/^\d{2}:\d{2}$/.test(time) ? time : "09:00"}:00`).toISOString();

/** Settings › Access: Pause the form, when it opens and closes, the most fills it takes and what it says when closed. */
function AccessPane({ form, apply, paused, onStatus }: Props) {
  const a = form.access ?? {};
  const [now] = useState(() => Date.now());
  const shut = paused || (a.opens && now < Date.parse(a.opens)) || (a.closes && now >= Date.parse(a.closes));
  const when = (k: "opens" | "closes", title: string) => {
    const v = a[k];
    const parts = localParts(v);
    const tomorrow = new Date(now + 86_400_000);
    return (
      <div className={CROW}>
        <RowText title={title} />
        <div className="flex flex-wrap items-center gap-[8px]">
          {v ? (
            <>
              <DatePick label={`${title}, day`} value={parts.day} onChange={(d) => apply({ op: "set_access", access: { [k]: toIso(d, parts.time) } })} />
              <input type="time" aria-label={`${title}, time`} value={parts.time} onChange={(e) => e.target.value && apply({ op: "set_access", access: { [k]: toIso(parts.day, e.target.value) } })} className={`${IN_FIT} w-[110px] tabular-nums`} />
            </>
          ) : null}
          <Tg label={title} on={!!v} onChange={(on) => apply({ op: "set_access", access: { [k]: on ? toIso(localParts((k === "closes" && a.opens ? new Date(Date.parse(a.opens) + 7 * 86_400_000) : tomorrow).toISOString()).day, "09:00") : null } })} />
        </div>
      </div>
    );
  };
  return (
    <>
      <div className="flex flex-wrap items-center gap-[8px]">
        <H3>Access</H3>
        {shut ? <Badge tone="amber">Closed now</Badge> : null}
      </div>
      <div className={CARD}>
        <div className={CROW}>
          <RowText title="Pause the form" sub={paused ? "Paused" : undefined} />
          <Tg label="Pause the form" on={!!paused} disabled={paused == null || !onStatus} onChange={(on) => onStatus?.(on ? "paused" : "live")} />
        </div>
        {when("opens", "Opens on")}
        {when("closes", "Closes on")}
        <div className={CROW}>
          <RowText title="Stop after this many fills" />
          <div className="flex flex-wrap items-center gap-[8px]">
            {a.limit ? (
              <input
                className={`${IN_FIT} w-[90px] tabular-nums`}
                inputMode="numeric"
                aria-label="Most fills"
                value={a.limit}
                onChange={(e) => {
                  const n = parseInt(e.target.value.replace(/\D/g, ""), 10);
                  if (Number.isFinite(n) && n > 0) apply({ op: "set_access", access: { limit: Math.min(n, 1_000_000) } });
                }}
              />
            ) : null}
            <Tg label="Stop after this many fills" on={!!a.limit} onChange={(on) => apply({ op: "set_access", access: { limit: on ? 100 : null } })} />
          </div>
        </div>
        <div className={CSTACK}>
          <Label>Closed message</Label>
          <textarea className={AREA} rows={2} maxLength={500} aria-label="Closed message" placeholder={CLOSED} value={a.message ?? ""} onChange={(e) => apply({ op: "set_access", access: { message: e.target.value || null } })} />
        </div>
      </div>
    </>
  );
}

function Alerts({ form, apply, routing }: Props) {
  const n = { ...DEFAULT_NOTIFY, ...form.notify };
  const [add, setAdd] = useState("");
  const [bad, setBad] = useState("");
  const set = (x: Partial<typeof n>, words?: string) => apply({ op: "set_notify", notify: x }, words);
  return (
    <>
      <H3>Team alerts</H3>
      <Sub>Who hears about each new lead</Sub>
      <div className={CARD}>
        <div className={CROW}>
          <RowText title="Email the team" />
          <Tg label="Email the team" on={n.on} onChange={(v) => set({ on: v })} />
        </div>
        {n.on ? (
          <>
            <div className={CSTACK}>
              <Label>Send to</Label>
              <div className="flex flex-wrap items-center gap-[6px]">
                {n.to.map((e) => (
                  <span key={e} className="inline-flex h-[26px] max-w-full items-center gap-[4px] rounded-full bg-paper-deep pr-[4px] pl-[10px] text-[12.5px]">
                    {e}
                    <button type="button" aria-label={`Remove ${e}`} onClick={() => set({ to: n.to.filter((x) => x !== e) })} className="inline-flex size-[18px] items-center justify-center rounded-full text-muted hover:bg-card hover:text-ink">
                      <Ic n="x" s={11} />
                    </button>
                  </span>
                ))}
                <input
                  className={`${IN_FIT} w-[220px]`}
                  placeholder="Add an email"
                  aria-label="Add an email"
                  value={add}
                  onChange={(e) => (setAdd(e.target.value), setBad(""))}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    const v = add.trim().toLowerCase();
                    if (!EMAIL.test(v)) return setBad("That isn't an email address");
                    if (!n.to.includes(v)) set({ to: [...n.to, v].slice(0, 10) });
                    setAdd("");
                  }}
                />
              </div>
              {bad ? <span className="text-[12px] text-rose">{bad}</span> : null}
            </div>
            <div className={CSTACK}>
              <Label>Subject</Label>
              <input className={IN} value={n.subject} onChange={(e) => set({ subject: e.target.value })} />
              <Tags tags={["form", "name", "email", "company"]} onTag={(t) => set({ subject: `${n.subject} {{${t}}}`.trim() })} />
            </div>
            <div className={CROW}>
              <RowText title="Include every answer" />
              <Tg label="Include every answer" on={n.answers} onChange={(v) => set({ answers: v })} />
            </div>
          </>
        ) : null}
        <div className={CROW}>
          <BrandLogo domain="slack.com" name="Slack" size={18} />
          <RowText title="Post in Slack" sub={routing ? "Routing posts new leads in its channel already, with who took them" : "In the Routing channel"} />
          {routing ? <Badge>Routing posts here</Badge> : <Tg label="Post in Slack" on={n.slack} onChange={(v) => set({ slack: v })} />}
        </div>
      </div>
    </>
  );
}

function Tags({ tags, onTag }: { tags: string[]; onTag: (t: string) => void }) {
  return (
    <div className="flex flex-wrap gap-[4px]">
      {tags.map((t) => (
        <button key={t} type="button" onClick={() => onTag(t)} className="h-[22px] rounded-full border border-line px-[8px] font-mono text-[11.5px] text-body hover:border-line-strong">
          {t.split("|")[0]}
        </button>
      ))}
    </div>
  );
}

function Reply({ form, apply, ws }: Props) {
  const r = { ...DEFAULT_REPLY, ...form.reply };
  const set = (x: Partial<typeof r>) => apply({ op: "set_reply", reply: x });
  const sample = { first_name: "Maya", name: "Maya Chen", email: "maya@company.com", company: "Linear", form: "" };
  const body = merge(r.body, sample);
  return (
    <>
      <H3>Auto-reply</H3>
      <Sub>An email to the person who sent it</Sub>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,320px)] items-start gap-[16px] max-[860px]:grid-cols-1">
        <div className={CARD}>
          <div className={CROW}>
            <RowText title="Send an auto-reply" />
            <Tg label="Send an auto-reply" on={r.on} onChange={(v) => set({ on: v, ...(v && !form.reply?.body ? { body: r.body } : {}) })} />
          </div>
          {r.on ? (
            <>
              <div className={CSTACK}>
                <Label>From</Label>
                <Seg label="From" value={r.from} onChange={(v) => set({ from: v })} options={[{ value: "owner", label: "Their owner" }, { value: "team", label: ws.name }]} />
              </div>
              <div className={CSTACK}>
                <Label>Subject</Label>
                <input className={IN} value={r.subject} onChange={(e) => set({ subject: e.target.value })} />
              </div>
              <div className={CSTACK}>
                <Label>Message</Label>
                <textarea className={AREA} rows={6} value={r.body} onChange={(e) => set({ body: e.target.value })} />
                <Tags tags={["first_name|there", "company|your team"]} onTag={(t) => set({ body: `${r.body} {{${t}}}` })} />
              </div>
              <div className={CROW}>
                <RowText title="Add a booking link" sub="To the meeting they were offered, with their owner. Left out once they book." />
                <Tg label="Add a booking link" on={r.book} onChange={(v) => set({ book: v })} />
              </div>
              <div className={CROW}>
                <RowText title="Only to work emails" />
                <Tg label="Only to work emails" on={r.workOnly} onChange={(v) => set({ workOnly: v })} />
              </div>
              <div className={CROW}>
                <RowText title="Sends 5 minutes after the fill" sub="So it knows if they booked" />
              </div>
            </>
          ) : null}
        </div>
        {r.on ? (
          <div aria-label="Email preview" className="keep-light rounded-[10px] shadow-rest bg-paper-deep p-[14px] text-ink">
            <div className="mb-[10px] text-[12px] text-muted">
              {`From ${r.from === "owner" ? "their owner" : ws.name}`}
              <br />
              {merge(r.subject, sample)}
            </div>
            <div className="rounded-[10px] bg-card px-[20px] py-[18px] text-[14px] leading-[1.55]">
              <div className="mb-[14px] flex items-center gap-[8px] border-b border-line pb-[12px] font-bold">
                <i className="size-[14px] rounded-full bg-ink" />
                {ws.name}
              </div>
              {body
                .split(/\n{2,}/)
                .filter((x) => x.trim())
                .map((para, i) => (
                  <p key={i} className="mt-0 mb-[10px] whitespace-pre-line">
                    {para}
                  </p>
                ))}
              {r.book && form.after.schedule ? <span className="mt-[6px] inline-block rounded-full bg-ink px-[16px] py-[9px] font-medium text-card">Pick a time</span> : null}
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}

function Consent({ form, apply }: Props) {
  const c = form.consent;
  const show = c.mode === "always" ? "always" : c.mode === "by_region" ? "by_region" : "off";
  const off = show === "off";
  return (
    <>
      <H3>Consent</H3>
      <Sub>Permission to send them emails</Sub>
      <div className={CARD}>
        <div className={CSTACK}>
          <Label>Checkbox text</Label>
          <textarea className={AREA} rows={2} value={c.label} onChange={(e) => apply({ op: "set_consent", label: e.target.value })} onBlur={(e) => !e.target.value.trim() && apply({ op: "set_consent", label: DEFAULT_CONSENT })} />
        </div>
        <div className={CSTACK}>
          <Label>Show the checkbox to</Label>
          <Seg label="Show the checkbox to" value={show} onChange={(v) => apply({ op: "set_consent", mode: v })} options={[{ value: "by_region", label: "EU and UK visitors" }, { value: "always", label: "Everyone" }, { value: "off", label: "No one" }]} />
        </div>
        <div className={CROW}>
          <RowText title="Required to send the form" />
          <Tg label="Required to send the form" on={!!c.required} disabled={off} onChange={(v) => apply({ op: "set_consent", required: v })} />
        </div>
        <div className={CROW}>
          <RowText title="Confirm by email first" sub="They click a link before they get marketing emails" />
          <Tg label="Confirm by email first" on={!!c.confirm} disabled={off} onChange={(v) => apply({ op: "set_consent", confirm: v })} />
        </div>
      </div>
      {off ? (
        <Box tone="warn" title="No one is asked">
          <span className="text-body">Leads get your sales emails but not marketing emails</span>
        </Box>
      ) : null}
    </>
  );
}

function Spam({ sb, form, apply, formId, onReview }: Props) {
  const s = form.spam;
  const [site, setSite] = useState("");
  const [bad, setBad] = useState("");
  const sites = s.sites ?? [];
  const held = useLoad(async () => Number((await sb.rpc("form_fill_count", { p_form: formId, p_filters: { kind: "spam", from: new Date(Date.now() - 30 * 86_400_000).toISOString() } })).data ?? 0), formId);
  const speed = s.minSeconds <= 0 ? "0" : s.minSeconds <= 3 ? "3" : "5";
  return (
    <>
      <H3>Spam and security</H3>
      <Sub>What gets in</Sub>
      <div className={CARD}>
        <div className={CROW}>
          <RowText title="Bot check" sub={!s.turnstile ? "Off" : s.bot === "always" ? "Everyone sees it" : "Only shown when a fill looks like a bot"} />
          <Seg
            label="Bot check"
            value={!s.turnstile ? "off" : s.bot === "always" ? "always" : "auto"}
            onChange={(v) => apply({ op: "set_spam", turnstile: v !== "off", bot: v === "always" ? "always" : "auto" })}
            options={[{ value: "off", label: "Off" }, { value: "auto", label: "When needed" }, { value: "always", label: "Always" }]}
          />
        </div>
        <div className={CROW}>
          <RowText title="Throwaway email addresses" sub={s.throwaway === "hold" ? "Sent to Spam" : "Asked for an address they'll keep"} />
          <Seg label="Throwaway email addresses" value={s.throwaway === "hold" ? "hold" : "refuse"} onChange={(v) => apply({ op: "set_spam", throwaway: v })} options={[{ value: "refuse", label: "Refuse" }, { value: "hold", label: "Send to Spam" }]} />
        </div>
        <div className={CROW}>
          <RowText title="Free email addresses" sub="Gmail, Yahoo, Outlook" />
          <Seg label="Free email addresses" value={s.blockFree ? "refuse" : "allow"} onChange={(v) => apply({ op: "set_spam", blockFree: v === "refuse" })} options={[{ value: "allow", label: "Allow" }, { value: "refuse", label: "Ask for a work email" }]} />
        </div>
        <div className={CSTACK}>
          <Label>Only from these sites</Label>
          <div className="flex flex-wrap items-center gap-[6px]">
            {sites.map((x) => (
              <span key={x} className="inline-flex h-[26px] items-center gap-[4px] rounded-full bg-paper-deep pr-[4px] pl-[10px] font-mono text-[12px]">
                {x}
                <button type="button" aria-label={`Remove ${x}`} onClick={() => apply({ op: "set_spam", sites: sites.filter((y) => y !== x) })} className="inline-flex size-[18px] items-center justify-center rounded-full text-muted hover:bg-card hover:text-ink">
                  <Ic n="x" s={11} />
                </button>
              </span>
            ))}
            <input
              className={`${IN_FIT} w-[180px] font-mono text-[12px]`}
              placeholder="Add a site"
              aria-label="Add a site"
              value={site}
              onChange={(e) => (setSite(e.target.value), setBad(""))}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                const v = site.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
                if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v)) return setBad("Type a site like acme.com");
                if (!sites.includes(v)) apply({ op: "set_spam", sites: [...sites, v].slice(0, 20) });
                setSite("");
              }}
            />
          </div>
          {bad ? <span className="text-[12px] text-rose">{bad}</span> : <span className="text-[12px] text-muted">{sites.length ? "The link page always works. Fills from other sites go to Spam." : "Any site can show the form"}</span>}
        </div>
        <div className={CROW}>
          <RowText title="Most fills in an hour" />
          <input
            className={`${IN_FIT} w-[72px]`}
            inputMode="numeric"
            aria-label="Fills per hour"
            placeholder="Any"
            value={s.perHour ?? ""}
            onChange={(e) => {
              const n = parseInt(e.target.value.replace(/\D/g, ""), 10);
              apply({ op: "set_spam", perHour: Number.isFinite(n) && n > 0 ? Math.min(n, 10000) : null });
            }}
          />
        </div>
        <div className={CROW}>
          <RowText title="Faster than a person can type" sub={s.minSeconds > 0 ? `Spam when sent in under ${s.minSeconds} ${s.minSeconds === 1 ? "second" : "seconds"}` : "Off"} />
          <Seg label="Faster than a person can type" value={speed} onChange={(v) => apply({ op: "set_spam", minSeconds: Number(v) })} options={[{ value: "0", label: "Off" }, { value: "3", label: "3 s" }, { value: "5", label: "5 s" }]} />
        </div>
      </div>
      <div className={CARD}>
        <div className={CROW}>
          <RowText title="Spam this month" />
          <Badge tone="amber">{held.data ?? 0}</Badge>
          <button type="button" className={GHOST_SM} onClick={onReview}>
            Open Spam
          </button>
        </div>
      </div>
    </>
  );
}

function Data({ sb, session, form, apply, formId, subs, name }: Props) {
  const days = form.keep?.days ?? null;
  // Moved here from Share (docs/form-ui-plan.md step 3): ?email= and the rest fill those questions.
  const fill = allFields(form).filter((f) => f.type !== "hidden" && f.type !== "heading" && f.type !== "paragraph");
  const prefillOn = fill.length > 0 && fill.every((f) => f.prefill);
  const [error, setError] = useState("");
  const note = useNote();
  return (
    <>
      <H3>Data</H3>
      <Sub>How long answers are kept</Sub>
      <div className={CARD}>
        <div className={CROW}>
          <RowText title="Fill in from the link" sub="?email= and ?company= fill those questions" />
          <Tg label="Fill in from the link" on={prefillOn} onChange={(v) => apply(fill.map((f): Op => ({ op: "update_field", id: f.id, patch: { prefill: v || undefined } })), v ? "Questions fill in from the link" : "Questions start empty")} />
        </div>
        <div className={CROW}>
          <RowText title="Keep submissions" />
          <Seg label="Keep submissions" value={String(days ?? "forever")} onChange={(v) => apply({ op: "set_keep", keep: { days: v === "forever" ? null : Number(v) } })} options={[{ value: "30", label: "30 days" }, { value: "365", label: "1 year" }, { value: "1095", label: "3 years" }, { value: "forever", label: "Forever" }]} />
        </div>
        <div className={CROW}>
          <RowText title="Export every submission" />
          <button
            type="button"
            className={GHOST_SM}
            onClick={async () => {
              setError("");
              try {
                const res = await fetch(`/api/forms/${formId}/export?filters=${encodeURIComponent("{}")}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
                if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "The export didn't finish.");
                const a = document.createElement("a");
                a.href = URL.createObjectURL(await res.blob());
                a.download = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "answers.csv";
                a.click();
                note.show("Export started. It downloads in a moment.");
              } catch (e) {
                setError(errorText(e));
              }
            }}
          >
            <Ic n="down" />
            Export CSV
          </button>
        </div>
      </div>
      <ErrorNote message={error} />
      <div className={CARD}>
        <div className={CROW}>
          <RowText title="Delete every submission" sub={`${subs.toLocaleString("en-US")} ${subs === 1 ? "answer" : "answers"}`} />
          <button
            type="button"
            className={GHOST_SM_RED}
            onClick={async () => {
              const typed = await askText(`Delete every submission? All ${subs.toLocaleString("en-US")} go for good. Type the form's name to go ahead.`, { placeholder: name, ok: "Delete all" });
              if (!typed) return;
              if (typed.trim() !== name.trim()) return setError("The name didn't match, so nothing was deleted.");
              setError("");
              try {
                must(await sb.rpc("form_submissions_clear", { p_form: formId }));
                note.show("Every submission deleted");
              } catch (e) {
                setError(errorText(e));
              }
            }}
          >
            Delete all
          </button>
        </div>
      </div>
      {note.node}
    </>
  );
}
