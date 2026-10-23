"use client";

// The Fills tab (docs/form-builder.md 7.3): each submission with its answers, page and UTMs, the contact it made,
// and one line per destination with its state, a link to the record and Replay for failed ones.

import { useEffect, useState } from "react";
import { allFields, type Form } from "@/lib/forms/schema";
import { ChevronRight, Link as LinkIcon, Refresh } from "../../Icons";
import { Sketch } from "../../sketches/Sketch";
import { Badge, Button, Empty, ErrorNote, errorText, Loading, must, Panel, Segmented, timeAgo, useLoad, type ViewProps } from "../ui";
import { DELIVERY, type Destination } from "./shared";

type Fill = {
  id: string;
  created_at: string;
  values: Record<string, unknown>;
  hidden: Record<string, string>;
  test: boolean;
  spam: boolean;
  spam_reason: string | null;
  form_version: number;
  contact_id: string | null;
  contacts: { email: string | null; first_name: string | null; last_name: string | null } | null;
  deliveries: { id: string; status: string; error: string | null; external_url: string | null; attempts: number; updated_at: string; destination_id: string }[];
  form_bookings: { tool: string; linked: string; start_at: string | null }[];
};
type Kind = "leads" | "tests" | "spam";

export function FormFills({ sb, formId, destinations, navigate, watch }: Pick<ViewProps, "sb" | "navigate"> & { formId: string; destinations: Destination[]; watch: number }) {
  const [kind, setKind] = useState<Kind>(watch ? "tests" : "leads");
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState("");
  const fills = useLoad(async () => {
    let q = sb
      .from("submissions")
      .select("id, created_at, values, hidden, test, spam, spam_reason, form_version, contact_id, contacts(email, first_name, last_name), deliveries(id, status, error, external_url, attempts, updated_at, destination_id), form_bookings(tool, linked, start_at)")
      .eq("form_id", formId)
      .order("created_at", { ascending: false })
      .limit(100);
    q = kind === "spam" ? q.eq("spam", true) : kind === "tests" ? q.eq("test", true).eq("spam", false) : q.eq("test", false).eq("spam", false);
    return must(await q) as unknown as Fill[];
  }, `${formId}:${kind}:${watch}`);
  const versions = useLoad(async () => {
    const rows = must(await sb.from("form_versions").select("version, body").eq("form_id", formId)) as { version: number; body: Form }[];
    return new Map(rows.map((r) => [r.version, r.body]));
  }, formId);

  // After the Test button (the parent remounts this with a new `watch`): check every 2 seconds for half a minute.
  useEffect(() => {
    if (!watch) return;
    let n = 0;
    const t = setInterval(() => {
      if (++n > 15) clearInterval(t);
      fills.reload();
    }, 2000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch]);

  const replay = async (ids: string[]) => {
    setError("");
    try {
      must(await sb.rpc("deliveries_replay", { p_ids: ids }));
      fills.reload();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const destName = (id: string) => destinations.find((d) => d.id === id)?.name ?? "Removed destination";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Segmented
          label="Fills"
          value={kind}
          options={[
            { value: "leads", label: "Leads" },
            { value: "tests", label: "Tests" },
            { value: "spam", label: "Spam" },
          ]}
          onChange={setKind}
        />
        <Button variant="plain" size="sm" onClick={fills.reload} className="ml-auto w-8 px-0">
          <Refresh size={14} />
        </Button>
      </div>
      <ErrorNote message={error || fills.error} />
      {!fills.data ? (
        <Loading />
      ) : !fills.data.length ? (
        <Empty sketch={<Sketch name={kind === "tests" ? "plane" : "clipboard"} size={160} />} title={kind === "spam" ? "No spam" : kind === "tests" ? "No tests yet" : "No fills yet"} />
      ) : (
        <Panel className="overflow-hidden">
          <ul className="divide-y divide-line">
            {fills.data.map((s) => {
              const body = versions.data?.get(s.form_version);
              const who = s.contacts ? [s.contacts.first_name, s.contacts.last_name].filter(Boolean).join(" ") || s.contacts.email : String(s.values.email ?? "—");
              const failed = s.deliveries.filter((d) => d.status === "failed");
              const isOpen = open === s.id;
              return (
                <li key={s.id}>
                  <button type="button" onClick={() => setOpen(isOpen ? null : s.id)} aria-expanded={isOpen} className="flex min-h-14 w-full items-center gap-3 px-5 py-3 text-left text-[13.5px] transition-colors duration-[140ms] hover:bg-hover">
                    <ChevronRight size={14} className={`text-faint transition-transform ${isOpen ? "rotate-90" : ""}`} />
                    <span className="min-w-0 flex-1 truncate font-medium">{who}</span>
                    {s.form_bookings?.map((b, j) => (
                      <Badge key={`b${j}`} tone={b.linked === "tracking" ? "violet" : "gray"}>
                        {b.linked === "tracking" ? "Booked" : "Booked, maybe"}
                      </Badge>
                    ))}
                    {s.spam ? <Badge tone="amber">{s.spam_reason === "trap" ? "Trap" : s.spam_reason === "too_fast" ? "Too fast" : "Spam"}</Badge> : null}
                    <span className="flex gap-1">
                      {s.deliveries.map((d) => (
                        <Badge key={d.id} tone={DELIVERY[d.status]?.[1] ?? "gray"}>
                          {DELIVERY[d.status]?.[0] ?? d.status}
                        </Badge>
                      ))}
                    </span>
                    <span className="w-20 shrink-0 text-right font-mono text-[11.5px] text-muted">{timeAgo(s.created_at)}</span>
                  </button>
                  {isOpen ? (
                    <div className="anim-rise-sm grid gap-4 border-t border-line bg-paper px-5 py-5 md:grid-cols-2">
                      <dl className="flex flex-col gap-2 text-[13px]">
                        {Object.entries(s.values).map(([k, v]) => (
                          <div key={k} className="flex flex-col">
                            <dt className="label-mono">{(body && allFields(body).find((f) => f.key === k)?.label) || k}</dt>
                            <dd className="break-words whitespace-pre-wrap text-ink">{Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v)}</dd>
                          </div>
                        ))}
                        {Object.entries(s.hidden).map(([k, v]) => (
                          <div key={k} className="flex flex-col">
                            <dt className="label-mono">{k}</dt>
                            <dd className="truncate font-mono text-[12px] text-body">{v}</dd>
                          </div>
                        ))}
                      </dl>
                      <div className="flex flex-col gap-2">
                        {s.contact_id ? (
                          <div>
                            <Button variant="ghost" onClick={() => navigate("contacts", s.contact_id!)}>
                              Open contact
                            </Button>
                          </div>
                        ) : null}
                        <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-lg border border-line bg-card">
                          {s.deliveries.map((d) => (
                            <li key={d.id} className="flex flex-col gap-1 px-3.5 py-2.5 text-[13px]">
                              <div className="flex items-center gap-2">
                                <span className="min-w-0 flex-1 truncate font-medium">{destName(d.destination_id)}</span>
                                {d.external_url ? (
                                  <a href={d.external_url} target="_blank" rel="noreferrer" className="flex size-8 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink" aria-label="Open the record" title="Open the record">
                                    <LinkIcon size={14} />
                                  </a>
                                ) : null}
                                <Badge tone={DELIVERY[d.status]?.[1] ?? "gray"}>{DELIVERY[d.status]?.[0] ?? d.status}</Badge>
                              </div>
                              {d.error ? <p className="text-[12px] break-words text-rose">{d.error}</p> : null}
                              <p className="font-mono text-[11.5px] text-muted">
                                {d.attempts} {d.attempts === 1 ? "try" : "tries"} · {timeAgo(d.updated_at)}
                              </p>
                            </li>
                          ))}
                        </ul>
                        {failed.length ? (
                          <div>
                            <Button variant="ghost" onClick={() => replay(failed.map((d) => d.id))}>
                              <Refresh size={14} />
                              Replay
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </div>
  );
}
