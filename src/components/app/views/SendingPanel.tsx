"use client";

// Settings › Sending (docs/conversion-weeks.md week 9): sending domains with their DNS records, the rules every
// marketing email follows, topics, and a test send.

import { useEffect, useState } from "react";
import { askConfirm } from "../Dialogs";
import { Select } from "../Select";
import { Badge, Button, CardHead, ErrorNote, errorText, Field, Input, Loading, must, Panel, Td, Th, timeAgo, useLoad, type Tone, type ViewProps } from "../ui";
import { BLOCK_LABELS, type BlockReason } from "@/lib/email/guard";
import { recordsFor, type RecordState } from "@/lib/email/records";

type Domain = {
  id: string;
  domain: string;
  mail_from: string;
  region: string | null;
  status: "pending" | "waiting" | "verified" | "failed";
  dkim_tokens: string[];
  checks: Partial<Record<string, RecordState>>;
  error: string | null;
  checked_at: string | null;
};
type Settings = {
  cap_count: number;
  cap_days: number;
  quiet_start: number;
  quiet_end: number;
  timezone: string;
  footer_address: string | null;
  paused: boolean;
  paused_reason: string | null;
  paused_at: string | null;
};
type Recent = {
  id: string;
  kind: "marketing" | "test";
  to_email: string;
  subject: string | null;
  status: "queued" | "sending" | "sent" | "blocked" | "failed" | "unknown";
  blocked_reason: BlockReason | null;
  error: string | null;
  queued_at: string;
  delivered_at: string | null;
  bounced: "hard" | "soft" | null;
  complained_at: string | null;
  unsubscribed_at: string | null;
  clicks: number;
};
type Overview = {
  settings: Settings;
  domains: Domain[];
  topics: { id: string; name: string }[];
  stats: Record<"sent" | "delivered" | "bounced" | "complained" | "clicked" | "unsubscribed" | "blocked", number>;
  recent: Recent[];
  members: string[];
};
type Props = Pick<ViewProps, "sb" | "ws" | "role">;

const DOMAIN_TAG: Record<Domain["status"], [string, Tone]> = {
  pending: ["Setting up", "gray"],
  waiting: ["Waiting", "amber"],
  verified: ["Verified", "green"],
  failed: ["Failed", "red"],
};
const RECORD_TAG: Record<RecordState, [string, Tone]> = { verified: ["Verified", "green"], waiting: ["Waiting", "amber"], wrong: ["Wrong", "red"] };
const selectClass = "h-9 w-full rounded-md border border-line bg-panel px-2.5 text-[13px] hover:border-line-strong";
const HOURS = Array.from({ length: 24 }, (_, h) => ({ value: h, label: `${String(h).padStart(2, "0")}:00` }));

export function SendingPanel({ sb, ws, role }: Props) {
  const data = useLoad(async () => must(await sb.rpc("sending_overview", { p_ws: ws.id })) as Overview, ws.id);
  const owner = role === "owner";
  const settling = data.data?.domains.some((d) => d.status === "pending" || d.status === "waiting") || data.data?.recent.some((m) => m.status === "queued" || m.status === "sending");
  const { reload } = data;
  useEffect(() => {
    if (!settling) return;
    const t = setInterval(reload, 15_000);
    return () => clearInterval(t);
  }, [settling, reload]);

  if (!data.data) return data.error ? <ErrorNote message={data.error} /> : <Loading />;
  const o = data.data;
  return (
    <div className="flex flex-col gap-4">
      {o.settings.paused ? <Paused sb={sb} ws={ws} owner={owner} settings={o.settings} onDone={reload} /> : null}
      <Domains sb={sb} ws={ws} owner={owner} domains={o.domains} onChange={reload} />
      <Rules key={JSON.stringify(o.settings)} sb={sb} ws={ws} owner={owner} saved={o.settings} onSaved={reload} />
      <Topics sb={sb} ws={ws} owner={owner} topics={o.topics} onChange={reload} />
      <TestSend sb={sb} ws={ws} overview={o} onSent={reload} />
    </div>
  );
}

