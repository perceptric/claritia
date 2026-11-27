// How the app's screens run an action and show its error. Kept apart from ui.tsx so it can be tested in node.

import { GENERIC, newRef, userMessage } from "./errors.ts";

/**
 * What a screen shows for an error: our own message, or GENERIC with a short ref ("(Ref 7KQ2M)") while the details
 * go to the browser console under the same ref, so a person can send it to support and we can find it.
 */
export function errorText(e: unknown): string {
  const known = userMessage(e);
  if (known) return known;
  const ref = newRef();
  console.error(`[error ${ref}]`, e);
  return `${GENERIC} (Ref ${ref})`;
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
