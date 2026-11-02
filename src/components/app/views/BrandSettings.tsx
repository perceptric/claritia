"use client";

// Settings › Brand (docs/brand-capture.md): the workspace's brand book, read from its website. Its logo, colors by role,
// type, buttons, corners, imagery, voice and rules. Forms, booking pages and the AI form builder use it. Read again
// after a site redesign, or pick another site as the brand.

import { useEffect, useState } from "react";
import type { BrandBook } from "@/lib/brand/book";
import { cleanSvg } from "@/lib/brand/deep";
import { cleanFontUrl, cleanTokens } from "@/lib/forms/brand";
import { brandName } from "@/lib/brand/name";
import { askConfirm } from "../Dialogs";
import { Badge, Button, CardHead, ErrorNote, errorText, invalidate, Loading, must, Panel, postJson, useQuery, type ViewProps } from "../ui";

type Kit = {
  id: string;
  name: string;
  tokens: Record<string, unknown> | null;
  logo_url: string | null;
  source_url: string | null;
  scan_status: string | null;
  scan_error: string | null;
  book?: BrandBook | null;
  logo_svg?: string | null;
  book_status?: string | null;
};
const COLS = "id, name, tokens, logo_url, source_url, scan_status, scan_error, book, logo_svg, book_status";
const BASIC = "id, name, tokens, logo_url, source_url, scan_status, scan_error";
const ROLE_WORDS: Record<string, string> = { primary: "Primary", secondary: "Secondary", accent: "Accent", background: "Background", surface: "Surface", text: "Text", muted: "Muted text", border: "Border", dark: "Dark" };
const host = (u: string | null) => (u ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "");

