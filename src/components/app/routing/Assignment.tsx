"use client";

// Routing › Assignment (the approved demo): on the left the Sales reps, Assignment (Round robin, or rules read as
// sentences ending in the always-last Default rule) and Safeguards; on the right Action required, Routing preview and
// Test a lead. Every change stays on screen until Save. The preview and Test a lead run the real engine on the server
// (the `test` action, which writes nothing) on the body on screen, and the rule that took the lead turns green.

import { useEffect, useMemo, useRef, useState } from "react";
import { COUNTRY_CODES } from "@/lib/forms/countries";
import { countryName, needsValue, opsFor, type FieldDef } from "@/lib/router/conditions";
import { newId } from "@/lib/router/check";
import { OPS, type Cond, type Method, type Op, type RouterBody, type Then } from "@/lib/router/types";
import { ArrowRight, Check, ChevronDown, Plus, Search, Trash, Warn, X } from "../../Icons";
import { Popover } from "../FilterBar";
import { PersonAvatar, usePeople, type Person } from "../meetings/parts";
import { MoreMenu } from "../StatCards";
import { Badge, Button, ErrorNote, IconButton, Toggle, type ViewProps } from "../ui";
import { Choice } from "../inbound/parts";
import { repState } from "../reps/model";
import { routingApi, type TestOut, type Tested } from "./api";
import {
  addCond,
  addRule,
  bookedMeeting,
  deleteRule,
  hitOf,
  issuesOf,
  moveRule,
  removeCond,
  samplesFor,
  setCond,
  setDefaultMethod,
  setDefaultReps,
  setMatch,
  setMeet,
  setMode,
  setRuleMethod,
  setRuleReps,
  setSafe,
  setThen,
  testResult,
  viewOf,
  whyOf,
  type DefaultCard,
  type Issue,
  type RuleCard,
  type SafeKey,
  type Sample,
} from "./assignModel";
import { withField, withOp, type Selection } from "./editorModel";
import { askToConnect, ConnectButton, useRepsData, type RepsData } from "./SalesReps";
import type { Assignment as AssignState } from "./useAssignment";
import { toast } from "./Toast";
import { useQuery, must } from "../ui";

type Props = Pick<ViewProps, "sb" | "session" | "ws" | "role" | "navigate"> & { a: AssignState; go: (tab: string) => void; onMore: (s: Selection | "safeguards") => void };

const CARD = "rounded-[10px] border border-line bg-card";
const COUNTRIES = COUNTRY_CODES.map((c: string) => ({ value: c, label: countryName(c) })).sort((x, y) => x.label.localeCompare(y.label));
const first = (n: string) => n.split(" ")[0] || n;

function CardHead({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <header className="flex items-center gap-2.5 border-b border-line px-4 py-3">
      <h3 className="flex-1 text-[13.5px] font-semibold text-ink">{title}</h3>
      {children}
    </header>
  );
}

