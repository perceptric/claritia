import type { Metadata } from "next";
import { options, pageTarget, type Search } from "../load";
import { Missing, TeamView } from "../views";

// The team page (docs/meetings-scheduler.md 1.8b): /book/<workspace>, every public team meeting type as a card.

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ workspace: string }>; searchParams: Search };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const d = await pageTarget((await params).workspace, null, (await options(searchParams)).form);
  return { title: d ? `Book a meeting with ${d.t.ws.name}` : "Book a meeting" };
}

export default async function TeamPage({ params, searchParams }: Props) {
  const { workspace } = await params;
  const o = await options(searchParams);
  const d = await pageTarget(workspace, null, o.form);
  if (!d) return <Missing embed={o.embed} />;
  const { t } = d;
  return <TeamView t={t} o={o} href={(slug) => `/book/${t.ws.slug}/${slug}`} />;
}
