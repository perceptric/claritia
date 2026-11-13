"use client";

// Parts of Emails › Audiences (docs/email-studio-plan.md, the Brew comparison, step 2): the forms a list fills from
// (list_forms, 157: each new fill of those forms joins the list), and the history of imports.

import type { SupabaseClient } from "@supabase/supabase-js";
import { useState } from "react";
import { X } from "../../Icons";
import { Select } from "../Select";
import { Badge, ErrorNote, errorText, IconButton, invalidate, must, timeAgo, useQuery } from "../ui";

const n = (x: number) => x.toLocaleString("en-US");

/** The forms whose fills join this list, with Add a form. */
export function FillsFrom({ sb, ws, list }: { sb: SupabaseClient; ws: string; list: { id: string; name: string } }) {
  const forms = useQuery(`forms_names:${ws}`, async () => (must(await sb.from("forms").select("id, name").eq("workspace_id", ws).order("name")) ?? []) as { id: string; name: string }[]);
  const linked = useQuery(`list_forms:${list.id}`, async () => ((must(await sb.from("list_forms").select("form_id").eq("list_id", list.id)) ?? []) as { form_id: string }[]).map((x) => x.form_id), { staleMs: 0 });
  const [error, setError] = useState("");
  const set = async (form: string, on: boolean) => {
    setError("");
    try {
      must(await sb.rpc("list_form_set", { p_ws: ws, p_list: list.id, p_form: form, p_on: on }));
      invalidate(`list_forms:${list.id}`);
      invalidate(`form_lists:${form}`);
      void linked.reload();
    } catch (e) {
      setError(errorText(e));
    }
  };
  if (!forms.data || !linked.data) return null;
  const on = forms.data.filter((f) => linked.data!.includes(f.id));
  const off = forms.data.filter((f) => !linked.data!.includes(f.id));
  return (
    <div className="mb-3 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-card px-3.5 py-2.5 shadow-rest">
        <span className="mr-1 text-[12.5px] font-medium text-muted">Fills from</span>
        {on.map((f) => (
          <span key={f.id} className="inline-flex min-h-7 items-center gap-1 rounded-full bg-card py-0.5 pr-1 pl-3 text-[12.5px] font-medium text-ink shadow-chip">
            <span className="min-w-0 break-words">{f.name}</span>
            <IconButton label={`Stop adding fills of ${f.name}`} onClick={() => void set(f.id, false)} className="size-5">
              <X size={11} />
            </IconButton>
          </span>
        ))}
        {off.length ? (
          <Select<string>
            ariaLabel="Add a form"
            value=""
            placeholder="Add a form"
            plainPlaceholder
            onChange={(id) => void set(id, true)}
            options={off.map((f) => ({ value: f.id, label: f.name }))}
            menuWidth={240}
            className="h-7 rounded-full bg-card px-3 text-[12.5px] font-medium text-ink shadow-chip"
          />
        ) : null}
      </div>
      <ErrorNote message={error} />
    </div>
  );
}

type Logged = { id: string; list_name: string; file_name: string; rows_in: number; added: number; skipped: number; disposable: number; shared: number; held: number; created_at: string };

/** What came in, newest first. */
export function ImportHistory({ sb, ws }: { sb: SupabaseClient; ws: string }) {
  const log = useQuery(`contact_import_log:${ws}`, async () => (must(await sb.from("contact_import_log").select("id, list_name, file_name, rows_in, added, skipped, disposable, shared, held, created_at").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(20)) ?? []) as Logged[]);
  if (log.error) return <ErrorNote message={log.error} />;
  if (!log.data?.length) return null;
  return (
    <section aria-label="Imports" className="mt-6 flex flex-col gap-2">
      <h2 className="text-[13.5px] font-medium text-ink">Imports</h2>
      <ul className="overflow-hidden rounded-lg bg-card shadow-rest">
        {log.data.map((r) => {
          const left = r.skipped + r.disposable;
          return (
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-2.5 last:border-b-0">
              <span className="min-w-0 font-medium wrap-anywhere text-ink">{r.file_name || "Pasted"}</span>
              <span className="text-muted">{r.list_name}</span>
              {r.held ? <Badge tone="amber">{n(r.held)} waiting for an owner</Badge> : <Badge tone="green">{n(r.added)} added</Badge>}
              {left ? <span className="text-[12.5px] text-muted">{n(left)} left out</span> : null}
              {r.shared ? <span className="text-[12.5px] text-muted">{n(r.shared)} shared {r.shared === 1 ? "inbox" : "inboxes"}</span> : null}
              <span className="ml-auto text-[12.5px] text-muted">{timeAgo(r.created_at)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
