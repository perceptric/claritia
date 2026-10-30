import type { Metadata } from "next";
import { options, type Search } from "../../../book/load";
import { TypeView } from "../../../book/typeView";
import { Missing } from "../../../book/views";
import { loadHandle } from "../../load";

// /booking/<handle>/<type>: one type's booking calendar (docs/scheduling-plan.md 4.1). Secret types work here too:
// the address is the secret.

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ handle: string; type: string }>; searchParams: Search };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { handle, type } = await params;
  const d = await loadHandle(handle, type, (await options(searchParams)).form);
  if (!d) return { title: "Book a meeting", robots: { index: false } };
  return { title: `${d.t.type!.name} | ${d.t.ws.name}`, robots: d.t.type!.secret ? { index: false } : undefined };
}

export default async function HandleType({ params, searchParams }: Props) {
  const { handle, type } = await params;
  const o = await options(searchParams);
  const d = await loadHandle(handle, type, o.form);
  if (!d) return <Missing embed={o.embed} />;
  return <TypeView t={d.t} o={o} rpc={d.rpc} />;
}
