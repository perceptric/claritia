"use client";

// The Settings tab: the form's own words, the consent box, spam checks, and what visitors see after they send it.

import { useState } from "react";
import type { Op } from "@/lib/forms/ops";
import { SCHEDULERS, type SchedulerTool } from "@/lib/forms/schedule";
import { DEFAULT_CONSENT, DEFAULT_NOTICE, type Form } from "@/lib/forms/schema";
import { BrandLogo } from "../BrandLogo";
import { Select } from "../Select";
import { ErrorNote, errorText, Field, Input, must, Segmented, useLoad, type ViewProps } from "../ui";
import { NumberInput, Toggle } from "./shared";

const AREA = "w-full rounded-md border border-line bg-panel px-2.5 py-2 text-[13px] text-ink outline-none focus:border-ink";

export function FormSettings({ form, apply, sb, ws, session, role }: { form: Form; apply: (op: Op) => void } & Pick<ViewProps, "sb" | "ws" | "session" | "role">) {
  const topics = useLoad(async () => (must(await sb.from("topics").select("id, name").eq("workspace_id", ws.id).order("name")) ?? []) as { id: string; name: string }[], `${ws.id}:topics`);
  const end = form.after.end;
  const sch = form.after.schedule;
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h3 className="label-mono">Meeting after the submit</h3>
        <Segmented
          label="Meeting after the submit"
          value={sch ? "on" : "off"}
          options={[
            { value: "off", label: "Off" },
            { value: "on", label: "Book a meeting" },
          ]}
          onChange={(v) => apply({ op: "set_schedule", schedule: v === "on" ? { tool: "calendly", url: "", perOwner: true } : null })}
        />
        {sch ? (
          <>
            <div className="grid grid-cols-2 border-t border-l border-line sm:grid-cols-3">
              {SCHEDULERS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  aria-pressed={sch.tool === t.value}
                  onClick={() => apply({ op: "set_schedule", schedule: { ...sch, tool: t.value } })}
                  className={`flex items-center gap-2 border-r border-b border-line px-3 py-2.5 text-left text-[13px] ${sch.tool === t.value ? "bg-hover font-medium text-ink" : "bg-panel text-body hover:bg-hover"}`}
                >
                  {t.domain ? <BrandLogo domain={t.domain} name={t.label} size={18} /> : null}
                  {t.label}
                </button>
              ))}
            </div>
            <Field label="Team booking link">
              <Input value={sch.url} onChange={(e) => apply({ op: "set_schedule", schedule: { ...sch, url: e.target.value.trim() } })} placeholder="https://" />
            </Field>
            <Toggle label="Book with the contact's owner when they have a link" checked={sch.perOwner} onChange={(v) => apply({ op: "set_schedule", schedule: { ...sch, perOwner: v } })} />
            {sch.perOwner ? <OwnerLinks sb={sb} ws={ws} session={session} role={role} tool={sch.tool} /> : null}
          </>
        ) : null}
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
            { value: "notice", label: "Notice" },
            { value: "off", label: "Off" },
          ]}
          onChange={(mode) => {
            const swap = mode === "notice" ? form.consent.label === DEFAULT_CONSENT && DEFAULT_NOTICE : form.consent.label === DEFAULT_NOTICE && DEFAULT_CONSENT;
            apply({ op: "set_consent", mode, ...(swap ? { label: swap } : {}) });
          }}
        />
        {(form.consent.mode === "by_region" || form.consent.mode === "always") && topics.data?.length ? (
          <Field label="Email topic">
            <Select
              ariaLabel="Email topic"
              value={form.consent.topicId ?? ""}
              options={[{ value: "", label: "None" }, ...topics.data.map((t) => ({ value: t.id, label: t.name }))]}
              onChange={(v) => apply({ op: "set_consent", topicId: v || null })}
            />
          </Field>
        ) : null}
        {form.consent.mode !== "off" ? (
          <Field label={form.consent.mode === "notice" ? "Notice text" : "Box text"}>
            <textarea value={form.consent.label} rows={2} onChange={(e) => apply({ op: "set_consent", label: e.target.value })} onBlur={(e) => !e.target.value.trim() && apply({ op: "set_consent", label: form.consent.mode === "notice" ? DEFAULT_NOTICE : DEFAULT_CONSENT })} className={AREA} />
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

/** Each teammate's own booking link for the tool. People set their own; owners set anyone's. */
function OwnerLinks({ sb, ws, session, role, tool }: Pick<ViewProps, "sb" | "ws" | "session" | "role"> & { tool: SchedulerTool }) {
  const data = useLoad(async () => {
    const [people, links] = await Promise.all([sb.rpc("workspace_people", { p_ws: ws.id }), sb.from("scheduler_links").select("user_id, url").eq("workspace_id", ws.id).eq("tool", tool)]);
    return { people: (must(people) ?? []) as { id: string; email: string }[], links: new Map(((must(links) ?? []) as { user_id: string; url: string }[]).map((l) => [l.user_id, l.url])) };
  }, `${ws.id}:${tool}`);
  const [error, setError] = useState("");
  if (!data.data) return null;
  const save = async (user: string, url: string) => {
    setError("");
    try {
      must(await sb.rpc("scheduler_link_save", { p_ws: ws.id, p_user: user, p_tool: tool, p_url: url }));
    } catch (e) {
      setError(errorText(e));
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <ErrorNote message={error} />
      {data.data.people.map((p) => (
        <label key={p.id} className="grid grid-cols-[180px_1fr] items-center gap-2 text-[13px]">
          <span className="truncate text-body">{p.email}</span>
          <Input defaultValue={data.data!.links.get(p.id) ?? ""} disabled={role !== "owner" && p.id !== session.user.id} placeholder="https://" onBlur={(e) => void save(p.id, e.target.value.trim())} />
        </label>
      ))}
    </div>
  );
}
