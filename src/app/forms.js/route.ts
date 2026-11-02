import { appBase } from "@/lib/billing";

// The embed script: <script src="https://app.tryclaritia.com/forms.js" async></script> plus
// <div data-claritia-form="<slug>"></div> anywhere on a page. Each div gets an iframe of the live form that grows
// to fit. data-field-<key>="value" fills a hidden field, and the page's utm_* tags ride along. After a submit the
// div fires a "claritia:submitted" event, and when claritia.js is on the page the email ties the visit to the person.

const SCRIPT = (base: string) => `(function () {
  var base = ${JSON.stringify(base)};
  try { var cs = document.currentScript && document.currentScript.src; if (cs) base = new URL(cs).origin; } catch (e) {}
  var KEEP = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid", "li_fat_id"];
  var frames = [];
  function mount(el) {
    if (el.getAttribute("data-claritia-mounted")) return;
    var slug = el.getAttribute("data-claritia-form") || "";
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return;
    el.setAttribute("data-claritia-mounted", "1");
    var here = new URLSearchParams(location.search);
    var p = new URLSearchParams();
    p.set("embed", "1");
    KEEP.forEach(function (k) { if (here.get(k)) p.set(k, here.get(k)); });
    for (var i = 0; i < el.attributes.length; i++) {
      var a = el.attributes[i];
      if (a.name.indexOf("data-field-") === 0) p.set(a.name.slice(11).replace(/-/g, "_"), a.value);
    }
    p.set("page", location.href.slice(0, 500));
    if (document.referrer) p.set("ref", document.referrer.slice(0, 500));
    var f = document.createElement("iframe");
    f.src = base + "/f/" + slug + "?" + p.toString();
    f.title = el.getAttribute("data-title") || "Form";
    f.setAttribute("loading", "lazy");
    f.style.cssText = "display:block;width:100%;height:520px;border:0;background:transparent;color-scheme:light";
    el.appendChild(f);
    frames.push({ el: el, f: f, slug: slug });
  }
  function scan() { var list = document.querySelectorAll("[data-claritia-form]"); for (var i = 0; i < list.length; i++) mount(list[i]); }
  window.addEventListener("message", function (e) {
    if (e.origin !== base || !e.data || typeof e.data.type !== "string") return;
    var hit = null;
    for (var i = 0; i < frames.length; i++) if (frames[i].f.contentWindow === e.source) hit = frames[i];
    if (!hit) return;
    var d = e.data;
    if (d.type === "claritia:form:height" && typeof d.height === "number") hit.f.style.height = Math.max(120, Math.min(d.height, 20000)) + "px";
    if (d.type === "claritia:form:submitted") {
      if (typeof d.email === "string" && d.email && typeof window.claritia === "function") window.claritia("form", d.email);
      try { hit.el.dispatchEvent(new CustomEvent("claritia:submitted", { bubbles: true, detail: { form: hit.slug } })); } catch (x) {}
    }
    if (d.type === "claritia:form:redirect" && typeof d.url === "string" && /^https:\\/\\//.test(d.url)) location.assign(d.url);
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scan); else scan();
  if (window.MutationObserver) new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
})();
`;

export function GET() {
  return new Response(SCRIPT(appBase()), {
    headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*" },
  });
}
