// Payments on forms (docs/form-kinds-plan.md step 3). After a fill is saved, a form with a payment block opens Stripe
// Checkout on the workspace's own connected account (Connect Standard, the same account paid meetings use): the
// visitor pays the team directly and Claritia never holds money. The amount is worked out on the server from the
// checked answers (payAmount), never taken from the browser. The submission keeps the payment's state; the Connect
// webhook moves it to paid, expired or failed. Events can come twice or out of order: a paid payment stays paid.
// Stripe is passed in (the route uses the real client, the tests a fake), so this runs anywhere.

import type { Rpc } from "../jobs.ts";
import { payAmount, type Form } from "./schema.ts";

export type FormPayStripe = {
  checkout(account: string, p: { submissionId: string; workspaceId: string; formId: string; name: string; amount: number; currency: string; email: string | null; successUrl: string; cancelUrl: string }): Promise<{ id: string; url: string }>;
};

/** Where Stripe sends the visitor back: their page (or the hosted one) with a note the form reads. */
export function returnUrl(page: string | undefined, hosted: string, paid: boolean): string {
  let u: URL;
  try {
    u = new URL(page && /^https?:\/\//.test(page) ? page : hosted);
  } catch {
    u = new URL(hosted);
  }
  u.searchParams.set("clr_pay", paid ? "done" : "back");
  return u.href;
}

/**
 * Open Checkout for a saved fill. Returns the page to send the visitor to, or null when there's nothing to charge or
 * the workspace can't take payments. A fill sent again (same key) gets the same open checkout.
 */
export async function startFormCheckout(
  rpc: Rpc,
  stripe: FormPayStripe,
  o: { form: Form; formId: string; formName: string; workspaceId: string; submissionId: string; answers: Record<string, unknown>; email: string | null; page?: string; hosted: string; account: string | null; existing?: { url?: string; status?: string } | null },
): Promise<{ url: string } | null> {
  if (o.existing?.status === "paid") return null;
  if (o.existing?.url && o.existing.status === "open") return { url: o.existing.url };
  const due = payAmount(o.form, o.answers);
  if (!due || !o.account) return null;
  const s = await stripe.checkout(o.account, {
    submissionId: o.submissionId,
    workspaceId: o.workspaceId,
    formId: o.formId,
    name: o.formName,
    amount: due.amount,
    currency: due.currency,
    email: o.email,
    successUrl: returnUrl(o.page, o.hosted, true),
    cancelUrl: returnUrl(o.page, o.hosted, false),
  });
  const { error } = await rpc("submission_payment", { p_sid: o.submissionId, p_patch: { session: s.id, url: s.url, account: o.account, amount: due.amount, currency: due.currency, status: "open" } });
  if (error) throw new Error(error.message);
  return { url: s.url };
}

type Obj = { id: string; metadata?: Record<string, string> | null; payment_intent?: string | { id: string } | null; payment_status?: string };

/**
 * A checkout event for a form's submission, already fetched back from Stripe on `account` (so it's real). Only a
 * submission of a workspace whose connected account is that account counts.
 */
export async function handleFormPayEvent(rpc: Rpc, e: { type: string; account?: string | null; data: { object: Obj } }, accountOf: (ws: string) => Promise<string | null>): Promise<"paid" | "closed" | "skipped"> {
  const obj = e.data.object;
  const sid = obj.metadata?.submission_id;
  const ws = obj.metadata?.workspace_id;
  if (!sid || !ws || !/^[0-9a-f-]{36}$/.test(sid) || !/^[0-9a-f-]{36}$/.test(ws)) return "skipped";
  if (!e.account || (await accountOf(ws)) !== e.account) return "skipped";
  const paid = (e.type === "checkout.session.completed" && obj.payment_status === "paid") || e.type === "checkout.session.async_payment_succeeded";
  const intent = typeof obj.payment_intent === "string" ? obj.payment_intent : (obj.payment_intent?.id ?? null);
  if (paid) {
    const { error } = await rpc("submission_payment", { p_sid: sid, p_patch: { session: obj.id, status: "paid", paid_at: new Date().toISOString(), ...(intent ? { intent } : {}) } });
    if (error) throw new Error(error.message);
    return "paid";
  }
  if (e.type === "checkout.session.expired" || e.type === "checkout.session.async_payment_failed") {
    // A payment that went through is never marked unpaid by a late event.
    const { data } = await rpc("submission_payment", { p_sid: sid, p_patch: {} });
    if ((data as { status?: string } | null)?.status === "paid") return "skipped";
    const { error } = await rpc("submission_payment", { p_sid: sid, p_patch: { status: e.type === "checkout.session.expired" ? "expired" : "failed" } });
    if (error) throw new Error(error.message);
    return "closed";
  }
  return "skipped";
}
