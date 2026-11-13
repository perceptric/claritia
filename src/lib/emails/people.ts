import "server-only";
import { cleanEmail, isRejected } from "../email/address.ts";

// People for a list (src/app/api/emails/import), pasted one a line ("email, first name, last name", split by commas,
// tabs or semicolons; "Name <email>" works too) or from a CSV file matched in the browser (src/lib/emails/csv.ts).
// Addresses are cleaned the way forms clean them, so a person who filled a form and is imported later stays one
// person. Bad and repeated emails are counted and left out, and so are throwaway addresses (disposable domains,
// docs/email-studio-plan.md Part 10); shared inboxes (info@, sales@) are counted and kept, marked by their class.
// Custom fields keep up to 20 values a person, keys as csv.ts makes them.

export type Pasted = { email: string; email_clean: string; email_class: string; first_name?: string; last_name?: string; phone?: string; title?: string; country?: string; fields?: Record<string, string> };
export type Given = { email?: unknown; first_name?: unknown; last_name?: unknown; phone?: unknown; title?: unknown; country?: unknown; fields?: unknown };
export type Cleaned = { rows: Pasted[]; skipped: number; disposable: number; role: number };

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function cleanPeople(given: Given[]): Cleaned {
  const seen = new Set<string>();
  const rows: Pasted[] = [];
  let skipped = 0;
  let disposable = 0;
  let role = 0;
  for (const g of given) {
    const email = str(g.email, 320);
    const c = cleanEmail(email);
    if (isRejected(c)) {
      if (c.rejected === "disposable") disposable++;
      else skipped++;
      continue;
    }
    if (!/\.[a-z]{2,}$/i.test(c.clean) || seen.has(c.clean)) {
      skipped++;
      continue;
    }
    seen.add(c.clean);
    if (c.class === "role") role++;
    const first = str(g.first_name, 100);
    const last = str(g.last_name, 100);
    const phone = str(g.phone, 50);
    const title = str(g.title, 120);
    // A two-letter country code; other words are left out (contacts keep codes, 033_contacts.sql).
    const cc = str(g.country, 10);
    const country = /^[A-Za-z]{2}$/.test(cc) ? cc.toUpperCase() : "";
    const fields =
      g.fields && typeof g.fields === "object" && !Array.isArray(g.fields)
        ? Object.fromEntries(
            Object.entries(g.fields as Record<string, unknown>)
              .filter(([k, v]) => /^[a-z0-9_]{1,40}$/.test(k) && typeof v === "string" && v.trim())
              .slice(0, 20)
              .map(([k, v]) => [k, (v as string).trim().slice(0, 500)]),
          )
        : {};
    rows.push({ email, email_clean: c.clean, email_class: c.class ?? "work", ...(first ? { first_name: first } : {}), ...(last ? { last_name: last } : {}), ...(phone ? { phone } : {}), ...(title ? { title } : {}), ...(country ? { country } : {}), ...(Object.keys(fields).length ? { fields } : {}) });
  }
  return { rows, skipped, disposable, role };
}

export function parsePeople(text: string): Cleaned {
  const given: Given[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [raw = "", first = "", last = ""] = line.split(/[,\t;]/).map((x) => x.trim().replace(/^"|"$/g, ""));
    given.push({ email: raw.replace(/^.*<([^>]+)>.*$/, "$1").trim(), first_name: first, last_name: last });
  }
  return cleanPeople(given);
}
