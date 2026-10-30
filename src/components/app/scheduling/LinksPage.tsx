"use client";

// Scheduling › Links and polls (docs/app-structure.md 6.5): every single-use link, one-off meeting and poll, with its
// state (Waiting, Voting, Booked, Closed, Expired), who made it and when, Copy link, and for polls the votes per time
// with Book this time. ?create=single_use|one_off|poll opens the new-link dialog (from the Create menu).

import { useEffect, useMemo, useState } from "react";
import { Link as LinkIcon, Plus, Search } from "../../Icons";
import { askConfirm } from "../Dialogs";
import { MoreMenu } from "../StatCards";
import { ToolIntro } from "../ToolIntro";
import { ConnectCalendar } from "./ConnectCalendar";
import { Badge, Button, ErrorNote, errorText, Input, Loading, must, Page, postJson, Tabs, useLoad, type ViewProps } from "../ui";
import { LinkDialog } from "../meetings/LinkDialog";
import { copyText, PersonAvatar, usePeople } from "../meetings/parts";
import { LINK_KIND, LINK_STATE, linkState, type LinkRow } from "./model";

type Filter = "open" | "all";
type Kind = LinkRow["kind"];

const createKind = (): Kind | null => {
  if (typeof window === "undefined") return null;
  const k = new URLSearchParams(window.location.search).get("create");
  return k === "single_use" || k === "one_off" || k === "poll" ? k : null;
};

