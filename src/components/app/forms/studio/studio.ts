/* eslint-disable */
// @ts-nocheck
import { DEFAULT_CONSENT } from "../../../../lib/forms/schema";
import { checkStudioPage } from "../../../../lib/studio/check";
import { cleanPage } from "../../../../lib/studio/page";
import { cleanRoute, OP_LABEL, PAST_ROUTES, ROUTE_OPS, routeKind, routeMeeting, routeStart } from "../../../../lib/studio/routes";
import { linkProblem, SCHEDULERS } from "../../../../lib/forms/schedule";
import { INDUSTRIES, industryOf, isRtl, languageName, profileWords, recipeText } from "../../../../lib/studio/industries";
import { ACCESS_CSS, around, CAL_CSS, consentSpot, linkErrors, zoneWords } from "../../../../lib/studio/runtime";
import { TIA_STYLE, tiaSvg } from "../../../../lib/studio/tia";

// Form Studio (docs/forms-chat-plan.md, docs/studio-v2-plan.md): every form is one chat with Tia on the left and the
// live form on the right, drawn in a shadow root so the brand's CSS and the form's own CSS never touch the app. The
// form is three texts: its HTML, its own CSS and the brand's CSS. Tia (Claude Opus, on the server: /api/studio)
// writes them; Edit changes them right on the form (pick, type in place, the floating bar, the Style and Settings
// panel, Layers) and Code by hand. Plain DOM, so every piece of a streamed answer paints without React in the way.
// `mountStudio` returns the cleanup.

export const STUDIO_CSS =
  TIA_STYLE +
  `
:host {
  --bg: var(--color-card); --paper: var(--color-paper); --paper-deep: var(--color-paper-deep); --ink: var(--color-ink);
  --body: var(--color-body); --muted: var(--color-muted); --faint: var(--color-faint); --line: var(--color-line);
  --line-strong: var(--color-line-strong); --hover: var(--color-hover); --signal: var(--color-signal); --signal-soft: var(--color-signal-soft);
  --pick: var(--color-sky); --rose: var(--color-rose); --scrim: var(--color-scrim); --sans: var(--font-sans); --mono: var(--font-mono);
  --ease: var(--ease-out, cubic-bezier(.22, 1, .36, 1));
  display: block; height: 100%; min-height: 0; background: var(--bg); color: var(--ink); font-family: var(--sans); font-size: 13px;
}
* { box-sizing: border-box; }
button { font: inherit; color: inherit; cursor: pointer; }
button:disabled { cursor: default; opacity: .4; }
[hidden] { display: none !important; }
:focus-visible { outline: 2px solid var(--pick); outline-offset: 2px; }
.app, .chat, .bar, .panel, .navi { user-select: none; -webkit-user-select: none; }
input, textarea { user-select: text; -webkit-user-select: text; }
.tia { --tia-ink: var(--ink); --tia-face: var(--bg); --tia-signal: var(--signal); }
.app { height: 100%; min-height: 0; display: flex; }

/* Chat */
.chat { flex: none; width: 340px; display: flex; flex-direction: column; border-right: 1px solid var(--line); transition: width .2s var(--ease); min-height: 0; }
.chat.folded { width: 52px; }
.chat.folded > :not(.chathead) { display: none; }
.chat.folded .chathead > :not(.foldbtn) { display: none; }
.chat.folded .chathead { justify-content: center; padding: 0; }
.chathead { height: 52px; flex: none; display: flex; align-items: center; gap: 6px; padding: 0 8px 0 10px; border-bottom: 1px solid var(--line); }
.chatpick { flex: 1; min-width: 0; height: 36px; display: flex; align-items: center; gap: 8px; padding: 0 8px; border: 0; border-radius: 8px; background: transparent; text-align: left; }
.chatpick:hover { background: var(--hover); }
.chatpick .nm { font-weight: 600; font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.bmark { height: 20px; max-width: 64px; flex: none; object-fit: contain; object-position: left; }
.bempty { width: 20px; height: 20px; border-radius: 999px; border: 1px dashed var(--line-strong); color: var(--muted); display: inline-flex; align-items: center; justify-content: center; flex: none; font-size: 10.5px; font-weight: 600; }
.badge { height: 20px; padding: 0 8px; border-radius: 999px; font-size: 11px; font-weight: 500; display: inline-flex; align-items: center; flex: none; background: var(--paper-deep); color: var(--muted); }
.badge.live { background: var(--signal-soft); color: var(--signal); }
.ib { width: 30px; height: 30px; border-radius: 999px; border: 0; background: transparent; color: var(--muted); display: inline-flex; align-items: center; justify-content: center; flex: none; position: relative; }
.ib:hover:not(:disabled) { background: var(--hover); color: var(--ink); }
.brandrow { flex: none; padding: 10px 12px; border-bottom: 1px solid var(--line); display: flex; flex-direction: column; gap: 8px; }
.brandbtn { width: 100%; height: 40px; display: flex; align-items: center; gap: 10px; padding: 0 10px; border: 1px solid var(--line); border-radius: 10px; background: var(--bg); text-align: left; }
.brandbtn:hover { border-color: var(--line-strong); }
.brandbtn .nm { flex: 1; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bstatus { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); }
.profile { align-self: flex-start; max-width: 100%; height: 24px; padding: 0 10px; border-radius: 999px; border: 0; background: var(--paper-deep); color: var(--body); font-size: 12px; display: inline-flex; align-items: center; gap: 6px; }
.profile span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.profile:hover { color: var(--ink); }
.bstatus.err { color: var(--rose); }
.bstatus .pill { margin-left: auto; }
.msgs { flex: 1; min-height: 0; overflow-y: auto; padding: 16px 14px; display: flex; flex-direction: column; gap: 14px; }
.msg { display: flex; flex-direction: column; gap: 6px; }
.msg.me { align-items: flex-end; }
.msg.me .text { background: var(--paper-deep); padding: 8px 12px; border-radius: 14px; max-width: 88%; white-space: pre-wrap; overflow-wrap: anywhere; }
.who { display: flex; align-items: center; gap: 6px; font-weight: 600; font-size: 12px; }
.msg.ai .text { color: var(--body); line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }
.status { color: var(--muted); font-size: 12px; }
.did { display: inline-flex; align-items: center; gap: 6px; color: var(--signal); font-size: 12px; font-weight: 500; }
.ask { border: 1px solid var(--line); border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.starts { display: flex; flex-direction: column; gap: 6px; }
.starts button { text-align: left; border: 1px solid var(--line); background: var(--bg); border-radius: 10px; padding: 10px 12px; color: var(--body); }
.starts button:hover { border-color: var(--line-strong); color: var(--ink); }
.err { color: var(--rose); font-size: 12.5px; }
.compose { flex: none; padding: 10px 12px 14px; border-top: 1px solid var(--line); display: flex; flex-direction: column; gap: 8px; }
.about { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 6px 0 10px; border-radius: 999px; background: var(--paper-deep); font-size: 12px; max-width: 100%; }
.about span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.about button { border: 0; background: transparent; color: var(--muted); width: 18px; height: 18px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; }
.box { display: flex; align-items: flex-end; gap: 6px; border: 1px solid var(--line-strong); border-radius: 18px; padding: 6px 6px 6px 6px; }
.box .attach { width: 32px; height: 32px; }
.box.drop { border-color: var(--ink); background: var(--hover); }
.fchip { display: inline-flex; align-items: center; gap: 4px; height: 24px; padding: 0 8px; border-radius: 999px; background: var(--paper-deep); font-size: 12px; color: var(--body); max-width: 220px; }
.fchip span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fchip button { border: 0; background: transparent; color: var(--muted); width: 16px; height: 16px; padding: 0; display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; }
.box:focus-within { border-color: var(--ink); }
.box textarea { flex: 1; min-width: 0; border: 0; outline: 0; resize: none; background: transparent; color: var(--ink); font: inherit; font-size: 13.5px; line-height: 1.45; max-height: 140px; padding-block: 6px; }
.box textarea:disabled { cursor: default; }
.send { width: 32px; height: 32px; border-radius: 999px; border: 0; background: var(--ink); color: var(--bg); display: inline-flex; align-items: center; justify-content: center; flex: none; }

/* Stage */
.stage { flex: 1; min-width: 0; display: flex; flex-direction: column; min-height: 0; }
.bar { height: 52px; flex: none; display: flex; align-items: center; gap: 6px; padding: 0 12px; border-bottom: 1px solid var(--line); }
.grp { display: inline-flex; align-items: center; gap: 2px; padding: 2px; border-radius: 999px; background: var(--paper-deep); }
.grp .ib { width: 32px; height: 28px; }
.grp .ib[aria-selected="true"], .grp .ib[aria-pressed="true"], .ib.on { background: var(--bg); color: var(--ink); box-shadow: 0 0 0 1px var(--line), 0 1px 2px rgb(10 10 10 / .06); }
.spacer { flex: 1; }
.vsep { width: 1px; height: 20px; background: var(--line); margin: 0 4px; }
.langbtn { height: 30px; padding: 0 10px 0 8px; border-radius: 999px; border: 0; background: transparent; color: var(--muted); display: inline-flex; align-items: center; gap: 6px; font: 500 12px var(--sans); position: relative; flex: none; }
.langbtn:hover { background: var(--hover); color: var(--ink); }
.langbtn.on { background: var(--paper-deep); color: var(--ink); }
.issue { display: grid; grid-template-columns: 8px minmax(0, 1fr) auto; gap: 10px; align-items: start; padding: 8px 10px; border-radius: 6px; font-size: 12.5px; line-height: 1.45; }
.issue + .issue { border-top: 1px solid var(--line); }
.issue .lv { width: 8px; height: 8px; border-radius: 999px; margin-top: 5px; background: var(--faint); }
.issue .lv.err { background: var(--rose); }
.issue .pill { height: 26px; }
.ihead { display: flex; align-items: center; gap: 8px; padding: 8px 10px 4px; font-size: 11px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--muted); }
.ihead .pill { margin-left: auto; text-transform: none; letter-spacing: 0; font-weight: 500; }
[data-tip]::after { content: attr(data-tip); position: absolute; top: calc(100% + 6px); left: 50%; transform: translateX(-50%) translateY(-2px); background: var(--ink); color: var(--bg); font-size: 11.5px; font-weight: 500; padding: 4px 8px; border-radius: 6px; white-space: nowrap; pointer-events: none; opacity: 0; transition: opacity .12s, transform .12s; z-index: 70; }
[data-tip]:hover::after, [data-tip]:focus-visible::after { opacity: 1; transform: translateX(-50%); }
.tipleft[data-tip]::after { left: auto; right: 0; transform: translateY(-2px); }
.tipleft[data-tip]:hover::after, .tipleft[data-tip]:focus-visible::after { transform: none; }
.tipright[data-tip]::after { left: 0; transform: translateY(-2px); }
.tipright[data-tip]:hover::after, .tipright[data-tip]:focus-visible::after { transform: none; }
.work { flex: 1; min-height: 0; display: flex; }
.stepbar { flex: none; display: flex; align-items: center; gap: 6px; padding: 8px 12px; border-bottom: 1px solid var(--line); overflow-x: auto; }
.stepbar .sp { height: 28px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--line); background: var(--bg); color: var(--body); font-size: 12.5px; white-space: nowrap; display: inline-flex; align-items: center; gap: 6px; flex: none; max-width: 220px; }
.stepbar .sp span:last-child { overflow: hidden; text-overflow: ellipsis; }
.stepbar .sp:hover { border-color: var(--line-strong); color: var(--ink); }
.stepbar .sp[aria-pressed="true"] { background: var(--ink); color: var(--bg); border-color: var(--ink); }
.stepbar .sp .n { font: 500 11px var(--mono); opacity: .65; }
.stepbar .tools { margin-left: auto; display: flex; gap: 2px; flex: none; padding-left: 8px; }
.navi { flex: none; width: 220px; border-right: 1px solid var(--line); display: flex; flex-direction: column; min-height: 0; }
.ptitle { height: 38px; flex: none; display: flex; align-items: center; padding: 0 12px; font-size: 11px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--muted); }
.tree { flex: 1; min-height: 0; overflow-y: auto; padding: 0 6px 10px; display: flex; flex-direction: column; }
.tree button { flex: none; height: 26px; border: 0; background: transparent; text-align: left; border-radius: 5px; color: var(--body); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px; display: flex; align-items: center; gap: 6px; }
.tree button:hover { background: var(--hover); }
.tree button.sel { background: var(--ink); color: var(--bg); }
.tree .tg { font-family: var(--mono); font-size: 10.5px; opacity: .6; }
.canvas { flex: 1; min-width: 0; overflow: auto; background: var(--paper); padding: 20px; display: flex; justify-content: center; position: relative; }
.frame { position: relative; display: flex; flex-direction: column; width: 100%; max-width: 1100px; min-height: 100%; height: max-content; border-radius: 12px; box-shadow: 0 0 0 1px var(--line), 0 8px 28px -12px rgb(0 0 0 / .18); transition: max-width .32s var(--ease); background: var(--bg); }
.frame.tablet { max-width: 768px; }
.frame.phone { max-width: 390px; }
#host { flex: 1; display: flex; flex-direction: column; border-radius: 12px; overflow: hidden; }
.ov { position: absolute; pointer-events: none; }
#hov { border: 1px dashed var(--pick); border-radius: 2px; }
#hovtag, #seltag { position: absolute; top: -20px; left: -1px; height: 18px; padding: 0 6px; border-radius: 4px 4px 4px 0; font: 500 11px/18px var(--sans); white-space: nowrap; }
#hovtag { background: color-mix(in srgb, var(--pick) 14%, var(--bg)); color: var(--pick); }
#sel { border: 2px solid var(--pick); border-radius: 2px; }
#seltag { background: var(--pick); color: #fff; }
#fbar { position: absolute; z-index: 5; display: flex; gap: 2px; padding: 3px; background: var(--ink); border-radius: 999px; box-shadow: 0 8px 20px -8px rgb(0 0 0 / .45); }
#fbar .ib { width: 28px; height: 28px; color: var(--bg); }
#fbar .ib:hover { background: rgb(255 255 255 / .16); color: var(--bg); }
#fbar .ib[data-tip]::after { background: var(--bg); color: var(--ink); box-shadow: 0 0 0 1px var(--line); }
#fbar .tia { --tia-ink: var(--bg); --tia-face: var(--ink); }
.empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; color: var(--muted); padding: 80px 24px; text-align: center; flex: 1; }
.sk { width: min(380px, 100%); border: 1px solid var(--line); border-radius: 10px; padding: 22px; display: flex; flex-direction: column; gap: 12px; }
.sk span { display: block; height: 10px; border-radius: 4px; background: var(--paper-deep); }
.sk .b2 { height: 32px; border: 1px solid var(--line); background: var(--paper); }
.sk .bt2 { height: 32px; width: 40%; border-radius: 999px; background: var(--ink); opacity: .85; }
.live .sk span { animation: shim 1.6s ease-in-out infinite; }
@keyframes shim { 50% { opacity: .45; } }
.code { flex: 1; min-height: 0; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; gap: 10px; padding: 16px; }
.code textarea { width: 100%; height: 100%; resize: none; border: 1px solid var(--line-strong); border-radius: 8px; padding: 12px; background: var(--bg); color: var(--ink); font: 12px/1.55 var(--mono); }
.seg { display: inline-flex; padding: 2px; border-radius: 999px; background: var(--paper-deep); justify-self: start; }
.seg button { height: 26px; padding: 0 12px; border-radius: 999px; border: 0; background: transparent; color: var(--muted); font-size: 12px; }
.seg button[aria-pressed="true"] { background: var(--bg); color: var(--ink); box-shadow: 0 0 0 1px var(--line); }
.pill { height: 30px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--line); background: var(--bg); color: var(--body); font-size: 12.5px; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.pill:hover:not(:disabled) { border-color: var(--line-strong); color: var(--ink); }
.pill.on, .pill.primary { background: var(--ink); color: var(--bg); border-color: var(--ink); }
.pill.on:hover:not(:disabled), .pill.primary:hover:not(:disabled) { color: var(--bg); border-color: var(--ink); opacity: .9; }
.pill .logo { width: 16px; height: 16px; border-radius: 4px; flex: none; object-fit: contain; }
.pill .logo.mark { background: #0c8c5e; padding: 2px; }
.after { flex: 1; min-height: 0; overflow: auto; padding: 24px; display: flex; justify-content: center; background: var(--paper); }
.after .inner { width: min(600px, 100%); display: flex; flex-direction: column; gap: 14px; }
.card2 { border: 1px solid var(--line); border-radius: 10px; background: var(--bg); padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.card2 h3 { margin: 0; font-size: 14px; font-weight: 600; }
.rule { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; border-top: 1px solid var(--line); padding-top: 12px; }
.rule .w { color: var(--muted); font-size: 12px; }
.rule .in.num { width: 84px; height: 30px; }
.rule .in.txt { width: 160px; height: 30px; }
.who { display: flex; align-items: center; gap: 10px; }
.who p { flex: 1; min-width: 0; margin: 0; font-size: 12.5px; font-weight: 400; line-height: 1.5; color: var(--body); }
.arow { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.arow .w { color: var(--muted); font-size: 12px; min-width: 64px; }
.arow .in.wide { flex: 1; min-width: 180px; height: 30px; }
.arow .pill > span:first-child { display: inline-flex; }
.ib.sm { width: 18px; height: 18px; margin-right: -6px; }

/* Element panel */
.panel { flex: none; width: 288px; border-left: 1px solid var(--line); display: flex; flex-direction: column; min-height: 0; background: var(--bg); }
.ptabs { height: 44px; flex: none; display: flex; align-items: center; gap: 4px; padding: 0 10px; border-bottom: 1px solid var(--line); }
.ptabs .pt { height: 30px; padding: 0 10px; border: 0; border-radius: 999px; background: transparent; color: var(--muted); display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; }
.ptabs .pt[aria-selected="true"] { background: var(--paper-deep); color: var(--ink); }
.ptabs .who2 { margin-left: auto; font: 500 11px var(--mono); color: var(--muted); }
.pscroll { flex: 1; min-height: 0; overflow-y: auto; }
.sec { padding: 12px 14px; border-bottom: 1px solid var(--line); display: flex; flex-direction: column; gap: 10px; }
.sec h4 { margin: 0; font-size: 11px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--muted); }
.sel-head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.cls { height: 24px; padding: 0 9px; border-radius: 999px; background: var(--pick); color: #fff; font: 500 11.5px/24px var(--mono); }
.cls.off { background: var(--paper-deep); color: var(--muted); }
.icons { display: flex; gap: 2px; padding: 2px; background: var(--paper-deep); border-radius: 8px; }
.icons .ib { width: auto; flex: 1; height: 26px; border-radius: 6px; }
.icons .ib[aria-pressed="true"] { background: var(--bg); color: var(--ink); box-shadow: 0 0 0 1px var(--line); }
.g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.g3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; }
.num { position: relative; display: flex; align-items: center; height: 28px; border-radius: 6px; background: var(--paper-deep); }
.num .k { width: 22px; flex: none; text-align: center; color: var(--faint); font-size: 11px; font-weight: 600; cursor: ew-resize; }
.num input { flex: 1; min-width: 0; height: 100%; border: 0; background: transparent; color: var(--ink); font: 12px var(--sans); padding-right: 6px; }
.num input::placeholder { color: var(--faint); }
.num:focus-within { box-shadow: inset 0 0 0 1px var(--ink); }
.boxm { position: relative; border-radius: 8px; background: var(--paper-deep); padding: 22px 30px; display: flex; flex-direction: column; }
.boxp { position: relative; border-radius: 6px; background: var(--bg); box-shadow: 0 0 0 1px var(--line); padding: 22px 34px; display: flex; align-items: center; justify-content: center; }
.boxc { height: 22px; min-width: 56px; border-radius: 4px; background: var(--paper); box-shadow: 0 0 0 1px var(--line); font: 11px/22px var(--sans); color: var(--muted); text-align: center; padding: 0 6px; }
.bx { position: absolute; width: 34px; height: 18px; border: 0; background: transparent; color: var(--ink); font: 11px var(--sans); text-align: center; padding: 0; border-radius: 4px; }
.bx::placeholder { color: var(--faint); }
.bx:focus { background: var(--bg); box-shadow: 0 0 0 1px var(--ink); outline: 0; }
.bx.t { top: 2px; left: 50%; transform: translateX(-50%); } .bx.b { bottom: 2px; left: 50%; transform: translateX(-50%); }
.bx.l { left: 0; top: 50%; transform: translateY(-50%); } .bx.r { right: 0; top: 50%; transform: translateY(-50%); }
.bl { position: absolute; top: 3px; left: 7px; font-size: 9.5px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--faint); }
.colorrow { display: flex; align-items: center; gap: 8px; height: 28px; border-radius: 6px; background: var(--paper-deep); padding: 0 8px; border: 0; width: 100%; text-align: left; }
.dot { width: 16px; height: 16px; border-radius: 999px; box-shadow: inset 0 0 0 1px rgb(0 0 0 / .15); flex: none; overflow: hidden; }
.dot i { display: block; width: 100%; height: 100%; }
.colorrow .v { flex: 1; font-size: 12px; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.colorrow .v.ph { color: var(--faint); }
.pal { display: grid; grid-template-columns: repeat(6, 24px); gap: 6px; padding: 8px; }
.pal button { width: 24px; height: 24px; border-radius: 999px; border: 0; box-shadow: inset 0 0 0 1px rgb(0 0 0 / .15); }
.lbl { font-size: 12px; color: var(--muted); }
.row2 { display: grid; grid-template-columns: 76px minmax(0, 1fr); align-items: center; gap: 8px; }
.in { height: 28px; width: 100%; min-width: 0; border: 0; border-radius: 6px; padding: 0 8px; background: var(--paper-deep); color: var(--ink); font: 12px var(--sans); }
.in::placeholder { color: var(--faint); }
.in:focus { outline: 0; box-shadow: inset 0 0 0 1px var(--ink); }
.dd { height: 28px; width: 100%; min-width: 0; border: 0; border-radius: 6px; background: var(--paper-deep); color: var(--ink); display: flex; align-items: center; justify-content: space-between; gap: 4px; padding: 0 8px; font-size: 12px; text-align: left; }
.dd span:first-child { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sw { width: 32px; height: 18px; border-radius: 999px; border: 0; background: var(--line-strong); position: relative; padding: 0; flex: none; }
.sw::after { content: ""; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 999px; background: var(--bg); transition: transform .15s var(--ease); }
.sw[aria-checked="true"] { background: var(--ink); }
.sw[aria-checked="true"]::after { transform: translateX(14px); }
.opts { display: flex; flex-direction: column; gap: 4px; }
.opt { display: flex; gap: 4px; align-items: center; }
.cond { display: grid; grid-template-columns: 1fr 64px 1fr 24px; gap: 4px; align-items: center; }
.hint0 { color: var(--muted); font-size: 12px; line-height: 1.5; margin: 0; }

/* Floating: menus, the toast, the brand dialog */
.menu { position: fixed; z-index: 60; background: var(--bg); border-radius: 10px; padding: 4px; box-shadow: 0 0 0 1px var(--line), 0 12px 32px -12px rgb(0 0 0 / .3); display: flex; flex-direction: column; min-width: 200px; max-height: 420px; overflow-y: auto; }
.menu .search { height: 32px; margin: 4px; border: 1px solid var(--line-strong); border-radius: 6px; padding: 0 10px; background: var(--bg); color: var(--ink); font: inherit; }
.mrow { display: flex; align-items: center; gap: 2px; }
.mi { flex: 1; min-width: 0; height: 40px; display: flex; align-items: center; gap: 10px; padding: 0 10px; border: 0; border-radius: 6px; background: transparent; text-align: left; }
.mi:hover, .mi[aria-checked="true"] { background: var(--hover); }
.mi .nm { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mi.small { height: 32px; }
.msep { height: 1px; background: var(--line); margin: 4px 2px; }
.mdel { display: flex; align-items: center; gap: 6px; padding: 6px 10px; font-size: 12.5px; }
.mdel .q { flex: 1; }
.toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); background: var(--ink); color: var(--bg); padding: 10px 16px; border-radius: 999px; font-weight: 500; z-index: 80; }
.dlg { position: fixed; inset: 0; z-index: 75; background: var(--scrim); display: flex; align-items: center; justify-content: center; padding: 16px; }
.dlgbox { width: min(460px, 100%); max-height: calc(100% - 32px); overflow-y: auto; background: var(--bg); border-radius: 16px; padding: 20px; display: flex; flex-direction: column; gap: 14px; box-shadow: 0 24px 64px -24px rgb(0 0 0 / .5); }
.dlgbox h2 { margin: 0; font-size: 17px; font-weight: 600; }
.dlgbox .acts { display: flex; justify-content: flex-end; gap: 8px; }
.dlgbox .in { height: 36px; font-size: 13.5px; padding: 0 10px; }
.siteform { display: flex; gap: 8px; }
.siteform .pill { height: 36px; }
.confirm { display: flex; align-items: center; gap: 14px; border: 1px solid var(--line); border-radius: 10px; padding: 16px; }
.confirm img { height: 36px; max-width: 140px; object-fit: contain; }
.confirm .t { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.confirm .t span { color: var(--muted); font-size: 12.5px; }
.nameedit { font-size: 16px !important; font-weight: 600; }
.working { display: inline-flex; align-items: center; gap: 8px; color: var(--muted); font-size: 12.5px; }

@media (max-width: 900px) {
  .app { flex-direction: column; height: auto; }
  .chat, .chat.folded { width: auto; border-right: 0; border-bottom: 1px solid var(--line); }
  .chat.folded .chathead { justify-content: flex-start; padding: 0 12px; }
  .msgs { max-height: 40vh; }
  .bar { flex-wrap: wrap; height: auto; padding: 8px 12px; row-gap: 8px; }
  .work { flex-direction: column; }
  .navi { width: auto; border-right: 0; border-bottom: 1px solid var(--line); max-height: 220px; }
  .canvas { min-height: 70vh; padding: 12px; }
  .panel { width: auto; border-left: 0; border-top: 1px solid var(--line); }
}
@media (prefers-reduced-motion: reduce) { .chat, .frame { transition: none; } .live .sk span { animation: none; } }
`;

