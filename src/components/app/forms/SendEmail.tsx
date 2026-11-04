"use client";

// Share › Email › Send the link (docs/sharing-plan.md): who it goes to as chips, with the people Claritia already knows
// suggested as you type, and Add people for everyone who filled this form, a meeting type's guests, a CSV or a pasted
// list. From (you or the team), the subject and a note, then Send. Under it, the last sends and where each person is.

import { useRef, useState } from "react";
import type { Form } from "@/lib/forms/schema";
import { emailsIn, formFillers, meetingGuests, meetingTypes, SEND_STATUS, shareSends, suggestPeople, type Person, type SendStatus } from "@/lib/share/people";
import { MAX_TO } from "@/lib/share/shareEmail";
import { askLines } from "../Dialogs";
import { Badge, ErrorNote, errorText, postJson, useQuery, type Tone, type ViewProps } from "../ui";
import { Ic } from "./ic";
import { Menu, type MenuItem } from "./Menu";
import { BTN, CARD, CROW, CSTACK, GHOST_SM, IN, Seg, useNote } from "./parts";
import type { FormRow } from "./shared";


const OK = /^[^\s@<>()",;:]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$/i;
const initials = (p: { name: string; email: string }) => (p.name ? p.name.split(/\s+/).map((x) => x[0]).join("").slice(0, 2) : p.email[0] ?? "@").toUpperCase();
const TONE: Record<SendStatus, Tone> = { not: "gray", started: "sky", done: "green", failed: "amber" };

type Props = ViewProps & { form: Form; row: FormRow };

export function SendEmail({ sb, session, ws, form, row }: Props) {
  const note = useNote();
  const [to, setTo] = useState<Person[]>([]);
  const [typed, setTyped] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [from, setFrom] = useState<"me" | "team">("me");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [menu, setMenu] = useState<{ el: HTMLElement; items: MenuItem[] } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const addBtn = useRef<HTMLButtonElement>(null);

  const meta = session.user.user_metadata as { full_name?: string; name?: string } | undefined;
  const myName = (meta?.full_name || meta?.name || (session.user.email ?? "").split("@")[0] || "You").trim();
  const team = useQuery(`send-settings:${ws.id}`, async () => ((await sb.from("send_settings").select("from_name, from_email").eq("workspace_id", ws.id).maybeSingle()).data ?? null) as { from_name: string | null; from_email: string | null } | null);
  const q = typed.trim();
  const sugg = useQuery(open ? `share-people:${ws.id}:${q.toLowerCase()}` : null, () => suggestPeople(sb, ws.id, q), { staleMs: 30_000 });
  const sent = useQuery(`share-sends:${row.id}`, () => shareSends(sb, ws.id, row.id), { staleMs: 20_000 });

  const have = new Set(to.map((p) => p.email));
  const shown: Person[] = (sugg.data ?? []).filter((p) => !have.has(p.email));
  if (OK.test(q) && !have.has(q.toLowerCase()) && !shown.some((p) => p.email === q.toLowerCase())) shown.push({ email: q.toLowerCase(), name: "" });

  const add = (list: Person[]) => {
    setTo((cur) => {
      const seen = new Set(cur.map((p) => p.email));
      const next = [...cur];
      for (const p of list) {
        const e = p.email.trim().toLowerCase();
        if (!e || seen.has(e)) continue;
        seen.add(e);
        next.push({ email: e, name: p.name });
      }
      return next;
    });
  };
  const addAll = async (what: string, load: () => Promise<Person[]>) => {
    try {
      const list = await load();
      if (!list.length) return note.show(`No one ${what} yet`);
      add(list);
      note.show(list.length === 1 ? "Added 1 person" : `Added ${list.length} people`);
    } catch (e) {
      note.show(errorText(e));
    }
  };
  const take = () => {
    const found = emailsIn(typed);
    if (found.length) add(found.map((email) => ({ email, name: "" })));
    else if (q) add([{ email: q.toLowerCase(), name: "" }]);
    setTyped("");
  };

  const good = to.filter((p) => OK.test(p.email));
  const bad = to.length - good.length;
  const send = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await postJson<{ queued: number }>(session, "/api/forms/share-email", { workspaceId: ws.id, formId: row.id, to: good.map((p) => p.email), message, subject, from });
      setTo([]);
      note.show(r.queued === 1 ? "Sent to 1 person" : `Sent to ${r.queued} people`);
      sent.reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const openAdd = () => {
    if (!addBtn.current) return;
    setMenu({
      el: addBtn.current,
      items: [
        { icon: "form", label: "Everyone who filled this form", run: () => void addAll("has filled this form", () => formFillers(sb, ws.id, row.id)) },
        {
          icon: "cal",
          label: "Guests of a meeting type",
          run: () =>
            void meetingTypes(sb, ws.id)
              .then((types) => {
                if (!types.length) return note.show("No meeting types yet");
                setMenu({ el: addBtn.current!, items: types.map((t) => ({ icon: "cal", label: t.name, run: () => void addAll(`has booked ${t.name}`, () => meetingGuests(sb, ws.id, t.id)) })) });
              })
              .catch((e) => note.show(errorText(e))),
        },
        { icon: "data", label: "Upload a CSV", run: () => file.current?.click() },
        {
          icon: "text",
          label: "Paste a list",
          run: () =>
            void askLines("Paste a list", { placeholder: "Any text with emails in it", ok: "Add" }).then((text) => {
              if (text == null) return;
              const found = emailsIn(text);
              if (!found.length) return note.show("No emails in that text");
              add(found.map((email) => ({ email, name: "" })));
              note.show(found.length === 1 ? "Added 1 person" : `Added ${found.length} people`);
            }),
        },
      ],
    });
  };

  const title = form.share?.title || row.name;
  const teamName = team.data?.from_name || ws.name;
  const address = team.data?.from_email || "";
  return (
    <>
      <div className={CARD}>
        <div className={CSTACK}>
          <div className="flex flex-wrap items-center justify-between gap-[8px]">
            <label htmlFor="share-to" className="text-[12px] font-medium text-muted">
              To
            </label>
            <button ref={addBtn} type="button" className={GHOST_SM} onClick={openAdd} aria-haspopup="menu">
              <Ic n="plus" />
              Add people
            </button>
          </div>
          <div className="relative">
            <div data-share-to="" onClick={() => input.current?.focus()} className="flex min-h-[40px] w-full min-w-0 cursor-text flex-wrap items-center gap-[6px] rounded-md bg-card px-[8px] py-[6px] shadow-input focus-within:shadow-focus">
              {to.map((p) => (
                <span key={p.email} title={OK.test(p.email) ? p.email : "This isn't an email"} data-chip={p.email} className={`inline-flex h-[26px] max-w-full min-w-0 items-center gap-[6px] rounded-full pr-[4px] pl-[4px] text-[12.5px] ${OK.test(p.email) ? "bg-chip text-ink" : "bg-rose-wash text-rose"}`}>
                  <span aria-hidden="true" className="inline-flex size-[18px] shrink-0 items-center justify-center rounded-full bg-card text-[9.5px] font-medium text-muted">
                    {initials(p)}
                  </span>
                  <span className="min-w-0 wrap-anywhere">{p.name || p.email}</span>
                  <button type="button" aria-label={`Remove ${p.name || p.email}`} onClick={(e) => (e.stopPropagation(), setTo((cur) => cur.filter((x) => x.email !== p.email)))} className="inline-flex size-[18px] shrink-0 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink">
                    <Ic n="x" s={10} />
                  </button>
                </span>
              ))}
              <input
                ref={input}
                id="share-to"
                value={typed}
                autoComplete="off"
                placeholder={to.length ? "" : "Type a name or email"}
                aria-label="To"
                role="combobox"
                aria-expanded={open && shown.length > 0}
                aria-controls="share-to-list"
                onFocus={() => setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 120)}
                onChange={(e) => {
                  const v = e.target.value;
                  // A comma, semicolon or space after a whole address makes it a chip.
                  if (/[,;\s]$/.test(v) && OK.test(v.trim().replace(/[,;]$/, ""))) {
                    add([{ email: v.trim().replace(/[,;]$/, "").toLowerCase(), name: "" }]);
                    return setTyped("");
                  }
                  setTyped(v);
                  setHi(0);
                  setOpen(true);
                }}
                onPaste={(e) => {
                  const found = emailsIn(e.clipboardData.getData("text"));
                  if (found.length > 1) {
                    e.preventDefault();
                    add(found.map((email) => ({ email, name: "" })));
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    if (shown.length) setHi((h) => (h + (e.key === "ArrowDown" ? 1 : -1) + shown.length) % shown.length);
                  } else if (e.key === "Enter" || (e.key === "Tab" && typed)) {
                    if (open && shown[hi]) {
                      e.preventDefault();
                      add([shown[hi]!]);
                      setTyped("");
                    } else if (typed.trim()) {
                      e.preventDefault();
                      take();
                    }
                  } else if (e.key === "Backspace" && !typed && to.length) setTo((cur) => cur.slice(0, -1));
                  else if (e.key === "Escape") setOpen(false);
                }}
                className="h-[26px] min-w-[160px] flex-1 border-0 bg-transparent text-[13px] text-ink outline-none placeholder:text-faint"
              />
            </div>
            {open && shown.length ? (
              <div id="share-to-list" role="listbox" aria-label="People" className="absolute inset-x-0 top-[calc(100%+6px)] z-20 max-h-[280px] overflow-y-auto rounded-[12px] bg-card p-[6px] shadow-pop">
                {shown.map((p, i) => (
                  <div
                    key={p.email}
                    role="option"
                    aria-selected={i === hi}
                    onMouseDown={(e) => (e.preventDefault(), add([p]), setTyped(""))}
                    onMouseEnter={() => setHi(i)}
                    className={`flex cursor-pointer items-center gap-[10px] rounded-[7px] px-[8px] py-[7px] ${i === hi ? "bg-hover" : ""}`}
                  >
                    <span aria-hidden="true" className="inline-flex size-[26px] shrink-0 items-center justify-center rounded-full bg-chip text-[11px] font-medium text-ink">
                      {p.name ? initials(p) : "@"}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="text-[13px] font-medium text-ink wrap-anywhere">{p.name || p.email}</span>
                      {p.name ? <span className="text-[12px] text-muted wrap-anywhere">{p.email}</span> : null}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className={CROW}>
          <span className="w-[64px] shrink-0 text-[12px] font-medium text-muted">From</span>
          <Seg
            label="From"
            value={from}
            onChange={setFrom}
            options={[
              { value: "me", label: `${myName} (you)` },
              { value: "team", label: teamName },
            ]}
          />
          {address ? <span className="min-w-0 text-[12.5px] text-muted wrap-anywhere">{address}</span> : null}
        </div>
        <div className={CROW}>
          <label htmlFor="share-subject" className="w-[64px] shrink-0 text-[12px] font-medium text-muted">
            Subject
          </label>
          <input id="share-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} placeholder={title} className={IN} />
        </div>
        <div className={CSTACK}>
          <label htmlFor="share-note" className="text-[12px] font-medium text-muted">
            Message
          </label>
          <textarea id="share-note" value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={1000} className={`${IN} h-auto py-[8px]`} />
        </div>
        <div className={CROW}>
          <span data-share-count="" className={`flex-1 text-[12.5px] ${bad || good.length > MAX_TO ? "text-rose" : "text-muted"}`}>
            {bad ? (bad === 1 ? "1 isn't an email" : `${bad} aren't emails`) : good.length > MAX_TO ? `${good.length} people, ${MAX_TO} at most` : good.length ? (good.length === 1 ? "1 person" : `${good.length} people`) : "No one yet"}
          </span>
          <button type="button" className={BTN} disabled={busy || !good.length || !!bad || good.length > MAX_TO || !row.version} onClick={() => void send()}>
            {busy ? "Sending" : "Send"}
          </button>
        </div>
        <ErrorNote message={error} />
      </div>
      {sent.data?.length ? (
        <div className={CARD} data-share-sent="">
          {sent.data.map((s) => (
            <div key={s.id}>
              <div className={CROW}>
                <span className="min-w-0 flex-1 text-[13px] font-medium text-ink wrap-break-word">{s.subject}</span>
                <span className="text-[12px] text-muted">{new Date(s.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
              </div>
              {s.people.map((p) => (
                <div key={p.email} className="flex flex-wrap items-center gap-[10px] border-t border-line px-[16px] py-[9px]">
                  <span className="min-w-0 flex-1 text-[12.5px] text-body wrap-anywhere">{p.email}</span>
                  <Badge tone={TONE[p.status]}>{SEND_STATUS[p.status]}</Badge>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : null}
      <input
        ref={file}
        type="file"
        accept=".csv,text/csv,text/plain"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          if (f.size > 5_000_000) return note.show("That file is over 5 MB");
          void f.text().then((text) => {
            const found = emailsIn(text);
            if (!found.length) return note.show(`No emails in ${f.name}`);
            add(found.map((email) => ({ email, name: "" })));
            note.show(found.length === 1 ? "Added 1 person" : `Added ${found.length} people`);
          });
        }}
      />
      {menu ? <Menu anchor={menu.el} items={menu.items} onClose={() => setMenu(null)} width={260} /> : null}
      {note.node}
    </>
  );
}
