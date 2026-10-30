"use client";

import { useMemo } from "react";
import { Calendar, type BookingCalendarProps } from "./Calendar";
import { KitFrame, kitLook } from "./kit";

// The booking calendar with its own look, for the type editor's preview (src/components/app/meetings). The booking
// pages draw the look on the server (BookShell) and use Calendar (./Calendar.tsx) directly.

export * from "./Calendar";
export { Avatar, hostLine, LocationIcon } from "./parts";

/** Wraps children in the kit's variables and the booking styles (worked out again only when the kit changes). */
export function KitScope({ tokens, design, vars, className, children }: { tokens?: Record<string, unknown> | null; design?: unknown; vars?: Record<string, string>; className?: string; children: React.ReactNode }) {
  const look = useMemo(() => kitLook(tokens, design), [tokens, design]);
  return (
    <KitFrame look={look} vars={vars} className={className}>
      {children}
    </KitFrame>
  );
}

/** The calendar; with `tokens` it brings its own kit look and card (the type editor's preview). */
export function BookingCalendar(p: BookingCalendarProps) {
  if (p.tokens === undefined) return <Calendar {...p} />;
  return (
    <KitScope tokens={p.tokens}>
      <div className="cb-card">
        <Calendar {...p} />
      </div>
    </KitScope>
  );
}
