import type { Metadata } from "next";
import { headers } from "next/headers";
import { connection } from "next/server";
import { cache } from "react";
import { HostedForm } from "@/components/forms/HostedForm";
import { ThemedFrame } from "@/components/forms/ThemedFrame";
import type { FormSchema, FormSettings } from "@/lib/forms/types";
import { visitorOf } from "@/lib/forms/visitor";
import { serviceClient } from "@/lib/serviceClient";

// A live form's own page: /f/<slug>, and /f/<slug>?embed=1 inside the embed script's iframe.

type Row = { slug: string; status: string; schema: FormSchema; settings: FormSettings };

const load = cache(async (slug: string): Promise<Row | null> => {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 60) return null;
  const db = serviceClient();
  if (!db) return null;
  const { data } = await db.from("forms").select("slug, status, schema, settings").eq("slug", slug).maybeSingle();
  return (data as Row | null) ?? null;
});

export async function generateMetadata({ params }: PageProps<"/f/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const f = await load(slug);
  return { title: f?.status === "live" ? f.schema.title : "Form closed", robots: { index: false, follow: false } };
}

export default async function FormPage({ params, searchParams }: PageProps<"/f/[slug]">) {
  await connection();
  const { slug } = await params;
  const sp = await searchParams;
  const embed = sp.embed === "1";
  const f = await load(slug);
  const who = visitorOf(await headers());
  const shell = embed ? "min-h-0 bg-transparent p-1" : "paper min-h-screen px-4 py-10 md:py-16";
  const card = embed ? "" : "frame mx-auto w-full max-w-[680px] border border-line bg-panel p-6 md:p-10";

  if (!f || f.status !== "live") {
    return (
      <main className={shell}>
        <div className={card}>
          <div className="flex flex-col gap-2 py-6">
            <p className="font-mono text-[10.5px] tracking-[0.14em] text-muted uppercase">Form closed</p>
            <h1 className="text-[22px] font-medium tracking-[-0.02em]">This form isn&apos;t taking answers</h1>
            <p className="text-[14px] text-body">It may have been closed or moved. Contact the team that shared it with you.</p>
          </div>
        </div>
      </main>
    );
  }
  return (
    <main>
      {embed ? <style>{"html,body{background:transparent!important}"}</style> : null}
      <ThemedFrame theme={f.settings?.theme} accent={f.settings?.accent} size={embed ? "bare" : "page"}>
        <HostedForm slug={f.slug} schema={f.schema} settings={f.settings ?? {}} region={who.region} turnstileKey={process.env.TURNSTILE_SITE_KEY?.trim() || undefined} embed={embed} />
      </ThemedFrame>
    </main>
  );
}