const SVG = (d, w = 16) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const P = {
  back: '<path d="m15 18-6-6 6-6"/>', link: '<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>', eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', cursor: '<path d="m4 4 7 17 2.5-7.5L21 11z"/>',
  code: '<path d="m8 7-5 5 5 5M16 7l5 5-5 5"/>', cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M9 15l2 2 4-4"/>', layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  desk: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>', tab: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M11 18h2"/>', phone: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>', redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>', restart: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  open: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>', panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  send: '<path d="M12 19V5M5 12l7-7 7 7"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>', chev: '<path d="m6 9 6 6 6-6"/>', plus: '<path d="M12 5v14M5 12h14"/>', del: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
  up: '<path d="m18 15-6-6-6 6"/>', down: '<path d="m6 9 6 6 6-6"/>', dup: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>', parent: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v5"/>',
  style: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.4A4.6 4.6 0 0 0 21 9.8C21 6 17 3 12 3z"/>', set: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  block: '<rect x="4" y="5" width="16" height="14" rx="2"/>', row: '<rect x="3" y="7" width="7" height="10" rx="1.5"/><rect x="14" y="7" width="7" height="10" rx="1.5"/>', col: '<rect x="6" y="3" width="12" height="7" rx="1.5"/><rect x="6" y="14" width="12" height="7" rx="1.5"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>', none: '<circle cx="12" cy="12" r="8"/><path d="m6.5 17.5 11-11"/>',
  al: '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>', ac: '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>', ar: '<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>',
  js: '<path d="M4 4v16"/><rect x="8" y="7" width="6" height="10" rx="1"/>', jc: '<path d="M12 4v16"/><rect x="7" y="7" width="10" height="10" rx="1"/>', je: '<path d="M20 4v16"/><rect x="10" y="7" width="6" height="10" rx="1"/>', jb: '<path d="M4 4v16M20 4v16"/><rect x="8" y="7" width="3" height="10" rx="1"/><rect x="13" y="7" width="3" height="10" rx="1"/>',
  case0: '<path d="M4 18 8 6l4 12M5.5 14h5M15 18v-6a2.5 2.5 0 0 1 5 0v6M15 15h5"/>', caseU: '<path d="M3 18 7 6l4 12M4.5 14h5M14 18 17 6l4 12M15 14h5"/>', caseL: '<path d="M8 18v-5a2.5 2.5 0 0 1 5 0v5M8 15h5M16 9v9"/>',
  check: '<path d="m5 12 5 5 9-10"/>', stop: "", clip: '<path d="m21 11-8.6 8.6a5 5 0 0 1-7-7l8.6-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9"/>', globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
};

export const STUDIO_HTML = `
<div class="app" id="app">
  <section class="chat" id="chat" aria-label="Chat with Tia">
    <div class="chathead">
      <button class="chatpick" id="chatPick" aria-haspopup="menu" aria-expanded="false" aria-label="Chats"></button>
      <button class="ib foldbtn tipleft" id="chatFold"></button>
    </div>
    <div class="brandrow"><button class="brandbtn" id="brandBtn" aria-haspopup="menu" aria-label="Brand"></button><button class="profile" id="profileBtn" aria-haspopup="menu" aria-label="Industry, country and language" hidden></button><div class="bstatus" id="brandStatus" hidden></div></div>
    <div class="msgs" id="msgs" aria-live="polite"></div>
    <div class="compose">
      <div class="about" id="about" hidden><span id="aboutText"></span><button id="aboutX" aria-label="Not about this element">${SVG(P.x, 12)}</button></div>
      <div class="chips" id="attached" hidden></div>
      <div class="box"><button class="ib attach" id="attachBtn" data-tip="Attach a picture, PDF or text file" aria-label="Attach a file">${SVG(P.clip, 16)}</button><input type="file" id="fileIn" multiple accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,.txt,.csv,.md,.json,text/plain,text/csv,text/markdown" hidden><textarea id="input" rows="1" aria-label="Message"></textarea><button class="send" id="send" aria-label="Send">${SVG(P.send, 15)}</button></div>
    </div>
  </section>
  <section class="stage" aria-label="Form">
    <div class="bar">
      <div class="grp" role="tablist" aria-label="View">
        <button class="ib" role="tab" id="t-preview" data-tip="Preview" aria-label="Preview">${SVG(P.eye)}</button>
        <button class="ib" role="tab" id="t-edit" data-tip="Edit" aria-label="Edit">${SVG(P.cursor)}</button>
        <button class="ib" role="tab" id="t-code" data-tip="Code" aria-label="Code">${SVG(P.code)}</button>
        <button class="ib" role="tab" id="t-after" data-tip="On submission" aria-label="On submission">${SVG(P.cal)}</button>
      </div>
      <button class="ib" id="navBtn" data-tip="Layers" aria-label="Layers" aria-pressed="false" hidden>${SVG(P.layers)}</button>
      <span class="spacer"></span>
      <div class="grp" role="group" aria-label="Device">
        <button class="ib" id="d-desk" data-tip="Desktop" aria-label="Desktop" aria-pressed="true">${SVG(P.desk)}</button>
        <button class="ib" id="d-tab" data-tip="Tablet" aria-label="Tablet" aria-pressed="false">${SVG(P.tab)}</button>
        <button class="ib" id="d-phone" data-tip="Phone" aria-label="Phone" aria-pressed="false">${SVG(P.phone)}</button>
      </div>
      <button class="langbtn" id="langBtn" data-tip="Languages" aria-label="Languages" aria-haspopup="menu"></button>
      <span class="vsep"></span>
      <button class="ib" id="undo" data-tip="Undo" aria-label="Undo" disabled>${SVG(P.undo)}</button>
      <button class="ib" id="redo" data-tip="Redo" aria-label="Redo" disabled>${SVG(P.redo)}</button>
      <button class="ib" id="restart" data-tip="Back to step 1" aria-label="Back to step 1">${SVG(P.restart)}</button>
      <a class="ib tipleft" id="openBtn" data-tip="Open the live form" aria-label="Open the live form" target="_blank" rel="noopener" hidden>${SVG(P.open)}</a>
    </div>
    <div class="stepbar" id="stepBar" role="toolbar" aria-label="Steps" hidden></div>
    <div class="work" id="work">
      <aside class="navi" id="navi" aria-label="Layers" hidden><div class="ptitle">Layers</div><div class="tree" id="tree"></div></aside>
      <div class="canvas" id="canvas">
        <div class="frame" id="frame">
          <div id="host"></div>
          <div class="empty" id="empty" hidden><div class="sk" aria-hidden="true"><span style="width:55%;height:16px"></span><span style="width:80%"></span><span class="b2"></span><span style="width:30%"></span><span class="b2"></span><span class="bt2"></span></div><span id="emptyText">Your form shows here as Tia builds it</span></div>
          <div class="ov" id="hov" hidden><span id="hovtag"></span></div>
          <div class="ov" id="sel" hidden><span id="seltag"></span></div>
          <div id="fbar" hidden></div>
        </div>
      </div>
      <div class="code" id="codeView" hidden>
        <div class="seg" role="group" aria-label="File"><button id="c-html" aria-pressed="true">HTML</button><button id="c-css" aria-pressed="false">Form CSS</button><button id="c-brand" aria-pressed="false">Brand CSS</button></div>
        <textarea id="codeText" spellcheck="false" aria-label="Code"></textarea>
        <div><button class="pill primary" id="codeApply">Apply</button></div>
      </div>
      <div class="after" id="afterView" hidden><div class="inner" id="afterInner"></div></div>
      <aside class="panel" id="panel" aria-label="Element" hidden>
        <div class="ptabs" role="tablist">
          <button class="pt" role="tab" id="p-style" aria-selected="true">${SVG(P.style, 14)}Style</button>
          <button class="pt" role="tab" id="p-set" aria-selected="false">${SVG(P.set, 14)}Settings</button>
          <span class="who2" id="selName"></span>
        </div>
        <div class="pscroll" id="pscroll"></div>
      </aside>
    </div>
  </section>
</div>
<div id="layer"></div>`;

export type StudioBrand = { id: string; name: string; site: string; logo: string | null; css: string; profile?: { industry: string; language: string; country: string; languages: string[] } | null };
export type StudioMeeting = { id: string; name: string; length: number; dynamic?: boolean; who?: string };
export type StudioChat = { id: string; name: string; state: "new" | "draft" | "live" | "changed"; brandId: string; formId: string; updatedAt?: string; brandCss?: string; body?: { html: string; css: string; after: unknown; turns: unknown[]; log: unknown[] } };
export type StudioSend = { id: string; kind: string; name: string; domain: string | null };

export type StudioApi = {
  brands(): Promise<StudioBrand[]>;
  meetings(): Promise<StudioMeeting[]>;
  readSite(host: string): Promise<{ url: string; site: string; name: string; logo: string | null; logoUrl: string | null; logoSvg: string | null }>;
  scan(host: string): Promise<{ kitId: string }>;
  kit(id: string): Promise<{ name: string; logo: string | null; logoUrl: string | null; logoSvg: string | null; scanStatus: string | null } | null>;
  confirm(b: { url: string; name: string; logoUrl: string | null; logoSvg: string | null }): Promise<{ kitId: string }>;
  look(kitId: string, fresh: boolean): Promise<{ css: string; say: string; profile?: StudioBrand["profile"] }>;
  keepProfile(kitId: string, profile: NonNullable<StudioBrand["profile"]>): void;
  keepCss(kitId: string, css: string): void;
  deleteBrand(id: string): Promise<void>;
  /** Every chat, newest first, with or without its body. */
  chats(): Promise<StudioChat[]>;
  /** One chat with its body. */
  chat(id: string): Promise<StudioChat | null>;
  /** A published form that has no chat yet, as a chat (the forms from the Studio's first version). */
  fromForm(formId: string): Promise<StudioChat | null>;
  saveChat(c: StudioChat): Promise<void>;
  deleteChat(id: string): Promise<void>;
  /** brand: the chat's brand block (cached on the server); built: a change to a built form; files: attached to this message. */
  tia(turns: { role: "user" | "assistant"; content: string }[], onText: (all: string) => void, signal: AbortSignal, o?: { brand?: string; built?: boolean; files?: { name: string; type: string; data: string }[] }): Promise<{ text: string; cut: boolean }>;
  /** A meeting type's real open times (epoch ms starts) and its length, for the preview's calendar. */
  times(typeId: string): Promise<{ starts: number[]; length: number }>;
  /** The form's words in another language, in the same order. */
  translate(texts: string[], lang: string): Promise<string[]>;
  publish(p: { formId: string | null; name: string; html: string; css: string; brand: string; after: unknown; kitId: string; lang?: string; langs?: Record<string, string> }): Promise<{ formId: string; problem?: string }>;
  formUrl(id: string): string;
  openMeetings(): void;
  /** One meeting type, open in its panel (Edit routing). */
  openMeeting(id: string): void;
  /** Keep the form as a draft without publishing, for what needs its id (Send to, Follow-ups). */
  saveDraft(p: { formId: string | null; name: string; html: string; css: string; brand: string; after: unknown; kitId: string; lang?: string; langs?: Record<string, string> }): Promise<{ formId: string }>;
  /** Where the form's sends go besides Claritia: CRMs and webhooks. */
  sends(formId: string): Promise<StudioSend[]>;
  /** Connected tools a form can send to. */
  tools(): Promise<StudioSend[]>;
  addSend(formId: string, to: StudioSend | "webhook"): Promise<boolean>;
  removeSend(d: StudioSend): Promise<boolean>;
  /** Workflows that start on this form. */
  followUps(formId: string): Promise<{ id: string; name: string; status: string }[]>;
  newFollowUp(formId: string, when: "sent" | "not_booked"): void;
  openWorkflow(id: string): void;
  /** The page's header draws the state, the form check and Publish (docs/form-ui-plan.md step 1). */
  onState?(s: StudioState): void;
  /** Where to start: a published form's chat, one chat, a new chat (New form), or the last one. */
  start: { formId?: string; chatId?: string; fresh?: boolean };
};

export type StudioIssue = { level: "error" | "warning"; text: string; fix?: string; after?: boolean };
/** What the header shows: the open chat and its form, whether it can publish, and the form check. */
export type StudioState = { ready: boolean; chatId: string; formId: string; name: string; state: "new" | "draft" | "live" | "changed"; canPublish: boolean; publishing: boolean; issues: StudioIssue[]; canFix: boolean; msg: string };
/** What the header can ask of the Studio. */
export type StudioControl = {
  stop(): void;
  /** Publish once the form check passes: "blocked" when it found problems (they're in the state's issues). */
  publish(): Promise<"live" | "blocked" | "failed">;
  /** Hand fixes to Tia in the chat. */
  fix(fixes: string[]): void;
  /** Open On submission. */
  openAfter(): void;
  rename(name: string): void;
};

