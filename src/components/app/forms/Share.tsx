"use client";

// Share (docs/sharing-plan.md, docs/form-ui-plan.md step 3): the ways a form gets in front of people on the left, the
// one picked on the right, shown more than told. Link: the link with its ending typed in place, and the preview card
// people see in chats (edited on the card). Website: the six ways as pictures, a live preview of the picked one on a
// sample page, and the code with its builder and its steps. Embed HTML, Email and QR code.

import { useRef, useState } from "react";
import type { Op } from "@/lib/forms/ops";
import type { Form } from "@/lib/forms/schema";
import { formEmbedCode, overPage, pageHtmlCss, type FormEmbed, type FormMode, type Opens, type Plat } from "@/lib/share/embed";
import { emailQuestionHtml, firstQuestion } from "@/lib/share/emailForm";
import { viaLink } from "@/lib/share/channels";
import { QrCode } from "../meetings/Share";
import { BuilderPick, CodeBox, EmbedSteps, SitePreview, useCopied } from "../SharePieces";
import { SendEmail } from "./SendEmail";
import { useLinkBase } from "../views/LinkDomainSettings";
import { ErrorNote, errorText, must, useQuery, type ViewProps } from "../ui";
import { Ic } from "./ic";
import { Menu } from "./Menu";
import { Box, BTN, CARD, copyText, CROW, GHOST_SM, IB, IB_SM, RowText, Seg, Tg, useNote } from "./parts";
import type { FormRow, Kit } from "./shared";

type Way = "link" | "embed" | "html" | "email" | "qr";
type Props = ViewProps & { form: Form; row: FormRow & { kind?: "built" | "captured" }; apply: (ops: Op | Op[], words?: string) => boolean; kit: Kit | null; site: string };

export function Share(props: Props) {
  const { form, row } = props;
  const [way, setWay] = useState<Way>("link");
  const ways: [Way, string, string][] = [
    ["link", "link", "Link"],
    ["embed", "code", "Website"],
    ...(form.page ? ([["html", "code", "Embed HTML"]] as [Way, string, string][]) : []),
    ["email", "mail", "Email"],
    ["qr", "qr", "QR code"],
  ];
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[200px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] max-[860px]:grid-cols-1 max-[860px]:grid-rows-[auto_minmax(0,1fr)]">
      <div className="flex flex-col gap-[2px] overflow-y-auto border-r border-line px-[8px] py-[12px] max-[860px]:flex-row max-[860px]:overflow-x-auto max-[860px]:border-r-0 max-[860px]:border-b max-[860px]:p-[8px]">
        {ways.map(([v, i, l]) => (
          <LeftItem key={v} on={way === v} onClick={() => setWay(v)} icon={<Ic n={i} />} title={l} />
        ))}
      </div>
      <div className="min-w-0 overflow-y-auto px-[16px] pt-[20px] pb-[32px] sm:px-[clamp(16px,3vw,32px)]">
        <div className="flex max-w-[760px] flex-col gap-[16px]">
          {!row.version ? <Box tone="warn" title="Publish the form first" /> : null}
          {way === "link" ? <LinkPane {...props} /> : way === "embed" ? <EmbedPane {...props} /> : way === "html" ? <HtmlPane {...props} /> : way === "email" ? <EmailPane {...props} /> : <QrPane {...props} />}
        </div>
      </div>
    </div>
  );
}

