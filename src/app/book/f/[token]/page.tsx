import type { Metadata } from "next";
import { BookFlow } from "@/components/book/BookFlow";
import { BookShell, Notice } from "@/components/book/BookShell";
import { fillCtx, readBooking } from "@/lib/forms/booking";
import { claimSlots, pageType } from "@/lib/forms/bookPage";
import { guestTypeOf, loadTargetCached } from "@/lib/meetings/public";
import { options, pageRpc, withBrand, type Search } from "../../load";
import { Missing, shellOf } from "../../views";

// /book/f/<token> (docs/ending-plan.md Part 4): the meeting's own booking page inside a form, after the send. The
// token is the form's signed booking token: Routing's rep, the fill and its contact (src/lib/forms/bookPage.ts).

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Book a meeting", robots: { index: false } };

type Props = { params: Promise<{ token: string }>; searchParams: Search };

export default async function FormBookPage({ params, searchParams }: Props) {
  const token = decodeURIComponent((await params).token);
  const o = await options(searchParams);
  const rpc = pageRpc();
  const c = readBooking(token, process.env.SECRETS_KEY);
  if (!rpc || !c) return <Missing embed={o.embed} />;
  if (c === "expired")
    return (
      <BookShell tokens={null} embed={o.embed} narrow>
        <Notice title="These times have expired" />
      </BookShell>
    );
  const ctx = await fillCtx(rpc, c.submission, c.type).catch(() => null);
  if (!ctx?.type || !ctx.contact_id || !ctx.email) return <Missing embed={o.embed} />;
  if (ctx.meeting)
    return (
      <BookShell tokens={null} embed={o.embed} narrow>
        <Notice title="You're booked" />
      </BookShell>
    );
  const { data: wsSlug } = await rpc("booking_slug_ensure", { p_ws: ctx.workspace_id });
  const found = typeof wsSlug === "string" ? await loadTargetCached(rpc, wsSlug, ctx.type.slug, null).catch(() => null) : null;
  if (!found?.type || found.type.id !== c.type) return <Missing embed={o.embed} />;
  const t = await withBrand(found, null);
  // The form's own calendar takes no payment, so neither does this page: the price stays off.
  const type = guestTypeOf(pageType(t.type!, c, ctx.hosts), t.profiles, false);
  const first = await claimSlots(rpc, token, c, type.lengths[0]).catch(() => null);
  const name = [ctx.first_name, ctx.last_name].filter(Boolean).join(" ");
  const s = shellOf(t);
  return (
    <BookShell tokens={s.tokens} design={s.design} vars={s.vars} badge={s.badge} brand={s.brand} embed={o.embed}>
      <BookFlow
        endpoint={`/api/book/f/${encodeURIComponent(token)}`}
        type={type}
        initialSlots={first?.slots}
        logo={s.logo}
        embed={o.embed}
        prefill={{ name: name || undefined, email: ctx.email }}
      />
    </BookShell>
  );
}
