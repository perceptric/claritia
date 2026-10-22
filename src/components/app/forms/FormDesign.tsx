"use client";

// The Design tab (docs/form-builder.md Part 5): which brand kit styles the form, and the kit's tokens. A kit is
// shared by every form on the site, so changing it restyles them all. The server checks every token and fixes
// colors visitors couldn't read.

import { useState } from "react";
import { DEFAULT_TOKENS, type Tokens } from "@/lib/forms/brand";
import type { Op } from "@/lib/forms/ops";
import type { Form } from "@/lib/forms/schema";
import { Select } from "../Select";
import { Button, ErrorNote, errorText, Field, Input, Segmented } from "../ui";
import { ColorInput, NumberInput, type Kit } from "./shared";

const SEL = "h-9 w-full rounded-md border border-line bg-panel px-2.5 text-[13px] hover:border-line-strong";
const NEW = "__new";

const COLORS: [keyof Tokens, string][] = [
  ["text", "Text"],
  ["muted", "Gray text"],
  ["background", "Background"],
  ["inputBg", "Field background"],
  ["border", "Field border"],
  ["accent", "Focus"],
  ["buttonBg", "Button"],
  ["buttonText", "Button text"],
  ["error", "Errors"],
];
const SIZES: [keyof Tokens, string, number, number][] = [
  ["fontSize", "Text size", 12, 22],
  ["labelSize", "Label size", 11, 22],
  ["inputHeight", "Field height", 30, 72],
  ["radius", "Field corners", 0, 32],
  ["buttonRadius", "Button corners", 0, 60],
  ["borderWidth", "Border", 0, 4],
  ["gap", "Spacing", 6, 40],
];

export function FormDesign({
  form,
  apply,
  kits,
  kitId,
  setKit,
  tokens,
  setTokens,
  saveKit,
  scan,
  site,
}: {
  form: Form;
  apply: (op: Op) => void;
  kits: Kit[];
  kitId: string | null;
  setKit: (id: string | null) => void;
  tokens: Partial<Tokens>;
  setTokens: (t: Partial<Tokens>) => void;
  saveKit: (name: string, tokens: Partial<Tokens>) => Promise<{ notes: string[] }>;
  scan: (url: string) => Promise<void>;
  site: string;
}) {
  const kit = kits.find((k) => k.id === kitId) ?? null;
  const t = { ...DEFAULT_TOKENS, ...tokens };
  const [name, setName] = useState(kit?.name ?? "Brand");
  const [notes, setNotes] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState(site);
  const set = (k: keyof Tokens, v: string | number) => setTokens({ ...tokens, [k]: v });
  const scanning = kit?.scan_status === "scanning";
  return (
    <div className="flex flex-col gap-5">
      <form
        className="flex items-end gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setBusy(true);
          try {
            await scan(url);
          } catch (err) {
            setError(errorText(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="flex-1">
          <Field label="Site">
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="acme.com" />
          </Field>
        </div>
        <Button type="submit" variant="ghost" disabled={busy || scanning || !url.trim()}>
          {scanning ? "Scanning…" : "Scan site"}
        </Button>
      </form>
      {kit?.scan_status === "failed" && kit.scan_error ? <ErrorNote message={kit.scan_error} /> : null}
      {kit?.scan_status === "done" && kit.notes.length ? (
        <ul className="flex flex-col gap-1 text-[12.5px] text-body">
          {kit.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Brand kit">
          <Select<string>
            value={kitId ?? NEW}
            options={[...kits.map((k) => ({ value: k.id, label: k.name })), { value: NEW, label: "New kit" }]}
            onChange={(v) => {
              const k = kits.find((x) => x.id === v);
              setKit(k ? k.id : null);
              setName(k?.name ?? "Brand");
              setTokens(k?.tokens ?? {});
              setNotes([]);
            }}
            ariaLabel="Brand kit"
            className={SEL}
          />
        </Field>
        <Field label="Kit name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Segmented
          label="Labels"
          value={form.layout.labels}
          options={[
            { value: "above", label: "Labels above" },
            { value: "inside", label: "Labels inside" },
          ]}
          onChange={(labels) => apply({ op: "set_layout", labels })}
        />
        <Segmented
          label="Width"
          value={form.layout.width}
          options={[
            { value: "narrow", label: "Narrow" },
            { value: "wide", label: "Wide" },
          ]}
          onChange={(width) => apply({ op: "set_layout", width })}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Field label="Font">
            <Input value={t.font} onChange={(e) => set("font", e.target.value)} />
          </Field>
        </div>
        <div className="col-span-2">
          <Field label="Google Fonts link">
            <Input value={t.fontUrl} onChange={(e) => set("fontUrl", e.target.value)} placeholder="https://fonts.googleapis.com/css2?family=…" />
          </Field>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        {COLORS.map(([k, label]) => (
          <ColorInput key={k} label={label} value={String(t[k])} onChange={(v) => set(k, v)} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {SIZES.map(([k, label, min, max]) => (
          <NumberInput key={k} label={label} value={Number(t[k])} min={min} max={max} onChange={(v) => set(k, v)} />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          label="Button text"
          value={t.buttonCase}
          options={[
            { value: "none", label: "Aa" },
            { value: "uppercase", label: "AA" },
          ]}
          onChange={(v) => set("buttonCase", v)}
        />
        <Segmented
          label="Button weight"
          value={String(t.buttonWeight)}
          options={["400", "500", "600", "700"].map((w) => ({ value: w, label: w }))}
          onChange={(v) => set("buttonWeight", Number(v))}
        />
      </div>
      <ErrorNote message={error} />
      {notes.length ? (
        <ul className="flex flex-col gap-1 text-[12.5px] text-body">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
      <div>
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              setNotes((await saveKit(name, tokens)).notes);
            } catch (e) {
              setError(errorText(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {kit ? "Save kit" : "Create kit"}
        </Button>
      </div>
    </div>
  );
}
