"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronRight, Clock, Dollar, Globe, MapIcon, Monitor, Phone, Users } from "@/components/Icons";
import { byDay, LOCATION_LABEL, lengthLabel, priceLabel, type BookReply, type GuestHost, type GuestLocation, type GuestSlot, type GuestType } from "@/lib/meetings/guest";
import { addDays, dateIn, dayOf } from "@/lib/meetings/time";
import { BOOK_CSS } from "./styles";
import { compileBook } from "@/lib/design/book";
import { readSystem } from "@/lib/design/model";
import type { Tokens } from "@/lib/forms/brand";

/** A short name for a stylesheet, so React keeps one copy of each. */
const hashText = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h.toString(36);
};
import { themeOf } from "./theme";
import { use12h, useMounted, useSundayFirst, useZone } from "./browser";
import { ZonePicker } from "./ZonePicker";

// The booking calendar (docs/meetings-scheduler.md 1.8 and 1.8b): the type on the left, a month in the middle, the
// day's times on the right; stacked on phones. The guest's time zone is detected and can be changed, lengths are a
// pill switch, then name, email and the type's questions, then the confirmation. The booking pages, the embed, the
// guest's reschedule and the type editor's preview (no `book`: nothing is sent) all use it.

export type BookRequest = { start: number; length: number; tz: string; name: string; email: string; answers: Record<string, string>; turnstile?: string };
export type MoveReply = { ok: true } | { ok: false; error: string; slots?: GuestSlot[] };
type Booked = Extract<BookReply, { ok: true }>;

export type BookingCalendarProps = {
  type: GuestType;
  /** The times for one length. */
  load: (length: number) => Promise<GuestSlot[]>;
  /** Times already worked out for the first length, so the page shows them at once. */
  initialSlots?: GuestSlot[];
  /** Books the picked time. Leave it out for a preview. */
  book?: (req: BookRequest) => Promise<BookReply>;
  /** Rescheduling: picking a time and confirming moves the meeting. */
  move?: (start: number) => Promise<MoveReply>;
  /** The brand kit's tokens; leave out when the page around already set them. */
  tokens?: Record<string, unknown> | null;
  logo?: string | null;
  turnstileKey?: string | null;
  prefill?: { name?: string; email?: string };
  /** In an embed: payment and redirects open on the page around it. */
  embedded?: boolean;
  onBooked?: (r: Booked) => void;
  /** Shown above the times (e.g. a meeting being moved). */
  banner?: React.ReactNode;
};

