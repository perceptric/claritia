// Writes the email template library as JSON for the website (dev-arrowsterr/claritia-site,
// tools/email-templates.json), which turns it into /email-templates. Each template is built in a plain sample brand,
// merge tags shown as a reader sees them. Run:
//   node scripts/export-email-templates.ts > ../claritia-site/tools/email-templates.json
import { compileEmail } from "../src/lib/design/email/compile.ts";
import { EMAIL_TEMPLATES, TEMPLATE_FOLDERS } from "../src/lib/design/email/library.ts";
import { readSystem } from "../src/lib/design/model.ts";
import { DEFAULT_TOKENS } from "../src/lib/forms/brand.ts";

const filled = (html: string) => html.replace(/\{\{\s*([a-z_]+)\s*(?:\|([^}]*))?\}\}/g, (_m, k: string, f?: string) => (k === "company_address" ? "100 Main St, Austin, TX" : k === "unsubscribe_url" ? "#" : (f ?? "")));
const slug = (key: string) => key.replace(/_/g, "-");
const system = readSystem({}, DEFAULT_TOKENS);

const out = {
  folders: TEMPLATE_FOLDERS.map((f) => ({ name: f, slug: f.toLowerCase().replace(/[^a-z0-9]+/g, "-") })),
  templates: EMAIL_TEMPLATES.map((t) => {
    const doc = t.make();
    return { key: t.key, slug: slug(t.key), name: t.name, group: t.group, blurb: t.blurb ?? "", preheader: doc.settings.preheader ?? "", html: filled(compileEmail(system, doc, { tokens: DEFAULT_TOKENS, preview: true }).html) };
  }),
};
process.stdout.write(JSON.stringify(out));
