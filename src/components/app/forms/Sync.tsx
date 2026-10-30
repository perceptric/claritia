"use client";

// Sync (docs/form-builder.md Part 7): where each lead goes. On the left: Claritia CRM (always), each CRM with its
// state, and webhooks. A CRM this form sends to shows the leads that didn't reach it with Send again, what a lead is
// made as, what happens when the email is already there, the owner and consent, then every question and the field it
// goes to with Fix or Check choices. A CRM that's connected but not used here, or not connected at all, has one
// button that starts it.

import { useState } from "react";
import { DUPLICATE, rulesOf, type SyncRules } from "@/lib/delivery/rules";
import { allFields, type Form } from "@/lib/forms/schema";
import { CATALOG, entryOf } from "@/lib/sources/catalog";
import { BrandLogo } from "../BrandLogo";
import { askConfirm, askText, tell } from "../Dialogs";
import { Badge, ErrorNote, errorText, must, postJson, useLoad, type ViewProps } from "../ui";
import { daysAgo, issuesOf } from "./formModel";
import { Ic } from "./ic";
import { BTN, CARD, CROW, GHOST_SM, GHOST_SM_RED, LINK, RowText, Seg, useNote, Tg } from "./parts";
import { LeftItem } from "./Share";
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
  onFix: (fieldId: string) => void;
  issueCtx: Parameters<typeof issuesOf>[1];
};

export function Sync(props: Props) {
  const { sb, dests, sources, failed, formId } = props;
  const tools = sources.filter((s) => s.status !== "disconnected" && PUSHES.has(s.kind));
  const crmDests = dests.filter((d) => d.kind === "source");
  const hooks = dests.filter((d) => d.kind === "webhook");
  const sent = useLoad(async () => {
    if (!crmDests.length) return {} as Record<string, number>;
    const since = daysAgo(30);
    const rows = ((await sb.from("deliveries").select("destination_id").in("destination_id", crmDests.map((d) => d.id)).eq("status", "done").gte("created_at", since).limit(5000)).data ?? []) as { destination_id: string }[];
    const out: Record<string, number> = {};
    for (const r of rows) out[r.destination_id] = (out[r.destination_id] ?? 0) + 1;
    return out;
  }, `${formId}:${crmDests.map((d) => d.id).join()}`);
  const items: { key: string; logo: React.ReactNode; title: string; sub: string; bad?: boolean; on?: boolean }[] = [
    { key: "claritia", logo: <BrandLogo domain="tryclaritia.com" name="Claritia" size={28} />, title: "Claritia CRM", sub: "Every lead becomes a contact", on: true },
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
  const [pick, setPick] = useState<string>(() => crmDests[0]?.source_id ?? "claritia");
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
          {cur.key === "claritia" ? (
            <ClaritiaPane {...props} />
          ) : cur.key === "webhook" ? (
            <WebhookPane {...props} hooks={hooks} />
          ) : cur.key.startsWith("connect:") ? (
            <Start logo={cur.logo} name={cur.title} button={`Connect ${cur.title}`} onClick={() => props.navigate("settings", "sources")} />
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

function ClaritiaPane({ navigate }: Props) {
  return (
    <>
      <H3>Claritia CRM</H3>
      <Sub>Always on. Each fill makes or updates a contact and its company.</Sub>
      <div className={CARD}>
        <div className={CROW}>
          <RowText title="Same person sends it twice" sub="Matched by email. New answers follow each question's rule." />
          <Badge>One contact</Badge>
        </div>
        <div className={CROW}>
          <RowText title="Free email addresses" sub="The contact is made without a company" />
          <Badge>No company</Badge>
        </div>
        <div className={CROW}>
          <RowText title="Then" sub="Routing picks the rep, Scoring scores the lead" />
          <button type="button" className={LINK} onClick={() => navigate("routing")}>
            Open Routing
          </button>
        </div>
      </div>
    </>
  );
}

function CrmPane({ sb, session, ws, form, formId, dests, failed, reload, onFix, issueCtx, source, logo, crm }: Props & { source: SourceRow; logo: React.ReactNode }) {
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
  const save = (body: object) => postJson(session, "/api/forms/destination", { workspaceId: ws.id, formId, ...body });
  const fails = useLoad(async () => (d ? ((must(await sb.from("deliveries").select("id, error").eq("destination_id", d.id).eq("status", "failed").order("created_at", { ascending: false }).limit(200)) ?? []) as { id: string; error: string | null }[]) : []), `${d?.id ?? ""}:${failed[d?.id ?? ""] ?? 0}`);
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
          <RowText title="Owner" sub={r.assign === "claritia" ? `The rep Routing picks. Records ${source.name} already owns keep their owner.` : `${source.name}'s own assignment rules decide`} />
          <Seg label="Owner" value={r.assign} onChange={(v) => set({ assign: v, owner: v === "claritia" ? "keep" : r.owner })} options={[{ value: "claritia", label: "Routing's rep" }, { value: "crm", label: `${source.name} decides` }]} />
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

function WebhookPane({ sb, session, ws, formId, reload, hooks }: Props & { hooks: Destination[] }) {
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
            <button type="button" className={GHOST_SM} onClick={() => void run(async () => must(await sb.rpc("form_destination_pause", { p_id: h.id, p_paused: !h.paused })))}>
              {h.paused ? "Turn on" : "Pause"}
            </button>
            <button
              type="button"
              className={GHOST_SM_RED}
              onClick={async () => {
                if (!(await askConfirm(`Stop sending leads to ${h.name}?`, { ok: "Remove", danger: true }))) return;
                await run(async () => must(await sb.rpc("form_destination_delete", { p_id: h.id })));
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
