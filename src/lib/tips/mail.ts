// Getting-started emails (src/lib/tips/send.ts): the layout and the words. Pure, so tests/tips.test.ts and
// scripts/tips-previews.ts run it. The look is the live sign-in emails' (supabase/templates/confirm-signup.html):
// the logo on the off-white page, one white card, and a hero at its top on the soft panel the sign-in pictures use.
// The hero holds one big visual built from HTML (a progress bar, numbers, a form prompt, time slots), then the
// kicker, the title and one line, a short list, and the dark pill button. Built for mail apps: tables, inline styles,
// light only. Which one goes out when: src/lib/tips/plan.ts.

const FONT = "Inter,ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const PAGE = "#fafaf5";
const FRAME = "#ebebe4";
const HERO = "#f4f4ef";
const CARD_LINE = "#e6e6df";
const INK = "#0f0f0f";
const TEXT = "#171717";
const SUB = "#6c6c6d";
const MUTED = "#737373";
const FAINT = "#a3a3a3";
const LINE = "#ebebeb";
const BRAND = "#333333";
const GREEN = "#0c8c5e";
const GREEN_TEXT = "#086444";
const GREEN_SOFT = "#e3f4ec";
const BUTTER = "#9a3412";
const BUTTER_SOFT = "#ffe9cc";
const LOGO = "https://tryclaritia.com/assets/email/logo.png";

export type Mail = { subject: string; html: string; text: string };
export type Foot = { unsubscribe: string; settings: string };
export type Sign = { name: string; role?: string };

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const n = (x: number) => Math.round(x).toLocaleString("en-US");
const plural = (x: number, one: string, many = `${one}s`) => `${n(x)} ${x === 1 ? one : many}`;
const table = (inner: string, style = "", width = "100%") => `<table role="presentation" width="${width}" cellpadding="0" cellspacing="0" border="0" style="${style}">${inner}</table>`;
/** A white card inside the hero, like the cards in the sign-in pictures. */
const card = (inner: string, pad = "18px 18px", width = "100%") =>
  table(`<tr><td bgcolor="#ffffff" style="background:#ffffff;border:1px solid ${CARD_LINE};border-radius:16px;padding:${pad};box-shadow:0 1px 2px rgba(15,15,15,0.04)">${inner}</td></tr>`, "", width);
const first = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] ?? "";

/** Badge tones (soft fill, deep text), as the app's status tags. */
const TAGS = { green: [GREEN_SOFT, GREEN_TEXT], gray: ["#ededed", "#333333"], butter: [BUTTER_SOFT, BUTTER], sky: ["#e2effd", "#1e4f9a"] } as const;
type Tone = keyof typeof TAGS;
const tag = (text: string, tone: Tone) =>
  `<span style="display:inline-block;background:${TAGS[tone][0]};color:${TAGS[tone][1]};font-family:${FONT};font-size:12px;line-height:18px;font-weight:500;border-radius:6px;padding:1px 8px;white-space:nowrap">${esc(text)}</span>`;

// ─────────────── hero visuals ───────────────

/** A progress bar on a white card: "2 of 6 done". */
function progress(done: number, total: number, label: string, side: string, tone: "green" | "butter" = "green") {
  const pct = Math.min(100, Math.max(4, Math.round((done / (total || 1)) * 100)));
  const [fill, track] = tone === "green" ? [GREEN, GREEN_SOFT] : [BUTTER, BUTTER_SOFT];
  return card(
    table(`<tr><td style="font-family:${FONT};font-size:15px;line-height:22px;font-weight:500;color:${INK}">${esc(label)}</td><td align="right" style="font-family:${FONT};font-size:13px;line-height:22px;color:${MUTED};white-space:nowrap">${esc(side)}</td></tr>`) +
      table(
        `<tr><td width="${pct}%" bgcolor="${fill}" style="background:${fill};height:8px;border-radius:99px;font-size:0;line-height:0">&nbsp;</td>${pct < 100 ? `<td bgcolor="${track}" style="background:${track};height:8px;border-radius:99px;font-size:0;line-height:0">&nbsp;</td>` : ""}</tr>`,
        "margin-top:14px",
      ),
    "20px 20px 22px",
  );
}

