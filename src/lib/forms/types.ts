// Forms (docs/form-templates.md): what a form is. A form is pages of fields with optional show-if logic, an end
// screen, and settings. Templates and saved forms share this shape, so a template becomes a form by copying it.
// Runs in the browser and on the server.

export type FieldKind =
  | "short_text"
  | "long_text"
  | "email"
  | "phone"
  | "url"
  | "number"
  | "money"
  | "single"
  | "multi"
  | "dropdown"
  | "yes_no"
  | "agree"
  | "rating"
  | "nps"
  | "scale"
  | "ranking"
  | "matrix"
  | "date"
  | "time"
  | "date_range"
  | "name"
  | "address"
  | "file"
  | "signature"
  | "statement"
  | "hidden";

export const KINDS: { value: FieldKind; label: string; group: string }[] = [
  { value: "short_text", label: "Short text", group: "Text" },
  { value: "long_text", label: "Long text", group: "Text" },
  { value: "email", label: "Email", group: "Text" },
  { value: "phone", label: "Phone", group: "Text" },
  { value: "url", label: "Website", group: "Text" },
  { value: "number", label: "Number", group: "Text" },
  { value: "money", label: "Money", group: "Text" },
  { value: "single", label: "Pick one", group: "Choice" },
  { value: "multi", label: "Pick many", group: "Choice" },
  { value: "dropdown", label: "Dropdown", group: "Choice" },
  { value: "yes_no", label: "Yes or no", group: "Choice" },
  { value: "agree", label: "Checkbox", group: "Choice" },
  { value: "rating", label: "Stars", group: "Scale" },
  { value: "nps", label: "NPS 0–10", group: "Scale" },
  { value: "scale", label: "Opinion scale", group: "Scale" },
  { value: "ranking", label: "Ranking", group: "Scale" },
  { value: "matrix", label: "Matrix", group: "Scale" },
  { value: "date", label: "Date", group: "Date" },
  { value: "time", label: "Time", group: "Date" },
  { value: "date_range", label: "Date range", group: "Date" },
  { value: "name", label: "Full name", group: "People" },
  { value: "address", label: "Address", group: "People" },
  { value: "file", label: "File upload", group: "Files" },
  { value: "signature", label: "Signature", group: "Files" },
  { value: "statement", label: "Statement", group: "Layout" },
  { value: "hidden", label: "Hidden", group: "Layout" },
];

export const KIND_LABEL = Object.fromEntries(KINDS.map((k) => [k.value, k.label])) as Record<FieldKind, string>;

/** Kinds that take a list of options. */
export const CHOICE_KINDS = new Set<FieldKind>(["single", "multi", "dropdown", "ranking", "matrix"]);
/** Kinds that show something but take no answer. */
export const NO_ANSWER = new Set<FieldKind>(["statement"]);

/** When a field shows: compared with an earlier field's answer. */
export type Cond = {
  key: string;
  op: "is" | "not" | "any" | "answered" | "empty" | "gte" | "lte";
  value?: string | number | boolean | string[];
};

export type FormField = {
  key: string;
  kind: FieldKind;
  label: string;
  help?: string;
  placeholder?: string;
  required?: boolean;
  /** single, multi, dropdown, ranking; the columns of a matrix. */
  options?: string[];
  /** A matrix's rows. */
  rows?: string[];
  /** Points per option, for quizzes. Same length as options. */
  points?: number[];
  /** Adds an "Other" choice with a text box. */
  other?: boolean;
  /** number, money and scale bounds; rating's star count. */
  min?: number;
  max?: number;
  minLabel?: string;
  maxLabel?: string;
  /** money: currency code. */
  currency?: string;
  /** file: how many files. */
  maxFiles?: number;
  /** Where the answer lands on the contact: a built-in (email, first_name…) or a custom field as f.<key>. */
  map?: string;
  show?: Cond;
  half?: boolean;
};

export type FormPage = { title?: string; fields: FormField[] };

export type ScoreBand = { min: number; title: string; text: string };

