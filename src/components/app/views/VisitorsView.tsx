"use client";

// Nurture › Visitors (docs/visitors.md): everyone on the site, one row per device, each with a fun name ("Funny
// Capybara", src/lib/visitors/names.ts) until a form, a booking or a sign-in links them to a contact; then the row is
// that person, the fun name kept beside it. /visitors/<device> is one visitor's whole journey, newest first: each
// visit with its pages and actions, the proof that linked them, and what they did as a contact. Reads come from
// visitors_list, visitors_counts and visitor_journey (migration 102). Only devices with full policy exist, so a visitor
// who hasn't given consent where the law asks for it never shows here.

import { useMemo, useState } from "react";
import { ACTION_WORDS, eventWords, fullName, journeyItems, place, PROOF_WORDS, sourceWords, type Journey, type Visit } from "@/lib/visitors/journey";
import { persona } from "@/lib/visitors/names";
import { Radar } from "../../Icons";
import { SampleRows, SampleTags, ToolIntro } from "../ToolIntro";
import { Badge, Button, ErrorNote, Loading, must, Page, Segmented, timeAgo, useQuery, type ViewProps } from "../ui";

type Show = "all" | "known" | "unknown";
type Row = {
  id: string;
  first_seen: string;
  last_seen: string;
  sessions: number;
  state: string;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  referrer_host: string | null;
  ref_class: string | null;
  landing_path: string | null;
  country: string | null;
  city: string | null;
  device_type: string | null;
  views: number;
  contact_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  link_level: string | null;
};
const PAGE = 50;
const TONE: Record<string, string> = { sage: "bg-sage-wash text-sage", sky: "bg-sky-wash text-sky", butter: "bg-butter-wash text-butter", clay: "bg-clay-wash text-clay", lilac: "bg-lilac-wash text-lilac", rose: "bg-rose-wash text-rose" };

