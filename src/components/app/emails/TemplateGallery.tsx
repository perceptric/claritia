"use client";

// Emails › Templates (docs/email-studio-plan.md Part 8): the 100 built-in templates by folder, each previewed in the
// workspace's brand (its logo, colors, fonts and button, docs/brand-capture.md) with its real postal address, then your
// saved templates below. With no brand yet, the website box reads one here, the way onboarding does. Use template
// makes a campaign draft in the brand and opens the Email Studio, where Tia can fill it in. The website's template
// pages link here with ?use=<key>.

import { useMemo, useState } from "react";
import { compileEmail } from "@/lib/design/email/compile";
import { EMAIL_TEMPLATES, TEMPLATE_FOLDERS, type EmailTemplate, type TemplateFolder } from "@/lib/design/email/library";
import { readSystem } from "@/lib/design/model";
import { designFonts, fontUrl, tokenFonts } from "@/lib/design/fonts";
import { cleanTokens, type Tokens } from "@/lib/forms/brand";
import { Modal } from "../meetings/parts";
import { Button, ErrorNote, errorText, Input, invalidate, must, postJson, useQuery, type ViewProps } from "../ui";
import { kitsBrandFirst } from "@/lib/brand/workspaceKit";
import { EmailTemplatesView } from "../workflows/EmailTemplatesView";

const SAMPLE_ADDRESS = "100 Main St, Austin, TX";
const escText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** Merge tags as a reader sees them: the fallback, and the workspace's postal address (a sample until it has one). */
const filled = (html: string, address: string) =>
  html.replace(/\{\{\s*([a-z_]+)\s*(?:\|([^}]*))?\}\}/g, (_m, k: string, f?: string) => (k === "company_address" ? escText(address || SAMPLE_ADDRESS) : k === "unsubscribe_url" ? "#" : (f ?? "")));
type Look = { id?: string; branded: boolean; tokens: Tokens; logo?: string; name: string; site: string | null; reading: boolean; address: string };
/** A template as the server compiles it for a send (src/lib/design/email/server.ts): the brand's tokens, logo or name, and its Google Fonts. */
function render(t: EmailTemplate, look: Look, preview = false): string {
  const system = readSystem({}, look.tokens);
  const doc = t.make();
  return filled(compileEmail(system, doc, { tokens: look.tokens, logo: look.logo, brandName: look.name, fontUrl: fontUrl([...designFonts(system, doc.styles ?? null), ...tokenFonts(look.tokens)]), preview }).html, look.address);
}

