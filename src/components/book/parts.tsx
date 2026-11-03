import { Monitor, MapIcon, Phone } from "@/components/Icons";
import type { GuestHost, GuestLocation } from "@/lib/meetings/guest";

// Small pieces the booking pages draw on the server and the calendar draws in the browser (no hooks, no state).

/** A host's photo or initials. Photos sit at the top of the card, so they load at once and decode off the main thread. */
export function Avatar({ host, size }: { host: GuestHost; size?: "lg" }) {
  const initials = host.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  const px = size === "lg" ? 64 : 40;
  // eslint-disable-next-line @next/next/no-img-element
  if (host.photo) return <img className={`cb-av ${size === "lg" ? "cb-lg" : ""}`} src={host.photo} alt="" width={px} height={px} decoding="async" referrerPolicy="no-referrer" />;
  return (
    <span className={`cb-av ${size === "lg" ? "cb-lg" : ""}`} aria-hidden="true">
      {initials || "?"}
    </span>
  );
}

export function LocationIcon({ kind, size = 16 }: { kind: GuestLocation["kind"]; size?: number }) {
  if (kind === "phone_guest" || kind === "phone_host") return <Phone size={size} />;
  if (kind === "in_person") return <MapIcon size={size} />;
  return <Monitor size={size} />;
}

export function hostLine(hosts: GuestHost[]): string {
  if (hosts.length <= 2) return hosts.map((h) => h.name).join(" and ");
  return `${hosts[0]!.name}, ${hosts[1]!.name} and ${hosts.length - 2} more`;
}
