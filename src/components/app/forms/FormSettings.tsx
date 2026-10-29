"use client";

// The Settings tab's own sections (docs/form-studio.md Part 3): what visitors get after the submit (a message, a page or
// a meeting), fields hidden when enrichment knows them, the consent box and the spam checks.

import { cleanLink } from "@/lib/forms/meeting";
import type { Op } from "@/lib/forms/ops";
import { linkProblem } from "@/lib/forms/schedule";
import { allFields, DEFAULT_CONSENT, DEFAULT_NOTICE, HIDE_KEYS, hideKeyOf, type Form } from "@/lib/forms/schema";
import { Chat, Clock, Link as LinkIcon } from "../../Icons";
import { Select } from "../Select";
import { Input, Segmented, Toggle, useLoad, must, type ViewProps } from "../ui";
import { Meeting } from "./Meeting";
import { AREA, Group, LinkInput, OptionCard, Row, SEL, Section } from "./SettingsParts";

export type AfterKind = "message" | "page" | "meeting";
export const afterKind = (form: Form): AfterKind => (form.after.schedule ? "meeting" : form.after.end.kind === "redirect" ? "page" : "message");
const THANKS = { kind: "message" as const, title: "Thanks, we got it.", text: "We'll be in touch soon." };

export function AfterSubmit({ form, apply, sb, ws, session, role }: { form: Form; apply: (op: Op) => void } & Pick<ViewProps, "sb" | "ws" | "session" | "role">) {
  const kind = afterKind(form);
  const end = form.after.end;
  const pick = (k: AfterKind) => {
    if (k === kind) return;
    if (k !== "meeting" && form.after.schedule) apply({ op: "set_schedule", schedule: null });
    if (k === "page") apply({ op: "set_after", end: { kind: "redirect", url: "" } });
    else if (end.kind === "redirect") apply({ op: "set_after", end: THANKS });
    if (k === "meeting") apply({ op: "set_schedule", schedule: { tool: "claritia", url: "", perOwner: false } });
  };
  const page = end.kind === "redirect" ? (end.url ? linkProblem("link", end.url) : null) : null;
  return (
    <Section id="after" title="On submission">
      <div role="radiogroup" aria-label="On submission" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <OptionCard picked={kind === "message"} onPick={() => pick("message")} icon={<Chat size={16} />} title="Pop-up message" />
        <OptionCard picked={kind === "page"} onPick={() => pick("page")} icon={<LinkIcon size={16} />} title="Redirect to another page" />
        <OptionCard picked={kind === "meeting"} onPick={() => pick("meeting")} icon={<Clock size={16} />} title="Book a meeting" />
      </div>
      {kind === "message" && end.kind === "message" ? (
        <div key="message" className="anim-rise-sm flex flex-col gap-4">
          <Group label="Heading" htmlFor="end-title">
            <Input id="end-title" value={end.title} onChange={(e) => apply({ op: "set_after", end: { ...end, title: e.target.value } })} />
          </Group>
          <Group label="Text" htmlFor="end-text">
            <textarea id="end-text" value={end.text ?? ""} rows={3} onChange={(e) => apply({ op: "set_after", end: { ...end, text: e.target.value || undefined } })} className={AREA} />
          </Group>
        </div>
      ) : null}
      {kind === "page" && end.kind === "redirect" ? (
        <div key="page" className="anim-rise-sm">
          <Group label="Page" htmlFor="end-url">
            <LinkInput
              id="end-url"
              value={end.url}
              onChange={(v) => apply({ op: "set_after", end: { kind: "redirect", url: v.trim() } })}
              onBlur={(v) => cleanLink(v) !== end.url && apply({ op: "set_after", end: { kind: "redirect", url: cleanLink(v) } })}
              problem={page}
              ok={!!end.url && !page}
              placeholder="https://acme.com/thanks"
            />
          </Group>
        </div>
      ) : null}
      {kind === "meeting" ? (
        <div key="meeting" className="anim-rise-sm flex flex-col gap-6">
          <Meeting form={form} apply={apply} sb={sb} ws={ws} session={session} role={role} />
        </div>
      ) : null}
    </Section>
  );
}

