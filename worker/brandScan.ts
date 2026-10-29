// Brand scans on the runner (docs/form-builder.md Part 5): the brand_scan job from the jobs queue. Scan the site, then
// one look check with Claude when the site has a form to compare with, then save the kit. A site that turns the
// browser away is reported on the kit and not tried again.

import type { SupabaseClient } from "@supabase/supabase-js";
import { cachedStep, hashKey, usageOf } from "../src/lib/ai/cache.ts";
import { applyFixes, drawForm, LOOK_MODEL, type Looker } from "../src/lib/brand/look.ts";
import { scanSite, ScanBlocked, type BrandExtras, type Scan } from "../src/lib/brand/scan.ts";
import { BRIEF_MODEL, type Brief, type Briefer } from "../src/lib/brand/brief.ts";
import { brandColors, brandDesign } from "../src/lib/brand/design.ts";
import type { Tokens } from "../src/lib/forms/brand.ts";
import { checkForm } from "../src/lib/forms/schema.ts";
import { TEMPLATES } from "../src/lib/forms/templates.ts";
import { JobError, type Job } from "../src/lib/jobs.ts";

export type ScanOpts = { chromiumPath?: string; looker?: Looker; briefer?: Briefer; formCode?: () => Promise<string | null>; allowPrivate?: boolean; scan?: typeof scanSite; log?: (...a: unknown[]) => void };

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
  let { tokens, notes } = scan;
  if (scan.formShot && o.looker && o.formCode) {
    try {
      const code = await o.formCode();
      const form = checkForm(TEMPLATES[1].form());
      if (code && "form" in form) {
        const ours = await drawForm(code, form.form, tokens, o.chromiumPath);
        const rpc = (fn: string, args: Record<string, unknown>) => sb.rpc(fn, args);
        const looked = await cachedStep(rpc, ws, "brand_look", hashKey(LOOK_MODEL, scan.formShot.toString("base64"), ours.toString("base64"), tokens), async () => {
          const r = await o.looker!(scan.formShot!, ours, tokens);
          return { result: r.fixes, model: LOOK_MODEL, usage: usageOf(r.usage) };
        });
        const fixed = applyFixes(tokens, looked.result);
        tokens = fixed.tokens;
        notes = [...notes, ...fixed.notes.filter((n) => !notes.includes(n))];
      }
    } catch (e) {
      // The look check only polishes; the scan stands without it.
      o.log?.(`Look check skipped: ${(e as Error).message}`);
    }
  }
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

/** The built form script from the app, for the look check. */
export const formCodeFrom = (appUrl: string) => async () => {
  try {
    const res = await fetch(`${appUrl.replace(/\/+$/, "")}/forms/v1.js`, { signal: AbortSignal.timeout(10_000) });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
};

