import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TemplateCard } from "@/components/forms/Gallery";
import { TemplatePreview } from "@/components/forms/TemplatePreview";
import { SiteFooter, SiteHeader } from "@/components/Site";
import { findTemplates, industryLabel, questionCount, templateBySlug, templateSlug, TEMPLATES } from "@/lib/forms/catalog";
import { allFields } from "@/lib/forms/logic";
import { KIND_LABEL, USE_CASES } from "@/lib/forms/types";
import { APP_URL } from "@/lib/site";

// One template's public page: the live form to try, what it asks, and Use this template, which opens it in the
// app ready to go live.

export const dynamicParams = false;
export const generateStaticParams = () => TEMPLATES.map((t) => ({ slug: templateSlug(t) }));

export async function generateMetadata({ params }: PageProps<"/templates/[slug]">): Promise<Metadata> {
  const t = templateBySlug((await params).slug);
  if (!t) return {};
  return {
    title: `${t.name} form template | Claritia`,
    description: `${t.blurb} A free form for ${industryLabel(t.industry)}: ${questionCount(t)} questions, ready to use in one click.`,
    alternates: { canonical: `/templates/${templateSlug(t)}` },
  };
}

export default async function TemplatePage({ params }: PageProps<"/templates/[slug]">) {
  const t = templateBySlug((await params).slug);
  if (!t) notFound();
  const more = findTemplates({ industry: t.industry }).filter((x) => x.id !== t.id).slice(0, 3);
  const use = `${APP_URL}/forms/templates/${templateSlug(t)}`;
  const fields = allFields(t.schema).filter((f) => f.kind !== "hidden");
  return (
    <>
      <SiteHeader />
      <main className="bg-canvas">
        <div className="border-b border-line bg-white">
          <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-10 md:px-6 md:py-14">
            <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[13px] text-muted">
              <Link href="/templates" className="hover:text-ink">
                Templates
              </Link>
              <span className="text-faint">/</span>
              <span>{industryLabel(t.industry)}</span>
            </nav>
            <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <div className="flex max-w-2xl flex-col gap-3">
                <h1 className="text-[36px] leading-[1.05] font-medium tracking-[-0.035em] md:text-[48px]">{t.name}</h1>
                <p className="text-[17px] leading-relaxed text-body">{t.blurb}</p>
              </div>
              <a href={use} className="group inline-flex h-11 w-fit shrink-0 items-center gap-2 rounded-md bg-ink px-5 text-[15px] font-medium text-white hover:bg-[#2b2b29]">
                Use this template
                <span className="transition-transform group-hover:translate-x-0.5" aria-hidden="true">
                  →
                </span>
              </a>
            </div>
          </div>
        </div>
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section aria-label="Try the form" className="paper border border-line p-4 md:p-8">
            <div className="frame mx-auto max-w-[640px] border border-line bg-white p-6 md:p-10">
              <TemplatePreview id={t.id} />
            </div>
          </section>
          <aside className="flex flex-col gap-5">
            <div className="border border-line bg-white">
              <p className="card-head">About this form</p>
              <dl className="grid grid-cols-2 gap-4 p-4 text-[13px]">
                <div>
                  <dt className="label-mono">Industry</dt>
                  <dd className="mt-1 text-ink">{industryLabel(t.industry)}</dd>
                </div>
                <div>
                  <dt className="label-mono">Questions</dt>
                  <dd className="mt-1 text-ink">{questionCount(t)}</dd>
                </div>
                <div>
                  <dt className="label-mono">Pages</dt>
                  <dd className="mt-1 text-ink">{t.schema.pages.length}</dd>
                </div>
                <div>
                  <dt className="label-mono">Use</dt>
                  <dd className="mt-1 text-ink">{t.tags.map((x) => USE_CASES.find((u) => u.value === x)?.label ?? x).join(", ")}</dd>
                </div>
              </dl>
            </div>
            <div className="border border-line bg-white">
              <p className="card-head">What it asks</p>
              <ol className="flex flex-col">
                {fields.map((f, i) => (
                  <li key={f.key} className="flex items-baseline gap-3 border-b border-line px-4 py-2.5 text-[13px] last:border-b-0">
                    <span className="w-5 shrink-0 font-mono text-[11px] text-faint tabular-nums">{i + 1}</span>
                    <span className="min-w-0 flex-1 text-ink">{f.label}</span>
                    <span className="shrink-0 font-mono text-[10px] tracking-[0.06em] text-faint uppercase">{KIND_LABEL[f.kind]}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="border border-line bg-white p-4 text-[13.5px] leading-relaxed text-body">
              <p className="mb-2 font-medium text-ink">What happens to answers</p>
              <p>Each answer lands on a contact in Claritia, with the company, the page it came from and the consent the visitor gave. Journeys can start from it, and your CRM gets it too.</p>
            </div>
          </aside>
        </div>
        {more.length ? (
          <section className="border-t border-line bg-white">
            <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-12 md:px-6">
              <div className="flex items-end justify-between gap-4">
                <h2 className="text-[24px] font-medium tracking-[-0.02em]">More forms for {industryLabel(t.industry)}</h2>
                <Link href="/templates" className="text-[14px] font-medium text-muted hover:text-ink">
                  All templates →
                </Link>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {more.map((x) => (
                  <TemplateCard key={x.id} t={x} href={`/templates/${templateSlug(x)}`} />
                ))}
              </div>
            </div>
          </section>
        ) : null}
      </main>
      <SiteFooter />
    </>
  );
}
