"use client";

// The sign-in screen's picture: Claritia's flow as a small, looping product scene. A visitor fills a form, books a
// meeting, and the follow-up emails go out. One clock (`t`, in ms) drives every frame; under reduced motion it stands
// on the finished state.

import { useEffect, useState } from "react";
import { CalendarIcon, Check, Clock, Mail } from "../Icons";

const TYPE = 55; // ms per typed character

const FIELDS = [
  { label: "Name", hint: "Your name", value: "Ana Lima", at: 500 },
  { label: "Work email", hint: "you@company.com", value: "ana@acme.com", at: 1200 },
  { label: "What do you need?", hint: "A few words", value: "A demo for our team", at: 2100 },
] as const;
const SEND = 3500; // the Send pill is pressed
const SENT = 3700;
const MEETING = 4400; // the booking step starts
const DAY = MEETING + 600; // Thu is picked
const TIME = MEETING + 1500; // 10:30 is picked
const CONFIRM = MEETING + 2300; // Confirm is pressed
const BOOKED = MEETING + 2700;
const EMAILS = 9000; // the follow-up step starts
const MAILS = [
  { title: "Meeting confirmed", when: "Now", at: EMAILS + 300 },
  { title: "Reminder", when: "1 day before", at: EMAILS + 1300 },
  { title: "Thanks for your time", when: "After the call", at: EMAILS + 2300 },
] as const;
const SENT_AFTER = 700;
const END = EMAILS + 5200; // the loop starts again
const LEAVE = 280; // each step fades out over the calm speed before the next one
const TICK = 50;
const FINISHED = EMAILS + 3400; // the still frame under reduced motion

const DAYS = [
  ["Mon", "16"],
  ["Tue", "17"],
  ["Wed", "18"],
  ["Thu", "19"],
  ["Fri", "20"],
] as const;
const PICKED_DAY = 3;
const TIMES = ["9:00", "9:30", "10:30", "11:00", "13:00", "14:30"] as const;
const PICKED_TIME = 2;

const STEPS = ["Form", "Meeting", "Emails"] as const;

const typed = (t: number, value: string, at: number) => value.slice(0, Math.max(0, Math.min(value.length, Math.floor((t - at) / TYPE))));
const typingEnd = (f: (typeof FIELDS)[number]) => f.at + f.value.length * TYPE;

/** The clock: counts up and loops, or stands on the finished frame under reduced motion. */
function useLoop(): number {
  const [t, setT] = useState(0);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) clearInterval(timer);
      timer = null;
      if (mq.matches) {
        setT(FINISHED);
        return;
      }
      setT(0);
      timer = setInterval(() => setT((v) => (v + TICK >= END ? 0 : v + TICK)), TICK);
    };
    start();
    mq.addEventListener("change", start);
    return () => {
      if (timer) clearInterval(timer);
      mq.removeEventListener("change", start);
    };
  }, []);
  return t;
}

