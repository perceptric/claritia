// How the app's screens run an action and show its error. Kept apart from ui.tsx so it can be tested in node.

import { GENERIC, userMessage } from "./errors.ts";

/** What a screen shows for an error: our own message, or GENERIC with the details in the browser console. */
export function errorText(e: unknown): string {
  const known = userMessage(e);
  if (known) return known;
  console.error(e);
  return GENERIC;
}

/**
 * Runs a screen's action: clears the last error, marks the screen busy while it runs, and shows what went wrong
 * instead of throwing. `after` runs only when the action worked, such as a reload.
 */
export async function attempt(fn: () => Promise<unknown>, o: { setError: (e: string) => void; setBusy?: (busy: boolean) => void; after?: () => void }) {
  o.setError("");
  o.setBusy?.(true);
  try {
    await fn();
    o.after?.();
  } catch (e) {
    o.setError(errorText(e));
  } finally {
    o.setBusy?.(false);
  }
}