/** Two or three numbers, each on its own white card. */
function stats(items: { n: string; label: string }[]) {
  const w = Math.floor(100 / Math.max(1, items.length));
  const td = items
    .map(
      (i, k) =>
        `<td width="${w}%" valign="top" style="padding:0 ${k < items.length - 1 ? 8 : 0}px 0 0">${card(`<div style="font-family:${FONT};font-size:28px;line-height:34px;font-weight:500;letter-spacing:-0.03em;color:${INK};font-variant-numeric:tabular-nums">${esc(i.n)}</div><div style="margin-top:2px;font-family:${FONT};font-size:12px;line-height:16px;color:${MUTED}">${esc(i.label)}</div>`, "14px 12px 13px 14px")}</td>`,
    )
    .join("");
  return table(`<tr>${td}</tr>`);
}

/** The website's prompt: one sentence in a box with the green ring, and the dark send button. */
function prompt(words: string) {
  return table(
    `<tr><td bgcolor="#ffffff" style="background:#ffffff;border:1px solid ${GREEN};border-radius:16px;padding:16px 14px 14px 18px;box-shadow:0 0 0 4px ${GREEN_SOFT}">
${table(`<tr><td valign="top" style="font-family:${FONT};font-size:16px;line-height:24px;color:${INK}">${esc(words)}</td><td width="44" valign="bottom" align="right" style="padding-left:12px"><div style="width:34px;height:34px;line-height:34px;border-radius:17px;background:${BRAND};color:#ffffff;font-family:${FONT};font-size:16px;font-weight:600;text-align:center">&uarr;</div></td></tr>`)}
</td></tr>`,
  );
}

