"use client";

// The template gallery (docs/form-templates.md): 150 forms for 24 industries, each in its own style. A card opens the
// real form in a sheet, where a style row switches the look; Use template makes the draft in that style and opens it
// in the builder. The website's template pages link here (/forms/templates/<template>?theme=<style>).

import { useEffect, useMemo, useState } from "react";
import { findTemplates, industryCounts, industryLabel, questionCount, templateBySlug, templateSlug, templateTheme } from "@/lib/forms/gallery/catalog";
import { styleTokens, templateForm } from "@/lib/forms/gallery/convert";
import { FONTS, fontsUrl, isTheme, themeById, THEMES, type FontKey, type Theme } from "@/lib/forms/gallery/themes";
import { INDUSTRIES, USE_CASES, type FormTemplate, type Industry, type UseCase } from "@/lib/forms/gallery/types";
import { Select } from "../../Select";
import { Sheet } from "../../Sheet";
import { ErrorNote, errorText, invalidate, postJson, type ViewProps } from "../../ui";
import { Ic } from "../ic";
import { BTN, CARD, EYEBROW, GHOST } from "../parts";
import { FormPreview } from "../shared";

type Pick = Industry | "all" | "featured";

/** Every style's fonts, once, so the cards show each style's type. */
function useStyleFonts() {
  useEffect(() => {
    const href = fontsUrl(Object.keys(FONTS) as FontKey[]);
    if (document.querySelector(`link[href="${href}"]`)) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    document.head.appendChild(l);
  }, []);
}

