// The builder canvas alone, for scripts/canvas-check.ts: a two-step form with a hidden field, a choice and an empty
// step, drawn with a design system that styles labels and the button's hover. What the canvas reports goes to
// window.log; window.setState sets the state the style panel would edit.

import { DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { FormCanvas, type Editing, type Picked } from "../../src/components/app/forms/FormCanvas";
import { formCss } from "../../src/lib/design/form";
import type { State } from "../../src/lib/design/model";
import { cleanTokens } from "../../src/lib/forms/brand";
import { checkForm, emptyForm } from "../../src/lib/forms/schema";

const r = checkForm({
  ...emptyForm(),
  title: "Talk to sales",
  intro: "We reply fast.",
  steps: [
    {
      id: "s1",
      fields: [
        { id: "a", key: "email", type: "email", label: "Work email", required: true, width: "half" },
        { id: "b", key: "q.name", type: "text", label: "Name", required: false, width: "half" },
        { id: "h", key: "q.utm", type: "hidden", label: "Source", required: false, hidden: { from: "param", name: "utm_source" } },
        { id: "c", key: "q.size", type: "choice", label: "Team size", required: false, options: [{ value: "1", label: "Just me" }, { value: "2", label: "2 to 10" }] },
      ],
    },
  ],
});
if ("errors" in r) throw new Error(r.errors.join(" "));
// A step with no fields can't be saved, but the builder shows one right after "Add step".
const form = { ...r.form, steps: [...r.form.steps, { id: "s2", fields: [] }] };
const t = cleanTokens({}).tokens;
const system = { globals: { label: { base: { color: "#aa0000", "font-size": "18px" } }, button: { "base:hover": { "background-color": "#00aa55" } } } };
const w = window as unknown as { log: unknown[]; setState: (s: State | undefined) => void; Z?: number };
w.log = [];

function App() {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const [selected, setSelected] = useState<string[]>([]);
  const [part, setPart] = useState<Picked>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [state, setState] = useState<State | undefined>(undefined);
  useEffect(() => {
    w.setState = setState;
  }, []);
  return (
    <DndContext sensors={sensors}>
      <div style={{ height: 1400, display: "grid" }}>
        <FormCanvas
          form={form}
          t={t}
          device="desktop"
          zoom={w.Z ?? 100}
          css={formCss(form, t, system, { device: "base", preview: true })}
          selected={selected}
          hovered={null}
          dragging={null}
          editing={editing}
          part={part}
          state={state}
          onPick={(id, p) => {
            w.log.push([id, p]);
            setSelected(id === "form" ? [] : [id]);
            setPart({ id, part: p });
          }}
          onClear={() => {
            setSelected([]);
            setPart(null);
          }}
          onHover={() => {}}
          onEdit={setEditing}
          onCommit={(e, v) => {
            w.log.push(["commit", e, v]);
            setEditing(null);
          }}
          onNudge={() => {}}
          onDuplicate={() => {}}
          onRemove={() => {}}
          apply={() => {}}
        />
      </div>
    </DndContext>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
