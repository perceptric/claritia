// Merge fields in an email: {{first_name|there}}. Unknown keys and blanks take the fallback. Kept apart from the
// engine (which needs node:crypto) so the browser can use it.

export const MERGE_KEYS = ["first_name", "last_name", "company", "title", "meeting_time", "meeting_link", "reschedule_link"] as const;
export const MERGE = /\{\{\s*([a-z_]+)\s*(?:\|([^}]*))?\}\}/g;

export function fillMerge(text: string, vars: Record<string, string | null | undefined>): string {
  return text.replace(MERGE, (_, k: string, fallback?: string) => {
    const v = (MERGE_KEYS as readonly string[]).includes(k) ? vars[k] : undefined;
    return v && v.trim() ? v.trim() : (fallback ?? "").trim();
  });
}

/** Merge fields that have no fallback, which would leave a gap for a contact missing that value. */
export function mergeGaps(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(MERGE)) if (m[2] === undefined || !(MERGE_KEYS as readonly string[]).includes(m[1]!)) out.push(m[0]);
  return out;
}