function Paused({ sb, ws, owner, settings, onDone }: Pick<Props, "sb" | "ws"> & { owner: boolean; settings: Settings; onDone: () => void }) {
  const [error, setError] = useState("");
  const resume = async () => {
    if (!(await askConfirm("Resume sending?", { body: settings.paused_reason ?? undefined, ok: "Resume" }))) return;
    try {
      must(await sb.rpc("sending_resume", { p_ws: ws.id }));
      onDone();
    } catch (e) {
      setError(errorText(e));
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-3 border border-red-200 bg-danger-soft px-4 py-3">
      <Badge tone="red">Paused</Badge>
      <span className="text-[13px] text-ink">{settings.paused_reason}</span>
      {owner ? (
        <Button variant="ghost" className="ml-auto h-7 px-2.5" onClick={resume}>
          Resume
        </Button>
      ) : null}
      <ErrorNote message={error} />
    </div>
  );
}

function Domains({ sb, ws, owner, domains, onChange }: Pick<Props, "sb" | "ws"> & { owner: boolean; domains: Domain[]; onChange: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError("");
    try {
      must(await sb.rpc("sending_domain_add", { p_ws: ws.id, p_domain: name }));
      setName("");
      onChange();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel>
      <CardHead label="Sending domains" count={domains.length} />
      {owner ? (
        <form
          className="flex gap-2 border-b border-line p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="mail.acme.com" aria-label="Domain" />
          <Button type="submit" disabled={busy || !name.trim()}>
            {busy ? "Adding…" : "Add domain"}
          </Button>
        </form>
      ) : null}
      {error ? (
        <div className="p-4 pb-0">
          <ErrorNote message={error} />
        </div>
      ) : null}
      {domains.map((d) => (
        <DomainCard key={d.id} sb={sb} owner={owner} d={d} onChange={onChange} />
      ))}
    </Panel>
  );
}

function DomainCard({ sb, owner, d, onChange }: Pick<Props, "sb"> & { owner: boolean; d: Domain; onChange: () => void }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const act = async (what: "check" | "remove") => {
    if (what === "remove" && !(await askConfirm(`Remove ${d.domain}?`, { body: "Email from this domain stops at once.", ok: "Remove", danger: true }))) return;
    setBusy(what);
    setError("");
    try {
      must(await sb.rpc(what === "check" ? "sending_domain_check_now" : "sending_domain_remove", { p_id: d.id }));
      onChange();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy("");
    }
  };
  const [label, tone] = DOMAIN_TAG[d.status];
  const records = d.status === "pending" && d.dkim_tokens.length === 0 ? [] : recordsFor(d);
  return (
    <div className="border-b border-line last:border-b-0">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <span className="text-[14px] font-medium">{d.domain}</span>
        <Badge tone={tone}>{label}</Badge>
        {d.checked_at ? <span className="font-mono text-[11px] text-faint">{timeAgo(d.checked_at)}</span> : null}
        <span className="ml-auto flex gap-1.5">
          <Button variant="ghost" className="h-7 px-2.5" onClick={() => act("check")} disabled={!!busy}>
            {busy === "check" ? "Checking…" : "Check now"}
          </Button>
          {owner ? (
            <Button variant="danger" className="h-7 px-2.5" onClick={() => act("remove")} disabled={!!busy}>
              Remove
            </Button>
          ) : null}
        </span>
      </div>
      {d.error || error ? (
        <div className="px-4 pb-3">
          <ErrorNote message={error || d.error || ""} />
        </div>
      ) : null}
      {records.length ? (
        <div className="overflow-x-auto">
          <table className="w-full border-t border-line">
            <thead>
              <tr>
                <Th>Type</Th>
                <Th>Name</Th>
                <Th>Value</Th>
                <Th>State</Th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => {
                const state = d.checks[r.key] ?? "waiting";
                const [l, t] = RECORD_TAG[state];
                return (
                  <tr key={r.key}>
                    <Td className="font-mono text-[12px]">{r.type}</Td>
                    <Td>
                      <CopyText text={r.name} />
                    </Td>
                    <Td>
                      <CopyText text={r.value} />
                    </Td>
                    <Td>
                      <Badge tone={t}>{l}</Badge>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function CopyText({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      title={text}
      className="block max-w-[230px] truncate rounded-md px-1 text-left font-mono text-[12px] hover:bg-hover"
      onClick={() =>
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        })
      }
    >
      {done ? "Copied" : text}
    </button>
  );
}

function Rules({ sb, ws, owner, saved, onSaved }: Pick<Props, "sb" | "ws"> & { owner: boolean; saved: Settings; onSaved: () => void }) {
  const [v, setV] = useState({ ...saved, cap_count: String(saved.cap_count), cap_days: String(saved.cap_days), footer_address: saved.footer_address ?? "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof typeof v>(k: K, value: (typeof v)[K]) => setV((x) => ({ ...x, [k]: value }));
  const save = async () => {
    const count = Number(v.cap_count);
    const days = Number(v.cap_days);
    if (!Number.isInteger(count) || count < 0 || count > 50) return setError("Emails per contact: 0 to 50");
    if (!Number.isInteger(days) || days < 1 || days > 90) return setError("Days: 1 to 90");
    setBusy(true);
    setError("");
    try {
      must(
        await sb.rpc("send_settings_save", {
          p_ws: ws.id,
          p_values: { cap_count: count, cap_days: days, quiet_start: v.quiet_start, quiet_end: v.quiet_end, timezone: v.timezone.trim(), footer_address: v.footer_address },
        }),
      );
      onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel>
      <CardHead label="Rules" />
      <div className="grid gap-4 p-4 sm:grid-cols-2">
        <Field label="Emails per contact">
          <Input type="number" min={0} max={50} value={v.cap_count} onChange={(e) => set("cap_count", e.target.value)} disabled={!owner} />
        </Field>
        <Field label="In days">
          <Input type="number" min={1} max={90} value={v.cap_days} onChange={(e) => set("cap_days", e.target.value)} disabled={!owner} />
        </Field>
        <Field label="Quiet from">
          <Select value={v.quiet_start} options={HOURS} onChange={(h) => set("quiet_start", h)} disabled={!owner} ariaLabel="Quiet from" className={selectClass} />
        </Field>
        <Field label="Quiet until">
          <Select value={v.quiet_end} options={HOURS} onChange={(h) => set("quiet_end", h)} disabled={!owner} ariaLabel="Quiet until" className={selectClass} />
        </Field>
        <Field label="Default time zone">
          <Input value={v.timezone} onChange={(e) => set("timezone", e.target.value)} placeholder="America/New_York" disabled={!owner} />
        </Field>
        <Field label="Footer address">
          <Input value={v.footer_address} onChange={(e) => set("footer_address", e.target.value)} placeholder="1 Main St, Springfield, IL 62701, USA" disabled={!owner} />
        </Field>
      </div>
      {error || owner ? (
        <div className="flex flex-col gap-3 px-4 pb-4">
          <ErrorNote message={error} />
          {owner ? (
            <div>
              <Button onClick={save} disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}

function Topics({ sb, ws, owner, topics, onChange }: Pick<Props, "sb" | "ws"> & { owner: boolean; topics: Overview["topics"]; onChange: () => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const run = async (fn: () => PromiseLike<{ data: unknown; error: { message: string } | null }>) => {
    setError("");
    try {
      must(await fn());
      onChange();
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    }
  };
  return (
    <Panel>
      <CardHead label="Topics" count={topics.length} />
      <div className="flex flex-col gap-3 p-4">
        {topics.length ? (
          <div className="flex flex-wrap gap-2">
            {topics.map((t) => (
              <span key={t.id} className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-line px-2 text-[13px]">
                {t.name}
                {owner ? (
                  <button
                    type="button"
                    aria-label={`Remove ${t.name}`}
                    className="text-faint hover:text-danger"
                    onClick={async () => {
                      if (await askConfirm(`Remove ${t.name}?`, { ok: "Remove", danger: true })) await run(() => sb.rpc("topic_remove", { p_id: t.id }));
                    }}
                  >
                    ×
                  </button>
                ) : null}
              </span>
            ))}
          </div>
        ) : null}
        {owner ? (
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (name.trim() && (await run(() => sb.rpc("topic_add", { p_ws: ws.id, p_name: name })))) setName("");
            }}
          >
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Product news" aria-label="Topic" />
            <Button type="submit" variant="ghost" disabled={!name.trim()}>
              Add topic
            </Button>
          </form>
        ) : null}
        <ErrorNote message={error} />
      </div>
    </Panel>
  );
}

function messageTag(m: Recent): [string, Tone] {
  if (m.complained_at) return ["Complaint", "red"];
  if (m.bounced) return [m.bounced === "hard" ? "Bounced" : "Soft bounce", m.bounced === "hard" ? "red" : "amber"];
  if (m.unsubscribed_at) return ["Unsubscribed", "gray"];
  if (m.status === "blocked") return [m.blocked_reason ? BLOCK_LABELS[m.blocked_reason] : "Blocked", "amber"];
  if (m.status === "failed") return ["Failed", "red"];
  if (m.status === "unknown") return ["Unknown", "amber"];
  if (m.delivered_at) return [m.clicks ? "Clicked" : "Delivered", "green"];
  if (m.status === "sent") return ["Sent", "green"];
  if (m.status === "sending") return ["Sending", "brand"];
  return ["Queued", "gray"];
}

function TestSend({ sb, ws, overview, onSent }: Pick<Props, "sb" | "ws"> & { overview: Overview; onSent: () => void }) {
  const verified = overview.domains.filter((d) => d.status === "verified");
  const [local, setLocal] = useState("hello");
  const [domain, setDomain] = useState(verified[0]?.domain ?? "");
  const [to, setTo] = useState(overview.members[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pick = domain || verified[0]?.domain || "";
  const send = async () => {
    setBusy(true);
    setError("");
    try {
      must(await sb.rpc("email_send_test", { p_ws: ws.id, p_from: `${local.trim()}@${pick}`, p_from_name: ws.name, p_to: to, p_subject: "Test from Claritia", p_html: "" }));
      onSent();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const s = overview.stats;
  return (
    <Panel>
      <CardHead label="Test send" />
      <div className="flex flex-col gap-3 p-4">
        {verified.length ? (
          <div className="flex flex-wrap items-end gap-2">
            <Field label="From">
              <div className="flex h-9 items-center gap-1">
                <Input value={local} onChange={(e) => setLocal(e.target.value)} className="w-32" aria-label="From name" />
                <span className="text-muted">@</span>
                {verified.length > 1 ? (
                  <Select value={pick} options={verified.map((d) => ({ value: d.domain, label: d.domain }))} onChange={setDomain} className={`${selectClass} w-56`} ariaLabel="From domain" />
                ) : (
                  <span className="font-mono text-[12.5px]">{pick}</span>
                )}
              </div>
            </Field>
            <Field label="To">
              <Select value={to} options={overview.members.map((m) => ({ value: m, label: m }))} onChange={setTo} className={`${selectClass} w-64`} ariaLabel="To" />
            </Field>
            <Button onClick={send} disabled={busy || !local.trim() || !to}>
              {busy ? "Sending…" : "Send test"}
            </Button>
          </div>
        ) : (
          <p className="text-[13px] text-muted">Verify a domain to send.</p>
        )}
        <ErrorNote message={error} />
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-line px-4 py-3 font-mono text-[11.5px] text-muted tabular-nums">
        <span className="text-faint">7 days</span>
        <span>Sent {s.sent}</span>
        <span>Delivered {s.delivered}</span>
        <span>Bounced {s.bounced}</span>
        <span>Complaints {s.complained}</span>
        <span>Clicks {s.clicked}</span>
        <span>Unsubscribed {s.unsubscribed}</span>
        <span>Blocked {s.blocked}</span>
      </div>
      {overview.recent.length ? (
        <div className="overflow-x-auto">
          <table className="w-full border-t border-line">
            <thead>
              <tr>
                <Th>To</Th>
                <Th>Subject</Th>
                <Th>State</Th>
                <Th>When</Th>
              </tr>
            </thead>
            <tbody>
              {overview.recent.map((m) => {
                const [l, t] = messageTag(m);
                return (
                  <tr key={m.id} title={m.error ?? undefined}>
                    <Td>{m.to_email}</Td>
                    <Td className="max-w-[280px] truncate">{m.subject}</Td>
                    <Td>
                      <Badge tone={t}>{l}</Badge>
                    </Td>
                    <Td className="font-mono text-[11.5px] text-muted">{timeAgo(m.queued_at)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </Panel>
  );
}
