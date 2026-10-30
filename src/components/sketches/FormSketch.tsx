// The Forms first screen's drawing (docs/brand.md, "Drawings"): a form card with two fields and its button, held in
// the corner bracket from the mark.

export function FormSketch({ size = 160 }: { size?: number }) {
  return (
    <svg viewBox="0 0 160 120" width={size} height={(size * 120) / 160} aria-hidden="true" className="shrink-0 text-ink">
      <rect x="34" y="12" width="92" height="96" rx="10" fill="var(--color-card)" stroke="var(--color-line-strong)" />
      <rect x="48" y="30" width="50" height="6" rx="3" fill="var(--color-line-strong)" />
      <rect x="48" y="46" width="64" height="12" rx="4" fill="none" stroke="var(--color-line-strong)" />
      <rect x="48" y="64" width="64" height="12" rx="4" fill="none" stroke="var(--color-line-strong)" />
      <rect x="48" y="86" width="34" height="12" rx="6" fill="currentColor" />
      <path d="M26 22V8h14M134 98v14h-14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
