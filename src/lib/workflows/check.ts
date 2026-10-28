// What stops a workflow from going live, in words (like src/lib/router/check.ts). The editor shows these as you
// build; Make live refuses while any is left. `cleanBody` makes stored or sent JSON safe to use.

import { mergeGaps } from "./merge.ts";
import { emailText } from "../design/email/compile.ts";
import { readEmailDoc, type EmailDoc } from "../design/email/doc.ts";
import { countSteps, maxDepth, pathsOf, walk } from "./tree.ts";
import type { Cond } from "../router/types.ts";
import { LIMITS, UPDATABLE, emptyBody, type Body, type Step } from "./types.ts";

export type Problem = { step: string | null; text: string };

const https = (u: string) => {
  try {
    const x = new URL(u);
    return x.protocol === "https:" && !x.username && !x.password;
  } catch {
    return false;
  }
};

export function problems(body: Body): Problem[] {
  const out: Problem[] = [];
  const t = body.trigger;
  const need = (ok: boolean, text: string) => {
    if (!ok) out.push({ step: null, text });
  };
  if (t.kind === "segment") need(!!t.segment, "Pick the segment that starts it");
  if (t.kind === "broadcast") {
    need(!!t.segment, "Pick who gets it");
    need(!!t.at && !Number.isNaN(Date.parse(t.at)), "Pick when it goes");
  }
  if (t.kind === "field") need(!!t.key, "Pick the field that starts it");
  if (t.kind === "date") need(!!t.field, "Pick the date field");
  if (t.kind === "outcome") need(t.outcomes.length > 0, "Pick the outcomes that start it");
  if (t.kind === "meeting") need(t.events.length > 0, "Pick the meeting events that start it");
  if (!body.steps.length) out.push({ step: null, text: "Add a step" });
  if (countSteps(body.steps) > LIMITS.steps) out.push({ step: null, text: `Up to ${LIMITS.steps} steps` });
  if (maxDepth(body.steps) > LIMITS.depth) out.push({ step: null, text: `Paths can go ${LIMITS.depth} levels deep` });
  const ids = new Set<string>();
  walk(body.steps, (s) => {
    if (ids.has(s.id)) out.push({ step: s.id, text: "Two steps share an id" });
    ids.add(s.id);
    for (const text of stepProblems(s)) out.push({ step: s.id, text });
  });
  return out;
}

/** What stops an email built with blocks from going out (the parts of the design check that don't need its styles). */
export function docProblems(doc: EmailDoc): string[] {
  const out: string[] = [];
  const blocks = doc.sections.flatMap((s) => s.columns.flatMap((c) => c.blocks));
  if (!blocks.some((b) => b.type !== "footer" && b.type !== "divider" && b.type !== "spacer")) out.push("Write the email");
  for (const b of blocks) {
    if ((b.type === "button" || b.type === "meeting" || b.type === "product" || b.type === "event") && !https(b.url)) out.push(`The ${b.type === "meeting" ? "meeting" : "button"} needs an https:// link`);
    if ((b.type === "image" || b.type === "video") && !(b.type === "image" ? b.src : b.thumb)) out.push("Add the image or remove its block");
  }
  if (!blocks.some((b) => b.type === "footer")) out.push("Add the Footer block");
  return [...new Set(out)];
}

