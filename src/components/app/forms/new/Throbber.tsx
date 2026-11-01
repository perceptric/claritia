// New form's waiting animation (docs/forms.md, Screen 1): seven dots in a ring, in the brand's main color. They chase
// each other around the ring, and every few laps one hops out, spins and drops back in. Stands still under reduced
// motion (globals.css, .thr-*).

export function Throbber({ color, label }: { color?: string; label: string }) {
  const dots = 7;
  const r = 26;
  return (
    <div role="status" aria-label={label} className="flex flex-col items-center gap-[14px]">
      <div className="thr-ring relative size-[72px]" style={{ color: color || "var(--color-ink)" }}>
        {Array.from({ length: dots }, (_, i) => {
          const a = (i / dots) * Math.PI * 2 - Math.PI / 2;
          const x = 36 + Math.cos(a) * r - 5;
          const y = 36 + Math.sin(a) * r - 5;
          return (
            <span key={i} className="absolute size-[10px]" style={{ left: x, top: y }}>
              <span className={`block size-full ${i === 0 ? "thr-hop" : ""}`}>
                <span className="thr-dot block size-full rounded-full bg-current" style={{ animationDelay: `${(i * 1.4) / dots}s` }} />
              </span>
            </span>
          );
        })}
      </div>
      <span className="text-[13px] text-muted">{label}</span>
    </div>
  );
}
