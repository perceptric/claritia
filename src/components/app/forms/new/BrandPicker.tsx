"use client";

// Styling's brand picker (docs/forms.md, Screen 1): the picked brand is the button, its logo and name, and it opens
// the list of brands, each with a delete, then Claritia's look and Learn from a website. The list opens on the layer
// above the page, so no panel cuts it off.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { brandName } from "@/lib/brand/name";
import { Ic } from "../ic";

export type PickerKit = { id: string; name?: string | null; source_url: string | null; logo_url?: string | null; logo_svg?: string | null; book?: { name?: string } | null };
export const CLARITIA = "claritia";
export const LEARN = "learn";

/** A brand's logo as a picture address: its https logo, or its SVG drawn as a picture (no scripts run in one). */
export const logoSrc = (k: PickerKit | null | undefined): string | null =>
  k?.logo_url && /^https:\/\//.test(k.logo_url) ? k.logo_url : k?.logo_svg && /^\s*<svg[\s>]/i.test(k.logo_svg) ? `data:image/svg+xml;utf8,${encodeURIComponent(k.logo_svg)}` : null;

function Mark({ k }: { k: PickerKit | null }) {
  const src = logoSrc(k);
  if (src)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className="h-[22px] w-auto max-w-[96px] shrink-0 object-contain" />;
  const letter = k ? brandName(k).slice(0, 1) : "C";
  return <span className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-full bg-paper-deep text-[11px] font-semibold text-muted">{letter}</span>;
}

export function BrandPicker({ kits, value, onChange, onDelete, disabled = false }: { kits: PickerKit[]; value: string; onChange: (v: string) => void; onDelete: (k: PickerKit) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const picked = kits.find((k) => k.id === value) ?? null;

  useLayoutEffect(() => {
    if (!open || !button.current) return;
    const place = () => {
      const r = button.current!.getBoundingClientRect();
      setPos({ left: r.left, top: r.bottom + 6, width: r.width });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !button.current?.contains(t)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const pick = (v: string) => {
    setOpen(false);
    onChange(v);
  };
  const row = "flex h-[40px] w-full items-center gap-[10px] rounded-md px-[10px] text-left text-[13px] text-ink hover:bg-hover";

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label="Styling"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className="flex h-[52px] w-full items-center gap-[10px] rounded-[10px] border border-line bg-card px-[12px] text-left transition-colors duration-[120ms] hover:border-line-strong disabled:opacity-60"
      >
        {value === LEARN ? (
          <span className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-full border border-dashed border-line-strong text-muted">
            <Ic n="plus" s={12} />
          </span>
        ) : (
          <Mark k={picked} />
        )}
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink">{value === LEARN ? "Learn from a website" : picked ? brandName(picked) : "Claritia"}</span>
        <span className={`inline-flex text-muted transition-transform duration-[200ms] ${open ? "rotate-180" : ""}`}>
          <Ic n="chev" s={14} />
        </span>
      </button>
      {open && pos
        ? createPortal(
            <div ref={menu} role="menu" aria-label="Brands" className="anim-rise-sm fixed z-[200] flex max-h-[360px] flex-col overflow-y-auto rounded-[10px] border border-line bg-card p-[4px] shadow-float" style={{ left: pos.left, top: pos.top, width: pos.width }}>
              {kits.map((k) => (
                <div key={k.id} className="group flex items-center">
                  <button type="button" role="menuitemradio" aria-checked={k.id === value} className={row} onClick={() => pick(k.id)}>
                    <Mark k={k} />
                    <span className="min-w-0 flex-1 truncate">{brandName(k)}</span>
                    {k.id === value ? <Ic n="check" s={13} /> : null}
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${brandName(k)}`}
                    title="Delete"
                    className="ml-[2px] inline-flex size-[32px] shrink-0 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-rose"
                    onClick={() => {
                      setOpen(false);
                      onDelete(k);
                    }}
                  >
                    <Ic n="trash" s={13} />
                  </button>
                </div>
              ))}
              {kits.length ? <div className="my-[4px] h-px bg-line" /> : null}
              <button type="button" role="menuitemradio" aria-checked={value === CLARITIA} className={row} onClick={() => pick(CLARITIA)}>
                <Mark k={null} />
                <span className="min-w-0 flex-1 truncate">Claritia</span>
                {value === CLARITIA ? <Ic n="check" s={13} /> : null}
              </button>
              <button type="button" role="menuitemradio" aria-checked={value === LEARN} className={row} onClick={() => pick(LEARN)}>
                <span className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-full border border-dashed border-line-strong text-muted">
                  <Ic n="plus" s={12} />
                </span>
                <span className="min-w-0 flex-1 truncate">Learn from a website</span>
              </button>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
