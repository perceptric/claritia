// /book in Slack (docs/router.md Part 17): "/book dana@acme.com" answers, only to the person who typed it, with a
// single-use booking link for the lead. The host is the lead's owner when it has one, else the person asking; words
// after the email pick the meeting type by name ("/book dana@acme.com demo"). Server only.

import type { Rpc } from "../jobs.ts";
import { checkLink, withDefaults, type LinkRow } from "../meetings/public.ts";
import type { MeetingType } from "../meetings/types.ts";
import { buttons, esc, section } from "./app.ts";

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

type Info = {
  contact: { id: string; name: string | null; email: string } | null;
  host: { id: string; name: string; email: string } | null;
  workspace: { id: string; slug: string };
  types: { id: string; name: string; slug: string }[];
};

export type Reply = { response_type: "ephemeral"; text: string; blocks?: unknown[] };

const say = (text: string): Reply => ({ response_type: "ephemeral", text });

/** Slack wraps emails it recognizes as <mailto:a@b.co|a@b.co>. */
export function parseBook(text: string): { email: string | null; words: string[] } {
  const parts = text.replace(/<mailto:[^|>]+\|([^>]+)>/g, "$1").trim().split(/\s+/).filter(Boolean);
  const i = parts.findIndex((p) => EMAIL.test(p));
  return { email: i >= 0 ? parts[i]!.toLowerCase() : null, words: parts.filter((_, j) => j !== i).map((w) => w.toLowerCase()) };
}

/** The type whose name shares the most words with what was typed; the first by name when nothing was typed. */
export function pickType<T extends { name: string }>(types: T[], words: string[]): T | null {
  if (!types.length) return null;
  if (!words.length) return types[0]!;
  let best: T | null = null;
  let score = 0;
  for (const t of types) {
    const name = t.name.toLowerCase();
    const s = words.filter((w) => name.includes(w)).length;
    if (s > score) {
      best = t;
      score = s;
    }
  }
  return best;
}

export async function slackBook(
  o: { rpc: Rpc; ws: string; user: string; text: string; base: string; loadType: (id: string) => Promise<MeetingType | null>; saveLink: (row: LinkRow & { workspace_id: string }) => Promise<void> },
): Promise<Reply> {
  const { email, words } = parseBook(o.text);
  if (!email) return say("Type /book and the lead's email, like /book dana@acme.com");
  const { data, error } = await o.rpc("slack_book_info", { p_ws: o.ws, p_user: o.user, p_email: email });
  if (error) throw new Error(error.message);
  const info = data as Info;
  if (!info.host) return say("Couldn't find the host in Claritia.");
  const t = pickType(info.types, words);
  if (!t) return say(words.length && info.types.length ? `No meeting type matches "${words.join(" ")}".` : `${info.host.name} has no meeting types yet.`);
  const type = await o.loadType(t.id);
  if (!type) return say("That meeting type was turned off.");
  const made = checkLink({ kind: "single_use", typeId: type.id }, { owner: info.host.id, type: withDefaults(type) });
  if ("errors" in made) return say(made.errors[0]!);
  await o.saveLink({ workspace_id: o.ws, ...made.row });
  const q = new URLSearchParams({ email });
  if (info.contact?.name) q.set("name", info.contact.name);
  const url = `${o.base.replace(/\/$/, "")}/book/l/${made.token}?${q}`;
  const lead = info.contact?.name || email;
  const text = `${lead} can book ${type.name} with ${info.host.name}. The link works once.`;
  return {
    response_type: "ephemeral",
    text: `${text} ${url}`,
    blocks: [section(`${esc(text)}\n<${url}|${esc(url)}>`), buttons([{ text: "Open link", url }])],
  };
}
