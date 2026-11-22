// The send guard (docs/marketing-platform.md M3 "Sending pipeline", 9.1). The checks run inside the database, in
// send_claim (supabase/migrations/039_email.sql), with the message row locked, so nothing that changes between
// queueing and sending (an unsubscribe, a bounce, a pause) can slip past:
//   blocked: paused, domain not verified, suppressed, no contact, no lawful basis for the region, left the topic,
//            no postal address for the footer, frequency cap;
//   wait:    quiet hours in the contact's time zone, the daily limit, the per-second rate.

import type { Rpc } from "../jobs.ts";
import type { Claimed } from "./message.ts";

export type BlockReason = "paused" | "domain" | "suppressed" | "no_contact" | "no_basis" | "topic" | "frequency_cap" | "no_address" | "no_email";
export type Claim = Claimed | { action: "wait"; seconds: number; why: "quiet_hours" | "per_day" | "per_second" } | { action: "blocked"; reason: BlockReason } | { action: "skip" };

export const BLOCK_LABELS: Record<BlockReason, string> = {
  paused: "Sending paused",
  domain: "Domain not verified",
  suppressed: "Suppressed",
  no_contact: "No contact",
  no_basis: "No consent",
  topic: "Left the topic",
  frequency_cap: "Frequency cap",
  no_address: "No footer address",
  no_email: "Email deleted",
};

export async function claim(rpc: Rpc, messageId: string): Promise<Claim> {
  const { data, error } = await rpc("send_claim", { p_id: messageId });
  if (error) throw new Error(`send_claim: ${error.message}`);
  return data as Claim;
}
