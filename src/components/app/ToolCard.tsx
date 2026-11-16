// A tool on Settings › Integrations (and Stripe in Payments), laid out like an app store card. With `onOpen`, the
// whole card opens the tool's detail sheet: a button laid over the card, so Enter and Space work and the focus ring
// follows the card. The card's own buttons sit above that layer and never open the sheet.

/** One tool: its logo on top, its name and what it does, its state at the top right, and its buttons at the bottom. */
export function ToolCard({
  logo,
  name,
  blurb,
  account,
  status,
  onOpen,
  children,
}: {
  logo: React.ReactNode;
  name: string;
  blurb: string;
  account?: string | null;
  status?: React.ReactNode;
  onOpen?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className={`relative flex min-w-0 flex-col gap-3 rounded-xl bg-card p-5 text-[13px] shadow-rest ${onOpen ? "transition-shadow duration-[150ms] ease-out hover:shadow-hover" : ""}`}>
      {onOpen ? <button type="button" aria-label={`About ${name}`} onClick={onOpen} className="absolute inset-0 cursor-pointer rounded-xl focus-visible:shadow-focus" /> : null}
      <div className="pointer-events-none relative flex min-w-0 items-start justify-between gap-2">
        {logo}
        {status}
      </div>
      <div className="pointer-events-none relative flex min-w-0 flex-col gap-1">
        <span className="text-[15px] font-semibold text-ink wrap-break-word">{name}</span>
        <span className="leading-snug text-muted">{blurb}</span>
        {account ? (
          <span className="truncate font-mono text-[11px] text-faint" title={account}>
            {account}
          </span>
        ) : null}
      </div>
      {children ? <div className="pointer-events-none relative z-10 mt-auto flex min-w-0 flex-wrap items-center gap-2 pt-1 [&>*]:pointer-events-auto">{children}</div> : null}
    </div>
  );
}
