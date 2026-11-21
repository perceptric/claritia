// GET /api/version: which commit this server runs (GIT_COMMIT, set when the image is built). The deploy job in
// .github/workflows/build-images.yml waits for it to show the commit it just shipped. Public: a commit id is not secret.

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ commit: process.env.GIT_COMMIT || null }, { headers: { "Cache-Control": "no-store" } });
}
