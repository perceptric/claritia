// Industry recipes for Form Studio (docs/studio-v2-plan.md 6.1): the usual forms in each industry, what Tia adds by
// default, what a form there never asks, and what happens after the send. The brand's site tells Tia the industry
// (with its language and country) once; the owner can change it with one click. A new industry is a few lines here.
// Runs in the browser and on the server.

export type IndustryKey =
  | "saas"
  | "agency"
  | "health"
  | "legal"
  | "realestate"
  | "finance"
  | "education"
  | "homeservices"
  | "events"
  | "recruiting"
  | "retail"
  | "nonprofit"
  | "general";

export type Industry = {
  key: IndustryKey;
  name: string;
  /** Starting ideas on an empty chat. */
  forms: string[];
  /** What Tia adds by default. */
  adds: string;
  /** What a form here never asks, or asks only with care. */
  never: string;
  /** The usual end: a meeting, a thank-you, or either. */
  after: "meeting" | "thanks";
};

export const INDUSTRIES: Industry[] = [
  { key: "saas", name: "Software and B2B", forms: ["A demo request that asks team size", "A free trial sign-up", "A contact sales form that routes big teams"], adds: "work email, company, team size as ranges; routes teams of 200+ to the enterprise meeting", never: "Don't block free email unless the owner asks.", after: "meeting" },
  { key: "agency", name: "Agencies and services", forms: ["A project brief with a file upload", "A quote request with a budget range", "A discovery call booking"], adds: "budget as ranges, timeline, a file block for briefs", never: "Ask budget as ranges, never an open amount.", after: "meeting" },
  { key: "health", name: "Healthcare and dental", forms: ["A new patient booking form", "An appointment request", "A callback request"], adds: "reason for the visit in plain words, new or returning patient, insurance yes or no, a booking", never: "No diagnoses, medications, allergies or medical history: health records need health data turned on first.", after: "meeting" },
  { key: "legal", name: "Legal", forms: ["A free case review", "A consultation booking", "A contact form for a practice area"], adds: "case type, names for a conflict check, a booking", never: "Add a short line that sending the form doesn't make them a client.", after: "meeting" },
  { key: "realestate", name: "Real estate", forms: ["A home valuation request", "A buyer inquiry", "A rental application interest form"], adds: "buy, sell or rent first, the area, budget as ranges, timeline, an address block", never: "No questions about family, religion, origin or disability (fair housing).", after: "meeting" },
  { key: "finance", name: "Finance and insurance", forms: ["A quote request", "A callback request", "A loan pre-check"], adds: "income and amount as ranges, the best time to call", never: "Never full card, bank, ID or tax numbers in a box; no age, religion or other protected questions on lending.", after: "meeting" },
  { key: "education", name: "Education", forms: ["An enrollment interest form", "An open day sign-up", "A course inquiry"], adds: "student or parent first, program, start term", never: "When the student may be under 13, ask for a parent or guardian's name and email.", after: "thanks" },
  { key: "homeservices", name: "Home services and trades", forms: ["An estimate request with photos", "A service call booking", "A quote for a project"], adds: "an address block, a service area check before the send, a photo upload, the preferred time", never: "Show the service area answer before they send.", after: "meeting" },
  { key: "events", name: "Hospitality and events", forms: ["An RSVP with a plus-one", "A private event inquiry", "A catering request"], adds: "guest count, plus-ones, dietary needs, the date", never: "Keep guest lists short (at most 10 rows).", after: "thanks" },
  { key: "recruiting", name: "Recruiting and HR", forms: ["A job application with a résumé upload", "A referral form", "A talent pool sign-up"], adds: "a résumé file block, links, work rights", never: "No age, date of birth, religion, health, family or other protected questions.", after: "thanks" },
  { key: "retail", name: "Retail and e-commerce", forms: ["A wholesale inquiry", "A return request with a photo", "A waitlist sign-up"], adds: "order number, product, a photo upload for returns", never: "Order lookups stay read-only.", after: "thanks" },
  { key: "nonprofit", name: "Nonprofits", forms: ["A volunteer sign-up", "A newsletter sign-up", "A partnership inquiry"], adds: "availability, interests, how they heard of you", never: "Take donations only through the payment block.", after: "thanks" },
  { key: "general", name: "Other", forms: ["A contact form", "A demo request that asks team size", "An event sign-up with a plus-one"], adds: "name, email and the questions the owner asks for", never: "", after: "thanks" },
];

export const industryOf = (key: string | null | undefined): Industry => INDUSTRIES.find((i) => i.key === key) ?? INDUSTRIES.at(-1)!;

/** What the site told Tia about the brand. */
export type BrandProfile = { industry: IndustryKey; language: string; country: string; languages: string[] };

const LANG = /^[a-z]{2}(-[A-Z]{2})?$/;
const COUNTRY = /^[A-Z]{2}$/;

/** The profile from Tia's answer, cleaned; null when it can't be read. */
export function readProfile(raw: unknown): BrandProfile | null {
  let o = raw;
  if (typeof raw === "string") {
    try {
      o = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!o || typeof o !== "object") return null;
  const r = o as Record<string, unknown>;
  const industry = INDUSTRIES.find((i) => i.key === r.industry)?.key ?? "general";
  const language = typeof r.language === "string" && LANG.test(r.language) ? r.language : "en";
  const country = typeof r.country === "string" && COUNTRY.test(r.country.toUpperCase()) ? r.country.toUpperCase() : "";
  const languages = [...new Set([language, ...(Array.isArray(r.languages) ? r.languages.filter((l): l is string => typeof l === "string" && LANG.test(l)) : [])])].slice(0, 6);
  return { industry, language, country, languages };
}

const LANG_NAMES: Record<string, string> = { en: "English", fr: "French", es: "Spanish", de: "German", it: "Italian", pt: "Portuguese", nl: "Dutch", sv: "Swedish", da: "Danish", nb: "Norwegian", fi: "Finnish", pl: "Polish", ar: "Arabic", he: "Hebrew", ja: "Japanese", zh: "Chinese", ko: "Korean", hi: "Hindi", tr: "Turkish", vi: "Vietnamese" };
export const languageName = (code: string) => LANG_NAMES[code.slice(0, 2)] ?? code;
/** Right-to-left languages flip the form's layout. */
export const RTL = new Set(["ar", "he", "fa", "ur"]);
export const isRtl = (code: string) => RTL.has(code.slice(0, 2));

/** The words for the chip under the brand: "Healthcare and dental in Canada, English and French". */
export function profileWords(p: BrandProfile): string {
  let country = p.country;
  try {
    country = p.country ? (new Intl.DisplayNames(["en"], { type: "region" }).of(p.country) ?? p.country) : "";
  } catch {}
  const langs = p.languages.map(languageName);
  const l = langs.length > 1 ? `${langs.slice(0, -1).join(", ")} and ${langs.at(-1)}` : (langs[0] ?? "");
  return `${industryOf(p.industry).name}${country ? ` in ${country}` : ""}${l ? `, ${l}` : ""}`;
}

/** What Tia reads about the industry with each message. */
export function recipeText(p: BrandProfile | null): string {
  if (!p) return "";
  const i = industryOf(p.industry);
  return `[Industry: ${i.name}${p.country ? `, ${p.country}` : ""}. Write the form in ${languageName(p.language)}${p.languages.length > 1 ? ` (the site also uses ${p.languages.slice(1).map(languageName).join(", ")})` : ""}. Add by default: ${i.adds}.${i.never ? ` Rule: ${i.never}` : ""} Usual end: ${i.after === "meeting" ? "book a meeting" : "a thank-you"}.]`;
}
