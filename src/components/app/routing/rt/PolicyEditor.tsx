"use client";

// One policy's editor (docs/routing-workflow.md Section 7), in the approved demo's order: where leads come from,
// checks and existing ownership, the ordered rules with Everyone else, and what happens when nobody can receive the
// lead. Every change autosaves to the durable draft at the revision the editor read (Saving, then Saved or Couldn't
// save); another tab's or person's save shows as a conflict with reload, compare and reapply, and nothing typed is
// lost. A migrated policy opens on the spec's rules and only goes live through the reviewed publish. Test lead,
// Publish changes, Route & book and the overflow (Versions, Duplicate, Archive) sit in the header.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FieldDef } from "@/lib/router/conditions";
import { COUNTRY_CODES } from "@/lib/forms/countries";
import { countryName, needsValue } from "@/lib/router/conditions";
import { newId } from "@/lib/router/check";
import type { Cond, Rule, RouterBody } from "@/lib/router/types";
import {
  backupDest,
  changesBetween,
  condSummary,
  destName,
  effectiveSource,
  fallbackDest,
  fieldOf,
  hasChanges,
  newCond,
  opLabel,
  opsOf,
  outcomeWords,
  policyState,
  ruleDest,
  ruleProblem,
  toV2,
  withRuleDest,
  withScope,
  type Dest,
} from "@/lib/routing/screenModel";
import { ChevronDown, FormIcon, Play, Plus, Trash, User, X } from "../../../Icons";
import { askConfirm, tell } from "../../Dialogs";
import { Choice } from "../../inbound/parts";
import type { Option } from "../../Select";
import { Sheet } from "../../Sheet";
import { MoreMenu } from "../../StatCards";
import { Button, ErrorNote, IconButton, invalidate, Loading, Page, Toggle, type ViewProps } from "../../ui";
import { toast } from "../Toast";
import { ApiError, newKey, rt, type Screen, type Version } from "./api";
import { HandoffDrawer } from "./HandoffDrawer";
import { DestChoice, keyOf, namesOf, PersonChoice, Row, Sec, State, when } from "./parts";
import { PublishDialog } from "./PublishDialog";
import { SourcesDrawer } from "./SourcesDrawer";
import { TestDrawer } from "./TestDrawer";

type Q = { data: Screen | null; error: string; reload: () => void };
type SaveState = "saved" | "saving" | "error" | "conflict";
type Conflict = { revision: number; draft: RouterBody | null; name: string } | null;

const COUNTRIES: Option<string>[] = COUNTRY_CODES.map((c: string) => ({ value: c, label: countryName(c) })).sort((x, y) => x.label.localeCompare(y.label));

export function PolicyEditor(props: ViewProps & { policyId: string; screen: Q; back: () => void }) {
  const { screen, policyId, back } = props;
  const row = screen.data?.policies.find((p) => p.id === policyId);
  if (!screen.data || !row)
    return (
      <Page title="Policy" back={{ label: "Routing", onClick: back }} flush>
        {screen.error ? (
          <div className="mx-auto max-w-[860px] p-6">
            <ErrorNote message={screen.error} />
          </div>
        ) : screen.data ? (
          <div className="mx-auto max-w-[860px] p-6">
            <ErrorNote message="That policy is gone." />
          </div>
        ) : (
          <Loading />
        )}
      </Page>
    );
  return <Editor key={policyId} {...props} d={screen.data} />;
}

