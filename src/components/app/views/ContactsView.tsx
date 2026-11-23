"use client";

// Contacts, Leads and the contact page (docs/marketing-platform.md 6.2 and 1.4). The lists run on the shared
// records list (src/components/app/records): views, filters, table or board, columns, inline edits and bulk
// actions. The add and edit forms live here.

import { useState } from "react";

import { Contact, Plus, Upload } from "../../Icons";
import { askConfirm, askText, tell } from "../Dialogs";
import { Popover } from "../FilterBar";

import { SampleRows, SampleStats, SampleTags, ToolIntro } from "../ToolIntro";
import { Badge, Button, errorText, must, type ViewProps } from "../ui";

import { useMeta, type Meta } from "../records/meta";

import { ImportPanel } from "../records/ImportPanel";
import { RecordsList, type Preset, type ViewState } from "../records/RecordsList";

import { cols } from "../records/RecordTable";
import { ContactPanel, ContactPage } from "./ContactPage";

const CONTACTS_BASE: ViewState = {
  filters: [],
  columns: cols("company", "title", "lifecycle", "lead_status", "owner", "country", "score", "updated_at"),
  sort: { key: "updated_at", desc: true },
  layout: "table",
  group: "lifecycle",
};
const CONTACT_PRESETS: Preset[] = [
  { name: "Customers", filters: [{ field: "lifecycle", op: "is", values: ["customer"] }] },
  { name: "Seen on site", filters: [{ field: "known", op: "is", values: ["true"] }] },
  { name: "New this week", filters: [{ field: "created_at", op: "within", values: ["7"] }] },
  { name: "By lifecycle", layout: "board", group: "lifecycle" },
];
const LEADS_BASE: ViewState = {
  filters: [{ field: "lead_status", op: "not_empty", values: [] }],
  columns: cols("lead_status", "company", "title", "owner", "score", "fit", "updated_at"),
  sort: { key: "updated_at", desc: true },
  layout: "board",
  group: "lead_status",
};
const LEAD_PRESETS: Preset[] = [
  { name: "Open", filters: [{ field: "lead_status", op: "is", values: ["new", "attempting", "connected"] }], layout: "table" },
  { name: "No owner", filters: [{ field: "lead_status", op: "not_empty", values: [] }, { field: "owner", op: "empty", values: [] }], layout: "table" },
  { name: "Fit 70+", filters: [{ field: "lead_status", op: "not_empty", values: [] }, { field: "fit", op: "gte", values: ["70"] }], layout: "table" },
];

export function ContactsView(props: ViewProps) {
  if (props.id) return <ContactPage {...props} />;
  return <ContactsList {...props} />;
}

export function LeadsView(props: ViewProps) {
  if (props.id) return <ContactPage {...props} back="leads" />;
  return <ContactsList {...props} leads />;
}

function ContactsList({ sb, ws, session, navigate, leads = false }: ViewProps & { leads?: boolean }) {
  const [panel, setPanel] = useState<"import" | "add" | null>(null);
  const [tick, setTick] = useState(0);
  const custom = useMeta(sb, ws.id, "contact");
  const route = leads ? "leads" : "contacts";
  const actions = (
    <>
      <Button variant="ghost" onClick={() => setPanel("import")}>
        <Upload size={13} />
        Import
      </Button>
      <Button onClick={() => setPanel("add")}>
        <Plus size={13} />
        Add contact
      </Button>
    </>
  );
  return (
    <>
      <RecordsList
        key={tick}
        sb={sb}
        session={session}
        ws={ws}
        object="contact"
        screen={route}
        title={leads ? "Leads" : "Contacts"}
        icon={<Contact size={14} />}
        base={leads ? LEADS_BASE : CONTACTS_BASE}
        presets={leads ? LEAD_PRESETS : CONTACT_PRESETS}
        actions={actions}
        onOpen={(r) => navigate(route, r.id)}
        nameExtra={(r) => (r.person_id ? <Badge tone="brand">On site</Badge> : null)}
        intro={leads ? undefined : <ContactsIntro action={actions} />}
        bulkExtra={(ids, done, meta) => <ContactBulk sb={sb} wsId={ws.id} ids={ids} done={done} meta={meta} />}
      />
      {panel === "import" ? (
        <ImportPanel
          sb={sb}
          session={session}
          wsId={ws.id}
          custom={custom.data?.custom ?? []}
          fieldsChanged={custom.reload}
          onClose={(changed) => {
            setPanel(null);
            if (changed) setTick((t) => t + 1);
          }}
        />
      ) : null}
      {panel === "add" ? (
        <ContactPanel
          session={session}
          wsId={ws.id}
          custom={custom.data?.custom ?? []}
          onClose={(id) => {
            setPanel(null);
            if (id) navigate(route, id);
          }}
        />
      ) : null}
    </>
  );
}

