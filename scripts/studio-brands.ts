// The weekly 30-brand test for Form Studio (docs/studio-v2-plan.md 6.7): for 30 real sites across the 12 industries,
// Tia reads the site's look and industry, then builds that industry's first form, and the form check runs on it. The
// goal is 9 in 10 builds with no errors. Needs ANTHROPIC_API_KEY (skipped without it). About $0.90 a brand.
//   node --conditions=react-server scripts/studio-brands.ts          (BRANDS=3 for a short run)

import Anthropic from "@anthropic-ai/sdk";
import { sourceText } from "../src/lib/brand/sourceSkin.ts";
import { checkStudioPage, errorsIn } from "../src/lib/studio/check.ts";
import { industryOf, readProfile, recipeText } from "../src/lib/studio/industries.ts";
import { BRAND_RULES, CHAT_RULES, STUDIO_MODEL } from "../src/lib/studio/prompts.ts";
import { readSite, readSource } from "../src/lib/studio/site.ts";

const SITES: [string, string][] = [
  ["saas", "linear.app"], ["saas", "notion.so"], ["saas", "stripe.com"],
  ["agency", "metalab.com"], ["agency", "instrument.com"],
  ["health", "onemedical.com"], ["health", "aspendental.com"], ["health", "forwardhealth.com"],
  ["legal", "legalzoom.com"], ["legal", "morganandmorgan.com"],
  ["realestate", "compass.com"], ["realestate", "redfin.com"],
  ["finance", "lemonade.com"], ["finance", "wealthfront.com"], ["finance", "sofi.com"],
  ["education", "khanacademy.org"], ["education", "coursera.org"],
  ["homeservices", "mrrooter.com"], ["homeservices", "angi.com"],
  ["events", "eventbrite.com"], ["events", "resy.com"],
  ["recruiting", "roberthalf.com"], ["recruiting", "randstad.com"],
  ["retail", "allbirds.com"], ["retail", "warbyparker.com"], ["retail", "glossier.com"],
  ["nonprofit", "charitywater.org"], ["nonprofit", "redcross.org"],
  ["saas", "figma.com"], ["general", "duolingo.com"],
];

const key = process.env.ANTHROPIC_API_KEY?.trim();
if (!key) {
  console.log("ANTHROPIC_API_KEY isn't set: skipped.");
  process.exit(0);
}
const c = new Anthropic({ apiKey: key, maxRetries: 2, timeout: 600_000 });
const tag = (t: string, n: string) => new RegExp(`<${n}>([\\s\\S]*?)</${n}>`).exec(t)?.[1]?.trim() ?? null;
async function opus(system: string, user: string, max: number): Promise<string> {
  const s = c.messages.stream({ model: STUDIO_MODEL, max_tokens: max, system, messages: [{ role: "user", content: user }] } as Anthropic.MessageCreateParamsStreaming);
  const m = await s.finalMessage();
  return m.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
}

const only = Number(process.env.BRANDS) || SITES.length;
const rows: { site: string; want: string; got: string; errors: string[]; warnings: number; note?: string }[] = [];
for (const [want, host] of SITES.slice(0, only)) {
  try {
    const look = await readSite(host);
    if ("error" in look) {
      rows.push({ site: host, want, got: "", errors: [], warnings: 0, note: look.error });
      continue;
    }
    const src = await readSource(look.url);
    const brandOut = await opus(BRAND_RULES, `BRAND: ${look.name} (${look.url})\n\n${(src ? sourceText({ ...src, colors: {} }) : `SITE ${look.url}\n(The page couldn't be read.)`).slice(0, 240_000)}`, 16000);
    const css = tag(brandOut, "brand_css") ?? "";
    const profile = readProfile(tag(brandOut, "profile"));
    const ask = industryOf(profile?.industry ?? want).forms[0]!;
    const ctx = `\n\n[NOTHING BUILT YET]\n[Brand: ${look.name} (${look.site}), confirmed. Its brand CSS follows; build only with it.]\n${recipeText(profile)}\n<brand_css>${css}</brand_css>\n[The form now]\n<form_html></form_html>\n<form_css></form_css>\n<after>{"kind":"thanks"}</after>\n[Meeting types (id: name)] none yet\nBuild it now without questions.`;
    const built = await opus(CHAT_RULES, `${ask}${ctx}`, 32000);
    const html = tag(built, "form_html") ?? "";
    const issues = html ? checkStudioPage({ html, after: { kind: "thanks" }, meetings: [], industry: profile?.industry ?? null }) : [{ level: "error" as const, code: "no-form", text: "Tia didn't build a form." }];
    rows.push({ site: host, want, got: profile?.industry ?? "?", errors: errorsIn(issues).map((i) => i.code), warnings: issues.length - errorsIn(issues).length });
  } catch (e) {
    rows.push({ site: host, want, got: "", errors: [], warnings: 0, note: (e as Error).message.slice(0, 120) });
  }
  const r = rows.at(-1)!;
  console.log(`${r.note ? "skip" : r.errors.length ? "FAIL" : "ok  "} ${r.site.padEnd(22)} ${r.want.padEnd(13)} read as ${r.got.padEnd(13)} ${r.errors.join(", ") || `${r.warnings} notes`}${r.note ? ` (${r.note})` : ""}`);
}
const ran = rows.filter((r) => !r.note);
const clean = ran.filter((r) => !r.errors.length).length;
const industry = ran.filter((r) => r.got === r.want).length;
console.log(`\n${clean} of ${ran.length} builds pass the check; ${industry} of ${ran.length} industries read right; ${rows.length - ran.length} sites couldn't be read.`);
if (ran.length && clean / ran.length < 0.9) process.exit(1);
