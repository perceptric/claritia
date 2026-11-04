// Brand scans on the runner (docs/form-builder.md Part 5): the brand_scan job from the jobs queue. Scan the site, save
// the kit's colors, fonts and logo (for booking pages and emails), then its brief and design draft. A site that turns
// the browser away is reported on the kit and not tried again. Forms take their look from the brand's Form Studio
// stylesheet (src/lib/studio/site.ts), never from the scan.

import type { SupabaseClient } from "@supabase/supabase-js";
import { cachedStep, hashKey, usageOf } from "../src/lib/ai/cache.ts";
import { scanSite, ScanBlocked, type BrandExtras, type Scan } from "../src/lib/brand/scan.ts";
import { BRIEF_MODEL, type Brief, type Briefer } from "../src/lib/brand/brief.ts";
import { brandColors, brandDesign } from "../src/lib/brand/design.ts";
import type { Tokens } from "../src/lib/forms/brand.ts";
import { JobError, type Job } from "../src/lib/jobs.ts";

export type ScanOpts = { chromiumPath?: string; briefer?: Briefer; allowPrivate?: boolean; scan?: typeof scanSite; log?: (...a: unknown[]) => void };

export async function handleBrandScan(sb: SupabaseClient, job: Job, o: ScanOpts) {
  const kit = String(job.payload.kit_id ?? "");
  const url = String(job.payload.url ?? "");
  const ws = job.workspace_id;
  if (!/^[0-9a-f-]{36}$/.test(kit) || !ws) throw new JobError("brand_scan needs a kit", { retry: false });
  const finish = async (s: Pick<Scan, "tokens" | "logo" | "notes" | "forms"> | null, error: string | null) => {
    const { error: e } = await sb.rpc("brand_scan_finish", { p_kit: kit, p_tokens: s?.tokens ?? {}, p_logo_url: s?.logo ?? null, p_notes: s?.notes ?? [], p_site_forms: s?.forms ?? [], p_error: error });
    if (e) throw new Error(e.message);
  };
  let scan: Scan;
  try {
    scan = await (o.scan ?? scanSite)(url, { chromiumPath: o.chromiumPath, allowPrivate: o.allowPrivate });
  } catch (e) {
    if (e instanceof ScanBlocked) {
      await finish(null, e.message);
      return;
    }
    if (job.attempts >= job.max_attempts) {
      await finish(null, "The scan didn't finish. Set the colors and font in Design.");
      return;
    }
    throw e;
  }
  const { tokens, notes } = scan;
  await finish({ tokens, logo: scan.logo, notes: notes.slice(0, 20), forms: scan.forms }, null);
  if (scan.brand) await brandSetup(sb, ws, kit, url, scan.brand, tokens, o);
}

/**
 * Brand setup (docs/design-system.md Part 7.1): the brief and color names from Claude (once per site, through the
 * step cache), then the brand's colors, heading sizes and shadow into the kit's design system draft, and its social
 * links and address onto the kit. Only polishes: the scan stands without it.
 */
async function brandSetup(sb: SupabaseClient, ws: string, kit: string, url: string, brand: BrandExtras, tokens: Tokens, o: ScanOpts) {
  try {
    const colors = brandColors(brand, tokens);
    let brief: Brief = { brief: "", colors: [] };
    if (o.briefer && brand.copy.trim()) {
      const rpc = (fn: string, args: Record<string, unknown>) => sb.rpc(fn, args);
      brief = (
        await cachedStep(rpc, ws, "brand_brief", hashKey(BRIEF_MODEL, url, brand.copy, colors), async () => {
          const r = await o.briefer!({ url, copy: brand.copy, colors });
          return { result: r.brief, model: BRIEF_MODEL, usage: usageOf(r.usage), keep: !!r.brief.brief };
        })
      ).result;
    }
    const design = brandDesign(brand, tokens, brief.colors);
    // Merged in the database, so a person editing the styles at the same time loses nothing.
    const { error } = await sb.rpc("brand_scan_design", { p_kit: kit, p_vars: design.variables, p_heading: design.email.heading ?? null, p_social: design.social, p_address: design.address, p_brief: brief.brief || null });
    if (error) throw new Error(error.message);
  } catch (e) {
    o.log?.(`Brand setup skipped: ${(e as Error).message}`);
  }
}