export function stepProblems(s: Step): string[] {
  const out: string[] = [];
  switch (s.kind) {
    case "email": {
      const e = s.email;
      if (!e.subject.trim()) out.push("Write a subject");
      if (e.doc) out.push(...docProblems(e.doc));
      else {
        if (!e.paragraphs.some((p) => p.trim())) out.push("Write the email");
        if (e.cta_label.trim() && !https(e.cta_url)) out.push("The button needs an https:// link");
      }
      const gaps = [e.subject, e.preheader, ...(e.doc ? [e.doc.settings.preheader, emailText(e.doc)] : [...e.paragraphs, e.cta_label])].flatMap(mergeGaps).filter((g) => !/\{\{\s*(unsubscribe_url|company_address)\s*\}\}/.test(g));
      if (gaps.length) out.push(`Give ${gaps[0]} a fallback, like {{first_name|there}}`);
      if (!s.approved) out.push("Approve the email");
      break;
    }
    case "wait":
      if (s.days <= 0 && s.hours <= 0 && !s.at && !s.weekday?.length) out.push("Set how long to wait");
      break;
    case "wait_until":
      if (s.days <= 0) out.push("Set the longest wait");
      break;
    case "branch":
      if (!s.conds.length) out.push("Add a condition");
      break;
    case "split":
      if (s.percent <= 0 || s.percent >= 100) out.push("Pick a split between 1 and 99%");
      break;
    case "update":
      if (!(UPDATABLE as readonly string[]).includes(s.field) && !s.field.startsWith("f.")) out.push("Pick a field");
      break;
    case "list":
      if (!s.segment) out.push("Pick a list");
      break;
    case "task":
      if (!s.title.trim()) out.push("Name the task");
      break;
    case "slack":
      if (!s.text.trim()) out.push("Write the message");
      break;
    case "webhook":
      if (!https(s.url)) out.push("Webhooks need an https:// address");
      break;
  }
  return out;
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), lo), hi) : dflt;
};
const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 80)).slice(0, 50) : []);

/** A stored or sent body, made safe: unknown kinds dropped, strings and numbers held to their limits. */
export function cleanBody(raw: unknown): Body {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const base = emptyBody();
  const t = (r.trigger && typeof r.trigger === "object" ? r.trigger : base.trigger) as Record<string, unknown>;
  const trigger = cleanTrigger(t) ?? base.trigger;
  const entry = (r.entry && typeof r.entry === "object" ? r.entry : {}) as Record<string, unknown>;
  const goals = (Array.isArray(r.goals) ? r.goals : [])
    .map((g: Record<string, unknown>) =>
      g?.kind === "meeting_booked" ? { kind: "meeting_booked" as const } : g?.kind === "lifecycle" ? { kind: "lifecycle" as const, stages: ids(g.stages) } : g?.kind === "outcome" ? { kind: "outcome" as const, outcomes: ids(g.outcomes) } : null,
    )
    .filter((g): g is Body["goals"][number] => !!g)
    .slice(0, 5);
  const only = r.only && typeof r.only === "object" ? (r.only as Record<string, unknown>) : null;
  return {
    trigger,
    steps: cleanSteps(r.steps, 0),
    goals,
    entry: { mode: entry.mode === "repeat" ? "repeat" : "once", gapDays: num(entry.gapDays, 1, 365, 30) },
    ...(only && Array.isArray(only.conds) && only.conds.length ? { only: { match: only.match === "any" ? "any" : "all", conds: (only.conds as Cond[]).slice(0, 10) } } : {}),
  } as Body;
}

function cleanTrigger(t: Record<string, unknown>): Body["trigger"] | null {
  switch (t.kind) {
    case "form":
      return { kind: "form", forms: ids(t.forms) };
    case "meeting":
      return { kind: "meeting", events: ids(t.events).filter((e) => ["booked", "canceled", "held", "no_show"].includes(e)) as ("booked" | "canceled" | "held" | "no_show")[], types: ids(t.types) };
    case "not_booked":
      return { kind: "not_booked", forms: ids(t.forms) };
    case "outcome":
      return { kind: "outcome", outcomes: ids(t.outcomes) };
    case "band":
      return { kind: "band", bands: ids(t.bands) };
    case "routed":
      return { kind: "routed", result: t.result === "unassigned" ? "unassigned" : t.result === "routed" ? "routed" : "any" };
    case "segment":
      return { kind: "segment", segment: str(t.segment, 40), on: t.on === "left" ? "left" : "entered" };
    case "field":
      return { kind: "field", key: str(t.key, 60), ...(typeof t.to === "string" && t.to ? { to: str(t.to, 200) } : {}) };
    case "clicked":
      return { kind: "clicked", emails: ids(t.emails) };
    case "date":
      return { kind: "date", field: str(t.field, 60), days: num(t.days, -365, 365, 0), time: /^\d{2}:\d{2}$/.test(String(t.time)) ? String(t.time) : "09:00" };
    case "broadcast":
      return { kind: "broadcast", segment: str(t.segment, 40), at: str(t.at, 40) };
    case "manual":
      return { kind: "manual" };
    default:
      return null;
  }
}

