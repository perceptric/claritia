"use client";

import { useEffect } from "react";
import { fontsUrl, themeArt, themeById, themeVars, type Theme } from "@/lib/forms/themes";

// A form in its style (src/lib/forms/themes.ts): the page color or pattern, the card, and the drawing for cover and
// split styles. Hosted forms, the editor's preview, the template preview and gallery cards all sit in one.

const loaded = new Set<string>();

/** Loads a style's fonts once per page. */
export function useThemeFont(th: Theme) {
  useEffect(() => {
    const url = fontsUrl([th.font, th.head]);
    if (loaded.has(url) || (th.font === "inter" && th.head === "inter")) return;
    loaded.add(url);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = url;
    document.head.appendChild(link);
  }, [th]);
}

const artCache = new Map<string, string>();
function artUrl(th: Theme): string {
  if (!th.art) return "";
  if (!artCache.has(th.id)) artCache.set(th.id, `url("data:image/svg+xml;utf8,${encodeURIComponent(themeArt(th))}")`);
  return artCache.get(th.id)!;
}

export function ThemedFrame({
  theme,
  accent,
  size = "panel",
  children,
  className = "",
}: {
  theme?: string;
  accent?: string;
  /** page: a hosted form. panel: the editor and previews. thumb: a gallery card. bare: inside another site (embed). */
  size?: "page" | "panel" | "thumb" | "bare";
  children: React.ReactNode;
  className?: string;
}) {
  const th = themeById(theme);
  useThemeFont(th);
  const art = artUrl(th);
  return (
    <div
      className={`fth fth--${size} ${className}`}
      data-layout={th.layout}
      data-input={th.input}
      data-shadow={th.shadow}
      data-pattern={th.pattern}
      data-dark={th.dark ? "" : undefined}
      style={themeVars(th, accent) as React.CSSProperties}
    >
      <div className="fth__card">
        {art ? <div className="fart" aria-hidden="true" style={{ backgroundImage: art }} /> : null}
        <div className="fth__body">{children}</div>
      </div>
    </div>
  );
}
