"use client";

// One group's emails on a canvas (docs/email-canvas-b1.md): side by side in the group's order, as they'd arrive, on a
// surface you can pan and zoom (canvas/Surface.tsx). Click picks an email (Shift adds), ← and → step, Enter or a
// double-click opens it in the Email Studio (Done comes back here). The toolbar above the pick holds Open, Test, Send
// and More (Rename, Duplicate, Code, Move to group, Take out of the group, Delete); a sent email offers Results and
// Duplicate; several picked, Move to group and Delete. Drag an email by its name or grip to reorder it; drag a side
// handle to resize it (600, 640 or 700 px). Add email makes a new draft, uses a template or brings one in from
// Campaigns. "Ungrouped" is every email in no group, newest first; it can't be renamed or reordered.
//
// Editing (docs/email-canvas-b2.md): a click inside an email picks the element under the pointer, with its outline,
// tag, padding and element bar, and the panel on the right (Element and Layout). Escape steps out, Enter steps in,
// ↑ and ↓ follow reading order, Tab goes to siblings, Alt+Shift+↑ and ↓ move, ⌘D duplicates, Delete removes, ⌘Z and
// ⇧⌘Z undo and redo in that email. Changes show in the frame at once and save 800 ms after the last one.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { boundsOf, dropSlot, firstView, nearView, rowLayout, snapWidth, toolbarSpot, toScreen, toWorld, type Box, type Camera, type Size } from "@/lib/canvas/view";
import { literal } from "@/lib/design/cascade";
import { newBlock, newSection, readEmailDoc, type Block, type EmailDoc } from "@/lib/design/email/doc";
import { duplicateEl, findEl, removeEl, updateBlock, updateSection } from "@/lib/design/email/ops";
import { isEmailPart, type EmailPartKey } from "@/lib/design/email/parts";
import { paddingZones, partFromClasses, type Box as LocalBox, type Zone } from "@/lib/design/email/pick";
import { resolveEmail, type EmailState } from "@/lib/design/email/style";
import { applyDrop, firstChildOf, KIND_LABEL, kindOf, layerTree, moveStep, nextInOrder, parentOf, siblingOf } from "@/lib/design/email/tree";
import { allVariables } from "@/lib/design/model";
import { ChevronDown, Grip, Monitor, MoreHorizontal, Phone, Redo, Send, Undo } from "../../../Icons";
import { Surface, type SurfaceApi } from "../../canvas/Surface";
import { askConfirm, askText } from "../../Dialogs";
import { Popover } from "../../FilterBar";
import { Sketch } from "../../../sketches/Sketch";
import { CodeView } from "../../email/CodeView";
import { Badge, Button, ErrorNote, errorText, invalidate, Loading, must, Page, postJson, useQuery, type Tone, type ViewProps } from "../../ui";
import type { Kit } from "../../forms/shared";
import { Artboard } from "./Artboard";
import { CanvasSend } from "./CanvasSend";
import { Inspector } from "./Inspector";
import { LayerTree } from "./LayerTree";
import { Overlay } from "./Overlay";
import { docOf, previewHtml, sourceHtml, widthOf, type CanvasRow } from "./preview";
import { useEmailDraft } from "./useEmailDraft";