/** Contacts' own bulk actions: add to a list, merge two. */
function ContactBulk({ sb, wsId, ids, done, meta }: { sb: ViewProps["sb"]; wsId: string; ids: () => Promise<string[]>; done: () => void; meta: Meta }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [error, setError] = useState("");
  const addTo = async (list: string | null) => {
    setAnchor(null);
    let name = "";
    if (!list) {
      const n = await askText("New list", { placeholder: "List name", ok: "Create" });
      if (!n) return;
      name = n;
    }
    try {
      const chosen = await ids();
      must(await sb.rpc("list_add", { p_ws: wsId, p_list: list, p_name: name, p_ids: chosen }));
      done();
      await tell(`Added ${chosen.length.toLocaleString("en-US")} to the list`);
    } catch (e) {
      setError(errorText(e));
    }
  };
  const merge = async () => {
    const chosen = await ids();
    if (chosen.length !== 2) return void tell("Pick exactly two contacts to merge");
    if (!(await askConfirm("Merge these two contacts?", { body: "The first one picked stays. Its empty fields fill from the other.", ok: "Merge" }))) return;
    try {
      must(await sb.rpc("contacts_merge", { p_keep: chosen[0], p_drop: chosen[1] }));
      done();
    } catch (e) {
      setError(errorText(e));
    }
  };
  return (
    <>
      {error ? <span className="text-[12.5px] text-danger">{error}</span> : null}
      <Button variant="ghost" className="h-7 px-2.5" onClick={(e) => setAnchor(e.currentTarget)}>
        Add to list
      </Button>
      <Button variant="ghost" className="h-7 px-2.5" onClick={merge}>
        Merge
      </Button>
      {anchor ? (
        <Popover anchor={anchor} onClose={() => setAnchor(null)} width={240}>
          <ul className="max-h-72 overflow-y-auto p-1">
            {meta.lists.map((l) => (
              <li key={l.value}>
                <button type="button" onClick={() => addTo(l.value)} className="flex h-8 w-full items-center rounded-md px-2 text-left hover:bg-hover">
                  {l.label}
                </button>
              </li>
            ))}
            <li>
              <button type="button" onClick={() => addTo(null)} className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-hover">
                <Plus size={13} />
                New list
              </button>
            </li>
          </ul>
        </Popover>
      ) : null}
    </>
  );
}

function ContactsIntro({ action }: { action: React.ReactNode }) {
  return (
    <ToolIntro
      action={action}
      title="Every contact in one place"
      lead="Bring in your contacts from a CSV, or add them one by one. Claritia cleans each email, merges duplicates, keeps each person's email consent, and ties them to their visits."
      features={[
        {
          title: "Import a CSV",
          text: "Columns map on their own. Duplicates merge into one contact, and each value keeps where it came from.",
          visual: <SampleStats items={[["rows", "10,000"], ["created", "8,912"], ["merged", "1,088"]]} />,
        },
        {
          title: "Filter and save views",
          text: "Filter by any field, company or fit, and save the view for your team.",
          visual: <SampleTags rows={[["Lifecycle is Lead", "Filter"], ["Fit at least 70", "Filter"], ["Country is DE", "Filter"]]} />,
        },
        {
          title: "Consent by region",
          text: "Each contact keeps its basis for email. In the EU and UK, only opt-in counts.",
          visual: <SampleRows rows={[["Opted in", 62, "62%"], ["Legitimate interest", 24, "24%"], ["No basis", 14, "14%"]]} />,
        },
      ]}
    />
  );
}
