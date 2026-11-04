// Where a fill came from (docs/sharing-plan.md, Channels): every way Share gives a form out tags its fills, with no UTM
// tags to type. The form script works it out (src/lib/forms/element.ts), the server keeps it with the fill as
// `channel` beside the UTM tags (src/lib/forms/submit.ts), and Submissions, routing, the CSV export and the tools a
// form sends rows to read it. Browser and server.

export const CHANNELS = ["link", "qr", "email", "personal", "inline", "full", "popup", "slider", "popover", "sidetab", "own"] as const;
export type Channel = (typeof CHANNELS)[number];

export const CHANNEL_LABEL: Record<Channel, string> = {
  link: "Link",
  qr: "QR code",
  email: "Email",
  personal: "Personal link",
  inline: "Website, in the page",
  full: "Website, full page",
  popup: "Website popup",
  slider: "Website slider",
  popover: "Website popover",
  sidetab: "Website side tab",
  own: "Your own form",
};

export const isChannel = (v: unknown): v is Channel => typeof v === "string" && (CHANNELS as readonly string[]).includes(v);
export const channelLabel = (v: unknown): string => (isChannel(v) ? CHANNEL_LABEL[v] : "");

/** The channels a link can carry as ?via= (a website embed says its own mode). */
export const VIA = ["link", "qr", "email", "personal"] as const;

/** A form link tagged with its channel. */
export function viaLink(url: string, via: (typeof VIA)[number]): string {
  try {
    const u = new URL(url);
    u.searchParams.set("via", via);
    return u.toString();
  } catch {
    return url;
  }
}
