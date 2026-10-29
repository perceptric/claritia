"use client";

// The sync rules for one CRM destination (docs/form-builder.md 7.4), under its row in Sync leads to: what happens to
// a record the CRM already has, how existing records are found, the owner, who assigns, what a new Salesforce record
// is, and the consent box. Below them, failed deliveries with Retry, and Create anyway for possible duplicates.

import { useState } from "react";
import { DUPLICATE, rulesOf, type SyncRules as Rules } from "@/lib/delivery/rules";
import { allFields, type Form } from "@/lib/forms/schema";
import { Badge, Button, ErrorNote, errorText, must, Toggle, useLoad, type ViewProps } from "../ui";
import type { Destination } from "./shared";

/** What a destination made before sync rules does: answers overwrite, the owner is written, consent isn't sent. */
const BEFORE: Rules = { exists: "always", match: "email", owner: "route", assign: "claritia", consent: false, create: "Lead" };

export function SyncRules({ sb, d, vendor, form, save }: Pick<ViewProps, "sb"> & { d: Destination; vendor: string; form?: Form; save: (rules: Rules) => Promise<void> }) {
  const r = rulesOf(d.config) ?? BEFORE;
  const crm = vendor === "salesforce" ? "Salesforce" : d.name;
  const [error, setError] = useState("");
  const failed = useLoad(async () => (must(await sb.from("deliveries").select("id, error").eq("destination_id", d.id).eq("status", "failed").order("created_at", { ascending: false }).limit(200)) ?? []) as { id: string; error: string | null }[], `${d.id}:failed`);
  const set = (patch: Partial<Rules>) => void save({ ...r, ...patch });
  const replay = async (fn: "deliveries_replay" | "deliveries_create_anyway", ids: string[]) => {
    setError("");
    try {
      must(await sb.rpc(fn, { p_ids: ids }));
      failed.reload();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const keys = new Set(form ? allFields(form).map((f) => f.key) : []);
  const missing = vendor === "salesforce" && form ? [!keys.has("last_name") && !keys.has("name") ? "Last Name" : null, r.create === "Lead" && !keys.has("company") ? "Company" : null].filter(Boolean) : [];
  const dupes = (failed.data ?? []).filter((x) => x.error?.startsWith(DUPLICATE));
  const others = (failed.data ?? []).filter((x) => !x.error?.startsWith(DUPLICATE));

  const row = <T extends string>(label: string, key: keyof Rules, value: T, options: readonly (readonly [T, string])[]) => (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] text-muted">{label}</span>
      <span role="radiogroup" aria-label={`${d.name}: ${label}`} className="flex flex-wrap gap-1.5">
        {options.map(([v, l]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={value === v}
            onClick={() => value !== v && set({ [key]: v } as Partial<Rules>)}
            className={`press h-7 rounded-full border px-2.5 text-[12px] transition-colors duration-[120ms] ${value === v ? "border-ink bg-ink font-medium text-paper" : "border-line text-body hover:border-line-strong"}`}
          >
            {l}
          </button>
        ))}
      </span>
    </div>
  );

  return (
    <div className="flex flex-col gap-3 pt-1 pb-2 pl-[34px]">
      {row("When the record exists", "exists", r.exists, [["if_empty", "Fill empty fields only"], ["always", "Overwrite with new answers"], ["never", "Do not update"]])}
      {row("Find existing records by", "match", r.match, [["email", "Email"], ["email_name", "Email, then name and company domain"]])}
      {row("Who assigns new leads", "assign", r.assign, [["claritia", "Claritia routing rules"], ["crm", `${crm} assignment rules`]])}
      {r.assign === "claritia" ? row("Owner of existing records", "owner", r.owner, [["keep", "Keep the current owner"], ["route", "Set the owner from routing"]]) : null}
      {vendor === "salesforce" ? row("Create new leads as", "create", r.create, [["Lead", "Lead"], ["Contact", "Contact"]]) : null}
      <div className="flex items-center justify-between gap-3 text-[13px] text-body">
        Sync consent status
        <Toggle label={`${d.name}: sync consent status`} on={r.consent} onChange={(v) => set({ consent: v })} />
      </div>
      {missing.length ? (
        <p className="rounded-sm bg-butter-wash px-3 py-2 text-[12.5px] text-ink">
          {missing.join(" and ")} {missing.length === 1 ? "is" : "are"} required in Salesforce and not on this form. Salesforce gets “[not provided]”.
        </p>
      ) : null}
      <ErrorNote message={error || failed.error} />
      {dupes.length ? (
        <div className="flex flex-wrap items-center gap-2 rounded-sm bg-rose-wash px-3 py-2 text-[12.5px]">
          <Badge tone="red">{`${dupes.length} possible ${dupes.length === 1 ? "duplicate" : "duplicates"}`}</Badge>
          <span title={dupes[0]!.error ?? ""} className="min-w-0 flex-1 truncate text-ink">{dupes[0]!.error}</span>
          <Button size="sm" variant="ghost" onClick={() => void replay("deliveries_create_anyway", dupes.map((x) => x.id))}>
            Create anyway
          </Button>
        </div>
      ) : null}
      {others.length ? (
        <div className="flex flex-wrap items-center gap-2 rounded-sm bg-rose-wash px-3 py-2 text-[12.5px]">
          <Badge tone="red">{`${others.length} failed`}</Badge>
          <span title={others[0]!.error ?? ""} className="min-w-0 flex-1 truncate text-ink">{others[0]!.error}</span>
          <Button size="sm" variant="ghost" onClick={() => void replay("deliveries_replay", others.map((x) => x.id))}>
            {`Retry ${others.length}`}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

