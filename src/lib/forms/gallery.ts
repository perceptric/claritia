// The template gallery (docs/interactive-forms-plan.md Part 6): 12 static forms that collect answers and 12
// interactive ones that turn answers into a price, a score, a plan or a match. Each passes checkForm, and each
// interactive one carries a test example (answers in, numbers and outcome out) that tests/formGallery.test.ts runs
// through the same engine the browser and the server use. Every number here is an example for the owner to change,
// never a benchmark or a price list.

import { DEFAULT_CONSENT, newId, type Choice, type Constant, type Field, type Form, type Outcome, type ResultBlock, type Step } from "./schema.ts";

export type Goal = "leads" | "price" | "recommend" | "assess" | "feedback" | "book";
export type Example = { answers: Record<string, unknown>; values?: Record<string, number | null>; outcome?: string; constants?: Record<string, number> };
export type GalleryTemplate = {
  key: string;
  name: string;
  text: string;
  kind: "static" | "interactive";
  goal: Goal;
  /** Square tags on the card: what the template does. */
  tags: string[];
  /** The card's drawing: fields, a price, a meter, picture cards, a checklist or times. */
  thumb: "fields" | "price" | "metric" | "meter" | "cards" | "check" | "slots";
  /** Books a meeting after the send: the gallery adds the workspace's meeting type. */
  book?: boolean;
  featured?: boolean;
  form: () => Form;
  /** Test examples by field key; checked in tests and loaded by Try it in the gallery's preview. */
  examples?: Example[];
};

// Builders ------------------------------------------------------------------------------------------------------------

const f = (x: Omit<Field, "id"> & { id?: string }): Field => ({ id: x.id ?? newId(), ...x }) as Field;
const opts = (list: string[]): Choice[] => list.map((v) => ({ value: v, label: v }));
const scored = (list: [string, number][]): Choice[] => list.map(([label, score]) => ({ value: label.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40), label, score }));
const yesNo = (): Choice[] => [
  { value: "yes", label: "Yes", score: 1 },
  { value: "no", label: "No", score: 0 },
  // No score: an unknown answer stays unknown, so a total that needs it stays empty.
  { value: "not_sure", label: "Not sure" },
];
const step = (fields: Field[], title?: string, more: Partial<Step> = {}): Step => ({ id: newId(), ...(title ? { title } : {}), fields, ...more });
const result = (kind: ResultBlock["kind"], o: { label?: string; field?: Field; fields?: Field[]; max?: number } = {}): Field =>
  f({
    key: `c.${newId()}` as Field["key"],
    type: "result",
    label: o.label ?? "",
    required: false,
    result: { kind, ...(o.field ? { field: o.field.id } : {}), ...(o.fields ? { fields: o.fields.map((x) => x.id) } : {}), ...(o.max ? { max: o.max } : {}) },
  });
const calc = (key: string, label: string, formula: string, more: Partial<NonNullable<Field["calc"]>> = {}): Field => f({ key: key as Field["key"], type: "calc", label, required: false, calc: { formula, ...more } });
const ref = (x: Field) => `{${x.id}}`;
const email = (label = "Email", required = true) => f({ key: "email", type: "email", label, required });

const base = (steps: Step[], o: Partial<Form> = {}): Form => ({
  steps,
  rules: [],
  layout: { labels: "above", width: "narrow" },
  submit: { label: "Submit" },
  consent: { mode: "by_region", label: DEFAULT_CONSENT },
  spam: { minSeconds: 2, turnstile: false },
  after: { end: { kind: "message", title: "Thanks, we got it.", text: "We'll be in touch soon." } },
  ...o,
});
/** An interactive form: screens, a cover, single picks move on, results shown as soon as they're worked out. */
const screens = (cover: { title: string; text?: string; button?: string }, steps: Step[], o: Partial<Form> = {}): Form =>
  base(steps, { layout: { labels: "above", width: "wide", mode: "screens", auto: true, cover }, ...o });
const outcomes = (list: Outcome[], show: NonNullable<Form["results"]>["show"] = "instant"): Form["results"] => ({ outcomes: list, show });
const when = (logic: "all" | "any", ...conds: NonNullable<Outcome["when"]>["conds"]) => ({ logic, conds });
const contactStep = (title = "Where should we send it?") => step([email("Email"), f({ key: "name", type: "text", label: "Full name", required: false }), result("email")], title);

const SIZES = opts(["1-10", "11-50", "51-200", "201-1,000", "1,000+"]);

// Static ------------------------------------------------------------------------------------------------------------

