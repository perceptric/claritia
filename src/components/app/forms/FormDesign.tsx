"use client";

// The Theme panel (docs/form-studio.md 2.3): the form's look over the brand kit's tokens, with a live canvas. Fonts
// from Google Fonts, colors with a contrast check, corners and sizes on sliders, the button, presets and "Match my
// site" (the brand scan). A theme is saved as a brand kit: the shared kit (every form on it changes), or a kit of
// its own for just this form. The server checks every token and fixes colors visitors couldn't read.

import { useState } from "react";
import { cleanTokens, type Tokens } from "@/lib/forms/brand";
import { Dots } from "../Ai";
import { Badge, Button, ErrorNote, errorText } from "../ui";
import { ColorField, FontPicker, INPUT, LabelWidth, Pick, Row, Section, Seg, SliderRow } from "./controls";
import { CONTRAST_PAIRS, familyOf, fontStack, fontUrl, SYSTEM_FONT, THEME_PRESETS } from "./editorModel";
import type { Kit } from "./shared";

export type ThemeProps = {
  tokens: Partial<Tokens>;
  setTokens: (t: Partial<Tokens>) => void;
  kits: Kit[];
  kitId: string | null;
  setKit: (id: string | null) => void;
  /** Save the tokens to the form's kit, or (`own`) to a new kit only this form uses. */
  saveKit: (name: string, tokens: Partial<Tokens>, own: boolean) => Promise<{ notes: string[] }>;
  scan: (url: string) => Promise<void>;
  site: string;
  formName: string;
};

const COLORS: [keyof Tokens, string][] = [
  ["text", "Text"],
  ["muted", "Gray text"],
  ["background", "Background"],
  ["inputBg", "Field"],
  ["border", "Border"],
  ["accent", "Focus"],
  ["error", "Error"],
];

