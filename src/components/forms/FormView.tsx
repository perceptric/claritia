"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { checkAnswers } from "@/lib/forms/answers";
import { allFields, bandFor, maxScore, score as scoreOf, shown, shownPages } from "@/lib/forms/logic";
import { DEFAULT_CONSENT, DEFAULT_NOTICE } from "@/lib/forms/schema";
import { HALF_KINDS, type FormSchema, type FormSettings } from "@/lib/forms/types";
import { FieldInput } from "./FieldInput";

// A form as visitors see it: pages, show-if logic, checks on each page, the consent block for the visitor's region,
// and the end screen with a score or a booking button. The same component draws gallery cards ("thumb"), the
// preview and editor ("preview"), and hosted and embedded forms ("live"), so what people pick is what they get.

export type Outcome = { ok: true; score?: number | null; redirect?: string } | { ok: false; errors?: Record<string, string>; error?: string };
export type Payload = { answers: Record<string, unknown>; files: Record<string, File[]>; ticked: boolean; token: string; hp: string; started: number };

type Props = {
  schema: FormSchema;
  settings?: FormSettings;
  mode: "live" | "preview" | "thumb";
  /** strict shows the opt-in box; notice shows the line under the button. */
  region?: "strict" | "notice";
  onSubmit?: (p: Payload) => Promise<Outcome>;
  turnstileKey?: string;
  embed?: boolean;
  slug?: string;
  /** The editor: the picked field gets a frame, and clicking a field picks it. */
  selected?: string | null;
  onSelect?: (key: string) => void;
  page?: number;
  onPage?: (p: number) => void;
  /** Branding under the form; off in the app's own preview. */
  badge?: boolean;
  /** The editor: show the end screen instead of the questions. */
  showEnd?: boolean;
};

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, o: Record<string, unknown>) => string; reset: (id?: string) => void };
  }
}

