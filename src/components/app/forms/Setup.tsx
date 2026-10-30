"use client";

// Settings (docs/forms-plan.md Part 6): a list on the left with icons (After submit, Team alerts, Auto-reply,
// Consent, Spam and security, Data), the one picked on the right. Every change is an op on the draft, so it saves,
// undoes and publishes like the rest of the form.

import { useState } from "react";
import { DEFAULT_NOTIFY, DEFAULT_REPLY, merge } from "@/lib/forms/notify";
import type { Op } from "@/lib/forms/ops";
import { REP, SCHEDULERS, WORK_EMAIL } from "@/lib/forms/schedule";
import { DEFAULT_CONSENT, type Form } from "@/lib/forms/schema";
import type { RouterBody } from "@/lib/router/types";
import { BrandLogo } from "../BrandLogo";
import { askText } from "../Dialogs";
import { Badge, ErrorNote, errorText, must, useLoad, type ViewProps } from "../ui";
import { Ic } from "./ic";
import { AREA, Box, CARD, CROW, CSTACK, Dd, GHOST_SM, GHOST_SM_RED, IN, IN_FIT, RowText, Seg, useNote, type DdItem, Tg } from "./parts";

export type SetupSub = "after" | "alerts" | "reply" | "consent" | "spam" | "data";

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
};

export function Setup(p: Props) {
  const { form, sub, setSub } = p;
  const items: [SetupSub, string, string, boolean?][] = [
    ["after", "check", "After submit"],
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
          {sub === "after" ? <After {...p} /> : sub === "alerts" ? <Alerts {...p} /> : sub === "reply" ? <Reply {...p} /> : sub === "consent" ? <Consent {...p} /> : sub === "spam" ? <Spam {...p} /> : <Data {...p} />}
        </div>
      </div>
    </div>
  );
}

const H3 = ({ children }: { children: React.ReactNode }) => <h3 className="m-0 text-[15px] font-semibold tracking-[-0.01em] text-ink">{children}</h3>;
const Sub = ({ children }: { children: React.ReactNode }) => <p className="-mt-[10px] mb-0 text-[12.5px] text-muted">{children}</p>;
const Label = ({ children }: { children: React.ReactNode }) => <label className="text-[12px] font-medium text-muted">{children}</label>;

/** The thank-you message as one box: the title, then a blank line and the rest. */
const messageText = (form: Form) => (form.after.end.kind === "message" ? [form.after.end.title, form.after.end.text].filter(Boolean).join("\n\n") : "");
const messageOp = (text: string): Op => {
  const [title, ...rest] = text.split(/\n\s*\n/);
  return { op: "set_after", end: { kind: "message", title: (title ?? "").trim() || "Thanks, we got it.", ...(rest.join("\n\n").trim() ? { text: rest.join("\n\n").trim() } : {}) } };
};

