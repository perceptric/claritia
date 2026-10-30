import { BookFlow } from "@/components/book/BookFlow";
import { BookShell, Notice } from "@/components/book/BookShell";
import { PageHead, TypeCards } from "@/components/book/TypeCards";
import type { Rpc } from "@/lib/jobs";
import { lookTokens, usesKit } from "@/lib/meetings/look";
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
/** The kit or Claritia's look, with the page's accent and buttons (src/lib/meetings/look.ts). */
function shellOf(t: Target) {
  const kit = usesKit(t.look, !!t.kit.tokens && Object.keys(t.kit.tokens).length > 0);
  const l = lookTokens(t.look, t.kit.tokens);
  return { tokens: l.tokens, design: kit ? t.kit.design : undefined, vars: l.vars, badge: t.look.badge, logo: kit ? t.kit.logo_url : null };
}

export function TeamView({ t, o, href }: { t: Target; o: Opts; href: (slug: string) => string }) {
  const types = t.types.map((x) => ({ href: keep(href(x.slug), o.embed), type: guestTypeOf(x, t.profiles, t.pay) }));
  const s = shellOf(t);
  return (
    <BookShell tokens={s.tokens} design={s.design} vars={s.vars} badge={s.badge} embed={o.embed} narrow>
      <PageHead title={t.ws.name} logo={s.logo} welcome={t.look.welcome} />
      <TypeCards types={types} />
    </BookShell>
  );
}

/** A person's page: their photo, name, line and public types. */
export function PersonView({ t, o, href }: { t: Target; o: Opts; href: (slug: string) => string }) {
  const p = t.profile!;
  const types = t.types.map((x) => ({ href: keep(href(x.slug), o.embed), type: guestTypeOf(x, t.profiles, t.pay) }));
  const s = shellOf(t);
  return (
    <BookShell tokens={s.tokens} design={s.design} vars={s.vars} badge={s.badge} embed={o.embed} narrow>
      <PageHead title={`Book time with ${p.name.split(/\s+/)[0] || p.name}`} line={p.headline || p.name} hosts={[{ name: p.name, photo: p.photo_url }]} big welcome={t.look.welcome} />
      <TypeCards types={types} />
    </BookShell>
  );
}

/** One type's booking calendar, with the first times ready. */
export async function TypeView({ t, o, rpc }: { t: Target; o: Opts; rpc: Rpc }) {
  const type = guestTypeOf(t.type!, t.profiles, t.pay);
  const first = await preferredSlots(rpc, { ws: t.ws.id, type: t.type!, length: type.lengths[0]!, host: o.link?.host, profiles: t.profiles }).catch(() => undefined);
  const s = shellOf(t);
  return (
    <BookShell tokens={s.tokens} design={s.design} vars={s.vars} badge={s.badge} embed={o.embed}>
      <BookFlow
        endpoint={`/api/book/t/${t.ws.slug}/${t.type!.slug}`}
        type={type}
        initialSlots={first}
        turnstileKey={turnstileFor(t.turnstile)}
        logo={s.logo}
        embed={o.embed}
        prefill={o.prefill}
        link={o.link}
      />
    </BookShell>
  );
}