export function FormDesign({ tokens, setTokens, kits, kitId, setKit, saveKit, scan, site, formName }: ThemeProps) {
  const kit = kits.find((k) => k.id === kitId) ?? null;
  const t = cleanTokens(tokens).tokens;
  const saved = cleanTokens(kit?.tokens ?? {}).tokens;
  const unsaved = JSON.stringify(t) !== JSON.stringify(saved);
  const [notes, setNotes] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState(site);
  const [own, setOwn] = useState<"kit" | "form">("kit");
  const set = (p: Partial<Tokens>) => {
    setTokens({ ...tokens, ...p });
    setNotes([]);
  };
  const setFont = (which: "font" | "headingFont", name: string) => {
    const stack = name ? fontStack(name) : which === "font" ? SYSTEM_FONT : "";
    const next = { ...t, [which]: stack };
    const names = [familyOf(next.font), next.headingFont ? familyOf(next.headingFont) : ""].filter(Boolean);
    const link = fontUrl(names);
    set({ [which]: stack, fontUrl: link || (names.some((n) => tokensKnown(n)) ? "" : t.fontUrl) });
  };
  const scanning = kit?.scan_status === "scanning";
  return (
    <LabelWidth.Provider value={64}>
      <div className="flex flex-col pb-4">
        <Section first title="Kit" action={unsaved ? <Badge tone="amber">Unsaved</Badge> : null}>
          <Row label="Kit">
            <Pick<string>
              label="Brand kit"
              value={kitId ?? "__none"}
              options={[...kits.map((k) => ({ value: k.id, label: k.name })), ...(kitId ? [] : [{ value: "__none", label: "No kit yet" }])]}
              onChange={(v) => {
                const k = kits.find((x) => x.id === v);
                if (!k) return;
                setKit(k.id);
                setTokens(k.tokens ?? {});
                setNotes([]);
              }}
            />
          </Row>
        </Section>

        <Section title="Presets">
          <div className="grid grid-cols-2 gap-1.5">
            {THEME_PRESETS.map((p) => {
              const look = { ...t, ...p.tokens(t) };
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => set(p.tokens(t))}
                  aria-label={`${p.label} preset`}
                  className="press flex flex-col gap-1.5 rounded-lg border border-line bg-card p-2 text-left transition-[border-color,transform] duration-[140ms] hover:-translate-y-px hover:border-line-strong"
                >
                  <span className="flex flex-col gap-1 rounded-sm p-1.5" style={{ background: look.background }}>
                    <span className="block h-3.5 w-full" style={{ background: look.inputBg, border: `${look.borderWidth}px solid ${look.border}`, borderRadius: Math.min(look.radius, 7) }} />
                    <span className="block h-3.5 w-1/2" style={{ background: look.buttonBg, borderRadius: Math.min(look.buttonRadius, 7) }} />
                  </span>
                  <span className="text-[11.5px] font-medium text-ink">{p.label}</span>
                </button>
              );
            })}
          </div>
          <form
            className="flex items-center gap-1.5"
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              try {
                await scan(url);
              } catch (err) {
                setError(errorText(err));
              }
            }}
          >
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="yoursite.com" aria-label="Your site" className={`${INPUT} font-mono text-[12px]`} />
            <Button type="submit" size="sm" variant="ghost" disabled={scanning || !url.trim()} className="!h-7 shrink-0 !px-2.5 !text-[12px]">
              {scanning ? <Dots /> : "Match my site"}
            </Button>
          </form>
          {kit?.scan_status === "failed" && kit.scan_error ? <ErrorNote message={kit.scan_error} /> : null}
        </Section>

        <Section title="Type">
          <FontPicker label="Font" value={t.font === SYSTEM_FONT ? "" : t.font} onChange={(n) => setFont("font", n)} />
          <FontPicker label="Headings" allowSame value={t.headingFont} onChange={(n) => setFont("headingFont", n)} />
          <SliderRow label="Size" value={t.fontSize} min={12} max={22} unit="px" onChange={(fontSize) => set({ fontSize })} />
          <SliderRow label="Labels" value={t.labelSize} min={11} max={22} unit="px" onChange={(labelSize) => set({ labelSize })} />
          <Row label="Weight">
            <Seg
              label="Label weight"
              value={String(t.labelWeight)}
              options={["400", "500", "600"].map((w) => ({ value: w, label: w, title: w === "400" ? "Regular" : w === "500" ? "Medium" : "Semibold" }))}
              onChange={(w) => set({ labelWeight: Number(w) })}
            />
          </Row>
        </Section>

        <Section title="Colors">
          {COLORS.map(([k, label]) => {
            const pair = CONTRAST_PAIRS[k];
            return <ColorField key={k} label={label} value={String(t[k])} against={pair ? String(t[pair[0]]) : undefined} need={pair?.[1]} onChange={(v) => set({ [k]: v })} />;
          })}
        </Section>

        <Section title="Fields">
          <SliderRow label="Corners" value={t.radius} min={0} max={32} unit="px" onChange={(radius) => set({ radius })} />
          <SliderRow label="Height" value={t.inputHeight} min={30} max={72} unit="px" onChange={(inputHeight) => set({ inputHeight })} />
          <SliderRow label="Border" value={t.borderWidth} min={0} max={4} unit="px" onChange={(borderWidth) => set({ borderWidth })} />
          <SliderRow label="Spacing" value={t.gap} min={6} max={40} unit="px" onChange={(gap) => set({ gap })} />
        </Section>

        <Section title="Button">
          <ColorField label="Fill" value={t.buttonBg} against={t.background} need={3} onChange={(buttonBg) => set({ buttonBg })} />
          <ColorField label="Text" value={t.buttonText} against={t.buttonBg} onChange={(buttonText) => set({ buttonText })} />
          <SliderRow label="Corners" value={t.buttonRadius} min={0} max={60} unit="px" onChange={(buttonRadius) => set({ buttonRadius })} />
          <Row label="Weight">
            <Seg label="Button weight" value={String(t.buttonWeight)} options={["400", "500", "600", "700"].map((w) => ({ value: w, label: w }))} onChange={(w) => set({ buttonWeight: Number(w) })} />
          </Row>
          <Row label="Case">
            <Seg
              label="Button case"
              value={t.buttonCase}
              options={[
                { value: "none", label: "Aa", title: "As typed" },
                { value: "uppercase", label: "AA", title: "Capitals" },
              ]}
              onChange={(buttonCase) => set({ buttonCase })}
            />
          </Row>
        </Section>

        <Section title="Save">
          {kit ? (
            <Row label="Save to">
              <Seg
                label="Save to"
                value={own}
                options={[
                  { value: "kit", label: "Kit", title: kit.name },
                  { value: "form", label: "This form" },
                ]}
                onChange={setOwn}
              />
            </Row>
          ) : null}
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              disabled={busy || (!unsaved && !!kit && own === "kit")}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const forForm = !kit || own === "form";
                  setNotes((await saveKit(forForm ? `${formName || "Form"} theme`.slice(0, 120) : kit.name, t, forForm && !!kit)).notes);
                } catch (e) {
                  setError(errorText(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Saving…" : "Save theme"}
            </Button>
            {unsaved && kit ? (
              <Button size="sm" variant="plain" onClick={() => setTokens(kit.tokens ?? {})}>
                Revert
              </Button>
            ) : null}
          </div>
          <ErrorNote message={error} />
          {notes.length ? (
            <ul className="flex flex-col gap-1 text-[12px] text-body">
              {notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          ) : null}
        </Section>
      </div>
    </LabelWidth.Provider>
  );
}

const tokensKnown = (name: string) => !!name && !!fontUrl([name]);
