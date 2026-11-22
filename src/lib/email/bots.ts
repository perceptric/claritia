// Is a click on a tracked link from a machine? Mail scanners send HEAD, no user agent, or a bot agent. The
// database also drops clicks within seconds of delivery and bursts across links (email_click in 039_email.sql).

import { isbot } from "isbot";

export function botRequest(method: string, userAgent: string | null): boolean {
  if (method.toUpperCase() !== "GET") return true;
  if (!userAgent || userAgent.length < 10) return true;
  return isbot(userAgent);
}
