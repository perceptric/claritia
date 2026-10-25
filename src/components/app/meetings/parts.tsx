"use client";

// Shared parts of the Meetings screens: teammates with their booking names and photos, avatar stacks, a dialog
// frame for the few questions that need more than askText (cancel with a reason, picking times, links), and copy.

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { X } from "../../Icons";
import { Avatar, Badge, IconButton, must, postJson, useLoad } from "../ui";
import { STATUS } from "./model";
import type { MeetingStatus } from "@/lib/meetings/types";

export type Person = { id: string; email: string; role: "owner" | "member"; name: string; photo: string | null; slug: string | null; headline: string | null };

/** Teammates, with their booking page name, photo and link where they've set one. */
export function usePeople(sb: SupabaseClient, ws: string) {
  return useLoad(async () => {
    const [people, profiles] = await Promise.all([sb.rpc("workspace_people", { p_ws: ws }), sb.from("booking_profiles").select("user_id, slug, name, headline, photo_url").eq("workspace_id", ws)]);
    const prof = new Map(((must(profiles) ?? []) as { user_id: string; slug: string; name: string; headline: string | null; photo_url: string | null }[]).map((p) => [p.user_id, p]));
    const list = ((must(people) ?? []) as { id: string; email: string; role: "owner" | "member" }[]).map((p): Person => {
      const b = prof.get(p.id);
      return { ...p, name: b?.name || p.email.replace(/@.*/, ""), photo: b?.photo_url ?? null, slug: b?.slug ?? null, headline: b?.headline ?? null };
    });
    return { list, byId: new Map(list.map((p) => [p.id, p])) };
  }, ws);
}

/** A person's photo, or their initials. */
export function PersonAvatar({ person, label, size = 24 }: { person?: Person | null; label?: string; size?: number }) {
  if (person?.photo)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={person.photo} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover ring-2 ring-paper" style={{ width: size, height: size }} />;
  return <Avatar label={person?.name || person?.email || label || "?"} size={size} />;
}

/** Overlapping avatars, with a +n after `max`. Names are the tooltip. */
export function AvatarStack({ ids, people, max = 3, size = 24 }: { ids: string[]; people?: Map<string, Person>; max?: number; size?: number }) {
  const shown = ids.slice(0, max);
  const names = ids.map((id) => people?.get(id)?.name ?? "Former teammate").join(", ");
  return (
    <span className="inline-flex items-center" title={names} aria-label={names}>
      {shown.map((id, i) => (
        <span key={id} className={i ? "-ml-1.5" : ""}>
          <PersonAvatar person={people?.get(id)} label={id} size={size} />
        </span>
      ))}
      {ids.length > max ? <span className="-ml-1.5 inline-flex shrink-0 items-center justify-center rounded-full bg-paper-deep text-[10.5px] font-medium text-body ring-2 ring-paper" style={{ width: size, height: size }}>{`+${ids.length - max}`}</span> : null}
    </span>
  );
}

export function StatusBadge({ status }: { status: MeetingStatus }) {
  const s = STATUS[status];
  return (
    <Badge tone={s.tone} dot>
      {s.label}
    </Badge>
  );
}

/** A dialog in the app's style, for questions with more than one field. Escape or a click outside closes it. */
export function Modal({ title, onClose, children, footer, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div className="anim-fade fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-scrim px-4 py-[10vh]" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()} className={`anim-rise-sm w-full overflow-hidden rounded-2xl bg-card shadow-float ${wide ? "max-w-2xl" : "max-w-md"}`}>
        <div className="flex items-center gap-2 px-6 pt-5">
          <h2 className="flex-1 text-[20px] leading-tight font-semibold tracking-[-0.02em]">{title}</h2>
          <IconButton label="Close" onClick={onClose} className="-mr-2">
            <X size={15} />
          </IconButton>
        </div>
        <div className="px-6 pt-4 pb-5">{children}</div>
        {footer ? <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">{footer}</div> : null}
      </div>
    </div>
  );
}

export { copyText, CopyButton } from "../CopyButton";

/** POST to /api/meetings/<path> for this workspace. */
export const meetingsApi = <T = Record<string, unknown>,>(session: Session, ws: string, path: "types" | "availability" | "profile" | "action" | "times", body: object) =>
  postJson<T>(session, `/api/meetings/${path}`, { workspaceId: ws, ...body });

/** The workspace's booking address (/book/<slug>), made the first time it's asked for. */
export function useWorkspaceSlug(session: Session, ws: string) {
  return useLoad(async () => (await meetingsApi<{ workspaceSlug: string }>(session, ws, "profile", {})).workspaceSlug, ws);
}

/** The time now, moving on each minute, so Held and No-show appear when a meeting starts. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** The person's own time zone. */
export const ownZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

/** A small label above a value, for details lists. */
export function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] items-start gap-3 py-2.5 text-[13.5px]">
      <span className="label-mono pt-px">{label}</span>
      <div className="min-w-0 text-ink">{children}</div>
    </div>
  );
}
