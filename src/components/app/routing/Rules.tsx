"use client";

// Routing › Rules: who gets each new lead, read top to bottom as five steps in plain sentences (Stop junk, Same
// company same rep, Returning lead same rep, Your rules, When no rule fits). Each rule is a sentence with its own
// dropdowns: "If <field> <test> <value> send to <team> to book <meeting>", one line per condition. "Try a lead" on
// the right runs a lead through the draft with the real engine on the server (the `test` action, which writes
// nothing) and lights the step it stops at. Above it all, "Get ready to take bookings" until every check is done.
// Settings a sentence can't hold (spam options, away behaviour, territories) open in the side sheet from "More".

import { useEffect, useMemo, useRef, useState } from "react";
import { countryName, opsFor, needsValue, ruleWords, type FieldDef } from "@/lib/router/conditions";
import { newId } from "@/lib/router/check";
import { COUNTRY_CODES } from "@/lib/forms/countries";
import { OPS, type Cond, type Op, type Rule, type RouterBody, type Then } from "@/lib/router/types";
import { Check, ChevronDown, Play, Plus, Search, Trash, Warn, X } from "../../Icons";
import { Popover } from "../FilterBar";
import { MoreMenu } from "../StatCards";
import { PersonAvatar, usePeople } from "../meetings/parts";
import { useMeetingTypes } from "../meetings/TypesList";
import { Button, IconButton, Toggle, type ViewProps } from "../ui";
import { Card, CardTitle, Choice, Title } from "../inbound/parts";
import { useRepsData } from "../reps/RepsView";
import { routingApi, type Member, type TestOut } from "./api";
import { addRule, madeName, moveRule, removeRule, setRule, withField, withOp, type Selection } from "./editorModel";
import { bookedMeeting, readyChecks, stopOf, STOPS, teamOfResult, whyLines, type Stop } from "./setupModel";
import { toast } from "./Toast";

type Edit = (fn: (b: RouterBody) => RouterBody, key?: string) => void;

export type RulesProps = Pick<ViewProps, "sb" | "session" | "navigate"> & {
  ws: string;
  body: RouterBody;
  edit: Edit;
  readOnly: boolean;
  members: Member[];
  fields: FieldDef[];
  forms: { id: string; name: string }[];
  meetings: { id: string; name: string; minutes: number | null }[];
  live: boolean;
  draft: boolean;
  onPublish: () => void;
  onMore: (s: Selection) => void;
  onUndo: () => void;
};

const SAMPLES: { email: string; size: string; country: string; company: number; person: number }[] = [
  { email: "maya@globex.com", size: "800", country: "US", company: -1, person: -1 },
  { email: "kai@tinyco.io", size: "12", country: "DE", company: -1, person: -1 },
  { email: "ana@initech.com", size: "60", country: "US", company: 0, person: -1 },
  { email: "test@mailinator.com", size: "", country: "VN", company: -1, person: -1 },
];

const COUNTRIES = COUNTRY_CODES.map((c: string) => ({ value: c, label: countryName(c) })).sort((a, b) => a.label.localeCompare(b.label));
/** Fields "Try a lead" always asks for; others appear when a rule tests them. */
const ASKED = new Set(["company.size", "company.employees", "lead.country", "contact.country", "company.country"]);

