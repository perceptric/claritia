"use client";

// Emails (docs/email-studio-plan.md Part 1): Campaigns (one-off emails and what happened to them), Automations (the
// workflows that send email, opened in Workflows), Audiences (the people emails go to, with their email status),
// Templates (saved emails that workflows and campaigns reuse) and Brand (the look emails take, and where they send
// from). New email opens the Email Studio (Part 3): the email builder on Tia's tab, saved as a campaign draft.
// Sending campaigns and results by meetings and forms come in later parts.

import { useEffect, useRef, useState } from "react";
import { newBlock, newSection, readEmailDoc, type EmailDoc } from "@/lib/design/email/doc";
import { emailsPage, EMAILS_TABS } from "@/lib/nav";
import { Branch, Plus, Trash } from "../../Icons";
import { askConfirm } from "../Dialogs";
import { EmailBuilder } from "../email/EmailBuilder";
import { ToolIntro } from "../ToolIntro";
import { BrandSettings } from "../views/BrandSettings";
import { EmailTemplatesView } from "../workflows/EmailTemplatesView";
import { Badge, Button, ErrorNote, errorText, IconButton, invalidate, Loading, must, Page, Section, Td, Th, timeAgo, useQuery, type Tone, type ViewProps } from "../ui";

export function EmailsView(props: ViewProps) {
  const p = emailsPage(props.id);
  const nav = { title: "Emails", tabs: EMAILS_TABS, current: p.page, onPick: (t: string) => props.navigate("emails", t === "campaigns" ? "" : t) };
  return (
    <Section nav={nav}>
      {p.page === "automations" ? (
        <Automations {...props} />
      ) : p.page === "audiences" ? (
        <Audiences {...props} />
      ) : p.page === "templates" ? (
        <EmailTemplatesView {...props} />
      ) : p.page === "brand" ? (
        <Brand {...props} />
      ) : p.open ? (
        <CampaignStudio key={p.open} {...props} emailId={p.open} />
      ) : (
        <Campaigns {...props} />
      )}
    </Section>
  );
}

