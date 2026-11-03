import { appBase, ensurePortal, stripeClient } from "@/lib/billing";
import { requireUser, roleIn } from "@/lib/serverAuth";

/** Open Stripe's billing page, to change plan, card or cancel. Only the workspace's owner can. */
export async function POST(request: Request) {
  const auth = await requireUser(request, { fresh: true });
  if ("denied" in auth) return auth.denied;
  const { sb } = auth;
  const body = (await request.json().catch(() => ({}))) as { workspaceId?: unknown };
  if (typeof body.workspaceId !== "string") return Response.json({ error: "Missing workspace." }, { status: 400 });
  const stripe = stripeClient();
  if (!stripe) return Response.json({ error: "Billing isn't set up yet." }, { status: 503 });

  // The role and the billing row are read together; the row is only used once the caller is known to be the owner.
  const [role, { data: billing }, configuration] = await Promise.all([
    roleIn(auth, body.workspaceId, { fresh: true }),
    sb.from("workspace_billing").select("stripe_customer_id").eq("workspace_id", body.workspaceId).maybeSingle(),
    ensurePortal(stripe).catch((e: unknown) => e as Error),
  ]);
  if (role !== "owner") return Response.json({ error: "Only the workspace owner can manage billing." }, { status: 403 });
  if (!billing?.stripe_customer_id) return Response.json({ error: "This workspace has no billing yet." }, { status: 400 });
  if (configuration instanceof Error) throw configuration;

  const session = await stripe.billingPortal.sessions.create({ customer: billing.stripe_customer_id, configuration, return_url: `${appBase()}/settings` });
  return Response.json({ url: session.url });
}
