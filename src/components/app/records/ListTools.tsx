"use client";

// Two of a record list's tools: saving the current view, and editing one field on many records at once.

import { useState } from "react";
import { type AnyField } from "@/lib/records/fields";
import { Select } from "../Select";
import { Button, Input, Segmented, type ViewProps } from "../ui";
import { FieldEditor } from "./FieldInput";

export function SaveView({ onDone }: { onDone: (name: string | null, personal: boolean) => void }) {
  const [name, setName] = useState("");
  const [who, setWho] = useState<"team" | "me">("team");
  return (
    <form
      className="flex flex-col gap-3 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onDone(name.trim(), who === "me");
      }}
    >
      <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="View name" maxLength={80} className="h-8" />
      <Segmented<"team" | "me">
        value={who}
        onChange={setWho}
        label="Who sees it"
        options={[
          { value: "team", label: "Everyone" },
          { value: "me", label: "Only me" },
        ]}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="plain" className="h-7 px-2.5" onClick={() => onDone(null, false)}>
          Cancel
        </Button>
        <Button type="submit" className="h-7 px-2.5" disabled={!name.trim()}>
          Save
        </Button>
      </div>
    </form>
  );
}

export function BulkEdit({ sb, wsId, fields, onDone }: { sb: ViewProps["sb"]; wsId: string; fields: AnyField[]; onDone: (f: AnyField | null, v: unknown) => void }) {
  const [key, setKey] = useState<string>("");
  const field = fields.find((f) => f.key === key);
  return (
    <div className="flex flex-col gap-3 p-3">
      <Select<string>
        value={key}
        onChange={setKey}
        ariaLabel="Field"
        placeholder="Field"
        options={fields.map((f) => ({ value: f.key, label: f.label }))} className="w-full"
      />
      {field ? <FieldEditor key={field.key} sb={sb} wsId={wsId} field={field} value={null} onSave={(v) => onDone(field, v)} onCancel={() => onDone(null, null)} /> : null}
    </div>
  );
}
