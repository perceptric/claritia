"use client";

// Connecting a tool: signing in, or pasting a key, a webhook secret or a database's details.

import { useState } from "react";
import { type Entry } from "@/lib/sources/catalog";
import { Plug } from "../../Icons";
import { BrandLogo } from "../BrandLogo";
import { Badge, Button, ErrorNote, errorText, Field, Input, postJson, type ViewProps } from "../ui";
import { SidePanel } from "../records/SidePanel";

// Connecting -------------------------------------------------------------------------------------------------

export function ConnectPanel({ session, wsId, entry, onClose, onError }: { session: ViewProps["session"]; wsId: string; entry: Entry; onClose: (id?: string) => void; onError: (e: string) => void }) {
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [useKey, setUseKey] = useState(!entry.oauth && entry.kind !== "omniscient");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (body: object) => {
    setBusy(true);
    setError("");
    try {
      const r = await postJson<{ url?: string; id?: string }>(session, "/api/sources/connect", { workspaceId: wsId, kind: entry.kind, ...body });
      if (r.url) window.location.href = r.url;
      else onClose(r.id);
    } catch (e) {
      setError(errorText(e));
      onError("");
    } finally {
      setBusy(false);
    }
  };
  const signIn = entry.oauth || entry.kind === "omniscient";
  return (
    <SidePanel title={entry.label} onClose={() => onClose()} footer={null}>
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-center gap-3">
          <BrandLogo domain={entry.domain} name={entry.label} size={32} />
          <span className="text-[15px] font-medium">{entry.label}</span>
          {entry.twoWay ? <Badge>Two-way</Badge> : null}
        </div>
        <ErrorNote message={error} />
        {signIn && !useKey ? (
          <div className="flex flex-col items-start gap-3">
            <Button onClick={() => run({})} disabled={busy}>
              <Plug size={14} />
              {busy ? "Opening…" : `Connect ${entry.label}`}
            </Button>
            {entry.keys?.length ? (
              <button type="button" className="text-[12px] text-muted underline-offset-2 hover:underline" onClick={() => setUseKey(true)}>
                Use a key instead
              </button>
            ) : null}
          </div>
        ) : entry.hook ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void run({ hookSecret: secret });
            }}
          >
            {entry.hookSecret ? (
              <Field label="Signing secret">
                <Input value={secret} onChange={(e) => setSecret(e.target.value)} type="password" autoComplete="off" />
              </Field>
            ) : null}
            <div>
              <Button type="submit" disabled={busy}>
                {busy ? "Connecting…" : "Get the webhook URL"}
              </Button>
            </div>
          </form>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void run({ keys });
            }}
          >
            {(entry.keys ?? []).map((k) => (
              <Field key={k.key} label={k.label}>
                {k.multiline ? (
                  <textarea
                    value={keys[k.key] ?? ""}
                    onChange={(e) => setKeys({ ...keys, [k.key]: e.target.value })}
                    rows={5}
                    spellCheck={false}
                    autoComplete="off"
                    className="w-full rounded-md border border-line bg-panel px-2.5 py-2 font-mono text-[12px] outline-none focus:border-ink"
                  />
                ) : (
                  <Input value={keys[k.key] ?? ""} onChange={(e) => setKeys({ ...keys, [k.key]: e.target.value })} type={k.secret ? "password" : "text"} placeholder={k.placeholder} autoComplete="off" />
                )}
              </Field>
            ))}
            {entry.grant ? (
              <Field label="Read-only user">
                <pre className="overflow-x-auto border border-line bg-canvas px-3 py-2 font-mono text-[11.5px] leading-relaxed whitespace-pre text-body">{entry.grant}</pre>
              </Field>
            ) : null}
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={busy || (entry.keys ?? []).some((k) => !k.optional && !keys[k.key]?.trim())}>
                {busy ? "Checking…" : "Connect"}
              </Button>
              {signIn ? (
                <button type="button" className="text-[12px] text-muted underline-offset-2 hover:underline" onClick={() => setUseKey(false)}>
                  Sign in instead
                </button>
              ) : null}
            </div>
          </form>
        )}
      </div>
    </SidePanel>
  );
}
