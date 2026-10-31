"use client";

// On Submission (the approved demo): what happens after someone sends the form, edited on Build. The canvas shows the
// path as Form → On Submission → what the visitor sees, joined by the one arrow (`Arrow`, also in every If → Then row
// and Otherwise). The panel picks Show a message, Go to a page or Book a meeting; a meeting has its If → Then list
// right there (src/lib/routing/formRules.ts through useFormRouting), Otherwise, and Try a lead, which lights the row a
// lead with those answers takes. No rule is named; a row is its conditions.

import { useMemo, useState } from "react";
import { countryNames } from "@/lib/forms/countries";
import { localZone, zoneName } from "@/lib/forms/calendar";
import type { Op } from "@/lib/forms/ops";
import type { Form } from "@/lib/forms/schema";
import { countryName, type FieldDef } from "@/lib/router/conditions";
import { blankCond, matchRow, newRow, rowProblem, testsFor, type Row, type Then } from "@/lib/routing/formRules";
import { fieldOf } from "@/lib/routing/screenModel";
import type { Cond } from "@/lib/router/types";
import type { Location } from "@/lib/meetings/types";
import { Chip } from "../scheduling/panel";
import { Badge, ErrorNote, errorText, type ViewProps } from "../ui";
import type { TypeRow } from "../meetings/TypesList";
import { isOwn, makeOwnMeeting, noticeWords, placeLabel, PLACES, useOwnMeeting } from "./FormMeeting";
import { Ic } from "./ic";
import { Menu } from "./Menu";
import { AREA, Dd, Dots, GHOST_SM, IB_SM, IN, IN_SM, Seg, Tg, type DdItem } from "./parts";
import { typeLabel } from "./routes";
import type { FormRouting } from "./useFormRouting";

type Types = TypeRow[];
export type Outcome = "msg" | "url" | "book";
/** Try a lead: the answers typed in, or null when it's closed. */
export type Trial = Record<string, string> | null;

export const outcomeOf = (form: Form): Outcome => (form.after.schedule ? "book" : form.after.end.kind === "redirect" ? "url" : "msg");

/** The one arrow: "this leads to that". */
export function Arrow({ className = "text-faint" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 22 12" className={`h-[12px] w-[22px] shrink-0 ${className}`} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 6h19M15 1.5 20 6l-5 4.5" />
    </svg>
  );
}

/** The arrow between two cards on the canvas, pointing down. */
export function ArrowDown() {
  return (
    <span aria-hidden="true" className="flex h-[40px] flex-col items-center text-line-strong">
      <i className="w-[1.5px] flex-1 rounded-full bg-current" />
      <svg viewBox="0 0 12 9" className="-mt-[6px] h-[9px] w-[12px]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1.5 2 6 7l4.5-5" />
      </svg>
    </span>
  );
}

const teamOf = (r: FormRouting, key: string) => r.teams.find((t) => t.keys.includes(key));

/** Who a Then names, in words. */
export function whoName(t: Then, r: FormRouting): string {
  if (!t) return "";
  if (t.kind === "owner") return "Company owner";
  if (t.kind === "person") return r.people.find((p) => p.id === t.id)?.name ?? "Former teammate";
  return teamOf(r, t.key)?.name ?? "Removed team";
}

function valueWords(c: Cond, f: FieldDef): string {
  const v = Array.isArray(c.value) ? c.value[0] : c.value;
  return v === undefined || v === "" ? "…" : f.type === "country" ? countryName(String(v)) : String(v);
}

/** A condition in short words for the canvas: "Country is United States". */
function condWords(c: Cond, fields: FieldDef[]): string {
  const f = fieldOf(c.field, fields);
  return `${f.label} ${testsFor(f).find((o) => o.value === c.op)?.label ?? c.op} ${valueWords(c, f)}`;
}

/** The fields a row can test: the router's, without the ones that need setup in Routing. */
function usable(fields: FieldDef[]): FieldDef[] {
  return fields.filter((f) => f.type !== "bool" && f.key !== "company.type" && f.key !== "lead.form" && (f.type !== "choice" || (f.options?.length ?? 0) > 0));
}

// The canvas -----------------------------------------------------------------------------------------------------------

