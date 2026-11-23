// segment_refresh on claritia-intel: bring a dynamic segment's members up to date (supabase/migrations/037_segments.sql).

import { JobError, type Handler, type Rpc } from "../../src/lib/jobs.ts";
import { isUuid } from "../../src/lib/uuid.ts";

export const segmentRefresh =
  (rpc: Rpc): Handler =>
  async (job) => {
    const id = String(job.payload.segment_id ?? "");
    if (!isUuid(id)) throw new JobError("segment_refresh needs a segment", { retry: false });
    const { error } = await rpc("segment_refresh", { p_id: id });
    if (error) throw new Error(`segment_refresh: ${error.message}`);
  };
