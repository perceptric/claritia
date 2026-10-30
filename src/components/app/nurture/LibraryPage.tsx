"use client";

// Emails › Library (docs/email-plan.md Part 3.2): the built-in templates by purpose, each in your brand's look, and
// your saved templates below. "Use" copies a built-in one into your saved templates, ready for any journey's email.

import { useMemo, useState } from "react";
import { compileEmail } from "@/lib/design/email/compile";
import { EMAIL_TEMPLATES, TEMPLATE_FOLDERS, type EmailTemplate } from "@/lib/design/email/templates";
import { readSystem } from "@/lib/design/model";
import { cleanTokens, type Tokens } from "@/lib/forms/brand";
import { emptyEmail } from "@/lib/workflows/types";
import { Badge, Button, CardHead, ErrorNote, errorText, Panel, useLoad, type ViewProps } from "../ui";
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
    <div className="mb-6 flex flex-col gap-5">
      <ErrorNote message={error} />
      {TEMPLATE_FOLDERS.map((f) => (
        <Panel key={f} className="overflow-hidden">
          <CardHead label={f} count={EMAIL_TEMPLATES.filter((t) => t.group === f).length} />
          <ul className="grid gap-px bg-line sm:grid-cols-3">
            {EMAIL_TEMPLATES.filter((t) => t.group === f).map((t) => (
              <li key={t.key} className="flex items-center gap-2 bg-card px-4 py-3">
                <button type="button" onClick={() => setOpen(t)} className="min-w-0 flex-1 truncate text-left text-[13.5px] text-ink hover:underline">
                  {t.name}
                </button>
                {added === t.key ? <Badge tone="green">Saved</Badge> : null}
              </li>
            ))}
          </ul>
        </Panel>
      ))}
      <p className="text-[13.5px] font-medium text-ink">Saved</p>
      {open && kit.data ? <PreviewDialog t={open} tokens={kit.data.tokens} logo={kit.data.logo} onClose={() => setOpen(null)} onUse={() => void use(open)} /> : null}
    </div>
  );
  return <EmailTemplatesView key={n} {...props} above={folders} />;
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