const n = (x: number) => x.toLocaleString("en-US");
const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 1000) / 10}%` : "");

// Campaigns ---------------------------------------------------------------------------------------------------------

type Campaign = { id: string; name: string; subject: string; status: string; updated_at: string; first_sent: string | null; recipients: number; sent: number; delivered: number; clicked: number; unsubscribed: number; bounced: number; complained: number };
const CAMPAIGN_TONE: Record<string, Tone> = { sent: "green", sending: "amber", scheduled: "sky", draft: "gray" };
const CAMPAIGN_LABEL: Record<string, string> = { sent: "Sent", sending: "Sending", scheduled: "Scheduled", draft: "Draft" };

/** A new email: only the footer, so Tia can start it from any template without asking first. */
const blankDoc = (): EmailDoc => ({ ...readEmailDoc({}), sections: [newSection([newBlock("footer")])] });

function Campaigns({ sb, ws, navigate }: ViewProps) {
  const list = useQuery(`email_campaigns:${ws.id}`, async () => (must(await sb.rpc("email_campaigns", { p_ws: ws.id })) ?? []) as Campaign[]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const create = async () => {
    setBusy(true);
    setError("");
    try {
      const id = must(await sb.rpc("email_draft_save", { p_ws: ws.id, p_id: null, p_name: "Untitled email", p_subject: "", p_preheader: "", p_doc: blankDoc() })) as string;
      invalidate(`email_campaigns:${ws.id}`);
      navigate("emails", `campaigns/${id}`);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  const remove = async (c: Campaign) => {
    if (!(await askConfirm(`Delete ${c.name}?`, { ok: "Delete", danger: true }))) return;
    try {
      await list.mutate((l) => l.filter((x) => x.id !== c.id), async () => {
        must(await sb.rpc("email_draft_delete", { p_ws: ws.id, p_id: c.id }));
      });
    } catch (e) {
      setError(errorText(e));
    }
  };
  const add = (
    <Button onClick={() => void create()} disabled={busy}>
      <Plus size={14} /> New email
    </Button>
  );
  if (list.error) return <ErrorNote message={list.error} />;
  if (!list.data) return <Loading />;
  if (!list.data.length)
    return (
      <Page title="Campaigns">
        <ErrorNote message={error} />
        <ToolIntro
          sketch="envelopes"
          title={"Write an email by describing it\nTia builds it in your brand"}
          lead="Every campaign you send lists who got it, who clicked and who left the list."
          action={
            <>
              {add}
              <Button variant="ghost" onClick={() => navigate("settings", "sending")}>
                Set up sending
              </Button>
            </>
          }
        />
      </Page>
    );
  return (
    <Page title="Campaigns" actions={add}>
      <ErrorNote message={error} />
      <div className="overflow-x-auto rounded-lg bg-card shadow-rest">
        <table className="w-full min-w-[820px] border-collapse [&_tbody_tr:last-child_td]:border-b-0">
          <thead>
            <tr>
              <Th className="pl-5">Email</Th>
              <Th>Status</Th>
              <Th>Sent</Th>
              <Th>Delivered</Th>
              <Th>Clicked</Th>
              <Th>Unsubscribed</Th>
              <Th>Bounced</Th>
              <Th className="w-12">
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {list.data.map((c) => (
              <tr key={c.id} className={c.status === "draft" ? "cursor-pointer hover:[&>td]:bg-hover" : ""} onClick={c.status === "draft" ? () => navigate("emails", `campaigns/${c.id}`) : undefined}>
                <Td className="pl-5">
                  <span className="flex min-w-0 flex-col py-1">
                    {c.status === "draft" ? (
                      <a
                        href={`/emails/campaigns/${c.id}`}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          navigate("emails", `campaigns/${c.id}`);
                        }}
                        className="font-medium break-words text-ink"
                      >
                        {c.name}
                      </a>
                    ) : (
                      <span className="font-medium break-words text-ink">{c.name}</span>
                    )}
                    {c.subject ? <span className="text-[12px] break-words text-muted">{c.subject}</span> : null}
                  </span>
                </Td>
                <Td>
                  <span className="flex flex-col gap-0.5">
                    <Badge tone={CAMPAIGN_TONE[c.status] ?? "gray"} dot>
                      {CAMPAIGN_LABEL[c.status] ?? c.status}
                    </Badge>
                    <span className="text-[12px] text-muted">{timeAgo(c.first_sent ?? c.updated_at)}</span>
                  </span>
                </Td>
                <Td className="tabular-nums">{c.sent ? n(c.sent) : "—"}</Td>
                <Td className="tabular-nums">{c.sent ? `${n(c.delivered)} ${pct(c.delivered, c.sent) ? `(${pct(c.delivered, c.sent)})` : ""}` : "—"}</Td>
                <Td className="tabular-nums">{c.sent ? `${n(c.clicked)} (${pct(c.clicked, c.delivered || c.sent)})` : "—"}</Td>
                <Td className="tabular-nums">{c.sent ? n(c.unsubscribed) : "—"}</Td>
                <Td className="tabular-nums">{c.sent ? n(c.bounced + c.complained) : "—"}</Td>
                <Td className="pr-3">
                  {c.status === "draft" ? (
                    <span onClick={(e) => e.stopPropagation()}>
                      <IconButton label={`Delete ${c.name}`} onClick={() => void remove(c)}>
                        <Trash size={13} />
                      </IconButton>
                    </span>
                  ) : null}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Page>
  );
}

// The Email Studio (Part 3): one draft in the email builder, opening on Tia's tab. Changes save 800 ms after the last
// one; leaving saves what's left. The draft's name follows its subject until it has one of its own.

type Draft = { id: string; name: string; subject: string; preheader: string | null; doc: unknown; status: string };

function CampaignStudio(props: ViewProps & { emailId: string }) {
  const { sb, ws, navigate, emailId } = props;
  const row = useQuery(`email_draft:${emailId}`, async () => must(await sb.from("emails").select("id, name, subject, preheader, doc, status").eq("id", emailId).eq("workspace_id", ws.id).maybeSingle()) as Draft | null, { staleMs: 0 });
  if (row.error) return <ErrorNote message={row.error} />;
  if (!row.loaded) return <Loading />;
  const d = row.data;
  if (!d || d.status !== "draft")
    return (
      <Page title="Campaigns" back={{ label: "Campaigns", onClick: () => navigate("emails") }}>
        <ErrorNote message={d ? "This email was sent, so it can't change." : "This email is gone."} />
      </Page>
    );
  return <DraftEditor {...props} draft={d} />;
}

function DraftEditor({ sb, session, ws, navigate, emailId, draft }: ViewProps & { emailId: string; draft: Draft }) {
  const [state, setState] = useState(() => ({ name: draft.name, subject: draft.subject, doc: draft.doc ? readEmailDoc(draft.doc, { allowHtml: true }) : blankDoc() }));
  const [fresh] = useState(() => !state.doc.sections.some((x) => x.columns.some((c) => c.blocks.some((b) => b.type !== "footer"))));
  const [error, setError] = useState("");
  const dirty = useRef(false);
  const latest = useRef(state);
  const save = async () => {
    const s = latest.current;
    if (!dirty.current) return;
    dirty.current = false;
    const name = s.name === "Untitled email" && s.subject.trim() ? s.subject.trim().slice(0, 200) : s.name;
    const { error: e } = await sb.rpc("email_draft_save", { p_ws: ws.id, p_id: emailId, p_name: name, p_subject: s.subject, p_preheader: s.doc.settings.preheader ?? "", p_doc: s.doc });
    if (e) {
      dirty.current = true;
      setError(e.message);
      return;
    }
    setError("");
    if (name !== s.name) setState((x) => ({ ...x, name }));
    invalidate(`email_campaigns:${ws.id}`);
  };
  const saveRef = useRef(save);
  useEffect(() => {
    latest.current = state;
    saveRef.current = save;
  });
  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(() => void saveRef.current(), 800);
    return () => clearTimeout(t);
  }, [state]);
  // Leaving the studio saves what hasn't been saved yet.
  useEffect(() => () => void saveRef.current(), []);
  const change = (p: Partial<{ subject: string; doc: EmailDoc }>) => {
    dirty.current = true;
    setState((x) => ({ ...x, ...p }));
  };
  return (
    <>
      {error ? (
        <div className="fixed inset-x-0 bottom-4 z-[90] flex justify-center px-4">
          <div className="max-w-md rounded-lg bg-card p-1 shadow-menu">
            <ErrorNote message={error} />
          </div>
        </div>
      ) : null}
      <EmailBuilder
        session={session}
        sb={sb}
        workspaceId={ws.id}
        subject={state.subject}
        doc={state.doc}
        versionRef={`em:${emailId}`}
        startOn={fresh ? "ai" : "settings"}
        title={state.name}
        onSubject={(subject) => change({ subject })}
        onChange={(doc, subject) => change({ doc, ...(subject ? { subject } : {}) })}
        onClose={() => {
          void saveRef.current();
          navigate("emails");
        }}
      />
    </>
  );
}

// Automations -------------------------------------------------------------------------------------------------------

type Automation = { id: string; name: string; status: string; trigger_kind: string | null; emails: number; updated_at: string };
const TRIGGER_WORDS: Record<string, string> = { form: "Form submitted", meeting: "Meeting event", not_booked: "No booking after form", routed: "Lead routed", clicked: "Email clicked" };
const WF_TONE: Record<string, Tone> = { live: "green", paused: "amber", draft: "gray" };
const WF_LABEL: Record<string, string> = { live: "Live", paused: "Paused", draft: "Draft" };

function Automations({ sb, ws, navigate }: ViewProps) {
  const list = useQuery(`email_automations:${ws.id}`, async () => (must(await sb.rpc("email_automations", { p_ws: ws.id })) ?? []) as Automation[]);
  const add = (
    <Button onClick={() => navigate("workflows", "new")}>
      <Plus size={14} /> New automation
    </Button>
  );
  if (list.error) return <ErrorNote message={list.error} />;
  if (!list.data) return <Loading />;
  if (!list.data.length)
    return (
      <Page title="Automations">
        <ToolIntro sketch="plane" title={"Emails that send themselves\nwhen someone fills a form or books"} lead="An automation is a workflow with emails in it. It shows here and in Workflows." action={add} />
      </Page>
    );
  return (
    <Page title="Automations" actions={add}>
      <div className="overflow-x-auto rounded-lg bg-card shadow-rest">
        <table className="w-full min-w-[640px] border-collapse [&_tbody_tr:last-child_td]:border-b-0">
          <thead>
            <tr>
              <Th className="pl-5">Automation</Th>
              <Th>Starts when</Th>
              <Th>Emails</Th>
              <Th>Status</Th>
              <Th>Edited</Th>
            </tr>
          </thead>
          <tbody>
            {list.data.map((a) => (
              <tr key={a.id} className="cursor-pointer hover:[&>td]:bg-hover" onClick={() => navigate("workflows", a.id)}>
                <Td className="pl-5">
                  <a
                    href={`/workflows/${a.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      navigate("workflows", a.id);
                    }}
                    className="flex min-w-0 items-center gap-2 font-medium break-words text-ink"
                  >
                    <Branch size={14} className="shrink-0 text-muted" />
                    {a.name}
                  </a>
                </Td>
                <Td className="text-muted">{TRIGGER_WORDS[a.trigger_kind ?? ""] ?? "Not set"}</Td>
                <Td className="tabular-nums">{a.emails}</Td>
                <Td>
                  <Badge tone={WF_TONE[a.status] ?? "gray"} dot>
                    {WF_LABEL[a.status] ?? a.status}
                  </Badge>
                </Td>
                <Td className="text-muted">{timeAgo(a.updated_at)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Page>
  );
}

