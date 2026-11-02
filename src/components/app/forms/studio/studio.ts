/* eslint-disable */
// @ts-nocheck
// Form Studio (docs/forms-chat-plan.md): the chat on the left, the live form on the right, drawn in a shadow root so
// the brand's CSS and the form's own CSS never touch the app. The form is three texts: its HTML, its own CSS and the
// brand's CSS. Claude (Opus, on the server: /api/studio) writes them; Edit and Code change them by hand. Plain DOM,
// so every keystroke of a streamed answer paints without React in the way. `mountStudio` returns the cleanup.

export const STUDIO_CSS = ":host {\n  --bg: var(--color-card);\n  --paper: var(--color-paper);\n  --paper-deep: var(--color-paper-deep);\n  --ink: var(--color-ink);\n  --body: var(--color-body);\n  --muted: var(--color-muted);\n  --faint: var(--color-faint);\n  --line: var(--color-line);\n  --line-strong: var(--color-line-strong);\n  --pick: var(--color-sky);\n  --rose: var(--color-rose);\n  --lilac: var(--color-lilac);\n  --scrim: var(--color-scrim);\n  --sans: var(--font-sans);\n  --mono: var(--font-mono);\n  display: block; height: 100%; min-height: 0;\n  background: var(--bg); color: var(--ink); font-family: var(--sans); font-size: 13px;\n}\n* { box-sizing: border-box; }\nbutton { font: inherit; color: inherit; cursor: pointer; }\n[hidden] { display: none !important; }\nbutton:disabled { cursor: default; opacity: .4; }\n:focus-visible { outline: 2px solid var(--pick); outline-offset: 2px; }\n\n.app { height: 100%; min-height: 0; flex: 1; display: grid; grid-template-columns: minmax(300px, 380px) minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); }\n.app.editing { grid-template-columns: minmax(280px, 340px) minmax(0, 1fr) 300px; }\n.col { min-height: 0; display: flex; flex-direction: column; }\n.chat { border-right: 1px solid var(--line); }\n.bar { height: 48px; flex: none; display: flex; align-items: center; gap: 8px; padding-inline: 16px; border-bottom: 1px solid var(--line); }\n.eyebrow { font-family: var(--mono); font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }\n.spacer { flex: 1; }\n.pill { height: 28px; padding-inline: 12px; border-radius: 999px; border: 1px solid var(--line); background: var(--bg); color: var(--body); font-size: 12.5px; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }\n.pill:hover:not(:disabled) { border-color: var(--line-strong); color: var(--ink); }\n.pill.on { background: var(--ink); color: var(--bg); border-color: var(--ink); }\n.pill.primary { background: var(--ink); color: var(--bg); border-color: var(--ink); font-weight: 500; }\n.ib { width: 28px; height: 28px; border-radius: 999px; border: 0; background: transparent; color: var(--muted); display: inline-flex; align-items: center; justify-content: center; }\n.ib:hover:not(:disabled) { background: var(--paper-deep); color: var(--ink); }\n.seg { display: inline-flex; padding: 2px; border-radius: 999px; background: var(--paper-deep); }\n.seg button { height: 24px; padding-inline: 10px; border-radius: 999px; border: 0; background: transparent; color: var(--muted); font-size: 12px; }\n.seg button[aria-pressed=\"true\"] { background: var(--ink); color: var(--bg); }\n\n/* The chat */\n.msgs { flex: 1; min-height: 0; overflow-y: auto; padding: 18px 16px; display: flex; flex-direction: column; gap: 14px; }\n.msg { display: flex; flex-direction: column; gap: 6px; max-width: 100%; }\n.msg.me { align-items: flex-end; }\n.msg.me .text { background: var(--paper-deep); color: var(--ink); padding: 8px 12px; border-radius: 14px; max-width: 88%; white-space: pre-wrap; overflow-wrap: anywhere; }\n.msg.ai .who { display: flex; align-items: center; gap: 6px; font-weight: 600; font-size: 12px; }\n.msg.ai .text { color: var(--body); line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }\n.spark { width: 14px; height: 14px; color: var(--lilac); flex: none; }\n.working .spark { animation: shimmer 1.6s ease-in-out infinite; }\n.status { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; }\n.ask { border: 1px solid var(--line); border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 10px; }\n.ask b { font-weight: 600; color: var(--ink); }\n.chips { display: flex; flex-wrap: wrap; gap: 6px; }\n.err { color: var(--rose); font-size: 12.5px; }\n.starts { display: flex; flex-direction: column; gap: 6px; }\n.starts button { text-align: left; border: 1px solid var(--line); background: var(--bg); border-radius: 10px; padding: 10px 12px; color: var(--body); }\n.starts button:hover { border-color: var(--line-strong); color: var(--ink); }\n.compose { flex: none; padding: 12px 16px 16px; border-top: 1px solid var(--line); display: flex; flex-direction: column; gap: 8px; }\n.box { display: flex; align-items: flex-end; gap: 8px; border: 1px solid var(--line-strong); border-radius: 18px; padding: 6px 6px 6px 14px; background: var(--bg); }\n.box:focus-within { border-color: var(--ink); }\n.box textarea { flex: 1; min-width: 0; border: 0; outline: 0; resize: none; background: transparent; color: var(--ink); font: inherit; font-size: 13.5px; line-height: 1.45; max-height: 160px; padding-block: 6px; }\n.send { width: 32px; height: 32px; border-radius: 999px; border: 0; background: var(--ink); color: var(--bg); display: inline-flex; align-items: center; justify-content: center; flex: none; }\n.hint { color: var(--faint); font-size: 11.5px; }\n.brandbar { position: relative; flex: none; padding: 12px 16px; border-bottom: 1px solid var(--line); }\n.brandbtn { width: 100%; height: 48px; display: flex; align-items: center; gap: 10px; padding-inline: 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--bg); text-align: left; }\n.brandbtn:hover { border-color: var(--line-strong); }\n.brandbtn .nm { flex: 1; min-width: 0; font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n.brandbtn .st { font-size: 12px; color: var(--muted); font-weight: 400; }\n.mark { height: 22px; max-width: 88px; object-fit: contain; flex: none; }\n.mark-empty { width: 22px; height: 22px; border-radius: 999px; border: 1px dashed var(--line-strong); color: var(--muted); display: inline-flex; align-items: center; justify-content: center; flex: none; font-size: 11px; font-weight: 600; }\n.menu { position: absolute; left: 16px; right: 16px; top: 64px; z-index: 30; background: var(--bg); border: 1px solid var(--line); border-radius: 10px; padding: 4px; box-shadow: 0 0 0 1px rgb(0 0 0 / .03), 0 12px 32px -12px rgb(0 0 0 / .3); display: flex; flex-direction: column; max-height: 360px; overflow-y: auto; }\n.mrow { display: flex; align-items: center; gap: 4px; }\n.mrow > button:first-child { flex: 1; min-width: 0; height: 40px; display: flex; align-items: center; gap: 10px; padding-inline: 10px; border: 0; border-radius: 6px; background: transparent; text-align: left; font-size: 13px; }\n.mrow > button:first-child:hover { background: var(--paper-deep); }\n.mrow .site { color: var(--muted); font-size: 12px; margin-left: auto; }\n.msep { height: 1px; background: var(--line); margin: 4px 2px; }\n.mdel { display: flex; align-items: center; gap: 6px; padding: 6px 10px; font-size: 12.5px; }\n.dlg { position: fixed; inset: 0; z-index: 50; background: var(--scrim); display: flex; align-items: center; justify-content: center; padding: 16px; }\n.dlgbox { width: min(480px, 100%); max-height: calc(100% - 32px); overflow-y: auto; background: var(--bg); border-radius: 16px; padding: 20px; display: flex; flex-direction: column; gap: 14px; box-shadow: 0 24px 64px -24px rgb(0 0 0 / .5); }\n.dlgbox h2 { margin: 0; font-size: 18px; font-weight: 600; letter-spacing: -.01em; }\n.dlgbox .lab2 { font-size: 12px; color: var(--muted); }\n.dlgbox .in { height: 36px; font-size: 13.5px; }\n.dlgbox textarea.in { height: 140px; font-family: var(--mono); font-size: 11.5px; }\n.confirm { display: flex; align-items: center; gap: 14px; border: 1px solid var(--line); border-radius: 10px; padding: 16px; }\n.confirm img { height: 36px; max-width: 140px; object-fit: contain; }\n.confirm b { display: block; font-size: 16px; }\n.confirm span { color: var(--muted); }\n.after { flex: 1; min-height: 0; overflow: auto; padding: 20px; display: flex; justify-content: center; }\n.after .inner { width: min(600px, 100%); display: flex; flex-direction: column; gap: 14px; }\n.card2 { border: 1px solid var(--line); border-radius: 10px; background: var(--bg); padding: 16px; display: flex; flex-direction: column; gap: 12px; }\n.card2 h3 { margin: 0; font-size: 14px; font-weight: 600; }\n.rule { display: flex; flex-direction: column; gap: 8px; border-top: 1px solid var(--line); padding-top: 12px; }\n.rule .lab { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }\n\n/* The stage */\n.stage { background: var(--paper); }\n.tabs { display: flex; gap: 2px; }\n.tabs button { height: 48px; padding-inline: 12px; border: 0; background: transparent; color: var(--muted); border-bottom: 2px solid transparent; font-size: 13px; }\n.tabs button[aria-selected=\"true\"] { color: var(--ink); border-bottom-color: var(--ink); }\n.canvas { flex: 1; min-height: 0; overflow: auto; display: flex; justify-content: center; padding: 20px; }\n.frame { display: flex; flex-direction: column; width: 100%; max-width: 1100px; min-height: 100%; background: var(--color-card); border-radius: 12px; box-shadow: 0 0 0 1px rgb(0 0 0 / .06), 0 8px 28px -12px rgb(0 0 0 / .18); overflow: hidden; transition: max-width var(--duration-slow, 320ms) var(--ease-out); position: relative; }\n.frame.phone { max-width: 390px; }\n#host { display: flex; flex-direction: column; flex: 1; }\n.empty { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; color: var(--muted); background: var(--bg); text-align: center; padding: 24px; }\n.sk { width: min(380px, 100%); border: 1px solid var(--line); border-radius: 10px; padding: 22px; display: flex; flex-direction: column; gap: 12px; background: var(--bg); }\n.sk span { display: block; height: 10px; border-radius: 4px; background: var(--paper-deep); }\n.sk .box2 { height: 32px; border: 1px solid var(--line); background: var(--paper); }\n.sk .btn2 { height: 32px; width: 40%; border-radius: 999px; background: var(--ink); opacity: .85; }\n.live .sk span, .live .sk .btn2 { animation: shimmer 1.6s ease-in-out infinite; }\n@keyframes shimmer { 50% { opacity: .45; } }\n.code { flex: 1; min-height: 0; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; gap: 10px; padding: 16px; }\n.code textarea { width: 100%; height: 100%; resize: none; border: 1px solid var(--line-strong); border-radius: 8px; padding: 12px; background: var(--bg); color: var(--ink); font-family: var(--mono); font-size: 12px; line-height: 1.55; tab-size: 2; }\n\n/* The editor's panel */\n.panel { border-left: 1px solid var(--line); background: var(--bg); }\n.pscroll { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; }\n.sec { border-bottom: 1px solid var(--line); padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }\n.sec h3 { margin: 0; font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); }\n.tree { display: flex; flex-direction: column; font-size: 12px; max-height: 260px; overflow-y: auto; }\n.tree button { flex: none; border: 0; background: transparent; text-align: left; padding: 3px 6px; border-radius: 4px; color: var(--body); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n.tree button:hover { background: var(--paper-deep); }\n.tree button.sel { background: var(--ink); color: var(--bg); }\n.tree .tag { font-family: var(--mono); font-size: 11px; opacity: .7; }\n.row { display: grid; grid-template-columns: 92px minmax(0, 1fr); align-items: center; gap: 8px; }\n.row label { color: var(--muted); font-size: 12px; }\n.in { height: 28px; width: 100%; min-width: 0; border: 1px solid var(--line-strong); border-radius: 6px; padding-inline: 8px; background: var(--bg); color: var(--ink); font: inherit; font-size: 12.5px; }\n.in:focus { border-color: var(--ink); outline: 0; }\ntextarea.in { height: 72px; padding-block: 6px; resize: vertical; }\n.cls { display: flex; flex-wrap: wrap; gap: 4px; }\n.cls span { font-family: var(--mono); font-size: 11px; padding: 2px 8px; border-radius: 999px; background: var(--paper-deep); color: var(--ink); }\n.actions { display: flex; flex-wrap: wrap; gap: 6px; }\n.note { color: var(--muted); font-size: 12px; line-height: 1.5; }\n\n@media (max-width: 900px) {\n  .app, .app.editing { grid-template-columns: 1fr; grid-template-rows: auto auto auto; height: auto; }\n  .chat { border-right: 0; border-bottom: 1px solid var(--line); }\n  .msgs { max-height: 55vh; }\n  .canvas { min-height: 70vh; padding: 12px; }\n  .panel { border-left: 0; border-top: 1px solid var(--line); }\n  .bar { padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }\n}\n@media (prefers-reduced-motion: reduce) { .working .spark, .live .sk span, .live .sk .btn2 { animation: none; } .frame { transition: none; } }\n\n.bstatus { display: flex; align-items: center; gap: 8px; margin-top: 8px; font-size: 12px; color: var(--muted); }\n.bstatus.err { color: var(--rose); }\n.bstatus .pill { margin-left: auto; }\n.siteform { display: flex; gap: 8px; }\n.siteform .in { flex: 1; }\n.siteform .pill { height: 36px; }\n.nameedit { font-size: 16px !important; font-weight: 600; margin-bottom: 4px; }\n.confirm .nameedit + span { display: block; font-size: 12.5px; }\n.back { color: var(--muted); }\n.box textarea:disabled { cursor: default; }\n";

