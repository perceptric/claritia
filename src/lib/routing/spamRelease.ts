// Not spam, for a form lead the routing spam check caught (docs/on-submission.md, migration 098). Its review item was
// written dismissed when the lead went to Spam; letting it in reopens that item and runs the review's child attempt
// with the spam check skipped (recovery.ts), so the lead routes on the version it came in on, through the same
// committer and checks (away, caps, turns) as any lead. Anyone who can see the form's Spam may let a lead in, so this
// runs with an owner's rights on their behalf. If routing refuses, the item goes back to dismissed and the lead stays
// in Spam.

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Rpc } from "../jobs.ts";
import { fieldsFor, membersOf } from "../router/actions.ts";
import { childPreview, childRun, type ChildResult } from "./recovery.ts";
import type { Caller, Deps } from "./screens.ts";

/** Whether a Spam row came from the routing spam check, and so needs routing when it's let in. */
export const routedSpam = (s: { spam_reason: string | null; contact_id: string | null }) => s.spam_reason === "routing" && !!s.contact_id;

export async function routeSpamLead(rpc: Rpc, db: SupabaseClient, o: { ws: string; user: string; submission: string }): Promise<{ owner: string | null }> {
  const item = (await db.from("routing_reviews").select("id, run_id, state").eq("workspace_id", o.ws).eq("submission_id", o.submission).eq("reason", "spam").order("created_at", { ascending: false }).limit(1).maybeSingle()).data as {
    id: string;
    run_id: string;
    state: string;
  } | null;
  if (!item) throw new Error("This lead's routing is gone.");
  if (item.state === "resolved") return { owner: null };
  const c: Caller = { ws: o.ws, user: o.user, role: "owner" };
  const deps: Deps = { members: () => membersOf(rpc, db, o.ws, { fresh: true }), fields: async () => (await fieldsFor(db, o.ws)).fields };
  const act = (action: string, reason: string | null = null) => rpc("routing_review_act", { p_ws: o.ws, p_review: item.id, p_action: action, p_user: o.user, p_reason: reason, p_revision: null, p_op: null });
  if (item.state === "dismissed") {
    const r = await act("reopen");
    if (r.error) throw new Error("Try again in a moment.");
  }
  const op = randomUUID().replace(/-/g, "");
  try {
    let res: ChildResult | null = null;
    // A change between the preview and the commit (a rep went away) comes back as "changed": preview again, once.
    for (let i = 0; i < 2 && (!res || res.status === "changed"); i++) {
      const p = await childPreview(rpc, c, deps, { run: item.run_id, clearHold: true });
      if (!p.ref) throw new Error("No published routing can route this lead.");
      res = await childRun(rpc, c, deps, { run: item.run_id, clearHold: true, op, ref: p.ref });
    }
    if (!res || res.status === "changed") throw new Error("The team changed while routing. Try again.");
    // No rep could take it (all away or at their cap): it's let in, unassigned, like any lead with nowhere to go.
    return { owner: res.status === "resolved" ? res.owner : null };
  } catch (e) {
    await act("dismiss", "Spam");
    throw e;
  }
}
