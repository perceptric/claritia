// Routing's state vocabulary (docs/routing-workflow.md Section 4): assignment, booking, external sync and review are
// separate dimensions, never one status that has to mean both "assigned" and "booked". The database checks the same
// lists (095_routing_policies.sql). Runs in the browser and on the server.

export const ASSIGNMENT_STATES = ["pending", "held_for_review", "assigned", "unassigned_needs_review", "excluded", "failed"] as const;
export type AssignmentState = (typeof ASSIGNMENT_STATES)[number];

export const BOOKING_STATES = ["not_requested", "awaiting_selection", "pending_confirmation", "confirmed", "unavailable", "abandoned", "cancelled", "failed"] as const;
export type BookingState = (typeof BOOKING_STATES)[number];

export const SYNC_STATES = ["not_required", "pending", "complete", "failed"] as const;
export type SyncState = (typeof SYNC_STATES)[number];

export const REVIEW_STATES = ["open", "approved_pending_execution", "in_progress", "resolved", "dismissed"] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];

/** Why a booking couldn't be offered, kept apart (Section 15): a failed read is never "no free times". */
export const AVAILABILITY_FAILURES = ["no_slots", "calendar_disconnected", "permission_error", "timeout", "unknown"] as const;
export type AvailabilityFailure = (typeof AVAILABILITY_FAILURES)[number];

/** Policy state as the Policies list shows it (Section 4). */
export type PolicyState = "new_draft" | "published" | "published_with_edits" | "published_disconnected" | "archived";

/** A source connection's outcome (Section 8). */
export type Outcome = "assign_only" | "assign_and_calendar";

/** The typed error contract (Section 21): a stable code, a readable message, and whether trying again can help. */
export const ERROR_CODES = [
  "invalid_configuration",
  "draft_conflict",
  "source_mapping_mismatch",
  "no_eligible_recipient",
  "ownership_changed",
  "slot_unavailable",
  "calendar_disconnected",
  "booking_outcome_unknown",
  "sync_failed",
  "permission_denied",
  "not_found",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export type RoutingError = { code: ErrorCode; message: string; field?: string; retryable: boolean; operationId?: string; state?: unknown };

export class RoutingFailure extends Error {
  readonly error: RoutingError;
  constructor(e: RoutingError) {
    super(e.message);
    this.error = e;
  }
}

export const failure = (code: ErrorCode, message: string, o: Partial<Omit<RoutingError, "code" | "message">> = {}) =>
  new RoutingFailure({ code, message, retryable: o.retryable ?? (code === "draft_conflict" || code === "ownership_changed" || code === "booking_outcome_unknown" || code === "sync_failed"), ...o });

/** The tester's required footer (Section 16). Never shown on real Activity records. */
export const PREVIEW_FOOTER = "Preview only. No contacts, assignments, queue turns, tasks, or meetings changed.";

/** The public visitor's messages (Section 13). A workspace may word them its own way; their meaning must match the state. */
export const VISITOR = {
  assigned: "Thanks — we've received your request.",
  noSlots: "Thanks — your rep will contact you to arrange a time.",
  slow: "Your details are saved. We're finishing your request.",
  taken: "That time was just taken. Please choose another.",
  unknown: "We're confirming your meeting. Please keep this page open.",
} as const;
