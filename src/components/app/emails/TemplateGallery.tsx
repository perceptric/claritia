"use client";

// Emails › Templates (docs/email-studio-plan.md Part 8): the 100 built-in templates by folder, each previewed in the
// workspace's brand (its logo, colors, fonts and button, docs/brand-capture.md) with its real postal address, then your
// saved templates below. With no brand yet, the website box reads one here, the way onboarding does. Use template
// makes a campaign draft in the brand and opens the Email Studio, where Tia can fill it in. The website's template
// pages link here with ?use=<key>.

import { useEffect, useMemo, useRef, useState } from "react";
import { compileEmail } from "@/lib/design/email/compile";
import { EMAIL_TEMPLATES, TEMPLATE_FOLDERS, type EmailTemplate, type TemplateFolder } from "@/lib/design/email/library";
import { readSystem } from "@/lib/design/model";
import { designFonts, fontUrl, tokenFonts } from "@/lib/design/fonts";
import type { Tokens } from "@/lib/forms/brand";
import { Modal } from "../meetings/parts";
import { Button, ErrorNote, errorText, Input, invalidate, must, postJson, Segmented, useQuery, type ViewProps } from "../ui";
import { AiMark } from "../Ai";
import { kitsBrandFirst } from "@/lib/brand/workspaceKit";
import { EmailTemplatesView } from "../workflows/EmailTemplatesView";
import { emailTokens } from "@/lib/design/email/look";

const SAMPLE_ADDRESS = "Your address";
/** What Tia is asked when a template is used (docs/email-studio-plan.md Part 8). */
const REWRITE =
  "Rewrite every word of this template in our brand's voice, for our business. Keep the layout, blocks, photos, buttons and links as they are. Replace the sample names, numbers, dates, prices and places with ones that fit us; where only we would know a detail, keep a believable example we can change. Write a subject line too.";
const escText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** Merge tags as a reader sees them: the fallback, and the workspace's postal address (a sample until it has one). */
const filled = (html: string, address: string) =>
  html.replace(/\{\{\s*([a-z_]+)\s*(?:\|([^}]*))?\}\}/g, (_m, k: string, f?: string) => (k === "company_address" ? escText(address || SAMPLE_ADDRESS) : k === "unsubscribe_url" ? "#" : (f ?? "")));
type Look = { id?: string; branded: boolean; tokens: Tokens; logo?: string; name: string; site: string | null; reading: boolean; address: string };
/** A template as the server compiles it for a send (src/lib/design/email/server.ts): the brand's tokens, logo or name, and its Google Fonts. */
function render(t: EmailTemplate, look: Look, preview = false, dark = false): string {
  const system = readSystem({}, look.tokens);
  const doc = t.make();
  return filled(compileEmail(system, doc, { tokens: look.tokens, logo: look.logo, brandName: look.name, logoSlot: true, forceDark: dark, fontUrl: fontUrl([...designFonts(system, doc.styles ?? null), ...tokenFonts(look.tokens)]), preview }).html, look.address);
}

