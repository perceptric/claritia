"use client";

// Sync (docs/form-builder.md Part 7): where each lead goes. On the left: each CRM with its state, and webhooks. A CRM
// this form sends to shows the leads that didn't reach it with Send again, what a lead is made as, what happens when
// the email is already there, the owner and consent, then every question and the field it goes to with Fix or Check
// choices. A CRM that's connected but not used here, or not connected at all, has one
// button that starts it.

import { useState } from "react";
import { DUPLICATE, listOf, NEW_RULES, rulesOf, targetOf, type SyncRules } from "@/lib/delivery/rules";
import { allFields, type Form } from "@/lib/forms/schema";
import { CATALOG, entryOf } from "@/lib/sources/catalog";
import { BrandLogo } from "../BrandLogo";
import { askConfirm, askText, tell } from "../Dialogs";
import { Badge, ErrorNote, errorText, must, postJson, useQuery, type ViewProps } from "../ui";
import { daysAgo, issuesOf } from "./formModel";
import { Ic } from "./ic";
import { BTN, CARD, CROW, GHOST_SM, GHOST_SM_RED, RowText, Seg, useNote, Tg } from "./parts";
import { LeftItem } from "./Share";
import { Select } from "../Select";
import type { Destination, SourceRow } from "./shared";
import type { useCrm } from "./useCrm";

const PUSHES = new Set(CATALOG.filter((e) => e.twoWay || e.pushes).map((e) => e.kind));
/** CRMs offered to connect when they aren't yet. */
const OFFER = ["hubspot", "salesforce", "pipedrive"];
/** What a destination made before sync rules does: answers overwrite, the owner is written, consent is not sent. */
const BEFORE: SyncRules = { exists: "always", match: "email", owner: "route", assign: "claritia", consent: false, create: "Lead" };

type Props = ViewProps & {
  form: Form;
  formId: string;
  dests: Destination[];
  sources: SourceRow[];
  crm: ReturnType<typeof useCrm>;
  failed: Record<string, number>;
  reload: () => void;
  /** Change the destinations on screen before the server answers. */
  patchDests?: (fn: (d: Destination[]) => Destination[]) => void;
  onFix: (fieldId: string) => void;
  issueCtx: Parameters<typeof issuesOf>[1];
};

export function Sync(props: Props) {
  const { sb, dests, sources, failed, formId } = props;
  const tools = sources.filter((s) => s.status !== "disconnected" && PUSHES.has(s.kind));
  const crmDests = dests.filter((d) => d.kind === "source");
  const hooks = dests.filter((d) => d.kind === "webhook");
  // Sent this month per CRM, counted by the database.
  const sent = useQuery(`form:${formId}:sent:${crmDests.map((d) => d.id).join()}`, async () =>
    crmDests.length ? ((must(await sb.rpc("form_deliveries_by_dest", { p_form: formId, p_status: "done", p_since: daysAgo(30) })) ?? {}) as Record<string, number>) : ({} as Record<string, number>),
  );
  const items: { key: string; logo: React.ReactNode; title: string; sub: string; bad?: boolean; on?: boolean }[] = [
    ...tools.map((s) => {
      const d = crmDests.find((x) => x.source_id === s.id);
      const n = d ? (failed[d.id] ?? 0) : 0;
      return {
        key: s.id,
        logo: <BrandLogo domain={entryOf(s.kind)?.domain ?? ""} name={s.name} size={28} />,
        title: s.name,
        sub: !d ? "Not sending leads" : d.paused ? "Paused" : n ? `${n} didn't sync this week` : `Synced ${(sent.data?.[d.id] ?? 0).toLocaleString("en-US")} this month`,
        bad: !!n,
        on: !!d && !d.paused,
      };
    }),
    ...OFFER.filter((k) => !tools.some((s) => s.kind === k)).map((k) => ({ key: `connect:${k}`, logo: <BrandLogo domain={entryOf(k)?.domain ?? ""} name={entryOf(k)?.label ?? k} size={28} />, title: entryOf(k)?.label ?? k, sub: "Not connected" })),
    { key: "webhook", logo: <span className="inline-flex size-[28px] items-center justify-center rounded-lg bg-paper-deep text-body"><Ic n="code" /></span>, title: "Webhook", sub: hooks.length ? `${hooks.filter((h) => !h.paused).length} on` : "Off", on: hooks.some((h) => !h.paused) },
  ];
  const [pick, setPick] = useState<string>(() => crmDests[0]?.source_id ?? items[0]!.key);
  const cur = items.find((i) => i.key === pick) ?? items[0]!;
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] max-[860px]:grid-cols-1 max-[860px]:grid-rows-[auto_minmax(0,1fr)]">
      <div className="flex flex-col gap-[2px] overflow-y-auto border-r border-line px-[8px] py-[12px] max-[860px]:flex-row max-[860px]:overflow-x-auto max-[860px]:border-r-0 max-[860px]:border-b max-[860px]:p-[8px]">
        {items.map((i) => (
          <LeftItem
            key={i.key}
            on={pick === i.key}
            onClick={() => setPick(i.key)}
            icon={i.logo}
            title={i.title}
            sub={i.sub}
            subTone={i.bad ? "bad" : undefined}
            right={i.on ? <span className="max-[860px]:hidden"><Badge tone="green" dot>On</Badge></span> : null}
          />
        ))}
      </div>
      <div className="min-w-0 overflow-y-auto px-[16px] pt-[20px] pb-[32px] sm:px-[clamp(16px,3vw,32px)]">
        <div className="flex max-w-[760px] flex-col gap-[16px]">
          {cur.key === "webhook" ? (
            <WebhookPane {...props} hooks={hooks} />
          ) : cur.key.startsWith("connect:") ? (
            <Start logo={cur.logo} name={cur.title} button={`Connect ${cur.title}`} onClick={() => props.navigate("settings", "sources")} />
          ) : entryOf(tools.find((s) => s.id === cur.key)!.kind)?.lists ? (
            <ListPane {...props} source={tools.find((s) => s.id === cur.key)!} logo={cur.logo} />
          ) : entryOf(tools.find((s) => s.id === cur.key)!.kind)?.chat ? (
            <AlertPane {...props} source={tools.find((s) => s.id === cur.key)!} logo={cur.logo} />
          ) : entryOf(tools.find((s) => s.id === cur.key)!.kind)?.rows ? (
            <RowsPane {...props} source={tools.find((s) => s.id === cur.key)!} logo={cur.logo} />
          ) : (
            <CrmPane {...props} source={tools.find((s) => s.id === cur.key)!} logo={cur.logo} />
          )}
        </div>
      </div>
    </div>
  );
}

