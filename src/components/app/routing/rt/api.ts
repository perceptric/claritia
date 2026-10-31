// The Routing screens' calls (src/lib/routing/screens.ts and handoff.ts through /api/routing), with the typed errors
// the screens act on: a conflict with what's saved now, a timeout that may have gone through, a plain refusal.

import type { Session } from "@supabase/supabase-js";
import type { FieldDef } from "@/lib/router/conditions";
import type { RouterBody } from "@/lib/router/types";
import type { Trace } from "@/lib/routing/evaluate";
import type { Issue } from "@/lib/routing/validate";
import type { PolicyRow, SourceRow } from "@/lib/routing/screenModel";
import { useQuery } from "../../ui";

export class ApiError extends Error {
  status: number;
  code: string;
  state: unknown;
  /** The request never got an answer: it may or may not have gone through. */
  lost: boolean;
  constructor(message: string, o: { status?: number; code?: string; state?: unknown; lost?: boolean } = {}) {
    super(message);
    this.status = o.status ?? 0;
    this.code = o.code ?? "";
    this.state = o.state;
    this.lost = !!o.lost;
  }
}

export async function rt<T>(session: Session, ws: string, action: string, body: object = {}, o: { timeoutMs?: number } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch("/api/routing", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ workspaceId: ws, action, ...body }),
      ...(o.timeoutMs ? { signal: AbortSignal.timeout(o.timeoutMs) } : {}),
    });
  } catch {
    throw new ApiError("No answer from the server.", { lost: true });
  }
  const data = (await res.json().catch(() => null)) as (T & { error?: string; code?: string; state?: unknown }) | null;
  if (!res.ok) {
    if (res.status >= 502 && !data?.code) throw new ApiError(data?.error ?? "No answer from the server.", { status: res.status, lost: res.status === 504 });
    throw new ApiError(data?.error ?? "Something went wrong.", { status: res.status, code: data?.code ?? "", state: data?.state });
  }
  return data as T;
}

export const newKey = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, "")}`;

export type Person = {
  id: string;
  role: "owner" | "member";
  name: string;
  email: string;
  paused_until: string | null;
  out_dates: { from: string; to: string }[];
  cap_day: number | null;
  cap_week: number | null;
  backup: string | null;
  tz: string;
  today: number;
  calendar: string | null;
  reconnect: boolean;
  out: boolean;
};

export type Team = { id: string; name: string; method: string; next: number; revision: number; keys: string[]; members: { user: string; position: number; weight: number }[] };

export type FormInfo = { id: string; name: string; status: string; fields: { id: string; key: string; type: string; label: string; options?: { value: string; label?: string }[] | null }[] };

export type Screen = {
  policies: PolicyRow[];
  sources: SourceRow[];
  forms: FormInfo[];
  meetingTypes: { id: string; name: string; minutes: number | null }[];
  teams: Team[];
  people: Person[];
  fields: FieldDef[];
  me: string;
  role: "owner" | "member";
  openReviews: number;
  paused: boolean;
};

/** The whole Routing section's data, kept while moving between its tabs (`routing_screen:<ws>`). */
export function useScreen(session: Session, ws: string) {
  return useQuery<Screen>(`routing_screen:${ws}`, () => rt<Screen>(session, ws, "rt_screen"), { staleMs: 5_000 });
}

export type TestOut = { trace: Trace; state: string; effect: string; recipient: string | null; fingerprint: string; evidence: { id: string; fingerprint: string; at: string } | null; version: number | null; revision: number };

export type ReviewOut = {
  version: number;
  revision: number;
  fingerprint: string;
  evidence: { id: string; at: string; by: string | null; result: { state?: string; recipient?: string | null; rule?: string | null } } | null;
  errors: Issue[];
  warnings: Issue[];
  sources: { id: string; name: string; pending: boolean }[];
  staged: { id: string; revision: number }[];
  semantics: string[];
};

export type Version = { version: number; note: string | null; by: string | null; at: string; sources: { id: string; revision: number }[]; config: RouterBody };

export type RunRow = {
  id: string;
  at: string;
  kind: string;
  reason: string;
  by: string | null;
  rule: string | null;
  owner: string | null;
  previous_owner: string | null;
  policy_id: string | null;
  policy: string | null;
  version: number | null;
  source: string | null;
  assignment_state: string | null;
  booking_state: string | null;
  booking_reason: string | null;
  sync_state: string | null;
  effect: string | null;
  contact_id: string | null;
  lead: { name: string | null; email: string | null };
  rule_name: string | null;
  held: unknown;
  review: { id: string; state: string; reason: string; reviewer: string } | null;
};

export type RunDetail = RunRow & {
  key: string;
  by_user: string | null;
  source_id: string | null;
  source_revision: number | null;
  trace: Trace | null;
  steps: unknown[];
  parent_run_id: string | null;
  current_owner: string | null;
  review: { id: string; state: string; reason: string; reviewer: string; at: string; latest_action: unknown; child_run_id: string | null } | null;
  meeting: { id: string; start: string; hosts: string[]; status: string; confirmed: boolean } | null;
  task: { id: string; title: string; done: boolean; assignee: string | null; at: string } | null;
};

export type Preview = {
  contact: { id: string; name: string; email: string | null; company: string | null; owner: string | null };
  policy: { id: string; name: string; version: number };
  meetingType: { id: string; name: string; minutes: number | null } | null;
  fields: { key: string; value: unknown }[];
  trace: Trace;
  state: string;
  effect: string;
  recipient: string | null;
  availability: { state: string; tz: string | null; slots: number[]; length: number | null } | null;
  ref: { policy: string; version: number; owner: string | null; recipient: string | null };
};

export type Confirmed =
  | { status: "changed"; reason: "policy_changed" | "ownership_changed" | "recipient_changed"; preview: Preview }
  | {
      status: "assigned";
      run: string;
      owner: string;
      effect: string;
      repeat: boolean;
      booking: { state: "not_requested" } | { state: "pending_confirmation"; meeting: string; start: number } | { state: "slot_taken"; slots: number[] } | { state: "failed"; message: string };
    }
  | { status: "review"; run: string; state: string };