/** A row in a tab's left list: an icon tile, a title and, where it helps, one gray line. */
export function LeftItem({ on, onClick, icon, title, sub, sub2, right, subTone }: { on: boolean; onClick: () => void; icon: React.ReactNode; title: string; sub?: string; sub2?: string; right?: React.ReactNode; subTone?: "bad" }) {
  return (
    <button type="button" onClick={onClick} aria-current={on ? "true" : undefined} className={`flex w-full items-center gap-[10px] rounded-[10px] px-[10px] text-left transition-colors duration-[120ms] max-[860px]:min-h-[40px] max-[860px]:w-auto max-[860px]:shrink-0 ${sub || sub2 ? "min-h-[52px] py-[8px]" : "min-h-[44px] py-[6px]"} ${on ? "bg-paper-deep" : "hover:bg-paper"}`}>
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

type LinkParts = { ws: string; slug: string | null };
/** A database piece that isn't there yet (a migration not run): its part of the screen hides. */
const missing = (e: unknown) => /schema cache|could not find the function|does not exist|PGRST20/i.test(errorText(e));
const origin = () => (typeof window === "undefined" ? "" : window.location.origin);

function LinkPane({ sb, session, ws, role, navigate, form, row, apply }: Props) {
  const note = useNote();
  const host = origin().replace(/^https?:\/\//, "");
  const url = `${origin()}/f/${row.id}`;
  // The link's ending (117): /f/<workspace>/<ending>; the id link always keeps working. Before 117, no ending.
  const parts = useQuery(`form:${row.id}:link`, async () => {
    try {
      return must(await sb.rpc("form_link", { p_form: row.id })) as LinkParts;
    } catch (e) {
      if (missing(e)) return null;
      throw e;
    }
  });
  const endings = !!parts.data;
  const [typed, setTyped] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [endErr, setEndErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const { done, copy } = useCopied();
  const cur = parts.data?.slug ?? "";
  const shown = typed ?? cur;
  // On the workspace's own domain or subdomain the ending stands alone (Settings › Link domain).
  const base = useLinkBase(session, ws.id);
  const own = cur ? (base ? `${base}/${cur}` : `${origin()}/f/${parts.data!.ws}/${cur}`) : "";
  const link = own || url;
  const prefix = base ? `${base.replace(/^https:\/\//, "")}/` : `${host}/f/${parts.data?.ws ?? ""}/`;
  const dirty = typed !== null && typed !== cur;
  const stop = () => {
    setTyped(null);
    setEditing(false);
    setEndErr("");
  };
  const saveEnding = async () => {
    if (!dirty) return stop();
    setBusy(true);
    setEndErr("");
    try {
      const r = must(await sb.rpc("form_set_slug", { p_form: row.id, p_slug: shown.trim().toLowerCase().replace(/^-+|-+$/g, "") })) as LinkParts;
      parts.set(r);
      stop();
      note.show(r.slug ? "Link ending saved" : "Link ending removed");
    } catch (e) {
      setEndErr(missing(e) ? "Couldn't save the ending. Try again." : errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const items = [
    ...(own ? [{ icon: "copy", label: "Copy the id link", run: () => void copyText(url).then((ok) => note.show(ok ? "Copied" : "Couldn't copy")) }] : []),
    ...(cur ? [{ icon: "x", label: "Remove the ending", run: () => (setTyped(""), setEditing(true)) }] : []),
    ...(!base && role === "owner" ? [{ icon: "globe", label: "Your own domain", run: () => navigate("settings", "link_domain") }] : []),
  ];

  return (
    <>
      <H3>Link</H3>
      <div className="flex flex-wrap items-center gap-[8px]">
        <div data-share-link={link} className="flex h-[40px] min-w-0 flex-1 basis-[300px] items-center overflow-hidden rounded-[10px] border border-line-strong bg-card">
          {endings && (cur || editing) ? (
            <>
              <span className="max-w-[60%] shrink-0 truncate pl-[12px] font-mono text-[13px] text-muted" title={prefix}>
                {prefix}
              </span>
              <input
                aria-label="Link ending"
                value={shown}
                placeholder="demo-request"
                maxLength={50}
                autoFocus={editing}
                onChange={(e) => setTyped(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void saveEnding();
                  if (e.key === "Escape") stop();
                }}
                className="h-full min-w-[80px] flex-1 bg-transparent pr-[12px] font-mono text-[13px] text-ink outline-none placeholder:text-faint"
              />
            </>
          ) : (
            <>
              <a href={row.version ? url : undefined} target="_blank" rel="noopener" className="min-w-0 flex-1 truncate px-[12px] font-mono text-[13px] text-ink">
                {url.replace(/^https?:\/\//, "")}
              </a>
              {endings ? (
                <button type="button" className={`${IB_SM} mr-[6px]`} title="Change the ending" aria-label="Change the ending" onClick={() => setEditing(true)}>
                  <Ic n="build" />
                </button>
              ) : null}
            </>
          )}
        </div>
        {dirty || (editing && !cur) ? (
          <>
            <button type="button" className={BTN} disabled={busy || !dirty} onClick={() => void saveEnding()}>
              {busy ? "Saving" : "Save"}
            </button>
            <button type="button" className={GHOST_SM} disabled={busy} onClick={stop}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button type="button" className={BTN} disabled={!row.version} onClick={() => void copy("link", link)}>
              <Ic n={done === "link" ? "check" : "copy"} />
              {done === "link" ? "Copied" : "Copy link"}
            </button>
            <button type="button" className={GHOST_SM.replace("h-[26px]", "h-[32px]")} disabled={!row.version} onClick={() => window.open(link, "_blank", "noopener")}>
              <Ic n="ext" />
              Open
            </button>
          </>
        )}
        {items.length ? (
          <button type="button" className={IB} title="More" aria-label="More link options" aria-haspopup="menu" onClick={(e) => setMenu(menu ? null : e.currentTarget)}>
            <Ic n="more" />
          </button>
        ) : null}
      </div>
      <ErrorNote message={endErr || (parts.error ?? "")} />
      {menu ? <Menu anchor={menu} onClose={() => setMenu(null)} width={220} items={items} /> : null}
      <H3>Link preview</H3>
      <PreviewCard session={session} ws={ws} form={form} row={row} apply={apply} host={(link.replace(/^https?:\/\//, "").split("/")[0] ?? host).toLowerCase()} />
      {note.node}
    </>
  );
}

/** The card a link shows in chats and social posts, edited on the card itself: the picture, the title, the line. */
function PreviewCard({ session, ws, form, row, apply, host }: Pick<Props, "session" | "ws" | "form" | "row" | "apply"> & { host: string }) {
  const share = form.share ?? {};
  const [title, setTitle] = useState<string | null>(null);
  const [line, setLine] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [over, setOver] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const upload = async (f: File | undefined) => {
    if (!f) return;
    if (!/^image\/(png|jpe?g|gif|webp)$/.test(f.type)) return setErr("Use a PNG, JPG, GIF or WebP picture.");
    setBusy(true);
    setErr("");
    try {
      const body = new FormData();
      body.append("workspaceId", ws.id);
      body.append("file", f, f.name || "preview.png");
      const res = await fetch("/api/assets", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` }, body });
      const out = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !out.url) throw new Error(out.error ?? "Try again in a moment.");
      apply({ op: "set_share", share: { image: out.url } }, "Changed the link's picture");
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const keep = (k: "title" | "description", v: string, words: string) => {
    if (v.trim() !== (share[k] ?? "")) apply({ op: "set_share", share: { [k]: v.trim() } }, words);
  };
  const shownTitle = (title ?? share.title ?? "").trim() || form.title || row.name;
  return (
    <>
      <div aria-label="Link preview" className="relative w-full max-w-[460px] overflow-hidden rounded-[10px] bg-card shadow-rest">
        <button
          type="button"
          aria-label={share.image ? "Change the picture" : "Add a picture"}
          onClick={() => file.current?.click()}
          onDragOver={(e) => (e.preventDefault(), setOver(true))}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            void upload(e.dataTransfer.files?.[0]);
          }}
          className="group relative block aspect-[1200/630] w-full border-b border-line bg-paper"
        >
          {share.image ? (
            /* eslint-disable-next-line @next/next/no-img-element -- the team's own uploaded picture, any size */
            <img src={share.image} alt="" className="size-full object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center px-[24px] text-center text-[17px] font-semibold tracking-[-0.01em] text-ink">{shownTitle}</span>
          )}
          <span className={`absolute inset-0 flex items-center justify-center gap-[6px] text-[12.5px] font-medium text-card transition-[opacity,background-color] duration-[120ms] ${busy || over ? "bg-ink/45 opacity-100" : "bg-ink/0 opacity-0 group-hover:bg-ink/45 group-hover:opacity-100 group-focus-visible:bg-ink/45 group-focus-visible:opacity-100"}`}>
            <Ic n="plus" />
            {busy ? "Uploading" : share.image ? "Change picture" : "Add a picture"}
          </span>
        </button>
        <input ref={file} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="sr-only" tabIndex={-1} onChange={(e) => void upload(e.target.files?.[0])} />
        {share.image ? (
          <button type="button" aria-label="Remove the picture" title="Remove the picture" onClick={() => apply({ op: "set_share", share: { image: "" } }, "Removed the link's picture")} className={`${IB_SM} absolute top-[8px] right-[8px] bg-card shadow-sm`}>
            <Ic n="x" />
          </button>
        ) : null}
        <div className="flex flex-col gap-[2px] px-[12px] py-[10px]">
          <span className="truncate font-mono text-[10.5px] text-muted">{host}</span>
          <input aria-label="Title" value={title ?? share.title ?? ""} placeholder={form.title || row.name} maxLength={90} onChange={(e) => setTitle(e.target.value)} onBlur={(e) => (keep("title", e.target.value, "Changed the link's title"), setTitle(null))} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} className="-mx-[4px] rounded-[4px] bg-transparent px-[4px] py-[1px] text-[13.5px] font-semibold text-ink outline-none placeholder:text-ink hover:bg-hover focus:bg-paper" />
          <textarea aria-label="Line" rows={2} value={line ?? share.description ?? ""} placeholder="Add a line" maxLength={200} onChange={(e) => setLine(e.target.value)} onBlur={(e) => (keep("description", e.target.value, "Changed the link's line"), setLine(null))} className="-mx-[4px] resize-none rounded-[4px] bg-transparent px-[4px] py-[1px] text-[12.5px] leading-[1.45] text-body outline-none placeholder:text-faint hover:bg-hover focus:bg-paper" />
        </div>
      </div>
      <ErrorNote message={err} />
    </>
  );
}

/** The form's own code, as Form Studio holds it: all of it in one block, or its HTML, its own CSS or the brand's stylesheet. */
function HtmlPane({ form }: Props) {
  const [file, setFile] = useState<"both" | "html" | "css" | "brand">("both");
  const pg = form.page;
  if (!pg) return null;
  const code = file === "both" ? pageHtmlCss(pg) : file === "html" ? pg.html : file === "css" ? pg.css : pg.brand;
  const label = { both: "HTML + CSS", html: "HTML", css: "CSS", brand: "Brand CSS" }[file];
  return (
    <>
      <H3>Embed HTML</H3>
      <Seg
        label="Code"
        value={file}
        onChange={setFile}
        options={[
          { value: "both", label: "HTML + CSS" },
          { value: "html", label: "HTML" },
          { value: "css", label: "CSS" },
          { value: "brand", label: "Brand CSS" },
        ]}
      />
      <CodeBox code={code || ""} label={label} tall />
    </>
  );
}

/** Two ways in an email, as pictures: the link, or the form's first question with each answer a button. */
const MAILS: { v: "send" | "inside"; l: string; draw: React.ReactNode }[] = [
  {
    v: "send",
    l: "Send the link",
    draw: (
      <>
        <i className="absolute top-[22%] left-[14%] h-[6px] w-[46%] rounded-[3px] bg-line-strong" />
        <i className="absolute top-[40%] left-[14%] h-[6px] w-[62%] rounded-[3px] bg-line" />
        <i className="absolute top-[62%] left-[14%] h-[14%] w-[34%] rounded-full bg-ink" />
      </>
    ),
  },
  {
    v: "inside",
    l: "The form in an email",
    draw: (
      <>
        <i className="absolute top-[22%] left-[14%] h-[6px] w-[50%] rounded-[3px] bg-line-strong" />
        {[14, 36, 58].map((x) => (
          <i key={x} className="absolute top-[50%] h-[22%] w-[18%] rounded-[4px] bg-ink" style={{ left: `${x}%` }} />
        ))}
      </>
    ),
  },
];

function EmailPane(props: Props) {
  const { form, row, kit } = props;
  const note = useNote();
  const [pick, setPick] = useState<"send" | "inside">("send");
  const q = firstQuestion(form);
  const html = q ? emailQuestionHtml(q, { link: viaLink(`${origin()}/f/${row.id}`, "email"), color: kit?.tokens.buttonBg || kit?.tokens.accent, textColor: kit?.tokens.buttonText }) : "";
  return (
    <>
      <H3>Email</H3>
      <Tiles value={pick} onChange={setPick} items={MAILS} cols="grid-cols-2" />
      {pick === "send" ? (
        <SendEmail {...props} />
      ) : q ? (
        <>
          <div className={`${CARD} bg-paper p-[16px]`}>
            <div className="rounded-[6px] border border-line bg-card p-[16px]" dangerouslySetInnerHTML={{ __html: html }} />
          </div>
          <div className="flex flex-wrap gap-[8px]">
            <button
              type="button"
              className={BTN}
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
            <button type="button" className={GHOST_SM.replace("h-[26px]", "h-[32px]")} onClick={() => void copyText(html).then((ok) => note.show(ok ? "Copied the HTML" : "Couldn't copy"))}>
              <Ic n="code" />
              Copy HTML
            </button>
          </div>
        </>
      ) : (
        <Box tone="warn" title="Start the form with a pick list or a rating" />
      )}
      {note.node}
    </>
  );
}

function QrPane({ row }: Props) {
  // Always the id link, so a printed code keeps working when the ending changes; tagged QR code.
  return (
    <>
      <H3>QR code</H3>
      <div className={`${CARD} flex justify-center bg-paper py-[28px]`}>
        <QrCode url={viaLink(`${origin()}/f/${row.id}`, "qr")} name={row.name} center />
      </div>
    </>
  );
}

/** Picture tiles: a small page with the thing drawn where it shows. */
function Tiles<T extends string>({ value, onChange, items, cols }: { value: T; onChange: (v: T) => void; items: { v: T; l: string; draw: React.ReactNode }[]; cols: string }) {
  return (
    <div role="radiogroup" className={`grid gap-[10px] ${cols}`}>
      {items.map((m) => (
        <button key={m.v} type="button" role="radio" aria-checked={value === m.v} onClick={() => onChange(m.v)} className={`flex flex-col gap-[8px] rounded-[10px] border p-[8px] text-left transition-colors duration-[120ms] ${value === m.v ? "border-ink ring-1 ring-ink" : "border-line hover:border-line-strong"}`}>
          <span aria-hidden="true" className="relative h-[56px] overflow-hidden rounded-[6px] border border-line bg-paper">
            <span className="absolute inset-0 opacity-85">{m.draw}</span>
          </span>
          <b className="truncate text-[12px] font-medium text-ink">{m.l}</b>
        </button>
      ))}
    </div>
  );
}

/** The six ways on a site, each drawn as a small page with the form where it shows. */
const page = (
  <>
    <i className="absolute top-[12%] right-[10%] left-[10%] h-[5px] rounded-[3px] bg-line-strong" />
    <i className="absolute top-[calc(12%+10px)] right-[10%] left-[10%] h-[5px] rounded-[3px] bg-line" />
  </>
);
const MODES: { v: FormMode; l: string; draw: React.ReactNode }[] = [
  { v: "inline", l: "In the page", draw: <>{page}<i className="absolute top-[40%] right-[18%] bottom-[10%] left-[18%] rounded-[3px] bg-ink" /></> },
  { v: "full", l: "Full page", draw: <i className="absolute inset-[8%] rounded-[3px] bg-ink" /> },
  { v: "popup", l: "Popup", draw: <>{page}<i className="absolute inset-0 bg-ink/15" /><i className="absolute top-[18%] right-[26%] bottom-[18%] left-[26%] rounded-[3px] bg-ink" /></> },
  { v: "slider", l: "Slider", draw: <>{page}<i className="absolute inset-0 bg-ink/15" /><i className="absolute top-0 right-0 bottom-0 w-[38%] bg-ink" /></> },
  { v: "popover", l: "Popover", draw: <>{page}<i className="absolute right-[8%] bottom-[34%] h-[42%] w-[34%] rounded-[3px] bg-ink" /><i className="absolute right-[8%] bottom-[8%] size-[16%] rounded-full bg-ink" /></> },
  { v: "sidetab", l: "Side tab", draw: <>{page}<i className="absolute top-[30%] right-0 h-[40%] w-[7%] rounded-l-[2px] bg-ink" /></> },
];

function EmbedPane({ form, row }: Props) {
  const [o, setO] = useState<FormEmbed>({ mode: "inline", opens: "click", size: "m", side: "right", text: form.submit.label, icon: "chat", note: "", once: true, phoneFull: true });
  const set = (p: Partial<FormEmbed>) => setO((x) => ({ ...x, ...p }));
  const [plat, setPlat] = useState<Plat>("webflow");
  const code = formEmbedCode(origin(), row.id, o);
  // The preview: the same code with the form in demo (it sends nothing), a popup or slider open to be seen.
  const shownCode = formEmbedCode(origin(), row.id, { ...o, opens: "click", once: false }).replace("<claritia-form ", "<claritia-form demo ");
  const opener = o.mode === "popup" || o.mode === "slider" ? `var f=document.querySelector("claritia-form");f&&f.open&&f.open();` : "";
  const opensOn = o.mode === "popup" || o.mode === "slider";
  const textBox = (label: string, value: string, onChange: (v: string) => void, placeholder?: string) => (
    <input value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} placeholder={placeholder} maxLength={60} className="h-[30px] w-[200px] rounded-md bg-card shadow-input px-[10px] text-[12.5px] text-ink outline-none" />
  );
  return (
    <>
      <H3>Website</H3>
      <Tiles value={o.mode} onChange={(mode) => set({ mode })} items={MODES} cols="grid-cols-6 max-[1100px]:grid-cols-3" />
      {row.version ? <SitePreview key={`${o.mode}:${o.size}:${o.side}`} code={shownCode} after={opener} label="How it looks on a site" height={o.mode === "full" ? 460 : 400} /> : null}
      {o.mode === "inline" ? (
        <div className={CARD}>
          {(
            [
              ["Width", "width", "Fill the space", 640],
              ["Height", "height", "Fit the form", 600],
            ] as const
          ).map(([title, k, auto, start]) => (
            <div key={k} className={CROW}>
              <RowText title={title} />
              <div className="flex flex-wrap items-center gap-[8px]">
                <Seg label={title} value={o[k] ? "fixed" : "auto"} onChange={(v: "auto" | "fixed") => set({ [k]: v === "fixed" ? start : null })} options={[{ value: "auto", label: auto }, { value: "fixed", label: "Fixed" }]} />
                {o[k] ? (
                  <span className="inline-flex items-center gap-[6px] text-[12.5px] text-muted">
                    <input type="number" inputMode="numeric" min={k === "width" ? 280 : 200} max={k === "width" ? 2000 : 4000} value={o[k] ?? ""} onChange={(e) => set({ [k]: Number(e.target.value) || start })} aria-label={`${title} in pixels`} className="h-[30px] w-[84px] rounded-md bg-card px-[10px] text-[12.5px] text-ink shadow-input outline-none" />
                    px
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
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
      <CodeBox code={code} embed bar={<BuilderPick value={plat} onChange={setPlat} />} />
      <EmbedSteps plat={plat} over={overPage(o.mode)} />
    </>
  );
}
