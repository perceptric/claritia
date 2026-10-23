import type { Metadata } from "next";
import { BookFlow } from "@/components/book/BookFlow";
import { BookShell, Notice } from "@/components/book/BookShell";
import { guestSlots, linkGuestType, loadLink, oneOffSlots } from "@/lib/meetings/public";
import { keep, options, pageRpc, turnstileFor, type Search } from "../../load";

// A one-off meeting or a single-use link (docs/meetings-scheduler.md 1.8b). Either books once; a second visit says
// it's used and points to the host's page.

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Book a meeting", robots: { index: false } };

type Props = { params: Promise<{ token: string }>; searchParams: Search };

export default async function LinkPage({ params, searchParams }: Props) {
  const { token } = await params;
  const o = await options(searchParams);
  const rpc = pageRpc();
  const v = rpc ? await loadLink(rpc, { token }).catch(() => null) : null;
  if (!rpc || !v || v.link.kind === "poll" || (v.link.kind === "single_use" && !v.type))
    return (
      <BookShell tokens={null} embed={o.embed} narrow>
        <Notice title="This link isn't here" />
      </BookShell>
    );
  const tokens = v.ws.kit.tokens;
  if (v.link.used || v.link.closed) {
    const page = v.owner && v.ws.slug ? keep(`/book/${v.ws.slug}/${v.owner.slug}`, o.embed) : null;
    return (
      <BookShell tokens={tokens} embed={o.embed} narrow>
        <Notice title={v.link.used ? "This link has already been used" : "This link is closed"}>
          {page && (
            <a className="cb-btn" href={page} style={{ textDecoration: "none" }}>
              See {v.owner!.name}&apos;s times
            </a>
          )}
        </Notice>
      </BookShell>
    );
  }
  const type = linkGuestType(v);
  const first = await (v.link.kind === "one_off" ? oneOffSlots(rpc, v) : guestSlots(rpc, { ws: v.link.workspace_id, type: v.type!, length: type.lengths[0]! })).catch(() => undefined);
  return (
    <BookShell tokens={tokens} embed={o.embed}>
      <BookFlow endpoint={`/api/book/l/${token}`} type={type} initialSlots={first} turnstileKey={turnstileFor(v.ws.turnstile)} logo={v.ws.kit.logo_url} embed={o.embed} prefill={o.prefill} />
    </BookShell>
  );
}
