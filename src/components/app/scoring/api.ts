import type { Session } from "@supabase/supabase-js";
import type { FieldDef } from "@/lib/router/conditions";
import type { Finding } from "@/lib/scoring/build";
import type { Stats } from "@/lib/scoring/engine";
import type { ScoreBody } from "@/lib/scoring/model";
import { postJson } from "../ui";

export type ModelData = { id: string; name: string; revision: number; liveVersion: number | null; draft: ScoreBody | null; live: ScoreBody | null; findings: Finding[]; versions: { version: number; published_at: string }[] };
export type Loaded = { fields: FieldDef[]; forms: { id: string; name: string }[]; reps: number; site: { name: string | null; domain: string | null }; models: { id: string; name: string; live_version: number | null }[]; model: ModelData | null };
export type Built = { model: string; revision: number; body: ScoreBody; findings: Finding[]; stats: Stats };
export type Results = { stats: Stats; moved: number | null; rules: Record<string, { n: number; rate: number }> };

export const scoringApi = <T>(session: Session, ws: string, action: string, extra: Record<string, unknown> = {}) => postJson<T>(session, "/api/scoring", { workspaceId: ws, action, ...extra });

export const BAND: Record<"hot" | "warm" | "cold" | "out", { label: string; tone: "green" | "amber" | "gray" | "red" }> = {
  hot: { label: "Sales-ready", tone: "green" },
  warm: { label: "Warming up", tone: "amber" },
  cold: { label: "Not yet", tone: "gray" },
  out: { label: "Removed", tone: "red" },
};
