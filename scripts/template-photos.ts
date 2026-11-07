// Starter photos for the templates (docs/template-pictures-plan.md Part 3), CC0 photos through Openverse (no key, 200
// searches a day): StockSnap first, then the WordPress Photo Directory; Burst (Shopify's free photos) with BURST=1.
// Three steps:
//   node scripts/template-photos.ts search scripts/template-photos/leads.json
//     Searches each slot's words and keeps 8 options (leads.candidates.json), with a contact sheet per 40 slots
//     (SHEETS=dir, default the scratch folder) for a person to pick from.
//   node scripts/template-photos.ts fetch scripts/template-photos/leads.json
//     Downloads each picked option (leads.picks.json: { slot: { n, alt, focus? } }), keeps it at 1920 wide as JPEG
//     and at 640, 1280 and 1920 wide as WebP, without its metadata, in the website's assets/form-photos/
//     (SITE=../claritia-site), and writes the manifest: the Pexels id, the photographer, the page, the words.
//   node scripts/template-photos.ts apply scripts/template-photos/leads.json
//     Writes src/lib/forms/gallery/photos/<family>.ts: each template's welcome photo and picture cards.
// Burst's license: free for commercial use, no credit needed (check https://burst.shopify.com/licenses before each
// new batch); StockSnap's and the WordPress Photo Directory's are CC0. One search every 3.5 seconds (Openverse allows
// 20 a minute).
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type Slot = { slot: string; template: string; kind: "cover" | "card"; query: string; short?: string; layout?: "left" | "right" | "top" | "behind"; noFaces?: boolean; field?: string; option?: number };
type Option = { id: string; from: "burst" | "stocksnap" | "wordpress"; url: string; photographer: string; photographer_url: string; alt: string; src: string; thumb: string; width: number; height: number };
type Pick = { n: number; alt: string; focus?: string };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [step, planPath] = process.argv.slice(2);
if (!step || !planPath) throw new Error("Usage: template-photos.ts search|fetch|apply <plan.json>");
const plan = JSON.parse(readFileSync(planPath, "utf8")) as { family: string; slots: Slot[] };
const base = planPath.replace(/\.json$/, "");
const nameOf = (s: Slot) => `${s.template.replace(/[._]/g, "-")}-${s.kind === "cover" ? "welcome" : `${s.field!.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30)}-${s.option}`}`;

const wait = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const unesc = (x: string) => x.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

/** A page by curl (Shopify's site turns Node's own client away): its status and body. */
function curl(url: string): Promise<{ status: number; body: string }> {
  return new Promise((ok, no) =>
    execFile("curl", ["-sSL", "--max-time", "30", "-A", "Mozilla/5.0 (claritia template photos)", "-H", "Accept: text/html", "-w", "\n%{http_code}", url], { maxBuffer: 20 * 1024 * 1024 }, (err, out) => {
      if (err) return no(err);
      const at = out.lastIndexOf("\n");
      ok({ status: Number(out.slice(at + 1)), body: out.slice(0, at) });
    }),
  );
}

/** Burst's search page: each result's picture, its words and its page. */
async function burst(query: string, n: number): Promise<Option[]> {
  for (let i = 0; i < 5; i++) {
    const r = await curl(`https://www.shopify.com/stock-photos/photos/search?q=${encodeURIComponent(query)}`);
    if (r.status === 429 || r.status >= 500) {
      await wait(15000 * 2 ** i);
      continue;
    }
    if (r.status !== 200) throw new Error(`Burst ${r.status} for "${query}"`);
    const html = r.body;
    const seen = new Set<string>();
    const out: Option[] = [];
    for (const tag of html.match(/<img[^>]*>/g) ?? []) {
      const src = /(?:data-)?src="https:\/\/burst\.shopifycdn\.com\/photos\/([a-z0-9-]+)\.jpg/.exec(tag)?.[1];
      if (!src || seen.has(src)) continue;
      seen.add(src);
      const alt = unesc(/alt="([^"]*)"/.exec(tag)?.[1] ?? "");
      const file = `https://burst.shopifycdn.com/photos/${src}.jpg`;
      out.push({ id: src, url: `https://burst.shopify.com/photos/${src}`, photographer: "", photographer_url: "", alt, src: `${file}?width=2400&format=pjpg&exif=0&iptc=0`, thumb: `${file}?width=400&format=pjpg&exif=0&iptc=0`, width: 0, height: 0, from: "burst" });
      if (out.length >= n) break;
    }
    return out;
  }
  throw new Error(`Burst kept failing for "${query}"`);
}

