import { readOutcomeToken } from "@/lib/meetings/links";
import { serviceClient } from "@/lib/serviceClient";

// The host's Held and No-show links from the "How did it go?" email (docs/meetings-scheduler.md 1.7).
//   GET: a page with the one button. Opening it changes nothing, because mail filters open every link.
//   POST from that page: meeting_outcome marks the meeting and queues meeting_notify. Each email's links work once,
//   only for the meeting they name, and never over a status someone already set.

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function page(title: string, body: string, status = 200) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap">
<style>
:root{color-scheme:light dark;--paper:#f7f7f5;--card:#ffffff;--ink:#0a0a0a;--muted:#6b6b6b;--line:#e7e7e4}
@media (prefers-color-scheme:dark){:root{--paper:#0a0a0a;--card:#161616;--ink:#fafafa;--muted:#a3a3a3;--line:rgb(242 241 237/.1)}}
body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;-webkit-font-smoothing:antialiased}
main{max-width:440px;margin:12vh auto 0;padding:0 16px}
section{background:var(--card);border:1px solid var(--line);border-radius:24px;padding:28px}
h1{font-weight:600;font-size:24px;line-height:1.2;letter-spacing:-.02em;margin:0 0 10px}
p{margin:0 0 20px;color:var(--muted)}
button{font:inherit;font-size:13.5px;font-weight:500;height:36px;border-radius:999px;padding:0 16px;cursor:pointer;border:1px solid var(--ink);background:var(--ink);color:var(--paper);transition:transform 140ms cubic-bezier(.2,.8,.2,1),opacity 140ms}
button:hover{opacity:.85}
button:active{transform:scale(.98)}
@media (prefers-reduced-motion:reduce){button{transition:none}}
</style></head><body><main><section>${body}</section></main></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "Referrer-Policy": "no-referrer" } });
}

const LABEL = { held: "held", no_show: "a no-show" } as const;
const gone = () => page("Link not valid", `<h1>This link isn't valid</h1><p>Mark the meeting in Claritia instead.</p>`, 404);

async function load(params: Promise<{ token: string }>) {
  const { token } = await params;
  try {
    return { token, t: readOutcomeToken(token) };
  } catch {
    return { token, t: null };
  }
}

type Meeting = { guest_name: string | null; guest_email: string; status: string };

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token, t } = await load(params);
  const db = serviceClient();
  if (!t || !db) return gone();
  const { data } = await db.from("meetings").select("guest_name, guest_email, status").eq("id", t.meeting).maybeSingle();
  const m = data as Meeting | null;
  if (!m) return gone();
  const guest = esc(m.guest_name || m.guest_email);
  return page(
    "Mark the meeting",
    `<h1>Mark the meeting with ${guest} as ${LABEL[t.outcome]}</h1><p>${t.outcome === "held" ? "It took place." : `${guest} didn't join.`}</p><form method="post" action="/api/meetings/outcome/${esc(token)}"><button>${t.outcome === "held" ? "Mark as held" : "Mark as no-show"}</button></form>`,
  );
}

export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { t } = await load(params);
  const db = serviceClient();
  if (!t || !db) return gone();
  const { data, error } = await db.rpc("meeting_outcome", { p_meeting: t.meeting, p_status: t.outcome, p_nonce: t.nonce });
  if (error) return page("Something went wrong", `<h1>That didn't work</h1><p>Try again in a minute.</p>`, 500);
  const r = data as { result: "ok" | "used" | "marked" | "not_started" | "not_found"; status?: string } | null;
  const status = r?.status === "no_show" ? "a no-show" : r?.status === "canceled" ? "canceled" : (r?.status ?? "");
  switch (r?.result) {
    case "ok":
      return page("Marked", `<h1>Marked as ${LABEL[t.outcome]}</h1><p>The meeting is updated.</p>`);
    case "used":
      return page("Already used", `<h1>This link was already used</h1><p>${status ? `The meeting is marked as ${esc(status)}.` : ""}</p>`, 409);
    case "marked":
      return page("Already marked", `<h1>Already marked as ${esc(status)}</h1><p>Change it in Claritia if it's wrong.</p>`, 409);
    case "not_started":
      return page("Not started", `<h1>The meeting hasn't started yet</h1><p>Mark it after it starts.</p>`, 409);
    default:
      return gone();
  }
}
