// track_send on claritia-intel (docs/integrations-plan.md, Next step 2): one fill's (or its booking's) server event,
// to Meta's Conversions API and to Google Ads, as the form's Settings › Tracking asks. Each goes through the
// workspace's own connection. A hiccup (down, slow, rate limited) goes back to the jobs queue; a refusal that won't
// change is written to that connection's sync log and stops. Meta and Google drop a repeat by its event id and
// order id, so a retry after a timeout never counts twice.

import { JobError, type Handler, type Rpc } from "../../src/lib/jobs.ts";
import { adsDeveloperToken } from "../../src/lib/sources/ads.ts";
import { deps, type RunOpts } from "../../src/lib/sources/run.ts";
import { call } from "../../src/lib/sources/sync.ts";
import { RateLimited } from "../../src/lib/sources/types.ts";
import { adsConversion, metaEvent, sendAds, sendMeta, type SendOut, type TrackTake } from "../../src/lib/track/server.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type TrackDeps = Pick<RunOpts, "fetcher" | "sleep" | "refresh"> & { clean: RunOpts["clean"]; developerToken?: () => string };

/** One event, to each tool it goes to. Returns what each did; throws to try the whole event again later. */
export async function trackOnce(rpc: Rpc, d: TrackDeps, submission: string, event: "submit" | "booked", signal?: AbortSignal): Promise<{ meta?: SendOut; ads?: SendOut }> {
  const x = await call<TrackTake | null>(rpc, "track_take", { p_sub: submission });
  if (!x) return {};
  const out: { meta?: SendOut; ads?: SendOut } = {};
  const run: RunOpts = { rpc, clean: d.clean, fetcher: d.fetcher, sleep: d.sleep, refresh: d.refresh, signal };
  const log = (source: string, started: Date, r: SendOut) =>
    call(rpc, "source_run_log", { p_id: source, p_object: "conversions", p_direction: "out", p_started: started.toISOString(), p_counts: r.status === "done" ? { sent: 1 } : {}, p_error: r.status === "failed" ? r.error : null }).catch(() => undefined);

  if (x.track.meta && x.track.pixel) {
    if (!x.meta_source) out.meta = { status: "skipped", reason: "Connect Meta in Settings › Integrations." };
    else {
      const dep = await deps(run, x.meta_source);
      const started = new Date();
      out.meta = dep ? await sendMeta(dep.ctx, x.track.pixel, metaEvent(x, event)) : { status: "skipped", reason: "Connect Meta in Settings › Integrations." };
      if (dep) await log(x.meta_source, started, out.meta);
    }
  }
  if (event === "submit" && x.track.upload) {
    const conv = adsConversion(x);
    const token = (d.developerToken ?? adsDeveloperToken)();
    if (!conv) out.ads = { status: "skipped", reason: "No Google click id on this fill." };
    else if (!token) out.ads = { status: "skipped", reason: "Google Ads isn't set up on this server." };
    else if (!x.ads_source) out.ads = { status: "skipped", reason: "Connect Google Ads in Settings › Integrations." };
    else {
      const dep = await deps(run, x.ads_source);
      const started = new Date();
      out.ads = dep ? await sendAds(dep.ctx, x.track.upload.customer, conv, token, x.track.upload.login) : { status: "skipped", reason: "Connect Google Ads in Settings › Integrations." };
      if (dep) await log(x.ads_source, started, out.ads);
    }
  }
  return out;
}

export const trackSend =
  (rpc: Rpc, d: TrackDeps): Handler =>
  async (job, signal) => {
    const id = String(job.payload.submission ?? "");
    const event = job.payload.event === "booked" ? "booked" : "submit";
    if (!UUID.test(id)) throw new JobError("track_send needs a submission", { retry: false });
    try {
      await trackOnce(rpc, d, id, event, signal);
    } catch (e) {
      // Both tools drop repeats, so trying the whole event again is safe.
      throw new JobError((e as Error).message.slice(0, 300), { retryAfterS: e instanceof RateLimited ? e.retryAfterS : undefined });
    }
  };
