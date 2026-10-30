"use client";

// Scheduling › Meeting types (docs/app-structure.md 6.2), after Calendly's Event types: grouped by person (yours,
// the team's, each teammate's) with a link to that page, each type a card with a colored edge, its summary, its hours
// in words, an on/off switch, Copy link and a ⋯ menu. Pick several with the checkboxes to turn off or delete them.
// A type opens in its editor (/scheduling/types/<id>).

import { useMemo, useState } from "react";
import type { Availability, Kind } from "@/lib/meetings/types";
import { Check, Copy, ExternalLink, Plus, Search } from "../../Icons";
import { askConfirm } from "../Dialogs";
import { Select } from "../Select";
import { MoreMenu } from "../StatCards";
import { ToolIntro } from "../ToolIntro";
import { Badge, Button, ErrorNote, errorText, Input, Loading, must, Page, Toggle, useLoad, type ViewProps } from "../ui";
import { LinkDialog } from "../meetings/LinkDialog";
import { copyText, meetingsApi, ownZone, PersonAvatar, usePeople, useWorkspaceSlug } from "../meetings/parts";
import type { TypeRow } from "../meetings/TypesList";
import { ConnectCalendar } from "./ConnectCalendar";
import { groupTypes, KIND_WORDS, typeParts, weeklyWords } from "./model";


