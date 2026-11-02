"use client";

// Scheduling › Links and polls (docs/app-structure.md 6.5): every single-use link, one-off meeting and poll, with its
// state (Waiting, Voting, Booked, Closed, Expired), who made it and when, Copy link, and for polls the votes per time
// with Book this time. ?create=single_use|one_off|poll opens the new-link dialog (from the Create menu).

import { Fragment, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Link as LinkIcon, Plus, Search } from "../../Icons";
import { askConfirm } from "../Dialogs";
import { Popover } from "../FilterBar";
import { MoreMenu } from "../StatCards";
import { ToolIntro } from "../ToolIntro";
import { Badge, Button, ErrorNote, errorText, Input, Loading, must, Page, postJson, Segmented, Td, Th, useQuery, type ViewProps } from "../ui";
import { useMeetingTypes } from "../meetings/TypesList";
import { LinkDialog } from "../meetings/LinkDialog";
import { PersonAvatar, usePeople } from "../meetings/parts";
import { ShareMenu } from "../meetings/Share";
import { TabBar, TabBody } from "./frame";
import { LINK_KIND, LINK_STATE, linkState, type LinkRow } from "./model";

type Filter = "open" | "all";
type Kind = LinkRow["kind"];
type Vote = { email: string; name: string | null; picks: string[] };

const createKind = (): Kind | null => {
  if (typeof window === "undefined") return null;
  const k = new URLSearchParams(window.location.search).get("create");
  return k === "single_use" || k === "one_off" || k === "poll" ? k : null;
};

