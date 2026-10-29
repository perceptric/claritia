import type { Metadata } from "next";
import { loadTarget } from "@/lib/meetings/public";
import { options, pageRpc, type Search } from "../load";
import { Missing, TeamView } from "../views";

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
  if (!t) return <Missing embed={o.embed} />;
  return <TeamView t={t} o={o} href={(slug) => `/book/${t.ws.slug}/${slug}`} />;
}
