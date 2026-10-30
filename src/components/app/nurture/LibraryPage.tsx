"use client";

// Emails › Library (docs/email-plan.md Part 3.2): the built-in templates by purpose, each in your brand's look, and
// your saved templates below. "Use" copies a built-in one into your saved templates, ready for any journey's email.

import { useMemo, useState } from "react";
import { compileEmail } from "@/lib/design/email/compile";
import { EMAIL_TEMPLATES, TEMPLATE_FOLDERS, type EmailTemplate } from "@/lib/design/email/templates";
import { readSystem } from "@/lib/design/model";
import { cleanTokens, type Tokens } from "@/lib/forms/brand";
import { emptyEmail } from "@/lib/workflows/types";
import { Badge, Button, ErrorNote, errorText, useLoad, type ViewProps } from "../ui";
import { Modal } from "../meetings/parts";
import { EmailTemplatesView } from "../workflows/EmailTemplatesView";

export function LibraryPage(props: ViewProps) {
  const { sb, ws } = props;
  const kit = useLoad(async () => {
    const { data } = await sb.from("brand_kits").select("tokens, logo_url").eq("workspace_id", ws.id).order("created_at").limit(1);
    const k = (data?.[0] ?? null) as {
      tokens: Partial<Tokens>;
      logo_url: string | null;
    } | null;
    return {
      tokens: cleanTokens(k?.tokens ?? {}).tokens,
      logo: k?.logo_url ?? undefined,
    };
  }, ws.id);
  const [open, setOpen] = useState<EmailTemplate | null>(null);
  const [error, setError] = useState("");
  const [added, setAdded] = useState<string | null>(null);
  const [n, setN] = useState(0);

  const use = async (t: EmailTemplate) => {
    setError("");
    try {
      const { error: e } = await sb.rpc("email_template_save", {
        p_ws: ws.id,
        p_id: null,
        p_name: t.name,
        p_body: { ...emptyEmail(), subject: t.name, doc: t.make() },
      });
      if (e) throw new Error(e.message);
      setAdded(t.key);
      setN((x) => x + 1);
      setOpen(null);
    } catch (err) {
      setError(errorText(err));
    }
  };

  const folders = (
    <div className="mb-8 flex flex-col gap-8">
      <ErrorNote message={error} />
      {TEMPLATE_FOLDERS.map((f) => (
        <section key={f} className="flex flex-col gap-3">
          <h2 className="text-[14px] font-medium text-ink">{f}</h2>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
            {EMAIL_TEMPLATES.filter((t) => t.group === f).map((t) => (
              <li key={t.key}>
                <button type="button" onClick={() => setOpen(t)} className="group flex w-full flex-col gap-2 text-left">
                  {kit.data ? <Thumb t={t} tokens={kit.data.tokens} logo={kit.data.logo} /> : <div className="h-[280px] rounded-[10px] border border-line bg-paper" />}
                  <span className="flex items-center gap-2 text-[13px] text-ink">
                    {t.name}
                    {added === t.key ? <Badge tone="green">Saved</Badge> : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <h2 className="text-[14px] font-medium text-ink">Saved</h2>
      {open && kit.data ? <PreviewDialog t={open} tokens={kit.data.tokens} logo={kit.data.logo} onClose={() => setOpen(null)} onUse={() => void use(open)} /> : null}
    </div>
  );
  return <EmailTemplatesView key={n} {...props} above={folders} />;
}

/** Merge tags as a reader sees them: the fallback, or a sample address. */
const filled = (html: string) => html.replace(/\{\{\s*([a-z_]+)\s*(?:\|([^}]*))?\}\}/g, (_m, k: string, f?: string) => (k === "company_address" ? "100 Main St, Austin, TX" : k === "unsubscribe_url" ? "#" : (f ?? "")));

/** A template as it would arrive, scaled down to a card. */
function Thumb({ t, tokens, logo }: { t: EmailTemplate; tokens: Tokens; logo?: string }) {
  const html = useMemo(() => filled(compileEmail(readSystem({}, tokens), t.make(), { tokens, logo }).html), [t, tokens, logo]);
  return (
    <div className="relative h-[280px] overflow-hidden rounded-[10px] border border-line bg-paper transition-[border-color,transform] duration-[180ms] ease-out group-hover:-translate-y-0.5 group-hover:border-line-strong motion-reduce:transform-none">
      <iframe title="" aria-hidden="true" tabIndex={-1} srcDoc={html} className="pointer-events-none absolute top-0 left-1/2 h-[760px] w-[640px] origin-top -translate-x-1/2 scale-[0.37] border-0 bg-paper" />
    </div>
  );
}

function PreviewDialog({ t, tokens, logo, onClose, onUse }: { t: EmailTemplate; tokens: Tokens; logo?: string; onClose: () => void; onUse: () => void }) {
  const html = useMemo(
    () =>
      compileEmail(readSystem({}, tokens), t.make(), {
        tokens,
        logo,
        preview: true,
      }).html,
    [t, tokens, logo],
  );
  return (
    <Modal
      title={t.name}
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="plain" onClick={onClose}>
            Close
          </Button>
          <Button onClick={onUse}>Use template</Button>
        </>
      }
    >
      <iframe title={`${t.name} preview`} srcDoc={html} className="h-[60vh] w-full rounded-lg border border-line bg-paper" />
    </Modal>
  );
}
