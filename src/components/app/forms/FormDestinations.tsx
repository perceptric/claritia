"use client";

// Where leads go (docs/form-builder.md Part 7): every lead lands in Claritia, then goes to each tool here. Connected
// tools send through their sync (one record per person, updated on the next fill); Slack gets a message; a webhook
// gets a signed POST.

import { useState } from "react";
import { CATALOG, entryOf } from "@/lib/sources/catalog";
import { Code, Pause, Play, Plus, Trash } from "../../Icons";
import { BrandLogo } from "../BrandLogo";
import { askConfirm, askText, tell } from "../Dialogs";
import { Badge, Button, ErrorNote, errorText, must, postJson, type ViewProps } from "../ui";
import { Label, Section } from "./SettingsParts";
import { IconButton, type Destination, type SourceRow } from "./shared";

/** Tools that take new contacts from Claritia today. */
const PUSHES = new Set(CATALOG.filter((e) => e.twoWay || e.pushes).map((e) => e.kind));

const HookMark = ({ size = 22 }: { size?: number }) => (
  <span className="flex shrink-0 items-center justify-center rounded-full bg-paper-deep text-ink" style={{ width: size, height: size }}>
    <Code size={Math.round(size * 0.6)} />
  </span>
);

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
  const showSecret = async (r: { secret?: string }) => {
    if (r.secret) await tell("Signing secret", `Shown once. It signs the x-claritia-signature header.\n\n${r.secret}`);
  };
  const logo = (d: Destination) => {
    if (d.kind === "slack") return <BrandLogo domain="slack.com" name="Slack" size={22} />;
    if (d.kind === "webhook") return <HookMark />;
    const s = sources.find((x) => x.id === d.source_id);
    return <BrandLogo domain={entryOf(s?.kind ?? "")?.domain ?? ""} name={d.name} size={22} />;
  };
  const tile = "lift press flex h-12 items-center gap-3 rounded-lg border border-line bg-card px-4 text-left text-[13px] hover:border-line-strong";
  return (
    <Section id="destinations" title="Destinations" aside={<span className="text-[12.5px] text-muted tabular-nums">{list.length + 1}</span>}>
      <ErrorNote message={error} />
      <ul className="-my-1 flex flex-col divide-y divide-line">
        <li className="flex min-h-12 items-center gap-3 py-2 text-[13.5px]">
          <BrandLogo domain="tryclaritia.com" name="Claritia" size={22} />
          <span className="font-medium text-ink">Claritia contacts</span>
          <span className="ml-auto pr-1">
            <Badge tone="green">Always</Badge>
          </span>
        </li>
        {list.map((d) => (
          <li key={d.id} className="anim-rise-sm flex min-h-12 items-center gap-3 py-2 text-[13.5px]">
            {logo(d)}
            <span className="min-w-0 truncate font-medium text-ink">{d.name}</span>
            {d.config.host ? <span className="hidden truncate font-mono text-[11.5px] text-muted sm:inline">{d.config.host}</span> : null}
            <span className="ml-auto flex shrink-0 items-center gap-1">
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
                    await run(async () => showSecret(await save({ id: d.id, kind: d.kind, name: d.name, url })));
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

      <div className="flex flex-col gap-2 border-t border-line pt-5">
        <Label>Add</Label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {tools.map((s) => (
            <button key={s.id} type="button" onClick={() => run(() => save({ kind: "source", sourceId: s.id, name: s.name }))} className={tile}>
              <BrandLogo domain={entryOf(s.kind)?.domain ?? ""} name={s.name} size={22} />
              <span className="truncate font-medium">{s.name}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={async () => {
              const url = await askText("Slack webhook address", { placeholder: "https://hooks.slack.com/services/…", ok: "Add" });
              if (url) await run(() => save({ kind: "slack", name: "Slack", url }));
            }}
            className={tile}
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
                let name = "Webhook";
                try {
                  name = new URL(url).hostname || name;
                } catch {}
                await showSecret(await save({ kind: "webhook", name, url }));
              });
            }}
            className={tile}
          >
            <HookMark />
            <span className="font-medium">Webhook</span>
          </button>
        </div>
        <div>
          <Button variant="plain" size="sm" onClick={() => navigate("settings", "sources")}>
            <Plus size={14} />
            Connect a tool
          </Button>
        </div>
      </div>
    </Section>
  );
}
