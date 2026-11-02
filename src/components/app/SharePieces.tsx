"use client";

// Pieces every Share screen uses (docs/sharing-plan.md): the link row (the whole link, Copy and Open) and the code box
// (a bar with Copy above the code, so the button never sits on the code). Used by a form's Share tab, a meeting's Share
// dialog and Settings › Link domain.

import { useState } from "react";
import { Check, Copy, ExternalLink } from "../Icons";
import { copyText } from "./CopyButton";
import { Button } from "./ui";

/** Copy with a check for a moment after. */
export function useCopied() {
  const [done, setDone] = useState("");
  const copy = async (what: string, text: string) => {
    if (!(await copyText(text))) return false;
    setDone(what);
    setTimeout(() => setDone((d) => (d === what ? "" : d)), 1600);
    return true;
  };
  return { done, copy };
}

/** The link in full, one primary Copy and Open. */
export function LinkRow({ url, disabled = false, primary = true }: { url: string; disabled?: boolean; primary?: boolean }) {
  const { done, copy } = useCopied();
  const shown = url.replace(/^https?:\/\//, "");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={disabled ? undefined : url} target="_blank" rel="noopener" data-share-link className="min-w-0 flex-1 basis-[240px] truncate rounded-[6px] border border-line bg-paper px-3 py-[7px] font-mono text-[12.5px] text-ink hover:border-line-strong" title={url}>
        {shown}
      </a>
      <Button size="sm" variant={primary ? "primary" : "ghost"} disabled={disabled} onClick={() => void copy("link", url)}>
        {done === "link" ? <Check size={13} /> : <Copy size={13} />}
        {done === "link" ? "Copied" : "Copy link"}
      </Button>
      <Button size="sm" variant="ghost" disabled={disabled} onClick={() => window.open(url, "_blank", "noopener")}>
        <ExternalLink size={13} />
        Open
      </Button>
    </div>
  );
}

/** Code to paste, with its own bar: a label, anything else for the bar (like platform picks), and Copy. */
export function CodeBox({ code, label = "Code", bar, embed = false }: { code: string; label?: string; bar?: React.ReactNode; embed?: boolean }) {
  const { done, copy } = useCopied();
  return (
    <div className="overflow-hidden rounded-[10px] border border-line bg-card">
      <div className="flex items-start gap-2 border-b border-line px-3 py-2">
        <div className="flex min-h-[28px] min-w-0 flex-1 items-center">{bar ?? <span className="font-mono text-[11px] tracking-[0.04em] text-muted uppercase">{label}</span>}</div>
        <Button size="sm" variant="ghost" onClick={() => void copy("code", code)}>
          {done === "code" ? <Check size={13} /> : <Copy size={13} />}
          {done === "code" ? "Copied" : "Copy code"}
        </Button>
      </div>
      <pre {...(embed ? { "data-embed-code": "" } : {})} className="m-0 overflow-x-auto bg-paper px-4 py-3.5 font-mono text-[12px] leading-[1.6] whitespace-pre text-body">
        {code}
      </pre>
    </div>
  );
}

/** A row of picks drawn as pills, with a logo or a mark on each (the site builders). */
export function PillPicks<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { v: T; l: string; icon: React.ReactNode }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((p) => (
        <button key={p.v} type="button" role="radio" aria-checked={value === p.v} onClick={() => onChange(p.v)} className={`inline-flex h-[28px] items-center gap-[6px] rounded-full border pr-2.5 pl-[5px] text-[12px] transition-colors duration-[120ms] ${value === p.v ? "border-ink font-medium text-ink" : "border-line text-body hover:border-line-strong"}`}>
          {p.icon}
          {p.l}
        </button>
      ))}
    </div>
  );
}
