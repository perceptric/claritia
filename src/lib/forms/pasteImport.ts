// Import a form someone wrote in ChatGPT, Claude or a doc, pasted as text (Forms › Import a form). ChatGPT writes
// forms in a handful of shapes: numbered questions with their options as bullets under them, sections in bold or as
// headings, fields listed as bullets, "Label: A / B / C" on one line, a Markdown table, or JSON. Each question
// becomes the Studio question it reads as (src/lib/forms/linkImport.ts PageBuilder), its type taken from a hint
// ("(select all that apply)", "Type: Dropdown"), its options, or its words ("Email", "Upload photos"). The chat
// around the form ("Sure! Here's a form...", "Let me know if...") is left out. Pure: no AI, no network.

import type { Imported } from "./googleImport.ts";
import { PageBuilder, type Q } from "./linkImport.ts";
import { UserError } from "../errors.ts";

export const PASTE_MAX = 50_000;

type Kind = "text" | "email" | "url" | "number" | "long" | "phone" | "radio" | "checkbox" | "select" | "scale" | "date" | "time" | "file" | "signature" | "address" | "country" | "agree";
type Scale = { from: number; to: number; low?: string; high?: string };
type Question = { t: "q"; label: string; kind?: Kind; required?: boolean; options: string[]; help: string[]; scale?: Scale; bullet: boolean; indent: number; marks?: "box" | "circle" };
type Item = Question | { t: "heading"; text: string; page: boolean } | { t: "text"; text: string };
type Parsed = { name: string; intro: string[]; items: Item[]; submit: string; thanks: string };