// Audiences ---------------------------------------------------------------------------------------------------------

type Person = { id: string; email: string; first_name: string | null; last_name: string | null; source: string; created_at: string; status: string; last_sent: string | null };
const STATUS_TONE: Record<string, Tone> = { subscribed: "green", unsubscribed: "gray", bounced: "amber", complained: "red", "no consent": "gray" };
const STATUS_LABEL: Record<string, string> = { subscribed: "Subscribed", unsubscribed: "Unsubscribed", bounced: "Bounced", complained: "Marked as spam", "no consent": "No consent" };
const SOURCE_LABEL: Record<string, string> = { form: "Form", import: "Import", manual: "Added by hand", api: "API", hubspot: "HubSpot", salesforce: "Salesforce", omniscient: "Omniscient" };

function Audiences({ sb, ws }: ViewProps) {
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(50);
  const term = q.trim();
  const total = useQuery(`audience_count:${ws.id}`, async () => must(await sb.rpc("audience_count", { p_ws: ws.id })) as number);
  const people = useQuery(`audience_people:${ws.id}:${term}:${limit}`, async () => (must(await sb.rpc("audience_people", { p_ws: ws.id, p_q: term || null, p_limit: limit })) ?? []) as Person[]);
  if (total.error || people.error) return <ErrorNote message={total.error || people.error} />;
  if (total.data === null || !people.data) return <Loading />;
  if (!total.data)
    return (
      <Page title="Audiences">
        <ToolIntro sketch="megaphone" title={"The people your emails go to\nfill in from your forms and bookings"} lead="Everyone who fills a form or books a meeting shows here, with whether they agreed to get email." />
      </Page>
    );
  const name = (p: Person) => [p.first_name, p.last_name].filter(Boolean).join(" ");
  return (
    <Page title="Audiences" count={total.data}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or email" aria-label="Search people" className="h-8 w-full max-w-sm min-w-0 rounded-md bg-card px-3 text-[13px] text-ink shadow-input outline-none focus:shadow-focus" />
      </div>
      <div className="overflow-x-auto rounded-lg bg-card shadow-rest">
        <table className="w-full min-w-[720px] border-collapse [&_tbody_tr:last-child_td]:border-b-0">
          <thead>
            <tr>
              <Th className="pl-5">Person</Th>
              <Th>Email status</Th>
              <Th>Came from</Th>
              <Th>Added</Th>
              <Th>Last email</Th>
            </tr>
          </thead>
          <tbody>
            {people.data.map((p) => (
              <tr key={p.id}>
                <Td className="pl-5">
                  <span className="flex min-w-0 flex-col py-1">
                    {name(p) ? <span className="font-medium break-words text-ink">{name(p)}</span> : null}
                    <span className={`${name(p) ? "text-[12px] text-muted" : "font-medium text-ink"} wrap-anywhere`}>{p.email}</span>
                  </span>
                </Td>
                <Td>
                  <Badge tone={STATUS_TONE[p.status] ?? "gray"}>{STATUS_LABEL[p.status] ?? p.status}</Badge>
                </Td>
                <Td className="text-muted">{SOURCE_LABEL[p.source] ?? p.source}</Td>
                <Td className="text-muted">{timeAgo(p.created_at)}</Td>
                <Td className="text-muted">{p.last_sent ? timeAgo(p.last_sent) : "None yet"}</Td>
              </tr>
            ))}
            {!people.data.length ? (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-center text-[13px] text-muted">
                  No matches
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {people.data.length >= limit && limit < 200 ? (
        <div className="mt-3 flex justify-center">
          <Button variant="ghost" size="sm" onClick={() => setLimit((l) => Math.min(l + 50, 200))}>
            Show more
          </Button>
        </div>
      ) : null}
    </Page>
  );
}

// Brand -------------------------------------------------------------------------------------------------------------

function Brand(props: ViewProps) {
  return (
    <Page
      title="Brand"
      actions={
        <Button variant="ghost" onClick={() => props.navigate("settings", "sending")}>
          Sending settings
        </Button>
      }
    >
      <BrandSettings sb={props.sb} session={props.session} ws={props.ws} />
    </Page>
  );
}
