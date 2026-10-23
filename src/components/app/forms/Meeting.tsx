"use client";

// Book a meeting after the submit (docs/form-studio.md Part 3): the scheduler, who the lead books with (one team link,
// or the contact's owner with the team link as the fallback), who sees the calendar, and the line above it.

import { useState } from "react";
import { canSetLink, cleanLink, firstRule, linkState, linkToSave, ownerRoute, retarget, ruleFields, ruleOps, withOp } from "@/lib/forms/meeting";
import type { Op } from "@/lib/forms/ops";
import { SCHEDULERS, type MatchRule, type Schedule } from "@/lib/forms/schedule";
import type { Form } from "@/lib/forms/schema";
import { Link as LinkIcon, Plus, X } from "../../Icons";
import { BrandLogo } from "../BrandLogo";
import { Select } from "../Select";
import { Avatar, Badge, Button, ErrorNote, errorText, Input, must, Segmented, Toggle, useLoad, type ViewProps } from "../ui";
import { AREA, Group, LinkInput, OptionCard, RadioRow, Row, SEL } from "./SettingsParts";

type Person = { id: string; email: string; role?: string };

export function Meeting({ form, apply, sb, ws, session, role }: { form: Form; apply: (op: Op) => void } & Pick<ViewProps, "sb" | "ws" | "session" | "role">) {
  const sch = form.after.schedule!;
  const set = (patch: Partial<Schedule>) => apply({ op: "set_schedule", schedule: { ...sch, ...patch } });
  const team = linkState(sch.tool, sch.url);
  const end = form.after.end;
  return (
    <>
      <Group label="Scheduler">
        <div role="radiogroup" aria-label="Scheduler" className="grid grid-cols-2 gap-2 sm:grid-cols-3 2xl:grid-cols-5">
          {SCHEDULERS.map((t) => (
            <OptionCard
              key={t.value}
              compact
              picked={sch.tool === t.value}
              onPick={() => set({ tool: t.value })}
              icon={
                t.domain ? (
                  <BrandLogo domain={t.domain} name={t.label} size={18} />
                ) : (
                  <span className="flex size-[18px] items-center justify-center text-ink">
                    <LinkIcon size={15} />
                  </span>
                )
              }
              title={t.label}
            />
          ))}
        </div>
      </Group>

      <Group label="Team link" htmlFor="team-link">
        <LinkInput
          id="team-link"
          value={sch.url}
          onChange={(v) => set({ url: v.trim() })}
          onBlur={(v) => cleanLink(v) !== sch.url && set({ url: cleanLink(v) })}
          problem={team.kind === "bad" ? team.problem : null}
          ok={team.kind === "ok"}
          placeholder={SCHEDULERS.find((t) => t.value === sch.tool)?.domain ? `https://${SCHEDULERS.find((t) => t.value === sch.tool)!.domain}/` : "https://"}
        />
      </Group>

      <Group label="Who do they book with?">
        <div role="radiogroup" aria-label="Who do they book with?" className="flex flex-col gap-2">
          <RadioRow picked={!sch.perOwner} onPick={() => set({ perOwner: false })} label="One team link" />
          <RadioRow picked={sch.perOwner} onPick={() => set({ perOwner: true })} label="The contact's owner, else the team link">
            <OwnerLinks sb={sb} ws={ws} session={session} role={role} schedule={sch} />
          </RadioRow>
        </div>
      </Group>

      <Group label="Who sees it?">
        <div role="radiogroup" aria-label="Who sees it?" className="flex flex-col gap-2">
          <RadioRow picked={sch.who !== "match"} onPick={() => set({ who: "all", rules: undefined, any: undefined })} label="Everyone" />
          <RadioRow picked={sch.who === "match"} onPick={() => set({ who: "match", rules: sch.rules?.length ? sch.rules : [firstRule()] })} label="Only leads that match">
            <Rules form={form} schedule={sch} set={set} />
            {end.kind === "message" ? (
              <div className="mt-2 flex flex-col gap-2 border-t border-line pt-4">
                <span className="text-[12px] font-medium text-muted">Others see</span>
                <Input aria-label="Message heading" value={end.title} onChange={(e) => apply({ op: "set_after", end: { ...end, title: e.target.value } })} />
                <textarea aria-label="Message text" value={end.text ?? ""} rows={2} onChange={(e) => apply({ op: "set_after", end: { ...end, text: e.target.value || undefined } })} className={AREA} />
              </div>
            ) : null}
          </RadioRow>
        </div>
      </Group>

      <Group label="Above the calendar" htmlFor="sch-heading">
        <Input id="sch-heading" value={sch.heading ?? ""} placeholder="Pick a time" maxLength={120} onChange={(e) => set({ heading: e.target.value || undefined })} />
      </Group>

      <Row label="Fill in name and email">
        <Toggle label="Fill in name and email" on={sch.prefill !== false} onChange={(v) => set({ prefill: v ? undefined : false })} />
      </Row>
    </>
  );
}

