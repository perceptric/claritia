"use client";

// A tool's detail sheet on Settings › Integrations (a card is clicked): its state and buttons, the connect form when it
// needs typing, then what it is, what Claritia does with it, the access it gives, how it connects and where it's used
// (src/lib/sources/details.ts). This is the one place the page explains a tool; the cards stay a name and a line.

import type { ToolDetail } from "@/lib/sources/details";
import { Sheet } from "./Sheet";
import { ErrorNote } from "./ui";

function Part({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
      {children}
    </section>
  );
}

const Lines = ({ items }: { items: string[] }) => (
  <ul className="flex min-w-0 list-disc flex-col gap-1.5 pl-[18px] text-[13px] leading-[1.5] text-body marker:text-faint">
    {items.map((x, i) => (
      <li key={i} className="wrap-break-word">
        {x}
      </li>
    ))}
  </ul>
);

export function ToolSheet({
  name,
  logo,
  status,
  account,
  buttons,
  form,
  error = "",
  detail,
  onClose,
}: {
  name: string;
  logo: React.ReactNode;
  /** Connected, Error or Not connected. */
  status: React.ReactNode;
  account?: string | null;
  /** Connect, Reconnect, Webhook URL, Disconnect: the card's own. */
  buttons: React.ReactNode;
  /** The connect form, for a tool that can't connect without typing something. */
  form?: React.ReactNode;
  /** The page's error, shown here too while the sheet covers the page. */
  error?: string;
  detail: ToolDetail;
  onClose: () => void;
}) {
  return (
    <Sheet
      title={name}
      onClose={onClose}
      head={
        <div className="flex min-w-0 items-center gap-2.5">
          {logo}
          <h2 className="min-w-0 text-[16px] font-semibold tracking-[-0.02em] text-ink wrap-break-word">{name}</h2>
        </div>
      }
    >
      <div className="flex min-w-0 flex-col gap-6 p-5">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {status}
            {account ? (
              <span className="min-w-0 truncate font-mono text-[11.5px] text-faint" title={account}>
                {account}
              </span>
            ) : null}
          </div>
          <ErrorNote message={error} />
          {buttons ? <div className="flex min-w-0 flex-wrap items-center gap-2">{buttons}</div> : null}
          {form}
        </div>
        <Part title="What it is">
          <p className="text-[13px] leading-[1.55] text-body wrap-break-word">{detail.about}</p>
        </Part>
        <Part title="Permissions">
          <Lines items={detail.permissions} />
        </Part>
        <Part title="Use cases">
          <Lines items={detail.useCases} />
        </Part>
      </div>
    </Sheet>
  );
}