/** The On Submission card on the canvas, in Claritia's look. */
export function SubmitNode({ form, types, routing, trial, picked, onPick }: { form: Form; types: Types; routing: FormRouting; trial: Trial; picked: boolean; onPick: () => void }) {
  const kind = outcomeOf(form);
  const hit = trial && routing.body ? matchRow(routing.body, routing.rows, trial, routing.fields, routing.teamKeys) : null;
  const meeting = types.find((t) => t.id === form.after.schedule?.meetingTypeId);
  return (
    <button
      type="button"
      onClick={(e) => (e.stopPropagation(), onPick())}
      aria-pressed={picked}
      className={`relative w-[340px] max-w-full rounded-[10px] border bg-card text-left font-sans text-[13px] text-body transition-colors duration-[120ms] ${picked ? "border-ink ring-1 ring-ink" : "border-line hover:border-line-strong"}`}
    >
      <span className="flex items-center gap-[8px] border-b border-line px-[12px] py-[10px] font-semibold text-ink">
        <Arrow className="text-ink" />
        On Submission
      </span>
      <span className="flex flex-col gap-[6px] px-[12px] pt-[10px] pb-[12px]">
        <span className="flex items-center gap-[6px] font-medium text-ink">
          <Ic n={kind === "book" ? "meet" : kind === "url" ? "ext" : "msg"} />
          {kind === "book" ? "Book a meeting" : kind === "url" ? "Go to a page" : "Show a message"}
          {kind === "book" && meeting ? <span className="truncate font-normal text-muted">{meeting.name}</span> : null}
        </span>
        {kind === "msg" ? <span className="truncate rounded-md bg-paper px-[8px] py-[6px] text-[12px]">{form.after.end.kind === "message" ? form.after.end.title : ""}</span> : null}
        {kind === "url" ? <span className="truncate rounded-md bg-paper px-[8px] py-[6px] text-[12px]">{form.after.end.kind === "redirect" ? form.after.end.url : ""}</span> : null}
        {kind === "book" && form.after.schedule?.tool === "claritia" && routing.body ? (
          <>
            {routing.rows.map((r, i) => (
              <span
                key={r.id}
                className={`grid grid-cols-[minmax(0,1fr)_auto_minmax(0,auto)] items-center gap-[6px] rounded-md px-[8px] py-[6px] text-[12px] ${hit === i ? "bg-signal-soft" : "bg-paper"}`}
              >
                <span className="min-w-0 text-muted">{`If ${r.conds.map((c) => condWords(c, routing.fields)).join(" and ")}`}</span>
                <Arrow className={hit === i ? "text-signal" : "text-faint"} />
                <span className="truncate font-medium text-ink">{whoName(r.then, routing) || "…"}</span>
              </span>
            ))}
            <span className={`grid grid-cols-[minmax(0,1fr)_auto_minmax(0,auto)] items-center gap-[6px] rounded-md px-[8px] py-[6px] text-[12px] ${hit === -1 ? "bg-signal-soft" : "bg-paper"}`}>
              <span className="text-muted">Otherwise</span>
              <Arrow className={hit === -1 ? "text-signal" : "text-faint"} />
              <span className="truncate font-medium text-ink">{whoName(routing.otherwise, routing) || "…"}</span>
            </span>
          </>
        ) : null}
      </span>
    </button>
  );
}

const sampleTimes = () => ["9:00", "9:30", "10:30", "1:00", "2:30", "4:00"];
const initials = (n: string) =>
  n
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

