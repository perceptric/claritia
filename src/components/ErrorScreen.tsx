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
        <h1 className="text-lg font-medium text-ink">This page hit a problem</h1>
        <p className="text-sm text-muted">{GENERIC}</p>
        {error.digest ? <p className="font-mono text-[12px] text-faint">Reference {error.digest}</p> : null}
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
