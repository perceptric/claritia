"use client";

// Audiences' columns (docs/email-unify-plan.md, E2): First name, Last name and Email always show; Phone, Title, Country,
// Lists, Added and Last email can be hidden (kept on this computer). A click on a name, phone, title or country edits
// it in place (Enter saves, Escape leaves); the person's sheet edits them all, and adds one person by hand.

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import { Settings } from "../../Icons";
import { Popover } from "../FilterBar";
import { Sheet } from "../Sheet";
import {
  Button,
  Checkbox,
  ErrorNote,
  errorText,
  Input,
  must,
  postJson,
} from "../ui";

export type ColKey =
  | "phone"
  | "title"
  | "country"
  | "lists"
  | "added"
  | "last_email";
export const OPTIONAL: { key: ColKey; label: string }[] = [
  { key: "phone", label: "Phone" },
  { key: "title", label: "Title" },
  { key: "country", label: "Country" },
  { key: "lists", label: "Lists" },
  { key: "added", label: "Added" },
  { key: "last_email", label: "Last email" },
];
const DEFAULT: ColKey[] = ["phone", "lists", "added", "last_email"];
const KEY = "claritia:audience-cols";

/** The optional columns shown, kept on this computer. */
export function useColumns(): [Set<ColKey>, (k: ColKey) => void] {
  const [on, setOn] = useState<Set<ColKey>>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as unknown;
      if (Array.isArray(raw))
        return new Set(
          raw.filter((k): k is ColKey => OPTIONAL.some((o) => o.key === k)),
        );
    } catch {}
    return new Set(DEFAULT);
  });
  const toggle = (k: ColKey) =>
    setOn((s) => {
      const next = new Set(s);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      try {
        localStorage.setItem(KEY, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  return [on, toggle];
}

export function ColumnsMenu({
  on,
  toggle,
}: {
  on: Set<ColKey>;
  toggle: (k: ColKey) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        aria-haspopup="menu"
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
      >
        <Settings size={13} /> Columns
      </Button>
      {anchor ? (
        <Popover anchor={anchor} onClose={() => setAnchor(null)} width={200}>
          <div
            role="menu"
            aria-label="Columns"
            className="flex flex-col gap-0.5 p-1.5"
          >
            {OPTIONAL.map((o) => (
              <Checkbox
                key={o.key}
                on={on.has(o.key)}
                onChange={() => toggle(o.key)}
                className="w-full rounded-md px-2 py-1.5 hover:bg-hover"
              >
                {o.label}
              </Checkbox>
            ))}
          </div>
        </Popover>
      ) : null}
    </>
  );
}

export type EditField =
  | "first_name"
  | "last_name"
  | "phone"
  | "title"
  | "country";
const MAX: Record<EditField, number> = {
  first_name: 100,
  last_name: 100,
  phone: 50,
  title: 120,
  country: 2,
};

/** A cell that turns into a box on click. Saving an unchanged value does nothing. */
export function EditCell({
  value,
  field,
  label,
  onSave,
}: {
  value: string | null;
  field: EditField;
  label: string;
  onSave: (v: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value ?? "");
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) box.current?.select();
  }, [editing]);
  const save = async () => {
    const v = field === "country" ? text.trim().toUpperCase() : text.trim();
    if (v === (value ?? "")) return setEditing(false);
    setBusy(true);
    try {
      await onSave(v);
      setEditing(false);
    } catch {
      // The page shows the error; the box stays open with what was typed.
    } finally {
      setBusy(false);
    }
  };
  if (editing)
    return (
      <input
        ref={box}
        value={text}
        maxLength={MAX[field]}
        disabled={busy}
        aria-label={label}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          if (e.key === "Enter") void save();
          if (e.key === "Escape") {
            setText(value ?? "");
            setEditing(false);
          }
        }}
        className="-mx-2 h-8 w-[calc(100%+16px)] min-w-24 rounded-md bg-card px-2 text-[13px] text-ink shadow-focus outline-none"
      />
    );
  return (
    <button
      type="button"
      data-edit-cell={field}
      onClick={() => {
        setText(value ?? "");
        setEditing(true);
      }}
      aria-label={`${label}: ${value || "empty"}. Edit`}
      className="-mx-2 flex min-h-8 w-[calc(100%+16px)] items-center rounded-md px-2 text-left text-[13px] break-words text-ink hover:shadow-input"
    >
      {value || <span className="text-faint">Add</span>}
    </button>
  );
}

