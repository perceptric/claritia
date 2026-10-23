"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, Dollar, Globe, Users } from "@/components/Icons";
import { LOCATION_LABEL, priceLabel, type GuestSlot, type GuestType } from "@/lib/meetings/guest";
import type { GuestMeeting } from "@/lib/meetings/public";
import { BookingCalendar, go, hostLine, LocationIcon, timeIn, whenLong } from "./BookingCalendar";
import { use12h, useZone } from "./browser";

// The guest's manage link (docs/meetings-scheduler.md 1.7): the meeting, then reschedule (a new time from the same
// type, through the same calendar) or cancel with an optional reason. After paying, it waits for Stripe's word.

const STATUS: Record<GuestMeeting["status"], string> = { booked: "Booked", pending_payment: "Waiting for payment", canceled: "Canceled", held: "Done", no_show: "Missed" };

export function ManageView({ token, initial, paid, embed }: { token: string; initial: GuestMeeting; paid?: boolean; embed?: boolean }) {
  const [m, setM] = useState(initial);
  const [mode, setMode] = useState<"view" | "move" | "cancel">("view");
  const tz = useZone();
  const h12 = use12h();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const endpoint = `/api/book/m/${token}`;

  // Back from Stripe: the webhook usually lands within seconds.
  const waiting = paid && m.status === "pending_payment";
  useEffect(() => {
    if (!waiting) return;
    let n = 0;
    const t = setInterval(async () => {
      n++;
      const r = await fetch(endpoint, { cache: "no-store" }).catch(() => null);
      const j = r?.ok ? ((await r.json()) as { meeting: GuestMeeting }) : null;
      if (j && j.meeting.status !== "pending_payment") setM(j.meeting);
      if (n > 40) clearInterval(t);
    }, 2500);
    return () => clearInterval(t);
  }, [waiting, endpoint]);

  const len = Math.round((m.end - m.start) / 60_000);
  const type: GuestType = { slug: "", name: m.name, kind: "one", lengths: [len], location: m.location ?? { kind: "google_meet" }, questions: [], price: null, seats: null, hosts: m.hosts };
  const load = useCallback(async () => {
    const r = await fetch(`${endpoint}?slots=1`, { cache: "no-store" });
    if (!r.ok) throw new Error("load");
    return ((await r.json()) as { slots: GuestSlot[] }).slots;
  }, [endpoint]);

  const post = async (body: object) => {
    const r = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: r.status, j: (await r.json().catch(() => ({}))) as { ok?: boolean; meeting?: GuestMeeting; error?: string; slots?: GuestSlot[] } };
  };

  if (mode === "move")
    return (
      <BookingCalendar
        type={type}
        load={load}
        banner={
          <div className="cb-when" style={{ marginBottom: 16 }}>
            <span className="cb-small cb-muted">Now</span>
            <span style={{ textDecoration: "line-through", textDecorationColor: "var(--clr-muted)" }}>
              {timeIn(m.start, tz, h12)}, {whenLong(m.start, tz)}
            </span>
            <button type="button" className="cb-back" style={{ margin: "6px 0 0" }} onClick={() => setMode("view")}>
              Keep this time
            </button>
          </div>
        }
        move={async (start) => {
          const { j } = await post({ action: "reschedule", start });
          if (j.ok && j.meeting) {
            setM(j.meeting);
            setMode("view");
            setNote("Moved. The invite is updated.");
            return { ok: true };
          }
          return { ok: false, error: j.error ?? "Try again in a moment.", slots: j.slots };
        }}
      />
    );

  const cancel = async () => {
    setBusy(true);
    setErr(null);
    try {
      const { j } = await post({ action: "cancel", reason });
      if (j.ok && j.meeting) {
        setM(j.meeting);
        setMode("view");
        setNote(null);
      } else setErr(j.error ?? "Try again in a moment.");
    } catch {
      setErr("Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  const tone = m.status === "canceled" ? "cb-warn" : m.status === "booked" || m.status === "held" ? "cb-ok" : "";
  return (
    <div className="cb-step">
      <div className="cb-section">
        <span>
          <span className={`cb-tag ${tone}`}>{waiting ? "Confirming payment" : STATUS[m.status]}</span>
        </span>
        <h1 className="cb-h" style={{ fontSize: "1.6em", textDecoration: m.status === "canceled" ? "line-through" : undefined }}>
          {m.name}
        </h1>
        <div className="cb-meta">
          {m.hosts.length > 0 && (
            <div className="cb-row">
              <Users size={16} />
              <span>{hostLine(m.hosts)}</span>
            </div>
          )}
          <div className="cb-row">
            <Clock size={16} />
            <span suppressHydrationWarning>
              {timeIn(m.start, tz, h12)} to {timeIn(m.end, tz, h12)}, {whenLong(m.start, tz)}
            </span>
          </div>
          <div className="cb-row">
            <Globe size={16} />
            <span suppressHydrationWarning>{tz.replace(/_/g, " ")}</span>
          </div>
          {m.location && (
            <div className="cb-row">
              <LocationIcon kind={m.location.kind} />
              <span>{m.location.detail ?? LOCATION_LABEL[m.location.kind]}</span>
            </div>
          )}
          {m.payment && (
            <div className="cb-row">
              <Dollar size={16} />
              <span>
                {priceLabel(m.payment)}
                {m.payment.refunded ? ", refunded" : ""}
              </span>
            </div>
          )}
        </div>
        {m.status === "canceled" && m.reason && <p className="cb-muted cb-small" style={{ margin: 0 }}>{m.reason}</p>}
        {note && <p className="cb-small" style={{ margin: 0, fontWeight: 500 }} role="status">{note}</p>}
      </div>
      {mode === "cancel" ? (
        <div className="cb-section">
          <label className="cb-field">
            <span>Reason (optional)</span>
            <textarea className="cb-in" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} autoFocus />
          </label>
          {err && (
            <p className="cb-err" role="alert">
              {err}
            </p>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="cb-btn cb-danger" onClick={cancel} disabled={busy}>
              Cancel meeting
            </button>
            <button type="button" className="cb-btn cb-ghost" onClick={() => setMode("view")} disabled={busy}>
              Keep it
            </button>
          </div>
        </div>
      ) : (
        (m.reschedule || m.cancel || m.payment?.url || (m.status === "canceled" && m.wsSlug && m.typeSlug)) && (
          <div className="cb-section" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {m.payment?.url && !waiting && (
              <button type="button" className="cb-btn" onClick={() => go(m.payment!.url!, embed)}>
                Complete payment
              </button>
            )}
            {m.reschedule && (
              <button type="button" className="cb-btn" onClick={() => (setNote(null), setMode("move"))}>
                Reschedule
              </button>
            )}
            {m.cancel && (
              <button type="button" className="cb-btn cb-ghost" onClick={() => setMode("cancel")}>
                Cancel
              </button>
            )}
            {m.status === "canceled" && m.wsSlug && m.typeSlug && (
              <a className="cb-btn cb-ghost" href={`/book/${m.wsSlug}/${m.typeSlug}`} style={{ textDecoration: "none" }}>
                Book again
              </a>
            )}
          </div>
        )
      )}
    </div>
  );
}