export function AssignmentTab({ sb, session, ws, role, a, go, onMore }: Props) {
  const readOnly = role !== "owner";
  const people = usePeople(sb, ws.id);
  const reps = useRepsData(sb, ws.id);
  const body = a.body;
  const fields = a.fields;
  const data = a.data!;
  const view = useMemo(() => viewOf(body, fields), [body, fields]);
  const list = useMemo(() => people.data?.list ?? [], [people.data]);
  const name = (id: string) => people.data?.byId.get(id)?.name ?? data.members.find((m) => m.id === id)?.name ?? "Former teammate";
  const calendar = (id: string) => !!reps.data?.calendar.has(id);
  const issues = reps.data ? issuesOf(view, { calendar, name }) : [];
  const meetings = data.meetings ?? [];
  const edit = readOnly ? () => {} : a.edit;

  // Test a lead and the preview: the real engine on the body on screen.
  const [t, setT] = useState({ email: "maya@globex.com", size: "800", country: "US", owner: "" });
  const tested = useTest(session, ws.id, body, {
    email: t.email.trim(),
    changes: leadChanges(t.size, t.country),
    owners: { company: null, contact: t.owner || null },
  });
  const hit = tested.out ? hitOf(tested.out) : null;
  const preview = usePreview(sb, session, ws.id, body, fields, list);

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 pt-5 pb-12 text-[13px] md:px-6">
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-3">
          <section className={CARD} aria-label="Sales reps">
            <CardHead title="Sales reps">
              <Button variant="ghost" size="sm" className="h-[26px] px-2.5 text-[12px]" onClick={() => go("reps")}>
                Manage
              </Button>
            </CardHead>
            <div className="flex flex-wrap gap-2 px-4 py-3.5">
              {list.map((p) => (
                <RepChip key={p.id} p={p} me={session.user.id} d={reps.data} session={session} ws={ws.id} />
              ))}
            </div>
          </section>

          <section className={CARD} aria-label="Assignment">
            <CardHead title="Assignment" />
            <div className="flex flex-col gap-2.5 px-4 py-3.5">
              <div className="grid gap-2 sm:grid-cols-2">
                <ModeCard on={view.mode === "rr"} title="Round robin" line="Rotate all leads across the same reps" disabled={readOnly} onClick={() => edit((b) => setMode(b, "rr"))} />
                <ModeCard on={view.mode === "rules"} title="Assignment rules" line="Assign leads by criteria" disabled={readOnly} onClick={() => edit((b) => (b.rules.list.length ? setMode(b, "rules") : addRule(setMode(b, "rules"), newId("r_"))))} />
              </div>
              {view.mode === "rr" ? (
                <div className={`${RULE} ${hit === "default" ? HIT : ""}`}>
                  <div className={SENT}>
                    <span>Assign to</span>
                    <RepsPick label="Round robin reps" values={view.def.reps} people={list} d={reps.data} disabled={readOnly} onChange={(v) => edit((b) => setDefaultReps(b, v))} />
                    {view.def.method !== "rr" ? (
                      <>
                        <span>by</span>
                        <MethodPick label="Round robin method" value={view.def.method} disabled={readOnly} onChange={(m) => edit((b) => setDefaultMethod(b, m))} />
                      </>
                    ) : null}
                    <span>meeting type</span>
                    <MeetPick label="Round robin meeting type" value={view.def.meet} meetings={meetings} disabled={readOnly} onChange={(m) => edit((b) => setMeet(b, "default", m))} />
                  </div>
                </div>
              ) : (
                <>
                  {view.rules.map((r, i) => (
                    <RuleView key={r.id} r={r} i={i} count={view.rules.length} hit={hit === r.id} body={body} fields={fields} forms={data.forms} people={list} d={reps.data} meetings={meetings} readOnly={readOnly} edit={edit} onMore={onMore} undo={a.undo} />
                  ))}
                  {!readOnly ? (
                    <Button variant="ghost" size="sm" className="h-[26px] self-start px-2.5 text-[12px]" onClick={() => edit((b) => addRule(b, newId("r_")))}>
                      <Plus size={12} />
                      Add rule
                    </Button>
                  ) : null}
                  <DefaultView def={view.def} n={view.rules.length + 1} hit={hit === "default"} people={list} d={reps.data} meetings={meetings} readOnly={readOnly} edit={edit} />
                </>
              )}
            </div>
          </section>

          <section className={CARD} aria-label="Safeguards">
            <CardHead title="Safeguards">
              <Button variant="ghost" size="sm" className="h-[26px] px-2.5 text-[12px]" onClick={() => onMore("safeguards")}>
                More
              </Button>
            </CardHead>
            {SAFE.map(([k, label, line]) => (
              <div key={k} className="flex items-center gap-3 border-t border-line px-4 py-2.5 first-of-type:border-t-0">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium text-ink">{label}</span>
                  <span className="text-[12px] text-muted">{line}</span>
                </div>
                <Toggle on={view.safe[k]} label={label} disabled={readOnly} onChange={(v) => edit((b) => setSafe(b, k, v))} />
              </div>
            ))}
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          {issues.length ? <ActionRequired issues={issues} go={go} /> : null}
          <section className={CARD} aria-label="Routing preview">
            <CardHead title="Routing preview" />
            {preview.error ? (
              <div className="px-4 py-3">
                <ErrorNote message={preview.error} />
              </div>
            ) : null}
            {preview.rows.map((row) => (
              <div key={row.key} className="flex items-center gap-2 border-t border-line px-4 py-2 first-of-type:border-t-0">
                <span className="flex min-w-0 flex-1 flex-col leading-[1.3]">
                  <b className="truncate font-medium text-ink">{row.label}</b>
                  <span className="truncate text-[11.5px] text-muted">{row.line}</span>
                </span>
                <ArrowRight size={12} className="shrink-0 text-faint" />
                <PreviewResult r={row} name={name} people={people.data?.byId} />
              </div>
            ))}
          </section>

          <section className={CARD} aria-label="Test a lead">
            <CardHead title="Test a lead" />
            <div className="grid grid-cols-1 gap-2 px-4 py-3.5 min-[561px]:grid-cols-2">
              <TestField label="Email" full>
                <input value={t.email} onChange={(e) => setT({ ...t, email: e.target.value })} aria-label="Email" className={TEST_INPUT} />
              </TestField>
              <TestField label="Company size">
                <input value={t.size} inputMode="numeric" onChange={(e) => setT({ ...t, size: e.target.value })} aria-label="Company size" className={TEST_INPUT} />
              </TestField>
              <TestField label="Country">
                <Choice<string> label="Country" value={t.country} className="w-full justify-between" options={[{ value: "", label: "Not known" }, ...COUNTRIES]} onChange={(v) => setT({ ...t, country: v })} />
              </TestField>
              <TestField label="Owner" full>
                <Choice<string> label="Owner" value={t.owner} className="w-full justify-between" options={[{ value: "", label: "None" }, ...list.map((p) => ({ value: p.id, label: p.name }))]} onChange={(v) => setT({ ...t, owner: v })} />
              </TestField>
            </div>
            <TestResultView tested={tested} body={body} fields={fields} name={name} people={people.data?.byId} calendar={reps.data ? calendar : null} meetings={meetings} />
          </section>
        </div>
      </div>
    </div>
  );
}

