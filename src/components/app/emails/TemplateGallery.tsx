"use client";

// Emails › Templates (docs/email-studio-plan.md Part 8): the 100 built-in templates by folder, each previewed in the
// workspace's brand, then your saved templates below. Use template makes a campaign draft from it and opens the Email
// Studio, where Tia can fill it in. The website's template pages link here with ?use=<key>.

import { useMemo, useState } from "react";
import { compileEmail } from "@/lib/design/email/compile";
import { EMAIL_TEMPLATES, TEMPLATE_FOLDERS, type EmailTemplate, type TemplateFolder } from "@/lib/design/email/library";
import { readSystem } from "@/lib/design/model";
import { cleanTokens, type Tokens } from "@/lib/forms/brand";
import { Modal } from "../meetings/parts";
import { Button, ErrorNote, errorText, invalidate, must, useQuery, type ViewProps } from "../ui";
import { EmailTemplatesView } from "../workflows/EmailTemplatesView";

/** Merge tags as a reader sees them: the fallback, or a sample address. */
const filled = (html: string) => html.replace(/\{\{\s*([a-z_]+)\s*(?:\|([^}]*))?\}\}/g, (_m, k: string, f?: string) => (k === "company_address" ? "100 Main St, Austin, TX" : k === "unsubscribe_url" ? "#" : (f ?? "")));

export function TemplateGallery(props: ViewProps) {
  const { sb, ws, navigate } = props;
  const kit = useQuery(`email_kit:${ws.id}`, async () => {
    const { data } = await sb.from("brand_kits").select("tokens, logo_url").eq("workspace_id", ws.id).order("created_at").limit(1);
    const k = (data?.[0] ?? null) as { tokens: Partial<Tokens>; logo_url: string | null } | null;
    return { tokens: cleanTokens(k?.tokens ?? {}).tokens, logo: k?.logo_url ?? undefined };
  });
  // ?use=<key> (the website's Use this template) opens that template's preview.
  const [asked] = useState(() => (typeof window === "undefined" ? undefined : EMAIL_TEMPLATES.find((x) => x.key === new URLSearchParams(window.location.search).get("use")?.replace(/-/g, "_"))));
  const [forGroup] = useState(() => {
    const g = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("group");
    return g && /^([0-9a-f-]{36}|ungrouped)$/.test(g) ? g : null;
  });
  const [folder, setFolder] = useState<TemplateFolder>(asked?.group ?? TEMPLATE_FOLDERS[0]!);
  const [open, setOpen] = useState<EmailTemplate | null>(asked ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const use = async (t: EmailTemplate) => {
    setBusy(true);
    setError("");
    try {
      const id = must(await sb.rpc("email_draft_save", { p_ws: ws.id, p_id: null, p_name: t.name, p_subject: "", p_preheader: "", p_doc: t.make() })) as string;
      invalidate(`email_campaigns:${ws.id}`);
      // From a canvas's Add email (?group=<id> or ungrouped): the draft lands in that group, picked on its canvas.
      if (forGroup) {
        if (forGroup !== "ungrouped") must(await sb.rpc("email_group_place", { p_ws: ws.id, p_email: id, p_group: forGroup, p_position: null }));
        return navigate("emails", `campaigns/group/${forGroup}`, `pick=${id}`);
      }
      navigate("emails", `campaigns/${id}`);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  const shown = EMAIL_TEMPLATES.filter((t) => t.group === folder);
  const library = (
    <div className="mb-8 flex flex-col gap-4">
      <ErrorNote message={error} />
      <div className="flex flex-wrap items-start gap-6">
        <nav aria-label="Folders" className="flex w-full flex-col gap-0.5 sm:w-[210px] sm:shrink-0">
          {TEMPLATE_FOLDERS.map((f) => (
            <button
              key={f}
              type="button"
              aria-current={f === folder ? "true" : undefined}
              onClick={() => setFolder(f)}
              className={`flex h-8 items-center justify-between gap-2 rounded-md px-2.5 text-left text-[13px] font-medium transition-colors duration-[140ms] ${f === folder ? "bg-signal-soft text-signal-text" : "text-text hover:bg-hover"}`}
            >
              <span className="min-w-0">{f}</span>
              <span className="text-faint tabular-nums">{EMAIL_TEMPLATES.filter((t) => t.group === f).length}</span>
            </button>
          ))}
        </nav>
        <ul className="grid min-w-0 flex-1 grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
          {shown.map((t) => (
            <li key={t.key}>
              <button type="button" onClick={() => setOpen(t)} className="group flex w-full flex-col gap-2 text-left">
                {kit.data ? <Thumb t={t} tokens={kit.data.tokens} logo={kit.data.logo} /> : <div className="h-[260px] rounded-[10px] bg-paper shadow-rest" />}
                <span className="flex flex-col">
                  <span className="text-[13.5px] font-medium text-ink">{t.name}</span>
                  {t.blurb ? <span className="text-[12.5px] text-muted">{t.blurb}</span> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <h2 className="mt-4 text-[14px] font-medium text-ink">Your templates</h2>
      {open && kit.data ? <Preview t={open} tokens={kit.data.tokens} logo={kit.data.logo} busy={busy} onClose={() => setOpen(null)} onUse={() => void use(open)} /> : null}
    </div>
  );
  return <EmailTemplatesView {...props} above={library} />;
}

/** A template as it would arrive, scaled down to a card. */
function Thumb({ t, tokens, logo }: { t: EmailTemplate; tokens: Tokens; logo?: string }) {
  const html = useMemo(() => filled(compileEmail(readSystem({}, tokens), t.make(), { tokens, logo }).html), [t, tokens, logo]);
  return (
    <div className="relative h-[260px] overflow-hidden rounded-[10px] bg-paper shadow-rest transition-[box-shadow,transform] duration-[150ms] ease-out group-hover:-translate-y-0.5 group-hover:shadow-hover motion-reduce:transform-none">
      <iframe title="" aria-hidden="true" tabIndex={-1} loading="lazy" srcDoc={html} className="pointer-events-none absolute top-0 left-1/2 h-[720px] w-[640px] origin-top -translate-x-1/2 scale-[0.36] border-0 bg-paper" />
    </div>
  );
}

function Preview({ t, tokens, logo, busy, onClose, onUse }: { t: EmailTemplate; tokens: Tokens; logo?: string; busy: boolean; onClose: () => void; onUse: () => void }) {
  const html = useMemo(() => compileEmail(readSystem({}, tokens), t.make(), { tokens, logo, preview: true }).html, [t, tokens, logo]);
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
          <Button onClick={onUse} disabled={busy}>
            {busy ? "Opening…" : "Use template"}
          </Button>
        </>
      }
    >
      <iframe title={`${t.name} preview`} srcDoc={html} className="h-[60vh] w-full rounded-lg bg-paper shadow-rest" />
    </Modal>
  );
}
