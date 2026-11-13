// The answers a form fill already gave to a meeting's questions (src/lib/meetings/known.ts), read on the server for a
// booking page reached from that fill. Nothing comes back when it can't be read: the guest answers on the page.

import type { Rpc } from "../jobs.ts";
import type { GuestLocation, Question } from "./guest.ts";
import { knownAnswers, type FillAnswer } from "./known.ts";

export async function fillKnown(rpc: Rpc, submission: string, questions: Question[], location?: GuestLocation): Promise<Record<string, string>> {
  try {
    const r = await rpc("fill_answers", { p_submission: submission });
    if (r.error || !Array.isArray(r.data)) return {};
    return knownAnswers(questions, r.data as FillAnswer[], location);
  } catch {
    return {};
  }
}
