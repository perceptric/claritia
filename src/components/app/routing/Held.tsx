"use client";

// Routing › Held (docs/router-ux.md 4.9): leads the spam check held back and leads no one could take, one list each.
// Held rows show why as pills; Let through routes them at once and shows the new owner before the row slides out.
// Keyboard: J and K move, X selects, L lets through, S marks spam.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { askConfirm } from "../Dialogs";
import { usePeople } from "../meetings/parts";
import { CheckBox } from "../records/RecordTable";
import { Badge, Button, Empty, ErrorNote, errorText, Loading, must, Segmented, timeAgo, useLoad, type ViewProps } from "../ui";
import { routingApi } from "./api";
import { PersonPicker, RouteSketch, useToast } from "./screenParts";
import { domainOf, heldWords, type RunRow } from "./screensModel";

type Props = Pick<ViewProps, "sb" | "session" | "ws" | "role" | "navigate"> & { sub: string };
type Mode = "held" | "unassigned";
type Lead = { id: string; first_name: string | null; last_name: string | null; email: string | null; updated_at: string };
type Item = Lead & { run: Pick<RunRow, "id" | "kind" | "steps" | "created_at"> | null };

const nameOf = (l: Lead) => [l.first_name, l.last_name].filter(Boolean).join(" ").trim();

/** The most common domain among the leads, for "Block <domain> too". */
const topDomain = (items: Item[]) => {
  const n = new Map<string, number>();
  for (const i of items) {
    const d = domainOf(i.email);
    if (d) n.set(d, (n.get(d) ?? 0) + 1);
  }
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
};

