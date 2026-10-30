// Workflows in plain words: the trigger as a sentence, each card's one-line meaning, a run's lines in History, and
// the changes Make live lists.

import { BASE_FIELDS, ruleWords } from "../router/conditions.ts";
import { find, walk } from "./tree.ts";
import type { Body, Goal, Step, Trigger } from "./types.ts";

export type Names = { forms?: Record<string, string>; segments?: Record<string, string>; types?: Record<string, string>; people?: Record<string, string>; emails?: Record<string, string> };

const list = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} or ${xs[xs.length - 1]}`);
const named = (ids: string[], by: Record<string, string> | undefined, any: string) => (ids.length ? list(ids.map((id) => by?.[id] ?? "a removed one")) : any);
const EVENT: Record<string, string> = { booked: "booked", canceled: "canceled", held: "held", no_show: "a no-show" };
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

export function triggerWords(t: Trigger, n: Names = {}): string {
  switch (t.kind) {
    case "form":
      return `When ${named(t.forms, n.forms, "any form")} is sent`;
    case "meeting":
      return `When a ${named(t.types, n.types, "")} meeting is ${list(t.events.map((e) => EVENT[e] ?? e)) || "booked"}`.replace("a  meeting", "a meeting");
    case "not_booked":
      return `When a lead doesn't book after ${named(t.forms, n.forms, "a form")}`;
    case "outcome":
      return `When qualify says ${list(t.outcomes) || "anything"}`;
    case "band":
      return `When the score turns ${list(t.bands) || "any band"}`;
    case "routed":
      return t.result === "unassigned" ? "When no rep is found for a lead" : t.result === "routed" ? "When a lead gets a rep" : "When a lead is routed";
    case "segment":
      return `When someone ${t.on === "left" ? "leaves" : "joins"} ${n.segments?.[t.segment] ?? "a segment"}`;
    case "field":
      return `When ${t.key.replace(/^f\./, "").replace(/_/g, " ") || "a field"} changes${t.to ? ` to ${t.to}` : ""}`;
    case "clicked":
      return `When someone clicks ${named(t.emails, n.emails, "an email")}`;
    case "product":
      return `When someone does ${list(t.events.map((x) => `"${x}"`)) || "something"} in the product`;
    case "date":
      return t.days === 0 ? `On each contact's ${t.field.replace(/_/g, " ")}` : `${plural(Math.abs(t.days), "day")} ${t.days < 0 ? "before" : "after"} each contact's ${t.field.replace(/_/g, " ")}`;
    case "broadcast":
      return `Once, to ${n.segments?.[t.segment] ?? "a segment"}${t.at ? `, on ${new Date(t.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}`;
    case "manual":
      return "When someone is added by hand";
  }
}

const EVENT_WORDS: Record<string, string> = { "meeting.booked": "they book a meeting", "email.clicked": "they click an email", "form.submitted": "they send a form", "lead.outcome": "qualify decides", "segment.entered": "they join a segment", "product.used": "they do something in the product" };

export function waitWords(s: Extract<Step, { kind: "wait" }>): string {
  const parts = [s.days ? plural(s.days, "day") : "", s.hours ? plural(s.hours, "hour") : ""].filter(Boolean);
  const days = s.weekday?.length ? ` until ${s.weekday.length === 5 && !s.weekday.includes(0) && !s.weekday.includes(6) ? "a weekday" : "the next allowed day"}` : "";
  return `Wait ${parts.join(" and ") || "a moment"}${days}${s.at ? ` at ${s.at}` : ""}`;
}

/** A card's one line. */
export function stepWords(s: Step, n: Names = {}): string {
  switch (s.kind) {
    case "email":
      return s.email.subject ? `Send "${s.email.subject}"${s.from === "owner" ? " from their rep" : ""}` : "Send an email";
    case "wait":
      return waitWords(s);
    case "wait_until":
      return `Wait up to ${plural(s.days, "day")} for ${s.event === "product.used" && s.name ? `"${s.name}" in the product` : (EVENT_WORDS[s.event] ?? s.event)}`;
    case "branch":
      return s.conds.length ? `If ${s.conds.map((c) => ruleWords({ id: s.id, name: "", match: s.match, conds: [c], queue: "" }, BASE_FIELDS, []).replace(/^./, (x) => x.toLowerCase())).join(s.match === "any" ? " or " : " and ")}` : "If…";
    case "split":
      return `Split ${s.percent}% and ${100 - s.percent}%`;
    case "enrich":
      return "Fill in their details";
    case "qualify":
      return "Qualify the lead";
    case "route":
      return "Find the right rep";
    case "update":
      return `Set ${s.field.replace(/^f\./, "").replace(/_/g, " ")} to ${s.value || "blank"}`;
    case "list":
      return `${s.action === "add" ? "Add to" : "Remove from"} ${n.segments?.[s.segment] ?? "a list"}`;
    case "task":
      return `Task for ${s.assignee === "owner" ? "their rep" : (n.people?.[s.assignee] ?? "a teammate")}: ${s.title}`;
    case "slack":
      return `Slack ${s.to === "owner" ? "their rep" : (n.people?.[s.to] ?? "a teammate")}`;
    case "webhook":
      return s.url ? `Send to ${hostOf(s.url)}` : "Send to a webhook";
    case "crm":
      return "Push to the CRM";
    case "exit":
      return "End here";
  }
}

const hostOf = (u: string) => {
  try {
    return new URL(u).host;
  } catch {
    return "a webhook";
  }
};

export function goalWords(g: Goal): string {
  if (g.kind === "meeting_booked") return "they book a meeting";
  if (g.kind === "lifecycle") return `their stage is ${list(g.stages)}`;
  return `qualify says ${list(g.outcomes)}`;
}

/** Make live's list: what changed between the live version and the draft, as sentences. */
export function diffWords(live: Body | null, draft: Body, n: Names = {}): string[] {
  if (!live) return ["Goes live for the first time"];
  const out: string[] = [];
  if (JSON.stringify(live.trigger) !== JSON.stringify(draft.trigger)) out.push(`Starts: ${triggerWords(draft.trigger, n)}`);
  if (JSON.stringify(live.goals) !== JSON.stringify(draft.goals)) out.push(draft.goals.length ? `Ends early when ${draft.goals.map(goalWords).join(" or ")}` : "No longer ends early");
  if (JSON.stringify(live.entry) !== JSON.stringify(draft.entry)) out.push(draft.entry.mode === "once" ? "People go through once" : `People can go through again after ${plural(draft.entry.gapDays, "day")}`);
  const before = new Map<string, Step>();
  walk(live.steps, (s) => before.set(s.id, s));
  const after = new Map<string, Step>();
  walk(draft.steps, (s) => after.set(s.id, s));
  for (const [id, s] of after) {
    const b = before.get(id);
    const strip = (x: Step) => JSON.stringify({ ...x, yes: undefined, no: undefined, a: undefined, b: undefined });
    if (!b) out.push(`Adds: ${stepWords(s, n)}`);
    else if (strip(b) !== strip(s)) out.push(`Changes: ${stepWords(s, n)}`);
    else if (find(live.steps, id)?.parent?.step.id !== find(draft.steps, id)?.parent?.step.id || find(live.steps, id)?.index !== find(draft.steps, id)?.index) out.push(`Moves: ${stepWords(s, n)}`);
  }
  for (const [id, s] of before) if (!after.has(id)) out.push(`Removes: ${stepWords(s, n)}`);
  return out.length ? out : ["No changes"];
}

/** A finished step in History, by its result. */
export function resultWords(s: Step | null, status: string, result: Record<string, unknown> | null, n: Names = {}): string {
  const base = s ? stepWords(s, n) : "A step that was removed";
  if (status === "skipped") return `${base}: skipped${result?.why ? `, ${String(result.why)}` : ""}`;
  if (status === "failed") return `${base}: didn't work${result?.error ? `, ${String(result.error)}` : ""}`;
  if (status === "unknown") return `${base}: no clear answer, not tried again`;
  if (s?.kind === "branch" || s?.kind === "split" || s?.kind === "wait_until") return `${base}: went ${String(result?.path ?? "on")}`;
  return base;
}
