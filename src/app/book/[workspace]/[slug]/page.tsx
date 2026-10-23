import type { Metadata } from "next";
import { BookFlow } from "@/components/book/BookFlow";
import { BookShell, Notice } from "@/components/book/BookShell";
import { PageHead, TypeCards } from "@/components/book/TypeCards";
import { guestTypeOf, loadTarget, preferredSlots } from "@/lib/meetings/public";
import { keep, options, pageRpc, turnstileFor, type Search } from "../../load";

// /book/<workspace>/<slug> (docs/meetings-scheduler.md 1.8 and 1.8b): a meeting type's booking calendar when a type
// has this slug (secret types too: the address is the secret), else a person's page with their public types.

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ workspace: string; slug: string }>; searchParams: Search };

async function data(workspace: string, slug: string, form: string | null) {
  const rpc = pageRpc();
  if (!rpc) return null;
  const t = await loadTarget(rpc, workspace, slug, form).catch(() => null);
  return t ? { rpc, t } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { workspace, slug } = await params;
  const d = await data(workspace, slug, null);
  if (!d) return { title: "Book a meeting", robots: { index: false } };
  const { t } = d;
  if (t.type) return { title: `${t.type.name} | ${t.ws.name}`, robots: t.type.secret ? { index: false } : undefined };
  return { title: `${t.profile!.name} | ${t.ws.name}` };
}

export default async function TypeOrPerson({ params, searchParams }: Props) {
  const { workspace, slug } = await params;
  const o = await options(searchParams);
  const d = await data(workspace, slug, o.form);
  if (!d)
    return (
      <BookShell tokens={null} embed={o.embed} narrow>
        <Notice title="This page isn't here" />
      </BookShell>
    );
  const { t, rpc } = d;
  if (!t.type) {
    const p = t.profile!;
    const types = t.types.map((x) => ({ href: keep(`/book/${t.ws.slug}/${x.slug}`, o.embed), type: guestTypeOf(x, t.profiles, t.pay) }));
    return (
      <BookShell tokens={t.kit.tokens} embed={o.embed} narrow>
        <PageHead title={p.name} line={p.headline} hosts={[{ name: p.name, photo: p.photo_url }]} big />
        <TypeCards types={types} />
      </BookShell>
    );
  }
  const type = guestTypeOf(t.type, t.profiles, t.pay);
  const first = await preferredSlots(rpc, { ws: t.ws.id, type: t.type, length: type.lengths[0]!, host: o.link?.host, profiles: t.profiles }).catch(() => undefined);
  return (
    <BookShell tokens={t.kit.tokens} embed={o.embed}>
      <BookFlow
        endpoint={`/api/book/t/${t.ws.slug}/${t.type.slug}`}
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
