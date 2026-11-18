// The getting-started emails (src/lib/tips/mail.ts) with sample data, for a look before a change ships.
//   node scripts/tips-previews.ts   writes email-previews/tips-*.html and .txt (ignored by git)
import { mkdirSync, writeFileSync } from "node:fs";
import { awayMail, calendarMail, followupMail, formMail, helpMail, limitMail, responsesMail, shareMail, teamMail, welcomeMail } from "../src/lib/tips/mail.ts";
import { TEMPLATE_COUNT } from "../src/lib/tips/plan.ts";

const app = "https://app.tryclaritia.com";
const foot = { unsubscribe: `${app}/api/email/tips?t=sample`, settings: `${app}/settings/profile` };

export const samples = {
  "01-welcome": welcomeMail(
    {
      name: "Ana Lima",
      workspace: "Northwind Studio",
      steps: [
        { title: "Set up your workspace", done: true },
        { title: "Build your first form", line: "Describe it in a sentence or pick a template", done: true },
        { title: "Share it or add it to your site", line: "Send the link or paste it on a page", done: false },
        { title: "Connect your calendar", line: "So people only book times you're free", done: false },
        { title: "Turn on a follow-up email", line: "A workflow writes to every new lead", done: false },
        { title: "Invite your team", line: "Teammates who build forms are free", done: false },
      ],
      url: `${app}/forms`,
    },
    foot,
  ),
  "02-form": formMail({ templates: TEMPLATE_COUNT, url: `${app}/forms/new`, templatesUrl: `${app}/forms/templates` }, foot),
  "03-share": shareMail({ form: "Demo request", live: true, link: `${app}/f/northwind/demo-request`, url: `${app}/forms/0f8fad5b-d9cb-469f-a165-70867728950e` }, foot),
  "04-responses": responsesMail(
    {
      responses: 7,
      meetings: 3,
      live: 2,
      latest: [
        { form: "Demo request", when: "Thu 3:12 PM" },
        { form: "Demo request", when: "Thu 11:40 AM" },
        { form: "Consultation request", when: "Wed 4:05 PM" },
      ],
      url: `${app}/forms`,
    },
    foot,
  ),
  "05-calendar": calendarMail({ day: "Tuesday, Nov 24", url: `${app}/scheduling/availability/calendars` }, foot),
  "06-followup": followupMail({ ready: ["Form not booked", "Missed demo", "Ready for sales"], url: `${app}/emails/automations` }, foot),
  "07-team": teamMail(
    {
      you: "Ana Lima",
      workspace: "Northwind Studio",
      perks: [
        { main: "Build and edit forms together", plan: "Free" },
        { main: "Group meetings and polls", plan: "Starter" },
        { main: "Round robin across the team", plan: "Pro" },
      ],
      url: `${app}/settings/team`,
    },
    foot,
  ),
  "08-limit": limitMail(
    {
      used: 212,
      cap: 250,
      resets: "Dec 1",
      cols: ["Free", "Starter", "Pro"],
      rows: [
        { label: "Responses a month", values: ["250", "2,000", "5,000"] },
        { label: "Meeting types", values: ["1", "Unlimited", "Unlimited"] },
        { label: "Calendars per seat", values: ["1", "6", "6"] },
        { label: "Price per seat", values: ["$0", "$15", "$39"] },
      ],
      pick: 1,
      price: 15,
      yearlyOff: 20,
      url: `${app}/settings/billing`,
    },
    foot,
  ),
  "09-help": helpMail({ url: `${app}/forms`, sign: null }, foot),
  "10-away": awayMail(
    {
      responses: 14,
      meetings: 3,
      upcoming: 2,
      since: "Nov 2",
      latest: [
        { form: "Demo request", when: "Mon 9:20 AM" },
        { form: "Consultation request", when: "Sun 6:48 PM" },
        { form: "Demo request", when: "Fri 2:15 PM" },
      ],
      url: `${app}/forms`,
    },
    foot,
  ),
};

if (import.meta.main) {
  mkdirSync("email-previews", { recursive: true });
  for (const [name, m] of Object.entries(samples)) {
    writeFileSync(`email-previews/tips-${name}.html`, m.html);
    writeFileSync(`email-previews/tips-${name}.txt`, `Subject: ${m.subject}\n\n${m.text}\n`);
  }
  console.log(`Wrote ${Object.keys(samples).length} previews to email-previews/.`);
}
