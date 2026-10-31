"use client";

// The form's own meeting (docs/on-submission.md): a meeting type that belongs to this form (`settings.form`), set up
// right in On Submission and kept off booking pages (secret). Booking works as for any type: the rep the form's
// If → Then picks gets the lead, with their own calendar. A change shows at once and saves a moment after the last
// one, through the same meetings API as Meetings.

import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_SETTINGS, type Location, type TypeSettings } from "@/lib/meetings/types";
import { errorText, invalidate } from "../ui";
import { meetingsApi } from "../meetings/parts";
import type { TypeRow } from "../meetings/TypesList";

export const isOwn = (t: Pick<TypeRow, "settings">, formId: string) => t.settings?.form === formId;

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "meeting";

const typeBody = (t: Pick<TypeRow, "name" | "slug" | "kind" | "hosts" | "settings" | "secret" | "active" | "locked" | "owner_user_id">) => ({
  name: t.name,
  slug: t.slug,
  kind: t.kind,
  hosts: t.hosts,
  settings: t.settings,
  secret: t.secret,
  active: t.active,
  locked: t.locked,
  owner_user_id: t.owner_user_id,
});

/** Make this form's own meeting: hosted by whoever makes it (the times shown while Routing isn't live), off every page. */
export async function makeOwnMeeting(session: Session, ws: string, formId: string, name = "Intro call"): Promise<string> {
  const r = await meetingsApi<{ id: string }>(session, ws, "types", {
    action: "save",
    type: {
      name,
      slug: `${slugify(name)}-${formId.slice(0, 6)}`,
      kind: "one",
      hosts: [{ user_id: session.user.id }],
      settings: { ...DEFAULT_SETTINGS, form: formId },
      secret: true,
      active: true,
      locked: [],
      owner_user_id: null,
    },
  });
  invalidate(`meeting_types:${ws}`);
  return r.id;
}

/** The own meeting being edited: its name and settings on screen, saved 600 ms after the last change. */
export function useOwnMeeting(session: Session, ws: string, row: TypeRow | null, onSaved: () => void) {
  const [draft, setDraft] = useState<TypeRow | null>(row);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const latest = useRef(draft);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedFor = useRef(row?.id ?? null);
  // Another meeting picked: start from it. A reread of the same one never overwrites what's being typed.
  useEffect(() => {
    if ((row?.id ?? null) === savedFor.current) return;
    savedFor.current = row?.id ?? null;
    setDraft(row);
    latest.current = row;
  }, [row]);

  const save = useCallback(async () => {
    const t = latest.current;
    if (!t) return;
    setSaving(true);
    try {
      await meetingsApi(session, ws, "types", { action: "save", id: t.id, type: typeBody(t) });
      setError("");
      invalidate(`meeting_types:${ws}`);
      onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  }, [session, ws, onSaved]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const change = (patch: { name?: string; settings?: Partial<TypeSettings> }) => {
    const t = latest.current;
    if (!t) return;
    const next = { ...t, ...(patch.name !== undefined ? { name: patch.name } : {}), settings: { ...t.settings, ...patch.settings } };
    latest.current = next;
    setDraft(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), 600);
  };
  return { draft, saving, error, change };
}

export const PLACES: { kind: Location["kind"]; label: string; icon: string }[] = [
  { kind: "google_meet", label: "Google Meet", icon: "monitor" },
  { kind: "zoom", label: "Zoom", icon: "monitor" },
  { kind: "teams", label: "Microsoft Teams", icon: "monitor" },
  { kind: "phone_guest", label: "Phone call", icon: "call" },
];
export const placeLabel = (l: Location | undefined) => PLACES.find((p) => p.kind === l?.kind)?.label ?? (l?.kind === "in_person" ? "In person" : l?.kind === "phone_host" ? "Phone call" : "Custom link");
export const noticeWords = (n: number) => (n < 60 ? `${n} min` : n < 1440 ? `${n / 60} hours` : n === 1440 ? "1 day" : `${n / 1440} days`);
