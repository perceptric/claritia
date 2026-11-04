"use client";

// Pieces every Share screen uses (docs/sharing-plan.md): the link row (the whole link, Copy and Open) and the code box
// (a bar with Copy above the code, so the button never sits on the code). Used by a form's Share tab, a meeting's Share
// dialog and Settings › Link domain.

import { useMemo, useState } from "react";
import { PLATS, type Plat } from "@/lib/share/embed";
import { Check, Copy, ExternalLink } from "../Icons";
import { BrandLogo } from "./BrandLogo";
import { copyText } from "./CopyButton";
import { Select } from "./Select";
import { Button } from "./ui";

/** Copy with a check for a moment after. */
export function useCopied() {
  const [done, setDone] = useState("");
  const copy = async (what: string, text: string) => {
    if (!(await copyText(text))) return false;
    setDone(what);
    setTimeout(() => setDone((d) => (d === what ? "" : d)), 1600);
    return true;
  };
  return { done, copy };
}

/** The link in full, one primary Copy and Open. */
export function LinkRow({ url, disabled = false, primary = true }: { url: string; disabled?: boolean; primary?: boolean }) {
  const { done, copy } = useCopied();
  const shown = url.replace(/^https?:\/\//, "");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={disabled ? undefined : url} target="_blank" rel="noopener" data-share-link className="min-w-0 flex-1 basis-[240px] truncate rounded-[6px] border border-line bg-paper px-3 py-[7px] font-mono text-[12.5px] text-ink hover:border-line-strong" title={url}>
        {shown}
      </a>
      <Button size="sm" variant={primary ? "primary" : "ghost"} disabled={disabled} onClick={() => void copy("link", url)}>
        {done === "link" ? <Check size={13} /> : <Copy size={13} />}
        {done === "link" ? "Copied" : "Copy link"}
      </Button>
      <Button size="sm" variant="ghost" disabled={disabled} onClick={() => window.open(url, "_blank", "noopener")}>
        <ExternalLink size={13} />
        Open
      </Button>
    </div>
  );
}

/** Code to paste, with its own bar: a label, anything else for the bar (like platform picks), and Copy. */
/** `tall`: a long file (a form's whole HTML) scrolls inside the box, under its Copy button. */
export function CodeBox({ code, label = "Code", bar, embed = false, tall = false }: { code: string; label?: string; bar?: React.ReactNode; embed?: boolean; tall?: boolean }) {
  const { done, copy } = useCopied();
  return (
    <div className="overflow-hidden rounded-[10px] bg-card shadow-rest">
      <div className="flex items-start gap-2 border-b border-line px-3 py-2">
        <div className="flex min-h-[28px] min-w-0 flex-1 items-center">{bar ?? <span className="font-mono text-[11px] tracking-[0.04em] text-muted uppercase">{label}</span>}</div>
        <Button size="sm" variant="ghost" onClick={() => void copy("code", code)}>
          {done === "code" ? <Check size={13} /> : <Copy size={13} />}
          {done === "code" ? "Copied" : "Copy code"}
        </Button>
      </div>
      <pre {...(embed ? { "data-embed-code": "" } : {})} className={`m-0 overflow-x-auto bg-paper px-4 py-3.5 font-mono text-[12px] leading-[1.6] whitespace-pre text-body ${tall ? "max-h-[440px] overflow-y-auto" : ""}`}>
        {code}
      </pre>
    </div>
  );
}

const PlatMark = ({ p }: { p: (typeof PLATS)[number] }) =>
  p.domain ? <BrandLogo domain={p.domain} name={p.l} size={18} /> : <span className="inline-flex size-[18px] shrink-0 items-center justify-center rounded-[5px] bg-paper-deep font-mono text-[9px] text-body">&lt;/&gt;</span>;

/**
 * The site builder, as a dropdown in the code's bar: its logo and name, each builder's steps as the gray line under it,
 * and the developer docs last (they open in a new tab).
 */
