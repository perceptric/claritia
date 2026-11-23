// What a person may see when something fails. Two kinds of errors:
//   - ours, written for people: a UserError thrown in our code, or a message our database functions raise
//     (every `raise exception` in supabase/migrations, which Postgres tags with code P0001);
//   - everything else (a constraint, a timeout, a vendor's 500, a bug). Those are never shown as they are: the
//     database's common ones get a plain sentence, and the rest get GENERIC while the details go to the server log.
// Used by the API routes (src/lib/http.ts fail) and the screens (src/lib/attempt.ts errorText). Runs in both.

/** An error whose message was written for the person who will read it. */
export class UserError extends Error {}

export const GENERIC = "Something went wrong. Try again in a moment.";

// Postgres and PostgREST codes that have a plain meaning a person can act on.
const PLAIN: Record<string, string> = {
  "23505": "That already exists.",
  "23503": "Something this needs no longer exists. Reload the page and try again.",
  "23502": "A required value is missing.",
  "23514": "One of the values isn't allowed.",
  "22001": "One of the values is too long.",
  "22P02": "One of the values isn't valid.",
  "42501": "You don't have access to that.",
  "57014": "That took too long. Try again.",
  PGRST116: "That wasn't found. It may have been deleted.",
  PGRST301: "Please sign in again.",
};

/** The message a person may see for this error, or null when it isn't safe to show and GENERIC should be used. */
export function userMessage(e: unknown): string | null {
  if (e instanceof UserError) return e.message;
  if (e && typeof e === "object") {
    const { code, message } = e as { code?: unknown; message?: unknown };
    if (code === "P0001" && typeof message === "string" && message.trim()) return message;
    if (typeof code === "string" && PLAIN[code]) return PLAIN[code]!;
  }
  // The browser couldn't reach the server at all.
  if (e instanceof TypeError && /fetch|network|load failed/i.test(e.message)) return "Can't reach Claritia. Check your connection and try again.";
  return null;
}

/** A database error as an Error that keeps its code, so userMessage can read it. */
export function dbError(e: { message: string; code?: string }): Error {
  return Object.assign(new Error(e.message), { code: e.code });
}
