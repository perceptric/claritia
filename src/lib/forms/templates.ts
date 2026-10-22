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
    text: "Company, website, partner type and a note.",
    form: () =>
      base(
        [
          f({ key: "email", type: "email", label: "Work email", required: true, check: "work_email" }),
          f({ key: "company", type: "text", label: "Company", required: true }),
          f({ key: "website", type: "url", label: "Website", required: true }),
          f({ key: "q.partner_type", type: "choice", label: "Partner type", required: true, options: ["Agency", "Technology", "Reseller"].map((v) => ({ value: v, label: v })) }),
          f({ key: "q.note", type: "textarea", label: "Tell us about your customers", required: false }),
        ],
        { submit: { label: "Apply" } },
      ),
  },
];
