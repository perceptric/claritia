// Form templates (docs/form-builder.md 4.1): the cards a new form starts from, and what the chat builds on when a
// request matches one. Each one passes checkForm.

import { DEFAULT_CONSENT, newId, type Field, type Form } from "./schema.ts";

export type Template = { key: string; name: string; text: string; form: () => Form };

const f = (x: Omit<Field, "id">): Field => ({ id: newId(), ...x });
const base = (fields: Field[], o: Partial<Form> = {}): Form => ({
  steps: [{ id: newId(), fields }],
  rules: [],
  layout: { labels: "above", width: "narrow" },
  submit: { label: "Submit" },
  consent: { mode: "by_region", label: DEFAULT_CONSENT },
  spam: { minSeconds: 2, turnstile: false },
  after: { end: { kind: "message", title: "Thanks, we got it.", text: "We'll be in touch soon." } },
  ...o,
});

const SIZES = ["1-10", "11-50", "51-200", "201-1,000", "1,000+"].map((v) => ({ value: v, label: v }));

export const TEMPLATES: Template[] = [
  {
    key: "demo",
    name: "Demo request",
    text: "Work email, name, company size and what they need.",
    form: () =>
      base(
        [
          f({ key: "email", type: "email", label: "Work email", required: true, check: "work_email" }),
          f({ key: "first_name", type: "text", label: "First name", required: true, width: "half" }),
          f({ key: "last_name", type: "text", label: "Last name", required: true, width: "half" }),
          f({ key: "q.company_size", type: "choice", label: "Company size", required: false, options: SIZES }),
          f({ key: "q.looking_for", type: "textarea", label: "What are you looking for?", required: false }),
        ],
        { submit: { label: "Book a demo" }, after: { end: { kind: "message", title: "Thanks. We'll reach out within a day." } } },
      ),
  },
  {
    key: "contact_sales",
    name: "Contact sales",
    text: "Name, work email, phone and a message.",
    form: () =>
      base(
        [
          f({ key: "name", type: "text", label: "Full name", required: true }),
          f({ key: "email", type: "email", label: "Work email", required: true, check: "work_email" }),
          f({ key: "phone", type: "phone", label: "Phone", required: false }),
          f({ key: "company", type: "text", label: "Company", required: true }),
          f({ key: "q.message", type: "textarea", label: "How can we help?", required: true }),
        ],
        { submit: { label: "Contact sales" } },
      ),
  },
  {
    key: "trial",
    name: "Free trial",
    text: "Email and company, nothing else.",
    form: () =>
      base([f({ key: "email", type: "email", label: "Work email", required: true, check: "work_email" }), f({ key: "company", type: "text", label: "Company", required: false })], {
        submit: { label: "Start free trial" },
      }),
  },
  {
    key: "newsletter",
    name: "Newsletter",
    text: "One email field with the consent box always on.",
    form: () =>
      base([f({ key: "email", type: "email", label: "Email", required: true })], {
        layout: { labels: "inside", width: "narrow" },
        submit: { label: "Subscribe" },
        consent: { mode: "always", label: DEFAULT_CONSENT },
        after: { end: { kind: "message", title: "You're subscribed." } },
      }),
  },
  {
    key: "event",
    name: "Event signup",
    text: "Name, email, company and title, in two steps.",
    form: () => ({
      ...base([]),
      steps: [
        { id: newId(), title: "You", fields: [f({ key: "email", type: "email", label: "Email", required: true }), f({ key: "name", type: "text", label: "Full name", required: true })] },
        { id: newId(), title: "Your work", fields: [f({ key: "company", type: "text", label: "Company", required: true }), f({ key: "title", type: "text", label: "Job title", required: false })] },
      ],
      submit: { label: "Save my seat" },
      after: { end: { kind: "message", title: "You're in. The details are on their way." } },
    }),
  },
  {
    key: "partner",
    name: "Partner application",
    text: "Company, website, where they are, partner type and a note.",
    form: () => {
      // The region list follows the country picked (docs/forms-plan.md 2.2).
      const country = f({ key: "country", type: "country", label: "Country", required: false, width: "half" });
      return base(
        [
          f({ key: "email", type: "email", label: "Work email", required: true, check: "work_email" }),
          f({ key: "company", type: "text", label: "Company", required: true }),
          f({ key: "website", type: "url", label: "Website", required: true }),
          country,
          f({ key: "region", type: "dropdown", label: "State or region", required: false, width: "half", optionsBy: { field: country.id, preset: "regions" } }),
          f({ key: "q.partner_type", type: "choice", label: "Partner type", required: true, options: ["Agency", "Technology", "Reseller"].map((v) => ({ value: v, label: v })) }),
          f({ key: "q.note", type: "textarea", label: "Tell us about your customers", required: false }),
        ],
        { submit: { label: "Apply" } },
      );
    },
  },
  {
    key: "webinar",
    name: "Webinar",
    text: "Name, work email, company and a question for the speakers.",
    form: () =>
      base(
        [
          f({ key: "email", type: "email", label: "Work email", required: true }),
          f({ key: "first_name", type: "text", label: "First name", required: true, width: "half" }),
          f({ key: "last_name", type: "text", label: "Last name", required: true, width: "half" }),
          f({ key: "company", type: "text", label: "Company", required: false }),
          f({ key: "q.question", type: "textarea", label: "A question for the speakers", required: false }),
        ],
        { submit: { label: "Register" }, after: { end: { kind: "message", title: "You're registered. The link is in your inbox." } } },
      ),
  },
  {
    key: "download",
    name: "Gated download",
    text: "Work email, name and job title before the guide.",
    form: () =>
      base(
        [
          f({ key: "email", type: "email", label: "Work email", required: true, check: "work_email" }),
          f({ key: "name", type: "text", label: "Full name", required: true }),
          f({ key: "title", type: "text", label: "Job title", required: false }),
        ],
        { submit: { label: "Get the guide" }, after: { end: { kind: "message", title: "It's on its way to your inbox." } } },
      ),
  },
  {
    key: "job",
    name: "Job application",
    text: "Name, email, phone, the role and a link to their work.",
    form: () =>
      base(
        [
          f({ key: "name", type: "text", label: "Full name", required: true }),
          f({ key: "email", type: "email", label: "Email", required: true }),
          f({ key: "phone", type: "phone", label: "Phone", required: false }),
          f({ key: "q.role", type: "choice", label: "Role", required: true, options: ["Engineering", "Design", "Sales", "Marketing", "Other"].map((v) => ({ value: v, label: v })) }),
          f({ key: "q.portfolio", type: "url", label: "LinkedIn or portfolio", required: false }),
          f({ key: "q.why", type: "textarea", label: "Why do you want to join?", required: false }),
        ],
        { consent: { mode: "off", label: DEFAULT_CONSENT }, submit: { label: "Apply" }, after: { end: { kind: "message", title: "Thanks for applying. We'll be in touch." } } },
      ),
  },
  {
    key: "quote",
    name: "Quote request",
    text: "Company, what they need, seats and plan with a price, and timeline.",
    form: () => {
      // The price works itself out from seats and plan (docs/forms-plan.md 2.3); the server works it out again.
      const seats = f({ key: "q.seats", type: "number", label: "Seats", required: false, width: "half", valid: { min: 1, step: 1 } });
      const plan = f({
        key: "q.plan",
        type: "dropdown",
        label: "Plan",
        required: false,
        width: "half",
        options: [
          { value: "Starter", label: "Starter", score: 20 },
          { value: "Team", label: "Team", score: 40 },
          { value: "Business", label: "Business", score: 80 },
        ],
      });
      return base(
        [
          f({ key: "email", type: "email", label: "Work email", required: true, check: "work_email" }),
          f({ key: "name", type: "text", label: "Full name", required: true, width: "half" }),
          f({ key: "company", type: "text", label: "Company", required: true, width: "half" }),
          f({ key: "q.need", type: "textarea", label: "What do you need?", required: true }),
          seats,
          plan,
          f({ key: "q.estimate", type: "calc", label: "Estimated price a month", required: false, calc: { formula: `{${seats.id}} * {${plan.id}}`, format: "money", currency: "USD", decimals: 0 } }),
          f({ key: "q.timeline", type: "choice", label: "Timeline", required: false, options: ["This month", "This quarter", "Later"].map((v) => ({ value: v, label: v })) }),
        ],
        { submit: { label: "Get a quote" } },
      );
    },
  },
  {
    key: "feedback",
    name: "Feedback",
    text: "A score, what to improve, and an email to follow up.",
    form: () =>
      base(
        [
          f({ key: "q.score", type: "choice", label: "How likely are you to recommend us?", required: true, options: ["0-6", "7-8", "9-10"].map((v) => ({ value: v, label: v })) }),
          f({ key: "q.improve", type: "textarea", label: "What should we improve?", required: false }),
          f({ key: "email", type: "email", label: "Email", required: true }),
        ],
        { consent: { mode: "off", label: DEFAULT_CONSENT }, submit: { label: "Send feedback" }, after: { end: { kind: "message", title: "Thank you. We read every one." } } },
      ),
  },
  {
    key: "waitlist",
    name: "Waitlist",
    text: "Email and company, for early access.",
    form: () =>
      base([f({ key: "email", type: "email", label: "Work email", required: true }), f({ key: "company", type: "text", label: "Company", required: false })], {
        layout: { labels: "inside", width: "narrow" },
        submit: { label: "Join the waitlist" },
        after: { end: { kind: "message", title: "You're on the list." } },
      }),
  },
];

