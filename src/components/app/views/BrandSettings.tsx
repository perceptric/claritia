"use client";

// Settings › Brand (docs/brand-capture.md): the workspace's brand, read from its website. Forms, booking pages and the
// meeting editor wear it. Read again after a site redesign, or pick another site as the brand.

import { useEffect, useState } from "react";
import { cleanTokens } from "@/lib/forms/brand";
import { Badge, Button, CardHead, ErrorNote, errorText, Loading, must, Panel, postJson, useQuery, type ViewProps } from "../ui";

type Kit = { id: string; name: string; tokens: Record<string, unknown> | null; logo_url: string | null; source_url: string | null; scan_status: string | null; scan_error: string | null; quick_at: string | null };
const COLS = "id, name, tokens, logo_url, source_url, scan_status, scan_error, quick_at";

const font = (f: string) => f.split(",")[0]!.replace(/['"]/g, "").trim();

export function BrandSettings({ sb, session, ws }: Pick<ViewProps, "sb" | "session" | "ws">) {
  const data = useQuery(`brand:${ws.id}`, async () => {
    const [w, kits] = await Promise.all([sb.from("workspaces").select("brand_kit_id").eq("id", ws.id).maybeSingle(), sb.from("brand_kits").select(COLS).eq("workspace_id", ws.id).order("created_at")]);
    return { brand: (w.data as { brand_kit_id: string | null } | null)?.brand_kit_id ?? null, kits: (must(kits) ?? []) as Kit[] };
  });
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const kits = data.data?.kits ?? [];
  const brand = kits.find((k) => k.id === data.data?.brand) ?? kits.find((k) => k.tokens && Object.keys(k.tokens).length) ?? null;
  const reading = kits.some((k) => k.scan_status === "scanning");

  // While a scan runs, look again every 3 seconds.
  useEffect(() => {
    if (!reading) return;
    const t = setInterval(() => data.reload(), 3000);
    return () => clearInterval(t);
  }, [reading, data]);

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
  const t = brand ? cleanTokens(brand.tokens ?? {}).tokens : null;
  const swatches = t ? ([["Brand", t.accent], ["Buttons", t.buttonBg], ["Text", t.text], ["Background", t.background]] as const) : [];

  return (
    <div className="flex flex-col gap-5">
      <ErrorNote message={error} />
      <Panel>
        <CardHead label={brand ? (brand.source_url ?? brand.name).replace(/^https?:\/\//, "").replace(/\/$/, "") : "No brand yet"}>
          {brand ? (
            <span className="flex items-center gap-2">
              {brand.scan_status === "scanning" ? <Badge tone="amber" dot>Reading</Badge> : brand.scan_status === "failed" ? <Badge tone="red">Couldn&apos;t read</Badge> : <Badge tone="green" dot>Ready</Badge>}
              {brand.source_url ? (
                <Button variant="plain" className="h-7 px-2" disabled={busy} onClick={() => void scan(brand.source_url!, brand.id)}>
                  Read again
                </Button>
              ) : null}
            </span>
          ) : null}
        </CardHead>
        {brand && t ? (
          <div className="flex flex-col gap-5 px-5 py-4">
            <div className="flex flex-wrap items-center gap-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {brand.logo_url ? <img src={brand.logo_url} alt="" className="h-10 max-w-[160px] object-contain" /> : null}
              <div className="flex flex-wrap gap-4">
                {swatches.map(([label, c]) => (
                  <div key={label} className="flex items-center gap-2">
                    <span className="size-8 rounded-md border border-line" style={{ background: c }} />
                    <span className="flex flex-col">
                      <span className="text-[12px] text-muted">{label}</span>
                      <span className="font-mono text-[12px] text-ink">{c}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-8 text-[13px]">
              <span className="flex flex-col">
                <span className="text-[12px] text-muted">Font</span>
                <span className="text-ink" style={{ fontFamily: t.font }}>{font(t.font)}</span>
              </span>
              {t.headingFont ? (
                <span className="flex flex-col">
                  <span className="text-[12px] text-muted">Headings</span>
                  <span className="text-ink" style={{ fontFamily: t.headingFont }}>{font(t.headingFont)}</span>
                </span>
              ) : null}
              <span className="flex flex-col">
                <span className="text-[12px] text-muted">Corners</span>
                <span className="text-ink">{t.buttonRadius >= 24 ? "Round" : t.buttonRadius === 0 ? "Square" : `${t.buttonRadius}px`}</span>
              </span>
            </div>
            <span className="inline-flex h-10 items-center self-start px-5 text-[14px]" style={{ background: t.buttonBg, color: t.buttonText, borderRadius: t.buttonRadius, fontFamily: t.font, fontWeight: t.buttonWeight, textTransform: t.buttonCase }}>
              Book a demo
            </span>
            {brand.scan_error && brand.scan_status !== "scanning" ? <p className="text-[12px] text-muted">{brand.scan_error}</p> : null}
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
                    <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{(k.source_url ?? k.name).replace(/^https?:\/\//, "")}</span>
                    <Button variant="ghost" size="sm" onClick={() => void use(k.id)}>
                      Use as brand
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
