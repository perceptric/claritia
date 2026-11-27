import type { Metadata } from "next";
import { BookShell, Notice } from "@/components/book/BookShell";
import { PollView } from "@/components/book/PollView";
import { loadLink, pollView } from "@/lib/meetings/public";
import { linkLocked } from "@/lib/planGate";
import { DOWN, pageRead } from "@/lib/meetings/pageRead";
import { linkShell, options, pageRpc, turnstileFor, type Search } from "../../load";
import { Down } from "../../views";

// A meeting poll (docs/meetings-scheduler.md 1.8b): guests pick the times that work; the host books the winner. A poll
// whose workspace moved to Free shows as closed.

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pick a time", robots: { index: false } };

type Props = { params: Promise<{ token: string }>; searchParams: Search };

export default async function PollPage({ params, searchParams }: Props) {
  const { token } = await params;
  const o = await options(searchParams);
  const rpc = pageRpc();
  const v = await pageRead(rpc ? () => loadLink(rpc, { token }) : null);
  if (v === DOWN) return <Down embed={o.embed} />;
  if (!v || v.link.kind !== "poll")
    return (
      <BookShell tokens={null} embed={o.embed} narrow>
        <Notice title="This poll isn't here" />
      </BookShell>
    );
  const [s, locked] = await Promise.all([linkShell(v.ws), rpc ? linkLocked(rpc, v.link) : false]);
  const view = pollView(v);
  return (
    <BookShell tokens={s.tokens} design={s.design} brand={s.brand} embed={o.embed} narrow>
      <PollView token={token} initial={locked ? { ...view, closed: true } : view} turnstileKey={turnstileFor(v.ws.turnstile)} />
    </BookShell>
  );
}