export function mountStudio(shell: ShadowRoot, api: StudioApi): StudioControl {
  const $ = (id) => shell.getElementById(id);
  const h = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "text") e.textContent = v;
      else if (k === "html") e.innerHTML = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? "" : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) e.append(c);
    return e;
  };
  const off = [];
  const listen = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); off.push(() => t.removeEventListener(ev, fn, o)); };
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));
  let alive = true;

  // ── State ─────────────────────────────────────────────────────────────────────────────────────────────
  let brands = [];
  let MEETINGS = [];
  let chats = [];
  let cur = null;
  let loaded = false;
  const looking = new Set();
  const S = { view: 0, hold: "", lang: "", translating: "", mode: "preview", device: "desk", sel: null, about: null, busy: false, ptab: "style", scope: "class", nav: false, file: "html", publishing: false, pubMsg: "" };
  const hist = {};
  const H = () => (hist[cur?.id || "-"] ||= { past: [], future: [] });
  const brandOf = (c) => brands.find((b) => b.id === c?.brandId) || null;
  const blank = (brandId) => ({ id: uuid(), name: "New form", state: "new", brandId: brandId || "", formId: "", body: { html: "", css: "", after: { kind: "thanks", url: "", meeting: MEETINGS[0]?.id || "", routes: [] }, turns: [], log: [], ids: {}, langs: {}, langFrom: {}, lang: "" } });
  const body = () => cur.body;

  // Saved a second after the last change, and when the page closes.
  let saveT = 0;
  function save(now) {
    if (!cur) return;
    cur.updatedAt = new Date().toISOString();
    const c = cur;
    clearTimeout(saveT);
    const go = () => api.saveChat({ id: c.id, name: c.name, state: c.state, brandId: c.brandId, formId: c.formId, body: c.body }).catch(() => {});
    if (now) go();
    else saveT = setTimeout(go, 1000);
  }

  // ── The form's source tree ────────────────────────────────────────────────────────────────────────────
  let src = document.createElement("div");
  let kSeq = 0;
  const DROP = "script,iframe,frame,frameset,object,embed,link,meta,base,noscript,template,portal";
  function clean(html) {
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
    doc.body.querySelectorAll(DROP).forEach((n) => n.remove());
    doc.body.querySelectorAll("*").forEach((el) => {
      for (const a of [...el.attributes]) {
        const n = a.name.toLowerCase(), v = a.value.trim().toLowerCase();
        if (n.startsWith("on") || n === "action" || n === "formaction" || n === "srcdoc" || (["href", "src", "xlink:href", "poster"].includes(n) && (/^(javascript|vbscript):/.test(v) || (v.startsWith("data:") && !v.startsWith("data:image/"))))) el.removeAttribute(a.name);
      }
      if (el.tagName === "FORM") el.setAttribute("novalidate", "");
    });
    return doc.body;
  }
  function setSource(html) { src = clean(html || ""); src.querySelectorAll("*").forEach((el) => el.setAttribute("data-k", String(++kSeq))); ensureIds(); }
  // Each question keeps its field id (data-cl-id) when it's renamed or Tia writes the page again, so past answers, the
  // CRM link and reports keep working (docs/studio-v2-plan.md 6.6).
  function ensureIds() {
    if (!cur) return;
    const ids = (cur.body.ids ||= {});
    const used = new Set([...src.querySelectorAll("[data-cl-id]")].map((e) => e.getAttribute("data-cl-id")));
    const groups = new Map();
    src.querySelectorAll("input[name],textarea[name],select[name]").forEach((el) => { if (el.type === "hidden" || el.type === "submit") return; if (!groups.has(el.name)) groups.set(el.name, []); groups.get(el.name).push(el); });
    src.querySelectorAll("[data-cl-field][data-cl-name]").forEach((el) => { const n = el.getAttribute("data-cl-name"); if (!groups.has(n)) groups.set(n, []); groups.get(n).push(el); });
    const make = (name) => { let base = name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20) || "q"; if (!/^[a-z]/.test(base)) base = `q${base}`.slice(0, 20); let id = base; for (let i = 2; used.has(id); i++) id = `${base.slice(0, 18)}${i}`; return id; };
    for (const [name, els] of groups) {
      let id = els.map((e) => e.getAttribute("data-cl-id")).find((x) => /^[a-z][a-z0-9]{0,23}$/.test(x || ""));
      if (!id) { id = ids[name] && /^[a-z][a-z0-9]{0,23}$/.test(ids[name]) && !used.has(ids[name]) ? ids[name] : make(name); used.add(id); }
      els.forEach((e) => e.setAttribute("data-cl-id", id));
      ids[name] = id;
    }
  }
  function sourceHtml() { const c = src.cloneNode(true); c.querySelectorAll("[data-k]").forEach((e) => e.removeAttribute("data-k")); return c.innerHTML.trim(); }
  const byK = (k) => src.querySelector(`[data-k="${k}"]`);
  const built = () => !!src.firstElementChild;

  const IMPORT = /@import\s+(?:url\(\s*(["']?)([^"')]+)\1\s*\)|(["'])([^"']+)\3)[^;\n]*;?/gi;
  const fontsOn = new Set();
  function cssFor(css) {
    const out = String(css || "").replace(IMPORT, (_m, _a, u1, _b, u2) => {
      const u = (u1 || u2 || "").trim();
      if (/^https:\/\/fonts\.googleapis\.com\//.test(u) && !fontsOn.has(u)) { fontsOn.add(u); document.head.append(h("link", { rel: "stylesheet", href: u })); }
      return "";
    });
    return out.replace(/(^|[\s,{}])(?::root|html|body)(?=[\s,{:.\[])/g, "$1:host").replace(/expression\s*\(|javascript:|behavior\s*:|-moz-binding/gi, "x-blocked:").replace(/<\/?style[^>]*>/gi, "");
  }

  // ── Drawing ───────────────────────────────────────────────────────────────────────────────────────────
  const host = $("host");
  const root = host.attachShadow({ mode: "open" });
  const BASE = `${ACCESS_CSS}.cl-bookph{border:1px dashed rgba(127,127,127,.6);border-radius:10px;padding:18px;text-align:center;font:500 12px system-ui,sans-serif;opacity:.7}.cl-divider{font:600 11px/1 system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#7a7a7a;border-top:1px dashed rgba(127,127,127,.55);padding:10px 0 0;margin:20px 0 10px}.cl-edit [data-cl-if]{outline:1px dashed rgba(109,40,217,.55);outline-offset:3px}.cl-edit [data-cl-if]::before{content:attr(data-cl-if);display:block;width:max-content;max-width:100%;font:500 11px/1.7 system-ui,sans-serif;color:#6d28d9;background:rgba(109,40,217,.08);border-radius:4px;padding:0 6px;margin-bottom:6px;white-space:normal}.cl-block{display:flex;flex-direction:column;gap:8px}.cl-two{display:grid;grid-template-columns:1fr 1fr;gap:8px}.cl-addr{display:flex;flex-direction:column;gap:8px}.cl-rate{display:flex;gap:6px;font-size:26px;line-height:1;opacity:.6}.cl-num{font-size:14px;border:1px solid currentColor;border-radius:8px;padding:8px 12px}.cl-sign{min-height:110px}
.cl-consent{display:flex;gap:8px;align-items:flex-start;font-size:13px;line-height:1.4;opacity:.85}.cl-consent input{margin:2px 0 0}
:host{all:initial;display:flex;flex-direction:column;flex:1}*,*::before,*::after{box-sizing:border-box}[hidden]{display:none!important}.cl-root{flex:1;min-height:560px;display:flex;flex-direction:column}.cl-root>*{flex:1 0 auto}
${CAL_CSS}
.cl-edit [data-k]{cursor:default}.cl-edit [contenteditable]{outline:none;cursor:text}`;
  let stepAt = 0, done = false;
  function draw() {
    const has = built();
    $("empty").hidden = has;
    host.hidden = !has;
    root.innerHTML = "";
    if (!has) { runCheck(); return overlay(); }
    const st = document.createElement("style");
    st.textContent = `${BASE}\n/* brand */\n${cssFor(brandOf(cur)?.css || S.hold)}\n/* form */\n${cssFor(body().css)}`;
    const wrap = h("div", { class: S.mode === "edit" ? "cl-root cl-edit" : "cl-root" });
    // Another language shows as written (Preview only; Edit and Code work on the form's own language).
    const other = S.mode !== "edit" && S.lang && body().langs?.[S.lang];
    if (other) wrap.innerHTML = clean(other).innerHTML;
    else wrap.append(...[...src.cloneNode(true).childNodes]);
    const lang = other ? S.lang : mainLang();
    if (lang) { wrap.setAttribute("lang", lang); wrap.setAttribute("dir", isRtl(lang) ? "rtl" : "ltr"); }
    root.append(st, wrap);
    const logo = brandOf(cur)?.logo;
    wrap.querySelectorAll("img[data-cl-logo]").forEach((img) => { if (logo) img.setAttribute("src", logo); else img.hidden = true; });
    // Claritia blocks, as the live form draws them (the form script fills them with its own inputs).
    wrap.querySelectorAll("[data-cl-field]").forEach((hd) => hd.replaceChildren(blockPreview(hd)));
    // The consent line every form shows where the law asks for it, as the live form draws it.
    const sendBtn = [...wrap.querySelectorAll("[type=submit]")].find((b) => !b.closest("[data-cl-thanks]"));
    if (sendBtn) consentSpot(sendBtn, wrap).before(h("label", { class: "check cl-consent" }, h("input", { type: "checkbox", tabindex: "-1" }), h("span", { text: DEFAULT_CONSENT })));
    if (S.mode === "edit") {
      // Each part shown only if an answer says so wears its condition in words.
      wrap.querySelectorAll("[data-cl-show-if]").forEach((el) => { if (!el.hasAttribute("data-cl-step")) el.setAttribute("data-cl-if", ifWords(el.getAttribute("data-cl-show-if"))); });
      // The booking spot, which the calendar fills after the send.
      wrap.querySelectorAll("[data-cl-book]").forEach((x) => x.replaceChildren(h("div", { class: "cl-bookph", text: "Booking calendar" })));
      // All steps at once: a divider names each.
      if (S.view === "all") {
        stepsIn(wrap).forEach((st, i) => st.before(h("div", { class: "cl-divider", text: `Step ${i + 1}: ${stepName(st, i)}` })));
        wrap.querySelector("[data-cl-thanks]")?.before(h("div", { class: "cl-divider", text: "Thank-you" }));
      }
    }
    run(wrap);
    stepUi();
    requestAnimationFrame(overlay);
    runCheck();
  }
  const live = (k) => root.querySelector(`[data-k="${k}"]`);
  const BLOCK_NAMES = { file: "File upload", phone: "Phone", address: "Address", date: "Date", time: "Time", daterange: "Date range", rating: "Rating", signature: "Signature", country: "Country" };
  function blockPreview(hd) {
    const type = hd.getAttribute("data-cl-field");
    const label = hd.getAttribute("data-cl-label") || hd.getAttribute("data-cl-name") || BLOCK_NAMES[type] || "";
    const inp = (a) => h("input", { class: "field", tabindex: "-1", ...a });
    const box = h("div", { class: "cl-block" }, h("label", { class: "label", text: `${label}${hd.hasAttribute("data-cl-required") ? " *" : ""}` }));
    if (type === "file") box.append(inp({ type: "file" }));
    else if (type === "phone") box.append(inp({ type: "tel", placeholder: "+1 555 123 4567" }));
    else if (type === "date") box.append(inp({ type: "date" }));
    else if (type === "time") box.append(inp({ type: "time" }));
    else if (type === "daterange") box.append(h("div", { class: "cl-two" }, inp({ type: "date" }), inp({ type: "date" })));
    else if (type === "address") box.append(h("div", { class: "cl-addr" }, inp({ placeholder: "Street address" }), h("div", { class: "cl-two" }, inp({ placeholder: "City" }), inp({ placeholder: "Postcode" })), inp({ placeholder: "Country" })));
    else if (type === "country") box.append(inp({ placeholder: "Country" }));
    else if (type === "rating") { const n = Math.min(10, Math.max(3, Number(hd.getAttribute("data-cl-scale")) || 5)); const nums = hd.getAttribute("data-cl-style") === "numbers"; box.append(h("div", { class: "cl-rate" }, ...Array.from({ length: n }, (_, i) => h("span", { class: nums ? "cl-num" : "", text: nums ? String(i + 1) : "\u2605" })))); }
    else if (type === "signature") box.append(h("div", { class: "field cl-sign" }));
    return box;
  }

  // The form's own rules, the same contract the form script runs (src/lib/studio/runtime.ts).
  function values(w) { const v = {}; w.querySelectorAll("input[name],textarea[name],select[name]").forEach((el) => { const n = el.name; if (el.type === "radio") { if (el.checked) v[n] = el.value; else if (!(n in v)) v[n] = ""; } else if (el.type === "checkbox") { v[n] = v[n] || []; if (el.checked) v[n].push(el.value === "on" ? "yes" : el.value); } else v[n] = el.value.trim(); }); return v; }
  function holds(expr, v) { return expr.split(/\s+or\s+/i).some((p) => p.split(/\s+and\s+/i).every((c) => clause(c.trim(), v))); }
  function clause(c, v) {
    let m = /^([\w-]+)\s+(filled|empty)$/i.exec(c);
    if (m) { const x = v[m[1]]; const f = Array.isArray(x) ? x.length > 0 : !!x; return m[2].toLowerCase() === "filled" ? f : !f; }
    m = /^([\w-]+)\s+in\s+\((.*)\)$/i.exec(c);
    if (m) { const list = [...m[2].matchAll(/'([^']*)'|"([^"]*)"|([^,\s]+)/g)].map((y) => y[1] ?? y[2] ?? y[3]); const x = v[m[1]]; return Array.isArray(x) ? x.some((y) => list.includes(y)) : list.includes(x); }
    m = /^([\w-]+)\s*(==|!=|>=|<=|>|<)\s*(?:'([^']*)'|"([^"]*)"|(\S+))$/.exec(c);
    if (!m) return true;
    const x = v[m[1]], val = m[3] ?? m[4] ?? m[5], list = Array.isArray(x) ? x : [x ?? ""];
    if (m[2] === "==") return list.includes(val);
    if (m[2] === "!=") return !list.includes(val);
    const n = Number(list[0]), t = Number(val);
    if (!Number.isFinite(n) || !Number.isFinite(t)) return false;
    return m[2] === ">" ? n > t : m[2] === "<" ? n < t : m[2] === ">=" ? n >= t : n <= t;
  }
  function run(w) {
    linkErrors(w);
    const steps = [...w.querySelectorAll("[data-cl-step]")], thanks = w.querySelector("[data-cl-thanks]"), editing = S.mode === "edit";
    const apply = () => {
      const v = values(w);
      w.querySelectorAll("[data-cl-show-if]").forEach((el) => { if (!el.hasAttribute("data-cl-step")) el.hidden = !editing && !holds(el.getAttribute("data-cl-show-if"), v); });
      const shown = steps.filter((s) => !s.hasAttribute("data-cl-show-if") || holds(s.getAttribute("data-cl-show-if"), v));
      if (stepAt >= steps.length) stepAt = 0;
      // Edit shows the step picked in the step bar (or all of them); Preview runs the form.
      const view = S.view;
      steps.forEach((s, i) => (s.hidden = editing ? !(view === "all" || view === i) : done || i !== stepAt));
      if (thanks) thanks.hidden = editing ? !(view === "all" || view === "thanks") : !done;
      // A one-page form: its thank-you takes its place once sent, and in Edit when the thank-you is picked.
      if (thanks && !steps.length && ((editing && view === "thanks") || (!editing && done))) for (const x of around(thanks, w)) x.hidden = true;
      const pos = shown.indexOf(steps[stepAt]);
      const p = steps.length ? (done ? 1 : (Math.max(0, pos) + 1) / Math.max(1, shown.length)) : done ? 1 : 0;
      w.querySelectorAll("[data-cl-progress]").forEach((el) => el.style.setProperty("--cl-progress", String(editing ? 0.5 : p)));
      return shown;
    };
    const check = (scope) => {
      let ok = true; const seen = new Set();
      for (const el of scope.querySelectorAll("input[name],textarea[name],select[name]")) {
        if (el.closest("[hidden]") || seen.has(el.name)) continue; seen.add(el.name);
        const group = [...scope.querySelectorAll(`[name="${CSS.escape(el.name)}"]`)].filter((x) => !x.closest("[hidden]"));
        const filled = el.type === "radio" || el.type === "checkbox" ? group.some((x) => x.checked) : !!el.value.trim();
        const msg = group.some((x) => x.required) && !filled ? "Fill this in." : el.type === "email" && el.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value) ? "Enter a valid email." : "";
        group.forEach((x) => x.setAttribute("aria-invalid", msg ? "true" : "false"));
        const er = w.querySelector(`[data-cl-error-for="${CSS.escape(el.name)}"]`); if (er) er.textContent = msg;
        if (msg) ok = false;
      }
      return ok;
    };
    const move = (dir) => { const shown = apply(); let i = stepAt + dir; while (i >= 0 && i < steps.length && !shown.includes(steps[i])) i += dir; if (i >= 0 && i < steps.length) stepAt = i; apply(); };
    w.addEventListener("input", apply); w.addEventListener("change", apply);
    w.addEventListener("click", (e) => {
      if (editing) return;
      const t = e.target.closest?.("[data-cl-next],[data-cl-back],[type=submit]");
      if (!t) return;
      e.preventDefault();
      if (t.hasAttribute("data-cl-back")) return move(-1);
      if (t.hasAttribute("data-cl-next")) { if (check(steps[stepAt] || w)) move(1); return; }
      if (check(w)) { done = true; apply(); booking(w, values(w)); }
    });
    w.addEventListener("submit", (e) => e.preventDefault());
    apply();
    if (done && !editing) booking(w, values(w));
  }
  // After the send in the preview: the page, or a sample of the booking calendar for the meeting the answers pick.
  // Real open times per meeting type, read once a minute at most.
  const timesCache = new Map();
  const timesFor = (id) => { const hit = timesCache.get(id); if (hit && Date.now() - hit.at < 60_000) return hit.p; const p = api.times(id).catch(() => null); timesCache.set(id, { at: Date.now(), p }); return p; };
  function booking(w, v) {
    const a0 = body().after;
    const spot0 = w.querySelector("[data-cl-book]") || w.querySelector("[data-cl-thanks]");
    // An outside scheduler opens in the form, as it will live.
    if (a0.kind === "meeting" && a0.tool && a0.tool !== "claritia" && spot0) {
      spot0.hidden = false;
      spot0.replaceChildren(!linkProblem(a0.tool, a0.link || "") ? h("iframe", { src: a0.link, title: "Book a meeting", style: "width:100%;min-height:640px;border:0", loading: "lazy" }) : h("p", { class: "text", text: "Add the scheduler's link in On submission." }));
      return;
    }
    if (a0.kind === "meeting" && spot0) return realCalendar(w, v, spot0);
    return sampleCalendar(w);
  }
  // Claritia's calendar with the meeting type's real open times, in the brand's classes, as the live form draws it.
  async function realCalendar(w, v, spot) {
    const a = body().after;
    // The same rows the live form runs; past fills aren't known in the preview, so those rows wait.
    const routes = (a.routes || []).map(cleanRoute).filter(Boolean);
    const m = MEETINGS.find((x) => x.id === routeMeeting(routes, a.meeting, v, cleanPage(sourceHtml()).questions)) || MEETINGS[0];
    spot.hidden = false;
    if (!m) return spot.replaceChildren(h("p", { class: "text", text: "No meeting types yet." }));
    spot.replaceChildren(h("p", { class: "text", text: "\u2026" }));
    const t = await timesFor(m.id);
    if (!spot.isConnected) return;
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const fmt = (ms, o) => new Intl.DateTimeFormat(undefined, { timeZone: zone, ...o }).format(ms);
    const days = [];
    for (const s of t?.starts || []) { const k = fmt(s, { year: "numeric", month: "2-digit", day: "2-digit" }); let d = days.find((x) => x.k === k); if (!d) { if (days.length >= 14) continue; d = { k, starts: [] }; days.push(d); } d.starts.push(s); }
    // The same calendar the live form draws in a studio page (CAL_CSS), with the meeting's real open times.
    const cal = h("div", { class: "cl-cal" }, h("div", { class: "cl-host" }, h("div", {}, h("b", { text: m.name }), h("small", { text: `${t?.length || m.length} min` }))));
    if (!days.length) { cal.append(h("p", { class: "text", text: t ? "No open times right now." : "Couldn't read the open times." })); return spot.replaceChildren(cal); }
    let pick = days[0], more = false;
    const dRow = h("div", { class: "cl-days", role: "group", "aria-label": "Day" }), tRow = h("div", { class: "cl-times", role: "group", "aria-label": "Times" }), moreBtn = h("button", { type: "button", class: "cl-link" });
    const drawDays = () => dRow.replaceChildren(...days.map((d) => h("button", { type: "button", class: `${d === pick ? "btn" : "btn-secondary"} cl-day`, "aria-pressed": String(d === pick), onclick: () => { pick = d; more = false; drawDays(); drawTimes(); } }, h("small", { text: fmt(d.starts[0], { weekday: "short" }) }), h("strong", { text: fmt(d.starts[0], { month: "short", day: "numeric" }) }))));
    const drawTimes = () => {
      const shown = more ? pick.starts : pick.starts.slice(0, 9);
      tRow.replaceChildren(...shown.map((s) => h("button", { type: "button", class: "btn-secondary cl-time", text: fmt(s, { hour: "numeric", minute: "2-digit" }), onclick: () => cal.replaceChildren(h("h3", { class: "heading", text: "You're booked" }), h("p", { class: "text", text: `${fmt(s, { weekday: "long", month: "long", day: "numeric" })}, ${fmt(s, { hour: "numeric", minute: "2-digit" })}. Preview only: nothing was booked.` })) })));
      moreBtn.hidden = shown.length >= pick.starts.length;
      moreBtn.textContent = `${pick.starts.length - shown.length} more times`;
    };
    moreBtn.onclick = () => { more = true; drawTimes(); };
    drawDays(); drawTimes();
    cal.append(dRow, tRow, moreBtn, h("div", { class: "cl-zone" }, h("span", { text: `Times in ${zoneWords(zone)}` })));
    spot.replaceChildren(cal);
  }

  // After the send to a page: the preview says where it goes.
  function sampleCalendar(w) {
    const a = body().after;
    const spot = w.querySelector("[data-cl-book]") || w.querySelector("[data-cl-thanks]");
    if (a.kind === "page" && spot) spot.append(h("p", { class: "text", text: `Then the visitor opens ${a.url || "your page"}` }));
  }


  // ── Edit on the form: hover tags, pick, type in place, the floating bar ─────────────────────────────────
  const NAMES = { H1: "Heading", H2: "Heading", H3: "Heading", H4: "Heading", P: "Text", SPAN: "Text", LABEL: "Label", BUTTON: "Button", INPUT: "Input", TEXTAREA: "Text box", SELECT: "Dropdown", IMG: "Logo", FORM: "Form", SECTION: "Step", DIV: "Box", I: "Fill", B: "Text", STRONG: "Text", EM: "Text", A: "Link", UL: "List", LI: "Item", FIELDSET: "Group", LEGEND: "Heading" };
  const nameOf = (el) => { if (!el) return ""; if (el.hasAttribute?.("data-cl-field")) return BLOCK_NAMES[el.getAttribute("data-cl-field")] || "Block"; if (el.matches?.("label.choice,label.check")) return "Choice"; if (el.hasAttribute?.("data-cl-step")) return "Step"; if (el.hasAttribute?.("data-cl-thanks")) return "Thanks"; if (el.hasAttribute?.("data-cl-book")) return "Booking"; return NAMES[el.tagName] || "Box"; };
  const leaf = (el) => el && !el.children.length && !["INPUT", "IMG", "TEXTAREA", "SELECT", "BR", "HR"].includes(el.tagName) && el.textContent.trim();
  const kOf = (e) => e.composedPath().find((n) => n instanceof Element && n.hasAttribute?.("data-k"));
  let editingK = null;
  root.addEventListener("mousemove", (e) => { if (S.mode !== "edit") return; const el = kOf(e); place($("hov"), el && el.getAttribute("data-k") !== S.sel ? el : null, $("hovtag")); });
  root.addEventListener("mouseleave", () => ($("hov").hidden = true));
  root.addEventListener("click", (e) => {
    if (S.mode !== "edit") return;
    const el = kOf(e);
    if (!el || el.isContentEditable) return;
    e.preventDefault(); e.stopPropagation();
    const k = el.getAttribute("data-k");
    if (k === S.sel && leaf(el)) return typeIn(el);
    select(k);
  }, true);
  root.addEventListener("dblclick", (e) => { if (S.mode !== "edit") return; const el = kOf(e); if (el && leaf(el)) { e.preventDefault(); select(el.getAttribute("data-k")); typeIn(live(el.getAttribute("data-k"))); } }, true);
  function typeIn(el) {
    if (!el) return;
    editingK = el.getAttribute("data-k");
    const before = el.textContent;
    try { el.contentEditable = "plaintext-only"; } catch { el.contentEditable = "true"; }
    el.focus();
    try { const r = document.createRange(); r.selectNodeContents(el); const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(r); } catch {}
    let ended = false;
    const end = (keep) => {
      if (ended) return; ended = true;
      el.removeEventListener("keydown", key); el.removeEventListener("blur", blur);
      el.contentEditable = "false"; editingK = null;
      const sk = byK(el.getAttribute("data-k"));
      const text = el.textContent.replace(/\s+/g, " ").trim();
      if (keep && sk && text && text !== before.trim()) { snap(); sk.textContent = text; commit(); } else draw();
    };
    const key = (ev) => { if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); end(true); } if (ev.key === "Escape") { ev.preventDefault(); el.textContent = before; end(false); } ev.stopPropagation(); };
    const blur = () => end(true);
    el.addEventListener("keydown", key); el.addEventListener("blur", blur);
  }
  function place(box, el, tag) {
    if (!el) { box.hidden = true; return null; }
    const f = $("frame").getBoundingClientRect(), r = el.getBoundingClientRect();
    if (!r.width && !r.height) { box.hidden = true; return null; }
    Object.assign(box.style, { left: `${r.left - f.left}px`, top: `${r.top - f.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    if (tag) tag.textContent = nameOf(el);
    box.hidden = false;
    return { top: r.top - f.top, left: r.left - f.left, width: r.width, height: r.height };
  }
  function overlay() {
    // A timer or a resize can land after the Studio closed (another tab of the form's page).
    if (!alive) return;
    const el = S.mode === "edit" && S.sel ? live(S.sel) : null;
    const box = place($("sel"), el, $("seltag"));
    const fb = $("fbar");
    if (!box) { fb.hidden = true; return; }
    fb.hidden = false;
    fb.innerHTML = "";
    const b = (tip, ic, fn) => h("button", { class: "ib", "data-tip": tip, "aria-label": tip, html: SVG(ic, 15), onclick: (e) => { e.stopPropagation(); fn(); } });
    fb.append(b("Move up", P.up, () => move(-1)), b("Move down", P.down, () => move(1)), b("Duplicate", P.dup, dup), b("Delete", P.del, del), b("Select parent", P.parent, parent), h("button", { class: "ib", "data-tip": "Ask Tia about this", "aria-label": "Ask Tia about this", html: tiaSvg(16), onclick: (e) => { e.stopPropagation(); askAbout(); } }));
    const w = 6 * 30 + 6;
    fb.style.left = `${Math.max(0, Math.min(box.left + box.width - w, $("frame").clientWidth - w))}px`;
    fb.style.top = `${box.top > 62 ? box.top - 58 : box.top + box.height + 8}px`;
  }
  function select(k) {
    S.sel = k;
    // Picked in Layers inside another step: show that step.
    const el = byK(k);
    if (S.mode === "edit" && el && S.view !== "all") {
      const steps = stepsIn(src), st = steps.findIndex((x) => x.contains(el));
      const v = el.closest("[data-cl-thanks]") ? "thanks" : st >= 0 ? st : S.view;
      if (v !== S.view && (st >= 0 || v === "thanks")) { S.view = v; draw(); }
    }
    if (S.mode === "edit") { panel(); tree(); overlay(); }
    $("hov").hidden = true;
  }
  function move(dir) { const el = byK(S.sel); if (!el) return; const sib = dir < 0 ? el.previousElementSibling : el.nextElementSibling; if (!sib) return toast(dir < 0 ? "Already first" : "Already last"); snap(); dir < 0 ? sib.before(el) : sib.after(el); commit(); }
  function dup() { const el = byK(S.sel); if (!el || el === src.firstElementChild) return; snap(); const c = el.cloneNode(true); [c, ...c.querySelectorAll("[data-k]")].forEach((x) => x.setAttribute("data-k", String(++kSeq))); if (c.id) c.id = `${c.id}-2`; c.querySelectorAll("[id]").forEach((x) => (x.id = `${x.id}-2`)); el.after(c); S.sel = c.getAttribute("data-k"); commit(); }
  function del() { const el = byK(S.sel); if (!el || el === src.firstElementChild) return; snap(); const p = el.parentElement; el.remove(); S.sel = p && p !== src ? p.getAttribute("data-k") : null; commit(); toast("Deleted. Undo with Cmd+Z."); }
  function parent() { const el = byK(S.sel); const p = el?.parentElement; if (p && p !== src) select(p.getAttribute("data-k")); }
  function askAbout() {
    const el = byK(S.sel); if (!el) return;
    if (!el.id) { el.id = `el${S.sel}`; body().html = sourceHtml(); }
    S.about = { id: el.id, label: `${nameOf(el)}${leaf(el) ? `: ${el.textContent.trim().slice(0, 40)}` : ` #${el.id}`}` };
    setChatFold(false); aboutUi(); $("input").focus();
  }
  listen(document, "keydown", (e) => {
    if (!alive || S.mode !== "edit" || !S.sel || editingK) return;
    const t = e.composedPath()[0];
    if (t?.closest?.("input,textarea,[contenteditable]")) return;
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); del(); }
    else if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); dup(); }
    else if (e.key === "Escape") { if (menuEl || $("brandDlg")) return; parent(); }
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); const el = byK(S.sel); const n = e.key === "ArrowDown" ? el?.nextElementSibling : el?.previousElementSibling; if (n) select(n.getAttribute("data-k")); }
    else if (e.key === "Enter" && leaf(byK(S.sel))) { e.preventDefault(); typeIn(live(S.sel)); }
  });
  listen(document, "keydown", (e) => { const mod = e.metaKey || e.ctrlKey; if (!alive || !mod || e.key.toLowerCase() !== "z") return; const t = e.composedPath()[0]; if (t?.closest?.("input,textarea,[contenteditable]")) return; if (!shell.host.isConnected) return; e.preventDefault(); e.shiftKey ? redo() : undo(); });
  $("canvas").addEventListener("scroll", () => { overlay(); $("hov").hidden = true; });
  listen(window, "resize", () => overlay());

  // ── Steps (multi-page forms): pills to see one step at a time, the thank-you and all of them; tools to add,
  // copy, move and remove steps. Next and send buttons follow the order. ──────────────────────────────────────
  const stepsIn = (r) => [...r.querySelectorAll("[data-cl-step]")].filter((x) => !x.parentElement?.closest("[data-cl-thanks]"));
  const stepName = (st, i) => (st.querySelector("h1,h2,h3,h4,legend,.heading,.title,label")?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 28) || `Step ${i + 1}`;
  function ifWords(expr) {
    const qs = questions();
    const label = (n) => { const el = src.querySelector(`[name="${CSS.escape(n)}"]`); const lab = el?.id ? src.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null; return (lab?.textContent || n.replace(/[_-]+/g, " ")).trim(); };
    const opt = (n, v) => qs.find((q) => q.name === n)?.options.find((o) => o.value === v)?.label || v;
    return `Shown if ${String(expr).split(/\s+(and|or)\s+/i).map((c) => {
      if (/^(and|or)$/i.test(c)) return c.toLowerCase();
      let m = /^([\w-]+)\s+(filled|empty)$/i.exec(c.trim());
      if (m) return `${label(m[1])} is ${m[2].toLowerCase() === "filled" ? "answered" : "empty"}`;
      m = /^([\w-]+)\s+in\s+\((.*)\)$/i.exec(c.trim());
      if (m) return `${label(m[1])} is ${[...m[2].matchAll(/'([^']*)'|"([^"]*)"/g)].map((y) => opt(m[1], y[1] ?? y[2])).join(" or ")}`;
      m = /^([\w-]+)\s*(==|!=|>=|<=|>|<)\s*(?:'([^']*)'|"([^"]*)"|(\S+))$/.exec(c.trim());
      if (!m) return c;
      const v = m[3] ?? m[4] ?? m[5];
      return `${label(m[1])} ${{ "==": "is", "!=": "is not", ">": "is over", "<": "is under", ">=": "is at least", "<=": "is at most" }[m[2]]} ${opt(m[1], v)}`;
    }).join(" ")}`;
  }
  function stepUi() {
    const bar = $("stepBar");
    const steps = stepsIn(src), thanks = src.querySelector("[data-cl-thanks]");
    bar.hidden = !cur || !built() || S.mode === "code" || S.mode === "after" || (!thanks && steps.length < 2);
    if (bar.hidden) return;
    const editing = S.mode === "edit";
    if (editing && typeof S.view === "number" && S.view >= Math.max(1, steps.length)) S.view = 0;
    bar.innerHTML = "";
    const pill = (n, text, on, fn) => h("button", { class: "sp", "aria-pressed": String(on), onclick: fn }, n ? h("span", { class: "n", text: n }) : null, h("span", { text }));
    const go = (v) => { if (editing) { S.view = v; S.sel = null; draw(); panel(); tree(); } else { if (v === "thanks") done = true; else { done = false; stepAt = v; } draw(); } };
    if (steps.length) steps.forEach((st, i) => bar.append(pill(String(i + 1), stepName(st, i), editing ? S.view === i : !done && stepAt === i, () => go(i))));
    else bar.append(pill("", "Form", editing ? S.view === 0 : !done, () => go(0)));
    if (thanks) bar.append(pill("", "Thank-you", editing ? S.view === "thanks" : done, () => go("thanks")));
    if (editing && (steps.length > 1 || thanks)) bar.append(pill("", "All", S.view === "all", () => go("all")));
    if (editing && typeof S.view === "number" && steps.length) {
      const i = S.view;
      const tool = (tip, ic, fn, off) => h("button", { class: "ib", "data-tip": tip, "aria-label": tip, html: SVG(ic, 15), disabled: off || null, onclick: fn });
      bar.append(h("div", { class: "tools" },
        tool("Move earlier", '<path d="m15 18-6-6 6-6"/>', () => moveStep(i, -1), i === 0),
        tool("Move later", '<path d="m9 18 6-6-6-6"/>', () => moveStep(i, 1), i === steps.length - 1),
        tool("Add a step after", P.plus, () => addStep(i)),
        tool("Duplicate the step", P.dup, () => dupStep(i)),
        tool("Delete the step", P.del, () => delStep(i), steps.length < 2)));
      bar.lastChild.lastChild.classList.add("tipleft");
    }
  }
  // Next on every step but the last, the send button on the last, no Back on the first.
  function normalizeSteps() {
    const steps = stepsIn(src);
    if (!steps.length) return;
    const sendBtn = [...src.querySelectorAll("[type=submit]")].find((b) => !b.closest("[data-cl-thanks]"));
    const sendText = (sendBtn?.textContent || "Send").trim();
    const nextText = (src.querySelector("[data-cl-next]")?.textContent || "Next").trim();
    const btnClass = (sendBtn || src.querySelector("[data-cl-next]"))?.getAttribute("class") || "btn";
    steps.forEach((st, i) => {
      const last = i === steps.length - 1;
      if (!last) st.querySelectorAll("[type=submit]").forEach((b) => { b.setAttribute("type", "button"); b.setAttribute("data-cl-next", ""); b.textContent = nextText; });
      if (!last && !st.querySelector("[data-cl-next]")) { const b = document.createElement("button"); b.type = "button"; b.className = btnClass; b.textContent = nextText; b.setAttribute("data-cl-next", ""); st.append(b); }
      if (last && !st.querySelector("[type=submit]")) {
        const n = st.querySelector("[data-cl-next]");
        if (n) { n.removeAttribute("data-cl-next"); n.setAttribute("type", "submit"); n.textContent = sendText; }
        else { const b = document.createElement("button"); b.type = "submit"; b.className = btnClass; b.textContent = sendText; st.append(b); }
      }
      if (last) st.querySelectorAll("[data-cl-next]").forEach((b) => b.remove());
      if (i === 0) st.querySelectorAll("[data-cl-back]").forEach((b) => b.remove());
    });
    src.querySelectorAll("*:not([data-k])").forEach((el) => el.setAttribute("data-k", String(++kSeq)));
  }
  const copyStep = (st) => { const c = st.cloneNode(true); const n = Date.now().toString(36).slice(-4); [c, ...c.querySelectorAll("[id]")].forEach((x) => x.id && (x.id = `${x.id}-${n}`)); c.querySelectorAll("[for]").forEach((x) => x.setAttribute("for", `${x.getAttribute("for")}-${n}`)); c.querySelectorAll("[name]").forEach((x) => x.setAttribute("name", `${x.getAttribute("name")}_${n}`)); c.querySelectorAll("[data-cl-error-for]").forEach((x) => x.setAttribute("data-cl-error-for", `${x.getAttribute("data-cl-error-for")}_${n}`)); c.querySelectorAll("[data-cl-id]").forEach((x) => x.removeAttribute("data-cl-id")); [c, ...c.querySelectorAll("*")].forEach((x) => x.setAttribute("data-k", String(++kSeq))); return c; };
  function addStep(i) {
    const st = stepsIn(src)[i]; if (!st) return;
    snap();
    const c = st.cloneNode(false); c.removeAttribute("data-cl-show-if"); c.id = `step${Date.now().toString(36).slice(-4)}`;
    const head = st.querySelector("h1,h2,h3,.heading");
    c.append(head ? Object.assign(head.cloneNode(false), { textContent: "New step" }) : Object.assign(document.createElement("h2"), { textContent: "New step" }));
    const nav = [...st.querySelectorAll("[data-cl-back],[data-cl-next],[type=submit]")].at(-1)?.parentElement;
    if (nav && nav !== st) { const row = nav.cloneNode(true); row.querySelectorAll("[id]").forEach((x) => x.removeAttribute("id")); c.append(row); }
    else { const back = st.querySelector("[data-cl-back]"); if (back) c.append(back.cloneNode(true)); }
    st.after(c);
    normalizeSteps(); ensureIds();
    S.view = i + 1; commit();
  }
  function dupStep(i) { const st = stepsIn(src)[i]; if (!st) return; snap(); st.after(copyStep(st)); normalizeSteps(); ensureIds(); S.view = i + 1; commit(); }
  function moveStep(i, dir) { const steps = stepsIn(src), st = steps[i], other = steps[i + dir]; if (!st || !other) return; snap(); dir < 0 ? other.before(st) : other.after(st); normalizeSteps(); S.view = i + dir; commit(); }
  function delStep(i) { const steps = stepsIn(src); if (steps.length < 2) return; snap(); steps[i].remove(); normalizeSteps(); S.view = Math.max(0, i - 1); commit(); toast("Step deleted. Undo with Cmd+Z."); }

  // ── Layers ────────────────────────────────────────────────────────────────────────────────────────────
  function tree() {
    const t = $("tree"); t.innerHTML = "";
    if (!S.nav || S.mode !== "edit") return;
    const walk = (el, d) => { for (const c of el.children) { const k = c.getAttribute("data-k"); const label = c.id ? `#${c.id}` : leaf(c) ? c.textContent.trim().slice(0, 24) : c.classList[0] ? `.${c.classList[0]}` : ""; t.append(h("button", { class: k === S.sel ? "sel" : "", style: `padding-left:${6 + d * 12}px`, onclick: () => select(k) }, h("span", { class: "tg", text: nameOf(c) }), h("span", { text: label }))); if (d < 9) walk(c, d + 1); } };
    walk(src, 0);
  }

  // ── Styles: one rule per class or element, in the form CSS's editor block ──────────────────────────────
  const EDIT = "/* editor */";
  function rules() { const css = body().css; const i = css.indexOf(EDIT); const out = {}; if (i < 0) return out; for (const m of css.slice(i + EDIT.length).matchAll(/([^{}]+)\{([^{}]*)\}/g)) { const p = {}; for (const d of m[2].split(";")) { const j = d.indexOf(":"); if (j > 0) p[d.slice(0, j).trim()] = d.slice(j + 1).trim(); } out[m[1].trim()] = p; } return out; }
  function writeRules(r) { const css = body().css; const i = css.indexOf(EDIT); const head = (i >= 0 ? css.slice(0, i) : css).trimEnd(); const out = Object.entries(r).filter(([, p]) => Object.keys(p).length).map(([s, p]) => `${s}{${Object.entries(p).map(([k, v]) => `${k}:${v}`).join(";")}}`).join("\n"); body().css = out ? `${head}\n${EDIT}\n${out}\n` : `${head}\n`; }
  function target() { const el = byK(S.sel); if (!el) return null; const cls = el.classList[0]; if (S.scope === "class" && cls) return `.${cls}`; if (!el.id) el.id = `el${S.sel}`; return `#${el.id}`; }
  const getP = (p) => { const t = target(); return (t && rules()[t]?.[p]) || ""; };
  function setP(p, v) { const t = target(); if (!t) return; snap(); const r = rules(); r[t] = r[t] || {}; if (v === "" || v == null) delete r[t][p]; else r[t][p] = v; writeRules(r); commit(); }
  function setMany(pairs) { const t = target(); if (!t) return; snap(); const r = rules(); r[t] = r[t] || {}; for (const [p, v] of pairs) { if (v === "" || v == null) delete r[t][p]; else r[t][p] = v; } writeRules(r); commit(); }
  const comp = (p) => { const el = live(S.sel); return el ? getComputedStyle(el).getPropertyValue(p).trim() : ""; };
  const short = (v) => (v || "").replace(/rgba?\((\d+), (\d+), (\d+)(?:, [\d.]+)?\)/g, (_m, r, g, b) => `#${[r, g, b].map((x) => Number(x).toString(16).padStart(2, "0")).join("")}`).slice(0, 26);
  const unit = (v) => { v = String(v).trim(); return /^-?\d*\.?\d+$/.test(v) ? `${v}px` : v; };

  // ── The panel: Style and Settings ─────────────────────────────────────────────────────────────────────
  function panel() {
    const p = $("pscroll"); p.innerHTML = "";
    const el = S.sel ? byK(S.sel) : null;
    $("selName").textContent = el ? nameOf(el) : "";
    $("p-style").setAttribute("aria-selected", String(S.ptab === "style")); $("p-set").setAttribute("aria-selected", String(S.ptab === "settings"));
    if (!el) { p.append(h("div", { class: "sec" }, h("p", { class: "hint0", text: "Click anything on the form to change it. Click picked text again to type." }))); return; }
    if (S.ptab === "settings") return settings(p, el);
    const cls = el.classList[0];
    p.append(h("div", { class: "sec" }, h("div", { class: "sel-head" }, h("span", { class: `cls${S.scope === "class" && cls ? "" : " off"}`, text: S.scope === "class" && cls ? `.${cls}` : el.id ? `#${el.id}` : "this one" }), h("span", { class: "spacer" }),
      h("div", { class: "seg" }, h("button", { "aria-pressed": String(S.scope === "el" || !cls), onclick: () => { S.scope = "el"; panel(); }, text: "This one" }), cls ? h("button", { "aria-pressed": String(S.scope === "class"), onclick: () => { S.scope = "class"; panel(); }, text: "All like it" }) : null))));
    // Layout
    const disp = getP("display") || comp("display"), dir = getP("flex-direction") || comp("flex-direction");
    const L = h("div", { class: "sec" }, h("h4", { text: "Layout" }));
    const dIcons = h("div", { class: "icons", role: "group", "aria-label": "Display" });
    for (const [v, ic, tip] of [["block", P.block, "Block"], ["row", P.row, "Row"], ["column", P.col, "Column"], ["grid", P.grid, "Grid"], ["none", P.none, "Hidden"]]) {
      const on = v === "row" ? disp === "flex" && dir.startsWith("row") : v === "column" ? disp === "flex" && dir.startsWith("column") : disp === v;
      dIcons.append(h("button", { class: "ib", "data-tip": tip, "aria-label": tip, "aria-pressed": String(on), html: SVG(ic, 15), onclick: () => (v === "row" || v === "column" ? setMany([["display", "flex"], ["flex-direction", v]]) : setP("display", v)) }));
    }
    L.append(dIcons);
    if (disp === "flex" || disp === "grid") {
      const j = h("div", { class: "icons", role: "group", "aria-label": "Spread" });
      for (const [v, ic, tip] of [["flex-start", P.js, "Start"], ["center", P.jc, "Center"], ["flex-end", P.je, "End"], ["space-between", P.jb, "Spread out"]]) j.append(h("button", { class: "ib", "data-tip": tip, "aria-label": tip, "aria-pressed": String((getP("justify-content") || comp("justify-content")) === v), html: SVG(ic, 15), onclick: () => setP("justify-content", v) }));
      L.append(j, h("div", { class: "g2" }, num("Gap", "gap", "G")));
    }
    p.append(L);
    // Spacing
    const r = live(S.sel)?.getBoundingClientRect();
    const bx = (prop, side) => { const i = h("input", { class: `bx ${side}`, "aria-label": prop.replace("-", " "), value: getP(prop).replace(/px$/, ""), placeholder: (comp(prop) || "").replace(/px$/, "") }); i.addEventListener("change", () => setP(prop, unit(i.value))); return i; };
    const pad = h("div", { class: "boxp" }, h("span", { class: "bl", text: "Padding" }), bx("padding-top", "t"), bx("padding-right", "r"), bx("padding-bottom", "b"), bx("padding-left", "l"), h("span", { class: "boxc", text: r ? `${Math.round(r.width)} × ${Math.round(r.height)}` : "" }));
    p.append(h("div", { class: "sec" }, h("h4", { text: "Spacing" }), h("div", { class: "boxm" }, h("span", { class: "bl", text: "Margin" }), bx("margin-top", "t"), bx("margin-right", "r"), bx("margin-bottom", "b"), bx("margin-left", "l"), pad)));
    p.append(h("div", { class: "sec" }, h("h4", { text: "Size" }), h("div", { class: "g3" }, num("Width", "width", "W"), num("Height", "height", "H"), num("Max width", "max-width", "M"))));
    // Type
    const T = h("div", { class: "sec" }, h("h4", { text: "Type" }), h("div", { class: "g3" }, num("Size", "font-size", "S"), num("Line height", "line-height", "L"), num("Letter spacing", "letter-spacing", "T")));
    const wt = h("div", { class: "icons", role: "group", "aria-label": "Weight" });
    for (const w of ["400", "500", "600", "700", "800"]) wt.append(h("button", { class: "ib", "aria-pressed": String((getP("font-weight") || comp("font-weight")) === w), "aria-label": `Weight ${w}`, style: `font-weight:${w};font-size:12px`, text: w, onclick: () => setP("font-weight", w) }));
    const al = h("div", { class: "icons", role: "group", "aria-label": "Align" });
    for (const [v, ic, tip] of [["left", P.al, "Left"], ["center", P.ac, "Center"], ["right", P.ar, "Right"]]) al.append(h("button", { class: "ib", "data-tip": tip, "aria-label": tip, "aria-pressed": String((getP("text-align") || comp("text-align")).replace("start", "left") === v), html: SVG(ic, 15), onclick: () => setP("text-align", v) }));
    const cs = h("div", { class: "icons", role: "group", "aria-label": "Case" });
    for (const [v, ic, tip] of [["none", P.case0, "As typed"], ["uppercase", P.caseU, "Capitals"], ["lowercase", P.caseL, "Lower case"]]) cs.append(h("button", { class: "ib", "data-tip": tip, "aria-label": tip, "aria-pressed": String((getP("text-transform") || comp("text-transform")) === v), html: SVG(ic, 15), onclick: () => setP("text-transform", v) }));
    T.append(wt, h("div", { class: "g2" }, al, cs), color("Text color", "color"));
    p.append(T);
    p.append(h("div", { class: "sec" }, h("h4", { text: "Fill" }), color("Background", "background-color")));
    p.append(h("div", { class: "sec" }, h("h4", { text: "Border" }), h("div", { class: "g2" }, num("Border width", "border-width", "W"), num("Radius", "border-radius", "R")), color("Border color", "border-color")));
    const fx = h("div", { class: "icons", role: "group", "aria-label": "Shadow" });
    for (const [v, t] of [["none", "None"], ["0 1px 3px rgba(0,0,0,.12)", "Soft"], ["0 12px 32px -12px rgba(0,0,0,.35)", "Lift"]]) fx.append(h("button", { class: "ib", "aria-pressed": String(getP("box-shadow") === v), text: t, style: "font-size:12px", onclick: () => setP("box-shadow", v) }));
    p.append(h("div", { class: "sec" }, h("h4", { text: "Effects" }), h("div", { class: "g2" }, num("Opacity", "opacity", "O")), fx));
  }
  function num(label, prop, key) {
    const raw = prop === "opacity" || prop === "line-height";
    const i = h("input", { "aria-label": label, value: getP(prop).replace(/px$/, ""), placeholder: short(comp(prop)).replace(/px$/, "") });
    i.addEventListener("change", () => setP(prop, raw ? i.value.trim() : unit(i.value)));
    const k = h("span", { class: "k", title: label, text: key });
    // Drag the letter to change the number.
    k.addEventListener("pointerdown", (e) => {
      const start = e.clientX, base = parseFloat(i.value || i.placeholder) || 0, step = raw ? 0.05 : 0.5;
      const mv = (ev) => { const n = base + (ev.clientX - start) * step; i.value = String(raw ? Math.round(n * 100) / 100 : Math.round(n)); };
      const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); if (i.value !== "") i.dispatchEvent(new Event("change")); };
      window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
    });
    return h("label", { class: "num" }, k, i);
  }
  function brandColors() { const out = []; for (const m of String(brandOf(cur)?.css || "").matchAll(/--([\w-]+)\s*:\s*(#[0-9a-f]{3,8}\b|rgba?\([^)]*\))/gi)) if (out.length < 12 && !out.some((x) => x[1] === m[2])) out.push([`var(--${m[1]})`, m[2], m[1].replace(/^brand-/, "")]); return out; }
  function color(label, prop) {
    const v = getP(prop), c = comp(prop);
    const b = h("button", { class: "colorrow", "aria-label": label }, h("span", { class: "dot" }, h("i", { style: `background:${v || c}` })), h("span", { class: `v${v ? "" : " ph"}`, text: v ? v.replace(/var\(--(?:brand-)?([\w-]+)\)/, "Brand $1") : short(c) || "None" }));
    b.onclick = () => {
      const pal = h("div", { class: "pal" });
      for (const [val, hex, nm] of [...brandColors(), ["#ffffff", "#ffffff", "white"], ["#000000", "#000000", "black"], ["transparent", "transparent", "none"]]) pal.append(h("button", { "aria-label": nm, title: nm, style: `background:${hex}`, onclick: () => { closeMenu(); setP(prop, val); } }));
      const hx = h("input", { class: "in", placeholder: "#hex", value: v, "aria-label": "Color value" });
      hx.addEventListener("keydown", (e) => { if (e.key === "Enter") { closeMenu(); setP(prop, hx.value.trim()); } });
      openMenu(b, [h("div", { style: "padding:8px 8px 0;font-size:11px;color:var(--muted)", text: `${brandOf(cur)?.name || "Brand"} colors` }), pal, h("div", { style: "padding:0 8px 8px;display:flex;gap:6px" }, hx, h("button", { class: "pill", text: "Clear", onclick: () => { closeMenu(); setP(prop, ""); } }))]);
    };
    return b;
  }
  function questions() { const out = []; src.querySelectorAll("input[name],textarea[name],select[name]").forEach((el) => { let q = out.find((x) => x.name === el.name); if (!q) { q = { name: el.name, options: [] }; out.push(q); } if (el.type === "radio" || el.type === "checkbox") { if (!q.options.some((o) => o.value === el.value)) q.options.push({ value: el.value, label: (el.closest("label")?.textContent || el.value).trim() }); } else if (el.tagName === "SELECT") for (const o of el.options) if (o.value) q.options.push({ value: o.value, label: o.textContent.trim() }); }); return out; }
  const pick = (text, items) => { const b = h("button", { class: "dd" }, h("span", { text }), h("span", { html: SVG(P.chev, 12) })); b.onclick = () => openMenu(b, items.map(([t, fn, on]) => h("button", { class: "mi small", role: "menuitemradio", "aria-checked": String(!!on), text: t, onclick: () => { closeMenu(); fn(); } }))); return b; };
  function blockSettings(p, bl) {
    const type = bl.getAttribute("data-cl-field"), name = bl.getAttribute("data-cl-name") || "";
    const B = h("div", { class: "sec" }, h("h4", { text: BLOCK_NAMES[type] || "Block" }));
    const txt = (label, attr, ph) => { const i = h("input", { class: "in", value: bl.getAttribute(attr) || "", placeholder: ph || "", "aria-label": label }); i.addEventListener("change", () => { const v = i.value.trim(); if (attr === "data-cl-name" && !/^[A-Za-z][\w-]{0,60}$/.test(v)) return; snap(); if (attr === "data-cl-name" && body().ids?.[name]) { body().ids[v] = body().ids[name]; delete body().ids[name]; } v ? bl.setAttribute(attr, v) : bl.removeAttribute(attr); commit(); }); return h("div", { class: "row2" }, h("span", { class: "lbl", text: label }), i); };
    B.append(txt("Label", "data-cl-label"), txt("Name", "data-cl-name"));
    const req = bl.hasAttribute("data-cl-required");
    B.append(h("div", { class: "row2" }, h("span", { class: "lbl", text: "Required" }), h("div", {}, h("button", { class: "sw", role: "switch", "aria-checked": String(req), "aria-label": "Required", onclick: () => { snap(); req ? bl.removeAttribute("data-cl-required") : bl.setAttribute("data-cl-required", ""); commit(); } }))));
    if (type === "phone" || type === "country") {
      const sv = bl.getAttribute("data-cl-save") || "";
      const opts = [["", "Just this form"], [type, type === "phone" ? "Phone" : "Country"]];
      B.append(h("div", { class: "row2" }, h("span", { class: "lbl", text: "Saves to" }), pick((opts.find((o) => o[0] === sv) || opts[0])[1], opts.map(([v, t]) => [t, () => { snap(); v ? bl.setAttribute("data-cl-save", v) : bl.removeAttribute("data-cl-save"); commit(); }, v === sv]))));
    }
    if (type === "file") {
      const kinds = (bl.getAttribute("data-cl-kinds") || "pdf image office").split(/\s+/);
      const k = h("div", { class: "icons", role: "group", "aria-label": "File kinds" });
      for (const [v, t] of [["pdf", "PDF"], ["image", "Images"], ["office", "Office"]]) k.append(h("button", { class: "ib", "aria-pressed": String(kinds.includes(v)), text: t, style: "font-size:12px", onclick: () => { const next = kinds.includes(v) ? kinds.filter((x) => x !== v) : [...kinds, v]; if (!next.length) return; snap(); bl.setAttribute("data-cl-kinds", next.join(" ")); commit(); } }));
      const mb = h("input", { class: "in", value: bl.getAttribute("data-cl-max") || "", placeholder: "10", "aria-label": "Largest file in MB" });
      mb.addEventListener("change", () => { const n = Math.round(Number(mb.value)); snap(); n > 0 ? bl.setAttribute("data-cl-max", String(Math.min(n, 20))) : bl.removeAttribute("data-cl-max"); commit(); });
      B.append(h("div", { class: "row2" }, h("span", { class: "lbl", text: "Takes" }), k), h("div", { class: "row2" }, h("span", { class: "lbl", text: "Up to MB" }), mb));
    }
    if (type === "rating") {
      const sc = h("input", { class: "in", value: bl.getAttribute("data-cl-scale") || "", placeholder: "5", "aria-label": "Scale" });
      sc.addEventListener("change", () => { const n = Math.round(Number(sc.value)); snap(); n >= 3 ? bl.setAttribute("data-cl-scale", String(Math.min(n, 10))) : bl.removeAttribute("data-cl-scale"); commit(); });
      const nums = bl.getAttribute("data-cl-style") === "numbers";
      B.append(h("div", { class: "row2" }, h("span", { class: "lbl", text: "Out of" }), sc), h("div", { class: "row2" }, h("span", { class: "lbl", text: "Shown as" }), pick(nums ? "Numbers" : "Stars", [["Stars", () => { snap(); bl.removeAttribute("data-cl-style"); commit(); }, !nums], ["Numbers", () => { snap(); bl.setAttribute("data-cl-style", "numbers"); commit(); }, nums]])));
    }
    p.append(B);
  }
  function settings(p, el) {
    const bl = el.closest?.("[data-cl-field]");
    if (bl) return blockSettings(p, bl);
    const input = el.matches("input,textarea,select") ? el : el.querySelector("input[name],textarea[name],select[name]") || el.closest("label")?.querySelector("input[name],textarea[name],select[name]");
    if (input?.name) {
      const isChoice = input.type === "radio" || input.type === "checkbox";
      const group = [...src.querySelectorAll(`[name="${CSS.escape(input.name)}"]`)];
      const Q = h("div", { class: "sec" }, h("h4", { text: "Question" }));
      const nm = h("input", { class: "in", value: input.name, "aria-label": "Question name" });
      nm.addEventListener("change", () => {
        const v = nm.value.trim().replace(/[^\w-]/g, "_");
        if (!v || v === input.name) return;
        snap();
        group.forEach((g) => g.setAttribute("name", v));
        src.querySelectorAll(`[data-cl-error-for="${CSS.escape(input.name)}"]`).forEach((e) => e.setAttribute("data-cl-error-for", v));
        // Conditions and routes that read the old name follow it.
        src.querySelectorAll("[data-cl-show-if]").forEach((e) => e.setAttribute("data-cl-show-if", e.getAttribute("data-cl-show-if").replace(new RegExp(`\\b${input.name}\\b`, "g"), v)));
        body().after.routes = (body().after.routes || []).map((r) => (r.field === input.name ? { ...r, field: v } : r));
        if (body().ids?.[input.name]) { body().ids[v] = body().ids[input.name]; delete body().ids[input.name]; }
        commit();
      });
      Q.append(h("div", { class: "row2" }, h("span", { class: "lbl", text: "Name" }), nm));
      const req = group.some((g) => g.hasAttribute("required"));
      Q.append(h("div", { class: "row2" }, h("span", { class: "lbl", text: "Required" }), h("div", {}, h("button", { class: "sw", role: "switch", "aria-checked": String(req), "aria-label": "Required", onclick: () => { snap(); if (req) group.forEach((g) => g.removeAttribute("required")); else group[0].setAttribute("required", ""); commit(); } }))));
      if (!isChoice && input.tagName !== "SELECT") { const ph = h("input", { class: "in", value: input.getAttribute("placeholder") || "", "aria-label": "Placeholder" }); ph.addEventListener("change", () => { snap(); ph.value ? input.setAttribute("placeholder", ph.value) : input.removeAttribute("placeholder"); commit(); }); Q.append(h("div", { class: "row2" }, h("span", { class: "lbl", text: "Placeholder" }), ph)); }
      const SAVES = [["", "Just this form"], ["email", "Email"], ["first_name", "First name"], ["last_name", "Last name"], ["name", "Full name"], ["phone", "Phone"], ["company", "Company"], ["title", "Job title"], ["website", "Website"]];
      const sv = input.getAttribute("data-cl-save") || "";
      Q.append(h("div", { class: "row2" }, h("span", { class: "lbl", text: "Saves to" }), pick((SAVES.find((s) => s[0] === sv) || SAVES[0])[1], SAVES.map(([v, t]) => [t, () => { snap(); group.forEach((g) => (v ? g.setAttribute("data-cl-save", v) : g.removeAttribute("data-cl-save"))); commit(); }, v === sv]))));
      p.append(Q);
      if (isChoice && group.length) {
        const O = h("div", { class: "sec" }, h("h4", { text: "Options" }));
        const list = h("div", { class: "opts" });
        group.forEach((g) => {
          const lab = g.closest("label");
          const txt = lab ? lab.querySelector("span,b,strong") || [...lab.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim()) : null;
          const t = h("input", { class: "in", value: (lab?.textContent || g.value).trim(), "aria-label": "Option" });
          t.addEventListener("change", () => { if (!t.value.trim()) return; snap(); if (txt) txt.textContent = t.value.trim(); commit(); });
          list.append(h("div", { class: "opt" }, t, h("button", { class: "ib", "aria-label": "Remove the option", html: SVG(P.x, 14), disabled: group.length < 2 || null, onclick: () => { snap(); (lab || g).remove(); commit(); } })));
        });
        O.append(list, h("div", {}, h("button", { class: "pill", html: `${SVG(P.plus, 14)}Add option`, onclick: () => {
          const last = group.at(-1)?.closest("label") || group.at(-1); if (!last) return;
          snap();
          const c = last.cloneNode(true); [c, ...c.querySelectorAll("[data-k]")].forEach((x) => x.setAttribute("data-k", String(++kSeq)));
          [c, ...c.querySelectorAll("[id]")].forEach((x) => x.id && (x.id = `${x.id}-${group.length + 1}`));
          const inp = c.matches("input") ? c : c.querySelector("input"); const val = `option-${group.length + 1}`; inp.value = val; inp.setAttribute("value", val); inp.removeAttribute("checked"); inp.removeAttribute("required");
          const sp = c.querySelector("span,b,strong") || [...c.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim()); if (sp) sp.textContent = `Option ${group.length + 1}`;
          last.after(c); commit();
        } })));
        p.append(O);
      }
    }
    // Show if, with pickers
    const C = h("div", { class: "sec" }, h("h4", { text: "Show if" }));
    const raw = el.getAttribute("data-cl-show-if") || "";
    const qs = questions().filter((q) => !el.contains(src.querySelector(`[name="${CSS.escape(q.name)}"]`)));
    if (!raw) {
      C.append(h("div", {}, h("button", { class: "pill", html: `${SVG(P.plus, 14)}Add a condition`, disabled: !qs.length || null, onclick: () => { const q = qs[0]; snap(); el.setAttribute("data-cl-show-if", q.options[0] ? `${q.name} == '${q.options[0].value}'` : `${q.name} filled`); commit(); } })));
    } else {
      const m = /^([\w-]+)\s*(==|!=)\s*'([^']*)'$/.exec(raw) || /^([\w-]+)\s+(filled)$/.exec(raw);
      if (!m) C.append(h("p", { class: "hint0", text: raw }));
      const [q0, op0, v0] = m ? [m[1], m[2], m[3] ?? ""] : ["", "==", ""];
      const write = (q, op, v) => { snap(); el.setAttribute("data-cl-show-if", op === "filled" ? `${q} filled` : `${q} ${op} '${v}'`); commit(); };
      const q = qs.find((x) => x.name === q0);
      C.append(h("div", { class: "cond" },
        pick(q0 || "Pick", qs.map((x) => [x.name, () => write(x.name, x.options.length ? "==" : "filled", x.options[0]?.value || ""), x.name === q0])),
        pick(op0 === "!=" ? "is not" : op0 === "filled" ? "filled" : "is", [["is", () => write(q0, "==", v0 || q?.options[0]?.value || ""), op0 === "=="], ["is not", () => write(q0, "!=", v0 || q?.options[0]?.value || ""), op0 === "!="], ["filled", () => write(q0, "filled", ""), op0 === "filled"]]),
        op0 === "filled" ? h("span") : pick(q?.options.find((o) => o.value === v0)?.label || v0 || "Pick", (q?.options || []).map((o) => [o.label, () => write(q0, op0, o.value), o.value === v0])),
        h("button", { class: "ib", "aria-label": "Remove the condition", html: SVG(P.x, 14), onclick: () => { snap(); el.removeAttribute("data-cl-show-if"); commit(); } })));
    }
    p.append(C);
  }

  // ── Floating menus (never the browser's) and the toast ───────────────────────────────────────────────
  let menuEl = null, menuFor = null;
  function openMenu(anchor, items, width) {
    closeMenu();
    const m = h("div", { class: "menu", role: "menu" }, ...items);
    if (width) m.style.width = `${width}px`;
    $("layer").append(m);
    const r = anchor.getBoundingClientRect();
    const w = m.offsetWidth, ht = m.offsetHeight;
    m.style.left = `${Math.max(8, Math.min(r.left, innerWidth - w - 8))}px`;
    m.style.top = `${r.bottom + 6 + ht > innerHeight ? Math.max(8, r.top - ht - 6) : r.bottom + 6}px`;
    menuEl = m; menuFor = anchor;
    anchor.setAttribute?.("aria-expanded", "true");
    return m;
  }
  function closeMenu() { menuEl?.remove(); menuFor?.setAttribute?.("aria-expanded", "false"); menuEl = menuFor = null; }
  listen(document, "pointerdown", (e) => { if (!menuEl) return; const path = e.composedPath(); if (!path.includes(menuEl) && !path.includes(menuFor)) closeMenu(); });
  listen(document, "keydown", (e) => { if (e.key === "Escape") { if (menuEl) closeMenu(); else if ($("brandDlg") && !draft.busy) closeDialog(); } });
  let toastT = 0;
  function toast(t) { $("layer").querySelector(".toast")?.remove(); const e = h("div", { class: "toast", role: "status", text: t }); $("layer").append(e); clearTimeout(toastT); toastT = setTimeout(() => e.remove(), 2400); }

  // ── Undo, redo, commit ────────────────────────────────────────────────────────────────────────────────
  const state = () => ({ html: sourceHtml(), css: body().css, after: JSON.stringify(body().after), langs: JSON.stringify({ langs: body().langs || {}, from: body().langFrom || {} }) });
  function snap() { const s = H(); s.past.push(state()); if (s.past.length > 80) s.past.shift(); s.future.length = 0; buttons(); }
  function restore(x) { body().css = x.css; body().after = JSON.parse(x.after); if (x.langs) { const l = JSON.parse(x.langs); body().langs = l.langs; body().langFrom = l.from; if (S.lang && !l.langs[S.lang]) S.lang = ""; } setSource(x.html); body().html = x.html; S.sel = null; changed(); draw(); refresh(); }
  function undo() { const s = H(); if (!s.past.length) return; s.future.push(state()); restore(s.past.pop()); }
  function redo() { const s = H(); if (!s.future.length) return; s.past.push(state()); restore(s.future.pop()); }
  function buttons() { $("undo").disabled = !H().past.length; $("redo").disabled = !H().future.length; }
  function changed() { langUi(); if (cur.state === "live") cur.state = "changed"; if (cur.state === "new" && built()) cur.state = "draft"; S.pubMsg = ""; pubUi(); chatHead(); buttons(); save(); }
  function commit() { body().html = sourceHtml(); changed(); draw(); refresh(); }
  function refresh() { if (S.mode === "edit") { panel(); tree(); } if (S.mode === "code") showCode(); if (S.mode === "after") renderAfter(); }
  $("undo").onclick = undo; $("redo").onclick = redo;

  // ── Views and devices ─────────────────────────────────────────────────────────────────────────────────
  function setMode(m) {
    S.mode = m;
    for (const [id, v] of [["t-preview", "preview"], ["t-edit", "edit"], ["t-code", "code"], ["t-after", "after"]]) $(id).setAttribute("aria-selected", String(m === v));
    $("canvas").hidden = m === "code" || m === "after";
    $("codeView").hidden = m !== "code";
    $("afterView").hidden = m !== "after";
    $("panel").hidden = m !== "edit";
    $("navBtn").hidden = m !== "edit";
    $("navi").hidden = m !== "edit" || !S.nav;
    if (m !== "edit") { S.sel = null; $("hov").hidden = true; }
    if (m === "edit") S.view = done ? (src.querySelector("[data-cl-thanks]") ? "thanks" : 0) : stepAt;
    if ((m === "edit" || m === "code") && S.lang) { S.lang = ""; langUi(); toast(`${m === "edit" ? "Edit" : "Code"} works on the form's own language`); }
    if (m === "edit" && !store.get("clr-studio-edit-folded", false)) { store.set("clr-studio-edit-folded", true); setChatFold(true); }
    draw();
    refresh();
  }
  for (const [id, v] of [["t-preview", "preview"], ["t-edit", "edit"], ["t-code", "code"], ["t-after", "after"]]) $(id).onclick = () => setMode(v);
  function setDevice(d) { S.device = d; $("frame").className = `frame${d === "tab" ? " tablet" : d === "phone" ? " phone" : ""}`; for (const [id, v] of [["d-desk", "desk"], ["d-tab", "tab"], ["d-phone", "phone"]]) $(id).setAttribute("aria-pressed", String(d === v)); setTimeout(overlay, 340); }
  $("d-desk").onclick = () => setDevice("desk"); $("d-tab").onclick = () => setDevice("tab"); $("d-phone").onclick = () => setDevice("phone");
  $("restart").onclick = () => { stepAt = 0; done = false; draw(); };
  $("navBtn").onclick = () => { S.nav = !S.nav; $("navBtn").setAttribute("aria-pressed", String(S.nav)); $("navi").hidden = !S.nav; tree(); setTimeout(overlay, 0); };
  $("p-style").onclick = () => { S.ptab = "style"; panel(); };
  $("p-set").onclick = () => { S.ptab = "settings"; panel(); };

  function showCode() { for (const [id, f] of [["c-html", "html"], ["c-css", "css"], ["c-brand", "brand"]]) $(id).setAttribute("aria-pressed", String(S.file === f)); $("codeText").value = S.file === "html" ? sourceHtml() : S.file === "css" ? body().css : brandOf(cur)?.css || ""; }
  for (const [id, f] of [["c-html", "html"], ["c-css", "css"], ["c-brand", "brand"]]) $(id).onclick = () => { S.file = f; showCode(); };
  $("codeApply").onclick = () => {
    snap();
    const v = $("codeText").value;
    if (S.file === "html") setSource(v);
    else if (S.file === "css") body().css = v;
    else { const b = brandOf(cur); if (b) { b.css = v; api.keepCss(b.id, v); } }
    commit(); toast("Applied");
  };

  // On submission: a thank-you, a page or a meeting, which meeting each answer books, who books it, and what every
  // send does.
  function renderAfter() {
    const box = $("afterInner"); box.innerHTML = "";
    const a = body().after;
    const set = (p) => { snap(); body().after = { ...a, ...p }; changed(); renderAfter(); runCheck(); };
    const c1 = h("div", { class: "card2" }, h("h3", { text: "After they send it" }), pills([["thanks", "Show the thank-you"], ["page", "Go to a page"], ["meeting", "Book a meeting"]], a.kind, (k) => set({ kind: k, ...(k === "meeting" && !a.meeting && MEETINGS[0] ? { meeting: MEETINGS[0].id } : {}) })));
    if (a.kind === "page") { const i = h("input", { class: "in", placeholder: "https://yourcompany.com/thanks", value: a.url || "", "aria-label": "Page address", style: "height:34px" }); i.addEventListener("change", () => set({ url: i.value.trim() })); c1.append(i); }
    box.append(c1);
    if (a.kind === "meeting") meetingCards(box, a, set);
    box.append(alwaysCard(a, set));
  }

  const pills = (opts, val, fn) => h("div", { class: "chips" }, ...opts.map(([v, t]) => h("button", { class: `pill${v === val ? " on" : ""}`, text: t, onclick: () => fn(v) })));
  // A pill that opens a menu. Items: [label, run, checked?] or "sep".
  const menuPill = (text, items, label) => {
    const b = h("button", { class: "pill", html: `<span></span>${SVG(P.chev, 12)}`, "aria-label": label || null });
    b.firstChild.textContent = text;
    b.onclick = () => openMenu(b, items.map((x) => (x === "sep" ? h("div", { class: "msep" }) : h("button", { class: "mi small", role: "menuitemcheckbox", "aria-checked": x[2] ? "true" : null, text: x[0], onclick: () => { closeMenu(); x[1](); } }))));
    return b;
  };
  const logoImg = (domain) => (domain ? `<img class="logo" alt="" src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64" loading="lazy">` : SVG(P.link, 14));

  function meetingCards(box, a, set) {
    // Where they book: Claritia's own calendar, or an outside scheduler opened in the form.
    const tool = a.tool || "claritia";
    // Each scheduler shows its logo beside its name; Claritia its own mark, Other link a link icon.
    const logo = (x) => (x === "claritia" ? `<svg class="logo mark" viewBox="0 0 32 32" aria-hidden="true"><path d="M7 12V7h5M20 7h5v5M25 20v5h-5M12 25H7v-5" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M11.5 16.5l3 3 6-7" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>` : logoImg(x.domain));
    const toolPill = ([v, label, x]) => h("button", { class: `pill${v === tool ? " on" : ""}`, html: `${logo(x)}<span></span>`, onclick: () => set({ tool: v === "claritia" ? "" : v }) });
    const cS = h("div", { class: "card2" }, h("h3", { text: "Book with" }), h("div", { class: "chips" }, ...[["claritia", "Claritia calendar", "claritia"], ...SCHEDULERS.map((x) => [x.value, x.label, x])].map((t) => { const b = toolPill(t); b.lastChild.textContent = t[1]; return b; })));
    if (tool !== "claritia") {
      const i = h("input", { class: "in", placeholder: SCHEDULERS.find((x) => x.value === tool)?.domain ? `https://${SCHEDULERS.find((x) => x.value === tool).domain}/your-team/demo` : "https://", value: a.link || "", "aria-label": "Scheduler link", style: "height:34px" });
      i.addEventListener("change", () => set({ link: i.value.trim() }));
      cS.append(i);
      const problem = a.link ? linkProblem(tool, a.link) : null;
      if (problem) cS.append(h("p", { class: "err", text: problem }));
      box.append(cS);
      return;
    }
    box.append(cS);
    if (!MEETINGS.length) { box.append(h("div", { class: "card2" }, h("h3", { text: "No meeting types yet" }), h("div", {}, h("button", { class: "pill", text: "Open Meetings", onclick: () => api.openMeetings() })))); return; }
    const mName = (id) => MEETINGS.find((m) => m.id === id)?.name || "Pick";
    box.append(h("div", { class: "card2" }, h("h3", { text: "Meeting" }), pills(MEETINGS.map((m) => [m.id, `${m.name}, ${m.length} min`]), a.meeting, (id) => set({ meeting: id }))));

    // Who books it: a Dynamic meeting's rules in one line. The routing lives on the meeting type.
    const used = [...new Set([a.meeting, ...(a.routes || []).map((r) => r.meeting)])].map((id) => MEETINGS.find((m) => m.id === id)).filter((m) => m?.dynamic);
    if (used.length) {
      const cW = h("div", { class: "card2" }, h("h3", { text: "Who books it" }));
      for (const m of used) cW.append(h("div", { class: "who" }, h("p", {}, ...(used.length > 1 ? [h("b", { text: `${m.name}: ` })] : []), document.createTextNode(m.who || "Dynamic")), h("button", { class: "pill", text: "Edit routing", onclick: () => api.openMeeting(m.id) })));
      box.append(cW);
    }

    // Route by answer: any test on any question or past fill, top to bottom, Otherwise the meeting above.
    const qs = cleanPage(sourceHtml()).questions;
    const qOf = (name) => qs.find((x) => x.name === name);
    const fieldLabel = (f) => PAST_ROUTES.find((p) => p.field === f)?.label || qOf(f)?.label || f;
    const routes = (a.routes || []).map((r) => cleanRoute(r) || r);
    const c3 = h("div", { class: "card2" }, h("h3", { text: "Route by answer" }));
    routes.forEach((r, i) => {
      const q = qOf(r.field);
      const kind = routeKind(r.field, q);
      const upd = (p2) => set({ routes: routes.map((x, j) => (j === i ? { ...x, ...p2 } : x)) });
      const row = h("div", { class: "rule" }, h("span", { class: "w", text: i ? "Or when" : "When" }));
      row.append(menuPill(fieldLabel(r.field), [...qs.map((x) => [x.label, () => upd({ field: x.name, ...routeStart(x.name, x) }), x.name === r.field]), "sep", ...PAST_ROUTES.map((p) => [p.label, () => upd({ field: p.field, ...routeStart(p.field) }), p.field === r.field])], "Question"));
      const ops = ROUTE_OPS[kind];
      if (ops.length > 1) row.append(menuPill(OP_LABEL[r.op] || "is", ops.map((op) => [OP_LABEL[op], () => upd({ op, value: op === "between" ? ["", ""] : op === "filled" || op === "empty" ? undefined : Array.isArray(r.value) && kind !== "choice" ? r.value[0] : r.value === undefined ? (kind === "choice" ? [] : "") : r.value }), op === r.op]), "Test"));
      const num = (v, label, fn) => { const i2 = h("input", { class: "in num", type: "number", inputmode: "decimal", value: v ?? "", "aria-label": label }); i2.addEventListener("change", () => fn(i2.value.trim())); return i2; };
      if (r.op !== "filled" && r.op !== "empty") {
        if (kind === "choice") {
          const vals = Array.isArray(r.value) ? r.value : r.value ? [r.value] : [];
          row.append(menuPill(vals.map((v) => q?.options.find((o) => o.value === v)?.label || v).join(" or ") || "Pick", (q?.options || []).map((o) => [o.label || o.value, () => upd({ value: vals.includes(o.value) ? vals.filter((v) => v !== o.value) : [...vals, o.value] }), vals.includes(o.value)]), "Answer"));
        } else if (kind === "yesno") row.append(menuPill(r.value === "false" ? "No" : "Yes", [["Yes", () => upd({ value: "true" }), r.value !== "false"], ["No", () => upd({ value: "false" }), r.value === "false"]], "Yes or no"));
        else if (kind === "days") row.append(num(r.value, "Days", (v) => upd({ value: v === "" ? "" : Number(v) })), h("span", { class: "w", text: "days" }));
        else if (r.op === "between") { const v2 = Array.isArray(r.value) ? r.value : ["", ""]; row.append(num(v2[0], "From", (v) => upd({ value: [v, v2[1]] })), h("span", { class: "w", text: "and" }), num(v2[1], "To", (v) => upd({ value: [v2[0], v] }))); }
        else if (kind === "number") row.append(num(Array.isArray(r.value) ? r.value[0] : r.value, "Number", (v) => upd({ value: v })));
        else { const t = h("input", { class: "in txt", value: Array.isArray(r.value) ? r.value[0] || "" : r.value ?? "", "aria-label": "Answer" }); t.addEventListener("change", () => upd({ value: t.value.trim() })); row.append(t); }
      }
      row.append(h("span", { class: "w", text: "book" }), menuPill(mName(r.meeting), MEETINGS.map((m) => [m.name, () => upd({ meeting: m.id }), m.id === r.meeting]), "Meeting"), h("button", { class: "ib", "aria-label": "Remove the route", html: SVG(P.x, 14), onclick: () => set({ routes: routes.filter((_, j) => j !== i) }) }));
      c3.append(row);
    });
    if (routes.length) c3.append(h("div", { class: "rule" }, h("span", { class: "w", text: "Otherwise, book" }), menuPill(mName(a.meeting), MEETINGS.map((m) => [m.name, () => set({ meeting: m.id }), m.id === a.meeting]), "Otherwise")));
    c3.append(h("div", {}, h("button", { class: "pill", html: `${SVG(P.plus, 14)}Add a route`, onclick: () => { const f = qs.find((x) => x.options.length) || qs[0]; const field = f ? f.name : PAST_ROUTES[0].field; set({ routes: [...routes, { field, ...routeStart(field, f), meeting: MEETINGS.find((m) => m.id !== a.meeting)?.id || MEETINGS[0].id }] }); } })));
    box.append(c3);
  }

  // Always do: what every send does, whatever it books. Email and Slack ride on the form; Send to and Follow-ups are
  // the form's destinations and workflows, so they need the form saved once.
  let extra = { form: "", sends: null, tools: null, flows: null, busy: false };
  async function loadExtra(force) {
    const id = cur?.formId || "";
    if (!force && extra.form === id && extra.sends) return;
    extra = { form: id, sends: id ? null : [], tools: extra.tools, flows: id ? null : [], busy: true };
    const [sends, tools, flows] = await Promise.all([id ? api.sends(id).catch(() => []) : [], extra.tools || api.tools().catch(() => []), id ? api.followUps(id).catch(() => []) : []]);
    if (!alive || extra.form !== id) return;
    extra = { ...extra, sends, tools, flows, busy: false };
    renderAfter();
  }
  async function ensureForm() {
    const c = cur;
    if (c.formId) return c.formId;
    if (!built() || !brandOf(c)) { toast("Build the form first"); return ""; }
    try {
      if (c.name === "New form") c.name = formName();
      const r = await api.saveDraft({ formId: null, name: c.name, html: sourceHtml(), css: c.body.css, brand: brandOf(c)?.css || "", after: c.body.after, kitId: c.brandId, lang: mainLang(), langs: c.body.langs || {} });
      c.formId = r.formId;
      if (c.state === "new") c.state = "draft";
      save(true); pubUi(); chatHead();
      return r.formId;
    } catch (e) {
      toast(e?.message || "Couldn't save the form. Try again.");
      return "";
    }
  }
  function alwaysCard(a, set) {
    const al = a.always || {};
    const setA = (p) => set({ always: { email: !!al.email, to: al.to || [], slack: !!al.slack, ...p } });
    const card = h("div", { class: "card2" }, h("h3", { text: "Always do" }));
    const eRow = h("div", { class: "arow" }, h("button", { class: `pill${al.email ? " on" : ""}`, "aria-pressed": String(!!al.email), text: "Email the team", onclick: () => setA({ email: !al.email }) }));
    if (al.email) { const i = h("input", { class: "in txt wide", placeholder: "name@company.com, name@company.com", value: (al.to || []).join(", "), "aria-label": "Team emails" }); i.addEventListener("change", () => setA({ to: i.value.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean) })); eRow.append(i); }
    card.append(eRow, h("div", { class: "arow" }, h("button", { class: `pill${al.slack ? " on" : ""}`, "aria-pressed": String(!!al.slack), html: `${logoImg("slack.com")}<span>Post to Slack</span>`, onclick: () => setA({ slack: !al.slack }) })));
    if (!extra.busy && ((cur?.formId || "") !== extra.form || !extra.sends)) void loadExtra(true);
    // Send to: CRMs and webhooks.
    const sRow = h("div", { class: "arow" }, h("span", { class: "w", text: "Send to" }));
    for (const d of extra.sends || []) sRow.append(h("span", { class: "pill" }, h("span", { html: logoImg(d.domain) }), h("span", { text: d.name }), h("button", { class: "ib sm", "aria-label": `Stop sending to ${d.name}`, html: SVG(P.x, 12), onclick: async () => { if (await api.removeSend(d)) void loadExtra(true); } })));
    const addSend = async (to) => { const id = await ensureForm(); if (!id) return; try { if (await api.addSend(id, to)) void loadExtra(true); } catch (e) { toast(e?.message || "Couldn't add it. Try again."); } };
    const have = new Set((extra.sends || []).map((d) => d.name));
    sRow.append(menuPill("Add", [...(extra.tools || []).filter((t) => !have.has(t.name)).map((t) => [t.name, () => addSend(t)]), ...((extra.tools || []).length ? ["sep"] : []), ["Webhook", () => addSend("webhook")]], "Send to"));
    // Follow-ups: workflows that start on this form.
    const fRow = h("div", { class: "arow" }, h("span", { class: "w", text: "Follow-up" }));
    for (const f of extra.flows || []) fRow.append(h("button", { class: "pill", text: f.name, onclick: () => api.openWorkflow(f.id) }));
    const follow = async (when) => { const id = await ensureForm(); if (id) { save(true); api.newFollowUp(id, when); } };
    fRow.append(menuPill("New follow-up", [["When they send it", () => follow("sent")], ...(a.kind === "meeting" ? [["When they don't book", () => follow("not_booked")]] : [])], "New follow-up"));
    card.append(sRow, fRow);
    return card;
  }

  // ── The form check (docs/studio-v2-plan.md 6.5): the page's own rules here, and layout, contrast, taps and fonts
  // measured at phone, tablet and desktop widths. Errors stop Publish; each issue can go to Tia as a fix. ─────────
  let issues = [], layoutFound = [], checkT = 0, checkRun = 0, checkKey = "";
  function runCheck() {
    clearTimeout(checkT);
    checkT = setTimeout(async () => {
      if (!alive || !cur) return;
      if (!built()) { issues = []; layoutFound = []; return checkUi(); }
      const key = `${sourceHtml()}\n${body().css}\n${brandOf(cur)?.css || ""}\n${JSON.stringify(body().after)}\n${MEETINGS.length}\n${brandOf(cur)?.profile?.industry || ""}\n${JSON.stringify(body().langs)}`;
      if (key === checkKey) return;
      checkKey = key;
      const base = [...checkStudioPage({ html: sourceHtml(), after: body().after, meetings: loaded ? MEETINGS : null, industry: brandOf(cur)?.profile?.industry ?? null, langs: body().langs }), ...staleLangs()];
      issues = [...base, ...layoutFound]; checkUi();
      const run = ++checkRun;
      const lay = await layoutIssues().catch(() => []);
      if (run !== checkRun || !alive) return;
      layoutFound = lay; issues = [...base, ...lay]; checkUi();
    }, 400);
  }
  const lum = (c) => { const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(c || ""); if (!m) return null; const ch = [m[1], m[2], m[3]].map((x) => { const v = Number(x) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return { l: 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2], a: m[4] === undefined ? 1 : Number(m[4]) }; };
  async function layoutIssues() {
    const out = [...(await layoutFor(sourceHtml(), mainLang(), ""))];
    for (const [code, html] of Object.entries(body().langs || {})) for (const i of await layoutFor(html, code, languageName(code))) if (i.code === "sideways" || i.code === "clipped") out.push(i);
    return out;
  }
  async function layoutFor(html, lang, label) {
    const out = [];
    const css = `${BASE}\n${cssFor(brandOf(cur)?.css)}\n${cssFor(body().css)}`;
    const where0 = label ? `In ${label}, ` : "";
    const brandText = String(brandOf(cur)?.css || "").toLowerCase();
    const where = { 390: "a phone", 768: "a tablet", 1100: "a desktop" };
    for (const w of [390, 768, 1100]) {
      const box = h("div", { style: `position:fixed;left:-30000px;top:0;width:${w}px;height:1000px;overflow:auto;visibility:hidden;pointer-events:none` });
      $("layer").append(box);
      const r = box.attachShadow({ mode: "open" });
      r.innerHTML = `<style>${css}</style><div class="cl-root"${lang ? ` lang="${lang}" dir="${isRtl(lang) ? "rtl" : "ltr"}"` : ""}>${html}</div>`;
      // Every step, condition and the thank-you at once, so each is measured.
      r.querySelectorAll("[hidden]").forEach((e) => e.removeAttribute("hidden"));
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      if (!alive) return out;
      if (Math.max(box.scrollWidth, r.querySelector(".cl-root").scrollWidth) > w + 2) out.push({ level: w === 390 ? "error" : "warning", code: "sideways", text: `${where0}the form scrolls sideways on ${where[w]} (${w}px wide).`.replace(/^t/, "T"), fix: `Make the form fit ${w}px wide with no sideways scrolling${label ? ` in ${label}` : ""}.` });
      if (w === 390) {
        // Choice cards whose own radio or check box is removed can't be reached with the keyboard.
        const gone = [...r.querySelectorAll('input[type="radio"],input[type="checkbox"]')].find((x) => { const cs = getComputedStyle(x); return cs.display === "none" || cs.visibility === "hidden"; });
        if (gone && !label) out.push({ level: "warning", code: "keyboard", text: "Some choices can't be reached with the keyboard: their radio or check box is removed.", fix: "Hide the native radio and check boxes visually (position absolute, opacity 0) instead of display none, and show focus on the choice card with label:has(input:focus-visible)." });
        const els = [...r.querySelectorAll("h1,h2,h3,h4,p,label,span,button,a,legend,li,strong,b,small")].slice(0, 300);
        let low = 0, clipped = false, small = false, font = "";
        for (const el of els) {
          const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
          const rect = el.getBoundingClientRect();
          if (!own || !rect.width || !rect.height) continue;
          const cs = getComputedStyle(el);
          // Contrast against the first solid background behind it.
          const fg = lum(cs.color);
          let bg = null;
          for (let p = el; p && p.nodeType === 1; p = p.parentElement) { const ps = getComputedStyle(p); if (ps.backgroundImage && ps.backgroundImage !== "none") { bg = "skip"; break; } const b = lum(ps.backgroundColor); if (b && b.a > 0.5) { bg = b; break; } }
          if (fg && bg && bg !== "skip" && low < 2 && !label) {
            const ratio = (Math.max(fg.l, bg.l) + 0.05) / (Math.min(fg.l, bg.l) + 0.05);
            const size = parseFloat(cs.fontSize), large = size >= 24 || (size >= 18.6 && Number(cs.fontWeight) >= 700);
            if (ratio < (large ? 3 : 4.5)) { low++; const t = el.textContent.trim().replace(/\s+/g, " ").slice(0, 40); out.push({ level: "warning", code: "contrast", text: `"${t}" is hard to read (contrast ${ratio.toFixed(1)} to 1).`, fix: `Raise the contrast of the text "${t}" to at least ${large ? 3 : 4.5} to 1, using the brand's darker colors.` }); }
          }
          if (!clipped && /hidden|clip/.test(cs.overflow + cs.overflowX) && el.scrollWidth > el.clientWidth + 1) { clipped = true; const t = el.textContent.trim().slice(0, 40); out.push({ level: "warning", code: "clipped", text: `${where0}"${t}" is cut off on a phone.`, fix: `Let the text "${t}" wrap so it isn't cut off on a phone.` }); }
          if (!small && !label && (el.tagName === "BUTTON" || el.matches("label.choice, label.check, a")) && rect.height < 40) { small = true; const t = el.textContent.trim().slice(0, 30); out.push({ level: "warning", code: "small-tap", text: `"${t}" is smaller than a finger on a phone (${Math.round(rect.height)}px tall).`, fix: "Make every button and choice at least 44px tall on phones." }); }
          const fam = (cs.fontFamily.split(",")[0] || "").replace(/["']/g, "").trim();
          if (!font && !label && brandText && fam && !/^(serif|sans-serif|monospace|system-ui|ui-sans-serif|ui-serif|-apple-system|inherit|initial)$/i.test(fam) && !brandText.includes(fam.toLowerCase())) { font = fam; out.push({ level: "warning", code: "font", text: `Uses the font ${fam}, which isn't the brand's.`, fix: `Use only the brand's fonts in place of ${fam}.` }); }
        }
      }
      box.remove();
    }
    return out;
  }
  function checkUi() {
    const errs = issues.filter((i) => i.level === "error").length;
    if (!errs && /first$/.test(S.pubMsg)) S.pubMsg = "";
    emit();
  }
  /** The state for the page's header. */
  function emit() {
    if (!alive) return;
    api.onState?.({
      ready: loaded && !!cur,
      chatId: cur?.id || "",
      formId: cur?.formId || "",
      name: cur?.name || "",
      state: cur?.state || "new",
      canPublish: !S.publishing && !!cur && built() && !!brandOf(cur) && !S.busy,
      publishing: S.publishing,
      issues: built() ? issues.map((i) => ({ level: i.level === "error" ? "error" : "warning", text: i.text, ...(i.fix ? { fix: i.fix } : {}), ...(/On submission/.test(i.text) ? { after: true } : {}) })) : [],
      canFix: !!brandOf(cur)?.css && !S.busy,
      msg: S.pubMsg,
    });
  }

  // ── Languages (docs/studio-v2-plan.md 6.4): the form in the site's language, and in others Tia translates. Visitors
  // get their own language with a switch on the form; right-to-left languages flip it. ──────────────────────────
  const COMMON = ["en", "es", "fr", "de", "pt", "it", "nl", "ar", "he", "ja", "zh", "ko", "hi", "pl", "sv", "tr"];
  const mainLang = () => body()?.lang || brandOf(cur)?.profile?.language || "en";
  const sig = (html) => { let x = 0; for (let i = 0; i < html.length; i++) x = (x * 31 + html.charCodeAt(i)) | 0; return String(x); };
  function staleLangs() { const now = sig(sourceHtml()); return Object.keys(body().langs || {}).filter((c) => body().langFrom?.[c] && body().langFrom[c] !== now).map((c) => ({ level: "warning", code: "lang-old", text: `The ${languageName(c)} version is older than the form. Update it in Languages.` })); }
  function langUi() {
    const b = $("langBtn");
    b.hidden = !cur || !built();
    b.classList.toggle("on", !!S.lang);
    b.innerHTML = S.translating ? tiaSvg(14, true) : SVG(P.globe, 15);
    b.append(h("span", { text: (S.lang || mainLang()).toUpperCase() }));
  }
  function langMenu() {
    const langs = Object.keys(body().langs || {});
    const now = sig(sourceHtml());
    const row = (code, main) => h("div", { class: "mrow" },
      h("button", { class: "mi small", role: "menuitemradio", "aria-checked": String((S.lang || mainLang()) === code), onclick: () => { closeMenu(); if (S.mode !== "preview") setMode("preview"); S.lang = main ? "" : code; langUi(); draw(); } }, h("span", { class: "nm", text: `${languageName(code)}${main ? " (the form's own)" : ""}` })),
      !main && body().langFrom?.[code] !== now ? h("button", { class: "pill", text: "Update", onclick: () => { closeMenu(); void translate(code); } }) : null,
      !main ? h("button", { class: "ib", "aria-label": `Remove ${languageName(code)}`, html: SVG(P.del, 14), onclick: () => { snap(); delete body().langs[code]; delete body().langFrom[code]; if (S.lang === code) S.lang = ""; changed(); langUi(); draw(); closeMenu(); } }) : null);
    const suggest = [...new Set([...(brandOf(cur)?.profile?.languages || []), ...COMMON])].filter((c) => c !== mainLang() && !langs.includes(c)).slice(0, 10);
    const add = suggest.map((c) => { const b = h("button", { class: "mi small", html: `${SVG(P.plus, 14)}<span class="nm"></span>`, onclick: () => { closeMenu(); void translate(c); } }); b.querySelector(".nm").textContent = languageName(c); return b; });
    openMenu($("langBtn"), [row(mainLang(), true), ...langs.map((c) => row(c, false)), h("div", { class: "msep" }), h("div", { class: "ihead" }, h("span", { text: "Add a language" })), ...add], 280);
  }
  $("langBtn").onclick = () => (menuEl && menuFor === $("langBtn") ? closeMenu() : langMenu());
  async function translate(code) {
    if (S.translating || S.busy || !built()) return;
    const c = cur, html = sourceHtml();
    S.translating = code; langUi(); toast(`Tia is writing the form in ${languageName(code)}`);
    try {
      // Only the words go to Tia and come back, put back in the same places, so the page can't change shape.
      const copy = clean(html);
      const slots = [];
      const walk = (n) => { for (const x of n.childNodes) { if (x.nodeType === 3 && x.textContent.trim()) slots.push({ node: x }); else if (x.nodeType === 1) { for (const a of ["placeholder", "alt", "title", "aria-label", "data-cl-label"]) if (x.getAttribute(a)?.trim()) slots.push({ el: x, attr: a }); if (!["SCRIPT", "STYLE"].includes(x.tagName)) walk(x); } } };
      walk(copy);
      const words = slots.map((t) => (t.node ? t.node.textContent : t.el.getAttribute(t.attr)));
      const done2 = await api.translate(words, `${languageName(code)} (${code})`);
      if (done2.length !== slots.length) throw new Error(`Tia couldn't write the ${languageName(code)} version. Try again.`);
      slots.forEach((t, i) => { if (t.node) t.node.textContent = done2[i]; else t.el.setAttribute(t.attr, done2[i]); });
      c.body.langs[code] = copy.innerHTML.trim();
      c.body.langFrom[code] = sig(html);
      if (cur === c) { S.lang = code; if (S.mode !== "preview") setMode("preview"); }
      changed();
      toast(`${languageName(code)} added`);
    } catch (e) {
      toast(e?.message || "Couldn't translate the form.");
    } finally {
      S.translating = "";
      if (alive) { langUi(); draw(); }
    }
  }

  // ── Publish ───────────────────────────────────────────────────────────────────────────────────────────
  const formName = () => (src.querySelector("h1,h2,h3,legend")?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80) || `${brandOf(cur)?.name || "New"} form`;
  function pubUi() {
    const o = $("openBtn");
    o.hidden = !cur?.formId || cur.state === "new" || cur.state === "draft";
    if (cur?.formId) o.href = api.formUrl(cur.formId);
    emit();
  }
  /** Publish from the header: the form check first, then the form goes live. */
  async function publishNow() {
    // The page's own rules run here, on the page as it is now; layout findings are notes and never stop it.
    if (S.publishing || !cur || !built() || !brandOf(cur) || S.busy) return "failed";
    const now = [...checkStudioPage({ html: sourceHtml(), after: body().after, meetings: loaded ? MEETINGS : null, industry: brandOf(cur)?.profile?.industry ?? null, langs: body().langs }), ...layoutFound];
    const errs = now.filter((i) => i.level === "error");
    if (errs.length) { issues = now; S.pubMsg = `Fix ${errs.length === 1 ? "1 problem" : `${errs.length} problems`} first`; emit(); return "blocked"; }
    const c = cur;
    S.publishing = true; S.pubMsg = ""; pubUi();
    let ok = "failed";
    try {
      if (c.name === "New form") c.name = formName();
      const r = await api.publish({ formId: c.formId || null, name: c.name, html: sourceHtml(), css: c.body.css, brand: brandOf(c)?.css || "", after: c.body.after, kitId: c.brandId, lang: mainLang(), langs: c.body.langs || {} });
      c.formId = r.formId; c.state = "live"; ok = "live";
      if (r.problem) S.pubMsg = r.problem;
      toast(`${c.name} is live`);
    } catch (e) {
      S.pubMsg = e?.message || "Couldn't publish. Try again.";
    } finally {
      S.publishing = false;
      if (alive) { pubUi(); chatHead(); save(true); }
    }
    return ok;
  }

  // ── The chat column ───────────────────────────────────────────────────────────────────────────────────
  function setChatFold(f) {
    $("chat").classList.toggle("folded", f);
    $("chatFold").innerHTML = f ? tiaSvg(22) : SVG(P.panel);
    $("chatFold").setAttribute("data-tip", f ? "Chat with Tia" : "Hide the chat");
    $("chatFold").setAttribute("aria-label", f ? "Chat with Tia" : "Hide the chat");
    $("chatFold").classList.toggle("tipleft", !f); $("chatFold").classList.toggle("tipright", f);
    setTimeout(overlay, 220);
  }
  $("chatFold").onclick = () => setChatFold(!$("chat").classList.contains("folded"));
  const mark = (b) => (b?.logo ? h("img", { class: "bmark", src: b.logo, alt: "" }) : h("span", { class: "bempty", text: b ? b.name.charAt(0) : "+" }));
  const stateBadge = (c) => h("span", { class: `badge${c.state === "live" ? " live" : ""}`, text: c.state === "live" ? "Live" : c.state === "changed" ? "Changes not live" : "Draft" });
  function chatHead() { const b = $("chatPick"); b.innerHTML = ""; if (!cur) return; b.append(mark(brandOf(cur)), h("span", { class: "nm", text: cur.name }), h("span", { html: SVG(P.chev, 14), style: "color:var(--muted);display:inline-flex" })); }
  let deleting = "";
  function chatMenu(q = "") {
    const search = h("input", { class: "search", placeholder: "Search chats", value: q, "aria-label": "Search chats" });
    const ql = q.toLowerCase();
    const list = chats.filter((c) => c.name.toLowerCase().includes(ql) || (brandOf(c)?.name || "").toLowerCase().includes(ql));
    const rows = list.map((c) => deleting === c.id
      ? h("div", { class: "mdel" }, h("span", { class: "q", text: `Delete the chat "${c.name}"?${c.formId ? " The form stays in Forms." : ""}` }), h("button", { class: "pill primary", text: "Delete", onclick: async () => { deleting = ""; chats = chats.filter((x) => x.id !== c.id); api.deleteChat(c.id).catch(() => {}); if (cur.id === c.id) await open(chats[0] || newChat(true)); chatMenu(search.value); } }), h("button", { class: "pill", text: "Keep", onclick: () => { deleting = ""; chatMenu(search.value); } }))
      : h("div", { class: "mrow" }, h("button", { class: "mi", role: "menuitemradio", "aria-checked": String(c.id === cur.id), onclick: () => { closeMenu(); open(c); } }, mark(brandOf(c)), h("span", { class: "nm", text: c.name }), stateBadge(c)), h("button", { class: "ib", "aria-label": `Delete ${c.name}`, html: SVG(P.del, 14), onclick: (e) => { e.stopPropagation(); deleting = c.id; chatMenu(search.value); } })));
    const m = openMenu($("chatPick"), [search, ...rows, h("div", { class: "msep" }), h("button", { class: "mi small", html: `${SVG(P.plus, 14)}<span class="nm">New chat</span>`, onclick: () => { closeMenu(); newChat(); } })], 330);
    search.addEventListener("input", () => { const pos = search.selectionStart; chatMenu(search.value); const s2 = menuEl.querySelector(".search"); s2.focus(); s2.setSelectionRange(pos, pos); });
    if (!q) setTimeout(() => m.querySelector(".search")?.focus(), 0);
  }
  $("chatPick").onclick = () => (menuEl && menuFor === $("chatPick") ? closeMenu() : chatMenu());
  function newChat(silent) {
    const c = blank(cur?.brandId && brandOf(cur) ? cur.brandId : brands[0]?.id || "");
    chats.unshift(c);
    if (!silent) { open(c); if (!brands.length) openDialog(); }
    return c;
  }
  async function open(c) {
    if (cur && cur !== c) save(true);
    if (!c.body) { const full = await api.chat(c.id).catch(() => null); c.body = full?.body || blank(c.brandId).body; if (full?.name) c.name = full.name; }
    c.body.after ||= { kind: "thanks", url: "", meeting: "", routes: [] };
    c.body.turns ||= []; c.body.log ||= []; c.body.ids ||= {}; c.body.langs ||= {}; c.body.langFrom ||= {};
    cur = c;
    setSource(c.body.html || "");
    stepAt = 0; done = false; S.sel = null; S.about = null; S.pubMsg = "";
    S.lang = "";
    if (!c.body.lang && brandOf(c)?.profile?.language) c.body.lang = brandOf(c).profile.language;
    aboutUi(); chatHead(); brandUi(); renderLog(); draw(); pubUi(); buttons(); refresh(); langUi();
    const b = brandOf(c);
    if (b && !b.css) void readLook(b);
  }

  // ── Brands: the workspace's own, each with its real logo and the CSS Tia read from its site ─────────────
  function brandUi() {
    const btn = $("brandBtn"); btn.innerHTML = "";
    const b = brandOf(cur);
    btn.append(mark(b), h("span", { class: "nm", text: b ? b.name : loaded ? "Pick a brand" : "Loading brands" }), h("span", { html: SVG(P.chev, 14), style: "color:var(--muted);display:inline-flex" }));
    const pb = $("profileBtn");
    pb.hidden = !b?.profile;
    if (b?.profile) { pb.innerHTML = ""; pb.append(h("span", { text: profileWords(b.profile) }), h("span", { html: SVG(P.chev, 12), style: "display:inline-flex;color:var(--muted)" })); }
    const st = $("brandStatus"); st.innerHTML = ""; st.hidden = true;
    if (b && looking.has(b.id)) { st.hidden = false; st.className = "bstatus"; st.innerHTML = tiaSvg(16, true); st.append(h("span", { text: `Reading ${b.name}'s look` })); }
    else if (b?.lookErr) { st.hidden = false; st.className = "bstatus err"; st.append(h("span", { text: b.lookErr }), h("button", { class: "pill", text: "Try again", onclick: () => void readLook(b, true) })); }
  }
  let brandDeleting = "";
  function brandMenu() {
    const rows = brands.map((b) => brandDeleting === b.id
      ? h("div", { class: "mdel" }, h("span", { class: "q", text: `Delete ${b.name}?` }), h("button", { class: "pill primary", text: "Delete", onclick: async () => {
          try { await api.deleteBrand(b.id); } catch (e) { brandDeleting = ""; toast(e?.message || "Couldn't delete the brand."); return brandMenu(); }
          brands = brands.filter((x) => x.id !== b.id); brandDeleting = "";
          brandUi(); chatHead(); draw(); renderLog(); brandMenu();
        } }), h("button", { class: "pill", text: "Keep", onclick: () => { brandDeleting = ""; brandMenu(); } }))
      : h("div", { class: "mrow" }, h("button", { class: "mi", role: "menuitemradio", "aria-checked": String(b.id === cur?.brandId), onclick: () => { closeMenu(); useBrand(b.id); } }, mark(b), h("span", { class: "nm", text: b.name })), h("button", { class: "ib", "aria-label": `Delete ${b.name}`, html: SVG(P.del, 14), onclick: (e) => { e.stopPropagation(); brandDeleting = b.id; brandMenu(); } })));
    openMenu($("brandBtn"), [...rows, rows.length ? h("div", { class: "msep" }) : null, h("button", { class: "mi small", html: `${SVG(P.plus, 14)}<span class="nm">Add a brand</span>`, onclick: () => { closeMenu(); openDialog(); } })].filter(Boolean), $("brandBtn").offsetWidth);
  }
  $("brandBtn").onclick = () => (menuEl && menuFor === $("brandBtn") ? closeMenu() : brandMenu());
  // One click fixes what the site told Tia about the brand.
  $("profileBtn").onclick = () => {
    const b = brandOf(cur);
    if (!b?.profile) return;
    if (menuEl && menuFor === $("profileBtn")) return closeMenu();
    openMenu($("profileBtn"), INDUSTRIES.map((i) => h("button", { class: "mi small", role: "menuitemradio", "aria-checked": String(i.key === b.profile.industry), text: i.name, onclick: () => { closeMenu(); b.profile = { ...b.profile, industry: i.key }; api.keepProfile(b.id, b.profile); brandUi(); renderLog(); runCheck(); } })), 260);
  };
  function useBrand(id) {
    const b = brands.find((x) => x.id === id); if (!b || !cur) return;
    const old = brandOf(cur);
    // A built form asks first, keeps its look until the new one is ready, then Tia moves it over in one change.
    if (built() && old && old.id !== id) return switchDialog(old, b);
    if (cur.brandId !== id) { snap(); cur.brandId = id; changed(); }
    brandUi(); chatHead(); draw(); renderLog();
    if (!b.css) void readLook(b);
  }
  function switchDialog(old, b) {
    closeDialog();
    const box = h("div", { class: "dlgbox" }, h("h2", { text: `Switch this form to ${b.name}?` }), h("p", { class: "hint0", text: `Tia changes its look and ${old.name}'s name in its words.` }),
      h("div", { class: "acts" }, h("button", { class: "pill", text: `Keep ${old.name}`, onclick: closeDialog }), h("button", { class: "pill primary", text: "Switch", onclick: () => { closeDialog(); void switchBrand(old, b); } })));
    $("layer").append(h("div", { class: "dlg", id: "brandDlg", role: "dialog", "aria-modal": "true", "aria-label": "Switch brand", onmousedown: (e) => { if (e.target.id === "brandDlg") closeDialog(); } }, box));
  }
  async function switchBrand(old, b) {
    const c = cur;
    S.hold = old.css || "";
    snap(); c.brandId = b.id; changed();
    brandUi(); chatHead(); draw(); renderLog();
    if (!b.css) await readLook(b);
    S.hold = "";
    if (!alive || cur !== c) return;
    if (!b.css) { draw(); return; }
    draw();
    void send(`Switch this form to ${b.name}`, { from: old.name });
  }
  async function readLook(b, fresh = false) {
    if (looking.has(b.id)) return;
    looking.add(b.id); b.lookErr = "";
    brandUi(); renderLog();
    try {
      const r = await api.look(b.id, fresh);
      b.css = r.css; api.keepCss(b.id, r.css);
      if (r.profile && !b.profile) { b.profile = r.profile; api.keepProfile(b.id, r.profile); }
      if (r.say && cur?.brandId === b.id && !cur.body.log.length) cur.body.log.push({ who: "ai", text: r.say });
      if (cur?.brandId === b.id) { draw(); if (S.mode === "code") showCode(); }
    } catch (e) {
      b.lookErr = e?.message || `Couldn't read ${b.name}'s look.`;
    } finally {
      looking.delete(b.id);
      if (alive) { brandUi(); renderLog(); }
    }
  }
  const hostOf = (u) => { try { return new URL(/^https?:\/\//i.test(String(u).trim()) ? String(u).trim() : `https://${String(u).trim()}`).hostname.replace(/^www\./, ""); } catch { return ""; } };

  // Add a brand: the website, then "Is this the brand?" with its name and real logo, then its look.
  let draft = { step: 1, url: "", look: null, busy: "", err: "", browser: false };
  function openDialog() { draft = { step: 1, url: "", look: null, busy: "", err: "", browser: false }; $("layer").append(h("div", { class: "dlg", id: "brandDlg", role: "dialog", "aria-modal": "true", "aria-label": "Add a brand", onmousedown: (e) => { if (e.target.id === "brandDlg" && !draft.busy) closeDialog(); } }, h("div", { class: "dlgbox", id: "dlgBody" }))); dialog(); }
  function closeDialog() { $("brandDlg")?.remove(); }
  function dialog() {
    const box = $("dlgBody"); if (!box) return;
    box.innerHTML = "";
    const working = (t) => { const w = h("div", { class: "working", html: tiaSvg(16, true) }); w.append(h("span", { text: t })); return w; };
    const acts = h("div", { class: "acts" });
    if (draft.step === 1) {
      box.append(h("h2", { text: "Add a brand" }));
      const site = h("input", { class: "in", placeholder: "Website, like acme.com", value: draft.url, id: "dlgSite", "aria-label": "Website", autocomplete: "off", disabled: !!draft.busy || null });
      const go = h("button", { class: "pill primary", type: "submit", text: draft.busy === "site" ? "Reading" : "Read", disabled: !!draft.busy || !hostOf(draft.url).includes(".") || null });
      site.addEventListener("input", () => { draft.url = site.value; draft.err = ""; go.disabled = !hostOf(draft.url).includes("."); });
      const f = h("form", { class: "siteform", onsubmit: (e) => { e.preventDefault(); void readSiteNow(); } }, site, go);
      box.append(f);
      if (draft.busy === "site") box.append(working(`Reading ${hostOf(draft.url)}`));
      if (draft.busy === "browser") box.append(working(`Opening ${hostOf(draft.url)} in a browser`));
      if (draft.err) box.append(h("div", { class: "err", text: draft.err }));
      if (draft.browser && !draft.busy) acts.append(h("button", { class: "pill", text: "Read it in a browser", onclick: () => void scanNow() }));
      acts.append(h("button", { class: "pill", text: "Cancel", disabled: !!draft.busy || null, onclick: closeDialog }));
      box.append(acts);
      setTimeout(() => site.focus(), 0);
    } else {
      box.append(h("h2", { text: "Is this the brand?" }));
      const name = h("input", { class: "in nameedit", value: draft.look.name, id: "dlgName", "aria-label": "Brand name" });
      const yes = h("button", { class: "pill primary", text: draft.busy === "confirm" ? "Saving" : "Yes, use this brand", disabled: !!draft.busy || !draft.look.name.trim() || null, onclick: () => void confirmNow() });
      name.addEventListener("input", () => { draft.look.name = name.value; yes.disabled = !name.value.trim(); });
      box.append(h("div", { class: "confirm" }, draft.look.logo ? h("img", { src: draft.look.logo, alt: "" }) : h("span", { class: "bempty", text: draft.look.name.charAt(0) }), h("div", { class: "t" }, name, h("span", { text: draft.look.site }))));
      if (!draft.look.logo) box.append(h("p", { class: "hint0", text: "No logo found on the site. Forms show the name until one is added in Settings, Brand." }));
      if (draft.err) box.append(h("div", { class: "err", text: draft.err }));
      acts.append(h("button", { class: "pill", text: "Back", disabled: !!draft.busy || null, onclick: () => { draft.step = 1; draft.err = ""; dialog(); } }), yes);
      box.append(acts);
    }
  }
  async function readSiteNow() {
    const host = hostOf(draft.url);
    if (!host.includes(".") || draft.busy) return;
    const had = brands.find((b) => hostOf(b.site) === host);
    if (had) { closeDialog(); useBrand(had.id); return; }
    draft.busy = "site"; draft.err = ""; draft.browser = false; dialog();
    try { draft.look = await api.readSite(host); draft.step = 2; }
    catch (e) { draft.err = e?.message || `Couldn't open ${host}.`; draft.browser = !!e?.browser; }
    finally { draft.busy = ""; if (alive) dialog(); }
  }
  async function scanNow() {
    const host = hostOf(draft.url);
    draft.busy = "browser"; draft.err = ""; dialog();
    try {
      const { kitId } = await api.scan(host);
      let kit = null;
      for (let i = 0; i < 40 && alive && $("brandDlg"); i++) {
        await new Promise((r) => setTimeout(r, 3000));
        kit = await api.kit(kitId).catch(() => null);
        if (kit && (kit.logo || kit.scanStatus === "done" || kit.scanStatus === "failed")) break;
      }
      if (!kit || kit.scanStatus === "failed") throw new Error(`Couldn't read ${host} in a browser either.`);
      draft.look = { site: host, url: `https://${host}`, name: kit.name, logo: kit.logo, logoUrl: kit.logoUrl, logoSvg: kit.logoSvg };
      draft.step = 2;
    } catch (e) { draft.err = e?.message || `Couldn't read ${host} in a browser.`; }
    finally { draft.busy = ""; if (alive) dialog(); }
  }
  async function confirmNow() {
    if (draft.busy) return;
    draft.busy = "confirm"; draft.err = ""; dialog();
    try {
      const { kitId } = await api.confirm({ url: draft.look.url || `https://${draft.look.site}`, name: draft.look.name.trim(), logoUrl: draft.look.logoUrl || null, logoSvg: draft.look.logoSvg || null });
      const had = brands.find((x) => x.id === kitId);
      const b = had || { id: kitId, name: draft.look.name.trim(), site: draft.look.site, logo: draft.look.logo, css: "" };
      if (!had) brands = [...brands, b];
      draft.busy = ""; closeDialog();
      if (!cur) await open(newChat(true));
      useBrand(kitId);
    } catch (e) { draft.busy = ""; draft.err = e?.message || "Couldn't save the brand."; dialog(); }
  }

  // ── The chat with Tia ─────────────────────────────────────────────────────────────────────────────────
  const STARTS = ["A demo request that asks team size", "A new patient booking form", "An event sign-up with a plus-one", "A quote request with a file upload"];
  function renderLog() {
    const boxEl = $("msgs"); boxEl.innerHTML = "";
    if (!cur) return;
    const b = brandOf(cur);
    const ready = !!b && !!b.css && !looking.has(b.id);
    const log = cur.body.log;
    if (!log.some((m) => m.who === "me")) {
      const g = h("div", { class: "msg ai" }, h("div", { class: "who", html: `${tiaSvg(18)}<span>Tia</span>` }));
      for (const m of log) if (m.who === "ai" && m.text) g.append(h("div", { class: "text", text: m.text }));
      g.append(h("div", { class: "text", text: !b ? "Pick a brand to start. Forms use its logo and its look." : built() ? `What should we change on ${cur.name}?` : `What do you want to build for ${b.name}?` }));
      if (b && !built() && ready) g.append(h("div", { class: "starts" }, ...(b.profile ? industryOf(b.profile.industry).forms : STARTS).map((s) => h("button", { text: s, onclick: () => send(s) }))));
      boxEl.append(g);
    }
    if (log.some((m) => m.who === "me")) log.forEach((m, i) => {
      const d = h("div", { class: `msg ${m.who}` });
      if (m.who === "ai") d.append(h("div", { class: "who", html: `${tiaSvg(18, !!m.live)}<span>Tia</span>` }));
      if (m.files?.length) d.append(h("div", { class: "chips" }, ...m.files.map((n) => h("span", { class: "fchip", html: SVG(P.clip, 12) }, h("span", { text: n })))));
      if (m.text) d.append(h("div", { class: "text", text: m.text }));
      if (m.status) d.append(h("div", { class: "status", text: m.status }));
      if (m.did) { const x = h("div", { class: "did", html: SVG(P.check, 13) }); x.append(h("span", { text: m.did })); d.append(x); }
      if (m.ask && i === log.length - 1 && !S.busy) d.append(h("div", { class: "ask" }, h("strong", { text: m.ask.question }), h("div", { class: "chips" }, ...m.ask.options.map((o) => h("button", { class: "pill", text: o, onclick: () => send(o) })))));
      if (m.err) d.append(h("div", { class: "err", text: m.err }));
      boxEl.append(d);
    });
    boxEl.scrollTop = boxEl.scrollHeight;
    const input = $("input");
    input.disabled = !b;
    input.placeholder = !b ? (loaded ? "Pick a brand to start" : "Loading brands") : !ready && b.lookErr ? "Try reading the brand again" : !ready ? `Reading ${b.name}'s look` : built() ? "Ask Tia to change anything" : "Describe the form";
    if (!S.busy) $("send").disabled = !ready;
  }
  function aboutUi() { $("about").hidden = !S.about; $("aboutText").textContent = S.about ? `About: ${S.about.label}` : ""; }
  $("aboutX").onclick = () => { S.about = null; aboutUi(); };

  function tagOf(t, n) { const o = t.lastIndexOf(`<${n}>`); if (o < 0) return null; const s = o + n.length + 2, c = t.indexOf(`</${n}>`, s); return { body: c < 0 ? t.slice(s) : t.slice(s, c), closed: c >= 0 }; }
  const patches = (t) => [...t.matchAll(/<patch id="([^"]+)">([\s\S]*?)<\/patch>/g)].map((m) => ({ id: m[1], html: m[2] }));
  let ctl = null, lastPaint = 0;
  async function send(text, extra) {
    text = String(text || "").trim();
    const c = cur, b = brandOf(c);
    const files = extra?.files ?? (extra?.from ? [] : takeFiles());
    if ((!text && !files.length) || S.busy || !b || !b.css || looking.has(b.id)) return;
    if (!text) text = files.length === 1 ? `Use ${files[0].name}` : "Use these files";
    $("input").value = ""; autosize();
    c.body.log.forEach((m) => (m.ask = undefined));
    c.body.log.push({ who: "me", text, ...(files.length ? { files: files.map((f) => f.name) } : {}) });
    const reply = { who: "ai", text: "", status: "Thinking", live: true };
    c.body.log.push(reply);
    const about = S.about; S.about = null; aboutUi();
    S.busy = true; busyUi(true); renderLog();
    const wasBuilt = built();
    snap();
    // The brand block is the same for every message in this chat, so the server caches it; each message carries only
    // the form as it is now (whitespace between tags dropped) and the new words.
    const brandBlock = `BRAND\n[Brand: ${b.name} (${b.site}), confirmed. Build only with its brand CSS.]${b.profile ? `\n${recipeText(b.profile)}` : ""}\n<brand_css>${b.css}</brand_css>\n[Meeting types (id: name)] ${MEETINGS.length ? MEETINGS.map((m) => `${m.id}: ${m.name}, ${m.length} min`).join("; ") : "none yet"}${b.logo ? "\n[The brand's logo is set; the form shows it in img[data-cl-logo].]" : "\n[No logo yet. Use img[data-cl-logo] anyway; it hides until one is added.]"}`;
    const ctx = `\n\n[${wasBuilt ? "THE FORM IS BUILT" : "NOTHING BUILT YET"}]${files.length ? `\n[Attached: ${files.map((f) => f.name).join(", ")}]` : ""}\n[The form now]\n<form_html>${sourceHtml().replace(/>\s+</g, "><")}</form_html>\n<form_css>${c.body.css}</form_css>\n<after>${JSON.stringify(c.body.after)}</after>${about ? `\n[This message is about the element with id="${about.id}" (${about.label}). Change only that element unless the owner asks for more.]` : ""}${extra?.from ? `\n[The brand just changed from ${extra.from} to ${b.name}. Put ${b.name} in place of ${extra.from} everywhere in the words, change any form CSS that used ${extra.from}'s own colors, fonts or variables to the brand CSS, and keep every question, name, value and id.]` : ""}`;
    const textFiles = files.filter((f) => f.text !== undefined);
    const turns = [...c.body.turns, { role: "user", content: text + textFiles.map((f) => `\n\n[File ${f.name}]\n${f.text}`).join("") + ctx }];
    ctl = new AbortController();
    try {
      const r = await api.tia(turns, (t) => {
        const say = tagOf(t, "say");
        reply.text = say ? say.body.trim() : "";
        const open = (n) => { const x = tagOf(t, n); return x && !x.closed; };
        reply.status = open("form_html") ? "Building the form" : open("form_css") ? "Styling it" : patches(t).length || open("patch") ? "Changing it" : say ? "" : "Thinking";
        // A first build paints as it streams; changes to a built form land whole.
        const now = performance.now();
        if (!wasBuilt && cur === c && now - lastPaint > 250) { lastPaint = now; const fh = tagOf(t, "form_html"), fc = tagOf(t, "form_css"); if (fc) c.body.css = fc.body; if (fh) { setSource(fh.body); stepAt = 0; done = false; } if (fh || fc) draw(); }
        if (cur === c) renderLog();
      }, ctl.signal, { brand: brandBlock, built: wasBuilt && !extra?.from, files: files.filter((f) => f.data).map(({ name, type, data }) => ({ name, type, data })) });
      finish(c, r.text, reply, wasBuilt);
      if (r.cut) reply.err = "The answer was cut short. Ask for a smaller change.";
      c.body.turns.push({ role: "user", content: files.length ? `${text} [attached ${files.map((f) => f.name).join(", ")}]` : text }, { role: "assistant", content: `<say>${reply.text}</say>${reply.ask ? `<ask>${JSON.stringify(reply.ask)}</ask>` : ""}${reply.did ? `<did>${reply.did}</did>` : ""}` });
      c.body.turns = c.body.turns.slice(-20);
    } catch (e) {
      if (e?.text) finish(c, e.text, reply, wasBuilt);
      reply.err = e?.name === "AbortError" ? "" : e?.message || "Tia didn't finish. Try again.";
    } finally {
      ctl = null;
      reply.live = false; reply.status = "";
      S.busy = false;
      if (alive) { busyUi(false); if (cur === c) renderLog(); }
      save(true);
    }
  }
  function finish(c, t, reply, wasBuilt) {
    const say = tagOf(t, "say"), ask = tagOf(t, "ask"), fh = tagOf(t, "form_html"), fc = tagOf(t, "form_css"), add = tagOf(t, "css_add"), did = tagOf(t, "did"), af = tagOf(t, "after");
    reply.text = say ? say.body.trim() : reply.text;
    const here = cur === c;
    const tree0 = here ? src : clean(c.body.html);
    let changedSomething = false;
    if (fc?.closed) { c.body.css = fc.body.trim(); changedSomething = true; }
    let next = tree0;
    if (fh?.closed) { next = clean(fh.body.trim()); changedSomething = true; }
    for (const p of patches(t)) {
      const tg = next.querySelector(`[id="${CSS.escape(p.id)}"]`);
      if (!tg) continue;
      const fresh = clean(p.html);
      tg.replaceWith(...fresh.childNodes);
      changedSomething = true;
    }
    if (add?.closed && add.body.trim()) { const css = c.body.css; const i = css.indexOf(EDIT); c.body.css = i >= 0 ? `${css.slice(0, i).trimEnd()}\n${add.body.trim()}\n${css.slice(i)}` : `${css.trimEnd()}\n${add.body.trim()}`; changedSomething = true; }
    if (af?.closed) { try { const a = JSON.parse(af.body); if (["thanks", "page", "meeting"].includes(a.kind)) { c.body.after = { kind: a.kind, url: String(a.url || ""), ...(a.tool && a.tool !== "claritia" && SCHEDULERS.some((x) => x.value === a.tool) ? { tool: a.tool, link: String(a.link || "") } : {}), meeting: MEETINGS.some((m) => m.id === a.meeting) ? a.meeting : c.body.after.meeting || MEETINGS[0]?.id || "", routes: Array.isArray(a.routes) ? a.routes.map(cleanRoute).filter((r) => r && MEETINGS.some((m) => m.id === r.meeting)) : [], ...(c.body.after.always ? { always: c.body.after.always } : {}) }; changedSomething = true; } } catch {} }
    // Built is built: a question only stands when nothing changed.
    if (ask?.closed && !(wasBuilt && changedSomething)) { try { const a = JSON.parse(ask.body); if (a.question) reply.ask = { question: String(a.question), options: (a.options || []).map(String).slice(0, 5) }; } catch {} }
    if (changedSomething) reply.did = (did?.closed && did.body.trim().slice(0, 60)) || (wasBuilt ? "Changed the form" : "Built the form");
    const html = (() => { const x = next.cloneNode(true); x.querySelectorAll("[data-k]").forEach((e) => e.removeAttribute("data-k")); return x.innerHTML.trim(); })();
    c.body.html = html;
    if (changedSomething) {
      if (!wasBuilt && c.name === "New form" && html) { const hd = next.querySelector("h1,h2,h3,legend"); c.name = (hd?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80) || c.name; }
      if (c.state === "live") c.state = "changed";
      if (c.state === "new" && html) c.state = "draft";
    }
    if (here) {
      if (fh?.closed) { stepAt = 0; done = false; }
      setSource(html);
      S.sel = null;
      draw(); refresh(); pubUi(); chatHead(); buttons();
    }
  }
  function busyUi(b) {
    $("send").disabled = false;
    $("send").innerHTML = b ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>` : SVG(P.send, 15);
    $("send").setAttribute("aria-label", b ? "Stop" : "Send");
    $("empty").classList.toggle("live", b);
    $("emptyText").textContent = b ? "Tia is building your form" : "Your form shows here as Tia builds it";
    pubUi();
  }
  $("send").onclick = () => (S.busy ? ctl?.abort() : send($("input").value));
  $("attachBtn").disabled = false;
  $("input").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send($("input").value); } });
  function autosize() { const t = $("input"); t.style.height = "auto"; t.style.height = `${Math.min(140, t.scrollHeight)}px`; }
  // Files for Tia: pictures (5 MB) and PDFs (10 MB) go as they are; text files (200 KB) go inside the words. Up to 5.
  let pending = [];
  const IMG = ["image/png", "image/jpeg", "image/webp", "image/gif"];
  function attachedUi() {
    const box = $("attached"); box.innerHTML = ""; box.hidden = !pending.length;
    pending.forEach((f, i) => box.append(h("span", { class: "fchip", html: SVG(P.clip, 12) }, h("span", { text: f.name }), h("button", { "aria-label": `Remove ${f.name}`, html: SVG(P.x, 10), onclick: () => { pending.splice(i, 1); attachedUi(); } }))));
    if (!S.busy && brandOf(cur)?.css) $("send").disabled = false;
  }
  async function addFiles(list) {
    for (const file of [...list]) {
      if (pending.length >= 5) { toast("Up to 5 files a message"); break; }
      const isText = /^text\//.test(file.type) || /\.(txt|csv|md|json)$/i.test(file.name);
      if (IMG.includes(file.type) && file.size > 5 * 1024 * 1024) { toast(`${file.name} is over 5 MB`); continue; }
      if (file.type === "application/pdf" && file.size > 10 * 1024 * 1024) { toast(`${file.name} is over 10 MB`); continue; }
      if (isText && file.size > 200 * 1024) { toast(`${file.name} is over 200 KB`); continue; }
      if (!IMG.includes(file.type) && file.type !== "application/pdf" && !isText) { toast(`${file.name} isn't a picture, PDF or text file`); continue; }
      if (isText) pending.push({ name: file.name, type: "text/plain", text: (await file.text()).slice(0, 200_000) });
      else { const buf = new Uint8Array(await file.arrayBuffer()); let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000)); pending.push({ name: file.name, type: file.type, data: btoa(bin) }); }
    }
    attachedUi();
  }
  function takeFiles() { const f = pending; pending = []; attachedUi(); return f; }
  $("attachBtn").onclick = () => $("fileIn").click();
  $("fileIn").addEventListener("change", () => { void addFiles($("fileIn").files || []); $("fileIn").value = ""; });
  $("input").addEventListener("paste", (e) => { const fs = [...(e.clipboardData?.files || [])]; if (fs.length) { e.preventDefault(); void addFiles(fs); } });
  const boxEl = $("input").parentElement;
  $("chat").addEventListener("dragover", (e) => { if ([...(e.dataTransfer?.types || [])].includes("Files")) { e.preventDefault(); boxEl.classList.add("drop"); } });
  $("chat").addEventListener("dragleave", (e) => { if (e.target === $("chat") || !$("chat").contains(e.relatedTarget)) boxEl.classList.remove("drop"); });
  $("chat").addEventListener("drop", (e) => { if (!e.dataTransfer?.files?.length) return; e.preventDefault(); boxEl.classList.remove("drop"); void addFiles(e.dataTransfer.files); });
  $("input").addEventListener("input", autosize);
  listen(window, "pagehide", () => save(true));

  // ── Start ─────────────────────────────────────────────────────────────────────────────────────────────
  setChatFold(false);
  setMode("preview");
  setDevice("desk");
  brandUi();
  (async () => {
    const [bs, ms, cs] = await Promise.all([api.brands().catch(() => []), api.meetings().catch(() => []), api.chats().catch(() => [])]);
    if (!alive) return;
    brands = bs.map((b) => ({ ...b, lookErr: "" }));
    MEETINGS = ms;
    chats = cs;
    loaded = true;
    let first = null;
    if (api.start.formId) {
      first = chats.find((c) => c.formId === api.start.formId) || null;
      if (!first) {
        first = await api.fromForm(api.start.formId).catch(() => null);
        if (first) {
          chats.unshift(first);
          const b = brands.find((x) => x.id === first.brandId);
          if (b && !b.css && first.brandCss) b.css = first.brandCss;
          delete first.brandCss;
          save(true);
        }
      }
    }
    if (!first && api.start.chatId) first = chats.find((c) => c.id === api.start.chatId) || null;
    if (!first && !api.start.fresh) first = chats[0] || null;
    if (!first) first = newChat(true);
    await open(first);
    emit();
    if (!brands.length) openDialog();
    else if (!brandOf(cur)) brandMenu();
  })();

  return {
    stop() {
      save(true);
      alive = false;
      ctl?.abort();
      clearTimeout(saveT); clearTimeout(toastT);
      for (const f of off) f();
    },
    publish: publishNow,
    fix(fixes) {
      if (!fixes.length || S.busy) return;
      setChatFold(false);
      send(fixes.length === 1 ? `Fix this: ${fixes[0]}` : `Fix these:\n${fixes.map((f) => `- ${f}`).join("\n")}`);
    },
    openAfter() { setMode("after"); },
    rename(name) {
      const n = String(name || "").trim().slice(0, 120);
      if (!cur || !n || n === cur.name) return;
      cur.name = n; chatHead(); save(); emit();
    },
  };
}
