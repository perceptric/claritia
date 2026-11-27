"use client";

// The screen a crash lands on (src/app/error.tsx, src/app/global-error.tsx): a plain sentence, a way to try again,
// and the reference that matches the server's log. The error itself is never shown.

import { useEffect } from "react";
import { GENERIC } from "@/lib/errors";
import { Logo } from "./Logo";
import { Button } from "./app/ui";

export function ErrorScreen({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-md space-y-5 rounded-xl bg-card p-8 shadow-rest">
        <Logo />
        <div className="flex min-w-0 items-start gap-2.5">
          <span aria-hidden="true" className="mt-0.5 grid size-[20px] shrink-0 place-items-center rounded-full bg-warning-soft text-warning">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
              <path d="M12 7v6M12 17h.01" />
            </svg>
          </span>
          <div className="min-w-0 space-y-1">
            <h1 className="text-lg font-medium text-ink wrap-break-word">This page hit a problem</h1>
            <p className="text-sm text-muted">{GENERIC}</p>
            {error.digest ? <p className="text-[12px] text-faint tabular-nums wrap-anywhere">Ref {error.digest}</p> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={reset}>Try again</Button>
          {/* A full reload, so whatever state broke the page starts over. */}
          <Button variant="ghost" onClick={() => window.location.reload()}>
            Reload the page
          </Button>
        </div>
      </div>
    </main>
  );
}
