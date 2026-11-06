"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Check, ChevronRight, Clock, Dollar, Globe, Users, Video } from "@/components/Icons";
import { byDay, LOCATION_LABEL, lengthLabel, priceLabel, type BookReply, type GuestSlot, type GuestType, type Question } from "@/lib/meetings/guest";
import { addDays, dateIn, dayOf } from "@/lib/meetings/time";
import { calendarLinks, partsOfDay, soonest } from "@/lib/meetings/guestTimes";
import { use12h, useMounted, useSundayFirst, useZone } from "./browser";
import { Avatar, hostLine, LocationIcon } from "./parts";
import { ZonePicker } from "./ZonePicker";
import { countryNames } from "@/lib/forms/countries";
import { checkAnswer } from "@/lib/meetings/questions";

// The booking calendar (docs/meetings-scheduler.md 1.8 and 1.8b): the type on the left, a month in the middle, the
// day's times on the right; stacked on phones. The soonest times sit on top, a day's times are grouped by part of
// the day, the guest's time zone is detected and can be changed, lengths are a pill switch, then name, email and the
// type's questions, then the confirmation with add-to-calendar links. The booking pages, the embed, the
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
  /** Shown in place of the times until it's done (a Dynamic meeting's questions). */
  before?: React.ReactNode;
  /** The Styling preview: open on a step (details or the thank-you) with a time already picked. Nothing is sent. */
  preview?: { step?: "details" | "done"; time?: number; done?: Booked };
};

/** The guest's name and email, kept in their own browser after a booking so the next one is filled in. */
const GUEST_KEY = "claritia:guest";
const rememberedGuest = (): { name?: string; email?: string } => {
  try {
    const g = JSON.parse(localStorage.getItem(GUEST_KEY) ?? "null") as { name?: unknown; email?: unknown } | null;
    return { name: typeof g?.name === "string" ? g.name.slice(0, 200) : undefined, email: typeof g?.email === "string" ? g.email.slice(0, 320) : undefined };
  } catch {
    return {};
  }
};
const rememberGuest = (name: string, email: string) => {
  try {
    localStorage.setItem(GUEST_KEY, JSON.stringify({ name, email }));
  } catch {}
};

