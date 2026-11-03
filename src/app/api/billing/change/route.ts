import { applySubscription, changePlan, ensureWebhook, isPaidPlan, stripeClient } from "@/lib/billing";
import { isInterval } from "@/lib/plans";
import { requireUser, roleIn } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";

/**
 * Move a paying workspace to another paid plan or between monthly and yearly, prorated. Only the owner can. Going
 * back to Free is a cancel, on Stripe's billing page (/api/billing/portal).
 */
export async function POST(request: Request) {
  const auth = await requireUser(request, { fresh: true });
  if ("denied" in auth) return auth.denied;
  const body = (await request.json().catch(() => ({}))) as { workspaceId?: unknown; plan?: unknown; interval?: unknown };
  if (typeof body.workspaceId !== "string" || !isPaidPlan(body.plan) || !isInterval(body.interval)) return Response.json({ error: "Pick a plan." }, { status: 400 });
  const stripe = stripeClient();
  const admin = serviceClient();
  if (!stripe || !admin) return Response.json({ error: "Billing isn't set up yet." }, { status: 503 });
  const role = await roleIn(auth, body.workspaceId, { fresh: true });
  if (role !== "owner") return Response.json({ error: "Only the workspace owner can change the plan." }, { status: 403 });
  await ensureWebhook(stripe);
  try {
    const sub = await changePlan(stripe, admin, body.workspaceId, body.plan, body.interval);
    const r = await applySubscription(admin, sub);
    return Response.json({ plan: r.ok ? r.plan : "free" });
  } catch (e) {
    const msg = (e as Error).message;
    if (/no paid plan/i.test(msg)) return Response.json({ error: "Start a plan first." }, { status: 409 });
    throw e;
  }
}
