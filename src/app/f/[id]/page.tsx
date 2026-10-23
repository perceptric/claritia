import type { Metadata } from "next";
import Script from "next/script";

// A form on its own page (docs/form-builder.md Part 6): forms.tryclaritia.com/f/<id> and the Share link. The form
// draws itself from the live version, in its brand kit. /f/embed.js frames this page with ?c=<the page around it>;
// in the frame it sits flush, so its height can follow the form.

export const metadata: Metadata = { title: "Form", robots: { index: false } };

export default async function HostedForm({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const framed = typeof (await searchParams).c === "string";
  const ok = /^[0-9a-f-]{36}$/.test(id);
  return (
    <main style={framed ? { padding: 4, background: "transparent" } : { minHeight: "100vh", display: "flex", justifyContent: "center", padding: "48px 16px", background: "#ffffff" }}>
      <div style={{ width: "100%", maxWidth: framed ? undefined : 720 }}>
        {ok ? <claritia-form form-id={id} /> : <p>Form not found.</p>}
      </div>
      <Script src="/forms/v1.js" strategy="afterInteractive" />
    </main>
  );
}
