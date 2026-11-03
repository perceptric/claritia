"use client";

// The template gallery (docs/form-templates.md, docs/form-templates-plan.md): every template in its own style, with
// the menus on the side (category, industry, team, what it does next, features, layout, length). A card opens the
// real form in a sheet, where a style row switches the look; Use template makes the draft in that style and opens it
// in the builder. The website's template pages link here (/forms/templates/<template>?theme=<style>), and the menus
// keep their picks in the address (?category=waiver&team=hr).

import { useEffect, useMemo, useState } from "react";
import { industryLabel, questionCount, templateById, templateBySlug, templateSlug, templateTheme, TEMPLATES } from "@/lib/forms/gallery/catalog";
import { styleTokens, templateForm } from "@/lib/forms/gallery/convert";
import { kitBooks, kitWorkflows } from "@/lib/forms/gallery/kit";
import { inSeason, kitById, KITS, type Kit } from "@/lib/forms/gallery/kits";
import { filterTemplates, menuCounts, MENUS, picksFromQuery, picksToQuery, shownValues, valueLabel, type Menu, type Picks, type Sort } from "@/lib/forms/gallery/filter";
import { LENGTHS, lengthOf } from "@/lib/forms/gallery/taxonomy";
import { FONTS, fontsUrl, isTheme, themeById, THEMES, type FontKey, type Theme } from "@/lib/forms/gallery/themes";
import type { FormTemplate } from "@/lib/forms/gallery/types";
import type { Tokens } from "@/lib/forms/brand";
import { AiMark } from "../../Ai";
import { Select } from "../../Select";
import { Sheet } from "../../Sheet";
import { ErrorNote, errorText, invalidate, postJson, type ViewProps } from "../../ui";
import { Ic } from "../ic";
import { BTN, CARD, EYEBROW, GHOST } from "../parts";
import { FormPreview } from "../shared";

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
  const box = {
    border: `${th.bw}px solid ${th.border}`,
    borderRadius: Math.min(th.radius, 8),
    background: solid(th.field, th),
  } as const;
  const field = th.input === "line" ? { borderBottom: `1px solid ${th.border}`, background: "transparent" } : box;
  const shown = s.pages[0]!.fields.filter((f) => f.kind !== "hidden").slice(0, 4);
  const art = th.art ? `/form-art/${th.id}.svg` : "";
  const split = !!art && th.layout === "split";
  return (
    <div aria-hidden="true" className="relative h-[200px] overflow-hidden border-b border-line px-[14px] pt-[14px]" style={{ background: th.bg }}>
      <div
        className="flex h-full overflow-hidden"
        style={{
          background: th.layout === "plain" ? "transparent" : th.card,
          border: th.layout === "plain" ? 0 : `${th.bw}px solid ${th.border}`,
          borderBottom: 0,
          borderRadius: `${Math.min(th.cardRadius, 12)}px ${Math.min(th.cardRadius, 12)}px 0 0`,
          flexDirection: split ? "row" : "column",
          fontFamily: FONTS[th.font].css,
          color: th.text,
        }}
      >
        {art ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={art} alt="" className={split ? "h-full w-[34%] shrink-0 object-cover object-left-top" : "h-[44px] w-full shrink-0 object-cover"} />
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-[7px] overflow-hidden p-[12px]">
          <span
            className="truncate text-[13px] leading-tight"
            style={{
              fontFamily: FONTS[th.head].css,
              fontWeight: th.headWeight,
              fontStyle: th.headItalic ? "italic" : "normal",
            }}
          >
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
          <span
            className="mt-[2px] self-start px-[10px] py-[3px] text-[8.5px] font-semibold"
            style={{
              background: th.accent,
              color: th.accentInk,
              borderRadius: Math.min(th.btnRadius, 99),
              boxShadow: th.shadow === "hard" ? `2px 2px 0 ${th.text}` : undefined,
            }}
          >
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

const SORTS: { value: Sort; label: string }[] = [
  { value: "popular", label: "Most used" },
  { value: "new", label: "Newest" },
  { value: "az", label: "A to Z" },
];
const OWN = "own";

/** The menus as they show: nested ones (categories in families, sub-industries in industries) under their parent. */
const RAIL = MENUS.filter((m) => m.id !== "category" && m.id !== "sub");

function toggle(p: Picks, m: Menu, v: string): Picks {
  const now = p[m] ?? [];
  const next = now.includes(v) ? now.filter((x) => x !== v) : [...now, v];
  const out = { ...p, [m]: next };
  if (!next.length) delete out[m];
  return out;
}

function Row({ label, n, on, onClick, nested, open, onOpen }: { label: string; n: number; on: boolean; onClick: () => void; nested?: boolean; open?: boolean; onOpen?: () => void }) {
  return (
    <span className={`flex h-[30px] items-center rounded-full ${on ? "bg-hover" : "hover:bg-hover"} ${nested ? "pl-[18px]" : ""}`}>
      <button
        type="button"
        aria-pressed={on}
        onClick={onClick}
        disabled={!n && !on}
        className={`flex h-full min-w-0 flex-1 items-center justify-between gap-[8px] pl-[10px] text-left text-[13px] disabled:opacity-40 ${onOpen ? "" : "pr-[10px]"} ${on ? "font-medium text-ink" : "text-body hover:text-ink"}`}
      >
        <span className="flex min-w-0 items-center gap-[8px]">
          <span aria-hidden="true" className={`flex size-[14px] shrink-0 items-center justify-center rounded-[4px] border ${on ? "border-ink bg-ink text-card" : "border-line-strong"}`}>
            {on ? <Ic n="check" /> : null}
          </span>
          <span className="truncate">{label}</span>
        </span>
        <span className="text-[11.5px] text-faint tabular-nums">{n}</span>
      </button>
      {onOpen ? (
        <button
          type="button"
          aria-label={open ? `Hide ${label}` : `Show ${label}`}
          aria-expanded={open}
          onClick={onOpen}
          className="flex size-[26px] shrink-0 items-center justify-center rounded-full text-faint hover:text-ink"
        >
          <span className={`transition-transform duration-[120ms] ${open ? "" : "-rotate-90"}`}>
            <Ic n="chev" />
          </span>
        </button>
      ) : null}
    </span>
  );
}

/** The menus: each folds open, with its values and what picking one would show. */
function Menus({ picks, setPicks, counts }: { picks: Picks; setPicks: (p: Picks) => void; counts: ReturnType<typeof menuCounts> }) {
  const [shut, setShut] = useState<Record<string, boolean>>({
    does: true,
    feature: true,
    layout: true,
    length: true,
  });
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const shown = useMemo(() => Object.fromEntries(MENUS.map((m) => [m.id, shownValues(m.id)])) as Record<Menu, ReturnType<typeof shownValues>>, []);
  return (
    <div className="flex flex-col gap-[10px]">
      {RAIL.map((m) => {
        const values = shown[m.id];
        if (!values.length) return null;
        const isShut = shut[m.id] && !picks[m.id]?.length;
        return (
          <section key={m.id} className="flex flex-col gap-[1px]">
            <button
              type="button"
              aria-expanded={!isShut}
              onClick={() => setShut((x) => ({ ...x, [m.id]: !isShut }))}
              className={`${EYEBROW} flex h-[26px] items-center justify-between px-[10px] text-left hover:text-ink`}
            >
              {m.label}
              <span className={`transition-transform duration-[120ms] ${isShut ? "-rotate-90" : ""}`}>
                <Ic n="chev" />
              </span>
            </button>
            {isShut
              ? null
              : values.map((v) => {
                  const kids = m.nested ? shown[m.nested].filter((k) => k.parent === v.id) : [];
                  const kidOn = !!m.nested && kids.some((k) => picks[m.nested!]?.includes(k.id));
                  const open = !!opened[`${m.id}:${v.id}`] || kidOn;
                  const on = !!picks[m.id]?.includes(v.id);
                  const n = counts[m.id][v.id] ?? 0;
                  if (!n && !on && !kidOn) return null;
                  return (
                    <div key={v.id} className="flex flex-col gap-[1px]">
                      <Row
                        label={v.label}
                        n={n}
                        on={on}
                        onClick={() => setPicks(toggle(picks, m.id, v.id))}
                        {...(kids.length
                          ? {
                              open,
                              onOpen: () =>
                                setOpened((x) => ({
                                  ...x,
                                  [`${m.id}:${v.id}`]: !open,
                                })),
                            }
                          : {})}
                      />
                      {open
                        ? kids.map((k) => {
                            const kn = counts[m.nested!][k.id] ?? 0;
                            const kon = !!picks[m.nested!]?.includes(k.id);
                            if (!kn && !kon) return null;
                            return <Row key={k.id} nested label={k.label} n={kn} on={kon} onClick={() => setPicks(toggle(picks, m.nested!, k.id))} />;
                          })
                        : null}
                    </div>
                  );
                })}
          </section>
        );
      })}
    </div>
  );
}

/**
 * Describe your form (docs/form-templates-plan.md 5.5): the words are matched to the catalog first, so a template
 * that fits is offered before anything is built; Build with AI opens Form Studio with the words in its message box.
 */
function Describe({ ws, session, navigate, onPick, seed }: Pick<ViewProps, "ws" | "session" | "navigate"> & { onPick: (t: FormTemplate) => void; seed: string }) {
  const [text, setText] = useState(seed);
  const [found, setFound] = useState<{ q: string; ids: string[] }>({ q: "", ids: [] });
  const q = text.trim();
  useEffect(() => {
    if (q.length < 8) return;
    let live = true;
    const t = setTimeout(() => {
      postJson<{ ids: string[] }>(session, "/api/forms/templates/match", { workspaceId: ws.id, text: q })
        .then((r) => live && setFound({ q, ids: r.ids }))
        .catch(() => undefined);
    }, 600);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, session, ws.id]);
  const picks = found.q === q && q.length >= 8 ? found.ids.map((x) => templateById(x)).filter((x): x is FormTemplate => !!x) : [];
  const build = () => navigate("forms", "new", q ? `ask=${encodeURIComponent(q)}` : undefined);
  return (
    <div className={`${CARD} flex flex-col gap-[10px] p-[16px]`}>
      <label className="flex flex-col gap-[8px]">
        <span className="flex items-center gap-[6px] text-[14px] font-medium text-ink">
          <AiMark size={14} />
          Describe the form you need
        </span>
        <span className="flex flex-wrap gap-[8px]">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && build()}
            maxLength={300}
            placeholder="A deposit form for custom cake orders"
            className="h-[36px] min-w-[220px] flex-1 rounded-sm border border-line bg-card px-[10px] text-[13px] text-ink outline-none placeholder:text-muted focus:shadow-focus"
          />
          <button type="button" className={BTN} onClick={build}>
            <Ic n="wand" />
            Build with AI
          </button>
        </span>
      </label>
      {picks.length ? (
        <div className="flex flex-wrap items-center gap-[6px]">
          {picks.map((t) => (
            <button key={t.id} type="button" onClick={() => onPick(t)} className="press inline-flex h-[28px] items-center gap-[6px] rounded-full bg-card shadow-chip px-[12px] text-[12.5px] text-body hover:shadow-input-hover hover:text-ink">
              Start from {t.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function KitCard({ k, onOpen }: { k: Kit; onOpen: () => void }) {
  const list = k.templates.map((x) => templateById(x)).filter((x): x is FormTemplate => !!x);
  return (
    <button type="button" onClick={onOpen} className={`${CARD} press flex w-[250px] shrink-0 flex-col gap-[8px] p-[14px] text-left transition-colors duration-[120ms] hover:border-ink`}>
      <span className="text-[14px] font-medium text-ink">{k.name}</span>
      <span className="flex flex-col gap-[2px] text-[12.5px] text-muted">
        {list.map((t) => (
          <span key={t.id} className="truncate">
            {t.name}
          </span>
        ))}
      </span>
      <span className="mt-auto pt-[4px] text-[12px] text-faint">{list.length} forms</span>
    </button>
  );
}

/** A starter kit: its forms, and one button that makes them all in one style. */
function KitSheet({ k, ws, session, navigate, onClose, onPick }: Pick<ViewProps, "ws" | "session" | "navigate"> & { k: Kit; onClose: () => void; onPick: (t: FormTemplate) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const list = k.templates.map((x) => templateById(x)).filter((x): x is FormTemplate => !!x);
  const add = async () => {
    setBusy(true);
    setError("");
    try {
      await postJson<{ ids: string[]; failed: string[] }>(session, "/api/forms/templates/kit", { workspaceId: ws.id, kit: k.id });
      invalidate(`forms:${ws.id}:home`);
      invalidate(`form_names:${ws.id}`);
      invalidate("app_counts");
      invalidate(`workflows:${ws.id}`);
      navigate("forms");
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  return (
    <Sheet
      title={k.name}
      onClose={onClose}
      footer={
        <>
          <ErrorNote message={error} />
          <span className="flex-1" />
          <button type="button" className={BTN} onClick={add} disabled={busy}>
            {busy ? "Making them…" : `Add all ${list.length}`}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-[8px] p-[16px]">
        {list.map((t) => (
          <button key={t.id} type="button" onClick={() => onPick(t)} className={`${CARD} press flex flex-col gap-[2px] p-[12px] text-left hover:border-ink`}>
            <span className="text-[13.5px] font-medium text-ink">{t.name}</span>
            <span className="text-[12.5px] text-muted">{t.blurb}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

const lengthLabel = (t: FormTemplate) => LENGTHS.find((l) => l.id === lengthOf(t))!.label;

/** A workspace brand kit the gallery can draw in: the ones read from a site, never a style's own kit. */
type BrandKit = { id: string; name: string; tokens: Partial<Tokens>; logo_url: string | null };

function useBrandKits(sb: ViewProps["sb"], ws: string) {
  const [kits, setKits] = useState<BrandKit[]>([]);
  useEffect(() => {
    let live = true;
    sb.from("brand_kits")
      .select("id, name, tokens, logo_url, source_url, notes")
      .eq("workspace_id", ws)
      .order("created_at")
      .then(({ data }) => {
        const rows = (data ?? []) as (BrandKit & { source_url: string | null; notes: string[] | null })[];
        if (live) setKits(rows.filter((k) => k.source_url && !(k.notes ?? []).some((n) => n.startsWith("style:"))).slice(0, 6));
      });
    return () => {
      live = false;
    };
  }, [sb, ws]);
  return kits;
}

function KitSwatch({ k, on, onClick }: { k: BrandKit; on: boolean; onClick: () => void }) {
  const c = (x: unknown, d: string) => (typeof x === "string" && /^#[0-9a-f]{6}$/i.test(x) ? x : d);
  return (
    <button type="button" role="radio" aria-checked={on} aria-label={k.name} title={k.name} onClick={onClick} className={`press flex h-[24px] items-center gap-[6px] rounded-full border pr-[10px] pl-[3px] text-[12px] ${on ? "border-ink ring-1 ring-ink" : "border-line hover:border-line-strong"}`}>
      <span className="flex h-[16px] w-[24px] overflow-hidden rounded-full border border-line">
        <span className="flex-1" style={{ background: c(k.tokens.background, "#ffffff") }} />
        <span className="flex-1" style={{ background: c(k.tokens.accent ?? k.tokens.buttonBg, "#0a0a0a") }} />
      </span>
      <span className="max-w-[120px] truncate">{k.name}</span>
    </button>
  );
}

export function TemplatesPage({ sb, ws, session, navigate, id }: ViewProps) {
  useStyleFonts();
  const [picks, setPicks] = useState<Picks>(() => (typeof window === "undefined" ? {} : picksFromQuery(new URLSearchParams(window.location.search))));
  const [sort, setSort] = useState<Sort>("popular");
  const [look, setLook] = useState<string>(OWN);
  const [text, setText] = useState("");
  const [filters, setFilters] = useState(false);
  // ?kit=<id> (the website's starter kits) opens that kit.
  const [kitOpen, setKitOpen] = useState<Kit | null>(() => (typeof window === "undefined" ? null : (kitById(new URLSearchParams(window.location.search).get("kit") ?? "") ?? null)));
  const season = useMemo(() => inSeason(new Date().getMonth() + 1).slice(0, 8), []);
  const [open, setOpen] = useState<FormTemplate | null>(() => templateBySlug(id.split("/")[1] ?? "") ?? null);
  const [picked, setPicked] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const q = new URLSearchParams(window.location.search).get("theme");
    return isTheme(q) ? q : null;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const list = useMemo(() => filterTemplates(picks, text, sort), [picks, text, sort]);
  const counts = useMemo(() => menuCounts(picks, text), [picks, text]);
  const cardTheme = (t: FormTemplate) => themeById(look === OWN ? templateTheme(t) : look);
  const kits = useBrandKits(sb, ws.id);
  const [kitId, setKitId] = useState<string | null>(null);
  const kit = kits.find((k) => k.id === kitId) ?? null;
  const theme = themeById(picked ?? (look !== OWN ? look : open ? templateTheme(open) : undefined));
  // In the workspace's own brand the form takes the kit's look and no style drawing.
  const form = useMemo(() => (open ? templateForm(open, kit ? undefined : theme) : null), [open, theme, kit]);
  const tokens = useMemo(() => (kit ? kit.tokens : styleTokens(theme)), [theme, kit]);
  const tags = MENUS.flatMap((m) =>
    (picks[m.id] ?? []).map((v) => ({
      m: m.id,
      v,
      label: valueLabel(m.id, v),
    })),
  );

  useEffect(() => {
    const q = picksToQuery(picks);
    const path = open ? `/forms/templates/${templateSlug(open)}${picked ? `?theme=${picked}` : ""}` : `/forms/templates${q ? `?${q}` : ""}`;
    window.history.replaceState(null, "", path);
  }, [open, picked, picks]);

  const use = async () => {
    if (!open) return;
    setBusy(true);
    setError("");
    try {
      const r = await postJson<{ id: string }>(session, "/api/forms/templates", { workspaceId: ws.id, template: open.id, ...(kit ? { kitId: kit.id } : { theme: theme.id }) });
      invalidate(`forms:${ws.id}:home`);
      invalidate(`form_names:${ws.id}`);
      invalidate("app_counts");
      invalidate(`workflows:${ws.id}`);
      navigate("forms", r.id);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  const clear = () => {
    setPicks({});
    setText("");
  };
  const all = (
    <button
      type="button"
      aria-pressed={!tags.length && !text}
      onClick={clear}
      className={`flex h-[30px] items-center justify-between gap-[8px] rounded-full px-[10px] text-left text-[13px] ${!tags.length && !text ? "bg-hover font-medium text-ink" : "text-body hover:bg-hover hover:text-ink"}`}
    >
      <span>All templates</span>
      <span className="text-[11.5px] text-faint tabular-nums">{TEMPLATES.length}</span>
    </button>
  );

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
          <nav aria-label="Template menus" className="sticky top-0 hidden max-h-[calc(100vh-120px)] w-[230px] shrink-0 flex-col gap-[10px] self-start overflow-y-auto pb-[16px] lg:flex">
            {all}
            <Menus picks={picks} setPicks={setPicks} counts={counts} />
          </nav>
          <div className="flex min-w-0 flex-1 flex-col gap-[14px]">
            <div className="flex flex-wrap items-center gap-[8px]">
              <label className="flex h-[36px] min-w-[200px] flex-1 items-center gap-[8px] rounded-sm border border-line bg-card px-[10px] text-muted focus-within:shadow-focus">
                <Ic n="search" />
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={`Search ${TEMPLATES.length} templates`}
                  aria-label="Search templates"
                  className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-muted"
                />
              </label>
              <button type="button" className={`${GHOST} lg:hidden`} onClick={() => setFilters(true)}>
                <Ic n="flow" />
                Filters{tags.length ? ` (${tags.length})` : ""}
              </button>
              <Select<string>
                value={look}
                options={[
                  { value: OWN, label: "Each in its own style" },
                  ...THEMES.map((th) => ({
                    value: th.id,
                    label: th.name,
                    hint: th.mood,
                  })),
                ]}
                onChange={setLook}
                ariaLabel="Style"
                className={`${GHOST} justify-between`}
                align="right"
              />
              <Select<Sort> value={sort} options={SORTS} onChange={setSort} ariaLabel="Sort" className={`${GHOST} justify-between`} align="right" />
            </div>
            {tags.length ? (
              <div className="flex flex-wrap items-center gap-[6px]">
                {tags.map((x) => (
                  <button
                    key={`${x.m}:${x.v}`}
                    type="button"
                    onClick={() => setPicks(toggle(picks, x.m, x.v))}
                    aria-label={`Remove ${x.label}`}
                    className="press inline-flex h-[28px] items-center gap-[6px] rounded-full border border-ink bg-ink pr-[8px] pl-[12px] text-[12.5px] text-card"
                  >
                    {x.label}
                    <Ic n="x" />
                  </button>
                ))}
                <button type="button" className="h-[28px] px-[8px] text-[12.5px] text-muted hover:text-ink" onClick={() => setPicks({})}>
                  Clear all
                </button>
              </div>
            ) : null}
            {!tags.length && !text ? (
              <section aria-label="Starter kits" className="flex flex-col gap-[8px]">
                <p className={EYEBROW}>Starter kits</p>
                <div className="-mx-[2px] flex gap-[10px] overflow-x-auto px-[2px] pb-[4px]">
                  {KITS.map((k) => (
                    <KitCard key={k.id} k={k} onOpen={() => setKitOpen(k)} />
                  ))}
                </div>
              </section>
            ) : picks.industry?.length === 1 && kitById(picks.industry[0]!.replace(/_/g, "-")) ? (
              <KitCard k={kitById(picks.industry[0]!.replace(/_/g, "-"))!} onOpen={() => setKitOpen(kitById(picks.industry![0]!.replace(/_/g, "-"))!)} />
            ) : null}
            {!tags.length && !text && season.length >= 3 ? (
              <section aria-label="In season" className="flex flex-col gap-[8px]">
                <p className={EYEBROW}>In season</p>
                <div className="flex flex-wrap gap-[6px]">
                  {season.map((t) => (
                    <button key={t.id} type="button" onClick={() => (setPicked(look === OWN ? null : look), setError(""), setOpen(t))} className="press inline-flex h-[28px] items-center rounded-full bg-card shadow-chip px-[12px] text-[12.5px] text-body hover:shadow-input-hover hover:text-ink">
                      {t.name}
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
            <p className="text-[12.5px] text-muted tabular-nums">{list.length} templates</p>
            {list.length ? (
              <div className="grid gap-[14px] sm:grid-cols-2 xl:grid-cols-3">
                {list.map((t) => {
                  const th = cardTheme(t);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setPicked(look === OWN ? null : look);
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
                          {industryLabel(t.industry)}, {questionCount(t)} questions, {lengthLabel(t).toLowerCase()}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className={`${CARD} flex flex-col items-center gap-[8px] px-[16px] py-[48px] text-center`}>
                <p className="text-[14px] font-medium text-ink">No matches</p>
                <button type="button" className={GHOST} onClick={clear}>
                  Clear
                </button>
              </div>
            )}
            <Describe
              key={list.length ? "more" : `none:${text}`}
              ws={ws}
              session={session}
              navigate={navigate}
              seed={list.length ? "" : text}
              onPick={(t) => {
                setPicked(look === OWN ? null : look);
                setError("");
                setOpen(t);
              }}
            />
          </div>
        </div>
      </div>
      {kitOpen ? (
        <KitSheet
          k={kitOpen}
          ws={ws}
          session={session}
          navigate={navigate}
          onClose={() => setKitOpen(null)}
          onPick={(t) => {
            setKitOpen(null);
            setPicked(look === OWN ? null : look);
            setError("");
            setOpen(t);
          }}
        />
      ) : null}
      {filters ? (
        <Sheet
          title="Filters"
          onClose={() => setFilters(false)}
          footer={
            <>
              <button type="button" className={GHOST} onClick={() => setPicks({})}>
                Clear all
              </button>
              <span className="flex-1" />
              <button type="button" className={BTN} onClick={() => setFilters(false)}>
                Show {list.length}
              </button>
            </>
          }
        >
          <div className="flex flex-col gap-[10px] p-[16px]">
            {all}
            <Menus picks={picks} setPicks={setPicks} counts={counts} />
          </div>
        </Sheet>
      ) : null}
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
            <div aria-label="Comes with" className="flex flex-wrap items-center gap-[6px] text-[12.5px] text-body">
              {["Form", ...(kitBooks(open) ? ["Meeting"] : []), ...(kitWorkflows(open).length ? ["Follow-up"] : [])].map((x, i) => (
                <span key={x} className="flex items-center gap-[6px]">
                  {i ? (
                    <span aria-hidden="true" className="-rotate-90 text-faint">
                      <Ic n="chev" />
                    </span>
                  ) : null}
                  <span className="inline-flex h-[24px] items-center rounded-full bg-card shadow-chip px-[10px]">{x}</span>
                </span>
              ))}
            </div>
            <div className="flex flex-col gap-[8px]">
              <p className={EYEBROW}>
                Style <span className="normal-case">{kit ? kit.name : theme.name}</span>
              </p>
              <div role="radiogroup" aria-label="Style" className="flex flex-wrap gap-[6px]">
                {kits.map((k) => (
                  <KitSwatch key={k.id} k={k} on={kit?.id === k.id} onClick={() => setKitId(k.id)} />
                ))}
                {THEMES.map((th) => (
                  <Swatch
                    key={th.id}
                    th={th}
                    on={!kit && theme.id === th.id}
                    onClick={() => {
                      setKitId(null);
                      setPicked(th.id);
                    }}
                  />
                ))}
              </div>
            </div>
            <div className="overflow-hidden rounded-[10px] shadow-rest bg-paper-deep p-[16px]">
              <FormPreview key={`${open.id}:${kit?.id ?? theme.id}`} form={form} tokens={tokens} logo={kit?.logo_url ?? null} />
            </div>
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}
