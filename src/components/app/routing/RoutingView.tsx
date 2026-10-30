"use client";

// Inbound › Routing: one sidebar item, the title "Routing" and three tabs.
//   Assignment  who gets each new lead: Round robin or rules, Safeguards, Action required, Routing preview and Test a
//               lead; Live or "Unsaved changes" and Save (save and publish in one step) (/routing)
//   Sales reps  the people who take leads: calendar, hours, status, capacity, backup (/routing/reps), with the
//               availability editor (/routing/reps/availability)
//   History     every lead and where it went (/routing/history, /routing/history/<run>, /routing/history/review)
// One past version opens read-only (/routing/versions/<n>) and the flowchart at /routing/flow. The working state
// lives here, so moving between the tabs keeps what's on screen; leaving Routing with unsaved changes asks first.

import { useEffect, useMemo, useRef, useState } from "react";
import { repsPage, routingPage, ROUTING_TABS } from "@/lib/nav";
import { askConfirm } from "../Dialogs";
import { usePeople } from "../meetings/parts";
import { AvailabilityPage } from "../scheduling/AvailabilityPage";
import { Sheet } from "../Sheet";
import { MoreMenu } from "../StatCards";
import { Badge, Button, ErrorNote, errorText, Loading, Page, Section, setLeaveGuard, type ViewProps } from "../ui";
import { Plus } from "../../Icons";
import { routingApi } from "./api";
import { AssignmentTab } from "./Assignment";
import { issuesOf, rulesByRep, viewOf } from "./assignModel";
import { RouterEditor } from "./Editor";
import { flowCounts, type Selection } from "./editorModel";
import { HistoryTab } from "./History";
import { Inspector } from "./Inspector";
import { AlertsDialog } from "./Publish";
import { inviteRep, SalesReps, useRepsData } from "./SalesReps";
import { SetupDialog } from "./SetupDialog";
import { ToastHost, toast } from "./Toast";
import { useAssignment } from "./useAssignment";
import { VersionsDrawer, VersionView } from "./Versions";

