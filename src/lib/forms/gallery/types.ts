// The template gallery's own small format (docs/form-templates.md): pages of fields with show-if logic and an end
// screen. convert.ts turns a template into the app's saved form (../schema.ts), which is what gets stored and run.

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
  | "hidden"
  | "calc"
  | "payment";

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
  { value: "calc", label: "Calculation", group: "Money" },
  { value: "payment", label: "Payment", group: "Money" },
];

export const KIND_LABEL = Object.fromEntries(KINDS.map((k) => [k.value, k.label])) as Record<FieldKind, string>;

/** Kinds that take a list of options. */
export const CHOICE_KINDS = new Set<FieldKind>(["single", "multi", "dropdown", "ranking", "matrix"]);
/** Kinds small enough to sit two to a row; the rest always take the full width. */
export const HALF_KINDS = new Set<FieldKind>(["short_text", "email", "phone", "url", "number", "money", "date", "time", "dropdown"]);
/** Kinds that show something but take no answer. */
export const NO_ANSWER = new Set<FieldKind>(["statement", "calc", "payment"]);

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
  /** calc: other answers as {key}, with + - * / ( ) min max round if; how the result shows; false keeps it out of sight. */
  formula?: string;
  format?: "number" | "money" | "percent";
  visible?: boolean;
  /** payment: a fixed amount, or the key of the calc to charge. */
  amount?: number;
  from?: string;
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
  /** A style from src/lib/forms/themes.ts. */
  theme?: string;
  /** Overrides the style's button color. */
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
  | "it"
  | "beauty"
  | "food"
  | "creative"
  | "coaching"
  | "pets"
  | "faith"
  | "sports"
  | "government"
  | "media"
  | "retail"
  | "architecture"
  | "security"
  | "agriculture"
  | "personal";

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
  { value: "fitness", label: "Fitness" },
  { value: "beauty", label: "Beauty and salons" },
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
  { value: "food", label: "Restaurants and food" },
  { value: "creative", label: "Photography and creative" },
  { value: "coaching", label: "Coaching" },
  { value: "pets", label: "Veterinary and pets" },
  { value: "faith", label: "Faith communities" },
  { value: "sports", label: "Sports clubs" },
  { value: "government", label: "Government and public" },
  { value: "media", label: "Media and publishing" },
  { value: "retail", label: "Retail stores" },
  { value: "architecture", label: "Architecture and design" },
  { value: "security", label: "Security" },
  { value: "agriculture", label: "Agriculture" },
  { value: "personal", label: "Personal" },
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
  /** The menus set by hand (taxonomy.ts): 1 to 3 categories and teams, sub-industries, other industries it fits. */
  categories?: string[];
  teams?: string[];
  subs?: string[];
  also?: Industry[];
  /** One question at a time. */
  mode?: "screens";
  /** What Use template sets up beside the form (docs/form-templates-plan.md 5.1). */
  kit?: TemplateKit;
  /** Months it's featured in (1 to 12), for the seasonal rows. */
  seasons?: number[];
  /** When it joined the catalog, yyyy-mm-dd. */
  added?: string;
  schema: FormSchema;
};

/** A route by answer: when the condition holds, the meeting goes to this kind of teammate. */
export type KitRoute = { when: Cond; to: string };
/** One follow-up email after the send: days after, subject and body (with {first_name} and the like). */
export type KitEmail = { days: number; subject: string; body: string };
export type TemplateKit = {
  /** The meeting a booking template books: its name and length in minutes. */
  meeting?: { name: string; minutes: number };
  routes?: KitRoute[];
  followUp?: KitEmail[];
};

/** Answer values, by kind. */
export type FileRef = {
  name: string;
  path: string;
  size: number;
  type: string;
};
export type Answer = string | number | boolean | string[] | Record<string, string> | FileRef[];
export type Answers = Record<string, Answer>;

export const KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;
