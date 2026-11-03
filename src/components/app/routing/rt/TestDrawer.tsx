"use client";

// Test lead (docs/routing-workflow.md Section 16): the saved draft (pending edits are saved first, then that exact
// revision is tested) or the published version; one of that version's sources; the values its rules test; labeled
// simulation overrides; then the server runs the shared evaluator and shows the seven stages. Changing an input after
// a result marks it stale. A draft's test is kept as evidence for the publish review. Nothing real changes.

import { useEffect, useMemo, useState } from "react";
import { countryName } from "@/lib/router/conditions";
import { COUNTRY_CODES } from "@/lib/forms/countries";
import type { RouterBody } from "@/lib/router/types";
import { fieldsUsed } from "@/lib/routing/evaluate";
import { fieldOf, releaseSources, traceWords, type PolicyRow } from "@/lib/routing/screenModel";
import { PREVIEW_FOOTER } from "@/lib/routing/states";
import { Play, Search, X } from "../../../Icons";
import { Choice } from "../../inbound/parts";
import { Sheet } from "../../Sheet";
import { Badge, Button, ErrorNote, IconButton, Toggle, type ViewProps } from "../../ui";
import { rt, type Screen, type TestOut } from "./api";
import { Initials, namesOf, PersonChoice } from "./parts";

type Found = { id: string; name: string; email: string | null };
type Inputs = { email: string; contact?: Found | null; values: Record<string, string>; contactOwner: string | null; companyOwner: string | null; spam: boolean; unavailable: boolean; noSlots: boolean };

const COUNTRIES = COUNTRY_CODES.map((c: string) => ({ value: c, label: countryName(c) })).sort((x, y) => x.label.localeCompare(y.label));

