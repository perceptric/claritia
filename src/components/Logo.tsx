/** The Claritia mark: a check inside a viewfinder, in a rounded square, with the name in the serif. */
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="10" fill="var(--color-clay)" />
        <path d="M7 12V7h5M20 7h5v5M25 20v5h-5M12 25H7v-5" fill="none" stroke="var(--color-paper)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M11.5 16.5l3 3 6-7" fill="none" stroke="var(--color-paper)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {compact ? null : <span className="font-semibold tracking-[-0.02em] text-[17px] leading-none text-ink">Claritia</span>}
    </span>
  );
}
