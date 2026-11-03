// The custom link domains a team may add (docs/sharing-plan.md step 4). Server and tests; the proxy doesn't need it.

import psl from "psl";
import { plainHost } from "./hosts.ts";

/** A hostname a team may add: a subdomain of a real domain, never the site's own. Null when it's fine, else why not. */
export function hostnameProblem(raw: string, site: string): string | null {
  const h = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");
  if (!h) return "Enter a domain, like forms.acme.com.";
  if (h.length > 253 || !/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(h)) return "That isn't a domain. Enter one like forms.acme.com.";
  if (h === site || h.endsWith(`.${site}`)) return `Use your own domain, not ${site}.`;
  if (plainHost(h)) return "Use your own domain, like forms.acme.com.";
  // A subdomain of a registered domain (psl knows co.uk is a suffix): the site at the domain itself stays as it is.
  const parsed = psl.parse(h);
  if (!("domain" in parsed) || !parsed.domain || !parsed.subdomain || parsed.subdomain === "www") return "Use a subdomain, like forms.acme.com, so your website stays where it is.";
  return null;
}

/** The hostname as stored. */
export const cleanHostname = (raw: string) => raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");
