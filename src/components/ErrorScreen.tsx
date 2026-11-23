"use client";

// The screen a crash lands on (src/app/error.tsx, src/app/global-error.tsx): a plain sentence, a way to try again,
// and the reference that matches the server's log. The error itself is never shown.

import { useEffect } from "react";
import { GENERIC } from "@/lib/errors";
import { Logo } from "./Logo";

export function ErrorScreen({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-md space-y-5 border border-line bg-panel p-8">
        <Logo />
        <h1 className="text-lg font-medium text-ink">This page hit a problem</h1>
        <p className="text-sm text-muted">{GENERIC}</p>
        {error.digest ? <p className="font-mono text-[12px] text-faint">Reference {error.digest}</p> : null}
        <div className="flex gap-2">
          <button type="button" onClick={reset} className="h-9 rounded-md bg-ink px-4 text-[13px] font-medium text-white hover:bg-[#2b2b29]">
            Try again
          </button>
          {/* A full reload, so whatever state broke the page starts over. */}
          <button type="button" onClick={() => window.location.reload()} className="h-9 rounded-md border border-line px-4 text-[13px] font-medium text-ink hover:bg-hover">
            Reload the page
          </button>
        </div>
      </div>
    </main>
  );
}
