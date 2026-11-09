"use client";

import type { Session } from "@supabase/supabase-js";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Mark } from "../Logo";
import { Dots } from "./Ai";
import { ErrorNote, errorText, postJson } from "./ui";

// The claim link from a form made in ChatGPT or Claude (/claim/<key>, src/app/api/forms/claim): once signed in, the
// form's workspace becomes this person's and the form opens.

export function ClaimForm({ session, pick }: { session: Session; pick: (id: string) => void }) {
  const [error, setError] = useState("");
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    const key = decodeURIComponent(window.location.pathname.slice("/claim/".length));
    postJson<{ workspaceId: string; formId: string | null }>(session, "/api/forms/claim", { key })
      .then((r) => {
        pick(r.workspaceId);
        window.location.replace(r.formId ? `/forms/${r.formId}` : "/forms");
      })
      .catch((e) => setError(errorText(e)));
  }, [session, pick]);
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper-deep px-4">
      <div className="w-full max-w-sm min-w-0 space-y-5 rounded-2xl bg-card p-7 shadow-rest">
        <Mark size={32} />
        {error ? (
          <>
            <ErrorNote message={error} />
            <Link className="text-[13px] font-medium text-ink underline underline-offset-2" href="/forms">
              Open Forms
            </Link>
          </>
        ) : (
          <Dots />
        )}
      </div>
    </main>
  );
}
