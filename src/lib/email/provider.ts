// What every email sender shares (docs/enrich-workflows-reports.md Part 0): the outgoing shape, the From header and
// the error that sorts a provider's answer into sent, not now, failed or unknown.

export type Outgoing = { from: string; to: string; replyTo?: string | null; subject: string; html: string; text: string; headers: { name: string; value: string }[]; tags: Record<string, string> };

/**
 * A provider's no. later: the provider refused it for now (rate limit) and sent nothing, so it goes back in line
 * without using a try. retry: a server error on a call that's safe to repeat (same idempotency key). unknown: no
 * clear answer, so the email may have gone out and must not be sent again. Anything else failed for good.
 */
export class SendError extends Error {
  status: number;
  code: string;
  later: boolean;
  retry: boolean;
  unknown: boolean;
  /** The provider said the request itself was bad (a bad address in a batch); worth sending one by one. */
  invalid: boolean;
  retryAfterS: number;
  constructor(message: string, o: { status?: number; code?: string; later?: boolean; retry?: boolean; unknown?: boolean; invalid?: boolean; retryAfterS?: number } = {}) {
    super(message);
    this.status = o.status ?? 0;
    this.code = o.code ?? "";
    this.later = o.later ?? false;
    this.retry = o.retry ?? false;
    this.unknown = o.unknown ?? false;
    this.invalid = o.invalid ?? false;
    this.retryAfterS = o.retryAfterS ?? 60;
  }
}

export type Outcome = "ok" | "later" | "retry" | "unknown" | "failed";

/** How a thrown error is recorded. */
export function outcomeOf(e: unknown): Outcome {
  const se = e instanceof SendError ? e : null;
  return se?.unknown ? "unknown" : se?.later ? "later" : se?.retry ? "retry" : "failed";
}

/** A From header: the name quoted, or MIME-encoded when it isn't plain ASCII (RFC 2047). */
export function fromHeader(name: string | null | undefined, email: string): string {
  const n = (name ?? "").replace(/[\r\n]+/g, " ").trim();
  if (!n) return email;
  if (/^[\x20-\x7e]*$/.test(n)) return `"${n.replace(/(["\\])/g, "\\$1")}" <${email}>`;
  return `=?UTF-8?B?${Buffer.from(n, "utf8").toString("base64")}?= <${email}>`;
}
