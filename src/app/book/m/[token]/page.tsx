import type { Metadata } from "next";
import { BookShell, Notice } from "@/components/book/BookShell";
import { ManageView } from "@/components/book/ManageView";
import { guestMeeting, loadMeeting } from "@/lib/meetings/public";
import { options, pageRpc, type Search } from "../../load";

// The guest's manage link (docs/meetings-scheduler.md 1.7): see the meeting, reschedule or cancel. Stripe sends paid
// guests back here (?paid=1) while the payment is confirmed.

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your meeting", robots: { index: false } };

type Props = { params: Promise<{ token: string }>; searchParams: Search };

export default async function ManagePage({ params, searchParams }: Props) {
  const { token } = await params;
  const o = await options(searchParams);
  const rpc = pageRpc();
  const v = rpc ? await loadMeeting(rpc, { token }).catch(() => null) : null;
  if (!v)
    return (
      <BookShell tokens={null} embed={o.embed} narrow>
        <Notice title="This meeting isn't here" />
      </BookShell>
    );
  return (
    <BookShell tokens={v.ws.kit.tokens} design={v.ws.kit.design} embed={o.embed} narrow>
      <ManageView token={token} initial={guestMeeting(v)} paid={o.paid} embed={o.embed} />
    </BookShell>
  );
}
