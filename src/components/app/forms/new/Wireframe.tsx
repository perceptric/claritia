// The rough sketch, drawn (docs/forms.md, Screen 2): each page as a card with its number and title, a gray bar for
// each question and the button in the brand's color. One card for a one-page form.

import type { Plan } from "@/lib/forms/specAi";

export function Wireframe({ plan, accent, background }: { plan: Plan; accent?: string; background?: string }) {
  return (
    <div className="flex w-full max-w-[880px] flex-wrap items-start justify-center gap-[16px]">
      {plan.steps.map((s, i) => (
        <div key={i} className="anim-rise-sm flex w-[248px] flex-col gap-[10px] rounded-[10px] border border-line-strong p-[18px]" style={{ background: background || "var(--color-card)", animationDelay: `${i * 80}ms` }}>
          <div className="flex items-center gap-[8px]">
            {plan.steps.length > 1 ? <span className="inline-flex size-[20px] shrink-0 items-center justify-center rounded-full bg-paper-deep text-[11px] text-muted tabular-nums">{i + 1}</span> : null}
            <b className="min-w-0 truncate text-[13px] font-semibold text-ink">{s.title || plan.name}</b>
          </div>
          {s.items.map((item, j) => (
            <div key={j} className="flex flex-col gap-[5px]">
              <span className="truncate text-[11.5px] text-muted">{item}</span>
              <span className="h-[22px] rounded-sm border border-line-strong" />
            </div>
          ))}
          <span className="mt-[4px] h-[26px] w-[96px] rounded-full" style={{ background: accent || "var(--color-ink)" }} />
        </div>
      ))}
    </div>
  );
}
