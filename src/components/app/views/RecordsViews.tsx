"use client";

// Companies, Opportunities and custom objects (docs/conversion-parity.md Part 7): lists on the shared records list,
// and a record page with editable fields in sections, links both ways, and the change history. A company page also
// holds its opportunities and what it does on your site; an opportunity page leads with amount, stage and close date.

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { shown, type AnyField } from "@/lib/records/fields";
import { Box, Dollar, Eye, Plus, Users } from "../../Icons";
import { askConfirm, askText } from "../Dialogs";
import { Avatar, Badge, Button, ErrorNote, errorText, invalidate, Loading, must, Page, Tabs, timeAgo, useQuery, type ViewProps } from "../ui";
import type { Link } from "../records/FieldInput";
import { useMeta } from "../records/meta";
import { FieldDialog } from "../records/FieldDialog";
import { FieldsPanel, HistoryPanel, type Change } from "../records/RecordParts";
import { RecordWork } from "../records/RecordWork";
import { RecordsList, type ViewState } from "../records/RecordsList";
import { DEFAULT_WIDTH, type Row } from "../records/RecordTable";
import { AccountActivity } from "./AccountActivity";
import { ToolIntro } from "../ToolIntro";
import { FieldGroup, RailRow, RecordHead, RecordLayout, RelatedList, StagePath, StatStrip, type RelatedRow } from "../records/RecordLayout";

const cols = (...keys: string[]) => keys.map((key) => ({ key, width: DEFAULT_WIDTH }));

const COMPANIES_BASE: ViewState = {
  filters: [],
  columns: cols("domain", "industry", "size", "country", "owner", "contacts", "fit", "intent", "updated_at"),
  sort: { key: "updated_at", desc: true },
  layout: "table",
  group: null,
};

export function CompaniesView(props: ViewProps) {
  const { sb, ws, session, navigate, id } = props;
  if (id.startsWith("account/")) return <CompanyForAccount {...props} accountId={id.slice(8)} />;
  if (id) return <RecordPage {...props} object="company" />;
  return (
    <RecordsList
      sb={sb}
      session={session}
      ws={ws}
      object="company"
      screen="companies"
      title="Companies"
      icon={<Users size={14} />}
      base={COMPANIES_BASE}
      presets={[
        { name: "Evaluating", filters: [{ field: "stage", op: "is", values: ["evaluating"] }] },
        { name: "Fit 70+", filters: [{ field: "fit", op: "gte", values: ["70"] }] },
        { name: "Intent 50+", filters: [{ field: "intent", op: "gte", values: ["50"] }] },
        { name: "No owner", filters: [{ field: "owner", op: "empty", values: [] }] },
      ]}
      actions={
        <Button variant="ghost" size="sm" onClick={() => navigate("visitors", "visits")}>
          <Eye size={13} />
          Visits
        </Button>
      }
      intro={
        <ToolIntro
          sketch="cards"
          title={"Every company\nyour leads work at"}
          lead="Companies are made from your contacts' work emails and your CRM, then filled in by enrichment and scored for fit and intent from their visits."
          action={
            <Button onClick={() => navigate("contacts", "", "create=1")}>
              <Plus size={14} /> Add contact
            </Button>
          }
        />
      }
      onOpen={(r) => navigate("companies", r.id)}
    />
  );
}

/** An old account link: open its company. */
function CompanyForAccount({ sb, ws, navigate, accountId }: ViewProps & { accountId: string }) {
  const [error, setError] = useState("");
  useEffect(() => {
    void sb
      .from("companies")
      .select("id")
      .eq("workspace_id", ws.id)
      .eq("account_id", accountId)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle()
      .then(({ data, error: e }) => (data ? navigate("companies", (data as { id: string }).id) : setError(e?.message ?? "Company not found")));
  }, [sb, ws.id, accountId, navigate]);
  return (
    <Page icon={<Users size={14} />} title="Companies">
      {error ? <ErrorNote message={error} /> : <Loading />}
    </Page>
  );
}

// Opportunities ---------------------------------------------------------------------------------------------------

