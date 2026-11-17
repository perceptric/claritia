// "Did you mean ana@gmail.com?" under the sign-in screen's email box (src/components/app/AuthScreen.tsx): a typed
// address one or two letters off a common mail provider, or with a mistyped .com, gets a one-click fix. Only a
// suggestion: the address as typed still works. Runs in the browser and in tests/emailTypos.test.ts.

const COMMON = [
  "gmail.com", "googlemail.com", "yahoo.com", "hotmail.com", "outlook.com", "live.com", "msn.com", "icloud.com", "me.com",
  "aol.com", "proton.me", "protonmail.com", "gmx.com", "gmx.de", "web.de", "mail.com", "ymail.com", "mac.com", "yandex.com",
  "zoho.com", "hotmail.co.uk", "yahoo.co.uk", "outlook.fr",
];

// Endings that are almost always a slip for .com.
const COM_SLIPS = new Set(["con", "cpm", "cmo", "ocm", "comm", "vom", "xom", "om", "co m", "c0m"]);

/** Edit distance with swaps (Damerau), stopping early past `max`. */
function distance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2]![j - 2]! + 1);
      d[i]![j] = v;
    }
  }
  return d[a.length]![b.length]!;
}

/** The fixed address, or "" when the typed one looks right (or isn't an address yet). */
export function suggestEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at < 1) return "";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!domain.includes(".") || COMMON.includes(domain)) return "";
  // A close miss of a common provider: gmial.com, gmail.con, hotmal.com. Short names (me.com, aol.com) are never a
  // target: too many real domains sit one or two letters from them.
  let best = "";
  let bestD = 3;
  for (const c of COMMON) {
    if (c.length < 9) continue;
    const d = distance(domain, c);
    if (d < bestD) [best, bestD] = [c, d];
  }
  // Short domains need a closer match, so a real company's two-letter name is never "fixed".
  if (best && bestD <= (domain.length >= 8 ? 2 : 1)) return `${local}@${best}`;
  // Any domain ending in a slip of .com: acme.con.
  const dot = domain.lastIndexOf(".");
  const tld = domain.slice(dot + 1);
  if (COM_SLIPS.has(tld)) return `${local}@${domain.slice(0, dot)}.com`;
  return "";
}