/** A share link on a card. */
function linkCard(link: string) {
  const shown = link.replace(/^https?:\/\//, "");
  return card(
    `<div style="font-family:${FONT};font-size:12px;line-height:16px;font-weight:500;color:${FAINT}">Your form's link</div>` +
      `<div style="padding-top:8px;font-family:${FONT};font-size:15px;line-height:22px;font-weight:500;color:${INK};overflow-wrap:anywhere;word-break:break-word"><a href="${esc(link)}" style="color:${INK};text-decoration:none">${esc(shown).replace(/\//g, "/<wbr>")}</a></div>`,
    "16px 18px 18px",
  );
}

/** A day of times, one booked: the Slot, Claritia's mark, as a booking page shows it. */
function slots(day: string, times: { time: string; booked?: boolean }[]) {
  const rows = times
    .map((t) =>
      t.booked
        ? `<tr><td style="padding-top:8px">${table(`<tr><td bgcolor="${GREEN}" style="background:${GREEN};border:1px solid ${GREEN};border-radius:10px;padding:9px 14px">${table(`<tr><td style="font-family:${FONT};font-size:14px;line-height:20px;font-weight:500;color:#ffffff">${esc(t.time)}</td><td align="right" style="font-family:${FONT};font-size:12px;line-height:20px;font-weight:500;color:#ffffff">Booked</td></tr>`)}</td></tr>`)}</td></tr>`
        : `<tr><td style="padding-top:8px"><div style="border:1px solid ${LINE};border-radius:10px;padding:9px 14px;font-family:${FONT};font-size:14px;line-height:20px;font-weight:500;color:${TEXT}">${esc(t.time)}</div></td></tr>`,
    )
    .join("");
  return card(`<div style="font-family:${FONT};font-size:13px;line-height:18px;font-weight:500;color:${MUTED}">${esc(day)}</div>${table(rows)}`, "16px 18px 18px");
}

/** A workflow as three steps joined by the dashed green line of the welcome picture. */
function flow(steps: { label: string; kind: string }[]) {
  const node = (s: { label: string; kind: string }) =>
    card(
      table(`<tr><td style="font-family:${FONT};font-size:14px;line-height:20px;font-weight:500;color:${INK}">${esc(s.label)}</td><td align="right" style="padding-left:10px">${tag(s.kind, s.kind === "Email" ? "green" : "gray")}</td></tr>`),
      "12px 14px",
    );
  const join = `<tr><td align="center" style="font-size:0;line-height:0"><div style="width:0;height:18px;border-left:2px dashed ${GREEN};opacity:0.6;margin:0 auto">&nbsp;</div></td></tr>`;
  return table(steps.map((s, i) => `${i ? join : ""}<tr><td>${node(s)}</td></tr>`).join(""), "", "100%");
}

const initialsOf = (name: string) =>
  name
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

/** You, then open seats, then the green plus: the invite picture's row of faces. */
function faces(you: string) {
  const ring = (inner: string, bg: string, color: string, border = "#ffffff") =>
    `<td style="padding-right:6px"><div style="width:44px;height:44px;line-height:44px;border-radius:22px;background:${bg};border:2px solid ${border};color:${color};font-family:${FONT};font-size:15px;font-weight:600;text-align:center">${inner}</div></td>`;
  const row = ring(esc(initialsOf(you)), BRAND, "#ffffff") + ring("", "#ededed", FAINT) + ring("", "#ededed", FAINT) + ring("+", GREEN_SOFT, GREEN_TEXT);
  return card(
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${row}</tr></table><div style="padding-top:12px;font-family:${FONT};font-size:15px;line-height:22px;font-weight:500;color:${INK}">Your team</div><div style="font-family:${FONT};font-size:13px;line-height:20px;color:${MUTED}">Build forms and share meetings together</div>`,
    "18px 18px 18px",
  );
}

/** The person replying, or a note to reply to. */
function person(s: Sign | null | undefined) {
  if (!s) return card(`<div style="font-family:${FONT};font-size:15px;line-height:22px;font-weight:500;color:${INK}">Hit reply and tell us what you're building</div><div style="padding-top:4px;font-family:${FONT};font-size:13px;line-height:20px;color:${MUTED}">We answer within one working day</div>`);
  return card(
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td><div style="width:48px;height:48px;line-height:48px;border-radius:24px;background:${GREEN};color:#ffffff;font-family:${FONT};font-size:16px;font-weight:600;text-align:center">${esc(initialsOf(s.name))}</div></td><td style="padding-left:14px"><div style="font-family:${FONT};font-size:15px;line-height:22px;font-weight:500;color:${INK}">${esc(s.name)}</div>${s.role ? `<div style="font-family:${FONT};font-size:13px;line-height:18px;color:${MUTED}">${esc(s.role)}</div>` : ""}</td></tr></table>`,
  );
}

// ─────────────── body parts ───────────────

/** A numbered list, done steps ticked, like the sign-in email's "After that". */
function steps(items: { title: string; line?: string; done?: boolean }[]) {
  return table(
    items
      .map((s, i) => {
        const mark = s.done
          ? `<div style="width:22px;height:22px;border-radius:7px;background:${GREEN};color:#ffffff;font-family:${FONT};font-size:12px;line-height:22px;font-weight:600;text-align:center">&#10003;</div>`
          : `<div style="width:22px;height:22px;border-radius:7px;background:${GREEN_SOFT};color:${GREEN_TEXT};font-family:${FONT};font-size:12px;line-height:22px;font-weight:600;text-align:center">${i + 1}</div>`;
        return `<tr><td width="28" valign="top" style="padding:12px 0 0">${mark}</td><td valign="top" style="padding:12px 0 0 6px"><p style="margin:0;font-family:${FONT};font-size:14px;line-height:20px;font-weight:500;color:${s.done ? FAINT : TEXT}">${esc(s.title)}</p>${s.line ? `<p style="margin:2px 0 0;font-family:${FONT};font-size:13px;line-height:19px;color:${MUTED}">${esc(s.line)}</p>` : ""}</td></tr>`;
      })
      .join(""),
  );
}

function rows(items: { main: string; side?: string; tag?: { text: string; tone: Tone } }[]) {
  return table(
    items
      .map(
        (r) =>
          `<tr><td style="padding:11px 0;border-top:1px solid ${LINE};font-family:${FONT};font-size:14px;line-height:20px;font-weight:500;color:${TEXT}">${esc(r.main)}</td><td align="right" valign="top" style="padding:11px 0 11px 16px;border-top:1px solid ${LINE};font-family:${FONT};font-size:13px;line-height:20px;color:${MUTED};white-space:nowrap">${r.tag ? tag(r.tag.text, r.tag.tone) : esc(r.side ?? "")}</td></tr>`,
      )
      .join(""),
  );
}

