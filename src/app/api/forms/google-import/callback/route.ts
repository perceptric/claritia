import { appBase } from "@/lib/billing";
import { oauthExchange, readState } from "@/lib/sources/oauth";
import { connectSource } from "@/lib/sources/server";
import { serviceClient } from "@/lib/serviceClient";

// Google sends the person back here after they allow reading their forms (Next step 13). The sign-in is kept, and
// the Forms page picks the import up where it stopped (?gimport=1, the link kept in the browser).

export async function GET(request: Request) {
  const url = new URL(request.url);
  const base = appBase();
  const go = (q: Record<string, string>) => Response.redirect(`${base}/forms?${new URLSearchParams(q)}`, 302);
  const state = readState(url.searchParams.get("state"));
  if (!state || state.kind !== "google_forms") return go({ gimport_error: "The sign-in link expired. Try again." });
  if (url.searchParams.get("error")) return go({ gimport_error: (url.searchParams.get("error_description") || "Access was not allowed.").slice(0, 200) });
  const code = url.searchParams.get("code") ?? "";
  const db = serviceClient();
  if (!db || !code) return go({ gimport_error: "Could not connect." });
  try {
    const tok = await oauthExchange("google_forms", code, `${base}/api/forms/google-import/callback`, state.verifier);
    await connectSource(db, { ws: state.ws, user: state.user, kind: "google_forms", creds: { type: "oauth", access: tok.access, refresh: tok.refresh, expiresAt: tok.expiresAt, extra: tok.extra } });
    return go({ gimport: "1" });
  } catch (e) {
    return go({ gimport_error: e instanceof Error ? e.message.slice(0, 200) : "Could not connect." });
  }
}