export function FlowDemo({ className = "" }: { className?: string }) {
  const t = useLoop();
  const step = t < MEETING ? 0 : t < EMAILS ? 1 : 2;
  const stepEnd = [MEETING, EMAILS, END][step]!;
  const leaving = t >= stepEnd - LEAVE;
  return (
    <div className={`w-full ${className}`} role="img" aria-label="A visitor fills a form, books a meeting, and the follow-up emails go out.">
      <div aria-hidden="true" className="flex flex-col gap-4">
        <Steps step={step} />
        <div className="min-h-[318px] rounded-xl bg-card p-5 shadow-hover">
          <div key={step} className={`anim-rise-sm flex min-h-[278px] flex-col transition-opacity duration-[280ms] ease-calm ${leaving ? "opacity-0" : "opacity-100"}`}>
            {step === 0 ? <FormStep t={t} /> : step === 1 ? <MeetingStep t={t} /> : <EmailsStep t={t} />}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Form, Meeting, Emails: done ones carry a check, the open one is green. */
function Steps({ step }: { step: number }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-center gap-2">
      {STEPS.map((name, i) => (
        <span key={name} className="flex min-w-0 items-center gap-2">
          {i > 0 ? <span className={`h-px w-6 transition-colors duration-[280ms] ${i <= step ? "bg-muted" : "bg-line-strong"}`} /> : null}
          <span
            className={`inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium transition-[background-color,color] duration-[280ms] ease-calm ${
              i === step ? "bg-signal-soft text-signal-text shadow-chip" : i < step ? "bg-card text-ink shadow-chip" : "bg-card text-muted shadow-chip"
            }`}
          >
            {i < step ? <Check size={12} className="text-muted" /> : <span className="num text-[11px] opacity-70">{i + 1}</span>}
            {name}
          </span>
        </span>
      ))}
    </div>
  );
}

function FormStep({ t }: { t: number }) {
  const pressed = t >= SEND && t < SENT;
  const sent = t >= SENT;
  return (
    <div className="flex flex-1 flex-col gap-4">
      <p className="text-[15px] font-medium tracking-[-0.01em] text-ink">Book a demo</p>
      <div className="flex flex-col gap-3">
        {FIELDS.map((f) => {
          const value = typed(t, f.value, f.at);
          const typing = t >= f.at && t < typingEnd(f) + 200;
          return (
            <div key={f.label} className="flex min-w-0 flex-col gap-1.5">
              <span className="text-[12.5px] font-medium text-body">{f.label}</span>
              <span className="flex min-h-9 min-w-0 items-center rounded-md bg-card px-3 py-2 text-[13px] leading-[18px] shadow-input">
                <span className={`min-w-0 break-words ${value ? "text-text" : "text-faint"}`}>{value || (typing ? "" : f.hint)}</span>
                {typing ? <span className="ml-px inline-block h-[15px] w-px shrink-0 bg-ink" /> : null}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-auto flex min-w-0 flex-wrap justify-end">
        <span
          className={`inline-flex h-[34px] items-center gap-1.5 rounded-full bg-brand px-4 text-[13.5px] font-medium text-on-brand shadow-primary transition-transform duration-[150ms] ease-out ${pressed ? "scale-[0.94]" : "scale-100"}`}
        >
          {sent ? <Check size={14} /> : null}
          {sent ? "Sent" : "Send"}
        </span>
      </div>
    </div>
  );
}

function MeetingStep({ t }: { t: number }) {
  if (t >= BOOKED) return <Booked />;
  const day = t >= DAY;
  const time = t >= TIME;
  const pressed = t >= CONFIRM && t < BOOKED;
  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-paper-deep text-[11.5px] font-semibold text-body">SR</span>
        <div className="flex min-w-0 flex-col">
          <span className="text-[15px] font-medium tracking-[-0.01em] text-ink">Intro call</span>
          <span className="text-[12.5px] text-muted">30 min with Sam Reed</span>
        </div>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {DAYS.map(([name, n], i) => {
          const on = day && i === PICKED_DAY;
          return (
            <span
              key={name}
              className={`flex min-w-0 flex-col items-center gap-0.5 rounded-lg py-2 transition-[background-color,color] duration-[280ms] ease-calm ${on ? "bg-signal-soft text-signal-text shadow-chip" : "bg-card text-body shadow-chip"}`}
            >
              <span className={`text-[11.5px] ${on ? "" : "text-muted"}`}>{name}</span>
              <span className="num text-[14px] font-medium">{n}</span>
            </span>
          );
        })}
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {TIMES.map((x, i) => {
          const on = time && i === PICKED_TIME;
          return (
            <span
              key={x}
              className={`num flex h-8 items-center justify-center rounded-full text-[13px] transition-[background-color,color,opacity] duration-[280ms] ease-calm ${day ? "opacity-100" : "opacity-40"} ${on ? "bg-chip font-medium text-ink shadow-chip" : "bg-card text-body shadow-chip"}`}
            >
              {x}
            </span>
          );
        })}
      </div>
      <div className="mt-auto flex min-w-0 flex-wrap items-center justify-between gap-2">
        <span className={`text-[13px] ${time ? "text-text" : "text-faint"}`}>{time ? "Thu 19 Nov, 10:30" : day ? "Pick a time" : "Pick a day"}</span>
        <span
          className={`inline-flex h-[34px] items-center rounded-full bg-brand px-4 text-[13.5px] font-medium text-on-brand shadow-primary transition-[transform,opacity] duration-[150ms] ease-out ${time ? "opacity-100" : "opacity-45"} ${pressed ? "scale-[0.94]" : "scale-100"}`}
        >
          Confirm
        </span>
      </div>
    </div>
  );
}

function Booked() {
  return (
    <div className="anim-rise-sm flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <span className="inline-flex size-11 items-center justify-center rounded-full bg-signal-strong text-white">
        <Check size={20} />
      </span>
      <div className="flex flex-col gap-1">
        <span className="text-[17px] font-medium tracking-[-0.01em] text-ink">Meeting booked</span>
        <span className="text-[13px] text-muted">Ana Lima and Sam Reed</span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center justify-center gap-2">
        <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-card px-3 text-[12.5px] text-body shadow-chip">
          <CalendarIcon size={13} className="text-muted" />
          Thu 19 Nov, 10:30
        </span>
        <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-card px-3 text-[12.5px] text-body shadow-chip">
          <Clock size={13} className="text-muted" />
          30 min
        </span>
      </div>
    </div>
  );
}

function EmailsStep({ t }: { t: number }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex min-w-0 flex-col">
        <span className="text-[15px] font-medium tracking-[-0.01em] text-ink">Follow-up</span>
        <span className="text-[12.5px] break-words text-muted">To ana@acme.com</span>
      </div>
      <div className="flex flex-col divide-y divide-line rounded-lg bg-card shadow-rest">
        {MAILS.filter((m) => t >= m.at).map((m) => {
          const sent = t >= m.at + SENT_AFTER;
          return (
            <div key={m.title} className="anim-rise-sm flex min-w-0 flex-wrap items-center gap-3 px-3 py-3">
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-paper-deep text-body">
                <Mail size={15} />
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-[13px] font-medium break-words text-ink">{m.title}</span>
                <span className="text-[12px] text-muted">{m.when}</span>
              </div>
              <span className={`inline-flex items-center gap-1 text-[12.5px] transition-colors duration-[280ms] ${sent ? "text-body" : "text-faint"}`}>
                {sent ? <Check size={14} className="text-signal" /> : null}
                {sent ? "Sent" : "Sending"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
