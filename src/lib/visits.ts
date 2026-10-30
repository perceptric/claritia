// Small words for site visits, shared by Visitors, the contact page and the company page (no screen code here, so
// a page can use them without loading the Visitors screen).

/** "45s", "3m 07s". */
export const activeTime = (s: number) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`);

/** The badge tone for how sure we are who a visitor is. */
export const LEVEL_TONE: Record<string, "green" | "brand" | "amber"> = { verified: "green", asserted: "brand", probable: "amber" };
