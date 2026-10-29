import type { Metadata } from "next";
import { loadTarget } from "@/lib/meetings/public";
import { options, pageRpc, type Search } from "../../load";
import { Missing, PersonView, TypeView } from "../../views";

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
  if (!d) return <Missing embed={o.embed} />;
  const { t, rpc } = d;
  if (!t.type) return <PersonView t={t} o={o} href={(s) => `/book/${t.ws.slug}/${s}`} />;
  return <TypeView t={t} o={o} rpc={rpc} />;
}