export function TypesPage(props: ViewProps) {
  const { sb, session, ws, navigate } = props;
  const me = session.user.id;
  const people = usePeople(sb, ws.id);
  const slug = useWorkspaceSlug(session, ws.id);
  const data = useLoad(async () => {
    const types = (must(await sb.from("meeting_types").select("*").eq("workspace_id", ws.id).order("created_at")) ?? []) as TypeRow[];
    const hosts = [...new Set(types.flatMap((t) => t.hosts.map((h) => h.user_id)))];
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const [hours, booked] = await Promise.all([
      hosts.length ? sb.from("availability").select("user_id, weekly").eq("workspace_id", ws.id).in("user_id", hosts) : Promise.resolve({ data: [], error: null }),
      sb.from("meetings").select("status, type_id").eq("workspace_id", ws.id).not("type_id", "is", null).gte("created_at", weekAgo),
    ]);
    return {
      types,
      hours: new Map(((must(hours) ?? []) as (Pick<Availability, "weekly"> & { user_id: string })[]).map((h) => [h.user_id, h])),
      week: (must(booked) ?? []) as { status: string; type_id: string }[],
    };
  }, ws.id);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<Kind | "">("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [linkFor, setLinkFor] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const act = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const nameOf = (id: string) => people.data?.byId.get(id)?.name ?? "Former teammate";
  const types = data.data?.types;
  const shown = useMemo(() => (types ?? []).filter((t) => (!kind || t.kind === kind) && (!query.trim() || t.name.toLowerCase().includes(query.trim().toLowerCase()))), [types, kind, query]);
  const groups = groupTypes(shown, me, nameOf);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const typeUrl = (s: string) => (slug.data ? `${origin}/book/${slug.data}/${s}` : "");
  const flash = (id: string) => {
    setCopied(id);
    setTimeout(() => setCopied((c) => (c === id ? null : c)), 1600);
  };
  const setActive = (t: TypeRow, active: boolean) =>
    act(async () => {
      const { name, slug: s, kind: k, hosts, settings, secret, locked, owner_user_id } = t;
      await meetingsApi(session, ws.id, "types", { action: "save", id: t.id, type: { name, slug: s, kind: k, hosts, settings, secret, active, locked, owner_user_id } });
      data.reload();
    });
  const removeMany = (ids: string[]) =>
    act(async () => {
      const n = ids.length;
      if (!(await askConfirm(n === 1 ? `Delete ${types?.find((t) => t.id === ids[0])?.name}?` : `Delete ${n} meeting types?`, { body: "Their booking links stop working. Booked meetings stay.", ok: "Delete", danger: true }))) return;
      for (const id of ids) await meetingsApi(session, ws.id, "types", { action: "delete", id });
      setPicked(new Set());
      data.reload();
    });

  const actions = (
    <>
      <Button variant="ghost" onClick={() => navigate("scheduling", "availability")}>
        Manage availability
      </Button>
      <Button onClick={() => navigate("scheduling", "types/new")}>
        <Plus size={14} />
        New meeting type
      </Button>
    </>
  );

  if (types && !types.length)
    return (
      <Page title="Meeting types" actions={actions}>
        <div className="mx-auto w-full max-w-5xl">
          <ConnectCalendar sb={sb} session={session} ws={ws} />
        </div>
        <ToolIntro
          sketch="calendar"
          title={"Share one link\nand let leads pick a time"}
          lead="A meeting type sets who hosts, how long, when and where. Share it as a page, a one-time link or times in an email; every booking lands on the lead."
          action={
            <Button onClick={() => navigate("scheduling", "types/new")}>
              <Plus size={14} />
              New meeting type
            </Button>
          }
        />
      </Page>
    );

  const week = data.data?.week ?? [];
  const noShows = week.filter((m) => m.status === "no_show").length;
  return (
    <Page title="Meeting types" count={types?.length} actions={actions}>
      {linkFor ? <LinkDialog sb={sb} session={session} ws={ws} types={(types ?? []).map((t) => ({ ...t, lengths: t.settings.lengths }))} initialType={linkFor} onClose={() => setLinkFor(null)} /> : null}
      <div className="mx-auto flex max-w-5xl flex-col gap-5">
        <ConnectCalendar sb={sb} session={session} ws={ws} />
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative flex min-w-[220px] flex-1 items-center sm:max-w-sm">
            <Search size={14} className="pointer-events-none absolute left-3 text-faint" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search meeting types" aria-label="Search meeting types" className="h-9 pl-8" />
          </label>
          <Select<string> value={kind} options={[{ value: "", label: "Any kind" }, ...(Object.keys(KIND_WORDS) as Kind[]).map((k) => ({ value: k, label: KIND_WORDS[k] }))]} onChange={(v) => setKind(v as Kind | "")} ariaLabel="Kind" className="h-9 w-44" />
          {types ? (
            <span className="ml-auto text-[12.5px] text-faint">
              {week.length} booked this week{noShows ? `, ${noShows} no-show${noShows === 1 ? "" : "s"}` : ""}
            </span>
          ) : null}
        </div>
        {picked.size ? (
          <div className="anim-rise-sm flex items-center gap-2 rounded-full border border-line bg-paper px-4 py-1.5 text-[13px]">
            <span className="flex-1 text-ink">{picked.size} selected</span>
            <Button variant="plain" size="sm" onClick={() => act(async () => { for (const id of picked) { const t = types?.find((x) => x.id === id); if (t?.active) await setActive(t, false); } setPicked(new Set()); })}>
              Turn off
            </Button>
            <Button variant="danger" size="sm" onClick={() => void removeMany([...picked])}>
              Delete
            </Button>
            <Button variant="plain" size="sm" onClick={() => setPicked(new Set())}>
              Clear
            </Button>
          </div>
        ) : null}
        <ErrorNote message={error || data.error || slug.error} />
        {!data.data ? (
          <Loading />
        ) : !shown.length ? (
          <p className="py-10 text-center text-[13.5px] text-muted">No matches</p>
        ) : (
          groups.map((g) => {
            const person = g.person ? people.data?.byId.get(g.person) : null;
            const pageUrl = slug.data ? (g.person ? (person?.slug ? `${origin}/book/${slug.data}/${person.slug}` : "") : `${origin}/book/${slug.data}`) : "";
            return (
              <section key={g.key} className="flex flex-col gap-2.5">
                <header className="flex items-center gap-2.5">
                  {g.person ? <PersonAvatar person={person} label={nameOf(g.person)} size={30} /> : <span className="flex size-[30px] items-center justify-center rounded-full bg-paper-deep text-[11px] font-semibold text-body">{ws.name.slice(0, 2).toUpperCase()}</span>}
                  <span className="text-[14px] font-semibold tracking-[-0.01em] text-ink">{g.person ? (g.person === me ? "You" : nameOf(g.person)) : "Team"}</span>
                  {pageUrl ? (
                    <a href={pageUrl} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-[12.5px] font-medium text-ink underline decoration-line-strong underline-offset-[3px] hover:decoration-ink">
                      View booking page
                      <ExternalLink size={12} />
                    </a>
                  ) : null}
                </header>
                <ul className="flex flex-col gap-2">
                  {g.types.map((t, i) => {
                    const url = typeUrl(t.slug);
                    const first = t.hosts[0]?.user_id;
                    const on = picked.has(t.id);
                    return (
                      <li
                        key={t.id}
                        className={`group anim-rise-sm relative flex items-center gap-3 overflow-hidden rounded-[10px] border bg-card py-3.5 pr-3 pl-4 transition-colors duration-[140ms] ${on ? "border-ink" : "border-line hover:border-line-strong"} ${t.active ? "" : "opacity-60"}`}
                        style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                      >
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={on}
                          aria-label={`Select ${t.name}`}
                          onClick={() => setPicked((s) => { const n = new Set(s); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; })}
                          className={`relative z-10 flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-opacity duration-[140ms] ${on ? "border-ink bg-ink text-paper opacity-100" : "border-line-strong opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"} ${picked.size ? "md:opacity-100" : ""}`}
                        >
                          {on ? <Check size={11} /> : null}
                        </button>
                        <button type="button" onClick={() => navigate("scheduling", `types/${t.id}`)} className="flex min-w-0 flex-1 flex-col gap-0.5 text-left after:absolute after:inset-0">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-[15px] font-semibold tracking-[-0.01em] text-ink">{t.name}</span>
                            {t.secret ? <Badge>Secret</Badge> : null}
                            {t.template_id ? <Badge>Managed</Badge> : null}
                            {t.settings.price ? <Badge>Paid</Badge> : null}
                          </span>
                          <span className="mt-1 flex flex-wrap gap-1.5">
                            {typeParts(t).map((x) => (
                              <span key={x} className="inline-flex h-6 items-center rounded-full border border-line px-2.5 text-[12px] text-body">
                                {x}
                              </span>
                            ))}
                          </span>
                          <span className="truncate text-[12.5px] text-faint">{first ? weeklyWords(data.data?.hours.get(first)) : "No hosts"}</span>
                        </button>
                        <span className="relative z-10 flex shrink-0 items-center gap-1.5">
                          <Toggle label={t.active ? `Turn off ${t.name}` : `Turn on ${t.name}`} on={t.active} onChange={(v) => void setActive(t, v)} />
                          {url ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                void copyText(url).then((ok) => {
                                  if (ok) flash(t.id);
                                })
                              }
                            >
                              {copied === t.id ? <Check size={13} className="text-sage" /> : <Copy size={13} />}
                              {copied === t.id ? "Copied" : "Copy link"}
                            </Button>
                          ) : null}
                          <MoreMenu
                            items={[
                              { label: "Edit", run: () => navigate("scheduling", `types/${t.id}`) },
                              url ? { label: "Open booking page", run: () => window.open(url, "_blank", "noopener") } : null,
                              { label: "New single-use link", run: () => setLinkFor(t.id) },
                              {
                                label: "Copy times for an email",
                                run: () =>
                                  void act(async () => {
                                    const r = await meetingsApi<{ text: string }>(session, ws.id, "times", { typeId: t.id, tz: ownZone() });
                                    if (!r.text) throw new Error(`${t.name} has no free times in its window.`);
                                    if (await copyText(r.text)) flash(t.id);
                                  }),
                              },
                              { label: "Duplicate", run: () => void act(async () => navigate("scheduling", `types/${(await meetingsApi<{ id: string }>(session, ws.id, "types", { action: "duplicate", id: t.id })).id}`)) },
                              { label: "Delete", danger: true, run: () => void removeMany([t.id]) },
                            ]}
                          />
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })
        )}
      </div>
    </Page>
  );
}