export function LinksPage(props: ViewProps) {
  const { sb, session, ws, role } = props;
  const me = session.user.id;
  const people = usePeople(sb, ws.id);
  // The links with their own poll votes (one query; votes only for these links).
  const links = useQuery(`meeting_links:${ws.id}`, async () =>
    (must(
      await sb
        .from("meeting_links")
        .select("id, kind, type_id, owner_user_id, title, offered, length_min, used_at, meeting_id, closed_at, expires_at, created_at, votes:poll_votes(email, name, picks)")
        .eq("workspace_id", ws.id)
        .order("created_at", { ascending: false })
        .limit(500),
    ) ?? []) as (LinkRow & { votes: Vote[] })[],
  );
  const typeRows = useMeetingTypes(sb, ws.id);
  const types = useMemo(() => (typeRows.data ? [...typeRows.data].sort((a, b) => a.name.localeCompare(b.name)).map((t) => ({ ...t, lengths: t.settings.lengths })) : null), [typeRows.data]);
  const data = { data: links.data && types ? { links: links.data, types } : null, error: links.error || typeRows.error, reload: links.reload };
  const [filter, setFilter] = useState<Filter>("open");
  const [query, setQuery] = useState("");
  const [making, setMaking] = useState<Kind | null>(createKind);
  const [open, setOpen] = useState<string | null>(null);
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

  // One primary button: New, with what to make.
  const newButtons = <NewMenu onPick={setMaking} />;
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
      <TabBody>
        <TabBar>
          <Segmented<Filter>
            label="Which links"
            value={filter}
            options={[
              { value: "open", label: counts ? `Open ${counts.open}` : "Open" },
              { value: "all", label: counts ? `All ${counts.all}` : "All" },
            ]}
            onChange={setFilter}
          />
          <label className="relative flex w-full items-center sm:w-64">
            <Search size={14} className="pointer-events-none absolute left-3 text-faint" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search links" aria-label="Search links" className="h-9 rounded-full pl-8" />
          </label>
        </TabBar>
        <ErrorNote message={error || data.error} />
        {!data.data ? (
          <Loading />
        ) : !rows.length ? (
          <p className="py-10 text-center text-[13.5px] text-muted">{filter === "open" ? "No open links" : "No matches"}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line bg-card">
            <table className="w-full min-w-[760px] border-separate border-spacing-0">
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Kind</Th>
                  <Th>State</Th>
                  <Th className="text-right">Times</Th>
                  <Th className="text-right">Votes</Th>
                  <Th>Host</Th>
                  <Th>Made</Th>
                  <Th className="w-[88px]">
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => {
                  const st = LINK_STATE[linkState(l)];
                  const s = linkState(l);
                  const votes = (l as LinkRow & { votes?: Vote[] }).votes ?? [];
                  const owner = people.data?.byId.get(l.owner_user_id);
                  const mine = l.owner_user_id === me || role === "owner";
                  const name = l.title || (l.type_id ? typeName.get(l.type_id) : null) || LINK_KIND[l.kind];
                  const live = s === "waiting" || s === "voting";
                  const expands = l.kind !== "single_use";
                  const isOpen = open === l.id;
                  return (
                    <Fragment key={l.id}>
                      <tr aria-expanded={expands ? isOpen : undefined} onClick={() => expands && setOpen(isOpen ? null : l.id)} className={`group ${expands ? "cursor-pointer" : ""} ${isOpen ? "bg-hover" : "hover:bg-hover"}`}>
                        <Td>
                          <span className="flex min-w-0 items-center gap-2.5">
                            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-butter-wash text-butter">
                              <LinkIcon size={13} />
                            </span>
                            <span className="truncate font-medium text-ink">{name}</span>
                            {expands ? <ChevronDown size={12} className={`shrink-0 text-faint transition-transform duration-[140ms] ${isOpen ? "rotate-180" : ""}`} /> : null}
                          </span>
                        </Td>
                        <Td className="text-muted">{LINK_KIND[l.kind]}</Td>
                        <Td>
                          <Badge tone={st.tone} dot>
                            {st.label}
                          </Badge>
                        </Td>
                        <Td className="text-right text-muted tabular-nums">{l.kind === "single_use" ? "Any" : l.offered.length}</Td>
                        <Td className="text-right text-muted tabular-nums">{l.kind === "poll" ? votes.length : ""}</Td>
                        <Td>
                          <span className="flex items-center gap-2">
                            <PersonAvatar person={owner} label={owner?.name ?? "Former teammate"} size={20} />
                            <span className="truncate text-muted">{owner?.name ?? "Former teammate"}</span>
                          </span>
                        </Td>
                        <Td className="text-muted tabular-nums">{new Date(l.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</Td>
                        <Td>
                          <span onClick={(e) => e.stopPropagation()} className="flex items-center justify-end gap-0.5">
                            {live ? <ShareMenu name={name} get={async () => (await call("url", l.id)).url ?? ""} onError={setError} /> : null}
                            {mine ? (
                              <MoreMenu
                                items={[
                                  live ? { label: "Close", run: () => void act(() => links.mutate((ls) => ls.map((x) => (x.id === l.id ? { ...x, closed_at: new Date().toISOString() } : x)), () => call("close", l.id))) } : null,
                                  {
                                    label: "Delete",
                                    danger: true,
                                    run: () =>
                                      void act(async () => {
                                        if (!(await askConfirm(`Delete this ${LINK_KIND[l.kind].toLowerCase()}?`, { body: s === "booked" ? "The meeting it booked stays." : undefined, ok: "Delete", danger: true }))) return;
                                        await links.mutate((ls) => ls.filter((x) => x.id !== l.id), () => call("delete", l.id));
                                      }),
                                  },
                                ]}
                              />
                            ) : null}
                          </span>
                        </Td>
                      </tr>
                      {isOpen && expands ? (
                        <tr>
                          <td colSpan={8} className="border-b border-line-light bg-paper p-0">
                            {l.kind === "poll" ? (
                              <PollGrid
                                link={l}
                                votes={votes}
                                canBook={s === "voting" && mine}
                                onBook={(start) =>
                                  act(async () => {
                                    if (!(await askConfirm(`Book ${new Date(start).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}?`, { body: "Everyone who voted gets the invite.", ok: "Book" }))) return;
                                    await postJson(session, "/api/book/polls", { workspaceId: ws.id, linkId: l.id, start });
                                    data.reload();
                                  })
                                }
                              />
                            ) : (
                              <Times link={l} />
                            )}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </TabBody>
    </Page>
  );
}

/** New, with a menu of what to make: a single-use link, a one-off meeting or a poll. */
function NewMenu({ onPick }: { onPick: (k: Kind) => void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <Button aria-haspopup="menu" aria-expanded={!!anchor} onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}>
        <Plus size={14} />
        New
      </Button>
      {anchor ? (
        <Popover anchor={anchor} onClose={() => setAnchor(null)} width={200}>
          <div role="menu" className="flex flex-col p-1">
            {(["single_use", "one_off", "poll"] as Kind[]).map((k) => (
              <button key={k} type="button" role="menuitem" onClick={() => (setAnchor(null), onPick(k))} className="flex h-8 items-center rounded-md px-2.5 text-left text-[13px] text-ink hover:bg-hover">
                {LINK_KIND[k]}
              </button>
            ))}
          </div>
        </Popover>
      ) : null}
    </>
  );
}

/** A one-off meeting's offered times. */
function Times({ link }: { link: LinkRow }) {
  return (
    <ul className="anim-rise-sm flex flex-wrap gap-2 px-4 py-3">
      {link.offered.map((o) => (
        <li key={o.start} className="rounded-full border border-line bg-card px-3 py-1 text-[12.5px] text-ink tabular-nums">
          {new Date(o.start).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
        </li>
      ))}
    </ul>
  );
}

/**
 * A poll's results: a row a voter, a column a time, a shaded cell for each yes. The time with the most votes is
 * marked, and Book this time sits under it (and under every time, for the owner).
 */
export function PollGrid({ link, votes, canBook, onBook }: { link: LinkRow; votes: Vote[]; canBook: boolean; onBook: (start: string) => void }) {
  const tally = link.offered.map((o) => votes.filter((v) => v.picks.includes(o.start)).length);
  const max = Math.max(0, ...tally);
  return (
    <div className="anim-rise-sm overflow-x-auto px-4 py-3">
      <table className="border-separate border-spacing-1 text-[12.5px]">
        <thead>
          <tr>
            <th className="w-40" />
            {link.offered.map((o, i) => (
              <th key={o.start} className={`min-w-[96px] rounded-md px-2 py-1.5 text-center font-medium tabular-nums ${tally[i] === max && max > 0 ? "bg-signal-soft text-signal-text" : "text-ink"}`}>
                <span className="block text-[11px] font-normal text-muted">{new Date(o.start).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>
                {new Date(o.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {votes.length ? (
            votes.map((v) => (
              <tr key={v.email}>
                <td className="truncate pr-2 text-ink">{v.name || v.email}</td>
                {link.offered.map((o) => {
                  const yes = v.picks.includes(o.start);
                  return (
                    <td key={o.start} aria-label={yes ? "Yes" : "No"} className={`h-7 rounded-md text-center ${yes ? "bg-signal-line text-signal-text" : "bg-paper-deep"}`}>
                      {yes ? <Check size={12} className="inline" /> : null}
                    </td>
                  );
                })}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={link.offered.length + 1} className="py-2 text-muted">
                No votes yet
              </td>
            </tr>
          )}
          <tr>
            <td className="pt-1 text-muted">Votes</td>
            {link.offered.map((o, i) => (
              <td key={o.start} className="pt-1 text-center font-semibold text-ink tabular-nums">
                {tally[i]}
              </td>
            ))}
          </tr>
          {canBook ? (
            <tr>
              <td />
              {link.offered.map((o, i) => (
                <td key={o.start} className="pt-1 text-center">
                  <Button size="sm" variant={tally[i] === max && max > 0 ? "primary" : "ghost"} onClick={() => onBook(o.start)}>
                    Book this time
                  </Button>
                </td>
              ))}
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
