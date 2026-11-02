// New form's waiting state (docs/forms.md): a skeleton of a form (title, labels, boxes and the button in the brand's
// color) that shimmers, with one line on what's happening. `Working` is the small status line for the left side and
// over a form that's being changed. Motion stops under reduced motion (anim-shimmer).

import { AiMark } from "../../Ai";

export function PreviewLoading({ color, label }: { color?: string; label: string }) {
  return (
    <div className="flex w-[min(420px,calc(100vw-64px))] flex-col items-center gap-[18px]">
      <div aria-hidden="true" className="flex w-full flex-col gap-[14px] rounded-[10px] border border-line bg-card p-[24px]">
        <span className="anim-shimmer h-[18px] w-[55%] rounded-sm bg-paper-deep" />
        <span className="anim-shimmer h-[10px] w-[80%] rounded-sm bg-paper-deep" style={{ animationDelay: "120ms" }} />
        {[0, 1, 2].map((i) => (
          <span key={i} className="flex flex-col gap-[6px] pt-[4px]">
            <span className="anim-shimmer h-[9px] w-[30%] rounded-sm bg-paper-deep" style={{ animationDelay: `${240 + i * 120}ms` }} />
            <span className="anim-shimmer h-[34px] w-full rounded-sm border border-line bg-paper" style={{ animationDelay: `${240 + i * 120}ms` }} />
          </span>
        ))}
        <span className="anim-shimmer mt-[4px] h-[34px] w-[38%] rounded-full" style={{ background: color || "var(--color-ink)", opacity: 0.85, animationDelay: "600ms" }} />
      </div>
      <Working label={label} />
    </div>
  );
}

export function Working({ label }: { label: string }) {
  return (
    <span role="status" aria-label={label} className="inline-flex items-center gap-[8px] text-[13px] text-muted">
      <AiMark size={14} working />
      {label}
    </span>
  );
}
