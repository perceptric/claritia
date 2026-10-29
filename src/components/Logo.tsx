/** The Claritia mark: four corner brackets and a check on an emerald tile, with the name in Inter. */
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg width="24" height="24" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="6" fill="#0C8C5E" />
        <path d="M7 12V7h5M20 7h5v5M25 20v5h-5M12 25H7v-5" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M11.5 16.5l3 3 6-7" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {compact ? null : <span className="font-semibold tracking-[-0.03em] text-[16px] leading-none text-ink">Claritia</span>}
    </span>
  );
}
