import { brandPlan } from "@/lib/meetings/brandPage";
import { cleanHostname, hostnameProblem } from "@/lib/domains/hostname";
import { addCert, flyFromEnv, linkTarget, removeCert } from "@/lib/domains/fly";
import { forgetDomain } from "@/lib/domains/resolve";
import { checkDomain, type DomainRow } from "@/lib/domains/server";
import { requireUser, roleIn } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";
import { SITE_HOST } from "@/lib/site";

// Settings › Link domain (docs/sharing-plan.md step 4).
//   GET ?workspaceId=      the workspace's subdomain (when those are on), its custom domain and its state, and the
//                          CNAME target
//   POST { workspaceId, action: "add", hostname }   owners, paid plans: one domain a workspace; its certificate is
//                                                   asked for and it's checked at once
//   POST { workspaceId, action: "check" }           check the DNS and the certificate again
//   POST { workspaceId, action: "remove" }          owners: the domain stops serving and its certificate goes

const COLS = "workspace_id, hostname, status, dns_ok, cert_ok, last_error, checked_at";
const bad = (error: string, status = 400) => Response.json({ error }, { status });
const UUID = /^[0-9a-f-]{36}$/;

async function context(request: Request, ws: unknown) {
  const auth = await requireUser(request);
  if ("denied" in auth) return { denied: auth.denied };
  if (typeof ws !== "string" || !UUID.test(ws)) return { denied: bad("Workspace not found.", 404) };
  const role = await roleIn(auth, ws);
  if (!role) return { denied: bad("Workspace not found.", 404) };
  const db = serviceClient();
  if (!db) return { denied: bad("The server is not set up for this.", 500) };
  return { auth, role, db, ws };
}

async function state(db: NonNullable<ReturnType<typeof serviceClient>>, ws: string) {
  const [d, w, b] = await Promise.all([
    db.from("link_domains").select(COLS).eq("workspace_id", ws).maybeSingle(),
    db.rpc("booking_slug_ensure", { p_ws: ws }),
    db.from("workspace_billing").select("plan").eq("workspace_id", ws).maybeSingle(),
  ]);
  const slug = typeof w.data === "string" ? w.data : null;
  return {
    subdomain: process.env.LINK_SUBDOMAINS === "1" && slug ? `https://${slug}.${SITE_HOST}` : null,
    domain: d.error ? null : ((d.data as DomainRow | null) ?? null),
    missing: !!d.error,
    target: linkTarget(),
    paid: brandPlan((b.data as { plan?: string } | null)?.plan ?? "free"),
  };
}

export async function GET(request: Request) {
  const c = await context(request, new URL(request.url).searchParams.get("workspaceId"));
  if ("denied" in c) return c.denied;
  return Response.json(await state(c.db, c.ws));
}

export async function POST(request: Request) {
  const b = (await request.json().catch(() => ({}))) as { workspaceId?: unknown; action?: unknown; hostname?: unknown };
  const c = await context(request, b.workspaceId);
  if ("denied" in c) return c.denied;
  const { db, ws, role } = c;
  const fly = flyFromEnv();
  const cur = await state(db, ws);
  if (cur.missing) return bad("Link domains aren't set up on the server yet.", 503);

  if (b.action === "add") {
    if (role !== "owner") return bad("Only owners add a domain.", 403);
    if (!cur.paid) return bad("Your own domain is on paid plans.", 402);
    if (cur.domain) return bad("Remove the domain you have first.", 409);
    const raw = typeof b.hostname === "string" ? b.hostname : "";
    const problem = hostnameProblem(raw, SITE_HOST);
    if (problem) return bad(problem);
    const hostname = cleanHostname(raw);
    const ins = await db.from("link_domains").insert({ workspace_id: ws, hostname }).select(COLS).single();
    if (ins.error) return bad(ins.error.code === "23505" ? "That domain is already in use." : ins.error.message, ins.error.code === "23505" ? 409 : 500);
    let row = ins.data as DomainRow;
    if (fly) {
      try {
        await addCert(fly, hostname);
      } catch (e) {
        await db.from("link_domains").update({ last_error: `Certificate: ${(e as Error).message}`.slice(0, 300) }).eq("workspace_id", ws);
      }
    }
    row = await checkDomain(db, row, { fly });
    return Response.json({ ...cur, domain: row });
  }

  if (b.action === "check") {
    if (!cur.domain) return bad("Add a domain first.", 404);
    return Response.json({ ...cur, domain: await checkDomain(db, cur.domain, { fly }) });
  }

  if (b.action === "remove") {
    if (role !== "owner") return bad("Only owners remove the domain.", 403);
    if (!cur.domain) return Response.json({ ...cur, domain: null });
    const del = await db.from("link_domains").delete().eq("workspace_id", ws);
    if (del.error) return bad(del.error.message, 500);
    forgetDomain(cur.domain.hostname);
    if (fly) await removeCert(fly, cur.domain.hostname).catch(() => undefined);
    return Response.json({ ...cur, domain: null });
  }

  return bad("Unknown action.");
}
