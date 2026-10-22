"use client";

// The Settings tab: the form's own words, the consent box, spam checks, and what visitors see after they send it.

import type { Op } from "@/lib/forms/ops";
import { DEFAULT_CONSENT, type Form } from "@/lib/forms/schema";
import { Field, Input, Segmented } from "../ui";
import { NumberInput, Toggle } from "./shared";

const AREA = "w-full rounded-md border border-line bg-panel px-2.5 py-2 text-[13px] text-ink outline-none focus:border-ink";

export function FormSettings({ form, apply }: { form: Form; apply: (op: Op) => void }) {
  const end = form.after.end;
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h3 className="label-mono">Text</h3>
        <Field label="Title">
          <Input value={form.title ?? ""} onChange={(e) => apply({ op: "set_copy", title: e.target.value })} />
        </Field>
        <Field label="Intro">
          <textarea value={form.intro ?? ""} rows={2} onChange={(e) => apply({ op: "set_copy", intro: e.target.value })} className={AREA} />
        </Field>
        <Field label="Button">
          <Input value={form.submit.label} onChange={(e) => apply({ op: "set_copy", submit: e.target.value })} />
        </Field>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="label-mono">After the submit</h3>
        <Segmented
          label="After the submit"
          value={end.kind}
          options={[
            { value: "message", label: "Message" },
            { value: "redirect", label: "Open a page" },
          ]}
          onChange={(k) => apply({ op: "set_after", end: k === "message" ? { kind: "message", title: "Thanks, we got it." } : { kind: "redirect", url: "https://" } })}
        />
        {end.kind === "message" ? (
          <>
            <Field label="Heading">
              <Input value={end.title} onChange={(e) => apply({ op: "set_after", end: { ...end, title: e.target.value } })} />
            </Field>
            <Field label="Text">
              <textarea value={end.text ?? ""} rows={2} onChange={(e) => apply({ op: "set_after", end: { ...end, text: e.target.value || undefined } })} className={AREA} />
            </Field>
          </>
        ) : (
          <Field label="Page">
            <Input value={end.url} onChange={(e) => apply({ op: "set_after", end: { kind: "redirect", url: e.target.value } })} placeholder="https://acme.com/thanks" />
          </Field>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="label-mono">Email consent</h3>
        <Segmented
          label="Email consent"
          value={form.consent.mode}
          options={[
            { value: "by_region", label: "Where the law asks" },
            { value: "always", label: "Always" },
            { value: "off", label: "Off" },
          ]}
          onChange={(mode) => apply({ op: "set_consent", mode })}
        />
        {form.consent.mode !== "off" ? (
          <Field label="Box text">
            <textarea value={form.consent.label} rows={2} onChange={(e) => apply({ op: "set_consent", label: e.target.value })} onBlur={(e) => !e.target.value.trim() && apply({ op: "set_consent", label: DEFAULT_CONSENT })} className={AREA} />
          </Field>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="label-mono">Spam</h3>
        <div className="grid grid-cols-2 items-end gap-3">
          <NumberInput label="Fastest human fill (seconds)" value={form.spam.minSeconds} min={0} max={30} onChange={(v) => apply({ op: "set_spam", minSeconds: v })} />
          <Toggle label="Cloudflare Turnstile" checked={form.spam.turnstile} onChange={(v) => apply({ op: "set_spam", turnstile: v })} />
        </div>
      </section>
    </div>
  );
}
