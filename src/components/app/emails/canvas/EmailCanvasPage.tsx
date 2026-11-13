"use client";

// One group's emails on a canvas (docs/email-canvas-b1.md): side by side in the group's order, as they'd arrive, on a
// surface you can pan and zoom (canvas/Surface.tsx). Click picks an email (Shift adds), ← and → step, Enter or a
// double-click opens it in the Email Studio (Done comes back here). The toolbar above the pick holds Open, Test, Send
// and More (Rename, Duplicate, Code, Move to group, Take out of the group, Delete); a sent email offers Results and
// Duplicate; several picked, Move to group and Delete. Drag an email by its name or grip to reorder it; drag a side
// handle to resize it (600, 640 or 700 px). Add email makes a new draft, uses a template or brings one in from
// Campaigns. "Ungrouped" is every email in no group, newest first; it can't be renamed or reordered.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { boundsOf, dropSlot, firstView, nearView, rowLayout, snapWidth, toolbarSpot, toScreen, toWorld, type Box, type Camera, type Size } from "@/lib/canvas/view";
import { newBlock, newSection, readEmailDoc } from "@/lib/design/email/doc";
import { ChevronDown, Grip, Monitor, MoreHorizontal, Phone, Send } from "../../../Icons";
import { Surface, type SurfaceApi } from "../../canvas/Surface";
import { askConfirm, askText } from "../../Dialogs";
import { Popover } from "../../FilterBar";
import { Sketch } from "../../../sketches/Sketch";
import { CodeView } from "../../email/CodeView";
import { Badge, Button, ErrorNote, errorText, invalidate, Loading, must, Page, postJson, useQuery, type Tone, type ViewProps } from "../../ui";
import { Artboard } from "./Artboard";
import { CanvasSend } from "./CanvasSend";
import { docOf, previewHtml, sourceHtml, widthOf, type CanvasKit, type CanvasRow } from "./preview";

export const UNGROUPED = "ungrouped";
const PHONE = 390;
const TONE: Record<string, Tone> = { sent: "green", sending: "amber", scheduled: "sky", paused: "amber", draft: "gray" };
const LABEL: Record<string, string> = { sent: "Sent", sending: "Sending", scheduled: "Scheduled", paused: "Paused", draft: "Draft" };
type Menu = { anchor: HTMLElement; items: { label: string; run: () => void; danger?: boolean; hint?: string; group?: string }[] } | null;