const KINDS = new Set(["email", "wait", "wait_until", "branch", "split", "enrich", "qualify", "route", "update", "list", "task", "slack", "webhook", "crm", "exit"]);
const WAIT_EVENTS = new Set(["meeting.booked", "email.clicked", "form.submitted", "lead.outcome", "segment.entered"]);

function cleanSteps(raw: unknown, depth: number): Step[] {
  if (!Array.isArray(raw) || depth > 4) return [];
  return raw
    .slice(0, 60)
    .map((x) => cleanStep(x, depth))
    .filter((s): s is Step => !!s);
}

function cleanStep(x: unknown, depth: number): Step | null {
  const s = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const id = typeof s.id === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(s.id) ? s.id : null;
  if (!id || !KINDS.has(String(s.kind))) return null;
  switch (s.kind) {
    case "email": {
      const e = (s.email && typeof s.email === "object" ? s.email : {}) as Record<string, unknown>;
      return {
        id,
        kind: "email",
        email: {
          subject: str(e.subject, 200),
          preheader: str(e.preheader, 200),
          paragraphs: (Array.isArray(e.paragraphs) ? e.paragraphs : []).map((p) => str(p, 2000)).slice(0, 12),
          cta_label: str(e.cta_label, 60),
          cta_url: str(e.cta_url, 1000),
          // Built with blocks: read safely. HTML blocks stay here; publishing allows them from owners only.
          ...(e.doc && typeof e.doc === "object" ? { doc: readEmailDoc(e.doc, { allowHtml: true }) } : {}),
        },
        from: s.from === "owner" ? "owner" : "team",
        approved: s.approved === true,
        ...(s.ai === true ? { ai: true } : {}),
        ...(Array.isArray(s.notes) ? { notes: s.notes.map((n) => str(n, 300)).slice(0, 10) } : {}),
      };
    }
    case "wait":
      return { id, kind: "wait", days: num(s.days, 0, 365, 1), hours: num(s.hours, 0, 23, 0), ...(Array.isArray(s.weekday) && s.weekday.length ? { weekday: s.weekday.map(Number).filter((d) => d >= 0 && d <= 6) } : {}), ...(typeof s.at === "string" && /^\d{2}:\d{2}$/.test(s.at) ? { at: s.at } : {}) };
    case "wait_until":
      return { id, kind: "wait_until", event: (WAIT_EVENTS.has(String(s.event)) ? s.event : "meeting.booked") as "meeting.booked", days: num(s.days, 0, 90, 3), yes: cleanSteps(s.yes, depth + 1), no: cleanSteps(s.no, depth + 1) };
    case "branch":
      return { id, kind: "branch", match: s.match === "any" ? "any" : "all", conds: (Array.isArray(s.conds) ? (s.conds as Cond[]) : []).slice(0, 10), yes: cleanSteps(s.yes, depth + 1), no: cleanSteps(s.no, depth + 1) };
    case "split":
      return { id, kind: "split", percent: num(s.percent, 1, 99, 50), a: cleanSteps(s.a, depth + 1), b: cleanSteps(s.b, depth + 1) };
    case "update":
      return { id, kind: "update", field: str(s.field, 60), value: str(s.value, 200) };
    case "list":
      return { id, kind: "list", action: s.action === "remove" ? "remove" : "add", segment: str(s.segment, 40) };
    case "task":
      return { id, kind: "task", title: str(s.title, 300), assignee: str(s.assignee, 40) || "owner", dueDays: num(s.dueDays, 0, 90, 1) };
    case "slack":
      return { id, kind: "slack", to: str(s.to, 40) || "owner", text: str(s.text, 1000) };
    case "webhook":
      return { id, kind: "webhook", url: str(s.url, 1000) };
    default:
      return { id, kind: s.kind } as Step;
  }
}

/** The steps an approved email change unapproves: an email whose words changed since it was approved. */
export function emailChanged(before: Step | undefined, after: Step): boolean {
  if (after.kind !== "email" || !before || before.kind !== "email") return false;
  return JSON.stringify(before.email) !== JSON.stringify(after.email);
}

export { pathsOf };
