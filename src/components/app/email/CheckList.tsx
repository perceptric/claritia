"use client";

// The design check's notes in a builder's rail (docs/design-system.md Part 7.4): each one picks what it's about.

import type { DesignNote } from "@/lib/design/check";
import { Badge } from "../ui";

export function CheckList({ notes, onPick }: { notes: DesignNote[]; onPick: (id: string | undefined) => void }) {
  if (!notes.length) return <p className="px-4 py-10 text-center text-[12.5px] text-muted">Nothing to fix</p>;
  return (
    <ul className="flex flex-col py-1">
      {notes.map((n, i) => (
        <li key={i}>
          <button type="button" onClick={() => onPick(n.id)} className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-hover">
            <Badge tone={n.level === "block" ? "red" : "amber"}>{n.level === "block" ? "Stops sends" : "Check"}</Badge>
            <span className="min-w-0 flex-1 text-[12.5px] leading-snug text-ink">{n.text}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