const OPPORTUNITIES_BASE: ViewState = {
  filters: [],
  columns: cols("f.amount", "f.stage", "f.close_date", "f.company", "f.owner", "f.probability", "updated_at"),
  sort: { key: "updated_at", desc: true },
  layout: "board",
  group: "f.stage",
};

export function OpportunitiesView(props: ViewProps) {
  const { sb, ws, session, navigate, id } = props;
  const [error, setError] = useState("");
  if (id) return <RecordPage {...props} object="opportunity" />;
  const add = async () => {
    const name = await askText("New opportunity", { placeholder: "Name", ok: "Create" });
    if (!name) return;
    try {
      const rid = must(await sb.rpc("record_create", { p_ws: ws.id, p_object: "opportunity", p_name: name, p_fields: { stage: "qualification" } })) as string;
      invalidate(`records:${ws.id}:opportunity`);
      navigate("opportunities", rid);
    } catch (e) {
      setError(errorText(e));
      invalidate(`records:${ws.id}`);
    }
  };
  return (
    <>
      {error ? (
        <div className="border-b border-line bg-card p-3">
          <ErrorNote message={error} />
        </div>
      ) : null}
      <RecordsList
        sb={sb}
        session={session}
        ws={ws}
        object="opportunity"
        screen="opportunities"
        title="Opportunities"
        icon={<Dollar size={14} />}
        base={OPPORTUNITIES_BASE}
        sum="f.amount"
        presets={[
          { name: "Open", filters: [{ field: "f.stage", op: "is_not", values: ["won", "lost"] }] },
          { name: "Won", filters: [{ field: "f.stage", op: "is", values: ["won"] }] },
          { name: "Lost", filters: [{ field: "f.stage", op: "is", values: ["lost"] }] },
          { name: "No company", filters: [{ field: "f.company", op: "empty", values: [] }] },
        ]}
        onAdd={add}
        intro={
          <ToolIntro
            sketch="funnel"
            title={"Every deal\nfrom first meeting to won"}
            lead="Opportunities come from your CRM, or you add them here. Each one links to its company and contacts, so reports can follow a lead to the deal it became."
            action={
              <Button onClick={() => void add()}>
                <Plus size={14} /> New opportunity
              </Button>
            }
          />
        }
        onOpen={(r) => navigate("opportunities", r.id)}
      />
    </>
  );
}

type Opp = { id: string; name: string; amount: number | null; stage: string | null; close_date: string | null };

/** The same opportunities as a short list in a record page's right rail. */
export function OpportunitiesRail({ sb, ws, object, id, navigate }: { sb: SupabaseClient; ws: { id: string }; object: "company" | "contact"; id: string; navigate: ViewProps["navigate"] }) {
  const meta = useMeta(sb, ws.id, "opportunity");
  const list = useQuery(`records:${ws.id}:opportunity:for:${object}:${id}`, async () => must(await sb.rpc("opportunities_for", { p_object: object, p_id: id })) as Opp[]);
  const amount = meta.data?.fields.find((f) => f.key === "f.amount");
  const stage = meta.data?.fields.find((f) => f.key === "f.stage");
  const rows: RelatedRow[] = (list.data ?? []).map((o) => {
    const st = stage?.options.find((x) => x.value === o.stage);
    return {
      id: o.id,
      name: o.name,
      sub: amount && o.amount != null ? shown(amount, Number(o.amount)) : null,
      tag: st ? <Badge tone={st.kind === "won" ? "green" : st.kind === "lost" ? "red" : "gray"}>{st.label}</Badge> : undefined,
      onOpen: () => navigate("opportunities", o.id),
    };
  });
  return <RelatedList id={`opps:${object}`} title="Opportunities" rows={rows} />;
}

/** /objects/<key> lists a custom object; /objects/<key>/<id> opens one record. */
export function ObjectsView(props: ViewProps) {
  const [key, recordId] = props.id.split("/");
  if (!key) return <Page icon={<Box size={14} />} title="Records"><ErrorNote message="Object not found" /></Page>;
  if (recordId) return <RecordPage {...props} id={recordId} object={key} />;
  return <ObjectList {...props} objectKey={key} />;
}

