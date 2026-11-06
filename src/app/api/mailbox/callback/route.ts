import { appBase } from "@/lib/billing";
import type { Rpc } from "@/lib/jobs";
import { finishMailbox } from "@/lib/mailbox/server";
import { readState } from "@/lib/sources/oauth";
import { serviceClient } from "@/lib/serviceClient";

// Google and Microsoft send the person back here after they allow sending (docs/integrations-plan.md, Next step 6).
// Keep the sealed sign-in and go back to My calendar.

const PAGE = "/scheduling/availability/calendars";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const base = appBase();
  const go = (q: Record<string, string>) => Response.redirect(`${base}${PAGE}?${new URLSearchParams(q)}`, 302);
  const state = readState(url.searchParams.get("state"));
  if (!state || (state.kind !== "gmail" && state.kind !== "outlook_mail")) return go({ error: "The sign-in link expired. Try again." });
  if (url.searchParams.get("error")) return go({ error: (url.searchParams.get("error_description") || "Access was not allowed.").slice(0, 200) });
  const code = url.searchParams.get("code") ?? "";
  const db = serviceClient();
  if (!db || !code) return go({ error: "Could not connect." });
  const rpc: Rpc = (f, args) => db.rpc(f, args);
  try {
    const r = await finishMailbox(rpc, { state, code, redirect: `${base}/api/mailbox/callback` });
    return go({ mailbox: r.provider });
  } catch (e) {
    return go({ error: e instanceof Error ? e.message.slice(0, 200) : "Could not connect." });
  }
}
