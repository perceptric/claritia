"use client";

// Calendar › Webhooks (docs/scheduling-plan.md Part 5): addresses that get a signed POST for each meeting change,
// each with its events, its last sends and Send again. Owners add, pause, test, roll the secret and delete.

import { useState } from "react";
import { EVENT_LABEL, type WebhookEvent } from "@/lib/meetings/webhookEvents";
import { ChevronRight, Plug, Plus } from "../../Icons";
import { askConfirm } from "../Dialogs";
import { MoreMenu } from "../StatCards";
import { ToolIntro } from "../ToolIntro";
import { Badge, Button, Empty, ErrorNote, errorText, Input, Loading, Page, Toggle, useLoad, type Tone, type ViewProps } from "../ui";
import { CopyButton, meetingsApi, Modal } from "../meetings/parts";

type Endpoint = {
  id: string;
  host: string;
  secret_hint: string;
  events: WebhookEvent[];
  description: string | null;
  active: boolean;
  last_ok_at: string | null;
  last_fail_at: string | null;
  last_error: string | null;
  sent: number;
  failed: number;
};
type Send = {
  id: string;
  event: WebhookEvent;
  status: "pending" | "retrying" | "done" | "failed";
  attempts: number;
  code: number | null;
  error: string | null;
  test: boolean;
  created_at: string;
  body: unknown;
};
type List = { owner: boolean; endpoints: Endpoint[]; events: WebhookEvent[] };