/** Rules for who sees the calendar: a field, how it compares, a value; all or any of them. */
function Rules({ form, schedule, set }: { form: Form; schedule: Schedule; set: (p: Partial<Schedule>) => void }) {
  const fields = ruleFields(form);
  const rules = schedule.rules ?? [];
  const put = (next: MatchRule[]) => set({ rules: next });
  return (
    <div className="flex flex-col gap-2">
      {rules.length > 1 ? (
        <div className="flex items-center gap-2 text-[12.5px] text-muted">
          <Segmented
            label="Match"
            value={schedule.any ? "any" : "all"}
            options={[
              { value: "all", label: "All" },
              { value: "any", label: "Any" },
            ]}
            onChange={(v) => set({ any: v === "any" ? true : undefined })}
          />
        </div>
      ) : null}
      {rules.map((r, i) => {
        const field = fields.find((f) => f.value === r.field);
        const ops = field ? ruleOps(field.type) : [];
        const op = ops.find((o) => o.value === r.op);
        const change = (next: MatchRule) => put(rules.map((x, j) => (j === i ? next : x)));
        return (
          <div key={i} className="anim-rise-sm grid grid-cols-[minmax(0,1fr)_32px] items-start gap-2 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_32px]">
            <Select
              className={`h-9 ${SEL}`}
              ariaLabel="Field"
              value={field ? r.field : ""}
              placeholder="Field"
              options={fields.map((f) => ({ value: f.value, label: f.label }))}
              onChange={(v) => {
                const f = fields.find((x) => x.value === v);
                if (f) change(retarget(r, f));
              }}
            />
            <span className="row-start-2 sm:row-start-auto">
              <Select className={`h-9 ${SEL}`} ariaLabel="Compare" value={op ? r.op : ""} placeholder="Compare" options={ops.map((o) => ({ value: o.value, label: o.label }))} onChange={(v) => field && v && change(withOp(r, v, field))} />
            </span>
            <span className="row-start-3 sm:row-start-auto">
              {op?.takes === "option" ? (
                <Select className={`h-9 ${SEL}`} ariaLabel="Value" value={r.value ?? ""} options={(field?.options ?? []).map((o) => ({ value: o.value, label: o.label }))} onChange={(v) => change({ ...r, value: v })} />
              ) : op?.takes === "number" || op?.takes === "text" ? (
                <Input aria-label="Value" inputMode={op.takes === "number" ? "decimal" : undefined} value={r.value ?? ""} onChange={(e) => change({ ...r, value: e.target.value })} className="h-9" />
              ) : null}
            </span>
            <span className="col-start-2 row-start-1 sm:col-start-auto">
              <button
                type="button"
                aria-label="Remove rule"
                title="Remove rule"
                disabled={rules.length === 1}
                onClick={() => put(rules.filter((_, j) => j !== i))}
                className="press inline-flex size-8 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink disabled:opacity-35"
              >
                <X size={14} />
              </button>
            </span>
          </div>
        );
      })}
      <div>
        <Button variant="plain" size="sm" disabled={rules.length >= 10} onClick={() => put([...rules, firstRule()])}>
          <Plus size={14} />
          Rule
        </Button>
      </div>
    </div>
  );
}

