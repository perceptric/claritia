"use client";

// Share (docs/sharing-plan.md): the ways a form gets in front of people, on the left; the one picked on the right.
// Link: the form's own page. On your website: in the page, full page, popup, slider, popover or side tab, the code for
// the site's builder and the pages it was seen on. Your own form: keep the site's form, and Claritia reads each send.

import { useState } from "react";
import type { Op } from "@/lib/forms/ops";
import { allFields, type Form } from "@/lib/forms/schema";
import { capturedForm } from "@/lib/forms/templates";
import { formEmbedCode, overPage, PLATS, type FormEmbed, type FormMode, type Opens, type Plat } from "@/lib/share/embed";
import { emailQuestionHtml, firstQuestion } from "@/lib/share/emailForm";
import { BrandLogo } from "../BrandLogo";
import { QrCode } from "../meetings/Share";
import { useLinkBase } from "../views/LinkDomainSettings";
import { Badge, ErrorNote, errorText, must, postJson, useQuery, type ViewProps } from "../ui";
import { ago, daysAgo, saveName } from "./formModel";

/** "Yesterday" and "Just now" read lower case after other words; dates and counts keep theirs. */
const lower = (w: string) => (/^(Yesterday|Just now)$/.test(w) ? w.toLowerCase() : w);
import { Ic } from "./ic";
import { Box, BTN, CARD, copyText, CROW, CSTACK, GHOST_SM, IN, RowText, Seg, useNote, Tg } from "./parts";
import type { FormRow, Kit } from "./shared";