const STATIC: GalleryTemplate[] = [
  {
    key: "contact_us",
    name: "Contact us",
    text: "Topic routes the message to the right person.",
    kind: "static",
    goal: "leads",
    tags: ["Routing"],
    thumb: "fields",
    featured: true,
    form: () =>
      base([
        step([
          f({ key: "name", type: "text", label: "Full name", required: true }),
          email(),
          f({ key: "company", type: "text", label: "Company", required: false }),
          f({ key: "q.topic", type: "dropdown", label: "Topic", required: true, options: opts(["Sales", "Support", "Partnership", "Other"]) }),
          f({ key: "q.message", type: "textarea", label: "Message", required: true }),
        ]),
      ], { submit: { label: "Send message" }, after: { end: { kind: "message", title: "Thanks, your message is in.", text: "The right person will reply by email." } } }),
  },
  {
    key: "request_demo",
    name: "Request a demo",
    text: "The lead first, then the rep's calendar.",
    kind: "static",
    goal: "book",
    tags: ["Booking"],
    thumb: "fields",
    book: true,
    featured: true,
    form: () =>
      base(
        [
          step([email("Work email"), f({ key: "name", type: "text", label: "Full name", required: true }), f({ key: "company", type: "text", label: "Company", required: false }), f({ key: "website", type: "url", label: "Website", required: false })], "You"),
          step(
            [
              f({ key: "title", type: "text", label: "Your role", required: false }),
              f({ key: "q.team_size", type: "choice", label: "Team size", required: false, options: SIZES }),
              f({ key: "q.interests", type: "multi", label: "What do you want to see?", required: false, options: opts(["Forms", "Booking", "Routing", "Reporting"]) }),
              f({ key: "q.requirements", type: "textarea", label: "Anything we should know?", required: false }),
            ],
            "Your needs",
          ),
        ],
        { submit: { label: "Request demo" }, after: { end: { kind: "message", title: "Request received.", text: "Pick a time next, or we'll email you." } } },
      ),
  },
  {
    key: "consultation",
    name: "Book a consultation",
    text: "A few questions, then a time.",
    kind: "static",
    goal: "book",
    tags: ["Booking"],
    thumb: "slots",
    book: true,
    featured: true,
    form: () =>
      base([
        step([
          email(),
          f({ key: "name", type: "text", label: "Full name", required: true }),
          f({ key: "q.service", type: "choice", label: "What's it about?", required: true, options: opts(["Getting started", "A specific project", "Something else"]) }),
          f({ key: "q.context", type: "textarea", label: "A little context", required: false }),
          f({ key: "phone", type: "phone", label: "Phone", required: false }),
        ]),
      ], { submit: { label: "Continue to times" } }),
  },
  {
    key: "request_quote",
    name: "Request a quote",
    text: "Scope, timeline and budget for a human to price.",
    kind: "static",
    goal: "price",
    tags: [],
    thumb: "fields",
    featured: true,
    form: () =>
      base(
        [
          step(
            [
              f({ key: "q.project_type", type: "choice", label: "Project type", required: true, options: opts(["New project", "Ongoing work", "One-off fix"]) }),
              f({ key: "q.scope", type: "textarea", label: "What's in scope?", required: true }),
              f({ key: "q.quantity", type: "number", label: "Quantity or size", required: false, valid: { min: 0 } }),
              f({ key: "q.timeline", type: "choice", label: "Timeline", required: false, options: opts(["This month", "This quarter", "Later"]) }),
              f({ key: "q.budget", type: "choice", label: "Budget", required: false, options: opts(["Under $5,000", "$5,000 to $20,000", "Over $20,000", "Not sure"]) }),
            ],
            "The project",
          ),
          step([email(), f({ key: "name", type: "text", label: "Full name", required: true }), f({ key: "company", type: "text", label: "Company", required: false })], "You"),
        ],
        { submit: { label: "Request quote" }, after: { end: { kind: "message", title: "Thanks. We'll price it and reply by email." } } },
      ),
  },
  {
    key: "newsletter",
    name: "Newsletter signup",
    text: "Email, topics and a clear opt-in.",
    kind: "static",
    goal: "leads",
    tags: [],
    thumb: "fields",
    form: () =>
      base([step([email(), f({ key: "first_name", type: "text", label: "First name", required: false }), f({ key: "q.topics", type: "multi", label: "Topics", required: false, options: opts(["Product news", "Guides", "Events"]) })])], {
        submit: { label: "Subscribe" },
        consent: { mode: "always", label: DEFAULT_CONSENT, required: true },
        after: { end: { kind: "message", title: "You're subscribed." } },
      }),
  },
  {
    key: "download",
    name: "Download a resource",
    text: "Email before the guide, with an optional opt-in.",
    kind: "static",
    goal: "leads",
    tags: [],
    thumb: "fields",
    form: () =>
      base([step([email("Work email"), f({ key: "name", type: "text", label: "Full name", required: false }), f({ key: "company", type: "text", label: "Company", required: false })])], {
        submit: { label: "Get the guide" },
        after: { end: { kind: "message", title: "It's on its way to your inbox." } },
      }),
  },
  {
    key: "event",
    name: "Event registration",
    text: "Session, format and access needs.",
    kind: "static",
    goal: "leads",
    tags: [],
    thumb: "fields",
    featured: true,
    form: () =>
      base([
        step([
          email(),
          f({ key: "name", type: "text", label: "Full name", required: true }),
          f({ key: "company", type: "text", label: "Organization", required: false }),
          f({ key: "q.session", type: "choice", label: "Session", required: true, options: opts(["Morning", "Afternoon"]) }),
          f({ key: "q.format", type: "choice", label: "How will you join?", required: true, options: opts(["In person", "Online"]) }),
          f({ key: "q.access", type: "textarea", label: "Access needs", required: false }),
        ]),
      ], { submit: { label: "Register" }, after: { end: { kind: "message", title: "You're registered. Details are in your inbox." } } }),
  },
  {
    key: "application",
    name: "Application",
    text: "Who they are and why, held for review.",
    kind: "static",
    goal: "leads",
    tags: [],
    thumb: "fields",
    form: () =>
      base(
        [
          step([email(), f({ key: "name", type: "text", label: "Full name", required: true }), f({ key: "company", type: "text", label: "Company", required: false }), f({ key: "website", type: "url", label: "Website or portfolio", required: false })], "You"),
          step([f({ key: "q.why", type: "textarea", label: "Why are you applying?", required: true }), f({ key: "q.experience", type: "choice", label: "Experience", required: true, options: opts(["Under 2 years", "2 to 5 years", "Over 5 years"]) })], "Your application"),
        ],
        { submit: { label: "Submit application" }, after: { end: { kind: "message", title: "Application received.", text: "We'll review it and reply by email." } } },
      ),
  },
  {
    key: "intake",
    name: "Client intake",
    text: "Context, goals and timeline before kickoff.",
    kind: "static",
    goal: "book",
    tags: ["Booking"],
    thumb: "fields",
    book: true,
    featured: true,
    form: () =>
      base(
        [
          step([email(), f({ key: "name", type: "text", label: "Full name", required: true }), f({ key: "company", type: "text", label: "Company", required: true }), f({ key: "q.team_size", type: "choice", label: "Team size", required: false, options: SIZES })], "Your business"),
          step([f({ key: "q.tools", type: "textarea", label: "Tools you use today", required: false }), f({ key: "q.challenges", type: "textarea", label: "The biggest challenge", required: true })], "Today"),
          step([f({ key: "q.outcome", type: "textarea", label: "What does success look like?", required: true }), f({ key: "q.timeline", type: "choice", label: "Timeline", required: false, options: opts(["As soon as possible", "Next month", "Next quarter"]) })], "Goals"),
        ],
        { submit: { label: "Send intake" }, after: { end: { kind: "message", title: "Thanks. Pick a kickoff time next." } } },
      ),
  },
  {
    key: "feedback",
    name: "Feedback survey",
    text: "Rating, comments and whether they want a reply.",
    kind: "static",
    goal: "feedback",
    tags: [],
    thumb: "meter",
    form: () => {
      // Every submission lands on a contact today, so the email is required; anonymous feedback comes later.
      return base([step([f({ key: "q.rating", type: "rating", label: "How was it?", required: true, rating: { scale: 5, style: "stars" } }), f({ key: "q.improve", type: "textarea", label: "What should we improve?", required: false }), f({ key: "q.follow_up", type: "checkbox", label: "I'd like a reply", required: false }), email()])], {
        consent: { mode: "off", label: DEFAULT_CONSENT },
        submit: { label: "Send feedback" },
        after: { end: { kind: "message", title: "Thanks for the feedback." } },
      });
    },
  },
  {
    key: "waitlist",
    name: "Join the waitlist",
    text: "Email, what they'd use it for, and when.",
    kind: "static",
    goal: "leads",
    tags: [],
    thumb: "fields",
    form: () =>
      base([
        step([
          email(),
          f({ key: "q.use", type: "textarea", label: "What would you use it for?", required: false }),
          f({ key: "title", type: "text", label: "Your role", required: false }),
          f({ key: "q.needs", type: "multi", label: "What do you need most?", required: false, options: opts(["Speed", "Price", "Support", "Integrations"]) }),
          f({ key: "q.timing", type: "choice", label: "When would you start?", required: false, options: opts(["Right away", "In a few months", "Just looking"]) }),
        ]),
      ], { submit: { label: "Join the waitlist" }, after: { end: { kind: "message", title: "You're on the list." } } }),
  },
  {
    key: "referral",
    name: "Refer someone",
    text: "Who they're referring and why; nobody is subscribed.",
    kind: "static",
    goal: "leads",
    tags: [],
    thumb: "fields",
    form: () =>
      base(
        [
          step([f({ key: "name", type: "text", label: "Your name", required: true }), email("Your email")], "You"),
          step(
            [
              f({ key: "q.ref_name", type: "text", label: "Their name", required: true }),
              f({ key: "q.ref_email", type: "email", label: "Their email", required: true }),
              f({ key: "q.ref_company", type: "text", label: "Their company", required: false }),
              f({ key: "q.reason", type: "textarea", label: "Why are they a fit?", required: false }),
              f({ key: "q.intro", type: "choice", label: "How should we reach out?", required: false, options: opts(["Introduce us by email", "Mention you referred them", "Don't mention me"]) }),
            ],
            "Who you're referring",
          ),
        ],
        { consent: { mode: "off", label: DEFAULT_CONSENT }, submit: { label: "Send referral" }, after: { end: { kind: "message", title: "Thanks for the referral." } } },
      ),
  },
];

