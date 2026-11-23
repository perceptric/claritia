// How the app's screens run an action and show its error. Kept apart from ui.tsx so it can be tested in node.

export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

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
