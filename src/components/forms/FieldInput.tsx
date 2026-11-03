"use client";

import { useId, useState } from "react";
import { MAX_FILE_BYTES } from "@/lib/forms/answers";
import type { FormField } from "@/lib/forms/types";
import { Dropdown } from "./Dropdown";
import { Signature } from "./Signature";

// One question on a form, for every kind. Values follow src/lib/forms/answers.ts; files stay as File objects
// until the form is sent.

type Props = {
  f: FormField;
  value: unknown;
  files?: File[];
  error?: string;
  disabled?: boolean;
  onChange: (v: unknown) => void;
  onFiles?: (f: File[]) => void;
};

const BOX = "cf-in h-10 w-full rounded-[var(--f-radius)] border bg-[var(--f-field)] px-3 text-[14px] text-[var(--f-text)] outline-none placeholder:text-[var(--f-faint)] focus:border-[var(--fa)] focus:ring-1 focus:ring-[var(--fa)] disabled:opacity-60";
const border = (err?: string) => (err ? "border-danger" : "border-[var(--f-border)] hover:border-[var(--f-hover)]");
const CURRENCY: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", CAD: "$", AUD: "$", JPY: "¥", INR: "₹" };

const Check = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

function Choice({ on, kind, label, onClick, disabled }: { on: boolean; kind: "radio" | "check"; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role={kind === "radio" ? "radio" : "checkbox"}
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className={`cf-opt flex min-h-10 w-full items-center gap-2.5 rounded-[var(--f-radius)] border px-3 py-2 text-left text-[14px] transition-colors disabled:opacity-60 ${
        on ? "border-[var(--fa)] bg-[var(--f-soft)] text-[var(--f-text)]" : "border-[var(--f-border)] bg-[var(--f-field)] text-[var(--f-text)] hover:border-[var(--f-hover)]"
      }`}
    >
      <span
        aria-hidden="true"
        className={`flex size-4 shrink-0 items-center justify-center border ${kind === "radio" ? "rounded-full" : "rounded-[3px]"} ${on ? "border-[var(--fa)] bg-[var(--fa)] text-[var(--fa-ink)]" : "border-[var(--f-border)] bg-[var(--f-field)]"}`}
      >
        {on ? kind === "radio" ? <span className="size-1.5 rounded-full bg-[var(--fa-ink)]" /> : <Check /> : null}
      </span>
      <span className="min-w-0 flex-1">{label}</span>
    </button>
  );
}

function Star({ on }: { on: boolean }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true" fill={on ? "var(--fa)" : "none"} stroke={on ? "var(--fa)" : "currentColor"} strokeWidth="1.5" strokeLinejoin="round">
      <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
    </svg>
  );
}

function Steps({ id, lo, hi, value, onChange, minLabel, maxLabel, disabled }: { id: string; lo: number; hi: number; value: unknown; onChange: (n: number) => void; minLabel?: string; maxLabel?: string; disabled?: boolean }) {
  const n = hi - lo + 1;
  return (
    <div className="flex flex-col gap-1.5">
      <div role="radiogroup" aria-labelledby={id} className="grid gap-1" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {Array.from({ length: n }, (_, i) => lo + i).map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={value === v}
            disabled={disabled}
            onClick={() => onChange(v)}
            className={`cf-opt h-10 rounded-[min(var(--f-radius),10px)] border text-[14px] tabular-nums transition-colors disabled:opacity-60 ${value === v ? "border-[var(--fa)] bg-[var(--fa)] text-[var(--fa-ink)]" : "border-[var(--f-border)] bg-[var(--f-field)] text-[var(--f-text)] hover:border-[var(--f-hover)]"}`}
          >
            {v}
          </button>
        ))}
      </div>
      {minLabel || maxLabel ? (
        <div className="flex justify-between text-[12px] text-[var(--f-muted)]">
          <span>{minLabel}</span>
          <span>{maxLabel}</span>
        </div>
      ) : null}
    </div>
  );
}

