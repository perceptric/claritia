import type { Metadata } from "next";
import { options, pageRpc, type Search } from "../../book/load";
import { Missing, PersonView, TeamView } from "../../book/views";
import { loadHandle } from "../load";

// /booking/<handle>: a person's page with their public types, or the team page (docs/scheduling-plan.md 4.1).

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ handle: string }>; searchParams: Search };

async function data(handle: string, form: string | null) {
  const rpc = pageRpc();
  return rpc ? loadHandle(rpc, handle, null, form) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const d = await data((await params).handle, null);
  if (!d) return { title: "Book a meeting", robots: { index: false } };
  return { title: d.t.profile ? `${d.t.profile.name} | ${d.t.ws.name}` : `Book a meeting with ${d.t.ws.name}` };
}

export default async function HandlePage({ params, searchParams }: Props) {
  const { handle } = await params;
  const o = await options(searchParams);
  const d = await data(handle, o.form);
  if (!d) return <Missing embed={o.embed} />;
  const href = (slug: string) => `/booking/${d.h.handle}/${slug}`;
  return d.t.profile ? <PersonView t={d.t} o={o} href={href} /> : <TeamView t={d.t} o={o} href={href} />;
}
