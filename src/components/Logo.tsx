// The Claritia mark (the Slot): a green tile holding six time slots, one booked in solid white. Under 20px it draws
// four bigger slots so it stays clear. The same shapes are in claritia-site/assets/brand and in MARK_SVG below.

const GREEN = "#0C8C5E";
const SLOTS: [number, number][] = [[9, 10], [26, 10], [9, 20.5], [26, 20.5], [9, 31], [26, 31]];
const BOOKED = "26,20.5";
const SMALL: [number, number][] = [[4, 8], [18, 8], [4, 18], [18, 18]];
const SMALL_BOOKED = "18,18";

/** The mark as an SVG string, for HTML built outside React (Form Studio). */
export function markSvg(size: number, attrs = ""): string {
  if (size < 20)
    return `<svg ${attrs} width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8.5" fill="${GREEN}"/>${SMALL.map(([x, y]) => `<rect x="${x}" y="${y}" width="10" height="6" rx="3" fill="#fff"${`${x},${y}` === SMALL_BOOKED ? "" : ' fill-opacity=".35"'}/>`).join("")}</svg>`;
  return `<svg ${attrs} width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="13" fill="${GREEN}"/>${SLOTS.map(([x, y]) => `<rect x="${x}" y="${y}" width="13" height="7" rx="3.5" fill="#fff"${`${x},${y}` === BOOKED ? "" : ' fill-opacity=".32"'}/>`).join("")}</svg>`;
}

/** The mark alone: full color, never takes CSS color. */
export function Mark({ size = 24, className }: { size?: number; className?: string }) {
  if (size < 20)
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className={className}>
        <rect width="32" height="32" rx="8.5" fill={GREEN} />
        {SMALL.map(([x, y]) => (
          <rect key={`${x},${y}`} x={x} y={y} width="10" height="6" rx="3" fill="#fff" fillOpacity={`${x},${y}` === SMALL_BOOKED ? 1 : 0.35} />
        ))}
      </svg>
    );
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <rect width="48" height="48" rx="13" fill={GREEN} />
      {SLOTS.map(([x, y]) => (
        <rect key={`${x},${y}`} x={x} y={y} width="13" height="7" rx="3.5" fill="#fff" fillOpacity={`${x},${y}` === BOOKED ? 1 : 0.32} />
      ))}
    </svg>
  );
}

/** The mark with the name in Inter. `compact` drops the name; `nameClass` hides it at some widths (the folded sidebar). */
export function Logo({ compact = false, nameClass = "" }: { compact?: boolean; nameClass?: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-2">
      <Mark size={24} className="shrink-0" />
      {compact ? null : <span className={`font-semibold tracking-[-0.03em] text-[16px] leading-none whitespace-nowrap text-ink ${nameClass}`}>Claritia</span>}
    </span>
  );
}