/** What the visitor sees after sending it, in the brand's look (the canvas sets the --b-* values). */
export function SubmitResult({ form, types, routing, trial }: { form: Form; types: Types; routing: FormRouting; trial: Trial }) {
  const kind = outcomeOf(form);
  const end = form.after.end;
  const check = (
    <span className="inline-flex size-[36px] items-center justify-center rounded-full bg-[var(--b-soft)] text-[var(--b-acc)]">
      <Ic n="check" s={18} />
    </span>
  );
  const h2 = (t: string) => <h2 className="m-0 font-[family-name:var(--b-hfont)] text-[20px] leading-[1.2] font-semibold tracking-[-0.02em]">{t}</h2>;
  if (kind === "url")
    return (
      <div className="flex flex-col items-start gap-[10px]">
        <span className="flex h-[30px] w-full items-center gap-[8px] rounded-full bg-[var(--b-soft)] px-[12px] text-[12px] text-[var(--b-muted)]">
          <Ic n="lock" s={12} />
          <span className="truncate">{end.kind === "redirect" ? end.url.replace(/^https?:\/\//, "") : ""}</span>
        </span>
        <i className="block h-[10px] w-[70%] rounded-[3px] bg-[var(--b-soft)]" />
        <i className="block h-[10px] w-[90%] rounded-[3px] bg-[var(--b-soft)]" />
        <i className="block h-[64px] w-full rounded-[var(--b-r)] bg-[var(--b-soft)]" />
      </div>
    );
  if (kind === "msg")
    return (
      <div className="flex flex-col items-start gap-[10px]">
        {check}
        {h2(end.kind === "message" ? end.title : "")}
        {end.kind === "message" && end.text ? <p className="m-0 text-[var(--b-muted)]">{end.text}</p> : null}
      </div>
    );
  const s = form.after.schedule!;
  const meeting = types.find((t) => t.id === s.meetingTypeId);
  const hit = trial && routing.body ? matchRow(routing.body, routing.rows, trial, routing.fields, routing.teamKeys) : null;
  const then = hit === null ? (routing.rows[0]?.then ?? routing.otherwise) : hit >= 0 ? routing.rows[hit]!.then : routing.otherwise;
  const team = then?.kind === "team" ? teamOf(routing, then.key) : undefined;
  const repId = then?.kind === "person" ? then.id : team ? team.members.slice().sort((a, b) => a.position - b.position)[team.next % Math.max(1, team.members.length)]?.user : undefined;
  const rep = s.tool === "claritia" ? (repId ? routing.people.find((p) => p.id === repId)?.name : then?.kind === "owner" ? "Their rep" : undefined) : undefined;
  return (
    <div className="flex flex-col items-start gap-[12px]">
      {h2(s.heading || "Pick a time")}
      {rep ? (
        <div className="flex w-full items-center gap-[10px] rounded-[var(--b-r)] bg-[var(--b-soft)] p-[10px]">
          <span aria-hidden="true" className="inline-flex size-[34px] shrink-0 items-center justify-center rounded-full bg-[var(--b-acc)] text-[12px] font-semibold text-[var(--b-on)]">
            {initials(rep)}
          </span>
          <span className="flex flex-col leading-[1.3]">
            <b className="text-[14px] font-semibold">{rep}</b>
            <span className="text-[12.5px] text-[var(--b-muted)]">{typeLabel(meeting)}</span>
          </span>
        </div>
      ) : null}
      <p className="m-0 text-[13px] text-[var(--b-muted)]">{`Times in your zone, ${zoneName(localZone())}.`}</p>
      <div className="grid w-full grid-cols-3 gap-[6px]">
        {sampleTimes().map((t, i) => (
          <span
            key={t}
            className={`flex h-[36px] items-center justify-center rounded-[var(--b-btn-r)] text-[13px] ${i === 2 ? "bg-[var(--b-acc)] text-[var(--b-on)]" : "border border-[var(--b-line)] text-[var(--b-acc)]"}`}
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

// The panel ------------------------------------------------------------------------------------------------------------

type PanelProps = Pick<ViewProps, "navigate" | "session" | "ws"> & {
  form: Form;
  formId: string;
  /** Read the meeting types again, after the form's own meeting is made or saved. */
  reloadTypes: () => void;
  apply: (ops: Op | Op[], words?: string) => boolean;
  types: Types;
  routing: FormRouting;
  trial: Trial;
  setTrial: (t: Trial) => void;
};

const Label = ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) => (
  <label htmlFor={htmlFor} className="text-[12px] font-medium text-muted">
    {children}
  </label>
);

/** A section of the panel that opens and closes: icon, title and a one-line summary, the body full width. */
function Fold({ icon, title, summary, open, onToggle, children }: { icon: string; title: string; summary: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <section className="border-b border-line">
      <button type="button" aria-expanded={open} onClick={onToggle} className="flex min-h-[58px] w-full items-center gap-[12px] px-[20px] py-[9px] text-left transition-colors duration-[120ms] hover:bg-paper">
        <span className={`flex size-[30px] shrink-0 items-center justify-center rounded-lg transition-colors duration-[120ms] ${open ? "bg-ink text-card" : "bg-paper-deep text-body"}`}>
          <Ic n={icon} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[13px] font-medium text-ink">{title}</span>
          <span className="truncate text-[12px] text-muted">{summary}</span>
        </span>
        <Ic n="chev" className={`text-faint transition-transform duration-[200ms] ease-out ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? <div className="anim-rise-sm flex flex-col gap-[14px] px-[20px] pt-[2px] pb-[18px]">{children}</div> : null}
    </section>
  );
}

export function OnSubmissionPanel(p: PanelProps) {
  const { form, apply, types, routing } = p;
  const kind = outcomeOf(form);
  const end = form.after.end;
  const lastMsg = end.kind === "message" ? end : { kind: "message" as const, title: "Thanks, we got it." };
  const [error, setError] = useState("");

  const pick = async (k: Outcome) => {
    if (k === kind) return;
    if (k === "book") {
      // A new booking starts on the form's own meeting, made the first time.
      setError("");
      let meeting = types.find((t) => isOwn(t, p.formId))?.id ?? null;
      if (!meeting) {
        try {
          meeting = await makeOwnMeeting(p.session, p.ws.id, p.formId);
          p.reloadTypes();
        } catch (e) {
          setError(errorText(e));
          return;
        }
      }
      apply([...(end.kind === "redirect" ? [{ op: "set_after" as const, end: lastMsg }] : []), { op: "set_schedule", schedule: { tool: "claritia", url: "", perOwner: false, meetingTypeId: meeting } }], "Books a meeting");
      void routing.stage(true, meeting);
    } else {
      apply([{ op: "set_schedule", schedule: null }, { op: "set_after", end: k === "url" ? { kind: "redirect", url: end.kind === "redirect" ? end.url : "https://" } : lastMsg }], k === "url" ? "Goes to a page" : "Shows a message");
      void routing.stage(false, null);
    }
  };

  const choice = (v: Outcome, icon: string, label: string) => (
    <button
      key={v}
      type="button"
      aria-pressed={kind === v}
      onClick={() => void pick(v)}
      className={`flex min-w-0 flex-col items-start gap-[8px] rounded-[10px] border p-[10px] text-left text-[12.5px] font-medium text-ink transition-colors duration-[120ms] ${kind === v ? "border-ink ring-1 ring-ink" : "border-line hover:border-line-strong"}`}
    >
      <span className={`inline-flex size-[28px] items-center justify-center rounded-lg ${kind === v ? "bg-ink text-card" : "bg-paper-deep text-body"}`}>
        <Ic n={icon} />
      </span>
      {label}
    </button>
  );

  const message = (
    <>
      <div className="flex flex-col gap-[6px]">
        <Label htmlFor="os-title">Title</Label>
        <input id="os-title" className={IN} value={lastMsg.title} onChange={(e) => apply({ op: "set_after", end: { ...lastMsg, title: e.target.value } })} onBlur={(e) => !e.target.value.trim() && apply({ op: "set_after", end: { ...lastMsg, title: "Thanks, we got it." } })} />
      </div>
      <div className="flex flex-col gap-[6px]">
        <Label htmlFor="os-text">Message</Label>
        <textarea id="os-text" className={AREA} rows={3} value={end.kind === "message" ? (end.text ?? "") : ""} onChange={(e) => apply({ op: "set_after", end: { kind: "message", title: lastMsg.title, ...(e.target.value ? { text: e.target.value } : {}) } })} />
      </div>
    </>
  );

  return (
    <aside aria-label="On Submission" className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-[10px] border-b border-line px-[20px] pt-[14px] pb-[12px]">
        <span className="inline-flex size-[30px] items-center justify-center rounded-lg bg-paper-deep">
          <Arrow className="text-ink" />
        </span>
        <b className="text-[16px] font-semibold tracking-[-0.015em] text-ink">On Submission</b>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-[28px]">
        <div className="flex flex-col gap-[16px] border-b border-line px-[20px] py-[16px]">
          <div className="grid grid-cols-3 gap-[8px]">
            {choice("msg", "msg", "Show a message")}
            {choice("url", "ext", "Go to a page")}
            {choice("book", "meet", "Book a meeting")}
          </div>
          {error ? <ErrorNote message={error} /> : null}
          {kind === "url" && end.kind === "redirect" ? (
            <div className="flex flex-col gap-[6px]">
              <Label htmlFor="os-url">Page</Label>
              <input id="os-url" className={IN} value={end.url} onChange={(e) => apply({ op: "set_after", end: { kind: "redirect", url: e.target.value.trim() } })} />
              {/^https:\/\/[^/\s]+\.[^/\s]+/.test(end.url) ? null : <span className="text-[12px] text-rose">The page needs https://</span>}
            </div>
          ) : null}
          {kind === "msg" ? message : null}
        </div>
        {kind === "book" && form.after.schedule ? <Booking {...p} message={message} /> : null}
      </div>
    </aside>
  );
}

const NOTICE = [60, 240, 1440, 2880];
const WINDOW = [7, 14, 30, 60, 90];
const AFTER = [0, 5, 10, 15, 30];
const PER_DAY = [0, 2, 4, 6, 8, 10];

function Booking(p: PanelProps & { message: React.ReactNode }) {
  const { form, apply, types, routing, navigate } = p;
  const s = form.after.schedule!;
  const [open, setOpen] = useState<Set<string>>(() => new Set(["who", "meeting"]));
  const [error, setError] = useState("");
  const toggle = (k: string) => setOpen((o) => (o.has(k) ? new Set([...o].filter((x) => x !== k)) : new Set([...o, k])));
  const row = s.tool === "claritia" ? (types.find((t) => t.id === s.meetingTypeId) ?? null) : null;
  const own = row && isOwn(row, p.formId) ? row : null;
  const m = useOwnMeeting(p.session, p.ws.id, own, p.reloadTypes);
  const d = own ? (m.draft ?? own) : null;
  const ds = d?.settings;
  const standalone = types.filter((t) => t.active && !t.settings?.form);

  const setMeeting = (id: string) => {
    apply({ op: "set_schedule", schedule: { ...s, tool: "claritia", url: "", perOwner: false, meetingTypeId: id } }, "Changed the meeting");
    void routing.stage(true, id);
  };
  const pickOwn = async () => {
    setError("");
    try {
      const have = types.find((t) => isOwn(t, p.formId))?.id ?? (await makeOwnMeeting(p.session, p.ws.id, p.formId));
      if (!types.some((t) => t.id === have)) p.reloadTypes();
      setMeeting(have);
    } catch (e) {
      setError(errorText(e));
    }
  };
  const items: DdItem[] = [
    { kind: "option", key: "own", label: "This form's own", on: !!own, onPick: () => void pickOwn() },
    ...(standalone.length ? [{ kind: "group" as const, label: "Standalone meetings" }] : []),
    ...standalone.map((t): DdItem => ({ kind: "option", key: t.id, label: t.name, hint: t.settings?.lengths?.length ? `${t.settings.lengths.join(", ")} min` : undefined, on: t.id === s.meetingTypeId, onPick: () => setMeeting(t.id) })),
    { kind: "add", key: "new", label: "New meeting", onPick: () => navigate("scheduling", "types/new") },
  ];
  const pickNumber = (label: string, values: number[], value: number, words: (n: number) => string, set: (n: number) => void) => (
    <div className="flex min-w-0 flex-col gap-[6px]">
      <Label>{label}</Label>
      <Dd ariaLabel={label} label={words(value)} items={values.map((n): DdItem => ({ kind: "option", key: String(n), label: words(n), on: n === value, onPick: () => set(n) }))} />
    </div>
  );
  const inMeetings = row && !own ? (
    <div className="flex items-center gap-[8px] text-[12.5px] text-muted">
      <span className="flex-1">Set in Meetings</span>
      <button type="button" className={GHOST_SM} onClick={() => navigate("scheduling", `types/${row.id}`)}>
        <Ic n="ext" s={12} />
        Edit in Meetings
      </button>
    </div>
  ) : null;
  const reminderOn = (min: number) => !!ds?.reminders.includes(min);
  const setReminder = (min: number, on: boolean) => ds && m.change({ settings: { reminders: on ? [...new Set([...ds.reminders, min])].sort((a, b) => b - a) : ds.reminders.filter((x) => x !== min) } });

  return (
    <>
      {s.tool === "claritia" ? (
        <Fold icon="user" title="Who they meet" summary={routing.rows.length ? `${routing.rows.length} ${routing.rows.length === 1 ? "if" : "ifs"}, then Otherwise` : "Otherwise"} open={open.has("who")} onToggle={() => toggle("who")}>
          <WhoTheyMeet {...p} />
        </Fold>
      ) : null}
      <Fold icon="meet" title="Meeting" summary={d ? `${d.name}, ${ds!.lengths.join(" or ")} min, ${placeLabel(ds!.location)}` : row ? typeLabel(row) : "Pick a meeting"} open={open.has("meeting")} onToggle={() => toggle("meeting")}>
        <div className="flex flex-col gap-[6px]">
          <Label>Meeting</Label>
          <Dd ariaLabel="Meeting" label={own ? "This form's own" : row ? row.name : <span className="text-faint">Pick a meeting</span>} items={items} />
        </div>
        {error || m.error ? <ErrorNote message={error || m.error} /> : null}
        {d && ds ? (
          <>
            <div className="flex flex-col gap-[6px]">
              <Label htmlFor="os-mname">Name</Label>
              <input id="os-mname" className={IN} value={d.name} maxLength={120} onChange={(e) => m.change({ name: e.target.value })} onBlur={(e) => !e.target.value.trim() && m.change({ name: "Intro call" })} />
            </div>
            <div className="flex flex-col gap-[6px]">
              <Label>Length</Label>
              <div className="flex flex-wrap gap-[6px]">
                {[15, 30, 45, 60].map((n) => {
                  const on = ds.lengths.includes(n);
                  return (
                    <Chip key={n} on={on} onClick={() => m.change({ settings: { lengths: on ? (ds.lengths.length > 1 ? ds.lengths.filter((x) => x !== n) : ds.lengths) : [...ds.lengths, n].sort((a, b) => a - b) } })}>
                      {`${n} min`}
                    </Chip>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-col gap-[6px]">
              <Label>Where</Label>
              <div className="flex flex-wrap gap-[6px]">
                {PLACES.map((x) => (
                  <Chip key={x.kind} on={ds.location.kind === x.kind} onClick={() => m.change({ settings: { location: { kind: x.kind } as Location } })}>
                    <Ic n={x.icon} s={12} />
                    {x.label}
                  </Chip>
                ))}
              </div>
            </div>
            {m.saving ? <span className="text-[12px] text-faint">Saving</span> : null}
          </>
        ) : row ? (
          <span className="text-[12.5px] text-muted">{`${typeLabel(row)}, ${placeLabel(row.settings?.location)}`}</span>
        ) : null}
        {inMeetings}
      </Fold>
      <Fold icon="clock" title="When they can book" summary={ds ? `${noticeWords(ds.notice)} ahead, up to ${ds.window} days` : "Set in Meetings"} open={open.has("when")} onToggle={() => toggle("when")}>
        {ds ? (
          <>
            <div className="grid grid-cols-2 gap-[10px] max-[480px]:grid-cols-1">
              {pickNumber("Earliest booking", NOTICE, ds.notice, (n) => `${noticeWords(n)} ahead`, (n) => m.change({ settings: { notice: n } }))}
              {pickNumber("Booking window", WINDOW, ds.window, (n) => `${n} days`, (n) => m.change({ settings: { window: n } }))}
              {pickNumber("Free time after", AFTER, ds.bufferAfter, (n) => (n ? `${n} min` : "None"), (n) => m.change({ settings: { bufferAfter: n } }))}
              {pickNumber("Daily limit", PER_DAY, ds.perDay, (n) => (n ? `${n} a day` : "No limit"), (n) => m.change({ settings: { perDay: n } }))}
            </div>
            <div className="flex items-center gap-[8px]">
              <span className="flex-1 text-ink">Hours</span>
              <span className="text-[12.5px] text-muted">Each rep&apos;s own</span>
              <button type="button" className={GHOST_SM} onClick={() => navigate("scheduling", "availability/team")}>
                <Ic n="clock" s={12} />
                Team hours
              </button>
            </div>
          </>
        ) : (
          inMeetings
        )}
      </Fold>
      <Fold icon="bell" title="Emails and reminders" summary={ds ? `${ds.reminders.length} ${ds.reminders.length === 1 ? "reminder" : "reminders"}` : "Set in Meetings"} open={open.has("mail")} onToggle={() => toggle("mail")}>
        {ds ? (
          <>
            <Line label="Reminder 24 hours before">
              <Tg label="Reminder 24 hours before" on={reminderOn(1440)} onChange={(v) => setReminder(1440, v)} />
            </Line>
            <Line label="Reminder 1 hour before">
              <Tg label="Reminder 1 hour before" on={reminderOn(60)} onChange={(v) => setReminder(60, v)} />
            </Line>
            <Line label="Email after a no-show">
              <Tg label="Email after a no-show" on={ds.noShowFollowUp} onChange={(v) => m.change({ settings: { noShowFollowUp: v } })} />
            </Line>
          </>
        ) : (
          inMeetings
        )}
      </Fold>
      <Fold icon="msg" title="When no times are open" summary={s.none === "later" ? "Email times later" : "Show the message"} open={open.has("none")} onToggle={() => toggle("none")}>
        <Seg
          label="When no times are open"
          value={s.none === "later" ? "later" : "message"}
          onChange={(v) => {
            const next = { ...s };
            if (v === "later") next.none = "later";
            else delete next.none;
            apply({ op: "set_schedule", schedule: next });
          }}
          options={[
            { value: "message", label: "Show the message" },
            { value: "later", label: "Email times later" },
          ]}
        />
        {p.message}
      </Fold>
    </>
  );
}

const Line = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex min-h-[28px] items-center justify-between gap-[12px] text-[13px] text-ink">
    <span className="min-w-0">{label}</span>
    {children}
  </div>
);

function WhoTheyMeet(p: PanelProps) {
  const { routing: r, trial, setTrial } = p;
  const [more, setMore] = useState<{ el: HTMLElement; i: number } | null>(null);
  const [q, setQ] = useState("");
  const fields = useMemo(() => usable(r.fields), [r.fields]);
  if (r.loadError && !r.ready) return <ErrorNote message={r.loadError} />;
  if (!r.ready) return <Dots />;
  const rows = r.rows;
  const hit = trial && r.body ? matchRow(r.body, rows, trial, r.fields, r.teamKeys) : null;
  const ro = !r.owner;
  const set = (i: number, row: Row) => r.setRows(rows.map((x, n) => (n === i ? row : x)));
  const first = fields.find((f) => f.key === "lead.country") ?? fields[0];

  const thenItems = (cur: Then, set: (t: Then) => void, owner: boolean): DdItem[] => [
    ...(r.teams.some((t) => t.keys.length) ? [{ kind: "group" as const, label: "Teams" }] : []),
    ...r.teams
      .filter((t) => t.keys.length)
      .map(
        (t): DdItem => ({
          kind: "option",
          key: `t:${t.id}`,
          label: t.name,
          hint: "Take turns",
          on: cur?.kind === "team" && t.keys.includes(cur.key),
          onPick: () => set({ kind: "team", key: t.keys[0]! }),
        }),
      ),
    { kind: "group", label: "People" },
    ...r.people.map(
      (x): DdItem => ({
        kind: "option",
        key: `p:${x.id}`,
        label: x.name,
        on: cur?.kind === "person" && cur.id === x.id,
        onPick: () => set({ kind: "person", id: x.id }),
      }),
    ),
    ...(owner
      ? [
          { kind: "group" as const, label: " " },
          {
            kind: "option" as const,
            key: "owner",
            label: "Company owner",
            on: cur?.kind === "owner",
            onPick: () => set({ kind: "owner" }),
          },
        ]
      : []),
  ];

  // Try a lead: the fields the rows test, typed in.
  const tested = [...new Set(rows.flatMap((x) => x.conds.map((c) => c.field)))].map((k) => fieldOf(k, r.fields)).slice(0, 6);
  const whoHit = hit === null ? null : hit >= 0 ? rows[hit]!.then : r.otherwise;

  return (
    <div className="flex flex-col gap-[8px]">
      <div className="flex items-center justify-between gap-[8px]">
        <Label>Who they meet</Label>
        <span className="flex items-center gap-[8px]">
          {r.save === "saving" ? <span className="text-[12px] text-faint">Saving</span> : null}
          <button
            type="button"
            aria-pressed={!!trial}
            className={trial ? GHOST_SM.replace("border-line bg-card", "border-ink bg-ink").replace("text-body", "text-card") : GHOST_SM}
            onClick={() => setTrial(trial ? null : {})}
          >
            <Ic n="flow" s={12} />
            Try a lead
          </button>
        </span>
      </div>
      {r.error ? <ErrorNote message={r.error} /> : null}
      {trial ? (
        <div className="flex flex-col gap-[10px] rounded-[10px] border border-dashed border-line-strong p-[10px]">
          <div className="grid grid-cols-2 gap-[8px] max-[480px]:grid-cols-1">
            {tested.length ? (
              tested.map((f) => (
                <div key={f.key} className="flex min-w-0 flex-col gap-[4px]">
                  <Label>{f.label}</Label>
                  <ValueInput field={f} value={trial[f.key] ?? ""} onChange={(v) => setTrial({ ...trial, [f.key]: String(v) })} search={q} onSearch={setQ} />
                </div>
              ))
            ) : (
              <span className="text-[12.5px] text-muted">Add an If first</span>
            )}
          </div>
          {whoHit !== null ? (
            <span className="flex items-center gap-[8px] font-medium text-ink">
              <Arrow className="text-signal" />
              {whoName(whoHit, r) || "…"}
              {whoHit?.kind === "team" ? <span className="font-normal text-muted">Takes turns</span> : null}
            </span>
          ) : null}
        </div>
      ) : null}

      {rows.map((row, i) => {
        const problem = rowProblem(row, r.fields, r.teamKeys);
        const on = hit === i;
        return (
          <div key={row.id} className={`flex flex-col gap-[8px] rounded-[10px] border p-[10px] transition-colors duration-[200ms] ${on ? "border-signal-line bg-signal-soft" : "border-line"}`}>
            {row.conds.map((c, ci) => {
              const f = fieldOf(c.field, r.fields);
              const tests = testsFor(f);
              return (
                <div key={ci} className="grid grid-cols-[30px_minmax(0,1fr)_auto_minmax(0,1fr)_24px] items-center gap-[5px]">
                  <span className={`text-[12.5px] ${ci ? "font-medium text-muted" : "font-semibold text-ink"}`}>{ci ? "and" : "If"}</span>
                  {ro ? (
                    <span className="truncate text-ink">{f.label}</span>
                  ) : (
                    <Dd
                      sm
                      ariaLabel="Field"
                      label={f.label}
                      menuWidth={240}
                      search={q}
                      onSearch={setQ}
                      items={groupItems(
                        fields,
                        (nf) =>
                          set(i, {
                            ...row,
                            conds: row.conds.map((x, n) => (n === ci ? blankCond(nf) : x)),
                          }),
                        c.field,
                      )}
                    />
                  )}
                  <span className="w-[96px]">
                    {ro ? (
                      <span className="text-muted">{tests.find((o) => o.value === c.op)?.label}</span>
                    ) : (
                      <Dd
                        sm
                        ariaLabel="Test"
                        label={tests.find((o) => o.value === c.op)?.label ?? c.op}
                        items={tests.map(
                          (o): DdItem => ({
                            kind: "option",
                            key: o.value,
                            label: o.label,
                            on: o.value === c.op,
                            onPick: () =>
                              set(i, {
                                ...row,
                                conds: row.conds.map((x, n) => (n === ci ? { ...x, op: o.value } : x)),
                              }),
                          }),
                        )}
                      />
                    )}
                  </span>
                  {ro ? (
                    <span className="truncate text-ink">{valueWords(c, f)}</span>
                  ) : (
                    <ValueInput
                      field={f}
                      value={Array.isArray(c.value) ? (c.value[0] ?? "") : (c.value ?? "")}
                      onChange={(v) =>
                        set(i, {
                          ...row,
                          conds: row.conds.map((x, n) => (n === ci ? { ...x, value: v } : x)),
                        })
                      }
                      search={q}
                      onSearch={setQ}
                    />
                  )}
                  {!ro && row.conds.length > 1 ? (
                    <button
                      type="button"
                      className={IB_SM}
                      aria-label="Remove this and"
                      title="Remove"
                      onClick={() =>
                        set(i, {
                          ...row,
                          conds: row.conds.filter((_, n) => n !== ci),
                        })
                      }
                    >
                      <Ic n="x" s={12} />
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
              );
            })}
            {ro ? null : (
              <button
                type="button"
                className="ml-[30px] h-[22px] self-start rounded-full px-[8px] text-[12px] font-medium text-muted hover:bg-hover hover:text-ink"
                onClick={() =>
                  first &&
                  set(i, {
                    ...row,
                    conds: [...row.conds, blankCond(fields.find((f) => !row.conds.some((c) => c.field === f.key)) ?? first)],
                  })
                }
              >
                + and
              </button>
            )}
            <div className="flex items-center gap-[8px] pl-[35px]">
              <Arrow className={on ? "text-signal" : "text-ink"} />
              {ro ? (
                <span className="flex-1 font-medium text-ink">{whoName(row.then, r)}</span>
              ) : (
                <Dd
                  sm
                  ariaLabel="Then"
                  label={row.then ? whoName(row.then, r) : <span className="text-faint">Pick who</span>}
                  items={thenItems(row.then, (t) => set(i, { ...row, then: t }), true)}
                  menuWidth={240}
                />
              )}
              {on ? (
                <Badge tone="green" dot>
                  Match
                </Badge>
              ) : null}
              {ro ? null : (
                <button type="button" className={IB_SM} aria-label="More" title="More" aria-haspopup="menu" onClick={(e) => setMore(more ? null : { el: e.currentTarget, i })}>
                  <Ic n="more" />
                </button>
              )}
            </div>
            {problem && !ro && row.conds.every((c) => c.value !== "") ? <span className="pl-[35px] text-[12px] text-rose">{problem}</span> : null}
          </div>
        );
      })}

      <div className={`flex items-center gap-[8px] rounded-[10px] border p-[10px] transition-colors duration-[200ms] ${hit === -1 ? "border-signal-line bg-signal-soft" : "border-line"}`}>
        <span className="text-[12.5px] font-semibold text-ink">Otherwise</span>
        <Arrow className={hit === -1 ? "text-signal" : "text-ink"} />
        {ro ? (
          <span className="flex-1 font-medium text-ink">{whoName(r.otherwise, r)}</span>
        ) : (
          <Dd
            sm
            ariaLabel="Otherwise"
            label={r.otherwise ? whoName(r.otherwise, r) : <span className="text-faint">Pick who</span>}
            items={thenItems(r.otherwise, (t) => r.setOtherwise(t), false)}
            menuWidth={240}
          />
        )}
        {hit === -1 ? (
          <Badge tone="green" dot>
            Match
          </Badge>
        ) : null}
        {ro ? null : <span className="w-[24px] shrink-0" />}
      </div>

      {ro || !first ? null : (
        <button type="button" className={`${GHOST_SM} self-start`} onClick={() => r.setRows([...rows, newRow(first)])}>
          <Ic n="plus" s={12} />
          Add if
        </button>
      )}

      {more ? (
        <Menu
          anchor={more.el}
          onClose={() => setMore(null)}
          items={[
            {
              icon: "up",
              label: "Move up",
              disabled: more.i === 0,
              run: () => r.setRows(swap(rows, more.i, more.i - 1)),
            },
            {
              icon: "down",
              label: "Move down",
              disabled: more.i === rows.length - 1,
              run: () => r.setRows(swap(rows, more.i, more.i + 1)),
            },
            {
              icon: "dup",
              label: "Duplicate",
              run: () =>
                r.setRows([
                  ...rows.slice(0, more.i + 1),
                  {
                    ...newRow(first!),
                    conds: rows[more.i]!.conds.map((c) => ({ ...c })),
                    then: rows[more.i]!.then,
                  },
                  ...rows.slice(more.i + 1),
                ]),
            },
            "hr",
            {
              icon: "trash",
              label: "Delete",
              danger: true,
              run: () => r.setRows(rows.filter((_, n) => n !== more.i)),
            },
          ]}
        />
      ) : null}
    </div>
  );
}

const swap = <T,>(list: T[], a: number, b: number): T[] => {
  if (b < 0 || b >= list.length) return list;
  const next = list.slice();
  [next[a], next[b]] = [next[b]!, next[a]!];
  return next;
};

function groupItems(fields: FieldDef[], pick: (f: FieldDef) => void, cur: string): DdItem[] {
  const out: DdItem[] = [];
  let group = "";
  for (const f of fields) {
    if (f.group !== group) {
      group = f.group;
      out.push({ kind: "group", label: group });
    }
    out.push({
      kind: "option",
      key: f.key,
      label: f.label,
      search: f.label,
      on: f.key === cur,
      onPick: () => f.key !== cur && pick(f),
    });
  }
  return out;
}

const COUNTRIES = countryNames("en-US");

/** A condition's value: a picker for countries and choices, a box for numbers and text. Numbers are saved as numbers. */
function ValueInput({ field, value, onChange, search, onSearch }: { field: FieldDef; value: string | number; onChange: (v: string | number) => void; search: string; onSearch: (q: string) => void }) {
  if (field.type === "country")
    return (
      <Dd
        sm
        ariaLabel={field.label}
        label={value ? countryName(String(value)) : <span className="text-faint">Pick</span>}
        menuWidth={220}
        search={search}
        onSearch={onSearch}
        searchLabel="Search countries"
        items={COUNTRIES.map(
          (c): DdItem => ({
            kind: "option",
            key: c.value,
            label: c.label,
            search: c.label,
            on: c.value === value,
            onPick: () => onChange(c.value),
          }),
        )}
      />
    );
  if (field.type === "choice")
    return (
      <Dd
        sm
        ariaLabel={field.label}
        label={value ? String(value) : <span className="text-faint">Pick</span>}
        items={(field.options ?? []).map(
          (o): DdItem => ({
            kind: "option",
            key: o,
            label: o,
            on: o === value,
            onPick: () => onChange(o),
          }),
        )}
      />
    );
  if (field.type === "number")
    return (
      <input
        className={IN_SM}
        inputMode="numeric"
        aria-label={field.label}
        value={value === "" ? "" : String(value)}
        onChange={(e) => {
          const t = e.target.value.replace(/[^\d.]/g, "");
          onChange(t === "" ? "" : Number.isFinite(Number(t)) ? Number(t) : t);
        }}
      />
    );
  return <input className={IN_SM} aria-label={field.label} value={String(value)} onChange={(e) => onChange(e.target.value)} />;
}