function compare(cols: string[], body: { label: string; values: string[] }[], pick: number) {
  const head = `<tr><td style="padding:0 0 10px"></td>${cols.map((c, i) => `<td align="center" style="padding:0 2px 10px;font-family:${FONT};font-size:13px;line-height:18px;font-weight:500;color:${i === pick ? GREEN_TEXT : MUTED}">${i === pick ? `<span style="display:inline-block;background:${GREEN_SOFT};color:${GREEN_TEXT};border-radius:99px;padding:3px 10px">${esc(c)}</span>` : esc(c)}</td>`).join("")}</tr>`;
  return table(
    head +
      body
        .map((r) => `<tr><td style="padding:11px 8px 11px 0;border-top:1px solid ${LINE};font-family:${FONT};font-size:13px;line-height:18px;color:${MUTED}">${esc(r.label)}</td>${r.values.map((v, i) => `<td align="center" style="padding:11px 5px;border-top:1px solid ${LINE};font-family:${FONT};font-size:13px;line-height:20px;color:${TEXT};font-weight:${i === pick ? 600 : 400};font-variant-numeric:tabular-nums">${esc(v)}</td>`).join("")}</tr>`)
        .join(""),
  );
}

const label = (t: string) => `<p style="margin:0 0 2px;font-family:${FONT};font-size:12px;line-height:16px;font-weight:500;color:${FAINT}">${esc(t)}</p>`;
const para = (t: string) => `<p style="margin:0;font-family:${FONT};font-size:15px;line-height:24px;color:${SUB}">${esc(t)}</p>`;
const note = (html: string) => `<p style="margin:18px 0 0;font-family:${FONT};font-size:13px;line-height:20px;color:${MUTED}">${html}</p>`;
const quietLink = (text: string, href: string) => `<a href="${esc(href)}" style="color:${TEXT};text-decoration:underline">${esc(text)}</a>`;

function button(text: string, href: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 0"><tr><td bgcolor="${BRAND}" style="border-radius:999px;background:${BRAND}"><a href="${esc(href)}" target="_blank" style="display:inline-block;padding:13px 24px;font-family:${FONT};font-size:15px;line-height:18px;font-weight:500;letter-spacing:-0.01em;color:#ffffff;text-decoration:none;border-radius:999px;border:1px solid #1f1f1f">${esc(text)}&nbsp;&nbsp;&rarr;</a></td></tr></table>`;
}

// ─────────────── the whole email ───────────────

type Parts = { preheader: string; kicker: string; title: string; sub?: string; visual: string; body: string; button: { label: string; url: string }; after?: string };

