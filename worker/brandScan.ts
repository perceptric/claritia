// Brand scans on the runner (docs/form-builder.md Part 5): the brand_scan job from the jobs queue. Scan the site, then
// one look check with Claude when the site has a form to compare with, then save the kit. A site that turns the
// browser away is reported on the kit and not tried again.

import type { SupabaseClient } from "@supabase/supabase-js";
import { cachedStep, hashKey, usageOf } from "../src/lib/ai/cache.ts";
import { applyFixes, drawForm, LOOK_MODEL, type Looker } from "../src/lib/brand/look.ts";
import { scanSite, ScanBlocked, type Scan } from "../src/lib/brand/scan.ts";
import { checkForm } from "../src/lib/forms/schema.ts";
import { TEMPLATES } from "../src/lib/forms/templates.ts";
import { JobError, type Job } from "../src/lib/jobs.ts";

export type ScanOpts = { chromiumPath?: string; looker?: Looker; formCode?: () => Promise<string | null>; allowPrivate?: boolean; scan?: typeof scanSite; log?: (...a: unknown[]) => void };

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