const H3 = ({ children }: { children: React.ReactNode }) => <h3 className="m-0 flex-1 text-[15px] font-semibold tracking-[-0.01em] text-ink">{children}</h3>;
const Sub = ({ children }: { children: React.ReactNode }) => <p className="-mt-[10px] mb-0 text-[12.5px] text-muted">{children}</p>;

function Start({ logo, name, button, onClick, busy = false }: { logo: React.ReactNode; name: string; button: string; onClick: () => void; busy?: boolean }) {
  return (
    <>
      <div className="flex items-center gap-[10px]">
        {logo}
        <H3>{name}</H3>
      </div>
      <p className="m-0 text-[12.5px] text-muted">{`Send every lead from this form to ${name}.`}</p>
      <button type="button" className={`${BTN} self-start`} onClick={onClick} disabled={busy}>
        {button}
      </button>
    </>
  );
}

function CrmPane({ sb, session, ws, form, formId, dests, failed, reload, patchDests, onFix, issueCtx, source, logo, crm }: Props & { source: SourceRow; logo: React.ReactNode }) {
  const d = dests.find((x) => x.kind === "source" && x.source_id === source.id);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const note = useNote();
  const run = async (fn: () => Promise<unknown>, words?: string) => {
    setError("");
    setBusy(true);
    try {
      await fn();
      if (words) note.show(words);
      reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  /** Pause and resume show at once and go back, with the error, if the save fails. */
  const quick = async (change: (ds: Destination[]) => Destination[], fn: () => Promise<unknown>, words?: string) => {
    if (!patchDests) return run(fn, words);
    setError("");
    setBusy(true);
    patchDests(change);
    try {
      await fn();
      if (words) note.show(words);
    } catch (e) {
      patchDests(() => dests);
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const save = (body: object) => postJson(session, "/api/forms/destination", { workspaceId: ws.id, formId, ...body });
  const fails = useQuery(`form:${formId}:fails:${d?.id ?? ""}:${failed[d?.id ?? ""] ?? 0}`, async () => (d ? ((must(await sb.from("deliveries").select("id, error").eq("destination_id", d.id).eq("status", "failed").order("created_at", { ascending: false }).limit(200)) ?? []) as { id: string; error: string | null }[]) : []));
  if (!d) return <Start logo={logo} name={source.name} button={`Send leads to ${source.name}`} busy={busy} onClick={() => void run(() => save({ kind: "source", sourceId: source.id, name: source.name }), `Leads go to ${source.name} now`)} />;
  const r: SyncRules = rulesOf(d.config) ?? BEFORE;
  const set = (patch: Partial<SyncRules>) => void run(() => save({ id: d.id, kind: "source", sourceId: d.source_id, name: d.name, rules: { ...r, ...patch } }));
  const list = fails.data ?? [];
  const dupes = list.filter((x) => x.error?.startsWith(DUPLICATE));
  const week = failed[d.id] ?? 0;
  const fields = allFields(form).filter((f) => f.type !== "heading" && f.type !== "paragraph" && f.type !== "hidden");
  const crmProps = crm.ctx.get(source.id)?.props ?? null;
  return (
    <>
      <div className="flex flex-wrap items-center gap-[10px]">
        {logo}
        <H3>{source.name}</H3>
        {d.paused ? <Badge tone="amber">Paused</Badge> : <Badge tone="green" dot>{d.config.host ? `Connected to ${d.config.host}` : "Connected"}</Badge>}
      </div>
      {list.length ? (
        <div className="flex w-full items-center gap-[10px] rounded-lg bg-rose-wash px-[12px] py-[10px] text-[12.5px]">
          <span className="min-w-0 flex-1 text-rose">
            <b className="font-semibold">{`${week || list.length} ${(week || list.length) === 1 ? "lead didn't" : "leads didn't"} reach ${source.name}${week ? " this week" : ""}.`}</b> {list[0]!.error ?? ""}
          </span>
          <button type="button" className={GHOST_SM} disabled={busy} onClick={() => void run(async () => must(await sb.rpc("deliveries_replay", { p_ids: list.filter((x) => !x.error?.startsWith(DUPLICATE)).map((x) => x.id) })), "Sent again")}>
            Send again
          </button>
          {dupes.length ? (
            <button type="button" className={GHOST_SM} disabled={busy} onClick={() => void run(async () => must(await sb.rpc("deliveries_create_anyway", { p_ids: dupes.map((x) => x.id) })), "Made anyway")}>
              Create anyway
            </button>
          ) : null}
        </div>
      ) : null}
      <ErrorNote message={error || fails.error} />
      <div className={CARD}>
        {source.kind === "salesforce" ? (
          <div className={CROW}>
            <RowText title="Make them as" />
            <Seg label="Make them as" value={r.create} onChange={(v) => set({ create: v })} options={[{ value: "Contact", label: "Contacts" }, { value: "Lead", label: "Leads" }]} />
          </div>
        ) : null}
        <div className={CROW}>
          <RowText title={`When the email is already in ${source.name}`} sub={r.match === "email_name" ? "Matched by email, then by name and company domain" : "Matched by email"} />
          <Seg
            label={`When the email is already in ${source.name}`}
            value={r.exists === "never" ? "skip" : "update"}
            onChange={(v) => set({ exists: v === "skip" ? "never" : r.exists === "never" ? "if_empty" : r.exists })}
            options={[{ value: "update", label: "Update it" }, { value: "new", label: "Make a new one", disabled: true, title: `${source.name} keeps one contact per email` }, { value: "skip", label: "Leave it" }]}
          />
        </div>
        <div className={CROW}>
          <RowText title="Owner" sub={r.assign === "claritia" ? `The person Routing picks. Records ${source.name} already owns keep their owner.` : `${source.name}'s own assignment rules decide`} />
          <Seg label="Owner" value={r.assign} onChange={(v) => set({ assign: v, owner: v === "claritia" ? "keep" : r.owner })} options={[{ value: "claritia", label: "Routing's pick" }, { value: "crm", label: `${source.name} decides` }]} />
        </div>
        <div className={CROW}>
          <RowText title="Send email consent" sub={`As ${source.name} subscription status`} />
          <Tg label="Send email consent" on={r.consent} onChange={(v) => set({ consent: v })} />
        </div>
      </div>
      <div className={CARD}>
        <div className={`${CROW} min-h-[44px]`}>
          <RowText title="Fields" />
          <span className="text-[12px] text-muted">Change them on each question in Build</span>
        </div>
        <table className="w-full border-collapse border-t border-line text-[13px]">
          <thead>
            <tr>
              <th className="border-b border-line bg-paper px-[12px] py-[9px] text-left text-[12px] font-medium text-muted">Question</th>
              <th className="border-b border-line bg-paper px-[12px] py-[9px] text-left text-[12px] font-medium text-muted">{`${source.name} field`}</th>
              <th className="border-b border-line bg-paper px-[12px] py-[9px]" />
            </tr>
          </thead>
          <tbody>
            {fields.map((f) => {
              const link = f.crm?.source === source.id ? f.crm : null;
              const p = link ? crmProps?.find((x) => x.name === link.property) : undefined;
              const issue = link ? issuesOf(f, issueCtx).find((i) => i.where === "save") : undefined;
              return (
                <tr key={f.id} className="[&:last-child>td]:border-b-0">
                  <td className="border-b border-line px-[12px] py-[9px]">{f.label || "Untitled question"}</td>
                  <td className="border-b border-line px-[12px] py-[9px]">{link ? (p?.label ?? link.label ?? link.property) : <span className="text-faint">Not sent</span>}</td>
                  <td className="border-b border-line px-[12px] py-[9px] text-right">
                    {issue ? (
                      <button type="button" onClick={() => onFix(f.id)} className={`inline-flex h-[22px] items-center rounded-full px-[10px] text-[11.5px] font-medium ${issue.lvl === "bad" ? "bg-rose-wash text-rose" : "bg-butter-wash text-butter"}`}>
                        {issue.lvl === "bad" ? "Fix" : "Check choices"}
                      </button>
                    ) : link ? (
                      <Badge tone="green" dot>
                        OK
                      </Badge>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className={CARD}>
        <div className={CROW}>
          <RowText title={d.paused ? `Send to ${source.name} again` : `Stop sending to ${source.name}`} sub="Leads keep going to Claritia" />
          <button
            type="button"
            className={d.paused ? GHOST_SM : GHOST_SM_RED}
            disabled={busy}
            onClick={async () => {
              if (!d.paused && !(await askConfirm(`Stop sending leads to ${source.name}?`, { body: "Leads keep going to Claritia. Turn it on again any time.", ok: "Turn off", danger: true }))) return;
              await quick(
                (ds) => ds.map((x) => (x.id === d.id ? { ...x, paused: !d.paused } : x)),
                async () => must(await sb.rpc("form_destination_pause", { p_id: d.id, p_paused: !d.paused })),
                d.paused ? `Leads go to ${source.name} again` : `Stopped sending to ${source.name}`,
              );
            }}
          >
            {d.paused ? "Turn on" : "Turn off"}
          </button>
        </div>
      </div>
      {note.node}
    </>
  );
}

/** What each email tool calls the thing a person joins. */
const LIST_WORD: Record<string, string> = { mailchimp: "Audience", kit: "Form", mailerlite: "Group" };

/**
 * An email tool (docs/integrations-plan.md step 1): each lead joins one of its lists, with tags where the tool keeps
 * them. Subscribe: only people who ticked the consent box, or everyone.
 */
function ListPane({ sb, session, ws, formId, dests, failed, reload, source, logo }: Props & { source: SourceRow; logo: React.ReactNode }) {
  const d = dests.find((x) => x.kind === "source" && x.source_id === source.id);
  const entry = entryOf(source.kind);
  const word = LIST_WORD[source.kind] ?? "List";
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pickNew, setPickNew] = useState<{ id: string; name: string } | null>(null);
  const [tag, setTag] = useState("");
  const note = useNote();
  const lists = useQuery(`tool_lists:${source.id}`, async () => {
    const res = await fetch(`/api/forms/tool-lists?workspaceId=${encodeURIComponent(ws.id)}&sourceId=${encodeURIComponent(source.id)}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
    const j = (await res.json().catch(() => ({}))) as { lists?: { id: string; name: string }[]; error?: string };
    if (!j.lists) throw new Error(j.error ?? "Couldn't read the lists.");
    return j.lists;
  });
  const run = async (fn: () => Promise<unknown>, words?: string) => {
    setError("");
    setBusy(true);
    try {
      await fn();
      if (words) note.show(words);
      reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const save = (body: object) => postJson(session, "/api/forms/destination", { workspaceId: ws.id, formId, kind: "source", sourceId: source.id, name: source.name, ...body });
  const fails = useQuery(`form:${formId}:fails:${d?.id ?? ""}:${failed[d?.id ?? ""] ?? 0}`, async () => (d ? ((must(await sb.from("deliveries").select("id, error").eq("destination_id", d.id).eq("status", "failed").order("created_at", { ascending: false }).limit(200)) ?? []) as { id: string; error: string | null }[]) : []));
  const options = (lists.data ?? []).map((l) => ({ value: l.id, label: l.name }));
  const listPicker = (value: string, onPick: (l: { id: string; name: string }) => void) => (
    <Select
      value={value}
      options={options}
      ariaLabel={word}
      placeholder={lists.data ? `Pick a ${word.toLowerCase()}` : "Reading…"}
      disabled={!lists.data || busy}
      className="h-[32px] min-w-[200px] rounded-[8px] bg-card px-[10px] text-[13px] text-ink shadow-input"
      onChange={(id) => onPick({ id, name: lists.data?.find((l) => l.id === id)?.name ?? id })}
    />
  );

  if (!d)
    return (
      <>
        <div className="flex flex-wrap items-center gap-[10px]">
          {logo}
          <H3>{source.name}</H3>
        </div>
        <div className={CARD}>
          <div className={CROW}>
            <RowText title={word} />
            {listPicker(pickNew?.id ?? "", setPickNew)}
          </div>
        </div>
        <ErrorNote message={error || lists.error} />
        <button type="button" className={`${BTN} self-start`} disabled={!pickNew || busy} onClick={() => void run(() => save({ list: pickNew }), `Leads join ${pickNew?.name ?? source.name} now`)}>
          {`Add leads to ${source.name}`}
        </button>
      </>
    );

  const r: SyncRules = rulesOf(d.config) ?? { ...NEW_RULES, consent: false };
  const pick = listOf(d.config);
  const list = fails.data ?? [];
  const week = failed[d.id] ?? 0;
  const setTags = (tags: string[]) => void run(() => save({ id: d.id, tags }));
  const addTag = () => {
    const t = tag.trim();
    if (!t || pick.tags.some((x) => x.toLowerCase() === t.toLowerCase())) return setTag("");
    setTag("");
    setTags([...pick.tags, t]);
  };
  return (
    <>
      <div className="flex flex-wrap items-center gap-[10px]">
        {logo}
        <H3>{source.name}</H3>
        {d.paused ? <Badge tone="amber">Paused</Badge> : <Badge tone="green" dot>Connected</Badge>}
      </div>
      {list.length ? (
        <div className="flex w-full flex-wrap items-center gap-[10px] rounded-lg bg-rose-wash px-[12px] py-[10px] text-[12.5px]">
          <span className="min-w-0 flex-1 text-rose [overflow-wrap:anywhere]">
            <b className="font-semibold">{`${week || list.length} ${(week || list.length) === 1 ? "lead didn't" : "leads didn't"} reach ${source.name}${week ? " this week" : ""}.`}</b> {list[0]!.error ?? ""}
          </span>
          <button type="button" className={GHOST_SM} disabled={busy || !pick.list} onClick={() => void run(async () => must(await sb.rpc("deliveries_replay", { p_ids: list.map((x) => x.id) })), "Sent again")}>
            Send again
          </button>
        </div>
      ) : null}
      <ErrorNote message={error || lists.error} />
      <div className={CARD}>
        <div className={CROW}>
          <RowText title={word} />
          {listPicker(pick.list?.id ?? "", (l) => void run(() => save({ id: d.id, list: l }), `Leads join ${l.name} now`))}
        </div>
        {entry?.tags ? (
          <div className={CROW}>
            <RowText title="Tags" />
            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-[6px]">
              {pick.tags.map((t) => (
                <span key={t} className="inline-flex h-[26px] items-center gap-[4px] rounded-full bg-paper-deep pr-[4px] pl-[10px] text-[12px] text-ink">
                  <span className="[overflow-wrap:anywhere]">{t}</span>
                  <button type="button" aria-label={`Remove ${t}`} title={`Remove ${t}`} disabled={busy} onClick={() => setTags(pick.tags.filter((x) => x !== t))} className="inline-flex size-[18px] items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink">
                    <Ic n="x" />
                  </button>
                </span>
              ))}
              {pick.tags.length < 10 ? (
                <input
                  value={tag}
                  maxLength={100}
                  aria-label="Add a tag"
                  placeholder="Add a tag"
                  onChange={(e) => setTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  onBlur={addTag}
                  className="h-[28px] w-[140px] rounded-[8px] bg-card px-[10px] text-[12.5px] text-ink shadow-input outline-none placeholder:text-faint focus:shadow-focus"
                />
              ) : null}
            </div>
          </div>
        ) : null}
        <div className={CROW}>
          <RowText title="Subscribe" />
          <Seg label="Subscribe" value={r.consent ? "consent" : "all"} onChange={(v) => void run(() => save({ id: d.id, rules: { ...r, consent: v === "consent" } }))} options={[{ value: "consent", label: "Who ticked consent" }, { value: "all", label: "Everyone" }]} />
        </div>
      </div>
      <div className={CARD}>
        <div className={CROW}>
          <RowText title={d.paused ? `Send to ${source.name} again` : `Stop sending to ${source.name}`} />
          <button
            type="button"
            className={d.paused ? GHOST_SM : GHOST_SM_RED}
            disabled={busy}
            onClick={async () => {
              if (!d.paused && !(await askConfirm(`Stop adding leads to ${source.name}?`, { body: "Leads keep going to Claritia. Turn it on again any time.", ok: "Turn off", danger: true }))) return;
              await run(async () => must(await sb.rpc("form_destination_pause", { p_id: d.id, p_paused: !d.paused })), d.paused ? `Leads go to ${source.name} again` : `Stopped sending to ${source.name}`);
            }}
          >
            {d.paused ? "Turn on" : "Turn off"}
          </button>
        </div>
      </div>
      {note.node}
    </>
  );
}

/** What a row tool calls the place rows go. */
/** Teams and Discord (docs/integrations-plan.md, Next step 5): an alert in a channel for each fill, beside Slack. */
function AlertPane({ sb, session, ws, formId, dests, failed, reload, patchDests, source, logo }: Props & { source: SourceRow; logo: React.ReactNode }) {
  const d = dests.find((x) => x.kind === "source" && x.source_id === source.id);
  const pick = !!entryOf(source.kind)?.channels;
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const note = useNote();
  const channels = useQuery(pick ? `tool_targets:${source.id}` : null, async () => {
    const res = await fetch(`/api/forms/tool-targets?workspaceId=${encodeURIComponent(ws.id)}&sourceId=${encodeURIComponent(source.id)}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
    const j = (await res.json().catch(() => ({}))) as { targets?: Target[]; error?: string };
    if (!j.targets) throw new Error(j.error ?? "Couldn't read the channels.");
    return j.targets;
  });
  const run = async (fn: () => Promise<unknown>, words?: string) => {
    setError("");
    setBusy(true);
    try {
      await fn();
      if (words) note.show(words);
      reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const save = (target?: Target) => postJson(session, "/api/forms/destination", { workspaceId: ws.id, formId, kind: "source", sourceId: source.id, name: source.name, ...(d ? { id: d.id } : {}), ...(target ? { target } : {}) });
  const target = d ? targetOf(d.config) : null;
  const week = d ? (failed[d.id] ?? 0) : 0;
  return (
    <>
      <div className="flex flex-wrap items-center gap-[10px]">
        {logo}
        <H3>{source.name}</H3>
        {d ? <Badge tone={d.paused ? "gray" : "green"} dot>{d.paused ? "Paused" : "On"}</Badge> : null}
      </div>
      <ErrorNote message={error || channels.error} />
      <div className={CARD}>
        {pick ? (
          <div className={CROW}>
            <RowText title="Channel" />
            <Select
              value={target?.id ?? ""}
              options={[...(channels.data ?? []), ...(target && !channels.data?.some((t) => t.id === target.id) ? [target] : [])].map((t) => ({ value: t.id, label: t.name }))}
              ariaLabel="Channel"
              placeholder={channels.data ? "Pick a channel" : "Reading…"}
              disabled={!channels.data || busy}
              className="h-[32px] min-w-[200px] rounded-[8px] bg-card px-[10px] text-[13px] text-ink shadow-input"
              onChange={(id) => {
                const t = channels.data?.find((x) => x.id === id);
                if (t) void run(() => save(t), `Alerts go to ${t.name} now`);
              }}
            />
          </div>
        ) : null}
        {d ? (
          <div className={CROW}>
            <RowText title="Alert on each fill" sub={week ? `${week} didn't go this week` : undefined} tone={week ? "bad" : undefined} />
            <Tg
              label="Alert on each fill"
              on={!d.paused}
              onChange={(on) => {
                patchDests?.((ds) => ds.map((x) => (x.id === d.id ? { ...x, paused: !on } : x)));
                void run(async () => must(await sb.rpc("form_destination_pause", { p_id: d.id, p_paused: !on })));
              }}
            />
          </div>
        ) : null}
      </div>
      {!d && !pick ? (
        <button type="button" className={`${BTN} self-start`} disabled={busy} onClick={() => void run(() => save(), `Alerts go to ${source.name} now`)}>
          {`Alert ${source.name} on each fill`}
        </button>
      ) : null}
      {d ? (
        <button
          type="button"
          className={`${GHOST_SM_RED} self-start`}
          onClick={async () => {
            if (!(await askConfirm(`Stop alerts in ${source.name}?`, { ok: "Remove", danger: true }))) return;
            await run(async () => must(await sb.rpc("form_destination_delete", { p_id: d.id })));
          }}
        >
          Remove
        </button>
      ) : null}
      {note.node}
    </>
  );
}

const TARGET_WORD: Record<string, string> = {
  google_sheets: "Sheet",
  airtable: "Table",
  notion: "Database",
  postgres: "Table",
  mysql: "Table",
  excel: "Workbook",
  // Work tools (docs/integrations-plan.md, Next step 10): where each fill's item goes.
  linear: "Team",
  trello: "List",
  clickup: "List",
  monday_work: "Board",
  smartsuite: "Table",
  zendesk: "Group",
  freshdesk: "Group",
  intercom: "Inbox",
};
type Target = { id: string; name: string; url?: string; sheet?: string };

// Google Sheets, Airtable, Notion, Excel Online, PostgreSQL and MySQL (docs/integrations-plan.md step 2): a row per
// fill in the sheet, table or database picked here. Google Sheets makes a new sheet or takes one's link; Airtable and
// Notion pick from their own list; Excel picks a workbook or takes one's link; PostgreSQL and MySQL take a table name
// and make the table if it isn't there.
function RowsPane({ sb, session, ws, form, formId, dests, failed, reload, source, logo }: Props & { source: SourceRow; logo: React.ReactNode }) {
  const d = dests.find((x) => x.kind === "source" && x.source_id === source.id);
  const google = source.kind === "google_sheets";
  const xl = source.kind === "excel";
  // Where a pasted link goes: a sheet or a workbook.
  const thing = xl ? "workbook" : "sheet";
  const sql = source.kind === "postgres" || source.kind === "mysql";
  const word = TARGET_WORD[source.kind] ?? "Table";
  // A work tool makes an item per fill; the sheets and databases a row.
  const goes = entryOf(source.kind)?.work ? "Fills go" : "Rows go";
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState("");
  // A table name from the form's: "Book a demo" → book_a_demo_fills.
  const [table, setTable] = useState(() => {
    const n = (form.title ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50);
    return `${n && /^[a-z]/.test(n) ? n : `form_${n}`.replace(/_+$/, "")}_fills`;
  });
  const note = useNote();
  const headers = { Authorization: `Bearer ${session.access_token}` };
  const targets = useQuery(google || sql ? null : `tool_targets:${source.id}`, async () => {
    const res = await fetch(`/api/forms/tool-targets?workspaceId=${encodeURIComponent(ws.id)}&sourceId=${encodeURIComponent(source.id)}`, { headers });
    const j = (await res.json().catch(() => ({}))) as { targets?: Target[]; error?: string };
    if (!j.targets) throw new Error(j.error ?? `Couldn't read the ${word.toLowerCase()}s.`);
    return j.targets;
  });
  const run = async (fn: () => Promise<unknown>, words?: string) => {
    setError("");
    setBusy(true);
    try {
      await fn();
      if (words) note.show(words);
      reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const save = (target: Target) => postJson(session, "/api/forms/destination", { workspaceId: ws.id, formId, kind: "source", sourceId: source.id, name: source.name, ...(d ? { id: d.id } : {}), target });
  const sheet = async (body: object) => (await postJson<{ target: Target }>(session, "/api/forms/tool-targets", { workspaceId: ws.id, sourceId: source.id, ...body })).target;
  const makeNew = () => void run(async () => save(await sheet({ action: "create", name: form.title?.trim() || "Form fills" })), "Rows go to the new sheet now");
  const takeLink = () => {
    const l = link.trim();
    if (!l) return;
    void run(async () => {
      await save(await sheet({ action: "link", link: l }));
      setLink("");
    }, `Rows go to that ${thing} now`);
  };
  const takeTable = () => {
    const t = table.trim();
    if (t) void run(() => sheet({ action: "table", name: t }).then(save), `Rows go to ${t} now`);
  };
  const fails = useQuery(`form:${formId}:fails:${d?.id ?? ""}:${failed[d?.id ?? ""] ?? 0}`, async () => (d ? ((must(await sb.from("deliveries").select("id, error").eq("destination_id", d.id).eq("status", "failed").order("created_at", { ascending: false }).limit(200)) ?? []) as { id: string; error: string | null }[]) : []));
  const target = d ? targetOf(d.config) : null;
  const picker = (
    <Select
      value={target?.id ?? ""}
      options={[...(targets.data ?? []), ...(target && !targets.data?.some((t) => t.id === target.id) ? [target] : [])].map((t) => ({ value: t.id, label: t.name }))}
      ariaLabel={word}
      placeholder={targets.data ? `Pick a ${word.toLowerCase()}` : "Reading…"}
      disabled={!targets.data || busy}
      className="h-[32px] min-w-[200px] rounded-[8px] bg-card px-[10px] text-[13px] text-ink shadow-input"
      onChange={(id) => {
        const t = targets.data?.find((x) => x.id === id);
        if (t) void run(() => save(t), `${goes} to ${t.name} now`);
      }}
    />
  );
  const linkRow = (
    <div className={CROW}>
      <RowText title={target ? `Use another ${thing}` : xl ? "Or paste its link" : "Use a sheet I have"} />
      <div className="flex min-w-0 flex-1 items-center justify-end gap-[6px] max-[860px]:basis-full">
        <input
          value={link}
          maxLength={1000}
          aria-label={xl ? "Workbook link" : "Sheet link"}
          placeholder={`Paste the ${thing}'s link`}
          onChange={(e) => setLink(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              takeLink();
            }
          }}
          className="h-[32px] min-w-0 flex-1 rounded-[8px] bg-card px-[10px] text-[13px] text-ink shadow-input outline-none placeholder:text-faint focus:shadow-focus"
        />
        <button type="button" className={GHOST_SM} disabled={busy || !link.trim()} onClick={takeLink}>
          Use
        </button>
      </div>
    </div>
  );
  const tableBox = (
    <input
      value={table}
      maxLength={127}
      aria-label="Table name"
      spellCheck={false}
      onChange={(e) => setTable(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          takeTable();
        }
      }}
      className="h-[32px] min-w-0 flex-1 rounded-[8px] bg-card px-[10px] font-mono text-[12.5px] text-ink shadow-input outline-none placeholder:text-faint focus:shadow-focus"
    />
  );

  if (!d || !target)
    return (
      <>
        <div className="flex flex-wrap items-center gap-[10px]">
          {logo}
          <H3>{source.name}</H3>
        </div>
        <ErrorNote message={error || targets.error} />
        {sql ? (
          <>
            <div className={CARD}>
              <div className={CROW}>
                <RowText title="Table" />
                <div className="flex min-w-0 flex-1 items-center justify-end max-[860px]:basis-full">{tableBox}</div>
              </div>
            </div>
            <button type="button" className={`${BTN} self-start`} disabled={busy || !table.trim()} onClick={takeTable}>
              {`Send rows to ${source.name}`}
            </button>
          </>
        ) : google ? (
          <>
            <button type="button" className={`${BTN} self-start`} disabled={busy} onClick={makeNew}>
              Send rows to a new sheet
            </button>
            <div className={CARD}>{linkRow}</div>
          </>
        ) : (
          <div className={CARD}>
            <div className={CROW}>
              <RowText title={word} />
              {picker}
            </div>
            {xl ? linkRow : null}
          </div>
        )}
        {note.node}
      </>
    );

  const list = fails.data ?? [];
  const week = failed[d.id] ?? 0;
  return (
    <>
      <div className="flex flex-wrap items-center gap-[10px]">
        {logo}
        <H3>{source.name}</H3>
        {d.paused ? <Badge tone="amber">Paused</Badge> : <Badge tone="green" dot>Connected</Badge>}
      </div>
      {list.length ? (
        <div className="flex w-full flex-wrap items-center gap-[10px] rounded-lg bg-rose-wash px-[12px] py-[10px] text-[12.5px]">
          <span className="min-w-0 flex-1 text-rose [overflow-wrap:anywhere]">
            <b className="font-semibold">{`${week || list.length} ${(week || list.length) === 1 ? "fill didn't" : "fills didn't"} reach ${source.name}${week ? " this week" : ""}.`}</b> {list[0]!.error ?? ""}
          </span>
          <button type="button" className={GHOST_SM} disabled={busy} onClick={() => void run(async () => must(await sb.rpc("deliveries_replay", { p_ids: list.map((x) => x.id) })), "Sent again")}>
            Send again
          </button>
        </div>
      ) : null}
      <ErrorNote message={error || targets.error} />
      <div className={CARD}>
        <div className={CROW}>
          <RowText title={word} />
          {sql ? (
            <span className="min-w-0 font-mono text-[12.5px] text-ink [overflow-wrap:anywhere]">{target.name}</span>
          ) : google ? (
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-[6px]">
              <span className="min-w-0 text-[13px] text-ink [overflow-wrap:anywhere]">{target.name}</span>
              {target.url ? (
                <a href={target.url} target="_blank" rel="noreferrer" className={GHOST_SM}>
                  Open
                </a>
              ) : null}
            </div>
          ) : (
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-[6px]">
              {picker}
              {target.url ? (
                <a href={target.url} target="_blank" rel="noreferrer" className={GHOST_SM}>
                  Open
                </a>
              ) : null}
            </div>
          )}
        </div>
        {sql ? (
          <div className={CROW}>
            <RowText title="Use another table" />
            <div className="flex min-w-0 flex-1 items-center justify-end gap-[6px] max-[860px]:basis-full">
              {tableBox}
              <button type="button" className={GHOST_SM} disabled={busy || !table.trim() || table.trim() === target.id} onClick={takeTable}>
                Use
              </button>
            </div>
          </div>
        ) : null}
        {xl ? linkRow : null}
        {google ? (
          <>
            {linkRow}
            <div className={CROW}>
              <RowText title="Start a new sheet" />
              <button type="button" className={GHOST_SM} disabled={busy} onClick={makeNew}>
                New sheet
              </button>
            </div>
          </>
        ) : null}
      </div>
      <div className={CARD}>
        <div className={CROW}>
          <RowText title={d.paused ? `Send to ${source.name} again` : `Stop sending to ${source.name}`} />
          <button
            type="button"
            className={d.paused ? GHOST_SM : GHOST_SM_RED}
            disabled={busy}
            onClick={async () => {
              if (!d.paused && !(await askConfirm(`Stop sending fills to ${source.name}?`, { body: "Fills stay in Claritia. Turn it on again any time.", ok: "Turn off", danger: true }))) return;
              await run(async () => must(await sb.rpc("form_destination_pause", { p_id: d.id, p_paused: !d.paused })), d.paused ? `${goes} to ${source.name} again` : `Stopped sending to ${source.name}`);
            }}
          >
            {d.paused ? "Turn on" : "Turn off"}
          </button>
        </div>
      </div>
      {note.node}
    </>
  );
}

function WebhookPane({ sb, session, ws, formId, reload, patchDests, dests, hooks }: Props & { hooks: Destination[] }) {
  const [error, setError] = useState("");
  const run = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
      reload();
    } catch (e) {
      setError(errorText(e));
    }
  };
  /** Pause and remove show at once and go back, with the error, if the save fails. */
  const quick = async (change: (ds: Destination[]) => Destination[], fn: () => Promise<unknown>) => {
    if (!patchDests) return run(fn);
    setError("");
    patchDests(change);
    try {
      await fn();
    } catch (e) {
      patchDests(() => dests);
      setError(errorText(e));
    }
  };
  const add = async () => {
    const url = await askText("Webhook address", { placeholder: "https://", ok: "Add" });
    if (!url) return;
    await run(async () => {
      let name = "Webhook";
      try {
        name = new URL(url).hostname || name;
      } catch {}
      const r = await postJson<{ secret?: string }>(session, "/api/forms/destination", { workspaceId: ws.id, formId, kind: "webhook", name, url });
      if (r.secret) await tell("Signing secret", `Shown once. It signs the x-claritia-signature header.\n\n${r.secret}`);
    });
  };
  return (
    <>
      <H3>Webhook</H3>
      <Sub>Send each fill to your own system.</Sub>
      <ErrorNote message={error} />
      <div className={CARD}>
        {hooks.map((h) => (
          <div key={h.id} className={CROW}>
            <RowText title={h.name} sub={h.paused ? "Paused" : "Signed, retried, the same body every try"} />
            <button type="button" className={GHOST_SM} onClick={() => void quick((ds) => ds.map((x) => (x.id === h.id ? { ...x, paused: !h.paused } : x)), async () => must(await sb.rpc("form_destination_pause", { p_id: h.id, p_paused: !h.paused })))}>
              {h.paused ? "Turn on" : "Pause"}
            </button>
            <button
              type="button"
              className={GHOST_SM_RED}
              onClick={async () => {
                if (!(await askConfirm(`Stop sending leads to ${h.name}?`, { ok: "Remove", danger: true }))) return;
                await quick((ds) => ds.filter((x) => x.id !== h.id), async () => must(await sb.rpc("form_destination_delete", { p_id: h.id })));
              }}
            >
              Remove
            </button>
          </div>
        ))}
        <div className={CROW}>
          <RowText title="Add a webhook" sub="Signed, retried, the same body every try" />
          <button type="button" className={GHOST_SM} onClick={() => void add()}>
            Add
          </button>
        </div>
      </div>
    </>
  );
}