function Avatar({ device, known, size = 32 }: { device: string; known?: string | null; size?: number }) {
  const p = persona(device);
  const initials = known ? known.split(/\s+/).map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase() : p.initials;
  return (
    <span style={{ width: size, height: size, fontSize: size * 0.36 }} className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${known ? "bg-ink text-paper" : TONE[p.tone]}`} aria-hidden="true">
      {initials}
    </span>
  );
}

export function VisitorsView(props: ViewProps) {
  if (props.id) return <JourneyPage key={props.id} {...props} />;
  return <VisitorList {...props} />;
}

function VisitorList({ sb, ws, navigate }: ViewProps) {
  const [show, setShow] = useState<Show>("all");
  const [more, setMore] = useState<Row[][]>([]);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const first = useQuery(`visitors:${ws.id}:${show}`, async () => {
    const [rows, counts, sites] = await Promise.all([
      sb.rpc("visitors_list", { p_ws: ws.id, p_show: show, p_before: null, p_limit: PAGE }),
      sb.rpc("visitors_counts", { p_ws: ws.id }),
      sb.from("sites").select("id").eq("workspace_id", ws.id).limit(1),
    ]);
    return { rows: (must(rows) ?? []) as Row[], counts: (counts.data ?? { all: 0, known: 0 }) as { all: number; known: number }, site: !!(sites.data ?? []).length };
  });
  const rows = useMemo(() => [...(first.data?.rows ?? []), ...more.flat()], [first.data, more]);
  const pick = (v: Show) => {
    setShow(v);
    setMore([]);
    setDone(false);
  };
  const loadMore = async () => {
    const last = rows.at(-1);
    if (!last) return;
    setBusy(true);
    const r = await sb.rpc("visitors_list", { p_ws: ws.id, p_show: show, p_before: last.last_seen, p_limit: PAGE });
    setBusy(false);
    const next = (r.data ?? []) as Row[];
    setMore((m) => [...m, next]);
    if (next.length < PAGE) setDone(true);
  };

  if (!first.data)
    return (
      <Page icon={<Radar size={14} />} title="Visitors">
        <ErrorNote message={first.error} />
        {first.error ? null : <Loading />}
      </Page>
    );
  const { counts, site } = first.data;
  if (!counts.all && show === "all")
    return (
      <Page icon={<Radar size={14} />} title="Visitors">
        <ToolIntro
          sketch="browser"
          action={<Button onClick={() => navigate("settings", site ? "identity" : "sites")}>{site ? "Check the tracking" : "Add your site"}</Button>}
          title={"Every visitor,\nfrom first click to booked demo"}
          lead="Each visitor gets a name like Funny Capybara and a journey: where they came from, what they read, what they clicked. When they send a form or book a meeting, the name becomes the person and every earlier visit joins their contact."
          features={[
            { title: "The whole journey", text: "Every visit, page and click, in order, with the ad or site that sent them.", visual: <SampleRows rows={[["Funny Capybara, Pricing", 9, "4m"], ["Sleepy Otter, Blog", 3, "1m"], ["Dana Lee, Demo", 6, "3m"]]} /> },
            { title: "Linked on proof", text: "Only a form, a booking or a sign-in ties a visitor to a person, and each link shows its proof.", visual: <SampleTags rows={[["Funny Capybara", "Dana Lee"], ["Turbo Narwhal", "Unknown"]]} /> },
            { title: "Consent first", text: "Where the law asks for consent, nobody is followed until they agree." },
          ]}
        />
      </Page>
    );
  const unknown = Math.max(0, counts.all - counts.known);
  return (
    <Page icon={<Radar size={14} />} title="Visitors" count={counts.all}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Segmented<Show>
            size="sm"
            label="Show"
            value={show}
            onChange={pick}
            options={[
              { value: "all", label: `All ${counts.all.toLocaleString("en-US")}` },
              { value: "known", label: `Known ${counts.known.toLocaleString("en-US")}` },
              { value: "unknown", label: `Unknown ${unknown.toLocaleString("en-US")}` },
            ]}
          />
        </div>
        <ErrorNote message={first.error} />
        {rows.length ? (
          <ul className="overflow-hidden rounded-[10px] border border-line">
            {rows.map((r) => {
              const known = r.contact_id ? fullName(r) : null;
              const fun = persona(r.id).name;
              return (
                <li key={r.id} className="border-b border-line last:border-b-0">
                  <button type="button" onClick={() => navigate("visitors", r.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-[140ms] hover:bg-hover">
                    <Avatar device={r.id} known={known} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-[13.5px] font-medium text-ink">{known || fun}</span>
                        {known ? <span className="hidden truncate text-[12px] text-faint sm:inline">{fun}</span> : null}
                      </span>
                      <span className="truncate text-[12.5px] text-muted">{[sourceWords(r), r.landing_path, place(r)].filter(Boolean).join(", ")}</span>
                    </span>
                    {known ? <Badge tone="green">Known</Badge> : null}
                    <span className="hidden w-20 text-right text-[12.5px] text-muted tabular-nums md:block">{`${r.sessions} ${r.sessions === 1 ? "visit" : "visits"}`}</span>
                    <span className="hidden w-20 text-right text-[12.5px] text-muted tabular-nums md:block">{`${r.views} ${r.views === 1 ? "page" : "pages"}`}</span>
                    <span className="w-16 text-right text-[12px] text-faint">{timeAgo(r.last_seen)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-1 py-14 text-center">
            <b className="font-medium text-ink">{show === "known" ? "No known visitors yet" : "No visitors here"}</b>
          </div>
        )}
        {rows.length >= PAGE && !done ? (
          <Button variant="ghost" size="sm" className="self-center" disabled={busy} onClick={() => void loadMore()}>
            {busy ? "Loading" : "Show more"}
          </Button>
        ) : null}
      </div>
    </Page>
  );
}

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const length = (v: Visit) => {
  const s = Math.max(0, Math.round((Date.parse(v.ended_at) - Date.parse(v.started_at)) / 1000));
  return s < 60 ? `${s}s` : `${Math.round(s / 60)}m`;
};

function JourneyPage({ sb, ws, id, navigate }: ViewProps) {
  const res = useQuery(`visitor:${ws.id}:${id}`, async () => ({ j: ((must(await sb.rpc("visitor_journey", { p_ws: ws.id, p_device: id })) as Journey | null) ?? null) }), { staleMs: 0 });
  const back = { label: "Visitors", onClick: () => navigate("visitors") };
  const fun = persona(id).name;
  if (!res.data || !res.data.j)
    return (
      <Page title={fun} back={back}>
        <ErrorNote message={res.error || (res.data ? "This visitor is gone." : "")} />
        {res.error || res.data ? null : <Loading />}
      </Page>
    );
  const j = res.data.j;
  const known = j.contact ? fullName(j.contact) : null;
  const items = journeyItems(j);
  const latest = j.sessions[0];
  return (
    <Page title={known || fun} back={back} actions={j.contact ? <Button onClick={() => navigate("contacts", j.contact!.id)}>Open contact</Button> : undefined}>
      <div className="flex max-w-[860px] flex-col gap-5">
        <div className="flex items-center gap-3">
          <Avatar device={id} known={known} size={44} />
          <div className="flex min-w-0 flex-col">
            <h2 className="truncate text-[22px] leading-tight font-semibold tracking-[-0.02em] text-ink">
              {known || fun}
              {known ? <span className="text-faint"> {fun}</span> : null}
            </h2>
            <span className="truncate text-[12.5px] text-muted">
              {[`First seen ${timeAgo(j.device.first_seen)}`, `${j.device.sessions} ${j.device.sessions === 1 ? "visit" : "visits"}`, latest ? place(latest) : "", latest ? [latest.device_type, latest.browser].filter(Boolean).join(", ") : ""].filter(Boolean).join(", ")}
            </span>
          </div>
        </div>
        <ol className="flex flex-col gap-2.5">
          {items.map((it, i) =>
            it.kind === "visit" ? (
              <li key={`v${it.visit.id}`} className="rounded-[10px] border border-line bg-card">
                <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5 text-[12.5px]">
                  <b className="font-medium text-ink">{when(it.visit.started_at)}</b>
                  <span className="text-muted">{sourceWords(it.visit)}</span>
                  {it.visit.campaign ? <Badge>{it.visit.campaign}</Badge> : null}
                  <span className="flex-1" />
                  <span className="text-faint tabular-nums">{`${it.visit.pageviews} ${it.visit.pageviews === 1 ? "page" : "pages"}, ${length(it.visit)}`}</span>
                </div>
                <ul className="flex flex-col px-4 py-2">
                  {it.visit.events.length ? (
                    it.visit.events.map((e, k) => (
                      <li key={k} className="flex items-baseline gap-3 py-1 text-[13px]">
                        <span className="w-14 shrink-0 text-[12px] text-faint tabular-nums">{new Date(e.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
                        <span className={`min-w-0 truncate ${e.kind === "view" ? "text-body" : "font-medium text-ink"}`}>{eventWords(e)}</span>
                        {e.kind === "view" && e.title && e.path ? <span className="hidden truncate font-mono text-[11.5px] text-faint sm:inline">{e.path}</span> : null}
                      </li>
                    ))
                  ) : (
                    <li className="py-1 text-[13px] text-muted">{it.visit.landing_path ?? "A page"}</li>
                  )}
                </ul>
              </li>
            ) : it.kind === "proof" ? (
              <li key={`p${i}`} className="flex items-center gap-2.5 rounded-[10px] border border-line bg-signal-soft px-4 py-2.5 text-[13px]">
                <span className="size-1.5 shrink-0 rounded-full bg-signal" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-ink">{`Linked to ${it.proof.email ?? "a contact"} by ${PROOF_WORDS[it.proof.source] ?? it.proof.source}`}</span>
                <span className="text-[12px] text-faint">{when(it.proof.at)}</span>
              </li>
            ) : (
              <li key={`a${i}`} className="flex items-center gap-2.5 px-4 py-1.5 text-[13px]">
                <span className="size-1.5 shrink-0 rounded-full bg-ink" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate font-medium text-ink">{ACTION_WORDS[it.action.kind] ?? it.action.kind}</span>
                <span className="text-[12px] text-faint">{when(it.action.at)}</span>
              </li>
            ),
          )}
        </ol>
      </div>
    </Page>
  );
}
