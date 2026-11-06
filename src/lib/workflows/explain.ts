// Workflows in plain words: the trigger as a sentence, each card's one-line meaning, a run's lines in History, and
// the changes Make live lists.

import { BASE_FIELDS, ruleWords } from "../router/conditions.ts";
import { find, walk } from "./tree.ts";
import type { Body, Goal, Step, Trigger } from "./types.ts";

export type Names = { forms?: Record<string, string>; segments?: Record<string, string>; types?: Record<string, string>; people?: Record<string, string>; emails?: Record<string, string>; chats?: Record<string, string>; events?: Record<string, string> };

const list = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} or ${xs[xs.length - 1]}`);
/** The names of the picked ids. Deleted ones drop out; when all are gone, `gone` says so. */
const named = (ids: string[], by: Record<string, string> | undefined, any: string, gone: string) => {
  if (!ids.length) return any;
  const known = ids.map((id) => by?.[id]).filter((x): x is string => !!x);
  return known.length ? list(known) : gone;
};
const EVENT: Record<string, string> = { booked: "booked", canceled: "canceled", held: "held", no_show: "a no-show" };
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

export function triggerWords(t: Trigger, n: Names = {}): string {
  switch (t.kind) {
    case "form":
      return `When ${named(t.forms, n.forms, "any form", "a deleted form")} is sent`;
    case "meeting": {
      const what = list(t.events.map((e) => EVENT[e] ?? e)) || "booked";
      if (!t.types.length) return `When a meeting is ${what}`;
      const w = named(t.types, n.types, "", "");
      return w ? `When ${/^[aeiou]/i.test(w) ? "an" : "a"} ${w} meeting is ${what}` : `When a meeting of a deleted type is ${what}`;
    }
    case "not_booked":
      return `When a lead doesn't book after ${named(t.forms, n.forms, "a form", "a deleted form")}`;
    case "routed":
      return t.result === "unassigned" ? "When no one is found for a lead" : t.result === "routed" ? "When a lead is assigned" : "When a lead is routed";
    case "clicked":
      return `When someone clicks ${named(t.emails, n.emails, "an email", "a deleted email")}`;
  }
}

/** The trigger card's name, a noun: "Meeting booked", "Form submitted". */
export function triggerTitle(t: Trigger): string {
  switch (t.kind) {
    case "form":
      return "Form submitted";
    case "meeting": {
      const EV: Record<string, string> = { booked: "booked", canceled: "canceled", held: "held", no_show: "no-show" };
      return `Meeting ${t.events.length ? list(t.events.map((e) => EV[e] ?? e)) : "booked"}`;
    }
    case "not_booked":
      return "No booking after form";
    case "routed":
      return t.result === "unassigned" ? "Lead unassigned" : t.result === "routed" ? "Lead assigned" : "Lead routed";
    case "clicked":
      return "Email clicked";
  }
}

/** What the trigger is limited to, under its name: the forms, meeting types or emails picked. */
export function triggerDetail(t: Trigger, n: Names = {}): string {
  switch (t.kind) {
    case "form":
    case "not_booked":
      return named(t.forms, n.forms, "Any form", "A deleted form");
    case "meeting":
      return named(t.types, n.types, "Any meeting type", "A deleted meeting type");
    case "routed":
      return "Any lead";
    case "clicked":
      return named(t.emails, n.emails, "Any email", "A deleted email");
  }
}

/** A card's name, a noun: Email, Delay, Slack message. */
export const STEP_TITLE: Record<Step["kind"], string> = { email: "Email", wait: "Delay", wait_until: "Event wait", branch: "Branch", split: "Split", route: "Route", slack: "Slack message", webhook: "Webhook", sms: "Text message", whatsapp: "WhatsApp message", chat: "Chat message", event: "Analytics event", exit: "Exit" };