export function EmailCanvasPage({ sb, session, ws, navigate, groupId, pick }: ViewProps & { groupId: string; pick?: string | null }) {
  const ungrouped = groupId === UNGROUPED;
  const group = useQuery(`email_group:${groupId}`, async () => (ungrouped ? { id: UNGROUPED, name: "Ungrouped" } : (must(await sb.from("email_groups").select("id, name").eq("id", groupId).eq("workspace_id", ws.id).maybeSingle()) as { id: string; name: string } | null)), { staleMs: 0 });
  const rows = useQuery(
    `email_canvas:${groupId}`,
    async () => {
      const q = sb.from("emails").select("id, name, subject, preheader, status, doc, html, group_id, group_position, updated_at").eq("workspace_id", ws.id).eq("kind", "broadcast").neq("status", "archived");
      const r = ungrouped ? await q.is("group_id", null).order("updated_at", { ascending: false }).limit(300) : await q.eq("group_id", groupId).order("group_position").order("created_at");
      return (must(r) ?? []) as CanvasRow[];
    },
    { staleMs: 0 },
  );
  // The state people see (Paused, Sent once everything went) comes from email_campaigns.
  const states = useQuery(`email_campaigns:${ws.id}`, async () => (must(await sb.rpc("email_campaigns", { p_ws: ws.id })) ?? []) as { id: string; status: string }[]);
  const kits = useQuery(`email_canvas_kits:${ws.id}`, async () => (must(await sb.from("brand_kits").select("id, tokens, logo_url, design").eq("workspace_id", ws.id).order("created_at")) ?? []) as CanvasKit[]);
  const groups = useQuery(`email_groups_list:${ws.id}`, async () => (must(await sb.from("email_groups").select("id, name").eq("workspace_id", ws.id).order("created_at")) ?? []) as { id: string; name: string }[]);

  const surface = useRef<SurfaceApi>(null);
  const [phone, setPhone] = useState(false);
  const [picked, setPicked] = useState<string[]>(() => (pick ? [pick] : []));
  const [hover, setHover] = useState<string | null>(null);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [drag, setDrag] = useState<{ id: string; x0: number; y0: number; on: boolean; dx: number; dy: number; slot: number; shift: Record<string, number>; lineX: number } | null>(null);
  const [resize, setResize] = useState<{ id: string; side: "l" | "r"; x0: number; w0: number } | null>(null);
  const [menu, setMenu] = useState<Menu>(null);
  const [sending, setSending] = useState<CanvasRow | null>(null);
  const [code, setCode] = useState<{ html: string; name: string } | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [tbw, setTbw] = useState(260);
  // Which emails load their frame: near the view, and kept until three screens away. Before the camera is placed,
  // the first few (and the one asked for) load so the first view can measure them.
  const [live, setLive] = useState<Set<string>>(() => new Set(pick ? [pick] : []));
  const toolbar = useRef<HTMLDivElement>(null);

  const status = useCallback((r: CanvasRow) => states.data?.find((s) => s.id === r.id)?.status ?? r.status, [states.data]);
  const list = useMemo(() => rows.data ?? [], [rows.data]);
  const htmls = useMemo(() => {
    const out: Record<string, string> = {};
    for (const r of list) out[r.id] = previewHtml(r, kits.data ?? []);
    return out;
  }, [list, kits.data]);
  const rects = useMemo(() => rowLayout(list.map((r) => ({ id: r.id, w: phone ? PHONE : (widths[r.id] ?? widthOf(r)), h: heights[r.id] ?? 900 }))), [list, phone, widths, heights]);
  const all = useMemo(() => boundsOf(rects), [rects]);
  const pickedBox = useMemo(() => boundsOf(rects.filter((r) => picked.includes(r.id))), [rects, picked]);
  const firstIds = useMemo(() => (pick && list.some((r) => r.id === pick) ? [pick] : list.slice(0, 4).map((r) => r.id)), [list, pick]);
  const measured = list.length === 0 || firstIds.every((id) => heights[id]);
  const onView = useCallback(
    (c: Camera, view: Size) => {
      const near1 = nearView(rects, c, view, 1);
      const far3 = nearView(rects, c, view, 3);
      setLive((cur) => {
        let changed = false;
        const next = new Set(cur);
        for (const id of near1) if (!next.has(id)) (next.add(id), (changed = true));
        for (const id of cur) if (!far3.has(id)) (next.delete(id), (changed = true));
        return changed ? next : cur;
      });
    },
    [rects],
  );
  const back = () => navigate("emails");
  const say = (t: string) => {
    setNotice(t);
    window.setTimeout(() => setNotice((n) => (n === t ? "" : n)), 2600);
  };
  const reload = () => {
    void rows.reload();
    invalidate(`email_campaigns:${ws.id}`);
    invalidate(`email_groups:${ws.id}`);
  };
  const run = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const place = (id: string, gid: string | null, pos: number | null) => sb.rpc("email_group_place", { p_ws: ws.id, p_email: id, p_group: gid, p_position: pos }).then(must);
  const focusId = (id: string) => {
    const r = rects.find((x) => x.id === id);
    if (r) surface.current?.focus({ x: r.x, y: r.y, r: r.x + r.w, b: r.y + r.h });
  };

  const onHeight = useCallback((id: string, h: number) => setHeights((m) => (m[id] === h ? m : { ...m, [id]: h })), []);
  const onHover = useCallback((id: string | null) => setHover(id), []);
  const open = useCallback((id: string) => navigate("emails", `campaigns/${id}`, `back=${groupId}`), [navigate, groupId]);
  const onDown = useCallback((id: string, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    setPicked((p) => (e.shiftKey ? (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]) : [id]));
  }, []);

  // Dragging an email by its name or grip: past 4 px it lifts, the others make room, and the drop saves the order.
  const startDrag = (id: string, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (ungrouped) return setPicked((p) => (e.shiftKey ? (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]) : [id]));
    setDrag({ id, x0: e.clientX, y0: e.clientY, on: false, dx: 0, dy: 0, slot: 0, shift: {}, lineX: 0 });
  };
  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const s = surface.current;
      if (!s) return;
      if (!drag.on && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 4) return;
      const c = s.camera();
      const p = s.point(e.clientX, e.clientY);
      const w = toWorld(c, p.x, p.y);
      const me = rects.find((r) => r.id === drag.id);
      if (!me) return;
      const d = dropSlot(rects, drag.id, w.x);
      if (!drag.on) setPicked([drag.id]);
      setDrag({ ...drag, on: true, dx: w.x - me.x - me.w / 2, dy: w.y - 24, ...d });
    };
    const up = () => {
      const d = drag;
      setDrag(null);
      if (!d.on) return setPicked([d.id]);
      const from = list.findIndex((r) => r.id === d.id);
      if (d.slot === from) return;
      void run(async () => {
        await place(d.id, groupId, d.slot);
        reload();
        say("Order saved");
      });
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", key);
    };
  });

  // Resizing from a side handle: the width snaps to 600, 640 or 700 and saves on release.
  useEffect(() => {
    if (!resize) return;
    const move = (e: PointerEvent) => {
      const z = surface.current?.camera().z ?? 1;
      const want = resize.w0 + ((e.clientX - resize.x0) / z) * (resize.side === "l" ? -1 : 1);
      setWidths((m) => (m[resize.id] === snapWidth(want) ? m : { ...m, [resize.id]: snapWidth(want) }));
    };
    const up = () => {
      const r = list.find((x) => x.id === resize.id);
      const w = widths[resize.id];
      setResize(null);
      if (!r || !w || w === widthOf(r)) return;
      const doc = docOf(r);
      void run(async () => {
        must(await sb.rpc("email_draft_save", { p_ws: ws.id, p_id: r.id, p_name: r.name, p_subject: r.subject, p_preheader: r.preheader ?? "", p_doc: { ...doc, settings: { ...doc.settings, width: w } } }));
        await rows.reload();
        setWidths((m) => {
          const n = { ...m };
          delete n[r.id];
          return n;
        });
        say(`${w} px wide`);
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  });

  // Actions ----------------------------------------------------------------------------------------------------------
  const rowOf = (id: string) => list.find((r) => r.id === id);
  const duplicate = (id: string) =>
    run(async () => {
      const r = rowOf(id);
      if (!r) return;
      if (!r.doc) throw new Error("This email has no blocks to copy.");
      const nid = must(await sb.rpc("email_draft_save", { p_ws: ws.id, p_id: null, p_name: `${r.name} copy`.slice(0, 200), p_subject: r.subject, p_preheader: r.preheader ?? "", p_doc: r.doc })) as string;
      if (!ungrouped) await place(nid, groupId, list.findIndex((x) => x.id === id) + 1);
      await rows.reload();
      invalidate(`email_campaigns:${ws.id}`);
      setPicked([nid]);
      say(`Made ${r.name} copy`);
    });
  const rename = (id: string) =>
    run(async () => {
      const r = rowOf(id);
      if (!r) return;
      const name = (await askText("Rename the email", { initial: r.name, ok: "Save" }))?.trim();
      if (!name || name === r.name) return;
      must(await sb.rpc("email_draft_save", { p_ws: ws.id, p_id: r.id, p_name: name, p_subject: r.subject, p_preheader: r.preheader ?? "", p_doc: r.doc }));
      reload();
    });
  const remove = (ids: string[]) =>
    run(async () => {
      const drafts = ids.map(rowOf).filter((r): r is CanvasRow => !!r && status(r) === "draft");
      if (!drafts.length) return say("Sent emails stay; only drafts can be deleted");
      const title = drafts.length === 1 ? `Delete ${drafts[0]!.name}?` : `Delete ${drafts.length} drafts?`;
      if (!(await askConfirm(title, { body: drafts.length < ids.length ? "Sent emails stay." : undefined, ok: "Delete", danger: true }))) return;
      for (const r of drafts) must(await sb.rpc("email_draft_delete", { p_ws: ws.id, p_id: r.id }));
      setPicked([]);
      reload();
    });
  const moveTo = (ids: string[], gid: string | null) =>
    run(async () => {
      for (const id of ids) await place(id, gid, null);
      setPicked([]);
      reload();
      say(gid ? `Moved to ${groups.data?.find((g) => g.id === gid)?.name ?? "the group"}` : "Moved to Ungrouped");
    });
  const newGroupFor = (ids: string[]) =>
    run(async () => {
      const name = (await askText("Name the group", { placeholder: "Spring series", ok: "Create" }))?.trim();
      if (!name) return;
      const gid = must(await sb.rpc("email_group_save", { p_ws: ws.id, p_id: null, p_name: name })) as string;
      void groups.reload();
      await moveTo(ids, gid);
    });
  const moveMenu = (anchor: HTMLElement, ids: string[]) =>
    setMenu({
      anchor,
      items: [...(groups.data ?? []).filter((g) => g.id !== groupId).map((g) => ({ label: g.name, run: () => void moveTo(ids, g.id) })), ...(ungrouped ? [] : [{ label: "Ungrouped", run: () => void moveTo(ids, null) }]), { label: "New group", run: () => void newGroupFor(ids) }],
    });
  const test = (id: string) =>
    run(async () => {
      const r = rowOf(id);
      if (!r) return;
      await postJson(session, "/api/email/test", { workspaceId: ws.id, subject: r.subject, doc: r.doc });
      say("Test sent to you");
    });
  const addNew = () =>
    run(async () => {
      const nid = must(await sb.rpc("email_draft_save", { p_ws: ws.id, p_id: null, p_name: "Untitled email", p_subject: "", p_preheader: "", p_doc: { ...readEmailDoc({}), sections: [newSection([newBlock("footer")])] } })) as string;
      if (!ungrouped) await place(nid, groupId, null);
      await rows.reload();
      invalidate(`email_campaigns:${ws.id}`);
      setPicked([nid]);
    });
  const addMenu = (anchor: HTMLElement) => {
    const loose = ungrouped ? [] : null;
    void (async () => {
      const others = loose ?? ((must(await sb.from("emails").select("id, name, status").eq("workspace_id", ws.id).eq("kind", "broadcast").is("group_id", null).neq("status", "archived").order("updated_at", { ascending: false }).limit(30)) ?? []) as { id: string; name: string; status: string }[]);
      setMenu({
        anchor,
        items: [
          { label: "New email", run: () => void addNew() },
          { label: "From a template", run: () => navigate("emails", "templates", `group=${groupId}`) },
          ...others.map((o, i) => ({ label: o.name, hint: LABEL[o.status] ?? o.status, group: i === 0 ? "From Campaigns" : undefined, run: () => void run(async () => (await place(o.id, groupId, null), await rows.reload(), setPicked([o.id]))) })),
        ],
      });
    })().catch((e) => setError(errorText(e)));
  };
  const moreMenu = (anchor: HTMLElement, id: string) => {
    const r = rowOf(id);
    if (!r) return;
    const draft = status(r) === "draft";
    setMenu({
      anchor,
      items: [
        ...(draft ? [{ label: "Rename", run: () => void rename(id) }] : []),
        { label: "Duplicate", hint: "⌘D", run: () => void duplicate(id) },
        { label: "Code", run: () => setCode({ html: sourceHtml(r, kits.data ?? []), name: r.name }) },
        { label: "Move to group", run: () => moveMenu(anchor, [id]) },
        ...(ungrouped ? [] : [{ label: "Take out of the group", run: () => void moveTo([id], null) }]),
        ...(draft ? [{ label: "Delete", hint: "⌫", danger: true, run: () => void remove([id]) }] : []),
      ],
    });
  };

  // Keys the page handles before the surface's own.
  const onKey = (e: KeyboardEvent): boolean => {
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === "Escape") {
      if (drag) setDrag(null);
      else setPicked([]);
      return true;
    }
    if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && rects.length) {
      e.preventDefault();
      const dir = e.key === "ArrowRight" ? 1 : -1;
      const at = rects.findIndex((r) => r.id === picked[picked.length - 1]);
      if (e.altKey && e.shiftKey && !ungrouped && at >= 0) {
        const to = Math.max(0, Math.min(rects.length - 1, at + dir));
        if (to !== at) void run(async () => (await place(rects[at]!.id, groupId, to), reload()));
        return true;
      }
      const next = rects[Math.max(0, Math.min(rects.length - 1, at < 0 ? 0 : at + dir))]!;
      setPicked([next.id]);
      const s = surface.current;
      if (s) {
        const c = s.camera();
        const a = toScreen(c, next.x, next.y);
        const host = document.querySelector("[data-email-canvas]") as HTMLElement | null;
        const vw = host?.clientWidth ?? 1000;
        if (a.x < 0 || a.x + next.w * c.z > vw) s.glide({ ...c, x: vw / 2 - (next.x + next.w / 2) * c.z });
      }
      return true;
    }
    if (e.key === "Enter" && picked.length === 1) return (open(picked[0]!), true);
    if (mod && e.key.toLowerCase() === "d" && picked.length === 1) return (e.preventDefault(), void duplicate(picked[0]!), true);
    if ((e.key === "Delete" || e.key === "Backspace") && picked.length) return (e.preventDefault(), void remove(picked), true);
    return false;
  };

  // The toolbar's width, so it stays inside the view.
  useEffect(() => {
    const w = toolbar.current?.offsetWidth;
    if (w && Math.abs(w - tbw) > 2) setTbw(w);
  });

  if (group.error || rows.error) return <ErrorNote message={group.error || rows.error} />;
  if (!group.loaded || !rows.data || !kits.data) return <Loading />;
  if (!group.data)
    return (
      <Page title="Campaigns" back={{ label: "Campaigns", onClick: back }}>
        <ErrorNote message="This group is gone." />
      </Page>
    );
  const g = group.data;

  const screen = (c: Camera, view: Size) => {
    const z = c.z;
    const near = nearView(rects, c, view);
    const one = picked.length === 1 ? rowOf(picked[0]!) : undefined;
    return (
      <>
        {rects.map((r) => {
          if (drag?.on && r.id === drag.id) return null;
          const row = rowOf(r.id)!;
          const shift = drag?.on ? (drag.shift[r.id] ?? 0) : 0;
          const a = toScreen(c, r.x + shift, r.y);
          const on = picked.includes(r.id);
          const st = status(row);
          return (
            <div key={r.id} className="contents">
              {z >= 0.2 && near.has(r.id) ? (
                <div
                  data-canvas-item=""
                  onPointerDown={(e) => startDrag(r.id, e)}
                  onDoubleClick={() => open(r.id)}
                  className={`pointer-events-auto absolute flex items-end gap-1.5 pb-[7px] text-[12.5px] leading-snug font-medium ${ungrouped ? "cursor-pointer" : "cursor-grab"} ${on ? "text-ink" : "text-muted"}`}
                  style={{ left: a.x, top: a.y, width: r.w * z, transform: "translateY(-100%)" }}
                >
                  <span className="min-w-0 break-words">{row.name}</span>
                  <Badge tone={TONE[st] ?? "gray"}>{LABEL[st] ?? st}</Badge>
                </div>
              ) : null}
              {hover === r.id && !on && !drag?.on ? <div className="absolute shadow-[0_0_0_1px_var(--color-signal)]" style={{ left: a.x, top: a.y, width: r.w * z, height: r.h * z }} /> : null}
              {on && !drag?.on ? <div className="absolute shadow-[0_0_0_2px_var(--color-signal)]" style={{ left: a.x, top: a.y, width: r.w * z, height: r.h * z }} /> : null}
            </div>
          );
        })}
        {one && !drag?.on
          ? (() => {
              const r = rects.find((x) => x.id === one.id)!;
              const a = toScreen(c, r.x, r.y);
              const mid = Math.max(a.y + 12, Math.min(a.y + r.h * z - 12, Math.max(40, Math.min(view.h - 40, a.y + (r.h * z) / 2))));
              const canResize = status(one) === "draft" && !phone && !!one.doc;
              return (
                <>
                  {!ungrouped ? (
                    <button type="button" data-canvas-item="" aria-label={`Move ${one.name}`} title="Drag to move" onPointerDown={(e) => startDrag(one.id, e)} className="pointer-events-auto absolute flex h-8 w-[18px] cursor-grab items-center justify-center rounded-md bg-card text-muted shadow-chip hover:text-ink" style={{ left: a.x - 28, top: Math.max(a.y, 8) }}>
                      <Grip size={12} />
                    </button>
                  ) : null}
                  {canResize
                    ? (["l", "r"] as const).map((side) => (
                        <span
                          key={side}
                          data-canvas-item=""
                          role="separator"
                          aria-label={`Resize ${one.name}`}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            setResize({ id: one.id, side, x0: e.clientX, w0: r.w });
                          }}
                          className="pointer-events-auto absolute size-2.5 cursor-ew-resize rounded-[2px] bg-card shadow-[0_0_0_1.5px_var(--color-signal)] before:absolute before:-inset-2.5 before:content-['']"
                          style={{ left: (side === "l" ? a.x : a.x + r.w * z) - 5, top: mid - 5 }}
                        />
                      ))
                    : null}
                  {resize ? (
                    <span className="absolute rounded-sm bg-signal px-1.5 py-0.5 text-[11.5px] font-medium text-white tabular-nums" style={{ left: a.x + (r.w * z) / 2 - 26, top: a.y + 8 }}>
                      {r.w} px
                    </span>
                  ) : null}
                </>
              );
            })()
          : null}
        {drag?.on ? (() => {
          const a = toScreen(c, drag.lineX, 0);
          return <div className="absolute w-0.5 rounded-full bg-signal" style={{ left: a.x - 1, top: a.y, height: Math.min(view.h, Math.max(...rects.map((r) => r.h)) * z) }} />;
        })() : null}
        {pickedBox && !drag?.on && !resize ? toolbarFor(pickedBox, c, view) : null}
      </>
    );
  };
  const toolbarFor = (b: Box, c: Camera, view: Size) => {
    const spot = toolbarSpot(b, c, view, tbw);
    const many = picked.length > 1;
    const r = many ? undefined : rowOf(picked[0]!);
    if (!many && !r) return null;
    const draft = r ? status(r) === "draft" : false;
    const docked = view.w < 640;
    return (
      <div
        ref={toolbar}
        data-canvas-ui=""
        role="toolbar"
        aria-label="Email actions"
        className="anim-rise-sm pointer-events-auto absolute flex items-center gap-0.5 rounded-full bg-card p-1 whitespace-nowrap shadow-float"
        style={docked ? { left: "50%", bottom: 64, transform: "translateX(-50%)" } : { left: spot.x, top: spot.y, transform: "translateX(-50%)" }}
      >
        {many ? (
          <>
            <span className="px-2.5 text-[13px] font-medium text-ink">{picked.length} emails</span>
            <span className="mx-0.5 h-4 w-px bg-line" />
            <Button size="sm" variant="plain" onClick={(e) => moveMenu(e.currentTarget, picked)}>
              Move to group
            </Button>
            <Button size="sm" variant="plain" onClick={() => void remove(picked)}>
              Delete
            </Button>
          </>
        ) : draft ? (
          <>
            <Button size="sm" variant="plain" onClick={() => open(r!.id)}>
              Open
            </Button>
            <Button size="sm" variant="plain" onClick={() => void test(r!.id)}>
              Test
            </Button>
            <Button size="sm" onClick={() => setSending(r!)}>
              <Send size={13} /> Send
            </Button>
            <span className="mx-0.5 h-4 w-px bg-line" />
            <button type="button" aria-label="More" title="More" onClick={(e) => moreMenu(e.currentTarget, r!.id)} className="flex size-7 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink">
              <MoreHorizontal size={15} />
            </button>
          </>
        ) : (
          <>
            <Button size="sm" variant="plain" onClick={() => navigate("emails", `campaigns/${r!.id}`)}>
              Results
            </Button>
            <Button size="sm" variant="plain" onClick={() => void duplicate(r!.id)}>
              Duplicate
            </Button>
            <span className="mx-0.5 h-4 w-px bg-line" />
            <button type="button" aria-label="More" title="More" onClick={(e) => moreMenu(e.currentTarget, r!.id)} className="flex size-7 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink">
              <MoreHorizontal size={15} />
            </button>
          </>
        )}
      </div>
    );
  };

  const world = rects.map((r) => {
    const row = rowOf(r.id)!;
    const lifted = drag?.on && drag.id === r.id ? { dx: drag.dx, dy: drag.dy } : null;
    return <Artboard key={r.id} id={r.id} name={row.name} html={htmls[r.id] ?? ""} x={r.x} w={r.w} h={r.h} shift={drag?.on ? (drag.shift[r.id] ?? 0) : 0} lift={lifted} live={live.has(r.id) || (!measured && firstIds.includes(r.id))} onHeight={onHeight} onDown={onDown} onOpen={open} onHover={onHover} />;
  });

  return (
    <Page
      title={g.name}
      count={list.length}
      flush
      back={{ label: "Campaigns", onClick: back }}
      onRename={ungrouped ? undefined : (name) => void run(async () => (must(await sb.rpc("email_group_save", { p_ws: ws.id, p_id: groupId, p_name: name })), void group.reload(), invalidate(`email_groups:${ws.id}`), void groups.reload()))}
      actions={
        <span className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="Size" className="flex items-center gap-0.5 rounded-full bg-paper-deep p-0.5">
            {(
              [
                [false, "Desktop", <Monitor key="d" size={14} />],
                [true, "Phone", <Phone key="p" size={14} />],
              ] as const
            ).map(([v, label, icon]) => (
              <button key={label} type="button" role="radio" aria-checked={phone === v} aria-label={label} title={label} onClick={() => setPhone(v)} className={`flex size-7 items-center justify-center rounded-full transition-colors duration-[140ms] ${phone === v ? "bg-card text-ink shadow-chip" : "text-muted hover:text-ink"}`}>
                {icon}
              </button>
            ))}
          </div>
          <Button onClick={(e) => addMenu(e.currentTarget)}>
            Add email <ChevronDown size={13} />
          </Button>
        </span>
      }
    >
      <div data-email-canvas="" className="relative flex h-full min-h-0 flex-col">
        {error ? (
          <div className="absolute top-3 left-1/2 z-[5] -translate-x-1/2 rounded-lg bg-card p-1 shadow-float">
            <ErrorNote message={error} />
          </div>
        ) : null}
        <Surface
          ref={surface}
          storageKey={`claritia:canvas:${groupId}`}
          label={`${g.name}: ${list.length} ${list.length === 1 ? "email" : "emails"}`}
          all={all}
          picked={pickedBox}
          ready={measured}
          first={(view) => {
            if (pick) {
              const r = rects.find((x) => x.id === pick);
              if (r) return { ...firstView([r], view) };
            }
            return firstView(rects, view);
          }}
          world={world}
          screen={screen}
          onView={onView}
          onKey={onKey}
          onBackground={() => setPicked([])}
        >
          {!list.length ? (
            <div className="absolute inset-0 z-[2] flex min-w-0 flex-wrap items-center justify-center">
              <div data-canvas-ui="" className="flex flex-col items-center gap-4 px-6 text-center">
                <Sketch name="envelopes" size={220} />
                <h2 className="text-[18px] font-medium tracking-[-0.02em] text-ink">Add the first email to {g.name}</h2>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button onClick={() => void addNew()}>New email</Button>
                  <Button variant="ghost" onClick={() => navigate("emails", "templates", `group=${groupId}`)}>
                    From a template
                  </Button>
                  {!ungrouped ? (
                    <Button variant="ghost" onClick={(e) => addMenu(e.currentTarget)}>
                      From Campaigns
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
          {notice ? (
            <div role="status" className="anim-rise-sm pointer-events-none absolute bottom-4 left-4 z-[4] rounded-full bg-brand px-3.5 py-1.5 text-[12.5px] font-medium text-on-brand shadow-float">
              {notice}
            </div>
          ) : null}
        </Surface>
      </div>
      {menu ? (
        <Popover anchor={menu.anchor} onClose={() => setMenu(null)} width={240}>
          <div role="menu" className="flex flex-col p-1" data-canvas-ui="">
            {menu.items.map((i, n) => (
              <div key={`${i.label}${n}`} className="contents">
                {i.group ? <p className="px-2.5 pt-2 pb-1 text-[11.5px] text-faint">{i.group}</p> : null}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenu(null);
                    i.run();
                  }}
                  className={`flex min-h-8 items-center justify-between gap-3 rounded-md px-2.5 py-1 text-left text-[13px] hover:bg-hover ${i.danger ? "text-rose" : "text-ink"}`}
                >
                  <span className="min-w-0 break-words">{i.label}</span>
                  {i.hint ? <span className="shrink-0 text-[11.5px] text-faint">{i.hint}</span> : null}
                </button>
              </div>
            ))}
          </div>
        </Popover>
      ) : null}
      {sending ? (
        <CanvasSend
          sb={sb}
          session={session}
          ws={ws.id}
          row={sending}
          onClose={() => setSending(null)}
          onSent={() => {
            setSending(null);
            reload();
          }}
        />
      ) : null}
      {code ? <CodeView html={code.html} name={code.name} onClose={() => setCode(null)} /> : null}
    </Page>
  );
}
