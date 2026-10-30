// What a form sends after a submission (docs/forms-plan.md Part 6): the team alert (email to the people picked, and
// a Slack post in the Routing channel), and the auto-reply to the person who sent it (from the routed rep or the team,
// with the rep's booking link). Also how long the form keeps its submissions. Settings are cleaned here; the emails
// are built here and sent by the form_notify job (worker-intel/jobs/forms.ts). Runs in the browser and on the server.

export type Notify = { on: boolean; to: string[]; subject: string; answers: boolean; slack: boolean };
export type Reply = { on: boolean; from: "owner" | "team"; subject: string; body: string; book: boolean; workOnly: boolean };
/** days: null keeps them forever. Contacts a submission made always stay. */
export type Keep = { days: number | null };

export const KEEP_DAYS = [30, 365, 1095] as const;
export const MERGE_TAGS = ["first_name", "name", "email", "company", "form"] as const;

export const DEFAULT_NOTIFY: Notify = { on: false, to: [], subject: "New submission: {{form}} from {{name}}", answers: true, slack: false };
export const DEFAULT_REPLY: Reply = {
  on: false,
  from: "owner",
  subject: "Thanks, {{first_name|there}}",
  body: "Hi {{first_name|there}},\n\nThanks for reaching out. We'll get back to you within one working day.",
  book: true,
  workOnly: true,
};
export const DEFAULT_KEEP: Keep = { days: null };

const EMAIL = /^[^\s@<>()",;:]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$/i;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max) : "");

export function cleanNotify(raw: unknown, errors: string[]): Notify | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const to = [...new Set((Array.isArray(r.to) ? r.to : []).map((x) => str(x, 320).toLowerCase()).filter((x) => EMAIL.test(x)))].slice(0, 10);
  const n: Notify = { on: r.on === true, to, subject: str(r.subject, 200) || DEFAULT_NOTIFY.subject, answers: r.answers !== false, slack: r.slack === true };
  if (n.on && !n.to.length && !n.slack) errors.push("Team alerts: add an email or turn on Slack.");
  return n;
}

export function cleanReply(raw: unknown, errors: string[], hasEmail: boolean): Reply | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const n: Reply = {
    on: r.on === true,
    from: r.from === "team" ? "team" : "owner",
    subject: str(r.subject, 200) || DEFAULT_REPLY.subject,
    body: str(r.body, 5000),
    book: r.book !== false,
    workOnly: r.workOnly !== false,
  };
  if (n.on && !n.body) errors.push("Auto-reply: write the message.");
  if (n.on && !hasEmail) errors.push("Auto-reply: the form needs an email field.");
  return n;
}

export function cleanKeep(raw: unknown): Keep | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const days = (KEEP_DAYS as readonly number[]).includes(Number(r.days)) ? Number(r.days) : null;
  return { days };
}

/** Sites a form takes submissions from, as bare host names ("acme.com"); subdomains count. */
export function cleanSites(raw: unknown): string[] {
  const out = new Set<string>();
  for (const x of Array.isArray(raw) ? raw : []) {
    const s = str(x, 200)
      .toLowerCase()
      .replace(/^[a-z]+:\/\//, "")
      .replace(/[/?#].*$/, "")
      .replace(/:\d+$/, "")
      .replace(/^www\./, "");
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s) || s === "localhost") out.add(s);
  }
  return [...out].slice(0, 20);
}

/** Whether a page's address is on one of the sites (or there's no list). A missing origin counts as off the list. */
export function siteAllowed(sites: string[] | undefined, origin: string | null | undefined): boolean {
  if (!sites?.length) return true;
  let host = "";
  try {
    host = new URL(origin ?? "").hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return false;
  }
  return sites.some((s) => host === s || host.endsWith(`.${s}`));
}

export type MergeValues = { first_name?: string | null; name?: string | null; email?: string | null; company?: string | null; form?: string | null };

/** Fills {{tag}} and {{tag|fallback}}; an unknown tag is left out. */
export function merge(text: string, v: MergeValues): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*(?:\|([^}]*))?\}\}/g, (_, tag: string, fallback?: string) => {
    const val = (v as Record<string, string | null | undefined>)[tag];
    return val && String(val).trim() ? String(val).trim() : (fallback ?? "").trim();
  });
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const FONT = "font-family:Inter,ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif";

