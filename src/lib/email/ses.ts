// Amazon SES v2 over plain fetch (docs/ses-plan.md): sending (simple and raw), the account's send rate, and domain
// identities. Needs AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and SES_REGION (default us-east-2); SES_CONFIGURATION_SET
// sends events to SNS (src/lib/email/sns.ts).
//
// SES has no idempotency key, so a send that may have gone out is never tried again: no answer (a timeout, a cut
// connection, a body that isn't JSON) and any 5xx are `unknown`. A throttle sent nothing, so it's `later` and uses no
// try; a paused account or a used-up daily quota is `later` too, so mail waits instead of failing. Every send waits
// its turn in a bucket at the account's MaxSendRate, so SES never has to throttle us.

import { SendError, type Outgoing } from "./provider.ts";
import { signV4, type Creds } from "./sigv4.ts";

export type Identity = { dkimStatus: string; dkimTokens: string[]; mailFrom: string | null; mailFromStatus: string | null; verified: boolean };

/** One email as SES takes it: several addresses get the same message (alerts to a team). */
export type SesMail = Omit<Outgoing, "to"> & { to: string | string[] };

const THROTTLED = new Set(["TooManyRequestsException", "ThrottlingException", "Throttling"]);
const WAIT = new Set(["LimitExceededException", "SendingPausedException", "AccountSuspendedException"]);

/** A token bucket: at most `rate()` calls a second, with no burst above one second's worth. */
export function rateBucket(o: { rate: () => number; now?: () => number; sleep?: (ms: number) => Promise<void> }) {
  const now = o.now ?? Date.now;
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let tokens = 1;
  let last = now();
  return {
    async take(): Promise<void> {
      for (;;) {
        const r = Math.max(0.1, o.rate());
        const t = now();
        tokens = Math.min(Math.max(1, r), tokens + ((t - last) / 1000) * r);
        last = t;
        if (tokens >= 1) {
          tokens -= 1;
          return;
        }
        await sleep(Math.max(1, Math.ceil(((1 - tokens) / r) * 1000)));
      }
    },
  };
}

export type Ses = ReturnType<typeof sesClient>;

export function sesFromEnv(env: NodeJS.ProcessEnv = process.env, fetchFn: typeof fetch = fetch): Ses | null {
  const id = env.AWS_ACCESS_KEY_ID?.trim();
  const secret = env.AWS_SECRET_ACCESS_KEY?.trim();
  if (!id || !secret) return null;
  const rate = Number(env.SES_MAX_RATE);
  return sesClient({
    region: env.SES_REGION?.trim() || "us-east-2",
    creds: { accessKeyId: id, secretAccessKey: secret, sessionToken: env.AWS_SESSION_TOKEN?.trim() || undefined },
    configSet: env.SES_CONFIGURATION_SET?.trim() || null,
    startRate: Number.isFinite(rate) && rate > 0 ? rate : undefined,
    fetchFn,
  });
}