export const UNGROUPED = "ungrouped";
const PHONE = 390;
const TONE: Record<string, Tone> = { sent: "green", sending: "amber", scheduled: "sky", paused: "amber", draft: "gray" };
const LABEL: Record<string, string> = { sent: "Sent", sending: "Sending", scheduled: "Scheduled", paused: "Paused", draft: "Draft" };
type Menu = { anchor: HTMLElement; items: { label: string; run: () => void; danger?: boolean; hint?: string; group?: string }[] } | null;
/** The element picked inside the email being edited; null is the whole email. */
type El = { email: string; id: string; part: EmailPartKey | null };
type Boxes = { picked: LocalBox | null; hover: LocalBox | null; pad: Zone[] };
const NO_BOXES: Boxes = { picked: null, hover: null, pad: [] };
const sameBox = (a: LocalBox | null, b: LocalBox | null) => (!a || !b ? a === b : a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h);

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
  const kits = useQuery(`email_canvas_kits:${ws.id}`, async () =>
    ((must(await sb.from("brand_kits").select("id, name, tokens, logo_url, design, design_live, design_rev").eq("workspace_id", ws.id).order("created_at")) ?? []) as Omit<Kit, "notes" | "source_url" | "scan_status" | "scan_error" | "scanned_at">[]).map(
      (k): Kit & { design: unknown } => ({ notes: [], source_url: null, scan_status: null, scan_error: null, scanned_at: null, ...k, tokens: k.tokens ?? {}, design: k.design ?? null }),
    ),
  );
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
  const [loaded, setLoaded] = useState<Set<string>>(() => new Set(pick ? [pick] : []));
  const toolbar = useRef<HTMLDivElement>(null);
  // Editing inside one email (B2).
  const [el, setEl] = useState<El | null>(null);
  const [elHover, setElHover] = useState<string | null>(null);
  const [panel, setPanel] = useState(true);
  const [tab, setTab] = useState<"element" | "layout">("element");
  const [look, setLook] = useState<EmailState | undefined>(undefined);
  const [boxes, setBoxes] = useState<Boxes>(NO_BOXES);
  const [undoNote, setUndoNote] = useState<string>("");
  const frames = useRef(new Map<string, HTMLIFrameElement>());
  const [, setFrameTick] = useState(0);

  const status = useCallback((r: CanvasRow) => states.data?.find((s) => s.id === r.id)?.status ?? r.status, [states.data]);
  const list = useMemo(() => rows.data ?? [], [rows.data]);
  const kitList = useMemo(() => kits.data ?? [], [kits.data]);
  // The email being edited: the one picked, alone.
  const editId = picked.length === 1 ? picked[0]! : null;
  const editRow = useMemo(() => (editId ? (list.find((r) => r.id === editId) ?? null) : null), [list, editId]);
  const setRows = rows.set;
  const onSaved = useCallback(
    (id: string, doc: EmailDoc, subject: string) =>
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, doc, subject, preheader: doc.settings.preheader, name: r.name === "Untitled email" && subject.trim() ? subject.trim().slice(0, 200) : r.name } : r))),
    [setRows],
  );
  const draft = useEmailDraft({ sb, session, ws: ws.id, row: editRow, kits: kitList, onSaved });
  const editDoc = draft.id === editId ? draft.doc : null;
  const draftRef = useRef(draft);
  const listRef = useRef(list);
  useEffect(() => {
    listRef.current = list;
  });
  // The rows as they are after a save that just finished (onSaved updates them before the next render).
  const rowsNow = () => (rows.data ?? listRef.current);
  useEffect(() => {
    draftRef.current = draft;
  });
  // A picked element that's gone (undo, another tab) falls back to the email.
  const elNow = el && editDoc && el.email === editId && findEl(editDoc, el.id) ? el : null;
  // Emails on the same brand as the one being edited show its draft styles (an "Every heading" change shows on all).
  const live = (doc: EmailDoc) => !!draft.kit && (kitList.find((k) => k.id === doc.kitId) ?? kitList[0])?.id === draft.kit.id;
  const others = useMemo(() => {
    const out: Record<string, string> = {};
    for (const r of list) {
      const doc = r.doc ? docOf(r) : null;
      out[r.id] = doc && live(doc) ? previewHtml(r, kitList, { doc, system: draft.system, tokens: draft.tokens }) : previewHtml(r, kitList);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, kitList, draft.system, draft.tokens, draft.kit]);
  const editHtml = useMemo(() => (editRow && draft.id === editRow.id && draft.doc ? previewHtml(editRow, kitList, { doc: draft.doc, system: draft.system, tokens: draft.tokens, dark: look === "dark" }) : null), [editRow, draft.id, draft.doc, draft.system, draft.tokens, kitList, look]);
  const htmls = useMemo(() => (editId && editHtml !== null ? { ...others, [editId]: editHtml } : others), [others, editId, editHtml]);
  const rects = useMemo(() => rowLayout(list.map((r) => ({ id: r.id, w: phone ? PHONE : (widths[r.id] ?? widthOf(r)), h: heights[r.id] ?? 900 }))), [list, phone, widths, heights]);
  const all = useMemo(() => boundsOf(rects), [rects]);
  const pickedBox = useMemo(() => boundsOf(rects.filter((r) => picked.includes(r.id))), [rects, picked]);
  const firstIds = useMemo(() => (pick && list.some((r) => r.id === pick) ? [pick] : list.slice(0, 4).map((r) => r.id)), [list, pick]);
  const measured = list.length === 0 || firstIds.every((id) => heights[id]);
  const onView = useCallback(
    (c: Camera, view: Size) => {
      const near1 = nearView(rects, c, view, 1);
      const far3 = nearView(rects, c, view, 3);
      setLoaded((cur) => {
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
  const onHover = useCallback((id: string | null) => {
    setHover(id);
    if (!id) setElHover(null);
  }, []);
  const open = useCallback(
    (id: string) =>
      void (async () => {
        if (draftRef.current.id === id) await draftRef.current.flush();
        navigate("emails", `campaigns/${id}`, `back=${groupId}`);
      })(),
    [navigate, groupId],
  );

  // The element under the pointer, found through the email's own frame: the innermost marked element that's in the
  // document (a component's inner blocks climb to their section), and the part clicked.
  const docFor = (email: string): EmailDoc | null => {
    if (email === draft.id && draft.doc) return draft.doc;
    const r = list.find((x) => x.id === email);
    return r?.doc ? docOf(r) : null;
  };
  const hitAt = (email: string, x: number, y: number): El | null => {
    const f = frames.current.get(email);
    const d = f?.contentDocument;
    const doc = docFor(email);
    if (!f || !d || !doc) return null;
    const box = f.getBoundingClientRect();
    const z = surface.current?.camera().z ?? 1;
    const t = d.elementFromPoint((x - box.left) / z, (y - box.top) / z);
    for (let n: Element | null = t; n; n = n.parentElement) {
      const id = n.getAttribute("data-eid");
      if (!id || id === "email") continue;
      const found = findEl(doc, id);
      if (!found) continue;
      if (found.section.component && !found.section.component.edit) return { email, id: found.section.id, part: null };
      let part: EmailPartKey | null = null;
      for (let m: Element | null = t; m && m !== n.parentElement; m = m.parentElement) {
        part = partFromClasses(m.classList, id);
        if (part) break;
      }
      return { email, id, part };
    }
    return null;
  };
  const onFrame = useCallback((id: string, f: HTMLIFrameElement | null) => {
    if (f) frames.current.set(id, f);
    else frames.current.delete(id);
    setFrameTick((t) => t + 1);
  }, []);
  const handlers = useRef({ hitAt, editId, el: elNow });
  useEffect(() => {
    handlers.current = { hitAt, editId, el: elNow };
  });
  const onDown = useCallback((id: string, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (e.shiftKey) {
      setEl(null);
      return setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
    }
    setPicked([id]);
    setEl(handlers.current.hitAt(id, e.clientX, e.clientY));
    setPanel(true);
  }, []);
  const onMove = useCallback((id: string, e: React.PointerEvent) => {
    const h = handlers.current;
    const hit = id === h.editId ? h.hitAt(id, e.clientX, e.clientY) : null;
    setElHover((cur) => (cur === (hit?.id ?? null) ? cur : (hit?.id ?? null)));
  }, []);
  const onBoardOpen = useCallback(
    (id: string) => {
      // B3 types in place; until then a double-click on an element goes to its first field in the panel.
      if (handlers.current.el && handlers.current.editId === id) {
        setPanel(true);
        setTab("element");
        window.setTimeout(() => document.querySelector<HTMLElement>("[data-canvas-panel] textarea, [data-canvas-panel] input:not([type='hidden']):not([type='file']), [data-canvas-panel] [contenteditable='true']")?.focus(), 0);
        return;
      }
      open(id);
    },
    [open],
  );

  // The boxes of the picked and hovered elements and the picked one's padding, read from inside the frame after
  // each change (never while rendering). A pick made by keys pans into view.
  const shownFor = useRef<string | null>(null);
  useEffect(() => {
    const f = editId ? frames.current.get(editId) : undefined;
    const d = f?.contentDocument;
    let next = NO_BOXES;
    if (d && editDoc) {
      const nodeOf = (id: string) => d.querySelector(`[data-eid="${CSS.escape(id)}"]`);
      const boxOf = (n: Element): LocalBox => {
        const b = n.getBoundingClientRect();
        return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) };
      };
      const pn = elNow ? nodeOf(elNow.id) : null;
      const hn = elHover && elHover !== elNow?.id ? nodeOf(elHover) : null;
      let pad: Zone[] = [];
      if (pn && elNow) {
        const win = d.defaultView!;
        for (const c of [pn, ...Array.from(pn.querySelectorAll(`[class*="c${elNow.id}-"]`)).slice(0, 3)]) {
          const cs = win.getComputedStyle(c);
          const p = { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 };
          if (p.top || p.right || p.bottom || p.left) {
            pad = paddingZones(boxOf(c), p).map((z) => ({ ...z, value: Math.round(z.value) }));
            break;
          }
        }
      }
      next = { picked: pn ? boxOf(pn) : null, hover: hn ? boxOf(hn) : null, pad };
    }
    if (!sameBox(next.picked, boxes.picked) || !sameBox(next.hover, boxes.hover) || JSON.stringify(next.pad) !== JSON.stringify(boxes.pad)) setBoxes(next);
    // Keys moved the pick out of view: pan to it at the same zoom.
    if (elNow && next.picked && shownFor.current !== elNow.id) {
      shownFor.current = elNow.id;
      const sf = surface.current;
      const r = rects.find((x) => x.id === editId);
      const host = document.querySelector("[data-email-canvas] [role='application']") as HTMLElement | null;
      if (sf && r && host) {
        const c = sf.camera();
        const a = toScreen(c, r.x + next.picked.x, r.y + next.picked.y);
        const w = next.picked.w * c.z;
        const h = next.picked.h * c.z;
        const vw = host.clientWidth;
        const vh = host.clientHeight;
        const off = a.y < 48 || a.y + Math.min(h, vh / 2) > vh - 48 || a.x + w < 24 || a.x > vw - 24;
        if (off) sf.glide({ ...c, x: a.x + w < 24 || a.x > vw - 24 ? c.x + vw / 2 - (a.x + w / 2) : c.x, y: c.y + vh * 0.3 - a.y });
      }
    } else if (!elNow) shownFor.current = null;
  });

  // Dragging an email by its name or grip: past 4 px it lifts, the others make room, and the drop saves the order.
  const startDrag = (id: string, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setEl(null);
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
      const d = draftRef.current;
      void run(async () => {
        // The email being edited takes the width through its own editor, so its next save keeps it (and Undo works).
        if (d.id === r.id && d.doc && !d.readOnly) {
          d.apply({ doc: { ...d.doc, settings: { ...d.doc.settings, width: w as EmailDoc["settings"]["width"] } } });
          if (!(await d.flush())) throw new Error(d.error || "The width wasn't saved.");
        } else must(await sb.rpc("email_draft_save", { p_ws: ws.id, p_id: r.id, p_name: r.name, p_subject: r.subject, p_preheader: r.preheader ?? "", p_doc: { ...doc, settings: { ...doc.settings, width: w } } }));
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
  // Actions on a whole email save the change being typed first.
  const saved = async (id: string) => (draftRef.current.id === id ? void (await draftRef.current.flush()) : undefined);
  const duplicate = (id: string) =>
    run(async () => {
      await saved(id);
      const r = rowsNow().find((x) => x.id === id);
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
      await saved(id);
      const r = rowsNow().find((x) => x.id === id);
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
      await saved(id);
      const r = rowsNow().find((x) => x.id === id);
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

  // Editing the picked element (B2) ---------------------------------------------------------------------------------
  const editable = !!editDoc && !draft.readOnly;
  const pickEl = (id: string | null, part: EmailPartKey | null = null) => (editId ? setEl(id && id !== "email" ? { email: editId, id, part } : null) : undefined);
  const stepOut = () => {
    if (!elNow || !editDoc) return;
    const p = parentOf(editDoc, elNow.id);
    pickEl(p);
  };
  const moveEl = (id: string, dir: 1 | -1) => {
    if (!editable || !editDoc) return;
    const n = moveStep(editDoc, id, dir);
    if (n !== editDoc) draft.apply({ doc: n });
  };
  const duplicateElement = (id: string) => {
    if (!editable || !editDoc) return;
    const r = duplicateEl(editDoc, id);
    if (!r.id) return;
    draft.apply({ doc: r.doc });
    pickEl(r.id);
  };
  const noteTimer = useRef(0);
  const removeElement = (id: string) => {
    if (!editable || !editDoc) return;
    const p = parentOf(editDoc, id);
    const n = removeEl(editDoc, id);
    if (n === editDoc) return;
    draft.apply({ doc: n });
    pickEl(p && findEl(n, p) ? p : null);
    setUndoNote("Deleted");
    window.clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(() => setUndoNote(""), 5000);
  };
  const hideElement = (id: string, on: "phone" | "desktop") => {
    if (!editable || !editDoc) return;
    const f = findEl(editDoc, id);
    if (!f) return;
    if (f.block) draft.apply({ doc: updateBlock(editDoc, id, { hideOn: f.block.hideOn === on ? undefined : on } as Partial<Block>) });
    else if (!f.column) draft.apply({ doc: updateSection(editDoc, id, { hideOn: f.section.hideOn === on ? undefined : on }) });
  };
  const tagOf = (id: string) => {
    if (!editDoc) return "";
    const f = findEl(editDoc, id);
    if (f && !f.block && !f.column && f.section.component && !f.section.component.edit) {
      const name = draft.system.email?.components?.find((c) => c.id === f.section.component!.id)?.name;
      return name ? `Component: ${name}` : "Component";
    }
    const k = kindOf(editDoc, id);
    return k && k !== "email" ? KIND_LABEL[k] : "Email";
  };

  // Keys the page handles before the surface's own.
  const onKey = (e: KeyboardEvent): boolean => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "z" && editDoc) {
      e.preventDefault();
      if (e.shiftKey) draft.redo();
      else draft.undo();
      return true;
    }
    if (e.key === "Escape") {
      if (drag) setDrag(null);
      else if (elNow) stepOut();
      else (setPicked([]), setEl(null));
      return true;
    }
    if (elNow && editDoc) {
      const id = elNow.id;
      if (e.altKey && e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) return (e.preventDefault(), moveEl(id, e.key === "ArrowDown" ? 1 : -1), true);
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const n = nextInOrder(editDoc, id, e.key === "ArrowDown" ? 1 : -1);
        if (n) pickEl(n);
        return true;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        const n = siblingOf(editDoc, id, e.shiftKey ? -1 : 1);
        if (n) pickEl(n);
        return true;
      }
      if (e.key === "Enter") {
        const n = firstChildOf(editDoc, id);
        if (n) pickEl(n);
        return true;
      }
      if (mod && e.key.toLowerCase() === "d") return (e.preventDefault(), duplicateElement(id), true);
      if (e.key === "Delete" || e.key === "Backspace") return (e.preventDefault(), removeElement(id), true);
    } else if (editDoc && e.key === "Enter") {
      const n = firstChildOf(editDoc, "email");
      if (n) (pickEl(n), setPanel(true));
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
      setEl(null);
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
              {on && !drag?.on ? <div className={`absolute ${elNow && r.id === editId ? "shadow-[0_0_0_1px_var(--color-signal-line)]" : "shadow-[0_0_0_2px_var(--color-signal)]"}`} style={{ left: a.x, top: a.y, width: r.w * z, height: r.h * z }} /> : null}
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
        {editId && editDoc && !drag?.on && !resize
          ? (() => {
              const r = rects.find((x) => x.id === editId);
              if (!r) return null;
              const id = elNow?.id;
              return (
                <Overlay
                  c={c}
                  at={r}
                  hover={boxes.hover && elHover ? { box: boxes.hover, tag: tagOf(elHover) } : null}
                  picked={boxes.picked && id ? { id, box: boxes.picked, tag: tagOf(id) } : null}
                  pad={boxes.pad}
                  actions={
                    id && editable
                      ? {
                          parent: stepOut,
                          up: moveStep(editDoc, id, -1) !== editDoc ? () => moveEl(id, -1) : undefined,
                          down: moveStep(editDoc, id, 1) !== editDoc ? () => moveEl(id, 1) : undefined,
                          duplicate: findEl(editDoc, id)?.column && !findEl(editDoc, id)?.block ? undefined : () => duplicateElement(id),
                          remove: () => removeElement(id),
                        }
                      : id
                        ? { parent: stepOut }
                        : null
                  }
                />
              );
            })()
          : null}
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
        style={docked ? { left: "50%", ...(panel && editDoc ? { top: 12 } : { bottom: 64 }), transform: "translateX(-50%)" } : { left: spot.x, top: spot.y, transform: "translateX(-50%)" }}
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
            <Button size="sm" onClick={() => void run(async () => (await saved(r!.id), setSending(rowsNow().find((x) => x.id === r!.id) ?? r!)))}>
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
    return (
      <Artboard
        key={r.id}
        id={r.id}
        name={row.name}
        html={htmls[r.id] ?? ""}
        x={r.x}
        w={r.w}
        h={r.h}
        shift={drag?.on ? (drag.shift[r.id] ?? 0) : 0}
        lift={lifted}
        live={loaded.has(r.id) || r.id === editId || (!measured && firstIds.includes(r.id))}
        onHeight={onHeight}
        onDown={onDown}
        onMove={onMove}
        onOpen={onBoardOpen}
        onHover={onHover}
        onFrame={onFrame}
      />
    );
  });

  return (
    <Page
      title={g.name}
      count={list.length}
      flush
      back={{ label: "Campaigns", onClick: back }}
      onRename={ungrouped ? undefined : (name) => void run(async () => (must(await sb.rpc("email_group_save", { p_ws: ws.id, p_id: groupId, p_name: name })), void group.reload(), invalidate(`email_groups:${ws.id}`), void groups.reload()))}
      actions={
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          {editDoc ? (
            <>
              {draft.saving ? <span className="text-[12.5px] text-muted">Saving…</span> : null}
              {draft.error ? (
                <span role="alert" className="flex min-w-0 flex-wrap items-center gap-1.5 text-[12.5px] text-rose">
                  <span className="min-w-0 break-words">{draft.error}</span>
                  {!draft.readOnly ? (
                    <button type="button" onClick={() => void draft.flush()} className="font-medium text-ink underline underline-offset-2">
                      Try again
                    </button>
                  ) : null}
                </span>
              ) : null}
              <span className="flex items-center gap-0.5">
                <button type="button" aria-label="Undo" title="Undo (⌘Z)" disabled={!draft.canUndo} onClick={draft.undo} className="flex size-8 items-center justify-center rounded-full text-body hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-35">
                  <Undo size={15} />
                </button>
                <button type="button" aria-label="Redo" title="Redo (⇧⌘Z)" disabled={!draft.canRedo} onClick={draft.redo} className="flex size-8 items-center justify-center rounded-full text-body hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-35">
                  <Redo size={15} />
                </button>
              </span>
              {draft.stylesChanged ? (
                <Button variant="ghost" onClick={() => void draft.publishStyles().then(() => kits.reload())}>
                  Publish styles
                </Button>
              ) : null}
            </>
          ) : null}
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
      <div data-email-canvas="" className="relative flex h-full min-h-0 min-w-0 flex-wrap lg:flex-nowrap">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
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
          onBackground={() => (setPicked([]), setEl(null))}
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
          {undoNote ? (
            <div data-canvas-ui="" role="status" className="anim-rise-sm absolute bottom-4 left-4 z-[4] flex items-center gap-2 rounded-full bg-brand py-1 pr-1 pl-3.5 text-[12.5px] font-medium text-on-brand shadow-float">
              {undoNote}
              <button
                type="button"
                onClick={() => {
                  draft.undo();
                  setUndoNote("");
                }}
                className="rounded-full px-2.5 py-1 hover:bg-brand-hover"
              >
                Undo
              </button>
            </div>
          ) : null}
        </Surface>
        </div>
        {panel && editId && editDoc ? (
          <div data-canvas-panel="" className="contents">
            <Inspector
              draft={draft}
              kits={kitList.map((k) => ({ id: k.id, name: k.name }))}
              pick={elNow ? { id: elNow.id, part: elNow.part } : { id: "email", part: null }}
              onPick={(id, part) => pickEl(id, part ?? null)}
              phone={phone}
              onPhone={setPhone}
              state={look}
              onState={setLook}
              tab={tab}
              onTab={setTab}
              onClose={() => setPanel(false)}
              assets={{ session, sb, workspaceId: ws.id }}
              layout={
                <LayerTree
                  tree={layerTree(editDoc, (cid) => draft.system.email?.components?.find((c) => c.id === cid)?.name)}
                  picked={elNow ? { id: elNow.id, part: null } : { id: "email", part: "content" }}
                  readOnly={!editable}
                  dot={(id) => {
                    const v = resolveEmail(draft.system, editDoc, { id, part: "button" }, "base")["background-color"]?.value;
                    return v ? literal(v, new Map(allVariables(draft.system, draft.tokens).map((x) => [x.id, x]))) : undefined;
                  }}
                  onPick={(id) => pickEl(id)}
                  onHover={setElHover}
                  onDrop={(id, d) => editable && draft.apply({ doc: applyDrop(editDoc, id, d) })}
                  onStep={moveEl}
                  onDelete={removeElement}
                  onDuplicate={duplicateElement}
                  onHide={hideElement}
                />
              }
            />
          </div>
        ) : null}
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