function ObjectList({ sb, ws, session, navigate, objectKey }: ViewProps & { objectKey: string }) {
  const meta = useMeta(sb, ws.id, objectKey);
  const [error, setError] = useState("");
  const obj = meta.data?.object;
  if (meta.error || (meta.data && !obj)) {
    return (
      <Page icon={<Box size={14} />} title="Records">
        <ErrorNote message={meta.error || "Object not found"} />
      </Page>
    );
  }
  const add = async () => {
    const name = await askText(`New ${obj?.label.toLowerCase() ?? "record"}`, { placeholder: "Name", ok: "Create" });
    if (!name) return;
    try {
      const rid = must(await sb.rpc("record_create", { p_ws: ws.id, p_object: objectKey, p_name: name, p_fields: {} })) as string;
      invalidate(`records:${ws.id}:${objectKey}`);
      navigate("objects", `${objectKey}/${rid}`);
    } catch (e) {
      setError(errorText(e));
      invalidate(`records:${ws.id}`);
    }
  };
  const base: ViewState = {
    filters: [],
    columns: [...(meta.data?.fields ?? []).filter((f) => f.custom).slice(0, 6).map((f) => ({ key: f.key, width: DEFAULT_WIDTH })), { key: "updated_at", width: DEFAULT_WIDTH }],
    sort: { key: "updated_at", desc: true },
    layout: "table",
    group: null,
  };
  if (!meta.data) return <Page icon={<Box size={14} />} title={obj?.plural ?? "Records"}><Loading /></Page>;
  return (
    <>
      {error ? (
        <div className="border-b border-line bg-card p-3">
          <ErrorNote message={error} />
        </div>
      ) : null}
      <RecordsList
        sb={sb}
        session={session}
        ws={ws}
        object={objectKey}
        screen={`object:${objectKey}`}
        title={obj!.plural}
        icon={<Box size={14} />}
        base={base}
        onAdd={add}
        onOpen={(r) => navigate("objects", `${objectKey}/${r.id}`)}
      />
    </>
  );
}

type Detail = {
  record?: Row & { name: string; fields: Record<string, unknown> };
  company?: Row & { name: string | null; domain: string | null; owner: string | null };
  object?: { key: string; label: string; plural: string };
  account?: { id: string; fit: number | null; intent: number | null; stage: string | null; temperature: string | null; why_now: string | null } | null;
  contacts?: { id: string; email: string | null; first_name: string | null; last_name: string | null; title: string | null; lifecycle: string | null }[];
  writes?: Record<string, { source: string; at: string }>;
  links?: Record<string, Link[]>;
  backlinks?: { field: string; object: string; id: string }[];
  history: Change[];
};

type RecordTab = "activity" | "people" | "notes" | "tasks" | "changes" | "links";