/** Each teammate's link for the chosen scheduler, checked as it's typed. Owners set anyone's; members their own. */
function OwnerLinks({ sb, ws, session, role, schedule }: Pick<ViewProps, "sb" | "ws" | "session" | "role"> & { schedule: Schedule }) {
  const tool = schedule.tool;
  const data = useLoad(async () => {
    const [people, links] = await Promise.all([sb.rpc("workspace_people", { p_ws: ws.id }), sb.from("scheduler_links").select("user_id, url").eq("workspace_id", ws.id).eq("tool", tool)]);
    return { tool, people: (must(people) ?? []) as Person[], links: Object.fromEntries(((must(links) ?? []) as { user_id: string; url: string }[]).map((l) => [l.user_id, l.url])) as Record<string, string> };
  }, `${ws.id}:links:${tool}`);
  const [error, setError] = useState("");
  if (data.error) return <ErrorNote message={data.error} />;
  if (!data.data || data.data.tool !== tool) return <div className="anim-shimmer h-24 rounded-lg bg-paper-deep" aria-label="Loading" />;
  const people = [...data.data.people].sort((a, b) => (a.id === session.user.id ? -1 : b.id === session.user.id ? 1 : a.email.localeCompare(b.email)));
  return (
    <div className="flex flex-col gap-2">
      <ErrorNote message={error} />
      <div className="overflow-hidden rounded-lg border border-line">
        <div className="hidden h-9 grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)_88px] items-center gap-3 border-b border-line bg-paper px-3 text-[12px] font-medium text-muted md:grid">
          <span>Owner</span>
          <span>Link</span>
          <span>Books on</span>
        </div>
        <ul className="divide-y divide-line">
          {people.map((p) => (
            <OwnerRow key={`${p.id}:${tool}`} person={p} me={p.id === session.user.id} saved={data.data!.links[p.id] ?? ""} schedule={schedule} editable={canSetLink(role, session.user.id, p.id)} onSave={async (url) => {
              setError("");
              try {
                must(await sb.rpc("scheduler_link_save", { p_ws: ws.id, p_user: p.id, p_tool: tool, p_url: url }));
                return true;
              } catch (e) {
                setError(errorText(e));
                return false;
              }
            }} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function OwnerRow({ person, me, saved, schedule, editable, onSave }: { person: Person; me: boolean; saved: string; schedule: Schedule; editable: boolean; onSave: (url: string) => Promise<boolean> }) {
  const [text, setText] = useState(saved);
  const [kept, setKept] = useState(saved);
  const [busy, setBusy] = useState(false);
  const state = linkState(schedule.tool, text);
  const route = ownerRoute(schedule, kept);
  const commit = async (raw: string) => {
    const r = linkToSave(schedule.tool, raw);
    if ("problem" in r || r.url === kept) return;
    setBusy(true);
    if (await onSave(r.url)) {
      setKept(r.url);
      setText(r.url);
    }
    setBusy(false);
  };
  return (
    <li className="grid grid-cols-[minmax(0,1fr)] items-start gap-2 px-3 py-2.5 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)_88px] md:gap-3">
      <span className="flex h-10 min-w-0 items-center gap-2.5 text-[13px]">
        <Avatar label={person.email} size={26} />
        <span className="truncate text-ink">{person.email}</span>
        {me ? <span className="shrink-0 text-[12px] text-muted">You</span> : null}
      </span>
      <LinkInput
        label={`${person.email} booking link`}
        value={text}
        disabled={!editable || busy}
        onChange={setText}
        onBlur={(v) => void commit(v)}
        problem={state.kind === "bad" ? state.problem : null}
        ok={state.kind === "ok"}
        placeholder={editable ? "Add link" : "No link"}
      />
      <span className="flex h-10 items-center">
        {route === "own" ? <Badge tone="green">Own link</Badge> : route === "team" ? <Badge>Team link</Badge> : <Badge tone="amber">Message</Badge>}
      </span>
    </li>
  );
}
