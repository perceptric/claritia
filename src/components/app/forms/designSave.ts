// Saving a brand kit's design draft (docs/design-system.md Part 8.3; docs/email-canvas-b4.md section 4.6): one call
// shared by the Form and Email Studios' draft (useDesignDraft) and the email canvas's editor. A save names the rev it
// started from; when someone else saved first, their version comes back.

import type { Session } from "@supabase/supabase-js";

export type DesignSaveResult = { ok: true; rev: number } | { conflict: true; rev: number; design: unknown; error: string } | { error: string; retry: boolean };

export async function saveDesign(o: { session: Session; workspaceId: string; kitId: string; design: unknown; rev: number }): Promise<DesignSaveResult> {
  try {
    const res = await fetch("/api/design/save", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${o.session.access_token}` },
      body: JSON.stringify({ workspaceId: o.workspaceId, kitId: o.kitId, design: o.design, rev: o.rev }),
    });
    const data = (await res.json().catch(() => ({}))) as { rev?: number; design?: unknown; error?: string };
    if (res.status === 409 && typeof data.rev === "number") return { conflict: true, rev: data.rev, design: data.design, error: data.error ?? "Someone else changed these styles." };
    if (!res.ok || typeof data.rev !== "number") return { error: data.error ?? "Try again in a moment.", retry: res.status >= 500 || res.status === 429 || res.status === 408 };
    return { ok: true, rev: data.rev };
  } catch {
    return { error: "Try again in a moment.", retry: true };
  }
}
