// Wave 4, calculators (docs/form-templates.md): 100 price and savings calculators for jobs people ask "how much?"
// about first. Each is two pages: the questions that set the price with the price worked out live at the end, then
// where to send it, and most end on a booking to confirm the exact price. No pictures.
import type { FormTemplate, Industry, UseCase } from "../types.ts";
import { address, email, fullName, phone, tpl } from "./build.ts";

type Field = ReturnType<typeof fullName>;

export const ADDED = "2026-11-12";

/** A worked-out number from earlier answers by key: money in USD unless the format says otherwise. */
export const calc = (label: string, key: string, formula: string, format: "money" | "number" | "percent" = "money"): Field =>
  ({ kind: "calc", label, key, formula, format, ...(format === "money" ? { currency: "USD" } : {}) }) as Field;

/** Where a home job's estimate goes: the job's address too. */
export const homeWho = (): Field[] => [fullName(), email("Email"), phone("Phone", { required: true }), address("Project address")];

type C = {
  cats: string;
  teams?: string;
  subs?: string;
  also?: Industry[];
  tags?: UseCase[];
  intro: string;
  title?: string;
  fields: Field[];
  who?: Field[];
  submit?: string;
  end?: [string, string];
  book?: boolean;
  /** Months (1 to 12) when the template is in season. */
  seasons?: number[];
};

export function calcForm(id: string, industry: Industry, name: string, blurb: string, c: C): FormTemplate {
  return tpl(id, industry, name, c.tags ?? ["lead", "request"], blurb, {
    cats: c.cats,
    teams: c.teams ?? "sales",
    ...(c.subs ? { subs: c.subs } : {}),
    ...(c.also ? { also: c.also } : {}),
    ...(c.seasons ? { seasons: c.seasons } : {}),
    added: ADDED,
    intro: c.intro,
    pages: [
      { title: c.title ?? "Your project", fields: c.fields },
      { title: "Where to send it", fields: c.who ?? [fullName(), email("Email"), phone()] },
    ],
    submit: c.submit ?? "Send my estimate",
    end: { title: c.end?.[0] ?? "Your estimate is on its way", text: c.end?.[1] ?? "Pick a time to go over the details and lock in an exact price.", booking: c.book ?? true },
  });
}