export function RoutingView(props: ViewProps) {
  const { sb, session, ws, role, navigate, id } = props;
  const page = routingPage(id);
  const owner = role === "owner";
  const a = useAssignment(session, ws.id);
  const people = usePeople(sb, ws.id);
  const reps = useRepsData(sb, ws.id);
  const [more, setMore] = useState<Selection | "safeguards" | null>(null);
  const [versions, setVersions] = useState(false);
  const [alerts, setAlerts] = useState(false);
  const [setup, setSetup] = useState<boolean | null>(null);
  const [lists, setLists] = useState<{ allow: string[]; block: string[] } | null>(null);

  // The first visit to a workspace that never made routing live opens the setup by itself, once.
  const data = a.data;
  if (data && setup === null && owner && !data.live && !data.versions?.length) setSetup(true);

  // Moving between Routing's own tabs keeps the work on screen; leaving Routing asks when there's something unsaved.
  const inside = useRef(false);
  const dirty = a.dirty && !!data;
  useEffect(() => {
    if (!dirty || !owner) return;
    inside.current = false;
    setLeaveGuard(async () => {
      if (inside.current) {
        inside.current = false;
        return true;
      }
      return askConfirm("Leave without saving?", { ok: "Leave", danger: true });
    });
    const before = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", before);
    return () => {
      setLeaveGuard(null);
      window.removeEventListener("beforeunload", before);
    };
  }, [dirty, owner]);
  /** Navigate, with moves inside Routing keeping the work on screen without asking. */
  const navigateIn: ViewProps["navigate"] = (to, toId, query) => {
    if (to === "routing" && dirty) inside.current = true;
    navigate(to, toId, query);
  };
  const go = (tab: string) => navigateIn("routing", tab);
  const shared = { ...props, navigate: navigateIn };

  // Back from the flowchart (it saves its own draft): read the routing again.
  const onFlow = page.sub === "flow";
  const wasFlow = useRef(onFlow);
  const { load } = a;
  useEffect(() => {
    if (wasFlow.current && !onFlow) void load();
    wasFlow.current = onFlow;
  }, [onFlow, load]);

  const view = useMemo(() => viewOf(a.body, a.fields), [a.body, a.fields]);
  const name = (u: string) => people.data?.byId.get(u)?.name ?? "Former teammate";
  const issues = reps.data && data ? issuesOf(view, { calendar: (u) => reps.data!.calendar.has(u), name }) : [];

  const pause = async (paused: boolean) => {
    if (paused && !(await askConfirm("Pause routing?", { body: "New leads keep the owner they come with until you turn it back on.", ok: "Pause" }))) return;
    try {
      await routingApi(session, ws.id, "pause", { paused });
      await a.load({ keep: true });
    } catch (e) {
      a.setSaveError(errorText(e));
    }
  };
  const onLists = (l: { allow: string[]; block: string[] }) => {
    setLists(l);
    routingApi(session, ws.id, "lists", l).catch((e) => a.setSaveError(errorText(e)));
  };

  const badge = !data ? null : a.dirty ? (
    <Badge tone="amber" dot>
      {data.live ? "Unsaved changes" : "Not live"}
    </Badge>
  ) : data.paused ? (
    <Badge dot>Paused</Badge>
  ) : (
    <Badge tone="green" dot>
      Live
    </Badge>
  );
  const menu = (
    <MoreMenu
      label="More"
      items={[
        owner && a.canUndo ? { label: "Undo", run: a.undo } : null,
        owner && a.canRedo ? { label: "Redo", run: a.redo } : null,
        owner && a.dirty && data?.live ? { label: "Discard changes", run: a.discard } : null,
        { label: "History of versions", run: () => setVersions(true) },
        owner ? { label: "Reach out within", run: () => setMore({ kind: "sla" }) } : null,
        owner ? { label: data?.alert.label ? `Alerts: ${data.alert.label}` : "Alerts", run: () => setAlerts(true) } : null,
        owner && data?.live ? { label: data.paused ? "Turn routing on" : "Pause routing", run: () => void pause(!data.paused) } : null,
        // The flowchart edits the saved draft on its own, so unsaved work here asks first.
        { label: "Flowchart", run: () => navigate("routing", "flow") },
        owner ? { label: "First-time setup", run: () => setSetup(true) } : null,
      ]}
    />
  );
  const actions =
    page.page === "" && page.sub !== "flow" && page.version === null ? (
      <>
        {badge}
        {menu}
        {owner ? (
          <Button size="sm" disabled={!a.dirty || a.saving || !data} onClick={() => void a.save().then((ok) => ok && toast({ text: "Saved. Routing is live." }))}>
            Save
          </Button>
        ) : null}
      </>
    ) : page.page === "reps" && page.sub === "" && owner ? (
      <Button size="sm" onClick={() => void inviteRep(sb, ws.id).catch((e) => a.setSaveError(errorText(e)))}>
        <Plus size={13} />
        Invite rep
      </Button>
    ) : null;

  const content = (() => {
    if (page.page === "reps") {
      const r = repsPage(page.sub);
      if (r.page === "availability") return null;
      return <SalesReps {...shared} assigned={rulesByRep(view)} />;
    }
    if (page.page === "history") return null;
    if (!data) return a.loadError ? null : <Loading />;
    return <AssignmentTab {...shared} a={a} go={go} onMore={setMore} />;
  })();

  // Pages with their own title row: the availability editor, History (its run panel), a past version, the flowchart.
  if (page.page === "reps" && repsPage(page.sub).page === "availability")
    return <AvailabilityPage {...shared} tab={repsPage(page.sub).sub} back={{ label: "Sales reps", onClick: () => go("reps") }} />;
  if (page.version !== null)
    return (
      <Page title={`Version ${page.version}`} back={{ label: "Routing", onClick: () => go("") }} flush>
        {data ? <VersionView sb={sb} session={session} ws={ws} role={role} navigate={navigateIn} version={page.version} data={data} onRolledBack={() => void a.load()} /> : <Loading />}
        <ToastHost />
      </Page>
    );
  if (page.sub === "flow" && page.page === "")
    return (
      <Page title="Flowchart" back={{ label: "Routing", onClick: () => go("") }} flush>
        {data ? <RouterEditor sb={sb} session={session} ws={ws} role={role} navigate={navigate} data={data} refresh={async () => void (await a.load())} layout="flow" /> : <Loading />}
        <ToastHost />
      </Page>
    );

  const nav = {
    title: "Routing",
    tabs: ROUTING_TABS.map((t) => ({ ...t, ...(t.value === "" && issues.length ? { dot: "Action required" } : {}), ...(t.value === "reps" && people.data ? { count: people.data.list.length } : {}) })),
    current: page.page,
    onPick: (t: string) => go(t),
  };
  const sheet =
    more && data ? (
      <Sheet title={more === "safeguards" ? "Safeguards" : "Settings"} onClose={() => setMore(null)}>
        {(more === "safeguards" ? ([{ kind: "spam" }, { kind: "account" }, { kind: "keep" }, { kind: "sla" }, { kind: "rules" }] as Selection[]) : [more]).map((s, i) => (
          <Inspector
            key={i}
            sel={s}
            body={a.body}
            edit={a.edit}
            readOnly={!owner}
            members={data.members}
            fields={a.fields}
            forms={data.forms}
            meetings={data.meetings ?? []}
            counts={data.stats ? flowCounts(data.stats, a.body) : null}
            problems={a.problems}
            lists={lists ?? data.lists}
            onLists={owner ? onLists : undefined}
            onSelect={(x) => setMore(x)}
          />
        ))}
      </Sheet>
    ) : null;

  return (
    <Section nav={nav}>
      {page.page === "history" ? (
        <HistoryTab sb={sb} session={session} ws={ws} role={role} navigate={navigateIn} sub={page.sub} />
      ) : (
        <Page title="Routing" actions={actions} flush>
          {a.conflict ? (
            <div role="status" className="flex flex-wrap items-center gap-3 border-b border-line bg-butter-wash px-4 py-2.5 text-[13px] text-ink md:px-6">
              <span className="flex-1">Someone else changed the routing.</span>
              <Button size="sm" onClick={() => void a.loadTheirs()}>
                Load theirs
              </Button>
            </div>
          ) : null}
          {a.saveError || a.loadError ? (
            <div className="mx-auto flex w-full max-w-[1120px] items-center gap-2 px-4 pt-4 md:px-6">
              <div className="flex-1">
                <ErrorNote message={a.saveError || a.loadError} />
              </div>
              {a.loadError && !data ? (
                <Button variant="ghost" size="sm" onClick={() => void a.load()}>
                  Try again
                </Button>
              ) : (
                <Button variant="plain" size="sm" onClick={() => a.setSaveError("")}>
                  Dismiss
                </Button>
              )}
            </div>
          ) : null}
          {content}
        </Page>
      )}
      {sheet}
      {versions && data ? <VersionsDrawer data={data} current={null} onClose={() => setVersions(false)} onOpen={(n) => (setVersions(false), go(`versions/${n}`))} /> : null}
      {alerts && data ? <AlertsDialog session={session} ws={ws.id} label={data.alert.label} slack={data.slack ?? { ready: false, team: null }} onSaved={() => void a.load({ keep: true })} onClose={() => setAlerts(false)} /> : null}
      {setup && data ? <SetupDialog sb={sb} session={session} ws={ws} a={a} onClose={() => setSetup(false)} /> : null}
      <ToastHost />
    </Section>
  );
}
