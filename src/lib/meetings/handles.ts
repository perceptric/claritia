// Booking handles (docs/scheduling-plan.md 4.1): the short names in /booking/<handle>. The same rules as
// booking_handle_set in 081_booking_webhooks.sql, so the page can say what's wrong before saving. Runs anywhere.

export const RESERVED_HANDLES = new Set(["m", "p", "l", "t", "api", "app", "admin", "book", "booking", "embed", "new", "help", "support", "settings", "claritia", "www", "team", "login", "signup", "pay", "webhooks"]);

const SHAPE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

/** A handle as typed: lowercase, spaces and other marks become dashes. */
export const cleanHandle = (raw: string) => raw.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-{2,}/g, "-").slice(0, 40);

/** Why a handle can't be used, or null when its shape is fine (whether it's free is the database's call). */
export function handleProblem(h: string): string | null {
  if (!SHAPE.test(h)) return "Use 3 to 40 lowercase letters, numbers and dashes.";
  if (RESERVED_HANDLES.has(h)) return "That name is kept for Claritia.";
  return null;
}

/** Where booking links point: the site's short address (app.tryclaritia.com → tryclaritia.com), else this one. */
export function bookingOrigin(loc: { protocol: string; host: string; origin: string }): string {
  return loc.host.startsWith("app.") ? `${loc.protocol}//${loc.host.slice(4)}` : loc.origin;
}

/** The public addresses for a handle and one of its types. */
export const bookingUrl = (origin: string, handle: string, type?: string) => `${origin}/booking/${handle}${type ? `/${type}` : ""}`;