export function inkFor(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const n = parseInt(m[1]!, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! > 0.45 ? "#0c0c0b" : "#ffffff";
}

export const DEFAULT_ACCENT = "#0c0c0b";

export function FormView({ schema, settings = {}, mode, region = "notice", onSubmit, turnstileKey, embed, slug, selected, onSelect, page: pageProp, onPage, badge = true, showEnd }: Props) {
  // Hidden fields take their value from the address (?utm_campaign=…), so links can carry context.
  const [answers, setAnswers] = useState<Record<string, unknown>>(() => {
    if (mode !== "live" || typeof window === "undefined") return {};
    const q = new URLSearchParams(window.location.search);
    const hidden: Record<string, unknown> = {};
    for (const f of allFields(schema)) if (f.kind === "hidden" && q.get(f.key)) hidden[f.key] = q.get(f.key)!.slice(0, 500);
    return hidden;
  });
  const [files, setFiles] = useState<Record<string, File[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [ticked, setTicked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState("");
  const [done, setDone] = useState<{ score: number | null } | null>(null);
  const [pageState, setPageState] = useState(0);
  const page = Math.min(pageProp ?? pageState, schema.pages.length - 1);
  const setPage = useCallback((p: number) => (onPage ? onPage(p) : setPageState(p)), [onPage]);
  const root = useRef<HTMLDivElement>(null);
  const token = useRef("");
  const started = useRef(0);
  const hp = useRef<HTMLInputElement>(null);
  const turnstileBox = useRef<HTMLDivElement>(null);
  const accent = settings.accent && /^#[0-9a-f]{6}$/i.test(settings.accent) ? settings.accent : DEFAULT_ACCENT;
  const vars = { "--fa": accent, "--fa-ink": inkFor(accent) } as React.CSSProperties;
  const live = mode === "live";
  const thumb = mode === "thumb";

  useEffect(() => {
    started.current = Date.now();
  }, []);

  // The editor: bring the picked question into view.
  useEffect(() => {
    if (!onSelect || !selected) return;
    root.current?.querySelector(`[data-key="${selected}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected, onSelect, page]);

  // Embedded: tell the page around the iframe how tall the form is.
  useEffect(() => {
    if (!embed || !root.current || window.parent === window) return;
    const send = () => window.parent.postMessage({ type: "claritia:form:height", slug, height: Math.ceil(root.current!.getBoundingClientRect().height) + 2 }, "*");
    const ro = new ResizeObserver(send);
    ro.observe(root.current);
    send();
    return () => ro.disconnect();
  }, [embed, slug]);

  // Bot check, when the server has a Turnstile key.
  useEffect(() => {
    if (!live || !turnstileKey || !turnstileBox.current) return;
    const box = turnstileBox.current;
    const draw = () => window.turnstile?.render(box, { sitekey: turnstileKey, appearance: "interaction-only", callback: (t: string) => (token.current = t) });
    if (window.turnstile) draw();
    else {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.onload = draw;
      document.head.appendChild(s);
    }
  }, [live, turnstileKey]);

  const raw = useMemo(() => {
    const out: Record<string, unknown> = { ...answers };
    for (const [k, list] of Object.entries(files)) out[k] = list.map((f) => ({ name: f.name, size: f.size, type: f.type || "application/octet-stream", path: "" }));
    return out;
  }, [answers, files]);
  const view = useMemo(() => shown(schema, raw as never), [schema, raw]);
  const pages = useMemo(() => shownPages(schema, raw as never), [schema, raw]);
  // Where this page sits among the pages that show; a page hidden by a later answer counts as the one before it.
  const found = pages.indexOf(page);
  const at = found >= 0 ? found : Math.max(0, pages.filter((p) => p < page).length - 1);
  const isLast = thumb || at >= pages.length - 1;
  const fields = (schema.pages[page]?.fields ?? []).filter((f) => view.keys.has(f.key) && f.kind !== "hidden");
  const multi = schema.pages.length > 1 && pages.length > 1;
  const consent = !settings.consent_off;

  const set = (k: string, v: unknown) => {
    setAnswers((a) => ({ ...a, [k]: v }));
    if (errors[k]) setErrors((e) => Object.fromEntries(Object.entries(e).filter(([x]) => x !== k)));
  };
  const focusFirst = (errs: Record<string, string>) => {
    const first = Object.keys(errs)[0];
    if (!first) return;
    requestAnimationFrame(() => {
      const el = root.current?.querySelector<HTMLElement>(`[data-key="${first}"] input, [data-key="${first}"] textarea, [data-key="${first}"] button, [data-key="${first}"] canvas`);
      el?.focus({ preventScroll: false });
      root.current?.querySelector(`[data-key="${first}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  };
  const top = () => {
    if (!embed) root.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  const next = async () => {
    if (thumb || busy) return;
    setFail("");
    const check = checkAnswers(schema, raw, isLast ? {} : { page });
    if (Object.keys(check.errors).length) {
      setErrors(check.errors);
      // An error on an earlier page sends people back to it.
      const firstKey = Object.keys(check.errors)[0]!;
      const errPage = schema.pages.findIndex((p) => p.fields.some((f) => f.key === firstKey));
      if (errPage >= 0 && errPage !== page) setPage(errPage);
      focusFirst(check.errors);
      return;
    }
    setErrors({});
    if (!isLast) {
      setPage(pages[at + 1] ?? page);
      top();
      return;
    }
    if (!onSubmit) {
      setDone({ score: scoreOf(schema, check.answers) });
      return;
    }
    setBusy(true);
    try {
      const keep = new Set(Object.keys(check.answers));
      const sendFiles = Object.fromEntries(Object.entries(files).filter(([k]) => keep.has(k)));
      const sendAnswers = Object.fromEntries(Object.entries(check.answers).filter(([k]) => !(k in sendFiles)));
      const r = await onSubmit({ answers: sendAnswers, files: sendFiles, ticked: region === "strict" && consent && ticked, token: token.current, hp: hp.current?.value ?? "", started: started.current });
      if (r.ok) {
        const email = allFields(schema).find((f) => f.map === "email" || f.kind === "email");
        if (embed && window.parent !== window) window.parent.postMessage({ type: "claritia:form:submitted", slug, email: email ? check.answers[email.key] : undefined }, "*");
        if (r.redirect) {
          if (embed && window.parent !== window) window.parent.postMessage({ type: "claritia:form:redirect", slug, url: r.redirect }, "*");
          else window.location.assign(r.redirect);
        }
        setDone({ score: r.score ?? null });
        top();
      } else {
        if (r.errors && Object.keys(r.errors).length) {
          setErrors(r.errors);
          const firstKey = Object.keys(r.errors)[0]!;
          const errPage = schema.pages.findIndex((p) => p.fields.some((f) => f.key === firstKey));
          if (errPage >= 0) setPage(errPage);
          focusFirst(r.errors);
        }
        setFail(r.error ?? (r.errors ? "" : "Something went wrong. Try again."));
        if (turnstileKey) window.turnstile?.reset();
      }
    } catch {
      setFail("We couldn't send your answers. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const back = () => {
    if (at > 0) {
      setPage(pages[at - 1]!);
      top();
    }
  };

  const ended = done ?? (showEnd ? { score: schema.end.score?.length ? maxScore(schema) : null } : null);
  if (ended) {
    const band = bandFor(schema, ended.score);
    const nameField = allFields(schema).find((f) => f.map === "name");
    const emailField = allFields(schema).find((f) => f.map === "email");
    const nm = nameField ? (answers[nameField.key] as { first?: string; last?: string } | undefined) : undefined;
    let booking = settings.booking_url || "";
    if (booking && /^https:\/\//.test(booking)) {
      try {
        const u = new URL(booking);
        const full = [nm?.first, nm?.last].filter(Boolean).join(" ");
        if (full) u.searchParams.set("name", full);
        if (emailField && typeof answers[emailField.key] === "string") u.searchParams.set("email", answers[emailField.key] as string);
        booking = u.toString();
      } catch {
        booking = "";
      }
    }
    return (
      <div ref={root} style={vars} className="flex w-full flex-col gap-4 py-2 text-ink" role="status">
        <span className="flex size-10 items-center justify-center rounded-md bg-[var(--fa)] text-[var(--fa-ink)]" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M20 6 9 17l-5-5" /></svg>
        </span>
        <h2 className="text-[24px] leading-tight font-medium tracking-[-0.02em]">{schema.end.title}</h2>
        {ended.score != null && schema.end.score?.length ? (
          <div className="flex flex-col gap-2 border border-line bg-canvas p-4">
            <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">
              Score {ended.score} of {maxScore(schema)}
            </p>
            {band ? (
              <>
                <p className="text-[18px] font-medium">{band.title}</p>
                <p className="text-[14px] leading-relaxed text-body">{band.text}</p>
              </>
            ) : null}
          </div>
        ) : null}
        {schema.end.text ? <p className="text-[15px] leading-relaxed whitespace-pre-line text-body">{schema.end.text}</p> : null}
        {schema.end.booking && (booking || !live) ? (
          <a
            href={booking || undefined}
            target={embed ? "_blank" : undefined}
            rel="noopener"
            className="inline-flex h-10 w-fit items-center gap-2 rounded-md bg-[var(--fa)] px-5 text-[14px] font-medium text-[var(--fa-ink)] hover:opacity-90"
          >
            Pick a time
          </a>
        ) : null}
        {!live && !showEnd ? (
          <button type="button" onClick={() => { setDone(null); setAnswers({}); setFiles({}); setPage(0); }} className="w-fit text-[13px] text-muted underline-offset-2 hover:text-ink hover:underline">
            Start over
          </button>
        ) : null}
        {badge && live ? <Badge /> : null}
      </div>
    );
  }

  return (
    <div ref={root} style={vars} className="w-full text-ink" inert={thumb || undefined} data-clr-ignore={live ? undefined : ""}>
      <form
        noValidate
        data-clr-form={slug}
        onSubmit={(e) => {
          e.preventDefault();
          void next();
        }}
        className="flex flex-col gap-6"
      >
        {at === 0 || thumb ? (
          <header className="flex flex-col gap-2">
            <h1 className="text-[26px] leading-[1.15] font-medium tracking-[-0.025em]">{schema.title}</h1>
            {schema.intro ? <p className="text-[15px] leading-relaxed whitespace-pre-line text-body">{schema.intro}</p> : null}
          </header>
        ) : null}
        {multi && !thumb ? (
          <div className="flex flex-col gap-2" aria-label={`Step ${at + 1} of ${pages.length}`}>
            <div className="flex items-center justify-between font-mono text-[10.5px] tracking-[0.14em] text-muted uppercase">
              <span>{schema.pages[page]?.title || `Step ${at + 1}`}</span>
              <span className="tabular-nums">
                {at + 1} / {pages.length}
              </span>
            </div>
            <div className="h-1 bg-hover">
              <div className="h-full bg-[var(--fa)] transition-[width] duration-300" style={{ width: `${((at + 1) / pages.length) * 100}%` }} />
            </div>
          </div>
        ) : null}
        <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
          {fields.map((f) => (
            <div
              key={f.key}
              data-key={f.key}
              onMouseDownCapture={onSelect ? () => onSelect(f.key) : undefined}
              onFocusCapture={onSelect ? () => onSelect(f.key) : undefined}
              className={`${f.half && HALF_KINDS.has(f.kind) ? "" : "sm:col-span-2"} ${onSelect ? `-m-2 rounded-md p-2 outline-offset-0 ${selected === f.key ? "outline-2 outline-brand outline-dashed" : "hover:outline-1 hover:outline-line-strong hover:outline-dashed"}` : ""}`}
            >
              <FieldInput f={f} value={answers[f.key]} files={files[f.key]} error={errors[f.key]} disabled={busy} onChange={(v) => set(f.key, v)} onFiles={(list) => { setFiles((x) => ({ ...x, [f.key]: list })); if (errors[f.key]) setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => k !== f.key))); }} />
            </div>
          ))}
        </div>
        {isLast && consent && !thumb ? (
          region === "strict" ? (
            <button type="button" role="checkbox" aria-checked={ticked} onClick={() => setTicked((t) => !t)} className="flex items-start gap-2.5 text-left text-[13px] leading-relaxed text-body">
              <span aria-hidden="true" className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[3px] border ${ticked ? "border-[var(--fa)] bg-[var(--fa)] text-[var(--fa-ink)]" : "border-line-strong bg-white"}`}>
                {ticked ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg>
                ) : null}
              </span>
              <span>{settings.consent_text || DEFAULT_CONSENT}</span>
            </button>
          ) : null
        ) : null}
        <input ref={hp} name="website_url" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-px w-px opacity-0" />
        {live && turnstileKey ? <div ref={turnstileBox} /> : null}
        {fail ? (
          <p role="alert" className="rounded-md border border-red-200 bg-danger-soft px-3 py-2 text-[13px] text-danger">
            {fail}
          </p>
        ) : null}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            {at > 0 && !thumb ? (
              <button type="button" onClick={back} disabled={busy} className="inline-flex h-10 items-center rounded-md border border-line-strong bg-white px-4 text-[14px] font-medium text-ink hover:border-ink/40 disabled:opacity-60">
                Back
              </button>
            ) : null}
            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-[var(--fa)] px-5 text-[14px] font-medium text-[var(--fa-ink)] transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {isLast ? schema.submit : "Next"}
            </button>
          </div>
          {isLast && consent && region === "notice" && !thumb ? <p className="text-[12px] leading-relaxed text-muted">{settings.notice_text || DEFAULT_NOTICE}</p> : null}
        </div>
      </form>
      {badge && live ? <Badge /> : null}
    </div>
  );
}

function Badge() {
  return (
    <a href="https://tryclaritia.com/templates" target="_blank" rel="noopener" className="mt-8 inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.14em] text-faint uppercase hover:text-muted">
      Made with Claritia
    </a>
  );
}