export const STUDIO_HTML = "<div class=\"dlg\" id=\"brandDlg\" role=\"dialog\" aria-modal=\"true\" aria-label=\"Add a brand\" hidden><div class=\"dlgbox\" id=\"dlgBody\"></div></div>\n<div class=\"app\" id=\"app\">\n  <section class=\"col chat\" aria-label=\"Chat\">\n    <div class=\"bar\">\n      <button class=\"ib back\" id=\"backBtn\" title=\"Forms\" aria-label=\"Back to Forms\"><svg width=\"15\" height=\"15\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"m15 18-6-6 6-6\"/></svg></button>\n      <span class=\"eyebrow\">Form Studio</span>\n      <span class=\"spacer\"></span>\n      <button class=\"ib\" id=\"undo\" title=\"Undo\" aria-label=\"Undo\" disabled><svg width=\"15\" height=\"15\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M9 14 4 9l5-5\"/><path d=\"M4 9h11a5 5 0 0 1 0 10h-3\"/></svg></button>\n      <button class=\"ib\" id=\"redo\" title=\"Redo\" aria-label=\"Redo\" disabled><svg width=\"15\" height=\"15\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"m15 14 5-5-5-5\"/><path d=\"M20 9H9a5 5 0 0 0 0 10h3\"/></svg></button>\n      <button class=\"pill\" id=\"reset\">Restart</button>\n    </div>\n    <div class=\"brandbar\">\n      <button class=\"brandbtn\" id=\"brandBtn\" aria-haspopup=\"menu\" aria-expanded=\"false\" aria-label=\"Brand\"></button>\n      <div class=\"menu\" id=\"brandMenu\" role=\"menu\" aria-label=\"Brands\" hidden></div>\n      <div class=\"bstatus\" id=\"brandStatus\" hidden></div>\n    </div>\n    <div class=\"msgs\" id=\"msgs\" aria-live=\"polite\"></div>\n    <div class=\"compose\">\n      <div class=\"box\">\n        <textarea id=\"input\" rows=\"1\" placeholder=\"Describe the form, or answer Claude\" aria-label=\"Message\"></textarea>\n        <button class=\"send\" id=\"send\" aria-label=\"Send\" title=\"Send\"><svg width=\"15\" height=\"15\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 19V5\"/><path d=\"m5 12 7-7 7 7\"/></svg></button>\n      </div>\n      <div class=\"hint\" id=\"hint\">Claude Opus</div>\n    </div>\n  </section>\n\n  <section class=\"col stage\" aria-label=\"Form\">\n    <div class=\"bar\" style=\"padding-block:0\">\n      <div class=\"tabs\" role=\"tablist\">\n        <button role=\"tab\" id=\"t-preview\" aria-selected=\"true\">Preview</button>\n        <button role=\"tab\" id=\"t-edit\" aria-selected=\"false\">Edit</button>\n        <button role=\"tab\" id=\"t-code\" aria-selected=\"false\">Code</button>\n        <button role=\"tab\" id=\"t-after\" aria-selected=\"false\">On submission</button>\n      </div>\n      <span class=\"spacer\"></span>\n      <div class=\"seg\" role=\"group\" aria-label=\"Device\">\n        <button id=\"d-desk\" aria-pressed=\"true\">Desktop</button>\n        <button id=\"d-phone\" aria-pressed=\"false\">Phone</button>\n      </div>\n      <button class=\"pill\" id=\"restart\" title=\"Back to the first step\">Back to step 1</button>\n    </div>\n    <div class=\"canvas\" id=\"canvas\">\n      <div class=\"frame\" id=\"frame\">\n        <div id=\"host\"></div>\n        <div class=\"empty\" id=\"empty\">\n          <div class=\"sk\" aria-hidden=\"true\"><span style=\"width:55%;height:16px\"></span><span style=\"width:80%\"></span><span style=\"width:30%\"></span><span class=\"box2\"></span><span style=\"width:30%\"></span><span class=\"box2\"></span><span class=\"btn2\"></span></div>\n          <span id=\"emptyText\">Your form shows here as Claude builds it</span>\n        </div>\n      </div>\n    </div>\n    <div class=\"code\" id=\"codeView\" hidden>\n      <div class=\"seg\" role=\"group\" aria-label=\"File\">\n        <button id=\"c-html\" aria-pressed=\"true\">HTML</button>\n        <button id=\"c-css\" aria-pressed=\"false\">Form CSS</button>\n        <button id=\"c-brand\" aria-pressed=\"false\">Brand CSS</button>\n      </div>\n      <textarea id=\"codeText\" spellcheck=\"false\" aria-label=\"Code\"></textarea>\n      <div class=\"actions\"><button class=\"pill primary\" id=\"codeApply\">Apply</button><span class=\"note\" id=\"codeNote\"></span></div>\n    </div>\n    <div class=\"after\" id=\"afterView\" hidden><div class=\"inner\" id=\"afterInner\"></div></div>\n  </section>\n\n  <aside class=\"col panel\" id=\"panel\" aria-label=\"Element\" hidden>\n    <div class=\"bar\"><span class=\"eyebrow\">Element</span><span class=\"spacer\"></span><span class=\"note\" id=\"selTag\"></span></div>\n    <div class=\"pscroll\" id=\"pscroll\"></div>\n  </aside>\n</div>";

