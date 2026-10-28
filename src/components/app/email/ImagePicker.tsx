"use client";

// An image field in the email builder (docs/design-system.md Part 6): the picture, an upload button and the
// workspace's images to pick from, or a link typed in. Uploads go through /api/assets, which checks each file.

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import { Trash, Upload } from "../../Icons";
import { askConfirm } from "../Dialogs";
import { errorText } from "../ui";
import { Popover, Row, TextIn } from "../forms/controls";

export type AssetCtx = { session: Session; sb: SupabaseClient; workspaceId: string };
type Asset = { id: string; url: string; name: string; width: number; height: number };

export function ImagePicker({ label, value, onChange, ctx, placeholder }: { label: string; value: string; onChange: (url: string, merge?: string) => void; ctx?: AssetCtx; placeholder?: string }) {
  const file = useRef<HTMLInputElement>(null);
  const lib = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [list, setList] = useState<Asset[]>([]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!open || !ctx) return;
    let live = true;
    void ctx.sb
      .from("design_assets")
      .select("id, url, name, width, height")
      .eq("workspace_id", ctx.workspaceId)
      .order("created_at", { ascending: false })
      .limit(60)
      .then(({ data }) => live && setList((data ?? []) as Asset[]));
    return () => {
      live = false;
    };
  }, [open, ctx, tick]);

  const upload = async (f: File) => {
    if (!ctx) return;
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.set("workspaceId", ctx.workspaceId);
      body.set("file", f);
      const res = await fetch("/api/assets", { method: "POST", headers: { Authorization: `Bearer ${ctx.session.access_token}` }, body });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Try again in a moment.");
      onChange(data.url);
      setTick((t) => t + 1);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (a: Asset) => {
    if (!ctx || !(await askConfirm(`Delete ${a.name || "this image"}?`, { body: "Emails already sent with it stop showing it.", ok: "Delete", danger: true }))) return;
    const res = await fetch(`/api/assets?id=${a.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${ctx.session.access_token}` } });
    if (!res.ok) setError("Try again in a moment.");
    setTick((t) => t + 1);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Row label={label}>
        <TextIn label={label} value={value} placeholder={placeholder ?? "https://"} mono onChange={(v) => onChange(v, "src")} />
      </Row>
      {ctx ? (
        <div className="flex items-center gap-1.5 pl-[84px]">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="size-8 shrink-0 rounded-sm border border-line object-cover" />
          ) : null}
          <input
            ref={file}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void upload(f);
            }}
          />
          <button type="button" disabled={busy} onClick={() => file.current?.click()} className="press inline-flex h-7 items-center gap-1 rounded-full border border-line-strong px-2.5 text-[12px] text-ink hover:border-ink disabled:opacity-50">
            <Upload size={11} />
            {busy ? "Uploading…" : "Upload"}
          </button>
          <button ref={lib} type="button" aria-haspopup="dialog" onClick={() => setOpen((o) => !o)} className="press inline-flex h-7 items-center rounded-full border border-line-strong px-2.5 text-[12px] text-ink hover:border-ink">
            Library
          </button>
          <Popover anchor={lib} open={open} onClose={() => setOpen(false)} label="Images" width={288}>
            {list.length ? (
              <div className="grid max-h-[300px] grid-cols-3 gap-1.5 overflow-y-auto p-1">
                {list.map((a) => (
                  <div key={a.id} className="group relative">
                    <button
                      type="button"
                      title={a.name || `${a.width} by ${a.height}`}
                      onClick={() => {
                        onChange(a.url);
                        setOpen(false);
                      }}
                      className="block aspect-square w-full overflow-hidden rounded-sm border border-line hover:border-ink"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a.url} alt={a.name} className="size-full object-cover" />
                    </button>
                    <button type="button" aria-label={`Delete ${a.name || "image"}`} title="Delete" onClick={() => void remove(a)} className="press absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-card text-muted opacity-0 shadow-float group-hover:opacity-100 hover:text-rose focus:opacity-100">
                      <Trash size={11} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-3 py-6 text-center text-[12.5px] text-muted">No images yet</p>
            )}
          </Popover>
        </div>
      ) : null}
      {error ? <p className="pl-[84px] text-[11.5px] text-rose">{error}</p> : null}
    </div>
  );
}
