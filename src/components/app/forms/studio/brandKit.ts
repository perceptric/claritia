// A workspace brand as the Studio reads it from brand_kits, and its logo as a picture address.

export type KitLite = { id: string; name?: string | null; source_url: string | null; scan_status: string | null; logo_url?: string | null; logo_svg?: string | null };

/** A brand's logo as a picture address: its https logo, or its SVG drawn as a picture (no scripts run in one). */
export const logoOf = (k: KitLite | null | undefined): string | null =>
  k?.logo_url && /^https:\/\//.test(k.logo_url) ? k.logo_url : k?.logo_svg && /^\s*<svg[\s>]/i.test(k.logo_svg) ? `data:image/svg+xml;utf8,${encodeURIComponent(k.logo_svg)}` : null;