/** A card's detail under its name: "See you tomorrow", from owner; 1 day before meeting; To owner. */
export function stepDetail(s: Step, n: Names = {}): string {
  switch (s.kind) {
    case "email":
      return s.email.subject ? `"${s.email.subject}"${s.from === "owner" ? ", from owner" : ""}` : "No subject yet";
    case "wait": {
      const parts = [s.days ? plural(s.days, "day") : "", s.hours ? plural(s.hours, "hour") : ""].filter(Boolean);
      if (s.before === "meeting") return `${parts.join(" and ") || "The time"} before meeting`;
      const days = s.weekday?.length ? (s.weekday.length === 5 && !s.weekday.includes(0) && !s.weekday.includes(6) ? ", weekdays" : ", allowed days") : "";
      return `${parts.join(" and ") || "A moment"}${days}${s.at ? ` at ${s.at}` : ""}`;
    }
    case "wait_until":
      return `Up to ${plural(s.days, "day")} for ${EVENT_WORDS[s.event] ?? s.event}`;
    case "branch":
      return stepWords(s, n);
    case "split":
      return `${s.percent}% and ${100 - s.percent}%`;
    case "route":
      return "Right person";
    case "slack":
      return `To ${s.to === "owner" ? "owner" : (n.people?.[s.to] ?? "a teammate")}`;
    case "webhook":
      return s.url ? hostOf(s.url) : "No address yet";
    case "sms":
      return s.text.trim() ? `"${s.text.trim().split("\n")[0]}"${s.fallback ? ", email if it can't go" : ""}` : "No text yet";
    case "whatsapp":
      return s.template ? "Approved template" : "No template yet";
    case "event":
      return s.name.trim() ? `${s.name.trim()}${s.source && n.events?.[s.source] ? ` in ${n.events[s.source]}` : ""}` : "No event yet";
    case "chat":
      return s.target?.name ? `To ${s.target.name}` : s.source ? (n.chats?.[s.source] ? `To ${n.chats[s.source]}` : "To a channel") : "No channel yet";
    case "exit":
      return "End of workflow";
  }
}

const EVENT_WORDS: Record<string, string> = { "meeting.booked": "a booked meeting", "email.clicked": "a click on an email", "form.submitted": "a form" };

export function waitWords(s: Extract<Step, { kind: "wait" }>): string {
  const parts = [s.days ? plural(s.days, "day") : "", s.hours ? plural(s.hours, "hour") : ""].filter(Boolean);
  if (s.before === "meeting") return `Wait until ${parts.join(" and ") || "the time"} before the meeting`;
  const days = s.weekday?.length ? ` until ${s.weekday.length === 5 && !s.weekday.includes(0) && !s.weekday.includes(6) ? "a weekday" : "the next allowed day"}` : "";
  return `Wait ${parts.join(" and ") || "a moment"}${days}${s.at ? ` at ${s.at}` : ""}`;
}

/** A card's one line. */
export function stepWords(s: Step, n: Names = {}): string {
  switch (s.kind) {
    case "email":
      return s.email.subject ? `Send "${s.email.subject}"${s.from === "owner" ? " from their owner" : ""}` : "Send an email";
    case "wait":
      return waitWords(s);
    case "wait_until":
      return `Wait up to ${plural(s.days, "day")} for ${EVENT_WORDS[s.event] ?? s.event}`;
    case "branch":
      return s.conds.length ? `If ${s.conds.map((c) => ruleWords({ id: s.id, name: "", match: s.match, conds: [c], queue: "" }, BASE_FIELDS, []).replace(/^./, (x) => x.toLowerCase())).join(s.match === "any" ? " or " : " and ")}` : "If…";
    case "split":
      return `Split ${s.percent}% and ${100 - s.percent}%`;
    case "route":
      return "Find the right person";
    case "slack":
      return `Slack ${s.to === "owner" ? "their owner" : (n.people?.[s.to] ?? "a teammate")}`;
    case "webhook":
      return s.url ? `Send to ${hostOf(s.url)}` : "Send to a webhook";
    case "sms":
      return "Send a text";
    case "whatsapp":
      return "Send a WhatsApp message";
    case "chat":
      return "Post in a channel";
    case "event":
      return "Send an event";
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
  void g;
  return "they book a meeting";
}

/** Make live's list: what changed between the live version and the draft, as sentences. */
export function diffWords(live: Body | null, draft: Body, n: Names = {}): string[] {
  if (!live) return ["Goes live for the first time"];
  const out: string[] = [];
  if (JSON.stringify(live.trigger) !== JSON.stringify(draft.trigger)) out.push(`Trigger: ${triggerTitle(draft.trigger)}, ${triggerDetail(draft.trigger, n)}`);
  if (JSON.stringify(live.goals) !== JSON.stringify(draft.goals)) out.push(draft.goals.length ? "Exit condition: meeting booked" : "No exit condition");
  if (JSON.stringify(live.entry) !== JSON.stringify(draft.entry)) out.push(draft.entry.mode === "once" ? "Re-entry: once" : `Re-entry: repeat after ${plural(draft.entry.gapDays, "day")}`);
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
