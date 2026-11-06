// Claritia for Webflow, a Designer Extension (docs/integrations-plan.md, Next step 7). Paste a form's link, pick how
// it shows, and Add places the form after the element picked in the Designer: the form script and the
// <claritia-form> element, the same code as the form's Share tab. Copy code gives that code for a Code Embed or the
// site's footer code, when the Designer can't place it (check against the Designer API before listing).

import { embedCode, embedParts } from "./embed.js";

const $ = (id) => document.getElementById(id);
const say = (text, bad = false) => {
  $("note").textContent = text;
  $("note").className = bad ? "note bad" : "note";
};

function refresh() {
  const mode = $("mode").value;
  $("text-row").hidden = !(mode === "popup" || mode === "slider" || mode === "sidetab");
  const code = embedCode($("form").value, mode, $("text").value);
  $("code").textContent = code;
  $("add").disabled = $("copy").disabled = !code;
  say(code ? "" : $("form").value.trim() ? "That link has no form in it. Copy it from the form's Share tab." : "", !!$("form").value.trim() && !code);
}

async function add() {
  const p = embedParts($("form").value, $("mode").value, $("text").value);
  if (!p) return;
  try {
    const at = await webflow.getSelectedElement();
    if (!at) return say("Pick where the form goes on the page first.", true);
    const script = await at.after(webflow.elementPresets.DOM);
    await script.setTag("script");
    await script.setAttribute("src", "https://app.tryclaritia.com/forms/v1.js");
    await script.setAttribute("async", "");
    const form = await script.after(webflow.elementPresets.DOM);
    await form.setTag("claritia-form");
    for (const [k, v] of p.attrs) await form.setAttribute(k, v ?? "");
    if (p.button) {
      const button = await form.after(webflow.elementPresets.DOM);
      await button.setTag("button");
      await button.setAttribute("data-claritia-open", p.id);
      await button.setTextContent(p.button);
    }
    say("Added. Publish the site to see the form.");
  } catch (e) {
    say("Webflow didn't place it. Copy the code into a Code Embed instead.", true);
  }
}

async function copy() {
  try {
    await navigator.clipboard.writeText($("code").textContent);
    say("Copied. Paste it into a Code Embed, or the site's footer code for a popup.");
  } catch {
    say("Select the code and copy it.", true);
  }
}

for (const id of ["form", "mode", "text"]) $(id).addEventListener("input", refresh);
$("add").addEventListener("click", () => void add());
$("copy").addEventListener("click", () => void copy());
refresh();
