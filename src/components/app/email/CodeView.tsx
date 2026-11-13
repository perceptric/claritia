"use client";

// The whole email as HTML (the Brew comparison, step 3): what goes out, built with the same styles the builder shows,
// to read, copy or save as a file for another email tool. Opens over the builder.

import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { X } from "../../Icons";
import { copyText } from "../CopyButton";
import { tell } from "../Dialogs";
import { Button, IconButton } from "../ui";

export function CodeView({
  html,
  name,
  onClose,
}: {
  html: string;
  name: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  const kb = Math.round(new TextEncoder().encode(html).length / 1024);
  const url = useMemo(
    () => URL.createObjectURL(new Blob([html], { type: "text/html" })),
    [html],
  );
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const file = `${
    (name || "email")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "email"
  }.html`;
  const node = (
    <>
      <div
        className="anim-fade fixed inset-0 z-[94] bg-scrim"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="HTML code"
        className="anim-rise-sm fixed inset-x-2 top-1/2 z-[95] mx-auto flex max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-[860px] -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-card shadow-float"
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3.5">
          <h2 className="min-w-0 flex-1 text-[15px] font-medium text-ink">
            HTML code
          </h2>
          <span className="text-[12px] text-muted tabular-nums">{kb} KB</span>
          <IconButton label="Close" onClick={onClose}>
            <X size={15} />
          </IconButton>
        </div>
        <pre className="min-h-0 flex-1 overflow-auto bg-paper px-5 py-4 font-mono text-[11.5px] leading-[1.6] whitespace-pre-wrap text-text wrap-anywhere">
          {html}
        </pre>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3.5">
          <a
            href={url}
            download={file}
            className="inline-flex h-8 items-center rounded-full px-3.5 text-[13px] font-medium text-ink shadow-chip hover:bg-hover"
          >
            Download
          </a>
          <Button
            onClick={async () =>
              void ((await copyText(html))
                ? tell("Copied", "The HTML is on your clipboard.")
                : tell("Couldn't copy", "Select the code and copy it."))
            }
          >
            Copy HTML
          </Button>
        </div>
      </div>
    </>
  );
  return typeof document === "undefined"
    ? node
    : createPortal(node, document.body);
}
