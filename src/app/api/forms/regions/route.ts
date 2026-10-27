import { cors, json } from "@/lib/forms/server";
import { regionsOf } from "@/lib/forms/regions";

// One country's regions, for a <claritia-form> dropdown that follows a country field (docs/forms-plan.md 2.2).
// GET ?c=US → { regions: [...] }. The lists never change between deploys, so they cache for a day.

export function GET(request: Request) {
  const c = (new URL(request.url).searchParams.get("c") ?? "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return json({ regions: [] }, 400);
  return json({ regions: regionsOf(c) ?? [] }, 200, { "Cache-Control": "public, max-age=86400" });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}
