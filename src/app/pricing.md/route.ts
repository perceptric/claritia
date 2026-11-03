import { amount, PLANS } from "@/lib/plans";
import { APP_URL, CONTACT_EMAIL } from "@/lib/site";

export const dynamic = "force-static";

/** Pricing as plain Markdown, for AI agents and people comparing tools. Built from the plan list (docs/pricing.md). */
export function GET() {
  const money = (n: number) => `$${n}`;
  const row = (label: string, f: (p: (typeof PLANS)[number]) => string) => `| ${label} | ${PLANS.map(f).join(" | ")} |`;
  const text = `# Claritia pricing

Claritia is forms, meetings and workflows: forms that turn visitors into leads, meetings that book them with the right person, and workflows that send the reminders and follow-ups.

Each plan is priced per seat. A seat is a teammate people can book a meeting with. Everyone who builds forms, edits workflows or reads results is free.

| | ${PLANS.map((p) => p.name).join(" | ")} |
|---|${PLANS.map(() => "---|").join("")}
${row("Price per seat/month", (p) => money(p.monthly))}
${row("Price per seat/month, billed yearly", (p) => money(p.yearly))}
${row("Seats", (p) => (p.id === "free" ? "1" : "Unlimited"))}
${row("Submissions/month", (p) => amount(p.submissions))}
${row("AI credits/month", (p) => amount(p.aiCredits))}
${row("Calendars per seat", (p) => amount(p.calendars))}
${row("Meeting types", (p) => amount(p.meetingTypes))}

- Unlimited forms and editors on every plan.
- Past 250 submissions on Free, forms keep working and every submission is saved. Submissions past 250 show after an upgrade or on the 1st.
- An AI credit is one thing Tia does for you: a small change is 1 credit, a whole new form is 10.
- Billed monthly, or yearly at 20% off. Change or cancel any time from Settings › Billing.
- Questions: ${CONTACT_EMAIL}.

Every feature: https://tryclaritia.com/pricing
Start free: ${APP_URL}
`;
  return new Response(text, { headers: { "content-type": "text/markdown; charset=utf-8" } });
}