const fmt = (o: Intl.DateTimeFormatOptions) => {
  try {
    return new Intl.DateTimeFormat(undefined, o);
  } catch {
    return new Intl.DateTimeFormat("en-US", { ...o, timeZone: "UTC" });
  }
};
export const timeIn = (ms: number, tz: string, hour12: boolean) => fmt({ timeZone: tz, hour: "numeric", minute: "2-digit", hour12 }).format(ms);
export const dayLong = (date: string) => fmt({ weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(Date.parse(`${date}T12:00:00Z`));
export const whenLong = (ms: number, tz: string) => fmt({ weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: tz }).format(ms);
const monthLabel = (ym: string) => fmt({ month: "long", year: "numeric", timeZone: "UTC" }).format(Date.parse(`${ym}-15T12:00:00Z`));
const monthOf = (date: string) => date.slice(0, 7);
const addMonths = (ym: string, n: number) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

export function Avatar({ host, size }: { host: GuestHost; size?: "lg" }) {
  const initials = host.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  // eslint-disable-next-line @next/next/no-img-element
  if (host.photo) return <img className={`cb-av ${size === "lg" ? "cb-lg" : ""}`} src={host.photo} alt="" referrerPolicy="no-referrer" />;
  return (
    <span className={`cb-av ${size === "lg" ? "cb-lg" : ""}`} aria-hidden="true">
      {initials || "?"}
    </span>
  );
}

export function LocationIcon({ kind, size = 16 }: { kind: GuestLocation["kind"]; size?: number }) {
  if (kind === "phone_guest" || kind === "phone_host") return <Phone size={size} />;
  if (kind === "in_person") return <MapIcon size={size} />;
  return <Monitor size={size} />;
}

export function hostLine(hosts: GuestHost[]): string {
  if (hosts.length <= 2) return hosts.map((h) => h.name).join(" and ");
  return `${hosts[0]!.name}, ${hosts[1]!.name} and ${hosts.length - 2} more`;
}

/** Wraps children in the kit's variables and the booking styles. */
export function KitScope({ tokens, design, className = "", children }: { tokens?: Record<string, unknown> | null; design?: unknown; className?: string; children: React.ReactNode }) {
  const theme = useMemo(() => (tokens !== undefined ? themeOf(tokens) : null), [tokens]);
  // The brand's booking styles (docs/design-system.md Part 3.5), scoped to .cb-root.cb-ds.
  const css = useMemo(() => (design ? compileBook(readSystem(design, (tokens ?? {}) as Partial<Tokens>), (tokens ?? {}) as Partial<Tokens>) : ""), [design, tokens]);
  return (
    <div className={`cb-root ${css ? "cb-ds " : ""}${className}`} style={(theme?.vars ?? undefined) as React.CSSProperties | undefined} data-dark={theme?.dark || undefined}>
      <style href="clr-book" precedence="default">
        {BOOK_CSS}
      </style>
      {css ? (
        <style href={`clr-book-ds-${hashText(css)}`} precedence="default">
          {css}
        </style>
      ) : null}
      {theme?.fontUrl ? <link rel="stylesheet" href={theme.fontUrl} precedence="default" /> : null}
      {children}
    </div>
  );
}

/** Navigate to checkout or a thank-you page; from an embed, the page around it goes there. */
export function go(url: string, embedded?: boolean) {
  if (embedded) {
    try {
      window.top!.location.href = url;
      return;
    } catch {
      window.open(url, "_blank", "noopener");
      return;
    }
  }
  window.location.assign(url);
}

/** The calendar; with `tokens` it brings its own kit look and card (the type editor's preview). */
export function BookingCalendar(p: BookingCalendarProps) {
  if (p.tokens === undefined) return <Calendar {...p} />;
  return (
    <KitScope tokens={p.tokens}>
      <div className="cb-card">
        <Calendar {...p} />
      </div>
    </KitScope>
  );
}

function Calendar(p: BookingCalendarProps) {
  const mounted = useMounted();
  const detected = useZone();
  const prefers = use12h();
  const [tzPick, setTz] = useState<string | null>(null);
  const tz = tzPick ?? detected;
  const [h12, setH12] = useState<boolean | null>(null);
  const hour12 = h12 ?? prefers;
  const [length, setLength] = useState(p.type.lengths[0] ?? 30);
  const [reload, setReload] = useState(0);
  // Times by length (and retry), so a switch shows the right list or nothing while it loads.
  const key = `${length}:${reload}`;
  const [loaded, setLoaded] = useState<{ key: string; slots: GuestSlot[] | null; failed?: boolean }>({ key: `${p.type.lengths[0] ?? 30}:0`, slots: p.initialSlots ?? null });
  const slots = loaded.key === key ? loaded.slots : null;
  const loadFailed = loaded.key === key && !!loaded.failed;
  const [monthPick, setMonth] = useState<string | null>(null);
  const [dayPick, setDay] = useState<string | null>(null);
  const [timePick, setTime] = useState<number | null>(null);
  const [step, setStep] = useState<"pick" | "details" | "done">("pick");
  const [notice, setNotice] = useState<string | null>(null);
  const [done, setDone] = useState<Booked | null>(null);
  const [moving, setMoving] = useState(false);
  const [now] = useState(() => Date.now());
  const timesRef = useRef<HTMLDivElement>(null);
  // The email the guest booked with, for the confirmation line.
  const [doneEmail, setDoneEmail] = useState("");

  const { load } = p;
  const has = loaded.key === key && loaded.slots !== null;
  useEffect(() => {
    if (has) return;
    let live = true;
    load(length)
      .then((s) => live && setLoaded({ key, slots: s }))
      .catch(() => live && setLoaded({ key, slots: null, failed: true }));
    return () => {
      live = false;
    };
  }, [has, key, length, load]);

  const days = useMemo(() => byDay(slots ?? [], tz), [slots, tz]);
  const dayList = useMemo(() => [...days.keys()], [days]);
  const today = mounted ? dateIn(now, tz) : "";
  // The day shown: the one picked while it still has times, else the first with times in the month picked (or at
  // all). The time picked only counts while it's still on that day.
  const day = dayPick && days.has(dayPick) ? dayPick : monthPick ? (dayList.find((d) => monthOf(d) === monthPick) ?? null) : (dayList[0] ?? null);
  const daySlots = (mounted && day && days.get(day)) || [];
  const time = timePick !== null && daySlots.some((x) => x.start === timePick) ? timePick : null;
  const shownMonth = monthPick ?? (day ? monthOf(day) : today ? monthOf(today) : "");
  const lastDay = dayList.at(-1) ?? null;
  const minMonth = today ? monthOf(today) : shownMonth;
  const maxMonth = lastDay ? monthOf(lastDay) : today ? addMonths(monthOf(today), 2) : shownMonth;

  const pickMonth = (ym: string) => {
    setMonth(ym);
    setDay(null);
    setTime(null);
  };
  const pickDay = (d: string) => {
    setDay(d);
    setMonth(monthOf(d));
    setTime(null);
    setNotice(null);
    requestAnimationFrame(() => {
      const el = timesRef.current;
      if (el && el.getBoundingClientRect().top > window.innerHeight - 80) el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const afterTaken = useCallback(
    (msg: string, fresh?: GuestSlot[]) => {
      if (fresh) setLoaded({ key, slots: fresh });
      setTime(null);
      setStep("pick");
      setNotice(msg);
    },
    [key],
  );

  const next = async () => {
    if (time === null) return;
    setNotice(null);
    if (!p.move) return setStep("details");
    setMoving(true);
    try {
      const r = await p.move(time);
      if (!r.ok) afterTaken(r.error, r.slots);
    } catch {
      setNotice("Try again in a moment.");
    } finally {
      setMoving(false);
    }
  };

  if (step === "done" && done) return <Done type={p.type} reply={done} tz={tz} hour12={hour12} email={doneEmail} />;

  const monthHas = dayList.some((d) => monthOf(d) === shownMonth);
  const nextAvail = dayList.find((d) => monthOf(d) > shownMonth) ?? null;

  return (
    <div className="cb-grid">
      <Info type={p.type} logo={p.logo} length={length} setLength={p.move ? undefined : (n) => (setLength(n), setNotice(null))} picked={step === "details" && time !== null ? { start: time, tz, hour12, length } : null} />
      <div className="cb-main">
        {step === "details" && time !== null ? (
          <Details
            key="details"
            type={p.type}
            start={time}
            length={length}
            tz={tz}
            hour12={hour12}
            prefill={p.prefill}
            turnstileKey={p.turnstileKey}
            preview={!p.book}
            onBack={() => setStep("pick")}
            submit={async (g) => {
              const r = await p.book!({ start: time, length, tz, ...g });
              if (r.ok) {
                if (r.checkout) {
                  go(r.checkout, p.embedded);
                  return { ok: true };
                }
                p.onBooked?.(r);
                if (r.confirmation.kind === "redirect") {
                  go(r.confirmation.url, p.embedded);
                  return { ok: true };
                }
                setDoneEmail(g.email);
                setDone(r);
                setStep("done");
                return { ok: true };
              }
              if (["slot_taken", "not_offered", "full"].includes(r.code)) {
                afterTaken(r.error, r.slots);
                return { ok: true };
              }
              return { ok: false, error: r.error, field: (r as { field?: string }).field };
            }}
          />
        ) : (
          <div className="cb-step" key="pick">
            {p.banner}
            {notice && (
              <div className="cb-note" role="alert">
                {notice}
              </div>
            )}
            <div className={`cb-pick ${day ? "cb-open" : ""}`}>
              <div>
                <h2 className="cb-h" style={{ fontSize: "1.15em", marginBottom: 16 }}>
                  Select a date and time
                </h2>
                <Month
                  month={shownMonth}
                  today={today}
                  days={days}
                  day={day}
                  loading={!mounted || slots === null}
                  canBack={shownMonth > minMonth}
                  canNext={shownMonth < maxMonth}
                  onMonth={(n) => pickMonth(addMonths(shownMonth, n))}
                  onDay={pickDay}
                />
                {mounted && slots !== null && !monthHas && (
                  <div className="cb-empty">
                    <span className="cb-muted">{loadFailed ? "Times couldn't load." : `No times in ${monthLabel(shownMonth)}`}</span>
                    {nextAvail && (
                      <button type="button" className="cb-btn cb-ghost" onClick={() => (pickMonth(monthOf(nextAvail)), setDay(nextAvail))}>
                        Next available <ChevronRight size={15} />
                      </button>
                    )}
                  </div>
                )}
                {loadFailed && slots === null && (
                  <div className="cb-empty">
                    <span className="cb-muted">Times couldn&apos;t load.</span>
                    <button type="button" className="cb-btn cb-ghost" onClick={() => setReload((n) => n + 1)}>
                      Try again
                    </button>
                  </div>
                )}
                <div className="cb-zone">
                  <ZonePicker value={tz} onChange={(z) => (setTz(z), setTime(null))} hour12={hour12} />
                  <div className="cb-pills" role="radiogroup" aria-label="Clock">
                    <button type="button" role="radio" className="cb-pill" aria-checked={hour12} onClick={() => setH12(true)}>
                      am/pm
                    </button>
                    <button type="button" role="radio" className="cb-pill" aria-checked={!hour12} onClick={() => setH12(false)}>
                      24h
                    </button>
                  </div>
                </div>
              </div>
              {day && mounted && (
                <div className="cb-times" ref={timesRef} key={day}>
                  <div className="cb-h" style={{ fontSize: "1em" }}>
                    {dayLong(day)}
                  </div>
                  <div className="cb-tlist" role="list">
                    {daySlots.map((s) =>
                      time === s.start ? (
                        <div className="cb-tpair" key={s.start} role="listitem">
                          <button type="button" className="cb-time cb-on" onClick={() => setTime(null)} aria-pressed="true">
                            {timeIn(s.start, tz, hour12)}
                          </button>
                          <button type="button" className="cb-btn" onClick={next} disabled={moving} autoFocus>
                            {p.move ? "Move here" : "Next"}
                          </button>
                        </div>
                      ) : (
                        <button type="button" key={s.start} role="listitem" className="cb-time" onClick={() => setTime(s.start)}>
                          {timeIn(s.start, tz, hour12)}
                          {s.seats !== undefined && p.type.seats !== null && <span className="cb-seats">{s.seats === 1 ? "1 seat left" : `${s.seats} seats left`}</span>}
                        </button>
                      ),
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Info({ type, logo, length, setLength, picked }: { type: GuestType; logo?: string | null; length: number; setLength?: (n: number) => void; picked: { start: number; tz: string; hour12: boolean; length: number } | null }) {
  return (
    <aside className="cb-info">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {logo && <img className="cb-logo" src={logo} alt="" referrerPolicy="no-referrer" />}
      {type.hosts.length > 0 && (
        <div className="cb-hosts">
          <span className="cb-stack">
            {type.hosts.slice(0, 4).map((h, i) => (
              <Avatar key={i} host={h} />
            ))}
          </span>
          <span className="cb-muted" style={{ fontWeight: 500 }}>
            {hostLine(type.hosts)}
          </span>
        </div>
      )}
      <h1 className="cb-h" style={{ fontSize: "1.6em" }}>
        {type.name}
      </h1>
      <div className="cb-meta">
        <div className="cb-row">
          <Clock size={16} />
          {setLength && type.lengths.length > 1 ? (
            <div className="cb-pills" role="radiogroup" aria-label="Length">
              {type.lengths.map((n) => (
                <button key={n} type="button" role="radio" className="cb-pill" aria-checked={n === length} onClick={() => setLength(n)}>
                  {lengthLabel(n)}
                </button>
              ))}
            </div>
          ) : (
            <span>{lengthLabel(length)}</span>
          )}
        </div>
        <div className="cb-row">
          <LocationIcon kind={type.location.kind} />
          <span>
            {LOCATION_LABEL[type.location.kind]}
            {type.location.detail && <span className="cb-small" style={{ display: "block", fontWeight: 400 }}>{type.location.detail}</span>}
          </span>
        </div>
        {type.price && (
          <div className="cb-row">
            <Dollar size={16} />
            <span>{priceLabel(type.price)}</span>
          </div>
        )}
        {type.seats !== null && type.seats > 1 && (
          <div className="cb-row">
            <Users size={16} />
            <span>Up to {type.seats} guests</span>
          </div>
        )}
        {picked && (
          <div className="cb-when" style={{ marginTop: 6, color: "var(--clr-text)" }}>
            <span>
              {timeIn(picked.start, picked.tz, picked.hour12)} to {timeIn(picked.start + picked.length * 60_000, picked.tz, picked.hour12)}
            </span>
            <span className="cb-muted cb-small">{whenLong(picked.start, picked.tz)}</span>
          </div>
        )}
      </div>
    </aside>
  );
}

function Month(p: { month: string; today: string; days: Map<string, GuestSlot[]>; day: string | null; loading: boolean; canBack: boolean; canNext: boolean; onMonth: (n: number) => void; onDay: (d: string) => void }) {
  const sundayFirst = useSundayFirst();
  if (!p.month) return <div className="cb-days" style={{ minHeight: 280 }} />;
  const first = `${p.month}-01`;
  const lead = (["mon", "tue", "wed", "thu", "fri", "sat", "sun"].indexOf(dayOf(first)) + (sundayFirst ? 1 : 0)) % 7;
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = first; monthOf(d) === p.month; d = addDays(d, 1)) cells.push(d);
  const week = sundayFirst ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return (
    <div>
      <div className="cb-mhead">
        <span style={{ fontWeight: 600 }}>{monthLabel(p.month)}</span>
        <span className="cb-nav">
          <button type="button" className="cb-icon" aria-label="Previous month" disabled={!p.canBack} onClick={() => p.onMonth(-1)}>
            <span style={{ display: "inline-flex", transform: "rotate(180deg)" }}>
              <ChevronRight size={16} />
            </span>
          </button>
          <button type="button" className="cb-icon" aria-label="Next month" disabled={!p.canNext} onClick={() => p.onMonth(1)}>
            <ChevronRight size={16} />
          </button>
        </span>
      </div>
      <div className="cb-week" aria-hidden="true">
        {week.map((w) => (
          <span key={w} data-short={w.slice(0, 2)}>
            {w}
          </span>
        ))}
      </div>
      <div className="cb-days" role="grid" aria-busy={p.loading || undefined}>
        {cells.map((d, i) => {
          if (!d) return <span key={`x${i}`} />;
          const has = !p.loading && p.days.has(d);
          return (
            <button
              key={d}
              type="button"
              className={`cb-day ${has ? "cb-has" : ""} ${d === p.today ? "cb-today" : ""}`}
              disabled={!has}
              aria-pressed={d === p.day}
              aria-label={`${dayLong(d)}${has ? "" : ", no times"}`}
              onClick={() => p.onDay(d)}
            >
              {Number(d.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type GuestForm = { name: string; email: string; answers: Record<string, string>; turnstile?: string };

function useTurnstile(key: string | null | undefined) {
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [token, setToken] = useState("");
  useEffect(() => {
    if (!key || !box) return;
    const w = window as unknown as { turnstile?: { render: (el: Element, o: object) => string; remove?: (id: string) => void } };
    let id: string | undefined;
    const draw = () => {
      if (w.turnstile && !id) id = w.turnstile.render(box, { sitekey: key, callback: (t: string) => setToken(t), "expired-callback": () => setToken("") });
    };
    let s: HTMLScriptElement | null = null;
    if (w.turnstile) draw();
    else {
      s = document.querySelector<HTMLScriptElement>("script[data-cb-turnstile]");
      if (!s) {
        s = document.createElement("script");
        s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
        s.async = true;
        s.dataset.cbTurnstile = "1";
        document.head.append(s);
      }
      s.addEventListener("load", draw);
    }
    return () => {
      s?.removeEventListener("load", draw);
      if (id) w.turnstile?.remove?.(id);
    };
  }, [key, box]);
  return [setBox, token] as const;
}

function Details(p: {
  type: GuestType;
  start: number;
  length: number;
  tz: string;
  hour12: boolean;
  prefill?: { name?: string; email?: string };
  turnstileKey?: string | null;
  preview: boolean;
  onBack: () => void;
  submit: (g: GuestForm) => Promise<{ ok: true } | { ok: false; error: string; field?: string }>;
}) {
  const [name, setName] = useState(p.prefill?.name ?? "");
  const [email, setEmail] = useState(p.prefill?.email ?? "");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [err, setErr] = useState<{ error: string; field?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [tsMount, tsToken] = useTurnstile(p.preview ? null : p.turnstileKey);
  const set = (id: string, v: string) => setAnswers((a) => ({ ...a, [id]: v }));
  const fieldErr = (f: string) => (err?.field === f ? err.error : null);
  const questions = [...p.type.questions, ...(p.type.location.kind === "phone_guest" ? [{ id: "phone", label: "Phone number", type: "phone" as const, required: true }] : [])];

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (p.preview || busy) return;
    setErr(null);
    if (!name.trim()) return setErr({ error: "Add your name.", field: "name" });
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErr({ error: "Add a valid email.", field: "email" });
    for (const q of questions) if (q.required && !answers[q.id]?.trim()) return setErr({ error: `${q.label} is required.`, field: q.id });
    setBusy(true);
    try {
      const r = await p.submit({ name: name.trim(), email: email.trim(), answers, ...(tsToken ? { turnstile: tsToken } : {}) });
      if (!r.ok) setErr(r);
    } catch {
      setErr({ error: "Try again in a moment." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="cb-step cb-form" onSubmit={send} noValidate>
      <div>
        <button type="button" className="cb-back" onClick={p.onBack}>
          <ArrowLeft size={15} /> Back
        </button>
        <h2 className="cb-h" style={{ fontSize: "1.15em" }}>
          Enter details
        </h2>
      </div>
      <label className="cb-field">
        <span>Name</span>
        <input className="cb-in" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" aria-invalid={!!fieldErr("name")} maxLength={200} />
        {fieldErr("name") && <p className="cb-err">{fieldErr("name")}</p>}
      </label>
      <label className="cb-field">
        <span>Email</span>
        <input className="cb-in" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" aria-invalid={!!fieldErr("email")} maxLength={320} />
        {fieldErr("email") && <p className="cb-err">{fieldErr("email")}</p>}
      </label>
      {questions.map((q) => (
        <div className="cb-field" key={q.id}>
          <span id={`cb-q-${q.id}`}>
            {q.label}
            {!q.required && <span className="cb-muted"> (optional)</span>}
          </span>
          {q.type === "choice" ? (
            <div className="cb-choices" role="radiogroup" aria-labelledby={`cb-q-${q.id}`}>
              {(q.options ?? []).map((o) => (
                <button key={o} type="button" role="radio" className="cb-choice" aria-checked={answers[q.id] === o} onClick={() => set(q.id, answers[q.id] === o && !q.required ? "" : o)}>
                  {o}
                </button>
              ))}
            </div>
          ) : q.type === "textarea" ? (
            <textarea className="cb-in" aria-labelledby={`cb-q-${q.id}`} value={answers[q.id] ?? ""} onChange={(e) => set(q.id, e.target.value)} maxLength={2000} aria-invalid={!!fieldErr(q.id)} />
          ) : (
            <input
              className="cb-in"
              aria-labelledby={`cb-q-${q.id}`}
              type={q.type === "phone" ? "tel" : "text"}
              autoComplete={q.type === "phone" ? "tel" : undefined}
              value={answers[q.id] ?? ""}
              onChange={(e) => set(q.id, e.target.value)}
              maxLength={q.type === "phone" ? 40 : 300}
              aria-invalid={!!fieldErr(q.id)}
            />
          )}
          {fieldErr(q.id) && <p className="cb-err">{fieldErr(q.id)}</p>}
        </div>
      ))}
      {p.turnstileKey && !p.preview && <div ref={tsMount} />}
      {err && !err.field && (
        <p className="cb-err" role="alert">
          {err.error}
        </p>
      )}
      <div>
        <button type="submit" className="cb-btn" disabled={busy || p.preview}>
          {p.type.price ? `Pay ${priceLabel(p.type.price)} and book` : "Book meeting"}
        </button>
      </div>
    </form>
  );
}

function Done({ type, reply, tz, hour12, email }: { type: GuestType; reply: Booked; tz: string; hour12: boolean; email: string }) {
  const hosts = reply.hosts.length ? reply.hosts : type.hosts;
  return (
    <div className="cb-done cb-step" role="status">
      <span className="cb-tick">
        <Check size={26} />
      </span>
      <h1 className="cb-h" style={{ fontSize: "1.6em" }}>
        You&apos;re booked
      </h1>
      {reply.confirmation.kind === "message" && reply.confirmation.text ? <p className="cb-muted" style={{ margin: 0, whiteSpace: "pre-line", maxWidth: 460 }}>{reply.confirmation.text}</p> : null}
      <div className="cb-sum">
        <div style={{ fontWeight: 600 }}>{type.name}</div>
        {hosts.length > 0 && (
          <div className="cb-row cb-muted">
            <Users size={16} />
            <span>{hostLine(hosts)}</span>
          </div>
        )}
        <div className="cb-row cb-muted">
          <Clock size={16} />
          <span>
            {timeIn(reply.start, tz, hour12)} to {timeIn(reply.end, tz, hour12)}, {whenLong(reply.start, tz)}
          </span>
        </div>
        <div className="cb-row cb-muted">
          <Globe size={16} />
          <span>{tz.replace(/_/g, " ")}</span>
        </div>
        <div className="cb-row cb-muted">
          <LocationIcon kind={type.location.kind} />
          <span>{type.location.detail ?? LOCATION_LABEL[type.location.kind]}</span>
        </div>
      </div>
      {email && <p className="cb-muted cb-small" style={{ margin: 0 }}>An invite is on its way to {email}.</p>}
      <a className="cb-small" href={reply.manage} target="_top" style={{ fontWeight: 500 }}>
        Reschedule or cancel
      </a>
    </div>
  );
}