export type StudioBrand = { id: string; name: string; site: string; logo: string | null };
export type StudioMeeting = { id: string; name: string; length: number; host: string };
export type StudioApi = {
  key: string;
  brands(): Promise<StudioBrand[]>;
  meetings(): Promise<StudioMeeting[]>;
  readSite(host: string): Promise<{ url: string; site: string; name: string; logo: string | null; logoUrl: string | null; logoSvg: string | null }>;
  scan(host: string): Promise<{ kitId: string }>;
  kit(id: string): Promise<{ name: string; logo: string | null; logoUrl: string | null; logoSvg: string | null; scanStatus: string | null } | null>;
  confirm(b: { url: string; name: string; logoUrl: string | null; logoSvg: string | null }): Promise<{ kitId: string }>;
  look(kitId: string, fresh: boolean): Promise<{ css: string; say: string }>;
  chat(turns: { role: "user" | "assistant"; content: string }[], onText: (all: string) => void, signal: AbortSignal): Promise<{ text: string; cut: boolean }>;
  deleteBrand(id: string): Promise<void>;
  openMeetings(): void;
  back(): void;
};

export function mountStudio(shell: ShadowRoot, api: StudioApi): () => void {
  // ── State ────────────────────────────────────────────────────────────────────────────────────────────────
  // The form is three texts: its HTML, its own CSS, and the brand's CSS. The editor works on a parsed copy of the
  // HTML (every element numbered with data-k) and writes back to the text on every change.
  const S = { brandId: "", logo: "", after: { kind: "thanks", url: "", meeting: "", routes: [] }, html: "", css: "", brand: "", turns: [], busy: false, mode: "preview", device: "desk", sel: null, file: "html" };
  const past = [], future = [];
  const $ = (id) => shell.getElementById(id);
  const msgsEl = $("msgs"), input = $("input"), host = $("host"), empty = $("empty");
  const root = host.attachShadow({ mode: "open" });
  let ctl = null;

  // The workspace's meeting types, read at the start.
  let MEETINGS = [];

  // ── Cleaning: nothing in a form can run code ─────────────────────────────────────────────────────────────
  const DROP = "script,iframe,frame,frameset,object,embed,link,meta,base,noscript,template,portal";
  function cleanHtml(html) {
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
    doc.body.querySelectorAll(DROP).forEach((n) => n.remove());
    doc.body.querySelectorAll("*").forEach((el) => {
      for (const a of [...el.attributes]) {
        const n = a.name.toLowerCase(), v = a.value.trim().toLowerCase();
        if (n.startsWith("on") || n === "srcdoc" || n === "formaction" || n === "action") el.removeAttribute(a.name);
        else if (["href", "src", "xlink:href", "poster"].includes(n) && (v.startsWith("javascript:") || v.startsWith("vbscript:") || (v.startsWith("data:") && !v.startsWith("data:image/")))) el.removeAttribute(a.name);
      }
      if (el.tagName === "FORM") el.setAttribute("novalidate", "");
    });
    return doc.body;
  }
  // @import url('...') or @import '...': the address may hold semicolons (Google Fonts weights), so it's read whole.
  const IMPORT = /@import\s+(?:url\(\s*(["']?)([^"')]+)\1\s*\)|(["'])([^"']+)\3)[^;\n]*;?/gi;
  function cleanCss(css) {
    const fonts = [];
    let out = css.replace(IMPORT, (_m, _q1, u1, _q2, u2) => {
      const u = (u1 || u2 || "").trim();
      if (/^https:\/\/fonts\.googleapis\.com\//.test(u)) fonts.push(u);
      return "";
    });
    // The form draws in its own shadow root, where :root and html/body match nothing: they mean the form's host.
    out = out.replace(/(^|[\s,{}])(?::root|html|body)(?=[\s,{:.\[])/g, "$1:host");
    out = out.replace(/expression\s*\(|javascript:|behavior\s*:|-moz-binding/gi, "x-blocked:").replace(/<\/?style[^>]*>/gi, "");
    return { css: out, fonts };
  }
  const loadedFonts = new Set();
  function loadFonts(list) {
    for (const u of list) {
      if (loadedFonts.has(u)) continue;
      loadedFonts.add(u);
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = u;
      document.head.append(l);
    }
  }

  // ── The source tree the editor works on ──────────────────────────────────────────────────────────────────
  let src = document.createElement("div");
  let kSeq = 0;
  function setSource(html) {
    src = cleanHtml(html);
    src.querySelectorAll("*").forEach((el) => el.setAttribute("data-k", String(++kSeq)));
  }
  function sourceHtml() {
    const c = src.cloneNode(true);
    c.querySelectorAll("[data-k]").forEach((el) => el.removeAttribute("data-k"));
    return c.innerHTML.trim();
  }
  const byK = (k) => src.querySelector(`[data-k="${k}"]`);

  // ── Drawing the form ─────────────────────────────────────────────────────────────────────────────────────
  const BASE = `:host{all:initial;display:flex;flex-direction:column;min-height:100%}.cl-root{flex:1;display:flex;flex-direction:column}.cl-root>*{flex:1 0 auto}*,*::before,*::after{box-sizing:border-box}.page{min-height:100%}[hidden]{display:none!important}
  .cl-cal{display:flex;flex-direction:column;gap:12px;margin-top:14px;text-align:left}.cl-cal h4{margin:0;font-size:1.1em}.cl-cal .cl-sub{opacity:.7;font-size:.9em;margin:0}.cl-days{display:flex;gap:6px;flex-wrap:wrap}.cl-times{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.cl-day,.cl-time{font:inherit;padding:8px 10px;border-radius:10px;border:1.5px solid rgba(127,127,127,.35);background:transparent;color:inherit;cursor:pointer;text-align:center}.cl-day[aria-pressed=true],.cl-time[aria-pressed=true]{border-color:currentColor;box-shadow:inset 0 0 0 1px currentColor}.cl-day small{display:block;opacity:.7;font-size:.8em}
  .cl-edit [data-k]{cursor:default}.cl-edit [data-k]:hover{outline:1px dashed rgba(37,99,235,.6);outline-offset:1px}.cl-edit [data-sel]{outline:2px solid #2563eb!important;outline-offset:2px}`;
  let stepAt = 0, done = false;
  function draw() {
    const has = !!src.firstElementChild;
    empty.hidden = has;
    const b = cleanCss(S.brand), f = cleanCss(S.css);
    loadFonts([...b.fonts, ...f.fonts]);
    root.innerHTML = "";
    const st = document.createElement("style");
    st.textContent = `${BASE}\n/* brand */\n${b.css}\n/* form */\n${f.css}`;
    const wrap = document.createElement("div");
    wrap.className = S.mode === "edit" ? "cl-root cl-edit" : "cl-root";
    wrap.append(...[...src.cloneNode(true).childNodes]);
    root.append(st, wrap);
    wrap.querySelectorAll("img[data-cl-logo]").forEach((img) => { if (S.logo) img.setAttribute("src", S.logo); else img.hidden = true; });
    if (S.mode === "edit" && S.sel) wrap.querySelector(`[data-k="${S.sel}"]`)?.setAttribute("data-sel", "");
    run(wrap);
  }

  // The runtime: steps, show-if, required checks, progress, thanks. The same contract Claritia's form script runs.
  function values(w) {
    const v = {};
    w.querySelectorAll("input[name],textarea[name],select[name]").forEach((el) => {
      const n = el.name;
      if (el.type === "radio") { if (el.checked) v[n] = el.value; else if (!(n in v)) v[n] = ""; }
      else if (el.type === "checkbox") { v[n] = v[n] || []; if (el.checked) v[n].push(el.value === "on" ? "yes" : el.value); }
      else v[n] = el.value.trim();
    });
    return v;
  }
  function holds(expr, v) {
    return expr.split(/\s+or\s+/i).some((part) => part.split(/\s+and\s+/i).every((c) => clause(c.trim(), v)));
  }
  function clause(c, v) {
    let m = /^([\w-]+)\s+(filled|empty)$/i.exec(c);
    if (m) { const x = v[m[1]]; const f = Array.isArray(x) ? x.length > 0 : !!x; return m[2].toLowerCase() === "filled" ? f : !f; }
    m = /^([\w-]+)\s+in\s+\((.*)\)$/i.exec(c);
    if (m) { const list = [...m[2].matchAll(/'([^']*)'|"([^"]*)"|([^,\s]+)/g)].map((y) => y[1] ?? y[2] ?? y[3]); const x = v[m[1]]; return Array.isArray(x) ? x.some((y) => list.includes(y)) : list.includes(x); }
    m = /^([\w-]+)\s*(==|!=|>=|<=|>|<)\s*(?:'([^']*)'|"([^"]*)"|(\S+))$/.exec(c);
    if (!m) return true;
    const x = v[m[1]], val = m[3] ?? m[4] ?? m[5];
    const list = Array.isArray(x) ? x : [x ?? ""];
    if (m[2] === "==") return list.includes(val);
    if (m[2] === "!=") return !list.includes(val);
    const n = Number(list[0]), t = Number(val);
    if (!Number.isFinite(n) || !Number.isFinite(t)) return false;
    return m[2] === ">" ? n > t : m[2] === "<" ? n < t : m[2] === ">=" ? n >= t : n <= t;
  }
  function run(w) {
    const steps = [...w.querySelectorAll("[data-cl-step]")];
    const thanks = w.querySelector("[data-cl-thanks]");
    const editing = S.mode === "edit";
    const apply = () => {
      const v = values(w);
      w.querySelectorAll("[data-cl-show-if]").forEach((el) => { if (!el.hasAttribute("data-cl-step")) el.hidden = !editing && !holds(el.getAttribute("data-cl-show-if"), v); });
      const shown = steps.filter((s) => !s.hasAttribute("data-cl-show-if") || holds(s.getAttribute("data-cl-show-if"), v));
      if (stepAt >= steps.length) stepAt = 0;
      // In Edit every step and the thanks show at once, so each can be picked and changed.
      steps.forEach((s, i) => (s.hidden = editing ? false : done || i !== stepAt));
      if (thanks) thanks.hidden = editing ? false : !done;
      const pos = shown.indexOf(steps[stepAt]);
      const p = steps.length ? (done ? 1 : (Math.max(0, pos) + 1) / Math.max(1, shown.length)) : done ? 1 : 0;
      w.querySelectorAll("[data-cl-progress]").forEach((el) => el.style.setProperty("--cl-progress", String(p)));
      return { v, shown };
    };
    const visibleIn = (scope) => [...scope.querySelectorAll("input[name],textarea[name],select[name]")].filter((el) => !el.closest("[hidden]"));
    const check = (scope) => {
      let ok = true;
      const seen = new Set();
      for (const el of visibleIn(scope)) {
        const err = w.querySelector(`[data-cl-error-for="${CSS.escape(el.name)}"]`);
        if (seen.has(el.name)) continue;
        seen.add(el.name);
        const group = visibleIn(scope).filter((x) => x.name === el.name);
        const req = group.some((x) => x.required);
        const filled = el.type === "radio" || el.type === "checkbox" ? group.some((x) => x.checked) : !!el.value.trim();
        let msg = "";
        if (req && !filled) msg = "Fill this in.";
        else if (el.type === "email" && el.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value)) msg = "Enter a valid email.";
        group.forEach((x) => x.setAttribute("aria-invalid", msg ? "true" : "false"));
        if (err) err.textContent = msg;
        if (msg) ok = false;
      }
      return ok;
    };
    const move = (dir) => {
      const { shown } = apply();
      let i = stepAt + dir;
      while (i >= 0 && i < steps.length && !shown.includes(steps[i])) i += dir;
      if (i >= 0 && i < steps.length) stepAt = i;
      apply();
    };
    // An answer clears its own error as soon as it changes.
    const clear = (e) => { const n = e.target?.name; if (!n) return; const er = w.querySelector(`[data-cl-error-for="${CSS.escape(n)}"]`); if (er) er.textContent = ""; w.querySelectorAll(`[name="${CSS.escape(n)}"]`).forEach((x) => x.setAttribute("aria-invalid", "false")); };
    w.addEventListener("input", (e) => { clear(e); apply(); });
    w.addEventListener("change", (e) => { clear(e); apply(); });
    w.addEventListener("click", (e) => {
      if (editing) return;
      const t = e.target.closest?.("[data-cl-next],[data-cl-back],[type=submit]");
      if (!t) return;
      e.preventDefault();
      if (t.hasAttribute("data-cl-back")) return move(-1);
      if (t.hasAttribute("data-cl-next")) { if (check(steps[stepAt] || w)) move(1); return; }
      if (check(w)) { done = true; apply(); after(w); }
    });
    w.addEventListener("submit", (e) => { e.preventDefault(); if (!editing && check(w)) { done = true; apply(); after(w); } });
    apply();
  }

  // ── After the send: a thank-you, a page, or a meeting (the form picks the meeting by its routes) ─────────────
  function meetingFor(v) {
    for (const r of S.after.routes) {
      const x = v[r.field];
      if ((Array.isArray(x) ? x : [x]).includes(r.value)) return MEETINGS.find((m) => m.id === r.meeting) || MEETINGS[0] || null;
    }
    return MEETINGS.find((m) => m.id === S.after.meeting) || MEETINGS[0] || null;
  }
  function after(w) {
    const v = values(w);
    const thanks = w.querySelector("[data-cl-thanks]");
    if (S.after.kind === "page") {
      const p = document.createElement("p");
      p.className = "cl-sub";
      p.textContent = `Now opening ${S.after.url || "your page"}`;
      (thanks || w).append(p);
      return;
    }
    if (S.after.kind !== "meeting") return;
    let spot = w.querySelector("[data-cl-book]");
    if (!spot) { spot = document.createElement("div"); (thanks || w).append(spot); }
    spot.hidden = false;
    const m = meetingFor(v);
    if (!m) { spot.innerHTML = ""; const p = document.createElement("p"); p.className = "cl-sub"; p.textContent = "No meeting types yet."; spot.append(p); return; }
    calendar(spot, m, v);
  }
  function calendar(spot, m, v) {
    spot.innerHTML = "";
    const cal = document.createElement("div");
    cal.className = "cl-cal";
    const h = document.createElement("h4");
    h.textContent = `Book your ${m.name.toLowerCase()}`;
    const sub = document.createElement("p");
    sub.className = "cl-sub";
    sub.textContent = `${m.length} min with ${m.host}`;
    const days = document.createElement("div");
    days.className = "cl-days";
    const times = document.createElement("div");
    times.className = "cl-times";
    const go = document.createElement("button");
    go.type = "button";
    go.className = "btn cl-confirm";
    go.textContent = "Confirm";
    go.disabled = true;
    let day = null, time = null;
    const list = [];
    for (let d = new Date(), n = 0; list.length < 5 && n < 14; n++) { d.setDate(d.getDate() + 1); if (d.getDay() % 6) list.push(new Date(d)); }
    const SLOTS = ["9:00", "9:30", "10:30", "11:00", "13:30", "14:00", "15:30", "16:00", "16:30"];
    const drawTimes = () => {
      times.innerHTML = "";
      if (!day) return;
      SLOTS.filter((_, i) => (i + day.getDate()) % 3 !== 0).forEach((t) => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "cl-time"; b.textContent = t; b.setAttribute("aria-pressed", String(t === time));
        b.onclick = () => { time = t; go.disabled = false; drawTimes(); };
        times.append(b);
      });
    };
    list.forEach((d, i) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "cl-day";
      b.innerHTML = `<small></small>`;
      b.firstChild.textContent = d.toLocaleDateString("en-US", { weekday: "short" });
      b.append(d.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
      b.onclick = () => { day = d; time = null; go.disabled = true; days.querySelectorAll(".cl-day").forEach((x, j) => x.setAttribute("aria-pressed", String(j === i))); drawTimes(); };
      days.append(b);
    });
    go.onclick = () => {
      const who = v.first_name || v.name || "";
      cal.innerHTML = "";
      const ok = document.createElement("h4");
      ok.textContent = `You're booked${who ? `, ${who}` : ""}.`;
      const when = document.createElement("p");
      when.className = "cl-sub";
      when.textContent = `${m.name}, ${day.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} at ${time}. The invite is on its way.`;
      cal.append(ok, when);
    };
    cal.append(h, sub, days, times, go);
    spot.append(cal);
  }

  // ── Edit mode: pick, layers, text, classes and styles ────────────────────────────────────────────────────
  root.addEventListener("click", (e) => {
    if (S.mode !== "edit") return;
    const el = e.composedPath().find((n) => n instanceof Element && n.hasAttribute?.("data-k"));
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    select(el.getAttribute("data-k"));
  }, true);
  root.addEventListener("dblclick", (e) => {
    if (S.mode !== "edit") return;
    const el = e.composedPath().find((n) => n instanceof Element && n.hasAttribute?.("data-k"));
    if (!el || el.children.length) return;
    e.preventDefault();
    el.contentEditable = "true";
    el.focus();
    el.addEventListener("blur", () => { const s = byK(el.getAttribute("data-k")); if (s && s.textContent !== el.textContent) { snapshot(); s.textContent = el.textContent; commit(); } }, { once: true });
  }, true);

  function select(k) { S.sel = k; draw(); panel(); }
  const NAME = (el) => {
    const id = el.id ? `#${el.id}` : "";
    const cls = el.classList.length ? `.${[...el.classList].slice(0, 2).join(".")}` : "";
    const t = !el.children.length ? el.textContent.trim().slice(0, 24) : "";
    return { tag: el.tagName.toLowerCase(), label: `${id || cls}${t ? ` ${t}` : ""}` };
  };
  function tree() {
    const out = [];
    const walk = (el, d) => { for (const c of el.children) { out.push({ el: c, d }); if (d < 8) walk(c, d + 1); } };
    walk(src, 0);
    return out;
  }
  // Styles live on a class, like Webflow: the panel edits one rule per class in the form CSS's editor block.
  const PROPS = [
    ["font-family", "Font"], ["font-size", "Size"], ["font-weight", "Weight"], ["color", "Color"], ["background", "Background"],
    ["padding", "Padding"], ["margin", "Margin"], ["border", "Border"], ["border-radius", "Radius"], ["width", "Width"], ["text-align", "Align"], ["box-shadow", "Shadow"],
  ];
  const EDIT_START = "/* editor */";
  function editorRules() {
    const i = S.css.indexOf(EDIT_START);
    const block = i >= 0 ? S.css.slice(i + EDIT_START.length) : "";
    const rules = {};
    for (const m of block.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const props = {};
      for (const d of m[2].split(";")) { const j = d.indexOf(":"); if (j > 0) props[d.slice(0, j).trim()] = d.slice(j + 1).trim(); }
      rules[m[1].trim()] = props;
    }
    return rules;
  }
  function writeEditorRules(rules) {
    const i = S.css.indexOf(EDIT_START);
    const head = i >= 0 ? S.css.slice(0, i).trimEnd() : S.css.trimEnd();
    const body = Object.entries(rules).filter(([, p]) => Object.keys(p).length).map(([sel, p]) => `${sel}{${Object.entries(p).map(([k, v]) => `${k}:${v}`).join(";")}}`).join("\n");
    S.css = body ? `${head}\n${EDIT_START}\n${body}\n` : `${head}\n`;
  }
  function panel() {
    const p = $("pscroll");
    p.innerHTML = "";
    const el = S.sel ? byK(S.sel) : null;
    $("selTag").textContent = el ? `<${el.tagName.toLowerCase()}>` : "";
    // Layers
    const layers = sec("Layers");
    const t = document.createElement("div");
    t.className = "tree";
    for (const { el: n, d } of tree()) {
      const b = document.createElement("button");
      const nm = NAME(n);
      b.style.paddingLeft = `${6 + d * 12}px`;
      b.innerHTML = `<span class="tag"></span> <span></span>`;
      b.children[0].textContent = nm.tag;
      b.children[1].textContent = nm.label;
      if (n.getAttribute("data-k") === S.sel) b.className = "sel";
      b.onclick = () => select(n.getAttribute("data-k"));
      t.append(b);
    }
    if (!t.children.length) t.innerHTML = `<span class="note">Nothing yet</span>`;
    layers.append(t);
    p.append(layers);
    if (!el) { const s = sec("Pick an element"); s.append(note("Click anything in the form, or a layer. Double-click text to type.")); p.append(s); return; }
    // Element: classes, text, actions
    const info = sec("Element");
    const cls = document.createElement("div");
    cls.className = "cls";
    for (const c of el.classList) { const s = document.createElement("span"); s.textContent = c; cls.append(s); }
    if (!el.classList.length) cls.append(note("No class yet. Styling it adds one."));
    info.append(cls);
    if (!el.children.length && !["INPUT", "IMG", "BR", "HR", "SELECT"].includes(el.tagName)) {
      const ta = field("Text", "textarea", el.textContent);
      ta.input.onchange = () => { snapshot(); el.textContent = ta.input.value; commit(); };
      info.append(ta.row);
    }
    if (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) {
      for (const a of ["name", "placeholder"]) {
        const f = field(a === "name" ? "Name" : "Placeholder", "input", el.getAttribute(a) || "");
        f.input.onchange = () => { snapshot(); f.input.value ? el.setAttribute(a, f.input.value) : el.removeAttribute(a); commit(); };
        info.append(f.row);
      }
      const r = document.createElement("label");
      r.className = "row";
      r.innerHTML = `<span class="note">Required</span>`;
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = el.hasAttribute("required");
      cb.onchange = () => { snapshot(); cb.checked ? el.setAttribute("required", "") : el.removeAttribute("required"); commit(); };
      r.append(cb);
      info.append(r);
    }
    const sif = field("Show if", "input", el.getAttribute("data-cl-show-if") || "");
    sif.input.placeholder = "size == 'big'";
    sif.input.onchange = () => { snapshot(); sif.input.value.trim() ? el.setAttribute("data-cl-show-if", sif.input.value.trim()) : el.removeAttribute("data-cl-show-if"); commit(); };
    info.append(sif.row);
    const acts = document.createElement("div");
    acts.className = "actions";
    acts.append(
      btn("Up", () => { const pr = el.previousElementSibling; if (pr) { snapshot(); pr.before(el); commit(); } }),
      btn("Down", () => { const nx = el.nextElementSibling; if (nx) { snapshot(); nx.after(el); commit(); } }),
      btn("Duplicate", () => { snapshot(); const c = el.cloneNode(true); c.querySelectorAll("[data-k]").forEach((x) => x.setAttribute("data-k", String(++kSeq))); c.setAttribute("data-k", String(++kSeq)); if (c.id) c.id = `${c.id}-2`; el.after(c); S.sel = c.getAttribute("data-k"); commit(); }),
      btn("Delete", () => { snapshot(); el.remove(); S.sel = null; commit(); }),
    );
    info.append(acts);
    p.append(info);
    // Style on the element's first class
    const st = sec("Style");
    let cname = el.classList[0];
    const target = document.createElement("div");
    target.className = "note";
    target.textContent = cname ? `Editing .${cname}, everywhere it's used` : "Editing this element (a class is added)";
    st.append(target);
    const live = getComputedStyle(root.querySelector(`[data-k="${S.sel}"]`) || document.body);
    const rules = editorRules();
    for (const [prop, label] of PROPS) {
      const cur = cname && rules[`.${cname}`]?.[prop];
      const f = field(label, "input", cur || "");
      f.input.placeholder = (live.getPropertyValue(prop) || "").slice(0, 40);
      f.input.onchange = () => {
        snapshot();
        if (!cname) { cname = `cl-${S.sel}`; el.classList.add(cname); }
        const r = editorRules();
        const sel = `.${cname}`;
        r[sel] = r[sel] || {};
        if (f.input.value.trim()) r[sel][prop] = f.input.value.trim(); else delete r[sel][prop];
        writeEditorRules(r);
        commit();
      };
      st.append(f.row);
    }
    p.append(st);
  }
  function sec(title) { const s = document.createElement("div"); s.className = "sec"; const h = document.createElement("h3"); h.textContent = title; s.append(h); return s; }
  function note(t) { const s = document.createElement("span"); s.className = "note"; s.textContent = t; return s; }
  function btn(t, fn) { const b = document.createElement("button"); b.className = "pill"; b.textContent = t; b.onclick = fn; return b; }
  function field(label, kind, value) {
    const row = document.createElement("label");
    row.className = "row";
    const l = document.createElement("label");
    l.textContent = label;
    const i = document.createElement(kind);
    i.className = "in";
    i.value = value;
    row.append(l, i);
    return { row, input: i };
  }

  // ── Undo, redo, saving ───────────────────────────────────────────────────────────────────────────────────
  const state = () => ({ html: sourceHtml(), css: S.css, brand: S.brand });
  function snapshot() { past.push(state()); if (past.length > 80) past.shift(); future.length = 0; buttons(); }
  function restore(x) { S.css = x.css; S.brand = x.brand; setSource(x.html); S.sel = null; S.html = x.html; draw(); if (S.mode === "edit") panel(); save(); buttons(); }
  function commit() { S.html = sourceHtml(); draw(); if (S.mode === "edit") panel(); if (S.mode === "code") showCode(); save(); }
  function buttons() { $("undo").disabled = !past.length; $("redo").disabled = !future.length; }
  $("undo").onclick = () => { if (!past.length) return; future.push(state()); restore(past.pop()); };
  $("redo").onclick = () => { if (!future.length) return; past.push(state()); restore(future.pop()); };
  function save() { syncBrand(); try { localStorage.setItem(api.key, JSON.stringify({ brandId: S.brandId, after: S.after, html: S.html, css: S.css, brand: S.brand, turns: S.turns.slice(-30), log: log.slice(-60) })); } catch {} }

  // ── Tabs and device ──────────────────────────────────────────────────────────────────────────────────────
  function setMode(m) {
    S.mode = m;
    for (const [id, v] of [["t-preview", "preview"], ["t-edit", "edit"], ["t-code", "code"], ["t-after", "after"]]) $(id).setAttribute("aria-selected", String(m === v));
    $("afterView").hidden = m !== "after";
    $("app").classList.toggle("editing", m === "edit");
    $("panel").hidden = m !== "edit";
    $("canvas").hidden = m === "code" || m === "after";
    $("codeView").hidden = m !== "code";
    if (m !== "edit") S.sel = null;
    if (m === "code") showCode();
    if (m === "after") renderAfter();
    draw();
    if (m === "edit") panel();
  }
  $("t-preview").onclick = () => setMode("preview");
  $("t-edit").onclick = () => setMode("edit");
  $("t-code").onclick = () => setMode("code");
  $("t-after").onclick = () => setMode("after");

  // The On submission tab: what happens after the send, and which meeting each lead books.
  function questions() {
    const out = [];
    src.querySelectorAll("input[type=radio][name],input[type=checkbox][name],select[name]").forEach((el) => {
      let q = out.find((x) => x.name === el.name);
      if (!q) { q = { name: el.name, options: [] }; out.push(q); }
      const opts = el.tagName === "SELECT" ? [...el.options].map((o) => ({ value: o.value || o.textContent.trim(), label: o.textContent.trim() })) : [{ value: el.value, label: (el.closest("label")?.textContent || el.value).trim() }];
      for (const o of opts) if (o.value && !q.options.some((x) => x.value === o.value)) q.options.push(o);
    });
    return out;
  }
  function pills(values, cur, onPick) {
    const c = document.createElement("div");
    c.className = "chips";
    for (const o of values) { const b = document.createElement("button"); b.className = `pill${o.value === cur ? " on" : ""}`; b.textContent = o.label; b.onclick = () => onPick(o.value); c.append(b); }
    return c;
  }
  function renderAfter() {
    const box = $("afterInner");
    box.innerHTML = "";
    const set = (patch) => { S.after = { ...S.after, ...patch }; save(); renderAfter(); };
    const c1 = document.createElement("div");
    c1.className = "card2";
    const h1 = document.createElement("h3");
    h1.textContent = "After they send it";
    c1.append(h1, pills([{ value: "thanks", label: "Show the thank-you" }, { value: "page", label: "Go to a page" }, { value: "meeting", label: "Book a meeting" }], S.after.kind, (k) => set({ kind: k })));
    if (S.after.kind === "page") {
      const i = document.createElement("input");
      i.className = "in"; i.placeholder = "https://yourcompany.com/thanks"; i.value = S.after.url; i.setAttribute("aria-label", "Page address");
      i.onchange = () => set({ url: i.value.trim() });
      c1.append(i);
    }
    box.append(c1);
    if (S.after.kind !== "meeting") return;
    if (!MEETINGS.length) {
      const c0 = document.createElement("div");
      c0.className = "card2";
      const h0 = document.createElement("h3");
      h0.textContent = "No meeting types yet";
      c0.append(h0, btnP("Open Meetings", () => api.openMeetings(), false));
      box.append(c0);
      return;
    }
    const types = MEETINGS.map((m) => ({ value: m.id, label: `${m.name}, ${m.length} min` }));
    const c2 = document.createElement("div");
    c2.className = "card2";
    const h2 = document.createElement("h3");
    h2.textContent = "Default meeting";
    c2.append(h2, pills(types, S.after.meeting, (id) => set({ meeting: id })));
    box.append(c2);
    const c3 = document.createElement("div");
    c3.className = "card2";
    const h3 = document.createElement("h3");
    h3.textContent = "Route by answer";
    c3.append(h3);
    const qs = questions();
    S.after.routes.forEach((r, i) => {
      const row = document.createElement("div");
      row.className = "rule";
      const upd = (patch) => set({ routes: S.after.routes.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
      const lab = (t) => { const l = document.createElement("span"); l.className = "lab"; l.textContent = t; return l; };
      const q = qs.find((x) => x.name === r.field);
      row.append(lab("When"), pills(qs.map((x) => ({ value: x.name, label: x.name })), r.field, (f) => upd({ field: f, value: qs.find((x) => x.name === f)?.options[0]?.value || "" })));
      if (q) row.append(lab("is"), pills(q.options, r.value, (val) => upd({ value: val })));
      row.append(lab("Book"), pills(types, r.meeting, (id) => upd({ meeting: id })));
      const del = document.createElement("button");
      del.className = "pill"; del.textContent = "Remove"; del.style.alignSelf = "flex-start";
      del.onclick = () => set({ routes: S.after.routes.filter((_, j) => j !== i) });
      row.append(del);
      c3.append(row);
    });
    const add = document.createElement("button");
    add.className = "pill"; add.textContent = "Add a route"; add.style.alignSelf = "flex-start";
    add.disabled = !qs.length;
    add.onclick = () => set({ routes: [...S.after.routes, { field: qs[0].name, value: qs[0].options[0]?.value || "", meeting: MEETINGS[0]?.id || "" }] });
    c3.append(add);
    if (!qs.length) c3.append(note("Routes read pick-one and dropdown questions. Add one to the form first."));
    box.append(c3);
  }
  function setDevice(d) { S.device = d; $("frame").classList.toggle("phone", d === "phone"); $("d-desk").setAttribute("aria-pressed", String(d === "desk")); $("d-phone").setAttribute("aria-pressed", String(d === "phone")); }
  $("d-desk").onclick = () => setDevice("desk");
  $("d-phone").onclick = () => setDevice("phone");
  $("restart").onclick = () => { stepAt = 0; done = false; draw(); };
  function showCode() {
    for (const [id, f] of [["c-html", "html"], ["c-css", "css"], ["c-brand", "brand"]]) $(id).setAttribute("aria-pressed", String(S.file === f));
    $("codeText").value = S.file === "html" ? sourceHtml() : S.file === "css" ? S.css : S.brand;
    $("codeNote").textContent = "";
  }
  for (const [id, f] of [["c-html", "html"], ["c-css", "css"], ["c-brand", "brand"]]) $(id).onclick = () => { S.file = f; showCode(); };
  $("codeApply").onclick = () => {
    snapshot();
    const v = $("codeText").value;
    if (S.file === "html") setSource(v); else if (S.file === "css") S.css = v; else S.brand = v;
    commit();
    $("codeNote").textContent = "Applied. Scripts and unsafe links are removed.";
  };

  // ── The chat ─────────────────────────────────────────────────────────────────────────────────────────────
  const log = []; // what the chat shows: {who, text, ask?, err?}
  const SPARK = `<svg class="spark" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>`;
  function renderLog() {
    msgsEl.innerHTML = "";
    const b0 = current();
    const ready = !!b0 && !!S.brand && !looking.has(b0.id);
    input.disabled = !b0;
    input.placeholder = !b0 ? (loaded ? "Pick a brand to start" : "Loading brands") : !ready && b0.lookErr ? "Try reading the brand again" : !ready ? `Reading ${b0.name}'s look` : "Describe the form, or answer Claude";
    if (!S.busy) $("send").disabled = !ready;
    for (const [i, m] of log.entries()) {
      const d = document.createElement("div");
      d.className = `msg ${m.who}`;
      if (m.who === "ai") {
        const w = document.createElement("div");
        w.className = `who${m.live ? " working" : ""}`;
        w.innerHTML = `${SPARK}<span>Claude</span>`;
        d.append(w);
      }
      if (m.text) { const t = document.createElement("div"); t.className = "text"; t.textContent = m.text; d.append(t); }
      if (m.status) { const s = document.createElement("div"); s.className = "status"; s.textContent = m.status; d.append(s); }
      if (m.ask && i === log.length - 1 && !S.busy && ready) {
        const a = document.createElement("div");
        a.className = "ask";
        const b = document.createElement("b");
        b.textContent = m.ask.question;
        const chips = document.createElement("div");
        chips.className = "chips";
        for (const o of m.ask.options || []) { const c = document.createElement("button"); c.className = "pill"; c.textContent = o; c.onclick = () => send(o); chips.append(c); }
        a.append(b, chips);
        d.append(a);
      } else if (m.ask) {
        const s = document.createElement("div"); s.className = "status"; s.textContent = m.ask.question; d.append(s);
      }
      if (m.starts && ready) {
        const s = document.createElement("div");
        s.className = "starts";
        for (const o of m.starts) { const c = document.createElement("button"); c.textContent = o; c.onclick = () => send(o); s.append(c); }
        d.append(s);
      }
      if (m.err) { const e = document.createElement("div"); e.className = "err"; e.textContent = m.err; d.append(e); }
      msgsEl.append(d);
    }
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }
  function greet() {
    log.length = 0;
    const b = current();
    if (b) log.push({ who: "ai", text: `What do you want to build for ${b.name}?`, starts: ["A demo request that asks team size", "A daily check-in with a mood question", "An event sign-up with a plus-one", "A job application with a résumé upload"] });
    renderLog();
  }

  // Claude's reply, read as it streams: tags may still be open.
  function tagOf(text, name) {
    const open = text.lastIndexOf(`<${name}>`);
    if (open < 0) return null;
    const start = open + name.length + 2;
    const close = text.indexOf(`</${name}>`, start);
    return { body: close < 0 ? text.slice(start) : text.slice(start, close), closed: close >= 0 };
  }
  function patchesOf(text) { return [...text.matchAll(/<patch id="([^"]+)">([\s\S]*?)<\/patch>/g)].map((m) => ({ id: m[1], html: m[2] })); }

  let lastPaint = 0;
  function paintPartial(text) {
    const now = performance.now();
    if (now - lastPaint < 250) return;
    lastPaint = now;
    const b = tagOf(text, "brand_css"), h = tagOf(text, "form_html"), c = tagOf(text, "form_css");
    if (b) S.brand = b.body;
    if (c) S.css = c.body;
    if (h) { setSource(h.body); stepAt = 0; done = false; }
    if (b || c || h) draw();
  }

  async function send(text) {
    text = String(text || "").trim();
    if (!text || S.busy || !current() || !S.brand || looking.has(S.brandId)) return;
    input.value = "";
    autosize();
    log.forEach((m) => { m.starts = undefined; });
    log.push({ who: "me", text });
    const reply = { who: "ai", text: "", status: "Thinking", live: true };
    log.push(reply);
    S.busy = true;
    renderLog();
    setBusy(true);
    snapshot();
    const b = current();
    const now = `\n\n[Brand: ${b.name} (${b.site}), confirmed. Its brand CSS follows; build only with it.]\n[The form right now]\n<brand_css>${S.brand}</brand_css>\n<form_html>${sourceHtml()}</form_html>\n<form_css>${S.css}</form_css>\n<after>${JSON.stringify(S.after)}</after>\n[Meeting types (id: name)] ${MEETINGS.length ? MEETINGS.map((m) => `${m.id}: ${m.name}, ${m.length} min`).join("; ") : "none yet"}${S.logo ? "\n[The brand's logo is set; the form shows it in img[data-cl-logo].]" : "\n[No logo yet. Use img[data-cl-logo] anyway; it hides until the owner adds one.]"}`;
    const turns = [...S.turns, { role: "user", content: text + now }];
    ctl = new AbortController();
    try {
      const r = await api.chat(turns, (t) => {
        const say = tagOf(t, "say");
        reply.text = say ? say.body.trim() : "";
        const open = (n) => { const x = tagOf(t, n); return x && !x.closed; };
        reply.status = open("form_html") ? "Writing the form" : open("brand_css") ? "Writing the brand's CSS" : open("form_css") ? "Styling it" : patchesOf(t).length ? "Changing it" : say ? "" : "Thinking";
        paintPartial(t);
        renderLog();
      }, ctl.signal);
      finish(r.text, reply);
      S.turns.push({ role: "user", content: text }, { role: "assistant", content: summary(r.text) });
      if (r.cut) reply.err = "The answer was cut short. Ask for a smaller change.";
    } catch (e) {
      if (e?.text) finish(e.text, reply);
      reply.err = e?.name === "AbortError" ? "" : e?.message || "Claude didn't finish. Try again.";
    } finally {
      ctl = null;
      reply.live = false;
      reply.status = "";
      S.busy = false;
      if (alive) { setBusy(false); renderLog(); save(); }
    }
  }
  function finish(t, reply) {
    const say = tagOf(t, "say"), ask = tagOf(t, "ask"), b = tagOf(t, "brand_css"), h = tagOf(t, "form_html"), c = tagOf(t, "form_css"), add = tagOf(t, "css_add");
    reply.text = say ? say.body.trim() : reply.text;
    if (ask?.closed) { try { const a = JSON.parse(ask.body); if (a.question) reply.ask = { question: String(a.question), options: (a.options || []).map(String).slice(0, 6) }; } catch {} }
    if (b?.closed) S.brand = b.body.trim();
    if (c?.closed) S.css = c.body.trim();
    if (h?.closed) { setSource(h.body.trim()); stepAt = 0; done = false; }
    for (const p of patchesOf(t)) {
      const target = src.querySelector(`[id="${CSS.escape(p.id)}"]`);
      if (!target) continue;
      const fresh = cleanHtml(p.html);
      fresh.querySelectorAll("*").forEach((el) => el.setAttribute("data-k", String(++kSeq)));
      target.replaceWith(...fresh.childNodes);
    }
    if (add?.closed) S.css = `${S.css}\n${add.body.trim()}`;
    const af = tagOf(t, "after");
    if (af?.closed) { try { const a = JSON.parse(af.body); if (["thanks", "page", "meeting"].includes(a.kind)) S.after = { kind: a.kind, url: String(a.url || ""), meeting: MEETINGS.some((m) => m.id === a.meeting) ? a.meeting : S.after.meeting, routes: Array.isArray(a.routes) ? a.routes.filter((r) => r && r.field && MEETINGS.some((m) => m.id === r.meeting)).map((r) => ({ field: String(r.field), value: String(r.value ?? ""), meeting: r.meeting })) : [] }; } catch {} if (S.mode === "after") renderAfter(); }
    S.html = sourceHtml();
    draw();
    if (S.mode === "edit") panel();
    if (S.mode === "code") showCode();
  }
  // What Claude said, kept short for the next turns (the form itself is sent fresh each time).
  function summary(t) {
    const say = tagOf(t, "say")?.body.trim() || "";
    const ask = tagOf(t, "ask")?.body.trim() || "";
    const did = [tagOf(t, "form_html") && "wrote the form", tagOf(t, "brand_css") && "wrote the brand CSS", patchesOf(t).length && "patched it", tagOf(t, "css_add") && "added CSS"].filter(Boolean).join(", ");
    return `<say>${say}</say>${ask ? `<ask>${ask}</ask>` : ""}${did ? ` (${did})` : ""}`;
  }
  function setBusy(b) {
    $("send").disabled = !b && !(current() && S.brand && !looking.has(S.brandId));
    $("send").innerHTML = b ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>` : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>`;
    $("send").setAttribute("aria-label", b ? "Stop" : "Send");
    $("frame").classList.toggle("live", b);
    $("emptyText").textContent = b ? "Claude is designing your form" : "Your form shows here as Claude builds it";
    empty.classList.toggle("live", b);
  }
  $("send").onclick = () => (S.busy ? ctl?.abort() : send(input.value));
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input.value); } });
  function autosize() { input.style.height = "auto"; input.style.height = `${Math.min(160, input.scrollHeight)}px`; }
  input.addEventListener("input", autosize);
  $("reset").onclick = () => {
    if (S.busy) return;
    snapshot();
    S.turns = []; S.css = ""; S.sel = null; S.after = { kind: "thanks", url: "", meeting: MEETINGS[0]?.id || "", routes: [] }; setSource(""); S.html = ""; stepAt = 0; done = false;
    greet(); draw(); if (S.mode === "edit") panel(); save();
  };

  // ── Brands: the workspace's own. Pick one before starting; a new one is read from its website (name and real logo),
  // confirmed, and only then is its look read. ──────────────────────────────────────────────────────────────────────
  let brands = [];
  const looking = new Set();
  const cssKey = (id) => `clr-studio-css:${id}`;
  const readCss = (id) => { try { return localStorage.getItem(cssKey(id)) || ""; } catch { return ""; } };
  const keepCss = (id, css) => { try { localStorage.setItem(cssKey(id), css); } catch {} };
  const current = () => brands.find((b) => b.id === S.brandId) || null;
  function syncBrand() { const b = current(); if (b && S.brand && b.css !== S.brand) { b.css = S.brand; keepCss(b.id, S.brand); } }
  const hostOf = (u) => { try { return new URL(/^https?:\/\//i.test(String(u).trim()) ? String(u).trim() : `https://${String(u).trim()}`).hostname.replace(/^www\./, ""); } catch { return ""; } };
  function mark(b, big) {
    if (b?.logo) { const i = document.createElement("img"); i.className = "mark"; if (big) i.style.height = "36px"; i.src = b.logo; i.alt = ""; return i; }
    const e = document.createElement("span"); e.className = "mark-empty"; e.textContent = b ? b.name.charAt(0) : "+"; return e;
  }
  function btnP(t, fn, primary = true) { const x = document.createElement("button"); x.className = primary ? "pill primary" : "pill"; x.textContent = t; x.onclick = fn; return x; }
  function useBrand(id) {
    const b = brands.find((x) => x.id === id);
    if (!b) return;
    syncBrand();
    if (!b.css) b.css = readCss(b.id);
    S.brandId = b.id; S.brand = b.css || ""; S.logo = b.logo || "";
    brandUi(); draw(); save();
    if (!b.css) void readLook(b);
    if (!log.some((m) => m.who === "me")) greet(); else renderLog();
  }
  async function readLook(b, fresh = false) {
    if (looking.has(b.id)) return;
    looking.add(b.id);
    b.lookErr = "";
    brandUi(); renderLog();
    try {
      const r = await api.look(b.id, fresh);
      b.css = r.css;
      keepCss(b.id, r.css);
      if (S.brandId === b.id) { S.brand = r.css; draw(); save(); if (S.mode === "code") showCode(); }
      if (r.say && S.brandId === b.id && !log.some((m) => m.who === "me")) { greet(); log.unshift({ who: "ai", text: r.say }); }
    } catch (e) {
      b.lookErr = e?.message || `Couldn't read ${b.name}'s look.`;
    } finally {
      looking.delete(b.id);
      if (alive) { brandUi(); renderLog(); }
    }
  }
  function brandUi() {
    const btn = $("brandBtn");
    btn.innerHTML = "";
    const b = current();
    const nm = document.createElement("span");
    nm.className = "nm";
    nm.textContent = b ? b.name : loaded ? "Pick a brand" : "Loading brands";
    if (b) { const st = document.createElement("span"); st.className = "st"; st.textContent = `  ${b.site}`; nm.append(st); }
    const chev = document.createElement("span");
    chev.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`;
    btn.append(mark(b), nm, chev);
    const st = $("brandStatus");
    st.innerHTML = "";
    st.hidden = true;
    if (b && looking.has(b.id)) { st.hidden = false; st.className = "bstatus working"; st.innerHTML = `${SPARK}<span></span>`; st.lastChild.textContent = `Reading ${b.name}'s look`; }
    else if (b?.lookErr) { st.hidden = false; st.className = "bstatus err"; const t = document.createElement("span"); t.textContent = b.lookErr; st.append(t, btnP("Try again", () => void readLook(b, true), false)); }
  }
  let deleting = "";
  function openMenu(open) {
    const m = $("brandMenu");
    m.hidden = !open;
    $("brandBtn").setAttribute("aria-expanded", String(open));
    if (!open) { deleting = ""; return; }
    m.innerHTML = "";
    for (const b of brands) {
      if (deleting === b.id) {
        const d = document.createElement("div");
        d.className = "mdel";
        const t = document.createElement("span"); t.className = "spacer"; t.textContent = `Delete ${b.name}?`;
        d.append(t, btnP("Delete", async () => {
          try { await api.deleteBrand(b.id); } catch (e) { deleting = ""; openMenu(true); return; }
          brands = brands.filter((x) => x.id !== b.id);
          try { localStorage.removeItem(cssKey(b.id)); } catch {}
          if (S.brandId === b.id) { S.brandId = ""; S.brand = ""; S.logo = ""; }
          deleting = ""; brandUi(); draw(); save(); renderLog(); openMenu(true);
        }), btnP("Keep", () => { deleting = ""; openMenu(true); }, false));
        m.append(d);
        continue;
      }
      const r = document.createElement("div");
      r.className = "mrow";
      const pick = document.createElement("button");
      pick.setAttribute("role", "menuitemradio");
      pick.setAttribute("aria-checked", String(b.id === S.brandId));
      const nm = document.createElement("span"); nm.textContent = b.name;
      const st = document.createElement("span"); st.className = "site"; st.textContent = b.site;
      pick.append(mark(b), nm, st);
      pick.onclick = () => { openMenu(false); useBrand(b.id); };
      const del = document.createElement("button");
      del.className = "ib"; del.title = "Delete"; del.setAttribute("aria-label", `Delete ${b.name}`);
      del.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>`;
      del.onclick = (e) => { e.stopPropagation(); deleting = b.id; openMenu(true); };
      r.append(pick, del);
      m.append(r);
    }
    if (brands.length) { const sep = document.createElement("div"); sep.className = "msep"; m.append(sep); }
    const add = document.createElement("div");
    add.className = "mrow";
    const ab = document.createElement("button");
    ab.setAttribute("role", "menuitem");
    const plus = document.createElement("span"); plus.className = "mark-empty"; plus.textContent = "+";
    const at = document.createElement("span"); at.textContent = "Add a brand";
    ab.append(plus, at);
    ab.onclick = () => { openMenu(false); openDialog(); };
    add.append(ab);
    m.append(add);
  }
  $("brandBtn").onclick = () => openMenu($("brandMenu").hidden);
  const onDown = (e) => { if (!$("brandMenu").hidden && !e.composedPath().some((n) => n?.classList?.contains?.("brandbar"))) openMenu(false); };
  const onKey = (e) => { if (e.key === "Escape") { openMenu(false); if (!$("brandDlg").hidden && !draft.busy) closeDialog(); } };
  document.addEventListener("mousedown", onDown);
  document.addEventListener("keydown", onKey);

  // Add a brand: the website, then "Is this the brand?" with its name and real logo, then its look.
  let draft = { step: 1, url: "", look: null, kitId: "", busy: "", err: "", browser: false };
  function openDialog() { draft = { step: 1, url: "", look: null, kitId: "", busy: "", err: "", browser: false }; $("brandDlg").hidden = false; dialog(); }
  function closeDialog() { $("brandDlg").hidden = true; }
  $("brandDlg").addEventListener("mousedown", (e) => { if (e.target === $("brandDlg") && !draft.busy) closeDialog(); });
  function dialog() {
    const box = $("dlgBody");
    box.innerHTML = "";
    const h = document.createElement("h2");
    box.append(h);
    const acts = document.createElement("div");
    acts.className = "actions";
    acts.style.justifyContent = "flex-end";
    const working = (t) => { const w = document.createElement("div"); w.className = "status working"; w.innerHTML = `${SPARK}<span></span>`; w.lastChild.textContent = t; return w; };
    if (draft.step === 1) {
      h.textContent = "Add a brand";
      const f = document.createElement("form");
      f.className = "siteform";
      const site = document.createElement("input"); site.className = "in"; site.placeholder = "Website, like acme.com"; site.value = draft.url; site.id = "dlgSite"; site.setAttribute("aria-label", "Website"); site.autocomplete = "off";
      site.disabled = !!draft.busy;
      site.oninput = () => { draft.url = site.value; draft.err = ""; go.disabled = !hostOf(draft.url).includes("."); };
      const go = btnP(draft.busy === "site" ? "Reading" : "Read", () => {});
      go.type = "submit";
      go.disabled = !!draft.busy || !hostOf(draft.url).includes(".");
      f.onsubmit = (e) => { e.preventDefault(); void readSiteNow(); };
      f.append(site, go);
      box.append(f);
      if (draft.busy === "site") box.append(working(`Reading ${hostOf(draft.url)}`));
      if (draft.busy === "browser") box.append(working(`Opening ${hostOf(draft.url)} in a browser`));
      if (draft.err) { const e = document.createElement("div"); e.className = "err"; e.textContent = draft.err; box.append(e); }
      if (draft.browser && !draft.busy) acts.append(btnP("Read it in a browser", () => void scanNow(), false));
      acts.append(btnP("Cancel", closeDialog, false));
      box.append(acts);
      setTimeout(() => site.focus(), 0);
    } else {
      h.textContent = "Is this the brand?";
      const c = document.createElement("div"); c.className = "confirm";
      c.append(mark(draft.look, true));
      const t = document.createElement("div"); t.style.flex = "1"; t.style.minWidth = "0";
      const name = document.createElement("input"); name.className = "in nameedit"; name.value = draft.look.name; name.id = "dlgName"; name.setAttribute("aria-label", "Brand name");
      name.oninput = () => { draft.look.name = name.value; yes.disabled = !name.value.trim(); };
      const sp = document.createElement("span"); sp.textContent = draft.look.site;
      t.append(name, sp);
      c.append(t);
      box.append(c);
      if (!draft.look.logo) { const n = document.createElement("div"); n.className = "note"; n.textContent = "No logo found on the site. Forms show the name until one is added in Settings, Brand."; box.append(n); }
      if (draft.busy === "confirm") box.append(working("Saving the brand"));
      if (draft.err) { const e = document.createElement("div"); e.className = "err"; e.textContent = draft.err; box.append(e); }
      const yes = btnP("Yes, use this brand", () => void confirmNow());
      yes.disabled = !!draft.busy || !draft.look.name.trim();
      acts.append(btnP("Back", () => { draft.step = 1; draft.err = ""; dialog(); }, false), yes);
      box.append(acts);
    }
  }
  async function readSiteNow() {
    const host = hostOf(draft.url);
    if (!host.includes(".") || draft.busy) return;
    const had = brands.find((b) => hostOf(b.site) === host);
    if (had) { closeDialog(); useBrand(had.id); return; }
    draft.busy = "site"; draft.err = ""; draft.browser = false; dialog();
    try {
      draft.look = await api.readSite(host);
      draft.step = 2;
    } catch (e) {
      draft.err = e?.message || `Couldn't open ${host}.`;
      draft.browser = !!e?.browser;
    } finally { draft.busy = ""; if (alive) dialog(); }
  }
  async function scanNow() {
    const host = hostOf(draft.url);
    draft.busy = "browser"; draft.err = ""; dialog();
    try {
      const { kitId } = await api.scan(host);
      draft.kitId = kitId;
      let kit = null;
      for (let i = 0; i < 40 && alive && !$("brandDlg").hidden; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        kit = await api.kit(kitId).catch(() => null);
        if (kit && (kit.logo || kit.scanStatus === "done" || kit.scanStatus === "failed")) break;
      }
      if (!kit || kit.scanStatus === "failed") throw new Error(`Couldn't read ${host} in a browser either.`);
      draft.look = { site: host, url: `https://${host}`, name: kit.name, logo: kit.logo, logoUrl: kit.logoUrl, logoSvg: kit.logoSvg };
      draft.step = 2;
    } catch (e) {
      draft.err = e?.message || `Couldn't read ${host} in a browser.`;
    } finally { draft.busy = ""; if (alive) dialog(); }
  }
  async function confirmNow() {
    if (draft.busy) return;
    draft.busy = "confirm"; draft.err = ""; dialog();
    try {
      const { kitId } = await api.confirm({ url: draft.look.url || `https://${draft.look.site}`, name: draft.look.name.trim(), logoUrl: draft.look.logoUrl || null, logoSvg: draft.look.logoSvg || null });
      const b = { id: kitId, name: draft.look.name.trim(), site: draft.look.site, logo: draft.look.logo, css: "" };
      brands = [...brands.filter((x) => x.id !== kitId), b];
      draft.busy = "";
      closeDialog();
      useBrand(kitId);
    } catch (e) {
      draft.busy = ""; draft.err = e?.message || "Couldn't save the brand.";
      dialog();
    }
  }


  // ── Start ────────────────────────────────────────────────────────────────────────────────────────────────
  let alive = true, loaded = false;
  $("backBtn").onclick = () => api.back();
  brandUi();
  renderLog();
  draw();
  setDevice("desk");
  (async () => {
    const [bs, ms] = await Promise.all([api.brands().catch(() => []), api.meetings().catch(() => [])]);
    if (!alive) return;
    brands = bs.map((b) => ({ ...b, css: readCss(b.id), lookErr: "" }));
    MEETINGS = ms;
    loaded = true;
    try {
      const kept = JSON.parse(localStorage.getItem(api.key) || "null");
      const b = kept?.brandId ? brands.find((x) => x.id === kept.brandId) : null;
      if (b) { S.brandId = b.id; S.brand = b.css || kept.brand || ""; S.logo = b.logo || ""; if (!b.css && S.brand) { b.css = S.brand; keepCss(b.id, S.brand); } }
      if (kept && (kept.html || kept.turns?.length)) {
        S.css = kept.css || ""; S.turns = kept.turns || [];
        if (kept.after?.kind) S.after = kept.after;
        setSource(kept.html || ""); S.html = kept.html || "";
        log.push(...(kept.log || []).map((m) => ({ ...m, live: false, status: "" })));
      }
    } catch {}
    if (!S.after.meeting && MEETINGS[0]) S.after.meeting = MEETINGS[0].id;
    brandUi();
    if (!log.length) greet(); else renderLog();
    draw();
    const b = current();
    if (b && !b.css) void readLook(b);
    if (!b) openMenu(true);
  })();

  return () => {
    alive = false;
    ctl?.abort();
    document.removeEventListener("mousedown", onDown);
    document.removeEventListener("keydown", onKey);
  };
}