const SAFE: [SafeKey, string, string][] = [
  ["spam", "Hold spam for review", "Fake emails and bots are held, and no meeting is offered"],
  ["owner", "Assign known leads to their owner", "A lead or company that already has an owner goes to that rep"],
  ["skip", "Skip reps who are away or at capacity", "The next rep in the rotation takes the lead, or the rep's backup"],
  ["alert", "Alert the rep when there is no availability", "The lead sees the confirmation message, and gets the rep's times by email later"],
];

const RULE = "flex flex-col gap-1.5 rounded-[10px] border border-line bg-paper px-3 py-2.5 transition-[border-color,background-color] duration-[220ms]";
const HIT = "border-signal bg-signal-soft";
const SENT = "flex flex-wrap items-center gap-1.5 leading-[2] text-muted";

function ModeCard({ on, title, line, disabled, onClick }: { on: boolean; title: string; line: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={`flex flex-col gap-0.5 rounded-[10px] border px-3 py-2.5 text-left transition-[border-color,box-shadow] duration-[140ms] ${on ? "border-ink shadow-[0_0_0_1px_var(--color-ink)]" : "border-line hover:border-line-strong"}`}
    >
      <span className="font-medium text-ink">{title}</span>
      <span className="text-[12px] text-muted">{line}</span>
    </button>
  );
}

function RepChip({ p, me, d, session, ws }: { p: Person; me: string; d: RepsData | null; session: ViewProps["session"]; ws: string }) {
  const cal = d?.calendar.get(p.id);
  const away = d ? repState(d.reps.get(p.id)).state === "away" : false;
  return (
    <span className="flex items-center gap-2 rounded-full border border-line py-[3px] pr-2.5 pl-[3px]">
      <PersonAvatar person={p} label={p.name} size={20} />
      <span className="text-ink">{first(p.name)}</span>
      {!d ? null : cal ? (
        <Badge tone="green" dot>
          {cal === "google" ? "Google" : cal === "microsoft" ? "Outlook" : "Calendar"}
        </Badge>
      ) : p.id === me ? (
        <ConnectButton session={session} ws={ws} onError={(e) => toast({ text: e })} again={d.reconnect.has(p.id)} look="badge" />
      ) : (
        <button type="button" onClick={() => void askToConnect(p)} className="press inline-flex h-5 items-center gap-1.5 rounded-full bg-butter-wash px-2 text-[11px] font-medium whitespace-nowrap text-butter">
          <span className="size-[5px] rounded-full bg-butter" />
          Connect calendar
        </button>
      )}
      {away ? <Badge dot>Away</Badge> : null}
    </span>
  );
}

// Pickers -------------------------------------------------------------------------------------------------------------

const WORD = "h-[28px] rounded-sm border border-line-strong bg-paper pr-1.5 pl-2.5 text-[13px] font-medium text-ink";

