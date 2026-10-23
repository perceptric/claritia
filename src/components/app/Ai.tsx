// How AI shows up in the app (docs/brand.md): a sparkle. The mark alone beside AI controls, a round avatar where AI
// speaks, a lilac "AI" tag on anything it made, and three dots while anything loads.

import { Sparkle } from "../Icons";

/** The sparkle. `working` makes it shimmer while AI writes. */
export function AiMark({ size = 16, working = false, className = "" }: { size?: number; working?: boolean; className?: string }) {
  return <Sparkle size={size} className={`text-lilac ${working ? "anim-shimmer" : ""} ${className}`} />;
}

/** The sparkle in a round lilac chip, where AI speaks in a chat. */
export function AiAvatar({ size = 28, working = false }: { size?: number; working?: boolean }) {
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-lilac-wash" style={{ width: size, height: size }}>
      <AiMark size={Math.round(size * 0.55)} working={working} />
    </span>
  );
}

/** A tag on anything AI made. */
export function AiTag() {
  return (
    <span className="inline-flex h-[22px] items-center gap-1 rounded-full bg-lilac-wash px-2 text-[11.5px] font-medium whitespace-nowrap text-lilac">
      <Sparkle size={12} />
      AI
    </span>
  );
}

/** Loading: three dots bouncing. */
export function Dots({ className = "" }: { className?: string }) {
  return (
    <span role="status" aria-label="Loading" className={`inline-flex items-center gap-1 ${className}`}>
      {[0, 1, 2].map((i) => (
        <span key={i} className="dot-bounce size-1.5 rounded-full bg-muted" style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </span>
  );
}
