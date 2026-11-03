// Writes the form template catalog as JSON for the website (dev-arrowsterr/claritia-site, tools/templates.json),
// which turns it into /templates. Run: node scripts/export-templates.ts > ../claritia-site/tools/templates.json
import { industryLabel, templateSlug, templateTheme, TEMPLATES } from "../src/lib/forms/gallery/catalog.ts";
import { FONTS, fontsUrl, themeArt, themeVars, THEMES, type FontKey } from "../src/lib/forms/gallery/themes.ts";
import { INDUSTRIES, KIND_LABEL, USE_CASES } from "../src/lib/forms/gallery/types.ts";

const out = {
  industries: INDUSTRIES,
  useCases: USE_CASES,
  kinds: KIND_LABEL,
  fonts: fontsUrl(Object.keys(FONTS) as FontKey[]),
  themes: THEMES.map((th) => ({ id: th.id, name: th.name, mood: th.mood, layout: th.layout, dark: !!th.dark, pattern: th.pattern, input: th.input, shadow: th.shadow, swatch: [th.bg, th.card, th.accent], vars: themeVars(th), art: themeArt(th) })),
  templates: TEMPLATES.map((t) => ({
    id: t.id,
    slug: templateSlug(t),
    industry: t.industry,
    industryLabel: industryLabel(t.industry),
    tags: t.tags,
    name: t.name,
    blurb: t.blurb,
    featured: !!t.featured,
    theme: templateTheme(t),
    phi: !!t.phi,
    internal: !!t.internal,
    schema: t.schema,
  })),
};
process.stdout.write(JSON.stringify(out, null, 1) + "\n");
