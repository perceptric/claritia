// Chats with Tia on one form (src/lib/studio/threads.ts, supabase/migrations/166_studio_threads.sql): messages cleaned
// before they're kept, a chat named after its first message, Tia's turns rebuilt from the messages (only answered
// questions, newest 20), and a form's conversation from before moved into its "Earlier chat" by the same rule as 166.
import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanMessages, cleanTitle, earlierMessages, THREAD_MESSAGES, THREAD_TURNS, titleFrom, turnsOf, whenWords, type ThreadMessage } from "../src/lib/studio/threads.ts";

test("messages are cleaned: unknown kinds and screen-only fields go, words are capped, the newest 100 stay", () => {
  const out = cleanMessages([
    { who: "me", text: "Make a form", live: true },
    { who: "ai", text: "Done", did: "Built the form", status: "Thinking", live: false, ask: { question: "Add a phone?", options: ["Yes", 2, ""] } },
    { who: "system", text: "x" },
    null,
    { who: "ai", text: "   " },
    { who: "me", text: "a".repeat(30_000), files: ["a.png", 5, "b.pdf"] },
  ]);
  assert.equal(out.length, 3);
  assert.deepEqual(out[0], { who: "me", text: "Make a form" });
  assert.deepEqual(out[1], { who: "ai", text: "Done", did: "Built the form", ask: { question: "Add a phone?", options: ["Yes", "2"] } });
  assert.equal(out[2]!.text.length, 20_000);
  assert.deepEqual(out[2]!.files, ["a.png", "b.pdf"]);
  const many = Array.from({ length: 150 }, (_, i) => ({ who: i % 2 ? "ai" : "me", text: `m${i}` }));
  const kept = cleanMessages(many);
  assert.equal(kept.length, THREAD_MESSAGES);
  assert.equal(kept.at(-1)!.text, "m149");
  assert.deepEqual(cleanMessages("nope"), []);
});

test("a chat is named after what was asked first, on one line", () => {
  assert.equal(titleFrom([{ who: "ai", text: "Hi" }, { who: "me", text: "  A daily\n check-in  " }]), "A daily check-in");
  assert.equal(titleFrom([]), "New chat");
  const long = cleanTitle("word ".repeat(30));
  assert.ok(long.length <= 60 && long.endsWith("…"));
  assert.equal(cleanTitle(42), "");
});

test("Tia's turns come from answered questions only, person then Tia, with files named and tags kept", () => {
  const msgs: ThreadMessage[] = [
    { who: "me", text: "Make a form", files: ["old.png"] },
    { who: "ai", text: "Built it.", did: "Built the form", ask: { question: "Add a phone?", options: ["Yes"] } },
    { who: "me", text: "Stop this" },
    { who: "ai", text: "", err: "Tia didn't finish. Try again." },
    { who: "me", text: "Call it Check-in" },
    { who: "ai", text: "Renamed.", did: "Renamed the title" },
    { who: "me", text: "No answer yet" },
  ];
  const turns = turnsOf(msgs);
  assert.deepEqual(turns, [
    { role: "user", content: "Make a form [attached old.png]" },
    { role: "assistant", content: '<say>Built it.</say><ask>{"question":"Add a phone?","options":["Yes"]}</ask><did>Built the form</did>' },
    { role: "user", content: "Call it Check-in" },
    { role: "assistant", content: "<say>Renamed.</say><did>Renamed the title</did>" },
  ]);
  const long: ThreadMessage[] = Array.from({ length: 60 }, (_, i) => ({ who: i % 2 ? "ai" : "me", text: `t${i}` }));
  const t = turnsOf(long);
  assert.equal(t.length, THREAD_TURNS);
  assert.equal(t[0]!.role, "user");
  assert.equal(t.at(-1)!.content, "<say>t59</say>");
  assert.deepEqual(turnsOf([]), []);
});

test("a form's earlier conversation: its log when it has the owner's words, else its turns, else nothing", () => {
  assert.deepEqual(earlierMessages({ log: [{ who: "ai", text: "Hello" }, { who: "me", text: "Make a form" }, { who: "ai", text: "Done", live: true, status: "x" }] }), [
    { who: "ai", text: "Hello" },
    { who: "me", text: "Make a form" },
    { who: "ai", text: "Done" },
  ]);
  assert.deepEqual(earlierMessages({ log: [], turns: [{ role: "user", content: "Add phone" }, { role: "assistant", content: "<say>Added\nphone.</say><did>Changed the form</did>" }] }), [
    { who: "me", text: "Add phone" },
    { who: "ai", text: "Added\nphone." },
  ]);
  // A greeting from Tia alone isn't a conversation.
  assert.deepEqual(earlierMessages({ log: [{ who: "ai", text: "Finch uses green" }] }), []);
  assert.deepEqual(earlierMessages({}), []);
  assert.deepEqual(earlierMessages(null), []);
});

test("when a chat last changed, in the history list's words", () => {
  const now = Date.parse("2026-11-14T15:00:00");
  assert.equal(whenWords(new Date(now - 20_000).toISOString(), now), "Just now");
  assert.equal(whenWords(new Date(now - 3 * 3_600_000).toISOString(), now), "Today");
  assert.equal(whenWords(new Date(now - 26 * 3_600_000).toISOString(), now), "Yesterday");
  assert.equal(whenWords("2026-11-02T10:00:00", now), "Nov 2");
  assert.equal(whenWords("2025-03-02T10:00:00", now), "Mar 2, 2025");
  assert.equal(whenWords(undefined, now), "");
});
