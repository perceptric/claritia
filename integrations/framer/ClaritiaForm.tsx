// Claritia for Framer, a code component (docs/integrations-plan.md, Next step 7). Paste it into a Framer project's
// code files (with embed.ts beside it), or install it from the Framer Marketplace once listed. Its controls: the
// form's link, how it shows, and the button or tab text. It loads the form script once and draws the same
// <claritia-form> element as the form's Share tab.

import { addPropertyControls, ControlType } from "framer";
import { createElement, useEffect } from "react";
import { framerParts, MODES, SCRIPT } from "./embed";

type Props = { form: string; mode: (typeof MODES)[number]; text: string; style?: React.CSSProperties };

function useScript() {
  useEffect(() => {
    if (typeof document === "undefined" || document.querySelector(`script[src="${SCRIPT}"]`)) return;
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    document.head.appendChild(s);
  }, []);
}

/**
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight auto
 */
export default function ClaritiaForm({ form, mode, text, style }: Props) {
  useScript();
  const p = framerParts(form, mode, text);
  if (!p) return <div style={{ ...style, padding: 16, borderRadius: 10, background: "#f6f6f6", color: "#6b6b6b", font: "13px/1.4 Inter, sans-serif" }}>Paste the form&apos;s link from its Share tab.</div>;
  return (
    <div style={{ ...style, width: "100%" }}>
      {createElement("claritia-form", p.attrs)}
      {p.button ? (
        <button data-claritia-open={p.id} style={{ height: 40, padding: "0 18px", borderRadius: 999, border: 0, background: "#333", color: "#fff", font: "500 14px Inter, sans-serif", cursor: "pointer" }}>
          {p.button}
        </button>
      ) : null}
    </div>
  );
}

ClaritiaForm.defaultProps = { form: "", mode: "inline", text: "" };

addPropertyControls(ClaritiaForm, {
  form: { type: ControlType.String, title: "Form link", placeholder: "https://app.tryclaritia.com/f/…" },
  mode: {
    type: ControlType.Enum,
    title: "Show it",
    options: [...MODES],
    optionTitles: ["In the page", "Full page", "Popup", "Slider", "Popover", "Side tab"],
  },
  text: { type: ControlType.String, title: "Button text", placeholder: "Open the form", hidden: (p: Props) => !(p.mode === "popup" || p.mode === "slider" || p.mode === "sidetab") },
});
