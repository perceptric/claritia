// Share › Email › Send the link (docs/sharing-plan.md): the addresses it goes to and the email itself. Runs anywhere.

const EMAIL = /^[^\s@<>()",;:]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$/i;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The most people one send goes to. */
export const MAX_TO = 200;

/** The addresses to send to: cleaned, each once. Null when one isn't an address or there are too many. */
export function addressesOf(raw: unknown): string[] | null {
  const list = (Array.isArray(raw) ? raw : []).filter((x): x is string => typeof x === "string").map((x) => x.trim().toLowerCase()).filter(Boolean);
  const out = [...new Set(list)];
  if (!out.length || out.length > MAX_TO || out.some((a) => !EMAIL.test(a))) return null;
  return out;
}

/** The email: the form's name, the team's note, and its link as a button. The subject is the form's name unless one is given. */
export function shareEmail(o: { name: string; link: string; message: string; button: string; subject?: string }): { subject: string; html: string; text: string } {
  const note = o.message.trim();
  const html = `<!doctype html><html><body style="margin:0;padding:32px 16px;background:#fafafa"><div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #eaeaea;border-radius:10px;padding:32px;font:15px/1.6 -apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#0a0a0a">
<p style="margin:0 0 ${note ? 12 : 24}px;font-size:20px;font-weight:600;line-height:1.3">${esc(o.name)}</p>
${note ? `<p style="margin:0 0 24px;white-space:pre-line">${esc(note)}</p>` : ""}
<p style="margin:0"><a href="${esc(o.link)}" style="display:inline-block;background:#0a0a0a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:600">${esc(o.button)}</a></p>
</div></body></html>`;
  const text = `${o.name}\n\n${note ? `${note}\n\n` : ""}${o.button}: ${o.link}\n`;
  return { subject: (o.subject ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, 200) || o.name, html, text };
}