export function FieldInput({ f, value, files = [], error, disabled, onChange, onFiles }: Props) {
  const id = useId();
  const errId = `${id}-err`;
  const helpId = `${id}-help`;
  const describedBy = [f.help ? helpId : "", error ? errId : ""].filter(Boolean).join(" ") || undefined;
  const [otherOn, setOtherOn] = useState(false);
  const [drag, setDrag] = useState(false);
  const str = typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
  const obj = (value && typeof value === "object" && !Array.isArray(value) ? value : {}) as Record<string, string>;
  const list = Array.isArray(value) ? (value as string[]) : [];
  const common = { id, disabled, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy };

  if (f.kind === "statement") {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-[15px] font-medium text-[var(--f-text)]">{f.label}</p>
        {f.help ? <p className="text-[14px] leading-relaxed whitespace-pre-line text-[var(--f-muted)]">{f.help}</p> : null}
      </div>
    );
  }
  if (f.kind === "hidden") return null;

  const label = (
    <label htmlFor={["single", "multi", "yes_no", "rating", "nps", "scale", "ranking", "matrix", "agree"].includes(f.kind) ? undefined : id} id={`${id}-label`} className="text-[14px] font-medium text-[var(--f-text)]">
      {f.label}
      {f.required ? <span className="text-[var(--f-faint)]"> *</span> : null}
    </label>
  );

  let input: React.ReactNode;
  switch (f.kind) {
    case "short_text":
    case "email":
    case "phone":
    case "url":
      input = (
        <input
          {...common}
          type={f.kind === "email" ? "email" : f.kind === "phone" ? "tel" : f.kind === "url" ? "url" : "text"}
          inputMode={f.kind === "phone" ? "tel" : f.kind === "url" ? "url" : undefined}
          autoComplete={f.kind === "email" ? "email" : f.kind === "phone" ? "tel" : f.map === "company" ? "organization" : f.map === "title" ? "organization-title" : f.kind === "url" ? "url" : "off"}
          value={str}
          placeholder={f.placeholder}
          maxLength={f.kind === "url" ? 2000 : 500}
          onChange={(e) => onChange(e.target.value)}
          className={`${BOX} ${border(error)}`}
        />
      );
      break;
    case "long_text":
      input = (
        <textarea
          {...common}
          value={str}
          placeholder={f.placeholder}
          rows={4}
          maxLength={10000}
          onChange={(e) => onChange(e.target.value)}
          className={`cf-in w-full rounded-[var(--f-radius)] border bg-[var(--f-field)] px-3 py-2.5 text-[14px] leading-relaxed text-[var(--f-text)] outline-none placeholder:text-[var(--f-faint)] focus:border-[var(--fa)] focus:ring-1 focus:ring-[var(--fa)] disabled:opacity-60 ${border(error)}`}
        />
      );
      break;
    case "number":
    case "money":
      input = (
        <div className="relative">
          {f.kind === "money" ? <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[14px] text-[var(--f-muted)]">{CURRENCY[f.currency ?? "USD"] ?? f.currency}</span> : null}
          <input
            {...common}
            type="text"
            inputMode="decimal"
            value={str}
            placeholder={f.placeholder}
            onChange={(e) => onChange(e.target.value.replace(/[^\d.,-]/g, ""))}
            className={`${BOX} ${border(error)} ${f.kind === "money" ? "pl-7" : ""} tabular-nums`}
          />
        </div>
      );
      break;
    case "date":
    case "time":
      input = <input {...common} type={f.kind} value={str} onChange={(e) => onChange(e.target.value)} className={`${BOX} ${border(error)} max-w-56`} />;
      break;
    case "date_range":
      input = (
        <div className="flex flex-wrap items-center gap-2">
          <input {...common} type="date" aria-label={`${f.label}: from`} value={obj.from ?? ""} onChange={(e) => onChange({ ...obj, from: e.target.value })} className={`${BOX} ${border(error)} max-w-48`} />
          <span className="text-[13px] text-[var(--f-muted)]">to</span>
          <input type="date" disabled={disabled} aria-label={`${f.label}: to`} value={obj.to ?? ""} onChange={(e) => onChange({ ...obj, to: e.target.value })} className={`${BOX} ${border(error)} max-w-48`} />
        </div>
      );
      break;
    case "name":
      input = (
        <div className="grid gap-2 sm:grid-cols-2">
          <input {...common} autoComplete="given-name" placeholder="First name" aria-label="First name" value={obj.first ?? ""} onChange={(e) => onChange({ ...obj, first: e.target.value })} className={`${BOX} ${border(error)}`} />
          <input disabled={disabled} autoComplete="family-name" placeholder="Last name" aria-label="Last name" value={obj.last ?? ""} onChange={(e) => onChange({ ...obj, last: e.target.value })} className={`${BOX} ${border()}`} />
        </div>
      );
      break;
    case "address": {
      const part = (k: string, ph: string, ac: string, extra = "") => (
        <input
          key={k}
          {...(k === "line1" ? common : { disabled })}
          autoComplete={ac}
          placeholder={ph}
          aria-label={ph}
          value={obj[k] ?? ""}
          onChange={(e) => onChange({ ...obj, [k]: e.target.value })}
          className={`${BOX} ${border(k === "line1" || k === "city" ? error : undefined)} ${extra}`}
        />
      );
      input = (
        <div className="grid gap-2 sm:grid-cols-6">
          {part("line1", "Street address", "address-line1", "sm:col-span-6")}
          {part("line2", "Apartment, suite (optional)", "address-line2", "sm:col-span-6")}
          {part("city", "City", "address-level2", "sm:col-span-3")}
          {part("region", "State or region", "address-level1", "sm:col-span-3")}
          {part("postal", "Postal code", "postal-code", "sm:col-span-2")}
          {part("country", "Country", "country-name", "sm:col-span-4")}
        </div>
      );
      break;
    }
    case "dropdown":
      input = <Dropdown id={id} value={str} options={f.options ?? []} onChange={onChange} placeholder={f.placeholder} invalid={!!error} disabled={disabled} describedBy={describedBy} />;
      break;
    case "single": {
      const opts = f.options ?? [];
      const isOther = !!f.other && (otherOn || (!!str && !opts.some((o) => o.toLowerCase() === str.toLowerCase())));
      input = (
        <div role="radiogroup" aria-labelledby={`${id}-label`} aria-describedby={describedBy} className={`grid gap-2 ${opts.length > 4 && opts.every((o) => o.length < 28) ? "sm:grid-cols-2" : ""}`}>
          {opts.map((o) => (
            <Choice
              key={o}
              on={!isOther && str === o}
              kind="radio"
              label={o}
              disabled={disabled}
              onClick={() => {
                setOtherOn(false);
                onChange(o);
              }}
            />
          ))}
          {f.other ? (
            <Choice
              on={isOther}
              kind="radio"
              label="Other"
              disabled={disabled}
              onClick={() => {
                setOtherOn(true);
                onChange("");
              }}
            />
          ) : null}
          {isOther ? <input disabled={disabled} aria-label="Other" placeholder="Type your answer" autoFocus value={str} maxLength={200} onChange={(e) => onChange(e.target.value)} className={`${BOX} ${border()} sm:col-span-2`} /> : null}
        </div>
      );
      break;
    }
    case "multi": {
      const opts = f.options ?? [];
      const toggle = (o: string) => onChange(list.includes(o) ? list.filter((x) => x !== o) : [...list, o]);
      input = (
        <div role="group" aria-labelledby={`${id}-label`} aria-describedby={describedBy} className={`grid gap-2 ${opts.length > 4 && opts.every((o) => o.length < 28) ? "sm:grid-cols-2" : ""}`}>
          {opts.map((o) => (
            <Choice key={o} on={list.includes(o)} kind="check" label={o} disabled={disabled} onClick={() => toggle(o)} />
          ))}
        </div>
      );
      break;
    }
    case "yes_no":
      input = (
        <div role="radiogroup" aria-labelledby={`${id}-label`} aria-describedby={describedBy} className="grid max-w-80 grid-cols-2 gap-2">
          <Choice on={value === true} kind="radio" label={f.options?.[0] ?? "Yes"} disabled={disabled} onClick={() => onChange(true)} />
          <Choice on={value === false} kind="radio" label={f.options?.[1] ?? "No"} disabled={disabled} onClick={() => onChange(false)} />
        </div>
      );
      break;
    case "agree":
      return (
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            role="checkbox"
            aria-checked={value === true}
            aria-describedby={describedBy}
            disabled={disabled}
            onClick={() => onChange(value === true ? false : true)}
            className="flex items-start gap-2.5 text-left text-[14px] text-[var(--f-text)] disabled:opacity-60"
          >
            <span aria-hidden="true" className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[3px] border ${value === true ? "border-[var(--fa)] bg-[var(--fa)] text-[var(--fa-ink)]" : error ? "border-danger bg-[var(--f-field)]" : "border-[var(--f-border)] bg-[var(--f-field)]"}`}>
              {value === true ? <Check /> : null}
            </span>
            <span>
              {f.label}
              {f.required ? <span className="text-[var(--f-faint)]"> *</span> : null}
            </span>
          </button>
          {f.help ? <p id={helpId} className="pl-6.5 text-[13px] text-[var(--f-muted)]">{f.help}</p> : null}
          {error ? <p id={errId} className="pl-6.5 text-[12.5px] text-danger">{error}</p> : null}
        </div>
      );
    case "rating": {
      const max = f.max ?? 5;
      input = (
        <div role="radiogroup" aria-labelledby={`${id}-label`} aria-describedby={describedBy} className="flex gap-1 text-[var(--f-faint)]">
          {Array.from({ length: max }, (_, i) => i + 1).map((v) => (
            <button key={v} type="button" role="radio" aria-checked={value === v} aria-label={`${v} of ${max}`} disabled={disabled} onClick={() => onChange(v)} className="rounded-[var(--f-radius)] p-0.5 hover:text-[var(--f-hover)]">
              <Star on={typeof value === "number" && value >= v} />
            </button>
          ))}
        </div>
      );
      break;
    }
    case "nps":
      input = <Steps id={`${id}-label`} lo={0} hi={10} value={value} onChange={onChange} minLabel={f.minLabel ?? "Not likely"} maxLabel={f.maxLabel ?? "Very likely"} disabled={disabled} />;
      break;
    case "scale":
      input = <Steps id={`${id}-label`} lo={f.min ?? 1} hi={f.max ?? 5} value={value} onChange={onChange} minLabel={f.minLabel} maxLabel={f.maxLabel} disabled={disabled} />;
      break;
    case "ranking": {
      const order = list.length === (f.options ?? []).length ? list : (f.options ?? []);
      const move = (i: number, d: number) => {
        const next = [...order];
        const [x] = next.splice(i, 1);
        next.splice(i + d, 0, x!);
        onChange(next);
      };
      input = (
        <ol aria-labelledby={`${id}-label`} aria-describedby={describedBy} className="flex flex-col gap-1.5">
          {order.map((o, i) => (
            <li key={o} className="cf-opt flex h-10 items-center gap-2 rounded-[var(--f-radius)] border border-[var(--f-border)] bg-[var(--f-field)] pr-1 pl-3 text-[14px]">
              <span className="w-5 font-mono text-[12px] text-[var(--f-muted)] tabular-nums">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">{o}</span>
              <button type="button" aria-label={`Move ${o} up`} disabled={disabled || i === 0} onClick={() => move(i, -1)} className="flex size-8 items-center justify-center rounded-[var(--f-radius)] text-[var(--f-muted)] hover:bg-[var(--f-soft)] hover:text-[var(--f-text)] disabled:opacity-30">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m18 15-6-6-6 6" /></svg>
              </button>
              <button type="button" aria-label={`Move ${o} down`} disabled={disabled || i === order.length - 1} onClick={() => move(i, 1)} className="flex size-8 items-center justify-center rounded-[var(--f-radius)] text-[var(--f-muted)] hover:bg-[var(--f-soft)] hover:text-[var(--f-text)] disabled:opacity-30">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
              </button>
            </li>
          ))}
        </ol>
      );
      break;
    }
    case "matrix": {
      const cols = f.options ?? [];
      input = (
        <div className="overflow-x-auto rounded-[min(var(--f-radius),12px)] border border-[var(--f-border)] bg-[var(--f-field)]" aria-describedby={describedBy}>
          <table className="w-full border-collapse text-[13.5px]">
            <thead>
              <tr>
                <th className="border-b border-[var(--f-border)] p-2" />
                {cols.map((c) => (
                  <th key={c} scope="col" className="border-b border-[var(--f-border)] px-2 py-2 text-center text-[12px] font-medium text-[var(--f-muted)]">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(f.rows ?? []).map((r) => (
                <tr key={r} role="radiogroup" aria-label={r} className="border-b border-[var(--f-border)] last:border-b-0">
                  <th scope="row" className="px-3 py-2 text-left font-normal text-[var(--f-text)]">{r}</th>
                  {cols.map((c) => (
                    <td key={c} className="px-2 py-2 text-center">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={obj[r] === c}
                        aria-label={`${r}: ${c}`}
                        disabled={disabled}
                        onClick={() => onChange({ ...obj, [r]: c })}
                        className={`inline-flex size-5 items-center justify-center rounded-full border ${obj[r] === c ? "border-[var(--fa)] bg-[var(--fa)]" : "border-[var(--f-border)] bg-[var(--f-field)] hover:border-[var(--f-hover)]"}`}
                      >
                        {obj[r] === c ? <span className="size-2 rounded-full bg-[var(--fa-ink)]" /> : null}
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      break;
    }
    case "file": {
      const max = f.maxFiles ?? 1;
      const add = (picked: FileList | null) => {
        if (!picked || !onFiles) return;
        const next = [...files, ...Array.from(picked)].slice(0, max);
        onFiles(next);
      };
      input = (
        <div className="flex flex-col gap-2">
          <label
            htmlFor={id}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              if (!disabled) add(e.dataTransfer.files);
            }}
            className={`flex min-h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-[var(--f-radius)] border border-dashed bg-[var(--f-field)] px-3 py-4 text-center text-[13.5px] ${drag ? "border-[var(--fa)] bg-[var(--f-soft)]" : error ? "border-danger" : "border-[var(--f-border)] hover:border-[var(--f-hover)]"} ${disabled || files.length >= max ? "pointer-events-none opacity-60" : ""}`}
          >
            <span className="text-[var(--f-text)]">Drop {max === 1 ? "a file" : "files"} here or <span className="underline underline-offset-2">browse</span></span>
            <span className="text-[12px] text-[var(--f-muted)]">Up to 10 MB{max > 1 ? `, ${max} files` : ""}</span>
            <input {...common} type="file" multiple={max > 1} className="sr-only" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
          </label>
          {files.length ? (
            <ul className="flex flex-col gap-1">
              {files.map((x, i) => (
                <li key={`${x.name}-${i}`} className="flex items-center gap-2 rounded-[var(--f-radius)] border border-[var(--f-border)] bg-[var(--f-field)] px-3 py-1.5 text-[13px]">
                  <span className="min-w-0 flex-1 truncate">{x.name}</span>
                  <span className={`font-mono text-[11px] ${x.size > MAX_FILE_BYTES ? "text-danger" : "text-[var(--f-muted)]"}`}>{x.size < 1024 * 1024 ? `${Math.max(1, Math.round(x.size / 1024))} KB` : `${(x.size / 1024 / 1024).toFixed(1)} MB`}</span>
                  <button type="button" aria-label={`Remove ${x.name}`} onClick={() => onFiles?.(files.filter((_, j) => j !== i))} className="rounded-[var(--f-radius)] p-1 text-[var(--f-muted)] hover:bg-[var(--f-soft)] hover:text-[var(--f-text)]">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      );
      break;
    }
    case "signature":
      input = <Signature id={id} disabled={disabled} invalid={!!error} onChange={(file) => onFiles?.(file ? [file] : [])} />;
      break;
    default:
      input = null;
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label}
      {f.help ? <p id={helpId} className="-mt-0.5 text-[13px] leading-relaxed text-[var(--f-muted)]">{f.help}</p> : null}
      {input}
      {error ? <p id={errId} className="text-[12.5px] text-danger">{error}</p> : null}
    </div>
  );
}
