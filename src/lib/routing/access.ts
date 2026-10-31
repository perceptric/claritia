// Who may do what in Routing (docs/routing-workflow.md Section 20), mapped onto Claritia's two workspace roles. There
// is no parallel permission system: a workspace owner is the spec's Admin; a member is a Rep. The spec's scoped
// manager has no role here yet, so its "if granted" rows fall to the owner, except one explicit grant an owner makes
// in the policy itself: the review owner they name may act on that policy's review items (approve, run the child
// attempt, dismiss, reopen). Every new action checks here on the server; a hidden button is never the check.

export type Role = "owner" | "member";
export type Who = { user: string; role: Role };

export type Capability =
  | "view"
  | "test"
  | "handoff"
  | "edit_policy"
  | "publish"
  | "team"
  | "member_settings"
  | "own_status"
  | "review"
  | "reassign"
  | "override"
  | "recover";

/** The Section 20 table for Claritia's roles. `review` is decided per item by mayReview. */
const TABLE: Record<Capability, Role[]> = {
  view: ["owner", "member"],
  test: ["owner", "member"],
  handoff: ["owner", "member"],
  edit_policy: ["owner"],
  publish: ["owner"],
  team: ["owner"],
  member_settings: ["owner"],
  own_status: ["owner", "member"],
  review: ["owner"],
  reassign: ["owner"],
  override: ["owner"],
  // Retry a CRM sync, check the calendar for an unknown outcome, resume a booking: the run's owner or an owner.
  recover: ["owner"],
};

export const may = (w: Who, cap: Capability): boolean => TABLE[cap].includes(w.role);

/** A review item's actions: a workspace owner, or the reviewer an owner named for it (the policy's review owner). */
export const mayReview = (w: Who, item: { reviewer: string | null }): boolean => may(w, "review") || (!!item.reviewer && item.reviewer === w.user);

/** Recovering one run's failed step: an owner, or the person the run assigned the lead to. */
export const mayRecover = (w: Who, run: { owner: string | null }): boolean => may(w, "recover") || (!!run.owner && run.owner === w.user);

/** A member hands off their own leads and leads with no owner; an owner hands off any lead in the workspace. */
export const mayHandOff = (w: Who, contactOwner: string | null): boolean => w.role === "owner" || !contactOwner || contactOwner === w.user;

export const DENIED: Record<Capability, string> = {
  view: "You can't see this.",
  test: "You can't run tests here.",
  handoff: "You can hand off your own leads, or leads with no owner.",
  edit_policy: "Only workspace owners can change routing.",
  publish: "Only workspace owners can publish.",
  team: "Only workspace owners can change teams.",
  member_settings: "Only workspace owners can change someone else's routing settings.",
  own_status: "You can't change this.",
  review: "Only workspace owners and the item's reviewer can act on it.",
  reassign: "Only workspace owners can reassign leads.",
  override: "Only workspace owners can choose another recipient.",
  recover: "Only workspace owners and the lead's owner can do this.",
};