export function TemplateGallery(props: ViewProps) {
  const { sb, ws, navigate } = props;
  // The workspace's brand (the one it set, src/lib/brand/workspaceKit.ts) and the address its footers carry.
  const kit = useQuery(`email_kit:${ws.id}`, async (): Promise<Look> => {
    type Row = { id: string; tokens: Partial<Tokens> | null; logo_url: string | null; source_url: string | null; scan_status: string | null; book_name: string | null };
    const [kits, send, team] = await Promise.all([
      kitsBrandFirst<Row>(sb, ws.id, "id, tokens, logo_url, source_url, scan_status, book_name:book->>name"),
      sb.from("send_settings").select("address").eq("workspace_id", ws.id).maybeSingle(),
      sb.from("workspaces").select("name, named").eq("id", ws.id).maybeSingle(),
    ]);
    // The team's name only once its owner named it: never one made from the sign-up email.
    const w = team.data as { name?: string | null; named?: boolean | null } | null;
    const teamName = w?.named === false ? "" : (w?.name ?? ws.name ?? "").trim();
    const k = (kits.data ?? [])[0] ?? null;
    const branded = !!k && Object.keys(k.tokens ?? {}).length > 0;
    return {
      id: k?.id,
      branded,
      tokens: emailTokens(k?.tokens),
      logo: k?.logo_url ?? undefined,
      name: (branded && k?.book_name?.trim()) || teamName,
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
  const [busy, setBusy] = useState<"" | "saving" | "writing">("");
  const [error, setError] = useState("");
  const use = async (t: EmailTemplate) => {
    setBusy("saving");
    setError("");
    try {
      // The draft wears the brand it was previewed in.
      const doc = { ...t.make(), ...(kit.data?.id ? { kitId: kit.data.id } : {}) };
      const id = must(await sb.rpc("email_draft_save", { p_ws: ws.id, p_id: null, p_name: t.name, p_subject: "", p_preheader: "", p_doc: doc })) as string;
      // Tia rewrites the words in the brand's voice (through the step cache; the sample is kept as the version before).
      // With no brand to learn a voice from, or when Tia can't, the sample copy stays.
      if (kit.data?.branded) {
        setBusy("writing");
        try {
          const r = await postJson<{ doc?: unknown; subject?: string; ask?: string | null }>(props.session, "/api/email/chat", { workspaceId: ws.id, ref: `em:${id}`, doc, subject: "", message: REWRITE });
          if (r.doc && !r.ask) must(await sb.rpc("email_draft_save", { p_ws: ws.id, p_id: id, p_name: t.name, p_subject: r.subject ?? "", p_preheader: "", p_doc: r.doc }));
        } catch {
          // The draft is already saved with the sample copy.
        }
      }
      invalidate(`email_campaigns:${ws.id}`);
      // From a canvas's Add email (?group=<id> or ungrouped): the draft lands in that group, picked on its canvas.
      if (forGroup) {
        if (forGroup !== "ungrouped") must(await sb.rpc("email_group_place", { p_ws: ws.id, p_email: id, p_group: forGroup, p_position: null }));
        return navigate("emails", `campaigns/group/${forGroup}`, `pick=${id}`);
      }
      navigate("emails", `campaigns/${id}`);
    } catch (e) {
      setError(errorText(e));
      setBusy("");
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
        <ul className="grid min-w-0 flex-1 grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-x-5 gap-y-7">
          {shown.map((t) => (
            <li key={t.key}>
              <button type="button" onClick={() => setOpen(t)} className="group flex w-full flex-col gap-2 text-left">
                {kit.data ? <Thumb t={t} look={kit.data} /> : <div className="h-[340px] rounded-xl bg-paper shadow-rest" />}
                <span className="flex flex-col gap-0.5">
                  <span className="text-[14px] font-medium text-ink">{t.name}</span>
                  {t.blurb ? <span className="text-[13px] text-muted">{t.blurb}</span> : null}
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
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void read();
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-medium text-ink">Show in your brand</span>
        <div className="w-[260px] max-w-full">
          <Input className="h-8" value={site} onChange={(e) => setSite(e.target.value)} placeholder="yourcompany.com" inputMode="url" autoCapitalize="none" spellCheck={false} aria-label="Your website" />
        </div>
        <Button type="submit" variant={site.trim() ? "primary" : "ghost"} className="h-8" disabled={busy || !site.trim()}>
          {busy ? "Reading your site…" : "Use my brand"}
        </Button>
      </div>
      <ErrorNote message={error} />
    </form>
  );
}

/** The email's width with the page around it, as the thumbnails draw it before scaling it to the card. */
const DRAWN = 664;

/** A template as it would arrive: the top of the real email, scaled to the card's width, every card the same height. */
function Thumb({ t, look }: { t: EmailTemplate; look: Look }) {
  const html = useMemo(() => render(t, look), [t, look]);
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(el.clientWidth / DRAWN);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className="relative h-[340px] overflow-hidden rounded-xl bg-paper shadow-rest transition-[box-shadow,transform] duration-[150ms] ease-out group-hover:-translate-y-0.5 group-hover:shadow-hover motion-reduce:transform-none">
      <iframe
        title=""
        aria-hidden="true"
        tabIndex={-1}
        loading="lazy"
        srcDoc={html}
        style={{ width: DRAWN, height: Math.ceil(340 / scale), transform: `scale(${scale})` }}
        className="pointer-events-none absolute top-0 left-0 origin-top-left border-0 bg-paper"
      />
    </div>
  );
}

function Preview({ t, look, busy, onClose, onUse }: { t: EmailTemplate; look: Look; busy: "" | "saving" | "writing"; onClose: () => void; onUse: () => void }) {
  const [view, setView] = useState<"desktop" | "phone" | "dark">("desktop");
  const html = useMemo(() => render(t, look, true, view === "dark"), [t, look, view]);
  return (
    <Modal
      title={t.name}
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="plain" onClick={onClose} disabled={!!busy}>
            Close
          </Button>
          <Button onClick={onUse} disabled={!!busy}>
            {busy === "writing" ? (
              <>
                <AiMark />
                Writing it in your voice…
              </>
            ) : busy ? (
              "Opening…"
            ) : (
              "Use template"
            )}
          </Button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-3">
        <Segmented
          size="sm"
          label="Preview"
          value={view}
          onChange={setView}
          options={[
            { value: "desktop", label: "Desktop" },
            { value: "phone", label: "Phone" },
            { value: "dark", label: "Dark" },
          ]}
        />
        <iframe title={`${t.name} preview`} srcDoc={html} className={`h-[62vh] max-w-full rounded-xl bg-paper shadow-rest ${view === "phone" ? "w-[390px]" : "w-full"}`} />
      </div>
    </Modal>
  );
}
