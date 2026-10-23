import { appBase } from "@/lib/billing";
import { finishConnect } from "@/lib/meetings/providers/connect";
import type { Rpc } from "@/lib/jobs";
import { readState } from "@/lib/sources/oauth";
import { serviceClient } from "@/lib/serviceClient";

// Google, Microsoft and Zoom send the person back here after they allow access. Save the sealed sign-in and the
// calendar list, queue the first busy read and push channels, and go back to My calendar.

const KINDS = new Set(["google_calendar", "microsoft_calendar", "zoom"]);
/** My calendar (docs/meetings-scheduler.md 1.9). */
const PAGE = "/settings/calendar";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const base = appBase();
  const go = (q: Record<string, string>) => Response.redirect(`${base}${PAGE}?${new URLSearchParams(q)}`, 302);
  const state = readState(url.searchParams.get("state"));
  if (!state || !KINDS.has(state.kind)) return go({ error: "The sign-in link expired. Try again." });
  if (url.searchParams.get("error")) return go({ error: (url.searchParams.get("error_description") || "Access was not allowed.").slice(0, 200) });
  const code = url.searchParams.get("code") ?? "";
  const db = serviceClient();
  if (!db || !code) return go({ error: "Could not connect." });
  const rpc: Rpc = (f, args) => db.rpc(f, args);
  try {
    const fallbackEmail = state.kind === "zoom" ? ((await db.auth.admin.getUserById(state.user)).data.user?.email ?? undefined) : undefined;
    const r = await finishConnect(rpc, { state, code, redirect: `${base}/api/calendar/callback`, fallbackEmail });
    return go({ connected: r.provider });
  } catch (e) {
    return go({ error: e instanceof Error ? e.message.slice(0, 200) : "Could not connect." });
  }
}