// Interactive ---------------------------------------------------------------------------------------------------------

const INTERACTIVE: GalleryTemplate[] = [
  {
    key: "roi",
    name: "ROI & savings calculator",
    text: "Time saved, value and payback from team and costs.",
    kind: "interactive",
    goal: "price",
    tags: ["Price", "Booking"],
    thumb: "metric",
    featured: true,
    form: () => {
      const team = f({ id: "team", key: "q.team_size", type: "number", label: "How many people do this work?", required: true, slider: true, valid: { min: 1, max: 500, step: 1 } });
      const hours = f({ id: "hours", key: "q.hours", type: "number", label: "Hours each a month", required: true, slider: true, valid: { min: 0, max: 160, step: 1 } });
      const cost = f({ id: "cost", key: "q.hourly_cost", type: "number", label: "Hourly cost", required: true, unit: "money", valid: { min: 0 } });
      const cut = f({ id: "cut", key: "q.reduction", type: "number", label: "Work it would take off their plate", required: true, slider: true, unit: "percent", valid: { min: 0, max: 100, step: 5 } });
      const curHours = calc("q.current_hours", "Hours a month today", `${ref(team)} * ${ref(hours)}`, { show: false });
      const freed = calc("q.hours_freed", "Hours freed a month", `${ref(curHours)} * ${ref(cut)} / 100`, { show: false });
      const grossM = calc("q.value_month", "Value a month", `${ref(freed)} * ${ref(cost)}`, { format: "money", decimals: 0, show: false });
      const grossY = calc("q.value_year", "Value a year", `${ref(grossM)} * 12`, { format: "money", decimals: 0, show: false });
      const invest = calc("q.cost_year", "First-year cost", "{@monthly_cost} * 12 + {@setup_cost}", { format: "money", decimals: 0, show: false });
      const net = calc("q.net_year", "First-year net value", `${ref(grossY)} - ${ref(invest)}`, { format: "money", decimals: 0, show: false });
      const roi = calc("q.roi", "First-year ROI", `${ref(net)} / ${ref(invest)} * 100`, { format: "percent", decimals: 0, show: false });
      const netM = calc("q.net_month", "Net value a month", `${ref(grossM)} - {@monthly_cost}`, { format: "money", decimals: 0, show: false });
      // No payback when the monthly net isn't positive: dividing by zero leaves it empty, never a made-up number.
      const payback = calc("q.payback", "Months to pay back setup", `{@setup_cost} / if(${ref(netM)} > 0, ${ref(netM)}, 0)`, { decimals: 1, show: false });
      return screens(
        { title: "What would it be worth?", text: "Four questions. Your numbers stay yours.", button: "Start" },
        [
          step([team, hours, cost, curHours, freed, grossM, grossY, invest, net, roi, netM, payback]),
          step([cut]),
          step([result("metric", { label: "Value of time freed, a month", field: grossM }), result("metric", { label: "First-year net value", field: net }), result("metric", { label: "First-year ROI", field: roi }), result("bars", { fields: [grossY, invest] }), result("outcome")], "Your result", { result: true }),
          contactStep(),
        ],
        {
          constants: [
            { id: "monthly_cost", name: "Monthly price", value: 500, format: "money" },
            { id: "setup_cost", name: "Setup cost", value: 2000, format: "money" },
          ],
          results: outcomes([
            { id: "more", title: "Fill in every number to see your result", when: when("all", { field: roi.id, op: "empty" }) },
            { id: "pays", title: "Worth a closer look", text: "Book a call to check these numbers against your setup.", when: when("all", { field: net.id, op: "gt", value: "0" }) },
            { id: "not_yet", title: "It doesn't pay back on these numbers", text: "Change the numbers, or talk to us about a smaller start." },
          ]),
          submit: { label: "Send my results" },
        },
      );
    },
    examples: [
      {
        answers: { team: "50", hours: "5", cost: "30", cut: "40" },
        values: { "q.current_hours": 250, "q.hours_freed": 100, "q.value_month": 3000, "q.value_year": 36000, "q.cost_year": 8000, "q.net_year": 28000, "q.roi": 350, "q.net_month": 2500, "q.payback": 0.8 },
        outcome: "pays",
      },
      { answers: { team: "1", hours: "2", cost: "20", cut: "10" }, values: { "q.net_month": -496, "q.payback": null }, outcome: "not_yet" },
    ],
  },
  {
    key: "instant_quote",
    name: "Instant quote",
    text: "A price from service, size and extras.",
    kind: "interactive",
    goal: "price",
    tags: ["Price", "Booking"],
    thumb: "price",
    book: true,
    featured: true,
    form: () => {
      const svc = f({ id: "svc", key: "q.service", type: "choice", label: "What do you need?", required: true, cards: true, options: scored([["Standard", 15], ["Deep clean", 25], ["Move-out", 35]]) });
      const units = f({ id: "units", key: "q.units", type: "number", label: "How many rooms?", required: true, slider: true, valid: { min: 1, max: 60, step: 1 } });
      const extras = f({ id: "extras", key: "q.extras", type: "multi", label: "Anything extra?", required: false, cards: true, options: scored([["Inside windows", 60], ["Fridge and oven", 30]]) });
      const rush = f({ id: "rush", key: "q.rush", type: "checkbox", label: "Rush, within 48 hours", required: false });
      const sub = calc("q.subtotal", "Subtotal", `{@base_fee} + ${ref(units)} * ${ref(svc)} + ifempty(${ref(extras)}, 0)`, { format: "money", decimals: 0, show: false });
      const surcharge = calc("q.rush_fee", "Rush fee", `if(${ref(rush)}, ${ref(sub)} * {@rush_pct} / 100, 0)`, { format: "money", decimals: 0, show: false });
      const total = calc("q.total", "Estimated total", `${ref(sub)} + ${ref(surcharge)}`, { format: "money", decimals: 0, show: false });
      return screens(
        { title: "Get your price in 30 seconds", text: "No email needed to see it.", button: "Start" },
        [
          step([svc]),
          step([units, sub, surcharge, total]),
          step([extras, rush]),
          step([result("metric", { label: "Your estimate", field: total }), result("summary", { fields: [sub, surcharge, total] }), result("outcome")], "Your estimate", { result: true }),
          contactStep("Lock in this price"),
        ],
        {
          constants: [
            { id: "base_fee", name: "Base fee", value: 100, format: "money" },
            { id: "rush_pct", name: "Rush fee", value: 25, format: "percent" },
            { id: "visit_from", name: "Site visit from", value: 1000, format: "money", private: true },
          ],
          results: outcomes([
            { id: "review", title: "We'll price this by hand", when: when("all", { field: total.id, op: "empty" }) },
            { id: "visit", title: "Book a free site visit", text: "Jobs this size get a quick look first.", when: when("all", { field: total.id, op: "gte", value: "1000" }) },
            { id: "call", title: "Lock in this price", text: "Pick a time and we'll confirm it." },
          ]),
          submit: { label: "Get my quote" },
        },
      );
    },
    examples: [
      { answers: { svc: "standard", units: "20", rush: true }, values: { "q.subtotal": 400, "q.rush_fee": 100, "q.total": 500 }, outcome: "call" },
      { answers: { svc: "standard", units: "20", rush: false }, values: { "q.total": 400 }, outcome: "call" },
      { answers: { svc: "move_out", units: "30", extras: ["inside_windows"] }, values: { "q.total": 1210 }, outcome: "visit" },
    ],
  },
  {
    key: "plan_finder",
    name: "Plan finder",
    text: "Needs in, the plan that fits out.",
    kind: "interactive",
    goal: "recommend",
    tags: ["Match"],
    thumb: "cards",
    featured: true,
    form: () => {
      const size = f({ id: "size", key: "q.users", type: "number", label: "How many people will use it?", required: true, valid: { min: 1 } });
      const routing = f({ id: "routing", key: "q.routing", type: "choice", label: "Do you share leads across a team?", required: true, cards: true, options: yesNo().slice(0, 2) });
      const perms = f({ id: "perms", key: "q.permissions", type: "choice", label: "Do you need roles and permissions?", required: true, cards: true, options: yesNo().slice(0, 2) });
      // 1 Basic (one person), 2 Team (up to 10), 3 Business (up to 50), 4 no plan fits.
      const plan = calc("q.plan", "Plan", `if(${ref(size)} > 50, 4, if(${ref(perms)} or ${ref(size)} > 10, 3, if(${ref(routing)} or ${ref(size)} > 1, 2, 1)))`, { show: false });
      return screens(
        { title: "Find your plan", text: "Three questions.", button: "Start" },
        [step([size, plan]), step([routing]), step([perms]), step([result("outcome")], "Your plan", { result: true }), contactStep("Get the details")],
        {
          results: outcomes([
            { id: "basic", title: "Basic", text: "For one person. Everything you need to start.", when: when("all", { field: plan.id, op: "between", value: "1", value2: "1" }) },
            { id: "team", title: "Team", text: "Up to 10 people, with leads shared across the team.", when: when("all", { field: plan.id, op: "between", value: "2", value2: "2" }) },
            { id: "business", title: "Business", text: "Up to 50 people, with roles and permissions.", when: when("all", { field: plan.id, op: "between", value: "3", value2: "3" }) },
            { id: "talk", title: "Let's talk", text: "Teams this size get a plan made for them." },
          ]),
          submit: { label: "Send me the details" },
        },
      );
    },
    examples: [
      { answers: { size: "5", routing: "yes", perms: "no" }, values: { "q.plan": 2 }, outcome: "team" },
      { answers: { size: "20", routing: "yes", perms: "no" }, values: { "q.plan": 3 }, outcome: "business" },
      { answers: { size: "100", routing: "yes", perms: "yes" }, values: { "q.plan": 4 }, outcome: "talk" },
    ],
  },
  {
    key: "readiness",
    name: "Readiness assessment",
    text: "A score, a level and what to do next.",
    kind: "interactive",
    goal: "assess",
    tags: ["Score", "Booking"],
    thumb: "meter",
    featured: true,
    form: () => {
      const scale = () => scored([["Not at all", 0], ["A little", 1], ["Partly", 2], ["Mostly", 3], ["Fully", 4]]);
      const q = (id: string, key: string, label: string) => f({ id, key: key as Field["key"], type: "choice", label, required: true, cards: true, options: scale() });
      const a = q("proc", "q.processes", "Our processes are written down");
      const b = q("data", "q.data", "The data we need is easy to reach");
      const c = q("own", "q.ownership", "Each process has a clear owner");
      const d = q("change", "q.change", "The team is ready for change");
      const score = calc("q.score", "Readiness", `(${ref(a)} + ${ref(b)} + ${ref(c)} + ${ref(d)}) / 16 * 100`, { format: "percent", decimals: 0, show: false });
      return screens(
        { title: "How ready are you?", text: "Four questions, two minutes.", button: "Start" },
        [step([a]), step([b]), step([c]), step([d, score]), step([result("meter", { label: "Your readiness", field: score, max: 100 }), result("outcome")], "Your result", { result: true }), contactStep()],
        {
          results: outcomes([
            { id: "more", title: "Answer every question to see your score", when: when("all", { field: score.id, op: "empty" }) },
            { id: "foundations", title: "Foundations", text: "Start by writing down your two most used processes.", when: when("all", { field: score.id, op: "lt", value: "40" }) },
            { id: "developing", title: "Developing", text: "Name an owner for each process, then fix the data gaps.", when: when("all", { field: score.id, op: "lt", value: "70" }) },
            { id: "ready", title: "Ready to plan", text: "You're set to plan the change. Book a review." },
          ]),
          submit: { label: "Send my results" },
        },
      );
    },
    examples: [
      { answers: { proc: "mostly", data: "partly", own: "a_little", change: "partly" }, values: { "q.score": 50 }, outcome: "developing" },
      { answers: { proc: "fully", data: "fully", own: "fully", change: "fully" }, values: { "q.score": 100 }, outcome: "ready" },
      { answers: { proc: "not_at_all", data: "a_little", own: "a_little", change: "partly" }, values: { "q.score": 25 }, outcome: "foundations" },
    ],
  },
  {
    key: "bottleneck",
    name: "Find the bottleneck",
    text: "Traffic and conversion point to where to look first.",
    kind: "interactive",
    goal: "assess",
    tags: ["Match"],
    thumb: "check",
    form: () => {
      const traffic = f({ id: "traffic", key: "q.visits", type: "number", label: "Website visits a month", required: false, valid: { min: 0 } });
      const conv = f({ id: "conv", key: "q.conversion", type: "number", label: "Visitors who send an inquiry", required: false, unit: "percent", valid: { min: 0, max: 100 } });
      // 1 audience, 2 website conversion, 3 sales handoff. Example thresholds only.
      const area = calc("q.area", "Focus", `if(${ref(traffic)} < 1000, 1, if(${ref(conv)} < 1, 2, 3))`, { show: false });
      return screens(
        { title: "Where are leads getting stuck?", button: "Start" },
        [step([traffic]), step([conv, area]), step([result("outcome")], "Suggested focus", { result: true }), contactStep()],
        {
          results: outcomes([
            { id: "info", title: "Need more information", text: "Add your monthly visits to get a suggestion.", when: when("all", { field: traffic.id, op: "empty" }) },
            { id: "audience", title: "Suggested focus: reach more people", text: "Fewer than 1,000 visits a month. Work on getting found first.", when: when("all", { field: area.id, op: "between", value: "1", value2: "1" }) },
            { id: "website", title: "Suggested focus: website conversion", text: "Plenty of visits, few inquiries. Look at the pages and the form.", when: when("all", { field: area.id, op: "between", value: "2", value2: "2" }) },
            { id: "sales", title: "Suggested focus: sales handoff", text: "Visits and inquiries look fine. Check how fast leads get a reply." },
          ]),
          submit: { label: "Send my results" },
        },
      );
    },
    examples: [
      { answers: { traffic: "2000", conv: "0.5" }, values: { "q.area": 2 }, outcome: "website" },
      { answers: { traffic: "500", conv: "3" }, values: { "q.area": 1 }, outcome: "audience" },
      { answers: { conv: "3" }, outcome: "info" },
    ],
  },
  {
    key: "eligibility",
    name: "Eligibility checker",
    text: "Eligible, not eligible or needs review.",
    kind: "interactive",
    goal: "assess",
    tags: ["Match"],
    thumb: "check",
    form: () => {
      const staff = f({ id: "staff", key: "q.employees", type: "number", label: "How many employees?", required: false, valid: { min: 0 } });
      const region = f({ id: "region", key: "q.region", type: "choice", label: "Where do you operate?", required: true, cards: true, options: opts(["Region A", "Region B", "Somewhere else", "Not sure"]).map((o) => ({ ...o, value: o.value.toLowerCase().replace(/[^a-z]+/g, "_") })) });
      return screens(
        { title: "Check if you qualify", button: "Start" },
        [step([staff]), step([region]), step([result("outcome")], "Your result", { result: true }), contactStep("Apply or ask a question")],
        {
          results: outcomes([
            { id: "not_eligible", title: "Not eligible for this program", text: "Other options may fit. We'll send them.", when: when("any", { field: staff.id, op: "gt", value: "50" }, { field: region.id, op: "is", value: "somewhere_else" }) },
            { id: "eligible", title: "Eligible", text: "You meet the criteria. Apply next.", when: when("all", { field: staff.id, op: "between", value: "1", value2: "50" }, { field: region.id, op: "any_of", values: ["region_a", "region_b"] }) },
            { id: "review", title: "Needs review", text: "We'll check the details with you." },
          ]),
          submit: { label: "Send" },
        },
      );
    },
    examples: [
      { answers: { staff: "20", region: "region_a" }, outcome: "eligible" },
      { answers: { staff: "80", region: "region_a" }, outcome: "not_eligible" },
      { answers: { region: "region_a" }, outcome: "review" },
      { answers: { staff: "20", region: "not_sure" }, outcome: "review" },
    ],
  },
  {
    key: "configurator",
    name: "Product configurator",
    text: "Base, modules and seats with a running price.",
    kind: "interactive",
    goal: "price",
    tags: ["Price"],
    thumb: "cards",
    featured: true,
    form: () => {
      const plan = f({ id: "plan", key: "q.base", type: "choice", label: "Pick a base", required: true, cards: true, options: scored([["Core", 200], ["Core Plus", 350]]) });
      const mods = f({
        id: "mods",
        key: "q.modules",
        type: "multi",
        label: "Add modules",
        required: false,
        cards: true,
        options: [
          { value: "a", label: "Reporting", score: 80 },
          { value: "b", label: "Forecasting", score: 40, needs: ["a"] },
        ],
      });
      const seats = f({ id: "seats", key: "q.seats", type: "number", label: "Seats", required: true, slider: true, valid: { min: 1, max: 200, step: 1 } });
      const seatCost = calc("q.seat_cost", "Seats", `${ref(seats)} * {@seat_price}`, { format: "money", decimals: 0, show: false });
      const modCost = calc("q.module_cost", "Modules", `ifempty(${ref(mods)}, 0)`, { format: "money", decimals: 0, show: false });
      const baseCost = calc("q.base_cost", "Base", ref(plan), { format: "money", decimals: 0, show: false });
      const total = calc("q.total", "Total a month", `${ref(baseCost)} + ${ref(modCost)} + ${ref(seatCost)}`, { format: "money", decimals: 0, show: false });
      return screens(
        { title: "Build your package", button: "Start" },
        [step([plan]), step([mods]), step([seats, seatCost, modCost, baseCost, total]), step([result("metric", { label: "Your price a month", field: total }), result("summary", { fields: [baseCost, modCost, seatCost, total] })], "Your package", { result: true }), contactStep("Request a proposal")],
        { constants: [{ id: "seat_price", name: "Price per seat", value: 10, format: "money" }], results: outcomes([{ id: "proposal", title: "Request a proposal" }]), submit: { label: "Request proposal" } },
      );
    },
    examples: [
      { answers: { plan: "core", mods: ["a", "b"], seats: "10" }, values: { "q.total": 420 } },
      { answers: { plan: "core", mods: ["a"], seats: "10" }, values: { "q.total": 380 } },
    ],
  },
  {
    key: "quiz",
    name: "Knowledge quiz",
    text: "Five questions graded on the server.",
    kind: "interactive",
    goal: "assess",
    tags: ["Score"],
    thumb: "meter",
    form: () => {
      // The right answer scores 1. secret: the scores never reach the browser, so the key can't be read there.
      const q = (id: string, label: string, list: string[], right: number) =>
        f({ id, key: `q.${id}` as Field["key"], type: "choice", label, required: true, cards: true, secret: true, options: list.map((l, i) => ({ value: `${id}_${i}`, label: l, score: i === right ? 1 : 0 })) });
      const qs = [
        q("q1", "What does a lead form need most?", ["An email field", "Ten questions", "A video"], 0),
        q("q2", "What should happen right after a demo request?", ["Wait a week", "Offer a time to meet", "Send a newsletter"], 1),
        q("q3", "Which number shows form drop-off?", ["Starts that never finish", "Page views", "Emails sent"], 0),
        q("q4", "Who should get a lead from an existing customer?", ["Anyone free", "The account's owner", "Nobody"], 1),
        q("q5", "What keeps a price estimate honest?", ["Rounding up", "Showing the numbers behind it", "Hiding the math"], 1),
      ];
      const score = calc("q.score", "Score", `(${qs.map(ref).join(" + ")}) / 5 * 100`, { format: "percent", decimals: 0, show: false });
      return screens(
        { title: "How well do you know lead capture?", text: "Five questions.", button: "Start" },
        [...qs.map((x) => step([x])), step([email(), f({ key: "name", type: "text", label: "Full name", required: false }), score], "See your score"), step([result("meter", { label: "Your score", field: score, max: 100 }), result("outcome")], "Your score", { result: true })],
        {
          results: outcomes(
            [
              { id: "expert", title: "Expert", when: when("all", { field: score.id, op: "gte", value: "80" }) },
              { id: "getting_there", title: "Getting there", when: when("all", { field: score.id, op: "gte", value: "50" }) },
              { id: "starting", title: "Starting out" },
            ],
            "after_contact",
          ),
          submit: { label: "See my score" },
        },
      );
    },
    examples: [{ answers: { q1: "q1_0", q2: "q2_1", q3: "q3_0", q4: "q4_0", q5: "q5_0" }, values: { "q.score": 60 }, outcome: "getting_there" }],
  },
  {
    key: "self_audit",
    name: "Guided self-audit",
    text: "Yes, no or not sure, then the gaps.",
    kind: "interactive",
    goal: "assess",
    tags: ["Score", "Booking"],
    thumb: "check",
    form: () => {
      const items = [
        "New clients get a welcome within a day",
        "Every client has one named contact",
        "Kickoff follows a written agenda",
        "Access and logins are set up before kickoff",
        "Goals are written down in the first week",
        "Clients know who to ask for help",
        "Check-ins are on the calendar",
        "Progress is shared in writing",
        "Feedback is asked for at 30 days",
        "Handoffs between teams have a checklist",
      ].map((label, i) => f({ id: `i${i}`, key: `q.item_${i + 1}` as Field["key"], type: "choice", label, required: true, cards: true, options: yesNo() }));
      // + keeps an unknown answer unknown: one Not sure leaves the total empty until it's settled.
      const met = calc("q.met", "Practices in place", items.map(ref).join(" + "), { show: false });
      const pct = calc("q.score", "Score", `${ref(met)} / ${items.length} * 100`, { format: "percent", decimals: 0, show: false });
      const gaps = calc("q.gaps", "Gaps", `${items.length} - ${ref(met)}`, { show: false });
      return screens(
        { title: "Audit your onboarding", text: "Ten yes-or-no checks.", button: "Start" },
        [step(items.slice(0, 5), "First week"), step([...items.slice(5), met, pct, gaps], "After that"), step([result("meter", { label: "Practices in place", field: pct, max: 100 }), result("metric", { label: "Gaps to fix", field: gaps }), result("outcome")], "Your audit", { result: true }), contactStep("Get an expert review")],
        {
          layout: { labels: "above", width: "wide", mode: "screens", cover: { title: "Audit your onboarding", text: "Ten yes-or-no checks.", button: "Start" } },
          results: outcomes([
            { id: "unsure", title: "Check the Not sure items to finish your score", when: when("all", { field: pct.id, op: "empty" }) },
            { id: "strong", title: "Strong onboarding", when: when("all", { field: pct.id, op: "gte", value: "80" }) },
            { id: "gaps", title: "A few gaps to fix", text: "Book an expert review to plan the fixes." },
          ]),
          submit: { label: "Send my audit" },
        },
      );
    },
    examples: [
      { answers: { i0: "yes", i1: "yes", i2: "yes", i3: "yes", i4: "yes", i5: "yes", i6: "no", i7: "no", i8: "no", i9: "no" }, values: { "q.met": 6, "q.score": 60, "q.gaps": 4 }, outcome: "gaps" },
      { answers: { i0: "yes", i1: "yes", i2: "yes", i3: "yes", i4: "yes", i5: "yes", i6: "no", i7: "no", i8: "no", i9: "not_sure" }, values: { "q.score": null }, outcome: "unsure" },
    ],
  },
  {
    key: "benchmark",
    name: "Benchmark check",
    text: "Your rate against a reference you set.",
    kind: "interactive",
    goal: "assess",
    tags: ["Score"],
    thumb: "metric",
    form: () => {
      const leads = f({ id: "leads", key: "q.leads", type: "number", label: "Leads last month", required: true, valid: { min: 0 } });
      const visits = f({ id: "visits", key: "q.visits", type: "number", label: "Website visits last month", required: true, valid: { min: 1 } });
      const rate = calc("q.rate", "Your conversion rate", `${ref(leads)} / ${ref(visits)} * 100`, { format: "percent", decimals: 2, show: false });
      const reference = calc("q.reference", "Reference rate", "{@reference_rate}", { format: "percent", decimals: 2, show: false });
      const points = calc("q.points", "Difference in points", `${ref(rate)} - {@reference_rate}`, { decimals: 2, show: false });
      const relative = calc("q.relative", "Relative difference", `(${ref(rate)} - {@reference_rate}) / {@reference_rate} * 100`, { format: "percent", decimals: 0, show: false });
      return screens(
        { title: "How does your conversion compare?", button: "Start" },
        [step([leads, visits, rate, reference, points, relative]), step([result("bars", { fields: [rate, reference] }), result("metric", { label: "Difference in points", field: points }), result("metric", { label: "Relative difference", field: relative }), result("outcome")], "Your comparison", { result: true }), contactStep()],
        {
          // No value until the owner sets it from a source they trust: the form can't be published with a made-up average.
          constants: [{ id: "reference_rate", name: "Reference rate", value: null, format: "percent" }],
          results: outcomes([
            { id: "above", title: "Above the reference", when: when("all", { field: points.id, op: "gte", value: "0" }) },
            { id: "below", title: "Below the reference", text: "Book a call to plan improvements." },
          ]),
          submit: { label: "Send my results" },
        },
      );
    },
    examples: [{ answers: { leads: "150", visits: "10000" }, constants: { reference_rate: 2 }, values: { "q.rate": 1.5, "q.points": -0.5, "q.relative": -25 }, outcome: "below" }],
  },
  {
    key: "planner",
    name: "Project planner",
    text: "Effort and capacity in, weeks out.",
    kind: "interactive",
    goal: "assess",
    tags: ["Booking"],
    thumb: "metric",
    form: () => {
      const hours = f({ id: "hours", key: "q.effort_hours", type: "number", label: "Total effort in hours", required: true, valid: { min: 1 } });
      const cap = f({ id: "cap", key: "q.capacity", type: "number", label: "Hours available a week", required: true, valid: { min: 0 } });
      const deadline = f({ id: "deadline", key: "q.deadline_weeks", type: "number", label: "Weeks until your deadline", required: false, valid: { min: 1 } });
      // Zero hours a week has no finish date: dividing by zero leaves it empty.
      const weeks = calc("q.weeks", "Estimated weeks", `ceil(${ref(hours)} / ${ref(cap)})`, { show: false });
      const over = calc("q.over", "Weeks over the deadline", `${ref(weeks)} - ${ref(deadline)}`, { show: false });
      return screens(
        { title: "How long will it take?", button: "Start" },
        [step([hours, cap]), step([deadline, weeks, over]), step([result("metric", { label: "Estimated weeks", field: weeks }), result("outcome")], "Your plan", { result: true }), contactStep("Plan it with us")],
        {
          results: outcomes([
            { id: "no_capacity", title: "Add some hours a week to get an estimate", when: when("all", { field: weeks.id, op: "empty" }) },
            { id: "late", title: "Outside your deadline at this capacity", text: "Add capacity or move the date.", when: when("all", { field: over.id, op: "gt", value: "0" }) },
            { id: "fits", title: "Fits your timeline" },
          ]),
          submit: { label: "Send my plan" },
        },
      );
    },
    examples: [
      { answers: { hours: "100", cap: "25", deadline: "2" }, values: { "q.weeks": 4, "q.over": 2 }, outcome: "late" },
      { answers: { hours: "100", cap: "50", deadline: "2" }, values: { "q.weeks": 2 }, outcome: "fits" },
      { answers: { hours: "100", cap: "0" }, values: { "q.weeks": null }, outcome: "no_capacity" },
    ],
  },
  {
    key: "guided_booking",
    name: "Guided booking",
    text: "The right service, the right rep, real times.",
    kind: "interactive",
    goal: "book",
    tags: ["Booking"],
    thumb: "slots",
    book: true,
    featured: true,
    form: () => {
      const svc = f({ id: "svc", key: "q.service", type: "choice", label: "What can we help with?", required: true, cards: true, options: opts(["Onboarding", "Product demo", "Something else"]).map((o) => ({ ...o, value: o.value.toLowerCase().replace(/[^a-z]+/g, "_") })) });
      const customer = f({ id: "cust", key: "q.customer", type: "choice", label: "Are you a customer?", required: true, cards: true, options: yesNo().slice(0, 2) });
      return screens(
        { title: "Book the right meeting", text: "Two questions, then pick a time.", button: "Start" },
        [step([svc]), step([customer]), step([email(), f({ key: "name", type: "text", label: "Full name", required: true }), f({ key: "company", type: "text", label: "Company", required: false })], "Your details")],
        {
          // Each outcome books its own meeting once the owner picks one; the meeting's rules pick the rep.
          results: outcomes(
            [
              { id: "onboarding", title: "Onboarding", when: when("all", { field: svc.id, op: "is", value: "onboarding" }) },
              { id: "demo", title: "Product demo", when: when("all", { field: svc.id, op: "is", value: "product_demo" }) },
              { id: "other", title: "A quick call" },
            ],
            "after_contact",
          ),
          submit: { label: "See times" },
        },
      );
    },
    examples: [
      { answers: { svc: "onboarding", cust: "yes" }, outcome: "onboarding" },
      { answers: { svc: "product_demo", cust: "no" }, outcome: "demo" },
    ],
  },
];

