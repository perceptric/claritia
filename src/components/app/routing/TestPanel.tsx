"use client";

// The Test panel (docs/router-ux.md 4.3): an email or a contact, a few "what if" fields, then the draft, live or both,
// read out as the run's sentences. It sends the editor's unsaved body, so the result follows every edit (300 ms after
// the last one), and hands the draft's lines up so the flow can light the path.

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FieldDef } from "@/lib/router/conditions";
import type { Line } from "@/lib/router/explain";
import type { RouterBody } from "@/lib/router/types";
import { ChevronRight, Plus, Search, X } from "../../Icons";
import { INPUT } from "../forms/controls";
import { Select } from "../Select";
import { Avatar, Badge, Button, errorText, IconButton, Segmented } from "../ui";
import { routingApi, type Member, type TestOut, type Tested } from "./api";
import { RunLines } from "./Lines";
import { FieldPicker, useSlideIn } from "./parts";

type Which = "draft" | "live" | "both";
type Lead = { email: string | null; contact: { id: string; label: string } | null };
type Change = { field: string; value: string };

export function TestPanel({
  sb,
  session,
  ws,
  body,
  hasLive,
  members,
  fields,
  start,
  onLines,
  onClose,
}: {
  sb: SupabaseClient;
  session: Session;
  ws: string;
  body: RouterBody;
  hasLive: boolean;
  members: Member[];
  fields: FieldDef[];
  /** A lead to test at once (an email or a contact id), from Log's "Test draft". */
  start?: string | null;
  onLines: (l: Line[] | null) => void;
  onClose: () => void;
}) {
  const ref = useSlideIn<HTMLElement>();
  const [email, setEmail] = useState(() => (start && start.includes("@") ? start : ""));
  const [lead, setLead] = useState<Lead | null>(null);
  const [which, setWhich] = useState<Which>("draft");
  const [why, setWhy] = useState("");
  const [changes, setChanges] = useState<Change[]>([]);
  const [showChanges, setShowChanges] = useState(false);
  const [out, setOut] = useState<TestOut | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const seq = useRef(0);

  const run = useCallback(
    async (l: Lead, o: { which: Which; why: string; changes: Change[]; body: RouterBody }) => {
      const n = ++seq.current;
      setBusy(true);
      setError("");
      const ch: Record<string, unknown> = {};
      for (const c of o.changes) {
        if (!c.field || !c.value.trim()) continue;
        const f = fields.find((x) => x.key === c.field);
        ch[c.field] = f?.type === "number" && Number.isFinite(Number(c.value)) ? Number(c.value) : f?.type === "country" ? c.value.trim().toUpperCase() : c.value.trim();
      }
      try {
        const r = await routingApi<TestOut>(session, ws, "test", {
          email: l.contact ? null : l.email,
          contact: l.contact?.id ?? null,
          changes: ch,
          which: hasLive ? o.which : "draft",
          whyNot: o.why || null,
          draft: o.body,
        });
        if (n !== seq.current) return;
        setOut(r);
        onLines((r.draft ?? r.live)?.lines ?? null);
      } catch (e) {
        if (n !== seq.current) return;
        setError(errorText(e));
      } finally {
        if (n === seq.current) setBusy(false);
      }
    },
    [session, ws, fields, hasLive, onLines],
  );

  // Edits to the draft, the fields or the choices re-run the test a moment later.
  const params = useRef({ which, why, changes, body });
  useEffect(() => {
    params.current = { which, why, changes, body };
  });
  useEffect(() => {
    if (!lead) return;
    const t = setTimeout(() => void run(lead, params.current), 300);
    return () => clearTimeout(t);
  }, [lead, which, why, changes, body, run]);

  // "Test draft" from the Log: the contact (or email) runs at once.
  useEffect(() => {
    if (!start) return;
    const t = setTimeout(() => setLead(start.includes("@") ? { email: start, contact: null } : /^[0-9a-f-]{36}$/.test(start) ? { email: null, contact: { id: start, label: "Contact" } } : null), 0);
    return () => clearTimeout(t);
  }, [start]);

  useEffect(() => () => onLines(null), [onLines]);

  const submit = () => {
    const e = email.trim();
    if (!e) return;
    setLead({ email: e, contact: null });
  };

  const sides: [string, Tested | null][] = which === "both" ? [["Draft", out?.draft ?? null], ["Live", out?.live ?? null]] : which === "live" ? [["Live", out?.live ?? null]] : [["Draft", out?.draft ?? null]];
  const owner = (t: Tested | null) => (t?.result.kind === "owner" ? t.result.user : (t?.result.kind ?? ""));
  const different = which === "both" && !!out?.draft && !!out?.live && owner(out.draft) !== owner(out.live);
  const whyWords = (out?.draft ?? out?.live)?.whyNot?.words;

  return (
    <aside ref={ref} aria-label="Test" className="absolute inset-0 z-10 flex flex-col overflow-y-auto bg-card">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-5">
        <h2 className="flex-1 text-[13px] font-semibold text-ink">Test</h2>
        {hasLive ? (
          <Segmented<Which>
            label="Version"
            value={which}
            options={[
              { value: "draft", label: "Draft" },
              { value: "live", label: "Live" },
              { value: "both", label: "Both" },
            ]}
            onChange={setWhich}
          />
        ) : null}
        <IconButton label="Close" onClick={onClose}>
          <X size={14} />
        </IconButton>
      </div>
      <div className="flex flex-col gap-3 px-5 py-4">
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input autoFocus type="email" aria-label="Email" placeholder="dana@acme.com" value={email} onChange={(e) => setEmail(e.target.value)} className={`${INPUT} h-9 flex-1`} />
          <Button type="submit" size="sm" disabled={!email.trim() || busy}>
            Run
          </Button>
        </form>
        <ContactSearch sb={sb} ws={ws} onPick={(c) => (setEmail(""), setLead({ email: null, contact: c }))} />
        {lead?.contact ? (
          <div className="flex items-center gap-2 text-[12.5px]">
            <Badge>{lead.contact.label}</Badge>
            <IconButton label="Clear contact" className="size-6" onClick={() => (setLead(null), setOut(null), onLines(null))}>
              <X size={11} />
            </IconButton>
          </div>
        ) : null}
        <div>
          <button type="button" aria-expanded={showChanges} onClick={() => setShowChanges((v) => !v)} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-body hover:text-ink">
            <ChevronRight size={12} className={`transition-transform duration-[140ms] ${showChanges ? "rotate-90" : ""}`} />
            Change fields
            {changes.filter((c) => c.field && c.value).length ? <span className="text-muted tabular-nums">{changes.filter((c) => c.field && c.value).length}</span> : null}
          </button>
          {showChanges ? (
            <ul className="mt-2 flex flex-col gap-1.5">
              {changes.map((c, i) => (
                <li key={i} className="flex items-center gap-1.5">
                  <FieldPicker fields={fields} value={c.field} onChange={(f) => setChanges((l) => l.map((x, j) => (j === i ? { ...x, field: f.key } : x)))} className="w-[45%]" />
                  <input aria-label="Value" value={c.value} onChange={(e) => setChanges((l) => l.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} className={`${INPUT} flex-1`} />
                  <IconButton label="Remove field" className="size-7" onClick={() => setChanges((l) => l.filter((_, j) => j !== i))}>
                    <X size={12} />
                  </IconButton>
                </li>
              ))}
              {changes.length < 8 ? (
                <li>
                  <button type="button" onClick={() => setChanges((l) => [...l, { field: "", value: "" }])} className="press inline-flex h-7 items-center gap-1 rounded-full px-2 text-[12.5px] font-medium text-ink hover:bg-hover">
                    <Plus size={12} />
                    Field
                  </button>
                </li>
              ) : null}
            </ul>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col gap-5 border-t border-line px-5 py-4" aria-live="polite" aria-busy={busy}>
        {error ? (
          <div role="alert" className="flex items-center gap-3 rounded-lg bg-rose-wash px-3.5 py-2.5 text-[13px] text-rose">
            <span className="flex-1">{error === "Something went wrong." ? "Couldn't run the test." : error}</span>
            {lead ? (
              <button type="button" onClick={() => void run(lead, params.current)} className="font-medium underline underline-offset-2">
                Try again
              </button>
            ) : null}
          </div>
        ) : null}
        {busy && !out ? (
          <div className="flex flex-col gap-2" aria-label="Running">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="anim-shimmer h-5 rounded-full bg-paper-deep" style={{ width: `${90 - i * 12}%`, animationDelay: `${i * 0.1}s` }} />
            ))}
          </div>
        ) : null}
        {out ? (
          <>
            {different ? (
              <div>
                <Badge tone="amber" dot>
                  Different
                </Badge>
              </div>
            ) : null}
            {sides.map(([label, t]) => (
              <section key={label} className={`flex flex-col gap-2 transition-opacity duration-[140ms] ${busy ? "opacity-60" : ""}`}>
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-muted">{label}</span>
                  <span className="h-px flex-1 bg-line" />
                </div>
                {t ? (
                  <>
                    <div className="flex items-center gap-2 text-[13px]">
                      {t.result.kind === "owner" ? <Avatar label={t.owner} size={22} /> : null}
                      {t.result.kind === "owner" ? <span className="font-medium text-ink">{t.owner}</span> : <Badge tone={t.result.kind === "held" ? "amber" : "red"}>{t.owner}</Badge>}
                      <span className="truncate text-muted">{t.path}</span>
                    </div>
                    <RunLines lines={t.lines} />
                  </>
                ) : (
                  <p className="text-[12.5px] text-muted">{label === "Live" ? "Nothing live yet" : "No draft"}</p>
                )}
              </section>
            ))}
            {members.length ? (
              <div className="flex flex-col gap-1.5 border-t border-line pt-4">
                <div className="flex items-center gap-2 text-[13px] text-body">
                  Why not
                  <span className="w-44">
                    <Select<string>
                      value={why}
                      options={members.map((m) => ({ value: m.id, label: m.name }))}
                      onChange={setWhy}
                      ariaLabel="Why not"
                      placeholder="Pick a rep"
                      className="h-8 w-full min-w-0 rounded-sm border border-line-strong bg-card px-2 text-[12.5px] text-ink hover:border-ink/40"
                    />
                  </span>
                </div>
                {why && whyWords ? <p className="text-[13px] text-ink">{whyWords}</p> : null}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </aside>
  );
}

type Hit = { id: string; email: string | null; first_name: string | null; last_name: string | null };

/** Pick a contact by name or email; everything Claritia knows about them goes into the test. */
function ContactSearch({ sb, ws, onPick }: { sb: SupabaseClient; ws: string; onPick: (c: { id: string; label: string }) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const s = q.trim().replace(/[,()%*\\]/g, " ").trim();
    if (s.length < 2) return;
    let live = true;
    const t = setTimeout(async () => {
      const { data } = await sb
        .from("contacts")
        .select("id, email, first_name, last_name")
        .eq("workspace_id", ws)
        .is("deleted_at", null)
        .or(`email.ilike.%${s}%,first_name.ilike.%${s}%,last_name.ilike.%${s}%`)
        .limit(6);
      if (live) setHits((data ?? []) as Hit[]);
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, sb, ws]);
  const label = (h: Hit) => [h.first_name, h.last_name].filter(Boolean).join(" ") || h.email || "Contact";
  const shown = q.trim().length >= 2 ? hits : [];
  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-[12.5px] text-muted">or pick a contact</span>
        <span className="relative flex flex-1 items-center">
          <Search size={12} className="pointer-events-none absolute left-2 text-faint" />
          <input
            aria-label="Search contacts"
            placeholder="Search"
            value={q}
            onChange={(e) => (setQ(e.target.value), setOpen(true))}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && shown[0]) {
                e.preventDefault();
                onPick({ id: shown[0].id, label: label(shown[0]) });
                setQ("");
                setOpen(false);
              }
              if (e.key === "Escape") setOpen(false);
            }}
            className={`${INPUT} pl-6`}
          />
        </span>
      </div>
      {open && shown.length ? (
        <ul role="listbox" className="anim-rise-sm absolute right-0 left-0 z-20 mt-1 overflow-hidden rounded-lg border border-line bg-card p-1 text-[13px] shadow-float">
          {shown.map((h) => (
            <li key={h.id} role="option" aria-selected={false}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick({ id: h.id, label: label(h) });
                  setQ("");
                  setOpen(false);
                }}
                className="flex w-full flex-col rounded-sm px-2.5 py-1.5 text-left hover:bg-hover"
              >
                <span className="truncate text-ink">{label(h)}</span>
                {h.email ? <span className="truncate text-[12px] text-muted">{h.email}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