export function ConsentSettings({ form, apply, sb, ws }: { form: Form; apply: (op: Op) => void } & Pick<ViewProps, "sb" | "ws">) {
  const topics = useLoad(async () => (must(await sb.from("topics").select("id, name").eq("workspace_id", ws.id).order("name")) ?? []) as { id: string; name: string }[], `${ws.id}:topics`);
  const mode = form.consent.mode;
  return (
    <Section id="consent" title="Consent">
      <Group label="Email consent">
        <div className="overflow-x-auto">
          <Segmented
            label="Email consent"
            value={mode}
            options={[
              { value: "by_region", label: "Where the law asks" },
              { value: "always", label: "Always" },
              { value: "notice", label: "Notice" },
              { value: "off", label: "Off" },
            ]}
            onChange={(m) => {
              const swap = m === "notice" ? form.consent.label === DEFAULT_CONSENT && DEFAULT_NOTICE : form.consent.label === DEFAULT_NOTICE && DEFAULT_CONSENT;
              apply({ op: "set_consent", mode: m, ...(swap ? { label: swap } : {}) });
            }}
          />
        </div>
      </Group>
      {mode !== "off" ? (
        <Group label={mode === "notice" ? "Notice text" : "Box text"} htmlFor="consent-label">
          <textarea
            id="consent-label"
            value={form.consent.label}
            rows={2}
            onChange={(e) => apply({ op: "set_consent", label: e.target.value })}
            onBlur={(e) => !e.target.value.trim() && apply({ op: "set_consent", label: mode === "notice" ? DEFAULT_NOTICE : DEFAULT_CONSENT })}
            className={AREA}
          />
        </Group>
      ) : null}
      {(mode === "by_region" || mode === "always") && topics.data?.length ? (
        <Group label="Email topic">
          <Select
            className={`h-10 ${SEL}`}
            ariaLabel="Email topic"
            value={form.consent.topicId ?? ""}
            options={[{ value: "", label: "None" }, ...topics.data.map((t) => ({ value: t.id, label: t.name }))]}
            onChange={(v) => apply({ op: "set_consent", topicId: v || null })}
          />
        </Group>
      ) : null}
    </Section>
  );
}

export function SpamSettings({ form, apply }: { form: Form; apply: (op: Op) => void }) {
  const secs = form.spam.minSeconds;
  return (
    <Section id="spam" title="Spam">
      <div className="-my-2 flex flex-col divide-y divide-line">
        <div className="py-2">
          <Row label="Fastest human fill">
            <span className="flex items-center gap-2">
              <Input
                aria-label="Fastest human fill in seconds"
                type="number"
                inputMode="numeric"
                min={0}
                max={30}
                value={secs}
                onChange={(e) => {
                  const n = Math.round(Number(e.target.value));
                  if (e.target.value !== "" && Number.isFinite(n)) apply({ op: "set_spam", minSeconds: Math.min(30, Math.max(0, n)) });
                }}
                className="h-9 w-20 text-right tabular-nums"
              />
              <span className="text-[13px] text-muted">sec</span>
            </span>
          </Row>
        </div>
        <div className="py-2">
          <Row label="Cloudflare Turnstile">
            <Toggle label="Cloudflare Turnstile" on={form.spam.turnstile} onChange={(v) => apply({ op: "set_spam", turnstile: v })} />
          </Row>
        </div>
      </div>
    </Section>
  );
}

/** Fill before submit: the fields that fold away when enrichment already knows the person (an email is typed first). */
export function KnownSettings({ form, apply }: { form: Form; apply: (op: Op) => void }) {
  const on = !!form.enrich?.hideKnown;
  const picked = new Set(form.enrich?.fields ?? []);
  const fields = allFields(form).filter((f) => HIDE_KEYS.includes(hideKeyOf(f.key)));
  const toggle = (key: string) => {
    const next = new Set(picked);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    apply({ op: "set_enrich", fields: [...next] });
  };
  return (
    <Section id="known" title="Known fields">
      <div className="-my-2 flex flex-col divide-y divide-line">
        <div className="py-2">
          <Row label="Hide fields we already know">
            <Toggle label="Hide fields we already know" on={on} onChange={(v) => apply({ op: "set_enrich", hideKnown: v, ...(v && !picked.size ? { fields: fields.map((f) => hideKeyOf(f.key)) } : {}) })} />
          </Row>
        </div>
        {on ? (
          <div className="flex flex-wrap gap-2 py-3">
            {fields.length ? (
              fields.map((f) => {
                const k = hideKeyOf(f.key);
                const yes = picked.has(k);
                return (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={yes}
                    onClick={() => toggle(k)}
                    className={`press inline-flex h-8 items-center rounded-full border px-3 text-[12.5px] font-medium transition-colors duration-[140ms] ${yes ? "border-ink bg-ink text-paper" : "border-line-strong bg-card text-body hover:text-ink"}`}
                  >
                    {f.label}
                  </button>
                );
              })
            ) : (
              <p className="text-[13px] text-muted">No company, title, country or phone fields yet</p>
            )}
          </div>
        ) : null}
      </div>
    </Section>
  );
}
