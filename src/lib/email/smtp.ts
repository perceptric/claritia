// A small SMTP client for raw messages (docs/enrich-workflows-reports.md Part 0). Meeting emails carry a calendar
// invite as its own MIME part, which Resend's API can't take, so they go through Resend's SMTP relay
// (smtp.resend.com, port 465 with TLS, user "resend", the API key as password; check).
//
// What the answer means for sending again:
//   - Anything that goes wrong before the message's last line is sent means nothing was delivered: try again.
//   - A 4xx after the last line is a "not now": try again. A 5xx anywhere is a no: failed.
//   - A dropped connection or a timeout after the last line is unknown: the message may have gone out.

import net from "node:net";
import { hostname } from "node:os";
import tls from "node:tls";
import { SendError } from "./provider.ts";

export type SmtpOpts = { host: string; port: number; user: string; pass: string; secure?: boolean; timeoutMs?: number; helo?: string };

type Reply = { code: number; text: string };

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Lines that start with a dot get a second one (RFC 5321 4.5.2), and every line ends in CRLF. */
export function dotStuff(raw: string): string {
  return raw
    .replace(/\r?\n/g, "\r\n")
    .split("\r\n")
    .map((l) => (l.startsWith(".") ? `.${l}` : l))
    .join("\r\n");
}

/** Send one raw message. Returns the relay's message id when its answer holds one, else "". */
export async function smtpSend(o: SmtpOpts, m: { from: string; to: string; raw: string }): Promise<string> {
  const timeout = o.timeoutMs ?? 20_000;
  let buf = "";
  let waiting: ((r: Reply | Error) => void) | null = null;
  let closed: Error | null = null;
  let afterData = false;

  const fail = (msg: string, code = 0) => {
    // Before the last line went out, nothing was delivered.
    if (!afterData) return new SendError(`SMTP: ${msg}`, { status: code, retry: true });
    return new SendError(`SMTP: ${msg}`, { status: code, unknown: true });
  };

  const onData = (chunk: Buffer) => {
    buf += chunk.toString("utf8");
    // A reply ends on a line "NNN text" (a space after the code); "NNN-text" lines continue it.
    const lines = buf.split("\r\n");
    for (let i = 0; i < lines.length - 1; i++) {
      if (/^\d{3} /.test(lines[i]) || /^\d{3}$/.test(lines[i])) {
        const text = lines.slice(0, i + 1).join("\n");
        buf = lines.slice(i + 1).join("\r\n");
        const w = waiting;
        waiting = null;
        w?.({ code: Number(lines[i].slice(0, 3)), text });
        return;
      }
    }
  };

  const read = () =>
    new Promise<Reply>((resolve, reject) => {
      if (closed) return reject(closed);
      const timer = setTimeout(() => {
        waiting = null;
        reject(fail("the server stopped answering"));
      }, timeout);
      waiting = (r) => {
        clearTimeout(timer);
        if (r instanceof Error) reject(r);
        else resolve(r);
      };
      onData(Buffer.alloc(0));
    });

  const write = (line: string) => {
    if (closed) throw closed;
    socket.write(line);
  };

  const step = async (line: string | null, ok: number[]): Promise<Reply> => {
    if (line !== null) write(`${line}\r\n`);
    const r = await read();
    if (!ok.includes(r.code)) {
      const text = r.text.replace(/\s+/g, " ").slice(0, 300);
      if (r.code >= 500) throw new SendError(`SMTP ${text}`, { status: r.code });
      // A 4xx means not now; nothing was taken.
      throw new SendError(`SMTP ${text}`, { status: r.code, retry: true });
    }
    return r;
  };

  const socket = await new Promise<net.Socket>((resolve, reject) => {
    const s = o.secure === false ? net.connect({ host: o.host, port: o.port }) : tls.connect({ host: o.host, port: o.port, servername: o.host });
    const timer = setTimeout(() => {
      s.destroy();
      reject(fail("couldn't connect"));
    }, timeout);
    s.once(o.secure === false ? "connect" : "secureConnect", () => {
      clearTimeout(timer);
      resolve(s);
    });
    s.once("error", (e) => {
      clearTimeout(timer);
      reject(fail(e.message));
    });
  });
  socket.on("data", onData);
  socket.on("error", (e) => {
    closed = fail(e.message);
    waiting?.(closed);
  });
  socket.on("close", () => {
    closed ??= fail("the connection closed");
    waiting?.(closed);
  });

  try {
    await step(null, [220]);
    await step(`EHLO ${o.helo ?? hostname() ?? "claritia"}`, [250]);
    await step(`AUTH PLAIN ${Buffer.from(`\0${o.user}\0${o.pass}`, "utf8").toString("base64")}`, [235]);
    await step(`MAIL FROM:<${m.from}>`, [250]);
    await step(`RCPT TO:<${m.to}>`, [250, 251]);
    await step("DATA", [354]);
    write(`${dotStuff(m.raw).replace(/(\r\n)?$/, "")}\r\n.\r\n`);
    afterData = true;
    const r = await read();
    if (r.code >= 500) throw new SendError(`SMTP ${r.text.replace(/\s+/g, " ").slice(0, 300)}`, { status: r.code });
    if (r.code >= 400) throw new SendError(`SMTP ${r.text.replace(/\s+/g, " ").slice(0, 300)}`, { status: r.code, retry: true });
    if (r.code !== 250) throw fail(`unexpected answer ${r.code}`, r.code);
    try {
      write("QUIT\r\n");
    } catch {
      // Sent already; a failed goodbye changes nothing.
    }
    return r.text.match(UUID)?.[0] ?? "";
  } finally {
    socket.end();
    setTimeout(() => socket.destroy(), 1000).unref();
  }
}

export function smtpFromEnv(env: NodeJS.ProcessEnv = process.env): SmtpOpts | null {
  const key = env.RESEND_API_KEY?.trim();
  if (!key) return null;
  return { host: env.SMTP_HOST?.trim() || "smtp.resend.com", port: Number(env.SMTP_PORT || 465), user: env.SMTP_USER?.trim() || "resend", pass: env.SMTP_PASS?.trim() || key };
}
