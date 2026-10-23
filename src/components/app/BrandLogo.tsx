"use client";

import { useState } from "react";

// A tool's logo, with its name for screen readers. Falls back to the first letter in a round tile.
export function BrandLogo({ domain, name, size = 20 }: { domain: string; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size };
  if (!domain || failed)
    return (
      <span role="img" aria-label={name} className="inline-flex shrink-0 items-center justify-center rounded-full bg-paper-deep font-medium text-ink" style={{ ...box, fontSize: Math.max(9, size * 0.45) }}>
        {name.slice(0, 1)}
      </span>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`} alt={name} width={size} height={size} className="shrink-0" style={box} onError={() => setFailed(true)} />
  );
}
