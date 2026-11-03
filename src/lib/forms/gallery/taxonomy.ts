// The gallery's menus (docs/form-templates-plan.md): categories in families, teams and sub-industries, set by hand on
// each template, and the menus worked out from the form itself (features, layout, length, what it does next), which
// can never be wrong. A value shows only when MIN_SHOWN templates have it.

import { kitWorkflows } from "./kit.ts";
import type { FieldKind, FormTemplate, Industry } from "./types.ts";

/** A menu value shows only when this many templates have it. */
export const MIN_SHOWN = 4;

export const FAMILIES = [
  { id: "leads", label: "Leads and sales" },
  { id: "booking", label: "Booking" },
  { id: "money", label: "Orders and payments" },
  { id: "apply", label: "Apply and join" },
  { id: "events", label: "Events" },
  { id: "feedback", label: "Feedback and surveys" },
  { id: "quizzes", label: "Quizzes and assessments" },
  { id: "intake", label: "Intake and onboarding" },
  { id: "operations", label: "Operations" },
  { id: "legal", label: "Consent and legal" },
] as const;
export type Family = (typeof FAMILIES)[number]["id"];

const C = <F extends Family>(family: F, list: [string, string][]) => list.map(([id, label]) => ({ id, label, family }));

export const CATEGORIES = [
  ...C("leads", [
    ["contact", "Contact"],
    ["lead-generation", "Lead generation"],
    ["demo-request", "Demo request"],
    ["quote", "Quote"],
    ["estimate", "Estimate"],
    ["consultation", "Consultation"],
    ["qualify", "Qualification"],
    ["waitlist", "Waitlist"],
    ["referral", "Referral"],
    ["partner", "Partner application"],
    ["content-download", "Content download"],
    ["newsletter", "Newsletter"],
  ]),
  ...C("booking", [
    ["appointment", "Appointment"],
    ["booking", "Booking"],
    ["reservation", "Reservation"],
    ["rental", "Rental"],
    ["class", "Class and lesson"],
    ["callback", "Callback"],
  ]),
  ...C("money", [
    ["order", "Order"],
    ["payment", "Payment"],
    ["donation", "Donation"],
    ["deposit", "Deposit"],
    ["subscription", "Subscription"],
    ["sponsorship", "Sponsorship"],
    ["calculator", "Calculator"],
  ]),
  ...C("apply", [
    ["application", "Application"],
    ["job-application", "Job application"],
    ["membership", "Membership"],
    ["enrollment", "Enrollment"],
    ["registration", "Registration"],
    ["signup", "Signup"],
    ["volunteer", "Volunteer"],
    ["grant", "Grant and scholarship"],
    ["tenant", "Tenant"],
    ["vendor", "Vendor"],
  ]),
  ...C("events", [
    ["event-registration", "Event registration"],
    ["rsvp", "RSVP"],
    ["party", "Party"],
    ["wedding", "Wedding"],
    ["webinar", "Webinar"],
    ["speaker", "Speaker and call for talks"],
    ["exhibitor", "Exhibitor"],
  ]),
  ...C("feedback", [
    ["feedback", "Feedback"],
    ["survey", "Survey"],
    ["evaluation", "Evaluation"],
    ["questionnaire", "Questionnaire"],
    ["nps", "NPS"],
    ["csat", "Customer satisfaction"],
    ["product-feedback", "Product feedback"],
    ["feature-request", "Feature request"],
    ["bug-report", "Bug report"],
    ["exit", "Exit and cancel"],
    ["engagement", "Employee engagement"],
    ["market-research", "Market research"],
    ["poll", "Voting and polls"],
    ["testimonial", "Testimonial and review"],
  ]),
  ...C("quizzes", [
    ["quiz", "Quiz"],
    ["personality", "Personality quiz"],
    ["knowledge", "Knowledge test"],
    ["scorecard", "Scorecard"],
    ["product-finder", "Product finder"],
    ["eligibility", "Eligibility check"],
  ]),
  ...C("intake", [
    ["intake", "Intake"],
    ["client-onboarding", "Client onboarding"],
    ["employee-onboarding", "Employee onboarding"],
    ["patient-intake", "Patient intake"],
    ["brief", "Project brief"],
    ["offboarding", "Offboarding"],
  ]),
  ...C("operations", [
    ["checklist", "Checklist"],
    ["inspection", "Inspection"],
    ["report", "Report"],
    ["request", "Request"],
    ["tracking", "Tracking"],
    ["incident", "Incident report"],
    ["time-off", "Time off"],
    ["it-request", "IT request"],
    ["purchase-request", "Purchase request"],
    ["expense", "Expense claim"],
    ["maintenance", "Maintenance request"],
    ["return", "Return and warranty"],
  ]),
  ...C("legal", [
    ["consent", "Consent"],
    ["waiver", "Waiver"],
    ["release", "Photo release"],
    ["data-request", "Data request"],
    ["terms", "Terms agreement"],
  ]),
];
export type Category = string;
const CAT = new Map(CATEGORIES.map((c) => [c.id, c]));
export const isCategory = (id: string) => CAT.has(id);
export const categoryLabel = (id: string) => CAT.get(id)?.label ?? id;
export const categoryFamily = (id: string): Family | undefined => CAT.get(id)?.family;
export const familyLabel = (id: string) => FAMILIES.find((f) => f.id === id)?.label ?? id;