const opts = (list: string[]) => list.map((v) => ({ value: v, label: v }));

/**
 * The six cards in the New form dialog: a name, a few words and how many questions. `book` forms book a call after
 * the submit; the dialog adds the workspace's meeting type when it has one.
 */
export type Starter = { key: string; name: string; text: string; questions: number; book?: boolean; form: () => Form };
export const STARTERS: Starter[] = [
  {
    key: "demo",
    name: "Demo request",
    text: "Work email, company, size",
    questions: 5,
    form: () =>
      base(
        [
          f({ key: "email", type: "email", label: "Work email", required: true, check: "work_email", placeholder: "name@company.com" }),
          f({ key: "name", type: "text", label: "Full name", required: true }),
          f({ key: "company", type: "text", label: "Company", required: true }),
          f({ key: "q.company_size", type: "choice", label: "Company size", required: false, options: SIZES }),
          f({ key: "q.looking_for", type: "textarea", label: "What are you looking for?", required: false }),
        ],
        { title: "Book a demo", submit: { label: "Book a demo", full: true }, after: { end: { kind: "message", title: "Thanks. We'll reach out within a day." } } },
      ),
  },
  {
    key: "contact",
    name: "Contact us",
    text: "Name, email, message",
    questions: 4,
    form: () =>
      base(
        [
          f({ key: "name", type: "text", label: "Full name", required: true }),
          f({ key: "email", type: "email", label: "Email", required: true }),
          f({ key: "company", type: "text", label: "Company", required: false }),
          f({ key: "q.message", type: "textarea", label: "How can we help?", required: true }),
        ],
        { title: "Contact us", submit: { label: "Send", full: true } },
      ),
  },
  {
    key: "audit",
    name: "Free audit",
    text: "Two steps, then book a call",
    questions: 6,
    book: true,
    form: () => ({
      ...base([]),
      title: "Get your free audit",
      steps: [
        { id: newId(), title: "You", fields: [f({ key: "email", type: "email", label: "Work email", required: true, check: "work_email", placeholder: "name@company.com" }), f({ key: "name", type: "text", label: "Full name", required: true }), f({ key: "company", type: "text", label: "Company", required: true })] },
        {
          id: newId(),
          title: "Your company",
          fields: [
            f({ key: "q.company_size", type: "choice", label: "Company size", required: true, options: SIZES }),
            f({ key: "website", type: "url", label: "Website", required: false }),
            f({ key: "q.goal", type: "textarea", label: "What should the audit look at?", required: false }),
          ],
        },
      ],
      submit: { label: "Get my audit", full: true },
      after: { end: { kind: "message", title: "Thanks. We'll send your audit within two working days." } },
    }),
  },
  {
    key: "newsletter",
    name: "Newsletter",
    text: "Email and consent",
    questions: 2,
    form: () =>
      base([f({ key: "email", type: "email", label: "Email", required: true })], {
        title: "Get the newsletter",
        submit: { label: "Subscribe", full: true },
        consent: { mode: "always", label: DEFAULT_CONSENT },
        after: { end: { kind: "message", title: "You're subscribed." } },
      }),
  },
  {
    key: "event",
    name: "Event signup",
    text: "Name, role, session",
    questions: 5,
    form: () =>
      base(
        [
          f({ key: "email", type: "email", label: "Work email", required: true }),
          f({ key: "name", type: "text", label: "Full name", required: true }),
          f({ key: "company", type: "text", label: "Company", required: false }),
          f({ key: "title", type: "text", label: "Your role", required: false }),
          f({ key: "q.session", type: "choice", label: "Which session?", required: true, options: opts(["Morning", "Afternoon"]) }),
        ],
        { title: "Save your seat", submit: { label: "Save my seat", full: true }, after: { end: { kind: "message", title: "You're in. The details are on their way." } } },
      ),
  },
  {
    key: "blank",
    name: "Blank",
    text: "Just an email",
    questions: 1,
    form: () => base([f({ key: "email", type: "email", label: "Work email", required: true, placeholder: "name@company.com" })], { title: "Untitled form", submit: { label: "Submit", full: true } }),
  },
];

/** A captured form starts with the email field mapped to the usual name; the rest is mapped in the builder. */
export function capturedForm(adapter: NonNullable<Form["capture"]>["adapter"] = "html"): Form {
  return {
    ...base([f({ key: "email", type: "email", label: "Email", required: true, source: "email" })], { consent: { mode: "off", label: DEFAULT_CONSENT }, spam: { minSeconds: 0, turnstile: false } }),
    capture: { adapter },
  };
}