export const GALLERY: GalleryTemplate[] = [...STATIC, ...INTERACTIVE];
export const GOALS: { value: Goal; label: string }[] = [
  { value: "leads", label: "Capture leads" },
  { value: "price", label: "Estimate price" },
  { value: "recommend", label: "Recommend" },
  { value: "assess", label: "Assess" },
  { value: "feedback", label: "Feedback" },
  { value: "book", label: "Book meetings" },
];
export const galleryByKey = (key: string) => GALLERY.find((t) => t.key === key);

/** An example's answers by field id for a built form (examples name fields by their fixed id, else by key). */
export function exampleAnswers(form: Form, ex: Example): Record<string, unknown> {
  const fields = form.steps.flatMap((s) => s.fields);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ex.answers)) {
    const hit = fields.find((x) => x.id === k) ?? fields.find((x) => x.key === k);
    if (hit) out[hit.id] = v;
  }
  return out;
}

/** The form with an example's settings filled in (a reference rate the owner must set, say). */
export function withExampleConstants(form: Form, ex: Example): Form {
  if (!ex.constants) return form;
  return { ...form, constants: (form.constants ?? []).map((c: Constant) => (c.id in ex.constants! ? { ...c, value: ex.constants![c.id]! } : c)) };
}

// Words that point at an interactive template, most specific first (the New form box: "a quote calculator for...").
const MATCH: [RegExp, string][] = [
  [/\b(roi|return on investment|savings?|payback)\b/i, "roi"],
  [/\b(configur|build your (own )?package|bundle)/i, "configurator"],
  [/\b(quote|estimat|pricing calculator|price calculator|instant price|cost calculator)/i, "instant_quote"],
  [/\b(quiz|trivia|test (your|their) knowledge)\b/i, "quiz"],
  [/\b(self[- ]?audit|audit checklist)\b/i, "self_audit"],
  [/\b(readiness|maturity|assessment|scorecard)\b/i, "readiness"],
  [/\b(eligib|qualify for|do i qualify)/i, "eligibility"],
  [/\b(benchmark|compare (my|your) (rate|conversion))/i, "benchmark"],
  [/\b(bottleneck|diagnos)/i, "bottleneck"],
  [/\b(plan (finder|recommend|picker)|which plan|recommend(er)?)\b/i, "plan_finder"],
  [/\b(project planner|timeline estimat|how long will)/i, "planner"],
  [/\b(guided booking|route .* to the right (rep|person))/i, "guided_booking"],
  [/\bcalculator\b/i, "instant_quote"],
];

/** The interactive template a request asks for, if it clearly asks for one. */
export function matchTemplate(text: string): GalleryTemplate | null {
  const hit = MATCH.find(([re]) => re.test(text));
  return hit ? (galleryByKey(hit[1]) ?? null) : null;
}