export function RulesView(p: RulesProps) {
  const { body, edit, readOnly } = p;
  const people = usePeople(p.sb, p.ws);
  const reps = useRepsData(p.sb, p.ws);
  const types = useMeetingTypes(p.sb, p.ws);
  const name = (id: string) => people.data?.byId.get(id)?.name ?? p.members.find((m) => m.id === id)?.name ?? "Former teammate";

  // Try a lead -------------------------------------------------------------------------------------------------------
  // "Test draft" from a run in History opens here with its contact (?test=<contact>) or email (?test=<email>).
  const [start] = useState(() => (typeof window === "undefined" ? "" : (new URLSearchParams(window.location.search).get("test") ?? "")));
  const fromRun = /^[0-9a-f-]{36}$/.test(start) ? start : "";
  const [contact, setContact] = useState(fromRun);
  const [t, setT] = useState({ email: start.includes("@") ? start : fromRun ? "" : SAMPLES[0]!.email, size: start ? "" : SAMPLES[0]!.size, country: start ? "" : SAMPLES[0]!.country, company: "", person: "", more: {} as Record<string, string> });
  const [out, setOut] = useState<TestOut | null>(null);
  const [testError, setTestError] = useState("");
  const seq = useRef(0);
  const ruleFields = useMemo(() => {
    const keys = new Set<string>();
    for (const r of body.rules.list) for (const c of r.conds) if (!ASKED.has(c.field) && needsValue(c.op)) keys.add(c.field);
    return [...keys].map((k) => p.fields.find((f) => f.key === k)).filter((f): f is FieldDef => !!f).slice(0, 4);
  }, [body.rules.list, p.fields]);
  const session = p.session;
  const ws = p.ws;
  useEffect(() => {
    const email = t.email.trim();
    if (!email && !contact) return;
    const n = ++seq.current;
    const timer = setTimeout(async () => {
      const changes: Record<string, unknown> = {};
      const size = Number(t.size.replace(/,/g, ""));
      if (t.size.trim() && Number.isFinite(size)) {
        changes["company.size"] = size;
        changes["company.employees"] = size;
      }
      if (t.country) for (const k of ["lead.country", "contact.country", "company.country"]) changes[k] = t.country;
      for (const [k, v] of Object.entries(t.more)) if (v.trim()) changes[k] = ruleFields.find((f) => f.key === k)?.type === "number" && Number.isFinite(Number(v)) ? Number(v) : v.trim();
      try {
        const r = await routingApi<TestOut>(session, ws, "test", { email: contact ? null : email, contact: contact || null, changes, owners: t.company || t.person || !contact ? { company: t.company || null, contact: t.person || null } : undefined, which: "draft", draft: body });
        if (n !== seq.current) return;
        setOut(r);
        setTestError("");
      } catch (e) {
        if (n !== seq.current) return;
        setTestError(e instanceof Error ? e.message : String(e));
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [t, contact, body, session, ws, ruleFields]);

  const tested = out?.draft ?? null;
  const d = tested?.steps ? { result: tested.result, steps: tested.steps } : null;
  const stop = d ? stopOf(d) : null;
  const leadName = t.email.split("@")[0] || "This lead";

  // Checklist --------------------------------------------------------------------------------------------------------
  const noCal = reps.data ? (people.data?.list ?? []).filter((x) => !reps.data!.calendar.has(x.id)).map((x) => x.name) : [];
  const checks = readyChecks({ noCalendar: noCal, meetings: types.data?.length ?? p.meetings.length, body, live: p.live, draft: p.draft });
  const done = checks.filter((c) => c.ok).length;

  // Steps ------------------------------------------------------------------------------------------------------------
  const isOn = (k: Stop) => (k === "spam" ? body.spam.on : k === "company" ? body.account.on : k === "person" ? body.keep.on : k === "rule" ? body.rules.on : true);
  const at = (k: Stop) => STOPS.indexOf(k);
  const cls = (k: Stop) => {
    if (!isOn(k) && k !== "rule") return "opacity-55";
    if (!stop) return "";
    if (stop.stop === k) return "border-signal shadow-[0_0_0_1px_var(--color-signal)]";
    return at(k) < at(stop.stop) ? "opacity-50" : "";
  };
  const tag = (k: Stop) =>
    stop?.stop === k ? (
      <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full bg-signal-soft px-2 text-[11px] font-semibold text-signal-text">
        <Check size={11} />
        {leadName} stops here
      </span>
    ) : stop && at(k) < at(stop.stop) && isOn(k) ? (
      <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-paper-deep px-2 text-[11px] font-semibold text-muted">{k === "rule" ? "None fit" : "Doesn't apply"}</span>
    ) : null;
  const more = (s: Selection) => (
    <button type="button" onClick={() => p.onMore(s)} className="shrink-0 text-[12px] text-muted underline decoration-line-strong underline-offset-2 hover:text-ink">
      More
    </button>
  );
  const sw = (on: boolean, set: (v: boolean) => void, label: string) => <Toggle on={on} onChange={set} label={label} disabled={readOnly} />;

  const teamOpts = body.queues.map((q) => ({ value: `q:${q.id}`, label: q.name, hint: `${q.members.length} ${q.members.length === 1 ? "rep" : "reps"}, ${q.method === "load" ? "fewest meetings first" : q.method === "weighted" ? "some get more" : "take turns"}`, group: "Team" }));
  const meetOpts = [{ value: "", label: "The form's own meeting" }, ...p.meetings.map((m) => ({ value: m.id, label: `${m.name}${m.minutes ? `, ${m.minutes} min` : ""}` }))];

  const m = d ? bookedMeeting(body, d) : null;
  const meeting = m ? p.meetings.find((x) => x.id === m) : null;
  const team = d ? teamOfResult(body, d) : null;
  const rep = d?.result.kind === "owner" ? d.result.user : null;
  const repFirst = rep ? name(rep).split(" ")[0] : "";

  return (
    <div className="mx-auto flex w-full max-w-[980px] flex-col gap-4 px-4 pt-6 pb-14 md:px-7">
      {done < checks.length ? (
        <Card>
          <CardTitle title="Get ready to take bookings">
            <span className="text-[12px] text-muted tabular-nums">
              {done} of {checks.length}
            </span>
            <span className="h-1 w-[120px] overflow-hidden rounded-full bg-paper-deep" aria-hidden="true">
              <span className="block h-full rounded-full bg-signal transition-[width] duration-[360ms] ease-out" style={{ width: `${(done / checks.length) * 100}%` }} />
            </span>
          </CardTitle>
          {checks.map((c, i) => (
            <div key={c.key} className="flex items-center gap-3 border-t border-line px-4 py-3 first-of-type:border-t-0">
              <span className={`flex size-[22px] shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${c.ok ? "bg-signal text-paper" : "border-[1.5px] border-line-strong text-muted"}`}>{c.ok ? <Check size={12} /> : i + 1}</span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className={`font-medium ${c.ok ? "text-muted line-through decoration-line-strong" : "text-ink"}`}>{c.title}</span>
                <span className="text-[12px] text-muted">{c.line}</span>
              </div>
              {c.ok ? null : c.key === "pub" ? (
                readOnly ? null : (
                  <Button size="sm" onClick={p.onPublish}>
                    Publish
                  </Button>
                )
              ) : (
                <Button variant="ghost" size="sm" onClick={() => (c.key === "reps" ? p.navigate("reps") : c.key === "meet" ? p.navigate("scheduling", "types") : p.navigate("routing", "teams"))}>
                  Open
                </Button>
              )}
            </div>
          ))}
        </Card>
      ) : null}

      <Title gray="Top to bottom. The first step that fits wins.">Who gets each new lead</Title>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col">
          <StepCard n={1} title="Stop junk" cls={cls("spam")} tag={tag("spam")} toggle={sw(body.spam.on, (v) => edit((b) => ({ ...b, spam: { ...b.spam, on: v } })), "Stop junk")} on={body.spam.on}>
            <span>
              Fake emails and bots <b className="font-medium text-ink">wait for you to review</b>. Nothing is booked.
            </span>
            {more({ kind: "spam" })}
          </StepCard>
          <Link />
          <StepCard n={2} title="Same company, same rep" cls={cls("company")} tag={tag("company")} toggle={sw(body.account.on, (v) => edit((b) => ({ ...b, account: { ...b.account, on: v } })), "Same company, same rep")} on={body.account.on}>
            <span>
              If their company already works with a rep, <b className="font-medium text-ink">send it to that rep</b>.
            </span>
            {more({ kind: "account" })}
          </StepCard>
          <Link />
          <StepCard n={3} title="Returning lead, same rep" cls={cls("person")} tag={tag("person")} toggle={sw(body.keep.on, (v) => edit((b) => ({ ...b, keep: { ...b.keep, on: v } })), "Returning lead, same rep")} on={body.keep.on}>
            <span>
              If this person already works with a rep, <b className="font-medium text-ink">send it to that rep</b>.
            </span>
            {more({ kind: "keep" })}
          </StepCard>
          <Link />
          <StepCard
            n={4}
            title="Your rules"
            cls={cls("rule")}
            tag={tag("rule")}
            toggle={body.rules.on ? null : sw(false, (v) => edit((b) => ({ ...b, rules: { ...b.rules, on: v } })), "Use your rules")}
            on
            plain
          >
            <div className="flex w-full flex-col gap-1.5">
              {body.rules.list.length ? (
                body.rules.list.map((r, i) => {
                  const hit = stop?.stop === "rule" && stop.rule === r.id;
                  const hitAt = stop?.stop === "rule" ? body.rules.list.findIndex((x) => x.id === stop.rule) : -1;
                  const skip = !!stop && (stop.stop === "fallback" || at("rule") < at(stop.stop) ? true : hitAt > i);
                  return (
                    <RuleLine
                      key={r.id}
                      rule={r}
                      first={i === 0}
                      last={i === body.rules.list.length - 1}
                      cls={hit ? "border-signal bg-signal-soft" : skip || r.on === false ? "opacity-50" : ""}
                      {...p}
                      teamOpts={teamOpts}
                      meetOpts={meetOpts}
                    />
                  );
                })
              ) : (
                <span className="text-muted">No rules yet. Every lead goes to step 5.</span>
              )}
            </div>
            <div className="flex w-full items-center gap-3">
              {!readOnly ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const id = newId("r_");
                    edit((b) => addRule(b, id));
                  }}
                >
                  <Plus size={12} />
                  Add a rule
                </Button>
              ) : null}
              <span className="flex-1" />
              {more({ kind: "rules" })}
            </div>
          </StepCard>
          <Link />
          <StepCard n={5} title="When no rule fits" cls={cls("fallback")} tag={tag("fallback")} on>
            <span>Send to</span>
            <Choice<string>
              look="word"
              label="When no rule fits, send to"
              value={body.fallback ? `${body.fallback.kind === "queue" ? "q" : "u"}:${body.fallback.id}` : ""}
              placeholder="Pick a team"
              disabled={readOnly}
              options={[...teamOpts, ...p.members.map((x) => ({ value: `u:${x.id}`, label: x.name, group: "Rep" }))]}
              onChange={(v) => edit((b) => ({ ...b, fallback: { kind: v.startsWith("q:") ? "queue" : "user", id: v.slice(2), ...(b.fallback?.meet ? { meet: b.fallback.meet } : {}) } }))}
            />
            <span>to book</span>
            <Choice<string>
              look="word"
              label="When no rule fits, book"
              value={body.fallback?.meet ?? ""}
              disabled={readOnly || !body.fallback}
              options={meetOpts}
              onChange={(v) => edit((b) => (b.fallback ? { ...b, fallback: { kind: b.fallback.kind, id: b.fallback.id, ...(v ? { meet: v } : {}) } } : b))}
            />
            <span className="flex-1" />
            {more({ kind: "fallback" })}
          </StepCard>
        </div>

        <aside aria-label="Try a lead" className="rounded-[10px] border border-line bg-card lg:sticky lg:top-0">
          <header className="flex items-center gap-1.5 border-b border-line px-4 py-3">
            <Play size={12} />
            <h3 className="text-[13px] font-semibold text-ink">Try a lead</h3>
          </header>
          <div className="flex flex-col gap-2.5 px-4 py-3.5">
            <TryField label="Email">
              <input value={t.email} placeholder={contact ? "The lead from History" : undefined} onChange={(e) => (setContact(""), setT({ ...t, email: e.target.value }))} aria-label="Email" className={TRY_INPUT} />
            </TryField>
            <TryField label="Company size">
              <input value={t.size} inputMode="numeric" onChange={(e) => setT({ ...t, size: e.target.value })} aria-label="Company size" className={TRY_INPUT} />
            </TryField>
            <TryField label="Country">
              <Choice<string> label="Country" value={t.country} width={288} options={[{ value: "", label: "Not known" }, ...COUNTRIES]} onChange={(v) => setT({ ...t, country: v })} />
            </TryField>
            <TryField label="Their company works with">
              <Choice<string> label="Their company works with" value={t.company} width={288} options={[{ value: "", label: "Nobody yet" }, ...p.members.map((x) => ({ value: x.id, label: x.name }))]} onChange={(v) => setT({ ...t, company: v })} />
            </TryField>
            <TryField label="They work with">
              <Choice<string> label="They work with" value={t.person} width={288} options={[{ value: "", label: "Nobody yet" }, ...p.members.map((x) => ({ value: x.id, label: x.name }))]} onChange={(v) => setT({ ...t, person: v })} />
            </TryField>
            {ruleFields.map((f) => (
              <TryField key={f.key} label={f.label}>
                {f.options?.length ? (
                  <Choice<string>
                    label={f.label}
                    value={t.more[f.key] ?? ""}
                    width={288}
                    options={[{ value: "", label: "Not known" }, ...f.options.map((o) => ({ value: o, label: f.key === "lead.form" ? (p.forms.find((x) => x.id === o)?.name ?? o) : o }))]}
                    onChange={(v) => setT({ ...t, more: { ...t.more, [f.key]: v } })}
                  />
                ) : (
                  <input value={t.more[f.key] ?? ""} onChange={(e) => setT({ ...t, more: { ...t.more, [f.key]: e.target.value } })} aria-label={f.label} className={TRY_INPUT} />
                )}
              </TryField>
            ))}
            <div className="flex flex-wrap gap-1.5">
              {SAMPLES.map((s) => (
                <button
                  key={s.email}
                  type="button"
                  onClick={() => (setContact(""), setT({ email: s.email, size: s.size, country: s.country, company: s.company >= 0 ? (p.members[s.company]?.id ?? "") : "", person: s.person >= 0 ? (p.members[s.person]?.id ?? "") : "", more: {} }))}
                  className="press inline-flex h-6 items-center rounded-full border border-line px-2.5 text-[12px] text-ink hover:border-line-strong"
                >
                  {s.email.split("@")[0]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2.5 rounded-b-[10px] border-t border-line bg-paper px-4 py-3.5" aria-live="polite">
            {testError ? (
              <span role="alert" className="text-rose">
                {testError === "Something went wrong." ? "Couldn't try this lead." : testError}
              </span>
            ) : !d ? (
              <span className="text-muted">{t.email.trim() || contact ? "Trying" : "Type an email"}</span>
            ) : d.result.kind === "held" ? (
              <>
                <span className="flex items-center gap-2 font-medium text-butter">
                  <Warn size={14} />
                  Held for review
                </span>
                <span className="text-muted">They see your thank-you message. No meeting is booked.</span>
              </>
            ) : rep ? (
              <>
                <div className="flex items-center gap-2.5">
                  <PersonAvatar person={people.data?.byId.get(rep)} label={name(rep)} size={36} />
                  <div className="flex min-w-0 flex-col">
                    <b className="truncate text-[15px] font-semibold text-ink">Goes to {name(rep)}</b>
                    <span className="text-[12px] text-muted">{team ? team.name : "Their own rep"}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span>
                    Books <b className="font-medium">{meeting ? `${meeting.name}${meeting.minutes ? `, ${meeting.minutes} min` : ""}` : "the form's own meeting"}</b>
                  </span>
                  <span className="text-muted">
                    Sees only {repFirst}&apos;s free times, on {repFirst}&apos;s calendar
                  </span>
                </div>
                {reps.data && !reps.data.calendar.has(rep) ? (
                  <span className="flex items-center gap-2 font-medium text-butter">
                    <Warn size={14} />
                    {repFirst} hasn&apos;t connected a calendar, so there are no times to pick
                  </span>
                ) : null}
              </>
            ) : (
              <>
                <span className="flex items-center gap-2 font-medium text-butter">
                  <Warn size={14} />
                  Nobody can take this lead now
                </span>
                <span className="text-muted">Add a rep to the team, or check who is away.</span>
              </>
            )}
            {d ? (
              <ol className="flex list-decimal flex-col gap-1 pl-[18px] text-body">
                {whyLines(d, { body, fields: p.fields, name }).map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ol>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}

const TRY_INPUT = "h-8 w-full rounded-sm border border-line-strong bg-card px-2.5 text-[13px] text-ink outline-none focus:border-ink";

function TryField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[12px] font-medium text-muted">
      {label}
      {children}
    </label>
  );
}

const Link = () => <span aria-hidden="true" className="ml-[27px] h-4 w-0.5 bg-line" />;

function StepCard({ n, title, cls, tag, toggle, on, plain = false, children }: { n: number; title: string; cls: string; tag: React.ReactNode; toggle?: React.ReactNode; on: boolean; plain?: boolean; children: React.ReactNode }) {
  return (
    <section className={`flex flex-col gap-2 rounded-[10px] border border-line bg-card px-4 py-3.5 transition-[border-color,opacity,box-shadow] duration-[220ms] ${cls}`}>
      <div className="flex items-center gap-2.5">
        <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-paper-deep text-[11px] font-semibold text-body">{n}</span>
        <h3 className="flex-1 font-semibold text-ink">{title}</h3>
        {tag}
        {toggle}
      </div>
      {on ? <div className={`flex flex-wrap items-center gap-1.5 pl-8 leading-[2] text-body ${plain ? "gap-y-2" : ""}`}>{children}</div> : null}
    </section>
  );
}

const WORD_INPUT = "h-[26px] rounded-sm border border-line-strong bg-paper px-2 text-[13px] font-medium text-ink outline-none focus:border-ink";

/** One rule as sentences: each condition its own "If … / and …" line, then "send to … to book …". */
function RuleLine({ rule, first, last, cls, body, edit, readOnly, fields, forms, teamOpts, meetOpts, onMore, onUndo }: RulesProps & { rule: Rule; first: boolean; last: boolean; cls: string; teamOpts: { value: string; label: string; hint?: string; group?: string }[]; meetOpts: { value: string; label: string }[] }) {
  // A rule's made name follows its conditions until someone renames it (as in the side sheet).
  const set = (patch: Partial<Rule>, key?: string) => {
    const made = madeName(rule.name, ruleWords(rule, fields, body.territories).slice(0, 80));
    const name = patch.conds && made ? ruleWords({ ...rule, ...patch }, fields, body.territories).slice(0, 80) : null;
    edit((b) => setRule(b, rule.id, name ? { ...patch, name } : patch), key);
  };
  const setCond = (i: number, c: Cond, key?: string) => set({ conds: rule.conds.map((x, j) => (j === i ? c : x)) }, key);
  const then: Then = rule.then ?? "queue";
  const target = then === "owner" ? "owner" : then === "hold" ? "hold" : rule.queue ? `q:${rule.queue}` : "";
  const addLine = () => {
    const f = fields.find((x) => x.key === "company.size") ?? fields[0]!;
    const op = opsFor(f.type)[0]!;
    set({ conds: [...rule.conds, withOp({ field: f.key, op }, op, f.type)] });
  };
  const cond = (c: Cond, i: number) => (
    <>
      {i === 0 ? (
        <span className="text-muted">If</span>
      ) : i === 1 ? (
        <Choice<"all" | "any">
          look="word"
          label="All or any"
          value={rule.match}
          shown={rule.match === "any" ? "or" : "and"}
          disabled={readOnly}
          menuWidth={160}
          options={[
            { value: "all", label: "and", hint: "Every line fits" },
            { value: "any", label: "or", hint: "Any line fits" },
          ]}
          onChange={(v) => set({ match: v })}
        />
      ) : (
        <span className="text-muted">{rule.match === "any" ? "or" : "and"}</span>
      )}
      <CondWords c={c} fields={fields} forms={forms} body={body} readOnly={readOnly} onChange={(x, key) => setCond(i, x, key)} />
      {rule.conds.length > 1 && !readOnly ? (
        <IconButton label="Remove this line" className="size-6" onClick={() => set({ conds: rule.conds.filter((_, j) => j !== i) })}>
          <X size={11} />
        </IconButton>
      ) : null}
    </>
  );
  const send = (
    <>
      {then === "hold" ? null : <span className="text-muted">send to</span>}
      <Choice<string>
        look="word"
        label="Send to"
        value={target}
        placeholder="Pick a team"
        disabled={readOnly}
        options={[...teamOpts, { value: "owner", label: "Their company's rep", group: "Other" }, { value: "hold", label: "Hold for review", group: "Other" }]}
        onChange={(v) => set(v === "owner" ? { then: "owner" } : v === "hold" ? { then: "hold", meet: undefined } : { then: undefined, queue: v.slice(2) })}
      />
      {then !== "hold" ? (
        <>
          <span className="text-muted">to book</span>
          <Choice<string> look="word" label="To book" value={rule.meet ?? ""} disabled={readOnly} options={meetOpts} onChange={(v) => set({ meet: v || undefined })} />
        </>
      ) : null}
      {!readOnly ? (
        <span className="ml-auto flex items-center">
          <MoreMenu
            label="Rule options"
            items={[
              rule.conds.length < 6 ? { label: "Add a condition", run: addLine } : null,
              first ? null : { label: "Move up", run: () => edit((b) => moveRule(b, rule.id, -1)) },
              last ? null : { label: "Move down", run: () => edit((b) => moveRule(b, rule.id, 1)) },
              { label: rule.on === false ? "Turn on" : "Turn off", run: () => set({ on: rule.on === false ? undefined : false }) },
              { label: "More settings", run: () => onMore({ kind: "rule", id: rule.id }) },
            ]}
          />
          <IconButton
            label="Delete rule"
            className="size-8"
            onClick={() => {
              edit((b) => removeRule(b, rule.id));
              toast({ text: "Rule deleted", action: { label: "Undo", run: onUndo } });
            }}
          >
            <Trash size={13} />
          </IconButton>
        </span>
      ) : null}
    </>
  );
  const LINE = "flex flex-wrap items-center gap-1.5 leading-[2]";
  return (
    <div className={`flex flex-col gap-1 rounded-lg border border-line py-1.5 pr-1 pl-2.5 transition-[border-color,background-color,opacity] duration-[220ms] ${cls}`}>
      {rule.conds.length <= 1 ? (
        <div className={LINE}>
          {rule.conds[0] ? cond(rule.conds[0], 0) : <span className="text-muted">Every lead</span>}
          {send}
        </div>
      ) : (
        <>
          {rule.conds.map((c, i) => (
            <div key={i} className={LINE}>
              {cond(c, i)}
            </div>
          ))}
          <div className={LINE}>{send}</div>
        </>
      )}
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
  const people = f?.key === "company.size" || f?.key === "company.employees";
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
        <input
          aria-label="Values"
          defaultValue={list.join(", ")}
          placeholder="a, b, c"
          disabled={readOnly}
          onBlur={(e) => onChange({ ...c, value: e.target.value.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean) })}
          className={`${WORD_INPUT} w-40`}
        />
      );
    } else if (type === "number" && c.op === "between") {
      const [lo = "", hi = ""] = list;
      value = (
        <>
          <input aria-label="From" inputMode="numeric" value={lo} disabled={readOnly} onChange={(e) => onChange({ ...c, value: [e.target.value, hi].map((x) => (x === "" ? x : Number(x))) as (string | number)[] }, `c:${c.field}:lo`)} className={`${WORD_INPUT} w-16`} />
          <span className="text-muted">and</span>
          <input aria-label="To" inputMode="numeric" value={hi} disabled={readOnly} onChange={(e) => onChange({ ...c, value: [lo, e.target.value].map((x) => (x === "" ? x : Number(x))) as (string | number)[] }, `c:${c.field}:hi`)} className={`${WORD_INPUT} w-16`} />
        </>
      );
    } else if (type === "number" && people) {
      const n = typeof c.value === "number" ? c.value : null;
      const sizes = n !== null && !SIZES.includes(n) ? [...SIZES, n].sort((a, b) => a - b) : SIZES;
      value = (
        <Choice<string> look="word" label="Value" value={n === null ? "" : String(n)} placeholder="Pick a size" disabled={readOnly} menuWidth={160} options={sizes.map((s) => ({ value: String(s), label: `${s.toLocaleString("en-US")} people` }))} onChange={(v) => onChange({ ...c, value: Number(v) })} />
      );
    } else if (type === "bool") {
      value = (
        <Choice<string>
          look="word"
          label="Value"
          value={c.value === "false" ? "false" : "true"}
          disabled={readOnly}
          menuWidth={120}
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
          className={`${WORD_INPUT} w-28`}
        />
      );
    }
  }
  return (
    <>
      <Choice<string> look="word" label="Field" value={c.field} disabled={readOnly} menuWidth={240} options={fieldOpts} onChange={(k) => { const nf = fields.find((x) => x.key === k); if (nf) onChange(withField(c, nf, f)); }} />
      <Choice<Op> look="word" label="Test" value={c.op} disabled={readOnly} menuWidth={180} options={opsFor(type).map((o) => ({ value: o, label: opWords(o, type) }))} onChange={(o) => onChange(withOp(c, o, type))} />
      {value}
    </>
  );
}

/** Several values from a list (countries, choices), as one word in the sentence: "US, Canada or Mexico". */
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
        className={`inline-flex max-w-[220px] items-center gap-1.5 ${WORD_INPUT} pr-1.5 hover:border-faint aria-expanded:border-ink ${words.length ? "" : "text-faint"}`}
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
