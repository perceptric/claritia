// Who runs Claritia and where the app lives, for the site header, footer and buttons. Change these in one place.
export const COMPANY = "Perceptric";
export const CONTACT_EMAIL = "hello@tryclaritia.com";
export const APP_URL = "https://app.tryclaritia.com";
export const INBOX_DOMAIN = "inbox.tryclaritia.com";
/** The site's host: workspace link subdomains sit under it (acme.tryclaritia.com). */
export const SITE_HOST = process.env.SITE_HOST?.trim() || "tryclaritia.com";
