"use client";

// Send from the canvas (docs/email-canvas-b1.md section 6): the same Send panel the Email Studio opens (156, 159),
// for an email picked on the canvas. Subject and preview text changed in the panel save to the draft before it sends.

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { useRef, useState } from "react";
import { SendPanel } from "../SendPanel";
import { must } from "../../ui";
import { docOf, type CanvasRow } from "./preview";

export function CanvasSend({ sb, session, ws, row, onClose, onSent }: { sb: SupabaseClient; session: Session; ws: string; row: CanvasRow; onClose: () => void; onSent: () => void }) {
  const [subject, setSubject] = useState(row.subject);
  const [doc, setDoc] = useState(() => docOf(row));
  const dirty = useRef(false);
  return (
    <SendPanel
      sb={sb}
      session={session}
      ws={ws}
      emailId={row.id}
      subject={subject}
      preheader={doc.settings.preheader ?? ""}
      doc={doc}
      onSubject={(s) => {
        dirty.current = true;
        setSubject(s);
      }}
      onPreheader={(p) => {
        dirty.current = true;
        setDoc((d) => ({ ...d, settings: { ...d.settings, preheader: p } }));
      }}
      beforeSend={async () => {
        if (!dirty.current) return;
        must(await sb.rpc("email_draft_save", { p_ws: ws, p_id: row.id, p_name: row.name === "Untitled email" && subject.trim() ? subject.trim().slice(0, 200) : row.name, p_subject: subject, p_preheader: doc.settings.preheader ?? "", p_doc: doc }));
        dirty.current = false;
      }}
      onClose={onClose}
      onSent={onSent}
    />
  );
}