function page(inner: string, preheader: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;${FONT}"><span style="display:none;max-height:0;overflow:hidden">${esc(preheader)}</span><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e7e7e9;border-radius:10px"><tr><td style="padding:28px 28px 24px;color:#0a0a0a;font-size:15px;line-height:1.55">${inner}</td></tr></table></td></tr></table></body></html>`;
}

export type AlertView = { form: string; lead: MergeValues; answers: { label: string; value: string }[]; showAnswers: boolean; subject: string; link: string; owner?: string | null };
export type MailParts = { subject: string; html: string; text: string };

/** The team's email for one submission. */
export function alertEmail(v: AlertView): MailParts {
  const subject = merge(v.subject, { ...v.lead, form: v.form }).slice(0, 200) || `New submission: ${v.form}`;
  const who = v.lead.name || v.lead.email || "Someone";
  const rows = v.showAnswers ? v.answers.filter((a) => a.value) : [];
  const table = rows.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 20px;border-top:1px solid #e7e7e9">${rows.map((a) => `<tr><td style="padding:10px 0;border-bottom:1px solid #e7e7e9;color:#71717a;font-size:13px;width:40%;vertical-align:top">${esc(a.label)}</td><td style="padding:10px 0 10px 12px;border-bottom:1px solid #e7e7e9;font-size:14px;vertical-align:top">${esc(a.value).replace(/\n/g, "<br>")}</td></tr>`).join("")}</table>`
    : "";
  const html = page(
    `<p style="margin:0 0 4px;font-family:'Geist Mono',ui-monospace,monospace;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#71717a">${esc(v.form)}</p><h1 style="margin:0;font-size:22px;line-height:1.2;letter-spacing:-.02em">${esc(who)}</h1>${v.owner ? `<p style="margin:4px 0 0;color:#71717a;font-size:14px">Routed to ${esc(v.owner)}</p>` : ""}${table}<a href="${esc(v.link)}" style="display:inline-block;margin-top:${rows.length ? 0 : 20}px;background:#0a0a0a;color:#ffffff;text-decoration:none;font-weight:500;font-size:14px;padding:11px 20px;border-radius:999px">Open submission</a>`,
    `${who} sent ${v.form}`,
  );
  const text = [`${who} sent ${v.form}.`, v.owner ? `Routed to ${v.owner}.` : "", "", ...rows.map((a) => `${a.label}: ${a.value}`), "", `Open: ${v.link}`].filter((l, i, a) => l || a[i - 1]).join("\n");
  return { subject, html, text };
}

export type ReplyView = { reply: Reply; lead: MergeValues; form: string; sender: string; booking?: string | null };

/** The auto-reply to the person who sent the form. */
export function replyEmail(v: ReplyView): MailParts {
  const vals = { ...v.lead, form: v.form };
  const subject = merge(v.reply.subject, vals).slice(0, 200) || "Thanks";
  const body = merge(v.reply.body, vals);
  const paras = body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const book = v.reply.book && v.booking ? v.booking : null;
  const html = page(
    `${paras.map((p) => `<p style="margin:0 0 14px">${esc(p).replace(/\n/g, "<br>")}</p>`).join("")}${book ? `<a href="${esc(book)}" style="display:inline-block;margin:6px 0 14px;background:#0a0a0a;color:#ffffff;text-decoration:none;font-weight:500;font-size:14px;padding:11px 20px;border-radius:999px">Pick a time</a>` : ""}<p style="margin:8px 0 0;color:#71717a">${esc(v.sender)}</p>`,
    paras[0]?.slice(0, 120) ?? subject,
  );
  const text = [...paras, ...(book ? [`Pick a time: ${book}`] : []), "", v.sender].join("\n\n").replace(/\n{3,}/g, "\n\n");
  return { subject, html, text };
}

/** Whether the auto-reply goes to this lead: a valid address, and a work address when the form says so. */
export function replyGoes(reply: Reply | undefined, email: string | null | undefined, emailClass: string | null | undefined): boolean {
  if (!reply?.on || !reply.body.trim() || !email || !EMAIL.test(email)) return false;
  return !reply.workOnly || (emailClass !== "free" && emailClass !== "disposable");
}
