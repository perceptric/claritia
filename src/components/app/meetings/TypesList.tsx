"use client";

// Meeting types (docs/meetings-scheduler.md 1.4 and 1.8b): a card for each type with its kind, lengths, hosts and
// booking link, and quick actions: copy times for an email, a new single-use, one-off or poll link, duplicate and
// delete. A type opens in the editor (/meetings/types/<id>).

import { useState } from "react";
import type { MeetingType } from "@/lib/meetings/types";
import { CalendarIcon, Clock, Copy, Link as LinkIcon, Lock, Plus, Trash } from "../../Icons";
import { askConfirm } from "../Dialogs";
import { ToolIntro } from "../ToolIntro";
import { Badge, Button, ErrorNote, errorText, IconButton, Loading, must, Page, useLoad, type ViewProps } from "../ui";
import { LinkDialog } from "./LinkDialog";
import { kindLabel, lengthsText } from "./model";
import { AvatarStack, copyText, CopyButton, meetingsApi, ownZone, usePeople, useWorkspaceSlug } from "./parts";

export type TypeRow = MeetingType & { created_by: string | null; updated_at: string };

export function TypesList(props: ViewProps) {
  const { sb, session, ws, navigate } = props;
  const people = usePeople(sb, ws.id);
  const slug = useWorkspaceSlug(session, ws.id);
  const list = useLoad(async () => (must(await sb.from("meeting_types").select("*").eq("workspace_id", ws.id).order("created_at")) ?? []) as TypeRow[], ws.id);
  const [error, setError] = useState("");
  const [linkFor, setLinkFor] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const back = { label: "Meetings", onClick: () => navigate("meetings") };

  const act = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const copyTimes = (t: TypeRow) =>
    act(async () => {
      const r = await meetingsApi<{ text: string }>(session, ws.id, "times", { typeId: t.id, tz: ownZone() });
      if (!r.text) throw new Error(`${t.name} has no free times in its window.`);
      if (await copyText(r.text)) {
        setCopied(t.id);
        setTimeout(() => setCopied((c) => (c === t.id ? null : c)), 1600);
      }
    });

  if (list.data && !list.data.length)
    return (
      <Page icon={<CalendarIcon size={14} />} title="Meeting types" back={back}>
        <ToolIntro
          sketch="calendar"
          title={"Share one link\nand let leads pick a time"}
          lead="A meeting type sets who hosts, how long, when and where. Share it as a page, a one-time link or times in an email."
          action={
            <Button onClick={() => navigate("meetings", "types/new")}>
              <Plus size={14} />
              New meeting type
            </Button>
          }
        />
      </Page>
    );

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return (
    <Page
      icon={<CalendarIcon size={14} />}
      title="Meeting types"
      count={list.data?.length}
      back={back}
      actions={
        <Button onClick={() => navigate("meetings", "types/new")}>
          <Plus size={14} />
          New type
        </Button>
      }
    >
      {linkFor ? <LinkDialog sb={sb} session={session} ws={ws} types={(list.data ?? []).map((t) => ({ ...t, lengths: t.settings.lengths }))} initialType={linkFor} onClose={() => setLinkFor(null)} /> : null}
      <div className="flex flex-col gap-4">
        <ErrorNote message={error || list.error || slug.error} />
        {!list.data ? (
          <Loading />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {list.data.map((t, i) => {
              const url = slug.data ? `${origin}/book/${slug.data}/${t.slug}` : "";
              return (
                <div key={t.id} className="group lift anim-rise-sm relative flex flex-col gap-5 rounded-2xl border border-line bg-card p-5 hover:border-line-strong" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                  <div className="flex items-start gap-2">
                    <button type="button" onClick={() => navigate("meetings", `types/${t.id}`)} className="flex min-w-0 flex-1 flex-col gap-1 text-left after:absolute after:inset-0 after:rounded-2xl">
                      <span className="truncate text-[15px] font-semibold tracking-[-0.01em] text-ink">{t.name}</span>
                      <span className="truncate text-[12.5px] text-muted">
                        {kindLabel(t.kind)}, {lengthsText(t.settings.lengths)}
                      </span>
                    </button>
                    <span className="flex shrink-0 flex-wrap justify-end gap-1">
                      {!t.active ? <Badge>Off</Badge> : null}
                      {t.secret ? <Badge tone="violet">Secret</Badge> : null}
                      {t.template_id ? (
                        <Badge tone="amber">
                          <Lock size={10} />
                          Managed
                        </Badge>
                      ) : null}
                      {t.settings.price ? <Badge tone="green">Paid</Badge> : null}
                    </span>
                  </div>
                  <div className="mt-auto flex items-center gap-2">
                    <AvatarStack ids={t.hosts.map((h) => h.user_id)} people={people.data?.byId} max={4} size={26} />
                    <span className="relative z-10 ml-auto flex items-center gap-0.5 opacity-100 transition-opacity duration-[140ms] md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
                      <IconButton label={copied === t.id ? "Copied" : "Copy times"} onClick={() => void copyTimes(t)}>
                        <Clock size={14} className={copied === t.id ? "text-sage" : ""} />
                      </IconButton>
                      <IconButton label="New link" onClick={() => setLinkFor(t.id)}>
                        <LinkIcon size={14} />
                      </IconButton>
                      <IconButton label="Duplicate" onClick={() => act(async () => navigate("meetings", `types/${(await meetingsApi<{ id: string }>(session, ws.id, "types", { action: "duplicate", id: t.id })).id}`))}>
                        <Copy size={14} />
                      </IconButton>
                      <IconButton
                        label="Delete"
                        className="hover:!bg-rose-wash hover:!text-rose"
                        onClick={() =>
                          act(async () => {
                            if (!(await askConfirm(`Delete ${t.name}?`, { body: "Its booking link stops working. Booked meetings stay.", ok: "Delete", danger: true }))) return;
                            await meetingsApi(session, ws.id, "types", { action: "delete", id: t.id });
                            list.reload();
                          })
                        }
                      >
                        <Trash size={14} />
                      </IconButton>
                    </span>
                  </div>
                  {url ? (
                    <div className="relative z-10 -mt-1 flex items-center gap-1 rounded-full border border-line bg-paper py-0.5 pr-0.5 pl-3">
                      <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-body">{url.replace(/^https?:\/\//, "")}</span>
                      <CopyButton text={url} size={13} />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Page>
  );
}
