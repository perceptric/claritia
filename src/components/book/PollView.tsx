"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Clock, Users } from "@/components/Icons";
import { byDay, LOCATION_LABEL, lengthLabel } from "@/lib/meetings/guest";
import type { PollView as Poll } from "@/lib/meetings/public";
import { Avatar, dayLong, LocationIcon, timeIn } from "./BookingCalendar";
import { use12h, useMounted, useZone } from "./browser";
import { ZonePicker } from "./ZonePicker";

// A meeting poll (docs/meetings-scheduler.md 1.8b): guests pick every time that works, with their name and email;
// the host books the winner. Voting again with the same email replaces the vote.

export function PollView({ token, initial, turnstileKey }: { token: string; initial: Poll; turnstileKey?: string | null }) {
  const [poll, setPoll] = useState(initial);
  const detected = useZone();
  const [tzPick, setTz] = useState<string | null>(null);
  const tz = tzPick ?? detected;
  const h12 = use12h();
  const mounted = useMounted();
  const [picks, setPicks] = useState<Set<number>>(new Set());
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [err, setErr] = useState<{ error: string; field?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [token2, setToken2] = useState("");
  const tsBox = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!turnstileKey || !tsBox.current) return;
    const w = window as unknown as { turnstile?: { render: (el: Element, o: object) => void } };
    const draw = () => tsBox.current && w.turnstile?.render(tsBox.current, { sitekey: turnstileKey, callback: (t: string) => setToken2(t) });
    if (w.turnstile) return void draw();
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    s.async = true;
    s.onload = draw;
    document.head.append(s);
  }, [turnstileKey]);

  const days = useMemo(() => byDay(poll.times, tz), [poll.times, tz]);
  const counts = useMemo(() => new Map(poll.times.map((t) => [t.start, t.n])), [poll.times]);
  const toggle = (t: number) =>
    setPicks((p) => {
      const n = new Set(p);
      if (n.has(t)) n.delete(t);
      else n.add(t);
      return n;
    });

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!picks.size) return setErr({ error: "Pick at least one time." });
    if (!name.trim()) return setErr({ error: "Add your name.", field: "name" });
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErr({ error: "Add a valid email.", field: "email" });
    setBusy(true);
    try {
      const r = await fetch(`/api/book/p/${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, email, picks: [...picks], turnstile: token2 || undefined }) });
      const j = (await r.json().catch(() => ({}))) as Partial<Poll> & { ok?: boolean; error?: string; field?: string };
      if (j.ok && j.times) {
        setPoll(j as Poll);
        setSent(true);
      } else setErr({ error: j.error ?? "Try again in a moment.", field: j.field });
    } catch {
      setErr({ error: "Try again in a moment." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cb-step">
      <div className="cb-section">
        {poll.host && (
          <div className="cb-hosts">
            <Avatar host={poll.host} />
            <span className="cb-muted" style={{ fontWeight: 500 }}>
              {poll.host.name}
            </span>
          </div>
        )}
        <h1 className="cb-h" style={{ fontSize: "1.6em" }}>
          {poll.title}
        </h1>
        <div className="cb-meta">
          <div className="cb-row">
            <Clock size={16} />
            <span>{lengthLabel(poll.length)}</span>
          </div>
          <div className="cb-row">
            <LocationIcon kind={poll.location.kind} />
            <span>{poll.location.detail ?? LOCATION_LABEL[poll.location.kind]}</span>
          </div>
          {poll.voters > 0 && (
            <div className="cb-row">
              <Users size={16} />
              <span>{poll.voters === 1 ? "1 vote" : `${poll.voters} votes`}</span>
            </div>
          )}
        </div>
      </div>
      {poll.closed ? (
        <div className="cb-section">
          <p style={{ margin: 0, fontWeight: 500 }}>This poll is closed.</p>
        </div>
      ) : sent ? (
        <div className="cb-section" style={{ alignItems: "center", textAlign: "center" }}>
          <span className="cb-tick">
            <Check size={24} />
          </span>
          <h2 className="cb-h" style={{ fontSize: "1.2em" }}>
            Your times are in
          </h2>
          <p className="cb-muted" style={{ margin: 0 }}>
            The invite comes to {email.trim()} once a time is picked.
          </p>
          <button type="button" className="cb-btn cb-ghost" onClick={() => setSent(false)}>
            Change my times
          </button>
        </div>
      ) : (
        <form className="cb-section" onSubmit={send} noValidate>
          <h2 className="cb-h" style={{ fontSize: "1.1em" }}>
            Pick every time that works
          </h2>
          {!mounted ? (
            <div className="cb-sk" />
          ) : !poll.times.length ? (
            <p className="cb-muted" style={{ margin: 0 }}>
              No times left in this poll.
            </p>
          ) : (
            [...days].map(([d, list]) => (
              <div key={d} className="cb-field">
                <span className="cb-label">{dayLong(d)}</span>
                {list.map((s) => (
                  <button key={s.start} type="button" role="checkbox" aria-checked={picks.has(s.start)} className="cb-vote" onClick={() => toggle(s.start)}>
                    <span className="cb-box">{picks.has(s.start) && <Check size={14} />}</span>
                    <span style={{ flex: 1, fontWeight: 500 }}>
                      {timeIn(s.start, tz, h12)} to {timeIn(s.start + poll.length * 60_000, tz, h12)}
                    </span>
                    {(counts.get(s.start) ?? 0) > 0 && <span className="cb-tag">{counts.get(s.start)}</span>}
                  </button>
                ))}
              </div>
            ))
          )}
          <div className="cb-zone" style={{ marginTop: 0 }}>
            <ZonePicker value={tz} onChange={setTz} hour12={h12} />
          </div>
          <label className="cb-field">
            <span>Name</span>
            <input className="cb-in" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={200} aria-invalid={err?.field === "name"} />
          </label>
          <label className="cb-field">
            <span>Email</span>
            <input className="cb-in" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={320} aria-invalid={err?.field === "email"} />
          </label>
          {turnstileKey && <div ref={tsBox} />}
          {err && (
            <p className="cb-err" role="alert">
              {err.error}
            </p>
          )}
          <div>
            <button type="submit" className="cb-btn" disabled={busy || !poll.times.length}>
              Send my times
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
