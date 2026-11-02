// The body of every Meetings tab: the same left edge as the tabs above it (20 px), full width, on desktop and phone.
// A tab never centers its own narrower column, so every page in Meetings starts in the same place
// (tests/meetingsFrame.test.ts checks it).

export const TAB_X = "px-5";

export function TabBody({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`flex w-full min-w-0 flex-col gap-4 ${TAB_X} pt-4 pb-8 ${className}`}>{children}</div>;
}

/** One row of a tab's controls: filters on the left, a count or switch on the right. Wraps on a phone. */
export function TabBar({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-9 flex-wrap items-center gap-2">{children}</div>;
}
