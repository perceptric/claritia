// Writes the form template catalog as JSON for the website (dev-arrowsterr/claritia-site, tools/templates.json),
// which turns it into /templates. Run: node scripts/export-templates.ts > ../claritia-site/tools/templates.json
import { industryLabel, templateSlug, TEMPLATES } from "../src/lib/forms/catalog.ts";
import { INDUSTRIES, KIND_LABEL, USE_CASES } from "../src/lib/forms/types.ts";

const out = {
  industries: INDUSTRIES,
  useCases: USE_CASES,
  kinds: KIND_LABEL,
  templates: TEMPLATES.map((t) => ({
    id: t.id,
    slug: templateSlug(t),
    industry: t.industry,
    industryLabel: industryLabel(t.industry),
    tags: t.tags,
    name: t.name,
    blurb: t.blurb,
    featured: !!t.featured,
    phi: !!t.phi,
    internal: !!t.internal,
    schema: t.schema,
  })),
};
process.stdout.write(JSON.stringify(out, null, 1) + "\n");