export function sesClient(o: { region: string; creds: Creds; configSet?: string | null; fetchFn?: typeof fetch; timeoutMs?: number; startRate?: number; now?: () => number; sleep?: (ms: number) => Promise<void> }) {
  const base = `https://email.${o.region}.amazonaws.com`;
  const fetchFn = o.fetchFn ?? fetch;
  const now = o.now ?? Date.now;
  // The account's send rate: 1 a second in the sandbox until GetAccount says more. Read again every hour.
  let rate = o.startRate ?? 1;
  let rateAt = 0;
  const bucket = rateBucket({ rate: () => rate, now, sleep: o.sleep });

  /** `safe`: a call that changes nothing, or that may be repeated (identities), so a 5xx or no answer can be tried again. */
  async function call<T>(method: string, path: string, body: object | undefined, safe: boolean): Promise<T> {
    const url = `${base}${path}`;
    const json = body ? JSON.stringify(body) : "";
    const headers = signV4({ method, url, body: json, region: o.region, service: "ses", creds: o.creds, headers: { "content-type": "application/json" } });
    let res: Response;
    try {
      res = await fetchFn(url, { method, headers, body: body ? json : undefined, signal: AbortSignal.timeout(o.timeoutMs ?? 15_000) });
    } catch (e) {
      throw new SendError(`SES didn't answer: ${(e as Error).message}`, safe ? { retry: true, retryAfterS: 30 } : { unknown: true });
    }
    const text = await res.text().catch(() => "");
    if (res.ok) {
      try {
        return (text ? JSON.parse(text) : {}) as T;
      } catch {
        throw new SendError("SES answered with something that isn't JSON", safe ? { retry: true, status: res.status } : { unknown: true, status: res.status });
      }
    }
    let code = res.headers.get("x-amzn-errortype")?.split(":")[0] ?? "";
    let message = text.slice(0, 300);
    try {
      const j = JSON.parse(text) as { message?: string; Message?: string; __type?: string };
      message = j.message ?? j.Message ?? message;
      code ||= (j.__type ?? "").split("#").pop() ?? "";
    } catch {
      // Not JSON; keep the text.
    }
    const msg = `SES ${res.status}${code ? ` ${code}` : ""}: ${message}`;
    if (res.status === 429 || THROTTLED.has(code)) throw new SendError(msg, { status: res.status, code, later: true, retryAfterS: 2 });
    if (WAIT.has(code)) throw new SendError(msg, { status: res.status, code, later: true, retryAfterS: code === "LimitExceededException" ? 600 : 900 });
    if (res.status >= 500) throw new SendError(msg, safe ? { status: res.status, code, retry: true, retryAfterS: 30 } : { status: res.status, code, unknown: true });
    throw new SendError(msg, { status: res.status, code, invalid: res.status === 400 });
  }

  /** The account's MaxSendRate, read at most once an hour; a failed read keeps the rate we have. */
  async function freshRate(): Promise<void> {
    if (now() - rateAt < 3_600_000) return;
    rateAt = now();
    try {
      const r = await call<{ SendQuota?: { MaxSendRate?: number } }>("GET", "/v2/email/account", undefined, true);
      const v = Number(r.SendQuota?.MaxSendRate);
      if (Number.isFinite(v) && v > 0) rate = v;
    } catch {
      // Keep the last rate.
    }
  }

  const tags = (t: Record<string, string>) =>
    Object.entries(t)
      // SES takes letters, digits, _ and - in tag names and values.
      .map(([Name, Value]) => ({ Name: Name.replace(/[^\w-]/g, "_").slice(0, 256), Value: String(Value).replace(/[^\w-]/g, "_").slice(0, 256) }))
      .filter((x) => x.Name && x.Value);

  async function sendBody(body: object): Promise<string> {
    await freshRate();
    await bucket.take();
    const r = await call<{ MessageId?: string }>("POST", "/v2/email/outbound-emails", { ...body, ...(o.configSet ? { ConfigurationSetName: o.configSet } : {}) }, false);
    if (!r.MessageId) throw new SendError("SES took the email but sent no message id", { unknown: true });
    return r.MessageId;
  }

  const ident = (domain: string) => `/v2/email/identities/${encodeURIComponent(domain)}`;
  type Raw = { DkimAttributes?: { Status?: string; Tokens?: string[] }; MailFromAttributes?: { MailFromDomain?: string; MailFromDomainStatus?: string }; VerifiedForSendingStatus?: boolean };
  const shape = (r: Raw): Identity => ({
    dkimStatus: r.DkimAttributes?.Status ?? "NOT_STARTED",
    dkimTokens: r.DkimAttributes?.Tokens ?? [],
    mailFrom: r.MailFromAttributes?.MailFromDomain || null,
    mailFromStatus: r.MailFromAttributes?.MailFromDomainStatus || null,
    verified: !!r.VerifiedForSendingStatus,
  });
  const missing = (e: unknown) => e instanceof SendError && (e.status === 404 || e.code === "NotFoundException");

  return {
    region: o.region,
    /** The send rate in use now. */
    rate: () => rate,
    /** Send one email. Returns SES's message id. */
    async send(m: SesMail): Promise<string> {
      const utf8 = (Data: string) => ({ Data, Charset: "UTF-8" });
      return sendBody({
        FromEmailAddress: m.from,
        Destination: { ToAddresses: Array.isArray(m.to) ? m.to : [m.to] },
        ...(m.replyTo ? { ReplyToAddresses: [m.replyTo] } : {}),
        Content: { Simple: { Subject: utf8(m.subject), Body: { Html: utf8(m.html), Text: utf8(m.text) }, ...(m.headers.length ? { Headers: m.headers.map((h) => ({ Name: h.name, Value: h.value })) } : {}) } },
        EmailTags: tags(m.tags),
      });
    },
    /** Send a whole MIME message as it is (meeting emails with their calendar part). */
    async sendRaw(m: { from: string; to: string; raw: string; tags?: Record<string, string> }): Promise<string> {
      return sendBody({ FromEmailAddress: m.from, Destination: { ToAddresses: [m.to] }, Content: { Raw: { Data: Buffer.from(m.raw, "utf8").toString("base64") } }, EmailTags: tags(m.tags ?? {}) });
    },
    /** The domain's identity, or null when SES doesn't have it. */
    async getIdentity(domain: string): Promise<Identity | null> {
      try {
        return shape(await call<Raw>("GET", ident(domain), undefined, true));
      } catch (e) {
        if (missing(e)) return null;
        throw e;
      }
    },
    /** Add the domain with Easy DKIM (three CNAMEs). */
    async createIdentity(domain: string): Promise<Identity> {
      return shape(await call<Raw>("POST", "/v2/email/identities", { EmailIdentity: domain, ...(o.configSet ? { ConfigurationSetName: o.configSet } : {}) }, true));
    },
    async putMailFrom(domain: string, mailFrom: string): Promise<void> {
      await call("PUT", `${ident(domain)}/mail-from`, { MailFromDomain: mailFrom, BehaviorOnMxFailure: "USE_DEFAULT_VALUE" }, true);
    },
    async deleteIdentity(domain: string): Promise<void> {
      try {
        await call("DELETE", ident(domain), undefined, true);
      } catch (e) {
        if (!missing(e)) throw e;
      }
    },
  };
}
