// PayPal and Square for payment blocks and paid meeting types (docs/integrations-plan.md, Next step 12), on the
// team's own account (its keys in Settings › Integrations); the money goes to the team and the fees are theirs.
// The amount is always the server's (payAmount, the meeting type's price). A payment counts only once the server
// has read it back from PayPal or Square: never from the page coming back, never from a webhook's own words.
//   PayPal: Orders v2. A checkout is an order; coming back captures it. A capture that times out (or answers 5xx, or
//   says it was captured already) is read back with GET before anything counts.
//   Square: a Payment Link with its own order; coming back and the payment.updated webhook read the order and its
//   payment back.
// Endpoints and versions are from each tool's docs and are checked against a sandbox account before launch (check).

import { createHmac, timingSafeEqual } from "node:crypto";

export type PayProvider = "paypal" | "square";
export const isPayProvider = (v: unknown): v is PayProvider => v === "paypal" || v === "square";
export const PROVIDER_NAME: Record<PayProvider, string> = { paypal: "PayPal", square: "Square" };

/** What's being paid for: a form's fill (f:<submission>) or a meeting (m:<meeting>). */
export type PayRef = { kind: "form" | "meeting"; id: string };
export const refText = (r: PayRef) => `${r.kind === "form" ? "f" : "m"}:${r.id}`;
export function readRef(raw: unknown): PayRef | null {
  const m = /^([fm]):([0-9a-f-]{36})$/.exec(typeof raw === "string" ? raw : "");
  return m ? { kind: m[1] === "f" ? "form" : "meeting", id: m[2]! } : null;
}

export type Checkout = { id: string; url: string };
/** A payment as the provider says it is now. `capture` is what a refund needs. */
export type PayState = { paid: boolean; state: string; amount: number | null; currency: string | null; ref: PayRef | null; capture: string | null };

export interface PayClient {
  provider: PayProvider;
  create(p: { ref: PayRef; name: string; amount: number; currency: string; email: string | null; successUrl: string; cancelUrl: string }): Promise<Checkout>;
  /** The guest came back: capture when that's how the provider works, then read it back. */
  settle(id: string): Promise<PayState>;
  /** Read it back only. */
  status(id: string): Promise<PayState>;
  refund(s: { id: string; capture: string; amount: number; currency: string }, key: string): Promise<string>;
}

export class PayError extends Error {
  status: number;
  /** No answer, or a 5xx/429: it may have gone through, so it's read back, never taken as a no. */
  unclear: boolean;
  constructor(message: string, status: number, unclear: boolean) {
    super(message);
    this.status = status;
    this.unclear = unclear;
  }
}

/** Currencies with no smaller unit: an amount in "cents" is the amount itself. */
const ZERO = new Set(["jpy", "krw", "vnd", "clp", "isk", "huf", "twd"]);
/** The server's amount (smallest unit) as the provider's decimal string, and back. */
export const toDecimal = (amount: number, currency: string) => (ZERO.has(currency.toLowerCase()) ? String(Math.round(amount)) : (Math.round(amount) / 100).toFixed(2));
export const fromDecimal = (value: string, currency: string) => (ZERO.has(currency.toLowerCase()) ? Math.round(Number(value)) : Math.round(Number(value) * 100));

type Http = { fetcher?: typeof fetch; timeoutMs?: number };

async function send<T>(url: string, init: RequestInit, o: Http, who: string): Promise<T> {
  let res: Response;
  try {
    res = await (o.fetcher ?? fetch)(url, { ...init, signal: AbortSignal.timeout(o.timeoutMs ?? 15_000) });
  } catch (e) {
    throw new PayError((e as Error).name === "TimeoutError" ? `No answer from ${who}.` : `Couldn't reach ${who}.`, 0, true);
  }
  const text = await res.text();
  let j: unknown = null;
  try {
    j = text ? JSON.parse(text) : null;
  } catch {
    j = null;
  }
  if (!res.ok) {
    const b = (j ?? {}) as { message?: string; details?: { issue?: string; description?: string }[]; errors?: { detail?: string; code?: string }[]; error_description?: string };
    const why = b.details?.[0]?.issue ?? b.errors?.[0]?.detail ?? b.message ?? b.error_description ?? `answered ${res.status}`;
    throw new PayError(`${who}: ${why}`.slice(0, 300), res.status, res.status >= 500 || res.status === 429);
  }
  return j as T;
}

// PayPal ------------------------------------------------------------------------------------------------------------

const tokens = new Map<string, { token: string; until: number }>();

