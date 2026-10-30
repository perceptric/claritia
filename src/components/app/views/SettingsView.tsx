"use client";

import { useState } from "react";
import { Key, LogOut, Plus, Settings } from "../../Icons";
import { APP_URL } from "@/lib/site";
import { askConfirm, askText } from "../Dialogs";
import { AccountAlertsPanel } from "./AccountAlertsPanel";
import { IdentityPanel } from "./IdentityPanel";
import { LeadScoringPanel } from "./LeadScoringPanel";
import { SendingSettings } from "./SendingSettings";
import { IcpPanel, SitesPanel } from "./SitesPanel";
import { SETTINGS_GROUPS, settingsTab, type SettingsTab } from "@/lib/settingsTabs";
import { TeamPanel } from "./TeamSettings";
import { MyCalendar } from "../meetings/MyCalendar";
import { Payments } from "../meetings/Payments";
import { TeamCalendars } from "../meetings/TeamCalendars";
import { FieldsSettings, ObjectsSettings } from "./FieldsSettings";
import { ImportsSettings } from "./ImportsSettings";
import { SourcesSettings, SyncLog } from "./SourcesSettings";
import { Avatar, Badge, Button, CardHead, ErrorNote, errorText, Loading, must, Page, Panel, postJson, timeAgo, useQuery, type ViewProps } from "../ui";
import { CopyButton } from "../CopyButton";

/** A label, a line to copy, and the shared copy button. */
function CopyRow({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="label-mono w-24 shrink-0">{label}</span>
      <code className="min-w-0 flex-1 truncate rounded-sm border border-line bg-paper px-2.5 py-1.5 font-mono text-[12.5px]">{text}</code>
      <CopyButton text={text} label="Copy" />
    </div>
  );
}

type ApiKey = { id: string; name: string; prefix: string; created_at: string; last_used_at: string | null };