/** The reps a rule assigns to, picked from everyone, with each one's calendar under their name. */
function RepsPick({ label, values, people, d, disabled, onChange }: { label: string; values: string[]; people: Person[]; d: RepsData | null; disabled: boolean; onChange: (v: string[]) => void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const byId = new Map(people.map((p) => [p.id, p]));
  const words = values.length ? values.map((id) => first(byId.get(id)?.name ?? "Former teammate")).join(", ") : "Select reps";
  const shown = [...people, ...values.filter((id) => !byId.has(id)).map((id) => ({ id, name: "Former teammate", email: "" }) as Person)];
  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={!!anchor}
        disabled={disabled}
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
        className={`inline-flex max-w-[260px] items-center gap-1.5 ${WORD} hover:border-faint aria-expanded:border-ink disabled:opacity-60 ${values.length ? "" : "text-muted"}`}
      >
        <span className="truncate">{words}</span>
        <ChevronDown size={12} className="shrink-0 text-muted" />
      </button>
      {anchor ? (
        <Popover anchor={anchor} onClose={() => setAnchor(null)} width={240}>
          <ul role="listbox" aria-label={label} aria-multiselectable="true" className="max-h-[300px] overflow-y-auto p-1">
            {shown.map((p) => {
              const on = values.includes(p.id);
              const cal = d?.calendar.get(p.id);
              return (
                <li key={p.id}>
                  <button type="button" role="option" aria-selected={on} onClick={() => onChange(on ? values.filter((v) => v !== p.id) : [...values, p.id])} className="flex w-full items-start gap-2 rounded-sm px-2 py-[7px] text-left text-[13px] hover:bg-hover">
                    <span className={`mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-[4px] border ${on ? "border-ink bg-ink text-paper" : "border-line-strong"}`}>{on ? <Check size={10} /> : null}</span>
                    <span className="flex min-w-0 flex-col leading-[1.35]">
                      <span className="truncate text-ink">{p.name}</span>
                      <span className="text-[11.5px] text-muted">{cal ? `${cal === "google" ? "Google" : cal === "microsoft" ? "Outlook" : "Connected"} Calendar` : "No calendar connected"}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Popover>
      ) : null}
    </>
  );
}

function MethodPick({ label, value, disabled, onChange }: { label: string; value: Method; disabled: boolean; onChange: (m: Method) => void }) {
  return (
    <Choice<Method>
      look="word"
      label={label}
      value={value}
      disabled={disabled}
      menuWidth={240}
      className={WORD}
      options={[
        { value: "rr", label: "Round robin", hint: "Rotate leads across the reps" },
        { value: "load", label: "Fewest meetings first", hint: "The rep with the fewest meetings this week" },
        ...(value === "weighted" ? [{ value: "weighted" as Method, label: "Some get more", hint: "Reps with more weight get more leads" }] : []),
      ]}
      onChange={onChange}
    />
  );
}

function MeetPick({ label, value, meetings, disabled, onChange }: { label: string; value: string | null; meetings: { id: string; name: string; minutes: number | null }[]; disabled: boolean; onChange: (m: string | null) => void }) {
  const known = !value || meetings.some((m) => m.id === value);
  return (
    <Choice<string>
      look="word"
      label={label}
      value={value ?? ""}
      disabled={disabled}
      menuWidth={240}
      className={WORD}
      options={[
        { value: "", label: "The form's own meeting" },
        ...meetings.map((m) => ({ value: m.id, label: `${m.name}${m.minutes ? `, ${m.minutes} min` : ""}` })),
        ...(known ? [] : [{ value: value!, label: "A removed meeting type" }]),
      ]}
      onChange={(v) => onChange(v || null)}
    />
  );
}

// Rules ---------------------------------------------------------------------------------------------------------------

type Edit = (fn: (b: RouterBody) => RouterBody, key?: string) => void;

function RuleView({
  r,
  i,
  count,
  hit,
  body,
  fields,
  forms,
  people,
  d,
  meetings,
  readOnly,
  edit,
  onMore,
  undo,
}: {
  r: RuleCard;
  i: number;
  count: number;
  hit: boolean;
  body: RouterBody;
  fields: FieldDef[];
  forms: { id: string; name: string }[];
  people: Person[];
  d: RepsData | null;
  meetings: { id: string; name: string; minutes: number | null }[];
  readOnly: boolean;
  edit: Edit;
  onMore: (s: Selection) => void;
  undo: () => void;
}) {
  const addLine = () => {
    const f = fields.find((x) => x.key === "company.size") ?? fields[0]!;
    const op: Op = f.type === "number" ? "gte" : opsFor(f.type)[0]!;
    edit((b) => addCond(b, r.id, withOp({ field: f.key, op }, op, f.type)));
  };
  const then = (v: Then) => edit((b) => setThen(b, r.id, v));
  return (
    <div className={`${RULE} ${hit ? HIT : ""} ${r.on ? "" : "opacity-55"}`}>
      <div className="flex items-center gap-2">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-paper-deep text-[11px] font-semibold text-body">{i + 1}</span>
        <b className="min-w-0 flex-1 truncate font-semibold text-ink">{r.title}</b>
        {!r.on ? <Badge>Off</Badge> : null}
        {!readOnly ? (
          <span className="flex items-center">
            <IconButton label="Move up" className="size-7" disabled={i === 0} onClick={() => edit((b) => moveRule(b, r.id, -1))}>
              <ChevronDown size={13} className="rotate-180" />
            </IconButton>
            <IconButton label="Move down" className="size-7" disabled={i === count - 1} onClick={() => edit((b) => moveRule(b, r.id, 1))}>
              <ChevronDown size={13} />
            </IconButton>
            <IconButton
              label="Delete rule"
              className="size-7"
              onClick={() => {
                edit((b) => deleteRule(b, r.id));
                toast({ text: "Rule deleted", action: { label: "Undo", run: undo } });
              }}
            >
              <Trash size={13} />
            </IconButton>
            <MoreMenu
              label="Rule options"
              items={[
                r.conds.length < 6 ? { label: "Add a condition", run: addLine } : null,
                r.then !== "queue" ? { label: "Assign to reps", run: () => then("queue") } : null,
                r.then !== "owner" ? { label: "Assign to their owner", run: () => then("owner") } : null,
                r.then !== "hold" ? { label: "Hold for review", run: () => then("hold") } : null,
                { label: r.on ? "Turn off" : "Turn on", run: () => edit((b) => ({ ...b, rules: { ...b.rules, list: b.rules.list.map((x) => (x.id === r.id ? (r.on ? { ...x, on: false } : (({ on: _o, ...y }) => (void _o, y))(x)) : x)) } })) },
                { label: "More settings", run: () => onMore({ kind: "rule", id: r.id }) },
              ]}
            />
          </span>
        ) : null}
      </div>
      {r.conds.length ? (
        r.conds.map((c, j) => (
          <div key={j} className={SENT}>
            {j === 0 ? (
              <span>When</span>
            ) : (
              <Choice<"all" | "any">
                look="word"
                label="All or any"
                value={r.match}
                shown={r.match === "any" ? "or" : "and"}
                disabled={readOnly}
                menuWidth={160}
                className={WORD}
                options={[
                  { value: "all", label: "and", hint: "All lines fit" },
                  { value: "any", label: "or", hint: "Any line fits" },
                ]}
                onChange={(v) => edit((b) => setMatch(b, r.id, v))}
              />
            )}
            <CondWords c={c} fields={fields} forms={forms} body={body} readOnly={readOnly} onChange={(x, key) => edit((b) => setCond(b, r.id, j, x), key)} />
            {r.conds.length > 1 && !readOnly ? (
              <IconButton label="Remove this line" className="size-6" onClick={() => edit((b) => removeCond(b, r.id, j))}>
                <X size={11} />
              </IconButton>
            ) : null}
          </div>
        ))
      ) : (
        <div className={SENT}>
          <span>When</span>
          <Button variant="ghost" size="sm" className="h-[26px] px-2.5 text-[12px]" disabled={readOnly} onClick={addLine}>
            Add a condition
          </Button>
        </div>
      )}
      <div className={SENT}>
        {r.then === "hold" ? (
          <span>hold for review</span>
        ) : (
          <>
            <span>assign to</span>
            {r.then === "owner" ? (
              <span className="font-medium text-ink">their owner</span>
            ) : (
              <>
                <RepsPick label={`Reps for ${r.title}`} values={r.reps} people={people} d={d} disabled={readOnly} onChange={(v) => edit((b) => setRuleReps(b, r.id, v))} />
                <span>by</span>
                <MethodPick label={`How ${r.title} assigns`} value={r.method} disabled={readOnly} onChange={(m) => edit((b) => setRuleMethod(b, r.id, m))} />
              </>
            )}
            <span>meeting type</span>
            <MeetPick label={`Meeting type for ${r.title}`} value={r.meet} meetings={meetings} disabled={readOnly} onChange={(m) => edit((b) => setMeet(b, r.id, m))} />
          </>
        )}
      </div>
    </div>
  );
}

function DefaultView({ def, n, hit, people, d, meetings, readOnly, edit }: { def: DefaultCard; n: number; hit: boolean; people: Person[]; d: RepsData | null; meetings: { id: string; name: string; minutes: number | null }[]; readOnly: boolean; edit: Edit }) {
  return (
    <div className={`${RULE} ${hit ? HIT : ""}`}>
      <div className="flex items-center gap-2">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-paper-deep text-[11px] font-semibold text-body">{n}</span>
        <b className="flex-1 font-semibold text-ink">Default rule</b>
        <span className="text-[12px] text-muted">All other leads</span>
      </div>
      <div className={SENT}>
        <span>Assign to</span>
        <RepsPick label="Default rule reps" values={def.reps} people={people} d={d} disabled={readOnly} onChange={(v) => edit((b) => setDefaultReps(b, v))} />
        <span>by</span>
        <MethodPick label="How the Default rule assigns" value={def.method} disabled={readOnly} onChange={(m) => edit((b) => setDefaultMethod(b, m))} />
        <span>meeting type</span>
        <MeetPick label="Default rule meeting type" value={def.meet} meetings={meetings} disabled={readOnly} onChange={(m) => edit((b) => setMeet(b, "default", m))} />
      </div>
    </div>
  );
}

/** A list test on countries and choices reads as a plain "is" (its value says "US or Canada"). */
const OP_WORDS: Record<Op, string> = Object.fromEntries(OPS.map((o) => [o.value, o.label])) as Record<Op, string>;
const opWords = (o: Op, type: string) => (type === "country" || type === "choice" ? ({ one_of: "is", not_one_of: "is not" } as Partial<Record<Op, string>>)[o] : undefined) ?? OP_WORDS[o];
const SIZES = [10, 50, 200, 500, 1000, 5000];

/** One condition's words: the field, the test and the value, each its own dropdown (or a small box to type in). */
function CondWords({ c, fields, forms, body, readOnly, onChange }: { c: Cond; fields: FieldDef[]; forms: { id: string; name: string }[]; body: RouterBody; readOnly: boolean; onChange: (c: Cond, key?: string) => void }) {
  const f = fields.find((x) => x.key === c.field);
  const type = f?.type ?? "text";
  const groups = ["Contact", "Company", "Form answers", "Source", "Score"];
  const fieldOpts = [...fields].sort((a, b) => groups.indexOf(a.group) - groups.indexOf(b.group)).map((x) => ({ value: x.key, label: x.label, group: x.group }));
  if (!f) fieldOpts.unshift({ value: c.field, label: c.field.replace(/^[a-z]+\./, "").replace(/_/g, " "), group: "Contact" });
  const list = Array.isArray(c.value) ? c.value.map(String) : c.value === undefined || c.value === "" ? [] : [String(c.value)];
  const sizes = f?.key === "company.size" || f?.key === "company.employees";
  const BOX = `${WORD} pl-2 font-medium outline-none focus:border-ink`;
  let value: React.ReactNode = null;
  if (needsValue(c.op)) {
    if (c.op === "one_of" || c.op === "not_one_of") {
      const opts =
        type === "country"
          ? [...body.territories.map((t) => ({ value: `t:${t.id}`, label: t.name, group: "Regions" })), ...COUNTRIES.map((x) => ({ ...x, group: "Countries" }))]
          : f?.options?.length
            ? f.options.map((o) => ({ value: o, label: f.key === "lead.form" ? (forms.find((x) => x.id === o)?.name ?? "A removed form") : o }))
            : null;
      value = opts ? (
        <ManyPick label={f?.label ?? "Values"} values={list} options={opts} disabled={readOnly} onChange={(v) => onChange({ ...c, value: v })} />
      ) : (
        <input aria-label="Values" defaultValue={list.join(", ")} placeholder="a, b, c" disabled={readOnly} onBlur={(e) => onChange({ ...c, value: e.target.value.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean) })} className={`${BOX} w-40`} />
      );
    } else if (type === "number" && c.op === "between") {
      const [lo = "", hi = ""] = list;
      value = (
        <>
          <input aria-label="From" inputMode="numeric" value={lo} disabled={readOnly} onChange={(e) => onChange({ ...c, value: [e.target.value, hi].map((x) => (x === "" ? x : Number(x))) as (string | number)[] }, `c:${c.field}:lo`)} className={`${BOX} w-16`} />
          <span>and</span>
          <input aria-label="To" inputMode="numeric" value={hi} disabled={readOnly} onChange={(e) => onChange({ ...c, value: [lo, e.target.value].map((x) => (x === "" ? x : Number(x))) as (string | number)[] }, `c:${c.field}:hi`)} className={`${BOX} w-16`} />
        </>
      );
    } else if (type === "number" && sizes) {
      const n = typeof c.value === "number" ? c.value : null;
      const opts = n !== null && !SIZES.includes(n) ? [...SIZES, n].sort((a, b) => a - b) : SIZES;
      value = <Choice<string> look="word" label="Value" value={n === null ? "" : String(n)} placeholder="Pick a size" disabled={readOnly} menuWidth={160} className={WORD} options={opts.map((s) => ({ value: String(s), label: s.toLocaleString("en-US") }))} onChange={(v) => onChange({ ...c, value: Number(v) })} />;
    } else if (type === "bool") {
      value = (
        <Choice<string>
          look="word"
          label="Value"
          value={c.value === "false" ? "false" : "true"}
          disabled={readOnly}
          menuWidth={120}
          className={WORD}
          options={[
            { value: "true", label: "Yes" },
            { value: "false", label: "No" },
          ]}
          onChange={(v) => onChange({ ...c, value: v })}
        />
      );
    } else {
      value = (
        <input
          aria-label="Value"
          inputMode={type === "number" ? "numeric" : undefined}
          value={typeof c.value === "string" || typeof c.value === "number" ? String(c.value) : ""}
          disabled={readOnly}
          maxLength={200}
          onChange={(e) => onChange(type === "number" ? (e.target.value.trim() && Number.isFinite(Number(e.target.value)) ? { ...c, value: Number(e.target.value) } : { field: c.field, op: c.op }) : { ...c, value: e.target.value }, `c:${c.field}:v`)}
          className={`${BOX} w-28`}
        />
      );
    }
  }
  return (
    <>
      <Choice<string>
        look="word"
        label="Field"
        value={c.field}
        disabled={readOnly}
        menuWidth={240}
        className={WORD}
        options={fieldOpts}
        onChange={(k) => {
          const nf = fields.find((x) => x.key === k);
          if (nf) onChange(withField(c, nf, f));
        }}
      />
      <Choice<Op> look="word" label="Test" value={c.op} disabled={readOnly} menuWidth={180} className={WORD} options={opsFor(type).map((o) => ({ value: o, label: opWords(o, type) }))} onChange={(o) => onChange(withOp(c, o, type))} />
      {value}
    </>
  );
}

/** Several values from a list (countries, choices), as one word in the sentence: "United States or Canada". */
function ManyPick({ label, values, options, disabled, onChange }: { label: string; values: string[]; options: { value: string; label: string; group?: string }[]; disabled: boolean; onChange: (v: string[]) => void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [q, setQ] = useState("");
  const words = values.map((v) => options.find((o) => o.value === v)?.label ?? v);
  const shown = !words.length ? "Pick" : words.length <= 2 ? words.join(" or ") : `${words.slice(0, 2).join(", ")} +${words.length - 2}`;
  const t = q.trim().toLowerCase();
  const list = options.filter((o) => !t || o.label.toLowerCase().includes(t)).slice(0, 80);
  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={!!anchor}
        disabled={disabled}
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
        className={`inline-flex max-w-[240px] items-center gap-1.5 ${WORD} hover:border-faint aria-expanded:border-ink ${words.length ? "" : "text-muted"}`}
      >
        <span className="truncate">{shown}</span>
        <ChevronDown size={12} className="shrink-0 text-muted" />
      </button>
      {anchor ? (
        <Popover anchor={anchor} onClose={() => (setAnchor(null), setQ(""))} width={240}>
          <div className="border-b border-line p-2">
            <label className="flex h-8 items-center gap-2 rounded-sm border border-line px-2 text-muted focus-within:border-ink">
              <Search size={13} />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search" className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none" />
            </label>
          </div>
          <ul role="listbox" aria-label={label} aria-multiselectable="true" className="max-h-64 overflow-y-auto p-1">
            {list.map((o, i) => {
              const on = values.includes(o.value);
              return [
                o.group && o.group !== list[i - 1]?.group ? (
                  <li key={`g-${o.group}`} role="presentation" className="px-2.5 pt-2 pb-1 text-[11.5px] text-muted">
                    {o.group}
                  </li>
                ) : null,
                <li key={o.value}>
                  <button type="button" role="option" aria-selected={on} onClick={() => onChange(on ? values.filter((v) => v !== o.value) : [...values, o.value])} className="flex h-8 w-full items-center gap-2 rounded-sm px-2.5 text-left text-[13px] hover:bg-hover">
                    <span className={`flex size-3.5 shrink-0 items-center justify-center rounded-[4px] border ${on ? "border-ink bg-ink text-paper" : "border-line-strong"}`}>{on ? <Check size={10} /> : null}</span>
                    <span className="truncate">{o.label}</span>
                  </button>
                </li>,
              ];
            })}
            {!list.length ? <li className="px-2.5 py-2 text-faint">No matches</li> : null}
          </ul>
        </Popover>
      ) : null}
    </>
  );
}

// Right column --------------------------------------------------------------------------------------------------------

function ActionRequired({ issues, go }: { issues: Issue[]; go: (tab: string) => void }) {
  return (
    <section className={CARD} aria-label="Action required">
      <CardHead title="Action required">
        <Badge tone="amber">{issues.length}</Badge>
      </CardHead>
      {issues.map((x) => (
        <div key={x.key} className="flex items-center gap-3 border-t border-line px-4 py-2.5 first-of-type:border-t-0">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="font-medium text-ink">{x.title}</span>
            <span className="text-[12px] text-muted">{x.line}</span>
          </div>
          {x.open ? (
            <Button variant="ghost" size="sm" className="h-[26px] px-2.5 text-[12px]" onClick={() => go(x.open!)}>
              Open
            </Button>
          ) : null}
        </div>
      ))}
    </section>
  );
}

const TEST_INPUT = "h-[30px] w-full min-w-0 rounded-sm border border-line-strong bg-card px-2.5 text-[13px] text-ink outline-none focus:border-ink";

function TestField({ label, full = false, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1 text-[12px] font-medium text-muted ${full ? "min-[561px]:col-span-2" : ""}`}>
      {label}
      {children}
    </label>
  );
}

/** Test a lead's answer, from the engine. A failed check shows its error and nothing else. */
function TestResultView({
  tested,
  body,
  fields,
  name,
  people,
  calendar,
  meetings,
}: {
  tested: TestState;
  body: RouterBody;
  fields: FieldDef[];
  name: (id: string) => string;
  people?: Map<string, Person>;
  calendar: ((id: string) => boolean) | null;
  meetings: { id: string; name: string; minutes: number | null }[];
}) {
  const d = tested.out;
  const warn = (text: string) => (
    <span className="flex items-start gap-2 text-butter">
      <Warn size={14} className="mt-0.5 shrink-0" />
      <span>{text}</span>
    </span>
  );
  let main: React.ReactNode;
  if (tested.error) main = <ErrorNote message={tested.error} />;
  else if (!d) main = <span className="text-muted">{tested.busy ? "Testing" : "Type an email"}</span>;
  else if (d.result.kind === "held") main = warn("Held for review. No meeting is offered.");
  else if (d.result.kind === "owner") {
    const rep = d.result.user;
    const m = bookedMeeting(body, d);
    const meet = m ? meetings.find((x) => x.id === m) : null;
    main = (
      <>
        <div className="flex items-center gap-2.5">
          <PersonAvatar person={people?.get(rep)} label={name(rep)} size={26} />
          <div className="flex min-w-0 flex-col">
            <b className="text-[14px] font-semibold text-ink">Assigned to {name(rep)}</b>
            <span className="text-muted">
              {meet ? `${meet.name}${meet.minutes ? `, ${meet.minutes} min` : ""}` : "The form's own meeting"}, on {first(name(rep))}&apos;s calendar
            </span>
          </div>
        </div>
        {calendar && !calendar(rep) ? warn(`${first(name(rep))} has no calendar connected, so no times can be offered.`) : null}
      </>
    );
  } else main = warn("No rep is available.");
  return (
    <div aria-live="polite" className="flex flex-col gap-1.5 rounded-b-[10px] border-t border-line bg-paper px-4 py-3">
      {main}
      {d && !tested.error ? <span className="text-muted">{whyOf(d, { body, fields, name })}</span> : null}
    </div>
  );
}

function PreviewResult({ r, name, people }: { r: PreviewRow; name: (id: string) => string; people?: Map<string, Person> }) {
  if (r.error) return <span className="text-[12px] text-rose">Couldn&apos;t check</span>;
  if (!r.out) return <span className="h-5 w-14 rounded-full bg-paper-deep" aria-label="Checking" />;
  if (r.out.result.kind === "held")
    return (
      <Badge tone="amber" dot>
        Held
      </Badge>
    );
  if (r.out.result.kind === "owner") {
    const u = r.out.result.user;
    return (
      <span className="flex shrink-0 items-center gap-1.5">
        <PersonAvatar person={people?.get(u)} label={name(u)} size={20} />
        <span className="text-ink">{first(name(u))}</span>
      </span>
    );
  }
  return (
    <Badge tone="amber" dot>
      No rep
    </Badge>
  );
}

// Running the engine --------------------------------------------------------------------------------------------------

type Ran = Tested & { steps: NonNullable<Tested["steps"]> };
type TestState = { out: Ran | null; error: string; busy: boolean };

/** What Test a lead's company size and country mean to the rules. */
function leadChanges(size: string, country: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const n = Number(size.replace(/,/g, ""));
  if (size.trim() && Number.isFinite(n)) {
    out["company.size"] = n;
    out["company.employees"] = n;
  }
  if (country) for (const k of ["lead.country", "contact.country", "company.country"]) out[k] = country;
  return out;
}

type Ask = { email?: string; contact?: string; changes?: Record<string, unknown>; owners?: { company?: string | null; contact?: string | null } };

const askTest = (session: ViewProps["session"], ws: string, body: RouterBody, q: Ask) =>
  routingApi<TestOut & { draft: Ran | null }>(session, ws, "test", { email: q.contact ? null : (q.email ?? null), contact: q.contact ?? null, changes: q.changes ?? {}, owners: q.owners, which: "draft", draft: body });

/** One lead through the body on screen, 300 ms after the last change. */
function useTest(session: ViewProps["session"], ws: string, body: RouterBody, q: Ask): TestState {
  const [st, setSt] = useState<TestState>({ out: null, error: "", busy: false });
  const key = JSON.stringify(q);
  const seq = useRef(0);
  useEffect(() => {
    const ask = JSON.parse(key) as Ask;
    if (!ask.email) return;
    const n = ++seq.current;
    const timer = setTimeout(async () => {
      setSt((s) => ({ ...s, busy: true }));
      const r = await askTest(session, ws, body, ask).then(
        (out) => ({ ok: true as const, out }),
        (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }),
      );
      if (n !== seq.current) return;
      setSt({ ...testResult(r), busy: false });
    }, 300);
    return () => clearTimeout(timer);
  }, [key, body, session, ws]);
  return q.email ? st : { out: null, error: "", busy: false };
}

type PreviewRow = { key: string; label: string; line: string; out: Ran | null; error: string };

/**
 * Routing preview: the last few real leads (each with its own facts), or with none yet, four samples made from the
 * workspace's own rules and reps. Each goes through the body on screen; nothing is written.
 */
function usePreview(sb: ViewProps["sb"], session: ViewProps["session"], ws: string, body: RouterBody, fields: FieldDef[], people: Person[]) {
  const recent = useQuery(`router_runs:${ws}:preview`, async () => {
    const rows = (must(await sb.from("router_runs").select("contact_id, f_lead:facts->lead, f_company:facts->company").eq("workspace_id", ws).not("contact_id", "is", null).order("created_at", { ascending: false }).limit(20)) ?? []) as {
      contact_id: string;
      f_lead: { name?: string; email?: string } | null;
      f_company: { name?: string } | null;
    }[];
    const seen = new Set<string>();
    return rows.filter((r) => !seen.has(r.contact_id) && !!seen.add(r.contact_id)).slice(0, 4);
  });
  const asks = useMemo((): (Ask & { key: string; label: string; line: string })[] => {
    if (!recent.loaded || recent.error) return [];
    if (recent.data?.length)
      return recent.data.map((r) => ({ key: r.contact_id, contact: r.contact_id, label: r.f_lead?.name || r.f_lead?.email || "A lead", line: [r.f_company?.name, r.f_lead?.name ? r.f_lead.email : null].filter(Boolean).join(", ") }));
    return samplesFor(body, { fields, reps: people.map((p) => ({ id: p.id, name: p.name })) }).map((s: Sample) => ({ key: s.key, email: s.email, changes: s.changes, owners: { company: null, contact: s.owner }, label: s.label, line: s.line }));
  }, [recent.loaded, recent.error, recent.data, body, fields, people]);
  const [out, setOut] = useState<Record<string, { out: Ran | null; error: string }>>({});
  const seq = useRef(0);
  const asksKey = JSON.stringify(asks);
  useEffect(() => {
    const list = JSON.parse(asksKey) as (Ask & { key: string })[];
    if (!list.length) return;
    const n = ++seq.current;
    const timer = setTimeout(async () => {
      const done = await Promise.all(
        list.map((q) =>
          askTest(session, ws, body, q).then(
            (o) => [q.key, testResult<Ran>({ ok: true, out: o })] as const,
            (e: unknown) => [q.key, testResult<Ran>({ ok: false, error: e instanceof Error ? e.message : String(e) })] as const,
          ),
        ),
      );
      if (n === seq.current) setOut(Object.fromEntries(done));
    }, 400);
    return () => clearTimeout(timer);
  }, [asksKey, body, session, ws]);
  return { error: recent.error, rows: asks.map((q): PreviewRow => ({ key: q.key, label: q.label, line: q.line, out: out[q.key]?.out ?? null, error: out[q.key]?.error ?? "" })) };
}
