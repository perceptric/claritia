"use client";

// Route & book (docs/routing-workflow.md Section 14), from a contact or a policy's header. It opens on the contact,
// its owner, the published policy and the meeting type, with the values the policy's rules test (changes stay in this
// handoff, never written to the CRM). Find recipient previews: Suggested recipient, Not assigned yet, whose ownership
// changes, and that person's real times. Assign without booking or Confirm handoff & book commit once (the drawer's
// operation id); when routing changed since the preview, the new suggestion is shown and has to be looked at first.
// A booking that fails keeps the assignment: "Lead assigned to Ana. Meeting not confirmed."

import { useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { countryName } from "@/lib/router/conditions";
import { fieldOf, firstName, reasonWords } from "@/lib/routing/screenModel";
import { Search } from "../../../Icons";
import { Sheet } from "../../Sheet";
import { Badge, Button, ErrorNote, Loading, type ViewProps } from "../../ui";
import { rt, newKey, useScreen, type Confirmed, type Preview, type Screen } from "./api";
import { Initials, namesOf, PersonChoice, slotWords } from "./parts";

type Step = "start" | "found" | "assigned" | "pending" | "booked" | "failed";

export function HandoffDrawer({ session, ws, sb, contactId, d: given, onClose, onDone }: Pick<ViewProps, "session" | "ws"> & { sb?: SupabaseClient; contactId?: string | null; d?: Screen; onClose: () => void; onDone?: () => void }) {
  const q = useScreen(session, ws.id);
  const d = given ?? q.data;
  const [contact, setContact] = useState<string | null>(contactId ?? null);
  return (
    <Sheet title="Route & book" onClose={onClose} width={620} footer={undefined}>
      {!contact ? <ContactPick sb={sb} ws={ws.id} onPick={setContact} /> : !d ? <Loading /> : <Handoff key={contact} session={session} ws={ws} d={d} contact={contact} onClose={onClose} onDone={onDone} />}
    </Sheet>
  );
}

/** From a policy's header: pick the contact first. */
function ContactPick({ sb, ws, onPick }: { sb?: SupabaseClient; ws: string; onPick: (id: string) => void }) {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<{ id: string; first_name: string | null; last_name: string | null; email: string | null }[]>([]);
  useEffect(() => {
    if (!sb || text.trim().length < 2) return;
    const t = setTimeout(async () => {
      const like = `%${text.trim().replace(/[%_,()]/g, "")}%`;
      const r = await sb.from("contacts").select("id, first_name, last_name, email").eq("workspace_id", ws).is("deleted_at", null).or(`email.ilike.${like},first_name.ilike.${like},last_name.ilike.${like}`).limit(8);
      setRows((r.data ?? []) as typeof rows);
    }, 200);
    return () => clearTimeout(t);
  }, [sb, text, ws]);
  return (
    <div className="flex flex-col gap-2 p-4 text-[13px]">
      <label className="flex h-[30px] items-center gap-2 rounded-sm border border-line-strong bg-card px-2.5 focus-within:border-ink">
        <Search size={13} className="text-muted" />
        <input autoFocus aria-label="Find a contact" placeholder="Find a contact" value={text} onChange={(e) => setText(e.target.value)} className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-faint" />
      </label>
      {(text.trim().length >= 2 ? rows : []).map((c) => (
        <button key={c.id} type="button" onClick={() => onPick(c.id)} className="flex flex-col rounded-md px-2.5 py-1.5 text-left hover:bg-hover">
          <span className="font-medium text-ink">{[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email}</span>
          <span className="text-[12px] text-muted">{c.email}</span>
        </button>
      ))}
    </div>
  );
}

function Handoff({ session, ws, d, contact, onClose, onDone }: Pick<ViewProps, "session" | "ws"> & { d: Screen; contact: string; onClose: () => void; onDone?: () => void }) {
  const names = useMemo(() => namesOf(d.people, d.teams), [d.people, d.teams]);
  const op = useRef(newKey("ho"));
  const [base, setBase] = useState<Preview | null>(null);
  const [res, setRes] = useState<Preview | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [step, setStep] = useState<Step>("start");
  const [slot, setSlot] = useState<number | null>(null);
  const [changed, setChanged] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ run: string; owner: string; start: number | null } | null>(null);
  const [slots, setSlots] = useState<number[] | null>(null);
  // A workspace owner may choose someone else than the suggestion (Section 14): in scope, eligible, with a reason.
  const [other, setOther] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const show = (v: unknown, key: string) => {
    if (v === null || v === undefined || v === "") return "";
    const f = fieldOf(key, d.fields);
    return f.type === "country" && typeof v === "string" ? v : Array.isArray(v) ? v.join(", ") : String(v);
  };
  useEffect(() => {
    rt<Preview>(session, ws.id, "rt_handoff_preview", { contact })
      .then((p) => {
        setBase(p);
        setValues(Object.fromEntries(p.fields.map((f) => [f.key, show(f.value, f.key)])));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't open this contact."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact, session, ws.id]);

  const who = (u: string | null | undefined) => (u ? (names.people[u] ?? "Former teammate") : "Nobody");
  const local = () => {
    // Only values the person changed go with the request, labeled as this handoff's.
    const out: Record<string, string> = {};
    for (const f of base?.fields ?? []) if ((values[f.key] ?? "") !== show(f.value, f.key)) out[f.key] = values[f.key] ?? "";
    return out;
  };
  const find = async () => {
    setBusy(true);
    setError("");
    try {
      const p = await rt<Preview>(session, ws.id, "rt_handoff_preview", { contact, values: local() });
      setRes(p);
      setSlots(p.availability?.slots ?? null);
      setSlot(null);
      setOther(null);
      setReason("");
      setStep("found");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't find a recipient.");
    } finally {
      setBusy(false);
    }
  };
  const poll = async (run: string) => {
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const s = await rt<{ state: string }>(session, ws.id, "rt_handoff_status", { run }).catch(() => null);
      if (s?.state === "confirmed") return setStep("booked");
      if (s?.state === "failed") return setStep("failed");
    }
  };
  const confirm = async (book: boolean) => {
    if (!res) return;
    setBusy(true);
    setError("");
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const override = other && other !== res.recipient ? { user: other, reason: reason.trim() } : null;
      const out = await rt<Confirmed>(session, ws.id, "rt_handoff_confirm", { contact, op: op.current, ref: res.ref, values: local(), ...(book && slot && !override ? { book: { start: slot, tz } } : {}), ...(override ? { override } : {}) });
      if (out.status === "changed") {
        setRes(out.preview);
        setSlots(out.preview.availability?.slots ?? null);
        setSlot(null);
        setChanged(out.reason === "ownership_changed" ? `Owner changed to ${who(out.preview.contact.owner)} since your preview. Review the new recipient before confirming.` : "Routing changed since your preview. Review the new recipient before confirming.");
        return;
      }
      if (out.status === "review") {
        setError("This lead needs review: it wasn't assigned.");
        return;
      }
      setDone({ run: out.run, owner: out.owner, start: slot });
      onDone?.();
      const b = out.booking;
      if (b.state === "not_requested") setStep("assigned");
      else if (b.state === "pending_confirmation") {
        setStep("pending");
        void poll(out.run);
      } else if (b.state === "slot_taken") {
        setSlots(b.slots);
        setSlot(null);
        setStep("failed");
        setError("That time was just taken. Please choose another.");
      } else setStep("failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the handoff.");
    } finally {
      setBusy(false);
    }
  };
  const rebook = async () => {
    if (!done || !slot) return;
    setBusy(true);
    setError("");
    try {
      const out = await rt<{ state: string; slots?: number[] }>(session, ws.id, "rt_handoff_book", { run: done.run, start: slot, tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
      if (out.state === "slot_taken") {
        setSlots(out.slots ?? []);
        setSlot(null);
        setError("That time was just taken. Please choose another.");
        return;
      }
      setDone({ ...done, start: slot });
      setStep("pending");
      void poll(done.run);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't book.");
    } finally {
      setBusy(false);
    }
  };

  if (!base) return <div className="p-4">{error ? <ErrorNote message={error} /> : <Loading />}</div>;
  const p = res ?? base;
  const owner = base.contact.owner;
  const recipient = res?.state === "assigned" ? res.recipient : null;
  const why = res
    ? (() => {
        const t = res.trace;
        const picked = t.ownership.candidates.find((c) => c.outcome === "picked");
        if (picked) return picked.kind === "company" ? "Company owner" : "Contact owner";
        const dest = t.distribution.destination;
        const rule = t.rules.matched ? `${t.rules.matched.name} rule` : "Everyone else";
        return [rule, dest?.kind === "queue" ? dest.name : null, dest?.kind === "queue" ? "round robin" : null].filter(Boolean).join(" · ");
      })()
    : "";
  const ownerLine = recipient ? (owner === recipient ? `${firstName(who(recipient))} already owns this contact.` : owner ? `Owner will change from ${firstName(who(owner))} to ${firstName(who(recipient))}.` : `${firstName(who(recipient))} will own this contact.`) : "";
  const tz = res?.availability?.tz ?? null;
  const canBook = !!res?.meetingType && res.availability?.state === "ok";
  const blocked = !!changed;
  const pickable = step === "found" || (step === "failed" && !!slots?.length);

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 text-[13px]">
        <div className="rounded-[10px] border border-line">
          <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="font-medium text-ink">{p.contact.name || p.contact.email}</div>
              <div className="text-[12px] text-muted">{[p.contact.email, p.contact.company].filter(Boolean).join(" · ")}</div>
            </div>
            <span className="text-muted">Owner: {owner ? who(owner) : "None"}</span>
          </div>
          <div className="flex items-center gap-3 border-t border-line px-4 py-2.5">
            <span className="flex-1 font-medium text-ink">Policy</span>
            <span>
              {p.policy.name} · Published v{p.policy.version}
            </span>
          </div>
          <div className="flex items-center gap-3 border-t border-line px-4 py-2.5">
            <span className="flex-1 font-medium text-ink">Meeting type</span>
            <span>{p.meetingType ? `${p.meetingType.name}${p.meetingType.minutes ? ` · ${p.meetingType.minutes} min` : ""}` : "None"}</span>
          </div>
        </div>
        {base.fields.length ? (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {base.fields.map((f) => {
              const def = fieldOf(f.key, d.fields);
              return (
                <label key={f.key} className="flex min-w-0 flex-col gap-1 text-[12px] font-medium text-muted">
                  {def.label}
                  <input
                    value={values[f.key] ?? ""}
                    placeholder="Unknown"
                    disabled={step !== "start" && step !== "found"}
                    title={def.type === "country" && values[f.key] ? countryName(values[f.key]!) : undefined}
                    onChange={(e) => {
                      setValues({ ...values, [f.key]: e.target.value });
                      if (step === "found") {
                        setStep("start");
                        setRes(null);
                      }
                    }}
                    className="h-[30px] w-full rounded-sm border border-line-strong bg-card px-2.5 font-normal text-ink outline-none placeholder:text-faint focus:border-ink disabled:opacity-60"
                  />
                </label>
              );
            })}
          </div>
        ) : null}
        {step === "start" ? (
          <div>
            <Button size="sm" disabled={busy} onClick={() => void find()}>
              Find recipient
            </Button>
          </div>
        ) : null}
        {changed ? (
          <div role="alert" className="flex flex-wrap items-center gap-2.5 rounded-[10px] bg-butter-wash px-3 py-2.5 text-[12.5px] text-butter">
            <span className="flex-1 font-medium">{changed}</span>
            <Button variant="ghost" size="sm" onClick={() => setChanged(null)}>
              Review done
            </Button>
          </div>
        ) : null}
        {res && step !== "start" ? (
          res.state === "assigned" && recipient ? (
            <div className="rounded-[10px] border border-line">
              <div className="flex items-center gap-2.5 border-b border-line px-4 py-2.5">
                <Initials name={who(recipient)} />
                <span className="min-w-0 flex-1 font-semibold text-ink">
                  {step === "found" ? `Suggested recipient: ${who(recipient)}` : `Assigned to ${who(done?.owner ?? recipient)}`}
                </span>
                {step === "found" ? (
                  <Badge tone="amber" dot>
                    Not assigned yet
                  </Badge>
                ) : null}
              </div>
              <div className="px-4 py-2.5">
                <div className="font-medium text-ink">Why</div>
                <div className="text-[12px] text-muted">{why}</div>
              </div>
              {step === "found" ? <div className="border-t border-line px-4 py-2.5 font-medium text-ink">{ownerLine}</div> : null}
              {step === "found" && d.role === "owner" ? (
                <div className="flex flex-wrap items-center gap-2.5 border-t border-line px-4 py-2.5">
                  <span className="flex-1 font-medium text-ink">Recipient</span>
                  <PersonChoice label="Recipient" value={other ?? recipient} people={d.people} align="right" onChange={(u) => setOther(u && u !== recipient ? u : null)} />
                  {other ? (
                    <input
                      aria-label="Reason"
                      placeholder="Reason"
                      value={reason}
                      onChange={(e) => setReason(e.target.value.slice(0, 300))}
                      className="h-[30px] w-full rounded-sm border border-line-strong bg-card px-2.5 text-ink outline-none placeholder:text-faint focus:border-ink"
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex items-center gap-2.5 rounded-[10px] border border-line bg-paper px-3.5 py-3">
              <Badge tone="amber" dot>
                Needs review
              </Badge>
              <b className="font-semibold text-ink">No recipient: {reasonWords({ kind: res.state === "held_for_review" ? "held" : "unassigned", by: null, rule_name: null, held: null })}</b>
            </div>
          )
        ) : null}
        {res && recipient && pickable && res.meetingType && !other ? (
          res.availability?.state === "ok" || (slots && slots.length) ? (
            <>
              <div className="text-[12px] font-medium text-muted">
                {firstName(who(recipient))}&apos;s times{tz ? ` · ${tz}` : ""}
              </div>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {(slots ?? []).slice(0, 9).map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={slot === s}
                    disabled={blocked}
                    onClick={() => setSlot(s)}
                    className={`press h-8 rounded-full border text-[12.5px] transition-colors duration-[120ms] ${slot === s ? "border-ink bg-ink text-paper" : "border-line-strong bg-card text-ink hover:bg-hover"}`}
                  >
                    {slotWords(s, tz)}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="text-[12.5px] text-muted">
              {res.availability?.state === "calendar_disconnected"
                ? `${firstName(who(recipient))}'s calendar isn't connected`
                : res.availability?.state === "no_hours"
                  ? `${firstName(who(recipient))} has no working hours set`
                  : res.availability?.state === "no_slots"
                    ? `${firstName(who(recipient))} has no free times`
                    : "Calendar availability couldn't be loaded"}
            </div>
          )
        ) : null}
        {step === "assigned" ? (
          <Result badge={<Badge tone="green" dot>Assigned</Badge>} text={`Assigned to ${who(done?.owner)}`} line="No meeting requested" />
        ) : null}
        {step === "pending" ? <Result badge={<Badge tone="amber" dot>Pending confirmation</Badge>} text={`Lead assigned to ${firstName(who(done?.owner))}. Confirming the meeting with the calendar…`} /> : null}
        {step === "booked" ? <Result badge={<Badge tone="green" dot>Confirmed</Badge>} text={`Booked with ${who(done?.owner)}${done?.start ? ` · ${slotWords(done.start, tz)}` : ""}`} /> : null}
        {step === "failed" ? <Result badge={<Badge tone="red" dot>Not confirmed</Badge>} text={`Lead assigned to ${firstName(who(done?.owner))}. Meeting not confirmed.`} /> : null}
        <ErrorNote message={error} />
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-paper px-5 py-3">
        {step === "found" && recipient ? (
          <>
            <Button variant="ghost" disabled={busy || blocked || (!!other && !reason.trim())} onClick={() => void confirm(false)}>
              Assign without booking
            </Button>
            {res?.meetingType ? (
              <Button disabled={busy || blocked || !slot || !canBook || !!other} onClick={() => void confirm(true)}>
                Confirm handoff &amp; book
              </Button>
            ) : null}
          </>
        ) : step === "failed" && slots?.length ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button disabled={busy || !slot} onClick={() => void rebook()}>
              Book this time
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        )}
      </div>
    </div>
  );
}

function Result({ badge, text, line }: { badge: React.ReactNode; text: string; line?: string }) {
  return (
    <div role="status" className="flex flex-wrap items-center gap-2.5 rounded-[10px] border border-line bg-paper px-3.5 py-3">
      {badge}
      <b className="text-[14px] font-semibold text-ink">{text}</b>
      {line ? <span className="text-muted">{line}</span> : null}
    </div>
  );
}
