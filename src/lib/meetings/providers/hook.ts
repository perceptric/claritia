// Pushes from Google (events.watch) and Microsoft (Graph subscriptions) at /api/calendar/hook (docs/meetings-scheduler.md
// 1.3). Graph's validation handshake is answered with its token as plain text. A push is believed only with our own
// signed channel token (Google's X-Goog-Channel-Token, Graph's clientState), and only queues a refresh for that
// account: a push never carries busy times itself, and repeated pushes join the one waiting refresh.

import type { Rpc } from "../../jobs.ts";
import { readChannelToken } from "./index.ts";

async function hook(rpc: Rpc, account: string, channel: string) {
  const { data, error } = await rpc("calendar_hook", { p_account: account, p_channel: channel });
  if (error) throw new Error(error.message);
  return data === true;
}

export async function handleHook(request: Request, rpc: Rpc): Promise<Response> {
  const url = new URL(request.url);

  // Graph checks the address before a subscription starts: send the token back as is, within 10 seconds.
  const validation = url.searchParams.get("validationToken");
  if (validation !== null) return new Response(validation.slice(0, 4000), { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } });

  try {
    const google = request.headers.get("x-goog-channel-id");
    if (google) {
      // The first message on a new channel says only that it works.
      if (request.headers.get("x-goog-resource-state") === "sync") return new Response(null, { status: 200 });
      const account = readChannelToken(request.headers.get("x-goog-channel-token"));
      if (!account) return new Response(null, { status: 401 });
      await hook(rpc, account, google);
      return new Response(null, { status: 200 });
    }

    const body = (await request.json().catch(() => null)) as { value?: { subscriptionId?: string; clientState?: string }[] } | null;
    const items = Array.isArray(body?.value) ? body.value.slice(0, 100) : [];
    if (!items.length) return new Response(null, { status: 400 });
    let ours = 0;
    const seen = new Set<string>();
    for (const n of items) {
      const account = readChannelToken(n.clientState);
      if (!account || typeof n.subscriptionId !== "string") continue;
      ours++;
      const k = `${account}:${n.subscriptionId}`;
      if (seen.has(k)) continue;
      seen.add(k);
      await hook(rpc, account, n.subscriptionId);
    }
    return new Response(null, { status: ours ? 202 : 401 });
  } catch {
    // The provider tries again later; the 10-minute refresh is there either way.
    return new Response(null, { status: 500 });
  }
}