const SEND_STATE: Record<Send["status"], { label: string; tone: Tone }> = {
  pending: { label: "Waiting", tone: "gray" },
  retrying: { label: "Retrying", tone: "amber" },
  done: { label: "Sent", tone: "green" },
  failed: { label: "Failed", tone: "red" },
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

function state(e: Endpoint): { label: string; tone: Tone } {
  if (!e.active) return { label: "Paused", tone: "gray" };
  if (e.last_fail_at && (!e.last_ok_at || e.last_fail_at > e.last_ok_at)) return { label: "Failing", tone: "red" };
  return { label: "Active", tone: "green" };
}

export function WebhooksPage({ session, ws }: ViewProps) {
  const api = <T,>(action: string, body: object = {}) => meetingsApi<T>(session, ws.id, "webhooks", { action, ...body });
  const data = useLoad(() => api<List>("list"), ws.id);
  const [editing, setEditing] = useState<Endpoint | "new" | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState<{
    id: string;
    text: string;
    ok: boolean;
  } | null>(null);

  const act = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const d = data.data;
  const add = (
    <Button onClick={() => setEditing("new")}>
      <Plus size={14} />
      Add endpoint
    </Button>
  );
  const dialogs = (
    <>
      {editing ? (
        <EndpointDialog
          endpoint={editing === "new" ? null : editing}
          events={d?.events ?? []}
          onClose={() => setEditing(null)}
          onSave={async (endpoint) => {
            if (editing === "new") {
              const r = await api<{ secret: string }>("add", { endpoint });
              setSecret(r.secret);
            } else await api("change", { id: editing.id, endpoint });
            setEditing(null);
            data.reload();
          }}
        />
      ) : null}
      {secret ? <SecretDialog secret={secret} onClose={() => setSecret(null)} /> : null}
    </>
  );

  if (!d)
    return (
      <Page title="Webhooks">
        <ErrorNote message={data.error} />
        {data.error ? null : <Loading />}
      </Page>
    );
  if (!d.owner)
    return (
      <Page title="Webhooks">
        <Empty icon={<Plug size={18} />} title="No access">
          A workspace owner can set up webhooks.
        </Empty>
      </Page>
    );
  if (!d.endpoints.length)
    return (
      <Page title="Webhooks" actions={add}>
        {dialogs}
        <ToolIntro
          sketch="signpost"
          title={"Send each meeting\nto your other tools"}
          lead="Claritia posts to your address when a meeting is booked, rescheduled, canceled, held or missed. Each post is signed, and failed posts are tried again."
          action={add}
        />
      </Page>
    );

  return (
    <Page title="Webhooks" actions={d.endpoints.length < 10 ? add : undefined}>
      {dialogs}
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-3">
        <ErrorNote message={error} />
        {d.endpoints.map((e, i) => {
          const st = state(e);
          return (
            <section key={e.id} className="anim-rise-sm rounded-[10px] border border-line bg-card" style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
              <div className="flex items-center gap-3 px-4 py-3">
                <button type="button" onClick={() => setOpen(open === e.id ? null : e.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-expanded={open === e.id}>
                  <ChevronRight size={14} className={`shrink-0 text-faint transition-transform duration-[180ms] ${open === e.id ? "rotate-90" : ""}`} />
                  <span className="flex min-w-0 flex-col">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-mono text-[13px] text-ink">{e.host}</span>
                      <Badge tone={st.tone} dot>
                        {st.label}
                      </Badge>
                    </span>
                    <span className="truncate text-[12.5px] text-muted">
                      {[e.description, e.events.map((x) => EVENT_LABEL[x]).join(", "), `${e.sent} sent`, e.failed ? `${e.failed} failed` : null].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </button>
                {note?.id === e.id ? <span className={`shrink-0 text-[12px] ${note.ok ? "text-signal-text" : "text-danger"}`}>{note.text}</span> : null}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    void act(async () => {
                      setNote(null);
                      const r = await api<{
                        status: string;
                        code: number | null;
                        error: string | null;
                      }>("test", { id: e.id, event: e.events[0] });
                      setNote({
                        id: e.id,
                        ok: r.status === "done",
                        text: r.status === "done" ? `Sent, ${r.code}` : (r.error ?? "Failed"),
                      });
                      data.reload();
                    })
                  }
                >
                  Send test
                </Button>
                <MoreMenu
                  items={[
                    { label: "Edit", run: () => setEditing(e) },
                    {
                      label: e.active ? "Pause" : "Resume",
                      run: () =>
                        void act(
                          async () => (
                            await api("change", {
                              id: e.id,
                              endpoint: { active: !e.active },
                            }),
                            data.reload()
                          ),
                        ),
                    },
                    {
                      label: "Roll secret",
                      run: () =>
                        void act(async () => {
                          if (
                            !(await askConfirm("Roll the signing secret?", {
                              body: "The current secret stops working now.",
                              ok: "Roll secret",
                            }))
                          )
                            return;
                          setSecret(
                            (
                              await api<{ secret: string }>("roll", {
                                id: e.id,
                              })
                            ).secret,
                          );
                          data.reload();
                        }),
                    },
                    {
                      label: "Delete",
                      danger: true,
                      run: () =>
                        void act(async () => {
                          if (
                            !(await askConfirm(`Delete ${e.host}?`, {
                              body: "It stops getting meeting changes. Its sends are removed.",
                              ok: "Delete",
                              danger: true,
                            }))
                          )
                            return;
                          await api("delete", { id: e.id });
                          data.reload();
                        }),
                    },
                  ]}
                />
              </div>
              {e.last_error && st.label === "Failing" ? <p className="border-t border-line px-4 py-2 text-[12.5px] text-danger">{e.last_error}</p> : null}
              {open === e.id ? (
                <Sends key={`${e.id}:${e.sent}:${e.failed}`} load={() => api<{ sends: Send[] }>("sends", { id: e.id })} resend={(send) => api("resend", { send })} hint={e.secret_hint} />
              ) : null}
            </section>
          );
        })}
      </div>
    </Page>
  );
}

/** One endpoint's last sends, newest first; a send opens to its body. */
function Sends({ load, resend, hint }: { load: () => Promise<{ sends: Send[] }>; resend: (id: string) => Promise<unknown>; hint: string }) {
  const data = useLoad(load, "sends");
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState("");
  return (
    <div className="anim-rise-sm border-t border-line">
      <div className="flex items-center justify-between px-4 py-2 text-[12px] text-muted">
        <span>Last 50 sends</span>
        <span className="font-mono">whsec_…{hint}</span>
      </div>
      <ErrorNote message={error || data.error} />
      {!data.data ? (
        <div className="px-4 pb-3">
          <Loading />
        </div>
      ) : !data.data.sends.length ? (
        <p className="px-4 pb-4 text-[13px] text-muted">No sends yet</p>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {data.data.sends.map((s) => (
            <li key={s.id}>
              <div className="flex items-center gap-3 px-4 py-2">
                <button type="button" onClick={() => setOpen(open === s.id ? null : s.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left text-[13px]">
                  <span className="w-36 shrink-0 truncate font-mono text-[12px] text-ink">{s.event}</span>
                  <Badge tone={SEND_STATE[s.status].tone}>{SEND_STATE[s.status].label}</Badge>
                  {s.test ? <Badge>Test</Badge> : null}
                  <span className="truncate text-muted">{s.code ? `${s.code}` : (s.error ?? "")}</span>
                </button>
                <span className="shrink-0 text-[12px] text-faint tabular-nums">{when(s.created_at)}</span>
                <span className="flex w-24 shrink-0 justify-end">
                  {!s.test && (s.status === "failed" || s.status === "done") ? (
                    <Button
                      variant="plain"
                      size="sm"
                      onClick={async () => {
                        setError("");
                        try {
                          await resend(s.id);
                          data.reload();
                        } catch (e) {
                          setError(errorText(e));
                        }
                      }}
                    >
                      Send again
                    </Button>
                  ) : null}
                </span>
              </div>
              {open === s.id ? (
                <div className="flex flex-col gap-2 px-4 pb-3">
                  {s.error ? <p className="text-[12.5px] text-danger">{s.error}</p> : null}
                  <pre className="max-h-72 overflow-auto rounded-sm bg-paper-deep p-3 font-mono text-[11.5px] leading-relaxed text-body">{JSON.stringify(s.body, null, 2)}</pre>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EndpointDialog({
  endpoint,
  events,
  onClose,
  onSave,
}: {
  endpoint: Endpoint | null;
  events: WebhookEvent[];
  onClose: () => void;
  onSave: (e: { url?: string; events: WebhookEvent[]; description: string }) => Promise<void>;
}) {
  const [url, setUrl] = useState("");
  const [picked, setPicked] = useState<WebhookEvent[]>(endpoint?.events ?? events);
  const [description, setDescription] = useState(endpoint?.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ready = (endpoint || /^https:\/\/\S+$/.test(url.trim())) && picked.length > 0;
  return (
    <Modal
      title={endpoint ? "Edit endpoint" : "Add endpoint"}
      onClose={onClose}
      footer={
        <>
          <Button variant="plain" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!ready || busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await onSave({
                  ...(url.trim() ? { url: url.trim() } : {}),
                  events: picked,
                  description,
                });
              } catch (e) {
                setError(errorText(e));
                setBusy(false);
              }
            }}
          >
            {endpoint ? "Save" : "Add endpoint"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <ErrorNote message={error} />
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-muted">Address</span>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={endpoint ? `https://${endpoint.host}/…` : "https://"} autoFocus />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-muted">Name</span>
          <Input value={description} maxLength={120} onChange={(e) => setDescription(e.target.value)} placeholder="Zapier" />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-muted">Events</span>
          <ul className="divide-y divide-line rounded-sm border border-line">
            {events.map((ev) => (
              <li key={ev} className="flex items-center gap-3 px-3 py-2">
                <span className="flex-1 text-[13px] text-ink">{EVENT_LABEL[ev]}</span>
                <span className="font-mono text-[11.5px] text-faint">{ev}</span>
                <Toggle label={EVENT_LABEL[ev]} on={picked.includes(ev)} onChange={(on) => setPicked(on ? events.filter((x) => x === ev || picked.includes(x)) : picked.filter((x) => x !== ev))} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Modal>
  );
}

/** The signing secret, shown once. */
function SecretDialog({ secret, onClose }: { secret: string; onClose: () => void }) {
  return (
    <Modal title="Signing secret" onClose={onClose} footer={<Button onClick={onClose}>Done</Button>}>
      <div className="flex flex-col gap-3">
        <p className="text-[13px] text-body">Copy it now. It isn&apos;t shown again.</p>
        <div className="flex items-center gap-2 rounded-sm border border-line-strong bg-paper-deep px-3 py-2">
          <code className="min-w-0 flex-1 break-all font-mono text-[12px] text-ink">{secret}</code>
          <CopyButton text={secret} label="Copy secret" size={13} />
        </div>
      </div>
    </Modal>
  );
}
