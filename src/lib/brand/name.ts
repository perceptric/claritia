// A brand's name for the app's pickers and lists: the brand book's name when there is one, the kit's own name when
// it isn't just the site's address, else the site's name capitalized (perceptric.com → Perceptric).

export function brandName(k: { name?: string | null; source_url?: string | null; book?: { name?: string } | null } | null | undefined): string {
  const book = k?.book?.name?.trim();
  if (book) return book;
  const own = k?.name?.trim() ?? "";
  if (own && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(own)) return own;
  let host = own;
  try {
    if (k?.source_url) host = new URL(/^https?:\/\//.test(k.source_url) ? k.source_url : `https://${k.source_url}`).hostname;
  } catch {}
  const label = host.replace(/^www\./, "").split(".")[0] ?? "";
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : "Your brand";
}