export type FormEnd = {
  title: string;
  text: string;
  /** Send people to this address after submitting. */
  redirect?: string;
  /** Show the booking button (settings.booking_url) on the end screen. */
  booking?: boolean;
  /** Quizzes: the score's bands, highest min first or any order. */
  score?: ScoreBand[];
};

export type FormSchema = {
  v: 1;
  title: string;
  intro?: string;
  pages: FormPage[];
  submit: string;
  end: FormEnd;
};

/** Per-form settings that aren't part of a template. */
export type FormSettings = {
  accent?: string;
  booking_url?: string;
  /** The opt-in box's words in strict regions, and the notice elsewhere. */
  consent_text?: string;
  notice_text?: string;
  /** Turn off the consent block (forms that never lead to marketing email, like internal surveys). */
  consent_off?: boolean;
  /** What Tailor was told about the business, kept for the next run. */
  about?: string;
};

export type Industry =
  | "general"
  | "saas"
  | "agency"
  | "consulting"
  | "legal"
  | "accounting"
  | "finance"
  | "insurance"
  | "real_estate"
  | "construction"
  | "solar"
  | "healthcare"
  | "wellness"
  | "fitness"
  | "education"
  | "ecommerce"
  | "manufacturing"
  | "logistics"
  | "automotive"
  | "hospitality"
  | "events"
  | "nonprofit"
  | "hr"
  | "it";

export const INDUSTRIES: { value: Industry; label: string }[] = [
  { value: "general", label: "Any business" },
  { value: "saas", label: "SaaS and software" },
  { value: "agency", label: "Agencies" },
  { value: "consulting", label: "Consulting" },
  { value: "legal", label: "Legal" },
  { value: "accounting", label: "Accounting and tax" },
  { value: "finance", label: "Financial services" },
  { value: "insurance", label: "Insurance" },
  { value: "real_estate", label: "Real estate" },
  { value: "construction", label: "Construction and home services" },
  { value: "solar", label: "Solar and energy" },
  { value: "healthcare", label: "Healthcare" },
  { value: "wellness", label: "Dental, wellness and therapy" },
  { value: "fitness", label: "Fitness and beauty" },
  { value: "education", label: "Education and training" },
  { value: "ecommerce", label: "Ecommerce and retail" },
  { value: "manufacturing", label: "Manufacturing" },
  { value: "logistics", label: "Logistics and transport" },
  { value: "automotive", label: "Automotive" },
  { value: "hospitality", label: "Hospitality and travel" },
  { value: "events", label: "Events" },
  { value: "nonprofit", label: "Nonprofits" },
  { value: "hr", label: "HR and recruiting" },
  { value: "it", label: "IT services" },
];

export type UseCase = "lead" | "booking" | "survey" | "application" | "order" | "registration" | "feedback" | "quiz" | "intake" | "request";

export const USE_CASES: { value: UseCase; label: string }[] = [
  { value: "lead", label: "Lead capture" },
  { value: "booking", label: "Booking" },
  { value: "request", label: "Quote and request" },
  { value: "intake", label: "Intake" },
  { value: "application", label: "Application" },
  { value: "registration", label: "Registration" },
  { value: "survey", label: "Survey" },
  { value: "feedback", label: "Feedback" },
  { value: "quiz", label: "Quiz" },
  { value: "order", label: "Order" },
];

export type FormTemplate = {
  id: string;
  version: number;
  industry: Industry;
  tags: UseCase[];
  name: string;
  /** One line for the gallery card and the public page. */
  blurb: string;
  /** Ships first (docs/form-templates.md Part 5). */
  featured?: boolean;
  /** Collects health information: stays a draft until the workspace confirms a BAA. */
  phi?: boolean;
  /** Consent block off by default (internal forms). */
  internal?: boolean;
  schema: FormSchema;
};

/** Answer values, by kind. */
export type FileRef = { name: string; path: string; size: number; type: string };
export type Answer =
  | string
  | number
  | boolean
  | string[]
  | Record<string, string>
  | FileRef[];
export type Answers = Record<string, Answer>;

export const KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;
