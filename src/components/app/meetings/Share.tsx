"use client";

// Sharing a booking link (docs/meetings-scheduler.md 1.9): one menu with Copy link, a QR code to show or download, and
// a line for an email signature. The link is fetched only when it's needed (a single-use link is made on the server).
// The QR code is drawn here, in the browser, so the link never goes to another service.

import { useEffect, useState } from "react";
import { Download, Link as LinkIcon } from "../../Icons";
import { copyText } from "../CopyButton";
import { Popover } from "../FilterBar";
import { Button, ErrorNote, errorText, IconButton } from "../ui";
import { Modal } from "./parts";

/** The signature line: "Book time with Dana" as a plain link, in HTML and as text. */
export function signatureHtml(name: string, url: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return `<a href="${esc(url)}" style="color:#0a0a0a;font-weight:600;text-decoration:underline">${esc(name)}</a>`;
}

export function ShareMenu({ get, name, onError }: { get: () => Promise<string>; name: string; onError?: (m: string) => void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState<null | { kind: "qr" | "sig"; url: string }>(null);
  const run = async (kind: "copy" | "qr" | "sig") => {
    setAnchor(null);
    try {
      const url = await get();
      if (!url) return;
      if (kind === "copy") {
        if (await copyText(url)) {
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        }
      } else setOpen({ kind, url });
    } catch (e) {
      onError?.(errorText(e));
    }
  };
  return (
    <>
      <IconButton label={copied ? "Copied" : "Share"} aria-haspopup="menu" aria-expanded={!!anchor} onClick={(e) => (e.stopPropagation(), setAnchor(anchor ? null : e.currentTarget))}>
        <LinkIcon size={14} />
      </IconButton>
      {anchor ? (
        <Popover anchor={anchor} onClose={() => setAnchor(null)} width={200}>
          <div role="menu" className="flex flex-col p-1">
            {(
              [
                ["copy", "Copy link"],
                ["qr", "QR code"],
                ["sig", "Email signature"],
              ] as const
            ).map(([k, label]) => (
              <button key={k} type="button" role="menuitem" onClick={() => void run(k)} className="flex h-8 items-center rounded-md px-2.5 text-left text-[13px] text-ink hover:bg-hover">
                {label}
              </button>
            ))}
          </div>
        </Popover>
      ) : null}
      {open?.kind === "qr" ? <QrDialog url={open.url} name={name} onClose={() => setOpen(null)} /> : null}
      {open?.kind === "sig" ? <SignatureDialog url={open.url} name={name} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

/** A link's QR code, made in the browser: the SVG to show and the PNG and SVG files to save. */
function useQr(url: string, name: string) {
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    import("qrcode")
      .then((q) => q.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0a0a0a", light: "#ffffff" } }))
      .then((s) => live && setSvg(s))
      .catch((e) => live && setError(errorText(e)));
    return () => {
      live = false;
    };
  }, [url]);
  const file = `${name.replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "link"}-qr`;
  const png = async () => {
    const q = await import("qrcode");
    const a = document.createElement("a");
    a.href = await q.toDataURL(url, { width: 1024, margin: 2, errorCorrectionLevel: "M" });
    a.download = `${file}.png`;
    a.click();
  };
  const saveSvg = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    a.download = `${file}.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  return { svg, error, setError, png, saveSvg };
}

function QrImage({ svg, url }: { svg: string; url: string }) {
  // The SVG is made here from the link, never from outside text.
  return <div aria-label={`QR code for ${url}`} role="img" className="size-56 rounded-lg border border-line bg-white p-2 [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: svg }} />;
}

/** A QR code in the page with its downloads (a form's Share › QR code). */
export function QrCode({ url, name }: { url: string; name: string }) {
  const q = useQr(url, name);
  return (
    <div className="flex flex-col items-start gap-3">
      <ErrorNote message={q.error} />
      <QrImage svg={q.svg} url={url} />
      <code className="max-w-full truncate font-mono text-[11.5px] text-muted">{url.replace(/^https?:\/\//, "")}</code>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" disabled={!q.svg} onClick={() => void q.png().catch((e) => q.setError(errorText(e)))}>
          <Download size={14} />
          PNG
        </Button>
        <Button variant="ghost" size="sm" disabled={!q.svg} onClick={q.saveSvg}>
          <Download size={14} />
          SVG
        </Button>
      </div>
    </div>
  );
}

function QrDialog({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  const q = useQr(url, name);
  return (
    <Modal
      title="QR code"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" disabled={!q.svg} onClick={() => void q.png().catch((e) => q.setError(errorText(e)))}>
            <Download size={14} />
            PNG
          </Button>
          <Button disabled={!q.svg} onClick={q.saveSvg}>
            <Download size={14} />
            SVG
          </Button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-3">
        <ErrorNote message={q.error} />
        <QrImage svg={q.svg} url={url} />
        <code className="max-w-full truncate font-mono text-[11.5px] text-muted">{url.replace(/^https?:\/\//, "")}</code>
      </div>
    </Modal>
  );
}

function SignatureDialog({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  const [text, setText] = useState(name);
  const [done, setDone] = useState(false);
  const html = signatureHtml(text.trim() || name, url);
  const copy = async () => {
    // Rich text for email apps, with the plain link for the rest.
    try {
      await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([`${text.trim() || name}: ${url}`], { type: "text/plain" }) })]);
    } catch {
      await copyText(`${text.trim() || name}: ${url}`);
    }
    setDone(true);
    setTimeout(() => setDone(false), 1400);
  };
  return (
    <Modal
      title="Email signature"
      onClose={onClose}
      footer={
        <Button onClick={() => void copy()}>{done ? "Copied" : "Copy"}</Button>
      }
    >
      <div className="flex flex-col gap-3">
        <input value={text} maxLength={80} onChange={(e) => setText(e.target.value)} aria-label="Link words" className="h-9 rounded-sm border border-line-strong bg-card px-3 text-[13.5px] text-ink outline-none focus:border-ink focus:ring-1 focus:ring-ink" />
        <div className="rounded-lg border border-line bg-paper px-4 py-3 text-[13.5px]" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </Modal>
  );
}
