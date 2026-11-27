"use client";

// The one copy button (docs/unify-plan.md 2.2): round, with Copy as its tooltip, and a check for a moment once copied.

import { useState } from "react";
import { Check, Copy } from "../Icons";
import { IconButton } from "./ui";
import { errorText } from "@/lib/attempt";
import { toast } from "./Toaster";

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * A round copy button that turns into a check for a moment. `get` may fetch what to copy. A copy that fails goes to
 * `onError`, else to a toast (none shows on a page without the app's toast host).
 */
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
        const fail = (m: string) => (onError ? onError(m) : toast({ text: m, tone: "error" }));
        try {
          const t = text ?? (get ? await get() : "");
          if (t && (await copyText(t))) {
            setDone(true);
            setTimeout(() => setDone(false), 1400);
          } else if (t) fail("Couldn't copy. Select it and copy it yourself.");
        } catch (err) {
          fail(errorText(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      {done ? <Check size={size} className="anim-pop text-sage" /> : <Copy size={size} />}
    </IconButton>
  );
}