/** CC0 photos through Openverse from one source (stocksnap: 960 wide; wordpress: the WordPress Photo Directory). */
async function openverse(query: string, n: number, source: "stocksnap" | "wordpress"): Promise<Option[]> {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&source=${source}&license=cc0&page_size=${n}`);
    if (r.status === 429) {
      const left = r.headers.get("x-ratelimit-available-anon_sustained");
      if (left === "0") throw new Error("Openverse's 200 searches a day are used up: run search again tomorrow, it picks up where it stopped.");
      await wait(20000 * 2 ** i);
      continue;
    }
    if (!r.ok) return [];
    const j = (await r.json()) as { results: { id: string; url: string; foreign_landing_url: string; creator?: string; creator_url?: string; title: string; width: number; height: number }[] };
    return j.results.map((x) => ({ id: x.id, url: x.foreign_landing_url, photographer: x.creator ?? "", photographer_url: x.creator_url ?? "", alt: x.title, src: x.url, thumb: x.url, width: x.width, height: x.height, from: source }));
  }
  return [];
}

if (step === "search") {
  const out: Record<string, Option[]> = existsSync(`${base}.candidates.json`) ? JSON.parse(readFileSync(`${base}.candidates.json`, "utf8")) : {};
  for (const s of plan.slots) {
    if ((out[s.slot]?.length ?? 0) >= 4) continue;
    // Burst is the best, but turns a client away after a few searches; BURST=1 tries it first.
    let got: Option[] = process.env.BURST ? await burst(s.query, 8).catch(() => []) : [];
    const more = async (q: string, src: "stocksnap" | "wordpress") => {
      if (got.length >= 4) return;
      await wait(3500);
      const ids = new Set(got.map((o) => o.id));
      got = [...got, ...(await openverse(q, 8, src)).filter((o) => !ids.has(o.id))].slice(0, 8);
    };
    // Openverse matches every word, so a long search often finds nothing: then the slot's short words.
    await more(s.query, "stocksnap");
    if (s.short) await more(s.short, "stocksnap");
    if (s.short) await more(s.short, "wordpress");
    out[s.slot] = got;
    writeFileSync(`${base}.candidates.json`, JSON.stringify(out, null, 1));
    console.log(`${s.slot}: ${out[s.slot]!.length}`);
  }
  // Contact sheets: 40 slots each, 8 numbered options a row.
  const dir = process.env.SHEETS ?? join(root, ".template-photos");
  mkdirSync(dir, { recursive: true });
  const pw = (await import("playwright-core")).default;
  const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  for (let i = 0; i < plan.slots.length; i += 40) {
    const rows = plan.slots.slice(i, i + 40).map((s) => `<div style="display:grid;grid-template-columns:180px repeat(8,1fr);gap:4px;align-items:center;margin-bottom:6px"><div style="font:11px sans-serif">${s.slot}<br><i>${s.query}</i></div>${(out[s.slot] ?? []).map((o, k) => `<div style="position:relative"><img src="${o.thumb}" style="width:100%;height:110px;object-fit:cover;display:block"><b style="position:absolute;top:2px;left:4px;background:#fff;font:12px sans-serif;padding:0 4px">${k}</b></div>`).join("")}</div>`);
    await page.setContent(`<body style="margin:8px">${rows.join("")}</body>`, { waitUntil: "networkidle" });
    await page.screenshot({ path: join(dir, `${plan.family}-${String(i / 40).padStart(2, "0")}.png`), fullPage: true });
  }
  await browser.close();
  console.log(`sheets in ${dir}`);
}

if (step === "fetch") {
  const cands = JSON.parse(readFileSync(`${base}.candidates.json`, "utf8")) as Record<string, Option[]>;
  const picks = JSON.parse(readFileSync(`${base}.picks.json`, "utf8")) as Record<string, Pick>;
  const site = process.env.SITE ?? join(root, "..", "claritia-site");
  const dir = join(site, "assets", "form-photos");
  mkdirSync(dir, { recursive: true });
  const sharp = (await import("sharp")).default;
  const manifestPath = join(dir, "manifest.json");
  const manifest: Record<string, unknown> = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};
  for (const s of plan.slots) {
    const p = picks[s.slot];
    const o = p ? cands[s.slot]?.[p.n] : undefined;
    if (!o) continue;
    const name = nameOf(s);
    if (existsSync(join(dir, `${name}.jpg`)) && (manifest[name] as { id?: string } | undefined)?.id === o.id) continue;
    const r = await fetch(o.src, { headers: { "user-agent": "Mozilla/5.0 (claritia template photos)" } });
    if (!r.ok) throw new Error(`download ${r.status} for ${s.slot}`);
    const raw = Buffer.from(await r.arrayBuffer());
    // rotate() applies the camera's turn; sharp drops the rest of the metadata (where it was taken) by default.
    await sharp(raw).rotate().resize({ width: 1920, withoutEnlargement: true }).jpeg({ quality: 78, mozjpeg: true }).toFile(join(dir, `${name}.jpg`));
    for (const w of [640, 1280, 1920]) await sharp(raw).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 76 }).toFile(join(dir, `${name}-${w}.webp`));
    manifest[name] = { from: o.from, id: o.id, page: o.url, photographer: o.photographer, photographer_url: o.photographer_url, alt: p!.alt, ...(p!.focus ? { focus: p!.focus } : {}), template: s.template, slot: s.slot };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
    console.log(`${name} (${o.id})`);
  }
}

if (step === "apply") {
  const picks = JSON.parse(readFileSync(`${base}.picks.json`, "utf8")) as Record<string, Pick>;
  const out: Record<string, { cover?: { name: string; alt: string; layout: string; focus?: string }; images?: Record<string, string[]> }> = {};
  for (const s of plan.slots) {
    const p = picks[s.slot];
    if (!p) continue;
    const t = (out[s.template] ??= {});
    if (s.kind === "cover") t.cover = { name: nameOf(s), alt: p.alt, layout: s.layout ?? "right", ...(p.focus ? { focus: p.focus } : {}) };
    else ((t.images ??= {})[s.field!] ??= [])[s.option!] = nameOf(s);
  }
  // A picture card set only when every answer has its photo.
  for (const t of Object.values(out)) for (const [k, v] of Object.entries(t.images ?? {})) if (v.some((x) => !x)) delete t.images![k];
  const file = join(root, "src", "lib", "forms", "gallery", "photos", `${plan.family}.ts`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `// The ${plan.family} templates' starter photos (docs/template-pictures-plan.md), written by scripts/template-photos.ts.\n// Each template's welcome photo and, by question, a photo per answer for picture cards.\nimport type { TemplatePhotos } from "./index.ts";\n\nexport const PHOTOS: TemplatePhotos = ${JSON.stringify(out, null, 2)};\n`);
  console.log(`${Object.keys(out).length} templates in ${file}`);
}
