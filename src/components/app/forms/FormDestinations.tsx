"use client";

// The Destinations tab (docs/form-builder.md Part 7): every lead lands in Claritia, then goes to each tool here.
// Connected tools send through their sync (one record per person, updated on the next fill); Slack gets a
// message; a webhook gets a signed POST.

import { useState } from "react";
import { CATALOG, entryOf } from "@/lib/sources/catalog";
import { Code, Pause, Play, Plus, Trash } from "../../Icons";
import { BrandLogo } from "../BrandLogo";
import { askConfirm, askText, tell } from "../Dialogs";
import { Badge, Button, CardHead, ErrorNote, errorText, must, Panel, postJson, type ViewProps } from "../ui";
import { IconButton, type Destination, type SourceRow } from "./shared";

/** Tools that take new contacts from Claritia today. */
const PUSHES = new Set(CATALOG.filter((e) => e.twoWay).map((e) => e.kind));

export function FormDestinations({
  sb,
  session,
  ws,
  formId,
  list,
  sources,
  reload,
  navigate,
}: Pick<ViewProps, "sb" | "session" | "ws" | "navigate"> & { formId: string; list: Destination[]; sources: SourceRow[]; reload: () => void }) {
  const [error, setError] = useState("");
  const used = new Set(list.map((d) => d.source_id).filter(Boolean));
  const tools = sources.filter((s) => s.status !== "disconnected" && PUSHES.has(s.kind) && !used.has(s.id));
  const run = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
      reload();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const save = (body: object) => postJson<{ id: string; secret?: string }>(session, "/api/forms/destination", { workspaceId: ws.id, formId, ...body });
  const logo = (d: Destination) => {
    if (d.kind === "slack") return <BrandLogo domain="slack.com" name="Slack" size={22} />;
    if (d.kind === "webhook")
      return (
        <span className="flex size-[22px] items-center justify-center border border-line bg-canvas text-ink">
          <Code size={13} />
        </span>
      );
    const s = sources.find((x) => x.id === d.source_id);
    return <BrandLogo domain={entryOf(s?.kind ?? "")?.domain ?? ""} name={d.name} size={22} />;
  };
  return (
    <div className="flex flex-col gap-5">
      <ErrorNote message={error} />
      <Panel>
        <CardHead label="Leads go to" count={list.length + 1} />
        <ul className="divide-y divide-line">
          <li className="flex items-center gap-3 px-4 py-3 text-[13px]">
            <BrandLogo domain="tryclaritia.com" name="Claritia" size={22} />
            <span className="font-medium">Claritia contacts</span>
            <span className="ml-auto">
              <Badge tone="green">Always</Badge>
            </span>
          </li>
          {list.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-3 text-[13px]">
              {logo(d)}
              <span className="font-medium">{d.name}</span>
              {d.config.host ? <span className="truncate font-mono text-[11px] text-faint">{d.config.host}</span> : null}
              <span className="ml-auto flex items-center gap-1">
                {d.paused ? <Badge tone="amber">Paused</Badge> : <Badge tone="green">On</Badge>}
                <IconButton label={d.paused ? "Turn on" : "Pause"} onClick={() => run(async () => must(await sb.rpc("form_destination_pause", { p_id: d.id, p_paused: !d.paused })))}>
                  {d.paused ? <Play size={14} /> : <Pause size={14} />}
                </IconButton>
                {d.kind !== "source" ? (
                  <IconButton
                    label="Change address"
                    onClick={async () => {
                      const url = await askText(d.kind === "slack" ? "Slack webhook address" : "Webhook address", { placeholder: "https://", ok: "Save" });
                      if (!url) return;
                      await run(async () => {
                        const r = await save({ id: d.id, kind: d.kind, name: d.name, url });
                        if (r.secret) await tell("Signing secret", `Shown once. It signs the x-claritia-signature header.\n\n${r.secret}`);
                      });
                    }}
                  >
                    <Code size={14} />
                  </IconButton>
                ) : null}
                <IconButton
                  label="Remove"
                  danger
                  onClick={async () => {
                    if (!(await askConfirm(`Stop sending leads to ${d.name}?`, { ok: "Remove", danger: true }))) return;
                    await run(async () => must(await sb.rpc("form_destination_delete", { p_id: d.id })));
                  }}
                >
                  <Trash size={14} />
                </IconButton>
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <section className="flex flex-col gap-2">
        <h3 className="label-mono">Add</h3>
        <div className="grid grid-cols-2 border-t border-l border-line sm:grid-cols-3">
          {tools.map((s) => (
            <button key={s.id} type="button" onClick={() => run(() => save({ kind: "source", sourceId: s.id, name: s.name }))} className="flex items-center gap-3 border-r border-b border-line bg-panel px-4 py-3.5 text-left text-[13px] hover:bg-hover">
              <BrandLogo domain={entryOf(s.kind)?.domain ?? ""} name={s.name} size={22} />
              <span className="font-medium">{s.name}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={async () => {
              const url = await askText("Slack webhook address", { placeholder: "https://hooks.slack.com/services/…", ok: "Add" });
              if (url) await run(() => save({ kind: "slack", name: "Slack", url }));
            }}
            className="flex items-center gap-3 border-r border-b border-line bg-panel px-4 py-3.5 text-left text-[13px] hover:bg-hover"
          >
            <BrandLogo domain="slack.com" name="Slack" size={22} />
            <span className="font-medium">Slack</span>
          </button>
          <button
            type="button"
            onClick={async () => {
              const url = await askText("Webhook address", { placeholder: "https://", ok: "Add" });
              if (!url) return;
              await run(async () => {
                const r = await save({ kind: "webhook", name: new URL(url).hostname, url });
                if (r.secret) await tell("Signing secret", `Shown once. It signs the x-claritia-signature header.\n\n${r.secret}`);
              });
            }}
            className="flex items-center gap-3 border-r border-b border-line bg-panel px-4 py-3.5 text-left text-[13px] hover:bg-hover"
          >
            <span className="flex size-[22px] items-center justify-center border border-line bg-canvas text-ink">
              <Code size={13} />
            </span>
            <span className="font-medium">Webhook</span>
          </button>
        </div>
        <div>
          <Button variant="plain" onClick={() => navigate("settings", "sources")}>
            <Plus size={14} />
            Connect a tool
          </Button>
        </div>
      </section>
    </div>
  );
}
