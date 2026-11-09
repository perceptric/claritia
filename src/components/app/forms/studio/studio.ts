/* eslint-disable */
// @ts-nocheck
import { checkForm, DEFAULT_CONSENT, emptyForm } from "../../../../lib/forms/schema";
import { formToPage } from "../../../../lib/studio/fromForm";
import { checkStudioPage } from "../../../../lib/studio/check";
import { cleanPage } from "../../../../lib/studio/page";
import { pageNumbers } from "../../../../lib/studio/numbers";
import { styleCssById, styleName } from "../../../../lib/studio/styleCss";
import { THEMES } from "../../../../lib/forms/gallery/themes";
import { cleanRoute, OP_LABEL, PAST_ROUTES, ROUTE_OPS, routeKind, routeMeeting, routeStart } from "../../../../lib/studio/routes";
import { linkProblem, SCHEDULERS } from "../../../../lib/forms/schedule";
import { INDUSTRIES, industryOf, isRtl, languageName, profileWords, recipeText } from "../../../../lib/studio/industries";
import { ACCESS_CSS, around, CAL_CSS, consentSpot, limitMsg, linkErrors, pageBox, pipes, showCover, shuffle, zoneWords } from "../../../../lib/studio/runtime";
import { MEDIA_CSS, ONE_CSS, oneKeys, PICK_CSS, pickers, showMedia, splitOne } from "../../../../lib/studio/pageParts";
import { sizedUrl, widthsOf } from "../../../../lib/forms/media";
import { baseName, isLayout, PICK_KINDS, SAVES, QGROUPS, QNAME, questionHtml, readJumps, renameValueIn, stepShowIfs, TEXT_KINDS, uniqueName, uniqueValue, valueFollows, writeJumps } from "../../../../lib/studio/builder";
import { TIA_STYLE, tiaSvg } from "../../../../lib/studio/tia";
import { markSvg } from "../../../Logo";
import type { StudioTemplate } from "../../../../lib/forms/gallery/studioList";

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
:focus-visible { outline: 2px solid var(--signal); outline-offset: 2px; }
input:focus-visible, textarea:focus-visible, select:focus-visible { outline: none; }
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
.chat.prev { display: none; }
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
.bar { min-height: 52px; flex: none; display: flex; align-items: center; flex-wrap: wrap; gap: 6px; padding: 8px 12px; border-bottom: 1px solid var(--line); }
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
.mid { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
.steps { flex: 0 1 auto; min-width: 0; display: flex; align-items: center; flex-wrap: wrap; row-gap: 4px; padding: 2px; }
.steps .sp { min-height: 32px; padding: 4px 8px; border-radius: 8px; border: 0; background: transparent; color: var(--body); font-size: 13px; line-height: 1.3; text-align: start; display: inline-flex; align-items: center; gap: 8px; flex: 0 1 auto; min-width: 0; }
.steps .sp span:last-child { min-width: 0; overflow-wrap: anywhere; }
.steps .sp:hover { color: var(--ink); background: var(--hover); }
.steps .sp .n { width: 22px; height: 22px; border-radius: 999px; border: 1.5px solid var(--line-strong); display: inline-flex; align-items: center; justify-content: center; flex: none; font: 600 11px var(--sans); color: var(--body); background: var(--bg); }
.steps .sp[aria-pressed="true"] { color: var(--ink); font-weight: 500; }
.steps .sp[aria-pressed="true"] .n { background: var(--ink); border-color: var(--ink); color: var(--bg); }
.steps .sp.done .n { background: var(--signal-soft); border-color: var(--signal); color: var(--signal); }
.steps .conn { width: 18px; height: 1.5px; border-radius: 1px; background: var(--line-strong); flex: none; }
.steps .sp.all { width: 30px; padding: 0; justify-content: center; margin-left: 6px; color: var(--muted); }
.steps .sp.all[aria-pressed="true"] { background: var(--paper-deep); color: var(--ink); }
.themes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.themes .th { border: 0; background: transparent; padding: 0; display: flex; flex-direction: column; gap: 4px; text-align: left; min-width: 0; }
.themes .sw2 { height: 40px; border-radius: 8px; box-shadow: 0 0 0 1px var(--line); display: flex; align-items: center; justify-content: center; overflow: hidden; }
.themes .sw2 i { width: 62%; height: 58%; border-radius: 4px; display: flex; align-items: flex-end; padding: 3px; }
.themes .sw2 u { width: 40%; height: 5px; border-radius: 3px; }
.themes .sw2.brand { background: var(--paper); }
.themes .sw2.brand img { max-width: 80%; max-height: 26px; object-fit: contain; }
.themes .sw2.brand b { font-size: 14px; color: var(--ink); }
.themes .th[aria-pressed="true"] .sw2 { box-shadow: 0 0 0 2px var(--ink); }
.themes .nm { font-size: 11.5px; color: var(--body); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.navi { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.navi .ptitle { display: none; }
.adds { flex: 1; min-height: 0; display: flex; flex-direction: column; padding-top: 10px; }
.adds .ptitle { display: none; }
.adds .in { margin: 0 10px 8px; width: auto; flex: none; height: 30px; }
.aibody { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.sidemode { flex: none; padding: 10px 10px 8px; border-bottom: 1px solid var(--line); display: flex; flex-direction: column; gap: 8px; }
.mseg { display: flex; gap: 2px; padding: 3px; border-radius: 999px; background: var(--paper-deep); }
.mseg button { flex: 1; height: 28px; border: 0; border-radius: 999px; background: transparent; color: var(--muted); font-size: 12.5px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
.mseg button[aria-selected="true"] { background: var(--bg); color: var(--ink); font-weight: 500; box-shadow: 0 0 0 1px var(--line), 0 1px 2px rgb(10 10 10 / .06); }
.mseg .tia { width: 16px; height: 16px; }
.mdot { width: 6px; height: 6px; border-radius: 999px; background: var(--signal); }
.subt { display: flex; gap: 2px; }
.subt button { height: 26px; padding: 0 10px; border: 0; border-radius: 7px; background: transparent; color: var(--muted); font-size: 12.5px; }
.subt button[aria-selected="true"] { background: var(--paper); color: var(--ink); font-weight: 500; box-shadow: 0 0 0 1px var(--line); }
.addlist.grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; align-content: start; }
.addlist.grid .ag { grid-column: 1 / -1; padding: 8px 2px 0; }
.addlist.grid button { height: auto; flex-direction: column; justify-content: center; gap: 5px; padding: 9px 4px 7px; border-radius: 10px; background: var(--bg); box-shadow: 0 0 0 1px var(--line); text-align: center; font-size: 11.5px; line-height: 1.25; min-width: 0; }
.addlist.grid button:hover { box-shadow: 0 0 0 1px var(--line-strong), 0 2px 6px rgb(0 0 0 / .06); background: var(--bg); }
.addlist.grid button i { width: 26px; height: 26px; border-radius: 7px; box-shadow: none; }
.addlist.grid button .nm { overflow-wrap: anywhere; }
.stepdock { flex: none; display: flex; align-items: center; flex-wrap: wrap; gap: 4px; min-height: 48px; padding: 6px 12px; border-top: 1px solid var(--line); background: var(--bg); }
.ptools { display: flex; align-items: center; flex-wrap: wrap; gap: 2px; min-width: 0; }
.ptools .pill { margin-inline-end: 6px; }
.ptools .vsep { margin: 0 4px; }
.tipup[data-tip]::after { top: auto; bottom: calc(100% + 6px); transform: translateX(-50%) translateY(2px); }
.tipup.tipleft[data-tip]::after { transform: translateY(2px); }
.tipup[data-tip]:hover::after, .tipup[data-tip]:focus-visible::after { transform: translateX(-50%); }
.tipup.tipleft[data-tip]:hover::after, .tipup.tipleft[data-tip]:focus-visible::after { transform: none; }
.steps .sp.after .n { border-style: dashed; }
.exitprev { display: inline-flex; align-items: center; gap: 6px; }
.peekbar { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; }
.peeknm { font-weight: 600; color: var(--ink); min-width: 0; overflow-wrap: anywhere; }
.peekbar .primary { margin-inline-start: auto; }
.peekbar:not([hidden]) + .spacer { display: none; }
.addlist { flex: 1; min-height: 0; overflow-y: auto; padding: 0 6px 12px; display: flex; flex-direction: column; gap: 1px; }
.addlist .ag { font-size: 11px; color: var(--faint); padding: 8px 6px 3px; }
.addlist button { flex: none; height: 32px; border: 0; background: transparent; border-radius: 7px; display: flex; align-items: center; gap: 9px; padding: 0 6px; text-align: left; font-size: 12.5px; color: var(--ink); cursor: grab; }
.addlist button:hover { background: var(--hover); }
.addlist button i { width: 22px; height: 22px; border-radius: 6px; background: var(--paper); box-shadow: 0 0 0 1px var(--line); display: inline-flex; align-items: center; justify-content: center; color: var(--muted); flex: none; }
.dropl { position: absolute; height: 3px; border-radius: 2px; background: var(--pick); pointer-events: none; z-index: 4; }
.mh { font-size: 11px; color: var(--faint); padding: 6px 10px 2px; }
.jrow { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); }
.swatches { display: flex; flex-wrap: wrap; gap: 6px; }
.swatches button { width: 24px; height: 24px; border-radius: 999px; border: 0; box-shadow: 0 0 0 1px rgb(0 0 0 / .12); }
.swatches button[aria-pressed="true"] { box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--ink); }
.hchips { display: flex; flex-wrap: wrap; gap: 6px; }
.phthumb { display: block; width: 100%; aspect-ratio: 16 / 9; object-fit: cover; border-radius: 8px; background: var(--paper-deep); }
.phacts { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.phgrid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
.phgrid button { aspect-ratio: 1; padding: 0; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; background: var(--paper-deep); color: var(--muted); display: flex; align-items: center; justify-content: center; }
.phgrid button[aria-pressed="true"] { border-color: var(--signal); box-shadow: 0 0 0 2px var(--signal-soft); }
.phgrid img { width: 100%; height: 100%; object-fit: cover; display: block; }
.focus3 { display: grid; grid-template-columns: repeat(3, 22px); gap: 4px; }
.focus3 button { width: 22px; height: 22px; padding: 0; border-radius: 4px; border: 1px solid var(--line-strong); background: var(--bg); }
.focus3 button[aria-pressed="true"] { background: var(--ink); border-color: var(--ink); }
.hchip { height: 24px; display: inline-flex; align-items: center; gap: 2px; padding: 0 2px 0 9px; border-radius: 999px; background: var(--paper-deep); font: 11.5px var(--mono); }
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
.empty.gal { justify-content: flex-start; align-items: stretch; text-align: start; padding: 28px clamp(16px, 4vw, 36px) 36px; color: var(--body); }
.wait { display: flex; flex-direction: column; align-items: center; gap: 14px; }
.tpls { display: flex; flex-direction: column; gap: 14px; width: 100%; max-width: 1040px; margin: 0 auto; }
.tplhead { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px 16px; }
.tplhead h2 { margin: 0; font: 600 18px/1.3 var(--sans); color: var(--ink); min-width: 0; }
.tplact { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-width: 0; flex: 0 1 auto; }
.tplq { display: flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--line); background: var(--bg); color: var(--faint); width: 240px; flex: 0 1 240px; min-width: 160px; box-sizing: border-box; }
.tplq:focus-within { border-color: var(--signal); box-shadow: 0 0 0 3px var(--signal-soft); }
.tplq input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--ink); font: 13px var(--sans); }
.tplfam { display: flex; flex-wrap: wrap; gap: 6px; }
.tplfam button { height: 28px; padding: 0 11px; border-radius: 999px; border: 1px solid var(--line); background: var(--bg); color: var(--body); font-size: 12.5px; display: inline-flex; align-items: center; gap: 6px; }
.tplfam button:hover { border-color: var(--line-strong); color: var(--ink); }
.tplfam button[aria-pressed="true"] { background: var(--ink); border-color: var(--ink); color: var(--bg); }
.tplfam button span { color: inherit; opacity: .6; font-variant-numeric: tabular-nums; }
.tplgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(190px, 100%), 1fr)); gap: 12px; }
.tpl { display: flex; flex-direction: column; min-width: 0; padding: 0; border-radius: 10px; border: 1px solid var(--line); background: var(--bg); text-align: start; overflow: hidden; transition: border-color .12s var(--ease), box-shadow .12s var(--ease), transform .12s var(--ease); }
.tpl:hover:not(:disabled) { border-color: var(--line-strong); box-shadow: 0 8px 20px -12px rgb(0 0 0 / .25); transform: translateY(-1px); }
.tpl:disabled { opacity: .55; }
.tpl.making { opacity: 1; border-color: var(--signal); }
.tpl .t-form { display: flex; flex-direction: column; gap: 10px; padding: 16px 16px 14px; border-bottom: 1px solid var(--line); background: var(--f-card); color: var(--f-text); text-align: start; }
.tpl .t-h { font-size: 14px; line-height: 1.25; letter-spacing: -.01em; color: var(--f-text); overflow-wrap: anywhere; }
.tpl .t-q { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.tpl .t-l { font-size: 11px; line-height: 1.35; font-weight: 500; color: var(--f-text); overflow-wrap: anywhere; }
.tpl .t-in { display: flex; align-items: center; justify-content: space-between; gap: 6px; min-height: 22px; padding: 0 8px; border: 1px solid var(--f-line); background: var(--f-field); font-size: 10.5px; color: var(--f-muted); box-sizing: border-box; }
.tpl .t-in.tall { min-height: 40px; }
.tpl .t-ops { display: flex; flex-direction: column; gap: 4px; }
.tpl .t-op { display: flex; align-items: center; gap: 6px; min-height: 22px; padding: 3px 8px; border: 1px solid var(--f-line); background: var(--f-field); font-size: 10.5px; line-height: 1.3; color: var(--f-text); overflow-wrap: anywhere; box-sizing: border-box; }
.tpl .t-op i { flex: none; width: 8px; height: 8px; border: 1px solid var(--f-muted); border-radius: 50%; }
.tpl .t-op i.sq { border-radius: 2px; }
.tpl .t-sc { display: flex; flex-wrap: wrap; gap: 3px; }
.tpl .t-sc span { min-width: 16px; height: 18px; padding: 0 3px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--f-line); background: var(--f-field); font-size: 9.5px; color: var(--f-text); box-sizing: border-box; }
.tpl .t-stars { font-size: 13px; letter-spacing: 2px; color: var(--f-line); }
.tpl .t-chk { display: flex; align-items: flex-start; gap: 6px; }
.tpl .t-chk i { flex: none; width: 10px; height: 10px; margin-top: 1px; border: 1px solid var(--f-muted); border-radius: 2px; }
.tpl .t-cov { display: grid; grid-template-columns: 40% minmax(0, 1fr); border-bottom: 1px solid var(--line); background: var(--f-card); color: var(--f-text); min-height: 150px; }
.tpl .t-cov.right { grid-template-columns: minmax(0, 1fr) 40%; }
.tpl .t-cov.right img { order: 2; }
.tpl .t-cov img { width: 100%; height: 100%; object-fit: cover; display: block; }
.tpl .t-cov .t-form { border-bottom: 0; justify-content: center; }
.tpl .t-btn { align-self: flex-start; max-width: 100%; padding: 5px 12px; font-size: 10.5px; font-weight: 600; line-height: 1.3; overflow-wrap: anywhere; }
.tpl .t-tx { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px 12px; min-width: 0; }
.tpl .t-nm { font: 500 13px/1.35 var(--sans); color: var(--ink); overflow-wrap: anywhere; }
.tpl .t-bl { font-size: 12px; line-height: 1.45; color: var(--muted); overflow-wrap: anywhere; }
.tpl .t-mt { font-size: 11.5px; color: var(--faint); }
.tplfoot { display: flex; justify-content: center; }
.tplnone { grid-column: 1 / -1; padding: 40px 0; text-align: center; color: var(--muted); }
@media (prefers-reduced-motion: reduce) { .tpl { transition: none; } .tpl:hover:not(:disabled) { transform: none; } }
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
.pill .logo.mark { border-radius: 0; }
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
.ptabs .who2 { display: none; }
.pscroll { flex: 1; min-height: 0; overflow-y: auto; }
.sec { padding: 12px 14px; border-bottom: 1px solid var(--line); display: flex; flex-direction: column; gap: 10px; }
.sec h4 { margin: 0; font-size: 11px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--muted); }
.sel-head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.cls { height: 24px; padding: 0 9px; border-radius: 999px; background: var(--pick); color: #fff; font: 500 11.5px/24px var(--mono); }
.cls.off { background: var(--paper-deep); color: var(--muted); }
.icons { display: flex; gap: 2px; padding: 2px; background: var(--paper-deep); border-radius: 8px; }
.icons .ib { width: auto; flex: 1; height: 26px; border-radius: 6px; }
.icons .ib[aria-pressed="true"] { background: var(--bg); color: var(--ink); box-shadow: 0 0 0 1px var(--line); }
.g2 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 6px; }
.g3 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr); gap: 6px; }
.num { position: relative; display: flex; align-items: center; height: 28px; border-radius: 6px; background: var(--paper-deep); }
.num .k { min-width: 22px; padding: 0 5px; flex: none; text-align: center; color: var(--faint); font-size: 11px; font-weight: 600; cursor: ew-resize; }
.num input { flex: 1; width: 100%; min-width: 0; height: 100%; border: 0; background: transparent; color: var(--ink); font: 12px var(--sans); padding-right: 6px; }
.num input::placeholder { color: var(--faint); }
.num:focus-within { box-shadow: 0 0 0 1px var(--signal), 0 0 0 3px var(--signal-soft); }
.num .k { user-select: none; -webkit-user-select: none; touch-action: none; }
.bx:focus { outline: none; box-shadow: 0 0 0 1px var(--signal); background: var(--bg); }
.fold { display: flex; align-items: center; justify-content: space-between; gap: 8px; border: 0; background: none; padding: 0; color: var(--muted); }
.fold h4 { pointer-events: none; }
.fold .ib { width: 22px; height: 22px; }
.row3 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 6px; align-items: center; }
.lbl2 { font-size: 12px; color: var(--body); }
.slide { display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: 8px; align-items: center; }
.slide input[type=range] { width: 100%; accent-color: var(--ink); }
.cross { display: grid; grid-template-columns: 1fr 1fr 1fr; grid-template-rows: auto auto auto; gap: 6px; align-items: center; }
.cross .c { height: 26px; border-radius: 6px; border: 1px dashed var(--line-strong); }
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
.in:focus { outline: 0; box-shadow: 0 0 0 1px var(--signal), 0 0 0 3px var(--signal-soft); }
.dd { height: 28px; width: 100%; min-width: 0; border: 0; border-radius: 6px; background: var(--paper-deep); color: var(--ink); display: flex; align-items: center; justify-content: space-between; gap: 4px; padding: 0 8px; font-size: 12px; text-align: left; }
.dd span:first-child { min-width: 0; overflow-wrap: anywhere; text-align: start; }
.dd { height: auto; min-height: 28px; padding-block: 4px; }
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

/* The look menu under the brand button: your own brand from its website, the workspace's brands, then every style */
.menu.lookmenu { max-height: min(640px, calc(100vh - 80px)); padding: 6px; }
.lookmenu .mh { display: flex; align-items: center; gap: 8px; padding: 8px 8px 6px; font-size: 12px; font-weight: 500; color: var(--muted); }
.ownsite { display: flex; flex-direction: column; padding: 2px 4px 6px; }
.ownsite .mh { color: var(--ink); font-size: 13px; padding: 6px 4px 8px; }
.ownsite .siteform .in { flex: 1; min-width: 0; height: 34px; }
.ownsite .siteform .pill { height: 34px; }
.lookmenu .themes { padding: 2px 6px 6px; }
.lookmenu .themes .nm { white-space: normal; overflow: visible; }