export function TemplateGallery(props: ViewProps) {
  const { sb, ws, navigate } = props;
  // The workspace's brand (the one it set, src/lib/brand/workspaceKit.ts) and the address its footers carry.
  const kit = useQuery(`email_kit:${ws.id}`, async (): Promise<Look> => {
    type Row = { id: string; tokens: Partial<Tokens> | null; logo_url: string | null; source_url: string | null; scan_status: string | null; book_name: string | null };
    const [kits, send] = await Promise.all([kitsBrandFirst<Row>(sb, ws.id, "id, tokens, logo_url, source_url, scan_status, book_name:book->>name"), sb.from("send_settings").select("address").eq("workspace_id", ws.id).maybeSingle()]);
    const k = (kits.data ?? [])[0] ?? null;
    const branded = !!k && Object.keys(k.tokens ?? {}).length > 0;
    return {
      id: k?.id,
      branded,
      tokens: cleanTokens(k?.tokens ?? {}).tokens,
      logo: k?.logo_url ?? undefined,
      name: (branded && k?.book_name?.trim()) || ws.name,
      site: k?.source_url ?? null,
      reading: k?.scan_status === "scanning",
      address: ((send.data as { address?: string | null } | null)?.address ?? "").trim(),
    };
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
      // The draft wears the brand it was previewed in.
      const doc = { ...t.make(), ...(kit.data?.id ? { kitId: kit.data.id } : {}) };
      const id = must(await sb.rpc("email_draft_save", { p_ws: ws.id, p_id: null, p_name: t.name, p_subject: "", p_preheader: "", p_doc: doc })) as string;
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
      {kit.data ? <BrandBar {...props} look={kit.data} /> : null}
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
                {kit.data ? <Thumb t={t} look={kit.data} /> : <div className="h-[260px] rounded-[10px] bg-paper shadow-rest" />}
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
      {open && kit.data ? <Preview t={open} look={kit.data} busy={busy} onClose={() => setOpen(null)} onUse={() => void use(open)} /> : null}
    </div>
  );
  return <EmailTemplatesView {...props} above={library} />;
}

/** The brand the templates wear, or the website box that reads one (the same read as onboarding's). */
function BrandBar({ session, ws, navigate, look }: ViewProps & { look: Look }) {
  const [site, setSite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const read = async () => {
    const url = site.trim();
    if (!url) return;
    setBusy(true);
    setError("");
    try {
      await postJson(session, "/api/forms/scan", { workspaceId: ws.id, url });
      for (const k of [`email_kit:${ws.id}`, `email_canvas_kits:${ws.id}`, `brand_voice:${ws.id}`]) invalidate(k);
      setSite("");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  if (look.branded)
    return (
      <div data-brand-bar="" className="flex flex-wrap items-center gap-3 rounded-xl bg-card px-4 py-3 shadow-rest">
        {/* eslint-disable-next-line @next/next/no-img-element -- the brand's own logo, from its site */}
        {look.logo ? <img src={look.logo} alt="" className="h-7 max-w-[120px] object-contain" /> : null}
        <span className="flex gap-1" aria-hidden="true">
          {[look.tokens.buttonBg, look.tokens.accent, look.tokens.text].map((c, i) => (
            <span key={i} className="size-4 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]" style={{ background: c }} />
          ))}
        </span>
        <span className="min-w-0 text-[13px] font-medium text-ink">{look.site ? look.site.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") : "Your brand"}</span>
        {look.reading ? <span className="text-[12.5px] text-muted">Reading…</span> : null}
        <Button variant="plain" className="ml-auto h-8" onClick={() => navigate("emails", "brand")}>
          Change brand
        </Button>
      </div>
    );
  return (
    <form
      data-brand-bar=""
      className="flex flex-col gap-2 rounded-xl bg-card px-4 py-3 shadow-rest"
      onSubmit={(e) => {
        e.preventDefault();
        void read();
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-medium text-ink">Your website</span>
        <Input className="h-9 min-w-[200px] flex-1" value={site} onChange={(e) => setSite(e.target.value)} placeholder="yourcompany.com" inputMode="url" autoCapitalize="none" spellCheck={false} aria-label="Your website" />
        <Button type="submit" className="h-9" disabled={busy || !site.trim()}>
          {busy ? "Reading your site…" : "Use my brand"}
        </Button>
      </div>
      <ErrorNote message={error} />
    </form>
  );
}

/** A template as it would arrive, scaled down to a card. */
function Thumb({ t, look }: { t: EmailTemplate; look: Look }) {
  const html = useMemo(() => render(t, look), [t, look]);
  return (
    <div className="relative h-[260px] overflow-hidden rounded-[10px] bg-paper shadow-rest transition-[box-shadow,transform] duration-[150ms] ease-out group-hover:-translate-y-0.5 group-hover:shadow-hover motion-reduce:transform-none">
      <iframe title="" aria-hidden="true" tabIndex={-1} loading="lazy" srcDoc={html} className="pointer-events-none absolute top-0 left-1/2 h-[720px] w-[640px] origin-top -translate-x-1/2 scale-[0.36] border-0 bg-paper" />
    </div>
  );
}

function Preview({ t, look, busy, onClose, onUse }: { t: EmailTemplate; look: Look; busy: boolean; onClose: () => void; onUse: () => void }) {
  const html = useMemo(() => render(t, look, true), [t, look]);
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