/** Phones: a narrow screen, where Next sits in a bar at the bottom of the screen. */
function usePhone() {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const m = window.matchMedia?.("(max-width: 640px)");
    if (!m) return;
    const on = () => setPhone(m.matches);
    on();
    m.addEventListener?.("change", on);
    return () => m.removeEventListener?.("change", on);
  }, []);
  return phone;
}

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
const dayShort = (date: string, today: string) => (date === today ? "Today" : fmt({ weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(Date.parse(`${date}T12:00:00Z`)));
const addMonths = (ym: string, n: number) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

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

/** The calendar itself, inside a page that already set the look (BookShell). */
export function Calendar(p: BookingCalendarProps) {
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
  const [timePick, setTime] = useState<number | null>(p.preview?.time ?? null);
  const [step, setStepRaw] = useState<"pick" | "details" | "done">(p.preview?.step ?? "pick");
  const [back, setBack] = useState(false);
  const setStep = (s: "pick" | "details" | "done") => (setBack(s === "pick"), setStepRaw(s));
  const [notice, setNotice] = useState<string | null>(null);
  const [done, setDone] = useState<Booked | null>(p.preview?.done ?? null);
  const phone = usePhone();
  const pickRef = useRef<HTMLDivElement>(null);
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

  if (step === "done" && done) return <Done type={p.type} reply={done} tz={tz} hour12={hour12} email={doneEmail} preview={!!p.preview} />;

  const monthHas = dayList.some((d) => monthOf(d) === shownMonth);
  const nextAvail = dayList.find((d) => monthOf(d) > shownMonth) ?? null;
  const soon = mounted && slots !== null ? soonest(days, 3) : [];
  const lengths = !p.move && p.type.lengths.length > 1 ? p.type.lengths : null;

  return (
    <div className="cb-grid">
      <Info type={p.type} logo={p.logo} length={length} picked={time !== null ? { start: time, tz, hour12, length } : null} />
      <div className="cb-main">
        {p.before ? (
          p.before
        ) : step === "details" && time !== null ? (
          <Details
            key="details"
            type={p.type}
            start={time}
            length={length}
            tz={tz}
            hour12={hour12}
            prefill={p.prefill ?? (p.book && !p.preview ? rememberedGuest() : undefined)}
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
                rememberGuest(g.name, g.email);
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
          <div className={`cb-step ${back ? "cb-rev" : ""}`} key="pick" ref={pickRef}>
            {p.banner}
            {notice && (
              <div className="cb-note" role="alert">
                {notice}
              </div>
            )}
            <div className={`cb-pick ${day ? "cb-open" : ""}`}>
              <div>
                <div className="cb-phead">
                  <h2 className="cb-h" style={{ fontSize: "1.15em" }}>
                    Pick a time
                  </h2>
                  {lengths && (
                    <div className="cb-pills" role="radiogroup" aria-label="Length">
                      {lengths.map((n) => (
                        <button key={n} type="button" role="radio" className="cb-pill" aria-checked={n === length} onClick={() => (setLength(n), setNotice(null))}>
                          {lengthLabel(n)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {soon.length > 1 && (
                  <div className="cb-soon">
                    <span className="cb-eyebrow">Soonest</span>
                    {soon.map(([d, s]) => (
                      <button
                        key={s.start}
                        type="button"
                        className="cb-sc"
                        onClick={() => {
                          pickDay(d);
                          setTime(s.start);
                          if (!p.move) setStep("details");
                        }}
                      >
                        <b>{timeIn(s.start, tz, hour12)}</b>
                        {dayShort(d, today)}
                      </button>
                    ))}
                  </div>
                )}
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
                        Next open day <ChevronRight size={15} />
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
                    {partsOfDay(daySlots, tz).map(([part, list]) => [
                      <span key={part} className="cb-group" role="presentation">
                        {part}
                      </span>,
                      ...list.map((s) =>
                      time === s.start ? (
                        <div className="cb-tpair" key={s.start} role="listitem">
                          <button type="button" className="cb-time cb-on" onClick={() => setTime(null)} aria-pressed="true">
                            {timeIn(s.start, tz, hour12)}
                          </button>
                          {phone ? null : (
                            <button type="button" className="cb-btn" onClick={next} disabled={moving} autoFocus>
                              {p.move ? "Move here" : "Next"}
                            </button>
                          )}
                        </div>
                      ) : (
                        <button type="button" key={s.start} role="listitem" className="cb-time" onClick={() => setTime(s.start)}>
                          {timeIn(s.start, tz, hour12)}
                          {s.seats !== undefined && p.type.seats !== null && <span className="cb-seats">{s.seats === 1 ? "1 seat left" : `${s.seats} seats left`}</span>}
                        </button>
                      ),
                      ),
                    ])}
                  </div>
                </div>
              )}
            </div>
            {phone && time !== null ? (
              <PhoneBar from={pickRef}>
                <span className="cb-pbw">
                  <b>{timeIn(time, tz, hour12)}</b>
                  <span className="cb-muted cb-small">{dayShort(day!, today)}</span>
                </span>
                <button type="button" className="cb-btn" onClick={next} disabled={moving}>
                  {p.move ? "Move here" : "Next"}
                </button>
              </PhoneBar>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Next on a phone: a bar fixed to the bottom of the screen, so the guest never scrolls to find it. It's drawn on the
 * page's body (the card's containment would pin it inside the card), wrapped in the booking root's look.
 */
function PhoneBar({ from, children }: { from: React.RefObject<HTMLElement | null>; children: React.ReactNode }) {
  const [root, setRoot] = useState<{ cls: string; style: string; dark: boolean } | null>(null);
  useEffect(() => {
    // Read the root's look once it's on the page (a frame later, after it drew).
    const t = requestAnimationFrame(() => {
      const r = from.current?.closest<HTMLElement>(".cb-root");
      if (r) setRoot({ cls: [...r.classList].filter((c) => c === "cb-root" || c === "cb-ds" || c === "cb-brand").join(" "), style: r.getAttribute("style") ?? "", dark: r.hasAttribute("data-dark") });
    });
    return () => cancelAnimationFrame(t);
  }, [from]);
  if (!root) return null;
  return createPortal(
    // container-type off: a container would hold the fixed bar inside this wrapper instead of the screen.
    <div className={root.cls} ref={(el) => el?.setAttribute("style", `${root.style};container-type:normal;min-height:0`)} data-dark={root.dark || undefined}>
      <div className="cb-phonebar" role="region" aria-label="Your time">
        {children}
      </div>
    </div>,
    document.body,
  );
}

function Info({ type, logo, length, picked }: { type: GuestType; logo?: string | null; length: number; picked: { start: number; tz: string; hour12: boolean; length: number } | null }) {
  return (
    <aside className="cb-info">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {logo && <img className="cb-logo" src={logo} alt="" height={28} decoding="async" referrerPolicy="no-referrer" />}
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
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="cb-eyebrow">{lengthLabel(length)}</span>
        <h1 className="cb-two" style={{ fontSize: "1.75em" }}>
          {type.name}
        </h1>
        {type.description ? (
          <p className="cb-muted cb-desc" style={{ margin: 0, whiteSpace: "pre-line", overflowWrap: "anywhere" }}>
            {type.description}
          </p>
        ) : null}
      </div>
      <div className="cb-meta">
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
          <div className="cb-when" key={picked.start} style={{ marginTop: 6, color: "var(--clr-text)" }}>
            <b>
              {timeIn(picked.start, picked.tz, picked.hour12)} to {timeIn(picked.start + picked.length * 60_000, picked.tz, picked.hour12)}
            </b>
            <span className="cb-muted cb-small">{whenLong(picked.start, picked.tz)}</span>
          </div>
        )}
      </div>
    </aside>
  );
}

function Month(p: { month: string; today: string; days: Map<string, GuestSlot[]>; day: string | null; loading: boolean; canBack: boolean; canNext: boolean; onMonth: (n: number) => void; onDay: (d: string) => void }) {
  const sundayFirst = useSundayFirst();
  // The day the keyboard is on: the picked day, else the first open day, else the 1st.
  const [focusRaw, setFocusDay] = useState<string | null>(null);
  const firstOpen = [...p.days.keys()].find((d) => monthOf(d) === p.month);
  const focusDay = focusRaw && monthOf(focusRaw) === p.month ? focusRaw : (p.day && monthOf(p.day) === p.month ? p.day : (firstOpen ?? `${p.month}-01`));
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
      <div
        className="cb-days"
        role="grid"
        aria-label={monthLabel(p.month)}
        aria-busy={p.loading || undefined}
        onKeyDown={(e) => {
          // Arrow keys move between days (into the next or last month at the edges); Enter or Space picks one.
          const step = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[e.key];
          if (!step) return;
          e.preventDefault();
          const next = addDays(focusDay, step);
          if (monthOf(next) !== p.month) {
            if ((step < 0 && !p.canBack) || (step > 0 && !p.canNext)) return;
            p.onMonth(step < 0 ? -1 : 1);
          }
          setFocusDay(next);
          requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-cb-day="${next}"]`)?.focus());
        }}
      >
        {cells.map((d, i) => {
          if (!d) return <span key={`x${i}`} />;
          const has = !p.loading && p.days.has(d);
          const n = has ? p.days.get(d)!.length : 0;
          return (
            <button
              key={d}
              type="button"
              data-cb-day={d}
              className={`cb-day ${has ? "cb-has" : ""} ${d === p.today ? "cb-today" : ""}`}
              aria-disabled={!has || undefined}
              tabIndex={d === focusDay ? 0 : -1}
              aria-pressed={d === p.day}
              aria-label={`${dayLong(d)}, ${has ? `${n} open ${n === 1 ? "time" : "times"}` : "no times"}`}
              onFocus={() => setFocusDay(d)}
              onClick={() => has && p.onDay(d)}
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
    for (const q of questions) {
      const a = checkAnswer(q, answers[q.id]);
      if ("error" in a) return setErr({ error: a.error, field: q.id });
      if (q.required && !a.value) return setErr({ error: q.type === "checkbox" || q.type === "sms" ? `Tick ${q.label}.` : `${q.label} is required.`, field: q.id });
    }
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
          <ArrowLeft size={15} /> Change time
        </button>
        <h2 className="cb-two" style={{ fontSize: "1.4em" }}>
          Your details
          <span className="cb-gray">
            {timeIn(p.start, p.tz, p.hour12)}, {whenLong(p.start, p.tz)}
          </span>
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
          {q.type === "checkbox" || q.type === "sms" ? null : (
            <span id={`cb-q-${q.id}`}>
              {q.label}
              {!q.required && <span className="cb-muted"> (optional)</span>}
            </span>
          )}
          <Answer q={q} value={answers[q.id] ?? ""} onChange={(v) => set(q.id, v)} invalid={!!fieldErr(q.id)} />
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
          {busy ? "Booking" : p.type.price ? `Pay ${priceLabel(p.type.price)} and book` : "Confirm booking"}
        </button>
      </div>
    </form>
  );
}

const COUNTRIES = countryNames();

/** One booking question's input, by its kind (src/lib/meetings/questions.ts). Choices are buttons, never a browser dropdown. */
function Answer({ q, value, onChange, invalid }: { q: Question; value: string; onChange: (v: string) => void; invalid: boolean }) {
  const label = `cb-q-${q.id}`;
  const chips = (opts: string[], on: (o: string) => boolean, pick: (o: string) => void, role: "radio" | "checkbox" = "radio", show: (o: string) => React.ReactNode = (o) => o) => (
    <div className="cb-choices" role={role === "radio" ? "radiogroup" : "group"} aria-labelledby={label}>
      {opts.map((o) => (
        <button key={o} type="button" role={role} className="cb-choice" aria-checked={on(o)} onClick={() => pick(o)}>
          {show(o)}
        </button>
      ))}
    </div>
  );
  switch (q.type) {
    case "choice":
      return chips(q.options ?? [], (o) => value === o, (o) => onChange(value === o && !q.required ? "" : o));
    case "multi": {
      const picked = value ? value.split("\n") : [];
      return chips(q.options ?? [], (o) => picked.includes(o), (o) => onChange((picked.includes(o) ? picked.filter((x) => x !== o) : [...picked, o]).join("\n")), "checkbox");
    }
    case "yesno":
      return chips(["Yes", "No"], (o) => value === o, (o) => onChange(value === o && !q.required ? "" : o));
    case "rating":
      return chips(["1", "2", "3", "4", "5"], (o) => !!value && Number(o) <= Number(value), (o) => onChange(value === o && !q.required ? "" : o), "radio", (o) => <span aria-label={`${o} of 5`}>{o}</span>);
    case "checkbox":
    case "sms":
      return (
        <button type="button" role="checkbox" aria-checked={value === "Yes"} id={label} className="cb-check" onClick={() => onChange(value === "Yes" ? "" : "Yes")}>
          <span className="cb-box" aria-hidden="true">{value === "Yes" ? <Check size={12} /> : null}</span>
          <span>
            {q.label}
            {!q.required && <span className="cb-muted"> (optional)</span>}
          </span>
        </button>
      );
    case "country":
      return <CountryPick label={label} value={value} onChange={onChange} />;
    case "textarea":
      return <textarea className="cb-in" aria-labelledby={label} value={value} onChange={(e) => onChange(e.target.value)} maxLength={2000} aria-invalid={invalid} />;
    default: {
      const kind = { email: "email", phone: "tel", number: "text", url: "url", date: "date" } as Record<string, string>;
      return (
        <input
          className="cb-in"
          aria-labelledby={label}
          type={kind[q.type] ?? "text"}
          inputMode={q.type === "number" ? "decimal" : q.type === "email" ? "email" : q.type === "phone" ? "tel" : q.type === "url" ? "url" : undefined}
          autoComplete={q.type === "phone" ? "tel" : q.type === "email" ? "email" : q.type === "url" ? "url" : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={q.type === "phone" ? 40 : 300}
          aria-invalid={invalid}
        />
      );
    }
  }
}

/** A country: typed, then picked from the matches. */
function CountryPick({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [q, setQ] = useState("");
  const picked = COUNTRIES.find((c) => c.value === value);
  const t = q.trim().toLowerCase();
  const matches = t ? COUNTRIES.filter((c) => c.label.toLowerCase().includes(t) || c.value.toLowerCase() === t).slice(0, 6) : [];
  if (picked)
    return (
      <div className="cb-choices">
        <button type="button" role="radio" className="cb-choice" aria-checked="true" onClick={() => onChange("")}>
          {picked.label}
        </button>
      </div>
    );
  return (
    <>
      <input className="cb-in" aria-labelledby={label} value={q} onChange={(e) => setQ(e.target.value)} maxLength={60} autoComplete="country-name" />
      {matches.length ? (
        <div className="cb-choices" role="radiogroup" aria-labelledby={label}>
          {matches.map((c) => (
            <button key={c.value} type="button" role="radio" aria-checked="false" className="cb-choice" onClick={() => (onChange(c.value), setQ(""))}>
              {c.label}
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}

/** Where a guest adds the meeting to Apple Calendar (or any app that opens .ics): the manage link's calendar file. */
export function icsUrl(manage: string): string | null {
  try {
    const u = new URL(manage);
    const m = /^\/book\/m\/([^/]+)$/.exec(u.pathname);
    return m ? `${u.origin}/api/book/m/${m[1]}?ics=1` : null;
  } catch {
    return null;
  }
}

function Done({ type, reply, tz, hour12, email, preview }: { type: GuestType; reply: Booked; tz: string; hour12: boolean; email: string; preview?: boolean }) {
  const hosts = reply.hosts.length ? reply.hosts : type.hosts;
  const links = calendarLinks({ title: hosts.length ? `${type.name} with ${hostLine(hosts)}` : type.name, start: reply.start, end: reply.end, details: `Reschedule or cancel: ${reply.manage}` });
  const ics = preview ? "#" : icsUrl(reply.manage);
  const join = type.location.detail && /^https:\/\/\S+$/.test(type.location.detail) ? type.location.detail : null;
  const video = type.location.kind === "google_meet" || type.location.kind === "zoom" || type.location.kind === "teams" || type.location.kind === "webex" || type.location.kind === "whereby";
  const manage = (to: "move" | "cancel") => (preview ? "#" : `${reply.manage}${reply.manage.includes("?") ? "&" : "?"}do=${to}`);
  return (
    <div className="cb-done cb-step" role="status">
      {hosts.length ? (
        <span className="cb-stack cb-donehosts">
          {hosts.slice(0, 3).map((h, i) => (
            <Avatar key={i} host={h} size="lg" />
          ))}
          <span className="cb-tick cb-ticksm">
            <Check size={16} />
          </span>
        </span>
      ) : (
        <span className="cb-tick">
          <Check size={26} />
        </span>
      )}
      <h1 className="cb-two" style={{ fontSize: "1.6em" }}>
        You&apos;re booked
        {email && <span className="cb-gray">The invite is on its way to {email}</span>}
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
          <span>{join ? LOCATION_LABEL[type.location.kind] : (type.location.detail ?? LOCATION_LABEL[type.location.kind])}</span>
        </div>
        {join ? (
          <a className="cb-btn" href={join} target="_blank" rel="noopener" style={{ textDecoration: "none", alignSelf: "flex-start" }}>
            <Video size={15} /> Join link
          </a>
        ) : video ? (
          <span className="cb-small cb-muted">The join link is in your invite.</span>
        ) : null}
      </div>
      <div className="cb-add">
        <span className="cb-eyebrow">Add to calendar</span>
        <div className="cb-chips">
          <a href={links.google} target="_blank" rel="noopener">
            Google
          </a>
          <a href={links.outlook} target="_blank" rel="noopener">
            Outlook
          </a>
          {ics ? (
            <a href={ics} download>
              Apple
            </a>
          ) : null}
        </div>
      </div>
      <div className="cb-chips" style={{ justifyContent: "center" }}>
        <a className="cb-btn cb-ghost" href={manage("move")} target="_top" style={{ textDecoration: "none" }}>
          Reschedule
        </a>
        <a className="cb-btn cb-ghost" href={manage("cancel")} target="_top" style={{ textDecoration: "none" }}>
          Cancel
        </a>
      </div>
    </div>
  );
}
