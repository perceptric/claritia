"use client";

// Comments on the canvas (docs/email-canvas-b5.md section 5): a round pin at the top right of the part a thread is
// about (or of its email), a thread card with its comments, a reply box, Resolve and Delete (your own; owners any),
// and the box for a new comment. The page places them; these only draw them.

import { useState } from "react";
import { Message } from "../../../Icons";
import { Button, timeAgo } from "../../ui";

export type CommentRow = { id: string; email_id: string; element_id: string | null; thread_id: string; author: string; body: string; created_at: string; resolved_at: string | null };

export function Pin({ x, y, count, resolved, onOpen }: { x: number; y: number; count: number; resolved: boolean; onOpen: (anchor: HTMLElement) => void }) {
  return (
    <button
      type="button"
      data-canvas-ui=""
      data-comment-pin=""
      aria-label={`${count} ${count === 1 ? "comment" : "comments"}${resolved ? ", resolved" : ""}`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => onOpen(e.currentTarget)}
      className={`pointer-events-auto absolute flex h-6 min-w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-0.5 rounded-full px-1.5 text-[11.5px] font-medium shadow-float ${resolved ? "bg-paper-deep text-muted" : "bg-brand text-on-brand"}`}
      style={{ left: x, top: y }}
    >
      <Message size={11} />
      {count}
    </button>
  );
}

function CommentBox({ placeholder, submit, onSubmit, onCancel }: { placeholder: string; submit: string; onSubmit: (body: string) => Promise<void>; onCancel?: () => void }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (!body.trim() || busy) return;
    setBusy(true);
    try {
      await onSubmit(body.trim());
      setBody("");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <textarea
        autoFocus
        value={body}
        maxLength={2000}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void go();
          }
          if (e.key === "Escape" && onCancel) {
            e.stopPropagation();
            onCancel();
          }
        }}
        rows={2}
        aria-label={placeholder}
        placeholder={placeholder}
        className="min-h-[56px] w-full resize-none rounded-lg bg-card px-2.5 py-2 text-[13px] text-ink shadow-input outline-none placeholder:text-faint"
      />
      <div className="flex flex-wrap justify-end gap-1.5">
        {onCancel ? (
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button size="sm" disabled={!body.trim() || busy} onClick={() => void go()}>
          {submit}
        </Button>
      </div>
    </div>
  );
}

/** A new comment at a spot. */
export function Composer({ onSubmit, onCancel }: { onSubmit: (body: string) => Promise<void>; onCancel: () => void }) {
  return (
    <div data-canvas-ui="" data-comment-composer="" className="p-2.5">
      <CommentBox placeholder="Add a comment" submit="Comment" onSubmit={onSubmit} onCancel={onCancel} />
    </div>
  );
}

/** A thread: its comments, a reply, Resolve, and Delete for your own (or any, for owners). */
export function ThreadCard({ comments, me, owner, onReply, onResolve, onDelete }: { comments: CommentRow[]; me: string; owner: boolean; onReply: (body: string) => Promise<void>; onResolve: (on: boolean) => void; onDelete: (c: CommentRow) => void }) {
  const resolved = !!comments[0]?.resolved_at;
  return (
    <div data-canvas-ui="" data-comment-thread="" className="flex flex-col gap-2.5 p-2.5">
      <div className="flex flex-col gap-2">
        {comments.map((c) => (
          <div key={c.id} className="flex min-w-0 flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-x-1.5 text-[12px]">
              <span className="font-medium text-ink">{c.author === me ? "You" : "Teammate"}</span>
              <span className="text-faint">{timeAgo(c.created_at)}</span>
              {c.author === me || owner ? (
                <button type="button" onClick={() => onDelete(c)} className="ml-auto text-muted hover:text-rose">
                  Delete
                </button>
              ) : null}
            </div>
            <p className="text-[13px] break-words whitespace-pre-line text-ink">{c.body}</p>
          </div>
        ))}
      </div>
      <CommentBox placeholder="Reply" submit="Reply" onSubmit={onReply} />
      <div className="flex justify-start">
        <Button size="sm" variant="ghost" onClick={() => onResolve(!resolved)}>
          {resolved ? "Reopen" : "Resolve"}
        </Button>
      </div>
    </div>
  );
}
