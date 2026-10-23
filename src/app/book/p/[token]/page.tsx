import type { Metadata } from "next";
import { BookShell, Notice } from "@/components/book/BookShell";
import { PollView } from "@/components/book/PollView";
import { loadLink, pollView } from "@/lib/meetings/public";
import { options, pageRpc, turnstileFor, type Search } from "../../load";

// A meeting poll (docs/meetings-scheduler.md 1.8b): guests pick the times that work; the host books the winner.

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pick a time", robots: { index: false } };

type Props = { params: Promise<{ token: string }>; searchParams: Search };

export default async function PollPage({ params, searchParams }: Props) {
  const { token } = await params;
  const o = await options(searchParams);
  const rpc = pageRpc();
  const v = rpc ? await loadLink(rpc, { token }).catch(() => null) : null;
  if (!v || v.link.kind !== "poll")
    return (
      <BookShell tokens={null} embed={o.embed} narrow>
        <Notice title="This poll isn't here" />
      </BookShell>
    );
  return (
    <BookShell tokens={v.ws.kit.tokens} embed={o.embed} narrow>
      <PollView token={token} initial={pollView(v)} turnstileKey={turnstileFor(v.ws.turnstile)} />
    </BookShell>
  );
}