export function paypalClient(keys: { client_id: string; client_secret: string; mode?: string }, o: Http = {}): PayClient {
  const base = keys.mode === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
  const token = async () => {
    const k = `${base}|${keys.client_id}`;
    const hit = tokens.get(k);
    if (hit && hit.until > Date.now()) return hit.token;
    const d = await send<{ access_token: string; expires_in: number }>(`${base}/v1/oauth2/token`, {
      method: "POST",
      headers: { authorization: `Basic ${Buffer.from(`${keys.client_id}:${keys.client_secret}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
    }, o, "PayPal");
    tokens.set(k, { token: d.access_token, until: Date.now() + Math.max(60, (d.expires_in ?? 3600) - 300) * 1000 });
    return d.access_token;
  };
  const call = async <T>(path: string, init: RequestInit & { key?: string } = {}) =>
    send<T>(`${base}${path}`, { ...init, headers: { authorization: `Bearer ${await token()}`, "content-type": "application/json", ...(init.key ? { "PayPal-Request-Id": init.key } : {}) } }, o, "PayPal");
  type Order = {
    id: string;
    status: string;
    purchase_units?: { custom_id?: string; reference_id?: string; amount?: { currency_code: string; value: string }; payments?: { captures?: { id: string; status: string; amount?: { currency_code: string; value: string } }[] } }[];
    links?: { rel: string; href: string }[];
  };
  const stateOf = (d: Order): PayState => {
    const u = d.purchase_units?.[0];
    const cap = u?.payments?.captures?.find((c) => c.status === "COMPLETED") ?? null;
    const money = cap?.amount ?? u?.amount ?? null;
    return {
      paid: d.status === "COMPLETED" && !!cap,
      state: d.status,
      amount: money ? fromDecimal(money.value, money.currency_code) : null,
      currency: money ? money.currency_code.toLowerCase() : null,
      ref: readRef(u?.custom_id ?? u?.reference_id),
      capture: cap?.id ?? null,
    };
  };
  const status = async (id: string) => stateOf(await call<Order>(`/v2/checkout/orders/${encodeURIComponent(id)}`));
  return {
    provider: "paypal",
    async create(p) {
      const d = await call<Order>("/v2/checkout/orders", {
        method: "POST",
        key: `order-${refText(p.ref)}`,
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [{ reference_id: refText(p.ref), custom_id: refText(p.ref), description: p.name.slice(0, 127), amount: { currency_code: p.currency.toUpperCase(), value: toDecimal(p.amount, p.currency) } }],
          payment_source: { paypal: { experience_context: { return_url: p.successUrl, cancel_url: p.cancelUrl, user_action: "PAY_NOW", shipping_preference: "NO_SHIPPING" } } },
        }),
      });
      const url = d.links?.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;
      if (!d.id || !url) throw new PayError("PayPal didn't open a checkout.", 0, false);
      return { id: d.id, url };
    },
    async settle(id) {
      try {
        await call<Order>(`/v2/checkout/orders/${encodeURIComponent(id)}/capture`, { method: "POST", key: `capture-${id}`, body: "{}" });
        // The capture's answer can leave out the order's own reference: read the order back for the whole picture.
        return await status(id);
      } catch (e) {
        // Timed out, a 5xx, already captured, or not approved yet: what PayPal holds now is the answer.
        if (e instanceof PayError && (e.unclear || e.status === 422 || e.status === 409)) return status(id);
        throw e;
      }
    },
    status,
    async refund(s, key) {
      const d = await call<{ id: string }>(`/v2/payments/captures/${encodeURIComponent(s.capture)}/refund`, { method: "POST", key, body: "{}" });
      return d.id;
    },
  };
}

/**
 * A PayPal webhook is real only when PayPal says so: verify-webhook-signature with the webhook's id from the team's
 * app, on the team's own credentials.
 */
