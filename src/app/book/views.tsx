import { BookFlow } from "@/components/book/BookFlow";
import { BookShell, Notice } from "@/components/book/BookShell";
import { PageHead, TypeCards } from "@/components/book/TypeCards";
import type { Rpc } from "@/lib/jobs";
import { guestTypeOf, preferredSlots, type Target } from "@/lib/meetings/public";
import { keep, options, turnstileFor } from "./load";

// What /book/... and /booking/... draw: the team page, a person's page, or one type's booking calendar. `href` makes
// each card's address, so both kinds of address keep their own links.

type Opts = Awaited<ReturnType<typeof options>>;

export function Missing({ embed }: { embed: boolean }) {
  return (
    <BookShell tokens={null} embed={embed} narrow>
      <Notice title="This page isn't here" />
    </BookShell>
  );
}

/** The team page: every public team type as a card. */
export function TeamView({ t, o, href }: { t: Target; o: Opts; href: (slug: string) => string }) {
  const types = t.types.map((x) => ({ href: keep(href(x.slug), o.embed), type: guestTypeOf(x, t.profiles, t.pay) }));
  return (
    <BookShell tokens={t.kit.tokens} design={t.kit.design} embed={o.embed} narrow>
      <PageHead title={t.ws.name} logo={t.kit.logo_url} />
      <TypeCards types={types} />
    </BookShell>
  );
}

/** A person's page: their photo, name, line and public types. */
export function PersonView({ t, o, href }: { t: Target; o: Opts; href: (slug: string) => string }) {
  const p = t.profile!;
  const types = t.types.map((x) => ({ href: keep(href(x.slug), o.embed), type: guestTypeOf(x, t.profiles, t.pay) }));
  return (
    <BookShell tokens={t.kit.tokens} design={t.kit.design} embed={o.embed} narrow>
      <PageHead title={p.name} line={p.headline} hosts={[{ name: p.name, photo: p.photo_url }]} big />
      <TypeCards types={types} />
    </BookShell>
  );
}

/** One type's booking calendar, with the first times ready. */
export async function TypeView({ t, o, rpc }: { t: Target; o: Opts; rpc: Rpc }) {
  const type = guestTypeOf(t.type!, t.profiles, t.pay);
  const first = await preferredSlots(rpc, { ws: t.ws.id, type: t.type!, length: type.lengths[0]!, host: o.link?.host, profiles: t.profiles }).catch(() => undefined);
  return (
    <BookShell tokens={t.kit.tokens} design={t.kit.design} embed={o.embed}>
      <BookFlow
        endpoint={`/api/book/t/${t.ws.slug}/${t.type!.slug}`}
        type={type}
        initialSlots={first}
        turnstileKey={turnstileFor(t.turnstile)}
        logo={t.kit.logo_url}
        embed={o.embed}
        prefill={o.prefill}
        link={o.link}
      />
    </BookShell>
  );
}