// ── Words ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/** A line without Markdown emphasis, code marks or a leading emoji. */
function clean(s: string): string {
  return s
    .replace(/\*\*|__|~~|`/g, "")
    .replace(/(^|\s)[*_]([^*_]+)[*_](?=\s|$|[.,:;!?)])/g, "$1$2")
    .replace(/&nbsp;/g, " ")
    .replace(/^\p{Extended_Pictographic}️?\s*/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

const indentOf = (raw: string) => {
  const m = /^[ \t]*/.exec(raw)![0];
  return m.replace(/\t/g, "    ").length;
};

/** The question type a hint names: "(select all that apply)", "dropdown", "Yes/No", "long answer". */
function kindFromHint(raw: string): { kind: Kind; options?: string[] } | null {
  const s = raw.toLowerCase().trim();
  if (/all that apply|select (all|any|multiple)|check (all|any)|checkbox(es)?|multi[- ]?(select|choice|ple answers)|choose (all|any|multiple)|tick (all|any)/.test(s)) return { kind: "checkbox" };
  if (/drop[- ]?down|select (from )?(a )?list|pick ?list|select menu|^select$/.test(s)) return { kind: "select" };
  if (/^yes\s*(\/|or)\s*no$|yes\/no/.test(s)) return { kind: "radio", options: ["Yes", "No"] };
  if (/multiple choice|single (choice|select)|choose one|select one|pick one|radio/.test(s)) return { kind: "radio" };
  if (/long (answer|text)|paragraph|open[- ]?ended|text ?area|free[- ]?(text|form)|multi[- ]?line/.test(s)) return { kind: "long" };
  if (/short (answer|text)|single[- ]?line|^text( field| input| box)?$|^open text$/.test(s)) return { kind: "text" };
  if (/e-?mail/.test(s)) return { kind: "email" };
  if (/phone|mobile|^tel/.test(s)) return { kind: "phone" };
  if (/\burl\b|website|^link$/.test(s)) return { kind: "url" };
  if (/^(number|numeric|integer|digits?)( field| input)?$/.test(s)) return { kind: "number" };
  if (/^date( picker| field)?$|calendar/.test(s)) return { kind: "date" };
  if (/^time( picker| field)?$/.test(s)) return { kind: "time" };
  if (/file|upload|attach/.test(s)) return { kind: "file" };
  if (/signature/.test(s)) return { kind: "signature" };
  if (/^(address|street address)( field)?$/.test(s)) return { kind: "address" };
  if (/^country( field| list)?$/.test(s)) return { kind: "country" };
  if (/rating|scale|stars?\b|likert|\bnps\b/.test(s)) return { kind: "scale" };
  if (/consent|agreement|single checkbox/.test(s)) return { kind: "agree" };
  return null;
}

/** The type a question's own words point to, when nothing else says. */
function kindFromLabel(label: string): Kind {
  const s = label.toLowerCase();
  if (/^(i agree|i accept|i consent|i confirm|i have read|i understand|agree to|accept (the )?terms)/.test(s)) return "agree";
  if (/e-?mail/.test(s)) return "email";
  if (/phone|mobile|cell(ular)?\b|telephone|whatsapp/.test(s)) return "phone";
  if (/website|\burl\b|linkedin|portfolio link|link to/.test(s)) return "url";
  if (/\b(upload|attach|attachment|photos?|pictures?|resume|cv|files?|documents?)\b/.test(s) && !/\bhow many\b/.test(s)) return "file";
  if (/\bsignature\b|\bsign here\b/.test(s)) return "signature";
  if (/\b(date of birth|birthday|birth date|date)\b/.test(s)) return "date";
  if (/\b(preferred|best|appointment|start|arrival|pickup|pick-up) time\b|^time$/.test(s)) return "time";
  if (/\bcountry\b/.test(s)) return "country";
  if (/^((street|mailing|home|billing|shipping|business|property|service) )?address\b|\baddress$/.test(s)) return "address";
  if (/\b(on a scale|scale of|rate (your|our|the|how)|rating|how likely|how satisfied)\b/.test(s)) return "scale";
  if (/\b(how many|number of|quantity|how old are you)\b|^age$/.test(s)) return "number";
  if (/\b(describe|description|details?|explain|tell us|message|comments?|feedback|anything else|additional (info|information|notes|comments)|notes?|questions or concerns|why|how can we help|what would you like)\b/.test(s)) return "long";
  return "text";
}

/** "1-5", "1 to 10", "0–10", with "1 = Poor, 5 = Excellent" or "1 being X and 10 being Y" for the ends. */
function scaleFrom(s: string): Scale | null {
  const ends = /\b(0|1)\s*(?:=|:|being|is)\s*([A-Za-z][A-Za-z ']{0,30}?)\s*(?:,|;|and|\/)\s*(\d{1,2})\s*(?:=|:|being|is)\s*([A-Za-z][A-Za-z ']{0,30}?)\s*(?:[).]|$)/i.exec(s);
  if (ends && Number(ends[3]) > Number(ends[1]) && Number(ends[3]) <= 10) return { from: Number(ends[1]), to: Number(ends[3]), low: ends[2]!.trim(), high: ends[4]!.trim() };
  const m = /\b(0|1)\s*(?:-|–|—|to)\s*(\d{1,2})\b/.exec(s);
  if (!m) return null;
  const from = Number(m[1]);
  const to = Number(m[2]);
  if (to <= from || to > 10) return null;
  const low = new RegExp(`\\b${from}\\s*(?:=|:|being|is|-|–)\\s*([A-Za-z][A-Za-z ']{0,30}?)(?=[,;)]|\\s+and\\b|\\s+\\d|$)`, "i").exec(s)?.[1]?.trim();
  const high = new RegExp(`\\b${to}\\s*(?:=|:|being|is|-|–)\\s*([A-Za-z][A-Za-z ']{0,30}?)(?=[,;)]|$)`, "i").exec(s)?.[1]?.trim();
  return { from, to, ...(low ? { low } : {}), ...(high ? { high } : {}) };
}

/** A short list written on one line: "Email / Phone / Text", "Small, Medium, or Large". Null when it isn't one. */
function listFrom(s: string): string[] | null {
  const t = s.trim().replace(/\.$/, "");
  const parts = (t.includes("/") ? t.split(/\s*\/\s*/) : t.includes("|") ? t.split(/\s*\|\s*/) : t.split(/\s*,\s*(?:or\s+|and\s+)?|\s+or\s+/)).map((x) => x.trim()).filter(Boolean);
  if (parts.length < 2 || parts.length > 15) return null;
  if (parts.some((p) => p.length > 40 || p.split(" ").length > 6)) return null;
  return parts;
}

/** An option without its marker or "(please specify)". */
const optionText = (s: string) =>
  clean(s)
    .replace(/^([☐□■▢❏●○◯✓✔]|\[\s?[xX ]?\s?\]|\(\s?\))\s*/, "")
    .replace(/\s*\((please )?specify[^)]*\)\s*$/i, "")
    .replace(/:\s*_+$/, "")
    .trim();

// ── Lines ───────────────────────────────────────────────────────────────────────────────────────────────────────────

const HEAD_MD = /^#{1,6}\s+(.+)$/;
const SECTION = /^(section|part|step|page)\s*(\d+|[ivx]+)?\s*(?:[:.\-–—)]\s*(.+))?$/i;
const NUM_Q = /^(?:q(?:uestion)?\s*)?(\d{1,3})\s*[.):\-–]\s+(.+)$/i;
const QWORD = /^(?:q|question)\s*(?:\d{1,3})?\s*[:.)\-–]\s*(.+)$/i;
const BULLET = /^([-*+•◦▪▫‣⁃●○◯□☐■▢❏✓✔]|\[\s?[xX ]?\s?\]|\(\s?\)|[a-hA-H][.)]|\d{1,2}[.)])\s+(.+)$/;
const META_TYPE = /^(?:type|field type|input type|answer type|response type|format|question type)\s*[:\-–]\s*(.+)$/i;
const META_REQ = /^required\s*[:\-–]\s*(yes|no|true|false|required|optional)\b/i;
const META_OPTS = /^(?:options|choices|answers|answer options|values)\s*[:\-–]\s*(.*)$/i;
const META_HELP = /^(?:help(?: text)?|hint|description|placeholder|note)\s*[:\-–]\s*(.+)$/i;
const SUBMIT = /^(?:submit(?:\s+button)?(?:\s+(?:text|label))?|button(?:\s+text|\s+label)?|cta)\s*[:\-–]\s*(.+)$/i;
const THANKS = /^(?:thank[\s-]?you(?:\s+(?:message|page|screen|note))?|confirmation(?:\s+(?:message|page|screen))?|success message|after submit(?:ting)?|closing message)\s*[:\-–]\s*(.+)$/i;
const TITLE_META = /^(?:form\s+(?:title|name)|title)\s*[:\-–]\s*(.+)$/i;
const DESC_META = /^(?:form\s+)?(?:description|intro(?:duction)?|subtitle|subheading|header text|intro text)\s*[:\-–]\s*(.+)$/i;
const CHATTER_START = /^(sure|certainly|absolutely|of course|great|okay|ok|here(?:'s| is| are)|below (?:is|are)|i(?:'ve| have) (?:created|made|put together|drafted|designed))\b/i;
const CHATTER_END = /^(let me know|feel free|would you like|hope this|if you(?:'d| would) like|you can (?:also )?(?:customi[sz]e|adjust|edit|add|tweak)|want me to|i can also|do you want)\b/i;
const SEPARATOR = /^([-*_=]\s*){3,}$/;
const FIELD = /^((full|first|last|your|contact|company|business|organi[sz]ation) )?name$|^company$|^(job )?title$|^role$|^position$|^city$|^state( \/ province)?$|^province$|^zip( code)?$|^postal code$|^organi[sz]ation$|^budget$|^industry$/i;
const BOXES = /^(□|☐|■|▢|❏|\[\s?[xX ]?\s?\])$/;
const CIRCLES = /^(●|○|◯|\(\s?\))$/;

/** Take the hints off a question's label: required marks, "(Dropdown)", "(Yes/No)", "– long answer", "Label: A / B / C". */
function question(raw: string, bullet: boolean, indent: number): Question {
  let label = clean(raw).replace(/\s*[:：]?\s*_{3,}\s*$/, "");
  const q: Question = { t: "q", label: "", options: [], help: [], bullet, indent };
  let changed = true;
  while (changed) {
    changed = false;
    if (/\s*\*$/.test(label) || /\s*[(\[](required|mandatory|must)[)\]]\s*$/i.test(label) || /\s*[-–—]\s*required$/i.test(label)) {
      label = label.replace(/\s*\*$/, "").replace(/\s*[(\[](required|mandatory|must)[)\]]\s*$/i, "").replace(/\s*[-–—]\s*required$/i, "");
      q.required = true;
      changed = true;
    }
    if (/\s*[(\[]optional[)\]]\s*$/i.test(label) || /\s*[-–—]\s*optional$/i.test(label)) {
      label = label.replace(/\s*[(\[]optional[)\]]\s*$/i, "").replace(/\s*[-–—]\s*optional$/i, "");
      q.required = false;
      changed = true;
    }
    // A bracketed hint at the end: a type, a scale, or a short list of options.
    const br = /\s*[(\[]([^()[\]]{1,120})[)\]]\s*$/.exec(label);
    if (br) {
      const hint = br[1]!;
      const k = kindFromHint(hint);
      const sc = scaleFrom(hint);
      const list = !k && !sc ? listFrom(hint.replace(/^(options|choices|e\.g\.|eg|i\.e\.)\s*[:,]?\s*/i, "")) : null;
      if (k || sc || list) {
        label = label.slice(0, br.index);
        if (k) {
          q.kind ??= k.kind;
          if (k.options && !q.options.length) q.options = k.options;
        }
        if (sc) {
          q.kind ??= "scale";
          q.scale = sc;
        }
        if (list && !q.options.length) q.options = list;
        changed = true;
      }
    }
    // "Full name – short answer", "Email — email field".
    const dash = /\s+[-–—]\s+([^-–—]{2,40})$/.exec(label);
    if (dash && kindFromHint(dash[1]!)) {
      const k = kindFromHint(dash[1]!)!;
      q.kind ??= k.kind;
      if (k.options && !q.options.length) q.options = k.options;
      label = label.slice(0, dash.index);
      changed = true;
    }
  }
  // "How did you hear about us? Google / Facebook / Other".
  const asks = /^(.{2,200}?\?)\s+(?:options\s*[:\-–]\s*)?(.+)$/i.exec(label);
  if (asks && !q.options.length) {
    const list = listFrom(asks[2]!);
    if (list) {
      label = asks[1]!;
      q.options = list;
    }
  }
  // "Preferred contact method: Email / Phone / Text" or "Size: Small, Medium, Large".
  const colon = /^(.{2,120}?)\s*[:：]\s*(?:options\s*[:\-–]\s*)?(.+)$/i.exec(label);
  if (colon && !q.options.length) {
    const list = listFrom(colon[2]!);
    const k = kindFromHint(colon[2]!);
    if (list) {
      label = colon[1]!;
      q.options = list;
    } else if (k) {
      label = colon[1]!;
      q.kind ??= k.kind;
      if (k.options) q.options = k.options;
    }
  }
  q.label = label.replace(/[\s:：]+$/, "").trim();
  if (!q.scale && (q.kind === "scale" || /\b(scale|rate|rating)\b/i.test(q.label))) {
    const sc = scaleFrom(raw);
    if (sc) {
      q.kind = "scale";
      q.scale = sc;
    }
  }
  return q;
}

/** A Markdown table of questions: | Question | Type | Options | Required |. */
function table(rows: string[][], items: Item[]) {
  const head = rows[0]!.map((h) => h.toLowerCase());
  const col = (re: RegExp) => head.findIndex((h) => re.test(h));
  const qi = col(/question|field|label|prompt|item|name/);
  const ti = col(/type|format|input/);
  const oi = col(/option|choice|answer|value/);
  const ri = col(/required|mandatory/);
  const hi = col(/help|hint|description|note|placeholder/);
  if (qi < 0) return;
  for (const r of rows.slice(1)) {
    const label = r[qi]?.trim();
    if (!label) continue;
    const q = question(label, false, 0);
    const t = ti >= 0 ? kindFromHint(r[ti] ?? "") : null;
    if (t) {
      q.kind = t.kind;
      if (t.options && !q.options.length) q.options = t.options;
    }
    const sc = ti >= 0 ? scaleFrom(r[ti] ?? "") : null;
    if (sc) {
      q.kind = "scale";
      q.scale = sc;
    }
    const opts = oi >= 0 ? (r[oi] ?? "").trim() : "";
    if (opts && !/^(n\/a|none|-|—)$/i.test(opts)) {
      const sc2 = scaleFrom(opts);
      if (sc2 && !q.options.length && (q.kind === "scale" || !listFrom(opts))) {
        q.kind = "scale";
        q.scale = sc2;
      } else q.options = (listFrom(opts) ?? opts.split(/\s*;\s*|<br\s*\/?>/i)).map(optionText).filter(Boolean);
    }
    if (ri >= 0) q.required = /^(yes|y|true|required|✓|✔|x)$/i.test((r[ri] ?? "").trim());
    if (hi >= 0 && r[hi]?.trim() && !/^(n\/a|-|—)$/.test(r[hi]!.trim())) q.help.push(clean(r[hi]!));
    items.push(q);
  }
}

function parseText(text: string): Parsed {
  const out: Parsed = { name: "", intro: [], items: [], submit: "", thanks: "" };
  // Code fences: the form inside counts, the fence lines don't.
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter((l) => !/^\s*```/.test(l));
  let cur = null as Question | null;
  let tableRows: string[][] = [];
  let ended = false;
  let gap = false;
  const asked = () => out.items.some((i) => i.t === "q");
  const flushTable = () => {
    if (tableRows.length >= 2) table(tableRows, out.items);
    tableRows = [];
  };
  const push = (q: Question) => {
    out.items.push(q);
    cur = q;
  };

  for (const raw of lines) {
    if (ended) break;
    const indent = indentOf(raw);
    const trimmed = raw.trim();
    // Tables: rows between pipes; the |---|---| line is skipped.
    if (/^\|.*\|$/.test(trimmed)) {
      if (!/^\|[\s:|-]+\|$/.test(trimmed)) tableRows.push(trimmed.slice(1, -1).split("|").map((c) => clean(c)));
      continue;
    }
    flushTable();
    if (!trimmed || SEPARATOR.test(trimmed)) {
      gap = true;
      continue;
    }
    const afterGap = gap;
    gap = false;
    const boldLine = /^(\*\*|__)[^*_]+(\*\*|__):?$/.test(trimmed);
    const line = clean(trimmed);
    if (!line) continue;

    if (CHATTER_END.test(line) && asked()) {
      ended = true;
      continue;
    }
    if (!asked() && !out.name && !out.intro.length && CHATTER_START.test(line)) continue;

    let m: RegExpExecArray | null;
    if ((m = TITLE_META.exec(line))) {
      out.name = m[1]!.trim();
      continue;
    }
    if ((m = SUBMIT.exec(line))) {
      out.submit = m[1]!.trim().replace(/^["“']|["”']$/g, "");
      continue;
    }
    if ((m = THANKS.exec(line))) {
      out.thanks = m[1]!.trim().replace(/^["“']|["”']$/g, "");
      cur = null;
      continue;
    }
    if ((m = DESC_META.exec(line)) && !cur) {
      if (asked()) out.items.push({ t: "text", text: m[1]!.trim() });
      else out.intro.push(m[1]!.trim());
      continue;
    }
    // Headings: the first one names the form, later ones are sections ("Step 2" starts a new page).
    const listed = NUM_Q.test(line) || QWORD.test(line) || BULLET.test(line);
    const head = HEAD_MD.exec(trimmed) ? clean(HEAD_MD.exec(trimmed)![1]!) : boldLine && !listed && !line.endsWith("?") ? line.replace(/:$/, "") : null;
    const sec = SECTION.exec(line);
    if (head !== null || (sec && !listed && (sec[3] || sec[2]) && line.length < 80 && !line.endsWith("?"))) {
      const words = (head ?? (sec![3]?.trim() || line)).replace(/:$/, "");
      const s2 = SECTION.exec(words);
      const page = /^(step|page)\b/i.test(words) || (head === null && /^(step|page)\b/i.test(line));
      const title = s2?.[3]?.trim() || (s2 ? "" : words);
      if (!out.name && !asked() && !page && !/^(section|part)\b/i.test(words)) out.name = words;
      else if (title || page) out.items.push({ t: "heading", text: title, page });
      cur = null;
      continue;
    }
    if (cur) {
      if ((m = META_TYPE.exec(line))) {
        const k = kindFromHint(m[1]!);
        const sc = scaleFrom(m[1]!);
        if (k) {
          cur.kind = k.kind;
          if (k.options && !cur.options.length) cur.options = k.options;
        }
        if (sc) {
          cur.kind = "scale";
          cur.scale = sc;
        }
        continue;
      }
      if ((m = META_REQ.exec(line))) {
        cur.required = /^(yes|true|required)$/i.test(m[1]!);
        continue;
      }
      if ((m = META_OPTS.exec(line))) {
        const list = m[1] ? listFrom(m[1]) : null;
        if (list) cur.options = list;
        else if (m[1] && scaleFrom(m[1])) {
          cur.kind = "scale";
          cur.scale = scaleFrom(m[1])!;
        }
        cur.bullet = false;
        continue;
      }
      if ((m = META_HELP.exec(line))) {
        cur.help.push(m[1]!.trim());
        continue;
      }
    }

    // Rows numbered from 0 or 1 right under a question are its options: "1 - Poor", "2", "3", or "1. Cats", "2. Dogs".
    const row = /^(\d{1,2})(?:\s*[-–—:=.)]\s*(.{1,40}))?$/.exec(line);
    if (row && cur && !cur.bullet) {
      const n = Number(row[1]);
      const last = cur.options.length ? /^(\d{1,2})\b/.exec(cur.options[cur.options.length - 1]!) : null;
      if ((!cur.options.length && (n === 0 || n === 1)) || (last && n === Number(last[1]) + 1)) {
        cur.options.push(row[2] ? `${n} - ${clean(row[2])}` : String(n));
        continue;
      }
    }
    const num = indent <= (cur?.bullet === false ? cur.indent : 0) + 1 ? NUM_Q.exec(line) : null;
    const qword = QWORD.exec(line);
    if (num || qword) {
      push(question(num ? num[2]! : qword![1]!, false, indent));
      continue;
    }
    const b = BULLET.exec(line);
    if (b) {
      const q = cur as Question | null;
      const deeper = !!q && indent > q.indent;
      const expects = !!q && !q.bullet && (q.options.length > 0 || /[?:]$/.test(q.label) || q.kind === "radio" || q.kind === "checkbox" || q.kind === "select" || /\b(which|select|choose|pick|type of|what kind)\b/i.test(q.label));
      if (q && (deeper || expects)) {
        const mark = b[1]!;
        if (BOXES.test(mark) || /^[☐□■▢❏]|^\[\s?[xX ]?\s?\]/.test(b[2]!)) q.marks ??= "box";
        else if (CIRCLES.test(mark)) q.marks ??= "circle";
        const o = optionText(b[2]!);
        if (o) q.options.push(o);
        continue;
      }
      push(question(b[2]!, true, indent));
      continue;
    }
    // A plain line: a question when it asks something, has blanks to fill, or lists its options inline.
    if (/\?\s*(\*|\([^)]*\))?\s*$/.test(line) || /_{3,}\s*$/.test(line) || (/[:：]\s*\S/.test(line) && listFrom(line.split(/[:：]/).slice(1).join(":")))) {
      push(question(line, false, indent));
      continue;
    }
    // A field's name on its own line: "Name", "Email address", "Company".
    if (line.length <= 60 && !/[.!]$/.test(line) && (FIELD.test(line.replace(/[\s*:]+$/, "")) || !["text", "long", "scale", "number"].includes(kindFromLabel(line)))) {
      push(question(line, true, indent));
      continue;
    }
    // Other words: the form's intro before any question, a question's help under it, or text between questions.
    const q = cur as Question | null;
    if (q && (indent > q.indent || /^[(\[].*[)\]]$/.test(line) || (!afterGap && line.length <= 160))) {
      if (/^[(\[].*[)\]]$/.test(line)) {
        const k = kindFromHint(line.slice(1, -1));
        const sc = scaleFrom(line);
        if (k) {
          q.kind ??= k.kind;
          if (k.options && !q.options.length) q.options = k.options;
          continue;
        }
        if (sc) {
          q.kind = "scale";
          q.scale = sc;
          continue;
        }
      }
      q.help.push(line.replace(/^[(\[]|[)\]]$/g, ""));
      continue;
    }
    if (!asked()) {
      if (!out.name && !out.intro.length && line.length <= 80 && !/[.!]$/.test(line)) out.name = line.replace(/:$/, "");
      else out.intro.push(line);
    } else out.items.push({ t: "text", text: line });
    cur = null;
  }
  flushTable();
  return out;
}

// ── JSON ────────────────────────────────────────────────────────────────────────────────────────────────────────────

type J = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const first = (o: J, keys: string[]) => keys.map((k) => str(o[k])).find(Boolean) ?? "";

function parseJson(text: string): Parsed | null {
  const body = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  if (!/^[[{]/.test(body)) return null;
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return null;
  }
  const out: Parsed = { name: "", intro: [], items: [], submit: "", thanks: "" };
  const LIST = ["fields", "questions", "items", "elements", "inputs"];
  const walk = (arr: unknown[]) => {
    for (const el of arr) {
      if (typeof el === "string") {
        out.items.push(question(el, false, 0));
        continue;
      }
      if (!el || typeof el !== "object") continue;
      const o = el as J;
      const inner = LIST.map((k) => o[k]).find(Array.isArray) as unknown[] | undefined;
      const label = first(o, ["label", "question", "title", "text", "prompt", "name"]);
      if (inner) {
        if (label) out.items.push({ t: "heading", text: label, page: false });
        walk(inner);
        continue;
      }
      if (!label) continue;
      const q = question(label, false, 0);
      const t = first(o, ["type", "field_type", "fieldType", "input", "input_type", "inputType", "kind"]);
      const k = t ? kindFromHint(t) : null;
      if (k) {
        q.kind = k.kind;
        if (k.options && !q.options.length) q.options = k.options;
      }
      const opts = o.options ?? o.choices ?? o.values ?? o.answers;
      if (Array.isArray(opts)) q.options = opts.map((x) => (x && typeof x === "object" ? first(x as J, ["label", "text", "value", "name"]) : str(x))).map(optionText).filter(Boolean);
      if (typeof o.required === "boolean") q.required = o.required;
      const min = Number(o.min ?? o.scale_min ?? o.from);
      const max = Number(o.max ?? o.scale_max ?? o.to);
      if (q.kind === "scale" || (Number.isFinite(min) && Number.isFinite(max) && max > min && max <= 10 && !q.options.length)) {
        if (Number.isFinite(min) && Number.isFinite(max) && max > min && max <= 10) q.scale = { from: min === 0 ? 0 : 1, to: max };
        q.kind = "scale";
      }
      const help = first(o, ["description", "help", "helpText", "help_text", "hint", "placeholder"]);
      if (help) q.help.push(help);
      out.items.push(q);
    }
  };
  if (Array.isArray(data)) walk(data);
  else if (data && typeof data === "object") {
    const o = data as J;
    const form = (o.form && typeof o.form === "object" ? o.form : o) as J;
    out.name = first(form, ["title", "name", "form_title", "formTitle"]);
    const d = first(form, ["description", "intro", "subtitle"]);
    if (d) out.intro.push(d);
    out.submit = first(form, ["submit", "submit_text", "submitText", "submit_button", "submitButton", "button"]);
    out.thanks = first(form, ["thank_you", "thankYou", "thank_you_message", "thankYouMessage", "confirmation", "success_message"]);
    const sections = form.sections ?? form.pages ?? form.steps;
    if (Array.isArray(sections)) walk(sections);
    const list = LIST.map((k) => form[k]).find(Array.isArray) as unknown[] | undefined;
    if (list) walk(list);
  }
  return out.items.some((i) => i.t === "q") ? out : null;
}

// ── The page ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The form in pasted text as a Studio page. Throws when nothing in it reads as a question. */
export function importPasted(text: string): Imported {
  const t = String(text ?? "").slice(0, PASTE_MAX);
  const parsed = parseJson(t) ?? parseText(t);
  const questions = parsed.items.filter((i): i is Question => i.t === "q");
  if (!questions.length) throw new UserError("No questions found. Paste the form's questions, one per line or numbered.");
  if (questions.length > 200) throw new UserError("That's more than 200 questions. Paste a shorter form.");

  const b = new PageBuilder();
  for (const p of parsed.intro) b.text(p);
  for (const it of parsed.items) {
    if (it.t === "heading") {
      if (it.page) b.newPage(it.text);
      else b.heading(it.text);
      continue;
    }
    if (it.t === "text") {
      b.text(it.text);
      continue;
    }
    if (!it.label) continue;
    const q: Q = { label: it.label.slice(0, 300), required: it.required, help: it.help.join(" ").slice(0, 500) || undefined };
    let opts = [...new Set(it.options.map(optionText).filter(Boolean))];
    // Options counting 1 to N are a rating when the ones between the ends are bare numbers; otherwise they're
    // numbered choices ("1. Cats", "2. Dogs") and lose their numbers.
    const counted = opts.length >= 2 && opts.every((o, i) => new RegExp(`^${i + (opts[0]!.startsWith("0") ? 0 : 1)}\\b`).test(o));
    const bareMiddle = opts.slice(1, -1).every((o) => /^\d{1,2}$/.test(o));
    if (counted && !(opts.length >= 3 && bareMiddle)) opts = opts.map((o) => o.replace(/^\d{1,2}\s*[-–—:=.)]?\s*/, "")).filter(Boolean);
    if (!it.scale && counted && opts.length >= 3 && bareMiddle) {
      const nums = opts.map((o) => Number(/^\d+/.exec(o)![0]));
      const sc = { from: nums[0]!, to: nums[nums.length - 1]! };
      const ends = (o: string) => o.replace(/^\d+\s*[-–—:=.)]?\s*/, "").trim();
      if (sc.to <= 10) {
        it.kind = "scale";
        it.scale = { ...sc, ...(ends(opts[0]!) ? { low: ends(opts[0]!) } : {}), ...(ends(opts[opts.length - 1]!) ? { high: ends(opts[opts.length - 1]!) } : {}) };
        opts = [];
      }
    }
    let kind: Kind | undefined = it.kind;
    if (opts.length && (!kind || !["radio", "checkbox", "select"].includes(kind))) {
      kind = /all that apply|select (all|any)|check (all|any)|which (of these|ones)/i.test(it.label) || it.marks === "box" ? "checkbox" : opts.length > 10 ? "select" : "radio";
    }
    kind ??= kindFromLabel(it.label);
    switch (kind) {
      case "radio":
      case "checkbox":
      case "select":
        b.pick(kind, q, opts);
        break;
      case "scale": {
        const sc = it.scale ?? (/how likely.*recommend/i.test(it.label) ? { from: 0, to: 10 } : { from: 1, to: 5 });
        b.scale(q, { ...sc, style: "numbers" });
        break;
      }
      case "long":
        b.long(q);
        break;
      case "phone":
        b.phone(q);
        break;
      case "file":
        b.file(q);
        break;
      case "agree":
        b.agree(q);
        break;
      case "date":
      case "time":
      case "signature":
      case "address":
      case "country":
        b.plain(kind, q);
        break;
      default:
        b.input(kind, q);
    }
  }
  if (parsed.thanks) b.setThanks("Thanks, we got it.", parsed.thanks);
  return b.finish(parsed.name || "Imported form", { submit: parsed.submit || undefined });
}
