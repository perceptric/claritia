"use client";

// The first screen (docs/router-ux.md 4.1), shown until the workspace has a router: what routing does, then three
// templates and Start blank. Territories asks its regions in place first. Today's routing, when lead_settings has
// some, leads as "Your current routing". Picking one saves a draft and opens the editor.

import type { Session } from "@supabase/supabase-js";
import { useState } from "react";
import { REGIONS } from "@/lib/router/conditions";
import { emptyBody, type RouterBody } from "@/lib/router/types";
import { fromTemplate, TEMPLATES, type TemplateId } from "@/lib/router/templates";
import { Check } from "../../Icons";
import { ToolIntro } from "../ToolIntro";
import { Button, ErrorNote, errorText } from "../ui";
import { routingApi, type Loaded } from "./api";

const PICKABLE = ["North America", "EMEA", "APAC", "LATAM", "DACH", "UK and Ireland"];

export function FirstScreen({ session, ws, data, canEdit, onCreated }: { session: Session; ws: string; data: Loaded; canEdit: boolean; onCreated: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [asking, setAsking] = useState(false);
  const [regions, setRegions] = useState<string[]>(["North America", "EMEA"]);
  const reps = data.members.map((m) => m.id);

  const create = async (key: string, body: RouterBody) => {
    setBusy(key);
    setError("");
    try {
      await routingApi(session, ws, "save_draft", { body, revision: data.revision });
      onCreated();
    } catch (e) {
      setError(errorText(e));
      setBusy(null);
    }
  };
  const pick = (id: TemplateId) => (id === "territories" ? setAsking(true) : void create(id, fromTemplate(id, { reps })));

  return (
    <div className="p-5 md:p-7">
      <ToolIntro
        sketch="signpost"
        title={"Send every lead\nto the right rep"}
        lead="Spam held back, accounts kept with their owners, everyone else shared fairly. Every lead says why it went where it went."
      />
      {canEdit ? (
        <div className="mx-auto mt-6 flex max-w-6xl flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.legacy ? (
              <Card title="Your current routing" text="Moved over from lead settings" art="legacy" busy={busy === "legacy"} disabled={!!busy} onClick={() => void create("legacy", data.legacy!.body)} delay={0} />
            ) : null}
            {TEMPLATES.map((t, i) =>
              t.id === "territories" && asking ? (
                <div key={t.id} className="anim-rise-sm flex flex-col gap-3 rounded-2xl border border-ink bg-card p-5">
                  <h3 className="text-[16px] leading-tight font-semibold tracking-[-0.02em] text-ink">{t.name}</h3>
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Regions">
                    {PICKABLE.filter((n) => REGIONS.some((r) => r.name === n)).map((n) => {
                      const on = regions.includes(n);
                      return (
                        <button
                          key={n}
                          type="button"
                          aria-pressed={on}
                          onClick={() => setRegions((l) => (on ? l.filter((x) => x !== n) : [...l, n]))}
                          className={`press inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-colors duration-[140ms] ${on ? "border-ink bg-ink text-paper" : "border-line-strong bg-card text-body hover:text-ink"}`}
                        >
                          {on ? <Check size={12} /> : null}
                          {n}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-auto flex justify-end gap-2">
                    <Button variant="plain" size="sm" onClick={() => setAsking(false)} disabled={!!busy}>
                      Cancel
                    </Button>
                    <Button size="sm" disabled={!regions.length || !!busy} onClick={() => void create("territories", fromTemplate("territories", { reps, regions }))}>
                      Create
                    </Button>
                  </div>
                </div>
              ) : (
                <Card key={t.id} title={t.name} text={t.text} art={t.id} busy={busy === t.id} disabled={!!busy} onClick={() => pick(t.id)} delay={(i + 1) * 80} />
              ),
            )}
          </div>
          <div className="flex justify-center">
            <Button variant="plain" disabled={!!busy} onClick={() => void create("blank", emptyBody())}>
              Start blank
            </Button>
          </div>
          <ErrorNote message={error} />
        </div>
      ) : null}
    </div>
  );
}

function Card({ title, text, art, busy, disabled, onClick, delay }: { title: string; text: string; art: TemplateId | "legacy"; busy: boolean; disabled: boolean; onClick: () => void; delay: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={busy}
      className="lift anim-rise flex flex-col gap-3 rounded-2xl border border-line bg-card p-5 text-left disabled:opacity-60"
      style={{ animationDelay: `${delay}ms` }}
    >
      <span className="flex h-12 items-center">
        <Art kind={art} />
      </span>
      <span className="text-[16px] leading-tight font-semibold tracking-[-0.02em] text-ink">{title}</span>
      <span className="text-[13.5px] text-body">{text}</span>
    </button>
  );
}

/** A tiny drawing of each template: a lead, then where it goes. */
function Art({ kind }: { kind: TemplateId | "legacy" }) {
  const ink = "var(--color-ink)";
  const soft = "var(--color-line-strong)";
  const accent = "var(--color-clay)";
  const dot = (x: number, y: number, fill = soft, r = 5) => <circle cx={x} cy={y} r={r} fill={fill} />;
  return (
    <svg width="132" height="40" viewBox="0 0 132 40" fill="none" aria-hidden="true">
      {dot(8, 20, ink)}
      <path d="M16 20h22M34 16l4 4-4 4" stroke={ink} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {kind === "round_robin" ? (
        <>
          {dot(54, 20, accent)}
          {dot(72, 20)}
          {dot(90, 20)}
          {dot(108, 20)}
        </>
      ) : kind === "territories" ? (
        <>
          <rect x="46" y="12" width="18" height="16" rx="4" fill={accent} />
          <rect x="70" y="12" width="18" height="16" rx="4" fill={soft} />
          <rect x="94" y="12" width="18" height="16" rx="4" fill={soft} />
        </>
      ) : kind === "owner_first" ? (
        <>
          <path d="M54 12l2.4 5 5.4.6-4 3.7 1.1 5.3L54 24l-4.9 2.6 1.1-5.3-4-3.7 5.4-.6z" fill={accent} />
          <path d="M66 20h20M82 16l4 4-4 4" stroke={soft} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          {dot(98, 20)}
          {dot(116, 20)}
        </>
      ) : (
        <>
          <rect x="46" y="10" width="40" height="8" rx="4" fill={accent} />
          <rect x="46" y="22" width="56" height="8" rx="4" fill={soft} />
        </>
      )}
    </svg>
  );
}
