// New form's last two screens (docs/forms.md, Screens 4 and 5): where the answers go and what the visitor sees after
// the send, set on the saved form the spec is laid over. No AI here.

import { DEFAULT_NOTIFY } from "./notify.ts";
import { DEFAULT_CONSENT, emptyForm, type Form } from "./schema.ts";
import type { Plan } from "./specAi.ts";

/** Screen 4: the CRMs that get each lead, the team alert, the spam guard and the consent box. */
export type Submission = { crms: string[]; alert: boolean; to: string[]; spam: boolean; consent: boolean };
/** Screen 5: a thank-you, a page, or a meeting (a type, or one to make once the form is created). */
export type End = { kind: "thanks"; title: string; text: string } | { kind: "page"; url: string } | { kind: "meeting"; typeId: string | null };

export const defaultSubmission = (me: string | null | undefined): Submission => ({ crms: [], alert: true, to: me ? [me] : [], spam: true, consent: true });
export const PAGE_URL = /^https:\/\/[^\s/$.?#][^\s]*\.[^\s]+$/;

/** The saved form a new spec is laid over: the screens' choices as settings. */
export function baseForm(o: { submission: Submission; end: End; needEmail: boolean; thanks?: { title: string; text: string } }): Form {
  const f = emptyForm();
  f.consent = { mode: o.submission.consent ? "by_region" : "off", label: DEFAULT_CONSENT };
  f.spam = { ...f.spam, turnstile: o.submission.spam };
  f.notify = { ...DEFAULT_NOTIFY, on: o.submission.alert && o.submission.to.length > 0, to: o.submission.to.slice(0, 10) };
  if (!o.needEmail) f.emailOptional = true;
  const thanks = o.end.kind === "thanks" ? o.end : o.thanks;
  f.after = { end: o.end.kind === "page" && PAGE_URL.test(o.end.url) ? { kind: "redirect", url: o.end.url } : { kind: "message", title: thanks?.title?.trim() || "Thanks, we got it.", ...(thanks?.text?.trim() ? { text: thanks.text.trim() } : {}) } };
  if (o.end.kind === "meeting" && o.end.typeId) f.after.schedule = { tool: "claritia", url: "", perOwner: false, meetingTypeId: o.end.typeId };
  return f;
}

/** The plan as one page or steps, when the owner flips the switch on Screen 2 (no AI): about four questions a step. */
export function planLayout(p: Plan, layout: "page" | "steps"): Plan {
  if (layout === p.layout) return p;
  const items = p.steps.flatMap((s) => s.items);
  if (layout === "page") return { ...p, layout, steps: [{ title: p.steps[0]?.title || p.name, items }], changed: undefined };
  const per = items.length > 8 ? 4 : Math.max(2, Math.ceil(items.length / 2));
  const steps = Array.from({ length: Math.max(1, Math.ceil(items.length / per)) }, (_, i) => ({ title: `Page ${i + 1}`, items: items.slice(i * per, i * per + per) }));
  return { ...p, layout, steps, changed: undefined };
}
