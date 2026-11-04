// Settings › Access (docs/sharing-plan.md, Access): when a form takes fills. It opens on a date, closes on a date or
// after a number of real fills (spam and tests aside), and shows its closed message while it's shut, the same one a
// paused form shows. The form read tells the page it's closed; the send checks again, so a page loaded before the
// close can't slip a fill in. Browser and server.

import type { Form } from "./schema.ts";

export const CLOSED = "This form is closed.";

/** What the form says while it doesn't take fills. */
export const closedMessage = (form: Pick<Form, "access">): string => form.access?.message?.trim() || CLOSED;

/**
 * Why the form doesn't take fills right now, or null when it does. `fills` counts real fills so far; it's only asked
 * for when the form has a limit, and a count that can't be read leaves the form open (a false close costs more).
 */
export async function accessShut(form: Pick<Form, "access">, now: number, fills?: () => Promise<number | null>): Promise<"early" | "late" | "full" | null> {
  const a = form.access;
  if (!a) return null;
  if (a.opens && now < Date.parse(a.opens)) return "early";
  if (a.closes && now >= Date.parse(a.closes)) return "late";
  if (a.limit && fills) {
    const n = await fills().catch(() => null);
    if (typeof n === "number" && Number.isFinite(n) && n >= a.limit) return "full";
  }
  return null;
}