function layout(o: Parts, f: Foot) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><title>${esc(o.title)}</title><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet"></head>
<body style="margin:0;padding:0;background:${PAGE};font-family:${FONT};-webkit-text-size-adjust:100%;-webkit-font-smoothing:antialiased;color:${TEXT}">
<span style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;color:transparent">${esc(o.preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAGE}" style="background:${PAGE}"><tr><td align="center" style="padding:40px 16px 36px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">
<tr><td style="padding:0 4px 20px"><a href="https://tryclaritia.com" style="text-decoration:none"><img src="${LOGO}" width="87" height="28" alt="Claritia" style="display:block;border:0;width:87px;height:28px"></a></td></tr>
<tr><td bgcolor="#ffffff" style="background:#ffffff;border-radius:18px;border:1px solid ${FRAME};padding:8px">
${table(`<tr><td bgcolor="${HERO}" style="background:${HERO};border-radius:12px;padding:32px 24px">${o.visual}</td></tr>
<tr><td style="padding:28px 24px 28px">
${table(`<tr><td style="vertical-align:middle;padding-right:8px;font-size:0;line-height:0"><span style="display:inline-block;width:7px;height:7px;border-radius:99px;background:${GREEN}"></span></td><td style="vertical-align:middle;font-family:${FONT};font-size:13px;line-height:18px;font-weight:500;color:${GREEN_TEXT}">${esc(o.kicker)}</td></tr>`, "margin:0 0 12px", "auto")}
<h1 style="margin:0;font-family:${FONT};font-size:28px;line-height:1.15;font-weight:500;letter-spacing:-0.035em;color:${INK}">${esc(o.title)}</h1>
${o.sub ? `<p style="margin:10px 0 0;font-family:${FONT};font-size:15px;line-height:1.6;color:${SUB}">${esc(o.sub)}</p>` : ""}
<div style="padding-top:22px">${o.body}</div>${button(o.button.label, o.button.url)}${o.after ?? ""}
</td></tr>`)}
</td></tr>
<tr><td style="padding:22px 4px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${FAINT}">You get these tips because you made a Claritia workspace. <a href="${esc(f.unsubscribe)}" style="color:${MUTED};text-decoration:underline">Turn them off</a>&nbsp;&nbsp;<a href="${esc(f.settings)}" style="color:${MUTED};text-decoration:underline">Settings</a></td></tr>
<tr><td style="padding:14px 4px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${FAINT}"><a href="https://tryclaritia.com" style="color:${MUTED};text-decoration:none;font-weight:500">Claritia</a>&nbsp;&nbsp;Forms, meetings and email in one app</td></tr>
</table></td></tr></table></body></html>`;
}

function mail(o: Parts & { subject: string; text: string[] }, f: Foot): Mail {
  return {
    subject: o.subject,
    html: layout(o, f),
    text: [o.title, ...(o.sub ? [o.sub] : []), "", ...o.text, "", `${o.button.label}: ${o.button.url}`, "", "--", "You get these tips because you made a Claritia workspace.", `Turn them off: ${f.unsubscribe}`].join("\n"),
  };
}

// ─────────────── the emails ───────────────

export type Step = { title: string; line?: string; done: boolean };

export function welcomeMail(w: { name: string | null; workspace: string; steps: Step[]; url: string }, f: Foot): Mail {
  const done = w.steps.filter((s) => s.done).length;
  const hi = first(w.name);
  return mail(
    {
      subject: "Your first week with Claritia",
      preheader: "A short list to get your first leads booking meetings.",
      kicker: "Welcome to Claritia",
      title: hi ? `Welcome, ${hi}. Here's your first week.` : "Welcome. Here's your first week.",
      sub: `${w.workspace} is ready. Do one step a day and your first leads can book a meeting by the weekend.`,
      visual: progress(done, w.steps.length, "Getting started", `${done} of ${w.steps.length} done`),
      body: label("Your first week") + steps(w.steps),
      button: { label: "Open Claritia", url: w.url },
      text: w.steps.map((s, i) => `${s.done ? "[x]" : `${i + 1}.`} ${s.title}`),
    },
    f,
  );
}

export function formMail(m: { templates: number | null; url: string; templatesUrl: string }, f: Foot): Mail {
  const picks = ["Book a call", "Demo request", "Consultation request"];
  return mail(
    {
      subject: "Build your first form in one sentence",
      preheader: "Describe the form you want. Tia writes it in your brand.",
      kicker: "Your first form",
      title: "Describe it in one sentence",
      sub: "Tia writes the questions and styles the form in your brand. You can change anything after.",
      visual: prompt("A demo request form that asks team size, then books a call"),
      body: label("Or start from a template") + rows(picks.map((p) => ({ main: p, tag: { text: "Books a meeting", tone: "green" as Tone } }))),
      button: { label: "Build a form", url: m.url },
      after: note(m.templates ? `Or browse all ${n(m.templates)} templates in ${quietLink("Forms", m.templatesUrl)}.` : `Or browse the templates in ${quietLink("Forms", m.templatesUrl)}.`),
      text: ["Describe the form you want in one sentence and Tia builds it.", `Or start from a template: ${picks.join(", ")}.`, `Templates: ${m.templatesUrl}`],
    },
    f,
  );
}