/* Learning a website's look: a sketch of the site that Tia's corners move over, then paint in the brand's colors */
.dlgbox.learnbox { width: min(560px, 100%); padding: 0; gap: 0; }
.learn { display: flex; flex-direction: column; }
.lsite { position: relative; margin: 16px 16px 0; border-radius: 12px; overflow: hidden; background: var(--paper); box-shadow: 0 0 0 1px var(--line); font-family: var(--sans); }
.lsite .lbar { display: flex; align-items: center; gap: 8px; height: 32px; padding: 0 12px; background: var(--bg); box-shadow: 0 1px 0 var(--line); font-size: 12px; color: var(--muted); }
.lsite .lbar .fav { width: 14px; height: 14px; border-radius: 4px; background: var(--line-strong); flex: none; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.lsite .lbar .fav img { max-width: 100%; max-height: 100%; object-fit: contain; }
.lsite .lbar .host { min-width: 0; overflow-wrap: anywhere; }
.lpage { position: relative; display: flex; flex-direction: column; gap: 18px; padding: 16px 20px 22px; background: var(--paper); color: var(--ink); transition: background-color .38s var(--ease), color .38s var(--ease); }
.lnav { display: flex; align-items: center; gap: 14px; min-height: 26px; }
.llogo { height: 24px; min-width: 64px; max-width: 140px; display: flex; align-items: center; }
.llogo img { max-height: 24px; max-width: 140px; object-fit: contain; }
.llogo .ph { width: 64px; height: 12px; border-radius: 3px; background: var(--line-strong); }
.lnav .links { display: flex; gap: 10px; flex: 1; justify-content: flex-end; }
.lnav .links i, .lhero .ln i { display: block; height: 6px; border-radius: 3px; background: var(--line-strong); transition: background-color .38s var(--ease), opacity .38s var(--ease); }
.lnav .links i { width: 34px; }
.lbody { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 20px; align-items: center; }
.lhero { display: flex; flex-direction: column; gap: 10px; }
.lh1 { margin: 0; font-size: 22px; line-height: 1.12; font-weight: 650; letter-spacing: -.02em; color: var(--ink); overflow-wrap: anywhere; transition: color .38s var(--ease); }
.lhero .ln { display: flex; flex-direction: column; gap: 6px; }
.lbtn { align-self: flex-start; height: 28px; padding: 0 14px; border-radius: 6px; background: var(--line-strong); color: transparent; display: inline-flex; align-items: center; font-size: 12px; font-weight: 600; transition: background-color .38s var(--ease), color .38s var(--ease), border-radius .38s var(--ease); }
.lform { display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: 10px; background: var(--bg); box-shadow: 0 0 0 1px var(--line); transition: background-color .38s var(--ease), box-shadow .38s var(--ease), border-radius .38s var(--ease); }
.lform .fl { height: 26px; border-radius: 6px; background: var(--paper); box-shadow: inset 0 0 0 1px var(--line); transition: background-color .38s var(--ease), box-shadow .38s var(--ease), border-radius .38s var(--ease); }
.lform .lbtn { align-self: stretch; justify-content: center; }
.lcatch { position: absolute; left: 0; top: 0; width: 40px; height: 40px; pointer-events: none; transition: transform .38s var(--ease), width .38s var(--ease), height .38s var(--ease), opacity .28s var(--ease); }
.lcatch i { position: absolute; width: 12px; height: 12px; border: 0 solid var(--signal); }
.lcatch i:nth-child(1) { left: 0; top: 0; border-left-width: 2px; border-top-width: 2px; }
.lcatch i:nth-child(2) { right: 0; top: 0; border-right-width: 2px; border-top-width: 2px; }
.lcatch i:nth-child(3) { left: 0; bottom: 0; border-left-width: 2px; border-bottom-width: 2px; }
.lcatch i:nth-child(4) { right: 0; bottom: 0; border-right-width: 2px; border-bottom-width: 2px; }
.lscan { position: absolute; left: 0; right: 0; top: 0; height: 2px; background: var(--signal); opacity: .5; pointer-events: none; animation: lscan 2.4s var(--ease) infinite alternate; }
@keyframes lscan { from { transform: translateY(32px); } to { transform: translateY(var(--lscan-to, 220px)); } }
.learn.done .lscan, .learn.done .lcatch { opacity: 0; }
/* Painted: the sketch in the brand's own colors, fonts and corners */
.learn.painted .lpage { background: var(--brand-bg, var(--paper)); color: var(--brand-text, var(--ink)); font-family: var(--brand-font, var(--sans)); }
.learn.painted .lh1 { color: var(--brand-text, var(--ink)); font-family: var(--brand-head, var(--brand-font, var(--sans))); }
.learn.painted .lnav .links i, .learn.painted .lhero .ln i { background: var(--brand-muted, var(--brand-text, var(--line-strong))); opacity: .35; }
.learn.painted .lbtn { background: var(--brand-primary, var(--ink)); color: var(--brand-on-primary, var(--bg)); border-radius: var(--brand-btn-radius, 6px); }
.learn.painted .lform { background: var(--brand-surface, var(--brand-bg, var(--bg))); box-shadow: 0 0 0 1px var(--brand-line, var(--line)); border-radius: var(--brand-card-radius, 10px); }
.learn.painted .lform .fl { background: var(--brand-field, var(--brand-bg, var(--paper))); box-shadow: inset 0 0 0 var(--brand-bw, 1px) var(--brand-line, var(--line)); border-radius: var(--brand-radius, 6px); }
.llower { display: flex; flex-direction: column; gap: 14px; padding: 18px 20px 20px; }
.llower h2 { margin: 0; font-size: 17px; font-weight: 600; overflow-wrap: anywhere; }
.lsteps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.lsteps li { display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--faint); transition: color .15s var(--ease); }
.lsteps li .dot { width: 18px; height: 18px; flex: none; display: flex; align-items: center; justify-content: center; }
.lsteps li .dot::before { content: ""; width: 6px; height: 6px; border-radius: 999px; background: var(--line-strong); }
.lsteps li.now { color: var(--ink); }
.lsteps li.now .dot::before { display: none; }
.lsteps li.ok { color: var(--body); }
.lsteps li.ok .dot { color: var(--signal); }
.lsteps li.ok .dot::before { display: none; }
.lsteps li { animation: lrise .28s var(--ease) both; }
@keyframes lrise { from { opacity: 0; transform: translateY(6px); } }
.lfound { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.lfound .chip { display: inline-flex; align-items: center; gap: 8px; min-height: 30px; padding: 4px 12px 4px 5px; border-radius: 999px; box-shadow: 0 0 0 1px var(--line); font-size: 12.5px; color: var(--body); }
.lfound .chip b { width: 20px; height: 20px; border-radius: 999px; box-shadow: inset 0 0 0 1px rgb(0 0 0 / .08); flex: none; }
.lfound .chip .aa { font-size: 15px; color: var(--ink); line-height: 1; }
.llower .confirm { padding: 12px 14px; }
@media (max-width: 520px) { .lbody { grid-template-columns: minmax(0, 1fr); } .lform { display: none; } }
@media (prefers-reduced-motion: reduce) { .lcatch, .lpage, .lh1, .lbtn, .lform, .lform .fl, .lnav .links i, .lhero .ln i, .lsteps li { transition: none; animation: none; } .lscan { animation: none; display: none; } }

@media (max-width: 900px) {
  .app { flex-direction: column; height: auto; }
  .chat, .chat.folded { width: auto; border-right: 0; border-bottom: 1px solid var(--line); }
  .chat.folded .chathead { justify-content: flex-start; padding: 0 12px; }
  .msgs { max-height: 40vh; }
  .bar { flex-wrap: wrap; height: auto; padding: 8px 12px; row-gap: 8px; }
  .work { flex-direction: column; }
  .navi { width: auto; border-right: 0; border-bottom: 1px solid var(--line); max-height: 220px; }
  .adds { width: auto; border-right: 0; border-bottom: 1px solid var(--line); max-height: 220px; }
  .canvas { min-height: 70vh; padding: 12px; }
  .panel { width: auto; border-left: 0; border-top: 1px solid var(--line); }
}
@media (prefers-reduced-motion: reduce) { .chat, .frame { transition: none; } .live .sk span { animation: none; } }
`;

const SVG = (d, w = 16) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const P = {
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  brush: '<path d="M9.06 11.9 17.6 3.4a2 2 0 0 1 2.9 2.9l-8.5 8.5"/><path d="M7 14a3 3 0 0 0-3 3c0 1.5-1 2-2 2 1 1.5 3 2 4 2a4 4 0 0 0 4-4 3 3 0 0 0-3-3z"/>',
  swap: '<path d="M7 4 3 8l4 4"/><path d="M3 8h13a4 4 0 0 1 4 4"/><path d="m17 20 4-4-4-4"/><path d="M21 16H8a4 4 0 0 1-4-4"/>',
  short: '<path d="M4 9h16M4 15h10"/>', long: '<path d="M4 6h16M4 10h16M4 14h16M4 18h10"/>', email: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  qphone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>', address: '<path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  choice: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>', checks: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 12 3 3 5-6"/>', dropdown: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="m14 11 2 2 2-2"/>',
  yesno: '<path d="M20 6 9 17l-5-5"/>', ranking: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>', rating: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  scale: '<path d="M4 18V12M9 18V8M14 18v-6M19 18V5"/>', number: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>', payment: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18M7 15h3"/>',
  date: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>', time: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', file: '<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>',
  signature: '<path d="M3 17c3-1 4-9 7-9s-1 9 2 9 3-4 5-4 2 3 4 3"/>', heading: '<path d="M6 4v16M18 4v16M6 12h12"/>', qtext: '<path d="M5 6h14M12 6v13"/>', divider: '<path d="M4 12h16"/>',
  back: '<path d="m15 18-6-6 6-6"/>', link: '<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>', eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', cursor: '<path d="m4 4 7 17 2.5-7.5L21 11z"/>',
  code: '<path d="m8 7-5 5 5 5M16 7l5 5-5 5"/>', cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M9 15l2 2 4-4"/>', layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  desk: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>', tab: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M11 18h2"/>', phone: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>', redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>', restart: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  open: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>', panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  send: '<path d="M12 19V5M5 12l7-7 7 7"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>', chev: '<path d="m6 9 6 6 6-6"/>', plus: '<path d="M12 5v14M5 12h14"/>', search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  toggle: '<rect x="3" y="7" width="18" height="10" rx="5"/><circle cx="16" cy="12" r="3"/>', face: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5c.9 1.2 2.1 1.8 3.5 1.8s2.6-.6 3.5-1.8M9 10h.01M15 10h.01"/>', thumb: '<path d="M7 11v9H4v-9zM7 11l4-7c1.4 0 2.2 1 2 2.4L12.5 10H18a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 16.8 20H7"/>', pie: '<path d="M12 3v9h9a9 9 0 1 1-9-9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>', cart: '<path d="M3 4h2l2.4 11h10.2L20 8H7"/><circle cx="9" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/>', camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>', crop: '<path d="M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14"/>', mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>', pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>', mapi: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/>', calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/>', progress: '<rect x="3" y="10" width="18" height="4" rx="2"/><path d="M3 12h10"/>', play: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3z"/>', quizi: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14M12 17h.01"/>', review: '<path d="M9 5h10M9 12h10M9 19h10M4 5l1 1 2-2M4 12l1 1 2-2M4 19l1 1 2-2"/>', section: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/>',
  qname: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>', company: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M10 21v-4h4v4"/>', jobtitle: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>', website: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>', country: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>', birthday: '<path d="M4 21h16M5 21v-8h14v8M12 13V9M12 6v.01"/><path d="M5 17c2 0 2-1.5 3.5-1.5S10 17 12 17s2-1.5 3.5-1.5S17 17 19 17"/>', matrix: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/>', likert: '<path d="M4 12h16"/><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>', agree: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 12 3 3 5-6"/>', nps: '<path d="M3 17h2v3H3zM8 14h2v6H8zM13 11h2v9h-2zM18 7h2v13h-2z"/>', slider: '<path d="M4 12h16"/><circle cx="14" cy="12" r="3"/>', currency: '<path d="M12 3v18M16 7H10a3 3 0 0 0 0 6h4a3 3 0 0 1 0 6H8"/>', percent: '<path d="M19 5 5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>', datetime: '<rect x="3" y="5" width="12" height="12" rx="2"/><path d="M3 9h12M7 3v4M11 3v4"/><circle cx="17" cy="17" r="4"/><path d="M17 15.5V17l1 1"/>', month: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M7 14h10"/>', daterange: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M7 15h10M7 15l2-2M17 15l-2 2"/>', image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-9 8"/>', color: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h9"/>', hidden: '<path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.4 5.2A9.8 9.8 0 0 1 12 5c5 0 9 5 9 7 0 .9-.6 2.1-1.7 3.4M6.3 6.3C4.2 7.7 3 9.8 3 12c0 2 4 7 9 7 1.5 0 2.9-.4 4.1-1"/>', del: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
  up: '<path d="m18 15-6-6-6 6"/>', down: '<path d="m6 9 6 6 6-6"/>', dup: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>', parent: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v5"/>',
  style: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.4A4.6 4.6 0 0 0 21 9.8C21 6 17 3 12 3z"/>', set: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  block: '<rect x="4" y="5" width="16" height="14" rx="2"/>', row: '<rect x="3" y="7" width="7" height="10" rx="1.5"/><rect x="14" y="7" width="7" height="10" rx="1.5"/>', col: '<rect x="6" y="3" width="12" height="7" rx="1.5"/><rect x="6" y="14" width="12" height="7" rx="1.5"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>', none: '<circle cx="12" cy="12" r="8"/><path d="m6.5 17.5 11-11"/>',
  al: '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>', ac: '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>', ar: '<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>',
  js: '<path d="M4 4v16"/><rect x="8" y="7" width="6" height="10" rx="1"/>', jc: '<path d="M12 4v16"/><rect x="7" y="7" width="10" height="10" rx="1"/>', je: '<path d="M20 4v16"/><rect x="10" y="7" width="6" height="10" rx="1"/>', jb: '<path d="M4 4v16M20 4v16"/><rect x="8" y="7" width="3" height="10" rx="1"/><rect x="13" y="7" width="3" height="10" rx="1"/>',
  case0: '<path d="M4 18 8 6l4 12M5.5 14h5M15 18v-6a2.5 2.5 0 0 1 5 0v6M15 15h5"/>', caseU: '<path d="M3 18 7 6l4 12M4.5 14h5M14 18 17 6l4 12M15 14h5"/>', caseL: '<path d="M8 18v-5a2.5 2.5 0 0 1 5 0v5M8 15h5M16 9v9"/>',
  check: '<path d="m5 12 5 5 9-10"/>', more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>', stop: "", clip: '<path d="m21 11-8.6 8.6a5 5 0 0 1-7-7l8.6-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9"/>', globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
};

export const STUDIO_HTML = `
<div class="app" id="app">
  <section class="chat" id="chat" aria-label="Chat with Tia">
    <div class="chathead">
      <button class="chatpick" id="chatPick" aria-haspopup="menu" aria-expanded="false" aria-label="Chats"></button>
      <button class="ib foldbtn tipleft" id="chatFold"></button>
    </div>
    <div class="brandrow"><button class="brandbtn" id="brandBtn" aria-haspopup="menu" aria-label="Brand"></button><button class="profile" id="profileBtn" aria-haspopup="menu" aria-label="Industry, country and language" hidden></button><div class="bstatus" id="brandStatus" hidden></div></div>
    <div class="sidemode"><div class="mseg" role="tablist" aria-label="Editor"><button role="tab" id="m-build" aria-selected="true">${SVG(P.cursor, 14)}Build</button><button role="tab" id="m-ai" aria-selected="false">${tiaSvg(16)}AI<span class="mdot" id="aiDot" hidden></span></button></div><div class="subt" id="subt" role="tablist" aria-label="Build"><button role="tab" id="s-add" aria-selected="true">Add fields</button><button role="tab" id="s-layers" aria-selected="false">Layers</button></div></div>
    <aside class="adds" id="adds" aria-label="Add fields" hidden><div class="ptitle">Add</div><input class="in" id="addQ" placeholder="Search fields" aria-label="Search fields" autocomplete="off"><div class="addlist grid" id="addList"></div></aside>
    <aside class="navi" id="navi" aria-label="Layers" hidden><div class="ptitle">Layers</div><div class="tree" id="tree"></div></aside>
    <div class="aibody" id="aiBody">
    <div class="msgs" id="msgs" aria-live="polite"></div>
    <div class="compose">
      <div class="about" id="about" hidden><span id="aboutText"></span><button id="aboutX" aria-label="Not about this element">${SVG(P.x, 12)}</button></div>
      <div class="chips" id="attached" hidden></div>
      <div class="box"><button class="ib attach" id="attachBtn" data-tip="Attach a picture, PDF or text file" aria-label="Attach a file">${SVG(P.clip, 16)}</button><input type="file" id="fileIn" multiple accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,.txt,.csv,.md,.json,text/plain,text/csv,text/markdown" hidden><textarea id="input" rows="1" aria-label="Message"></textarea><button class="send" id="send" aria-label="Send">${SVG(P.send, 15)}</button></div>
    </div>
    </div>
  </section>
  <section class="stage" aria-label="Form">
    <div class="bar">
      <button class="pill exitprev" id="exitPrev" hidden>${SVG(P.back, 14)}Back to editor</button>
      <div class="peekbar" id="peekBar" hidden><button class="pill" id="peekBack">${SVG(P.back, 14)}All templates</button><span class="peeknm" id="peekName"></span><button class="pill primary" id="peekUse">Use this template</button></div>
      <div class="steps" id="stepBar" role="toolbar" aria-label="Pages" hidden></div>
      <span class="spacer"></span>
      <div class="grp" role="group" aria-label="Device">
        <button class="ib" id="d-desk" data-tip="Desktop" aria-label="Desktop" aria-pressed="true">${SVG(P.desk)}</button>
        <button class="ib" id="d-tab" data-tip="Tablet" aria-label="Tablet" aria-pressed="false">${SVG(P.tab)}</button>
        <button class="ib" id="d-phone" data-tip="Phone" aria-label="Phone" aria-pressed="false">${SVG(P.phone)}</button>
      </div>
      <button class="langbtn" id="langBtn" data-tip="Languages" aria-label="Languages" aria-haspopup="menu"></button>
      <span class="vsep"></span>
      <button class="ib tipleft" id="moreBtn" data-tip="More" aria-label="More" aria-haspopup="menu">${SVG(P.more)}</button>
    </div>
    <div class="work" id="work">
      <div class="mid" id="mid">
      <div class="canvas" id="canvas">
        <div class="frame" id="frame">
          <div id="host"></div>
          <div class="empty" id="empty" hidden><div class="wait" id="tplWait"><div class="sk" aria-hidden="true"><span style="width:55%;height:16px"></span><span style="width:80%"></span><span class="b2"></span><span style="width:30%"></span><span class="b2"></span><span class="bt2"></span></div><span id="emptyText">Your form shows here as Tia builds it</span></div><div class="tpls" id="tpls" hidden><div class="tplhead"><h2 id="tplTitle">Start from a template</h2><div class="tplact"><label class="tplq">${SVG(P.search, 14)}<input id="tplQ" type="search" placeholder="Search templates" aria-label="Search templates" autocomplete="off"></label><button class="pill" id="blankBtn">${SVG(P.plus, 13)}Start blank</button></div></div><div class="tplfam" id="tplFam" role="group" aria-label="Category"></div><div class="tplgrid" id="tplGrid"></div><div class="tplfoot"><button class="pill" id="tplMore" hidden>Show more</button></div></div></div>
          <div class="ov" id="hov" hidden><span id="hovtag"></span></div>
          <div class="ov" id="sel" hidden><span id="seltag"></span></div>
          <div class="dropl" id="dropl" hidden></div>
          <div id="fbar" hidden></div>
        </div>
      </div>
      <div class="code" id="codeView" hidden>
        <div class="seg" role="group" aria-label="File"><button id="c-html" aria-pressed="true">HTML</button><button id="c-css" aria-pressed="false">Form CSS</button><button id="c-brand" aria-pressed="false">Brand CSS</button></div>
        <textarea id="codeText" spellcheck="false" aria-label="Code"></textarea>
        <div><button class="pill primary" id="codeApply">Apply</button></div>
      </div>
      <div class="after" id="afterView" hidden><div class="inner" id="afterInner"></div></div>
      <div class="stepdock" id="stepDock"><div class="ptools" id="pageTools" role="toolbar" aria-label="Page tools"></div><span class="spacer"></span><button class="ib tipup" id="undo" data-tip="Undo" aria-label="Undo" disabled>${SVG(P.undo)}</button><button class="ib tipup tipleft" id="redo" data-tip="Redo" aria-label="Redo" disabled>${SVG(P.redo)}</button></div>
      </div>
      <aside class="panel" id="panel" aria-label="Element" hidden>
        <div class="ptabs" role="tablist">
          <button class="pt" role="tab" id="p-set" aria-selected="true">${SVG(P.set, 14)}Settings</button>
          <button class="pt" role="tab" id="p-style" aria-selected="false">${SVG(P.brush, 14)}Style</button>
          <button class="pt" role="tab" id="p-theme" aria-selected="false">${SVG(P.style, 14)}Theme</button>
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
  /** Whether the booking calendar wears the form's style (paid plans) or the plain calendar (Free). */
  calendarBrand?(): Promise<boolean>;
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
  /** The people who take meetings, by name (the Team member field). */
  people?(): Promise<string[]>;
  /** The gallery's templates, most used first, and its families with labels. */
  templates(): Promise<{ list: StudioTemplate[]; families: { id: string; label: string }[] }>;
  /** A template's page as it will look in `css` (the chat's brand or style; else its own style), before it's made. */
  templatePage(id: string, css?: string): Promise<{ html: string; css: string; brand: string }>;
  /** Make a form from a template in a brand, a style, or the template's own style; its id. */
  useTemplate(id: string, look: { kitId?: string; theme?: string }): Promise<{ id: string; workflowError?: string }>;
  /** Open a form in the Studio. */
  openForm(id: string): void;
  /** The workspace's photos (Settings › Brand's library), newest first, with the widths each one has. */
  pictures?(): Promise<{ id: string; url: string; name: string; sizes: number[] }[]>;
  /** Upload a photo to the library: its address and widths. */
  uploadPicture?(file: File): Promise<{ url: string; sizes: number[] }>;
  /** The page's header draws the state, the form check and Publish (docs/form-ui-plan.md step 1). */
  onState?(s: StudioState): void;
  /** Where to start: a published form's chat, one chat, a new chat (New form), or the last one. */
  /** text: words to put in the message box of a new chat, unsent (the gallery's Describe your form). */
  start: { formId?: string; chatId?: string; fresh?: boolean; text?: string };
};