function Editor({ sb, session, ws, navigate, d, policyId, back, screen }: ViewProps & { policyId: string; screen: Q; back: () => void; d: Screen }) {
  const row = d.policies.find((p) => p.id === policyId)!;
  const owner = d.role === "owner" && !row.archived;
  const teamKeys = useMemo(() => new Set(d.teams.flatMap((t) => t.keys)), [d.teams]);
  const names = useMemo(() => namesOf(d.people, d.teams), [d.people, d.teams]);
  const fields = d.fields;

  // The draft on screen: the saved draft, else the live version; a migrated policy on the spec's rules (not saved yet).
  const initial = useMemo(() => {
    const base = row.draft ?? row.live;
    return base ? toV2(base, { reviewer: d.me, teamKeys }) : null;
    // Read once per open: later screen reads never overwrite what's being edited.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [body, setBody] = useState<RouterBody | null>(initial);
  const [name, setName] = useState(row.draft_name ?? row.name);
  const [edited, setEdited] = useState(false);
  const [save, setSave] = useState<SaveState>("saved");
  const [saveErr, setSaveErr] = useState("");
  const [conflict, setConflict] = useState<Conflict>(null);
  const [openRule, setOpenRule] = useState<string | null>(null);
  const [focusName, setFocusName] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<"test" | "sources" | "handoff" | "versions" | "compare" | null>(null);
  const [publishing, setPublishing] = useState(false);
  const seq = useRef(0);
  const latest = useRef<RouterBody | null>(initial);
  useEffect(() => {
    latest.current = body;
  }, [body]);

  // Autosave: one write at a time, at the revision last saved; the newest edit always goes last.
  const rev = useRef(row.draft_revision);
  const pending = useRef<{ body: RouterBody | null; name: string | null } | null>(null);
  const inflight = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const send = useCallback(async () => {
    if (inflight.current) await inflight.current.catch(() => undefined);
    const next = pending.current;
    if (!next) return;
    pending.current = null;
    setSave("saving");
    const p = (async () => {
      try {
        const out = await rt<{ revision: number }>(session, ws.id, "rt_save", { policy: policyId, body: next.body ? withScope(next.body) : null, ...(next.name !== null ? { name: next.name } : {}), revision: rev.current });
        rev.current = out.revision;
        if (!pending.current) {
          setSave("saved");
          setSaveErr("");
        }
        invalidate(`routing_screen:${ws.id}`);
      } catch (e) {
        // Keep what was typed: it goes again with the next save or Try again.
        pending.current = { body: pending.current?.body ?? next.body, name: pending.current?.name ?? next.name };
        if (e instanceof ApiError && e.code === "draft_conflict") {
          setConflict((e.state as Conflict) ?? { revision: rev.current, draft: null, name });
          setSave("conflict");
        } else {
          setSave("error");
          setSaveErr(e instanceof Error ? e.message : "Couldn't save");
        }
        throw e;
      }
    })();
    inflight.current = p;
    await p.finally(() => {
      if (inflight.current === p) inflight.current = null;
    });
  }, [name, policyId, session, ws.id]);
  const queue = (o: { body?: RouterBody; name?: string }) => {
    pending.current = { body: o.body ?? pending.current?.body ?? latest.current, name: o.name ?? pending.current?.name ?? null };
    setSave("saving");
    if (timer.current) clearTimeout(timer.current);
    if (conflict) return;
    timer.current = setTimeout(() => void send().catch(() => undefined), 450);
  };
  /** Save anything waiting now; the revision the server has afterwards. Test and Publish use the saved draft. */
  const flush = async (): Promise<number> => {
    if (timer.current) clearTimeout(timer.current);
    if (pending.current) await send();
    else if (inflight.current) await inflight.current;
    return rev.current;
  };
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  // Leaving with a save still waiting sends it.
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (pending.current || save === "error" || save === "conflict") e.preventDefault();
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [save]);

  const change = (fn: (b: RouterBody) => RouterBody) => {
    // The newest draft, also from a toast's Undo made several renders ago.
    const cur = latest.current;
    if (!cur || !owner) return;
    const next = fn(cur);
    latest.current = next;
    seq.current++;
    setBody(next);
    setEdited(true);
    queue({ body: next });
  };
  const setRule = (id: string, fn: (r: Rule) => Rule) => change((b) => ({ ...b, rules: { ...b.rules, list: b.rules.list.map((r) => (r.id === id ? fn(r) : r)) } }));

  if (!body)
    return (
      <Page title={name} back={{ label: "Routing", onClick: back }} flush>
        <div className="mx-auto max-w-[860px] p-6">
          <ErrorNote message="This policy has nothing saved yet." />
        </div>
      </Page>
    );

  const sources = d.sources.map((s) => ({ s, eff: effectiveSource(s, policyId) })).filter((x) => x.eff.connected);
  const live = row.live;
  const nameStaged = name !== row.name ? name : null;
  const dirty = !!row.draft || edited;
  const changed = dirty ? hasChanges({ draft: withScope(body), live, draft_name: nameStaged, staged: row.staged }) : row.staged > 0 || !!nameStaged;
  const st = policyState({ ...row, draft: dirty ? body : row.draft, draft_name: nameStaged });
  const state = row.active_version && changed ? { label: `Published v${row.active_version} · draft changes`, tone: "amber" as const } : st;
  const reviewer = body.review?.owner ?? null;
  const meetingName = (id: string | null) => {
    const m = d.meetingTypes.find((x) => x.id === id);
    return m ? `${m.name}${m.minutes ? ` · ${m.minutes} min` : ""}` : null;
  };
  const handoffLive = d.sources.find((s) => s.kind === "handoff" && s.enabled && s.policy_id === policyId) || (!d.sources.some((s) => s.kind === "handoff") && row.is_default);

  const order = body.ownership?.order ?? [];
  const ownOn = order.length > 0;
  const scope = withScope(body).scope;
  const scopeWords = scope?.everyone
    ? "Everyone in the workspace can receive leads from this policy"
    : (() => {
        const list = [...(scope?.teams ?? []).map((k) => names.teams[k] ?? "a removed team"), ...(scope?.people ?? []).map((u) => names.people[u] ?? "a former teammate")];
        return list.length ? `Only ${list.length > 1 || scope?.teams.length ? "members of " : ""}${list.join(", ")} can receive leads from this policy` : "Nobody yet: pick where leads go";
      })();

  // Rules ------------------------------------------------------------------------------------------------------
  const addRule = () => {
    const id = newId("r_");
    const f = fields.find((x) => x.key === "lead.country") ?? fields[0]!;
    change((b) => ({ ...b, rules: { ...b.rules, on: true, list: [...b.rules.list, { id, name: "", match: "all", conds: [newCond(f)], queue: "" }] } }));
    setOpenRule(id);
    setFocusName(id);
  };
  const move = (id: string, by: -1 | 1) => {
    change((b) => {
      const list = [...b.rules.list];
      const i = list.findIndex((r) => r.id === id);
      const j = i + by;
      if (i < 0 || j < 0 || j >= list.length) return b;
      [list[i], list[j]] = [list[j]!, list[i]!];
      return { ...b, rules: { ...b.rules, list } };
    });
    requestAnimationFrame(() => (document.querySelector(`[data-move="${id}:${by}"]`) as HTMLButtonElement | null)?.focus());
  };
  const remove = (id: string) => {
    const i = body.rules.list.findIndex((r) => r.id === id);
    const rule = body.rules.list[i];
    if (!rule) return;
    change((b) => ({ ...b, rules: { ...b.rules, list: b.rules.list.filter((r) => r.id !== id) } }));
    if (openRule === id) setOpenRule(null);
    const at = seq.current;
    toast({
      text: `Deleted ${rule.name || "rule"}`,
      action: {
        label: "Undo",
        // Until the next deliberate edit: then the deletion stands.
        run: () => {
          if (seq.current !== at) return;
          change((b) => {
            const list = [...b.rules.list];
            list.splice(Math.min(i, list.length), 0, rule);
            return { ...b, rules: { ...b.rules, list } };
          });
        },
      },
    });
  };

  // Header -----------------------------------------------------------------------------------------------------
  const openTest = async () => {
    setDrawer("test");
  };
  const overflow = (
    <MoreMenu
      label="More"
      items={[
        { label: "Versions", run: () => setDrawer("versions") },
        d.role === "owner" && !row.archived
          ? {
              label: "Duplicate",
              run: () =>
                void (async () => {
                  try {
                    const out = await rt<{ id: string }>(session, ws.id, "rt_duplicate", { policy: policyId, key: newKey("dup") });
                    invalidate(`routing_screen:${ws.id}`);
                    toast({ text: "Created a disconnected copy" });
                    navigate("routing", `policies/${out.id}`);
                  } catch (e) {
                    void tell("Couldn't duplicate", e instanceof Error ? e.message : undefined);
                  }
                })(),
            }
          : null,
        d.role === "owner" && !row.is_default
          ? {
              label: row.archived ? "Restore" : "Archive",
              danger: !row.archived,
              run: () =>
                void (async () => {
                  if (!row.archived && !(await askConfirm(`Archive ${row.name}?`, { body: "New leads can't use an archived policy.", ok: "Archive", danger: true }))) return;
                  try {
                    const out = await rt<{ archived: boolean; sources?: { name: string }[] }>(session, ws.id, "rt_archive", { policy: policyId, archive: !row.archived });
                    if (out.sources?.length) return void tell("Move its sources first", `${out.sources.map((s) => s.name).join(", ")} still route with this policy. Connect them to another policy, publish it, then archive.`);
                    invalidate(`routing_screen:${ws.id}`);
                    toast({ text: row.archived ? "Restored as a draft" : "Archived" });
                    if (!row.archived) back();
                  } catch (e) {
                    void tell("Couldn't change it", e instanceof Error ? e.message : undefined);
                  }
                })(),
            }
          : null,
      ]}
    />
  );
  const saved = save === "saving" ? "Saving…" : save === "error" ? "Couldn't save" : save === "conflict" ? "Not saved" : "Saved";

  return (
    <Page
      title={name}
      back={{ label: "Routing", onClick: back }}
      onRename={
        owner
          ? (n) => {
              setName(n);
              setEdited(true);
              queue({ name: n });
            }
          : undefined
      }
      badge={
        <span className="flex items-center gap-2.5">
          <State label={state.label} t={state.tone} />
          {owner ? <span className={`text-[12px] max-sm:hidden ${save === "error" || save === "conflict" ? "text-rose" : "text-muted"}`}>{saved}</span> : null}
        </span>
      }
      flush
      actions={
        <>
          {handoffLive && row.active_version ? (
            <Button variant="ghost" size="sm" className="max-md:hidden" onClick={() => setDrawer("handoff")}>
              Route &amp; book
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" aria-label="Test lead" onClick={() => void openTest()}>
            <Play size={11} />
            <span className="max-sm:hidden">Test lead</span>
          </Button>
          {d.role === "owner" ? (
            <Button size="sm" disabled={!changed || row.archived || save === "conflict"} onClick={() => setPublishing(true)}>
              Publish changes
            </Button>
          ) : null}
          {overflow}
        </>
      }
    >
      {conflict ? (
        <div role="status" className="flex flex-wrap items-center gap-2 border-b border-line bg-butter-wash px-4 py-2.5 text-[13px] text-ink md:px-6">
          <span className="flex-1">Someone else changed this policy.</span>
          <Button variant="ghost" size="sm" onClick={() => setDrawer("compare")}>
            Compare
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              // Theirs: what's saved now replaces this screen.
              if (conflict.draft) setBody(toV2(conflict.draft, { reviewer: d.me, teamKeys }));
              setName(conflict.name);
              rev.current = conflict.revision;
              pending.current = null;
              setConflict(null);
              setSave("saved");
              invalidate(`routing_screen:${ws.id}`);
            }}
          >
            Reload
          </Button>
          <Button
            size="sm"
            onClick={() => {
              // Mine, on top of theirs: saved at their revision, deliberately.
              rev.current = conflict.revision;
              setConflict(null);
              pending.current = { body, name: nameStaged ? name : null };
              void send().catch(() => undefined);
            }}
          >
            Reapply mine
          </Button>
        </div>
      ) : null}
      {save === "error" ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 border-b border-line bg-rose-wash px-4 py-2.5 text-[13px] text-rose md:px-6">
          <span className="flex-1">Couldn&apos;t save. {saveErr}</span>
          <Button variant="ghost" size="sm" onClick={() => void send().catch(() => undefined)}>
            Try again
          </Button>
        </div>
      ) : null}
      <div className="mx-auto flex w-full max-w-[860px] flex-col gap-3 px-4 pt-5 pb-16 md:px-6">
        <Sec
          n={1}
          label="Where leads come from"
          aside={
            <Button variant="ghost" size="sm" onClick={() => setDrawer("sources")}>
              Manage
            </Button>
          }
        >
          <div className="flex flex-wrap gap-2 p-4">
            {sources.length ? (
              sources.map(({ s, eff }) => (
                <span key={s.id} className="flex items-center gap-2 rounded-[10px] border border-line px-2.5 py-2">
                  <span className="text-muted">{s.kind === "handoff" ? <User size={14} /> : <FormIcon size={14} />}</span>
                  <span className="flex flex-col leading-[1.35]">
                    <span className="font-medium text-ink">{s.name}</span>
                    <span className="text-[12px] text-muted">{eff.enabled ? outcomeWords(eff.outcome, meetingName(eff.meetingTypeId)) : "Disconnected"}</span>
                  </span>
                  {eff.pending ? <State label="Pending change" t="amber" /> : null}
                </span>
              ))
            ) : (
              <span className="text-muted">Used by 0 forms · Connect a form</span>
            )}
          </div>
        </Sec>

        <Sec n={2} label="Checks and existing ownership">
          <Row label="Hold suspected spam" line={`Held leads are not assigned or booked until reviewed by ${reviewer ? (names.people[reviewer] ?? "the reviewer") : "the review owner"}`}>
            <Toggle label="Hold suspected spam" on={body.spam.on} disabled={!owner} onChange={(on) => change((b) => ({ ...b, spam: { ...b.spam, on } }))} />
          </Row>
          <Row label="Keep existing owners" line={!ownOn ? "Rules decide every lead" : order[0] === "company" ? (order.length > 1 ? "Company owner, then contact owner, then rules" : "Company owner, then rules") : order.length > 1 ? "Contact owner, then company owner, then rules" : "Contact owner, then rules"}>
            {ownOn ? (
              <Choice<string>
                label="Owner order"
                value={order[0] === "contact" ? "contact" : "company"}
                align="right"
                disabled={!owner}
                options={[
                  { value: "company", label: "Company first", hint: "Company owner, then contact owner" },
                  { value: "contact", label: "Contact first", hint: "Contact owner, then company owner" },
                ]}
                onChange={(v) => change((b) => ({ ...b, ownership: { capBlocksNew: b.ownership?.capBlocksNew ?? true, order: v === "contact" ? ["contact", "company"] : ["company", "contact"] } }))}
              />
            ) : null}
            <Toggle label="Keep existing owners" on={ownOn} disabled={!owner} onChange={(on) => change((b) => ({ ...b, ownership: { capBlocksNew: b.ownership?.capBlocksNew ?? true, order: on ? ["company", "contact"] : [] } }))} />
          </Row>
          <Row label="Recipients" line={scopeWords} />
        </Sec>

        <Sec n={3} label="Assignment rules" aside={<span className="text-[12px] text-muted max-sm:hidden">Checked in order. The first match wins.</span>}>
          {body.rules.list.map((r, i) => (
            <RuleRow
              key={r.id}
              r={r}
              i={i}
              count={body.rules.list.length}
              open={openRule === r.id}
              focusName={focusName === r.id}
              ro={!owner}
              fields={fields}
              names={names}
              d={d}
              reviewer={reviewer}
              teamKeys={teamKeys}
              onToggle={() => {
                if (openRule === r.id && ruleProblem(r, fields, teamKeys)) return;
                setOpenRule(openRule === r.id ? null : r.id);
                setFocusName(null);
              }}
              onMove={(by) => move(r.id, by)}
              onDelete={() => remove(r.id)}
              onChange={(fn) => setRule(r.id, fn)}
            />
          ))}
          {owner ? (
            <div className="border-t border-line px-4 py-2.5 first:border-t-0">
              <Button variant="ghost" size="sm" onClick={addRule}>
                <Plus size={12} />
                Add rule
              </Button>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2.5 rounded-b-[10px] border-t border-line bg-paper px-4 py-2.5">
            <span className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-full bg-paper-deep text-[11px] font-semibold text-body">·</span>
            <span className="flex min-w-0 flex-1 flex-col leading-[1.4]">
              <span className="font-medium text-ink">Everyone else</span>
              <span className="text-[12.5px] text-muted">Leads that match no rule</span>
            </span>
            <DestChoice
              label="Everyone else"
              value={fallbackDest(body)}
              review={false}
              reviewer={reviewer}
              people={d.people}
              teams={d.teams}
              names={names}
              align="right"
              onChange={(x) => change((b) => ({ ...b, fallback: x?.kind === "person" ? { kind: "user", id: x.id } : x?.kind === "team" ? { kind: "queue", id: x.key } : null }))}
            />
          </div>
        </Sec>

        <Sec n={4} label="If nobody can receive the lead">
          <Row label="Backup" line="Used when the chosen team has no eligible member. One backup, then review.">
            <DestChoice
              label="Backup"
              value={backupDest(body)}
              review
              reviewer={reviewer}
              people={d.people}
              teams={d.teams}
              names={names}
              align="right"
              onChange={(x: Dest) => change((b) => ({ ...b, backup: x?.kind === "person" ? { kind: "user", id: x.id } : x?.kind === "team" ? { kind: "queue", id: x.key } : { kind: "review" } }))}
            />
          </Row>
          <Row label="Review owner" line="Receives held and unassigned leads">
            <PersonChoice label="Review owner" value={reviewer} people={d.people} align="right" onChange={(u) => change((b) => ({ ...b, review: { owner: u } }))} />
          </Row>
        </Sec>
      </div>

      {drawer === "sources" ? <SourcesDrawer session={session} ws={ws} d={d} policyId={policyId} ro={!owner} onClose={() => setDrawer(null)} onStaged={() => screen.reload()} /> : null}
      {drawer === "test" ? <TestDrawer session={session} ws={ws} d={d} row={row} body={body} flush={flush} onClose={() => setDrawer(null)} /> : null}
      {drawer === "handoff" ? <HandoffDrawer session={session} ws={ws} sb={sb} d={d} onClose={() => setDrawer(null)} /> : null}
      {drawer === "versions" ? (
        <VersionsSheet
          session={session}
          ws={ws.id}
          policyId={policyId}
          names={names.people}
          canRestore={owner}
          onClose={() => setDrawer(null)}
          onRestore={async (v) => {
            const r = await flush().catch(() => rev.current);
            const out = await rt<{ revision: number }>(session, ws.id, "rt_restore", { policy: policyId, version: v.version, revision: r });
            rev.current = out.revision;
            setBody(toV2(v.config, { reviewer: d.me, teamKeys }));
            setEdited(true);
            invalidate(`routing_screen:${ws.id}`);
            toast({ text: `v${v.version} is now the draft` });
            setDrawer(null);
          }}
        />
      ) : null}
      {drawer === "compare" && conflict ? (
        <Sheet title="Compare" onClose={() => setDrawer(null)} width={620}>
          <div className="flex flex-col gap-1 p-5 text-[13px]">
            {(conflict.draft ? changesBetween(toV2(conflict.draft, { reviewer: d.me, teamKeys }), body, { names, fields, rename: name !== conflict.name ? name : null }) : ["Their draft was published or dropped"]).map((t, i) => (
              <div key={i} className="border-t border-line py-2 first:border-t-0">
                {t}
              </div>
            ))}
          </div>
        </Sheet>
      ) : null}
      {publishing ? (
        <PublishDialog
          session={session}
          ws={ws}
          d={d}
          row={row}
          body={body}
          name={nameStaged}
          flush={flush}
          onTest={() => {
            setPublishing(false);
            setDrawer("test");
          }}
          onClose={() => setPublishing(false)}
          onPublished={(v) => {
            setPublishing(false);
            setEdited(false);
            rev.current = rev.current + 1;
            invalidate(`routing_screen:${ws.id}`);
            toast({ text: `Published v${v}` });
          }}
        />
      ) : null}
    </Page>
  );
}

// One rule's row and inline editor -----------------------------------------------------------------------------------

function RuleRow({
  r,
  i,
  count,
  open,
  focusName,
  ro,
  fields,
  names,
  d,
  reviewer,
  teamKeys,
  onToggle,
  onMove,
  onDelete,
  onChange,
}: {
  r: Rule;
  i: number;
  count: number;
  open: boolean;
  focusName: boolean;
  ro: boolean;
  fields: FieldDef[];
  names: ReturnType<typeof namesOf>;
  d: Screen;
  reviewer: string | null;
  teamKeys: Set<string>;
  onToggle: () => void;
  onMove: (by: -1 | 1) => void;
  onDelete: () => void;
  onChange: (fn: (r: Rule) => Rule) => void;
}) {
  const err = ruleProblem(r, fields, teamKeys);
  const dest = ruleDest(r);
  const label = r.name || "Untitled rule";
  const setCond = (j: number, fn: (c: Cond) => Cond) => onChange((x) => ({ ...x, conds: x.conds.map((c, k) => (k === j ? fn(c) : c)) }));
  const fieldOptions: Option<string>[] = fields.map((f) => ({ value: f.key, label: f.label, hint: f.type === "number" ? "Number" : f.type === "country" ? "Country" : f.type === "choice" ? "Choice" : "Text", group: f.group }));
  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5 border-t border-line px-4 py-2.5 first:border-t-0">
        <span className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-full bg-paper-deep text-[11px] font-semibold text-body">{i + 1}</span>
        <span className="flex min-w-0 flex-1 flex-col leading-[1.4] max-sm:basis-[calc(100%-40px)]">
          <span className="font-medium text-ink">{label}</span>
          <span className="text-[12.5px] text-muted">
            {condSummary(r, fields)} → {destName(dest, names)}
            {dest?.kind === "team" ? " · round robin" : ""}
            {r.on === false ? " · off" : ""}
          </span>
          {err && !open ? <span className="text-[12.5px] text-rose">{err}</span> : null}
        </span>
        {!ro ? (
          <span className="flex items-center gap-2.5 max-sm:w-full max-sm:justify-end">
            <IconButton label={`Move ${label} up`} data-move={`${r.id}:-1`} disabled={i === 0} onClick={() => onMove(-1)}>
              <ChevronDown size={13} className="rotate-180" />
            </IconButton>
            <IconButton label={`Move ${label} down`} data-move={`${r.id}:1`} disabled={i === count - 1} onClick={() => onMove(1)}>
              <ChevronDown size={13} />
            </IconButton>
            <Button variant="ghost" size="sm" onClick={onToggle} aria-expanded={open}>
              {open ? "Done" : "Edit"}
            </Button>
            <IconButton label={`Delete ${label}`} onClick={onDelete}>
              <Trash size={13} />
            </IconButton>
          </span>
        ) : null}
      </div>
      {open && !ro ? (
        <div className="flex flex-col gap-2.5 border-t border-line bg-paper px-4 py-3.5">
          <label className="flex flex-col gap-1 text-[12px] font-medium text-muted">
            Name
            <input
              autoFocus={focusName}
              value={r.name}
              maxLength={80}
              aria-invalid={!r.name.trim()}
              onChange={(e) => {
                const v = e.target.value;
                onChange((x) => ({ ...x, name: v }));
              }}
              className={`h-[30px] rounded-sm border bg-card px-2.5 text-[13px] font-normal text-ink outline-none focus:border-ink ${!r.name.trim() ? "border-rose" : "border-line-strong"}`}
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted">Match</span>
            <Choice<string>
              label="Match"
              value={r.match}
              options={[
                { value: "all", label: "All conditions", hint: "Every condition must be true (AND)" },
                { value: "any", label: "Any condition", hint: "At least one must be true (OR)" },
              ]}
              onChange={(v) => onChange((x) => ({ ...x, match: v === "any" ? "any" : "all" }))}
            />
          </div>
          {r.conds.map((c, j) => {
            const f = fieldOf(c.field, fields);
            const ops = opsOf(f.type);
            const opOptions: Option<string>[] = [...(ops.some((o) => o.value === c.op) ? [] : [{ value: c.op, label: opLabel(c.op, f.type) }]), ...ops.map((o) => ({ value: o.value, label: o.label }))];
            const list = Array.isArray(c.value) ? c.value : c.value === undefined || c.value === "" ? [] : [c.value];
            const bad = needsValue(c.op) && (!list.length || (f.type === "number" && list.some((v) => typeof v !== "number")));
            return (
              <div key={j} className="flex flex-wrap items-center gap-2">
                <span className="w-[30px] text-muted">{j ? (r.match === "any" ? "OR" : "AND") : ""}</span>
                <Choice<string> label="Field" value={c.field} options={fieldOptions} menuWidth={260} onChange={(k) => setCond(j, () => newCond(fieldOf(k, fields)))} />
                <Choice<string>
                  label="Comparison"
                  value={c.op}
                  options={opOptions}
                  onChange={(op) =>
                    setCond(j, (x) => {
                      const o = op as Cond["op"];
                      if (!needsValue(o)) return { field: x.field, op: o };
                      const keep = x.value ?? (o === "one_of" || o === "not_one_of" ? [] : "");
                      return { field: x.field, op: o, value: (o === "one_of" || o === "not_one_of") && !Array.isArray(keep) ? (keep === "" ? [] : [keep as string]) : keep };
                    })
                  }
                />
                {needsValue(c.op) ? (
                  f.type === "number" ? (
                    <NumberBox value={list[0]} bad={bad} onChange={(v) => setCond(j, (x) => ({ ...x, value: v }))} />
                  ) : f.type === "country" || (f.type === "choice" && f.options?.length) ? (
                    <Choice<string>
                      label="Value"
                      value={String(list[0] ?? "")}
                      placeholder="Select"
                      menuWidth={220}
                      className={bad ? "!border-rose" : ""}
                      shown={list.length > 1 ? list.map((v) => (f.type === "country" ? countryName(String(v)) : String(v))).join(", ") : undefined}
                      options={f.type === "country" ? COUNTRIES : (f.options ?? []).map((o) => ({ value: o, label: o }))}
                      onChange={(v) => setCond(j, (x) => ({ ...x, value: x.op === "one_of" || x.op === "not_one_of" ? [v] : v }))}
                    />
                  ) : (
                    <input
                      aria-label="Value"
                      value={String(list[0] ?? "")}
                      onChange={(e) => {
                        const v = e.target.value;
                        setCond(j, (x) => ({ ...x, value: x.op === "one_of" || x.op === "not_one_of" ? (v ? [v] : []) : v }));
                      }}
                      className={`h-7 w-[140px] rounded-sm border bg-card px-2 text-[13px] text-ink outline-none focus:border-ink ${bad ? "border-rose" : "border-line-strong"}`}
                    />
                  )
                ) : null}
                <IconButton label="Remove condition" onClick={() => onChange((x) => ({ ...x, conds: x.conds.filter((_, k) => k !== j) }))}>
                  <X size={12} />
                </IconButton>
              </div>
            );
          })}
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onChange((x) => ({ ...x, conds: [...x.conds, newCond(fields.find((f) => f.key === "company.employees") ?? fields[0]!)] }))}
            >
              <Plus size={12} />
              Add condition
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted">Destination</span>
            <DestChoice label="Destination" value={dest} review reviewer={reviewer} people={d.people} teams={d.teams} names={names} onChange={(x) => onChange((y) => withRuleDest(y, x))} />
          </div>
          {err ? <span className="text-[12px] text-rose">{err}</span> : null}
        </div>
      ) : null}
    </>
  );
}

