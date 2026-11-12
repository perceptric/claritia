import "server-only";
import { cleanEmail, isRejected } from "../email/address.ts";

// Pasted people for a list (src/app/api/emails/import): one a line, "email, first name, last name", split by commas,
// tabs or semicolons; "Name <email>" works too. Addresses are cleaned the way forms clean them, so a person who filled
// a form and is imported later stays one person. Bad and repeated emails are counted and left out, and so are
// throwaway addresses (disposable domains, docs/email-studio-plan.md Part 10); shared inboxes (info@, sales@) are
// counted and kept, marked by their class.

export type Pasted = { email: string; email_clean: string; email_class: string; first_name?: string; last_name?: string };

export function parsePeople(text: string): { rows: Pasted[]; skipped: number; disposable: number; role: number } {
  const seen = new Set<string>();
  const rows: Pasted[] = [];
  let skipped = 0;
  let disposable = 0;
  let role = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [raw = "", first = "", last = ""] = line.split(/[,\t;]/).map((x) => x.trim().replace(/^"|"$/g, ""));
    const email = raw.replace(/^.*<([^>]+)>.*$/, "$1").trim();
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
    rows.push({ email: email.slice(0, 320), email_clean: c.clean, email_class: c.class ?? "work", ...(first ? { first_name: first.slice(0, 100) } : {}), ...(last ? { last_name: last.slice(0, 100) } : {}) });
  }
  return { rows, skipped, disposable, role };
}
