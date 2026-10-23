"use client";

// Notes and tasks on a record (docs/crm.md, supabase/migrations/049_crm_notes.sql), as on Omniscient's record page.
// Notes: what someone wrote, newest first; the author or an owner can change or delete one. Tasks: a to-do with a
// due date and a teammate; tick it off, change it or delete it.

import { useState } from "react";
import { Trash } from "../../Icons";
import { askConfirm } from "../Dialogs";
import { Select } from "../Select";
import { Avatar, Button, ErrorNote, errorText, must, Panel, Tabs, timeAgo, useLoad, type ViewProps } from "../ui";
import { CheckBox } from "./RecordTable";

type Note = { id: string; body: string; author: string | null; created_at: string; updated_at: string };
type Task = { id: string; title: string; due: string | null; assignee: string | null; done: boolean; created_at: string };

export function RecordWork({ sb, ws, session, role, object, record, people }: Pick<ViewProps, "sb" | "ws" | "session" | "role"> & { object: string; record: string; people: { id: string; email: string }[] }) {
  const data = useLoad(async () => {
    const [n, t] = await Promise.all([
      sb.from("notes").select("id, body, author, created_at, updated_at").eq("workspace_id", ws.id).eq("object", object).eq("record_id", record).order("created_at", { ascending: false }).limit(200),
      sb.from("tasks").select("id, title, due, assignee, done, created_at").eq("workspace_id", ws.id).eq("object", object).eq("record_id", record).order("done").order("due", { ascending: true, nullsFirst: false }).limit(200),
    ]);
    return { notes: must(n) as Note[], tasks: must(t) as Task[] };
  }, `${object}:${record}`);
  const open = (data.data?.tasks ?? []).filter((t) => !t.done).length;
  const [tab, setTab] = useState<"notes" | "tasks">("notes");
  const [error, setError] = useState("");
  const run = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
      data.reload();
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    }
  };
  const me = session.user.id;
  const who = (id: string | null) => people.find((p) => p.id === id)?.email ?? "Someone";

  return (
    <Panel className="overflow-hidden">
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "notes", label: "Notes", count: data.data?.notes.length },
          { value: "tasks", label: "Tasks", count: open || undefined },
        ]}
      />
      <div className="flex flex-col gap-3 p-4">
        <ErrorNote message={error || data.error} />
        {tab === "notes" ? (
          <>
            <NoteBox onSave={(body) => run(async () => must(await sb.rpc("note_save", { p_ws: ws.id, p_object: object, p_record: record, p_id: null, p_body: body })))} />
            <ul className="flex flex-col gap-3 pt-1">
              {(data.data?.notes ?? []).map((n) => (
                <NoteRow
                  key={n.id}
                  note={n}
                  author={who(n.author)}
                  mine={n.author === me || role === "owner"}
                  onSave={(body) => run(async () => must(await sb.rpc("note_save", { p_ws: ws.id, p_object: object, p_record: record, p_id: n.id, p_body: body })))}
                  onDelete={async () => {
                    if (await askConfirm("Delete this note?", { ok: "Delete", danger: true })) await run(async () => must(await sb.rpc("note_delete", { p_id: n.id })));
                  }}
                />
              ))}
            </ul>
          </>
        ) : (
          <>
            <TaskBox people={people} me={me} onSave={(t) => run(async () => must(await sb.rpc("task_save", { p_ws: ws.id, p_object: object, p_record: record, p_id: null, p_title: t.title, p_due: t.due, p_assignee: t.assignee, p_done: false })))} />
            <ul className="flex flex-col gap-0.5">
              {(data.data?.tasks ?? []).map((t) => {
                const late = !t.done && t.due && t.due < new Date().toISOString().slice(0, 10);
                return (
                  <li key={t.id} className="anim-rise-sm flex min-h-11 items-center gap-3 rounded-lg px-2 text-[13px] hover:bg-hover">
                    <CheckBox
                      round
                      on={t.done}
                      label={t.done ? "Mark not done" : "Mark done"}
                      onClick={() => void run(async () => must(await sb.rpc("task_save", { p_ws: ws.id, p_object: object, p_record: record, p_id: t.id, p_title: t.title, p_due: t.due, p_assignee: t.assignee, p_done: !t.done })))}
                    />
                    <span className={`min-w-0 flex-1 truncate ${t.done ? "text-faint line-through" : ""}`}>{t.title}</span>
                    {t.due ? <span className={`text-[12px] ${late ? "text-rose" : "text-muted"}`}>{new Date(`${t.due}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</span> : null}
                    {t.assignee ? <Avatar label={who(t.assignee)} size={20} /> : null}
                    <button
                      type="button"
                      aria-label="Delete task"
                      onClick={async () => {
                        if (await askConfirm(`Delete "${t.title}"?`, { ok: "Delete", danger: true })) await run(async () => must(await sb.rpc("task_delete", { p_id: t.id })));
                      }}
                      className="press flex size-8 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-rose"
                    >
                      <Trash size={13} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </Panel>
  );
}

function NoteBox({ onSave }: { onSave: (body: string) => Promise<boolean> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    if (await onSave(text)) setText("");
    setBusy(false);
  };
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line-strong bg-card p-2.5 transition-colors duration-[140ms] focus-within:border-ink">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void save();
        }}
        rows={2}
        placeholder="Write a note"
        aria-label="New note"
        className="w-full resize-y bg-transparent px-1 text-[13px] outline-none placeholder:text-faint"
      />
      <div className="flex justify-end">
        <Button onClick={save} disabled={!text.trim() || busy}>
          {busy ? "Saving…" : "Add note"}
        </Button>
      </div>
    </div>
  );
}

function NoteRow({ note, author, mine, onSave, onDelete }: { note: Note; author: string; mine: boolean; onSave: (body: string) => Promise<boolean>; onDelete: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.body);
  return (
    <li className="anim-rise-sm flex flex-col gap-2 rounded-lg bg-butter-wash px-4 py-3.5 text-[13px] transition-transform duration-[320ms] ease-out odd:rotate-[-0.6deg] even:rotate-[0.6deg] focus-within:rotate-0 hover:rotate-0">
      <div className="flex items-center gap-2">
        <Avatar label={author} size={20} />
        <span className="font-medium">{author}</span>
        <span className="text-[12px] text-muted">{timeAgo(note.created_at)}</span>
        {mine && !editing ? (
          <span className="ml-auto flex gap-1">
            <Button variant="plain" size="sm" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <button type="button" aria-label="Delete note" onClick={onDelete} className="press flex size-8 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-rose">
              <Trash size={13} />
            </button>
          </span>
        ) : null}
      </div>
      {editing ? (
        <div className="flex flex-col gap-2">
          <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={3} aria-label="Note" className="w-full rounded-sm border border-ink bg-card px-3 py-2 text-[13px] outline-none ring-1 ring-ink" />
          <div className="flex justify-end gap-1.5">
            <Button
              variant="plain"
              onClick={() => {
                setText(note.body);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
            <Button onClick={async () => (await onSave(text)) && setEditing(false)} disabled={!text.trim()}>
              Save
            </Button>
          </div>
        </div>
      ) : (
        <p className="leading-relaxed whitespace-pre-wrap text-ink">{note.body}</p>
      )}
    </li>
  );
}

function TaskBox({ people, me, onSave }: { people: { id: string; email: string }[]; me: string; onSave: (t: { title: string; due: string | null; assignee: string | null }) => Promise<boolean> }) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [assignee, setAssignee] = useState(me);
  const save = async () => {
    if (!title.trim()) return;
    if (await onSave({ title: title.trim(), due: due || null, assignee: assignee || null })) {
      setTitle("");
      setDue("");
    }
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="flex flex-wrap items-center gap-1.5"
    >
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task" aria-label="New task" className="h-9 min-w-[160px] flex-1 rounded-sm border border-line-strong bg-card px-3 text-[13px] outline-none placeholder:text-faint focus:border-ink focus:ring-1 focus:ring-ink" />
      <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due" className="h-9 rounded-sm border border-line-strong bg-card px-2.5 text-[12.5px] outline-none focus:border-ink focus:ring-1 focus:ring-ink" />
      <div className="w-40">
        <Select<string> value={assignee} onChange={setAssignee} ariaLabel="Teammate" options={[{ value: "", label: "Nobody" }, ...people.map((p) => ({ value: p.id, label: p.email }))]} className="h-9 w-full rounded-sm border border-line-strong bg-card px-3 text-[12.5px] focus:border-ink" />
      </div>
      <Button type="submit" disabled={!title.trim()}>
        Add
      </Button>
    </form>
  );
}
