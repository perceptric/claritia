import { ChevronRight, Clock, Dollar, Users } from "@/components/Icons";
import { LOCATION_LABEL, lengthLabel, priceLabel, type GuestHost, type GuestType } from "@/lib/meetings/guest";
import { Avatar, LocationIcon } from "./BookingCalendar";

// The team page's and a person's page's meeting types, as cards (docs/meetings-scheduler.md 1.8b).

export function PageHead({ title, line, hosts, logo, big }: { title: string; line?: string | null; hosts?: GuestHost[]; logo?: string | null; big?: boolean }) {
  return (
    <header className="cb-head">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {logo && <img className="cb-logo" src={logo} alt="" referrerPolicy="no-referrer" />}
      {hosts?.length ? (
        <span className="cb-stack">
          {hosts.slice(0, 1).map((h, i) => (
            <Avatar key={i} host={h} size={big ? "lg" : undefined} />
          ))}
        </span>
      ) : null}
      <h1 className="cb-h" style={{ fontSize: "1.6em" }}>
        {title}
      </h1>
      {line && (
        <p className="cb-muted" style={{ margin: 0, maxWidth: 520 }}>
          {line}
        </p>
      )}
    </header>
  );
}

export function TypeCards({ types }: { types: { href: string; type: GuestType }[] }) {
  if (!types.length)
    return (
      <div className="cb-empty">
        <span className="cb-muted">No meeting types to book yet.</span>
      </div>
    );
  return (
    <div className="cb-types">
      {types.map(({ href, type: t }) => (
        <a key={href} href={href} className="cb-type">
          <span className="cb-h" style={{ fontSize: "1.1em" }}>
            {t.name}
          </span>
          <span className="cb-chips cb-muted cb-small">
            <span className="cb-tag">
              <Clock size={13} />
              {t.lengths.map(lengthLabel).join(", ")}
            </span>
            <span className="cb-tag">
              <LocationIcon kind={t.location.kind} size={13} />
              {LOCATION_LABEL[t.location.kind]}
            </span>
            {t.price && (
              <span className="cb-tag">
                <Dollar size={13} />
                {priceLabel(t.price)}
              </span>
            )}
            {t.seats !== null && t.seats > 1 && (
              <span className="cb-tag">
                <Users size={13} />
                Group
              </span>
            )}
          </span>
          <span className="cb-go cb-small">
            {t.hosts.length ? t.hosts.map((h) => h.name).slice(0, 3).join(", ") : "Book"}
            <ChevronRight size={16} />
          </span>
        </a>
      ))}
    </div>
  );
}
