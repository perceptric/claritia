"use client";

// Settings > Objects: the workspace's custom objects, made and renamed here.

import { useState } from "react";
import { askConfirm, askText } from "../Dialogs";
import { announceChange, attempt, Button, CardHead, ErrorNote, Field, Input, Loading, must, Panel, type ViewProps } from "../ui";
import { useObjects } from "./FieldsSettings";

export function ObjectsSettings({ sb, ws, role, navigate }: Pick<ViewProps, "sb" | "ws" | "role" | "navigate">) {
  const objects = useObjects(sb, ws.id);
  const [label, setLabel] = useState("");
  const [plural, setPlural] = useState("");
  const [error, setError] = useState("");
  const run = (fn: () => Promise<unknown>) =>
    attempt(fn, {
      setError,
      after: () => {
        objects.reload();
        announceChange();
      },
    });
  return (
    <div className="flex flex-col gap-5">
      <ErrorNote message={error} />
      <Panel>
        <form
          className="flex flex-wrap items-end gap-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!label.trim()) return;
            void run(async () => {
              must(await sb.rpc("object_save", { p_ws: ws.id, p_key: "", p_label: label.trim(), p_plural: plural.trim() || `${label.trim()}s`, p_icon: "box" }));
              setLabel("");
              setPlural("");
            });
          }}
        >
          <Field label="Name">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Subscription" maxLength={60} className="w-56" />
          </Field>
          <Field label="Plural">
            <Input value={plural} onChange={(e) => setPlural(e.target.value)} placeholder="Subscriptions" maxLength={60} className="w-56" />
          </Field>
          <Button type="submit" disabled={!label.trim()}>
            Add object
          </Button>
        </form>
      </Panel>
      <Panel>
        <CardHead label="Objects" count={objects.data?.length} />
        {!objects.data ? (
          <Loading />
        ) : !objects.data.length ? (
          <p className="px-4 py-3 text-[13px] text-faint">—</p>
        ) : (
          <ul className="divide-y divide-line">
            {objects.data.map((o) => (
              <li key={o.key} className="flex items-center gap-2 px-4 py-2.5 text-[13px]">
                <span className="font-medium">{o.plural}</span>
                <span className="font-mono text-[11px] text-faint">{o.key}</span>
                <span className="ml-auto flex gap-1">
                  <Button variant="ghost" className="h-7 px-2.5" onClick={() => navigate("objects", o.key)}>
                    Open
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-7 px-2.5"
                    onClick={async () => {
                      const name = await askText("Rename object", { initial: o.label, ok: "Save" });
                      if (!name) return;
                      void run(async () => must(await sb.rpc("object_save", { p_ws: ws.id, p_key: o.key, p_label: name, p_plural: o.plural, p_icon: o.icon })));
                    }}
                  >
                    Rename
                  </Button>
                  {role === "owner" ? (
                    <Button
                      variant="danger"
                      className="h-7 px-2.5"
                      onClick={async () => {
                        if (!(await askConfirm(`Delete ${o.plural}?`, { body: "Every record, field and link of this object goes.", ok: "Delete", danger: true }))) return;
                        void run(async () => must(await sb.rpc("object_delete", { p_ws: ws.id, p_key: o.key })));
                      }}
                    >
                      Delete
                    </Button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