export function BrandSettings({ sb, session, ws }: Pick<ViewProps, "sb" | "session" | "ws">) {
  const data = useQuery(`brand:${ws.id}`, async () => {
    const [w, full] = await Promise.all([sb.from("workspaces").select("brand_kit_id").eq("id", ws.id).maybeSingle(), sb.from("brand_kits").select(COLS).eq("workspace_id", ws.id).order("created_at")]);
    // Before 108 the book columns aren't there: the basic kit still shows.
    const kits = full.error ? must(await sb.from("brand_kits").select(BASIC).eq("workspace_id", ws.id).order("created_at")) : full.data;
    return { brand: (w.data as { brand_kit_id: string | null } | null)?.brand_kit_id ?? null, kits: (kits ?? []) as Kit[] };
  });
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const kits = data.data?.kits ?? [];
  const brand = kits.find((k) => k.id === data.data?.brand) ?? kits.find((k) => k.tokens && Object.keys(k.tokens).length) ?? null;
  const reading = kits.some((k) => k.scan_status === "scanning" || k.book_status === "reading");

  useEffect(() => {
    if (!reading) return;
    const t = setInterval(() => data.reload(), 3000);
    return () => clearInterval(t);
  }, [reading, data]);

  // The brand's own fonts, so the type specimen shows them.
  const t = brand ? cleanTokens(brand.tokens ?? {}).tokens : null;
  const fontUrl = t?.fontUrl ? cleanFontUrl(t.fontUrl) : null;
  useEffect(() => {
    if (!fontUrl || document.querySelector(`link[data-brand-font="${fontUrl}"]`)) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = fontUrl;
    l.dataset.brandFont = fontUrl;
    document.head.append(l);
  }, [fontUrl]);

  const scan = async (site: string, kitId?: string) => {
    setBusy(true);
    setError("");
    try {
      const r = await postJson<{ kitId: string }>(session, "/api/forms/scan", { workspaceId: ws.id, url: site, ...(kitId ? { kitId } : {}) });
      if (!kitId) must(await sb.rpc("workspace_brand_set", { p_ws: ws.id, p_kit: r.kitId }));
      setUrl("");
      data.reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  /** Delete a brand: forms in it go back to Claritia's look. */
  const remove = async (k: Kit) => {
    if (!(await askConfirm(`Delete ${brandName(k)}?`, { body: "Forms and booking pages in this brand go back to Claritia's look.", ok: "Delete", danger: true }))) return;
    setError("");
    try {
      must(await sb.rpc("brand_kit_delete", { p_id: k.id }));
      invalidate(`forms:${ws.id}:home`);
      data.reload();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const use = async (id: string) => {
    setError("");
    try {
      must(await sb.rpc("workspace_brand_set", { p_ws: ws.id, p_kit: id }));
      data.reload();
    } catch (e) {
      setError(errorText(e));
    }
  };

  if (!data.data) return data.error ? <ErrorNote message={data.error} /> : <Loading />;
  const book = brand?.book ?? null;
  const svg = brand?.logo_svg ? cleanSvg(brand.logo_svg) : null;
  const headFont = book?.type.heading.family ?? t?.headingFont ?? t?.font;
  const bodyFont = book?.type.body.family ?? t?.font;
  const colors = book?.colors.length ? book.colors : t ? [{ hex: t.accent, role: "primary", name: "" }, { hex: t.text, role: "text", name: "" }, { hex: t.background, role: "background", name: "" }] : [];
  const pb = book?.buttons.primary;

  return (
    <div className="flex flex-col gap-5">
      <ErrorNote message={error} />
      <Panel>
        <CardHead label={brand ? host(brand.source_url) || brand.name : "No brand yet"}>
          {brand ? (
            <span className="flex items-center gap-2">
              {reading ? (
                <Badge tone="amber" dot>
                  {brand.book_status === "reading" ? "Writing the brand book" : "Reading"}
                </Badge>
              ) : brand.scan_status === "failed" && !book ? (
                <Badge tone="red">Couldn&apos;t read</Badge>
              ) : (
                <Badge tone="green" dot>
                  Ready
                </Badge>
              )}
              {brand.source_url ? (
                <Button variant="plain" className="h-7 px-2" disabled={busy || reading} onClick={() => void scan(brand.source_url!, brand.id)}>
                  Read again
                </Button>
              ) : null}
              <Button variant="plain" className="h-7 px-2 text-rose" disabled={busy} onClick={() => void remove(brand)}>
                Delete
              </Button>
            </span>
          ) : null}
        </CardHead>
        {brand && t ? (
          <div className="flex flex-col gap-6 px-5 py-5">
            <div className="flex flex-wrap items-center gap-5">
              {svg ? (
                <span className="flex h-12 items-center [&_svg]:h-full [&_svg]:w-auto" style={{ color: book?.colors.find((c) => c.role === "text")?.hex ?? t.text }} dangerouslySetInnerHTML={{ __html: svg }} />
              ) : brand.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={brand.logo_url} alt="" className="h-12 max-w-[180px] object-contain" />
              ) : null}
              <div className="flex min-w-0 flex-col">
                <span className="text-[20px] font-semibold text-ink" style={{ fontFamily: headFont }}>
                  {book?.name ?? brand.name}
                </span>
                {book?.tagline ? <span className="text-[13px] text-muted">{book.tagline}</span> : null}
              </div>
            </div>

            <section className="flex flex-col gap-2">
              <span className="label-mono">Colors</span>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {colors.map((c) => (
                  <div key={`${c.role}${c.hex}`} className="flex flex-col overflow-hidden rounded-[10px] border border-line">
                    <span className="h-16" style={{ background: c.hex }} />
                    <span className="flex flex-col px-3 py-2">
                      <span className="text-[12.5px] font-medium text-ink">{c.name || ROLE_WORDS[c.role]}</span>
                      <span className="text-[12px] text-muted">{ROLE_WORDS[c.role]}</span>
                      <span className="font-mono text-[11.5px] text-muted">{c.hex}</span>
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="flex flex-col gap-2">
              <span className="label-mono">Type</span>
              <div className="flex flex-col gap-3 rounded-[10px] border border-line px-4 py-4">
                {(book?.type.scale.length ? book.type.scale : [{ role: "h1", size: "40px", weight: "600", lineHeight: "1.15", letterSpacing: "0" }, { role: "body", size: "16px", weight: "400", lineHeight: "1.5", letterSpacing: "0" }]).map((s) => (
                  <div key={s.role} className="flex flex-wrap items-baseline gap-4">
                    <span className="w-10 font-mono text-[11.5px] text-muted uppercase">{s.role}</span>
                    <span className="min-w-0 truncate text-ink" style={{ fontFamily: s.role === "body" ? bodyFont : headFont, fontSize: `min(${/^\d/.test(s.size) || s.size.startsWith("clamp") ? s.size : "32px"}, 48px)`, fontWeight: Number(s.weight) || 500, lineHeight: s.lineHeight, letterSpacing: s.letterSpacing }}>
                      {s.role === "body" ? "Answer a few questions and get your estimate." : book?.tagline || "The quick brown fox"}
                    </span>
                    <span className="ml-auto text-[12px] text-muted">{`${s.size}, ${s.weight}`}</span>
                  </div>
                ))}
                <span className="text-[12px] text-muted">{[headFont, bodyFont].filter((x, i, a) => x && a.indexOf(x) === i).map((f) => String(f).split(",")[0]!.replace(/['"]/g, "")).join(" and ")}</span>
              </div>
            </section>

            <section className="flex flex-col gap-2">
              <span className="label-mono">Buttons</span>
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex h-11 items-center px-6 text-[15px]" style={{ background: pb?.gradient ?? t.buttonBg, color: pb?.text ?? t.buttonText, borderRadius: pb?.radius ?? t.buttonRadius, fontFamily: bodyFont, fontWeight: t.buttonWeight }}>
                  {book?.voice.ctas[0] ?? "Book a demo"}
                </span>
                {book?.buttons.secondary ? (
                  <span className="inline-flex h-11 items-center px-6 text-[15px]" style={{ background: book.buttons.secondary.bg, color: book.buttons.secondary.text, border: book.buttons.secondary.border || undefined, borderRadius: book.buttons.secondary.radius, fontFamily: bodyFont }}>
                    {book.voice.ctas[1] ?? "Learn more"}
                  </span>
                ) : null}
                <span className="text-[12px] text-muted">{`Corners ${book?.corners ?? t.radius}px`}</span>
              </div>
            </section>

            {book ? (
              <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <span className="label-mono">Voice</span>
                  <p className="text-[13px] text-ink">{book.voice.tone}</p>
                  {book.voice.words.length ? <p className="text-[12.5px] text-muted">{`Says: ${book.voice.words.join(", ")}`}</p> : null}
                  {book.voice.avoid.length ? <p className="text-[12.5px] text-muted">{`Avoids: ${book.voice.avoid.join(", ")}`}</p> : null}
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="label-mono">Imagery</span>
                  <p className="text-[13px] text-ink">{book.imagery}</p>
                </div>
                {book.rules.length ? (
                  <div className="flex flex-col gap-1.5 md:col-span-2">
                    <span className="label-mono">Rules</span>
                    <ul className="flex list-disc flex-col gap-1 pl-5 text-[13px] text-ink">
                      {book.rules.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </section>
            ) : null}
            {brand.scan_error && !reading && !book ? <p className="text-[12px] text-muted">{brand.scan_error}</p> : null}
          </div>
        ) : null}
      </Panel>

      <Panel>
        <CardHead label="Use another site" />
        <form
          className="flex flex-wrap items-center gap-2 px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (url.trim() && !busy) void scan(url.trim());
          }}
        >
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="yourcompany.com" aria-label="Website" className="h-9 min-w-[220px] flex-1 rounded-md border border-line-strong bg-card px-3 text-[13px] text-ink outline-none focus:border-ink" />
          <Button disabled={!url.trim() || busy}>{busy ? "Reading" : "Read this site"}</Button>
        </form>
      </Panel>

      {kits.length > 1 ? (
        <Panel>
          <CardHead label="Other sites" count={kits.length - 1} />
          <ul>
            {kits
              .filter((k) => k.id !== brand?.id)
              .map((k) => {
                const kt = cleanTokens(k.tokens ?? {}).tokens;
                return (
                  <li key={k.id} className="flex items-center gap-3 border-t border-line px-5 py-3 first:border-t-0">
                    <span className="size-5 rounded-full border border-line" style={{ background: kt.accent }} />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{brandName(k)}</span>
                    <span className="truncate text-[12px] text-muted max-[640px]:hidden">{host(k.source_url)}</span>
                    <Button variant="ghost" size="sm" onClick={() => void use(k.id)}>
                      Use as brand
                    </Button>
                    <Button variant="plain" size="sm" className="text-rose" onClick={() => void remove(k)}>
                      Delete
                    </Button>
                  </li>
                );
              })}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
