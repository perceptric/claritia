import { BookShell, Notice } from "@/components/book/BookShell";
import { PageHead, TypeCards } from "@/components/book/TypeCards";
import { pageShell } from "@/lib/meetings/brandPage";
import { guestTypeOf, type Target } from "@/lib/meetings/public";
import { keep, options } from "./load";

// What /book/... and /booking/... draw: the team page and a person's page (one type's calendar is in typeView.tsx, so
// these pages ship none of the calendar's code). `href` makes each card's address, so both kinds of address keep their
// own links.

export type Opts = Awaited<ReturnType<typeof options>>;

export function Missing({ embed }: { embed: boolean }) {
  return (
    <BookShell tokens={null} embed={embed} narrow>
      <Notice title="This page isn't here" />
    </BookShell>
  );
}

/** The page's look: the brand's on paid plans, Claritia's with the badge on Free (src/lib/meetings/brandPage.ts). */
export const shellOf = (t: Target) => pageShell(t);

/** The team page: every public team type as a card. */
export function TeamView({ t, o, href }: { t: Target; o: Opts; href: (slug: string) => string }) {
  const types = t.types.map((x) => ({ href: keep(href(x.slug), o.embed), type: guestTypeOf(x, t.profiles, t.pay) }));
  const s = shellOf(t);
  return (
    <BookShell tokens={s.tokens} design={s.design} vars={s.vars} badge={s.badge} brand={s.brand} embed={o.embed} narrow>
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
    <BookShell tokens={s.tokens} design={s.design} vars={s.vars} badge={s.badge} brand={s.brand} embed={o.embed} narrow>
      <PageHead title={`Book time with ${p.name.split(/\s+/)[0] || p.name}`} line={p.headline || p.name} hosts={[{ name: p.name, photo: p.photo_url }]} big welcome={t.look.welcome} />
      <TypeCards types={types} />
    </BookShell>
  );
}