export const TEAMS = [
  { id: "marketing", label: "Marketing" },
  { id: "sales", label: "Sales" },
  { id: "success", label: "Customer success" },
  { id: "support", label: "Support" },
  { id: "hr", label: "HR" },
  { id: "recruiting", label: "Recruiting" },
  { id: "operations", label: "Operations" },
  { id: "finance", label: "Finance" },
  { id: "it", label: "IT" },
  { id: "product", label: "Product" },
  { id: "founders", label: "Founders and owners" },
  { id: "events", label: "Event organizers" },
  { id: "teachers", label: "Teachers and trainers" },
  { id: "care", label: "Care staff" },
  { id: "volunteers", label: "Volunteer leads" },
  { id: "personal", label: "Personal" },
] as const;
export type Team = (typeof TEAMS)[number]["id"];
export const isTeam = (id: string): id is Team => TEAMS.some((t) => t.id === id);
export const teamLabel = (id: string) => TEAMS.find((t) => t.id === id)?.label ?? id;

/** Sub-industries, each inside one industry, so "Construction and home services" can open on "Roofing". */
export const SUBS: { id: string; label: string; parent: Industry }[] = [
  ...(
    [
      ["cleaning", "Cleaning"],
      ["hvac", "HVAC"],
      ["plumbing", "Plumbing"],
      ["electrical", "Electrical"],
      ["roofing", "Roofing"],
      ["landscaping", "Landscaping"],
      ["pest-control", "Pest control"],
      ["moving", "Moving"],
    ] as const
  ).map(([id, label]) => ({ id, label, parent: "construction" as const })),
  ...(
    [
      ["clinics", "Clinics"],
      ["physical-therapy", "Physical therapy"],
      ["home-care", "Home care"],
      ["pharmacy", "Pharmacy"],
    ] as const
  ).map(([id, label]) => ({ id, label, parent: "healthcare" as const })),
  ...(
    [
      ["dental", "Dental"],
      ["therapy", "Therapy and counseling"],
      ["chiropractic", "Chiropractic"],
      ["massage", "Massage"],
      ["nutrition", "Nutrition"],
    ] as const
  ).map(([id, label]) => ({ id, label, parent: "wellness" as const })),
  ...(
    [
      ["gyms", "Gyms"],
      ["studios", "Yoga and studios"],
      ["personal-training", "Personal training"],
    ] as const
  ).map(([id, label]) => ({ id, label, parent: "fitness" as const })),
  ...(
    [
      ["salons", "Salons"],
      ["spas", "Spas"],
      ["tattoo", "Tattoo and piercing"],
    ] as const
  ).map(([id, label]) => ({ id, label, parent: "beauty" as const })),
  ...(
    [
      ["schools", "Schools"],
      ["tutoring", "Tutoring"],
      ["online-courses", "Online courses"],
      ["childcare", "Childcare"],
    ] as const
  ).map(([id, label]) => ({ id, label, parent: "education" as const })),
  ...(
    [
      ["hotels", "Hotels"],
      ["tours", "Tours and travel"],
      ["vacation-rentals", "Vacation rentals"],
    ] as const
  ).map(([id, label]) => ({ id, label, parent: "hospitality" as const })),
  ...(
    [
      ["restaurants", "Restaurants"],
      ["catering", "Catering"],
      ["bakeries", "Bakeries"],
    ] as const
  ).map(([id, label]) => ({ id, label, parent: "food" as const })),
  ...(
    [
      ["weddings", "Weddings"],
      ["conferences", "Conferences"],
      ["venues", "Venues"],
    ] as const
  ).map(([id, label]) => ({ id, label, parent: "events" as const })),
  ...(
    [
      ["residential", "Residential"],
      ["commercial", "Commercial property"],
      ["property-management", "Property management"],
    ] as const
  ).map(([id, label]) => ({ id, label, parent: "real_estate" as const })),
  ...(
    [
      ["personal-injury", "Personal injury"],
      ["family-law", "Family law"],
      ["immigration", "Immigration"],
    ] as const
  ).map(([id, label]) => ({ id, label, parent: "legal" as const })),
  ...(
    [
      ["photography", "Photography"],
      ["video", "Video"],
      ["design-studios", "Design studios"],
    ] as const
  ).map(([id, label]) => ({ id, label, parent: "creative" as const })),
];
const SUB = new Map(SUBS.map((s) => [s.id, s]));
export const isSub = (id: string) => SUB.has(id);
export const subLabel = (id: string) => SUB.get(id)?.label ?? id;
export const subParent = (id: string) => SUB.get(id)?.parent;

// Menus worked out from the form.

