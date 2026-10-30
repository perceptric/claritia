"use client";

// Links (docs/meetings-scheduler.md 1.8b): a single-use link to a type, a one-off meeting (a few of your free times;
// it closes after one booking) or a poll (several times; guests vote and you book the winner). Made by the public
// booking routes (POST /api/book/links); the free times come from /api/meetings/times.

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { useMemo, useState } from "react";
import { postJson, Button, errorText, Loading, useLoad, type Workspace } from "../ui";
import { Pick, Seg, TextIn } from "../forms/controls";
import { lengthsText } from "./model";
import { CopyButton, meetingsApi, Modal } from "./parts";
import type { TypeLite } from "./MeetingsView";
import { TimesError } from "../scheduling/ConnectCalendar";

type Kind = "single_use" | "one_off" | "poll";
const KINDS: { value: Kind; label: string }[] = [
  { value: "single_use", label: "Single-use" },
  { value: "one_off", label: "One-off" },
  { value: "poll", label: "Poll" },
];
const OWN_LENGTHS = [15, 30, 45, 60, 90];

/** POST /api/book/links, and the guest's address from what comes back. */
async function makeLink(session: Session, body: Record<string, unknown>): Promise<string> {
  const r = await postJson<{ url?: string; token?: string }>(session, "/api/book/links", body);
  if (r.url) return r.url;
  if (r.token) return `${window.location.origin}/book/${body.kind === "poll" ? "p" : "l"}/${r.token}`;
  throw new Error("The link wasn't made.");
}

