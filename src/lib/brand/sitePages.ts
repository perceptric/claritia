// Reading a customer site's pages from their HTML (docs/brand-capture.md): the words, pictures and inner links of one
// page, and which of its pages are worth reading next.

/** The words, pictures and inner links of one page, from its HTML. */
export function readPage(html: string, base: string): { title: string; text: string; images: string[]; links: string[] } {
  const title = /<title[^>]*>([^<]{0,200})/i.exec(html)?.[1]?.trim() ?? "";
  const meta = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']{0,400})/i.exec(html)?.[1] ?? "";
  const og = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i.exec(html)?.[1];
  const body = html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#?\w+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const abs = (u: string) => {
    try {
      const x = new URL(u, base);
      return x.protocol === "https:" ? x.href : null;
    } catch {
      return null;
    }
  };
  const images = [og, ...[...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1])]
    .map((u) => (u ? abs(u) : null))
    .filter((u): u is string => !!u && !/\.svg($|\?)|logo|icon|sprite|pixel|tracking|1x1/i.test(u));
  const host = new URL(base).hostname;
  const links = [...html.matchAll(/<a[^>]+href=["']([^"'#]+)["']/gi)].map((m) => abs(m[1]!)).filter((u): u is string => !!u && new URL(u).hostname === host);
  return { title, text: `${meta} ${body}`.trim().slice(0, 8000), images: [...new Set(images)].slice(0, 12), links: [...new Set(links)] };
}

/** The pages worth reading after the home page: pricing, services, product, about, customers. */
export function pickPages(links: string[], max = 4): string[] {
  const rank = (u: string) => {
    const p = new URL(u).pathname.toLowerCase();
    if (p === "/" || p.length > 60) return 99;
    const order = [/pric|plan/, /service|solution|offer/, /product|feature|how/, /about|story|team/, /case|customer|review|testimonial/];
    const i = order.findIndex((re) => re.test(p));
    return i < 0 ? 99 : i;
  };
  return links
    .filter((u) => rank(u) < 99)
    .sort((a, b) => rank(a) - rank(b))
    .filter((u, i, all) => all.findIndex((x) => rank(x) === rank(u)) === i)
    .slice(0, max);
}
