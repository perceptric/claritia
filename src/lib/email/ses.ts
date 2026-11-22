// Amazon SES v2 over plain fetch (https://docs.aws.amazon.com/ses/latest/APIReference-V2/). Only the calls Claritia
// makes: send a raw message, set up a domain identity, and route a workspace's events to SNS.
//   AWS_SES_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY (and AWS_SESSION_TOKEN if the keys are temporary).

import { signRequest, type Credentials } from "./sigv4.ts";

export class SesError extends Error {
  status: number;
  code: string;
  /** Throttling and server errors: SES didn't take the message, so trying again is safe. */
  retryable: boolean;
  constructor(status: number, code: string, message: string) {
    super(`SES ${status} ${code}: ${message}`.slice(0, 1000));
    this.status = status;
    this.code = code;
    this.retryable = status === 429 || status >= 500 || /Throttl|TooManyRequests|LimitExceeded/i.test(code);
  }
}

export type Tag = { Name: string; Value: string };
export type Identity = { dkimStatus: string | null; dkimTokens: string[]; mailFromStatus: string | null };

export type Ses = {
  region: string;
  sendRaw(raw: string, o: { configSet?: string | null; tags?: Tag[]; from: string; to: string }): Promise<string>;
  createIdentity(domain: string, configSet?: string | null): Promise<Identity>;
  getIdentity(domain: string): Promise<Identity>;
  setMailFrom(domain: string, mailFrom: string): Promise<void>;
  deleteIdentity(domain: string): Promise<void>;
  /** Make the configuration set and its SNS event destination. Safe to call again. */
  ensureConfigSet(name: string, topicArn: string): Promise<void>;
};

export type SesConfig = { region: string; creds: Credentials; fetch?: typeof fetch; timeoutMs?: number };

/** From the environment, or null when sending isn't set up. */
export function sesConfigFromEnv(env = process.env): SesConfig | null {
  const region = env.AWS_SES_REGION?.trim();
  const accessKeyId = env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.AWS_SECRET_ACCESS_KEY?.trim();
  if (!region || !accessKeyId || !secretAccessKey) return null;
  return { region, creds: { accessKeyId, secretAccessKey, sessionToken: env.AWS_SESSION_TOKEN?.trim() || undefined } };
}

const identity = (data: Record<string, unknown>): Identity => {
  const dkim = (data.DkimAttributes ?? {}) as { Status?: string; Tokens?: string[] };
  const mf = (data.MailFromAttributes ?? {}) as { MailFromDomainStatus?: string };
  return { dkimStatus: dkim.Status ?? null, dkimTokens: Array.isArray(dkim.Tokens) ? dkim.Tokens.filter((t) => /^[a-z0-9]{20,64}$/.test(t)) : [], mailFromStatus: mf.MailFromDomainStatus ?? null };
};

export function sesClient(cfg: SesConfig): Ses {
  const fetchFn = cfg.fetch ?? fetch;
  const base = `https://email.${cfg.region}.amazonaws.com`;

  async function call(method: string, path: string, body?: object): Promise<Record<string, unknown>> {
    const text = body ? JSON.stringify(body) : "";
    const url = `${base}${path}`;
    const headers = signRequest({ method, url, body: text, region: cfg.region, service: "ses", creds: cfg.creds, headers: body ? { "content-type": "application/json" } : {} });
    const res = await fetchFn(url, { method, headers, body: body ? text : undefined, signal: AbortSignal.timeout(cfg.timeoutMs ?? 20_000) });
    const raw = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {}
    if (!res.ok) {
      // The error name is in x-amzn-ErrorType ("AlreadyExistsException:http://...") or the body.
      const code = (res.headers.get("x-amzn-errortype") ?? String(data.__type ?? data.code ?? "Error")).split(/[:#]/)[0]!;
      throw new SesError(res.status, code, String(data.message ?? data.Message ?? raw).slice(0, 500));
    }
    return data;
  }
  const exists = (e: unknown) => e instanceof SesError && /AlreadyExists/i.test(e.code);
  const enc = encodeURIComponent;

  return {
    region: cfg.region,
    async sendRaw(raw, o) {
      const data = await call("POST", "/v2/email/outbound-emails", {
        FromEmailAddress: o.from,
        Destination: { ToAddresses: [o.to] },
        Content: { Raw: { Data: Buffer.from(raw, "utf8").toString("base64") } },
        ...(o.configSet ? { ConfigurationSetName: o.configSet } : {}),
        ...(o.tags?.length ? { EmailTags: o.tags } : {}),
      });
      const id = String(data.MessageId ?? "");
      if (!id) throw new SesError(200, "NoMessageId", "SES answered without a message id");
      return id;
    },
    async createIdentity(domain, configSet) {
      try {
        return identity(await call("POST", "/v2/email/identities", { EmailIdentity: domain, ...(configSet ? { ConfigurationSetName: configSet } : {}) }));
      } catch (e) {
        if (exists(e)) return identity(await call("GET", `/v2/email/identities/${enc(domain)}`));
        throw e;
      }
    },
    async getIdentity(domain) {
      return identity(await call("GET", `/v2/email/identities/${enc(domain)}`));
    },
    async setMailFrom(domain, mailFrom) {
      await call("PUT", `/v2/email/identities/${enc(domain)}/mail-from`, { MailFromDomain: mailFrom, BehaviorOnMxFailure: "USE_DEFAULT_VALUE" });
    },
    async deleteIdentity(domain) {
      try {
        await call("DELETE", `/v2/email/identities/${enc(domain)}`);
      } catch (e) {
        if (!(e instanceof SesError && e.code === "NotFoundException")) throw e;
      }
    },
    async ensureConfigSet(name, topicArn) {
      try {
        await call("POST", "/v2/email/configuration-sets", { ConfigurationSetName: name, ReputationOptions: { ReputationMetricsEnabled: true }, SendingOptions: { SendingEnabled: true } });
      } catch (e) {
        if (!exists(e)) throw e;
      }
      try {
        await call("POST", `/v2/email/configuration-sets/${enc(name)}/event-destinations`, {
          EventDestinationName: "claritia-sns",
          EventDestination: { Enabled: true, MatchingEventTypes: ["SEND", "REJECT", "BOUNCE", "COMPLAINT", "DELIVERY", "DELIVERY_DELAY"], SnsDestination: { TopicArn: topicArn } },
        });
      } catch (e) {
        if (!exists(e)) throw e;
      }
    },
  };
}
