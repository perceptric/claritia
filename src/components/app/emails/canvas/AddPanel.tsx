"use client";

// The + panel's tiles (docs/email-canvas-b4.md section 7): every block, column layouts and the brand's components. A
// click (or Enter) adds one where the page says; pressing and dragging a tile drops it on any email. They sit in the
// Add tab of the canvas's left panel (LeftPanel.tsx).

import type { BlockType } from "@/lib/design/email/parts";
import { AlignLeft, CalendarIcon, CircleDot, Code, Columns, Footer, Globe, ImageIcon, Layers, ListIcon, LogoIcon, Minus, QuoteIcon, Spacer, Star, TypeIcon, User, Video } from "../../../Icons";

export type AddItem =
  | { kind: "block"; key: string; label: string; type: BlockType }
  | { kind: "columns"; key: string; label: string; widths: number[] }
  | { kind: "component"; key: string; label: string; componentId: string };

type Icon = (p: { size?: number; className?: string }) => React.ReactNode;
const block = (type: BlockType, label: string): AddItem => ({ kind: "block", key: type, label, type });
export const BASICS: AddItem[] = [block("heading", "Heading"), block("text", "Text"), block("button", "Button"), block("image", "Image"), block("list", "List"), block("quote", "Quote"), block("divider", "Divider"), block("spacer", "Spacer")];
export const COLUMNS: AddItem[] = [
  { kind: "columns", key: "c2", label: "2 columns", widths: [50, 50] },
  { kind: "columns", key: "c3", label: "3 columns", widths: [33, 34, 33] },
  { kind: "columns", key: "c12", label: "1:2", widths: [33, 67] },
  { kind: "columns", key: "c21", label: "2:1", widths: [67, 33] },
];
export const MORE: AddItem[] = [block("logo", "Logo"), block("social", "Social links"), block("video", "Video"), block("product", "Product"), block("event", "Event"), block("meeting", "Meeting link"), block("signature", "Signature"), block("footer", "Footer"), block("html", "HTML")];
const ICON: Record<string, Icon> = {
  heading: TypeIcon,
  text: AlignLeft,
  button: CircleDot,
  image: ImageIcon,
  list: ListIcon,
  quote: QuoteIcon,
  divider: Minus,
  spacer: Spacer,
  logo: LogoIcon,
  social: Globe,
  video: Video,
  product: Star,
  event: CalendarIcon,
  meeting: CalendarIcon,
  signature: User,
  footer: Footer,
  html: Code,
};

/** The tiles of the Add tab (docs/email-canvas-b4.md section 7). */
export function AddTiles({ components, onAdd, onPress }: { components: { id: string; name: string }[]; onAdd: (item: AddItem) => void; onPress: (item: AddItem, e: React.PointerEvent) => void }) {
  const group = (title: string, items: AddItem[]) => (
    <section className="flex flex-col gap-2">
      <h3 className="text-[12px] text-muted">{title}</h3>
      <div className="grid grid-cols-2 gap-2">
        {items.map((it) => {
          const Ico: Icon = it.kind === "block" ? (ICON[it.type] ?? AlignLeft) : it.kind === "columns" ? Columns : Layers;
          return (
            <button
              key={it.key}
              type="button"
              data-add={it.key}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                onPress(it, e);
              }}
              // Mouse clicks come through onPress (a press without a drag); Enter and Space come here.
              onClick={(e) => e.detail === 0 && onAdd(it)}
              className="flex min-h-[72px] min-w-0 cursor-grab flex-col items-center justify-center gap-1.5 rounded-[10px] bg-card px-2 py-2 text-center shadow-rest outline-none transition-colors duration-[140ms] hover:bg-hover focus-visible:shadow-focus"
            >
              <Ico size={18} className="text-body" />
              <span className="min-w-0 text-[12.5px] leading-tight break-words text-ink">{it.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-3 pb-4">
      {group("Basics", BASICS)}
      {group("Columns", COLUMNS)}
      {group("More", MORE)}
      {components.length ? group("Components", components.map((c) => ({ kind: "component" as const, key: `cmp:${c.id}`, label: c.name, componentId: c.id }))) : null}
    </div>
  );
}
