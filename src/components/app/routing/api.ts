// The Routing screens' calls to /api/routing (src/app/api/routing/route.ts, src/lib/router/actions.ts).

import type { Session } from "@supabase/supabase-js";
import type { Change } from "@/lib/router/diff";
import type { FieldDef } from "@/lib/router/conditions";
import type { Line } from "@/lib/router/explain";
import type { Problem } from "@/lib/router/check";
import type { Decision, RouterBody } from "@/lib/router/types";
import { postJson } from "../ui";

export const routingApi = <T = Record<string, unknown>,>(session: Session, ws: string, action: string, body: object = {}) =>
  postJson<T>(session, "/api/routing", { workspaceId: ws, action, ...body });

export type Member = { id: string; name: string; email: string };

export type Loaded = {
  live: { version: number; body: RouterBody } | null;
  draft: RouterBody | null;
  draftBase: number | null;
  revision: number;
  problems: Problem[];
  versions: { version: number; note: string | null; published_by: string | null; published_at: string }[];
  members: Member[];
  fields: FieldDef[];
  forms: { id: string; name: string }[];
  stats: { total: number; held: number; unassigned: number; by: Record<string, number>; rules: Record<string, number>; queues: Record<string, number>; p95_ms: number | null };
  lists: { allow: string[]; block: string[] };
  alert: { label: string | null };
  legacy: { body: RouterBody; unmapped: string[] } | null;
};

export type Tested = { result: Decision["result"]; owner: string; path: string; lines: Line[]; whyNot?: { why: string; words: string } };
export type TestOut = { contact: string | null; draft: Tested | null; live: Tested | null };

export type ReplayOut = {
  total: number;
  same: number;
  changed: number;
  held: number;
  unassigned: number;
  days: number;
  groups: { from: string; to: string; fromName: string; toName: string; count: number; runs: { run: string; contact: string | null; name: string; before: Line[]; after: Line[] }[] }[];
};

export type ChangesOut = { changes: Change[] };