function RecordPage({ sb, ws, session, role, id, navigate, object }: ViewProps & { object: string }) {
  const [addingField, setAddingField] = useState(false);
  const [tab, setTab] = useState<RecordTab>("activity");
  const company = object === "company";
  const opportunity = object === "opportunity";
  const meta = useMeta(sb, ws.id, object);
  const detail = useQuery(`record:${ws.id}:${object}:${id}`, async () => must(await sb.rpc(company ? "company_detail" : "record_detail", { p_id: id })) as Detail);
  const [error, setError] = useState("");
  const listRoute = company ? () => navigate("companies") : opportunity ? () => navigate("opportunities") : () => navigate("objects", object);
  const label = company ? "Companies" : opportunity ? "Opportunities" : (meta.data?.object?.plural ?? "Records");
  const icon = company ? <Users size={14} /> : opportunity ? <Dollar size={14} /> : <Box size={14} />;

  if (detail.error || meta.error || !detail.data || !meta.data) {
    return (
      <Page icon={icon} title={label} back={{ label, onClick: listRoute }}>
        {detail.error || meta.error ? <ErrorNote message={detail.error || meta.error} /> : <Loading />}
      </Page>
    );
  }
  const d = detail.data;
  const rec = (company ? d.company : d.record) as Row;
  const name = (company ? d.company?.name || d.company?.domain : d.record?.name) ?? "—";
  const record: Row = company ? { ...rec, fit: d.account?.fit ?? null, intent: d.account?.intent ?? null, stage: d.account?.stage ?? null, contacts: d.contacts?.length ?? 0 } : rec;
  // A field shows its new value at once and goes back if the save fails; relations and names read the record again.
  const save = async (f: AnyField, v: unknown) => {
    const write = async () => must(await sb.rpc("record_set", { p_object: object, p_id: id, p_key: f.key, p_value: v ?? null }));
    const custom = f.key.startsWith("f.");
    const simple = f.kind !== "relation" && (custom || !["name", "domain", "owner", "fit", "intent", "stage", "contacts"].includes(f.key));
    if (simple)
      await detail.mutate((x) => {
        const key = company ? "company" : "record";
        const cur = (x[key] ?? {}) as Row & { fields?: Record<string, unknown> };
        const next = custom ? { ...cur, fields: { ...(cur.fields ?? {}), [f.key.slice(2)]: v ?? null } } : { ...cur, [f.key]: v ?? null };
        return { ...x, [key]: next };
      }, write);
    else {
      await write();
      detail.reload();
    }
    invalidate(`records:${ws.id}:${object}`);
  };
  const remove = async () => {
    if (!(await askConfirm(`Remove ${name}?`, { ok: "Remove", danger: true }))) return;
    try {
      must(await sb.rpc("records_delete", { p_ws: ws.id, p_object: object, p_ids: [id] }));
      invalidate(`records:${ws.id}`);
      listRoute();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const openLink = (l: { object: string; id: string }) =>
    l.object === "contact"
      ? navigate("contacts", l.id)
      : l.object === "company"
        ? navigate("companies", l.id)
        : l.object === "opportunity"
          ? navigate("opportunities", l.id)
          : navigate("objects", `${l.object}/${l.id}`);
  const field = (k: string) => meta.data!.fields.find((f) => f.key === k);
  const f = (rec.fields ?? {}) as Record<string, unknown>;
  const stage = field("f.stage")?.options.find((o) => o.value === f.stage);
  const late = opportunity && stage?.kind === "open" && typeof f.close_date === "string" && f.close_date < new Date().toISOString().slice(0, 10);
  const stats: [string, React.ReactNode][] = company
    ? [
        ["Fit", d.account?.fit ?? "—"],
        ["Intent", d.account?.intent ?? "—"],
        ["Contacts", d.contacts?.length ?? "—"],
      ]
    : opportunity
      ? [
          ["Amount", f.amount != null && field("f.amount") ? shown(field("f.amount")!, f.amount) : "—"],
          ["Win chance", f.probability != null ? `${f.probability}%` : "—"],
          ["Close date", f.close_date && field("f.close_date") ? shown(field("f.close_date")!, f.close_date) : "—"],
        ]
      : [];
  // Opportunities have their own panel on a company page.
  const backlinks = (d.backlinks ?? []).filter((l) => !(company && l.object === "opportunity"));

  const tabList: { value: RecordTab; label: string; count?: number }[] = [
    ...(company && d.account ? [{ value: "activity" as RecordTab, label: "Activity" }] : []),
    ...(company ? [{ value: "people" as RecordTab, label: "People", count: d.contacts?.length || undefined }] : []),
    { value: "notes", label: "Notes" },
    { value: "tasks", label: "Tasks" },
    { value: "changes", label: "Changes", count: d.history.length || undefined },
    ...(backlinks.length ? [{ value: "links" as RecordTab, label: "Linked from", count: backlinks.length }] : []),
  ];
  const open = tabList.some((t) => t.value === tab) ? tab : tabList[0].value;
  const tags = (
    <>
      {company && d.account?.temperature ? (
        <Badge tone={d.account.temperature === "hot" ? "red" : "gray"} dot>
          {d.account.temperature}
        </Badge>
      ) : null}
      {company && d.account?.stage ? <Badge tone="violet">{d.account.stage}</Badge> : null}
      {stage ? <Badge tone={stage.kind === "won" ? "green" : stage.kind === "lost" ? "red" : "gray"}>{stage.label}</Badge> : null}
      {late ? <Badge tone="red">Late</Badge> : null}
    </>
  );
  const sub = company ? (
    d.company?.domain ? (
      <a href={`https://${d.company.domain}`} target="_blank" rel="noreferrer" className="text-ink hover:underline">
        {d.company.domain}
      </a>
    ) : null
  ) : (
    meta.data.object?.label
  );
  const peopleRows: RelatedRow[] = (d.contacts ?? []).map((c) => {
    const n = [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || "Contact";
    return { id: c.id, name: n, sub: c.title, onOpen: () => navigate("contacts", c.id) };
  });

  return (
    <Page
      icon={icon}
      title={name}
      back={{ label, onClick: listRoute }}
      flush
      actions={
        <>
          <Button variant="danger" size="sm" onClick={remove}>
            Remove
          </Button>
        </>
      }
    >
      <RecordLayout
        head={
          <>
            <RecordHead visual={<Avatar label={name} size={44} />} title={name} tag={tags} sub={sub} />
            {error ? (
              <div className="px-5 pb-3">
                <ErrorNote message={error} />
              </div>
            ) : null}
          </>
        }
        top={
          <>
            <StatStrip items={stats} />
            {opportunity && field("f.stage") ? <StagePath stages={field("f.stage")!.options} value={typeof f.stage === "string" ? f.stage : null} onPick={(v) => void save(field("f.stage")!, v).catch((e) => setError(errorText(e)))} /> : null}
          </>
        }
        tabs={<Tabs value={open} onChange={setTab} tabs={tabList} bare />}
        rail={
          <>
            <FieldsPanel
              sb={sb}
              wsId={ws.id}
              record={record}
              fields={meta.data.fields}
              layout={meta.data.layout}
              writes={d.writes ?? Object.fromEntries(Object.entries((rec.field_sources ?? {}) as Record<string, { s: string; at: string }>).map(([k, v]) => [k, { source: v.s, at: v.at }]))}
              links={d.links ?? {}}
              skip={company ? ["fit", "intent", "stage", "contacts"] : []}
              onSave={save}
              onCustomize={() => navigate("settings", "fields")}
              onAddField={() => setAddingField(true)}
            />
            {company ? <RelatedList id="company:people" title="People" rows={peopleRows} /> : null}
            {company ? <OpportunitiesRail sb={sb} ws={ws} object="company" id={id} navigate={navigate} /> : null}
            <FieldGroup id={`${object}:system`} title="System">
              <RailRow label="Created">{timeAgo(String(rec.created_at))}</RailRow>
            </FieldGroup>
          </>
        }
      >
        <div className="px-5 py-5">
          {open === "activity" && company && d.account ? <AccountActivity sb={sb} accountId={d.account.id} /> : null}
          {open === "people" ? (
            !peopleRows.length ? (
              <p className="py-6 text-center text-[13px] text-faint">No people yet</p>
            ) : (
              <ul className="divide-y divide-line rounded-lg border border-line">
                {(d.contacts ?? []).map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => navigate("contacts", c.id)} className="flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left text-[13px] transition-colors duration-[120ms] hover:bg-hover">
                      <Avatar label={[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || "?"} size={24} />
                      <span className="min-w-0 flex-1 truncate font-medium">{[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email}</span>
                      <span className="truncate text-[12px] text-muted">{c.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : null}
          {open === "notes" || open === "tasks" ? <RecordWork sb={sb} ws={ws} session={session} role={role} object={object} record={id} people={meta.data.people} show={open} /> : null}
          {open === "changes" ? <HistoryPanel history={d.history} fields={meta.data.fields} people={meta.data.people} /> : null}
          {open === "links" ? (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {backlinks.map((l, i) => (
                <li key={i}>
                  <button type="button" onClick={() => openLink(l)} className="flex min-h-11 w-full items-center gap-2 px-4 py-2 text-left text-[13px] transition-colors duration-[120ms] hover:bg-hover">
                    <span className="text-muted">{l.field}</span>
                    <span className="ml-auto text-[12px] text-faint">{l.object}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </RecordLayout>
      {addingField ? (
        <FieldDialog
          sb={sb}
          ws={ws}
          object={object}
          onClose={() => setAddingField(false)}
          onSaved={() => {
            setAddingField(false);
            meta.reload();
          }}
        />
      ) : null}
    </Page>
  );
}
