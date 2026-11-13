// An automation's emails and their editing copies on the Emails canvas (docs/email-unify-plan.md, E3;
// 163_automation_emails.sql). The copy is where the email is edited; the workflow's draft keeps the same words in each
// email step, which Approve and Publish read. Opening the editor brings newer words from the canvas into the draft
// (and asks for approval again); edits made in the editor go to the copy; Publish refuses while the two differ, so
// what goes live is always what was looked at. Runs in the browser and on the server.

import { docFromBody, readEmailDoc, type EmailDoc } from "../design/email/doc.ts";
import { walk } from "./tree.ts";
import type { Body, EmailBody, Step } from "./types.ts";

export type EmailStep = Extract<Step, { kind: "email" }>;
/** An editing copy as the database gives it (workflow_email_ensure). */
export type EmailCopy = { id: string; step: string; subject: string; preheader: string; doc: unknown; made?: boolean };

/** The email steps, in the order the flow shows them. */
export function emailSteps(body: Body): EmailStep[] {
  const out: EmailStep[] = [];
  walk(body.steps, (s: Step) => {
    if (s.kind === "email") out.push(s);
  });
  return out;
}

/** The step's email as a design: its own, or one made from its subject, paragraphs and button. */
export const designOf = (e: EmailBody): EmailDoc => e.doc ?? docFromBody(e);

/** What workflow_email_ensure takes for each step. */
export const ensurePayload = (body: Body) => emailSteps(body).map((s) => ({ step: s.id, subject: s.email.subject, preheader: s.email.preheader, doc: designOf(s.email) }));

/** JSON with its keys sorted, so a design read back from the database (which reorders keys) compares equal. */
export function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v ?? null);
}

const docKey = (doc: unknown) => stable(readEmailDoc(doc, { allowHtml: true }));

/** Whether a step's email and its copy say the same thing: subject and design. */
export function sameEmail(e: EmailBody, c: Pick<EmailCopy, "subject" | "doc">): boolean {
  return e.subject.trim() === (c.subject ?? "").trim() && docKey(designOf(e)) === docKey(c.doc);
}

/**
 * The draft with the copies' words in its email steps. A copy made just now from the step keeps the step's approval
 * (only its form changed, from paragraphs to a design); a copy with different words loses it.
 */
export function mergeCopies(body: Body, copies: EmailCopy[]): { body: Body; changed: string[] } {
  const by = new Map(copies.map((c) => [c.step, c]));
  const changed: string[] = [];
  const fix = (steps: Step[]): Step[] =>
    steps.map((s) => {
      const kids = (k: Step[]) => fix(k);
      if (s.kind === "branch" || s.kind === "wait_until") return { ...s, yes: kids(s.yes), no: kids(s.no) };
      if (s.kind === "split") return { ...s, a: kids(s.a), b: kids(s.b) };
      if (s.kind !== "email") return s;
      const c = by.get(s.id);
      if (!c) return s;
      const doc = readEmailDoc(c.doc, { allowHtml: true });
      const same = sameEmail(s.email, c);
      if (same && s.email.doc) return s;
      if (!same && !c.made) changed.push(s.id);
      return { ...s, email: { ...s.email, subject: c.subject ?? "", preheader: c.preheader ?? "", doc }, approved: same || c.made ? s.approved : false };
    });
  const steps = fix(body.steps);
  return { body: { ...body, steps }, changed };
}

/** The first email step whose copy says something else, for Publish; null when they all match (or have no copy). */
export function firstMismatch(body: Body, copies: EmailCopy[]): EmailStep | null {
  const by = new Map(copies.map((c) => [c.step, c]));
  return emailSteps(body).find((s) => by.has(s.id) && !sameEmail(s.email, by.get(s.id)!)) ?? null;
}
