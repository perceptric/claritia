"use client";

// Share a meeting type (docs/sharing-plan.md): its link, its calendar on a website (in the page, a floating button,
// or the site's own link or button opening it), and for an email its next free times or a single-use link. The code
// comes from src/lib/share/embed.ts; the <claritia-book> element is src/lib/meetings/bookElement.ts.

import { useState } from "react";
import { bookingBase } from "@/lib/meetings/handles";
import { meetingEmbedCode, PLATS, type MeetingEmbed, type MeetingMode, type Plat } from "@/lib/share/embed";
import { Copy, ExternalLink } from "../../Icons";
import { BrandLogo } from "../BrandLogo";
import { Button, ErrorNote, errorText, Segmented, Toggle, type ViewProps } from "../ui";
import { copyText, meetingsApi, Modal, ownZone } from "../meetings/parts";

type Pane = "link" | "site" | "email";

const MODES: { v: MeetingMode; l: string; draw: React.ReactNode }[] = [
  { v: "inline", l: "In the page", draw: <i className="absolute top-[34%] right-[14%] bottom-[10%] left-[14%] rounded-[3px] bg-ink" /> },
  { v: "button", l: "Floating button", draw: <i className="absolute right-[8%] bottom-[10%] h-[18%] w-[34%] rounded-full bg-ink" /> },
  { v: "link", l: "Your own button", draw: <><i className="absolute inset-0 bg-ink/15" /><i className="absolute top-[14%] right-[18%] bottom-[14%] left-[18%] rounded-[3px] bg-ink" /></> },
];

export function ShareMeeting({ session, ws, type, wsSlug, onClose, onSingleUse }: Pick<ViewProps, "session" | "ws"> & { type: { id: string; name: string; slug: string; active: boolean }; wsSlug: string; onClose: () => void; onSingleUse: () => void }) {
  const [pane, setPane] = useState<Pane>("link");
  const [o, setO] = useState<MeetingEmbed>({ mode: "inline", text: "Book a meeting", phoneFull: true });
  const [plat, setPlat] = useState<Plat>("webflow");
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const url = `${bookingBase(origin)}/book/${wsSlug}/${type.slug}`;
  const code = meetingEmbedCode(origin, `${wsSlug}/${type.slug}`, o);
  const copy = async (what: string, text: string) => {
    if (await copyText(text)) {
      setCopied(what);
      setTimeout(() => setCopied((c) => (c === what ? "" : c)), 1600);
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
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-sm border border-line bg-paper px-2.5 py-1.5 font-mono text-[12.5px] text-ink">{url}</code>
            <Button variant="ghost" size="sm" onClick={() => void copy("link", url)}>
              <Copy size={13} />
              {copied === "link" ? "Copied" : "Copy"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => window.open(url, "_blank", "noopener")}>
              <ExternalLink size={13} />
              Open
            </Button>
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
              <div className="flex flex-col divide-y divide-line rounded-[10px] border border-line">
                <label className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px] text-ink">
                  Button text
                  <input value={o.text ?? ""} maxLength={60} onChange={(e) => setO({ ...o, text: e.target.value })} aria-label="Button text" className="h-[30px] w-[200px] rounded-[6px] border border-line-strong bg-card px-2.5 text-[12.5px] text-ink outline-none focus:border-ink" />
                </label>
                <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px] text-ink">
                  Full screen on phones
                  <Toggle label="Full screen on phones" on={o.phoneFull !== false} onChange={(phoneFull) => setO({ ...o, phoneFull })} />
                </div>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-1.5">
              {PLATS.map((p) => (
                <button key={p.v} type="button" aria-pressed={plat === p.v} onClick={() => setPlat(p.v)} className={`inline-flex h-8 items-center gap-[7px] rounded-full border pr-2.5 pl-[7px] text-[12.5px] transition-colors duration-[120ms] ${plat === p.v ? "border-ink font-medium text-ink" : "border-line text-body hover:border-line-strong"}`}>
                  {p.domain ? <BrandLogo domain={p.domain} name={p.l} size={18} /> : <span className="inline-flex size-[18px] items-center justify-center rounded-[5px] bg-paper-deep font-mono text-[9px] text-body">&lt;/&gt;</span>}
                  {p.l}
                </button>
              ))}
            </div>
            <div className="relative">
              <pre data-embed-code className="m-0 overflow-x-auto rounded-[10px] border border-line bg-paper px-4 py-3.5 pr-24 font-mono text-[12px] leading-[1.6] whitespace-pre text-body">{code}</pre>
              <Button variant="ghost" size="sm" className="absolute top-2.5 right-2.5" onClick={() => void copy("code", code)}>
                <Copy size={13} />
                {copied === "code" ? "Copied" : "Copy"}
              </Button>
            </div>
            <span className="text-[12.5px] text-muted">{PLATS.find((p) => p.v === plat)!.how}</span>
          </>
        ) : null}
        {pane === "email" ? (
          <div className="flex flex-col divide-y divide-line rounded-[10px] border border-line">
            <div className="flex items-center justify-between gap-3 px-4 py-3 text-[13px] text-ink">
              Your next free times, each with its own link
              <Button variant="ghost" size="sm" onClick={() => void times()}>
                <Copy size={13} />
                {copied === "times" ? "Copied" : "Copy times"}
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