export type PersonRow = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  title: string | null;
  country: string | null;
};

/**
 * One person's details: edit everything but the email, or add a new person (on the list shown, if any). A new
 * person goes through the import route, so consent, throwaway addresses and owners' review work as for an import.
 */
export function PersonSheet({
  sb,
  session,
  ws,
  person,
  list,
  onClose,
  onSaved,
}: {
  sb: SupabaseClient;
  session: Session;
  ws: string;
  person: PersonRow | null;
  list: { id: string; name: string } | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [f, setF] = useState({
    first_name: person?.first_name ?? "",
    last_name: person?.last_name ?? "",
    email: person?.email ?? "",
    phone: person?.phone ?? "",
    title: person?.title ?? "",
    country: person?.country ?? "",
  });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((x) => ({ ...x, [k]: e.target.value }));
  const go = async () => {
    setError("");
    const country = f.country.trim().toUpperCase();
    if (country && !/^[A-Z]{2}$/.test(country))
      return setError("Use a two-letter country code, like US.");
    if (!person && !/^\S+@\S+\.\S+$/.test(f.email.trim()))
      return setError("Add a valid email.");
    setBusy(true);
    try {
      if (person) {
        must(
          await sb.rpc("audience_person_update", {
            p_ws: ws,
            p_id: person.id,
            p_patch: {
              first_name: f.first_name,
              last_name: f.last_name,
              phone: f.phone,
              title: f.title,
              country,
            },
          }),
        );
        onSaved("Saved");
      } else {
        const r = await postJson<{
          added: number;
          held: number;
          created?: number;
        }>(session, "/api/emails/import", {
          workspaceId: ws,
          listId: list?.id ?? null,
          consent,
          rows: [
            {
              email: f.email.trim(),
              first_name: f.first_name.trim(),
              last_name: f.last_name.trim(),
              phone: f.phone.trim(),
              title: f.title.trim(),
              country,
            },
          ],
        });
        onSaved(
          r.held
            ? "Waiting for an owner to add them"
            : r.added
              ? "Person added"
              : "Already here",
        );
      }
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  const row = (
    k: keyof typeof f,
    label: string,
    extra: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[12px] font-medium text-muted">{label}</span>
      <Input value={f[k]} onChange={set(k)} {...extra} />
    </label>
  );
  return (
    <Sheet
      title={
        person
          ? [person.first_name, person.last_name].filter(Boolean).join(" ") ||
            person.email
          : list
            ? `Add a person to ${list.name}`
            : "Add a person"
      }
      onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void go()} disabled={busy}>
            {person ? "Save" : "Add person"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {row("first_name", "First name", { maxLength: 100, autoFocus: true })}
          {row("last_name", "Last name", { maxLength: 100 })}
        </div>
        {person ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-muted">Email</span>
            <span className="text-[13.5px] wrap-anywhere text-ink">
              {person.email}
            </span>
          </div>
        ) : (
          row("email", "Email", {
            type: "email",
            inputMode: "email",
            maxLength: 254,
          })
        )}
        {row("phone", "Phone", { inputMode: "tel", maxLength: 50 })}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
          {row("title", "Title", { maxLength: 120 })}
          {row("country", "Country", { maxLength: 2, placeholder: "US" })}
        </div>
        {person ? null : (
          <Checkbox on={consent} onChange={setConsent}>
            They agreed to get email from us
          </Checkbox>
        )}
        <ErrorNote message={error} />
      </div>
    </Sheet>
  );
}
