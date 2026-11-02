"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { findTemplates, industryCounts, industryLabel, questionCount } from "@/lib/forms/catalog";
import { INDUSTRIES, USE_CASES, type FormTemplate, type Industry, type UseCase } from "@/lib/forms/types";
import { Search } from "../Icons";
import { Select } from "../app/Select";
import { Badge } from "../app/ui";
import { FormView } from "./FormView";

// The template gallery (docs/form-templates.md Part 1): industries down the side, words and use cases on top, and
// each card a live, scaled-down copy of the form itself. Used in the app (open → preview → Use this form) and on
// the website (each card links to its own page).

type Pick = Industry | "all" | "featured";

/** Draws the form only once its card scrolls near the screen, so 150 cards stay light. */
function Thumb({ t }: { t: FormTemplate }) {
  const box = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setSeen(true), { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return (
    <div ref={box} className="paper relative h-[210px] overflow-hidden border-b border-line" aria-hidden="true" inert>
      {seen ? (
        <div className="pointer-events-none absolute top-4 left-4 w-[calc(200%-64px)] origin-top-left scale-50 border border-line bg-panel p-7 select-none">
          <FormView schema={t.schema} mode="thumb" badge={false} />
        </div>
      ) : null}
    </div>
  );
}

export function TemplateCard({ t, onOpen, href }: { t: FormTemplate; onOpen?: (t: FormTemplate) => void; href?: string }) {
  const pages = t.schema.pages.length;
  // The whole card is one link or button laid over the content, so the form drawn inside never nests in it.
  const cover = "absolute inset-0 z-[2] outline-none focus-visible:ring-2 focus-visible:ring-ink";
  return (
    <div className="group relative flex flex-col border border-line bg-panel text-left transition-colors hover:border-ink has-[:focus-visible]:border-ink">
      <Thumb t={t} />
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-[14.5px] leading-snug font-medium text-ink">{t.name}</h3>
          {t.phi ? <Badge tone="amber">Health</Badge> : t.featured ? <Badge>Popular</Badge> : null}
        </div>
        <p className="line-clamp-2 text-[13px] leading-relaxed text-muted">{t.blurb}</p>
        <p className="fig mt-auto pt-2">
          {"// "}
          {industryLabel(t.industry)} — {questionCount(t)} questions{pages > 1 ? `, ${pages} pages` : ""}
        </p>
      </div>
      {href ? <a href={href} aria-label={t.name} className={cover} /> : <button type="button" aria-label={`Preview ${t.name}`} onClick={() => onOpen?.(t)} className={cover} />}
    </div>
  );
}

export function Gallery({ onOpen, hrefFor, initial = "all" }: { onOpen?: (t: FormTemplate) => void; hrefFor?: (t: FormTemplate) => string; initial?: Pick }) {
  const [industry, setIndustry] = useState<Pick>(initial);
  const [tag, setTag] = useState<UseCase | "all">("all");
  const [text, setText] = useState("");
  const counts = useMemo(() => industryCounts(), []);
  const list = useMemo(() => findTemplates({ industry, tag, text }), [industry, tag, text]);
  const total = useMemo(() => Object.values(counts).reduce((a, b) => a + b, 0), [counts]);
  const featured = useMemo(() => findTemplates({ industry: "featured" }).length, []);
  const rail: { value: Pick; label: string; n: number }[] = [
    { value: "all", label: "All templates", n: total },
    { value: "featured", label: "Popular", n: featured },
    ...INDUSTRIES.map((i) => ({ value: i.value as Pick, label: i.label, n: counts[i.value] })),
  ];

  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-start">
      <nav aria-label="Industries" className="hidden w-56 shrink-0 flex-col gap-0.5 md:sticky md:top-0 md:flex">
        <p className="label-mono mb-1.5 px-2.5">Industry</p>
        {rail.map((r) => (
          <button
            key={r.value}
            type="button"
            aria-current={industry === r.value ? "true" : undefined}
            onClick={() => setIndustry(r.value)}
            className={`flex h-8 items-center justify-between gap-2 rounded-md px-2.5 text-left text-[13px] ${industry === r.value ? "bg-panel font-medium text-ink ring-1 ring-line" : "text-body hover:bg-hover hover:text-ink"}`}
          >
            <span className="truncate">{r.label}</span>
            <span className="font-mono text-[10.5px] text-faint tabular-nums">{r.n}</span>
          </button>
        ))}
      </nav>
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative flex-1">
              <span className="sr-only">Search templates</span>
              <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Search 150 templates"
                className="h-9 w-full rounded-md border border-line bg-panel pr-3 pl-8 text-[13px] text-ink outline-none placeholder:text-faint focus:border-ink"
              />
            </label>
            <div className="md:hidden">
              <Select
                value={industry}
                options={rail.map((r) => ({ value: r.value, label: `${r.label} (${r.n})` }))}
                onChange={setIndustry}
                ariaLabel="Industry"
                className="h-9 w-full rounded-md border border-line bg-panel px-2.5 text-[13px] sm:w-56"
              />
            </div>
          </div>
          <div role="group" aria-label="Use case" className="flex flex-wrap gap-1.5">
            {[{ value: "all" as const, label: "Any use" }, ...USE_CASES].map((u) => (
              <button
                key={u.value}
                type="button"
                aria-pressed={tag === u.value}
                onClick={() => setTag(u.value)}
                className={`h-7 rounded-sm border px-2.5 text-[12.5px] ${tag === u.value ? "border-ink bg-ink text-white" : "border-line bg-panel text-body hover:border-line-strong hover:text-ink"}`}
              >
                {u.label}
              </button>
            ))}
          </div>
        </div>
        <p className="fig">
          {"// "}
          {list.length} {list.length === 1 ? "template" : "templates"}
        </p>
        {list.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((t) => (
              <TemplateCard key={t.id} t={t} onOpen={onOpen} href={hrefFor?.(t)} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 border border-line bg-panel px-6 py-16 text-center">
            <p className="text-[15px] font-medium">No matches</p>
            <button type="button" onClick={() => { setText(""); setTag("all"); setIndustry("all"); }} className="text-[13px] text-muted underline-offset-2 hover:text-ink hover:underline">
              Clear filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