export function shareMail(s: { form: string; live: boolean; link: string; url: string }, f: Foot): Mail {
  return mail(
    {
      subject: s.live ? `${s.form} is ready for its first response` : `Put ${s.form} live`,
      preheader: s.live ? "Send the link or add the form to your site." : "It's still a draft. Put it live, then share it.",
      kicker: "Share your form",
      title: s.live ? "Get your form in front of people" : "Put your form live",
      sub: s.live ? `${s.form} is live and waiting for its first response.` : `${s.form} is still a draft. Put it live, then share it.`,
      visual: linkCard(s.link),
      body: steps([
        { title: "Send the link", line: "In an email, a chat or your social bio", done: false },
        { title: "Add it to a page on your site", line: "Paste one short code where it should show", done: false },
        { title: "Open it from a button", line: "A pop-up or a slide-in on any page", done: false },
      ]),
      button: { label: s.live ? "Share your form" : "Put it live", url: s.url },
      text: [s.live ? `${s.form} is live: ${s.link}` : `${s.form} is still a draft.`, "Send the link or add the form to a page on your site."],
    },
    f,
  );
}

export function responsesMail(r: { responses: number; meetings: number; live: number; latest: { form: string; when: string }[]; url: string }, f: Foot): Mail {
  const one = r.responses === 1;
  return mail(
    {
      subject: one ? "Your first response came in" : `${plural(r.responses, "response")} so far`,
      preheader: r.meetings ? `${plural(r.meetings, "meeting")} booked too.` : "Next, let people book a meeting when they send it.",
      kicker: "Leads are coming in",
      title: one ? "Your first response is in" : `${plural(r.responses, "response")} so far`,
      sub: r.meetings ? `${plural(r.meetings, "person", "people")} booked a meeting too.` : "Next, let people book a meeting right after they send your form.",
      visual: stats([
        { n: n(r.responses), label: one ? "Response" : "Responses" },
        { n: n(r.meetings), label: "Meetings booked" },
        { n: n(r.live), label: r.live === 1 ? "Form live" : "Forms live" },
      ]),
      body: r.latest.length ? label("Latest") + rows(r.latest.slice(0, 3).map((x) => ({ main: x.form, side: x.when }))) : para("Open the form to read every answer."),
      button: { label: "See responses", url: r.url },
      text: [`${plural(r.responses, "response")}, ${plural(r.meetings, "meeting")} booked, ${plural(r.live, "form")} live.`, ...r.latest.slice(0, 3).map((x) => `- ${x.form}, ${x.when}`)],
    },
    f,
  );
}

export function calendarMail(c: { day: string; url: string }, f: Foot): Mail {
  return mail(
    {
      subject: "Let leads book a time with you",
      preheader: "Connect Google Calendar or Outlook in one click.",
      kicker: "Connect your calendar",
      title: "Let leads book a time right away",
      sub: "Connect Google Calendar or Outlook. People only see the times you're free.",
      visual: slots(c.day, [{ time: "9:00 AM" }, { time: "10:30 AM", booked: true }, { time: "2:00 PM" }]),
      body: steps([
        { title: "Busy times stay blocked", line: "Nobody books over your other meetings", done: false },
        { title: "Meetings land on your calendar", line: "With the invite and a video link", done: false },
      ]),
      button: { label: "Connect your calendar", url: c.url },
      text: ["Connect Google Calendar or Outlook. People only see the times you're free, and booked meetings land on your calendar."],
    },
    f,
  );
}

export function followupMail(w: { ready: string[]; url: string }, f: Foot): Mail {
  const ideas = w.ready.length ? w.ready.slice(0, 3).map((r) => ({ main: r, tag: { text: "Ready", tone: "green" as Tone } })) : ["Thank them and share a next step", "Remind people who didn't book", "Check in a week later"].map((r) => ({ main: r }));
  return mail(
    {
      subject: "Follow up with every lead on its own",
      preheader: "A workflow emails each new lead for you.",
      kicker: "Workflows",
      title: "Follow up with every lead on its own",
      sub: "A workflow emails each person who sends your form. Set it up once and it runs on every response.",
      visual: flow([
        { label: "Someone sends your form", kind: "Start" },
        { label: "Wait 1 day", kind: "Wait" },
        { label: "Send a follow-up email", kind: "Email" },
      ]),
      body: label(w.ready.length ? "Ready to turn on" : "Ideas to start with") + rows(ideas),
      button: { label: "Open workflows", url: w.url },
      text: ["A workflow emails each person who sends your form.", ...ideas.map((i) => `- ${i.main}`)],
    },
    f,
  );
}

