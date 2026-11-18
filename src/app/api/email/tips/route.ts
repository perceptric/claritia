import { APP_URL } from "@/lib/site";
import { serviceClient } from "@/lib/serviceClient";
import { readTipsToken } from "@/lib/tips/token";

// The "Turn them off" link in getting-started emails (src/lib/tips/send.ts, docs/getting-started-emails.md). Opening
// it shows one button, so a mail scanner that follows links never turns them off. Mail apps POST here directly from
// the List-Unsubscribe header (RFC 8058). The look is the sign-in emails' (off-white page, white card, dark pill).

const base = () => (process.env.APP_URL?.trim() || APP_URL).replace(/\/+$/, "");
const settings = () => `${base()}/settings/profile`;

const page = (title: string, body: string, status = 200) =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title>
<style>body{margin:0;font:14px/1.55 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:#171717;background:#fafaf5;display:grid;place-items:center;min-height:100vh;padding:16px;box-sizing:border-box}main{background:#fff;border:1px solid #ebebe4;border-radius:18px;padding:32px 28px;max-width:380px;width:100%;box-sizing:border-box;text-align:center}h1{font-size:20px;line-height:1.2;font-weight:500;letter-spacing:-0.02em;color:#0f0f0f;margin:0 0 8px}p{margin:0 0 20px;color:#6c6c6d}button{font:inherit;font-weight:500;background:#333;color:#fff;border:1px solid #1f1f1f;border-radius:999px;padding:11px 22px;cursor:pointer}button:focus-visible{outline:none;box-shadow:0 0 0 1px #0c8c5e,0 0 0 4px #e3f4ec}a{color:#171717}</style></head>
<body><main>${body}</main></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );

const token = (request: Request) => readTipsToken(new URL(request.url).searchParams.get("t") ?? "");

export async function GET(request: Request) {
  if (!token(request)) return page("Link not valid", `<h1>This link isn't valid</h1><p style="margin:0">You can turn tips off in <a href="${settings()}">Settings</a>.</p>`, 400);
  return page("Turn off tips", `<h1>Turn off getting-started tips?</h1><p>Your other Claritia emails stay on.</p><form method="post"><button type="submit">Turn them off</button></form>`);
}

export async function POST(request: Request) {
  const who = token(request);
  if (!who) return Response.json({ error: "This link isn't valid." }, { status: 400 });
  const db = serviceClient();
  if (!db) return page("Something went wrong", `<h1>That didn't save</h1><p style="margin:0">Try again in a moment, or use <a href="${settings()}">Settings</a>.</p>`, 503);
  // A hiccup is tried again with growing waits.
  for (let attempt = 0; ; attempt++) {
    const { error } = await db.from("workspace_members").update({ tips: false }).eq("workspace_id", who.workspaceId).eq("user_id", who.userId);
    if (!error) break;
    if (attempt >= 2) return page("Something went wrong", `<h1>That didn't save</h1><p style="margin:0">Try again in a moment, or use <a href="${settings()}">Settings</a>.</p>`, 500);
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
  }
  return page("Tips off", `<h1>Tips are off</h1><p style="margin:0">You won't get getting-started emails again. Your other Claritia emails stay on.</p>`);
}