export function BuilderPick({ value, onChange }: { value: Plat; onChange: (v: Plat) => void }) {
  const cur = PLATS.find((p) => p.v === value) ?? PLATS[0]!;
  return (
    <Select<Plat | "dev">
      value={value}
      ariaLabel="Site builder"
      down
      menuWidth={320}
      className="h-[28px] rounded-full border border-line px-[8px] text-[12.5px] text-ink hover:border-line-strong"
      shown={
        <span className="inline-flex h-[26px] items-center gap-[7px] align-middle leading-none">
          <PlatMark p={cur} />
          {cur.l}
        </span>
      }
      options={[...PLATS.map((p) => ({ value: p.v, label: p.l, hint: p.how })), { value: "dev" as const, label: "For developers", hint: "Claritia.open(), events and React" }]}
      onChange={(v) => (v === "dev" ? void window.open("/developers/embed", "_blank", "noopener") : onChange(v))}
    />
  );
}

/** The app's colors (light or dark), for pages drawn inside a frame: they can't see the app's tokens. */
function tones() {
  if (typeof window === "undefined") return null;
  const css = getComputedStyle(document.documentElement);
  const v = (n: string) => css.getPropertyValue(n).trim();
  return { bg: v("--color-card"), ink: v("--color-ink"), line: v("--color-line"), soft: v("--color-paper-deep") };
}

/**
 * A plain sample page in a browser frame with the real code in it, so people see the form or calendar the way it will
 * sit on their site. `code` is pasted as is; `after` runs once the script is in (opening a popup to show it).
 * `still`: look only, no clicks (a meeting's calendar books for real).
 */
export function SitePreview({ code, after = "", still = false, label, height = 380 }: { code: string; after?: string; still?: boolean; label: string; height?: number }) {
  const doc = useMemo(() => {
    const t = tones();
    if (!t?.bg) return "";
    const bar = (w: string, h = 10, c = t.soft) => `<div style="height:${h}px;width:${w};background:${c};border-radius:${h / 2}px;margin:0 0 10px"></div>`;
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:${t.bg};color:${t.ink};font:14px/1.5 Inter,system-ui,sans-serif}.site{max-width:720px;margin:0 auto;padding:22px 24px 40px}.nav{display:flex;justify-content:space-between;align-items:center;margin-bottom:30px}button[data-claritia-open],a[data-claritia-book]{display:inline-flex;align-items:center;height:36px;padding:0 16px;border-radius:999px;border:0;background:${t.ink};color:${t.bg};font:500 13px Inter,system-ui,sans-serif;text-decoration:none;margin:6px 0 18px;cursor:pointer}</style></head><body><div class="site"><div class="nav">${bar("90px", 14, t.line)}<div style="display:flex;gap:14px">${bar("40px", 8)}${bar("40px", 8)}${bar("40px", 8)}</div></div>${bar("58%", 22, t.line)}${bar("88%")}${bar("72%")}<div style="height:12px"></div>${code}<div style="height:16px"></div>${bar("80%")}${bar("64%")}${bar("76%")}</div><script>customElements.whenDefined("claritia-form").then(function(){setTimeout(function(){${after}},700)});</script></body></html>`;
  }, [code, after]);
  return (
    <div className="overflow-hidden rounded-[10px] bg-card shadow-rest">
      <div aria-hidden="true" className="flex h-[30px] items-center gap-[6px] border-b border-line bg-paper px-[12px]">
        <i className="size-[8px] rounded-full bg-line-strong" />
        <i className="size-[8px] rounded-full bg-line-strong" />
        <i className="size-[8px] rounded-full bg-line-strong" />
        <span className="mx-auto h-[14px] w-[40%] rounded-full bg-paper-deep" />
      </div>
      {doc ? <iframe title={label} srcDoc={doc} data-site-preview="" style={{ height }} className={`block w-full border-0 ${still ? "pointer-events-none" : ""}`} /> : <div style={{ height }} />}
    </div>
  );
}
