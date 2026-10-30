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

type Msg = { from: string; to: string; raw: string };

/** One connection to the relay: signed in once, then one message after another. */
class Connection {
  private buf = "";
  private waiting: ((r: Reply | Error) => void) | null = null;
  private closed: Error | null = null;
  private afterData = false;
  private socket: net.Socket | null = null;
  private readonly o: SmtpOpts;
  constructor(o: SmtpOpts) {
    this.o = o;
  }

  get open() {
    return !!this.socket && !this.closed;
  }

  private fail(msg: string, code = 0) {
    // Before the last line went out, nothing was delivered.
    if (!this.afterData) return new SendError(`SMTP: ${msg}`, { status: code, retry: true });
    return new SendError(`SMTP: ${msg}`, { status: code, unknown: true });
  }

  private onData = (chunk: Buffer) => {
    this.buf += chunk.toString("utf8");
    // A reply ends on a line "NNN text" (a space after the code); "NNN-text" lines continue it.
    const lines = this.buf.split("\r\n");
    for (let i = 0; i < lines.length - 1; i++) {
      if (/^\d{3} /.test(lines[i]) || /^\d{3}$/.test(lines[i])) {
        const text = lines.slice(0, i + 1).join("\n");
        this.buf = lines.slice(i + 1).join("\r\n");
        const w = this.waiting;
        this.waiting = null;
        w?.({ code: Number(lines[i].slice(0, 3)), text });
        return;
      }
    }
  };

  private read() {
    return new Promise<Reply>((resolve, reject) => {
      if (this.closed) return reject(this.closed);
      const timer = setTimeout(() => {
        this.waiting = null;
        reject(this.fail("the server stopped answering"));
      }, this.o.timeoutMs ?? 20_000);
      this.waiting = (r) => {
        clearTimeout(timer);
        if (r instanceof Error) reject(r);
        else resolve(r);
      };
      this.onData(Buffer.alloc(0));
    });
  }

  private write(line: string) {
    if (this.closed || !this.socket) throw this.closed ?? this.fail("not connected");
    this.socket.write(line);
  }

  private async step(line: string | null, ok: number[]): Promise<Reply> {
    if (line !== null) this.write(`${line}\r\n`);
    const r = await this.read();
    if (!ok.includes(r.code)) {
      const text = r.text.replace(/\s+/g, " ").slice(0, 300);
      if (r.code >= 500) throw new SendError(`SMTP ${text}`, { status: r.code });
      // A 4xx means not now; nothing was taken.
      throw new SendError(`SMTP ${text}`, { status: r.code, retry: true });
    }
    return r;
  }

  async connect() {
    const o = this.o;
    const timeout = o.timeoutMs ?? 20_000;
    this.afterData = false;
    const socket = await new Promise<net.Socket>((resolve, reject) => {
      const s = o.secure === false ? net.connect({ host: o.host, port: o.port }) : tls.connect({ host: o.host, port: o.port, servername: o.host });
      const timer = setTimeout(() => {
        s.destroy();
        reject(this.fail("couldn't connect"));
      }, timeout);
      s.once(o.secure === false ? "connect" : "secureConnect", () => {
        clearTimeout(timer);
        resolve(s);
      });
      s.once("error", (e) => {
        clearTimeout(timer);
        reject(this.fail(e.message));
      });
    });
    this.socket = socket;
    socket.on("data", this.onData);
    socket.on("error", (e) => {
      this.closed = this.fail(e.message);
      this.waiting?.(this.closed);
    });
    socket.on("close", () => {
      this.closed ??= this.fail("the connection closed");
      this.waiting?.(this.closed);
    });
    await this.step(null, [220]);
    await this.step(`EHLO ${o.helo ?? hostname() ?? "claritia"}`, [250]);
    await this.step(`AUTH PLAIN ${Buffer.from(`\0${o.user}\0${o.pass}`, "utf8").toString("base64")}`, [235]);
  }

  /** One message on the open connection. Returns the relay's message id when its answer holds one, else "". */
  async send(m: Msg): Promise<string> {
    this.afterData = false;
    await this.step(`MAIL FROM:<${m.from}>`, [250]);
    await this.step(`RCPT TO:<${m.to}>`, [250, 251]);
    await this.step("DATA", [354]);
    this.write(`${dotStuff(m.raw).replace(/(\r\n)?$/, "")}\r\n.\r\n`);
    this.afterData = true;
    const r = await this.read();
    if (r.code >= 500) throw new SendError(`SMTP ${r.text.replace(/\s+/g, " ").slice(0, 300)}`, { status: r.code });
    if (r.code >= 400) throw new SendError(`SMTP ${r.text.replace(/\s+/g, " ").slice(0, 300)}`, { status: r.code, retry: true });
    if (r.code !== 250) throw this.fail(`unexpected answer ${r.code}`, r.code);
    return r.text.match(UUID)?.[0] ?? "";
  }

  close() {
    const socket = this.socket;
    if (!socket) return;
    try {
      if (!this.closed) socket.write("QUIT\r\n");
    } catch {
      // Sent already; a failed goodbye changes nothing.
    }
    socket.end();
    setTimeout(() => socket.destroy(), 1000).unref();
    this.socket = null;
  }
}

/** Send one raw message on its own connection. Returns the relay's message id when its answer holds one, else "". */
export async function smtpSend(o: SmtpOpts, m: Msg): Promise<string> {
  const c = new Connection(o);
  try {
    await c.connect();
    return await c.send(m);
  } finally {
    c.close();
  }
}

/**
 * Several messages over one connection (a meeting's guest and hosts): signed in once. A connection the relay closed
 * between messages is opened again before the next one is started; an error that leaves the connection unsure
 * closes it, so the next message starts on a fresh one. Call close() when done.
 */
export function smtpSession(o: SmtpOpts): { send(m: Msg): Promise<string>; close(): void } {
  let c: Connection | null = null;
  return {
    async send(m) {
      // A connection that went quiet since the last message: start over, nothing of this one was sent.
      if (c && !c.open) {
        c.close();
        c = null;
      }
      const fresh = !c;
      if (!c) {
        c = new Connection(o);
        try {
          await c.connect();
        } catch (e) {
          c.close();
          c = null;
          throw e;
        }
      }
      try {
        return await c.send(m);
      } catch (e) {
        const se = e instanceof SendError ? e : null;
        c.close();
        c = null;
        // A reused connection that the relay had dropped before this message started: once more on a new one.
        if (!fresh && se?.retry && !se.status) return await this.send(m);
        throw e;
      }
    },
    close() {
      c?.close();
      c = null;
    },
  };
}

export function smtpFromEnv(env: NodeJS.ProcessEnv = process.env): SmtpOpts | null {
  const key = env.RESEND_API_KEY?.trim();
  if (!key) return null;
  return { host: env.SMTP_HOST?.trim() || "smtp.resend.com", port: Number(env.SMTP_PORT || 465), user: env.SMTP_USER?.trim() || "resend", pass: env.SMTP_PASS?.trim() || key };
}