export function TestDrawer({ session, ws, d, row, body, flush, onClose }: Pick<ViewProps, "session" | "ws"> & { d: Screen; row: PolicyRow; body: RouterBody; flush: () => Promise<number>; onClose: () => void }) {
  const names = useMemo(() => namesOf(d.people, d.teams), [d.people, d.teams]);
  const [ver, setVer] = useState<"draft" | "live">("draft");
  const tested = ver === "draft" ? body : (row.live ?? body);
  const used = useMemo(() => fieldsUsed(tested).map((k) => fieldOf(k, d.fields)), [tested, d.fields]);
  const sources = useMemo(() => {
    if (ver === "draft") return releaseSources(d.sources, row.id).serving.filter((s) => s.eff.enabled).map((s) => ({ id: s.id, name: s.name, outcome: s.eff.outcome }));
    return d.sources.filter((s) => s.policy_id === row.id && s.enabled).map((s) => ({ id: s.id, name: s.name, outcome: s.outcome }));
  }, [ver, d.sources, row.id]);
  const [src, setSrc] = useState<string>(() => sources.find((s) => s.outcome === "assign_and_calendar")?.id ?? sources[0]?.id ?? "");
  const [t, setT] = useState<Inputs>(() => {
    // Opens on the Enterprise scenario's values, like the demo.
    const v: Record<string, string> = {};
    const n0 = used.find((f) => f.type === "number" && /employ|size/.test(f.key)) ?? used.find((f) => f.type === "number");
    const c0 = used.find((f) => f.type === "country");
    if (n0) v[n0.key] = "800";
    if (c0) v[c0.key] = "US";
    return { email: "maya@globex.com", values: v, contactOwner: null, companyOwner: null, spam: false, unavailable: false, noSlots: false };
  });
  const [res, setRes] = useState<TestOut | null>(null);
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const num = used.find((f) => f.type === "number" && /employ|size/.test(f.key)) ?? used.find((f) => f.type === "number");
  const ctry = used.find((f) => f.type === "country");
  const scenario = (k: "Enterprise" | "Returning lead" | "No slots" | "Needs review") => {
    const v: Record<string, string> = {};
    const s = (n: string, c: string) => {
      if (num) v[num.key] = n;
      if (ctry) v[ctry.key] = c;
    };
    let next: Inputs;
    if (k === "Returning lead") {
      s("60", "DE");
      next = { email: "leo@brightline.io", values: v, contactOwner: d.me, companyOwner: null, spam: false, unavailable: false, noSlots: false };
    } else if (k === "Needs review") next = { email: "test@mailinator.com", values: v, contactOwner: null, companyOwner: null, spam: true, unavailable: false, noSlots: false };
    else {
      s("800", "US");
      next = { email: "maya@globex.com", values: v, contactOwner: null, companyOwner: null, spam: false, unavailable: false, noSlots: k === "No slots" };
      if (k === "No slots") {
        const cal = sources.find((x) => x.outcome === "assign_and_calendar");
        if (cal) setSrc(cal.id);
      }
    }
    setT(next);
    setRes(null);
  };
  const edit = (p: Partial<Inputs>) => {
    setT((x) => ({ ...x, ...p }));
    if (res) setStale(true);
  };
  const run = async () => {
    setBusy(true);
    setError("");
    try {
      const revision = ver === "draft" ? await flush() : null;
      const out = await rt<TestOut>(session, ws.id, "rt_test", {
        policy: row.id,
        version: ver,
        revision,
        source: src || null,
        email: t.contact ? null : t.email,
        ...(t.contact ? { contact: t.contact.id } : {}),
        values: t.values,
        // A looked-up contact keeps its CRM owners unless one is set here.
        overrides: {
          ...(t.contact && !t.contactOwner ? {} : { contactOwner: t.contactOwner }),
          ...(t.contact && !t.companyOwner ? {} : { companyOwner: t.companyOwner }),
          spam: t.spam,
          unavailable: t.unavailable,
          noSlots: t.noSlots,
        },
      });
      setRes(out);
      setStale(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The test didn't run.");
    } finally {
      setBusy(false);
    }
  };
  const meeting = (() => {
    const s = d.sources.find((x) => x.id === src);
    const id = s ? (ver === "draft" && s.draft && s.draft.policy_id === row.id && "meeting_type_id" in s.draft ? s.draft.meeting_type_id : s.meeting_type_id) : null;
    const m = d.meetingTypes.find((x) => x.id === id);
    return m ? `${m.name}${m.minutes ? ` · ${m.minutes} min` : ""}` : null;
  })();
  const words = res ? traceWords(res.trace, { names, fields: d.fields, reviewer: tested.review?.owner ?? null, meetingName: meeting, test: true, email: t.email }) : null;
  const who = (u: string | null) => (u ? (names.people[u] ?? "Former teammate") : "");

  return (
    <Sheet title="Test lead" onClose={onClose} width={620}>
      <div className="flex flex-col gap-3 p-4 text-[13px]">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <Lbl label="Version">
            <Choice<string>
              label="Version"
              value={ver}
              width={10}
              className="justify-between"
              options={[{ value: "draft", label: "Draft", hint: "Unpublished changes" }, ...(row.active_version ? [{ value: "live", label: `Published v${row.active_version}`, hint: "What real leads use now" }] : [])]}
              onChange={(v) => {
                const nv = v === "live" ? "live" : "draft";
                setVer(nv);
                setRes(null);
                // A source the other version doesn't have is dropped.
                const list = nv === "draft" ? releaseSources(d.sources, row.id).serving.filter((s) => s.eff.enabled).map((s) => s.id) : d.sources.filter((s) => s.policy_id === row.id && s.enabled).map((s) => s.id);
                if (!list.includes(src)) setSrc(list[0] ?? "");
              }}
            />
          </Lbl>
          <Lbl label="Source">
            <Choice<string>
              label="Source"
              value={src}
              width={10}
              className="justify-between"
              placeholder="No source"
              options={sources.map((s) => ({ value: s.id, label: s.name, hint: s.outcome === "assign_and_calendar" ? "Assign and show calendar" : "Assign only" }))}
              onChange={(v) => {
                setSrc(v);
                if (res) setStale(true);
              }}
            />
          </Lbl>
          <Lbl label="Existing contact">
            <ContactLookup session={session} ws={ws.id} value={t.contact ?? null} onChange={(c) => edit({ contact: c, ...(c?.email ? { email: c.email } : {}) })} />
          </Lbl>
          <Lbl label="Work email">
            <input value={t.email} disabled={!!t.contact} onChange={(e) => edit({ email: e.target.value })} className="h-[30px] w-full rounded-sm border border-line-strong bg-card px-2.5 text-ink outline-none focus:border-ink disabled:opacity-60" />
          </Lbl>
          {used.map((f) => (
            <Lbl key={f.key} label={f.label}>
              {f.type === "country" ? (
                <Choice<string>
                  label={f.label}
                  value={t.values[f.key] ?? ""}
                  width={10}
                  className="justify-between"
                  menuWidth={240}
                  options={[{ value: "", label: "Unknown" }, ...COUNTRIES]}
                  onChange={(v) => edit({ values: { ...t.values, [f.key]: v } })}
                />
              ) : f.type === "choice" && f.options?.length ? (
                <Choice<string>
                  label={f.label}
                  value={t.values[f.key] ?? ""}
                  width={10}
                  className="justify-between"
                  options={[{ value: "", label: "Unknown" }, ...f.options.map((o) => ({ value: o, label: o }))]}
                  onChange={(v) => edit({ values: { ...t.values, [f.key]: v } })}
                />
              ) : (
                <input
                  value={t.values[f.key] ?? ""}
                  placeholder="Unknown"
                  inputMode={f.type === "number" ? "numeric" : undefined}
                  onChange={(e) => edit({ values: { ...t.values, [f.key]: e.target.value } })}
                  className="h-[30px] w-full rounded-sm border border-line-strong bg-card px-2.5 text-ink outline-none placeholder:text-faint focus:border-ink"
                />
              )}
            </Lbl>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(["Enterprise", "Returning lead", "No slots", "Needs review"] as const).map((k) => (
            <button key={k} type="button" onClick={() => scenario(k)} className="press h-[26px] rounded-full border border-line px-2.5 text-[12px] text-ink hover:border-line-strong">
              {k}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2 rounded-[10px] border border-dashed border-line-strong px-3 py-2.5">
          <span className="text-[12px] font-medium text-muted">Simulation overrides</span>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <Lbl label="Contact owner">
              <PersonChoice label="Contact owner" value={t.contactOwner} none={t.contact ? "From the CRM" : "None"} people={d.people} full onChange={(u) => edit({ contactOwner: u })} />
            </Lbl>
            <Lbl label="Company owner">
              <PersonChoice label="Company owner" value={t.companyOwner} none={t.contact ? "From the CRM" : "None"} people={d.people} full onChange={(u) => edit({ companyOwner: u })} />
            </Lbl>
          </div>
          <div className="flex flex-col gap-1.5">
            {(
              [
                ["spam", "Spam"],
                ["unavailable", "Recipients unavailable"],
                ["noSlots", "No bookable slots"],
              ] as const
            ).map(([k, l]) => (
              <span key={k} className="flex items-center gap-2 text-ink">
                <Toggle label={l} on={t[k]} onChange={(v) => edit({ [k]: v } as Partial<Inputs>)} />
                {l}
              </span>
            ))}
          </div>
        </div>
        <div>
          <Button size="sm" disabled={busy} onClick={() => void run()}>
            <Play size={11} />
            Run test
          </Button>
        </div>
        <ErrorNote message={error} />
        {res && words ? (
          <div className={stale ? "opacity-45" : ""} aria-live="polite">
            <div className="flex flex-wrap items-center gap-2.5 rounded-[10px] border border-line bg-paper px-3.5 py-3">
              {res.state === "assigned" && res.recipient ? (
                <>
                  <Initials name={who(res.recipient)} />
                  <b className="text-[14px] font-semibold text-ink">Suggested recipient: {who(res.recipient)}</b>
                  <Badge>{res.effect === "retained" ? "Would retain" : "Would newly assign"}</Badge>
                </>
              ) : (
                <>
                  <Badge tone="amber" dot>
                    Needs review
                  </Badge>
                  <b className="text-[14px] font-semibold text-ink">No new assignment</b>
                </>
              )}
              {stale ? (
                <span className="ml-auto">
                  <Badge tone="amber" dot>
                    Stale, run again
                  </Badge>
                </span>
              ) : null}
            </div>
            <div className="mt-2.5 flex flex-col rounded-[10px] border border-line">
              {words.map((w) => (
                <div key={w.k} className="grid grid-cols-1 gap-1 border-t border-line px-3.5 py-2.5 text-[12.5px] first:border-t-0 sm:grid-cols-[110px_minmax(0,1fr)] sm:gap-3">
                  <span className="font-medium text-muted">{w.k}</span>
                  <span className="flex min-w-0 flex-col gap-[3px]">
                    {w.v.map((x, i) => (
                      <span key={i} className={x.faint ? "text-faint" : "text-ink"}>
                        {x.t}
                      </span>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <span className="border-t border-line pt-2.5 text-[12px] text-muted">{PREVIEW_FOOTER}</span>
      </div>
    </Sheet>
  );
}

function Lbl({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 text-[12px] font-medium text-muted ${full ? "sm:col-span-2" : ""}`}>
      <span>{label}</span>
      {children}
    </div>
  );
}

/** An existing contact of this workspace, found by name or email on the server (Section 16). Optional. */
function ContactLookup({ session, ws, value, onChange }: Pick<ViewProps, "session"> & { ws: string; value: Found | null; onChange: (c: Found | null) => void }) {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Found[]>([]);
  useEffect(() => {
    if (value || text.trim().length < 2) return;
    const t = setTimeout(() => {
      rt<{ contacts: Found[] }>(session, ws, "rt_contacts", { q: text.trim() })
        .then((r) => setRows(r.contacts))
        .catch(() => setRows([]));
    }, 200);
    return () => clearTimeout(t);
  }, [session, ws, text, value]);
  if (value)
    return (
      <div className="flex h-[30px] items-center gap-2 rounded-sm border border-line-strong bg-card pr-1 pl-2.5">
        <span className="min-w-0 flex-1 truncate font-normal text-ink">{value.name || value.email}</span>
        <IconButton label="Clear contact" onClick={() => onChange(null)}>
          <X size={11} />
        </IconButton>
      </div>
    );
  return (
    <div className="flex flex-col gap-1">
      <label className="flex h-[30px] items-center gap-2 rounded-sm border border-line-strong bg-card px-2.5 focus-within:border-ink">
        <Search size={12} className="text-muted" />
        <input aria-label="Find a contact" placeholder="None" value={text} onChange={(e) => setText(e.target.value)} className="min-w-0 flex-1 bg-transparent font-normal text-ink outline-none placeholder:text-faint" />
      </label>
      {text.trim().length >= 2 && rows.length ? (
        <div className="flex flex-col rounded-[10px] border border-line bg-card py-1">
          {rows.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setText("");
                setRows([]);
                onChange(c);
              }}
              className="flex flex-col px-2.5 py-1 text-left font-normal hover:bg-hover"
            >
              <span className="text-ink">{c.name || c.email}</span>
              {c.name ? <span className="text-[11.5px] text-muted">{c.email}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