function After({ form, apply, types, routing }: Props) {
  const s = form.after.schedule;
  const end = form.after.end;
  const kind = s ? "book" : end.kind === "redirect" ? "url" : "msg";
  const active = types.filter((t) => t.active);
  const routed = !!routing;
  const [msg, setMsg] = useState(messageText(form));
  const lastMsg = end.kind === "message" ? end : { kind: "message" as const, title: "Thanks, we got it." };
  const pick = (k: "msg" | "url" | "book") => {
    if (k === kind) return;
    if (k === "book") apply([...(end.kind === "redirect" ? [{ op: "set_after" as const, end: lastMsg }] : []), { op: "set_schedule", schedule: { tool: "claritia", url: "", perOwner: false, ...(active[0] ? { meetingTypeId: active[0].id } : {}), ...(routed ? { who: "routed" as const, routeRules: [REP] } : {}) } }], "Books a meeting after the submit");
    else if (k === "url") apply([{ op: "set_schedule", schedule: null }, { op: "set_after", end: { kind: "redirect", url: end.kind === "redirect" ? end.url : "https://" } }], "Goes to a page after the submit");
    else apply([{ op: "set_schedule", schedule: null }, { op: "set_after", end: lastMsg }], "Shows a message after the submit");
  };
  const who = !s?.who ? "all" : s.who === "match" && s.rules?.length === 1 && s.rules[0]!.field === WORK_EMAIL && s.rules[0]!.op === "is" ? "work" : s.who === "routed" ? "routed" : "other";
  const setWho = (v: "all" | "work" | "routed") => {
    if (!s) return;
    const base = { ...s };
    delete base.who;
    delete base.rules;
    delete base.routeRules;
    delete base.any;
    apply({ op: "set_schedule", schedule: v === "all" ? base : v === "work" ? { ...base, who: "match", rules: [{ field: WORK_EMAIL, op: "is" }] } : { ...base, who: "routed", routeRules: [REP] } });
  };
  const type = s?.tool === "claritia" ? types.find((t) => t.id === s.meetingTypeId) : null;
  const typeLabel = (t: (typeof types)[number]) => `${t.name}${t.settings?.lengths?.[0] ? `, ${t.settings.lengths[0]} min` : ""}`;
  return (
    <>
      <H3>After submit</H3>
      <Sub>What people see once they send it</Sub>
      <div className="grid grid-cols-3 gap-[10px]">
        {(
          [
            ["msg", "msg", "Show a message"],
            ["url", "ext", "Go to a page"],
            ["book", "meet", "Book a meeting"],
          ] as const
        ).map(([v, i, l]) => (
          <button key={v} type="button" aria-pressed={kind === v} onClick={() => pick(v)} className={`flex flex-col items-start gap-[8px] rounded-[10px] border p-[10px] text-left transition-colors duration-[120ms] ${kind === v ? "border-ink ring-1 ring-ink" : "border-line hover:border-line-strong"}`}>
            <span className="inline-flex size-[30px] items-center justify-center rounded-lg bg-paper-deep text-body">
              <Ic n={i} />
            </span>
            <b className="text-[12.5px] font-medium text-ink">{l}</b>
          </button>
        ))}
      </div>
      {kind === "url" && end.kind === "redirect" ? (
        <div className={CARD}>
          <div className={CSTACK}>
            <Label>Page</Label>
            <input className={IN} value={end.url} onChange={(e) => apply({ op: "set_after", end: { kind: "redirect", url: e.target.value.trim() } })} />
            {/^https:\/\/[^/\s]+\.[^/\s]+/.test(end.url) ? null : <span className="text-[12px] text-rose">The page needs https://</span>}
          </div>
        </div>
      ) : null}
      {kind === "book" && s ? (
        <div className={CARD}>
          <div className={CSTACK}>
            <Label>Meeting</Label>
            <Dd
              ariaLabel="Meeting"
              label={type ? typeLabel(type) : s.tool !== "claritia" ? (SCHEDULERS.find((x) => x.value === s.tool)?.label ?? "Scheduler") : "Pick a meeting type"}
              items={active.length ? active.map((t): DdItem => ({ kind: "option", key: t.id, label: typeLabel(t), on: t.id === s.meetingTypeId, onPick: () => apply({ op: "set_schedule", schedule: { ...s, tool: "claritia", url: "", perOwner: false, meetingTypeId: t.id } }) })) : [{ kind: "option", key: "none", label: "No meeting types yet", why: " ", onPick: () => {} }]}
            />
            <span className="text-[12px] text-muted">A Routing rule&apos;s own meeting wins for its leads</span>
          </div>
          <div className={CSTACK}>
            <Label>Who sees times</Label>
            <Seg label="Who sees times" value={who === "other" ? "all" : who} onChange={setWho} options={[{ value: "all", label: "Everyone" }, { value: "work", label: "Work emails" }, { value: "routed", label: "Leads Routing gives a rep", disabled: !routing }]} />
          </div>
          <div className={CSTACK}>
            <Label>Times are for</Label>
            <span className="text-ink">{routing ? "The rep Routing picks" : "The meeting type's hosts"}</span>
          </div>
          <div className={CSTACK}>
            <Label>When there are no times</Label>
            <Seg label="When there are no times" value="message" onChange={() => {}} options={[{ value: "message", label: "Show the message" }, { value: "later", label: "Email times later", disabled: true }]} />
          </div>
        </div>
      ) : null}
      {kind !== "url" ? (
        <div className={CARD}>
          <div className={CSTACK}>
            <Label>{kind === "book" ? "Message for people who don't see times" : "Message"}</Label>
            <textarea
              className={AREA}
              rows={2}
              value={msg}
              onChange={(e) => {
                setMsg(e.target.value);
                apply(messageOp(e.target.value));
              }}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}

const EMAIL = /^[^\s@<>()",;:]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

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
          <RowText title="Post in Slack" sub={routing ? "Routing posts new leads in its channel already, with the rep" : "In the Routing channel"} />
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
                <Seg label="From" value={r.from} onChange={(v) => set({ from: v })} options={[{ value: "owner", label: "Their rep" }, { value: "team", label: ws.name }]} />
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
                <RowText title="Add a booking link" sub="To the meeting they were offered, with their rep. Left out once they book." />
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
          <div aria-label="Email preview" className="keep-light rounded-[10px] border border-line bg-paper-deep p-[14px] text-ink">
            <div className="mb-[10px] text-[12px] text-muted">
              {`From ${r.from === "owner" ? "their rep" : ws.name}`}
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
          <RowText title="Throwaway email addresses" sub={s.throwaway === "hold" ? "Held in Spam" : "Asked for an address they'll keep"} />
          <Seg label="Throwaway email addresses" value={s.throwaway === "hold" ? "hold" : "refuse"} onChange={(v) => apply({ op: "set_spam", throwaway: v })} options={[{ value: "refuse", label: "Refuse" }, { value: "hold", label: "Hold" }]} />
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
          {bad ? <span className="text-[12px] text-rose">{bad}</span> : <span className="text-[12px] text-muted">{sites.length ? "The link page always works. Fills from other sites are held." : "Any site can show the form"}</span>}
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
          <RowText title="Faster than a person can type" sub={s.minSeconds > 0 ? `Held when sent in under ${s.minSeconds} ${s.minSeconds === 1 ? "second" : "seconds"}` : "Off"} />
          <Seg label="Faster than a person can type" value={speed} onChange={(v) => apply({ op: "set_spam", minSeconds: Number(v) })} options={[{ value: "0", label: "Off" }, { value: "3", label: "3 s" }, { value: "5", label: "5 s" }]} />
        </div>
      </div>
      <div className={CARD}>
        <div className={CROW}>
          <RowText title="Held this month" sub="Held fills make no contact, alert or email" />
          <Badge tone="amber">{held.data ?? 0}</Badge>
          <button type="button" className={GHOST_SM} onClick={onReview}>
            Review
          </button>
        </div>
      </div>
    </>
  );
}

function Data({ sb, session, form, apply, formId, subs, name }: Props) {
  const days = form.keep?.days ?? null;
  const [error, setError] = useState("");
  const note = useNote();
  return (
    <>
      <H3>Data</H3>
      <Sub>How long answers are kept</Sub>
      <div className={CARD}>
        <div className={CROW}>
          <RowText title="Keep submissions" />
          <Seg label="Keep submissions" value={String(days ?? "forever")} onChange={(v) => apply({ op: "set_keep", keep: { days: v === "forever" ? null : Number(v) } })} options={[{ value: "30", label: "30 days" }, { value: "365", label: "1 year" }, { value: "1095", label: "3 years" }, { value: "forever", label: "Forever" }]} />
        </div>
        <div className={CROW}>
          <RowText title="Contacts stay when answers go" sub="Their fields keep the saved values" />
          <Tg label="Contacts stay when answers go" on disabled onChange={() => {}} />
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
              const typed = await askText(`Delete every submission? All ${subs.toLocaleString("en-US")} go for good. Contacts stay. Type the form's name to go ahead.`, { placeholder: name, ok: "Delete all" });
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
