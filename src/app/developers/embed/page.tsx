import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/components/Site";
import { APP_URL } from "@/lib/site";

// Developers › Embed (docs/embed.md): the script, the elements and their attributes, window.Claritia, the events, and
// the npm package with its React components. A plain page on the site, the same words as docs/embed.md.

export const metadata: Metadata = {
  title: "Embed Claritia forms and calendars",
  description: "One script tag, window.Claritia, events and React components for Claritia's forms and meeting calendars.",
};

const SCRIPT = `<script src="${APP_URL}/forms/v1.js" async></script>`;

function Code({ children }: { children: string }) {
  return <pre className="overflow-x-auto rounded-[10px] shadow-rest bg-paper px-4 py-3.5 font-mono text-[12.5px] leading-[1.6] text-body">{children}</pre>;
}

function Table({ rows, head }: { head: [string, string]; rows: [string, string][] }) {
  return (
    <div className="overflow-x-auto rounded-[10px] shadow-rest">
      <table className="w-full text-left text-[13.5px]">
        <thead>
          <tr className="border-b border-line bg-paper">
            <th className="px-4 py-2.5 font-medium text-muted">{head[0]}</th>
            <th className="px-4 py-2.5 font-medium text-muted">{head[1]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([a, b]) => (
            <tr key={a} className="border-b border-line last:border-b-0">
              <td className="px-4 py-2.5 align-top font-mono text-[12.5px] text-ink">{a}</td>
              <td className="px-4 py-2.5 text-body">{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">{title}</h2>
      {children}
    </section>
  );
}

export default function EmbedDocs() {
  return (
    <>
      <SiteHeader />
      <main className="bg-card">
        <div className="mx-auto flex max-w-3xl flex-col gap-12 px-4 py-14 md:px-6 md:py-20">
          <header className="flex flex-col gap-3">
            <p className="label-mono">Developers</p>
            <h1 className="text-[36px] leading-[1.1] font-semibold tracking-[-0.03em] text-ink text-balance">
              Claritia on your site. <span className="text-faint">One script, every form and calendar.</span>
            </h1>
          </header>

          <Section title="The script">
            <Code>{SCRIPT}</Code>
          </Section>

          <Section title="Forms">
            <Code>{`<claritia-form form-id="FORM_ID"></claritia-form>`}</Code>
            <Table
              head={["Attribute", "What it does"]}
              rows={[
                ["full", "Fills the page"],
                ['popup="click|delay:10|exit"', 'Over the page: opened by <button data-claritia-open="FORM_ID">, after N seconds, or when the visitor moves to leave'],
                ['size="s|m|l"', "The popup's width"],
                ['slider="left|right"', "Full height from that side, with popup for how it opens"],
                ['popover icon="chat|calendar|form|logo" note="…"', "A round button in the corner opens it above"],
                ['side-tab="Contact us"', "A tab on the right edge opens it"],
                ["once", "A timed or exit popup doesn't open by itself again for someone who sent it"],
                ['mobile="keep"', "Over the page on a phone it keeps its box; it fills the screen by default"],
              ]}
            />
          </Section>

          <Section title="Meeting calendars">
            <Code>{`<claritia-book type="WORKSPACE/MEETING"></claritia-book>
<claritia-book type="WORKSPACE/MEETING" mode="button" text="Book a demo"></claritia-book>
<a href="#" data-claritia-book="WORKSPACE/MEETING">Book a demo</a>`}</Code>
          </Section>

          <Section title="window.Claritia">
            <Code>{`Claritia.open("FORM_ID", { prefill: { email: "dana@acme.com" }, size: "l" });
Claritia.open("WORKSPACE/MEETING");
Claritia.close();
Claritia.prefill({ email: "dana@acme.com", company: "Acme" });
const off = Claritia.on("submitted", (d) => console.log(d.submissionId));`}</Code>
            <p className="text-[14px] leading-relaxed text-body">
              Calls made before the script loads run once it&apos;s there:
            </p>
            <Code>{`window.Claritia = window.Claritia || { q: [] };
Claritia.q.push(["prefill", { email: "dana@acme.com" }]);`}</Code>
          </Section>

          <Section title="Events">
            <Table
              head={["Event", "detail"]}
              rows={[
                ["claritia:ready", "formId"],
                ["claritia:step", "formId, step (from 0), of"],
                ["claritia:open, claritia:close", "formId"],
                ["claritia:submitted", "formId, submissionId"],
                ["claritia:booked", "formId (a form's calendar) or none (a meeting's), start, end"],
              ]}
            />
          </Section>

          <Section title="npm and React">
            <Code>{`npm install @claritia/embed`}</Code>
            <Code>{`import { open, prefill, on } from "@claritia/embed";
import { ClaritiaForm, ClaritiaBook } from "@claritia/embed/react";

<ClaritiaForm id="FORM_ID" mode="popover" icon="chat" note="Questions?" onSubmitted={(d) => …} />
<ClaritiaForm id="FORM_ID" mode="popup" size="l" buttonText="Talk to us" />
<ClaritiaBook type="WORKSPACE/MEETING" mode="button" text="Book a demo" onBooked={(d) => …} />`}</Code>
          </Section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
