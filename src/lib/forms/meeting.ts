// Teammates' booking links for "Book a meeting" (docs/form-studio.md Part 3). Which saved link works for the form's
// scheduler, who may change whose link (the same rule as scheduler_link_save in SQL), and which link a lead gets: the
// contact owner's when it works for the tool, else the team link, else none (the lead sees the message). A link that
// is missing, for another tool or malformed never wins over a working team link. Runs in the browser and on the server.

import { allFields, isChoice, isContent, type Choice, type FieldType, type Form } from "./schema.ts";
import { linkProblem, WORK_EMAIL, type MatchRule, type Schedule, type SchedulerTool } from "./schedule.ts";

export type LinkState = { kind: "none" } | { kind: "ok" } | { kind: "bad"; problem: string };

/** A pasted link as people type it: trimmed, with https:// added to a bare address like "calendly.com/maya". */
export function cleanLink(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return t;
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?([/?#]|$)/i.test(t) ? `https://${t}` : t;
}

/** Whether a link, as saved or as typed, works for the tool. */
export function linkState(tool: SchedulerTool, raw: string | null | undefined): LinkState {
  const url = cleanLink(raw ?? "");
  if (!url) return { kind: "none" };
  const problem = linkProblem(tool, url);
  return problem ? { kind: "bad", problem } : { kind: "ok" };
}

/** What to save for a typed link: the cleaned link, "" to remove it, or the problem that stops the save. */
export function linkToSave(tool: SchedulerTool, raw: string): { url: string } | { problem: string } {
  const url = cleanLink(raw);
  if (!url) return { url: "" };
  const problem = linkProblem(tool, url);
  return problem ? { problem } : { url };
}

/** Owners set anyone's link; members only their own (scheduler_link_save). */
export function canSetLink(role: "owner" | "member", me: string, user: string): boolean {
  return role === "owner" || me === user;
}

/**
 * The link a lead books on: the owner's when the form books with owners and the owner's link works for the tool, else
 * the team link when it works, else null.
 */
export function bookingBase(s: Pick<Schedule, "tool" | "url" | "perOwner">, owner?: string | null): { url: string; from: "owner" | "team" } | null {
  if (s.perOwner && owner && !linkProblem(s.tool, owner)) return { url: owner, from: "owner" };
  if (s.url && !linkProblem(s.tool, s.url)) return { url: s.url, from: "team" };
  return null;
}

/** Each teammate's route for the table: books on their own link, falls back to the team link, or shows the message. */
export function ownerRoute(s: Pick<Schedule, "tool" | "url" | "perOwner">, owner?: string | null): "own" | "team" | "message" {
  const b = bookingBase({ ...s, perOwner: true }, owner);
  return !b ? "message" : b.from === "owner" ? "own" : "team";
}

// Who sees the calendar: the rule builder's choices per field ------------------------------------------------------

type Op = MatchRule["op"];
const OPS: Record<"work" | "choice" | "number" | "check" | "text", { value: Op; label: string; takes: "none" | "option" | "number" | "text" }[]> = {
  work: [
    { value: "is", label: "is a work email", takes: "none" },
    { value: "is_not", label: "isn't a work email", takes: "none" },
  ],
  choice: [
    { value: "is", label: "is", takes: "option" },
    { value: "is_not", label: "isn't", takes: "option" },
    { value: "filled", label: "is answered", takes: "none" },
    { value: "empty", label: "is empty", takes: "none" },
  ],
  number: [
    { value: "gte", label: "is at least", takes: "number" },
    { value: "lte", label: "is at most", takes: "number" },
    { value: "is", label: "is", takes: "number" },
    { value: "filled", label: "is answered", takes: "none" },
    { value: "empty", label: "is empty", takes: "none" },
  ],
  check: [
    { value: "filled", label: "is checked", takes: "none" },
    { value: "empty", label: "isn't checked", takes: "none" },
  ],
  text: [
    { value: "is", label: "is", takes: "text" },
    { value: "is_not", label: "isn't", takes: "text" },
    { value: "filled", label: "is answered", takes: "none" },
    { value: "empty", label: "is empty", takes: "none" },
  ],
};

/** The fields a rule can read: every answer field (content blocks save nothing), with Work email first. */
export function ruleFields(form: Form): { value: string; label: string; type: FieldType | "work"; options?: Choice[] }[] {
  return [
    { value: WORK_EMAIL, label: "Work email", type: "work" as const },
    ...allFields(form)
      .filter((f) => !isContent(f.type))
      .map((f) => ({ value: f.id, label: f.label || f.key, type: f.type, ...(f.options?.length ? { options: f.options } : {}) })),
  ];
}

/** The ops a rule on this kind of field offers, and what value each one takes. */
export function ruleOps(type: FieldType | "work") {
  if (type === "work") return OPS.work;
  if (isChoice(type)) return OPS.choice;
  if (type === "number" || type === "rating") return OPS.number;
  if (type === "checkbox" || type === "consent") return OPS.check;
  return OPS.text;
}

type RuleField = { value: string; type: FieldType | "work"; options?: Choice[] };

/** A rule with a new op: the value is kept when the op takes the same kind and it still fits the field. */
export function withOp(rule: MatchRule, op: Op, field: RuleField): MatchRule {
  const o = ruleOps(field.type).find((x) => x.value === op) ?? ruleOps(field.type)[0];
  const v = rule.value ?? "";
  let value: string | undefined;
  if (o.takes === "option") value = field.options?.some((x) => x.value === v) ? v : (field.options?.[0]?.value ?? "");
  else if (o.takes === "number") value = v.trim() !== "" && Number.isFinite(Number(v)) ? v : "";
  else if (o.takes === "text") value = v;
  return { field: field.value, op: o.value, ...(value !== undefined ? { value } : {}) };
}

/** A rule pointed at another field: the op stays when the field offers it, a value only when it fits the new field. */
export function retarget(rule: MatchRule, field: RuleField): MatchRule {
  const ops = ruleOps(field.type);
  const op = ops.some((o) => o.value === rule.op) ? rule.op : ops[0].value;
  const kind = ops.find((o) => o.value === op)!.takes;
  return withOp(kind === "text" ? { ...rule, value: "" } : rule, op, field);
}

/** A new rule: work email first, so the usual setup ("work emails book") is one click. */
export const firstRule = (): MatchRule => ({ field: WORK_EMAIL, op: "is" });
