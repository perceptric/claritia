// Who signs a connector's calls (src/lib/sources/composio.ts). Its own file, with no Node imports, because screens
// reach the connectors' types (tests/clientImports.test.ts).

import type { Ctx } from "./types.ts";

/** Composio signs this connection's calls: a connector leaves out its own key headers and query keys. */
export const signedByComposio = (ctx: Pick<Ctx, "creds">) => ctx.creds.type === "composio";

/**
 * Call options for a tool signed with a pasted key: the key's own headers and no Bearer sign-in. On a Composio
 * connection only the plain headers go, and Composio signs the call.
 */
export function keyed(ctx: Pick<Ctx, "creds">, secret: Record<string, string>, plain: Record<string, string> = {}): { auth?: false; headers: Record<string, string> } {
  return signedByComposio(ctx) ? { headers: plain } : { auth: false, headers: { ...plain, ...secret } };
}
