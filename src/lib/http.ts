import { GENERIC, newRef, userMessage } from "./errors.ts";

/** A JSON error answer for an API route: { error } with a 400 unless another status is given. */
export const bad = (error: string, status = 400) => Response.json({ error }, { status });

/**
 * What a person may read about an error a route caught: our own message (src/lib/errors.ts) as it is, or GENERIC
 * with a short reference after the details are logged here, so support can find them.
 */
export function publicMessage(e: unknown): string {
  const known = userMessage(e);
  if (known) return known;
  const ref = newRef();
  console.error(`[error ${ref}]`, e);
  return `${GENERIC} (Ref ${ref})`;
}

/** The JSON answer for an error a route caught: our own message with `status`, or publicMessage's with a 500. */
export function fail(e: unknown, status = 400): Response {
  const known = userMessage(e);
  return known ? bad(known, status) : bad(publicMessage(e), 500);
}
