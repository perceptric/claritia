"use client";

// Share (docs/forms-plan.md): three ways a form gets in front of people, on the left; the one picked on the right.
// Link: the form's own page. On your website: in the page, a popup or a slide-in, the code for the site's builder and
// the pages it was seen on. Your own form: keep the site's form, and Claritia reads each send.

import { useState } from "react";
import type { Op } from "@/lib/forms/ops";
import { allFields, type Form } from "@/lib/forms/schema";
import { capturedForm } from "@/lib/forms/templates";
import { BrandLogo } from "../BrandLogo";
import { Badge, ErrorNote, errorText, must, useQuery, type ViewProps } from "../ui";
import { ago, daysAgo, saveName } from "./formModel";

/** "Yesterday" and "Just now" read lower case after other words; dates and counts keep theirs. */
const lower = (w: string) => (/^(Yesterday|Just now)$/.test(w) ? w.toLowerCase() : w);
import { Ic } from "./ic";
import { Box, CARD, copyText, CROW, CSTACK, GHOST_SM, RowText, Seg, useNote, Tg } from "./parts";
import type { FormRow, Kit } from "./shared";

type Way = "link" | "embed" | "own";
type Mode = "inline" | "popup" | "slide";
type Plat = "webflow" | "wordpress" | "framer" | "squarespace" | "html";

const PLATS: { v: Plat; l: string; domain?: string; how: string }[] = [
  { v: "webflow", l: "Webflow", domain: "webflow.com", how: "In Webflow: add an Embed element where the form goes and paste." },
  { v: "wordpress", l: "WordPress", domain: "wordpress.org", how: "In WordPress: add a Custom HTML block and paste." },
  { v: "framer", l: "Framer", domain: "framer.com", how: "In Framer: Insert, Embed, then paste as HTML." },
  { v: "squarespace", l: "Squarespace", domain: "squarespace.com", how: "In Squarespace: add a Code block and paste." },
  { v: "html", l: "Any site", how: "Paste it where the form should show." },
];

export function Share(props: ViewProps & { form: Form; row: FormRow & { kind?: "built" | "captured" }; apply: (ops: Op | Op[], words?: string) => boolean; kit: Kit | null; site: string }) {
  const { form, row } = props;
  const [way, setWay] = useState<Way>(form.capture ? "own" : "embed");
  const ways: [Way, string, string, string][] = [
    ["link", "link", "Link", "Its own page to send people"],
    ["embed", "code", "On your website", "In a page, a popup or a slide-in"],
    ["own", "form", "Your own form", "Keep your site's form, Claritia reads it"],
  ];
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] max-[860px]:grid-cols-1 max-[860px]:grid-rows-[auto_minmax(0,1fr)]">
      <div className="flex flex-col gap-[2px] overflow-y-auto border-r border-line px-[8px] py-[12px] max-[860px]:flex-row max-[860px]:overflow-x-auto max-[860px]:border-r-0 max-[860px]:border-b max-[860px]:p-[8px]">
        {ways.map(([v, i, l, d]) => (
          <LeftItem key={v} on={way === v} onClick={() => setWay(v)} icon={<Ic n={i} />} title={l} sub={d} />
        ))}
      </div>
      <div className="min-w-0 overflow-y-auto px-[16px] pt-[20px] pb-[32px] sm:px-[clamp(16px,3vw,32px)]">
        <div className="flex max-w-[760px] flex-col gap-[16px]">
          {!row.version ? (
            <Box tone="warn" title="Publish the form first">
              <span className="text-body">The link and the code work once it&apos;s live</span>
            </Box>
          ) : null}
          {way === "link" ? <LinkPane {...props} /> : way === "embed" ? <EmbedPane {...props} /> : <OwnPane {...props} />}
        </div>
      </div>
    </div>
  );
}

