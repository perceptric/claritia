"use client";

// The email builder's AI tab (docs/design-system.md Part 7.2): say what to change, and the AI changes the email
// through checked steps, in the brand's variables and classes. Its question, if it asks one, comes with choices.
// "3 versions" gets three different takes to pick from. Each change is one undo step and a saved version.

import type { Session } from "@supabase/supabase-js";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { compileEmail } from "@/lib/design/email/compile";
import type { EmailDoc } from "@/lib/design/email/doc";
import type { DesignSystem } from "@/lib/design/model";
import type { Tokens } from "@/lib/forms/brand";
import { X } from "../../Icons";
import { AiAvatar, AiMark, AiTag } from "../Ai";
import { Button, ErrorNote, IconButton, errorText, postJson } from "../ui";

export type AiOut = { doc: EmailDoc; system: DesignSystem | null; subject: string; reply: string; lines: string[]; ask: { question: string; choices: string[] } | null };
type Line = { role: "user" | "assistant"; text: string; lines?: string[] };

export function AiPanel({
  session,
  workspaceId,
  versionRef,
  doc,
  subject,
  system,
  tokens,
  onResult,
}: {
  session: Session;
  workspaceId: string;
  versionRef?: string;
  doc: () => EmailDoc;
  subject: string;
  system: DesignSystem;
  tokens: Partial<Tokens>;
  onResult: (r: AiOut) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"" | "one" | "three">("");
  const [log, setLog] = useState<Line[]>([]);
  const [ask, setAsk] = useState<{ question: string; choices: string[] } | null>(null);
  const [error, setError] = useState("");
  const [variants, setVariants] = useState<AiOut[] | null>(null);
  const history = log.slice(-10).map((l) => ({ role: l.role, text: l.text }));

  const shot = useRef<HTMLInputElement>(null);
  const send = async (message: string, o: { confirmed?: boolean; three?: boolean; image?: string } = {}) => {
    const m = message.trim();
    if (!m || busy) return;
    setBusy(o.three ? "three" : "one");
    setError("");
    setAsk(null);
    try {
      const body = { workspaceId, ref: versionRef, doc: doc(), subject, message: m, history, confirmed: !!o.confirmed, ...(o.three ? { variants: 3 } : {}), ...(o.image ? { image: o.image } : {}) };
      if (o.three) {
        const r = await postJson<{ variants: AiOut[] }>(session, "/api/email/chat", body);
        setVariants(r.variants);
        setLog((l) => [...l, { role: "user", text: m }]);
      } else {
        const r = await postJson<AiOut>(session, "/api/email/chat", body);
        if (r.lines.length) onResult(r);
        setLog((l) => [...l, { role: "user", text: m }, { role: "assistant", text: r.reply, lines: r.lines }]);
        setAsk(r.ask);
      }
      setText("");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-1 flex-col gap-3 px-3 py-3">
        {log.map((l, i) =>
          l.role === "user" ? (
            <p key={i} className="self-end rounded-2xl bg-paper-deep px-3 py-2 text-[12.5px] text-ink">
              {l.text}
            </p>
          ) : (
            <div key={i} className="flex gap-2">
              <AiAvatar size={24} />
              <div className="flex min-w-0 flex-col gap-1">
                {l.text ? <p className="text-[12.5px] leading-snug text-ink">{l.text}</p> : null}
                {l.lines?.length ? (
                  <ul className="flex flex-col gap-0.5">
                    {l.lines.map((x, j) => (
                      <li key={j} className="flex items-center gap-1.5 text-[12px] text-muted">
                        <AiTag />
                        {x}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          ),
        )}
        {busy ? (
          <div className="flex items-center gap-2">
            <AiAvatar size={24} working />
            <span className="text-[12.5px] text-muted">{busy === "three" ? "Making three versions" : "Working"}</span>
          </div>
        ) : null}
        {ask ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-[12.5px] font-medium text-ink">{ask.question}</p>
            <div className="flex flex-wrap gap-1.5">
              {ask.choices.map((c) => (
                <button key={c} type="button" onClick={() => void send(c, { confirmed: true })} className="press h-7 rounded-full border border-line-strong px-3 text-[12px] text-ink hover:border-ink">
                  {c}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {error ? <ErrorNote message={error} /> : null}
      </div>
      <form
        className="sticky bottom-0 flex flex-col gap-2 border-t border-line bg-card px-3 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void send(text);
            }
          }}
          rows={3}
          aria-label="What to change"
          placeholder="Make the intro shorter and add a booking button"
          className="w-full resize-none rounded-sm border border-line-strong bg-card px-2 py-1.5 text-[12.5px] text-ink outline-none placeholder:text-faint focus:border-ink focus:ring-1 focus:ring-ink"
        />
        <div className="flex items-center gap-1.5">
          <Button type="submit" disabled={!!busy || !text.trim()}>
            <AiMark size={13} />
            Change
          </Button>
          <Button type="button" variant="ghost" disabled={!!busy || !text.trim()} onClick={() => void send(text, { three: true })}>
            3 versions
          </Button>
          <input
            ref={shot}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              if (f.size > 5 * 1024 * 1024) return setError("Use a picture up to 5 MB.");
              const bytes = new Uint8Array(await f.arrayBuffer());
              let bin = "";
              for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
              void send(text.trim() || "Build this email from the screenshot.", { image: btoa(bin) });
            }}
          />
          <Button type="button" variant="ghost" disabled={!!busy} onClick={() => shot.current?.click()}>
            From a picture
          </Button>
        </div>
      </form>
      {variants ? (
        <Variants
          variants={variants}
          system={system}
          tokens={tokens}
          onPick={(v) => {
            onResult(v);
            setLog((l) => [...l, { role: "assistant", text: v.reply, lines: v.lines }]);
            setVariants(null);
          }}
          onClose={() => setVariants(null)}
        />
      ) : null}
    </div>
  );
}

/** Three takes side by side; one goes into the email. */
function Variants({ variants, system, tokens, onPick, onClose }: { variants: AiOut[]; system: DesignSystem; tokens: Partial<Tokens>; onPick: (v: AiOut) => void; onClose: () => void }) {
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Three versions" className="anim-fade fixed inset-0 z-[95] flex flex-col bg-paper-deep">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-card px-4">
        <AiMark size={14} />
        <span className="text-[13px] font-semibold tracking-[-0.01em] text-ink">Three versions</span>
        <span className="flex-1" />
        <IconButton label="Close" onClick={onClose}>
          <X size={15} />
        </IconButton>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-3 gap-4 overflow-auto p-4">
        {variants.map((v, i) => {
          let html = "";
          try {
            html = compileEmail(v.system ?? system, v.doc, { tokens }).html;
          } catch {
            html = "";
          }
          return (
            <div key={i} className="flex min-h-0 flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="flex-1 truncate text-[12.5px] font-medium text-ink">{v.subject || `Version ${i + 1}`}</span>
                <Button onClick={() => onPick(v)}>Use this</Button>
              </div>
              <iframe title={`Version ${i + 1}`} srcDoc={html} sandbox="" className="min-h-[560px] w-full flex-1 rounded-lg border border-line bg-card" />
            </div>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}