export function LinkDialog({ session, ws, types, initialType, initialKind = "single_use", onClose }: { sb: SupabaseClient; session: Session; ws: Workspace; types: TypeLite[]; initialType?: string; initialKind?: Kind; onClose: () => void }) {
  const [kind, setKind] = useState<Kind>(initialKind);
  const [typeId, setTypeId] = useState(initialType ?? (initialKind === "single_use" ? (types[0]?.id ?? "") : ""));
  const [length, setLength] = useState(30);
  const [title, setTitle] = useState("");
  const [picked, setPicked] = useState<number[]>([]);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const type = types.find((t) => t.id === typeId);
  const lengths = type?.lengths;

  const create = async () => {
    setError("");
    setBusy(true);
    try {
      if (kind === "single_use" && !typeId) throw new Error("Pick a meeting type.");
      if (kind === "one_off" && !picked.length) throw new Error("Pick at least one time.");
      if (kind === "poll" && picked.length < 2) throw new Error("Pick two or more times.");
      const offered = [...picked].sort((a, b) => a - b).map((s) => ({ start: new Date(s).toISOString(), end: new Date(s + length * 60_000).toISOString() }));
      setUrl(await makeLink(session, { workspaceId: ws.id, kind, typeId: typeId || null, ...(kind === "single_use" ? {} : { title: title.trim() || null, length, offered }) }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={url ? "Link ready" : "New link"}
      onClose={onClose}
      wide={kind !== "single_use" && !url}
      footer={
        url ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="plain" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={create} disabled={busy}>
              Create link
            </Button>
          </>
        )
      }
    >
      {url ? (
        <div className="anim-rise-sm flex items-center gap-2 rounded-lg border border-line bg-paper py-1.5 pr-1.5 pl-3.5">
          <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-ink">{url}</span>
          <CopyButton text={url} />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Seg<Kind> label="Kind of link" value={kind} options={KINDS} onChange={(k) => (setKind(k), setPicked([]))} />
          <div className="flex flex-col gap-2.5">
            <Labeled label="Meeting type">
              <Pick<string>
                label="Meeting type"
                value={typeId}
                options={[...(kind === "single_use" ? [] : [{ value: "", label: "Your own times" }]), ...types.map((t) => ({ value: t.id, label: t.name }))]}
                onChange={(v) => (setTypeId(v), setPicked([]))}
                placeholder="Pick a type"
              />
            </Labeled>
            {kind !== "single_use" ? (
              <>
                <Labeled label="Length">
                  <Pick<number> label="Length" value={length} options={(lengths?.length ? lengths : OWN_LENGTHS).map((n) => ({ value: n, label: lengthsText([n]) }))} onChange={(n) => (setLength(n), setPicked([]))} />
                </Labeled>
                <Labeled label="Title">
                  <TextIn label="Title" value={title} onChange={setTitle} placeholder={type?.name ?? "Meeting"} />
                </Labeled>
              </>
            ) : null}
          </div>
          {kind !== "single_use" ? <TimePicker session={session} ws={ws.id} typeId={typeId} length={length} picked={picked} onChange={setPicked} max={kind === "one_off" ? 10 : 20} /> : null}
        </div>
      )}
      {error ? (
        <div className="mt-3">
          <TimesError message={error} session={session} ws={ws.id} />
        </div>
      ) : null}
    </Modal>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[100px_minmax(0,1fr)] items-center gap-2">
      <span className="text-[12px] text-muted">{label}</span>
      {children}
    </div>
  );
}

/** Your free times over the next two weeks: days across the top, the day's times as pills to pick. */
export function TimePicker({ session, ws, typeId, length, picked, onChange, max }: { session: Session; ws: string; typeId: string; length: number; picked: number[]; onChange: (v: number[]) => void; max: number }) {
  const free = useLoad(async () => (await meetingsApi<{ starts: number[] }>(session, ws, "times", { pick: true, typeId: typeId || undefined, length })).starts, `${typeId}:${length}`);
  const days = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const s of free.data ?? []) {
      const d = new Date(s).toLocaleDateString("en-CA");
      m.set(d, [...(m.get(d) ?? []), s]);
    }
    return [...m.entries()];
  }, [free.data]);
  const [day, setDay] = useState("");
  const open = days.find(([d]) => d === day) ?? days[0];
  const toggle = (s: number) => onChange(picked.includes(s) ? picked.filter((x) => x !== s) : picked.length >= max ? picked : [...picked, s]);

  if (free.error) return <TimesError message={free.error} session={session} ws={ws} />;
  if (!free.data) return <Loading />;
  if (!days.length) return <p className="py-6 text-center text-[13.5px] text-muted">No free times in the next two weeks</p>;
  return (
    <div className="flex flex-col gap-3">
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {days.map(([d, starts]) => {
          const date = new Date(starts[0]!);
          const on = open?.[0] === d;
          const n = starts.filter((s) => picked.includes(s)).length;
          return (
            <button
              key={d}
              type="button"
              onClick={() => setDay(d)}
              aria-pressed={on}
              className={`press relative flex w-14 shrink-0 flex-col items-center gap-0.5 rounded-lg border py-2 transition-colors duration-[140ms] ${on ? "border-ink bg-ink text-paper" : "border-line bg-card text-ink hover:border-line-strong"}`}
            >
              <span className={`text-[11px] font-medium ${on ? "text-paper" : "text-muted"}`}>{date.toLocaleDateString("en-US", { weekday: "short" })}</span>
              <span className="text-[17px] leading-none font-semibold tracking-[-0.02em] tabular-nums">{date.getDate()}</span>
              {n ? <span className={`absolute -top-1.5 -right-1.5 flex size-[18px] items-center justify-center rounded-full text-[10.5px] font-semibold ${on ? "bg-clay text-paper" : "bg-ink text-paper"}`}>{n}</span> : null}
            </button>
          );
        })}
      </div>
      <div className="grid max-h-56 grid-cols-3 gap-1.5 overflow-y-auto sm:grid-cols-5">
        {open?.[1].map((s) => {
          const on = picked.includes(s);
          return (
            <button
              key={s}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(s)}
              className={`press h-9 rounded-full border text-[12.5px] font-medium tabular-nums transition-colors duration-[140ms] ${on ? "border-ink bg-ink text-paper" : "border-line-strong bg-card text-ink hover:border-ink/40"}`}
            >
              {new Date(s).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </button>
          );
        })}
      </div>
      <span className="text-[12px] text-muted tabular-nums">{picked.length ? `${picked.length} picked` : ""}</span>
    </div>
  );
}