const solid = (c: string, th: Theme) => (/^#[0-9a-f]{6}$/i.test(c) ? c : th.card);

/** A card's picture: the template's first questions, drawn small in its style. */
function StyleThumb({ t, th }: { t: FormTemplate; th: Theme }) {
  const s = t.schema;
  const box = { border: `${th.bw}px solid ${th.border}`, borderRadius: Math.min(th.radius, 8), background: solid(th.field, th) } as const;
  const field = th.input === "line" ? { borderBottom: `1px solid ${th.border}`, background: "transparent" } : box;
  const shown = s.pages[0]!.fields.filter((f) => f.kind !== "hidden").slice(0, 4);
  const art = th.art ? `/form-art/${th.id}.svg` : "";
  const split = !!art && th.layout === "split";
  return (
    <div aria-hidden="true" className="relative h-[200px] overflow-hidden border-b border-line px-[14px] pt-[14px]" style={{ background: th.bg }}>
      <div className="flex h-full overflow-hidden" style={{ background: th.layout === "plain" ? "transparent" : th.card, border: th.layout === "plain" ? 0 : `${th.bw}px solid ${th.border}`, borderBottom: 0, borderRadius: `${Math.min(th.cardRadius, 12)}px ${Math.min(th.cardRadius, 12)}px 0 0`, flexDirection: split ? "row" : "column", fontFamily: FONTS[th.font].css, color: th.text }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {art ? <img src={art} alt="" className={split ? "h-full w-[34%] shrink-0 object-cover object-left-top" : "h-[44px] w-full shrink-0 object-cover"} /> : null}
        <div className="flex min-w-0 flex-1 flex-col gap-[7px] overflow-hidden p-[12px]">
          <span className="truncate text-[13px] leading-tight" style={{ fontFamily: FONTS[th.head].css, fontWeight: th.headWeight, fontStyle: th.headItalic ? "italic" : "normal" }}>
            {s.title}
          </span>
          {shown.map((f) => (
            <span key={f.key} className="flex flex-col gap-[3px]">
              <span className="truncate text-[9px] font-medium">{f.kind === "agree" ? "" : f.label}</span>
              {f.kind === "single" || f.kind === "multi" || f.kind === "yes_no" ? (
                <span className="flex gap-[4px]">
                  {(f.options?.length ? f.options : ["Yes", "No"]).slice(0, 2).map((o) => (
                    <span key={o} className="h-[14px] flex-1 truncate px-[5px] text-[8px] leading-[12px]" style={field}>
                      {o}
                    </span>
                  ))}
                </span>
              ) : (
                <span className={f.kind === "long_text" || f.kind === "file" || f.kind === "matrix" ? "h-[24px]" : "h-[14px]"} style={field} />
              )}
            </span>
          ))}
          <span className="mt-[2px] self-start px-[10px] py-[3px] text-[8.5px] font-semibold" style={{ background: th.accent, color: th.accentInk, borderRadius: Math.min(th.btnRadius, 99), boxShadow: th.shadow === "hard" ? `2px 2px 0 ${th.text}` : undefined }}>
            {s.pages.length > 1 ? "Next" : s.submit}
          </span>
        </div>
      </div>
    </div>
  );
}

function Swatch({ th, on, onClick }: { th: Theme; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      aria-label={th.name}
      title={`${th.name}: ${th.mood}`}
      onClick={onClick}
      className={`press flex h-[24px] w-[38px] shrink-0 overflow-hidden rounded-full border ${on ? "border-ink ring-1 ring-ink" : "border-line hover:border-line-strong"}`}
    >
      <span className="flex-1" style={{ background: th.bg }} />
      <span className="flex-1" style={{ background: th.card }} />
      <span className="flex-1" style={{ background: th.accent }} />
    </button>
  );
}

export function TemplatesPage({ ws, session, navigate, id }: ViewProps) {
  useStyleFonts();
  const [industry, setIndustry] = useState<Pick>("all");
  const [tag, setTag] = useState<UseCase | "all">("all");
  const [text, setText] = useState("");
  const [open, setOpen] = useState<FormTemplate | null>(() => templateBySlug(id.split("/")[1] ?? "") ?? null);
  const [picked, setPicked] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const q = new URLSearchParams(window.location.search).get("theme");
    return isTheme(q) ? q : null;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const counts = useMemo(() => industryCounts(), []);
  const list = useMemo(() => findTemplates({ industry, tag, text }), [industry, tag, text]);
  const theme = themeById(picked ?? (open ? templateTheme(open) : undefined));
  const form = useMemo(() => (open ? templateForm(open, theme) : null), [open, theme]);
  const tokens = useMemo(() => styleTokens(theme), [theme]);

  useEffect(() => {
    window.history.replaceState(null, "", open ? `/forms/templates/${templateSlug(open)}${picked ? `?theme=${picked}` : ""}` : "/forms/templates");
  }, [open, picked]);

  const use = async () => {
    if (!open) return;
    setBusy(true);
    setError("");
    try {
      const r = await postJson<{ id: string }>(session, "/api/forms/templates", { workspaceId: ws.id, template: open.id, theme: theme.id });
      invalidate(`forms:${ws.id}:home`);
      invalidate(`form_names:${ws.id}`);
      invalidate("app_counts");
      navigate("forms", r.id);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  const rail: { value: Pick; label: string; n: number }[] = [
    { value: "all", label: "All templates", n: Object.values(counts).reduce((a, b) => a + b, 0) },
    { value: "featured", label: "Popular", n: findTemplates({ industry: "featured" }).length },
    ...INDUSTRIES.map((i) => ({ value: i.value as Pick, label: i.label, n: counts[i.value] })),
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-[48px] shrink-0 items-center gap-[8px] border-b border-line pr-[12px] pl-[16px] text-[14px] font-medium">
        <button type="button" className="text-muted hover:text-ink" onClick={() => navigate("forms")}>
          Forms
        </button>
        <span className="text-faint">/</span>
        <h1 className="text-ink">Templates</h1>
        <span className="flex-1" />
        <button type="button" className={GHOST} onClick={() => navigate("forms", "new")}>
          <Ic n="wand" />
          Build with AI
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-[16px] pt-[16px] pb-[32px] sm:px-[clamp(16px,2.5vw,28px)]">
        <div className="mx-auto flex max-w-[1240px] gap-[28px]">
          <nav aria-label="Industries" className="sticky top-0 hidden w-[210px] shrink-0 flex-col gap-[1px] self-start lg:flex">
            <p className={`${EYEBROW} mb-[6px] px-[10px]`}>Industry</p>
            {rail.map((r) => (
              <button
                key={r.value}
                type="button"
                aria-current={industry === r.value ? "true" : undefined}
                onClick={() => setIndustry(r.value)}
                className={`flex h-[30px] items-center justify-between gap-[8px] rounded-full px-[10px] text-left text-[13px] ${industry === r.value ? "bg-hover font-medium text-ink" : "text-body hover:bg-hover hover:text-ink"}`}
              >
                <span className="truncate">{r.label}</span>
                <span className="text-[11.5px] text-faint tabular-nums">{r.n}</span>
              </button>
            ))}
          </nav>
          <div className="flex min-w-0 flex-1 flex-col gap-[14px]">
            <label className="flex h-[36px] items-center gap-[8px] rounded-sm border border-line bg-card px-[10px] text-muted focus-within:border-ink">
              <Ic n="search" />
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search 150 templates" aria-label="Search templates" className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-muted" />
            </label>
            <div role="group" aria-label="Use" className="flex flex-wrap gap-[6px]">
              {[{ value: "all" as const, label: "Any use" }, ...USE_CASES].map((u) => (
                <button
                  key={u.value}
                  type="button"
                  aria-pressed={tag === u.value}
                  onClick={() => setTag(u.value)}
                  className={`press h-[28px] rounded-full border px-[12px] text-[12.5px] ${tag === u.value ? "border-ink bg-ink text-card" : "border-line bg-card text-body hover:border-line-strong hover:text-ink"}`}
                >
                  {u.label}
                </button>
              ))}
            </div>
            <div className="lg:hidden">
              <Select<Pick> value={industry} options={rail.map((r) => ({ value: r.value, label: `${r.label} (${r.n})` }))} onChange={setIndustry} ariaLabel="Industry" className={`${GHOST} w-full justify-between sm:w-[260px]`} />
            </div>
            <p className="text-[12.5px] text-muted tabular-nums">{list.length} templates</p>
            {list.length ? (
              <div className="grid gap-[14px] sm:grid-cols-2 xl:grid-cols-3">
                {list.map((t) => {
                  const th = themeById(templateTheme(t));
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setPicked(null);
                        setError("");
                        setOpen(t);
                      }}
                      className={`${CARD} press flex flex-col overflow-hidden text-left transition-colors duration-[120ms] hover:border-ink`}
                      aria-label={`Preview ${t.name}`}
                    >
                      <StyleThumb t={t} th={th} />
                      <span className="flex flex-1 flex-col gap-[4px] p-[14px]">
                        <span className="flex items-start justify-between gap-[8px]">
                          <span className="text-[14px] font-medium text-ink">{t.name}</span>
                          <span className="shrink-0 text-[11.5px] text-faint">{th.name}</span>
                        </span>
                        <span className="line-clamp-2 text-[13px] text-muted">{t.blurb}</span>
                        <span className="mt-auto pt-[6px] text-[12px] text-faint">
                          {industryLabel(t.industry)}, {questionCount(t)} questions
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className={`${CARD} flex flex-col items-center gap-[8px] px-[16px] py-[48px] text-center`}>
                <p className="text-[14px] font-medium text-ink">No matches</p>
                <button type="button" className={GHOST} onClick={() => (setText(""), setTag("all"), setIndustry("all"))}>
                  Clear
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {open && form ? (
        <Sheet
          title={open.name}
          wide
          onClose={() => setOpen(null)}
          footer={
            <>
              <ErrorNote message={error} />
              <span className="flex-1" />
              <button type="button" className={BTN} onClick={use} disabled={busy}>
                {busy ? "Making it…" : "Use template"}
              </button>
            </>
          }
        >
          <div className="flex flex-col gap-[14px] p-[16px]">
            <p className="text-[13px] text-muted">{open.blurb}</p>
            <div className="flex flex-col gap-[8px]">
              <p className={EYEBROW}>
                Style <span className="normal-case">{theme.name}</span>
              </p>
              <div role="radiogroup" aria-label="Style" className="flex flex-wrap gap-[6px]">
                {THEMES.map((th) => (
                  <Swatch key={th.id} th={th} on={theme.id === th.id} onClick={() => setPicked(th.id)} />
                ))}
              </div>
            </div>
            <div className="overflow-hidden rounded-[10px] border border-line bg-paper-deep p-[16px]">
              <FormPreview key={`${open.id}:${theme.id}`} form={form} tokens={tokens} />
            </div>
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}
