// Chats with Tia on one form (docs/studio-v2-plan.md, Part 13; supabase/migrations/166_studio_threads.sql). A form
// keeps its page in form_chats; each chat about it is a row in studio_threads with its messages, as the Studio shows
// them. Tia reads a chat's last turns, rebuilt here from its messages, plus the form as it is now, so a new chat
// still knows the form. Runs in the browser and on the server.

/** One message as the Studio shows it: the person's words, or Tia's answer with what it did or asks. */
export type ThreadMessage = {
  who: "me" | "ai";
  text: string;
  files?: string[];
  did?: string;
  ask?: { question: string; options: string[] };
  err?: string;
};

export type Turn = { role: "user" | "assistant"; content: string };

/** Messages a chat keeps, newest last. */
export const THREAD_MESSAGES = 100;
/** Turns Tia reads from a chat, besides the form. */
export const THREAD_TURNS = 20;
export const TITLE_MAX = 120;
/** A chat's messages as saved, in characters of JSON (the table's check allows 1,000,000). */
export const THREAD_SIZE = 900_000;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** One message cleaned: unknown fields dropped, words capped, what's only for the screen (live, status) left out. */
function cleanOne(raw: unknown): ThreadMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.who !== "me" && r.who !== "ai") return null;
  const m: ThreadMessage = { who: r.who, text: str(r.text, 20_000) };
  const files = Array.isArray(r.files) ? r.files.filter((f): f is string => typeof f === "string" && !!f).slice(0, 5).map((f) => f.slice(0, 120)) : [];
  if (files.length) m.files = files;
  const did = str(r.did, 120).trim();
  if (did) m.did = did;
  const err = str(r.err, 300).trim();
  if (err) m.err = err;
  const a = r.ask && typeof r.ask === "object" ? (r.ask as Record<string, unknown>) : null;
  const question = a ? str(a.question, 300).trim() : "";
  if (question) m.ask = { question, options: (Array.isArray(a!.options) ? a!.options : []).map((o) => String(o ?? "").slice(0, 120)).filter(Boolean).slice(0, 5) };
  if (!m.text.trim() && !m.files && !m.did && !m.err && !m.ask) return null;
  return m;
}

/** A chat's messages, cleaned: the newest THREAD_MESSAGES, and fewer when they'd pass THREAD_SIZE. */
export function cleanMessages(raw: unknown): ThreadMessage[] {
  let list = (Array.isArray(raw) ? raw : []).map(cleanOne).filter((m): m is ThreadMessage => !!m).slice(-THREAD_MESSAGES);
  while (list.length > 1 && JSON.stringify(list).length > THREAD_SIZE) list = list.slice(Math.ceil(list.length / 4));
  return list;
}

/** A chat's name: what was asked first, on one line, or "New chat". */
export function titleFrom(messages: ThreadMessage[]): string {
  const first = messages.find((m) => m.who === "me" && m.text.trim());
  return cleanTitle(first?.text) || "New chat";
}

export function cleanTitle(raw: unknown): string {
  const t = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  return t.length > 60 ? `${t.slice(0, 58).trimEnd()}…`.slice(0, TITLE_MAX) : t;
}

/**
 * What Tia reads from a chat: each question with the answer it got, as the turns the chat sent before (the person's
 * words with the files named; Tia's words, question and what it did in its tags). A question with no answer (stopped,
 * or an error) is left out, so the turns always go person, Tia, person. The newest THREAD_TURNS.
 */
export function turnsOf(messages: ThreadMessage[]): Turn[] {
  const out: Turn[] = [];
  for (let i = 0; i < messages.length; i++) {
    const me = messages[i]!;
    if (me.who !== "me") continue;
    const ai = messages[i + 1];
    if (!ai || ai.who !== "ai" || (!ai.text.trim() && !ai.did)) continue;
    out.push(
      { role: "user", content: me.files?.length ? `${me.text} [attached ${me.files.join(", ")}]` : me.text },
      { role: "assistant", content: `<say>${ai.text}</say>${ai.ask ? `<ask>${JSON.stringify(ai.ask)}</ask>` : ""}${ai.did ? `<did>${ai.did}</did>` : ""}` },
    );
    i++;
  }
  return out.slice(-THREAD_TURNS);
}

/**
 * The chat a form had before chats were kept one by one (its body's log, or its turns when the log is gone), as the
 * messages of its "Earlier chat". Empty when it had no conversation (a greeting from Tia alone isn't one). The same
 * rule as the move in 166.
 */
export function earlierMessages(body: unknown): ThreadMessage[] {
  const b = (body && typeof body === "object" ? body : {}) as { log?: unknown; turns?: unknown };
  const log = Array.isArray(b.log) ? b.log : [];
  if (log.some((m) => !!m && typeof m === "object" && (m as { who?: unknown }).who === "me")) return cleanMessages(log);
  const turns = Array.isArray(b.turns) ? b.turns : [];
  return cleanMessages(
    turns.map((t) => {
      const r = (t && typeof t === "object" ? t : {}) as { role?: unknown; content?: unknown };
      const c = typeof r.content === "string" ? r.content : "";
      if (r.role === "user") return { who: "me", text: c };
      if (r.role === "assistant") return { who: "ai", text: (/<say>([\s\S]*?)<\/say>/.exec(c)?.[1] ?? c).trim() };
      return null;
    }),
  );
}

/** When a chat last changed, as the history list says it: "Just now", "Today", "Yesterday" or "Nov 12". */
export function whenWords(iso: string | undefined, now = Date.now()): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return "";
  if (now - t < 60_000) return "Just now";
  const day = (x: number) => new Date(x).toDateString();
  if (day(t) === day(now)) return "Today";
  if (day(t) === day(now - 86_400_000)) return "Yesterday";
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(new Date(t).getFullYear() !== new Date(now).getFullYear() ? { year: "numeric" } : {}) });
}
