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
import { askConfirm, askText, tell } from "../Dialogs";
import { Select } from "../Select";
import { Sheet } from "../Sheet";
import { EmailBuilder } from "../email/EmailBuilder";
import { SendPanel } from "./SendPanel";
import { StatCards } from "../StatCards";
import { AiMark } from "../Ai";
import { ToolIntro } from "../ToolIntro";
import { BrandSettings } from "../views/BrandSettings";
import { TemplateGallery } from "./TemplateGallery";
import { FillsFrom, ImportHistory } from "./AudienceParts";
import { ImportSheet } from "./ImportSheet";
import { isRoleAddress } from "@/lib/emails/role";
import { Badge, Button, ErrorNote, errorText, IconButton, invalidate, Loading, must, Page, postJson, Section, Td, Th, timeAgo, useQuery, type Tone, type ViewProps } from "../ui";

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
        <TemplateGallery {...props} />
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

type Campaign = { id: string; name: string; subject: string; status: string; updated_at: string; first_sent: string | null; recipients: number; sent: number; delivered: number; clicked: number; unsubscribed: number; bounced: number; complained: number; send_at: string | null; waiting: number; opened: number; meetings: number; forms: number };
const CAMPAIGN_TONE: Record<string, Tone> = { sent: "green", sending: "amber", scheduled: "sky", paused: "amber", draft: "gray" };
const CAMPAIGN_LABEL: Record<string, string> = { sent: "Sent", sending: "Sending", scheduled: "Scheduled", paused: "Paused", draft: "Draft" };
const whenWords = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

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
  // Pause, Resume and Cancel act at once; the list reads again after.
  const act = async (fn: "pause" | "resume" | "cancel", c: Campaign) => {
    if (fn === "cancel" && !(await askConfirm(`Cancel ${c.name}?`, { body: "It goes back to a draft and nobody gets it.", ok: "Cancel sending", danger: true }))) return;
    setError("");
    const r = fn === "cancel" ? await sb.rpc("email_campaign_cancel", { p_ws: ws.id, p_email: c.id }) : await sb.rpc("email_campaign_pause", { p_ws: ws.id, p_email: c.id, p_pause: fn === "pause" });
    if (r.error) setError(r.error.message);
    void list.reload();
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
        <table className="w-full min-w-[900px] border-collapse [&_tbody_tr:last-child_td]:border-b-0">
          <thead>
            <tr>
              <Th className="pl-5">Email</Th>
              <Th>Status</Th>
              <Th>Sent</Th>
              <Th>Opened</Th>
              <Th>Clicked</Th>
              <Th>Meetings</Th>
              <Th>Forms</Th>
              <Th>Unsubscribed</Th>
              <Th className="w-40">
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {list.data.map((c) => (
              <tr key={c.id} className="cursor-pointer hover:[&>td]:bg-hover" onClick={() => navigate("emails", `campaigns/${c.id}`)}>
                <Td className="pl-5">
                  <span className="flex min-w-0 flex-col py-1">
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
                    {c.subject ? <span className="text-[12px] break-words text-muted">{c.subject}</span> : null}
                  </span>
                </Td>
                <Td>
                  <span className="flex flex-col gap-0.5">
                    <Badge tone={CAMPAIGN_TONE[c.status] ?? "gray"} dot>
                      {CAMPAIGN_LABEL[c.status] ?? c.status}
                    </Badge>
                    <span className="text-[12px] text-muted">{c.status === "scheduled" && c.send_at ? whenWords(c.send_at) : c.status === "sending" || c.status === "paused" ? `${n(c.waiting)} to go` : timeAgo(c.first_sent ?? c.updated_at)}</span>
                  </span>
                </Td>
                <Td className="tabular-nums">{c.sent ? n(c.sent) : "—"}</Td>
                <Td className="tabular-nums">{c.sent ? pct(c.opened, c.delivered || c.sent) : "—"}</Td>
                <Td className="tabular-nums">{c.sent ? pct(c.clicked, c.delivered || c.sent) : "—"}</Td>
                <Td className={`tabular-nums ${c.meetings ? "font-medium text-signal-text" : ""}`}>{c.sent ? n(c.meetings) : "—"}</Td>
                <Td className="tabular-nums">{c.sent ? n(c.forms) : "—"}</Td>
                <Td className="tabular-nums">{c.sent ? n(c.unsubscribed) : "—"}</Td>
                <Td className="pr-3">
                  {c.status === "draft" ? (
                    <span onClick={(e) => e.stopPropagation()}>
                      <IconButton label={`Delete ${c.name}`} onClick={() => void remove(c)}>
                        <Trash size={13} />
                      </IconButton>
                    </span>
                  ) : c.status === "scheduled" || c.status === "sending" || c.status === "paused" ? (
                    <span className="flex flex-wrap justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => void act(c.status === "paused" ? "resume" : "pause", c)}>
                        {c.status === "paused" ? "Resume" : "Pause"}
                      </Button>
                      {c.sent === 0 ? (
                        <Button size="sm" variant="ghost" onClick={() => void act("cancel", c)}>
                          Cancel
                        </Button>
                      ) : null}
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
  if (d && d.status !== "draft") return <Results {...props} />;
  if (!d)
    return (
      <Page title="Campaigns" back={{ label: "Campaigns", onClick: () => navigate("emails") }}>
        <ErrorNote message="This email is gone." />
      </Page>
    );
  return <DraftEditor {...props} draft={d} />;
}

function DraftEditor({ sb, session, ws, navigate, emailId, draft }: ViewProps & { emailId: string; draft: Draft }) {
  const [state, setState] = useState(() => ({ name: draft.name, subject: draft.subject, doc: draft.doc ? readEmailDoc(draft.doc, { allowHtml: true }) : blankDoc() }));
  const [fresh] = useState(() => !state.doc.sections.some((x) => x.columns.some((c) => c.blocks.some((b) => b.type !== "footer"))));
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
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
        actions={
          <Button
            onClick={async () => {
              await saveRef.current();
              setSending(true);
            }}
          >
            Send
          </Button>
        }
        onChange={(doc, subject) => change({ doc, ...(subject ? { subject } : {}) })}
        onClose={() => {
          void saveRef.current();
          navigate("emails");
        }}
      />
      {sending ? (
        <SendPanel
          sb={sb}
          session={session}
          ws={ws.id}
          emailId={emailId}
          subject={state.subject}
          preheader={state.doc.settings.preheader ?? ""}
          doc={state.doc}
          onSubject={(subject) => change({ subject })}
          onPreheader={(preheader) => change({ doc: { ...state.doc, settings: { ...state.doc.settings, preheader } } })}
          beforeSend={async () => {
            await saveRef.current();
            if (dirty.current) throw new Error("The draft didn't save. Try again.");
          }}
          onClose={() => setSending(false)}
          onSent={() => {
            invalidate(`email_campaigns:${ws.id}`);
            navigate("emails");
          }}
        />
      ) : null}
    </>
  );
}

// Results (Part 7): the counts, who booked or filled a form after clicking, and people per link.

type ResultPerson = { contact: string; name: string; email: string; what: string; at: string };
type ResultData = { counts: Campaign | null; booked: ResultPerson[]; filled: ResultPerson[]; links: { url: string; people: number }[] } | null;

function Results({ sb, ws, navigate, emailId }: ViewProps & { emailId: string }) {
  const r = useQuery(`email_results:${emailId}`, async () => must(await sb.rpc("email_campaign_results", { p_ws: ws.id, p_email: emailId })) as ResultData, { staleMs: 30_000 });
  const back = { label: "Campaigns", onClick: () => navigate("emails") };
  if (r.error) return <ErrorNote message={r.error} />;
  if (!r.loaded) return <Loading />;
  const d = r.data;
  const c = d?.counts;
  if (!d || !c)
    return (
      <Page title="Campaigns" back={back}>
        <ErrorNote message="This email is gone." />
      </Page>
    );
  const base = c.delivered || c.sent;
  const top = Math.max(1, ...d.links.map((l) => l.people));
  const people = (title: string, list: ResultPerson[]) => (
    <div className="flex min-w-0 flex-1 basis-[320px] flex-col rounded-lg bg-card shadow-rest">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <span className="text-[14px] font-medium text-ink">{title}</span>
        <span className="text-[12.5px] text-muted tabular-nums">{n(list.length)}</span>
      </div>
      {list.length ? (
        list.map((p, i) => (
          <div key={`${p.contact}-${i}`} className="flex items-start gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[13.5px] break-words text-ink">{p.name || p.email}</span>
              <span className="text-[12px] break-words text-muted">{p.what}</span>
            </span>
            <span className="shrink-0 text-[12px] text-muted">{timeAgo(p.at)}</span>
          </div>
        ))
      ) : (
        <p className="px-4 py-4 text-[13px] text-muted">None yet</p>
      )}
    </div>
  );
  return (
    <Page
      title={c.name}
      back={back}
      badge={
        <Badge tone={CAMPAIGN_TONE[c.status] ?? "gray"} dot>
          {CAMPAIGN_LABEL[c.status] ?? c.status}
        </Badge>
      }
    >
      <div className="flex flex-col gap-4">
        <StatCards
          cards={[
            { label: "Delivered", value: c.delivered, note: `of ${n(c.sent)} sent` },
            { label: "Opened", value: c.opened, note: pct(c.opened, base) },
            { label: "Clicked", value: c.clicked, note: pct(c.clicked, base) },
            { label: "Meetings booked", value: c.meetings, tone: c.meetings ? "sage" : undefined },
            { label: "Forms filled", value: c.forms },
            { label: "Unsubscribed", value: c.unsubscribed, note: pct(c.unsubscribed, base) },
            { label: "Bounced or marked as spam", value: c.bounced + c.complained },
            ...(c.waiting ? [{ label: "Still to send", value: c.waiting }] : []),
          ]}
        />
        <div className="flex flex-wrap gap-4">
          {people("Booked a meeting", d.booked)}
          {people("Filled a form", d.filled)}
        </div>
        {d.links.length ? (
          <div className="rounded-lg bg-card px-4 py-3 shadow-rest">
            <span className="text-[14px] font-medium text-ink">Clicks by link</span>
            <div className="mt-3 flex flex-col gap-3">
              {d.links.map((l, i) => (
                <div key={i} className="flex flex-col gap-1.5">
                  <div className="flex items-start justify-between gap-3 text-[13px]">
                    <span className="min-w-0 truncate text-text" title={l.url}>
                      {l.url.replace(/^https?:\/\//, "")}
                    </span>
                    <span className="shrink-0 text-muted tabular-nums">{n(l.people)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-signal-pale">
                    <div className="h-1.5 rounded-full bg-signal" style={{ width: `${Math.round((l.people / top) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </Page>
  );
}

// Automations -------------------------------------------------------------------------------------------------------

type Automation = { id: string; name: string; status: string; trigger_kind: string | null; emails: number; updated_at: string };
const TRIGGER_WORDS: Record<string, string> = { form: "Form submitted", meeting: "Meeting event", not_booked: "No booking after form", routed: "Lead routed", clicked: "Email clicked", list: "Joined a list" };
const WF_TONE: Record<string, Tone> = { live: "green", paused: "amber", draft: "gray" };
const WF_LABEL: Record<string, string> = { live: "Live", paused: "Paused", draft: "Draft" };

function Automations({ sb, session, ws, navigate }: ViewProps) {
  const list = useQuery(`email_automations:${ws.id}`, async () => (must(await sb.rpc("email_automations", { p_ws: ws.id })) ?? []) as Automation[]);
  const add = (
    <Button variant="ghost" onClick={() => navigate("workflows", "new")}>
      <Plus size={14} /> Start from a template
    </Button>
  );
  const ask = <Describe sb={sb} session={session} ws={ws.id} navigate={navigate} />;
  if (list.error) return <ErrorNote message={list.error} />;
  if (!list.data) return <Loading />;
  if (!list.data.length)
    return (
      <Page title="Automations">
        <ToolIntro sketch="plane" title={"Emails that send themselves\nwhen someone fills a form or books"} lead="Say what should happen. Tia builds it as a draft workflow, and nothing sends until you approve each email." action={add} />
        <div className="mx-auto -mt-6 w-full max-w-xl">{ask}</div>
      </Page>
    );
  return (
    <Page title="Automations" actions={add}>
      <div className="mb-4">{ask}</div>
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

/** Describe an automation: Tia builds a draft workflow from the words, which opens in Workflows. */
function Describe({ sb, session, ws, navigate }: Pick<ViewProps, "sb" | "session" | "navigate"> & { ws: string }) {
  const [words, setWords] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const build = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await postJson<{ name: string; body: unknown }>(session, "/api/emails/automation", { workspaceId: ws, words });
      const saved = must(await sb.rpc("workflow_save", { p_ws: ws, p_id: null, p_name: r.name, p_draft: r.body, p_revision: null })) as { id: string };
      invalidate(`email_automations:${ws}`);
      navigate("workflows", saved.id);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-card p-3 shadow-rest">
      <label htmlFor="describe-automation" className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
        <AiMark size={13} />
        Describe an automation
      </label>
      <textarea
        id="describe-automation"
        value={words}
        onChange={(e) => setWords(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && words.trim().length >= 8 && !busy) void build();
        }}
        rows={3}
        placeholder="When someone signs up for the workshop, send what to bring two days before. Stop if they book a private class."
        className="w-full resize-none rounded-md bg-card px-3 py-2 text-[13.5px] text-ink shadow-input outline-none focus:shadow-focus"
      />
      <ErrorNote message={error} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={() => void build()} disabled={busy || words.trim().length < 8}>
          {busy ? "Building…" : "Build it"}
        </Button>
      </div>
    </div>
  );
}

// Audiences ---------------------------------------------------------------------------------------------------------

type Person = { id: string; email: string; first_name: string | null; last_name: string | null; source: string; created_at: string; status: string; last_sent: string | null };
const STATUS_TONE: Record<string, Tone> = { subscribed: "green", unsubscribed: "gray", bounced: "amber", complained: "red", "no consent": "gray" };
const STATUS_LABEL: Record<string, string> = { subscribed: "Subscribed", unsubscribed: "Unsubscribed", bounced: "Bounced", complained: "Marked as spam", "no consent": "No consent" };
const SOURCE_LABEL: Record<string, string> = { form: "Form", import: "Import", manual: "Added by hand", api: "API", hubspot: "HubSpot", salesforce: "Salesforce", omniscient: "Omniscient" };

type ListRow = { id: string; name: string; members: number };

function Audiences({ sb, session, ws, role }: ViewProps) {
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(50);
  const [view, setView] = useState("everyone");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const term = q.trim();
  const listId = view === "everyone" ? null : view;
  const total = useQuery(`audience_count:${ws.id}`, async () => must(await sb.rpc("audience_count", { p_ws: ws.id })) as number);
  const lists = useQuery(`lists:${ws.id}`, async () => (must(await sb.rpc("lists_overview", { p_ws: ws.id })) ?? []) as ListRow[]);
  const people = useQuery(`audience_people:${ws.id}:${view}:${term}:${limit}`, async () => (must(await sb.rpc("audience_people", { p_ws: ws.id, p_q: term || null, p_limit: limit, p_list: listId })) ?? []) as Person[]);
  const list = (lists.data ?? []).find((l) => l.id === listId) ?? null;
  const held = useQuery(`contact_imports:${ws.id}`, async () => (must(await sb.from("contact_imports").select("id, list_id, people, created_at").eq("workspace_id", ws.id).order("created_at")) ?? []) as HeldImport[]);
  const answer = (h: HeldImport, action: "add" | "discard") =>
    run(async () => {
      await postJson(session, "/api/emails/import", { workspaceId: ws.id, importId: h.id, action });
      void held.reload();
      invalidate(`contact_import_log:${ws.id}`);
      refresh();
    });
  const refresh = () => {
    invalidate(`lists:${ws.id}`);
    invalidate(`audience_count:${ws.id}`);
    void people.reload();
    void lists.reload();
  };
  const run = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const newList = () =>
    run(async () => {
      const name = await askText("Name the list", { placeholder: "Workshop waitlist", ok: "Create" });
      if (!name?.trim()) return;
      const id = must(await sb.rpc("list_save", { p_ws: ws.id, p_id: null, p_name: name.trim() })) as string;
      refresh();
      setView(id);
      setPicked(new Set());
    });
  const rename = (l: ListRow) =>
    run(async () => {
      const name = await askText("Rename the list", { initial: l.name, ok: "Save" });
      if (!name?.trim() || name.trim() === l.name) return;
      must(await sb.rpc("list_save", { p_ws: ws.id, p_id: l.id, p_name: name.trim() }));
      refresh();
    });
  const removeList = (l: ListRow) =>
    run(async () => {
      if (!(await askConfirm(`Delete ${l.name}?`, { body: "The people stay; only the list goes.", ok: "Delete", danger: true }))) return;
      must(await sb.rpc("list_delete", { p_ws: ws.id, p_id: l.id }));
      setView("everyone");
      refresh();
    });
  const addTo = (id: string) =>
    run(async () => {
      must(await sb.rpc("list_add", { p_ws: ws.id, p_list: id, p_contacts: [...picked] }));
      setPicked(new Set());
      refresh();
    });
  const takeOut = () =>
    run(async () => {
      if (!listId) return;
      must(await sb.rpc("list_remove", { p_ws: ws.id, p_list: listId, p_contacts: [...picked] }));
      setPicked(new Set());
      refresh();
    });

  if (total.error || people.error || lists.error) return <ErrorNote message={total.error || people.error || lists.error} />;
  if (total.data === null || !people.data || !lists.data) return <Loading />;
  if (!total.data && !lists.data.length)
    return (
      <Page title="Audiences">
        <ErrorNote message={error} />
        <ToolIntro
          sketch="megaphone"
          title={"The people your emails go to\nfill in from your forms and bookings"}
          lead="Everyone who fills a form or books a meeting shows here, with whether they agreed to get email."
          action={
            <Button variant="ghost" onClick={() => void newList()}>
              <Plus size={14} /> New list
            </Button>
          }
        />
      </Page>
    );
  const name = (p: Person) => [p.first_name, p.last_name].filter(Boolean).join(" ");
  const all = people.data.length > 0 && people.data.every((p) => picked.has(p.id));
  const toggle = (id: string) => setPicked((s) => {
    const x = new Set(s);
    if (x.has(id)) x.delete(id);
    else x.add(id);
    return x;
  });
  return (
    <Page
      title="Audiences"
      count={total.data}
      actions={
        <Button variant="ghost" onClick={() => void newList()}>
          <Plus size={14} /> New list
        </Button>
      }
    >
      <ErrorNote message={error} />
      {role === "owner" && held.data?.length ? (
        <ul aria-label="Imports waiting for an owner" className="mb-3 flex flex-col gap-2">
          {held.data.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-card px-4 py-2.5 shadow-rest">
              <span className="min-w-0 flex-1 text-[13px] break-words text-ink">
                {n(h.people.length)} {h.people.length === 1 ? "person" : "people"} for {lists.data?.find((l) => l.id === h.list_id)?.name ?? "a list"}, imported without consent
              </span>
              <span className="flex flex-wrap items-center gap-1">
                <Button size="sm" variant="plain" onClick={() => void answer(h, "discard")}>
                  Discard
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void answer(h, "add")}>
                  Add them
                </Button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select<string>
          ariaLabel="Show"
          value={view}
          onChange={(v) => {
            setView(v);
            setPicked(new Set());
            setLimit(50);
          }}
          options={[{ value: "everyone", label: "Everyone", hint: `${n(total.data)} ${total.data === 1 ? "person" : "people"}` }, ...lists.data.map((l) => ({ value: l.id, label: l.name, hint: `${n(l.members)} ${l.members === 1 ? "person" : "people"}`, group: "Lists" }))]}
          menuWidth={260}
          className="h-8 min-w-[200px] rounded-full bg-card px-3.5 text-[12.5px] font-medium text-ink shadow-chip"
        />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or email" aria-label="Search people" className="h-8 w-full max-w-xs min-w-0 rounded-md bg-card px-3 text-[13px] text-ink shadow-input outline-none focus:shadow-focus" />
        <span className="flex-1" />
        {list ? (
          <span className="flex flex-wrap items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => setImporting(true)}>
              Import CSV
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void rename(list)}>
              Rename
            </Button>
            <IconButton label={`Delete ${list.name}`} onClick={() => void removeList(list)}>
              <Trash size={13} />
            </IconButton>
          </span>
        ) : null}
      </div>
      {list ? <FillsFrom key={list.id} sb={sb} ws={ws.id} list={list} /> : null}
      {picked.size ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-card px-3 py-2 shadow-rest">
          <span className="text-[13px] font-medium text-ink tabular-nums">{n(picked.size)} picked</span>
          {lists.data.filter((l) => l.id !== listId).length ? (
            <Select<string>
              ariaLabel="Add to a list"
              value=""
              placeholder="Add to a list"
              plainPlaceholder
              onChange={(id) => void addTo(id)}
              options={lists.data.filter((l) => l.id !== listId).map((l) => ({ value: l.id, label: l.name }))}
              menuWidth={220}
              className="h-7 rounded-full bg-card px-3 text-[12.5px] font-medium text-ink shadow-chip"
            />
          ) : null}
          {listId ? (
            <Button size="sm" variant="ghost" onClick={() => void takeOut()}>
              Remove from list
            </Button>
          ) : null}
          <span className="flex-1" />
          <Button size="sm" variant="plain" onClick={() => setPicked(new Set())}>
            Clear
          </Button>
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-lg bg-card shadow-rest">
        <table className="w-full min-w-[760px] border-collapse [&_tbody_tr:last-child_td]:border-b-0">
          <thead>
            <tr>
              <Th className="w-10 pl-4">
                <input type="checkbox" checked={all} aria-label="Pick everyone shown" onChange={() => setPicked(all ? new Set() : new Set(people.data!.map((p) => p.id)))} className="size-4 accent-[var(--color-signal)]" />
              </Th>
              <Th>Person</Th>
              <Th>Email status</Th>
              <Th>Came from</Th>
              <Th>Added</Th>
              <Th>Last email</Th>
            </tr>
          </thead>
          <tbody>
            {people.data.map((p) => (
              <tr key={p.id}>
                <Td className="pl-4">
                  <input type="checkbox" checked={picked.has(p.id)} aria-label={`Pick ${name(p) || p.email}`} onChange={() => toggle(p.id)} className="size-4 accent-[var(--color-signal)]" />
                </Td>
                <Td>
                  <span className="flex min-w-0 flex-col py-1">
                    {name(p) ? <span className="font-medium break-words text-ink">{name(p)}</span> : null}
                    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <span className={`${name(p) ? "text-[12px] text-muted" : "font-medium text-ink"} min-w-0 wrap-anywhere`}>{p.email}</span>
                      {isRoleAddress(p.email) ? <Badge tone="gray">Shared inbox</Badge> : null}
                    </span>
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
                <td colSpan={6} className="px-5 py-6 text-center text-[13px] text-muted">
                  {list && !term ? (
                    <Button size="sm" variant="ghost" onClick={() => setImporting(true)}>
                      Import people
                    </Button>
                  ) : (
                    "No matches"
                  )}
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
      <ImportHistory sb={sb} ws={ws.id} />
      {importing && list ? <ImportSheet session={session} ws={ws.id} list={list} onClose={() => setImporting(false)} onDone={() => (setImporting(false), refresh(), invalidate(`contact_import_log:${ws.id}`), void held.reload())} /> : null}
    </Page>
  );
}

type HeldImport = { id: string; list_id: string; people: { email: string }[]; created_at: string };

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
      <div className="flex flex-col gap-4">
        <Voice {...props} />
        <BrandSettings sb={props.sb} session={props.session} ws={props.ws} />
      </div>
    </Page>
  );
}

/** The brand's voice: the brief Tia writes every email and automation from, changed by hand. Saves on leaving the box. */
function Voice({ sb, ws }: ViewProps) {
  const kit = useQuery(`brand_voice:${ws.id}`, async () => (must(await sb.from("brand_kits").select("id, name, brief").eq("workspace_id", ws.id).order("created_at").limit(1).maybeSingle()) ?? null) as { id: string; name: string; brief: string | null } | null);
  const [text, setText] = useState<string | null>(null);
  const [state, setState] = useState<"" | "saving" | "saved">("");
  const [error, setError] = useState("");
  const k = kit.data;
  if (kit.error) return <ErrorNote message={kit.error} />;
  if (!k) return null;
  const value = text ?? k.brief ?? "";
  const save = async () => {
    if (text === null || text === (k.brief ?? "")) return;
    setState("saving");
    setError("");
    const { error: e } = await sb.rpc("brand_brief_save", { p_ws: ws.id, p_kit: k.id, p_brief: text });
    if (e) {
      setError(e.message);
      setState("");
      return;
    }
    kit.set((x) => (x ? { ...x, brief: text.trim() || null } : x));
    setText(null);
    setState("saved");
  };
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-card p-4 shadow-rest">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="brand-voice" className="flex items-center gap-1.5 text-[14px] font-medium text-ink">
          <AiMark size={13} />
          Voice
        </label>
        <span className="text-[12.5px] text-muted">{k.name}</span>
        <span className="flex-1" />
        {state ? <span className="text-[12px] text-muted">{state === "saving" ? "Saving…" : "Saved"}</span> : null}
      </div>
      <textarea
        id="brand-voice"
        value={value}
        onChange={(e) => {
          setText(e.target.value.slice(0, 2000));
          setState("");
        }}
        onBlur={() => void save()}
        rows={4}
        placeholder="Warm and calm. Short sentences. Speaks to one person by first name. No hype words."
        className="w-full resize-y rounded-md bg-card px-3 py-2 text-[13.5px] leading-relaxed text-ink shadow-input outline-none focus:shadow-focus"
      />
      <ErrorNote message={error} />
    </div>
  );
}
