"use client";

// New email (docs/email-studio-plan.md Part 8): the person says what it's about and Tia writes the whole email in the
// brand (compose_email in src/lib/design/email/chat.ts). Start blank skips Tia.

import { useState } from "react";
import { AiMark } from "../../Ai";
import { Button, ErrorNote } from "../../ui";

export function ComposeDialog({ busy, error, onWrite, onBlank, onClose }: { busy: boolean; error: string | null; onWrite: (about: string) => void; onBlank: () => void; onClose: () => void }) {
  const [about, setAbout] = useState("");
  const close = () => !busy && onClose();
  return (
    <div className="anim-fade fixed inset-0 z-[90] flex flex-wrap items-start justify-center bg-scrim px-4 pt-[15vh]" onMouseDown={close} onKeyDown={(e) => e.key === "Escape" && close()}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label="New email"
        className="anim-rise-sm w-full max-w-lg overflow-hidden rounded-2xl bg-card shadow-float"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (about.trim() && !busy) onWrite(about.trim());
        }}
      >
        <div className="space-y-3 p-6">
          <h2 className="flex items-center gap-2 text-[20px] leading-tight font-semibold tracking-[-0.02em]">
            <AiMark size={18} working={busy} />
            New email
          </h2>
          <textarea
            autoFocus
            value={about}
            disabled={busy}
            onChange={(e) => setAbout(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && about.trim() && !busy) onWrite(about.trim());
            }}
            placeholder="What's it about? Who's it for, and where should the button go?"
            rows={4}
            maxLength={2000}
            aria-label="What the email is about"
            className="w-full resize-none rounded-md bg-card px-3 py-2 text-[14px] leading-relaxed shadow-input outline-none disabled:opacity-60"
          />
          <ErrorNote message={error ?? ""} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 px-6 pb-5">
          <Button type="button" variant="plain" disabled={busy} onClick={onBlank}>
            Start blank
          </Button>
          <div className="flex min-w-0 flex-wrap justify-end gap-2">
            <Button type="button" variant="plain" disabled={busy} onClick={close}>
              Cancel
            </Button>
            <Button type="submit" busy={busy} disabled={!about.trim()}>
              {busy ? "Tia is writing…" : "Write it"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
