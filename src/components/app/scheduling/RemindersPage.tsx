"use client";

// Scheduling › Reminders (docs/app-structure.md 6.6): what guests hear before and after a meeting, for every meeting
// type on one page (Calendly's "Notifications and automations"). Before: reminder emails at set times. After: the
// no-show follow-up with the host's next times, and the confirmation (a message or a page). Change one type, or set
// the same reminders on every type at once. The emails go out from the meeting lifecycle jobs.

import { useState } from "react";
import type { MeetingType, TypeSettings } from "@/lib/meetings/types";
import { Bell, Check, Plus, X } from "../../Icons";
import { askConfirm } from "../Dialogs";
import { Select } from "../Select";
import { Badge, Button, ErrorNote, errorText, Loading, must, Page, Toggle, useLoad, type ViewProps } from "../ui";
import { minutesText } from "../meetings/model";
import { meetingsApi } from "../meetings/parts";
import { KIND_TONE } from "./model";

const TIMES = [10, 15, 30, 60, 120, 240, 1440, 2880, 10080];
const EDGE: Record<string, string> = { sky: "bg-sky", sage: "bg-sage", clay: "bg-clay", butter: "bg-butter", rose: "bg-rose", lilac: "bg-lilac" };

type Row = MeetingType;

export function RemindersPage(props: ViewProps) {
  const { sb, session, ws, navigate } = props;
  const list = useLoad(async () => (must(await sb.from("meeting_types").select("*").eq("workspace_id", ws.id).order("name")) ?? []) as Row[], ws.id);
  const [busy, setBusy] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState("");

  const save = async (t: Row, patch: Partial<TypeSettings>) => {
    const { name, slug, kind, hosts, settings, secret, active, locked, owner_user_id } = t;
    await meetingsApi(session, ws.id, "types", { action: "save", id: t.id, type: { name, slug, kind, hosts, settings: { ...settings, ...patch }, secret, active, locked, owner_user_id } });
  };
  const change = async (t: Row, patch: Partial<TypeSettings>) => {
    setBusy(t.id);
    setError("");
    try {
      await save(t, patch);
      list.reload();
      setSaved(t.id);
      setTimeout(() => setSaved((s) => (s === t.id ? null : s)), 1400);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  const copyToAll = async (from: Row) => {
    const others = (list.data ?? []).filter((t) => t.id !== from.id && !t.locked?.includes("reminders"));
    if (!others.length) return;
    if (!(await askConfirm(`Use ${from.name}'s reminders on ${others.length} other ${others.length === 1 ? "type" : "types"}?`, { ok: "Use on all" }))) return;
    setBusy("all");
    setError("");
    try {
      for (const t of others) await save(t, { reminders: from.settings.reminders, noShowFollowUp: from.settings.noShowFollowUp });
      list.reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Page title="Reminders" count={list.data?.length || undefined}>
      <div className="mx-auto flex max-w-5xl flex-col gap-3">
        <ErrorNote message={error || list.error} />
        {!list.data ? (
          <Loading />
        ) : !list.data.length ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-butter-wash text-butter">
              <Bell size={18} />
            </span>
            <p className="text-[18px] font-semibold tracking-[-0.02em] text-ink">No meeting types yet</p>
            <Button onClick={() => navigate("scheduling", "types/new")}>
              <Plus size={14} />
              New meeting type
            </Button>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {list.data.map((t, i) => {
              const s = t.settings;
              const locked = t.locked?.includes("reminders");
              const left = TIMES.filter((m) => !s.reminders.includes(m));
              return (
                <li key={t.id} className="anim-rise-sm relative overflow-hidden rounded-2xl border border-line bg-card py-4 pr-4 pl-5" style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
                  <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1.5 ${EDGE[KIND_TONE[t.kind]]}`} />
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => navigate("scheduling", `types/${t.id}`)} className="truncate text-left text-[14.5px] font-semibold tracking-[-0.01em] text-ink hover:underline">
                      {t.name}
                    </button>
                    {locked ? <Badge tone="amber">Managed</Badge> : null}
                    {saved === t.id ? (
                      <span className="anim-pop inline-flex items-center gap-1 text-[12px] text-sage">
                        <Check size={12} />
                        Saved
                      </span>
                    ) : null}
                    {(list.data?.length ?? 0) > 1 && !locked ? (
                      <Button variant="plain" size="sm" className="ml-auto" disabled={!!busy} onClick={() => void copyToAll(t)}>
                        Use on all types
                      </Button>
                    ) : null}
                  </div>
                  <div className="mt-3 grid gap-4 md:grid-cols-2">
                    <div className="flex flex-col gap-2">
                      <span className="text-[12px] text-muted">Before</span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone="green">Confirmation email</Badge>
                        {[...s.reminders].sort((a, b) => b - a).map((m) => (
                          <span key={m} className="inline-flex h-[26px] items-center gap-1 rounded-full bg-paper-deep pr-1 pl-2.5 text-[12px] text-ink">
                            Email {minutesText(m)} before
                            {!locked ? (
                              <button type="button" aria-label={`Remove the ${minutesText(m)} reminder`} disabled={busy === t.id} onClick={() => void change(t, { reminders: s.reminders.filter((x) => x !== m) })} className="press rounded-full p-0.5 text-faint hover:bg-hover hover:text-ink">
                                <X size={11} />
                              </button>
                            ) : null}
                          </span>
                        ))}
                        {!locked && left.length && s.reminders.length < 4 ? (
                          <Select<string>
                            value=""
                            placeholder="Add reminder"
                            plainPlaceholder
                            options={left.map((m) => ({ value: String(m), label: `${minutesText(m)} before` }))}
                            onChange={(v) => void change(t, { reminders: [...s.reminders, Number(v)] })}
                            ariaLabel={`Add a reminder to ${t.name}`}
                            disabled={busy === t.id}
                            className="h-[26px] w-36 text-[12px]"
                          />
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <span className="text-[12px] text-muted">After</span>
                      <div className="flex flex-wrap items-center gap-3 text-[13px] text-ink">
                        <span className="flex items-center gap-2">
                          <Toggle label="No-show follow-up" on={s.noShowFollowUp} disabled={busy === t.id || t.locked?.includes("noShowFollowUp")} onChange={(v) => void change(t, { noShowFollowUp: v })} />
                          No-show follow-up
                        </span>
                        <span className="text-muted">{s.confirmation.kind === "redirect" ? "Opens a page after booking" : "Shows a confirmation"}</span>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Page>
  );
}