export async function paypalVerify(keys: { client_id: string; client_secret: string; mode?: string; webhook_id?: string }, headers: Headers, event: unknown, o: Http = {}): Promise<boolean> {
  if (!keys.webhook_id) return false;
  const base = keys.mode === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
  const h = (n: string) => headers.get(n) ?? "";
  if (!h("paypal-transmission-sig") || !h("paypal-transmission-id")) return false;
  const tok = await send<{ access_token: string }>(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: { authorization: `Basic ${Buffer.from(`${keys.client_id}:${keys.client_secret}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  }, o, "PayPal");
  const r = await send<{ verification_status?: string }>(`${base}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: { authorization: `Bearer ${tok.access_token}`, "content-type": "application/json" },
    body: JSON.stringify({
      auth_algo: h("paypal-auth-algo"),
      cert_url: h("paypal-cert-url"),
      transmission_id: h("paypal-transmission-id"),
      transmission_sig: h("paypal-transmission-sig"),
      transmission_time: h("paypal-transmission-time"),
      webhook_id: keys.webhook_id,
      webhook_event: event,
    }),
  }, o, "PayPal");
  return r.verification_status === "SUCCESS";
}

/** The order a PayPal event is about: the order itself, or a capture's order. */
export function paypalOrderOf(e: { event_type?: string; resource?: { id?: string; supplementary_data?: { related_ids?: { order_id?: string } } } }): string | null {
  if (e.event_type === "CHECKOUT.ORDER.APPROVED" || e.event_type === "CHECKOUT.ORDER.COMPLETED") return e.resource?.id ?? null;
  if (e.event_type === "PAYMENT.CAPTURE.COMPLETED") return e.resource?.supplementary_data?.related_ids?.order_id ?? null;
  return null;
}

// Square ------------------------------------------------------------------------------------------------------------

export const SQUARE_VERSION = "2024-10-17";

export function squareClient(keys: { access_token: string; location_id: string; env?: string }, o: Http = {}): PayClient {
  const base = keys.env === "sandbox" ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com";
  const call = <T>(path: string, init: RequestInit = {}) =>
    send<T>(`${base}${path}`, { ...init, headers: { authorization: `Bearer ${keys.access_token}`, "content-type": "application/json", "Square-Version": SQUARE_VERSION } }, o, "Square");
  type Order = { order?: { id: string; state: string; reference_id?: string; total_money?: { amount: number; currency: string }; net_amount_due_money?: { amount: number }; tenders?: { id: string; payment_id?: string }[] } };
  const status = async (orderId: string): Promise<PayState> => {
    const d = (await call<Order>(`/v2/orders/${encodeURIComponent(orderId)}`)).order;
    if (!d) throw new PayError("Square has no such order.", 404, false);
    const pid = d.tenders?.find((t) => t.payment_id)?.payment_id ?? null;
    // The order's own word, and the payment's: both must say it went through.
    const pay = pid ? (await call<{ payment?: { id: string; status: string } }>(`/v2/payments/${encodeURIComponent(pid)}`)).payment : null;
    const due = d.net_amount_due_money?.amount ?? d.total_money?.amount ?? 0;
    return {
      paid: !!pay && pay.status === "COMPLETED" && due === 0,
      state: pay?.status ?? d.state,
      amount: d.total_money?.amount ?? null,
      currency: d.total_money?.currency?.toLowerCase() ?? null,
      ref: readRef(d.reference_id),
      capture: pay?.id ?? null,
    };
  };
  return {
    provider: "square",
    async create(p) {
      const d = await call<{ payment_link?: { id: string; url: string; order_id: string } }>("/v2/online-checkout/payment-links", {
        method: "POST",
        body: JSON.stringify({
          idempotency_key: `link-${refText(p.ref)}`,
          order: {
            location_id: keys.location_id,
            reference_id: refText(p.ref),
            line_items: [{ name: p.name.slice(0, 255), quantity: "1", base_price_money: { amount: Math.round(p.amount), currency: p.currency.toUpperCase() } }],
          },
          checkout_options: { redirect_url: p.successUrl },
          ...(p.email ? { pre_populated_data: { buyer_email: p.email } } : {}),
        }),
      });
      const l = d.payment_link;
      if (!l?.order_id || !l.url) throw new PayError("Square didn't open a checkout.", 0, false);
      // The order is what's checked back; the link is only where the guest pays.
      return { id: l.order_id, url: l.url };
    },
    settle: status,
    status,
    async refund(s, key) {
      const d = await call<{ refund?: { id: string } }>("/v2/refunds", { method: "POST", body: JSON.stringify({ idempotency_key: key.slice(0, 45), payment_id: s.capture, amount_money: { amount: s.amount, currency: s.currency.toUpperCase() } }) });
      if (!d.refund?.id) throw new PayError("Square didn't take the refund.", 0, false);
      return d.refund.id;
    },
  };
}

/** Square signs each webhook: base64 HMAC-SHA256 of the notification address and the raw body, with the signature key. */
export function squareSignatureOk(key: string, url: string, body: string, header: string | null): boolean {
  if (!key || !header) return false;
  const want = Buffer.from(createHmac("sha256", key).update(url + body).digest("base64"));
  const got = Buffer.from(header);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** The order a Square payment.updated event is about. */
export const squareOrderOf = (e: { type?: string; data?: { object?: { payment?: { order_id?: string } } } }): string | null => (e.type === "payment.updated" || e.type === "payment.created" ? (e.data?.object?.payment?.order_id ?? null) : null);

export function payClient(provider: PayProvider, keys: Record<string, string>, o: Http = {}): PayClient {
  return provider === "paypal"
    ? paypalClient({ client_id: keys.client_id ?? "", client_secret: keys.client_secret ?? "", mode: keys.mode }, o)
    : squareClient({ access_token: keys.access_token ?? "", location_id: keys.location_id ?? "", env: keys.env }, o);
}
