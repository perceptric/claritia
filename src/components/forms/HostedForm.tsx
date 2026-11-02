"use client";

import type { FormSchema, FormSettings } from "@/lib/forms/types";
import { FormView, type Outcome, type Payload } from "./FormView";

// A live form at /f/<slug>, on its own or inside the embed script's iframe. Sends answers and files to
// /api/forms/submit; a hiccup (network, 5xx, 429) is tried again with growing waits before the error shows.

const META = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid", "li_fat_id"];

export function HostedForm({ slug, schema, settings, region, turnstileKey, embed }: { slug: string; schema: FormSchema; settings: FormSettings; region: "strict" | "notice"; turnstileKey?: string; embed: boolean }) {
  const submit = async (p: Payload): Promise<Outcome> => {
    const q = new URLSearchParams(window.location.search);
    const meta: Record<string, string> = {};
    for (const k of META) if (q.get(k)) meta[k] = q.get(k)!;
    meta.page = q.get("page") || (embed ? document.referrer : window.location.href);
    meta.referrer = q.get("ref") || document.referrer;
    const build = () => {
      const fd = new FormData();
      fd.set("slug", slug);
      fd.set("payload", JSON.stringify({ answers: p.answers, ticked: p.ticked, token: p.token, hp: p.hp, started: p.started, meta }));
      for (const [k, list] of Object.entries(p.files)) for (const f of list) fd.append(`file:${k}`, f, f.name);
      return fd;
    };
    for (let i = 0; ; i++) {
      try {
        const res = await fetch("/api/forms/submit", { method: "POST", body: build() });
        const data = (await res.json().catch(() => ({}))) as Outcome & { error?: string };
        if (res.ok) return data;
        if ((res.status >= 500 || res.status === 429) && i < 2 && !("errors" in data && data.errors)) throw new Error(String(res.status));
        return { ok: false, errors: "errors" in data ? data.errors : undefined, error: data.error };
      } catch (e) {
        if (i >= 2) throw e;
        await new Promise((r) => setTimeout(r, 800 * 2 ** i));
      }
    }
  };
  return <FormView schema={schema} settings={settings} mode="live" region={region} onSubmit={submit} turnstileKey={turnstileKey} embed={embed} slug={slug} />;
}
