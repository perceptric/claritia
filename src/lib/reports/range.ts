// Reports' date ranges and number words (docs/enrich-workflows-reports.md 3.2). Pure, so tests can run it. Days are
// "YYYY-MM-DD" in the workspace's time zone; the database turns them into times.

export type Preset = "this_month" | "last_month" | "last_90" | "this_quarter";
export type Range = { from: string; to: string };

export const PRESETS: { value: Preset; label: string }[] = [
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "last_90", label: "Last 90 days" },
  { value: "this_quarter", label: "This quarter" },
];

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m, d));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
};

/** Today in a time zone, as YYYY-MM-DD. */
export function todayIn(tz: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** A preset's days, ending today at the latest. */
export function presetRange(p: Preset, today: string): Range {
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  switch (p) {
    case "this_month":
      return { from: ymd(y, m - 1, 1), to: today };
    case "last_month":
      return { from: ymd(y, m - 2, 1), to: ymd(y, m - 1, 0) };
    case "last_90":
      return { from: ymd(y, m - 1, d - 89), to: today };
    case "this_quarter":
      return { from: ymd(y, Math.floor((m - 1) / 3) * 3, 1), to: today };
  }
}

export const daysIn = (r: Range) => Math.round((Date.parse(`${r.to}T00:00:00Z`) - Date.parse(`${r.from}T00:00:00Z`)) / 86_400_000) + 1;

/** The same number of days right before. */
export function previous(r: Range): Range {
  const n = daysIn(r);
  const [y, m, d] = r.from.split("-").map(Number) as [number, number, number];
  return { from: ymd(y, m - 1, d - n), to: ymd(y, m - 1, d - 1) };
}

/** "Oct 1 – 31", "Sep 15 – Oct 14", "Dec 20, 2025 – Jan 3, 2026". */
export function rangeWords(r: Range): string {
  const a = new Date(`${r.from}T12:00:00Z`);
  const b = new Date(`${r.to}T12:00:00Z`);
  const md = (t: Date, year: boolean) => t.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" });
  const sameYear = a.getUTCFullYear() === b.getUTCFullYear();
  if (sameYear && a.getUTCMonth() === b.getUTCMonth()) return `${md(a, false)} – ${b.getUTCDate()}`;
  return `${md(a, !sameYear)} – ${md(b, !sameYear)}`;
}

/** Change against the period before: "+12%", "−3%", "new" when it was 0, null when both are 0. */
export function delta(now: number, before: number): string | null {
  if (!now && !before) return null;
  if (!before) return "new";
  const p = Math.round(((now - before) / before) * 100);
  return p === 0 ? "same" : `${p > 0 ? "+" : "−"}${Math.abs(p)}%`;
}

/** A share as a whole percent, or "–" with nothing to divide by. */
export const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : "–");

/** Seconds as the two largest units: "45s", "3m", "2h 10m", "3d 4h". */
export function duration(s: number | null | undefined): string {
  if (s == null || !Number.isFinite(s)) return "–";
  const t = Math.max(0, Math.round(s));
  if (t < 60) return `${t}s`;
  if (t < 3600) return `${Math.round(t / 60)}m`;
  if (t < 86400) {
    const h = Math.floor(t / 3600);
    const m = Math.round((t % 3600) / 60);
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(t / 86400);
  const h = Math.round((t % 86400) / 3600);
  return h ? `${d}d ${h}h` : `${d}d`;
}

/** 1,284 / 12.9K / 4.2M. */
export function compact(n: number): string {
  const a = Math.abs(n);
  if (a < 10_000) return Math.round(n).toLocaleString("en-US");
  if (a < 1_000_000) return `${(n / 1000).toFixed(a < 100_000 ? 1 : 0).replace(/\.0$/, "")}K`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

export const money = (n: number) => `$${compact(n)}`;

/** Rows as CSV: values quoted when they need it, and cells that start like a formula made safe for spreadsheets. */
export function toCsv(head: string[], rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    if (v == null) return "";
    let s = String(v);
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
