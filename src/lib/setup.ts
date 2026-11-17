// The guided setup after sign-up (src/components/app/Welcome.tsx, docs/signup.md), the pure half: which step shows,
// the team guessed from the email, the first forms to pick from and the invite list. Runs in the browser and in
// tests/setup.test.ts.

import { isFreeTop } from "./email/freeTop.ts";
import { cleanEmail } from "./authLimits.ts";

export const SETUP_STEPS = ["team", "calendar", "form", "invite"] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];
export const isSetupStep = (v: unknown): v is SetupStep => typeof v === "string" && (SETUP_STEPS as readonly string[]).includes(v);

/**
 * The step to show, or null for the app. `stored` is what this computer kept: a step while setup is open, "done" once
 * it's finished or skipped. A new workspace's owner starts it; a step in progress comes back after a calendar sign-in.
 */
export function setupStep(o: { named: boolean | undefined; role: string | null; stored: string | null }): SetupStep | null {
  if (o.stored === "done") return null;
  if (isSetupStep(o.stored)) return o.stored;
  return o.named === false && o.role === "owner" ? "team" : null;
}

/** The next step, or null after the last. */
export const nextStep = (s: SetupStep): SetupStep | null => SETUP_STEPS[SETUP_STEPS.indexOf(s) + 1] ?? null;

// Second-level names that come before the company's own (acme.co.uk, acme.com.au).
const SECOND = new Set(["co", "com", "org", "net", "ac", "gov", "edu"]);

/** A work email's team name and website ("ana@acme-labs.co.uk" is Acme Labs at acme-labs.co.uk). Nothing for free mail. */
export function guessTeam(email: string): { name: string; site: string } {
  const domain = (email.trim().toLowerCase().split("@")[1] ?? "").replace(/\.$/, "");
  if (!domain.includes(".") || isFreeTop(email)) return { name: "", site: "" };
  const labels = domain.split(".");
  const cut = labels.length > 2 && SECOND.has(labels[labels.length - 2]!) ? 3 : 2;
  const own = labels.slice(-cut);
  const word = own[0]!;
  const name = word
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
  return { name, site: own.join(".") };
}

/** The first forms to pick from: a gallery template that books a meeting, and the meeting type made for it. */
export const FIRST_FORMS = [
  { id: "call", label: "Book a call", template: "general.book-a-call", meeting: "intro-call" },
  { id: "demo", label: "Demo request", template: "saas.demo-request", meeting: "product-demo" },
  { id: "consult", label: "Consultation request", template: "consulting.consultation", meeting: "consultation" },
] as const;

/** Typed invite emails: split on commas, spaces and lines, cleaned, once each, never your own, at most 10. */
export function parseInvites(text: string, own: string): string[] {
  const me = own.trim().toLowerCase();
  const out: string[] = [];
  for (const part of text.split(/[\s,;]+/)) {
    const e = cleanEmail(part);
    if (e && e !== me && !out.includes(e)) out.push(e);
  }
  return out.slice(0, 10);
}
