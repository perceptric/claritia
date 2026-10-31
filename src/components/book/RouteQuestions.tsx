"use client";

// A Dynamic meeting's questions on its booking page (src/lib/meetings/dynamic.ts): the fields its rules test, asked
// before the times, so the page shows the picked rep's calendar. Choices are buttons; a country is typed and picked
// from the matches, never a browser dropdown.

import { useMemo, useState } from "react";
import { countryNames } from "@/lib/forms/countries";
import type { RouteQuestion } from "@/lib/meetings/dynamic";

const COUNTRIES = countryNames();

function Country({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const [q, setQ] = useState("");
  const picked = COUNTRIES.find((c) => c.value === value);
  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? COUNTRIES.filter((c) => c.label.toLowerCase().includes(t) || c.value.toLowerCase() === t).slice(0, 6) : [];
  }, [q]);
  if (picked)
    return (
      <div className="cb-choices">
        <button type="button" className="cb-choice" aria-checked="true" role="radio" onClick={() => onChange("")}>
          {picked.label}
        </button>
      </div>
    );
  return (
    <>
      <input className="cb-in" aria-labelledby={id} value={q} onChange={(e) => setQ(e.target.value)} maxLength={60} autoComplete="country-name" />
      {matches.length > 0 && (
        <div className="cb-choices" role="radiogroup" aria-labelledby={id}>
          {matches.map((c) => (
            <button key={c.value} type="button" role="radio" className="cb-choice" aria-checked="false" onClick={() => (onChange(c.value), setQ(""))}>
              {c.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

export function RouteQuestions({ questions, initial, onDone }: { questions: RouteQuestion[]; initial?: Record<string, string>; onDone: (answers: Record<string, string>) => void }) {
  const [a, setA] = useState<Record<string, string>>(initial ?? {});
  const [err, setErr] = useState("");
  const set = (k: string, v: string) => (setA((x) => ({ ...x, [k]: v })), setErr(""));
  const send = (e: React.FormEvent) => {
    e.preventDefault();
    const missing = questions.find((q) => !(a[q.key] ?? "").trim());
    if (missing) return setErr(`Add ${missing.label.toLowerCase()}.`);
    if (a.email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email.trim())) return setErr("Check the email.");
    onDone(a);
  };
  return (
    <form className="cb-step cb-form" onSubmit={send} noValidate>
      <h2 className="cb-h" style={{ fontSize: "1.15em" }}>
        A few questions
      </h2>
      {questions.map((q) => {
        const id = `cb-rq-${q.key.replace(/[^\w-]/g, "_")}`;
        const v = a[q.key] ?? "";
        const options = q.type === "bool" ? ["true", "false"] : q.options;
        return (
          <div className="cb-field" key={q.key}>
            <span id={id}>{q.label}</span>
            {q.type === "country" ? (
              <Country id={id} value={v} onChange={(x) => set(q.key, x)} />
            ) : (q.type === "choice" || q.type === "bool") && options?.length ? (
              <div className="cb-choices" role="radiogroup" aria-labelledby={id}>
                {options.map((o) => (
                  <button key={o} type="button" role="radio" className="cb-choice" aria-checked={v === o} onClick={() => set(q.key, v === o ? "" : o)}>
                    {q.type === "bool" ? (o === "true" ? "Yes" : "No") : o}
                  </button>
                ))}
              </div>
            ) : (
              <input
                className="cb-in"
                aria-labelledby={id}
                type={q.key === "email" ? "email" : "text"}
                inputMode={q.key === "email" ? "email" : q.type === "number" ? "numeric" : undefined}
                autoComplete={q.key === "email" ? "email" : undefined}
                value={v}
                onChange={(e) => set(q.key, e.target.value)}
                maxLength={q.key === "email" ? 320 : 200}
              />
            )}
          </div>
        );
      })}
      {err && (
        <p className="cb-err" role="alert">
          {err}
        </p>
      )}
      <div>
        <button type="submit" className="cb-btn">
          Next
        </button>
      </div>
    </form>
  );
}
