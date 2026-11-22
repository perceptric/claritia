import { sesDomains } from "../../../lib/email/senders.ts";

// GET /api/version: which commit this server runs (GIT_COMMIT, set when the image is built). The deploy job in
// .github/workflows/build-images.yml waits for it to show the commit it just shipped. Public: a commit id is not secret.
// `ses`: whether this server has SES keys and sends Claritia's own mail (tryclaritia.com) through SES, as yes or no
// only, so a check from outside can tell the switch took (docs/ses-plan.md Step 2).

export const dynamic = "force-dynamic";

export function GET() {
  const keys = !!(process.env.AWS_ACCESS_KEY_ID?.trim() && process.env.AWS_SECRET_ACCESS_KEY?.trim());
  const ses = { keys, own: keys && sesDomains()("alerts@tryclaritia.com") };
  return Response.json({ commit: process.env.GIT_COMMIT || null, ses }, { headers: { "Cache-Control": "no-store" } });
}
