// Lifecycle journeys for a SaaS team (docs/email-plan.md Part 8): the build screen reads what the workspace has (the
// product's events, date fields, meetings) and makes one draft workflow per lifecycle moment, grouped by stage. A
// journey whose signal the workspace doesn't send is left out, so nothing starts on an event that never comes. Every
// email starts unapproved: a person reads it before it can go. Runs anywhere.

import { emptyEmail, newStepId, type Body, type EmailBody, type Step } from "./types.ts";

export type Stage = "trial" | "pipeline" | "customer";
export const STAGES: { value: Stage; label: string }[] = [
  { value: "trial", label: "Trial" },
  { value: "pipeline", label: "Pipeline" },
  { value: "customer", label: "Customer" },
];

export type Facts = {
  events: { name: string; people: number }[];
  stages: Record<string, number>;
  contacts: number;
  meetings: number;
  journeys: { id: string; journey: string | null; stage: Stage }[];
};

/** What each product signal means, found by name. The first match is the most used one. */
export type Signals = { start?: string; activate?: string; invite?: string; upgrade?: string; cancel?: string };
const SIGNAL: Record<keyof Signals, RegExp> = {
  start: /(sign.?up|signed.?up|trial.?start|start.?trial|register|account.?created|created.?account|onboarding.?start)/i,
  activate: /(connect|integrat|import|install|first.?(report|project|dashboard|workflow|campaign)|created.?(project|report|dashboard|workflow)|activat|setup.?complete|onboarding.?(done|complete))/i,
  invite: /(invite|teammate|added.?user|add.?member)/i,
  upgrade: /(limit|quota|seat|upgrade.?click|plan.?limit|usage.?high)/i,
  cancel: /(cancel|churn|downgrad|subscription.?ended|deactivat)/i,
};
export function pickSignals(events: { name: string }[]): Signals {
  const out: Signals = {};
  for (const k of Object.keys(SIGNAL) as (keyof Signals)[]) {
    const hit = events.find((e) => SIGNAL[k].test(e.name) && !Object.values(out).includes(e.name));
    if (hit) out[k] = hit.name;
  }
  return out;
}

export type Journey = { key: string; name: string; stage: Stage; line: string; body: Body };

type NoId<T> = T extends unknown ? Omit<T, "id"> : never;
const s = (x: NoId<Step>): Step => ({ id: newStepId(), ...x }) as Step;
const HI = "Hi {{first_name|there}},";
const mail = (subject: string, preheader: string, paragraphs: string[], cta?: [string, string]): EmailBody => ({ ...emptyEmail(), subject, preheader, paragraphs, cta_label: cta?.[0] ?? "", cta_url: cta?.[1] ?? "" });
const email = (e: EmailBody, from: "team" | "owner" = "team"): Step => s({ kind: "email", email: e, from, approved: false });
const wait = (days: number, hours = 0): Step => s({ kind: "wait", days, hours });

/**
 * The journeys this workspace can run. `site`: the product's address for buttons. `trialEnd`: a contact date field
 * that holds the trial's end, when there is one. `booking`: the team's booking page.
 */
