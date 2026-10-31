"use client";

// Routing › Policies (docs/routing-workflow.md Sections 5 and 6): every named policy with its state, its live sources,
// where its leads go and its last real run; a new workspace sees the two starting points instead. Create policy
// names it (80 characters at most) and picks a start: "Send everything to me" (no team needed; the person is the
// default and the whole scope) or "Route by conditions". One click makes one policy, whatever the double click.

import { useRef, useState } from "react";
import { fallbackDest, destName, policyState } from "@/lib/routing/screenModel";
import { NAME_MAX, nameProblem } from "@/lib/routing/validate";
import { Plus } from "../../../Icons";
import { askConfirm } from "../../Dialogs";
import { Modal } from "../../meetings/parts";
import { MoreMenu } from "../../StatCards";
import { routingApi, type Loaded } from "../api";
import { AlertsDialog } from "../Publish";
import { Button, ErrorNote, Input, invalidate, Page, type ViewProps } from "../../ui";
import { RouteSketch } from "../screenParts";
import { toast } from "../Toast";
import { ApiError, newKey, rt, type Screen } from "./api";
import { namesOf, State, when } from "./parts";

type Start = "solo" | "conditions";

export function PoliciesList({ session, ws, navigate, screen }: ViewProps & { screen: { data: Screen | null; reload: () => void } }) {
  const d = screen.data!;
  const owner = d.role === "owner";
  const [create, setCreate] = useState<Start | null>(null);
  const [alerts, setAlerts] = useState<Loaded | null>(null);
  const names = namesOf(d.people, d.teams);
  const fresh = d.policies.length === 0;

  return (
    <Page
      title="Routing"
      flush
      badge={d.paused ? <State label="Paused" t="gray" /> : undefined}
      actions={
        owner && !fresh ? (
          <>
            {/* The workspace-wide settings the old Assignment screen held: new-lead alerts and the pause switch. */}
            <MoreMenu
              label="More"
              items={[
                { label: "Alerts", run: () => void routingApi<Loaded>(session, ws.id, "load", { slim: true }).then(setAlerts) },
                {
                  label: d.paused ? "Turn routing on" : "Pause routing",
                  run: () =>
                    void (async () => {
                      const paused = !d.paused;
                      if (paused && !(await askConfirm("Pause routing?", { body: "New leads keep the owner they come with until you turn it back on.", ok: "Pause" }))) return;
                      await routingApi(session, ws.id, "pause", { paused });
                      invalidate(`routing_screen:${ws.id}`);
                      toast({ text: paused ? "Routing paused" : "Routing is on" });
                    })(),
                },
              ]}
            />
            <Button size="sm" onClick={() => setCreate("conditions")}>
              <Plus size={13} />
              Create policy
            </Button>
          </>
        ) : null
      }
    >
      {fresh ? (
        <div className="anim-rise-sm mx-auto my-14 flex max-w-[560px] flex-col items-center gap-3 px-4 text-center">
          <RouteSketch size={120} />
          <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">Decide who receives each lead.</h2>
          <p className="text-[13.5px] text-muted">Create a policy, connect a form, and test the path before publishing.</p>
          {owner ? (
            <div className="mt-2 grid w-full grid-cols-1 gap-2.5 sm:grid-cols-2">
              <StartCard title="Send everything to me" line="Every lead goes to you. No team needed." onClick={() => setCreate("solo")} />
              <StartCard title="Route by conditions" line="Rules send leads to people or teams." onClick={() => setCreate("conditions")} />
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mx-auto w-full max-w-[1120px] px-4 py-5 md:px-6">
          <div className="overflow-x-auto rounded-[10px] border border-line bg-card">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  {["Policy", "Status", "Live sources", "Destination", "Last run", ""].map((h, i) => (
                    <th key={i} className={`border-b border-line px-4 py-2.5 text-left text-[11.5px] font-medium text-muted ${i >= 2 && i <= 4 ? "max-md:hidden" : ""}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="[&_tr:last-child_td]:border-b-0">
                {d.policies.map((p) => {
                  const st = policyState(p);
                  const body = p.draft ?? p.live;
                  const rules = body?.rules.list.length ?? 0;
                  const dest = body ? `${rules ? `${rules} ${rules === 1 ? "rule" : "rules"} · ` : ""}Everyone else → ${destName(fallbackDest(body), names)}` : "";
                  const open = () => navigate("routing", `policies/${p.id}`);
                  return (
                    <tr key={p.id} onClick={open} className="cursor-pointer hover:[&_td]:bg-paper">
                      <td className="border-b border-line px-4 py-3 font-medium text-ink">{p.draft_name ?? p.name}</td>
                      <td className="border-b border-line px-4 py-3">
                        <State label={st.label} t={st.tone} />
                      </td>
                      <td className="border-b border-line px-4 py-3 tabular-nums max-md:hidden">{p.live_sources || <span className="text-muted">Not connected</span>}</td>
                      <td className="border-b border-line px-4 py-3 text-muted max-md:hidden">{dest}</td>
                      <td className="border-b border-line px-4 py-3 text-muted max-md:hidden">{when(p.last_run)}</td>
                      <td className="w-[70px] border-b border-line px-4 py-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            open();
                          }}
                        >
                          Open
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {alerts ? <AlertsDialog session={session} ws={ws.id} label={alerts.alert.label} slack={alerts.slack ?? { ready: false, team: null }} onSaved={() => setAlerts(null)} onClose={() => setAlerts(null)} /> : null}
      {create ? (
        <CreateDialog
          start={create}
          onClose={() => setCreate(null)}
          onCreate={async (name, start, key) => {
            const out = await rt<{ id: string; created: boolean }>(session, ws.id, "rt_create", { name, start, key });
            invalidate(`routing_screen:${ws.id}`);
            setCreate(null);
            toast({ text: "Draft created" });
            navigate("routing", `policies/${out.id}`);
          }}
        />
      ) : null}
    </Page>
  );
}

function StartCard({ title, line, onClick, on }: { title: string; line: string; onClick: () => void; on?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`press flex flex-col gap-0.5 rounded-[10px] border bg-card px-4 py-3 text-left transition-colors duration-[120ms] hover:border-faint ${on ? "border-ink ring-1 ring-ink" : "border-line"}`}
    >
      <span className="text-[13px] font-medium text-ink">{title}</span>
      <span className="text-[12px] text-muted">{line}</span>
    </button>
  );
}

/**
 * Create policy (Section 6, Step A). The key is made when the dialog opens, so a double click or a retry after a lost
 * answer gets the same policy back. A refused create keeps the name and start on screen with the reason.
 */
export function CreateDialog({ start, onClose, onCreate }: { start: Start; onClose: () => void; onCreate: (name: string, start: Start, key: string) => Promise<void> }) {
  const [name, setName] = useState(start === "solo" ? "Send everything to me" : "");
  const [pick, setPick] = useState<Start>(start);
  const [error, setError] = useState("");
  const [nameErr, setNameErr] = useState("");
  const [busy, setBusy] = useState(false);
  const key = useRef(newKey("pol"));
  const submit = async () => {
    if (busy) return;
    const bad = nameProblem(name);
    if (bad) return setNameErr(bad);
    setBusy(true);
    setError("");
    try {
      await onCreate(name.trim(), pick, key.current);
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : "Couldn't create the policy.");
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Create policy"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            Create draft
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-muted">Name</span>
          <Input
            autoFocus
            value={name}
            maxLength={NAME_MAX}
            aria-invalid={!!nameErr}
            className={`h-8 ${nameErr ? "border-rose" : ""}`}
            onChange={(e) => {
              setName(e.target.value);
              if (nameErr) setNameErr("");
            }}
          />
          {nameErr ? <span className="text-[12px] text-rose">{nameErr}</span> : <span className="text-[12px] text-muted">Up to 80 characters</span>}
        </label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <StartCard title="Send everything to me" line="No team needed" on={pick === "solo"} onClick={() => setPick("solo")} />
          <StartCard title="Route by conditions" line="Rules and teams" on={pick === "conditions"} onClick={() => setPick("conditions")} />
        </div>
        <ErrorNote message={error} />
      </form>
    </Modal>
  );
}
