import { clientFor, formProvider } from "@/lib/pay/server";
import { startFormPay } from "@/lib/pay/flow";
import { cleaningCtx } from "@/lib/contacts/server";
import { allowed, clientIp, cors, edgeCountry, json, loadForSend, sendCtx, turnstileOk } from "@/lib/forms/server";
import { appBase, stripeClient } from "@/lib/billing";
import { startFormCheckout } from "@/lib/forms/pay";
import { closedMessage } from "@/lib/forms/access";
import { acceptFill, qaOk, type Incoming } from "@/lib/forms/submit";
import { missingProofs } from "@/lib/forms/codes";
import { formPayStripe } from "@/lib/meetings/payServer";
import { serviceClient } from "@/lib/serviceClient";

// A fill from <claritia-form> (docs/form-builder.md Part 2). Checks everything again, then form_submit saves the
// submission, the contact, the consent and one delivery per destination in one transaction. The same idem key
// sent again answers with the first submission (and, for Claritia calendar, the same booking token). Once the form
// is loaded, the spam check, the cleaning lists and the known-fields check run together.

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_BODY = 64 * 1024;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ID.test(id)) return json({ error: "Form not found." }, 404);
  const ip = clientIp(request);
  if (!allowed(`ip:${id}:${ip}`, 10) || !allowed(`form:${id}`, 600)) return json({ error: "Too many tries. Wait a minute and send again." }, 429, { "Retry-After": "60" });
  const text = await request.text();
  if (text.length > MAX_BODY) return json({ error: "That's too much text." }, 413);
  let raw: Incoming;
  try {
    raw = JSON.parse(text) as Incoming;
  } catch {
    return json({ error: "Bad request." }, 400);
  }
  const db = serviceClient();
  if (!db) return json({ error: "Not set up." }, 503);
  try {
    const f = await loadForSend(db, id, raw.version);
    if (!f || f.status !== "live") return json({ error: f ? closedMessage(f.body) : "This form isn't taking answers." }, 410);
    // An email or phone set to "Verify with a code" needs the proof its typed code got (src/lib/forms/codes.ts).
    const test = qaOk(id, raw.qa, process.env.SECRETS_KEY);
    if (!test) {
      const answers = raw.answers && typeof raw.answers === "object" && !Array.isArray(raw.answers) ? (raw.answers as Record<string, unknown>) : {};
      const missing = missingProofs(id, f.body, answers, (raw as { codes?: unknown }).codes);
      if (Object.keys(missing).length) return json({ errors: missing }, 400);
    }
    const r = await acceptFill((fn, args) => db.rpc(fn, args), f, raw, sendCtx(f.workspace_id, (ws) => cleaningCtx(db, ws)), {
      country: edgeCountry(request),
      client: { ip, ua: request.headers.get("user-agent") },
      turnstileFailed: f.body.spam.turnstile ? turnstileOk(raw.turnstile, ip).then((ok) => !ok) : false,
      origin: request.headers.get("origin"),
      ownHost: request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
      test,
      // Settings › Access: real fills so far, for a form with a limit.
      fills: () => Promise.resolve(db.rpc("form_fill_count", { p_form: f.id, p_filters: {} })).then((r) => (r.error ? null : Number(r.data))),
      // Signs the booking token when the form books with Claritia calendar.
      secret: process.env.SECRETS_KEY,
      // A payment block: Checkout on the workspace's connected Stripe account (docs/form-kinds-plan.md step 3).
      pay: async (p) => {
        // PayPal or Square, when the payment block names one (docs/integrations-plan.md, Next step 12).
        const provider = formProvider(f.body);
        if (provider) {
          const rpc = (fn: string, args: Record<string, unknown>) => db.rpc(fn, args);
          const client = await clientFor(rpc, f.workspace_id, provider);
          if (!client) return null;
          const [cur, named] = await Promise.all([db.from("submissions").select("payment").eq("id", p.submissionId).maybeSingle(), db.from("forms").select("name").eq("id", id).maybeSingle()]);
          return startFormPay(rpc, client, {
            form: f.body,
            formName: ((named.data as { name?: string } | null)?.name ?? "Payment"),
            workspaceId: f.workspace_id,
            submissionId: p.submissionId,
            answers: p.answers,
            email: p.email,
            page: p.page,
            hosted: `${appBase()}/f/${id}`,
            base: appBase(),
            existing: ((cur.data as { payment?: { url?: string; status?: string } | null } | null)?.payment ?? null),
          });
        }
        const stripe = stripeClient();
        if (!stripe) return null;
        const [acct, cur] = await Promise.all([
          db.from("payment_accounts").select("stripe_account, ready").eq("workspace_id", f.workspace_id).maybeSingle(),
          db.from("submissions").select("payment").eq("id", p.submissionId).maybeSingle(),
        ]);
        const a = acct.data as { stripe_account: string; ready: boolean } | null;
        const name = ((await db.from("forms").select("name").eq("id", id).maybeSingle()).data as { name?: string } | null)?.name ?? "Payment";
        return startFormCheckout((fn, args) => db.rpc(fn, args), formPayStripe(stripe), {
          form: f.body,
          formId: id,
          formName: name,
          workspaceId: f.workspace_id,
          submissionId: p.submissionId,
          answers: p.answers,
          email: p.email,
          page: p.page,
          hosted: `${appBase()}/f/${id}`,
          account: a?.ready ? a.stripe_account : null,
          existing: ((cur.data as { payment?: { url?: string; status?: string } | null } | null)?.payment ?? null),
        });
      },
    });
    return json(r.body, r.status);
  } catch {
    return json({ error: "Try again in a moment." }, 503);
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}