type Way = "link" | "embed" | "email" | "qr" | "own";
export function Share(props: ViewProps & { form: Form; row: FormRow & { kind?: "built" | "captured" }; apply: (ops: Op | Op[], words?: string) => boolean; kit: Kit | null; site: string }) {
  const { form, row } = props;
  const [way, setWay] = useState<Way>(form.capture ? "own" : "embed");
  const ways: [Way, string, string, string][] = [
    ["link", "link", "Link", "Its own page, its ending and preview"],
    ["embed", "code", "On your website", "In the page, a popup, a slider and more"],
    ["email", "mail", "Email", "Send the link, or the form in an email"],
    ["qr", "qr", "QR code", "For posters, slides and print"],
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
          {way === "link" ? <LinkPane {...props} /> : way === "embed" ? <EmbedPane {...props} /> : way === "email" ? <EmailPane {...props} /> : way === "qr" ? <QrPane {...props} /> : <OwnPane {...props} />}
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

type LinkParts = { ws: string; slug: string | null };

function LinkPane({ sb, session, ws, form, row, apply }: Parameters<typeof Share>[0]) {
  const note = useNote();
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const host = origin.replace(/^https?:\/\//, "");
  const url = `${origin}/f/${row.id}`;
  const fill = allFields(form).filter((f) => f.type !== "hidden" && f.type !== "heading" && f.type !== "paragraph");
  const prefillOn = fill.length > 0 && fill.every((f) => f.prefill);
  // The link's ending (117): /f/<workspace>/<ending>; the id link above always keeps working.
  const parts = useQuery(`form:${row.id}:link`, async () => must(await sb.rpc("form_link", { p_form: row.id })) as LinkParts);
  const [ending, setEnding] = useState<string | null>(null);
  const [endErr, setEndErr] = useState("");
  const [busy, setBusy] = useState(false);
  const cur = parts.data?.slug ?? "";
  const typed = ending ?? cur;
  // On the workspace's own domain or subdomain the ending stands alone (Settings › Link domain).
  const base = useLinkBase(session, ws.id);
  const own = parts.data?.slug ? (base ? `${base}/${parts.data.slug}` : `${origin}/f/${parts.data.ws}/${parts.data.slug}`) : "";
  const saveEnding = async () => {
    setBusy(true);
    setEndErr("");
    try {
      const r = must(await sb.rpc("form_set_slug", { p_form: row.id, p_slug: typed.trim().toLowerCase() })) as LinkParts;
      parts.set(r);
      setEnding(null);
      note.show(r.slug ? "Link ending saved" : "Link ending removed");
    } catch (e) {
      setEndErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  // The link's preview in chats and social posts.
  const share = form.share ?? {};
  const [imgBusy, setImgBusy] = useState(false);
  const [imgErr, setImgErr] = useState("");
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setImgBusy(true);
    setImgErr("");
    try {
      const body = new FormData();
      body.append("workspaceId", ws.id);
      body.append("file", file, file.name || "preview.png");
      const res = await fetch("/api/assets", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` }, body });
      const out = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !out.url) throw new Error(out.error ?? "Try again in a moment.");
      apply({ op: "set_share", share: { image: out.url } }, "Changed the link's picture");
    } catch (e) {
      setImgErr(errorText(e));
    } finally {
      setImgBusy(false);
    }
  };
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
        <div className={CSTACK}>
          <label htmlFor="link-ending" className="text-[12px] font-medium text-muted">
            Link ending
          </label>
          <div className="flex flex-wrap items-center gap-[8px]">
            <span className="font-mono text-[11.5px] text-muted">{base ? `${base.replace(/^https:\/\//, "")}/` : `${host}/f/${parts.data?.ws ?? "…"}/`}</span>
            <input id="link-ending" value={typed} placeholder="demo-request" maxLength={50} onChange={(e) => setEnding(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} className="h-[30px] w-[180px] min-w-0 rounded-sm border border-line-strong bg-card px-[10px] font-mono text-[12px] text-ink outline-none focus:border-ink" />
            {typed !== cur ? (
              <button type="button" className={GHOST_SM} disabled={busy || !parts.data} onClick={() => void saveEnding()}>
                {busy ? "Saving" : "Save"}
              </button>
            ) : own ? (
              <button type="button" className={GHOST_SM} onClick={() => void copyText(own).then((ok) => note.show(ok ? "Copied" : "Couldn't copy"))}>
                <Ic n="copy" />
                Copy
              </button>
            ) : null}
          </div>
          <ErrorNote message={endErr || parts.error} />
        </div>
        <div className={CROW}>
          <RowText title="Fill in from the link" sub="Add ?email= or ?company= and those questions start filled" />
          <Tg label="Fill in from the link" on={prefillOn} onChange={(v) => apply(fill.map((f): Op => ({ op: "update_field", id: f.id, patch: { prefill: v || undefined } })), v ? "Questions fill in from the link" : "Questions start empty")} />
        </div>
      </div>
      <H3>Link preview</H3>
      <div className={CARD}>
        <div className={CSTACK}>
          <label htmlFor="share-title" className="text-[12px] font-medium text-muted">
            Title
          </label>
          <input id="share-title" key={`t:${share.title ?? ""}`} defaultValue={share.title ?? ""} placeholder={form.title || row.name} maxLength={90} onBlur={(e) => e.target.value.trim() !== (share.title ?? "") && apply({ op: "set_share", share: { title: e.target.value.trim() } }, "Changed the link's title")} className={IN} />
        </div>
        <div className={CSTACK}>
          <label htmlFor="share-line" className="text-[12px] font-medium text-muted">
            Line
          </label>
          <input id="share-line" key={`d:${share.description ?? ""}`} defaultValue={share.description ?? ""} maxLength={200} onBlur={(e) => e.target.value.trim() !== (share.description ?? "") && apply({ op: "set_share", share: { description: e.target.value.trim() } }, "Changed the link's line")} className={IN} />
        </div>
        <div className={CROW}>
          {/* eslint-disable-next-line @next/next/no-img-element -- the team's own uploaded picture, any size */}
          {share.image ? <img src={share.image} alt="" className="h-[52px] w-[100px] shrink-0 rounded-[6px] border border-line object-cover" /> : null}
          <RowText title="Picture" sub="1200 × 630 shows best" />
          <label className={`${GHOST_SM} cursor-pointer`}>
            {imgBusy ? "Uploading" : share.image ? "Change" : "Upload"}
            <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="sr-only" onChange={(e) => void upload(e.target.files?.[0])} />
          </label>
          {share.image ? (
            <button type="button" className={GHOST_SM} onClick={() => apply({ op: "set_share", share: { image: "" } }, "Removed the link's picture")}>
              Remove
            </button>
          ) : null}
        </div>
        <ErrorNote message={imgErr} />
      </div>
      {note.node}
    </>
  );
}

function EmailPane({ session, ws, form, row, kit }: Parameters<typeof Share>[0]) {
  const note = useNote();
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const list = [...new Set(to.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean))];
  const send = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await postJson<{ queued: number }>(session, "/api/forms/share-email", { workspaceId: ws.id, formId: row.id, to: list, message });
      setTo("");
      note.show(r.queued === 1 ? "Sent to 1 address" : `Sent to ${r.queued} addresses`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const q = firstQuestion(form);
  const html = q ? emailQuestionHtml(q, { link: `${origin}/f/${row.id}`, color: kit?.tokens.buttonBg || kit?.tokens.accent, textColor: kit?.tokens.buttonText }) : "";
  return (
    <>
      <H3>Send the link</H3>
      <div className={CARD}>
        <div className={CSTACK}>
          <label htmlFor="share-to" className="text-[12px] font-medium text-muted">
            To
          </label>
          <textarea id="share-to" value={to} onChange={(e) => setTo(e.target.value)} rows={3} placeholder="name@company.com, name@company.com" className={`${IN} h-auto py-[8px] font-mono text-[12px]`} />
        </div>
        <div className={CSTACK}>
          <label htmlFor="share-note" className="text-[12px] font-medium text-muted">
            Message
          </label>
          <textarea id="share-note" value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={1000} className={`${IN} h-auto py-[8px]`} />
        </div>
        <div className={CROW}>
          <span className="flex-1 text-[12.5px] text-muted">{list.length ? `${list.length} of 50` : ""}</span>
          <button type="button" className={BTN} disabled={busy || !list.length || list.length > 50 || !row.version} onClick={() => void send()}>
            {busy ? "Sending" : "Send"}
          </button>
        </div>
        <ErrorNote message={error} />
      </div>
      <H3>The form in an email</H3>
      {q ? (
        <>
          <div className={CARD}>
            <div className="p-[16px]" dangerouslySetInnerHTML={{ __html: html }} />
          </div>
          <div className="flex flex-wrap gap-[8px]">
            <button
              type="button"
              className={GHOST_SM}
              onClick={async () => {
                // Pasted into Gmail or Outlook as the email itself: the rich copy; the HTML for an email tool's code block.
                try {
                  await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([q.label], { type: "text/plain" }) })]);
                  note.show("Copied. Paste it into your email.");
                } catch {
                  note.show((await copyText(html)) ? "Copied the HTML" : "Couldn't copy");
                }
              }}
            >
              <Ic n="copy" />
              Copy for Gmail or Outlook
            </button>
            <button type="button" className={GHOST_SM} onClick={() => void copyText(html).then((ok) => note.show(ok ? "Copied the HTML" : "Couldn't copy"))}>
              <Ic n="code" />
              Copy HTML
            </button>
          </div>
        </>
      ) : (
        <Box tone="warn" title="Start the form with a pick list or a rating">
          <span className="text-body">Each answer becomes a button in the email</span>
        </Box>
      )}
      {note.node}
    </>
  );
}

function QrPane({ row }: Parameters<typeof Share>[0]) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  // Always the id link, so a printed code keeps working when the ending changes.
  return (
    <>
      <H3>QR code</H3>
      <Sub>It always opens the form, whatever its link ending.</Sub>
      <QrCode url={`${origin}/f/${row.id}`} name={row.name} />
    </>
  );
}

/** The six ways on a site, each drawn as a small page with the form where it shows. */
const MODES: { v: FormMode; l: string; draw: React.ReactNode }[] = [
  { v: "inline", l: "In the page", draw: <i className="absolute top-[34%] right-[18%] bottom-[10%] left-[18%] rounded-[3px] bg-ink" /> },
  { v: "full", l: "Full page", draw: <i className="absolute inset-[8%] rounded-[3px] bg-ink" /> },
  { v: "popup", l: "Popup", draw: <><i className="absolute inset-0 bg-ink/15" /><i className="absolute top-[18%] right-[28%] bottom-[18%] left-[28%] rounded-[3px] bg-ink" /></> },
  { v: "slider", l: "Slider", draw: <><i className="absolute inset-0 bg-ink/15" /><i className="absolute top-0 right-0 bottom-0 w-[38%] bg-ink" /></> },
  { v: "popover", l: "Popover", draw: <><i className="absolute right-[8%] bottom-[34%] h-[46%] w-[34%] rounded-[3px] bg-ink" /><i className="absolute right-[8%] bottom-[8%] size-[16%] rounded-full bg-ink" /></> },
  { v: "sidetab", l: "Side tab", draw: <i className="absolute top-[30%] right-0 h-[40%] w-[7%] rounded-l-[2px] bg-ink" /> },
];

function EmbedPane({ sb, form, row }: Parameters<typeof Share>[0]) {
  const [o, setO] = useState<FormEmbed>({ mode: "inline", opens: "click", size: "m", side: "right", text: form.submit.label, icon: "chat", note: "", once: true, phoneFull: true });
  const set = (p: Partial<FormEmbed>) => setO((x) => ({ ...x, ...p }));
  const [plat, setPlat] = useState<Plat>("webflow");
  const note = useNote();
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const code = formEmbedCode(origin, row.id, o);
  // The pages it was filled on, found by the database (form_seen_pages).
  const seen = useQuery(`form:${row.id}:seen`, async () => (must(await sb.rpc("form_seen_pages", { p_form: row.id, p_since: daysAgo(90) })) ?? []) as [string, { last: string; blocked: boolean }][]);
  const opensOn = o.mode === "popup" || o.mode === "slider";
  const textBox = (label: string, value: string, onChange: (v: string) => void, placeholder?: string) => (
    <input value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} placeholder={placeholder} maxLength={60} className="h-[30px] w-[200px] rounded-sm border border-line-strong bg-card px-[10px] text-[12.5px] text-ink outline-none focus:border-ink" />
  );
  return (
    <>
      <H3>On your website</H3>
      <Sub>Paste it once. Changes you publish show up on its own.</Sub>
      <div className="grid grid-cols-3 gap-[10px] max-[560px]:grid-cols-2">
        {MODES.map((m) => (
          <button key={m.v} type="button" aria-pressed={o.mode === m.v} onClick={() => set({ mode: m.v })} className={`flex flex-col gap-[8px] rounded-[10px] border p-[10px] text-left transition-colors duration-[120ms] ${o.mode === m.v ? "border-ink ring-1 ring-ink" : "border-line hover:border-line-strong"}`}>
            <span aria-hidden="true" className="relative h-[64px] overflow-hidden rounded-[6px] border border-line bg-paper">
              <i className="absolute top-[12%] right-[10%] left-[10%] h-[6px] rounded-[3px] bg-line-strong" />
              <i className="absolute top-[calc(12%+12px)] right-[10%] left-[10%] h-[6px] rounded-[3px] bg-line" />
              <span className="absolute inset-0 opacity-85">{m.draw}</span>
            </span>
            <b className="text-[12.5px] font-medium text-ink">{m.l}</b>
          </button>
        ))}
      </div>
      {o.mode !== "inline" && o.mode !== "full" ? (
        <div className={CARD}>
          {opensOn ? (
            <div className={CROW}>
              <RowText title="Opens" />
              <Seg label="Opens" value={o.opens ?? "click"} onChange={(v: Opens) => set({ opens: v })} options={[{ value: "click", label: "On click" }, { value: "10", label: "After 10 s" }, { value: "30", label: "After 30 s" }, { value: "exit", label: "On exit" }]} />
            </div>
          ) : null}
          {opensOn && o.opens === "click" ? (
            <div className={CROW}>
              <RowText title="Button text" />
              {textBox("Button text", o.text ?? "", (text) => set({ text }))}
            </div>
          ) : null}
          {o.mode === "popup" ? (
            <div className={CROW}>
              <RowText title="Size" />
              <Seg label="Size" value={o.size ?? "m"} onChange={(size: "s" | "m" | "l") => set({ size })} options={[{ value: "s", label: "Small" }, { value: "m", label: "Medium" }, { value: "l", label: "Large" }]} />
            </div>
          ) : null}
          {o.mode === "slider" ? (
            <div className={CROW}>
              <RowText title="From the" />
              <Seg label="From the" value={o.side ?? "right"} onChange={(side: "left" | "right") => set({ side })} options={[{ value: "left", label: "Left" }, { value: "right", label: "Right" }]} />
            </div>
          ) : null}
          {o.mode === "popover" ? (
            <>
              <div className={CROW}>
                <RowText title="Icon" />
                <Seg label="Icon" value={o.icon ?? "chat"} onChange={(icon: "chat" | "calendar" | "form" | "logo") => set({ icon })} options={[{ value: "chat", label: "Chat" }, { value: "calendar", label: "Calendar" }, { value: "form", label: "Form" }, { value: "logo", label: "Logo" }]} />
              </div>
              <div className={CROW}>
                <RowText title="Note" />
                {textBox("Note", o.note ?? "", (note) => set({ note }), "Questions?")}
              </div>
            </>
          ) : null}
          {o.mode === "sidetab" ? (
            <div className={CROW}>
              <RowText title="Tab text" />
              {textBox("Tab text", o.text ?? "", (text) => set({ text }), "Contact us")}
            </div>
          ) : null}
          {opensOn && o.opens !== "click" ? (
            <div className={CROW}>
              <RowText title="Don't show again to people who sent it" />
              <Tg label="Don't show again to people who sent it" on={!!o.once} onChange={(once) => set({ once })} />
            </div>
          ) : null}
          {overPage(o.mode) ? (
            <div className={CROW}>
              <RowText title="Full screen on phones" />
              <Tg label="Full screen on phones" on={o.phoneFull !== false} onChange={(phoneFull) => set({ phoneFull })} />
            </div>
          ) : null}
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
        <pre data-embed-code className="m-0 overflow-x-auto rounded-[10px] border border-line bg-paper px-[16px] py-[14px] pr-[96px] font-mono text-[12px] leading-[1.6] whitespace-pre text-body">{code}</pre>
        <button type="button" className={`${GHOST_SM} absolute top-[10px] right-[10px]`} onClick={() => void copyText(code).then((ok) => note.show(ok ? "Copied" : "Couldn't copy"))}>
          <Ic n="copy" />
          Copy
        </button>
      </div>
      <span className="text-[12.5px] text-muted">
        {PLATS.find((p) => p.v === plat)!.how}{" "}
        <a href="/developers/embed" target="_blank" rel="noopener" className="font-medium text-ink underline-offset-2 hover:underline">
          For developers
        </a>
      </span>
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
