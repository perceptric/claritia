import { enrichDomain, type Firmo } from "@/lib/company/coresignal";
import { cleanDomain } from "@/lib/company/domains";
import { requireUser } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";

// Enrichment › Providers › Try a domain (docs/app-structure.md 4.3): POST { workspaceId, domain } answers what each
// provider knows about it. Workspace owners only, since a lookup can use a credit. The shared 30-day cache answers
// first; a fresh lookup is saved to it, as the enrich_company job does.

const bad = (error: string, status = 400) => Response.json({ error }, { status });

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const body = (await request.json().catch(() => ({}))) as { workspaceId?: unknown; domain?: unknown };
  const ws = typeof body.workspaceId === "string" ? body.workspaceId : "";
  const { data: m } = ws ? await auth.sb.from("workspace_members").select("role").eq("workspace_id", ws).eq("user_id", auth.user.id).maybeSingle() : { data: null };
  if (!m) return bad("Workspace not found.", 404);
  if ((m as { role: string }).role !== "owner") return bad("Only workspace owners can run lookups.", 403);
  const clean = cleanDomain(typeof body.domain === "string" ? body.domain : "");
  if (!clean) return bad("Type a company's website, like acme.com.");
  const db = serviceClient();
  if (!db) return bad("The server is not set up for this.", 500);
  const { data: hit } = await db.from("company_cache").select("data, fetched_at").eq("domain", clean.domain).gte("fetched_at", new Date(Date.now() - 30 * 86_400_000).toISOString()).maybeSingle();
  if (hit) {
    const d = (hit as { data: (Firmo & { not_found?: boolean }) | null }).data;
    return Response.json({ domain: clean.domain, cached: true, providers: [{ id: "coresignal", found: !!d && !d.not_found, data: d && !d.not_found ? d : null }] });
  }
  const key = process.env.CORESIGNAL_API_KEY?.trim();
  if (!key) return bad("Add CORESIGNAL_API_KEY on the server to run lookups.", 503);
  try {
    const firmo = await enrichDomain(clean.domain, { apiKey: key });
    await db.from("company_cache").upsert({ domain: clean.domain, data: firmo ?? { not_found: true }, vendor: "coresignal", fetched_at: new Date().toISOString() }, { onConflict: "domain" });
    return Response.json({ domain: clean.domain, cached: false, providers: [{ id: "coresignal", found: !!firmo, data: firmo }] });
  } catch (e) {
    return bad(e instanceof Error ? `${e.message}. Try again in a while.` : "The lookup failed.", 502);
  }
}
