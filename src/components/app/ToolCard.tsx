// A tool on Settings › Integrations (and Stripe in Payments), laid out like an app store card.

/** One tool: its logo on top, its name and what it does, its state at the top right, and its buttons at the bottom. */
export function ToolCard({ logo, name, blurb, account, status, children }: { logo: React.ReactNode; name: string; blurb: string; account?: string | null; status?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-xl bg-card p-5 text-[13px] shadow-rest">
      <div className="flex min-w-0 items-start justify-between gap-2">
        {logo}
        {status}
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[15px] font-semibold text-ink wrap-break-word">{name}</span>
        <span className="leading-snug text-muted">{blurb}</span>
        {account ? <span className="truncate font-mono text-[11px] text-faint" title={account}>{account}</span> : null}
      </div>
      {children ? <div className="mt-auto flex min-w-0 flex-wrap items-center gap-2 pt-1">{children}</div> : null}
    </div>
  );
}