/** The workspace's API keys, for the REST API and the CLI. A new key shows once. */
function KeysPanel({ sb, session, ws }: Pick<ViewProps, "sb" | "session" | "ws">) {
  const keys = useQuery(`api_keys:${ws.id}`, async () => must(await sb.from("api_keys").select("id, name, prefix, created_at, last_used_at").eq("workspace_id", ws.id).is("revoked_at", null).order("created_at")) as ApiKey[]);
  const [fresh, setFresh] = useState<{ name: string; key: string } | null>(null);
  const [error, setError] = useState("");
  const act = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <Panel>
      <CardHead label="API keys" count={keys.data?.length}>
        <Button
          variant="plain"
          className="h-7 px-2"
          onClick={() =>
            act(async () => {
              const name = await askText("Key name", { placeholder: "GitHub Actions", ok: "Create key" });
              if (!name) return;
              const { key } = await postJson<{ key: string }>(session, "/api/keys", { workspaceId: ws.id, name });
              setFresh({ name, key });
              keys.reload();
            })
          }
        >
          <Plus size={13} />
          New key
        </Button>
      </CardHead>
      {fresh ? (
        <div className="anim-rise-sm flex flex-col gap-2 border-b border-line px-5 py-4">
          <span className="text-[13px] font-medium">Copy {fresh.name} now. It won&apos;t show again.</span>
          <CopyRow label="Key" text={fresh.key} />
          <CopyRow label="Claude Code" text={`claude mcp add --transport http claritia ${APP_URL}/api/mcp --header "Authorization: Bearer ${fresh.key}"`} />
          <div>
            <Button variant="plain" onClick={() => setFresh(null)}>
              Done
            </Button>
          </div>
        </div>
      ) : null}
      {keys.error ? (
        <div className="p-4">
          <ErrorNote message={keys.error} />
        </div>
      ) : !keys.data ? (
        <Loading />
      ) : keys.data.length ? (
        <ul className="divide-y divide-line">
          {keys.data.map((k) => (
            <li key={k.id} className="flex items-center gap-3 px-5 py-3.5">
              <Key size={13} />
              <span className="min-w-0 truncate text-[13.5px] font-medium">{k.name}</span>
              <span className="font-mono text-[12px] text-faint">{k.prefix}…</span>
              <span className="ml-auto hidden text-[12px] text-muted sm:inline">{k.last_used_at ? `Used ${timeAgo(k.last_used_at)}` : "Never used"}</span>
              <Button
                variant="plain"
                className="h-7 px-2"
                onClick={() =>
                  act(async () => {
                    if (!(await askConfirm(`Revoke ${k.name}?`, { body: "Anything using this key stops working.", ok: "Revoke key", danger: true }))) return;
                    await keys.mutate((l) => l.filter((x) => x.id !== k.id), async () => must(await sb.rpc("revoke_api_key", { p_key: k.id })));
                  })
                }
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <div className="px-5 pb-4">
          <ErrorNote message={error} />
        </div>
      ) : null}
    </Panel>
  );
}

export function SettingsView({ sb, session, ws, role, navigate, id, onWorkspace }: ViewProps) {
  const [error, setError] = useState("");
  const [tab, setTab] = useState<SettingsTab>(() => settingsTab(id || (typeof window === "undefined" ? "" : window.location.hash.slice(1))));
  const members = useQuery(`workspace_members:${ws.id}`, async () => must(await sb.from("workspace_members").select("user_id, role, created_at").eq("workspace_id", ws.id).order("created_at")) as { user_id: string; role: string }[]);

  const act = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const pages: Record<SettingsTab, React.ReactNode> = {
    fields: <FieldsSettings sb={sb} ws={ws} role={role} />,
    objects: <ObjectsSettings sb={sb} ws={ws} role={role} navigate={navigate} />,
    sources: <SourcesSettings sb={sb} session={session} ws={ws} role={role} />,
    imports: <ImportsSettings sb={sb} ws={ws} />,
    sync_log: <SyncLog sb={sb} ws={ws} navigate={navigate} />,
    sending: <SendingSettings sb={sb} session={session} ws={ws} role={role} />,
    sites: <SitesPanel sb={sb} ws={ws} role={role} />,
    identity: <IdentityPanel sb={sb} session={session} ws={ws} role={role} />,
    icp: <IcpPanel sb={sb} ws={ws} />,
    lead_scoring: <LeadScoringPanel sb={sb} session={session} ws={ws} role={role} />,
    account_alerts: <AccountAlertsPanel sb={sb} session={session} ws={ws} />,
    team: <TeamPanel sb={sb} ws={ws} role={role} session={session} />,
    calendars: <TeamCalendars sb={sb} ws={ws} role={role} session={session} />,
    calendar: <MyCalendar sb={sb} ws={ws} session={session} />,
    payments: <Payments sb={sb} ws={ws} role={role} session={session} />,
    workspace: (
        <Panel>
          <CardHead label="Workspace" count={members.data ? `${members.data.length} ${members.data.length === 1 ? "member" : "members"}` : undefined}>
            {role === "owner" ? (
              <Button
                variant="plain"
                className="h-7 px-2"
                onClick={() =>
                  act(async () => {
                    const name = await askText("Workspace name", { initial: ws.name });
                    if (!name || name === ws.name) return;
                    // The new name shows at once (sidebar and here); it goes back if the save fails.
                    const was = ws.name;
                    onWorkspace?.({ name });
                    try {
                      must(await sb.from("workspaces").update({ name }).eq("id", ws.id));
                    } catch (e) {
                      onWorkspace?.({ name: was });
                      throw e;
                    }
                    if (!onWorkspace) window.location.reload();
                  })
                }
              >
                Rename
              </Button>
            ) : null}
          </CardHead>
          <div className="flex items-center gap-2 px-5 py-4">
            <span className="text-[15px] font-medium">{ws.name}</span>
            <Badge>{role}</Badge>
          </div>
        </Panel>
    ),
    keys: <KeysPanel sb={sb} session={session} ws={ws} />,
    profile: (
        <Panel>
          <CardHead label="Account" />
          <div className="flex items-center gap-3 px-5 py-4">
            <Avatar label={session.user.email ?? "?"} size={28} />
            <span className="min-w-0 flex-1 truncate text-[13.5px]">{session.user.email}</span>
            <Button variant="ghost" onClick={() => sb.auth.signOut()}>
              <LogOut size={13} />
              Sign out
            </Button>
          </div>
        </Panel>
    ),
  };
  const groups = SETTINGS_GROUPS;
  const tabs = groups.flatMap((g) => g.tabs);
  const current = tabs.find((t) => t.id === tab) ?? tabs[0];
  const pick = (t: SettingsTab) => {
    setTab(t);
    try {
      history.replaceState(null, "", `/settings/${t}`);
    } catch {}
  };

  return (
    <Page icon={<Settings size={14} />} title="Settings" flush>
      <div className="min-h-full bg-paper p-5 md:p-7">
        <div className="mx-auto flex max-w-5xl flex-col gap-6 md:flex-row md:gap-10">
          <nav className="flex shrink-0 flex-col gap-4 md:sticky md:top-0 md:w-48 md:self-start" aria-label="Settings">
            {groups.map((g) => (
              <div key={g.label} className="flex flex-col gap-0.5">
                <span className="label-mono px-3 pb-1">{g.label}</span>
                {g.tabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    aria-current={current.id === t.id ? "page" : undefined}
                    onClick={() => pick(t.id)}
                    className={`flex h-8 items-center rounded-full px-3 text-left text-[13px] font-medium transition-colors duration-[140ms] ${current.id === t.id ? "bg-ink text-paper" : "text-body hover:bg-hover hover:text-ink"}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            ))}
          </nav>
          <div className="flex min-w-0 flex-1 flex-col gap-5">
            <ErrorNote message={error} />
            {pages[current.id]}
          </div>
        </div>
      </div>
    </Page>
  );
}