export function planJourneys(f: Facts, o: { brand: string; site: string; trialEnd?: string | null; booking?: string | null }): Journey[] {
  const sig = pickSignals(f.events);
  const app = o.site || "https://";
  const book = o.booking || app;
  const name = o.brand || "us";
  const out: Journey[] = [];

  // Trial: from the first sign-up to the moment they get value.
  if (sig.start) {
    const welcome = email(mail(`Your ${name} account is ready`, "The first step takes two minutes.", [HI, `Thanks for trying ${name}. The first step is the one that matters most, and most teams finish it in two minutes.`], ["Get started", app]));
    const steps: Step[] = [welcome, wait(1)];
    if (sig.activate) {
      steps.push(
        s({
          kind: "wait_until",
          event: "product.used",
          name: sig.activate,
          days: 2,
          yes: sig.invite
            ? [email(mail(`${name} works better with your team`, "Invite the people who ask you for updates.", [HI, "Nice work, you're set up. Invite the people who usually ask you for updates. They get their own view and stop waiting on you."], ["Invite your team", app]))]
            : [email(mail("Here's what to try next", "One more step most teams take in week one.", [HI, "You're set up. Here's the next thing most teams try in their first week."], ["Try it", app]))],
          no: [
            email(mail("Want a hand getting set up?", "Reply and I'll send the exact steps.", [HI, "It looks like you haven't finished setting up yet. Reply with where you're stuck and I'll send the exact steps, or pick a time and we'll do it together."], ["Pick a time", book]), "owner"),
            wait(3),
            email(mail("The two-minute version", "The shortest way to your first result.", [HI, `Here's the shortest path to your first result in ${name}. It takes about two minutes.`], ["Start now", app])),
          ],
        }),
      );
    } else steps.push(email(mail("Three things to try this week", "What teams like yours set up first.", [HI, "Here are the three things teams like yours set up in their first week."], ["Open your account", app])), wait(3), email(mail("How's it going?", "Reply with one question and I'll answer it.", [HI, "How's your first week going? Reply with one question and I'll answer it personally."]), "owner"));
    out.push({ key: "trial_onboarding", name: "Trial onboarding", stage: "trial", line: `Starts on "${sig.start}"`, body: { trigger: { kind: "product", events: [sig.start] }, steps, goals: [{ kind: "lifecycle", stages: ["customer"] }], entry: { mode: "once", gapDays: 30 } } });
  }
  if (o.trialEnd) {
    out.push({
      key: "trial_ending",
      name: "Trial ending",
      stage: "trial",
      line: "3 days before the trial ends",
      body: {
        trigger: { kind: "date", field: o.trialEnd, days: -3, time: "10:00" },
        steps: [
          email(mail("Keep what you've built", "Your trial ends in 3 days.", [HI, `Your ${name} trial ends in 3 days. Pick a plan to keep everything your team set up.`], ["Choose a plan", app])),
          wait(2),
          email(mail("Your trial ends tomorrow", "Your work stays saved for 30 days.", [HI, "Your trial ends tomorrow. Your work stays saved for 30 days, so nothing is lost. If you need more time to decide, reply and I'll add a week."]), "owner"),
        ],
        goals: [{ kind: "lifecycle", stages: ["customer"] }],
        entry: { mode: "once", gapDays: 30 },
      },
    });
  }

  // Pipeline: when someone is ready to talk, or nearly booked.
  out.push({
    key: "ready_for_sales",
    name: "Ready for sales",
    stage: "pipeline",
    line: "When the score turns hot",
    body: {
      trigger: { kind: "band", bands: ["hot"] },
      steps: [
        s({ kind: "slack", to: "owner", text: "A lead's score just turned hot. They got a note from you with a link to pick a time." }),
        email(mail("Want a hand rolling this out?", "Happy to set up the rest of your team.", [HI, "I saw your team has been busy lately. If you're planning to roll this out further, I can help set things up. Want to pick a time?"], ["Pick a time", book]), "owner"),
        s({ kind: "wait_until", event: "meeting.booked", days: 3, yes: [], no: [email(mail("One quick question", "Who else on your team should see this?", [HI, "One quick question: who else on your team should see what you've set up? I can send them access."]), "owner")] }),
      ],
      goals: [{ kind: "meeting_booked" }],
      entry: { mode: "once", gapDays: 60 },
    },
  });
  out.push({
    key: "missed_demo",
    name: "Missed demo",
    stage: "pipeline",
    line: "When someone misses a booked meeting",
    body: {
      trigger: { kind: "meeting", events: ["no_show"], types: [] },
      steps: [
        wait(0, 1),
        email(mail("Sorry we missed you", "Here's a link to pick a new time.", [HI, "Looks like today's time didn't work out. No problem. Pick any time that suits you."], ["Pick a new time", book]), "owner"),
        s({ kind: "wait_until", event: "meeting.booked", days: 2, yes: [], no: [email(mail("Still want to talk?", "Here's the link again.", [HI, "Still keen to talk? Here's the link to pick a time again."], ["Pick a time", book]), "owner")] }),
      ],
      goals: [{ kind: "meeting_booked" }],
      entry: { mode: "repeat", gapDays: 7 },
    },
  });
  out.push({
    key: "form_not_booked",
    name: "Form, no meeting",
    stage: "pipeline",
    line: "When a lead sends a form but doesn't book",
    body: {
      trigger: { kind: "not_booked", forms: [] },
      steps: [wait(0, 2), email(mail("Picking a time", "Here's the link to book.", [HI, "Thanks for reaching out. You were picking a time earlier, so here's the link again."], ["Pick a time", book]), "owner")],
      goals: [{ kind: "meeting_booked" }],
      entry: { mode: "once", gapDays: 30 },
    },
  });

  // Customer: growth and coming back.
  if (sig.upgrade) {
    out.push({
      key: "expansion",
      name: "Room to grow",
      stage: "customer",
      line: `Starts on "${sig.upgrade}"`,
      body: {
        trigger: { kind: "product", events: [sig.upgrade] },
        steps: [email(mail("You're close to your plan's limit", "Add room before someone gets stuck.", [HI, "Your team is close to its plan's limit. Add room now so nobody gets stuck waiting."], ["See plans", app]))],
        goals: [],
        entry: { mode: "repeat", gapDays: 30 },
      },
    });
  }
  if (sig.cancel) {
    out.push({
      key: "win_back",
      name: "Win-back",
      stage: "customer",
      line: `30 days after "${sig.cancel}"`,
      body: {
        trigger: { kind: "product", events: [sig.cancel] },
        steps: [
          wait(30),
          email(mail("What changed since you left", "The things teams asked for most.", [HI, `A lot has changed in ${name} since you left. Here are the things teams asked for most.`], ["See what's new", app])),
          wait(14),
          email(mail("Your work is still here", "Pick up where you left off.", [HI, "Your work is still saved. If you'd like to pick up where you left off, reply and I'll turn your account back on."]), "owner"),
        ],
        goals: [{ kind: "lifecycle", stages: ["customer"] }],
        entry: { mode: "once", gapDays: 90 },
      },
    });
  }
  return out;
}

/** Every email in a body, in order, with its step. */
export function journeyEmails(steps: Step[]): Extract<Step, { kind: "email" }>[] {
  return steps.flatMap((x) => (x.kind === "email" ? [x] : x.kind === "branch" || x.kind === "wait_until" ? [...journeyEmails(x.yes), ...journeyEmails(x.no)] : x.kind === "split" ? [...journeyEmails(x.a), ...journeyEmails(x.b)] : []));
}