export type StudioIssue = { level: "error" | "warning"; text: string; fix?: string; after?: boolean };
/** What the header shows: the open chat and its form, whether it can publish, and the form check. */
export type StudioState = { ready: boolean; chatId: string; formId: string; name: string; state: "new" | "draft" | "live" | "changed"; canPublish: boolean; publishing: boolean; issues: StudioIssue[]; canFix: boolean; msg: string; previewing?: boolean };
/** What the header can ask of the Studio. */
export type StudioControl = {
  stop(): void;
  /** Publish once the form check passes: "blocked" when it found problems (they're in the state's issues). */
  publish(): Promise<"live" | "blocked" | "failed">;
  /** Hand fixes to Tia in the chat. */
  fix(fixes: string[]): void;
  /** Open On submission. */
  openAfter(): void;
  /** Preview the form on the whole screen, or go back to the editor. */
  preview(): void;
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
  // Paid plans book in the form's own style; Free gets the plain calendar.
  let CAL_BRAND = true;
  // The people who take meetings, for the Team member field.
  let PEOPLE = ["Anyone"];
  let chats = [];
  let cur = null;
  let loaded = false;
  const looking = new Set();
  const S = { state: "", open: new Set(), view: 0, hold: "", lang: "", translating: "", mode: "preview", device: "desk", sel: null, about: null, busy: false, ptab: "settings", scope: "class", nav: false, adds: true, file: "html", publishing: false, pubMsg: "" };
  const hist = {};
  const TG = { list: null, fams: [], fam: "all", q: "", n: 48, making: "" };
  // A template open for a look before it's used: its page in the canvas, in Preview, with nothing saved.
  let PK = null;
  const H = () => (hist[cur?.id || "-"] ||= { past: [], future: [] });
  // A form in one of the website's styles (src/lib/studio/styleCss.ts) has the style as its look, kept on its chat
  // (body.style, and body.styleCss once its CSS is edited), until a brand is picked.
  const styled = new WeakMap();
  const styleBrand = (c) => {
    const id = c?.body?.style;
    if (!id) return null;
    let b = styled.get(c);
    if (!b || b.style !== id) { b = { id: "", style: id, name: styleName(id), site: "", logo: null, css: c.body.styleCss || styleCssById(id), profile: null, lookErr: "" }; styled.set(c, b); }
    return b;
  };
  const brandOf = (c) => brands.find((b) => b.id === c?.brandId) || styleBrand(c) || null;
  const blank = (brandId) => ({ id: uuid(), name: "New form", state: "new", brandId: brandId || "", formId: "", body: { html: "", css: "", after: { kind: "thanks", url: "", meeting: MEETINGS[0]?.id || "", routes: [] }, turns: [], log: [], ids: {}, langs: {}, langFrom: {}, lang: "" } });
  const body = () => cur.body;

  // Saved a second after the last change, and when the page closes.
  let saveT = 0;
  const dropped = new Set();
  function save(now) {
    if (!cur || dropped.has(cur.id) || PK) return;
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
  const BASE = `${ACCESS_CSS}${PICK_CSS}${MEDIA_CSS}${ONE_CSS}.cl-edit select{appearance:none;-webkit-appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M4 6l4 4 4-4' fill='none' stroke='gray' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")!important;background-repeat:no-repeat!important;background-position:right 14px center!important;background-size:14px 14px!important;padding-inline-end:38px!important;cursor:pointer}.cl-bookph{border:1px dashed rgba(127,127,127,.6);border-radius:10px;padding:18px;text-align:center;font:500 12px system-ui,sans-serif;opacity:.7}.cl-divider{font:600 11px/1 system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#7a7a7a;border-top:1px dashed rgba(127,127,127,.55);padding:10px 0 0;margin:20px 0 10px}.cl-edit [data-cl-if]{outline:1px dashed rgba(109,40,217,.55);outline-offset:3px}.cl-edit [data-cl-if]::before{content:attr(data-cl-if);display:block;width:max-content;max-width:100%;font:500 11px/1.7 system-ui,sans-serif;color:#6d28d9;background:rgba(109,40,217,.08);border-radius:4px;padding:0 6px;margin-bottom:6px;white-space:normal}.cl-block{display:flex;flex-direction:column;gap:8px}.cl-two{display:grid;grid-template-columns:1fr 1fr;gap:8px}.cl-addr{display:flex;flex-direction:column;gap:8px}.cl-rate{display:flex;flex-wrap:wrap;gap:6px;font-size:26px;line-height:1;opacity:.6}.cl-ends{display:flex;justify-content:space-between;gap:12px;font-size:12px;opacity:.6}.cl-num{font-size:14px;border:1px solid currentColor;border-radius:8px;padding:8px 12px}.cl-sign{min-height:110px}.cl-calc{display:block;font-variant-numeric:tabular-nums}.cl-pay{display:flex;justify-content:space-between;gap:12px;align-items:baseline}.cl-pay b,.cl-res b{font-size:1.4em;font-variant-numeric:tabular-nums}.cl-res{display:flex;flex-direction:column;gap:4px}.cl-grid{width:100%;border-collapse:collapse}.cl-grid th,.cl-grid td{padding:6px;text-align:center}.cl-grid th:first-child,.cl-grid td:first-child{text-align:start}.cl-rank{margin:0;padding-inline-start:20px;display:flex;flex-direction:column;gap:6px}.cl-hid{font:500 11px/1.8 system-ui,sans-serif;opacity:.6;border:1px dashed currentColor;border-radius:6px;padding:0 8px;width:max-content}
.cl-consent{display:flex;gap:8px;align-items:flex-start;font-size:13px;line-height:1.4;opacity:.85}.cl-consent input{margin:2px 0 0}
.cl-pick{display:flex;justify-content:space-between;align-items:center;gap:8px;opacity:.75}.cl-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px}.cl-card{display:flex;flex-direction:column;gap:6px;padding:8px;height:auto}.cl-card img,.cl-ph{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:6px;background:rgba(127,127,127,.15);display:block}.cl-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.cl-row>input{flex:1 1 120px;min-width:0}.cl-btn2{display:inline-flex;width:max-content;font:500 12px/1 system-ui,sans-serif;border:1px solid currentColor;border-radius:999px;padding:7px 12px;opacity:.7}.cl-qty{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px 12px;align-items:center}.cl-step{display:inline-flex;gap:12px;align-items:center;border:1px solid rgba(127,127,127,.5);border-radius:999px;padding:4px 12px}.cl-chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.cl-chip{display:inline-flex;align-items:center;padding:6px 12px;height:auto;width:auto;border-radius:999px;border:1px solid rgba(127,127,127,.5);font-size:13px}.cl-map{height:160px;position:relative;background:repeating-linear-gradient(45deg,rgba(127,127,127,.08) 0 12px,rgba(127,127,127,.14) 12px 24px)}.cl-pin{position:absolute;left:50%;top:50%;width:16px;height:16px;margin:-16px 0 0 -8px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#d93025}.cl-crop{width:160px;aspect-ratio:1;height:auto}.cl-media{border:1px dashed rgba(127,127,127,.6);border-radius:10px;padding:22px;text-align:center;font:500 12px system-ui,sans-serif;opacity:.7;overflow-wrap:anywhere}.cl-edit [data-cl-review]:empty::before{content:"Answer review: the answers show here before sending";display:block;font:500 12px system-ui,sans-serif;opacity:.6;border:1px dashed rgba(127,127,127,.6);border-radius:8px;padding:14px}.cl-edit .cl-section{outline:1px dashed rgba(127,127,127,.45);outline-offset:6px;border-radius:4px}
:host{all:initial;display:flex;flex-direction:column;flex:1}*,*::before,*::after{box-sizing:border-box}[hidden]{display:none!important}.cl-root{flex:1;min-height:560px;display:flex;flex-direction:column}.cl-root>*{flex:1 0 auto}
${CAL_CSS}
.cl-edit [data-k]{cursor:default}.cl-edit [contenteditable]{outline:none;cursor:text}`;
  let stepAt = 0, done = false, coverOn = true;
  // One question at a time in Preview: each screen's page in Edit (oneMap), and the page Preview was opened on.
  let oneMap = [], previewFrom = null;
  function draw() {
    const has = built();
    // Nothing shows until a chat is open: a form that's still loading never flashes the templates.
    $("empty").hidden = has || !cur;
    host.hidden = !has;
    root.innerHTML = "";
    if (!has) { $("stepBar").hidden = $("stepDock").hidden = true; if (cur) { emptyUi(); void tplLoad(); } runCheck(); return overlay(); }
    const st = document.createElement("style");
    st.textContent = `${BASE}\n/* brand */\n${cssFor(PK ? PK.brand : brandOf(cur)?.css || S.hold)}\n/* form */\n${cssFor(PK ? PK.css : body().css)}`;
    const wrap = h("div", { class: S.mode === "edit" ? "cl-root cl-edit" : "cl-root" });
    // Another language shows as written (Preview only; Edit and Code work on the form's own language).
    const other = S.mode !== "edit" && S.lang && body().langs?.[S.lang];
    if (other) wrap.innerHTML = clean(other).innerHTML;
    else wrap.append(...[...src.cloneNode(true).childNodes]);
    const lang = other ? S.lang : mainLang();
    if (lang) { wrap.setAttribute("lang", lang); wrap.setAttribute("dir", isRtl(lang) ? "rtl" : "ltr"); }
    root.append(st, wrap);
    const logo = PK ? PK.logo : brandOf(cur)?.logo;
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
        stepsIn(wrap).forEach((st, i) => st.before(h("div", { class: "cl-divider", text: `Page ${i + 1}: ${stepName(st, i)}` })));
        wrap.querySelector("[data-cl-thanks]")?.before(h("div", { class: "cl-divider", text: "Thank-you" }));
      }
    }
    run(wrap);
    stepUi();
    requestAnimationFrame(overlay);
    runCheck();
  }
  const live = (k) => root.querySelector(`[data-k="${k}"]`);
  const BLOCK_NAMES = { file: "File upload", phone: "Phone", address: "Address", date: "Date", time: "Time", daterange: "Date range", rating: "Rating", signature: "Signature", country: "Country", calc: "Calculation", payment: "Payment", result: "Result", grid: "Grid", ranking: "Ranking", hidden: "Hidden value", list: "Searchable list", pictures: "Picture choice", group: "Repeating group", sum: "Points to spread", range: "Range slider", table: "Table input", slots: "Availability grid", products: "Product picker", amount: "Amount picker", duration: "Duration", rich: "Rich text", draw: "Drawing", location: "Current location", map: "Map pin", record: "Audio or video answer", crop: "Image with crop", image: "Image", video: "Video" };
  const listOf = (raw) => String(raw || "").split("|").map((x) => x.trim()).filter(Boolean).map((x) => { const i = x.indexOf("::"); return i > 0 ? x.slice(i + 2) : x; });
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
    else if (type === "rating" && /^(faces|thumbs)$/.test(hd.getAttribute("data-cl-style") || "")) {
      const th = hd.getAttribute("data-cl-style") === "thumbs";
      box.append(h("div", { class: "cl-rate" }, ...(th ? [180, 0] : [0, 1, 2, 3, 4]).map((x) => h("span", { html: SVG(th ? P.thumb : P.face, 30), style: th && x ? "" : th ? "transform:rotate(180deg);display:inline-flex" : "display:inline-flex" }))));
    }
    else if (type === "rating") {
      const n = Math.min(10, Math.max(3, Number(hd.getAttribute("data-cl-scale")) || 5)); const nums = hd.getAttribute("data-cl-style") === "numbers";
      const low = nums && hd.hasAttribute("data-cl-zero") ? 0 : 1;
      box.append(h("div", { class: "cl-rate" }, ...Array.from({ length: n - low + 1 }, (_, i) => h("span", { class: nums ? "cl-num" : "", text: nums ? String(i + low) : "\u2605" }))));
      const lo = hd.getAttribute("data-cl-low"), hi = hd.getAttribute("data-cl-high");
      if (lo || hi) box.append(h("div", { class: "cl-ends" }, h("span", { text: lo || "" }), h("span", { text: hi || "" })));
    }
    else if (type === "signature") box.append(h("div", { class: "field cl-sign" }));
    else if (type === "calc") { if (hd.hasAttribute("data-cl-hide")) return S.mode === "edit" ? h("span", { class: "cl-hid", text: `${label} (worked out, not shown)` }) : h("span"); box.append(h("output", { class: "field cl-calc", "data-cl-num": hd.getAttribute("data-cl-name") || "", text: "—" })); }
    else if (type === "payment") return h("div", { class: "text cl-pay" }, h("span", { text: hd.getAttribute("data-cl-label") || "Total" }), h("b", { "data-cl-num": hd.getAttribute("data-cl-name") || "", text: "—" }));
    else if (type === "result") return h("div", { class: "card cl-res" }, h("span", { class: "label", text: hd.getAttribute("data-cl-label") || "Your result" }), h("b", { "data-cl-num": hd.getAttribute("data-cl-name") || "", text: "—" }));
    else if (type === "grid") { const cols = listOf(hd.getAttribute("data-cl-cols")); box.append(h("table", { class: "cl-grid" }, h("tr", {}, h("th", {}), ...cols.map((c) => h("th", { class: "label", text: c }))), ...listOf(hd.getAttribute("data-cl-rows")).map((r) => h("tr", {}, h("td", { class: "text", text: r }), ...cols.map(() => h("td", {}, h("input", { type: "radio", tabindex: "-1" }))))))); }
    else if (type === "ranking") box.append(h("ol", { class: "cl-rank" }, ...listOf(hd.getAttribute("data-cl-options")).map((o) => h("li", { class: "field", text: o }))));
    else if (type === "list") {
      const opts = listOf(hd.getAttribute("data-cl-options"));
      const by = hd.getAttribute("data-cl-by");
      box.append(h("div", { class: "field cl-pick" }, h("span", { text: by ? `Options follow ${by}` : hd.hasAttribute("data-cl-multi") ? "Choose any" : opts.length > 8 ? `Search ${opts.length} options` : "Choose one" }), h("span", { text: "\u25be" })));
    }
    else if (type === "pictures") { const imgs = String(hd.getAttribute("data-cl-images") || "").split("|"); box.append(h("div", { class: "cl-cards" }, ...listOf(hd.getAttribute("data-cl-options")).map((o, i) => h("div", { class: "field cl-card" }, /^https:\/\//.test(imgs[i] || "") ? h("img", { src: imgs[i], alt: "" }) : h("span", { class: "cl-ph" }), h("span", { text: o }))))); }
    else if (type === "group") { const fs = String(hd.getAttribute("data-cl-fields") || "").split("|").filter(Boolean).map((x) => x.split("::")[0]); box.append(h("div", { class: "cl-row" }, ...fs.map((x) => inp({ placeholder: x }))), h("span", { class: "cl-btn2", text: `+ ${hd.getAttribute("data-cl-add") || "Add another"}` })); }
    else if (type === "sum") { const t = hd.getAttribute("data-cl-total") || "100"; box.append(h("div", { class: "cl-qty" }, ...listOf(hd.getAttribute("data-cl-options")).flatMap((o) => [h("span", { class: "text", text: o }), inp({ placeholder: "0", style: "width:72px" })])), h("span", { class: "cl-ends", text: `${t} points left` })); }
    else if (type === "range") box.append(h("div", { class: "cl-two" }, inp({ value: hd.getAttribute("data-cl-min") || "0" }), inp({ value: hd.getAttribute("data-cl-max") || "100" })));
    else if (type === "table" || type === "slots") { const cols = listOf(hd.getAttribute("data-cl-cols")); box.append(h("table", { class: "cl-grid" }, h("tr", {}, h("th", {}), ...cols.map((c) => h("th", { class: "label", text: c }))), ...listOf(hd.getAttribute("data-cl-rows")).map((r) => h("tr", {}, h("td", { class: "text", text: r }), ...cols.map(() => h("td", {}, type === "slots" ? h("input", { type: "checkbox", tabindex: "-1" }) : inp({}))))))); }
    else if (type === "products") { const pr = String(hd.getAttribute("data-cl-prices") || "").split("|"); const cur = hd.getAttribute("data-cl-currency") || "USD"; const fmt = (n) => { try { return new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format(Number(n) || 0); } catch { return String(n); } }; box.append(h("div", { class: "cl-qty" }, ...listOf(hd.getAttribute("data-cl-options")).flatMap((o, i) => [h("span", { class: "text", text: `${o}  ${fmt(pr[i])}` }), h("span", { class: "cl-step" }, h("span", { text: "\u2212" }), h("b", { text: "0" }), h("span", { text: "+" }))]))); }
    else if (type === "amount") box.append(h("div", { class: "cl-chips" }, ...String(hd.getAttribute("data-cl-amounts") || "").split("|").filter(Boolean).map((a) => h("span", { class: "field cl-chip", text: a })), inp({ placeholder: "Other amount" })));
    else if (type === "duration") box.append(h("div", { class: "cl-two" }, inp({ placeholder: "Hours" }), inp({ placeholder: "Minutes" })));
    else if (type === "rich") box.append(h("div", { class: "cl-chips" }, ...["B", "I", "\u2022", "1.", "Link"].map((x) => h("span", { class: "cl-chip", text: x }))), h("textarea", { class: "field", rows: "4", tabindex: "-1" }));
    else if (type === "draw") box.append(h("div", { class: "field cl-sign", style: "min-height:180px" }));
    else if (type === "location") box.append(h("div", { class: "cl-row" }, inp({ placeholder: "City, address or coordinates" }), h("span", { class: "cl-btn2", text: "Use my location" })));
    else if (type === "map") box.append(h("div", { class: "field cl-map" }, h("span", { class: "cl-pin" })), h("span", { class: "cl-btn2", text: "Use my location" }));
    else if (type === "record") box.append(h("span", { class: "cl-btn2", text: "Start recording" }));
    else if (type === "crop") box.append(inp({ type: "file" }), h("div", { class: "field cl-crop" }));
    else if (type === "image") { const src = hd.getAttribute("data-cl-src") || ""; return /^https:\/\//.test(src) ? h("img", { src, alt: hd.getAttribute("data-cl-alt") || "", style: "max-width:100%;border-radius:8px" }) : h("div", { class: "cl-media", text: "Image: add its address in Settings" }); }
    else if (type === "video") { const src = hd.getAttribute("data-cl-src") || ""; return h("div", { class: "cl-media", text: src ? `Video: ${src}` : "Video: add a YouTube, Vimeo or Loom link in Settings" }); }
    else if (type === "hidden") return S.mode === "edit" ? h("span", { class: "cl-hid", text: `Hidden value: ${hd.getAttribute("data-cl-param") || hd.getAttribute("data-cl-name") || ""}` }) : h("span");
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
    oneMap = S.mode !== "edit" ? splitOne(w) : [];
    if (oneMap.length) {
      oneKeys(w);
      if (previewFrom !== null) { const i = oneMap.indexOf(previewFrom); stepAt = i >= 0 ? i : 0; }
    }
    previewFrom = null;
    linkErrors(w);
    if (S.mode !== "edit") { shuffle(w); pickers(w); }
    const steps = [...w.querySelectorAll("[data-cl-step]")], thanks = w.querySelector("[data-cl-thanks]"), editing = S.mode === "edit";
    // The welcome screen and the photos (docs/forms-media-plan.md): Edit shows the screen picked, Preview runs them.
    const cover = w.querySelector("[data-cl-cover]"), page = pageBox(w);
    const single = () => w.querySelector("form[data-cl-media],.form-card[data-cl-media]");
    // Totals, payments and scores, worked out the way the live form and the server do; calcs join the answers by name.
    const nums = () => {
      if (!w.querySelector("[data-cl-num]")) return {};
      let n = {};
      try { n = pageNumbers(body().html, values(w)); } catch { n = {}; }
      w.querySelectorAll("[data-cl-num]").forEach((x) => { const k = x.getAttribute("data-cl-num"); if (n[k]) x.textContent = n[k].text; });
      return Object.fromEntries(Object.entries(n).map(([k, x]) => [k, x.value === null ? "" : String(x.value)]));
    };
    const apply = () => {
      const v = { ...values(w), ...nums() };
      w.querySelectorAll("[data-cl-show-if]").forEach((el) => { if (!el.hasAttribute("data-cl-step")) el.hidden = !editing && !holds(el.getAttribute("data-cl-show-if"), v); });
      const shown = steps.filter((s) => !s.hasAttribute("data-cl-show-if") || holds(s.getAttribute("data-cl-show-if"), v));
      if (stepAt >= steps.length) stepAt = 0;
      // Edit shows the step picked in the step bar (or all of them); Preview runs the form.
      const view = S.view;
      steps.forEach((s, i) => (s.hidden = editing ? !(view === "all" || view === i) : done || i !== stepAt));
      if (thanks) thanks.hidden = editing ? !(view === "all" || view === "thanks") : !done;
      // The thank-you takes the form's place, heading included, once sent and in Edit when the thank-you is picked.
      if (thanks && ((editing && view === "thanks") || (!editing && done))) for (const x of around(thanks, w)) x.hidden = true;
      const pos = shown.indexOf(steps[stepAt]);
      const p = steps.length ? (done ? 1 : (Math.max(0, pos) + 1) / Math.max(1, shown.length)) : done ? 1 : 0;
      w.querySelectorAll("[data-cl-progress]").forEach((el) => el.style.setProperty("--cl-progress", String(editing ? 0.5 : p)));
      // Answers in text show as typed in Preview; Edit keeps {first_name} so it can be changed.
      if (!editing) pipes(w, v);
      const onC = !!cover && (editing ? view === "cover" : coverOn && !done);
      if (cover && editing && view === "all") { cover.hidden = false; for (const x of page.children) x.removeAttribute("data-cl-behind-cover"); }
      else if (cover) showCover(page, cover, onC);
      showMedia(page, editing ? (view === "all" ? null : view === "cover" ? cover : view === "thanks" ? thanks : (steps[view] ?? single())) : onC ? cover : done ? thanks : (steps[stepAt] ?? single()));
      return shown;
    };
    const check = (scope) => {
      let ok = true; const seen = new Set();
      for (const el of scope.querySelectorAll("input[name],textarea[name],select[name]")) {
        if (el.closest("[hidden]") || seen.has(el.name)) continue; seen.add(el.name);
        const group = [...scope.querySelectorAll(`[name="${CSS.escape(el.name)}"]`)].filter((x) => !x.closest("[hidden]"));
        const filled = el.type === "radio" || el.type === "checkbox" ? group.some((x) => x.checked) : !!el.value.trim();
        const msg = group.some((x) => x.required) && !filled ? "Fill this in." : el.type === "email" && el.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value) ? "Enter a valid email." : limitMsg(el, group);
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
      const t = e.target.closest?.("[data-cl-next],[data-cl-back],[data-cl-start],[type=submit]");
      if (!t) return;
      e.preventDefault();
      if (t.hasAttribute("data-cl-start")) { coverOn = false; apply(); stepUi(); return; }
      if (t.hasAttribute("data-cl-back")) return move(-1);
      if (t.hasAttribute("data-cl-next")) { if (check(steps[stepAt] || w)) move(1); return; }
      if (check(w)) { done = true; apply(); booking(w, values(w)); }
    });
    w.addEventListener("submit", (e) => e.preventDefault());
    apply();
    if (done && !editing) booking(w, values(w));
    // Edit shows the booking under the message, as visitors will see it.
    if (editing && S.view === "thanks" && body().after?.kind === "meeting" && w.querySelector("[data-cl-thanks] [data-cl-book]")) booking(w, {});
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
  const calBtn = (on) => (CAL_BRAND ? (on ? "btn" : "btn-secondary") : "");
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
    const cal = h("div", { class: CAL_BRAND ? "cl-cal" : "cl-cal cl-plain" }, h("div", { class: "cl-host" }, h("div", {}, h("b", { text: m.name }), h("small", { text: `${t?.length || m.length} min` }))));
    if (!days.length) { cal.append(h("p", { class: "text", text: t ? "No open times right now." : "Couldn't read the open times." })); return spot.replaceChildren(cal); }
    let pick = days[0], more = false;
    const dRow = h("div", { class: "cl-days", role: "group", "aria-label": "Day" }), tRow = h("div", { class: "cl-times", role: "group", "aria-label": "Times" }), moreBtn = h("button", { type: "button", class: "cl-link" });
    const drawDays = () => dRow.replaceChildren(...days.map((d) => h("button", { type: "button", class: `${calBtn(d === pick)} cl-day`, "aria-pressed": String(d === pick), onclick: () => { pick = d; more = false; drawDays(); drawTimes(); } }, h("small", { text: fmt(d.starts[0], { weekday: "short" }) }), h("strong", { text: fmt(d.starts[0], { month: "short", day: "numeric" }) }))));
    const drawTimes = () => {
      const shown = more ? pick.starts : pick.starts.slice(0, 9);
      tRow.replaceChildren(...shown.map((s) => h("button", { type: "button", class: `${calBtn(false)} cl-time`, text: fmt(s, { hour: "numeric", minute: "2-digit" }), onclick: () => cal.replaceChildren(h("h3", { class: CAL_BRAND ? "heading" : "", text: "You're booked" }), h("p", { class: CAL_BRAND ? "text" : "", text: `${fmt(s, { weekday: "long", month: "long", day: "numeric" })}, ${fmt(s, { hour: "numeric", minute: "2-digit" })}. Preview only: nothing was booked.` })) })));
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
  const nameOf = (el) => { if (!el) return ""; const qk = questionKind(el); if (qk) return qk; if (el.hasAttribute?.("data-cl-field")) return BLOCK_NAMES[el.getAttribute("data-cl-field")] || "Block"; if (el.matches?.("label.choice,label.check")) return "Choice"; if (el.hasAttribute?.("data-cl-step")) return "Step"; if (el.hasAttribute?.("data-cl-thanks")) return "Thanks"; if (el.hasAttribute?.("data-cl-book")) return "Booking"; return NAMES[el.tagName] || "Box"; };
  const leaf = (el) => el && !el.children.length && !["INPUT", "IMG", "TEXTAREA", "SELECT", "BR", "HR"].includes(el.tagName) && el.textContent.trim();
  const kOf = (e) => e.composedPath().find((n) => n instanceof Element && n.hasAttribute?.("data-k"));
  let editingK = null;
  root.addEventListener("mousemove", (e) => { if (S.mode !== "edit") return; const el = kOf(e); place($("hov"), el && el.getAttribute("data-k") !== S.sel ? el : null, $("hovtag")); });
  root.addEventListener("mouseleave", () => ($("hov").hidden = true));
  // In Edit a dropdown on the form is picked like anything else, so the browser's own list never opens.
  root.addEventListener("mousedown", (e) => { if (S.mode === "edit" && e.composedPath()[0]?.closest?.("select")) e.preventDefault(); }, true);
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
    const kinds = kindsOf(byK(S.sel));
    fb.append(...(kinds ? [h("button", { class: "ib", id: "typeBtn", "data-tip": "Change field type", "aria-label": "Change field type", html: SVG(P.swap, 15), onclick: (e) => { e.stopPropagation(); typeChangeMenu(e.currentTarget); } })] : []), b("Move up", P.up, () => move(-1)), b("Move down", P.down, () => move(1)), b("Duplicate", P.dup, dup), b("Delete", P.del, del), b("Select parent", P.parent, parent), h("button", { class: "ib", "data-tip": "Ask Tia about this", "aria-label": "Ask Tia about this", html: tiaSvg(16), onclick: (e) => { e.stopPropagation(); askAbout(); } }));
    const w = (kinds ? 7 : 6) * 30 + 6;
    fb.style.left = `${Math.max(0, Math.min(box.left + box.width - w, $("frame").clientWidth - w))}px`;
    fb.style.top = `${box.top > 62 ? box.top - 58 : box.top + box.height + 8}px`;
  }
  function select(k) {
    S.sel = k;
    // Picked in Layers inside another step: show that step.
    const el = byK(k);
    if (S.mode === "edit" && el && S.view !== "all") {
      const steps = stepsIn(src), st = steps.findIndex((x) => x.contains(el));
      const v = el.closest("[data-cl-cover]") ? "cover" : el.closest("[data-cl-thanks]") ? "thanks" : st >= 0 ? st : S.view;
      if (v !== S.view && (st >= 0 || v === "thanks" || v === "cover")) { S.view = v; draw(); }
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
    setChatFold(false); setSide("ai"); aboutUi(); $("input").focus();
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
  // A click beside the form picks nothing: the panel shows the whole form's settings.
  $("canvas").addEventListener("click", (e) => { if (S.mode !== "edit" || !S.sel || e.target.closest?.("#host,#fbar,#sel")) return; S.sel = null; panel(); tree(); overlay(); });
  listen(window, "resize", () => overlay());

  // ── Steps (multi-page forms): pills to see one step at a time, the thank-you and all of them; tools to add,
  // copy, move and remove steps. Next and send buttons follow the order. ──────────────────────────────────────
  const stepsIn = (r) => [...r.querySelectorAll("[data-cl-step]")].filter((x) => !x.parentElement?.closest("[data-cl-thanks]"));
  const stepName = (st, i) => (st.querySelector("h1,h2,h3,h4,legend,.heading,.title,label")?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 28) || `Page ${i + 1}`;
  function ifWords(expr) {
    const qs = questions();
    const label = (n) => { const el = src.querySelector(`[name="${CSS.escape(n)}"]`); const lab = el?.id ? src.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null; return (lab?.textContent || n.replace(/[_-]+/g, " ")).trim(); };
    const opt = (n, v) => qs.find((q) => q.name === n)?.options.find((o) => o.value === v)?.label || v;
    return `Shown if ${String(expr).split(/\s+(and|or)\s+/i).map((c) => {
      if (/^(and|or)$/i.test(c)) return c.toLowerCase();
      let m = /^([\w-]+)\s+(filled|empty)$/i.exec(c.trim());
      if (m) return `${label(m[1])} is ${m[2].toLowerCase() === "filled" ? "answered" : "empty"}`;
      m = /^([\w-]+)\s+within\s+(\d+)\s+days$/i.exec(c.trim());
      if (m) return `${label(m[1])} is within the next ${m[2]} days`;
      m = /^([\w-]+)\s+in\s+\((.*)\)$/i.exec(c.trim());
      if (m) return `${label(m[1])} is ${[...m[2].matchAll(/'([^']*)'|"([^"]*)"/g)].map((y) => opt(m[1], y[1] ?? y[2])).join(" or ")}`;
      m = /^([\w-]+)\s*(==|!=|>=|<=|>|<)\s*(?:'([^']*)'|"([^"]*)"|(\S+))$/.exec(c.trim());
      if (!m) return c;
      const v = m[3] ?? m[4] ?? m[5];
      const day = /^\d{4}-\d{2}-\d{2}$/.test(v);
      return `${label(m[1])} ${(day ? { ">": "is after", "<": "is before", ">=": "is on or after", "<=": "is on or before" } : {})[m[2]] || { "==": "is", "!=": "is not", ">": "is over", "<": "is under", ">=": "is at least", "<=": "is at most" }[m[2]]} ${opt(m[1], v)}`;
    }).join(" ")}`;
  }
  function stepUi() {
    const bar = $("stepBar");
    const steps = stepsIn(src), thanks = src.querySelector("[data-cl-thanks]");
    bar.hidden = !cur || !built() || S.mode === "code";
    // The page tools sit under the form while editing; undo and redo stay there in every view.
    $("stepDock").hidden = bar.hidden;
    if (bar.hidden) return;
    const editing = S.mode === "edit";
    const cover = src.querySelector("[data-cl-cover]");
    if (editing && ((typeof S.view === "number" && S.view >= Math.max(1, steps.length)) || (S.view === "cover" && !cover))) S.view = 0;
    bar.innerHTML = "";
    // Pages as steps: numbered circles joined by a line, the thank-you last with a tick; pages already passed in
    // Preview show done. All is an icon beside them.
    const go = (v) => {
      if (v === "after") return setMode("after");
      if (S.mode === "after") { S.view = v; return setMode("edit"); }
      if (editing) { S.view = v; S.sel = null; draw(); panel(); tree(); } else { if (v === "thanks") done = true; else if (v === "cover") { done = false; coverOn = true; } else { done = false; coverOn = false; stepAt = oneMap.length ? Math.max(0, oneMap.indexOf(v)) : v; } draw(); }
    };
    const conn = () => h("span", { class: "conn", "aria-hidden": "true" });
    const pill = (n, text, on, fn, cls = "") => h("button", { class: `sp${cls ? ` ${cls}` : ""}`, "aria-pressed": String(on), onclick: fn }, h("span", { class: "n", ...(n === "tick" ? { html: SVG(P.check, 11) } : n === "bolt" ? { html: SVG(P.bolt, 11) } : n === "img" ? { html: SVG(P.image, 11) } : { text: n }) }), h("span", { text }));
    const after = S.mode === "after";
    const at = editing ? S.view : done ? "thanks" : oneMap.length ? (oneMap[stepAt] ?? 0) : stepAt;
    const passed = (i) => !editing && (done || (typeof at === "number" && i < at));
    if (cover) { bar.append(pill("img", "Welcome", !after && (editing ? S.view === "cover" : coverOn && !done), () => go("cover"), !editing && !after && (!coverOn || done) ? "done" : "")); bar.append(conn()); }
    const onCov = !editing && !!cover && coverOn && !done;
    if (steps.length) steps.forEach((st, i) => { if (i) bar.append(conn()); bar.append(pill(String(i + 1), stepName(st, i), !after && (editing ? S.view === i : !done && !onCov && at === i), () => go(i), passed(i) && !onCov ? "done" : "")); });
    else bar.append(pill("1", "Form", !after && (editing ? S.view === 0 : !done && !onCov), () => go(0), !editing && !after && done ? "done" : ""));
    // The end step follows On submission: a message, a redirect, or the booking under the message.
    const endKind = body().after?.kind || "thanks";
    if (thanks) { bar.append(conn()); bar.append(pill("tick", endKind === "page" ? "Redirect" : endKind === "meeting" ? "Booking" : "Thank-you", !after && (editing ? S.view === "thanks" : done), () => go(editing && endKind === "page" ? "after" : "thanks"))); }
    // On submission is the last step: what happens once it's sent (the meeting, routing, the team's email).
    if (S.mode !== "preview") { bar.append(conn()); bar.append(pill("bolt", "On submission", after, () => go("after"), "after")); }
    if (editing && (steps.length > 1 || thanks)) bar.append(h("button", { class: "sp all", "aria-pressed": String(S.view === "all"), "aria-label": "All pages", "data-tip": "All pages", html: SVG(P.layers, 15), onclick: () => go("all") }));
    pageTools(steps);
  }
  /** The bar under the form: what to do with the page in view (Add page, move, copy, time, delete), then undo. */
  function pageTools(steps) {
    const box = $("pageTools");
    box.innerHTML = "";
    if (S.mode !== "edit") return;
    box.append(h("button", { class: "pill", "data-add-page": "", "aria-label": "Add page", html: `${SVG(P.plus, 14)}Add page`, onclick: addPage }));
    if (typeof S.view !== "number" || !steps.length) return;
    const i = S.view;
    const tool = (tip, ic, fn, off) => h("button", { class: "ib tipup", "data-tip": tip, "aria-label": tip, html: SVG(ic, 15), disabled: off || null, onclick: fn });
    const t = timerTool(i);
    t.classList.add("tipup");
    box.append(
      tool("Move earlier", '<path d="m15 18-6-6 6-6"/>', () => moveStep(i, -1), i === 0),
      tool("Move later", '<path d="m9 18 6-6-6-6"/>', () => moveStep(i, 1), i === steps.length - 1),
      tool("Duplicate the page", P.dup, () => dupStep(i)),
      t,
      tool("Delete the page", P.del, () => delStep(i), steps.length < 2),
    );
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
  /**
   * Add page: a page after the one in view (or the last). A one-page form becomes pages first: what it asks is page 1,
   * and the send button moves to the new last page.
   */
  function addPage() {
    if (!built()) return;
    const steps = stepsIn(src);
    if (steps.length) return addStep(typeof S.view === "number" && S.view < steps.length ? S.view : steps.length - 1);
    const form = src.querySelector("form");
    if (!form) return toast("This form has no fields to split into pages");
    snap();
    const st = document.createElement("section"); st.setAttribute("data-cl-step", ""); st.id = "s1";
    const thanks = [...form.children].find((x) => x.matches("[data-cl-thanks]"));
    for (const ch of [...form.childNodes]) if (!(ch.nodeType === 1 && ch.matches('[data-cl-thanks],[data-cl-field="hidden"]'))) st.append(ch);
    if (thanks) thanks.before(st); else form.append(st);
    if (!/\[data-cl-step\]\s*\{/.test(body().css || "")) body().css = `${body().css || ""}\n[data-cl-step]{display:flex;flex-direction:column;gap:22px}`;
    normalizeSteps(); ensureIds();
    addStep(0, true);
  }
  function addStep(i, snapped) {
    const st = stepsIn(src)[i]; if (!st) return;
    if (!snapped) snap();
    const c = st.cloneNode(false); c.removeAttribute("data-cl-show-if"); c.removeAttribute("data-k"); c.removeAttribute("data-cl-own"); c.id = `step${Date.now().toString(36).slice(-4)}`;
    const head = st.querySelector("h1,h2,h3,.heading");
    c.append(head ? Object.assign(head.cloneNode(false), { textContent: "New page" }) : Object.assign(document.createElement("h2"), { textContent: "New page" }));
    const nav = [...st.querySelectorAll("[data-cl-back],[data-cl-next],[type=submit]")].at(-1)?.parentElement;
    if (nav && nav !== st) { const row = nav.cloneNode(true); row.querySelectorAll("[id]").forEach((x) => x.removeAttribute("id")); c.append(row); }
    else { const back = st.querySelector("[data-cl-back]"); if (back) c.append(back.cloneNode(true)); }
    st.after(c);
    normalizeSteps(); ensureIds();
    S.view = i + 1; commit();
  }
  /** A page's timer: it moves on by itself when the time is up. */
  function timerTool(i) {
    const st = stepsIn(src)[i];
    const secs = Number(st?.getAttribute("data-cl-timer")) || 0;
    const b = h("button", { class: "ib", "data-tip": secs ? `Timer: ${secs >= 60 ? `${secs / 60} min` : `${secs} s`}` : "Add a timer", "aria-label": "Page timer", "aria-pressed": String(!!secs), html: SVG(P.time, 15) });
    b.onclick = () => openMenu(b, [[0, "No timer"], [30, "30 seconds"], [60, "1 minute"], [120, "2 minutes"], [300, "5 minutes"], [600, "10 minutes"]].map(([n, t]) => h("button", { class: "mi small", role: "menuitemradio", "aria-checked": String(n === secs), text: t, onclick: () => { closeMenu(); snap(); n ? st.setAttribute("data-cl-timer", String(n)) : st.removeAttribute("data-cl-timer"); commit(); } })), 180);
    return b;
  }
  function dupStep(i) { const st = stepsIn(src)[i]; if (!st) return; snap(); st.after(copyStep(st)); normalizeSteps(); ensureIds(); S.view = i + 1; commit(); }
  function moveStep(i, dir) { const steps = stepsIn(src), st = steps[i], other = steps[i + dir]; if (!st || !other) return; snap(); dir < 0 ? other.before(st) : other.after(st); normalizeSteps(); S.view = i + dir; commit(); }
  function delStep(i) { const steps = stepsIn(src); if (steps.length < 2) return; snap(); steps[i].remove(); normalizeSteps(); S.view = Math.max(0, i - 1); commit(); toast("Step deleted. Undo with Cmd+Z."); }

  // ── Layers ────────────────────────────────────────────────────────────────────────────────────────────
  function tree() {
    const t = $("tree"); t.innerHTML = "";
    if (!S.nav) return;
    const walk = (el, d) => { for (const c of el.children) { const k = c.getAttribute("data-k"); const label = c.id ? `#${c.id}` : leaf(c) ? c.textContent.trim().slice(0, 24) : c.classList[0] ? `.${c.classList[0]}` : ""; t.append(h("button", { class: k === S.sel ? "sel" : "", style: `padding-left:${6 + d * 12}px`, onclick: () => select(k) }, h("span", { class: "tg", text: nameOf(c) }), h("span", { text: label }))); if (d < 9) walk(c, d + 1); } };
    walk(src, 0);
  }

  // ── Styles: one rule per class or element, in the form CSS's editor block ──────────────────────────────
  const EDIT = "/* editor */";
  function rules() { const css = body().css; const i = css.indexOf(EDIT); const out = {}; if (i < 0) return out; for (const m of css.slice(i + EDIT.length).matchAll(/([^{}]+)\{([^{}]*)\}/g)) { const p = {}; for (const d of m[2].split(";")) { const j = d.indexOf(":"); if (j > 0) p[d.slice(0, j).trim()] = d.slice(j + 1).trim(); } out[m[1].trim()] = p; } return out; }
  function writeRules(r) { const css = body().css; const i = css.indexOf(EDIT); const head = (i >= 0 ? css.slice(0, i) : css).trimEnd(); const out = Object.entries(r).filter(([, p]) => Object.keys(p).length).map(([s, p]) => `${s}{${Object.entries(p).map(([k, v]) => `${k}:${v}`).join(";")}}`).join("\n"); body().css = out ? `${head}\n${EDIT}\n${out}\n` : `${head}\n`; }
  function target() { const el = byK(S.sel); if (!el) return null; const cls = el.classList[0]; const st = S.state || ""; if (S.scope === "class" && cls) return `.${cls}${st}`; if (!el.id) el.id = `el${S.sel}`; return `#${el.id}${st}`; }
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
    $("p-style").setAttribute("aria-selected", String(S.ptab === "style")); $("p-set").setAttribute("aria-selected", String(S.ptab === "settings")); $("p-theme").setAttribute("aria-selected", String(S.ptab === "theme"));
    if (S.ptab === "theme") return themePanel(p);
    if (!el && S.ptab === "settings") return formSettings(p);
    if (!el) { p.append(h("div", { class: "sec" }, h("p", { class: "hint0", text: "Select a field on the form to style it." }))); return; }
    if (S.ptab === "settings") return settings(p, el);
    const cls = el.classList[0];
    p.append(h("div", { class: "sec" }, h("div", { class: "sel-head" }, h("span", { class: `cls${S.scope === "class" && cls ? "" : " off"}`, text: S.scope === "class" && cls ? `.${cls}` : el.id ? `#${el.id}` : "this one" }), h("span", { class: "spacer" }),
      h("div", { class: "seg" }, h("button", { "aria-pressed": String(S.scope === "el" || !cls), onclick: () => { S.scope = "el"; panel(); }, text: "This one" }), cls ? h("button", { "aria-pressed": String(S.scope === "class"), onclick: () => { S.scope = "class"; panel(); }, text: "All like it" }) : null)),
      // States, like Framer's variants: the look on hover and while it's being typed in.
      h("div", { class: "sel-head" }, h("span", { class: "lbl2", text: "State" }), h("span", { class: "spacer" }), h("div", { class: "seg" }, ...[["", "Default"], [":hover", "Hover"], [":focus-within", "Focus"]].map(([v, t]) => h("button", { "aria-pressed": String((S.state || "") === v), onclick: () => { S.state = v; panel(); }, text: t }))))));
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
    p.append(positionSec(), sizeSec());
    p.append(L);
    // Spacing
    const r = live(S.sel)?.getBoundingClientRect();
    const bx = (prop, side) => { const i = h("input", { class: `bx ${side}`, "aria-label": prop.replace("-", " "), value: getP(prop).replace(/px$/, ""), placeholder: (comp(prop) || "").replace(/px$/, "") }); i.addEventListener("change", () => setP(prop, unit(i.value))); return i; };
    const pad = h("div", { class: "boxp" }, h("span", { class: "bl", text: "Padding" }), bx("padding-top", "t"), bx("padding-right", "r"), bx("padding-bottom", "b"), bx("padding-left", "l"), h("span", { class: "boxc", text: r ? `${Math.round(r.width)} × ${Math.round(r.height)}` : "" }));
    p.append(h("div", { class: "sec" }, h("h4", { text: "Spacing" }), h("div", { class: "boxm" }, h("span", { class: "bl", text: "Margin" }), bx("margin-top", "t"), bx("margin-right", "r"), bx("margin-bottom", "b"), bx("margin-left", "l"), pad)));
    // Type
    const T = h("div", { class: "sec" }, h("h4", { text: "Type" }), h("div", { class: "g3" }, num("Size", "font-size", "S"), num("Line height", "line-height", "L"), num("Letter spacing", "letter-spacing", "T")));
    const wt = h("div", { class: "icons", role: "group", "aria-label": "Weight" });
    for (const w of ["400", "500", "600", "700", "800"]) wt.append(h("button", { class: "ib", "aria-pressed": String((getP("font-weight") || comp("font-weight")) === w), "aria-label": `Weight ${w}`, style: `font-weight:${w};font-size:12px`, text: w, onclick: () => setP("font-weight", w) }));
    const al = h("div", { class: "icons", role: "group", "aria-label": "Align" });
    for (const [v, ic, tip] of [["left", P.al, "Left"], ["center", P.ac, "Center"], ["right", P.ar, "Right"]]) al.append(h("button", { class: "ib", "data-tip": tip, "aria-label": tip, "aria-pressed": String((getP("text-align") || comp("text-align")).replace("start", "left") === v), html: SVG(ic, 15), onclick: () => setP("text-align", v) }));
    const cs = h("div", { class: "icons", role: "group", "aria-label": "Case" });
    for (const [v, ic, tip] of [["none", P.case0, "As typed"], ["uppercase", P.caseU, "Capitals"], ["lowercase", P.caseL, "Lower case"]]) cs.append(h("button", { class: "ib", "data-tip": tip, "aria-label": tip, "aria-pressed": String((getP("text-transform") || comp("text-transform")) === v), html: SVG(ic, 15), onclick: () => setP("text-transform", v) }));
    const it = h("div", { class: "icons", role: "group", "aria-label": "Style" });
    for (const [v, t, st] of [["normal", "Regular", ""], ["italic", "Italic", "font-style:italic"]]) it.append(h("button", { class: "ib", "aria-pressed": String((getP("font-style") || comp("font-style")) === v), text: t, style: `font-size:12px;${st}`, onclick: () => setP("font-style", v === "normal" ? "" : v) }));
    const dec = h("div", { class: "icons", role: "group", "aria-label": "Decoration" });
    for (const [v, t, st] of [["none", "None", ""], ["underline", "Underline", "text-decoration:underline"], ["line-through", "Strike", "text-decoration:line-through"]]) dec.append(h("button", { class: "ib", "aria-pressed": String((getP("text-decoration-line") || comp("text-decoration-line")) === v), text: t, style: `font-size:12px;${st}`, onclick: () => setP("text-decoration-line", v === "none" ? "" : v) }));
    T.append(wt, h("div", { class: "g2" }, al, cs), it, dec, color("Text color", "color"));
    p.append(T);
    p.append(h("div", { class: "sec" }, h("h4", { text: "Fill" }), color("Background", "background-color")));
    const bs = getP("border-style") || comp("border-style");
    p.append(h("div", { class: "sec" }, h("h4", { text: "Border" }), h("div", { class: "g2" }, num("Border width", "border-width", "W"), num("Radius", "border-radius", "R")), h("div", { class: "row3" }, h("span", { class: "lbl2", text: "Style" }), pick({ solid: "Solid", dashed: "Dashed", dotted: "Dotted", none: "None" }[bs] || "Solid", [["solid", "Solid"], ["dashed", "Dashed"], ["dotted", "Dotted"], ["none", "None"]].map(([v, t]) => [t, () => setP("border-style", v), v === bs]))), color("Border color", "border-color")));
    const fx = h("div", { class: "icons", role: "group", "aria-label": "Shadow" });
    for (const [v, t] of [["none", "None"], ["0 1px 3px rgba(0,0,0,.12)", "Soft"], ["0 12px 32px -12px rgba(0,0,0,.35)", "Lift"]]) fx.append(h("button", { class: "ib", "aria-pressed": String(getP("box-shadow") === v), text: t, style: "font-size:12px", onclick: () => setP("box-shadow", v) }));
    p.append(effectsSec(fx));
    p.append(transformSec(), stylesSec(), transitionSec());
  }
  /** A section that opens and closes, open by itself when it holds a value. */
  function fold(title, props, body) {
    const has = props.some((x) => getP(x));
    const open = has || S.open.has(title);
    const sec = h("div", { class: "sec" });
    const btn = h("button", { class: "fold", "aria-expanded": String(open), onclick: () => { open ? S.open.delete(title) : S.open.add(title); panel(); } }, h("h4", { text: title }), h("span", { class: "ib", html: SVG(open ? P.x : P.plus, 13), "aria-hidden": "true" }));
    sec.append(btn);
    if (open) sec.append(...body());
    return sec;
  }
  /** Width and height as Framer sets them: a fixed size, part of the space (%), all of it, or as big as the content. */
  function sizeSec() {
    const el = live(S.sel);
    const sizeRow = (label, prop, key) => {
      const v = getP(prop);
      const mode = !v || v === "auto" ? "auto" : v === "100%" && getP("align-self") === "stretch" ? "fill" : /%$/.test(v) ? "rel" : /content$/.test(v) ? "fit" : "fixed";
      const MODES = [["auto", "Auto"], ["fixed", "Fixed"], ["rel", "Relative"], ["fill", "Fill"], ["fit", "Fit content"]];
      const go = (m) => {
        const r = el?.getBoundingClientRect();
        const pr = el?.parentElement?.getBoundingClientRect();
        const px = r ? Math.round(prop === "width" ? r.width : r.height) : 0;
        const whole = pr ? (prop === "width" ? pr.width : pr.height) : 0;
        if (m === "auto") setMany([[prop, ""], ["align-self", ""]]);
        else if (m === "fixed") setMany([[prop, `${px || 100}px`], ["align-self", ""]]);
        else if (m === "rel") setMany([[prop, `${whole ? Math.max(1, Math.min(100, Math.round((px / whole) * 100))) : 50}%`], ["align-self", ""]]);
        else if (m === "fill") setMany([[prop, "100%"], ["align-self", "stretch"]]);
        else setMany([[prop, "fit-content"], ["align-self", ""]]);
      };
      return h("div", { class: "row3" }, mode === "fill" || mode === "fit" || mode === "auto" ? h("span", { class: "lbl2", text: label }) : num(label, prop, key), pick(MODES.find(([m]) => m === mode)?.[1] || "Auto", MODES.map(([m, t]) => [t, () => go(m), m === mode])));
    };
    return h("div", { class: "sec" }, h("h4", { text: "Size" }), sizeRow("Width", "width", "W"), sizeRow("Height", "height", "H"), h("div", { class: "g2" }, num("Min width", "min-width", "Min W"), num("Max width", "max-width", "Max W")), h("div", { class: "g2" }, num("Min height", "min-height", "Min H"), num("Max height", "max-height", "Max H")));
  }
  /** Position: in the flow, nudged, pinned in its box, fixed on the screen, or sticky while it scrolls. */
  function positionSec() {
    const pos = getP("position") || "static";
    const TYPES = [["static", "Default"], ["relative", "Relative"], ["absolute", "Absolute"], ["sticky", "Sticky"], ["fixed", "Fixed"]];
    return fold("Position", ["position", "top", "left", "z-index"], () => [
      h("div", { class: "row3" }, h("span", { class: "lbl2", text: "Type" }), pick(TYPES.find(([v]) => v === pos)?.[1] || "Default", TYPES.map(([v, t]) => [t, () => setP("position", v === "static" ? "" : v), v === pos]))),
      ...(pos === "static" ? [] : [h("div", { class: "cross" }, h("span"), num("Top", "top", "T"), h("span"), num("Left", "left", "L"), h("span", { class: "c" }), num("Right", "right", "R"), h("span"), num("Bottom", "bottom", "B"), h("span"))]),
      h("div", { class: "g2" }, num("Z index", "z-index", "Z")),
    ]);
  }
  function effectsSec(fx) {
    const sh = getP("box-shadow");
    const m = /^(-?[\d.]+)px (-?[\d.]+)px ([\d.]+)px (-?[\d.]+)px (.+)$/.exec(sh);
    const part = (i, label, key) => {
      const inp = h("input", { "aria-label": label, value: m ? m[i] : "", placeholder: ["", "0", "4", "12", "0"][i] });
      inp.addEventListener("change", () => { const v = [1, 2, 3, 4].map((k) => (k === i ? inp.value.trim() || "0" : m ? m[k] : ["", "0", "4", "12", "0"][k])); setP("box-shadow", `${v[0]}px ${v[1]}px ${v[2]}px ${v[3]}px ${m ? m[5] : "rgba(0,0,0,.18)"}`); });
      return h("label", { class: "num" }, h("span", { class: "k", text: key }), inp);
    };
    const blurOf = (prop) => (/blur\(([\d.]+)px\)/.exec(getP(prop)) || [])[1] || "";
    const blur = (label, prop, key) => { const i = h("input", { "aria-label": label, value: blurOf(prop), placeholder: "0" }); i.addEventListener("change", () => setP(prop, Number(i.value) > 0 ? `blur(${Number(i.value)}px)` : "")); return h("label", { class: "num" }, h("span", { class: "k", text: key }), i); };
    return h("div", { class: "sec" }, h("h4", { text: "Effects" }), fx, h("div", { class: "g2" }, part(1, "Shadow X", "X"), part(2, "Shadow Y", "Y")), h("div", { class: "g2" }, part(3, "Shadow blur", "B"), part(4, "Shadow spread", "S")), h("div", { class: "g2" }, blur("Blur", "filter", "Blur"), blur("Background blur", "backdrop-filter", "BG")));
  }
  /** Transforms: turn, size and move it, without moving what's around it. */
  function transformSec() {
    const tr = (getP("translate") || "").split(/\s+/);
    const tx = (i, label, key) => { const inp = h("input", { "aria-label": label, value: (tr[i] || "").replace(/px$/, ""), placeholder: "0" }); inp.addEventListener("change", () => { const v = [0, 1].map((k) => (k === i ? unit(inp.value || "0") : tr[k] || "0px")); setP("translate", v.every((x) => /^0(px)?$/.test(x)) ? "" : v.join(" ")); }); return h("label", { class: "num" }, h("span", { class: "k", text: key }), inp); };
    const deg = h("input", { "aria-label": "Rotate", value: (getP("rotate") || "").replace(/deg$/, ""), placeholder: "0" });
    deg.addEventListener("change", () => setP("rotate", Number(deg.value) ? `${Number(deg.value)}deg` : ""));
    const sc = h("input", { "aria-label": "Scale", value: getP("scale"), placeholder: "1" });
    sc.addEventListener("change", () => setP("scale", sc.value && Number(sc.value) !== 1 ? String(Number(sc.value)) : ""));
    return fold("Transforms", ["rotate", "scale", "translate"], () => [h("div", { class: "g2" }, h("label", { class: "num" }, h("span", { class: "k", text: "R" }), deg), h("label", { class: "num" }, h("span", { class: "k", text: "S" }), sc)), h("div", { class: "g2" }, tx(0, "Move X", "X"), tx(1, "Move Y", "Y"))]);
  }
  /** Styles: how see-through it is, which sits on top, and the pointer over it. */
  function stylesSec() {
    const op = getP("opacity") || "1";
    const r = h("input", { type: "range", min: "0", max: "1", step: "0.05", value: op, "aria-label": "Opacity" });
    r.addEventListener("change", () => setP("opacity", Number(r.value) >= 1 ? "" : r.value));
    const cur = getP("cursor") || "auto";
    const CURSORS = [["auto", "Auto"], ["pointer", "Pointer"], ["text", "Text"], ["grab", "Grab"], ["help", "Help"], ["not-allowed", "Not allowed"]];
    return h("div", { class: "sec" }, h("h4", { text: "Styles" }), h("div", { class: "slide" }, num("Opacity", "opacity", "O"), r), h("div", { class: "row3" }, h("span", { class: "lbl2", text: "Cursor" }), pick(CURSORS.find(([v]) => v === cur)?.[1] || "Auto", CURSORS.map(([v, t]) => [t, () => setP("cursor", v === "auto" ? "" : v), v === cur]))));
  }
  /** Transition: how changes (a hover, a focus) ease in. */
  function transitionSec() {
    const t = getP("transition");
    const m = /^all (\d+)ms (.+)$/.exec(t);
    const ms = m ? m[1] : "";
    const EASE = [["cubic-bezier(.22,1,.36,1)", "Ease out"], ["ease-in-out", "Ease in and out"], ["linear", "Linear"], ["cubic-bezier(.34,1.56,.64,1)", "Spring"]];
    const ez = m ? m[2] : EASE[0][0];
    const d = h("input", { "aria-label": "Duration in ms", value: ms, placeholder: "200" });
    d.addEventListener("change", () => setP("transition", Number(d.value) > 0 ? `all ${Math.round(Number(d.value))}ms ${ez}` : ""));
    return fold("Transition", ["transition"], () => [h("div", { class: "row3" }, h("label", { class: "num" }, h("span", { class: "k", text: "ms" }), d), pick(EASE.find(([v]) => v === ez)?.[1] || "Ease out", EASE.map(([v, tt]) => [tt, () => setP("transition", `all ${ms || 200}ms ${v}`), v === ez])))]);
  }
  function num(label, prop, key) {
    const raw = prop === "opacity" || prop === "line-height";
    const i = h("input", { "aria-label": label, value: getP(prop).replace(/px$/, ""), placeholder: short(comp(prop)).replace(/px$/, "") });
    i.addEventListener("change", () => setP(prop, raw ? i.value.trim() : unit(i.value)));
    const k = h("span", { class: "k", title: label, text: key, draggable: "false" });
    // Drag the letter to change the number.
    k.addEventListener("pointerdown", (e) => {
      e.preventDefault();
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
    B.append(txt("Label", "data-cl-label"), txt("Field key", "data-cl-name"));
    const req = bl.hasAttribute("data-cl-required");
    // Pictures, videos and worked-out numbers take no answer, so nothing is required of them.
    if (!["image", "video", "calc", "payment", "result", "hidden"].includes(type)) B.append(h("div", { class: "row2" }, h("span", { class: "lbl", text: "Required" }), h("div", {}, h("button", { class: "sw", role: "switch", "aria-checked": String(req), "aria-label": "Required", onclick: () => { snap(); req ? bl.removeAttribute("data-cl-required") : bl.setAttribute("data-cl-required", ""); commit(); } }))));
    if (type === "phone" || type === "country") {
      const sv = bl.getAttribute("data-cl-save") || "";
      const opts = [["", "None"], [type, type === "phone" ? "Phone" : "Country"]];
      B.append(h("div", { class: "row2" }, h("span", { class: "lbl", text: "Contact field" }), pick((opts.find((o) => o[0] === sv) || opts[0])[1], opts.map(([v, t]) => [t, () => { snap(); v ? bl.setAttribute("data-cl-save", v) : bl.removeAttribute("data-cl-save"); commit(); }, v === sv]))));
    }
    if (type === "file") {
      const kinds = (bl.getAttribute("data-cl-kinds") || "pdf image office").split(/\s+/);
      const k = h("div", { class: "icons", role: "group", "aria-label": "File kinds" });
      for (const [v, t] of [["pdf", "PDF"], ["image", "Images"], ["office", "Office"]]) k.append(h("button", { class: "ib", "aria-pressed": String(kinds.includes(v)), text: t, style: "font-size:12px", onclick: () => { const next = kinds.includes(v) ? kinds.filter((x) => x !== v) : [...kinds, v]; if (!next.length) return; snap(); bl.setAttribute("data-cl-kinds", next.join(" ")); commit(); } }));
      const mb = h("input", { class: "in", value: bl.getAttribute("data-cl-max") || "", placeholder: "10", "aria-label": "Largest file in MB" });
      mb.addEventListener("change", () => { const n = Math.round(Number(mb.value)); snap(); n > 0 ? bl.setAttribute("data-cl-max", String(Math.min(n, 20))) : bl.removeAttribute("data-cl-max"); commit(); });
      B.append(h("div", { class: "row2" }, h("span", { class: "lbl", text: "File types" }), k), h("div", { class: "row2" }, h("span", { class: "lbl", text: "Max size (MB)" }), mb));
    }
    if (type === "rating") {
      const sc = h("input", { class: "in", value: bl.getAttribute("data-cl-scale") || "", placeholder: "5", "aria-label": "Scale" });
      sc.addEventListener("change", () => { const n = Math.round(Number(sc.value)); snap(); n >= 3 ? bl.setAttribute("data-cl-scale", String(Math.min(n, 10))) : bl.removeAttribute("data-cl-scale"); commit(); });
      const sty = bl.getAttribute("data-cl-style") || "stars";
      const STY = [["stars", "Stars"], ["numbers", "Numbers"], ["faces", "Smileys"], ["thumbs", "Thumbs up or down"]];
      if (sty !== "faces" && sty !== "thumbs") B.append(h("div", { class: "row2" }, h("span", { class: "lbl", text: "Scale" }), sc));
      B.append(h("div", { class: "row2" }, h("span", { class: "lbl", text: "Display" }), pick(STY.find(([v]) => v === sty)?.[1] || "Stars", STY.map(([v, t]) => [t, () => { snap(); v === "stars" ? bl.removeAttribute("data-cl-style") : bl.setAttribute("data-cl-style", v); if (v !== "numbers") bl.removeAttribute("data-cl-zero"); commit(); }, v === sty]))));
      if (sty === "numbers") {
        B.append(swRow("Start at 0", bl.hasAttribute("data-cl-zero"), (on) => (on ? bl.setAttribute("data-cl-zero", "") : bl.removeAttribute("data-cl-zero"))));
        B.append(textRow("Low label", bl.getAttribute("data-cl-low"), (v) => (v ? bl.setAttribute("data-cl-low", v) : bl.removeAttribute("data-cl-low")), "Not likely"), textRow("High label", bl.getAttribute("data-cl-high"), (v) => (v ? bl.setAttribute("data-cl-high", v) : bl.removeAttribute("data-cl-high")), "Very likely"));
      }
    }
    if (type === "file") B.append(swRow("Open the camera on phones", bl.hasAttribute("data-cl-capture"), (on) => (on ? bl.setAttribute("data-cl-capture", "") : bl.removeAttribute("data-cl-capture"))));
    if (type === "phone") B.append(swRow("Verify with a code", bl.hasAttribute("data-cl-verify"), (on) => (on ? bl.setAttribute("data-cl-verify", "") : bl.removeAttribute("data-cl-verify"))));
    if (type === "address") B.append(swRow("Suggest addresses", bl.hasAttribute("data-cl-auto"), (on) => (on ? bl.setAttribute("data-cl-auto", "") : bl.removeAttribute("data-cl-auto"))));
    p.append(B);
    blockMore(p, bl, type);
  }
  function settings(p, el) {
    // A block picked by its box (the box Add writes around it) opens the block's settings.
    const inner = el.querySelectorAll?.("[data-cl-field]");
    const bl = el.closest?.("[data-cl-field]") || (inner?.length === 1 && namesIn(el).size <= 1 && !el.matches("form,[data-cl-step]") ? inner[0] : null);
    if (bl) return blockSettings(p, bl);
    const input = el.matches("input,textarea,select") ? el : el.querySelector("input[name],textarea[name],select[name]") || el.closest("label")?.querySelector("input[name],textarea[name],select[name]");
    if (input?.name) questionSettings(p, input);
    if (!input?.name && leaf(el) && !el.matches("button,a,option")) textSettings(p, el);
    // Width in the form's two-column grid: the whole row, or half of it beside the next field.
    const q = (input || el).closest?.(".q");
    if (q?.parentElement?.matches(".fields")) {
      const half = q.classList.contains("half");
      p.append(h("div", { class: "sec" }, h("div", { class: "row2" }, h("span", { class: "lbl", text: "Width" }), h("div", { class: "seg" },
        h("button", { "aria-pressed": String(!half), text: "Full", onclick: () => { if (!half) return; snap(); q.classList.remove("half"); commit(); } }),
        h("button", { "aria-pressed": String(half), text: "Half", onclick: () => { if (half) return; snap(); q.classList.add("half"); commit(); } })))));
    }
    // Show if, with pickers. A page that a jump skips keeps its own condition apart (data-cl-own).
    const C = h("div", { class: "sec" }, h("h4", { text: "Display condition" }));
    const IF = el.hasAttribute("data-cl-own") ? "data-cl-own" : "data-cl-show-if";
    const raw = el.getAttribute(IF) || "";
    const qs = questions().filter((q) => !el.contains(src.querySelector(`[name="${CSS.escape(q.name)}"]`)));
    if (!raw) {
      C.append(h("div", {}, h("button", { class: "pill", html: `${SVG(P.plus, 14)}Add display condition`, disabled: !qs.length || null, onclick: () => { const q = qs[0]; snap(); el.setAttribute(IF, q.options[0] ? `${q.name} == '${q.options[0].value}'` : `${q.name} filled`); commit(); } })));
    } else {
      const m = /^([\w-]+)\s*(==|!=|>=|<=|>|<)\s*'([^']*)'$/.exec(raw) || /^([\w-]+)\s+(filled)$/.exec(raw) || /^([\w-]+)\s+(within)\s+(\d+)\s+days$/.exec(raw);
      if (!m) C.append(h("p", { class: "hint0", text: raw }));
      const [q0, op0, v0] = m ? [m[1], m[2], m[3] ?? ""] : ["", "==", ""];
      const write = (q, op, v) => { snap(); el.setAttribute(IF, op === "filled" ? `${q} filled` : op === "within" ? `${q} within ${Math.max(1, Math.round(Number(v)) || 30)} days` : `${q} ${op} '${v}'`); commit(); };
      const q = qs.find((x) => x.name === q0);
      // What the question holds decides the rules: a choice, a date, a number, or words.
      const kindOf = (n) => { const x = src.querySelector(`[name="${CSS.escape(n)}"]`); const t = x?.getAttribute("type") || ""; return qs.find((y) => y.name === n)?.options.length ? "choice" : /^(date|datetime-local|month)$/.test(t) ? "date" : /^(number|range)$/.test(t) ? "number" : "text"; };
      const kind = q0 ? kindOf(q0) : "choice";
      const today = new Date().toISOString().slice(0, 10);
      const OPS = kind === "date" ? [["<", "is before"], [">", "is after"], ["within", "is within the next"], ["filled", "is answered"]] : kind === "number" ? [["==", "is"], [">", "is over"], ["<", "is under"], ["filled", "is answered"]] : [["==", "is"], ["!=", "is not"], ["filled", "is answered"]];
      const first = (k) => (k === "date" ? today : k === "number" ? "10" : "");
      const valueBox = () => {
        if (op0 === "filled") return h("span");
        if (kind === "choice") return pick(q?.options.find((o) => o.value === v0)?.label || v0 || "Pick", (q?.options || []).map((o) => [o.label, () => write(q0, op0, o.value), o.value === v0]));
        const i = h("input", { class: "in", type: op0 === "within" ? "number" : kind === "date" ? "date" : kind === "number" ? "number" : "text", value: v0, "aria-label": "Value", style: "width:auto;min-width:0;flex:1" });
        i.addEventListener("change", () => write(q0, op0, i.value.trim()));
        return op0 === "within" ? h("span", { style: "display:flex;gap:6px;align-items:center;min-width:0;flex:1" }, i, h("span", { text: "days" })) : i;
      };
      C.append(h("div", { class: "cond" },
        pick(q0 || "Pick", qs.map((x) => [x.name, () => { const k = kindOf(x.name); write(x.name, k === "choice" ? "==" : k === "date" ? "<" : "filled", k === "choice" ? x.options[0]?.value || "" : first(k)); }, x.name === q0])),
        pick(OPS.find(([o]) => o === op0)?.[1] || op0, OPS.map(([o, t]) => [t, () => write(q0, o, o === "within" ? "30" : o === "filled" ? "" : kind === "choice" ? v0 || q?.options[0]?.value || "" : v0 && op0 !== "within" ? v0 : first(kind)), o === op0])),
        valueBox(),
        h("button", { class: "ib", "aria-label": "Remove the condition", html: SVG(P.x, 14), onclick: () => { snap(); el.removeAttribute(IF); commit(); } })));
    }
    p.append(C);
  }

  // ── The no-code builder (docs/studio-v2-plan.md, Part 9): Add, "/", drag onto the form, change type, jumps, answers
  // in text and the Form tab. Questions are written in the page's own classes (src/lib/studio/builder.ts).
  const TI = (t) => P[{ phone: "qphone", text: "qtext", name: "qname", social: "link", language: "globe", timezone: "time", pattern: "short", rich: "long", multiselect: "checks", longlist: "search", dependent: "dropdown", pictures: "image", faces: "face", thumbs: "thumb", semantic: "scale", sum: "pie", unit: "number", range: "slider", amount: "currency", products: "cart", duration: "time", availability: "cal", record: "mic", draw: "brush", location: "pin", map: "mapi", quiz: "quizi", score: "nps", group: "dup", table: "grid", meeting: "cal", member: "qname", picture: "image", video: "play" }[t] || t] || P.plus;
  const CONTROLS = "input[name]:not([type=hidden]):not([type=submit]),textarea[name],select[name],[data-cl-field][data-cl-name]";
  const nameIn = (el) => el.getAttribute("name") || el.getAttribute("data-cl-name") || "";
  const namesIn = (el) => new Set([...(el.matches?.(CONTROLS) ? [el] : []), ...el.querySelectorAll(CONTROLS)].map(nameIn).filter(Boolean));
  const allNames = () => namesIn(src);
  const isList = (el) => !el || el === src || el.matches?.("form,[data-cl-step],[data-cl-thanks]");
  /**
   * The question around an element: the smallest box that holds its answer and its label (or its legend), so a page
   * with one question still finds the question, not the list it's in. A picked heading or text is itself.
   */
  function qOf(el) {
    if (!el || el === src) return null;
    if (namesIn(el).size > 1) return el;
    let ctl = el.matches?.(CONTROLS) ? el : el.querySelector?.(CONTROLS);
    if (!ctl) { let a = el; while (a.parentElement && !isList(a.parentElement) && namesIn(a).size === 0) a = a.parentElement; if (namesIn(a).size === 1) ctl = a.matches(CONTROLS) ? a : a.querySelector(CONTROLS); }
    if (!ctl) return el;
    const need = [];
    if (ctl.id) { const l = src.querySelector(`label[for="${CSS.escape(ctl.id)}"]`); if (l) need.push(l); }
    const fs = ctl.closest("fieldset"); if (fs && namesIn(fs).size === 1) need.push(fs);
    const wrapL = ctl.closest("label"); if (wrapL) need.push(wrapL);
    let p = ctl;
    while (p.parentElement && !isList(p.parentElement) && !need.every((x) => p.contains(x))) p = p.parentElement;
    // A choice's own label holds only one option: the question is the box with all of them.
    if (ctl.type === "radio" || ctl.type === "checkbox") while (p.parentElement && !isList(p.parentElement) && namesIn(p.parentElement).size === 1 && [...src.querySelectorAll(`[name="${CSS.escape(nameIn(ctl))}"]`)].some((x) => !p.contains(x))) p = p.parentElement;
    // A box with no label of its own (a block, a placeholder-only input) takes its small wrapper.
    if (p === ctl && p.parentElement && !isList(p.parentElement) && namesIn(p.parentElement).size === 1 && p.parentElement.children.length <= 3) p = p.parentElement;
    if (!el.contains(p) && !p.contains(el)) return el;
    return p.contains(el) ? p : el;
  }
  /** The last part of a question that sits loose in its list (its label, its box, then its error line): the error line. */
  function endOf(q) {
    const c = q.matches?.(CONTROLS) ? q : q.querySelector?.(CONTROLS);
    const er = c && src.querySelector(`[data-cl-error-for="${CSS.escape(nameIn(c))}"]`);
    return er && er.parentElement === q.parentElement && q.compareDocumentPosition(er) & Node.DOCUMENT_POSITION_FOLLOWING ? er : q;
  }
  /** The first part of a loose question: its label, when the label sits just before it. */
  function startOf(q) {
    const c = q.matches?.(CONTROLS) ? q : q.querySelector?.(CONTROLS);
    const l = c?.id && src.querySelector(`label[for="${CSS.escape(c.id)}"]`);
    return l && l.parentElement === q.parentElement && !q.contains(l) && l.compareDocumentPosition(q) & Node.DOCUMENT_POSITION_FOLLOWING ? l : q;
  }
  /** A picked question's kind in the words of the Add list: Dropdown, Choice, Short answer. */
  function questionKind(el) {
    if (!el || el === src || el.matches?.(CONTROLS) || namesIn(el).size !== 1) return "";
    const c = el.querySelector(CONTROLS);
    if (!c || qOf(c) !== el) return "";
    if (c.hasAttribute("data-cl-field")) return BLOCK_NAMES[c.getAttribute("data-cl-field")] || "Block";
    if (c.tagName === "SELECT") return "Dropdown";
    if (c.tagName === "TEXTAREA") return "Long answer";
    const n = el.querySelectorAll(`[name="${CSS.escape(nameIn(c))}"]`).length;
    return { radio: "Choice", checkbox: n > 1 ? "Checkboxes" : "Agreement", email: "Email", tel: "Phone", number: "Number", date: "Date", time: "Time", url: "Website", range: "Slider", month: "Month", "datetime-local": "Date and time", color: "Color picker" }[c.type] || "Short answer";
  }
  /** Where a new question goes: after the picked question, else after the last question of the page in view. */
  function spot() {
    const picked = S.sel ? byK(S.sel) : null;
    // A picked section takes the new field inside it.
    const section = picked?.closest?.("[data-cl-section]");
    if (section && section === picked) return { into: section };
    const pq = picked && !isList(picked) ? qOf(picked) : null;
    if (pq && pq !== src.firstElementChild && pq.closest("form,[data-cl-step]")) return { after: endOf(pq) };
    const steps = stepsIn(src);
    const scope = (typeof S.view === "number" && steps[S.view]) || src.querySelector("form") || src.firstElementChild || src;
    const qs = [...scope.querySelectorAll(CONTROLS)].map(qOf).filter(Boolean);
    if (qs.length) return { after: endOf(qs.at(-1)) };
    const btn = scope.querySelector("[type=submit],[data-cl-next]");
    if (btn) { let b = btn; while (b.parentElement && b.parentElement !== scope && !isList(b.parentElement)) b = b.parentElement; return { before: b }; }
    return { into: scope };
  }
  /** The page's own class names for a question's parts, read from a question it already has. */
  function classMap() {
    const map = {};
    const text = src.querySelector("input[type=text][name],input[type=email][name],textarea[name]");
    const tq = text && qOf(text);
    // A page whose questions sit loose (label, box, error line) gets a plain box around a new one.
    map.q = "";
    if (tq && tq !== text && tq.querySelector("label,legend")) {
      map.q = tq.className;
        const lab = tq.querySelector("label,legend"); if (lab?.className) map.label = lab.className;
    }
    if (text?.className) map.field = text.className;
    const fl = text?.id && src.querySelector(`label[for="${CSS.escape(text.id)}"]`); if (fl?.className && !map.label) map.label = fl.className;
    const ch = src.querySelector("label > input[type=radio], label > input[type=checkbox]")?.parentElement;
    if (ch?.classList[0]) map.choice = ch.classList[0];
    if (ch?.parentElement?.className && ch.parentElement.tagName !== "FIELDSET") map.choices = ch.parentElement.className;
    const er = src.querySelector("[data-cl-error-for]"); if (er?.className) map.error = er.className;
    const hd = src.querySelector("h2,h3"); if (hd?.className) map.heading = hd.className;
    const tx = src.querySelector("p.text,p"); if (tx?.className && !tx.hasAttribute("data-cl-error-for")) map.text = tx.className;
    return map;
  }
  function addQuestion(type, where) {
    if (!built() && !startBlank(true)) return;
    if (S.mode !== "edit") setMode("edit");
    const taken = allNames();
    const name = isLayout(type) ? "" : uniqueName(baseName(type), taken);
    const save = SAVES[type] && !src.querySelector(`[data-cl-save="${SAVES[type]}"]`) ? SAVES[type] : undefined;
    // Workspace lists: the meeting types and the people who take meetings, as they are now.
    const options = type === "meeting" ? MEETINGS.map((m) => m.name) : type === "member" ? PEOPLE : undefined;
    const parent = type === "dependent" ? uniqueName("category", taken) : undefined;
    const frag = clean(questionHtml(type, name, { save, options, parent }));
    const map = classMap();
    frag.querySelectorAll("[class]").forEach((el) => { const next = el.className.split(/\s+/).map((c) => (c in map ? map[c] : c)).filter(Boolean).join(" "); next ? (el.className = next) : el.removeAttribute("class"); });
    const nodes = [...frag.children];
    const node = nodes.at(-1);
    if (!node) return;
    snap();
    for (const n of nodes) [n, ...n.querySelectorAll("*")].forEach((x) => x.setAttribute("data-k", String(++kSeq)));
    const at = where || spot();
    if (at.after) at.after.after(...nodes); else if (at.before) at.before.before(...nodes); else at.into.append(...nodes);
    ensureIds();
    // A group of choices on a page whose style never mentions one: no browser frame around it.
    if (node.matches("fieldset") && !/fieldset/i.test(`${body().css}\n${brandOf(cur)?.css || ""}`)) { const r = rules(); r.fieldset = { border: "0", margin: "0", padding: "0", "min-width": "0" }; r.legend = { padding: "0" }; writeRules(r); }
    S.sel = node.getAttribute("data-k");
    S.ptab = "settings";
    commit();
    toast(`${QNAME[type]} added`);
    requestAnimationFrame(() => live(S.sel)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  }
  function addsUi() {
    const list = $("addList"); list.innerHTML = "";
    const f = $("addQ").value.trim().toLowerCase();
    for (const [g, xs] of QGROUPS) {
      const shown = xs.filter(([, n]) => !f || n.toLowerCase().includes(f));
      if (!shown.length) continue;
      list.append(h("div", { class: "ag", text: g }));
      for (const [t, n] of shown) {
        const b = h("button", { draggable: "true", "data-add": t, title: "Click to add, or drag onto the form", html: `<i>${SVG(TI(t), 13)}</i><span class="nm"></span>`, onclick: () => addQuestion(t) });
        b.querySelector(".nm").textContent = n;
        b.addEventListener("dragstart", (e) => { dragType = t; e.dataTransfer.effectAllowed = "copy"; try { e.dataTransfer.setData("text/plain", t); } catch {} });
        b.addEventListener("dragend", () => { dragType = null; $("dropl").hidden = true; });
        list.append(b);
      }
    }
  }
  $("addQ").addEventListener("input", addsUi);
  addsUi();
  /** The type list as a menu with a search box: "/" on the form opens it. */
  function typeMenu(anchor, onPick) {
    const q = h("input", { class: "in", placeholder: "Search fields", "aria-label": "Search fields", style: "margin:4px 4px 6px;width:calc(100% - 8px)" });
    const box = h("div", {});
    const fill = () => {
      box.innerHTML = "";
      const f = q.value.trim().toLowerCase();
      for (const [g, xs] of QGROUPS) {
        const shown = xs.filter(([, n]) => !f || n.toLowerCase().includes(f));
        if (!shown.length) continue;
        box.append(h("div", { class: "mh", text: g }));
        for (const [t, n] of shown) { const b = h("button", { class: "mi small", role: "menuitem", html: `${SVG(TI(t), 14)}<span class="nm"></span>`, onclick: () => { closeMenu(); onPick(t); } }); b.querySelector(".nm").textContent = n; box.append(b); }
      }
    };
    q.addEventListener("input", fill);
    q.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); box.querySelector(".mi")?.click(); } if (e.key === "Escape") closeMenu(); });
    fill();
    openMenu(anchor, [q, box], 260);
    setTimeout(() => q.focus(), 0);
  }
  listen(document, "keydown", (e) => {
    if (!alive || S.mode !== "edit" || e.key !== "/" || editingK || e.metaKey || e.ctrlKey) return;
    const t = e.composedPath()[0];
    // A box on the form in Edit only holds focus from the click that picked it: "/" still opens the list there.
    if ((t?.closest?.("input,textarea,[contenteditable]") && !(root.contains(t) && !t.isContentEditable)) || menuEl) return;
    e.preventDefault();
    typeMenu(S.sel && live(S.sel) && !$("fbar").hidden ? $("fbar") : $("canvas"), (type) => addQuestion(type));
  });
  // Drag a type from Add onto the form: a line shows where it lands.
  let dragType = null, dropAt = null;
  const dropTarget = (e) => {
    const el = kOf(e); const sk = el && byK(el.getAttribute("data-k"));
    const q = sk && !isList(sk) ? qOf(sk) : null;
    if (!q || q === src.firstElementChild) return null;
    const lv = live(q.getAttribute("data-k")); if (!lv) return null;
    const r = lv.getBoundingClientRect();
    return { q, lv, before: e.clientY < r.top + r.height / 2, first: startOf(q), last: endOf(q) };
  };
  root.addEventListener("dragover", (e) => {
    if (!dragType || S.mode !== "edit") return;
    e.preventDefault();
    dropAt = dropTarget(e);
    const line = $("dropl");
    if (!dropAt) { line.hidden = true; return; }
    const f = $("frame").getBoundingClientRect(), r = dropAt.lv.getBoundingClientRect();
    Object.assign(line.style, { left: `${r.left - f.left}px`, width: `${r.width}px`, top: `${(dropAt.before ? r.top : r.bottom) - f.top - 2}px` });
    line.hidden = false;
  });
  root.addEventListener("drop", (e) => {
    if (!dragType) return;
    e.preventDefault();
    const t = dragType, at = dropAt; dragType = null; dropAt = null; $("dropl").hidden = true;
    addQuestion(t, at ? (at.before ? { before: at.first } : { after: at.last }) : undefined);
  });
  root.addEventListener("dragleave", (e) => { if (!e.relatedTarget) $("dropl").hidden = true; });

  // Change type: a text box into another kind of text box, a pick into another kind of pick; the answer's name stays.
  function kindsOf(el) {
    const q = el && !isList(el) ? qOf(el) : null;
    if (!q) return null;
    const c = q.matches(CONTROLS) ? q : q.querySelector("input[name]:not([type=hidden]),textarea[name],select[name]");
    if (!c || c.closest("[data-cl-field]")) return null;
    if (c.type === "checkbox" && q.querySelectorAll(`input[name="${CSS.escape(c.name)}"]`).length < 2) return null;
    if (c.tagName === "SELECT" || c.type === "radio" || c.type === "checkbox") return { q, c, now: c.tagName === "SELECT" ? "select" : c.type, list: PICK_KINDS };
    if (c.tagName === "TEXTAREA" || ["text", "email", "tel", "number", "url"].includes(c.type)) return { q, c, now: c.tagName === "TEXTAREA" ? "textarea" : c.type, list: TEXT_KINDS };
    return null;
  }
  function typeChangeMenu(anchor) {
    const k = kindsOf(byK(S.sel)); if (!k) return;
    openMenu(anchor, k.list.map(([v, t]) => h("button", { class: "mi small", role: "menuitemradio", "aria-checked": String(v === k.now), text: t, onclick: () => { closeMenu(); if (v !== k.now) changeType(k, v); } })), 200);
  }
  function changeType(k, to) {
    snap();
    const { q, c } = k;
    const copy = (from, toEl) => { for (const a of [...from.attributes]) if (!["type", "rows", "inputmode", "autocomplete"].includes(a.name)) toEl.setAttribute(a.name, a.value); };
    if (k.list === TEXT_KINDS) {
      let el = c;
      if ((to === "textarea") !== (c.tagName === "TEXTAREA")) { el = document.createElement(to === "textarea" ? "textarea" : "input"); copy(c, el); if (to === "textarea") el.setAttribute("rows", "4"); c.replaceWith(el); }
      if (to !== "textarea") { el.setAttribute("type", to); el.removeAttribute("inputmode"); if (to === "number") el.setAttribute("inputmode", "numeric"); if (to === "email") el.setAttribute("autocomplete", "email"); if (to === "tel") el.setAttribute("autocomplete", "tel"); }
      if (to !== "email" && el.getAttribute("data-cl-save") === "email") el.removeAttribute("data-cl-save");
    } else {
      const name = nameIn(c);
      const opts = c.tagName === "SELECT" ? [...c.options].filter((o) => o.value).map((o) => [o.value, o.textContent.trim()]) : [...q.querySelectorAll(`input[name="${CSS.escape(name)}"]`)].map((i) => [i.value, (i.closest("label")?.textContent || i.value).trim()]);
      const first = c.tagName === "SELECT" ? c : q.querySelector(`input[name="${CSS.escape(name)}"]`);
      const keep = ["data-cl-id", "data-cl-key", "data-cl-save", "required"].map((a) => [a, first.getAttribute(a)]).filter(([, v]) => v !== null);
      const label = (q.querySelector("legend,label.label,label:not(:has(input))")?.textContent || first.getAttribute("data-cl-label") || "").trim();
      const map = classMap();
      if (to === "select") {
        const sel = document.createElement("select"); sel.name = name; sel.id = `q_${name}`; sel.className = map.field || "field";
        sel.append(new Option("Choose one", ""), ...opts.map(([v, t]) => new Option(t, v)));
        keep.forEach(([a, v]) => sel.setAttribute(a, v)); if (label) sel.setAttribute("data-cl-label", label);
        const box = c.tagName === "SELECT" ? c : first.closest("label")?.parentElement;
        box.replaceWith(sel);
      } else if (c.tagName === "SELECT") {
        const box = document.createElement("div"); box.className = map.choices || "choices";
        opts.forEach(([v, t], i) => { const l = document.createElement("label"); l.className = map.choice || "choice"; const inp = document.createElement("input"); inp.type = to; inp.name = name; inp.value = v; if (i === 0) { keep.forEach(([a, x]) => inp.setAttribute(a, x)); if (label) inp.setAttribute("data-cl-label", label); } l.append(inp, ` ${t}`); box.append(l); });
        c.replaceWith(box);
      } else q.querySelectorAll(`input[name="${CSS.escape(name)}"]`).forEach((i) => i.setAttribute("type", to));
      q.querySelectorAll("*").forEach((x) => x.hasAttribute("data-k") || x.setAttribute("data-k", String(++kSeq)));
      if (to !== "checkbox") q.removeAttribute("data-cl-limit");
    }
    [...q.querySelectorAll("*")].forEach((x) => x.hasAttribute("data-k") || x.setAttribute("data-k", String(++kSeq)));
    S.sel = q.getAttribute("data-k");
    commit();
    toast(`Changed to ${[...TEXT_KINDS, ...PICK_KINDS].find(([v]) => v === to)?.[1]}. Responses keep the field key ${nameIn(q.matches(CONTROLS) ? q : q.querySelector(CONTROLS))}.`);
  }

  // Jumps: kept on the question as data-cl-jump (value=>page id); written as show-ifs on the pages they skip.
  const stepId = (st, i) => { if (!st.id) { let id = `page-${i + 1}`; for (let n = 2; src.querySelector(`#${CSS.escape(id)}`); n++) id = `page-${i + 1}-${n}`; st.id = id; } return st.id; };
  function compileJumps() {
    const steps = stepsIn(src);
    if (!steps.length && !src.querySelector("[data-cl-own]")) return;
    steps.forEach(stepId);
    const jumps = [];
    src.querySelectorAll("[data-cl-jump]").forEach((q) => {
      const from = steps.findIndex((st) => st.contains(q));
      const c = q.matches(CONTROLS) ? q : q.querySelector(CONTROLS);
      if (from < 0 || !c) return;
      for (const j of readJumps(q.getAttribute("data-cl-jump"))) { const to = steps.findIndex((st) => st.id === j.to); if (to > from + 1) jumps.push({ name: nameIn(c), value: j.value, from, to }); }
    });
    const own = steps.map((st) => ({ own: st.hasAttribute("data-cl-own") ? st.getAttribute("data-cl-own") : st.getAttribute("data-cl-show-if") || "" }));
    stepShowIfs(own, jumps).forEach((v, i) => {
      const st = steps[i], o = own[i].own;
      if (v !== o) { st.setAttribute("data-cl-own", o); st.setAttribute("data-cl-show-if", v); }
      else { st.removeAttribute("data-cl-own"); o ? st.setAttribute("data-cl-show-if", o) : st.removeAttribute("data-cl-show-if"); }
    });
  }
  // Answers in text: a {name} of one of the form's questions makes the text follow that answer (data-cl-pipe).
  function syncPipes() {
    const names = allNames();
    src.querySelectorAll("h1,h2,h3,h4,h5,h6,p,span,label,legend,b,strong,em,li,div,small").forEach((el) => {
      if (el.children.length) return;
      const t = el.textContent || "";
      const uses = [...t.matchAll(/\{([A-Za-z][\w-]{0,60})\}/g)].some((m) => names.has(m[1]));
      if (uses) el.setAttribute("data-cl-pipe", t); else el.removeAttribute("data-cl-pipe");
    });
  }
  function jumpsSec(p, q, c) {
    const steps = stepsIn(src), from = steps.findIndex((st) => st.contains(q));
    if (from < 0 || from >= steps.length - 2) return;
    steps.forEach(stepId);
    const vals = c.tagName === "SELECT" ? [...c.options].filter((o) => o.value).map((o) => [o.value, o.textContent.trim()]) : [...q.querySelectorAll(`input[name="${CSS.escape(nameIn(c))}"]`)].map((i) => [i.value, (i.closest("label")?.textContent || i.value).trim()]);
    if (!vals.length) return;
    const later = steps.map((st, i) => [st.id, `${i + 1}. ${stepName(st, i)}`, i]).filter(([, , i]) => i > from + 1);
    const js = readJumps(q.getAttribute("data-cl-jump"));
    const write = (next) => { snap(); next.length ? q.setAttribute("data-cl-jump", writeJumps(next)) : q.removeAttribute("data-cl-jump"); commit(); };
    const J = h("div", { class: "sec" }, h("h4", { text: "Page skip rules" }));
    js.forEach((j, i) => {
      const lbl = vals.find(([v]) => v === j.value)?.[1] || j.value;
      const to = later.find(([id]) => id === j.to)?.[1] || "Pick";
      J.append(h("div", { class: "jrow" }, pick(lbl, vals.map(([v, t]) => [t, () => write(js.map((x, k) => (k === i ? { ...x, value: v } : x))), v === j.value])), h("span", { text: "skips to" }), pick(to, later.map(([id, t]) => [t, () => write(js.map((x, k) => (k === i ? { ...x, to: id } : x))), id === j.to])), h("button", { class: "ib", "aria-label": "Remove the rule", html: SVG(P.x, 13), onclick: () => write(js.filter((_, k) => k !== i)) })));
    });
    if (later.length) J.append(h("div", {}, h("button", { class: "pill", html: `${SVG(P.plus, 14)}Add skip rule`, onclick: () => write([...js, { value: vals[0][0], to: later.at(-1)[0] }]) })));
    J.append(h("p", { class: "hint0", text: "Other answers continue to the next page." }));
    p.append(J);
  }
  // ── Question settings (Settings tab): the question's words, its options and its rules, all with pickers ──────
  const sec = (title) => h("div", { class: "sec" }, h("h4", { text: title }));
  const row = (label, ctl) => h("div", { class: "row2" }, h("span", { class: "lbl", text: label }), ctl);
  const swRow = (label, on, flip) => row(label, h("div", {}, h("button", { class: "sw", role: "switch", "aria-checked": String(on), "aria-label": label, onclick: () => { snap(); flip(!on); commit(); } })));
  const textRow = (label, value, set, ph) => { const i = h("input", { class: "in", placeholder: ph || "", "aria-label": label }); i.value = value || ""; i.addEventListener("change", () => { snap(); set(i.value.trim()); commit(); }); return row(label, i); };
  /** The words of a label that may hold its input (a tick box) or an inner span: only the words change. */
  function wordsOf(lab) {
    if (!lab) return { get: () => "", set: () => {} };
    const inner = [...lab.children].find((c) => !c.matches("input,select,textarea") && c.textContent.trim());
    const tn = () => [...lab.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
    return {
      get: () => (inner ? inner.textContent : lab.textContent).trim(),
      set: (t) => { if (inner) inner.textContent = t; else if (tn()) tn().textContent = lab.querySelector("input") ? ` ${t}` : t; else lab.append(lab.querySelector("input") ? ` ${t}` : t); },
    };
  }
  /** The words a question is asked with: its label, its group's legend, or a lone tick box's own words. */
  function questionLabel(input, q) {
    const fs = input.closest("fieldset");
    const legend = fs && q.contains(fs) ? fs.querySelector("legend") : q.querySelector?.("legend");
    const forL = input.id && src.querySelector(`label[for="${CSS.escape(input.id)}"]`);
    const own = !legend && !forL && (input.type === "checkbox" || input.type === "radio") && [...src.querySelectorAll(`input[name="${CSS.escape(input.name)}"]`)].length === 1 ? input.closest("label") : null;
    // A loose page asks with the line just before the question: a heading or text with no answer box in it.
    const start = startOf(q), prev = start.previousElementSibling;
    const before = !legend && !forL && !own && prev && !prev.matches("button,[data-cl-error-for]") && !namesIn(prev).size && leaf(prev) ? prev : null;
    const el = legend || forL || own || before || null;
    if (!el) return null;
    const w = wordsOf(el);
    return { get: w.get, set: (t) => { if (!t) return; w.set(t); src.querySelectorAll(`[name="${CSS.escape(input.name)}"][data-cl-label]`).forEach((x) => x.setAttribute("data-cl-label", t)); } };
  }
  /** A question's options, from its dropdown's list or its choices' boxes, each with its words and saved value. */
  function optionsOf(input) {
    const name = input.name;
    if (input.tagName === "SELECT") return [...input.options].filter((o) => o.value !== "").map((o) => ({ value: o.value, node: o, words: { get: () => o.textContent.trim(), set: (t) => (o.textContent = t) }, setValue: (v) => o.setAttribute("value", v) }));
    return [...src.querySelectorAll(`input[name="${CSS.escape(name)}"]`)].filter((i) => !(i.value === "Other" && src.querySelector(`[name="${CSS.escape(`${name}_other`)}"]`))).map((i) => ({ value: i.value, node: i.closest("label") || i, input: i, words: wordsOf(i.closest("label")), setValue: (v) => { i.value = v; i.setAttribute("value", v); } }));
  }
  /** A renamed value everywhere it's named: show-ifs, pages a jump skips, jumps, and the meeting routes. */
  function renameValue(name, from, to) {
    for (const a of ["data-cl-show-if", "data-cl-own"]) src.querySelectorAll(`[${a}]`).forEach((e) => e.setAttribute(a, renameValueIn(e.getAttribute(a), name, from, to)));
    src.querySelectorAll("[data-cl-jump]").forEach((q) => { if (namesIn(q).has(name)) q.setAttribute("data-cl-jump", writeJumps(readJumps(q.getAttribute("data-cl-jump")).map((j) => (j.value === from ? { ...j, value: to } : j)))); });
    body().after.routes = (body().after.routes || []).map((r) => (r.field !== name ? r : Array.isArray(r.value) ? { ...r, value: r.value.map((v) => (v === from ? to : v)) } : r.value === from ? { ...r, value: to } : r));
  }
  function optionsSec(p, input, q) {
    const name = input.name, kind = input.tagName === "SELECT" ? "select" : input.type;
    const opts = optionsOf(input);
    const O = sec("Options");
    const list = h("div", { class: "opts" });
    opts.forEach((o, i) => {
      const t = h("input", { class: "in", "aria-label": `Option ${i + 1}` }); t.value = o.words.get();
      t.addEventListener("change", () => {
        const next = t.value.trim(); const was = o.words.get();
        if (!next || next === was) return (t.value = was);
        snap();
        o.words.set(next);
        // The saved value follows the words when it was made from them; what names the old value follows too.
        if (valueFollows(o.value, was)) { const v = uniqueValue(next, opts.filter((x) => x !== o).map((x) => x.value)); o.setValue(v); renameValue(name, o.value, v); }
        commit();
      });
      t.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); t.blur(); } });
      const mv = (d) => { const other = opts[i + d]; if (!other) return; snap(); d < 0 ? other.node.before(o.node) : other.node.after(o.node); commit(); };
      list.append(h("div", { class: "opt" }, t,
        h("button", { class: "ib", "aria-label": "Move up", "data-tip": "Move up", html: SVG(P.up, 13), disabled: i === 0 || null, onclick: () => mv(-1) }),
        h("button", { class: "ib", "aria-label": "Move down", "data-tip": "Move down", html: SVG(P.down, 13), disabled: i === opts.length - 1 || null, onclick: () => mv(1) }),
        h("button", { class: "ib", "aria-label": "Remove the option", html: SVG(P.x, 13), disabled: opts.length < 2 || null, onclick: () => {
          snap();
          const first = o.input && src.querySelector(`input[name="${CSS.escape(name)}"]`) === o.input;
          const keep = first ? ["required", "data-cl-label", "data-cl-id", "data-cl-key", "data-cl-save"].map((a) => [a, o.input.getAttribute(a)]).filter(([, v]) => v !== null) : [];
          o.node.remove();
          const nf = src.querySelector(`input[name="${CSS.escape(name)}"]`); if (nf) keep.forEach(([a, v]) => nf.setAttribute(a, v));
          commit();
        } })));
    });
    // One option at the end of the list, with its words; the saved value is the words (made unique).
    const addOne = (words) => {
      const now = optionsOf(input);
      const v = uniqueValue(words, now.map((x) => x.value).concat(["Other"]));
      if (kind === "select") { const op = document.createElement("option"); op.setAttribute("value", v); op.textContent = v; op.setAttribute("data-k", String(++kSeq)); input.append(op); return; }
      const last = now.at(-1)?.node; if (!last) return;
      const c = last.cloneNode(true);
      [c, ...c.querySelectorAll("*")].forEach((x) => x.setAttribute("data-k", String(++kSeq)));
      [c, ...c.querySelectorAll("[id]")].forEach((x) => x.id && (x.id = `${x.id}-${kSeq}`));
      const inp = c.matches("input") ? c : c.querySelector("input");
      inp.value = v; inp.setAttribute("value", v); ["checked", "required", "data-cl-label", "data-cl-save", "data-cl-score"].forEach((a) => inp.removeAttribute(a));
      if (c !== inp) wordsOf(c).set(v);
      last.after(c);
    };
    const pasteBtn = h("button", { class: "pill", html: `${SVG(P.qtext, 14)}Bulk add` });
    pasteBtn.onclick = () => {
      const box = h("textarea", { class: "in", rows: "6", placeholder: "One option per line", "aria-label": "Options, one per line", style: "height:auto;padding:6px 8px" });
      const go = h("button", { class: "pill primary", text: "Add options", onclick: () => {
        const lines = box.value.split(/\n+/).map((x) => x.trim()).filter(Boolean).slice(0, 100);
        closeMenu(); if (!lines.length) return;
        snap(); lines.forEach(addOne); commit();
        toast(lines.length === 1 ? "Added 1 option" : `Added ${lines.length} options`);
      } });
      openMenu(pasteBtn, [h("div", { style: "padding:8px;display:flex;flex-direction:column;gap:8px" }, box, h("div", {}, go))], 260);
      setTimeout(() => box.focus(), 0);
    };
    O.append(list, h("div", { style: "display:flex;gap:6px;flex-wrap:wrap" }, h("button", { class: "pill", html: `${SVG(P.plus, 14)}Add option`, onclick: () => { snap(); addOne(`Option ${optionsOf(input).length + 1}`); commit(); } }), pasteBtn));
    if (kind === "select") {
      const empty = [...input.options].find((o) => o.value === "");
      O.append(textRow("Placeholder", empty?.textContent.trim() || "", (t) => { if (empty) empty.textContent = t || "Choose one"; else { const o = document.createElement("option"); o.value = ""; o.textContent = t || "Choose one"; o.setAttribute("data-k", String(++kSeq)); input.prepend(o); } }, "Choose one"));
    }
    if (kind === "radio" || kind === "checkbox") {
      const other = src.querySelector(`[name="${CSS.escape(`${name}_other`)}"]`);
      O.append(swRow("Allow Other", !!other, (on) => {
        if (!on) { src.querySelector(`input[name="${CSS.escape(name)}"][value="Other"]`)?.closest("label")?.remove(); other?.closest("[data-cl-show-if]")?.remove(); return; }
        const last = opts.at(-1)?.node; if (!last) return;
        const c = last.cloneNode(true); [c, ...c.querySelectorAll("*")].forEach((x) => x.setAttribute("data-k", String(++kSeq)));
        const inp = c.matches("input") ? c : c.querySelector("input"); inp.value = "Other"; inp.setAttribute("value", "Other"); ["checked", "required", "data-cl-label", "data-cl-save", "id"].forEach((a) => inp.removeAttribute(a));
        if (c !== inp) wordsOf(c).set("Other");
        last.after(c);
        const map = classMap();
        const box = clean(`<div${map.q ? ` class="${map.q}"` : ""} data-cl-show-if="${name} == 'Other'"><label class="${map.label || "label"}" for="q_${name}_other">Tell us more</label><input class="${map.field || "field"}" id="q_${name}_other" name="${name}_other" type="text"></div>`).firstElementChild;
        [box, ...box.querySelectorAll("*")].forEach((x) => x.setAttribute("data-k", String(++kSeq)));
        endOf(q).after(box);
        ensureIds();
      }));
      const box = input.closest("label")?.parentElement;
      if (box && box !== q.parentElement) O.append(swRow("Randomize order", box.hasAttribute("data-cl-shuffle"), (on) => (on ? box.setAttribute("data-cl-shuffle", "") : box.removeAttribute("data-cl-shuffle"))));
    }
    if (kind === "checkbox") O.append(textRow("Max selections", q.getAttribute("data-cl-limit"), (v) => (/^\d+$/.test(v) && Number(v) > 0 ? q.setAttribute("data-cl-limit", v) : q.removeAttribute("data-cl-limit")), "Any"));
    p.append(O);
  }
  function questionSettings(p, input) {
    const name = input.name;
    const q = qOf(input) || input;
    const group = [...src.querySelectorAll(`[name="${CSS.escape(name)}"]`)].filter((x) => x.matches("input,select,textarea"));
    const kind = input.tagName === "SELECT" ? "select" : input.tagName === "TEXTAREA" ? "textarea" : input.type;
    const lone = (kind === "checkbox" || kind === "radio") && group.length === 1;
    const Q = sec("Field");
    const L = questionLabel(input, q);
    if (L) Q.append(textRow(lone ? "Text" : "Label", L.get(), L.set));
    const req = group.some((g) => g.hasAttribute("required"));
    Q.append(swRow("Required", req, (on) => { group.forEach((g) => g.removeAttribute("required")); if (on) group[0].setAttribute("required", ""); }));
    const helpEl = q.querySelector(".help");
    Q.append(textRow("Description", helpEl?.textContent.trim(), (v) => {
      let e = q.querySelector(".help");
      if (!v) return e?.remove();
      if (!e) { e = document.createElement("p"); e.className = `${classMap().text || "text"} help`.trim(); e.setAttribute("data-k", String(++kSeq)); const anchor = q.querySelector("legend,label") || q; anchor === q ? q.before(e) : anchor.after(e); }
      e.textContent = v;
    }));
    if (!["radio", "checkbox", "select"].includes(kind)) Q.append(textRow("Placeholder", input.getAttribute("placeholder"), (v) => (v ? input.setAttribute("placeholder", v) : input.removeAttribute("placeholder"))));
    if (!lone) {
      const SAVES = [["", "None"], ["email", "Email"], ["first_name", "First name"], ["last_name", "Last name"], ["name", "Full name"], ["phone", "Phone"], ["company", "Company"], ["title", "Job title"], ["website", "Website"], ["country", "Country"]];
      const sv = input.getAttribute("data-cl-save") || "";
      Q.append(row("Contact field", pick((SAVES.find((s) => s[0] === sv) || SAVES[0])[1], SAVES.map(([v, t]) => [t, () => { snap(); group.forEach((g) => (v ? g.setAttribute("data-cl-save", v) : g.removeAttribute("data-cl-save"))); commit(); }, v === sv]))));
    }
    if (kind === "email") Q.append(swRow("Verify with a code", input.hasAttribute("data-cl-verify"), (on) => (on ? input.setAttribute("data-cl-verify", "") : input.removeAttribute("data-cl-verify"))));
    // Formatted text: a format to match, with its own words for a miss.
    if (kind === "text" && input.hasAttribute("pattern")) {
      const FMT = [["[0-9]{5}", "ZIP code (5 digits)", "Enter 5 digits."], ["[A-Za-z0-9 -]{3,10}", "Postal code", "Enter a postal code."], ["[0-9]+", "Digits only", "Use digits only."], ["[A-Za-z ]+", "Letters only", "Use letters only."], ["[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}", "IBAN", "Enter a valid IBAN."]];
      const pat = input.getAttribute("pattern");
      const F = sec("Format");
      F.append(row("Format", pick(FMT.find(([v]) => v === pat)?.[1] || "Custom", FMT.map(([v, t, m]) => [t, () => { snap(); input.setAttribute("pattern", v); input.setAttribute("title", m); commit(); }, v === pat]))));
      F.append(textRow("Pattern", pat, (v) => { try { new RegExp(v); v && input.setAttribute("pattern", v); } catch { toast("That pattern can't be read"); } }), textRow("Error message", input.getAttribute("title"), (v) => (v ? input.setAttribute("title", v) : input.removeAttribute("title")), "Check the format."));
      p.append(F);
    }
    const unitEl = q.querySelector(".cl-unit-tx");
    if (unitEl) Q.append(textRow("Unit", unitEl.textContent, (v) => (unitEl.textContent = v || "kg"), "kg"));
    const link = lone && kind === "checkbox" ? q.querySelector("label a[href]") : null;
    if (link) Q.append(textRow("Terms link", link.getAttribute("href"), (v) => (/^https:\/\/\S+$/.test(v) ? link.setAttribute("href", v) : toast("Use an address that starts with https://")), "https://"));
    p.append(Q);
    if (!lone && ["radio", "checkbox", "select"].includes(kind)) optionsSec(p, input, q);
    // A quiz question: which answer is right (it scores 1, the rest 0).
    if (kind === "radio" && q.closest("[data-cl-quiz]")) {
      const Z = sec("Quiz");
      const right = group.find((g) => g.getAttribute("data-cl-score") === "1");
      Z.append(row("Correct answer", pick(right ? right.value : "Pick", group.map((g) => [g.value, () => { snap(); group.forEach((x) => x.setAttribute("data-cl-score", x === g ? "1" : "0")); commit(); }, g === right]))));
      p.append(Z);
    }
    // Limits on a typed answer.
    const attr = (el, a) => (v) => (v && /^-?\d+(\.\d+)?$/.test(v) ? el.setAttribute(a, v) : el.removeAttribute(a));
    if (["text", "textarea", "email", "tel", "url"].includes(kind)) { const A = sec("Validation"); A.append(textRow("Min characters", input.getAttribute("minlength"), attr(input, "minlength"), "None"), textRow("Max characters", input.getAttribute("maxlength"), attr(input, "maxlength"), "None")); p.append(A); }
    if (kind === "number") { const A = sec("Validation"); A.append(textRow("Min value", input.getAttribute("min"), attr(input, "min"), "None"), textRow("Max value", input.getAttribute("max"), attr(input, "max"), "None")); p.append(A); }
    if (kind === "radio" || kind === "select") jumpsSec(p, q, input);
    // Where the answer is kept: its name in the submissions, the CRM and the rules that read it.
    const N = sec("Data");
    const nm = h("input", { class: "in", "aria-label": "Field key" }); nm.value = name;
    nm.addEventListener("change", () => {
      const v = nm.value.trim().replace(/[^\w-]/g, "_");
      if (!v || v === name) return (nm.value = name);
      if (allNames().has(v)) { nm.value = name; return toast("Another field already uses that key"); }
      snap();
      group.forEach((g) => g.setAttribute("name", v));
      src.querySelectorAll(`[name="${CSS.escape(`${name}_other`)}"]`).forEach((g) => g.setAttribute("name", `${v}_other`));
      src.querySelectorAll(`[data-cl-error-for="${CSS.escape(name)}"]`).forEach((e) => e.setAttribute("data-cl-error-for", v));
      for (const a of ["data-cl-show-if", "data-cl-own"]) src.querySelectorAll(`[${a}]`).forEach((e) => e.setAttribute(a, e.getAttribute(a).replace(new RegExp(`\\b${name}\\b`, "g"), v)));
      src.querySelectorAll("[data-cl-pipe]").forEach((e) => { const t = e.textContent.replace(new RegExp(`\\{${name}\\}`, "g"), `{${v}}`); e.textContent = t; });
      body().after.routes = (body().after.routes || []).map((r) => (r.field === name ? { ...r, field: v } : r));
      if (body().ids?.[name]) { body().ids[v] = body().ids[name]; delete body().ids[name]; }
      commit();
    });
    N.append(row("Field key", nm));
    p.append(N);
  }
  /** A list kept in one setting ("Value::Words|Other"): a ranking's options, a grid's rows and columns. */
  function listSec(p, bl, attr, title) {
    const read = () => String(bl.getAttribute(attr) || "").split("|").map((x) => x.trim()).filter(Boolean).map((x) => { const i = x.indexOf("::"); return i > 0 ? { value: x.slice(0, i), label: x.slice(i + 2) } : { value: x, label: x }; });
    const write = (items) => bl.setAttribute(attr, items.map((o) => (o.value === o.label ? o.label : `${o.value}::${o.label}`).replace(/\|/g, "/")).join("|"));
    const items = read();
    const S2 = sec(title);
    const list = h("div", { class: "opts" });
    items.forEach((o, i) => {
      const t = h("input", { class: "in", "aria-label": `${title} ${i + 1}` }); t.value = o.label;
      t.addEventListener("change", () => { const v = t.value.trim(); if (!v || v === o.label) return; snap(); const next = read(); next[i] = valueFollows(o.value, o.label) ? { value: uniqueValue(v, next.filter((_, k) => k !== i).map((x) => x.value)), label: v } : { ...o, label: v }; write(next); commit(); });
      t.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); t.blur(); } });
      const mv = (d) => { const next = read(); if (!next[i + d]) return; snap(); [next[i], next[i + d]] = [next[i + d], next[i]]; write(next); commit(); };
      list.append(h("div", { class: "opt" }, t, h("button", { class: "ib", "aria-label": "Move up", html: SVG(P.up, 13), disabled: i === 0 || null, onclick: () => mv(-1) }), h("button", { class: "ib", "aria-label": "Move down", html: SVG(P.down, 13), disabled: i === items.length - 1 || null, onclick: () => mv(1) }), h("button", { class: "ib", "aria-label": "Remove", html: SVG(P.x, 13), disabled: items.length < 2 || null, onclick: () => { snap(); write(read().filter((_, k) => k !== i)); commit(); } })));
    });
    S2.append(list, h("div", {}, h("button", { class: "pill", html: `${SVG(P.plus, 14)}Add`, onclick: () => { snap(); const next = read(); const v = uniqueValue(`${title.replace(/s$/, "")} ${next.length + 1}`, next.map((x) => x.value)); write([...next, { value: v, label: v }]); commit(); } })));
    p.append(S2);
  }
  /** A long list (a searchable list, time zones, languages): one option per line, edited as text. */
  function bulkSec(p, bl, attr, title) {
    const items = String(bl.getAttribute(attr) || "").split("|").map((x) => x.trim()).filter(Boolean);
    const S2 = sec(`${title} (${items.length})`);
    const t = h("textarea", { class: "in", rows: "8", "aria-label": title, style: "font-family:var(--mono);font-size:12px" });
    t.value = items.map((x) => (x.includes("::") ? x.slice(x.indexOf("::") + 2) : x)).join("\n");
    t.addEventListener("change", () => { const next = [...new Set(t.value.split("\n").map((x) => x.trim().replace(/\|/g, "/")).filter(Boolean))].slice(0, 10000); if (!next.length) return; snap(); bl.setAttribute(attr, next.join("|")); commit(); });
    S2.append(t, h("p", { class: "hint0", text: "One per line, up to 10,000." }));
    p.append(S2);
  }
  /** A dependent dropdown: the list it follows, and its options for each of that list's answers. */
  function mapSec(p, bl) {
    const by = bl.getAttribute("data-cl-by") || "";
    const parents = questions().filter((q) => q.options.length && q.name !== bl.getAttribute("data-cl-name"));
    const parent = parents.find((q) => q.name === by);
    const S2 = sec("Options for each answer");
    S2.append(row("Follows", pick(by || "Pick", parents.map((q) => [q.name, () => { snap(); bl.setAttribute("data-cl-by", q.name); commit(); }, q.name === by]))));
    const map = {};
    for (const line of String(bl.getAttribute("data-cl-map") || "").split("\n")) { const at = line.indexOf("=>"); if (at > 0) map[line.slice(0, at).trim()] = line.slice(at + 2).split("|").map((x) => x.trim()).filter(Boolean); }
    const write = () => bl.setAttribute("data-cl-map", Object.entries(map).filter(([, xs]) => xs.length).map(([k, xs]) => `${k}=>${xs.join("|")}`).join("\n"));
    for (const o of parent?.options || []) {
      const t = h("input", { class: "in", "aria-label": `Options for ${o.label}`, placeholder: "Option 1, Option 2" });
      t.value = (map[o.value] || []).join(", ");
      t.addEventListener("change", () => { snap(); map[o.value] = t.value.split(",").map((x) => x.trim().replace(/\|/g, "/")).filter(Boolean); write(); commit(); });
      S2.append(row(o.label, t));
    }
    p.append(S2);
  }
  /** Picture choice: each option's picture address. */
  function imagesSec(p, bl) {
    const opts = String(bl.getAttribute("data-cl-options") || "").split("|").filter(Boolean).map((x) => (x.includes("::") ? x.slice(x.indexOf("::") + 2) : x));
    const imgs = String(bl.getAttribute("data-cl-images") || "").split("|");
    const S2 = sec("Pictures");
    const setImg = (i, v) => { snap(); bl.setAttribute("data-cl-images", opts.map((_, k) => (k === i ? v : imgs[k] || "")).join("|")); commit(); panel(); };
    opts.forEach((o, i) => {
      const img = imgs[i] || "";
      // A library photo: its 640 wide copy, since a card is small.
      const pickBtn = h("button", { class: "pill", "aria-expanded": String(S.photoFor === i), text: img ? "Change" : "Add photo", onclick: () => { S.photoFor = S.photoFor === i ? null : i; panel(); } });
      S2.append(h("div", { class: "row2" }, h("span", { class: "lbl", text: o }), h("div", { class: "phacts" }, img ? h("img", { src: img, alt: "", style: "width:40px;height:30px;object-fit:cover;border-radius:4px" }) : null, pickBtn, img ? h("button", { class: "ib", "aria-label": `Remove the photo for ${o}`, "data-tip": "Remove photo", html: SVG(P.del, 13), onclick: () => setImg(i, "") }) : null)));
      if (S.photoFor === i && api.pictures) S2.append(photoGrid(img, (pic) => { S.photoFor = null; setImg(i, (pic.sizes || []).includes(640) ? sizedUrl(pic.url, 640) : pic.url); }));
    });
    p.append(S2);
  }
  /** Product picker: each product's name and price. */
  function productsSec(p, bl) {
    const read = () => { const names = String(bl.getAttribute("data-cl-options") || "").split("|").filter(Boolean); const prices = String(bl.getAttribute("data-cl-prices") || "").split("|"); return names.map((n, i) => ({ n, price: prices[i] || "0" })); };
    const write = (xs) => { bl.setAttribute("data-cl-options", xs.map((x) => x.n.replace(/\|/g, "/")).join("|")); bl.setAttribute("data-cl-prices", xs.map((x) => x.price).join("|")); };
    const S2 = sec("Products");
    read().forEach((x, i) => {
      const n = h("input", { class: "in", "aria-label": `Product ${i + 1}` }); n.value = x.n;
      const pr = h("input", { class: "in", "aria-label": `Price of ${x.n}`, style: "max-width:84px" }); pr.value = x.price;
      n.addEventListener("change", () => { const v = n.value.trim(); if (!v) return; snap(); const xs = read(); xs[i].n = v; write(xs); commit(); });
      pr.addEventListener("change", () => { if (!/^\d+(\.\d{1,2})?$/.test(pr.value.trim())) return; snap(); const xs = read(); xs[i].price = pr.value.trim(); write(xs); commit(); });
      S2.append(h("div", { class: "opt" }, n, pr, h("button", { class: "ib", "aria-label": "Remove", html: SVG(P.x, 13), disabled: read().length < 2 || null, onclick: () => { snap(); write(read().filter((_, k) => k !== i)); commit(); } })));
    });
    S2.append(h("div", {}, h("button", { class: "pill", html: `${SVG(P.plus, 14)}Add product`, onclick: () => { snap(); const xs = read(); write([...xs, { n: `Product ${xs.length + 1}`, price: "10" }]); commit(); } })));
    p.append(S2);
  }
  /** Repeating group: the small questions in each row, and how many rows. */
  function groupSec(p, bl) {
    const TYPES = [["text", "Short answer"], ["email", "Email"], ["phone", "Phone"], ["number", "Number"], ["date", "Date"]];
    const read = () => String(bl.getAttribute("data-cl-fields") || "").split("|").filter(Boolean).map((x) => { const at = x.lastIndexOf("::"); return { label: at > 0 ? x.slice(0, at) : x, type: at > 0 ? x.slice(at + 2) : "text" }; });
    const write = (xs) => bl.setAttribute("data-cl-fields", xs.map((x) => `${x.label.replace(/\|/g, "/")}::${x.type}`).join("|"));
    const S2 = sec("Questions in each row");
    read().forEach((x, i) => {
      const t = h("input", { class: "in", "aria-label": `Question ${i + 1}` }); t.value = x.label;
      t.addEventListener("change", () => { const v = t.value.trim(); if (!v) return; snap(); const xs = read(); xs[i].label = v; write(xs); commit(); });
      S2.append(h("div", { class: "opt" }, t, pick(TYPES.find(([v]) => v === x.type)?.[1] || "Short answer", TYPES.map(([v, tt]) => [tt, () => { snap(); const xs = read(); xs[i].type = v; write(xs); commit(); }, v === x.type])), h("button", { class: "ib", "aria-label": "Remove", html: SVG(P.x, 13), disabled: read().length < 2 || null, onclick: () => { snap(); write(read().filter((_, k) => k !== i)); commit(); } })));
    });
    S2.append(h("div", {}, h("button", { class: "pill", html: `${SVG(P.plus, 14)}Add question`, disabled: read().length >= 6 || null, onclick: () => { snap(); write([...read(), { label: `Question ${read().length + 1}`, type: "text" }]); commit(); } })));
    S2.append(textRow("Max rows", bl.getAttribute("data-cl-max"), (v) => (/^\d+$/.test(v) && +v >= 1 && +v <= 20 ? bl.setAttribute("data-cl-max", v) : null), "5"), textRow("Button text", bl.getAttribute("data-cl-add"), (v) => (v ? bl.setAttribute("data-cl-add", v) : bl.removeAttribute("data-cl-add")), "Add another"));
    p.append(S2);
  }
  /** The rest of each block's settings: lists, the amount, the formula, a hidden value's source. */
  function blockMore(p, bl, type) {
    const set = (a) => (v) => (v ? bl.setAttribute(a, v) : bl.removeAttribute(a));
    if (type === "ranking") listSec(p, bl, "data-cl-options", "Options");
    if (type === "grid") { listSec(p, bl, "data-cl-rows", "Rows"); listSec(p, bl, "data-cl-cols", "Columns"); }
    const CUR = [["USD", "US dollar"], ["EUR", "Euro"], ["GBP", "Pound"], ["CAD", "Canadian dollar"], ["AUD", "Australian dollar"]];
    const curRow = () => { const c = bl.getAttribute("data-cl-currency") || "USD"; return row("Currency", pick(CUR.find(([v]) => v === c)?.[1] || c, CUR.map(([v, t]) => [t, () => { snap(); bl.setAttribute("data-cl-currency", v); commit(); }, v === c]))); };
    if (type === "payment") {
      const M = sec("Charge");
      const calcs = [...src.querySelectorAll('[data-cl-field="calc"],[data-cl-field="products"]')].map((c) => c.getAttribute("data-cl-name")).filter(Boolean);
      const from = bl.getAttribute("data-cl-from") || "";
      M.append(row("Amount", pick(from ? `The total: ${from}` : "A set amount", [["A set amount", () => { snap(); bl.removeAttribute("data-cl-from"); if (!bl.getAttribute("data-cl-amount")) bl.setAttribute("data-cl-amount", "49"); commit(); }, !from], ...calcs.map((c) => [`The total: ${c}`, () => { snap(); bl.setAttribute("data-cl-from", c); bl.removeAttribute("data-cl-amount"); commit(); }, from === c])])));
      if (!from) M.append(textRow("Price", bl.getAttribute("data-cl-amount"), (v) => (/^\d+(\.\d{1,2})?$/.test(v) ? bl.setAttribute("data-cl-amount", v) : null), "49"));
      M.append(curRow());
      M.append(swRow("Allow coupon codes", bl.hasAttribute("data-cl-coupons"), (on) => (on ? bl.setAttribute("data-cl-coupons", "") : bl.removeAttribute("data-cl-coupons"))));
      // Who takes the payment (docs/integrations-plan.md, Next step 12): Stripe, or the team's PayPal or Square.
      const via = bl.getAttribute("data-cl-pay-with") || "";
      const VIA = [["", "Stripe"], ["paypal", "PayPal"], ["square", "Square"]];
      M.append(row("Paid with", pick(VIA.find(([v]) => v === via)?.[1] || "Stripe", VIA.map(([v, t]) => [t, () => { snap(); v ? bl.setAttribute("data-cl-pay-with", v) : bl.removeAttribute("data-cl-pay-with"); commit(); }, v === via]))));
      p.append(M);
    }
    if (type === "list" && !bl.hasAttribute("data-cl-by")) { bulkSec(p, bl, "data-cl-options", "Options"); const M2 = sec("Picks"); M2.append(swRow("Allow several", bl.hasAttribute("data-cl-multi"), (on) => (on ? bl.setAttribute("data-cl-multi", "") : bl.removeAttribute("data-cl-multi")))); p.append(M2); }
    if (type === "list" && bl.hasAttribute("data-cl-by")) mapSec(p, bl);
    if (type === "pictures") { listSec(p, bl, "data-cl-options", "Options"); imagesSec(p, bl); const M2 = sec("Picks"); M2.append(swRow("Allow several", bl.hasAttribute("data-cl-multi"), (on) => (on ? bl.setAttribute("data-cl-multi", "") : bl.removeAttribute("data-cl-multi")))); p.append(M2); }
    if (type === "sum") { listSec(p, bl, "data-cl-options", "Options"); const M2 = sec("Points"); M2.append(textRow("Total", bl.getAttribute("data-cl-total"), (v) => (/^\d+$/.test(v) && Number(v) > 0 ? bl.setAttribute("data-cl-total", v) : null), "100")); p.append(M2); }
    if (type === "range") { const M2 = sec("Range"); for (const [a, t, ph] of [["data-cl-min", "Min value", "0"], ["data-cl-max", "Max value", "100"], ["data-cl-step", "Step", "1"]]) M2.append(textRow(t, bl.getAttribute(a), (v) => (/^-?\d+(\.\d+)?$/.test(v) ? bl.setAttribute(a, v) : null), ph)); p.append(M2); }
    if (type === "table" || type === "slots") { listSec(p, bl, "data-cl-rows", "Rows"); listSec(p, bl, "data-cl-cols", "Columns"); }
    if (type === "products") { productsSec(p, bl); const M2 = sec("Price"); M2.append(curRow()); p.append(M2); }
    if (type === "amount") { const M2 = sec("Amounts"); M2.append(textRow("Amounts", String(bl.getAttribute("data-cl-amounts") || "").split("|").join(", "), (v) => { const xs = v.split(/[\s,|]+/).map(Number).filter((n) => n > 0); if (xs.length) bl.setAttribute("data-cl-amounts", xs.slice(0, 8).join("|")); }, "10, 25, 50"), curRow()); p.append(M2); }
    if (type === "group") groupSec(p, bl);
    if (type === "record") { const M2 = sec("Recording"); const kinds = (bl.getAttribute("data-cl-kinds") || "audio").split(/\s+/); M2.append(swRow("Allow video", kinds.includes("video"), (on) => bl.setAttribute("data-cl-kinds", on ? "audio video" : "audio"))); p.append(M2); }
    if (type === "image") { const M2 = sec("Image"); M2.append(textRow("Image address", bl.getAttribute("data-cl-src"), (v) => (!v || /^https:\/\/\S+$/.test(v) ? bl.setAttribute("data-cl-src", v) : toast("Use an address that starts with https://")), "https://"), textRow("Alt text", bl.getAttribute("data-cl-alt"), (v) => bl.setAttribute("data-cl-alt", v))); p.append(M2); }
    if (type === "video") { const M2 = sec("Video"); M2.append(textRow("Video link", bl.getAttribute("data-cl-src"), (v) => bl.setAttribute("data-cl-src", v), "https://youtube.com/watch?v=")); M2.append(h("p", { class: "hint0", text: "YouTube, Vimeo or Loom." })); p.append(M2); }
    if (type === "calc" && bl.hasAttribute("data-cl-quiz")) {
      const C = sec("Score");
      C.append(h("p", { class: "hint0", text: "Adds up the quiz questions: 1 point for each correct answer." }));
      p.append(C);
      return;
    }
    if (type === "calc") {
      const C = sec("Calculation");
      C.append(textRow("Formula", bl.getAttribute("data-cl-formula"), set("data-cl-formula"), "{guests} * 38"));
      const f = bl.getAttribute("data-cl-format") || "number";
      C.append(row("Shows as", pick({ number: "Number", money: "Money", percent: "Percent" }[f] || f, [["Number", () => { snap(); bl.removeAttribute("data-cl-format"); commit(); }, f === "number"], ["Money", () => { snap(); bl.setAttribute("data-cl-format", "money"); commit(); }, f === "money"], ["Percent", () => { snap(); bl.setAttribute("data-cl-format", "percent"); commit(); }, f === "percent"]])));
      if (f === "money") C.append(curRow());
      C.append(textRow("Decimals", bl.getAttribute("data-cl-decimals"), (v) => (/^[0-4]$/.test(v) ? bl.setAttribute("data-cl-decimals", v) : bl.removeAttribute("data-cl-decimals")), "0"));
      C.append(swRow("Hide on the form", bl.hasAttribute("data-cl-hide"), (on) => (on ? bl.setAttribute("data-cl-hide", "") : bl.removeAttribute("data-cl-hide"))));
      const names = [...allNames()].filter((n) => n !== bl.getAttribute("data-cl-name"));
      if (names.length) C.append(h("p", { class: "hint0", text: `Use answers in braces: ${names.slice(0, 6).map((n) => `{${n}}`).join(", ")}` }));
      p.append(C);
    }
    if (type === "hidden") {
      const Hh = sec("Value");
      const from = bl.getAttribute("data-cl-from") || "param";
      const FROM = [["param", "A value in the link"], ["page", "The page address"], ["referrer", "Where they came from"], ["static", "A set value"]];
      Hh.append(row("Comes from", pick(FROM.find(([v]) => v === from)?.[1] || from, FROM.map(([v, t]) => [t, () => { snap(); bl.setAttribute("data-cl-from", v); commit(); }, v === from]))));
      if (from === "param") Hh.append(textRow("Link value", bl.getAttribute("data-cl-param"), set("data-cl-param"), "ref"));
      if (from === "static") Hh.append(textRow("Value", bl.getAttribute("data-cl-value"), set("data-cl-value")));
      p.append(Hh);
    }
  }
  // Text: put an earlier answer in it.
  function textSettings(p, el) {
    // Earlier answers first; a later one works too (a heading that fills in as they type).
    const all = [...src.querySelectorAll(CONTROLS)].filter((c) => c.getAttribute("data-cl-field") !== "hidden");
    const earlier = all.filter((c) => el.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_PRECEDING);
    const names = [...new Set([...earlier, ...all].map(nameIn))].filter(Boolean);
    const T = h("div", { class: "sec" }, h("h4", { text: "Text" }));
    const b = h("button", { class: "pill", html: `${SVG(P.plus, 14)}Insert field value`, disabled: !names.length || null });
    b.onclick = () => openMenu(b, names.map((n) => h("button", { class: "mi small", role: "menuitem", text: `{${n}}`, onclick: () => { closeMenu(); snap(); el.textContent = `${(el.textContent || "").trimEnd()} {${n}}`; commit(); toast("Inserted. It shows the respondent's answer."); } })), 220);
    T.append(h("div", {}, b));
    if (el.hasAttribute("data-cl-pipe")) T.append(h("p", { class: "hint0", text: "Values in braces show the respondent's answers." }));
    p.append(T);
  }

  // The Form tab: the look for the whole form (written into the form's CSS, over the brand's) and hidden values.
  const ruleSet = (sel, pairs) => { snap(); const r = rules(); r[sel] = r[sel] || {}; for (const [k, v] of pairs) { if (v === "" || v == null) delete r[sel][k]; else r[sel][k] = v; } writeRules(r); commit(); };
  const ruleGet = (sel, k) => rules()[sel]?.[k] || "";
  const FONTS = [["", "Theme default"], ["Inter", "Inter"], ["DM Sans", "DM Sans"], ["Manrope", "Manrope"], ["Fraunces", "Fraunces"], ["Playfair Display", "Playfair Display"], ["Space Grotesk", "Space Grotesk"]];
  function setFont(f) {
    let css = body().css.replace(/@import url\("https:\/\/fonts\.googleapis\.com\/css2\?family=[^"]*"\);\s*\/\* form font \*\/\n?/g, "");
    if (f) css = `@import url("https://fonts.googleapis.com/css2?family=${f.replace(/ /g, "+")}:wght@400;500;600;700&display=swap"); /* form font */\n${css}`;
    body().css = css;
    ruleSet(":root", [["--brand-font", f ? `"${f}", system-ui, sans-serif` : ""], ["--brand-head", f ? `"${f}", system-ui, sans-serif` : ""]]);
  }
  /** A theme to pick: the workspace's brands, then the gallery's styles. A style switches at once (undo puts it back). */
  function useStyle(id) {
    if (!cur) return;
    snap();
    cur.brandId = ""; body().style = id; body().styleCss = styleCssById(id);
    changed(); brandUi(); chatHead(); draw(); refresh();
    toast(`${styleName(id)} applied. Undo with Cmd+Z.`);
  }
  // The styles grid: the look menu under the brand button shows it (the Theme tab keeps the changes on top of it).
  function stylesGrid(after) {
    const grid = h("div", { class: "themes", role: "group", "aria-label": "Styles" });
    for (const th of THEMES) grid.append(h("button", { class: "th", "aria-pressed": String(body().style === th.id), "aria-label": `${th.name} style`, onclick: () => { after?.(); useStyle(th.id); } }, h("span", { class: "sw2", style: `background:${th.bg}` }, h("i", { style: `background:${th.card}` }, h("u", { style: `background:${th.accent}` }))), h("span", { class: "nm", text: th.name })));
    return grid;
  }
  function themePanel(p) {
    const F = h("div", { class: "sec" }, h("h4", { text: "Customize" }));
    const accent = ruleGet(":root", "--brand-primary");
    const sw = h("div", { class: "swatches", role: "group", "aria-label": "Main color" });
    for (const [val, hex, nm] of [["", "conic-gradient(from 0deg,#e5e5e5,#bdbdbd)", "Theme default"], ...brandColors().slice(0, 4).map(([v, x, n]) => [v, x, n]), ["#0c8c5e", "#0c8c5e", "green"], ["#1e6bf0", "#1e6bf0", "blue"], ["#5429d6", "#5429d6", "violet"], ["#d9480f", "#d9480f", "orange"], ["#111111", "#111111", "black"]]) sw.append(h("button", { "aria-label": nm, title: nm, "aria-pressed": String(accent === val), style: `background:${hex}`, onclick: () => ruleSet(":root", [["--brand-primary", val], ["--brand-focus", val]]) }));
    F.append(h("div", { class: "row2" }, h("span", { class: "lbl", text: "Brand color" }), sw));
    const font = (/^"([^"]+)"/.exec(ruleGet(":root", "--brand-font")) || [])[1] || "";
    F.append(h("div", { class: "row2" }, h("span", { class: "lbl", text: "Font" }), pick(FONTS.find(([v]) => v === font)?.[1] || font, FONTS.map(([v, t]) => [t, () => setFont(v), v === font]))));
    const rad = ruleGet(":root", "--brand-radius");
    const corners = [["", "Theme default"], ["4px", "None"], ["10px", "Small"], ["18px", "Large"]];
    F.append(h("div", { class: "row2" }, h("span", { class: "lbl", text: "Corner radius" }), pick(corners.find(([v]) => v === rad)?.[1] || "Theme default", corners.map(([v, t]) => [t, () => ruleSet(":root", [["--brand-radius", v], ["--brand-card-radius", v ? `${parseInt(v, 10) + 6}px` : ""], ...(ruleGet(":root", "--brand-btn-radius") === "999px" ? [] : [["--brand-btn-radius", v]])]), v === rad]))));
    const pill = ruleGet(":root", "--brand-btn-radius") === "999px";
    F.append(h("div", { class: "row2" }, h("span", { class: "lbl", text: "Button style" }), pick(pill ? "Rounded" : "Solid", [["Solid", () => ruleSet(":root", [["--brand-btn-radius", rad]]), !pill], ["Rounded", () => ruleSet(":root", [["--brand-btn-radius", "999px"]]), pill]])));
    // Fields: the theme's look, a soft fill, an outline, or a line underneath.
    // A line any style shows: the text color, faded.
    const LINE = "color-mix(in srgb, var(--brand-text) 24%, transparent)";
    const fv = ruleGet(":root", "--brand-field"), fu = ruleGet(".field", "border-width");
    const fieldNow = fu ? "line" : fv === "transparent" ? "outline" : fv ? "fill" : "";
    const FIELDS = [
      ["", "Theme default", [["--brand-field", ""], ["--brand-bw", ""]], []],
      ["fill", "Filled", [["--brand-field", "color-mix(in srgb, var(--brand-primary) 7%, var(--brand-surface))"], ["--brand-bw", "0px"]], []],
      ["outline", "Outlined", [["--brand-field", "transparent"], ["--brand-bw", "1px"]], [["border-color", LINE]]],
      ["line", "Underlined", [["--brand-field", "transparent"], ["--brand-bw", "1px"]], [["border-color", LINE], ["border-width", "0 0 1px 0"], ["border-radius", "0"], ["padding-inline", "0"]]],
    ];
    const fieldLook = (root, field) => {
      snap();
      const r = rules();
      const put = (sel, pairs) => { r[sel] = r[sel] || {}; for (const [k, v] of pairs) { if (v === "") delete r[sel][k]; else r[sel][k] = v; } if (!Object.keys(r[sel]).length) delete r[sel]; };
      put(":root", root);
      put(".field", [["border-color", ""], ["border-width", ""], ["border-radius", ""], ["padding-inline", ""], ...field]);
      // Choices keep their box: outlined when the fields are outlined or underlined.
      put(".choice", [["border-color", field.length ? LINE : ""]]);
      writeRules(r); commit();
    };
    F.append(h("div", { class: "row2" }, h("span", { class: "lbl", text: "Fields" }), pick(FIELDS.find(([v]) => v === fieldNow)?.[1] || "Theme default", FIELDS.map(([v, t, root, field]) => [t, () => fieldLook(root, field), v === fieldNow]))));
    const bg = ruleGet(":root", "--brand-bg");
    const bgs = [["", "Theme default"], ["#ffffff", "White"], ["color-mix(in srgb, var(--brand-primary) 6%, #ffffff)", "Tinted"]];
    F.append(h("div", { class: "row2" }, h("span", { class: "lbl", text: "Background" }), pick(bgs.find(([v]) => v === bg)?.[1] || "Custom", bgs.map(([v, t]) => [t, () => ruleSet(":root", [["--brand-bg", v]]), v === bg]))));
    const wd = ruleGet(".page .form-card", "max-width");
    const wds = [["", "Theme default"], ["520px", "Narrow"], ["760px", "Wide"]];
    F.append(h("div", { class: "row2" }, h("span", { class: "lbl", text: "Form width" }), pick(wds.find(([v]) => v === wd)?.[1] || wd, wds.map(([v, t]) => [t, () => ruleSet(".page .form-card", [["max-width", v]]), v === wd]))));
    const steps = stepsIn(src);
    if (steps.length > 1) {
      const bar = src.querySelector("[data-cl-progress]");
      const on = !!bar && !bar.hasAttribute("hidden");
      F.append(h("div", { class: "row2" }, h("span", { class: "lbl", text: "Progress bar" }), h("div", {}, h("button", { class: "sw", role: "switch", "aria-checked": String(on), "aria-label": "Progress bar", onclick: () => {
        snap();
        if (bar) on ? bar.setAttribute("hidden", "") : bar.removeAttribute("hidden");
        else { const b = clean('<div class="bar" data-cl-progress><i></i></div>').firstElementChild; [b, ...b.querySelectorAll("*")].forEach((x) => x.setAttribute("data-k", String(++kSeq))); steps[0].before(b); }
        commit();
      } }))));
    }
    p.append(F);
  }
  /** The screen in view in Edit: the welcome screen, a page, the thank-you, or the whole form when it has no pages. */
  function screenEl() {
    const v = S.view;
    if (v === "cover") return src.querySelector("[data-cl-cover]");
    if (v === "thanks") return src.querySelector("[data-cl-thanks]");
    if (typeof v !== "number") return null;
    const st = stepsIn(src);
    return st.length ? st[v] || null : src.querySelector("form");
  }
  /** Welcome screen: a first screen with the title, a line and Start, before the questions. */
  function welcomeSec(p) {
    const cov = src.querySelector("[data-cl-cover]");
    const W = h("div", { class: "sec" }, h("h4", { text: "Welcome screen" }));
    W.append(h("div", { class: "row2" }, h("span", { class: "lbl", text: "Show first" }), h("div", {}, h("button", { class: "sw", role: "switch", "aria-checked": String(!!cov), "aria-label": "Welcome screen", onclick: () => {
      snap();
      if (cov) { cov.remove(); S.view = 0; }
      else {
        const title = (src.querySelector("h1")?.textContent || cur?.name || "Welcome").trim().slice(0, 120);
        const el = clean('<section data-cl-cover><h1 class="heading"></h1><p class="text"></p><button type="button" class="btn" data-cl-start>Start</button></section>').firstElementChild;
        el.querySelector("h1").textContent = title;
        el.querySelector("p").textContent = (src.querySelector("header .text")?.textContent || "").trim().slice(0, 300) || "It takes about a minute.";
        [el, ...el.querySelectorAll("*")].forEach((x) => x.setAttribute("data-k", String(++kSeq)));
        (src.querySelector(".page") || src).prepend(el);
        S.view = "cover";
      }
      commit(); panel();
    } }))));
    p.append(W);
  }
  /** The library's photos to pick from, an upload first. */
  function photoGrid(current, choose) {
    const grid = h("div", { class: "phgrid", role: "group", "aria-label": "Photos" });
    const file = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/gif", hidden: true });
    const up = h("button", { "aria-label": "Upload a photo", "data-tip": "Upload a photo", html: SVG(P.up, 16), onclick: () => file.click() });
    file.addEventListener("change", async () => {
      const f = file.files?.[0]; if (!f) return;
      up.disabled = true;
      try { const pic = await api.uploadPicture(f); if (alive) choose(pic); } catch (e) { toast(e?.message || "Couldn't upload this photo. Try again."); up.disabled = false; }
    });
    grid.append(up, file);
    const small = (pic) => ((pic.sizes || []).includes(640) ? sizedUrl(pic.url, 640) : pic.url);
    api.pictures().then((list) => { if (!alive) return; for (const pic of list) grid.append(h("button", { "aria-label": pic.name || "Photo", "aria-pressed": String(pic.url === current || small(pic) === current), onclick: () => choose(pic) }, h("img", { src: small(pic), alt: "", loading: "lazy" }))); }, () => toast("Couldn't load your photos. Try again."));
    return grid;
  }
  /** One question at a time: each question on its own screen, with Enter, letter keys and single picks moving on. */
  function oneSec(p) {
    const f = src.querySelector("form");
    if (!f) return;
    const on = f.hasAttribute("data-cl-one");
    p.append(h("div", { class: "sec" }, h("h4", { text: "Layout" }), h("div", { class: "row2" }, h("span", { class: "lbl", text: "One question at a time" }), h("div", {}, h("button", { class: "sw", role: "switch", "aria-checked": String(on), "aria-label": "One question at a time", onclick: () => { snap(); on ? f.removeAttribute("data-cl-one") : f.setAttribute("data-cl-one", ""); commit(); panel(); } })))));
  }
  /** Photo: the screen in view's photo from the library or an upload, where it goes, the spot kept in view, its words. */
  function photoSec(p) {
    const el = screenEl();
    if (!el || !api.pictures) return;
    const page = el.hasAttribute("data-cl-step") || el.tagName === "FORM";
    const url = el.getAttribute("data-cl-media") || "";
    const set = (pairs) => { snap(); for (const [k, v] of pairs) v ? el.setAttribute(k, v) : el.removeAttribute(k); commit(); panel(); };
    const Ph = h("div", { class: "sec" }, h("h4", { text: "Photo" }));
    if (url) Ph.append(h("img", { class: "phthumb", src: widthsOf(url, el.getAttribute("data-cl-sizes")).includes(640) ? sizedUrl(url, 640) : url, alt: "" }));
    const acts = h("div", { class: "phacts" }, h("button", { class: "pill", "aria-expanded": String(!!S.photoLib), text: url ? "Change photo" : "Add photo", onclick: () => { S.photoLib = !S.photoLib; panel(); } }));
    if (url) acts.append(h("button", { class: "ib", "data-tip": "Remove photo", "aria-label": "Remove photo", html: SVG(P.del, 14), onclick: () => set([["data-cl-media", ""], ["data-cl-sizes", ""], ["data-cl-layout", ""], ["data-cl-focus", ""], ["data-cl-alt", ""]]) }));
    Ph.append(acts);
    if (S.photoLib) Ph.append(photoGrid(url, (pic) => { S.photoLib = false; set([["data-cl-media", pic.url], ["data-cl-sizes", (pic.sizes || []).join(",")], ["data-cl-layout", el.getAttribute("data-cl-layout") || (page ? "top" : el.hasAttribute("data-cl-cover") ? "left" : "behind")]]); }));
    if (url) {
      const lay = el.getAttribute("data-cl-layout") || "";
      const opts = [["left", "Left"], ["right", "Right"], ["top", "Top"], ...(page ? [] : [["behind", "Behind"]])];
      Ph.append(h("div", { class: "row2" }, h("span", { class: "lbl", text: "Place" }), h("div", { class: "seg" }, ...opts.map(([v, t]) => h("button", { "aria-pressed": String(lay === v), text: t, onclick: () => set([["data-cl-layout", v]]) })))));
      const fo = el.getAttribute("data-cl-focus") || "50,50";
      const f3 = h("div", { class: "focus3", role: "group", "aria-label": "Keep in view" });
      for (const y of [15, 50, 85]) for (const x of [15, 50, 85]) { const v = `${x},${y}`; f3.append(h("button", { "aria-label": `${y === 15 ? "Top" : y === 50 ? "Middle" : "Bottom"} ${x === 15 ? "left" : x === 50 ? "center" : "right"}`, "aria-pressed": String(fo === v), onclick: () => set([["data-cl-focus", v === "50,50" ? "" : v]]) })); }
      Ph.append(h("div", { class: "row2" }, h("span", { class: "lbl", text: "Keep in view" }), f3));
      const alt = h("input", { class: "in", "aria-label": "Words for screen readers", placeholder: "What the photo shows" });
      alt.value = el.getAttribute("data-cl-alt") || "";
      alt.addEventListener("change", () => set([["data-cl-alt", alt.value.trim().slice(0, 200)]]));
      Ph.append(h("div", { class: "row2" }, h("span", { class: "lbl", text: "Words for screen readers" }), alt));
    }
    p.append(Ph);
  }
  /** Settings with nothing picked: the whole form's settings, starting with hidden values from the link. */
  function formSettings(p) {
    p.append(h("div", { class: "sec" }, h("p", { class: "hint0", text: "Select a field on the form to edit it. Click selected text again to type." })));
    welcomeSec(p);
    oneSec(p);
    photoSec(p);
    // Hidden values from the link: ?utm_source=… or ?ref=… kept with each fill.
    const Hd = h("div", { class: "sec" }, h("h4", { text: "Hidden fields" }));
    const hidden = [...src.querySelectorAll('[data-cl-field="hidden"][data-cl-from="param"]')];
    const chips = h("div", { class: "hchips" });
    for (const el of hidden) { const n = el.getAttribute("data-cl-param") || el.getAttribute("data-cl-name"); chips.append(h("span", { class: "hchip" }, h("span", { text: n }), h("button", { class: "ib", style: "width:20px;height:20px", "aria-label": `Remove ${n}`, html: SVG(P.x, 11), onclick: () => { snap(); el.remove(); commit(); } }))); }
    const add = h("input", { class: "in", placeholder: "Add a URL parameter, e.g. ref", "aria-label": "Add a hidden field" });
    add.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const v = add.value.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 40);
      if (!v || hidden.some((x) => (x.getAttribute("data-cl-param") || x.getAttribute("data-cl-name")) === v)) return;
      snap();
      const name = uniqueName(v, allNames());
      const el = clean(`<div data-cl-field="hidden" data-cl-name="${name}" data-cl-from="param" data-cl-param="${v}"></div>`).firstElementChild;
      el.setAttribute("data-k", String(++kSeq));
      (src.querySelector("form") || src.firstElementChild).prepend(el);
      ensureIds();
      commit();
    });
    Hd.append(hidden.length ? chips : h("p", { class: "hint0", text: "None" }), add, h("p", { class: "hint0", text: "Captured from the form link and saved with each submission." }));
    p.append(Hd);
  }
  // Start blank: an email question and a send button in the brand's look, with no AI.
  function startBlank(quiet) {
    const f = checkForm({ ...emptyForm(), title: "New form" });
    if ("errors" in f) return false;
    const conv = formToPage(f.form);
    snap();
    setSource(conv.html);
    body().css = conv.css;
    body().html = sourceHtml();
    changed();
    setSide("build");
    S.sub = "add"; sideUi();
    setMode("edit");
    if (!quiet) toast("Blank form created. Add fields from the Build panel.");
    return true;
  }
  $("blankBtn").onclick = () => startBlank();

  // ── Templates on the empty canvas: the whole gallery, by family and search. Picking one makes the form from it
  // (the same as Forms › Templates) in this chat's brand or style, or the template's own style. ─────────────
  async function tplLoad() {
    if (TG.list) return;
    TG.list = [];
    try { const r = await api.templates(); TG.list = r.list; TG.fams = r.families; } catch { TG.list = null; }
    emptyUi();
  }
  function tplShown() {
    const words = TG.q.toLowerCase().split(/\s+/).filter(Boolean);
    return (TG.list || []).filter((t) => (TG.fam === "all" || t.fams.includes(TG.fam)) && words.every((w) => t.words.includes(w)));
  }
  /** A card's picture: the form itself, its title, first questions and button, filling the card in its own colors. */
  function tplCard(t) {
    const f = t.form, r = `border-radius:${f.radius}px`;
    const box = (cls, ...kids) => h("span", { class: cls, style: r }, ...kids);
    const answer = (q) => {
      if (q.kind === "agree") return null;
      if (q.kind === "dropdown") return box("t-in", h("span", { text: "Choose one" }), h("span", { text: "\u25be" }));
      if (q.opts && (q.kind === "single" || q.kind === "multi" || q.kind === "yes_no" || q.kind === "ranking")) return h("span", { class: "t-ops" }, ...q.opts.map((o) => box("t-op", h("i", { class: q.kind === "multi" ? "sq" : "" }), h("span", { text: o }))));
      if (q.kind === "rating") return h("span", { class: "t-stars", text: "\u2605".repeat(Math.min(q.hi || 5, 10)) });
      if ((q.kind === "nps" || q.kind === "scale") && q.hi !== undefined) {
        const lo = q.lo ?? 0, nums = [];
        for (let i = lo; i <= q.hi && nums.length < 11; i++) nums.push(h("span", { style: r, text: String(i) }));
        return h("span", { class: "t-sc" }, ...nums);
      }
      return box(`t-in${q.kind === "long_text" || q.kind === "address" || q.kind === "file" || q.kind === "signature" || q.kind === "matrix" ? " tall" : ""}`);
    };
    const vars = `font-family:${f.font};--f-card:${f.card};--f-text:${f.text};--f-muted:${f.muted};--f-field:${f.field};--f-line:${f.border}`;
    // A welcome photo: the welcome screen as it opens, the photo on its side.
    if (f.photo) return h("div", { class: `t-cov${f.photo.layout === "right" ? " right" : ""}`, "aria-hidden": "true", style: vars },
      h("img", { src: f.photo.src, alt: "", loading: "lazy", style: `object-position:${f.photo.focus}` }),
      h("div", { class: "t-form" }, h("span", { class: "t-h", style: `font-family:${f.head};font-weight:${f.headWeight}`, text: f.title }), h("span", { class: "t-btn", style: `background:${f.accent};color:${f.accentInk};border-radius:${f.btnRadius}px`, text: f.button })));
    return h("div", { class: "t-form", "aria-hidden": "true", style: vars },
      h("span", { class: "t-h", style: `font-family:${f.head};font-weight:${f.headWeight}`, text: f.title }),
      ...f.qs.map((q) => q.kind === "agree"
        ? h("span", { class: "t-q t-chk" }, h("i"), h("span", { class: "t-l", text: q.label }))
        : h("span", { class: "t-q" }, h("span", { class: "t-l", text: q.label }), answer(q))),
      h("span", { class: "t-btn", style: `background:${f.accent};color:${f.accentInk};border-radius:${f.btnRadius}px`, text: f.button }));
  }
  function tplUi() {
    if (!TG.list) return;
    const all = TG.list;
    $("tplQ").placeholder = all.length ? `Search ${all.length} templates` : "Search templates";
    const fam = $("tplFam"); fam.innerHTML = "";
    const count = (id) => all.filter((t) => id === "all" || t.fams.includes(id)).length;
    for (const f of [{ id: "all", label: "All" }, ...TG.fams]) {
      const n = count(f.id);
      if (!n) continue;
      fam.append(h("button", { "aria-pressed": String(TG.fam === f.id), onclick: () => { TG.fam = f.id; TG.n = 48; tplUi(); } }, document.createTextNode(f.label), h("span", { text: String(n) })));
    }
    const shown = tplShown();
    const grid = $("tplGrid"); grid.innerHTML = "";
    if (!all.length) grid.append(h("div", { class: "tplnone", text: "Loading templates" }));
    else if (!shown.length) grid.append(h("div", { class: "tplnone", text: "No templates match" }));
    for (const t of shown.slice(0, TG.n)) {
      grid.append(h("button", { class: `tpl${TG.making === t.id ? " making" : ""}`, "data-tpl": t.id, disabled: TG.making ? "" : null, onclick: () => peek(t) },
        tplCard(t),
        h("div", { class: "t-tx" }, h("span", { class: "t-nm", text: t.name }), h("span", { class: "t-bl", text: t.blurb }), h("span", { class: "t-mt", text: TG.making === t.id ? "Opening" : `${t.n} ${t.n === 1 ? "question" : "questions"}` }))));
    }
    $("tplMore").hidden = shown.length <= TG.n;
  }
  $("tplQ").addEventListener("input", (e) => { TG.q = e.target.value; TG.n = 48; tplUi(); });
  $("tplMore").onclick = () => { TG.n += 96; tplUi(); };
  /** Open a template for a look: the whole form, page by page, in the look it will be made in. */
  async function peek(t) {
    if (TG.making || !cur || S.busy) return;
    const b = brandOf(cur);
    TG.making = t.id; tplUi();
    let pg = null;
    try { pg = await api.templatePage(t.id, b?.css || undefined); } catch (e) { toast(e?.message || "Couldn't open this template. Try again."); }
    TG.making = ""; tplUi();
    if (!pg || !alive || built()) return;
    PK = { t, ...pg, logo: b?.css ? b.logo : null };
    setSource(pg.html);
    stepAt = 0; done = false; coverOn = true; S.view = 0;
    setMode("preview");
    peekUi();
  }
  function peekUi() {
    $("peekBar").hidden = !PK;
    $("peekName").textContent = PK ? PK.t.name : "";
    $("peekUse").disabled = !!TG.making;
    $("peekUse").textContent = TG.making ? "Creating form" : "Use this template";
    if (PK) $("exitPrev").hidden = true;
  }
  $("peekBack").onclick = () => setMode("edit");
  $("peekUse").onclick = () => { if (PK) void useTpl(PK.t); };
  async function useTpl(t) {
    if (TG.making || !cur) return;
    const c = cur, b = brandOf(c);
    const look = b?.style ? { theme: b.style } : b?.id && b.css ? { kitId: b.id } : {};
    TG.making = t.id; peekUi();
    try {
      const r = await api.useTemplate(t.id, look);
      // The empty chat this started from goes; the new form opens in its own.
      if (!c.body.html && !c.body.log.length) { dropped.add(c.id); chats = chats.filter((x) => x !== c); api.deleteChat(c.id).catch(() => {}); }
      if (r.workflowError) toast(r.workflowError);
      api.openForm(r.id);
    } catch (e) {
      toast(e?.message || "Couldn't use this template. Try again.");
    } finally { TG.making = ""; if (alive) { peekUi(); tplUi(); } }
  }
  /** The empty canvas: the templates, or the skeleton while Tia builds. */
  function emptyUi() {
    const gal = !S.busy && !!TG.list;
    $("empty").classList.toggle("gal", gal);
    $("tpls").hidden = !gal;
    $("tplWait").hidden = gal;
    if (gal) tplUi();
  }

  // ── Floating menus (never the browser's) and the toast ───────────────────────────────────────────────
  let menuEl = null, menuFor = null;
  function openMenu(anchor, items, width, cls = "") {
    closeMenu();
    const m = h("div", { class: `menu${cls ? ` ${cls}` : ""}`, role: "menu" }, ...items);
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
  const state = () => ({ html: sourceHtml(), css: body().css, after: JSON.stringify(body().after), langs: JSON.stringify({ langs: body().langs || {}, from: body().langFrom || {} }), look: JSON.stringify({ b: cur?.brandId || "", s: body().style || "", c: body().styleCss || "" }) });
  function snap() { const s = H(); s.past.push(state()); if (s.past.length > 80) s.past.shift(); s.future.length = 0; buttons(); }
  function restore(x) { if (x.look) { const l = JSON.parse(x.look); cur.brandId = l.b; if (l.s) { body().style = l.s; body().styleCss = l.c; } else { delete body().style; delete body().styleCss; } brandUi(); chatHead(); } body().css = x.css; body().after = JSON.parse(x.after); if (x.langs) { const l = JSON.parse(x.langs); body().langs = l.langs; body().langFrom = l.from; if (S.lang && !l.langs[S.lang]) S.lang = ""; } setSource(x.html); body().html = x.html; S.sel = null; changed(); draw(); refresh(); }
  function undo() { const s = H(); if (!s.past.length) return; s.future.push(state()); restore(s.past.pop()); }
  function redo() { const s = H(); if (!s.future.length) return; s.past.push(state()); restore(s.future.pop()); }
  function buttons() { $("undo").disabled = !H().past.length; $("redo").disabled = !H().future.length; }
  function changed() { langUi(); if (cur.state === "live") cur.state = "changed"; if (cur.state === "new" && built()) cur.state = "draft"; S.pubMsg = ""; pubUi(); chatHead(); buttons(); save(); }
  function commit() { compileJumps(); syncPipes(); syncQuiz(); body().html = sourceHtml(); changed(); draw(); refresh(); }
  /** A quiz's score adds up every quiz question on the form. */
  function syncQuiz() {
    const scores = src.querySelectorAll('[data-cl-field="calc"][data-cl-quiz]');
    if (!scores.length) return;
    const names = [...new Set([...src.querySelectorAll("[data-cl-quiz] input[name]")].map((x) => x.name))];
    const f = names.length ? names.map((n) => `{${n}}`).join(" + ") : "0";
    scores.forEach((c) => c.getAttribute("data-cl-formula") !== f && c.setAttribute("data-cl-formula", f));
  }
  function refresh() { if (S.mode === "edit") { panel(); tree(); } if (S.mode === "code") showCode(); if (S.mode === "after") renderAfter(); }
  $("undo").onclick = undo; $("redo").onclick = redo;

  // ── Views and devices ─────────────────────────────────────────────────────────────────────────────────
  // The views: Edit (always, with the editor sidebar and the panel), Preview (the whole screen, from the page's
  // header, with Back to editor) and On submission (the last step).
  function setMode(m) {
    if (PK && m !== "preview") { PK = null; setSource(""); peekUi(); }
    const was = S.mode;
    S.mode = m;
    $("canvas").hidden = m === "code" || m === "after";
    $("codeView").hidden = m !== "code";
    $("afterView").hidden = m !== "after";
    $("panel").hidden = m !== "edit";
    $("chat").classList.toggle("prev", m === "preview");
    $("exitPrev").hidden = m !== "preview" || !!PK;
    if (m !== "edit") { S.sel = null; $("hov").hidden = true; }
    if (m === "edit" && was === "preview") S.view = done ? (src.querySelector("[data-cl-thanks]") ? "thanks" : 0) : coverOn && src.querySelector("[data-cl-cover]") ? "cover" : oneMap.length ? (oneMap[stepAt] ?? 0) : stepAt;
    if (m === "preview" && was !== "preview") { stepAt = typeof S.view === "number" ? S.view : 0; previewFrom = typeof S.view === "number" ? S.view : null; done = S.view === "thanks"; coverOn = S.view === "cover"; }
    if ((m === "edit" || m === "code") && S.lang) { S.lang = ""; langUi(); toast(`${m === "edit" ? "Edit" : "Code"} works on the form's own language`); }
    sideUi();
    draw();
    refresh();
    emit();
  }
  $("exitPrev").onclick = () => setMode("edit");
  // The editor sidebar: Build (Add fields, Layers) or AI (the chat with Tia). The last choice is kept on this computer.
  S.side = store.get("clr-studio-side", "build") === "ai" ? "ai" : "build";
  S.sub = store.get("clr-studio-sub", "add") === "layers" ? "layers" : "add";
  function sideUi() {
    const build = S.side === "build";
    $("m-build").setAttribute("aria-selected", String(build)); $("m-ai").setAttribute("aria-selected", String(!build));
    $("s-add").setAttribute("aria-selected", String(S.sub === "add")); $("s-layers").setAttribute("aria-selected", String(S.sub === "layers"));
    $("subt").hidden = !build;
    $("adds").hidden = !build || S.sub !== "add";
    $("navi").hidden = !build || S.sub !== "layers";
    $("aiBody").hidden = build;
    if (!build) $("aiDot").hidden = true;
    S.nav = build && S.sub === "layers";
    if (S.nav) tree();
    if (build && S.sub === "add") addsUi();
  }
  function setSide(v, remember = true) { S.side = v; if (remember) store.set("clr-studio-side", v); sideUi(); setTimeout(overlay, 0); }
  $("m-build").onclick = () => setSide("build");
  $("m-ai").onclick = () => { setSide("ai"); $("input").focus(); };
  $("s-add").onclick = () => { S.sub = "add"; store.set("clr-studio-sub", "add"); sideUi(); };
  $("s-layers").onclick = () => { S.sub = "layers"; store.set("clr-studio-sub", "layers"); sideUi(); };
  function setDevice(d) { S.device = d; $("frame").className = `frame${d === "tab" ? " tablet" : d === "phone" ? " phone" : ""}`; for (const [id, v] of [["d-desk", "desk"], ["d-tab", "tab"], ["d-phone", "phone"]]) $(id).setAttribute("aria-pressed", String(d === v)); setTimeout(overlay, 340); }
  $("d-desk").onclick = () => setDevice("desk"); $("d-tab").onclick = () => setDevice("tab"); $("d-phone").onclick = () => setDevice("phone");
  // The bar's ⋯: Back to step 1, the live form, Layers (docs/form-ui-plan.md step 2).
  function moreMenu() {
    const live = !!cur?.formId && cur.state !== "new" && cur.state !== "draft";
    const item = (id, ic, text, fn, extra = {}) => {
      const b = h("button", { id, class: "mi small", role: "menuitem", html: `${SVG(ic, 15)}<span class="nm"></span>`, onclick: () => { closeMenu(); fn(); }, ...extra });
      b.querySelector(".nm").textContent = text;
      return b;
    };
    openMenu($("moreBtn"), [
      item("restart", P.restart, "Back to page 1", () => { if (S.mode !== "preview") setMode("preview"); stepAt = 0; done = false; coverOn = true; draw(); }),
      live ? item("openBtn", P.open, "Open the live form", () => window.open(api.formUrl(cur.formId), "_blank", "noopener")) : null,
    ].filter(Boolean), 220);
  }
  $("moreBtn").onclick = () => (menuEl && menuFor === $("moreBtn") ? closeMenu() : moreMenu());
  $("p-style").onclick = () => { S.ptab = "style"; panel(); };
  $("p-set").onclick = () => { S.ptab = "settings"; panel(); };
  $("p-theme").onclick = () => { S.ptab = "theme"; panel(); };

  function showCode() { for (const [id, f] of [["c-html", "html"], ["c-css", "css"], ["c-brand", "brand"]]) $(id).setAttribute("aria-pressed", String(S.file === f)); $("codeText").value = S.file === "html" ? sourceHtml() : S.file === "css" ? body().css : brandOf(cur)?.css || ""; }
  for (const [id, f] of [["c-html", "html"], ["c-css", "css"], ["c-brand", "brand"]]) $(id).onclick = () => { S.file = f; showCode(); };
  $("codeApply").onclick = () => {
    snap();
    const v = $("codeText").value;
    if (S.file === "html") setSource(v);
    else if (S.file === "css") body().css = v;
    else { const b = brandOf(cur); if (b?.style) { b.css = v; cur.body.styleCss = v; } else if (b) { b.css = v; api.keepCss(b.id, v); } }
    commit(); toast("Applied");
  };

  // On submission: a thank-you, a page or a meeting, which meeting each answer books, who books it, and what every
  // send does.
  function renderAfter() {
    const box = $("afterInner"); box.innerHTML = "";
    const a = body().after;
    const set = (p) => { snap(); if (p.kind === "meeting") bookSpot(); body().after = { ...a, ...p }; changed(); renderAfter(); stepUi(); runCheck(); };
    const c1 = h("div", { class: "card2" }, h("h3", { text: "After they send it" }), pills([["thanks", "Show a message"], ["page", "Redirect to a page"], ["meeting", "Book a meeting"]], a.kind, (k) => set({ kind: k, ...(k === "meeting" && !a.meeting && MEETINGS[0] ? { meeting: MEETINGS[0].id } : {}) })));
    if (a.kind === "page") { const i = h("input", { class: "in", placeholder: "https://yourcompany.com/thanks", value: a.url || "", "aria-label": "Page address", style: "height:34px" }); i.addEventListener("change", () => set({ url: i.value.trim() })); c1.append(i); }
    box.append(c1);
    if (a.kind === "meeting") meetingCards(box, a, set);
    box.append(alwaysCard(a, set));
  }

  // Book a meeting: the calendar sits under the thank-you's message, so the message stays the team's to edit.
  function bookSpot() {
    const t = src.querySelector("[data-cl-thanks]");
    if (!t || t.querySelector("[data-cl-book]")) return;
    const d = document.createElement("div");
    d.setAttribute("data-cl-book", "");
    d.id = "book";
    d.setAttribute("data-k", String(++kSeq));
    t.append(d);
    body().html = sourceHtml();
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
    const logo = (x) => (x === "claritia" ? markSvg(16, 'class="logo mark"') : logoImg(x.domain));
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
    const card = h("div", { class: "card2" }, h("h3", { text: "Notification" }));
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
      if (!alive || !cur || PK) return;
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
      canPublish: !S.publishing && !!cur && built() && !!brandOf(cur) && !S.busy && !PK,
      publishing: S.publishing,
      issues: built() ? issues.map((i) => ({ level: i.level === "error" ? "error" : "warning", text: i.text, ...(i.fix ? { fix: i.fix } : {}), ...(/On submission/.test(i.text) ? { after: true } : {}) })) : [],
      canFix: !!brandOf(cur)?.css && !S.busy,
      msg: S.pubMsg,
      previewing: S.mode === "preview" && !PK,
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
    if (!silent) { open(c); if (!brands.length && !c.body.style) setTimeout(brandMenu, 0); }
    return c;
  }
  async function open(c) {
    if (cur && cur !== c) save(true);
    if (!c.body) { const full = await api.chat(c.id).catch(() => null); c.body = full?.body || blank(c.brandId).body; if (full?.name) c.name = full.name; }
    c.body.after ||= { kind: "thanks", url: "", meeting: "", routes: [] };
    c.body.turns ||= []; c.body.log ||= []; c.body.ids ||= {}; c.body.langs ||= {}; c.body.langFrom ||= {};
    cur = c;
    PK = null; peekUi();
    setSource(c.body.html || "");
    stepAt = 0; done = false; coverOn = true; S.sel = null; S.about = null; S.pubMsg = "";
    S.lang = "";
    if (!c.body.lang && brandOf(c)?.profile?.language) c.body.lang = brandOf(c).profile.language;
    // A form with nothing built yet opens on AI (Tia builds it, or Start blank); a built one on the side last used.
    S.side = built() ? (store.get("clr-studio-side", "build") === "ai" ? "ai" : "build") : "ai";
    if (S.mode !== "edit") S.mode = "edit";
    S.view = 0;
    aboutUi(); chatHead(); brandUi(); renderLog(); sideUi(); setMode("edit"); pubUi(); buttons(); langUi();
    const b = brandOf(c);
    if (b && !b.css) void readLook(b);
  }

  // ── Brands: the workspace's own, each with its real logo and the CSS Tia read from its site ─────────────
  function brandUi() {
    const btn = $("brandBtn"); btn.innerHTML = "";
    const b = brandOf(cur);
    btn.append(mark(b), h("span", { class: "nm", text: b ? b.name : loaded ? "Pick your brand or a style" : "Loading brands" }), h("span", { html: SVG(P.chev, 14), style: "color:var(--muted);display:inline-flex" }));
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
    // Your own brand first: type the website and Tia learns its look.
    const site = h("input", { class: "in", id: "ownSite", placeholder: "yourwebsite.com", "aria-label": "Your website", autocomplete: "off", inputmode: "url" });
    const go = h("button", { class: "pill primary", type: "submit", text: "Learn", disabled: true });
    site.addEventListener("input", () => { go.disabled = !hostOf(site.value).includes("."); });
    const own = h("form", { class: "ownsite", onsubmit: (e) => { e.preventDefault(); if (!hostOf(site.value).includes(".")) return; const u = site.value; closeMenu(); learnSite(u); } },
      h("div", { class: "mh", html: `${SVG(P.globe, 14)}<span>Use your own brand</span>` }), h("div", { class: "siteform" }, site, go));
    const items = [own];
    if (rows.length) items.push(h("div", { class: "msep" }), h("div", { class: "mh", text: "Your brands" }), ...rows);
    if (cur) items.push(h("div", { class: "msep" }), h("div", { class: "mh", text: "Styles" }), stylesGrid(closeMenu));
    const m = openMenu($("brandBtn"), items, Math.max($("brandBtn").offsetWidth, 320), "lookmenu");
    if (!rows.length) setTimeout(() => m.querySelector("#ownSite")?.focus(), 0);
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
    if (cur.brandId !== id || cur.body.style) { snap(); cur.brandId = id; delete cur.body.style; delete cur.body.styleCss; changed(); }
    brandUi(); chatHead(); draw(); renderLog();
    return b.css ? Promise.resolve() : readLook(b);
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
    snap(); c.brandId = b.id; delete c.body.style; delete c.body.styleCss; changed();
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

  // Your own brand: the website, then a screen where Tia learns it. The site is read for its name and logo ("Is this the
  // brand?"), then for its look, while Tia's corners move over a sketch of the site; the sketch ends in the brand's colors.
  let draft = { step: 1, url: "", look: null, busy: "", err: "", browser: false, stage: 0, kit: null, el: null, vars: null };
  let stageT = 0;
  const STAGES = (host) => [`Opening ${host}`, "Finding your logo and name", "Reading your colors", "Reading your fonts", "Reading buttons and fields", "Building your form theme"];
  // What the corners frame at each stage.
  const STAGE_AT = ["lpage", "llogo", "lhero", "lh1", "lform", "lpage"];
  function openDialog(url = "") {
    closeDialog();
    draft = { step: 1, url, look: null, busy: "", err: "", browser: false, stage: 0, kit: null, el: null, vars: null };
    $("layer").append(h("div", { class: "dlg", id: "brandDlg", role: "dialog", "aria-modal": "true", "aria-label": "Use your own brand", onmousedown: (e) => { if (e.target.id === "brandDlg" && !draft.busy) closeDialog(); } }, h("div", { class: "dlgbox", id: "dlgBody" })));
    dialog();
  }
  function closeDialog() { clearInterval(stageT); stageT = 0; $("brandDlg")?.remove(); }
  /** From the look menu: the website typed there, learned at once. */
  function learnSite(url) { openDialog(url); void readSiteNow(); }
  /** Move through the stages on a clock while a read runs, never past the last one of the read (it ends with the read). */
  function runStages(from, to, ms) {
    clearInterval(stageT);
    draft.stage = from; dialog();
    stageT = setInterval(() => { if (draft.stage >= to || !$("brandDlg")) { clearInterval(stageT); return; } draft.stage++; dialog(); }, ms);
  }
  function dialog() {
    const box = $("dlgBody"); if (!box) return;
    const learning = draft.busy === "site" || draft.busy === "browser" || draft.step >= 2;
    box.classList.toggle("learnbox", learning);
    if (learning) return learnUi(box);
    box.innerHTML = "";
    const acts = h("div", { class: "acts" });
    box.append(h("h2", { text: "Use your own brand" }));
    const site = h("input", { class: "in", placeholder: "yourwebsite.com", value: draft.url, id: "dlgSite", "aria-label": "Website", autocomplete: "off" });
    const go = h("button", { class: "pill primary", type: "submit", text: "Learn", disabled: !hostOf(draft.url).includes(".") || null });
    site.addEventListener("input", () => { draft.url = site.value; draft.err = ""; go.disabled = !hostOf(draft.url).includes("."); });
    box.append(h("form", { class: "siteform", onsubmit: (e) => { e.preventDefault(); void readSiteNow(); } }, site, go));
    if (draft.err) box.append(h("div", { class: "err", text: draft.err }));
    if (draft.browser) acts.append(h("button", { class: "pill", text: "Read it in a browser", onclick: () => void scanNow() }));
    acts.append(h("button", { class: "pill", text: "Cancel", onclick: closeDialog }));
    box.append(acts);
    setTimeout(() => site.focus(), 0);
  }
  /** The learning screen: built once, then kept in step so the corners and colors move instead of jumping. */
  function learnUi(box) {
    const host = hostOf(draft.look?.site || draft.url);
    if (!draft.el) {
      const ln = (...w) => h("div", { class: "ln" }, ...w.map((x) => h("i", { style: `width:${x}%` })));
      draft.el = h("div", { class: "learn" },
        h("div", { class: "lsite", "aria-hidden": "true" },
          h("div", { class: "lbar" }, h("span", { class: "fav" }), h("span", { class: "host" })),
          h("div", { class: "lpage" },
            h("div", { class: "lnav" }, h("div", { class: "llogo" }, h("span", { class: "ph" })), h("div", { class: "links" }, h("i"), h("i"), h("i"))),
            h("div", { class: "lbody" },
              h("div", { class: "lhero" }, h("p", { class: "lh1" }), ln(92, 70, 40), h("span", { class: "lbtn", text: "Get started" })),
              h("div", { class: "lform" }, h("span", { class: "fl" }), h("span", { class: "fl" }), h("span", { class: "lbtn", text: "Send" })))),
          h("div", { class: "lscan" }),
          h("div", { class: "lcatch" }, h("i"), h("i"), h("i"), h("i"))),
        h("div", { class: "llower" }));
    }
    const el = draft.el;
    if (el.parentElement !== box) { box.innerHTML = ""; box.append(el); }
    // The sketch: the site's address, its real logo once found, its name as the headline.
    el.querySelector(".host").textContent = host;
    const name = draft.look?.name || draft.kit?.name || "";
    el.querySelector(".lh1").textContent = name || host;
    const logo = draft.look?.logo || draft.kit?.logo || "";
    const slot = el.querySelector(".llogo"), fav = el.querySelector(".fav");
    if (logo && slot.querySelector("img")?.getAttribute("src") !== logo) { slot.replaceChildren(h("img", { src: logo, alt: "" })); fav.replaceChildren(h("img", { src: logo, alt: "" })); }
    const done = draft.step === 4;
    el.classList.toggle("done", done);
    // The brand's own variables on the screen, so the sketch paints in them.
    if (draft.kit?.css && !draft.vars) {
      loadFonts(draft.kit.css);
      draft.vars = measureBrand(draft.kit.css);
      for (const [k, v] of draft.vars) el.style.setProperty(k, v);
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("painted")));
    }
    // The corners: over what's being read now.
    const sk = el.querySelector(".lsite");
    const target = el.querySelector(`.${STAGE_AT[Math.min(draft.stage, STAGE_AT.length - 1)]}`);
    requestAnimationFrame(() => {
      if (!target || !sk.isConnected) return;
      const a = sk.getBoundingClientRect(), r = target.getBoundingClientRect(), pad = 6;
      const c = el.querySelector(".lcatch");
      c.style.width = `${r.width + pad * 2}px`; c.style.height = `${r.height + pad * 2}px`;
      c.style.transform = `translate(${r.left - a.left - pad}px, ${r.top - a.top - pad}px)`;
      sk.style.setProperty("--lscan-to", `${Math.max(60, a.height - 8)}px`);
    });
    // Under the sketch: the steps, then what's asked or found.
    const low = el.querySelector(".llower"); low.innerHTML = "";
    const st = STAGES(host);
    const ok = draft.step === 2 ? 2 : done ? st.length : draft.stage;
    low.append(h("h2", { text: done ? `${name || host}'s look` : draft.step === 2 ? "Is this the brand?" : `Learning ${host}` }));
    if (draft.step !== 2 && !done) {
      const list = h("ol", { class: "lsteps", "aria-live": "polite" });
      st.forEach((t, i) => { if (i > ok) return; const now = i === ok && !draft.err; list.append(h("li", { class: i < ok ? "ok" : now ? "now" : "" }, h("span", { class: "dot", html: i < ok ? SVG(P.check, 14) : now ? tiaSvg(16, true) : "" }), h("span", { text: t }))); });
      low.append(list);
    }
    if (draft.step === 2) {
      const nm = h("input", { class: "in nameedit", value: draft.look.name, id: "dlgName", "aria-label": "Brand name" });
      const yes = h("button", { class: "pill primary", text: draft.busy === "confirm" ? "Saving" : "Yes, use this brand", disabled: !!draft.busy || !draft.look.name.trim() || null, onclick: () => void confirmNow() });
      nm.addEventListener("input", () => { draft.look.name = nm.value; yes.disabled = !nm.value.trim(); el.querySelector(".lh1").textContent = nm.value || host; });
      low.append(h("div", { class: "confirm" }, draft.look.logo ? h("img", { src: draft.look.logo, alt: "" }) : h("span", { class: "bempty", text: draft.look.name.charAt(0) }), h("div", { class: "t" }, nm, h("span", { text: draft.look.site }))));
      if (!draft.look.logo) low.append(h("p", { class: "hint0", text: "No logo found on the site. Forms show the name until one is added in Settings, Brand." }));
      if (draft.err) low.append(h("div", { class: "err", text: draft.err }));
      low.append(h("div", { class: "acts" }, h("button", { class: "pill", text: "Back", disabled: !!draft.busy || null, onclick: () => { draft.step = 1; draft.err = ""; draft.el = null; dialog(); } }), yes));
      return;
    }
    if (done) {
      const found = h("div", { class: "lfound" });
      for (const [v, t] of [["--brand-primary", "Main"], ["--brand-text", "Text"], ["--brand-bg", "Background"]]) if (draft.vars?.get(v)) found.append(h("span", { class: "chip" }, h("b", { style: `background:var(${v})` }), h("span", { text: t })));
      const font = fontName(draft.vars?.get("--brand-head") || draft.vars?.get("--brand-font"));
      if (font) found.append(h("span", { class: "chip" }, h("span", { class: "aa", style: "font-family:var(--brand-head, var(--brand-font))", text: "Aa" }), h("span", { text: font })));
      low.append(found);
      low.append(h("div", { class: "acts" }, h("button", { class: "pill primary", id: "learnDone", text: "Start building", onclick: closeDialog })));
      setTimeout(() => $("learnDone")?.focus(), 0);
      return;
    }
    if (draft.err) {
      low.append(h("div", { class: "err", text: draft.err }));
      const b = brands.find((x) => x.id === draft.kit?.id);
      low.append(h("div", { class: "acts" }, h("button", { class: "pill", text: "Close", onclick: closeDialog }), b ? h("button", { class: "pill primary", text: "Try again", onclick: () => void learnLook(b, true) }) : null));
      return;
    }
    if (draft.step === 3) low.append(h("div", { class: "acts" }, h("button", { class: "pill", text: "Hide", onclick: closeDialog })));
  }
  /**
   * The brand's look as the form will wear it: a hidden sample page (heading, line, field, button) in the brand's CSS,
   * read back from the browser, so any brand stylesheet works, with or without --brand-* variables.
   */
  function measureBrand(css) {
    const host = h("div", { style: "position:fixed;left:-9999px;top:0;width:480px;visibility:hidden;pointer-events:none", "aria-hidden": "true" });
    document.body.append(host);
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${String(css).replace(/:root\b/g, ":host")}</style><div class="page"><h1 class="heading">Aa</h1><p class="text">Aa</p><input class="field"><button class="btn" type="button">Aa</button></div>`;
    const cs = (sel) => getComputedStyle(root.querySelector(sel));
    const clear = (c) => !c || c === "transparent" || /rgba\([^)]*,\s*0\)$/.test(c);
    const pg = cs(".page"), hd = cs(".heading"), tx = cs(".text"), fd = cs(".field"), bt = cs(".btn");
    const primary = !clear(bt.backgroundColor) ? bt.backgroundColor : !clear(bt.borderTopColor) && bt.borderTopWidth !== "0px" ? bt.borderTopColor : hd.color;
    const out = new Map([
      ["--brand-bg", clear(pg.backgroundColor) ? "" : pg.backgroundColor],
      ["--brand-text", hd.color],
      ["--brand-muted", tx.color],
      ["--brand-font", pg.fontFamily],
      ["--brand-head", hd.fontFamily],
      ["--brand-primary", primary],
      ["--brand-on-primary", clear(bt.backgroundColor) ? primary : bt.color],
      ["--brand-btn-radius", bt.borderTopLeftRadius],
      ["--brand-field", clear(fd.backgroundColor) ? "" : fd.backgroundColor],
      ["--brand-line", fd.borderTopColor],
      ["--brand-bw", fd.borderTopWidth],
      ["--brand-radius", fd.borderTopLeftRadius],
    ].filter(([, v]) => v));
    host.remove();
    return out;
  }
  /** The first font family's name. */
  const fontName = (family) => (/^\s*["']?([^"',]+)/.exec(family || "") || [])[1]?.trim() || "";
  /** The Google fonts a brand's CSS imports, loaded on the page so the sketch can show them. */
  function loadFonts(css) {
    for (const m of String(css).matchAll(/@import url\(\s*["']?(https:\/\/fonts\.googleapis\.com\/css2\?[^"')]+)["']?\s*\)/g)) {
      if ([...document.head.querySelectorAll("link[data-cl-font]")].some((l) => l.getAttribute("href") === m[1])) continue;
      document.head.append(h("link", { rel: "stylesheet", href: m[1], "data-cl-font": "" }));
    }
  }
  async function readSiteNow() {
    const host = hostOf(draft.url);
    if (!host.includes(".") || draft.busy) return;
    const had = brands.find((b) => hostOf(b.site) === host);
    if (had) { closeDialog(); useBrand(had.id); return; }
    draft.busy = "site"; draft.err = ""; draft.browser = false; draft.el = null;
    runStages(0, 1, 1200);
    try { draft.look = await api.readSite(host); draft.step = 2; }
    catch (e) { draft.err = e?.message || `Couldn't open ${host}.`; draft.browser = !!e?.browser; }
    finally { draft.busy = ""; clearInterval(stageT); if (alive) dialog(); }
  }
  async function scanNow() {
    const host = hostOf(draft.url);
    draft.busy = "browser"; draft.err = ""; draft.el = null;
    runStages(0, 1, 2400);
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
    } catch (e) { draft.err = e?.message || `Couldn't read ${host} in a browser.`; draft.browser = false; }
    finally { draft.busy = ""; clearInterval(stageT); if (alive) dialog(); }
  }
  async function confirmNow() {
    if (draft.busy) return;
    draft.busy = "confirm"; draft.err = ""; dialog();
    try {
      const { kitId } = await api.confirm({ url: draft.look.url || `https://${draft.look.site}`, name: draft.look.name.trim(), logoUrl: draft.look.logoUrl || null, logoSvg: draft.look.logoSvg || null });
      const had = brands.find((x) => x.id === kitId);
      const b = had || { id: kitId, name: draft.look.name.trim(), site: draft.look.site, logo: draft.look.logo, css: "" };
      if (!had) brands = [...brands, b];
      draft.busy = "";
      if (!cur) await open(newChat(true));
      // A built form on another brand asks first (the switch dialog takes the screen); otherwise learn the look here.
      const old = brandOf(cur);
      if (built() && old && old.id !== kitId) { closeDialog(); useBrand(kitId); return; }
      await learnLook(b, false);
    } catch (e) { draft.busy = ""; draft.err = e?.message || "Couldn't save the brand."; dialog(); }
  }
  /** The look, read with the steps showing; ends painted in the brand, or with the error and Try again. */
  async function learnLook(b, fresh) {
    draft.kit = b; draft.step = 3; draft.err = "";
    runStages(2, 5, 2400);
    if (fresh) await readLook(b, true);
    else await useBrand(b.id);
    while (looking.has(b.id) && alive) await new Promise((r) => setTimeout(r, 200));
    clearInterval(stageT);
    if (!alive || !$("brandDlg") || draft.kit !== b) return;
    if (b.css) { draft.step = 4; draft.stage = 5; }
    else draft.err = b.lookErr || `Couldn't read ${b.name}'s look.`;
    dialog();
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
      g.append(h("div", { class: "text", text: !b ? "Pick your brand or a style to start." : built() ? `What should we change on ${cur.name}?` : `What do you want to build for ${b.name}?` }));
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
    input.placeholder = !b ? (loaded ? "Pick your brand or a style" : "Loading brands") : !ready && b.lookErr ? "Try reading the brand again" : !ready ? `Reading ${b.name}'s look` : built() ? "Ask Tia to change anything" : "Describe the form";
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
    const brandBlock = `BRAND\n${b.style ? `[Style: ${b.name}, one of Claritia's form styles, picked by the owner. Build only with its CSS and keep the page's classes.]` : `[Brand: ${b.name} (${b.site}), confirmed. Build only with its brand CSS.]`}${b.profile ? `\n${recipeText(b.profile)}` : ""}\n<brand_css>${b.css}</brand_css>\n[Meeting types (id: name)] ${MEETINGS.length ? MEETINGS.map((m) => `${m.id}: ${m.name}, ${m.length} min`).join("; ") : "none yet"}${b.logo ? "\n[The brand's logo is set; the form shows it in img[data-cl-logo].]" : "\n[No logo yet. Use img[data-cl-logo] anyway; it hides until one is added.]"}`;
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
    if (S.side !== "ai") $("aiDot").hidden = false;
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
    emptyUi();
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
  setMode("edit");
  setDevice("desk");
  brandUi();
  (async () => {
    const [bs, ms, cs] = await Promise.all([api.brands().catch(() => []), api.meetings().catch(() => []), api.chats().catch(() => [])]);
    void api.people?.().then((ps) => { if (ps?.length) PEOPLE = ["Anyone", ...ps]; }).catch(() => {});
    if (!alive) return;
    brands = bs.map((b) => ({ ...b, lookErr: "" }));
    MEETINGS = ms;
    void api.calendarBrand?.().then((v) => { if (alive && v !== CAL_BRAND) { CAL_BRAND = v; if (built()) draw(); } }).catch(() => {});
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
    if (api.start.fresh && api.start.text) {
      $("input").value = api.start.text.slice(0, 2000);
      autosize();
    }
    emit();
    if (!brandOf(cur) && built()) brandMenu();
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
      setSide("ai");
      send(fixes.length === 1 ? `Fix this: ${fixes[0]}` : `Fix these:\n${fixes.map((f) => `- ${f}`).join("\n")}`);
    },
    openAfter() { setMode("after"); },
    preview() { if (PK) return; setMode(S.mode === "preview" ? "edit" : "preview"); },
    rename(name) {
      const n = String(name || "").trim().slice(0, 120);
      if (!cur || !n || n === cur.name) return;
      cur.name = n; chatHead(); save(); emit();
    },
  };
}