export function HeldTab({ sb, session, ws, role, navigate }: Props) {
  const owner = role === "owner";
  const people = usePeople(sb, ws.id);
  const [mode, setMode] = useState<Mode>("held");
  const counts = useLoad(async () => {
    const [h, u] = await Promise.all([
      sb.from("contacts").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id).eq("route_status", "held").is("deleted_at", null),
      sb.from("contacts").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id).eq("route_status", "unassigned").is("deleted_at", null),
    ]);
    if (h.error || u.error) throw new Error((h.error ?? u.error)!.message);
    return { held: h.count ?? 0, unassigned: u.count ?? 0 };
  }, ws.id);
  const list = useLoad(async () => {
    const leads = must(await sb.from("contacts").select("id, first_name, last_name, email, updated_at").eq("workspace_id", ws.id).eq("route_status", mode).is("deleted_at", null).order("updated_at", { ascending: false }).limit(200)) as Lead[];
    const runs = leads.length ? (must(await sb.from("router_runs").select("id, contact_id, kind, steps, created_at").eq("workspace_id", ws.id).in("contact_id", leads.map((l) => l.id)).order("created_at", { ascending: false }).limit(1000)) as (Item["run"] & { contact_id: string })[]) : [];
    const latest = new Map<string, Item["run"]>();
    for (const r of runs) if (!latest.has(r.contact_id)) latest.set(r.contact_id, r);
    return leads.map((l): Item => ({ ...l, run: latest.get(l.id) ?? null }));
  }, `${ws.id}:${mode}`);
  const toast = useToast();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState(0);
  const [done, setDone] = useState<Record<string, string>>({});
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [assign, setAssign] = useState<{ ids: string[]; anchor: HTMLElement } | null>(null);
  const rowsRef = useRef<HTMLTableSectionElement>(null);

  const items = useMemo(() => (list.data ?? []).filter((i) => !gone.has(i.id)), [list.data, gone]);
  const switchMode = (m: Mode) => {
    setMode(m);
    setPicked(new Set());
    setFocus(0);
    setGone(new Set());
    setDone({});
    setLeaving(new Set());
  };

  /** Rows that leave: the new owner (or word) shows, then they slide out. */
  const leave = useCallback((words: Record<string, string>) => {
    setDone((d) => ({ ...d, ...words }));
    const ids = Object.keys(words);
    setTimeout(() => setLeaving((s) => new Set([...s, ...ids])), 900);
    setTimeout(() => {
      setGone((s) => new Set([...s, ...ids]));
      setPicked((s) => new Set([...s].filter((x) => !ids.includes(x))));
      counts.reload();
    }, 1250);
  }, [counts]);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const target = (ids?: string[]) => (ids?.length ? ids : picked.size ? [...picked] : items[focus] ? [items[focus].id] : []);

  const letThrough = (ids?: string[]) =>
    act(async () => {
      const chosen = target(ids);
      if (!chosen.length) return;
      const out = await routingApi<{ done: { contact: string; owner: string | null; kind: string }[] }>(session, ws.id, "held", { op: "let_through", contacts: chosen });
      leave(Object.fromEntries(out.done.map((d) => [d.contact, d.owner ? `→ ${people.data?.byId.get(d.owner)?.name ?? "Routed"}` : d.kind === "unassigned" ? "→ Unassigned" : "→ Held"])));
    });

  const spam = (ids?: string[]) =>
    act(async () => {
      const chosen = target(ids);
      if (!chosen.length) return;
      await routingApi(session, ws.id, "held", { op: "spam", contacts: chosen });
      leave(Object.fromEntries(chosen.map((id) => [id, "Spam"])));
      const domain = topDomain(items.filter((i) => chosen.includes(i.id)));
      toast.show(`Marked ${chosen.length} as spam`, domain ? { label: `Block ${domain} too`, run: () => void act(async () => void (await routingApi(session, ws.id, "held", { op: "block_domain", domain }))) } : undefined);
    });

  const allowDomain = (ids?: string[]) =>
    act(async () => {
      const chosen = items.filter((i) => target(ids).includes(i.id));
      const domains = [...new Set(chosen.map((i) => domainOf(i.email)).filter(Boolean))];
      if (!domains.length || !(await askConfirm(domains.length === 1 ? `Allow ${domains[0]}?` : `Allow ${domains.length} domains?`, { body: domains.join(", "), ok: "Allow" }))) return;
      const words: Record<string, string> = {};
      for (const d of domains) {
        const out = await routingApi<{ done?: { contact: string; owner: string | null; kind: string }[] }>(session, ws.id, "held", { op: "allow_domain", domain: d });
        for (const x of out.done ?? []) words[x.contact] = x.owner ? `→ ${people.data?.byId.get(x.owner)?.name ?? "Routed"}` : "→ Unassigned";
      }
      if (Object.keys(words).length) leave(words);
      toast.show(domains.length === 1 ? `${domains[0]} allowed` : `${domains.length} domains allowed`);
    });

  const routeAgain = (ids?: string[]) =>
    act(async () => {
      const chosen = target(ids);
      if (!chosen.length || !(await askConfirm(chosen.length === 1 ? "Route this lead again?" : `Route ${chosen.length} leads again?`, { ok: "Route again" }))) return;
      const out = await routingApi<{ run?: string; queued?: number; result?: { kind: string; user?: string } }>(session, ws.id, "route", { contacts: chosen });
      if (out.queued) {
        toast.show(`Routing ${out.queued}`);
        leave(Object.fromEntries(chosen.map((id) => [id, "Routing…"])));
      } else if (out.result) leave({ [chosen[0]!]: out.result.kind === "owner" && out.result.user ? `→ ${people.data?.byId.get(out.result.user)?.name ?? "Routed"}` : out.result.kind === "held" ? "→ Held" : "→ Unassigned" });
    });

  const doAssign = (ids: string[], user: string) =>
    act(async () => {
      await routingApi(session, ws.id, "held", { op: "assign", contacts: ids, user });
      leave(Object.fromEntries(ids.map((id) => [id, `→ ${people.data?.byId.get(user)?.name ?? "Assigned"}`])));
    });

  // J, K, X, L and S, unless typing or a menu is open.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || t.closest("input, textarea, [contenteditable], [role='dialog'], [role='listbox']")) return;
      const k = e.key.toLowerCase();
      if (k === "j" || k === "k") {
        e.preventDefault();
        setFocus((f) => {
          const n = Math.max(0, Math.min(items.length - 1, f + (k === "j" ? 1 : -1)));
          rowsRef.current?.querySelectorAll<HTMLElement>("tr[data-row]")[n]?.focus();
          return n;
        });
      } else if (k === "x" && items[focus] && owner) {
        e.preventDefault();
        const id = items[focus].id;
        setPicked((s) => {
          const n = new Set(s);
          if (n.has(id)) n.delete(id);
          else n.add(id);
          return n;
        });
      } else if (k === "l" && owner && mode === "held" && !busy) {
        e.preventDefault();
        void letThrough();
      } else if (k === "s" && owner && mode === "held" && !busy) {
        e.preventDefault();
        void spam();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  const n = counts.data;
  const allPicked = items.length > 0 && items.every((i) => picked.has(i.id));
  const err = list.error || counts.error || people.error;

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5 md:px-5">
        <Segmented<Mode>
          label="List"
          value={mode}
          onChange={switchMode}
          options={[
            { value: "held", label: n ? `Held ${n.held}` : "Held" },
            { value: "unassigned", label: n ? `Unassigned ${n.unassigned}` : "Unassigned" },
          ]}
        />
        {owner && picked.size ? (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {mode === "held" ? (
              <>
                <Button size="sm" onClick={() => void letThrough()} disabled={busy}>
                  Let through
                </Button>
                <Button variant="ghost" size="sm" onClick={() => void spam()} disabled={busy}>
                  Spam
                </Button>
                <Button variant="ghost" size="sm" onClick={() => void allowDomain()} disabled={busy}>
                  Allow domain
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" onClick={(e) => setAssign({ ids: [...picked], anchor: e.currentTarget })} disabled={busy}>
                  Assign
                </Button>
                <Button variant="ghost" size="sm" onClick={() => void routeAgain()} disabled={busy}>
                  Route again
                </Button>
              </>
            )}
          </div>
        ) : null}
      </div>
      {error ? (
        <div className="px-5 pt-4">
          <ErrorNote message={error} />
        </div>
      ) : null}

      {err ? (
        <div className="p-5">
          <ErrorNote message={err} />
        </div>
      ) : !list.data ? (
        <Loading />
      ) : !items.length ? (
        <Empty sketch={<RouteSketch />} title={mode === "held" ? "Nothing held" : "Nothing unassigned"} />
      ) : (
        <div className="overflow-x-hidden">
          <table className="w-full border-collapse [&_tbody_tr:last-child_td]:border-b-0">
            <thead className="sr-only">
              <tr>
                <th>Select</th>
                <th>Lead</th>
                <th>Why</th>
                <th>When</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody ref={rowsRef} aria-live="polite">
              {owner ? (
                <tr>
                  <td className="w-10 border-b border-line py-2 pl-5">
                    <CheckBox label="Select all" on={allPicked} onClick={() => setPicked(allPicked ? new Set() : new Set(items.map((i) => i.id)))} />
                  </td>
                  <td colSpan={4} className="border-b border-line py-2 text-[12px] text-muted">
                    {picked.size ? `${picked.size} selected` : `${items.length} ${items.length === 1 ? "lead" : "leads"}`}
                  </td>
                </tr>
              ) : null}
              {items.map((i, idx) => {
                const name = nameOf(i);
                const pills = mode === "held" ? (i.run ? heldWords(i.run) : []) : ["No one could take it"];
                const word = done[i.id];
                return (
                  <tr
                    key={i.id}
                    data-row=""
                    tabIndex={idx === focus ? 0 : -1}
                    onFocus={() => setFocus(idx)}
                    aria-selected={picked.has(i.id)}
                    className={`outline-none transition-[transform,opacity] duration-[320ms] ease-out focus-visible:bg-hover ${picked.has(i.id) ? "bg-hover" : ""} ${leaving.has(i.id) ? "translate-x-6 opacity-0" : ""}`}
                  >
                    <td className="w-10 border-b border-line py-3 pl-5 align-middle">
                      {owner ? (
                        <CheckBox
                          label={`Select ${name || i.email || "lead"}`}
                          on={picked.has(i.id)}
                          onClick={() => {
                            const s = new Set(picked);
                            if (s.has(i.id)) s.delete(i.id);
                            else s.add(i.id);
                            setPicked(s);
                          }}
                        />
                      ) : null}
                    </td>
                    <td className="max-w-0 border-b border-line py-3 pr-3 align-middle sm:w-[34%]">
                      <button type="button" onClick={() => navigate("contacts", i.id)} className="block max-w-full truncate text-left text-[13.5px] hover:underline">
                        <span className="font-medium text-ink">{name || i.email || "Lead"}</span>
                        {name && i.email ? <span className="text-muted"> · {i.email}</span> : null}
                      </button>
                      <span className="mt-1 flex flex-wrap gap-1 sm:hidden">
                        {pills.map((p) => (
                          <Badge key={p} tone={mode === "held" ? "amber" : "red"}>
                            {p}
                          </Badge>
                        ))}
                      </span>
                    </td>
                    <td className="hidden border-b border-line py-3 pr-3 align-middle sm:table-cell">
                      {word ? (
                        <span className="anim-fade text-[13px] font-medium text-ink">{word}</span>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {pills.map((p) => (
                            <Badge key={p} tone={mode === "held" ? "amber" : "red"}>
                              {p}
                            </Badge>
                          ))}
                        </span>
                      )}
                    </td>
                    <td className="hidden w-24 border-b border-line py-3 pr-3 align-middle text-[12.5px] whitespace-nowrap text-muted md:table-cell">{timeAgo(i.run?.created_at ?? i.updated_at)}</td>
                    <td className="w-px border-b border-line py-3 pr-4 align-middle">
                      <span className="flex justify-end gap-1.5">
                        {word ? (
                          <span className="anim-fade text-[12.5px] font-medium whitespace-nowrap text-ink sm:hidden">{word}</span>
                        ) : mode === "held" ? (
                          owner ? (
                            <>
                              <Button variant="ghost" size="sm" disabled={busy} onClick={() => void letThrough([i.id])}>
                                Let through
                              </Button>
                              <Button variant="plain" size="sm" disabled={busy} onClick={() => void spam([i.id])}>
                                Spam
                              </Button>
                            </>
                          ) : null
                        ) : (
                          <>
                            {owner ? (
                              <Button variant="ghost" size="sm" disabled={busy} onClick={(e) => setAssign({ ids: [i.id], anchor: e.currentTarget })}>
                                Assign
                              </Button>
                            ) : null}
                            <Button variant="plain" size="sm" disabled={busy} onClick={() => void routeAgain([i.id])}>
                              Route again
                            </Button>
                          </>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {assign ? (
        <PersonPicker
          anchor={assign.anchor}
          people={people.data?.list ?? []}
          onClose={() => setAssign(null)}
          onPick={(id) => {
            const ids = assign.ids;
            setAssign(null);
            if (id) void doAssign(ids, id);
          }}
        />
      ) : null}
      {toast.node}
    </div>
  );
}