/** A row in a tab's left list: an icon tile, a title and one gray line. */
export function LeftItem({ on, onClick, icon, title, sub, sub2, right, subTone }: { on: boolean; onClick: () => void; icon: React.ReactNode; title: string; sub?: string; sub2?: string; right?: React.ReactNode; subTone?: "bad" }) {
  return (
    <button type="button" onClick={onClick} aria-current={on ? "true" : undefined} className={`flex min-h-[52px] w-full items-center gap-[10px] rounded-[10px] px-[10px] py-[8px] text-left transition-colors duration-[120ms] max-[860px]:min-h-[40px] max-[860px]:w-auto max-[860px]:shrink-0 ${on ? "bg-paper-deep" : "hover:bg-paper"}`}>
      <span className={`inline-flex size-[28px] shrink-0 items-center justify-center rounded-lg transition-colors duration-[120ms] ${on ? "bg-ink text-card" : "bg-paper-deep text-body"}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <b className="block font-medium whitespace-nowrap text-ink">{title}</b>
        {sub ? <span className={`block truncate text-[12px] max-[860px]:hidden ${subTone === "bad" ? "text-rose" : "text-muted"}`}>{sub}</span> : null}
        {sub2 ? <span className="block truncate text-[12px] text-muted max-[860px]:hidden">{sub2}</span> : null}
      </span>
      {right}
    </button>
  );
}

const H3 = ({ children }: { children: React.ReactNode }) => <h3 className="m-0 text-[15px] font-semibold tracking-[-0.01em] text-ink">{children}</h3>;
const Sub = ({ children }: { children: React.ReactNode }) => <p className="-mt-[10px] mb-0 text-[12.5px] text-muted">{children}</p>;

function LinkPane({ form, row, apply }: Parameters<typeof Share>[0]) {
  const note = useNote();
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const host = origin.replace(/^https?:\/\//, "");
  const url = `${origin}/f/${row.id}`;
  const fill = allFields(form).filter((f) => f.type !== "hidden" && f.type !== "heading" && f.type !== "paragraph");
  const prefillOn = fill.length > 0 && fill.every((f) => f.prefill);
  return (
    <>
      <H3>Link</H3>
      <Sub>A page in your brand. It works on phones and in emails.</Sub>
      <div className={CARD}>
        <div className={CSTACK}>
          <label className="text-[12px] font-medium text-muted">Address</label>
          <div className="flex flex-wrap items-center gap-[8px]">
            <span className="font-mono text-[11.5px] text-muted">{`${host}/f/`}</span>
            <input readOnly value={row.id} aria-label="Link" onFocus={(e) => e.currentTarget.select()} className="h-[30px] w-[180px] min-w-0 rounded-sm border border-line-strong bg-card px-[10px] font-mono text-[12px] text-ink outline-none focus:border-ink" />
            <button type="button" className={GHOST_SM} onClick={() => void copyText(url).then((ok) => note.show(ok ? "Copied" : "Couldn't copy"))}>
              <Ic n="copy" />
              Copy
            </button>
            <button type="button" className={GHOST_SM} disabled={!row.version} onClick={() => window.open(url, "_blank", "noopener")}>
              <Ic n="ext" />
              Open
            </button>
          </div>
        </div>
        <div className={CROW}>
          <RowText title="Fill in from the link" sub="Add ?email= or ?company= and those questions start filled" />
          <Tg label="Fill in from the link" on={prefillOn} onChange={(v) => apply(fill.map((f): Op => ({ op: "update_field", id: f.id, patch: { prefill: v || undefined } })), v ? "Questions fill in from the link" : "Questions start empty")} />
        </div>
      </div>
      {note.node}
    </>
  );
}

function EmbedPane({ sb, form, row, kit }: Parameters<typeof Share>[0]) {
  const accent = kit?.tokens.buttonBg || kit?.tokens.accent;
  const [mode, setMode] = useState<Mode>("inline");
  const [plat, setPlat] = useState<Plat>("webflow");
  const [button, setButton] = useState(form.submit.label);
  const [after, setAfter] = useState<"10" | "30" | "exit">("30");
  const [once, setOnce] = useState(true);
  const note = useNote();
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const script = `<script src="${origin}/forms/v1.js" async></script>`;
  const code =
    mode === "inline"
      ? `${script}\n<claritia-form form-id="${row.id}"></claritia-form>`
      : mode === "popup"
        ? `${script}\n<claritia-form form-id="${row.id}" popup="click"${once ? " once" : ""}></claritia-form>\n<button data-claritia-open="${row.id}">${button.replace(/[<>&"]/g, "")}</button>`
        : `${script}\n<claritia-form form-id="${row.id}" popup="${after === "exit" ? "exit" : `delay:${after}`}" slide${once ? " once" : ""}></claritia-form>`;
  // The pages it was filled on, found by the database (form_seen_pages).
  const seen = useQuery(`form:${row.id}:seen`, async () => (must(await sb.rpc("form_seen_pages", { p_form: row.id, p_since: daysAgo(90) })) ?? []) as [string, { last: string; blocked: boolean }][]);
  const cards: [Mode, string, string][] = [
    ["inline", "In the page", "left-[10%] right-[10%] top-[22%] bottom-[22%]"],
    ["popup", "Popup", "left-[28%] right-[28%] top-[16%] bottom-[16%]"],
    ["slide", "Slide-in", "right-[6%] w-[34%] top-[36%] bottom-[8%]"],
  ];
  return (
    <>
      <H3>On your website</H3>
      <Sub>Paste it once. Changes you publish show up on its own.</Sub>
      <div className="grid grid-cols-3 gap-[10px]">
        {cards.map(([v, l, pos]) => (
          <button key={v} type="button" aria-pressed={mode === v} onClick={() => setMode(v)} className={`flex flex-col gap-[8px] rounded-[10px] border p-[10px] text-left transition-colors duration-[120ms] ${mode === v ? "border-ink ring-1 ring-ink" : "border-line hover:border-line-strong"}`}>
            <span aria-hidden="true" className="relative h-[64px] overflow-hidden rounded-[6px] border border-line bg-paper">
              <i className="absolute top-[12%] right-[10%] left-[10%] h-[6px] rounded-[3px] bg-line-strong" />
              <i className="absolute top-[calc(12%+12px)] right-[10%] left-[10%] h-[6px] rounded-[3px] bg-line" />
              <i className={`absolute rounded-[4px] bg-ink opacity-85 shadow-[0_2px_8px_rgb(0_0_0/0.12)] ${pos}`} style={accent ? { background: accent } : undefined} />
            </span>
            <b className="text-[12.5px] font-medium text-ink">{l}</b>
          </button>
        ))}
      </div>
      {mode !== "inline" ? (
        <div className={CARD}>
          <div className={CROW}>
            <RowText title={mode === "popup" ? "Opens when someone clicks" : "Slides in after"} />
            {mode === "popup" ? (
              <input value={button} onChange={(e) => setButton(e.target.value)} aria-label="Button text" className="h-[30px] w-[180px] rounded-sm border border-line-strong bg-card px-[10px] text-[12.5px] text-ink outline-none focus:border-ink" />
            ) : (
              <Seg label="Slides in after" value={after} onChange={setAfter} options={[{ value: "10", label: "10 s" }, { value: "30", label: "30 s" }, { value: "exit", label: "On exit" }]} />
            )}
          </div>
          <div className={CROW}>
            <RowText title="Don't show again to people who sent it" />
            <Tg label="Don't show again to people who sent it" on={once} onChange={setOnce} />
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-[6px]">
        {PLATS.map((p) => (
          <button key={p.v} type="button" aria-pressed={plat === p.v} onClick={() => setPlat(p.v)} className={`inline-flex h-[32px] items-center gap-[7px] rounded-full border pr-[10px] pl-[7px] text-[12.5px] transition-colors duration-[120ms] ${plat === p.v ? "border-ink font-medium text-ink" : "border-line text-body hover:border-line-strong"}`}>
            {p.domain ? <BrandLogo domain={p.domain} name={p.l} size={18} /> : <span className="inline-flex size-[18px] items-center justify-center rounded-[5px] bg-paper-deep font-mono text-[9px] text-body">&lt;/&gt;</span>}
            {p.l}
          </button>
        ))}
      </div>
      <div className="relative">
        <pre className="m-0 overflow-x-auto rounded-[10px] border border-line bg-paper px-[16px] py-[14px] pr-[96px] font-mono text-[12px] leading-[1.6] whitespace-pre text-body">{code}</pre>
        <button type="button" className={`${GHOST_SM} absolute top-[10px] right-[10px]`} onClick={() => void copyText(code).then((ok) => note.show(ok ? "Copied" : "Couldn't copy"))}>
          <Ic n="copy" />
          Copy
        </button>
      </div>
      <span className="text-[12.5px] text-muted">{PLATS.find((p) => p.v === plat)!.how}</span>
      <div className={CARD}>
        <div className={`${CROW} min-h-[44px]`}>
          <RowText title="Seen on" />
        </div>
        {seen.data?.length ? (
          seen.data.map(([page, s]) => (
            <div key={page} className="flex items-center gap-[10px] border-t border-line px-[16px] py-[10px] text-[12.5px]">
              {s.blocked ? <Badge tone="amber">Blocked</Badge> : <Badge tone="green" dot>Live</Badge>}
              <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink">{page}</code>
              <span className="text-muted">{s.blocked ? "Not on your site list, fills go to Spam" : `Last fill ${lower(ago(s.last))}`}</span>
            </div>
          ))
        ) : (
          <div className="border-t border-line px-[16px] py-[10px] text-[12.5px] text-muted">{seen.error || "No fills from a page yet"}</div>
        )}
      </div>
      {note.node}
    </>
  );
}

function OwnPane({ sb, ws, navigate, form, row }: Parameters<typeof Share>[0]) {
  const [error, setError] = useState("");
  const note = useNote();
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const code = `<script src="${origin}/forms/v1.js" async data-capture="${row.id}"></script>`;
  if (!form.capture)
    return (
      <>
        <H3>Your own form</H3>
        <Sub>Keep the form your site already has. Claritia reads each send and treats it like its own.</Sub>
        <Box tone="info">
          <span>Your form still sends where it did before. Spam rules and Routing work the same as on a Claritia form.</span>
        </Box>
        <ErrorNote message={error} />
        <button
          type="button"
          className={`${GHOST_SM} self-start`}
          onClick={async () => {
            setError("");
            try {
              const id = must(await sb.rpc("form_create", { p_ws: ws.id, p_name: "Your own form", p_draft: capturedForm("html"), p_brand_kit: null, p_kind: "captured" })) as string;
              navigate("forms", id, "tab=share");
            } catch (e) {
              setError(errorText(e));
            }
          }}
        >
          <Ic n="plus" />
          Read my own form
        </button>
      </>
    );
  const fields = allFields(form).filter((f) => f.type !== "heading" && f.type !== "paragraph");
  return (
    <>
      <H3>Your own form</H3>
      <Sub>Keep the form your site already has. Claritia reads each send and treats it like its own.</Sub>
      <div className="relative">
        <pre className="m-0 overflow-x-auto rounded-[10px] border border-line bg-paper px-[16px] py-[14px] pr-[96px] font-mono text-[12px] leading-[1.6] whitespace-pre text-body">{code}</pre>
        <button type="button" className={`${GHOST_SM} absolute top-[10px] right-[10px]`} onClick={() => void copyText(code).then((ok) => note.show(ok ? "Copied" : "Couldn't copy"))}>
          <Ic n="copy" />
          Copy
        </button>
      </div>
      <div className={CARD}>
        <div className={CROW}>
          <RowText title="Fields on your form" sub="Matched by their names" />
        </div>
        <table className="w-full border-collapse border-t border-line text-[13px]">
          <thead>
            <tr>
              <th className="border-b border-line bg-paper px-[12px] py-[9px] text-left text-[12px] font-medium text-muted">Your field</th>
              <th className="border-b border-line bg-paper px-[12px] py-[9px] text-left text-[12px] font-medium text-muted">Claritia field</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((f) => (
              <tr key={f.id}>
                <td className="border-b border-line px-[12px] py-[9px] font-mono text-[12px] last:border-b-0">{f.source || <span className="text-faint">Not matched</span>}</td>
                <td className={`border-b border-line px-[12px] py-[9px] ${f.key.startsWith("q.") ? "text-muted" : "text-ink"}`}>{saveName(f, [])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Box tone="info">
        <span>Your form still sends where it did before. Spam rules and Routing work the same as on a Claritia form.</span>
      </Box>
      {note.node}
    </>
  );
}
