"use client";

// The one copy button (docs/unify-plan.md 2.2): round, with Copy as its tooltip, and a check for a moment once copied.

import { useState } from "react";
import { Check, Copy } from "../Icons";
import { IconButton } from "./ui";

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** A round copy button that turns into a check for a moment. `get` may fetch what to copy. */
export function CopyButton({ text, get, label = "Copy link", size = 14, onError }: { text?: string; get?: () => Promise<string>; label?: string; size?: number; onError?: (m: string) => void }) {
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <IconButton
      label={done ? "Copied" : label}
      disabled={busy}
      onClick={async (e) => {
        e.stopPropagation();
        setBusy(true);
        try {
          const t = text ?? (get ? await get() : "");
          if (t && (await copyText(t))) {
            setDone(true);
            setTimeout(() => setDone(false), 1400);
          }
        } catch (err) {
          onError?.(err instanceof Error ? err.message : String(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      {done ? <Check size={size} className="anim-pop text-sage" /> : <Copy size={size} />}
    </IconButton>
  );
}
