"use client";

// Book with the rep routing assigns, from inside the form (docs/form-builder.md 4.4): every live routing rule, plus
// leads kept with their rep and everyone else, to tick; and a box that writes a new rule through the routing chat.
// A new rule lands in the routing draft; Make live publishes it, and it's ticked here at once.

import Link from "next/link";
import { useState } from "react";
import { FALLBACK, OWNED } from "@/lib/forms/schedule";
import { BASE_FIELDS, ruleWords } from "@/lib/router/conditions";
import type { RouterBody } from "@/lib/router/types";
import { AiMark } from "../Ai";
import { Button, ErrorNote, errorText, postJson, type ViewProps } from "../ui";
import { useLiveBody } from "../routing/screenParts";

type ChatOut = { reply: string; lines: string[]; changed: boolean };

export function RoutePicker({ sb, session, ws, picked, set }: Pick<ViewProps, "sb" | "session" | "ws"> & { picked: string[]; set: (ids: string[]) => void }) {
  const live = useLiveBody(sb, ws.id);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [made, setMade] = useState<ChatOut | null>(null);
  const body = live.data?.body;
  const rows = [
    ...(body?.rules.list ?? []).map((r) => ({ id: r.id, name: r.name, text: r.conds.length ? ruleWords(r, BASE_FIELDS, body!.territories) : "No conditions yet" })),
    { id: OWNED, name: "Existing owner", text: "Leads kept with the rep they or their company already have" },
    { id: FALLBACK, name: "Fallback", text: "Leads no rule matched" },
  ];
  const toggle = (id: string) => set(picked.includes(id) ? picked.filter((x) => x !== id) : rows.map((r) => r.id).filter((x) => x === id || picked.includes(x)));
  const api = <T,>(action: string, extra: object) => postJson<T>(session, "/api/routing", { workspaceId: ws.id, action, ...extra });

  const write = async () => {
    const m = text.trim();
    if (!m || busy) return;
    setBusy("chat");
    setError("");
    try {
      setMade(await api<ChatOut>("chat", { message: m, revision: null }));
      setText("");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy("");
    }
  };
  const makeLive = async () => {
    setBusy("live");
    setError("");
    try {
      const before = new Set((body?.rules.list ?? []).map((r) => r.id));
      await api("publish", { note: "From a form" });
      const r = (await sb.from("routers").select("live_version").eq("workspace_id", ws.id).maybeSingle()).data as { live_version: number | null } | null;
      const v = r?.live_version ? ((await sb.from("router_versions").select("body").eq("workspace_id", ws.id).eq("version", r.live_version).maybeSingle()).data as { body: RouterBody } | null) : null;
      live.reload();
      const fresh = (v?.body.rules.list ?? []).map((x) => x.id).filter((id) => !before.has(id));
      if (fresh.length) set([...new Set([...picked, ...fresh])]);
      setMade(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <ErrorNote message={live.error || error} />
      {rows.map((r) => (
        <label key={r.id} className="flex cursor-pointer items-start gap-2.5 rounded-sm px-1.5 py-1.5 hover:bg-hover">
          <input type="checkbox" checked={picked.includes(r.id)} onChange={() => toggle(r.id)} className="mt-0.5 size-4 accent-ink" />
          <span className="flex min-w-0 flex-col">
            <span className="text-[13px] font-medium text-ink">{r.name}</span>
            <span className="text-[12px] text-muted">{r.text}</span>
          </span>
        </label>
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void write();
        }}
        className="mt-1.5 flex items-center gap-2 rounded-sm border border-line-strong bg-card py-1 pr-1 pl-2.5 focus-within:border-ink"
      >
        <AiMark size={14} />
        <input aria-label="New routing rule" value={text} onChange={(e) => setText(e.target.value)} placeholder="New rule, for example: companies over 500 people go to Sam" className="h-8 min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-faint" />
        <Button size="sm" type="submit" disabled={!text.trim() || !!busy}>
          {busy === "chat" ? "Writing…" : "Add rule"}
        </Button>
      </form>
      {made ? (
        <div className="anim-rise-sm mt-1.5 flex flex-col gap-2 rounded-sm bg-paper-deep px-3 py-2.5 text-[12.5px]">
          <p className="text-ink">{made.reply}</p>
          {made.lines.length ? (
            <ul className="flex flex-col gap-0.5 text-muted">
              {made.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          ) : null}
          {made.changed ? (
            <span>
              <Button size="sm" onClick={() => void makeLive()} disabled={!!busy}>
                {busy === "live" ? "Making live…" : "Make live"}
              </Button>
            </span>
          ) : null}
        </div>
      ) : null}
      <Link href="/routing" className="mt-1 self-start text-[12.5px] font-medium text-ink underline decoration-line-strong underline-offset-[3px] hover:decoration-ink">
        Go to Routing rules
      </Link>
    </div>
  );
}
