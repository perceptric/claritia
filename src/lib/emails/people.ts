// Pasted people for a list (src/app/api/emails/import): one a line, "email, first name, last name", split by commas,
// tabs or semicolons; "Name <email>" works too. Bad and repeated emails are counted and left out.

const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[a-z]{2,}$/i;

export function parsePeople(text: string): { rows: { email: string; email_clean: string; first_name?: string; last_name?: string }[]; skipped: number } {
  const seen = new Set<string>();
  const rows: { email: string; email_clean: string; first_name?: string; last_name?: string }[] = [];
  let skipped = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [raw = "", first = "", last = ""] = line.split(/[,\t;]/).map((x) => x.trim().replace(/^"|"$/g, ""));
    const email = raw.replace(/^.*<([^>]+)>.*$/, "$1").trim();
    const clean = email.toLowerCase();
    if (!EMAIL.test(email) || seen.has(clean)) {
      skipped++;
      continue;
    }
    seen.add(clean);
    rows.push({ email, email_clean: clean, ...(first ? { first_name: first.slice(0, 100) } : {}), ...(last ? { last_name: last.slice(0, 100) } : {}) });
  }
  return { rows, skipped };
}