export const FEATURES = [
  { id: "logic", label: "Logic" },
  { id: "calculator", label: "Calculator" },
  { id: "payment", label: "Payment" },
  { id: "booking", label: "Booking" },
  { id: "score", label: "Score" },
  { id: "file", label: "File upload" },
  { id: "signature", label: "Signature" },
  { id: "grid", label: "Grid" },
  { id: "ranking", label: "Ranking" },
  { id: "address", label: "Address" },
  { id: "hidden", label: "Hidden fields" },
] as const;
export type Feature = (typeof FEATURES)[number]["id"];

export const LAYOUTS = [
  { id: "one", label: "One page" },
  { id: "steps", label: "Steps" },
  { id: "screens", label: "One question at a time" },
] as const;
export type Layout = (typeof LAYOUTS)[number]["id"];

export const LENGTHS = [
  { id: "quick", label: "Under 1 minute" },
  { id: "short", label: "1 to 3 minutes" },
  { id: "long", label: "Over 3 minutes" },
] as const;
export type Length = (typeof LENGTHS)[number]["id"];

/** What happens after the send. */
export const DOES = [
  { id: "meeting", label: "Books a meeting" },
  { id: "payment", label: "Takes payment" },
  { id: "price", label: "Shows a price" },
  { id: "score", label: "Shows a score" },
  { id: "follow-up", label: "Sends a follow-up" },
  { id: "anonymous", label: "Anonymous" },
] as const;
export type Does = (typeof DOES)[number]["id"];

/** About how long a visitor takes on one question of each kind, in seconds. */
const SECONDS: Record<FieldKind, number> = {
  short_text: 6,
  long_text: 30,
  email: 6,
  phone: 6,
  url: 6,
  number: 5,
  money: 6,
  single: 5,
  multi: 8,
  dropdown: 5,
  yes_no: 3,
  agree: 2,
  rating: 3,
  nps: 4,
  scale: 4,
  ranking: 15,
  matrix: 4,
  date: 6,
  time: 5,
  date_range: 8,
  name: 8,
  address: 20,
  file: 20,
  signature: 10,
  statement: 5,
  hidden: 0,
  calc: 3,
  payment: 20,
};

/** About how long the form takes, in seconds (a grid counts each row). */
export function seconds(t: FormTemplate): number {
  let s = 0;
  for (const p of t.schema.pages)
    for (const f of p.fields) {
      const one = SECONDS[f.kind] ?? 5;
      s += f.kind === "matrix" ? one * Math.max(f.rows?.length ?? 1, 1) : f.show ? one / 2 : one;
    }
  return Math.round(s + (t.schema.pages.length - 1) * 2);
}

export function lengthOf(t: FormTemplate): Length {
  const s = seconds(t);
  return s < 60 ? "quick" : s <= 180 ? "short" : "long";
}

export function layoutOf(t: FormTemplate): Layout {
  if (t.mode === "screens") return "screens";
  return t.schema.pages.length > 1 ? "steps" : "one";
}

export function featuresOf(t: FormTemplate): Feature[] {
  const fields = t.schema.pages.flatMap((p) => p.fields);
  const has = (k: FieldKind) => fields.some((f) => f.kind === k);
  const out: Feature[] = [];
  if (fields.some((f) => f.show)) out.push("logic");
  if (has("calc")) out.push("calculator");
  if (has("payment")) out.push("payment");
  if (t.schema.end.booking) out.push("booking");
  // Points on a calculator's choices are prices; only a quiz's points make a score.
  if (t.schema.end.score?.length || (fields.some((f) => f.points?.length) && !has("calc"))) out.push("score");
  if (has("file")) out.push("file");
  if (has("signature")) out.push("signature");
  if (has("matrix")) out.push("grid");
  if (has("ranking")) out.push("ranking");
  if (has("address")) out.push("address");
  if (has("hidden")) out.push("hidden");
  return out;
}

const hasEmail = (t: FormTemplate) => t.schema.pages.some((p) => p.fields.some((f) => f.map === "email"));

export function doesOf(t: FormTemplate): Does[] {
  const out: Does[] = [];
  if (t.schema.end.booking) out.push("meeting");
  const fields = t.schema.pages.flatMap((p) => p.fields);
  if (fields.some((f) => f.kind === "payment")) out.push("payment");
  if (fields.some((f) => f.kind === "calc" && f.visible !== false && f.format === "money")) out.push("price");
  if (t.schema.end.score?.length) out.push("score");
  if (kitWorkflows(t).length) out.push("follow-up");
  if (!hasEmail(t)) out.push("anonymous");
  return out;
}

/** Every menu value a template has, for filtering and counts. */
export type Facets = {
  categories: string[];
  families: Family[];
  industries: Industry[];
  subs: string[];
  teams: string[];
  features: Feature[];
  layout: Layout;
  length: Length;
  does: Does[];
};

export function facetsOf(t: FormTemplate): Facets {
  const categories = t.categories ?? [];
  return {
    categories,
    families: [...new Set(categories.map(categoryFamily).filter((f): f is Family => !!f))],
    industries: [t.industry, ...(t.also ?? [])],
    subs: t.subs ?? [],
    teams: t.teams ?? [],
    features: featuresOf(t),
    layout: layoutOf(t),
    length: lengthOf(t),
    does: doesOf(t),
  };
}