/** A number typed in place: kept as typed while it isn't a number yet, so the caret never jumps. */
function NumberBox({ value, bad, onChange }: { value: unknown; bad: boolean; onChange: (v: number | string) => void }) {
  const [text, setText] = useState(value === undefined || value === null ? "" : String(value));
  return (
    <input
      aria-label="Value"
      inputMode="numeric"
      value={text}
      aria-invalid={bad}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        const n = t.trim().replace(/,/g, "");
        onChange(/^\d+(\.\d+)?$/.test(n) ? Number(n) : t.trim());
      }}
      className={`h-7 w-[90px] rounded-sm border bg-card px-2 text-[13px] text-ink tabular-nums outline-none focus:border-ink ${bad ? "border-rose" : "border-line-strong"}`}
    />
  );
}

// Versions (Section 17) -----------------------------------------------------------------------------------------------

function VersionsSheet({ session, ws, policyId, names, canRestore, onClose, onRestore }: { session: ViewProps["session"]; ws: string; policyId: string; names: Record<string, string>; canRestore: boolean; onClose: () => void; onRestore: (v: Version) => Promise<void> }) {
  const [list, setList] = useState<Version[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    rt<{ versions: Version[] }>(session, ws, "rt_versions", { policy: policyId })
      .then((r) => setList(r.versions))
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load the versions."));
  }, [session, ws, policyId]);
  return (
    <Sheet title="Versions" onClose={onClose} width={620}>
      <div className="flex flex-col p-4 text-[13px]">
        <ErrorNote message={error} />
        {!list && !error ? <Loading /> : null}
        {list && !list.length ? <p className="py-10 text-center text-muted">Nothing published yet</p> : null}
        {list?.map((v) => (
          <div key={v.version} className="flex items-center gap-3 border-t border-line py-3 first:border-t-0">
            <span className="w-9 font-medium text-ink tabular-nums">v{v.version}</span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-ink">{v.note || `${v.config.rules.list.length} ${v.config.rules.list.length === 1 ? "rule" : "rules"}`}</span>
              <span className="text-[12px] text-muted">
                {when(v.at)} · {v.by ? (names[v.by] ?? "Former teammate") : "Migrated"}
                {v.sources?.length ? ` · ${v.sources.length} ${v.sources.length === 1 ? "source" : "sources"} changed` : ""}
              </span>
            </span>
            {canRestore ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  void (async () => {
                    if (!(await askConfirm(`Restore v${v.version} as the draft?`, { body: "Publishing it makes a new version. Existing assignments and meetings stay as they are.", ok: "Restore" }))) return;
                    await onRestore(v).catch((e) => setError(e instanceof Error ? e.message : "Couldn't restore."));
                  })()
                }
              >
                Restore as draft
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    </Sheet>
  );
}

export { keyOf };
