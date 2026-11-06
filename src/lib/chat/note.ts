// A team alert for chat tools (docs/integrations-plan.md, Next step 5): a bold line and labeled rows, like the Slack
// alert, with a link to the full fill. Each tool gets it in its own format and within its own limits: a long answer
// is cut, and the link has all of it. Runs anywhere.

export type ChatNote = { title: string; rows: { label: string; value: string }[]; link?: string };

/** Cut to `n` characters, with an ellipsis when something was left out (the link has the rest). */
export const cut = (s: string, n: number) => ([...s].length <= n ? s : `${[...s].slice(0, n - 1).join("").trimEnd()}…`);

const isLink = (u?: string) => !!u && /^https:\/\//.test(u);

/** Discord: one embed, up to 25 fields of 1,024 characters, 6,000 in all; nobody gets pinged by an answer. */
export function discordBody(n: ChatNote) {
  const title = cut(n.title, 256);
  let room = 6000 - title.length - 40;
  const fields: { name: string; value: string; inline: boolean }[] = [];
  for (const r of n.rows.slice(0, 24)) {
    const name = cut(r.label || "Answer", 256);
    const value = cut(r.value || "-", 1024);
    if (name.length + value.length > room) break;
    room -= name.length + value.length;
    fields.push({ name, value, inline: value.length <= 40 });
  }
  const more = n.rows.length - fields.length;
  if (more > 0) fields.push({ name: "More", value: `${more} more ${more === 1 ? "answer" : "answers"} in Claritia`, inline: false });
  return {
    allowed_mentions: { parse: [] as string[] },
    embeds: [{ title, ...(isLink(n.link) ? { url: n.link } : {}), fields, color: 0x0c8c5e }],
  };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Microsoft Teams: a channel message in its HTML, each answer up to 1,000 characters, under 20,000 in all. */
export function teamsHtml(n: ChatNote): string {
  const parts = [`<p><strong>${esc(cut(n.title, 300))}</strong></p>`];
  let size = parts[0]!.length;
  let shown = 0;
  for (const r of n.rows.slice(0, 40)) {
    const p = `<p><strong>${esc(cut(r.label || "Answer", 200))}</strong><br>${esc(cut(r.value || "-", 1000)).replace(/\n/g, "<br>")}</p>`;
    if (size + p.length > 19_000) break;
    parts.push(p);
    size += p.length;
    shown++;
  }
  const more = n.rows.length - shown;
  if (more > 0) parts.push(`<p>${more} more ${more === 1 ? "answer" : "answers"} in Claritia</p>`);
  if (isLink(n.link)) parts.push(`<p><a href="${esc(n.link!)}">Open in Claritia</a></p>`);
  return parts.join("");
}
