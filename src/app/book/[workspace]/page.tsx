import type { Metadata } from "next";
import { BookShell, Notice } from "@/components/book/BookShell";
import { PageHead, TypeCards } from "@/components/book/TypeCards";
import { guestTypeOf, loadTarget } from "@/lib/meetings/public";
import { keep, options, pageRpc, type Search } from "../load";

// The team page (docs/meetings-scheduler.md 1.8b): /book/<workspace>, every public team meeting type as a card.

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ workspace: string }>; searchParams: Search };

async function data(workspace: string, form: string | null) {
  const rpc = pageRpc();
  return rpc ? loadTarget(rpc, workspace, null, form).catch(() => null) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await data((await params).workspace, null);
  return { title: t ? `Book a meeting with ${t.ws.name}` : "Book a meeting" };
}

export default async function TeamPage({ params, searchParams }: Props) {
  const { workspace } = await params;
  const o = await options(searchParams);
  const t = await data(workspace, o.form);
  if (!t)
    return (
      <BookShell tokens={null} embed={o.embed} narrow>
        <Notice title="This page isn't here" />
      </BookShell>
    );
  const types = t.types.map((x) => ({ href: keep(`/book/${t.ws.slug}/${x.slug}`, o.embed), type: guestTypeOf(x, t.profiles, t.pay) }));
  return (
    <BookShell tokens={t.kit.tokens} embed={o.embed} narrow>
      <PageHead title={t.ws.name} logo={t.kit.logo_url} />
      <TypeCards types={types} />
    </BookShell>
  );
}