export function teamMail(t: { you: string; workspace: string; perks: { main: string; plan: string }[]; url: string }, f: Foot): Mail {
  return mail(
    {
      subject: `Invite your team to ${t.workspace}`,
      preheader: "Teammates who build forms and edit workflows are free.",
      kicker: "Your team",
      title: `Invite your team to ${t.workspace}`,
      sub: "Teammates who build forms or edit workflows are free. You only pay for people others can book.",
      visual: faces(t.you),
      body: rows(t.perks.map((p) => ({ main: p.main, tag: { text: p.plan, tone: p.plan === "Free" ? ("green" as Tone) : ("gray" as Tone) } }))),
      button: { label: "Invite your team", url: t.url },
      text: ["Teammates who build forms or edit workflows are free.", ...t.perks.map((p) => `- ${p.main} (${p.plan})`)],
    },
    f,
  );
}

export function limitMail(l: { used: number; cap: number; resets: string; cols: string[]; rows: { label: string; values: string[] }[]; pick: number; price: number; url: string; yearlyOff: number }, f: Foot): Mail {
  return mail(
    {
      subject: `You've used ${n(l.used)} of ${n(l.cap)} free responses this month`,
      preheader: `Responses past ${n(l.cap)} are saved. You'll see them when you upgrade.`,
      kicker: "Free plan",
      title: "You're close to this month's free responses",
      sub: `Every response is saved. Past ${n(l.cap)}, they stay hidden until you upgrade or the month turns on ${l.resets}.`,
      visual: progress(l.used, l.cap, "Responses this month", `${n(l.used)} of ${n(l.cap)}`, "butter"),
      body: compare(l.cols, l.rows, l.pick),
      button: { label: `Get ${l.cols[l.pick]}, $${n(l.price)} a seat`, url: l.url },
      after: note(`Pay yearly and save ${l.yearlyOff}%.`),
      text: [`${n(l.used)} of ${n(l.cap)} free responses used this month. Every response is saved; past ${n(l.cap)} they stay hidden until you upgrade or the month turns on ${l.resets}.`, l.cols.join(" | "), ...l.rows.map((r) => `${r.label}: ${r.values.join(" | ")}`)],
    },
    f,
  );
}

export function helpMail(h: { url: string; sign?: Sign | null }, f: Foot): Mail {
  return mail(
    {
      subject: "Want a hand setting up Claritia?",
      preheader: "Reply and we'll set it up with you.",
      kicker: "We can help",
      title: "Want us to set it up with you?",
      sub: "Just reply to this email. A person on our team reads every reply.",
      visual: person(h.sign),
      body: para("Tell us what people should fill in and who should get the meetings. We'll build your first form with you and connect it to your calendar."),
      button: { label: "Open Claritia", url: h.url },
      text: ["Reply and tell us what people should fill in and who should get the meetings. We'll build your first form with you."],
    },
    f,
  );
}

export function awayMail(a: { responses: number; meetings: number; upcoming: number; since: string; latest: { form: string; when: string }[]; url: string }, f: Foot): Mail {
  const subject = a.responses ? `${plural(a.responses, "new response")} since you were last here` : `${plural(a.meetings, "meeting")} booked while you were away`;
  return mail(
    {
      subject,
      preheader: `Here's what came in since ${a.since}.`,
      kicker: "While you were away",
      title: "Here's what came in",
      sub: `Since your last visit on ${a.since}.`,
      visual: stats([
        { n: n(a.responses), label: "New responses" },
        { n: n(a.meetings), label: "Meetings booked" },
        { n: n(a.upcoming), label: "Coming up" },
      ]),
      body: a.latest.length ? label("Latest") + rows(a.latest.slice(0, 3).map((x) => ({ main: x.form, side: x.when }))) : para("Open Claritia to read every answer."),
      button: { label: "See what's new", url: a.url },
      text: [`Since ${a.since}: ${plural(a.responses, "new response")}, ${plural(a.meetings, "meeting")} booked, ${n(a.upcoming)} coming up.`, ...a.latest.slice(0, 3).map((x) => `- ${x.form}, ${x.when}`)],
    },
    f,
  );
}
