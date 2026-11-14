"use client";

// Import people to a list (docs/email-studio-plan.md, the Brew comparison, step 2): a CSV file dropped or picked, its
// columns matched to fields by their headers (each match can be changed), or people pasted one a line. With whether
// they agreed to get email. The server cleans the addresses, leaves out repeats and throwaway addresses, and keeps
// the import in the history (/api/emails/import).

import type { Session } from "@supabase/supabase-js";
import { useRef, useState } from "react";
import { FIELD_LABEL, guessFields, MAX_ROWS, parseCsv, peopleFrom, type Csv, type Field } from "@/lib/emails/csv";
import { Upload } from "../../Icons";
import { tell } from "../Dialogs";
import { Select } from "../Select";
import { Sheet } from "../Sheet";
import { Button, Checkbox, ErrorNote, errorText, postJson } from "../ui";

type Result = { added: number; held: number; skipped: number; disposable: number; shared: number };
const n = (x: number) => x.toLocaleString("en-US");
const FIELDS = (Object.keys(FIELD_LABEL) as Field[]).map((f) => ({ value: f, label: FIELD_LABEL[f] }));

export function ImportSheet({ session, ws, list, onClose, onDone }: { session: Session; ws: string; list: { id: string; name: string }; onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<"file" | "paste">("file");
  const [file, setFile] = useState<{ name: string; csv: Csv; fields: Field[] } | null>(null);
  const [text, setText] = useState("");
  const [consent, setConsent] = useState(false);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const read = (f: File | undefined) => {
    if (!f) return;
    setError("");
    if (f.size > 20_000_000) return setError("That file is over 20 MB. Split it and import each part.");
    const r = new FileReader();
    r.onload = () => {
      const csv = parseCsv(String(r.result ?? ""));
      if (!csv.head.length || !csv.rows.length) return setError("That file has no rows under its header.");
      setFile({ name: f.name.slice(0, 200), csv, fields: guessFields(csv.head) });
    };
    r.onerror = () => setError("That file couldn't be read.");
    r.readAsText(f);
  };
  const setField = (i: number, f: Field) =>
    setFile((x) => {
      if (!x) return x;
      // One column per field: picking a field another column has moves that one to Custom field.
      const fields = x.fields.map((g, j) => (j === i ? f : f !== "custom" && f !== "skip" && g === f ? "custom" : g));
      return { ...x, fields };
    });
  const noEmail = !!file && !file.fields.includes("email");
  const tooMany = !!file && file.csv.rows.length > MAX_ROWS;
  const ready = mode === "file" ? !!file && !noEmail && !tooMany : !!text.trim();

  const go = async () => {
    setBusy(true);
    setError("");
    try {
      const body = mode === "file" && file ? { rows: peopleFrom(file.csv, file.fields), fileName: file.name } : { text };
      const r = await postJson<Result>(session, "/api/emails/import", { workspaceId: ws, listId: list.id, consent, ...body });
      const notes = [
        r.held ? `${n(r.held)} ${r.held === 1 ? "person waits" : "people wait"} for an owner to add them, since they didn't agree to get email.` : "",
        r.skipped ? `${n(r.skipped)} ${r.skipped === 1 ? "row wasn't an email or was a repeat" : "rows weren't emails or were repeats"}.` : "",
        r.disposable ? `${n(r.disposable)} throwaway ${r.disposable === 1 ? "address was" : "addresses were"} left out.` : "",
        r.shared ? `${n(r.shared)} ${r.shared === 1 ? "is a shared inbox" : "are shared inboxes"}, like info@.` : "",
      ].filter(Boolean);
      if (notes.length) await tell(r.held ? "Waiting for an owner" : `Added ${n(r.added)}`, notes.join(" "));
      onDone();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  return (
    <Sheet
      title={`Import to ${list.name}`}
      onClose={onClose}
      wide={!!file}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="plain" onClick={() => (setMode(mode === "file" ? "paste" : "file"), setError(""))}>
            {mode === "file" ? "Paste instead" : "Use a CSV file"}
          </Button>
          <span className="flex-1" />
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void go()} disabled={busy || !ready}>
            {busy ? "Importing…" : file && mode === "file" ? `Import ${n(file.csv.rows.length)}` : "Import"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 p-5">
        {mode === "paste" ? (
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={"ana@example.com, Ana, Diaz\nben@example.com, Ben"} aria-label="People, one a line" rows={12} className="w-full rounded-lg bg-card p-3 font-mono text-[12.5px] text-ink shadow-input outline-none" />
        ) : !file ? (
          <>
            <button
              type="button"
              onClick={() => input.current?.click()}
              onDragOver={(e) => (e.preventDefault(), setOver(true))}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(false);
                read(e.dataTransfer.files[0]);
              }}
              className={`flex flex-col items-center gap-2 rounded-xl px-4 py-10 text-center transition-[background,box-shadow] duration-[140ms] ${over ? "bg-signal-pale shadow-[inset_0_0_0_1.5px_var(--color-signal)]" : "bg-paper shadow-[inset_0_0_0_1.5px_var(--color-line)] hover:bg-hover"}`}
            >
              <Upload size={20} className="text-muted" />
              <span className="font-medium text-ink">Drop a CSV file here</span>
              <span className="text-[12.5px] text-muted">or click to pick one</span>
            </button>
            <input ref={input} type="file" accept=".csv,text/csv,text/plain" hidden onChange={(e) => read(e.target.files?.[0])} />
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[10px] bg-card px-3.5 py-2.5 shadow-rest">
              <span className="min-w-0 font-medium wrap-anywhere text-ink">{file.name}</span>
              <span className="text-muted tabular-nums">{n(file.csv.rows.length)} rows</span>
              <span className="flex-1" />
              <Button size="sm" variant="plain" onClick={() => setFile(null)}>
                Pick another file
              </Button>
            </div>
            <div className="overflow-x-auto rounded-[10px] bg-card shadow-rest">
              <table className="w-full border-collapse text-[13px] [&_tbody_tr:last-child_td]:border-b-0">
                <thead>
                  <tr className="text-left text-[12px] text-muted">
                    <th className="border-b border-line px-3.5 py-2 font-medium">Column in the file</th>
                    <th className="border-b border-line px-3.5 py-2 font-medium">Example</th>
                    <th className="border-b border-line px-3.5 py-2 font-medium">Goes to</th>
                  </tr>
                </thead>
                <tbody>
                  {file.csv.head.map((h, i) => (
                    <tr key={`${i}${h}`}>
                      <td className="border-b border-line px-3.5 py-2 align-middle font-medium break-words text-ink">{h}</td>
                      <td className="max-w-[220px] border-b border-line px-3.5 py-2 align-middle text-[12.5px] wrap-anywhere text-muted">{file.csv.rows.find((r) => r[i])?.[i] ?? ""}</td>
                      <td className="border-b border-line px-3.5 py-2 align-middle">
                        <Select<Field> ariaLabel={`Field for ${h}`} value={file.fields[i] ?? "skip"} onChange={(f) => setField(i, f)} options={FIELDS} menuWidth={180} className="h-8 w-full min-w-[150px] rounded-md bg-card px-2.5 text-[13px] text-ink shadow-input" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <Checkbox on={consent} onChange={setConsent}>
          They agreed to get email from us
        </Checkbox>
        <ErrorNote message={error || (mode === "file" && noEmail ? "Pick which column holds the email." : mode === "file" && tooMany ? `This file has ${n(file!.csv.rows.length)} rows. Import up to 5,000 at a time.` : "")} />
      </div>
    </Sheet>
  );
}
