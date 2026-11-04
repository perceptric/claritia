"use client";

// Share a meeting type (docs/sharing-plan.md): its link, its calendar on a website (in the page, a floating button,
// or the site's own link or button opening it), and for an email its next free times or a single-use link. The code
// comes from src/lib/share/embed.ts; the <claritia-book> element is src/lib/meetings/bookElement.ts.

import { useState } from "react";
import { bookingBase } from "@/lib/meetings/handles";
import { meetingEmbedCode, type MeetingEmbed, type MeetingMode, type Plat } from "@/lib/share/embed";
import { Copy } from "../../Icons";
import { Button, ErrorNote, errorText, Segmented, Toggle, type ViewProps } from "../ui";
import { copyText, meetingsApi, Modal, ownZone } from "../meetings/parts";
import { useLinkBase } from "../views/LinkDomainSettings";
import { QrCode, signatureHtml } from "../meetings/Share";
import { BuilderPick, CodeBox, EmbedSteps, LinkRow, SitePreview } from "../SharePieces";

export type Pane = "link" | "site" | "email";

const MODES: { v: MeetingMode; l: string; draw: React.ReactNode }[] = [
  { v: "inline", l: "In the page", draw: <i className="absolute top-[34%] right-[14%] bottom-[10%] left-[14%] rounded-[3px] bg-ink" /> },
  { v: "button", l: "Floating button", draw: <i className="absolute right-[8%] bottom-[10%] h-[18%] w-[34%] rounded-full bg-ink" /> },
  { v: "link", l: "Your own button", draw: <><i className="absolute inset-0 bg-ink/15" /><i className="absolute top-[14%] right-[18%] bottom-[14%] left-[18%] rounded-[3px] bg-ink" /></> },
];

export function ShareMeeting({ session, ws, type, wsSlug, onClose, onSingleUse, onEditPage, start = "link" }: Pick<ViewProps, "session" | "ws"> & { type: { id: string; name: string; slug: string; active: boolean }; wsSlug: string; onClose: () => void; onSingleUse: () => void; onEditPage?: () => void; start?: Pane }) {
  const [pane, setPane] = useState<Pane>(start);
  const [o, setO] = useState<MeetingEmbed>({ mode: "inline", text: "Book a meeting", phoneFull: true });
  const [plat, setPlat] = useState<Plat>("webflow");
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  // On the workspace's own domain or subdomain (Settings › Link domain): /book/<type> there.
  const base = useLinkBase(session, ws.id);
  const url = base ? `${base}/book/${type.slug}` : `${bookingBase(origin)}/book/${wsSlug}/${type.slug}`;
  const code = meetingEmbedCode(origin, `${wsSlug}/${type.slug}`, o);
  const copy = async (what: string, text: string) => {
    if (await copyText(text)) {
      setCopied(what);
      setTimeout(() => setCopied((c) => (c === what ? "" : c)), 1600);
    }
  };
  // Rich text for email apps, the plain link for the rest.
  const signature = async () => {
    const text = `Book a time: ${type.name}`;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([signatureHtml(text, url)], { type: "text/html" }), "text/plain": new Blob([`${text}: ${url}`], { type: "text/plain" }) })]);
      setCopied("sig");
      setTimeout(() => setCopied((c) => (c === "sig" ? "" : c)), 1600);
    } catch {
      await copy("sig", `${text}: ${url}`);
    }
  };
  const times = async () => {
    setError("");
    try {
      const r = await meetingsApi<{ text: string }>(session, ws.id, "times", { typeId: type.id, tz: ownZone() });
      if (!r.text) throw new Error(`${type.name} has no free times in its window.`);
      await copy("times", r.text);
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <Modal title={`Share ${type.name}`} onClose={onClose} wide>
      <div className="flex flex-col gap-4">
        <Segmented<Pane>
          value={pane}
          onChange={setPane}
          label="Share"
          options={[
            { value: "link", label: "Link" },
            { value: "site", label: "On your website" },
            { value: "email", label: "In an email" },
          ]}
        />
        <ErrorNote message={error || (type.active ? "" : "This meeting type is off. Turn it on before sharing it.")} />
        {pane === "link" ? (
          <div className="flex flex-col gap-4">
            <LinkRow url={url} disabled={!type.active} />
            {onEditPage ? (
              <button type="button" onClick={onEditPage} className="-mt-1 self-start text-[12.5px] font-medium text-ink underline decoration-line-strong underline-offset-[3px] hover:decoration-ink">
                Edit booking page
              </button>
            ) : null}
            <div className="flex justify-center rounded-[10px] shadow-rest bg-paper py-[20px]">
              <QrCode url={url} name={type.name} center />
            </div>
          </div>
        ) : null}
        {pane === "site" ? (
          <>
            <div className="grid grid-cols-3 gap-2.5">
              {MODES.map((m) => (
                <button key={m.v} type="button" aria-pressed={o.mode === m.v} onClick={() => setO({ ...o, mode: m.v })} className={`flex flex-col gap-2 rounded-[10px] border p-2.5 text-left transition-colors duration-[120ms] ${o.mode === m.v ? "border-ink ring-1 ring-ink" : "border-line hover:border-line-strong"}`}>
                  <span aria-hidden="true" className="relative h-16 overflow-hidden rounded-[6px] border border-line bg-paper">
                    <i className="absolute top-[12%] right-[10%] left-[10%] h-[6px] rounded-[3px] bg-line-strong" />
                    <span className="absolute inset-0 opacity-85">{m.draw}</span>
                  </span>
                  <b className="text-[12.5px] font-medium text-ink">{m.l}</b>
                </button>
              ))}
            </div>
            {o.mode !== "inline" ? (
              <div className="flex flex-col divide-y divide-line rounded-[10px] shadow-rest">
                <label className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px] text-ink">
                  Button text
                  <input value={o.text ?? ""} maxLength={60} onChange={(e) => setO({ ...o, text: e.target.value })} aria-label="Button text" className="h-[30px] w-[200px] rounded-[6px] border border-line-strong bg-card px-2.5 text-[12.5px] text-ink outline-none focus:shadow-focus" />
                </label>
                <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px] text-ink">
                  Full screen on phones
                  <Toggle label="Full screen on phones" on={o.phoneFull !== false} onChange={(phoneFull) => setO({ ...o, phoneFull })} />
                </div>
              </div>
            ) : null}
            <CodeBox code={code} bar={<BuilderPick value={plat} onChange={setPlat} />} />
            <EmbedSteps plat={plat} over={o.mode === "button"} what="calendar" />
            <SitePreview key={o.mode} code={code} after={o.mode === "link" ? `var a=document.querySelector("[data-claritia-book]");a&&a.click();` : ""} still label="How it looks on a site" height={340} />
          </>
        ) : null}
        {pane === "email" ? (
          <div className="flex flex-col divide-y divide-line rounded-[10px] shadow-rest">
            <div className="flex items-center justify-between gap-3 px-4 py-3 text-[13px] text-ink">
              Your next free times, each with its own link
              <Button variant="ghost" size="sm" onClick={() => void times()}>
                <Copy size={13} />
                {copied === "times" ? "Copied" : "Copy times"}
              </Button>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3 text-[13px] text-ink">
              Your email signature
              <Button variant="ghost" size="sm" onClick={() => void signature()}>
                <Copy size={13} />
                {copied === "sig" ? "Copied" : "Copy signature"}
              </Button>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3 text-[13px] text-ink">
              A link that books once
              <Button variant="ghost" size="sm" onClick={onSingleUse}>
                New single-use link
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
