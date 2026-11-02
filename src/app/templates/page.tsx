import type { Metadata } from "next";
import { TemplatesBrowser } from "@/components/forms/TemplatesBrowser";
import { SiteFooter, SiteHeader } from "@/components/Site";
import { TEMPLATES } from "@/lib/forms/catalog";
import { INDUSTRIES } from "@/lib/forms/types";

// The public template gallery (docs/form-templates.md): every form, by industry, each with its own page.

export const metadata: Metadata = {
  title: "Form templates for every industry | Claritia",
  description: `${TEMPLATES.length} free form templates for ${INDUSTRIES.length} industries: demo requests, quotes, intake, applications, surveys and quizzes. Use one in a click and every answer lands as a contact.`,
  alternates: { canonical: "/templates" },
};

export default function TemplatesPage() {
  return (
    <>
      <SiteHeader />
      <main className="bg-canvas">
        <section className="border-b border-line bg-white">
          <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-14 md:px-6 md:py-20">
            <p className="fig">{"// form templates"}</p>
            <h1 className="max-w-3xl text-[40px] leading-[1.05] font-medium tracking-[-0.035em] md:text-[56px]">
              {TEMPLATES.length} forms, ready to use. <span className="text-faint">For every industry.</span>
            </h1>
            <p className="max-w-2xl text-[17px] leading-relaxed text-body">
              Demo requests, quotes, intake, applications, surveys and quizzes. Pick one, and it&apos;s live on your site in a click. Every answer becomes a contact, with consent recorded for the visitor&apos;s region.
            </p>
          </div>
        </section>
        <section className="mx-auto max-w-6xl px-4 py-10 md:px-6">
          <TemplatesBrowser />
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