export function LinksPage(props: ViewProps) {
  const { sb, session, ws, role } = props;
  const me = session.user.id;
  const people = usePeople(sb, ws.id);
  const data = useLoad(async () => {
    const [links, types, votes] = await Promise.all([
      sb.from("meeting_links").select("id, kind, type_id, owner_user_id, title, offered, length_min, used_at, meeting_id, closed_at, expires_at, created_at").eq("workspace_id", ws.id).order("created_at", { ascending: false }).limit(500),
      sb.from("meeting_types").select("id, name, slug, kind, settings").eq("workspace_id", ws.id).order("name"),
      sb.from("poll_votes").select("link_id, email, name, picks"),
    ]);
    return {
      links: (must(links) ?? []) as LinkRow[],
      types: ((must(types) ?? []) as { id: string; name: string; slug: string; kind: string; settings: { lengths: number[] } }[]).map((t) => ({ ...t, lengths: t.settings.lengths })),
      votes: (must(votes) ?? []) as { link_id: string; email: string; name: string | null; picks: string[] }[],
    };
  }, ws.id);
  const [filter, setFilter] = useState<Filter>("open");
  const [query, setQuery] = useState("");
  const [making, setMaking] = useState<Kind | null>(createKind);
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (createKind()) history.replaceState(null, "", window.location.pathname);
  }, []);

  const act = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const call = (action: string, id: string) => postJson<{ url?: string }>(session, "/api/book/links", { workspaceId: ws.id, action, id });
  const copy = (l: LinkRow) =>
    act(async () => {
      const r = await call("url", l.id);
      if (r.url && (await copyText(r.url))) {
        setCopied(l.id);
        setTimeout(() => setCopied((c) => (c === l.id ? null : c)), 1600);
      }
    });

  const typeName = useMemo(() => new Map((data.data?.types ?? []).map((t) => [t.id, t.name])), [data.data]);
  const rows = useMemo(() => {
    const all = data.data?.links ?? [];
    const q = query.trim().toLowerCase();
    return all.filter((l) => {
      const s = linkState(l);
      if (filter === "open" && s !== "waiting" && s !== "voting") return false;
      const name = (l.title || (l.type_id ? typeName.get(l.type_id) : "") || "").toLowerCase();
      return !q || name.includes(q);
    });
  }, [data.data, filter, query, typeName]);

  const newButtons = (
    <>
      <Button variant="ghost" onClick={() => setMaking("poll")}>
        New poll
      </Button>
      <Button onClick={() => setMaking("single_use")}>
        <Plus size={14} />
        New link
      </Button>
    </>
  );
  const dialog = making ? (
    <LinkDialog
      sb={sb}
      session={session}
      ws={ws}
      types={data.data?.types ?? []}
      initialKind={making}
      onClose={() => {
        setMaking(null);
        data.reload();
      }}
    />
  ) : null;

  if (data.data && !data.data.links.length)
    return (
      <Page title="Links and polls" actions={newButtons}>
        {dialog}
        <div className="mx-auto w-full max-w-5xl">
          <ConnectCalendar sb={sb} session={session} ws={ws} />
        </div>
        <ToolIntro
          sketch="envelopes"
          title={"One link for one lead,\nor let a group vote"}
          lead="A single-use link books once and closes. A one-off meeting offers a few of your times. A poll lets guests vote, then you book the time that works."
          action={newButtons}
        />
      </Page>
    );

  const counts = data.data ? { open: data.data.links.filter((l) => ["waiting", "voting"].includes(linkState(l))).length, all: data.data.links.length } : undefined;
  return (
    <Page title="Links and polls" actions={newButtons} flush>
      {dialog}
      <Tabs<Filter>
        value={filter}
        tabs={[
          { value: "open", label: "Open", count: counts?.open },
          { value: "all", label: "All", count: counts?.all },
        ]}
        onChange={setFilter}
      />
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-5 md:p-7">
        <label className="relative flex max-w-sm items-center">
          <Search size={14} className="pointer-events-none absolute left-3 text-faint" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search links" aria-label="Search links" className="h-9 pl-8" />
        </label>
        <ConnectCalendar sb={sb} session={session} ws={ws} />
        <ErrorNote message={error || data.error} />
        {!data.data ? (
          <Loading />
        ) : !rows.length ? (
          <p className="py-10 text-center text-[13.5px] text-muted">{filter === "open" ? "No open links" : "No matches"}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((l, i) => {
              const s = linkState(l);
              const st = LINK_STATE[s];
              const votes = (data.data?.votes ?? []).filter((v) => v.link_id === l.id);
              const owner = people.data?.byId.get(l.owner_user_id);
              const mine = l.owner_user_id === me || role === "owner";
              const name = l.title || (l.type_id ? typeName.get(l.type_id) : null) || LINK_KIND[l.kind];
              return (
                <li key={l.id} className="anim-rise-sm rounded-2xl border border-line bg-card" style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-butter-wash text-butter">
                      <LinkIcon size={15} />
                    </span>
                    <button type="button" onClick={() => setOpen(open === l.id ? null : l.id)} disabled={l.kind === "single_use"} className="flex min-w-0 flex-1 flex-col text-left">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[14px] font-semibold tracking-[-0.01em] text-ink">{name}</span>
                        <Badge tone={st.tone} dot>
                          {st.label}
                        </Badge>
                      </span>
                      <span className="truncate text-[12.5px] text-muted">
                        {LINK_KIND[l.kind]}
                        {l.kind !== "single_use" ? ` · ${l.offered.length} ${l.offered.length === 1 ? "time" : "times"}` : ""}
                        {l.kind === "poll" ? ` · ${votes.length} ${votes.length === 1 ? "vote" : "votes"}` : ""}
                        {` · ${new Date(l.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                      </span>
                    </button>
                    <PersonAvatar person={owner} label={owner?.name ?? "Former teammate"} size={24} />
                    {s === "waiting" || s === "voting" ? (
                      <Button variant="ghost" size="sm" onClick={() => void copy(l)}>
                        {copied === l.id ? "Copied" : "Copy link"}
                      </Button>
                    ) : null}
                    {mine ? (
                      <MoreMenu
                        items={[
                          s === "waiting" || s === "voting" ? { label: "Close", run: () => void act(async () => { await call("close", l.id); data.reload(); }) } : null,
                          {
                            label: "Delete",
                            danger: true,
                            run: () =>
                              void act(async () => {
                                if (!(await askConfirm(`Delete this ${LINK_KIND[l.kind].toLowerCase()}?`, { body: s === "booked" ? "The meeting it booked stays." : undefined, ok: "Delete", danger: true }))) return;
                                await call("delete", l.id);
                                data.reload();
                              }),
                          },
                        ]}
                      />
                    ) : null}
                  </div>
                  {open === l.id && l.kind !== "single_use" ? <Times link={l} votes={votes} canBook={l.kind === "poll" && s === "voting" && mine} onBook={(start) => act(async () => {
                    if (!(await askConfirm(`Book ${new Date(start).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}?`, { body: "Everyone who voted gets the invite.", ok: "Book" }))) return;
                    await postJson(session, "/api/book/polls", { workspaceId: ws.id, linkId: l.id, start });
                    data.reload();
                  })} /> : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Page>
  );
}

/** A one-off meeting's or poll's times, with each time's votes as faces and a bar; Book this time on polls. */
function Times({ link, votes, canBook, onBook }: { link: LinkRow; votes: { email: string; name: string | null; picks: string[] }[]; canBook: boolean; onBook: (start: string) => void }) {
  const max = Math.max(1, ...link.offered.map((o) => votes.filter((v) => v.picks.includes(o.start)).length));
  return (
    <ul className="anim-rise-sm flex flex-col gap-1 border-t border-line px-4 py-3">
      {link.offered.map((o) => {
        const who = votes.filter((v) => v.picks.includes(o.start));
        const best = who.length === max && who.length > 0;
        return (
          <li key={o.start} className="flex items-center gap-3 text-[13px]">
            <span className="w-48 shrink-0 text-ink tabular-nums">{new Date(o.start).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
            {link.kind === "poll" ? (
              <>
                <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-paper-deep">
                  <span className={`anim-grow-x absolute inset-y-0 left-0 rounded-full ${best ? "bg-sage" : "bg-line-strong"}`} style={{ width: `${(who.length / max) * 100}%` }} />
                </span>
                <span className="w-16 shrink-0 text-right text-muted tabular-nums" title={who.map((v) => v.name || v.email).join(", ")}>
                  {who.length} {who.length === 1 ? "vote" : "votes"}
                </span>
                {canBook ? (
                  <Button variant={best ? "primary" : "plain"} size="sm" onClick={() => onBook(o.start)}>
                    Book
                  </Button>
                ) : null}
              </>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
