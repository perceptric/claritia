import { ChevronRight, Dollar, Users } from "@/components/Icons";
import { LOCATION_LABEL, lengthLabel, priceLabel, type GuestHost, type GuestType } from "@/lib/meetings/guest";
import { Avatar, LocationIcon } from "./parts";

// The team page's and a person's page's meeting types, as cards (docs/meetings-scheduler.md 1.8b).

/** The page's title in two tones: the title, then the line in gray. */
export function PageHead({ title, line, hosts, logo, big, welcome }: { title: string; line?: string | null; hosts?: GuestHost[]; logo?: string | null; big?: boolean; welcome?: string | null }) {
  return (
    <>
    <header className="cb-head">
      {hosts?.length ? <Avatar host={hosts[0]!} size={big ? "lg" : undefined} /> : null}
      <div className="cb-head-t">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {logo && <img className="cb-logo" src={logo} alt="" height={28} decoding="async" referrerPolicy="no-referrer" />}
        <h1 className="cb-two" style={{ fontSize: "1.9em" }}>
          {title}
          {line && <span className="cb-gray">{line}</span>}
        </h1>
      </div>
    </header>
    {welcome ? <p className="cb-muted cb-welcome">{welcome}</p> : null}
    </>
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
          <span className="cb-eyebrow">{t.lengths.map(lengthLabel).join(", ")}</span>
          <span className="cb-h" style={{ fontSize: "1.1em" }}>
            {t.name}
          </span>
          <span className="cb-chips cb-muted cb-small">
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
            <span>{t.hosts.length ? t.hosts.map((h) => h.name).slice(0, 3).join(", ") : ""}</span>
            <span className="cb-arr" aria-hidden="true">
              <ChevronRight size={15} />
            </span>
          </span>
        </a>
      ))}
    </div>
  );
}
