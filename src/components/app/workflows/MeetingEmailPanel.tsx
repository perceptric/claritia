"use client";

// A Meeting email step's panel (docs/workflows-plan.md, Part A): the meeting's own email (a System email, 164) in the
// workflow, edited in place like any email step: the subject with Insert data, and the email itself with a sample
// meeting's values, typed in place. Changes save to the email 800 ms after the last one, and a save that fails is tried
// again with growing waits. Open full editor opens it on the canvas. The guest's emails with the calendar invite can't
// be removed.

import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import { readEmailDoc, type EmailDoc } from "@/lib/design/email/doc";
import { FIELDS_FOR, sampleFill, SYSTEM_FIELDS, SYSTEM_META, type SystemKey } from "@/lib/meetings/systemEmails";
import type { CanvasKit } from "../emails/canvas/preview";
import { Trash } from "../../Icons";
import { Select } from "../Select";
import { Badge, Button, ErrorNote, IconButton, Input } from "../ui";
import { EmailInPanel } from "./EmailInPanel";

export type SystemRow = { id: string; name: string; system_key: string; subject: string; preheader: string | null; doc: unknown };

const label = "text-[12.5px] font-medium text-muted";
const fill = (h: string) => sampleFill(h);

export function MeetingEmailPanel({ sb, ws, keyName, row, kits, readOnly, onRemove, onOpenFull, onSaved }: { sb: SupabaseClient; ws: string; keyName: SystemKey; row: SystemRow | undefined; kits: CanvasKit[] | undefined; readOnly: boolean; onRemove?: () => void; onOpenFull?: () => void; onSaved: (r: SystemRow) => void }) {
  const meta = SYSTEM_META[keyName];
  const [subject, setSubject] = useState(row?.subject ?? "");
  const [doc, setDoc] = useState<EmailDoc | null>(row?.doc ? readEmailDoc(row.doc, { allowHtml: true }) : null);
  const [dirty, setDirty] = useState(0);
  const [tries, setTries] = useState(0);
  const latest = useRef({ subject, doc, row, onSaved });
  // Changes not saved yet: saved at once when the panel closes (another step picked, Open full editor).
  const unsaved = useRef(false);
  useEffect(() => {
    latest.current = { subject, doc, row, onSaved };
  });
  useEffect(
    () => () => {
      const { subject: sub, doc: d, row: r } = latest.current;
      if (unsaved.current && r && d) void sb.rpc("email_draft_save", { p_ws: ws, p_id: r.id, p_name: r.name, p_subject: sub, p_preheader: d.settings.preheader ?? "", p_doc: d });
    },
    [sb, ws],
  );
  const fields = FIELDS_FOR[keyName].map((f) => ({ tag: f, label: SYSTEM_FIELDS[f] }));

  // Save 800 ms after the last change; a failure waits longer each time (up to 30 seconds) and tries again.
  useEffect(() => {
    if (!dirty || readOnly) return;
    const t = setTimeout(
      async () => {
        const { subject: sub, doc: d, row: r } = latest.current;
        if (!r || !d) return;
        const res = await sb.rpc("email_draft_save", { p_ws: ws, p_id: r.id, p_name: r.name, p_subject: sub, p_preheader: d.settings.preheader ?? "", p_doc: d });
        if (res.error) return setTries((n) => n + 1);
        if (latest.current.subject === sub && latest.current.doc === d) unsaved.current = false;
        setTries(0);
        latest.current.onSaved({ ...r, subject: sub, doc: d });
      },
      tries ? Math.min(30_000, 1000 * 2 ** tries) : 800,
    );
    return () => clearTimeout(t);
  }, [dirty, tries, readOnly, sb, ws]);
  const change = (next: { subject?: string; doc?: EmailDoc }) => {
    if (next.subject !== undefined) setSubject(next.subject);
    if (next.doc) setDoc(next.doc);
    unsaved.current = true;
    setDirty((n) => n + 1);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <span className="text-[15px] font-semibold tracking-[-0.02em] text-ink">Send email</span>
        <Badge tone="gray">{meta.to === "guest" ? "To the guest" : "To the host"}</Badge>
        {onRemove && !readOnly ? (
          <IconButton label="Delete" onClick={onRemove} className="ml-auto">
            <Trash size={13} />
          </IconButton>
        ) : null}
      </div>
      <p className="-mt-3 text-[12.5px] text-muted">{meta.required ? `${meta.name}, with the calendar invite` : meta.name}</p>
      {!row ? (
        <div className="h-40 rounded-[10px] bg-paper-deep" />
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <span className={label}>Subject</span>
            <div className="flex min-w-0 items-center gap-2">
              <Input aria-label="Subject" value={subject} onChange={(e) => change({ subject: e.target.value })} className="h-9 min-w-0 flex-1" disabled={readOnly} />
              <Select<string> value="" options={fields.map((f) => ({ value: f.tag, label: f.label }))} onChange={(tag) => change({ subject: `${subject.trimEnd()} {{${tag}}}`.trim() })} ariaLabel="Insert data" placeholder="Insert data" plainPlaceholder disabled={readOnly} className="h-9 w-36" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`${label} flex-1`}>The email</span>
              {onOpenFull ? (
                <Button size="sm" variant="ghost" onClick={onOpenFull}>
                  Open full editor
                </Button>
              ) : null}
            </div>
            {doc && kits ? <EmailInPanel doc={doc} kits={kits} onChange={(d) => change({ doc: d })} readOnly={readOnly} fill={fill} fields={fields} footer={false} /> : <div className="h-40 rounded-[10px] bg-paper-deep" />}
          </div>
          {tries > 2 ? <ErrorNote message="The email hasn't saved yet. Retrying." /> : null}
        </>
      )}
    </div>
  );
}
