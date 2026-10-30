// The router's spam step (docs/router.md 3.2): plain rules a person can read, each one a small function. A lead with
// a signal is held for a person to look at, never dropped, so every rule leans toward letting a real lead through.

import type { Facts, RouterBody, SpamSignal } from "./types.ts";

const JUNK = new Set(["test", "testing", "tester", "asdf", "asd", "qwe", "qwer", "qwerty", "fake", "none", "na", "n/a", "xxx", "aaa", "abc", "sdf", "foo", "bar", "nobody", "noname", "anonymous", "user", "name", "first", "last", "blah", "hello"]);

/** Real names with no vowels, kept so they're never held: Ng, Wu, Ly... */
const SHORT_OK = /^[a-z]{1,3}$/;

const VOWELS = /[aeiouyàáâãäåæèéêëìíîïòóôõöøùúûüýÿœ]/i;

/** Whether a name looks made up: a link, a junk word, the same letter over and over, or a long run of consonants. */
export function fakeName(first: string | null | undefined, last: string | null | undefined): boolean {
  const full = `${first ?? ""} ${last ?? ""}`.trim();
  if (!full) return false;
  if (/https?:|www\.|\.(com|net|ru|xyz|top)\b|<|>|@/i.test(full)) return true;
  if ((full.match(/\d/g) ?? []).length > 2) return true;
  const words = full.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length && words.every((w) => JUNK.has(w.replace(/[^a-z/]/g, "")))) return true;
  for (const w of words) {
    const letters = w.replace(/[^\p{L}]/gu, "");
    if (!letters) continue;
    if (/(.)\1\1\1/u.test(letters)) return true;
    // Only for Latin letters: other scripts don't use these vowels.
    if (/^[a-z]+$/.test(letters) && letters.length >= 5 && !VOWELS.test(letters) && !SHORT_OK.test(letters)) return true;
    if (/^[a-z]+$/.test(letters) && /[bcdfghjklmnpqrstvwxz]{6,}/.test(letters)) return true;
  }
  // "Asdf Asdf", "Bob Bob": the same made-up word twice (real names repeat too, so only short or junk ones).
  if (words.length === 2 && words[0] === words[1] && (words[0]!.length <= 3 || JUNK.has(words[0]!))) return true;
  return false;
}

/** Whether a domain or email is on a list of domains and emails ("acme.com" also covers "eu.acme.com"). */
export function listed(list: string[], email: string | null, domain: string | null): boolean {
  const e = (email ?? "").trim().toLowerCase();
  const d = (domain ?? (e.includes("@") ? e.split("@").pop()! : "")).toLowerCase();
  return list.some((raw) => {
    const x = raw.trim().toLowerCase().replace(/^@/, "");
    if (!x) return false;
    if (x.includes("@")) return x === e;
    return d === x || d.endsWith(`.${x}`);
  });
}

/**
 * The spam signals a lead shows, and how many checks ran. An allow-listed lead shows none. A lead from a form skips
 * free email and too many fills: the form decides those before it lets a fill in (docs/scheduling-plan.md Part 13.4).
 */
export function spamSignals(body: RouterBody, f: Facts): { signals: SpamSignal[]; checks: number; allowed: boolean } {
  const fromForm = f.values["lead.source"] === "form";
  const s = fromForm ? { ...body.spam, tooMany: false, freeMail: false } : body.spam;
  const l = f.lead;
  if (listed(f.lists.allow, l.email, l.domain)) return { signals: [], checks: 0, allowed: true };
  const out: SpamSignal[] = [];
  let checks = 1;
  if (listed(f.lists.block, l.email, l.domain)) out.push("blocked");
  if (s.disposable) {
    checks++;
    if (l.disposable) out.push("disposable");
  }
  if (s.fakeName) {
    checks++;
    if (fakeName(l.firstName, l.lastName)) out.push("fake_name");
  }
  if (s.tooMany) {
    checks++;
    if (l.recent > Math.max(1, s.maxPerHour)) out.push("too_many");
  }
  if (s.freeMail) {
    checks++;
    if (l.emailClass === "free") out.push("free_mail");
  }
  return { signals: out, checks, allowed: false };
}

export const SIGNAL_WORDS: Record<SpamSignal, string> = {
  disposable: "Throwaway email",
  blocked: "Blocked",
  fake_name: "Fake name",
  too_many: "Too many fills",
  free_mail: "Personal email",
  rule: "A rule held it",
};
