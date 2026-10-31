// The meeting description (src/lib/meetings/description.ts, inviteInfo.ts, worker-intel/jobs/calendars.ts): every
// booked meeting's calendar event says who booked, from which form, their answers and their reschedule and cancel
// link, and a reschedule writes it again. The flaky cases: the extra read fails (the event is still made, with what
// the meeting has), a group event (no one guest's answers or link on it), answers that repeat the guest or run long.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Job, Rpc } from "../src/lib/jobs.ts";
import { DESCRIPTION_MAX, formAnswers, meetingDescription } from "../src/lib/meetings/description.ts";
import type { FullProvider } from "../src/lib/meetings/providers/index.ts";
import { tokenHash } from "../src/lib/meetings/server.ts";
import { seal } from "../src/lib/seal.ts";
import { meetingSync } from "../worker-intel/jobs/calendars.ts";

const SECRET = "test-secret-key-0123456789abcdef0123456789";
const BASE = "https://app.tryclaritia.com";
const FORM = {
  steps: [
    {
      fields: [
        { id: "a", key: "email", type: "email", label: "Work email" },
        { id: "b", key: "company.size", type: "choice", label: "Company size" },
        { id: "c", key: "goals", type: "multi", label: "What do you need" },
        { id: "d", key: "utm", type: "hidden", label: "UTM" },
        { id: "e", key: "consent", type: "consent", label: "I agree" },
      ],
    },
  ],
};
const VALUES = { email: "dana@acme.com", "company.size": "51-200", goals: ["Forms", "Routing"], utm: "ads", consent: true };

test("form answers keep the form's labels and order, without hidden fields or consent", () => {
  assert.deepEqual(formAnswers(FORM as never, VALUES), [
    { label: "Work email", value: "dana@acme.com" },
    { label: "Company size", value: "51-200" },
    { label: "What do you need", value: "Forms, Routing" },
  ]);
  assert.deepEqual(formAnswers(null, VALUES), []);
  assert.deepEqual(formAnswers(FORM as never, null), []);
});

test("the description: who booked, the form, answers without repeats, then the links", () => {
  const d = meetingDescription({
    typeName: "Intro call",
    guest: { name: "Dana Lee", email: "dana@acme.com" },
    form: "Demo request",
    answers: [...formAnswers(FORM as never, VALUES), { label: "Company size", value: "201-500" }],
    join: "https://meet.google.com/abc-defg-hij",
    manage: `${BASE}/book/m/tok`,
  });
  assert.equal(
    d,
    [
      "Dana Lee (dana@acme.com) booked Intro call from Demo request.",
      "",
      "Company size: 51-200",
      "What do you need: Forms, Routing",
      "",
      "Join: https://meet.google.com/abc-defg-hij",
      `Reschedule or cancel: ${BASE}/book/m/tok`,
    ].join("\n"),
  );
});

test("flaky: very long answers are cut, the links at the end always stay", () => {
  const d = meetingDescription({ typeName: "Call", guest: { name: null, email: "x@y.io" }, answers: Array.from({ length: 30 }, (_, i) => ({ label: `Q${i}`, value: "x".repeat(1900) })), manage: `${BASE}/book/m/tok` });
  assert.ok(d.length <= DESCRIPTION_MAX);
  assert.ok(d.endsWith(`Reschedule or cancel: ${BASE}/book/m/tok`));
});

// The calendar job, end to end over a fake database and calendar.
type Ev = { title: string; description: string; start: number; end: number };
function world(o: { info?: "ok" | "fails"; group?: boolean; token?: string }) {
  const events = new Map<string, Ev>();
  const updates: { description?: string; start: number }[] = [];
  const token = o.token ?? "tok-1";
  const cal = { id: "acc1", workspace_id: "w", user_id: "u1", provider: "google", account_email: "lee@team.io", status: "ok", channels: {}, watch_due: null, sealed: null, lists: [], write: "primary" };
  const meeting = {
    id: "0192f3a1-0000-7000-8000-000000000001",
    workspace_id: "w",
    guest_email: "dana@acme.com",
    guest_name: "Dana Lee",
    answers: { notes: "Pricing for 50 seats" },
    start_at: new Date(Date.UTC(2026, 10, 2, 15)).toISOString(),
    end_at: new Date(Date.UTC(2026, 10, 2, 15, 30)).toISOString(),
    status: "booked",
    location: { kind: "google_meet" },
    events: {} as Record<string, unknown>,
  };
  const inputs = () => ({ meeting: { ...meeting }, title: "Intro call", questions: [{ id: "notes", label: "Notes" }], hosts: [{ user_id: "u1", email: "lee@team.io", cal, zoom: null }], group: !!o.group, session: [], anchor: null, sharing: [] });
  const rpc: Rpc = async (fn, args) => {
    if (fn === "meeting_sync_lease") return { data: true, error: null };
    if (fn === "meeting_sync_inputs") return { data: inputs(), error: null };
    if (fn === "meeting_invite_info")
      return o.info === "fails" ? { data: null, error: { message: "function meeting_invite_info does not exist" } } : { data: { token_hash: tokenHash(token), token_sealed: seal(token, SECRET), form: { name: "Demo request", values: VALUES, body: FORM } }, error: null };
    if (fn === "meeting_calendar_save") {
      meeting.events = { ...meeting.events, ...(args.p_events as object) };
      return { data: null, error: null };
    }
    return { data: null, error: null };
  };
  const provider = {
    async create(_c: string, e: Ev & { key: string }) {
      const id = `ev_${events.size + 1}`;
      events.set(id, { title: e.title, description: e.description, start: e.start, end: e.end });
      return { id, joinUrl: "https://meet.google.com/abc-defg-hij" };
    },
    async update(_c: string, id: string, c: { start: number; end: number; description?: string }) {
      updates.push({ description: c.description, start: c.start });
      const e = events.get(id)!;
      events.set(id, { ...e, start: c.start, end: c.end, ...(c.description !== undefined ? { description: c.description } : {}) });
    },
    async cancel() {},
  } as unknown as FullProvider;
  const run = meetingSync(rpc, { provider: () => provider, base: BASE, secret: SECRET });
  const job = (action: string): Job => ({ id: `j_${action}`, workspace_id: "w", kind: "meeting_sync", key: `${action}:m`, payload: { meeting: meeting.id, action }, attempts: 1, max_attempts: 5 });
  return { events, updates, meeting, sync: (action: string) => run(job(action), new AbortController().signal) };
}

test("a booked meeting's event gets the description; a reschedule writes it again with the current link", async () => {
  const w = world({});
  await w.sync("create");
  const ev = [...w.events.values()][0]!;
  assert.match(ev.description, /^Dana Lee \(dana@acme\.com\) booked Intro call from Demo request\./);
  assert.match(ev.description, /Company size: 51-200/);
  assert.match(ev.description, /Notes: Pricing for 50 seats/);
  assert.match(ev.description, new RegExp(`Reschedule or cancel: ${BASE}/book/m/tok-1`));
  // Rescheduled: same event, moved, with its description written again.
  w.meeting.start_at = new Date(Date.UTC(2026, 10, 3, 15)).toISOString();
  w.meeting.end_at = new Date(Date.UTC(2026, 10, 3, 15, 30)).toISOString();
  await w.sync("move");
  assert.equal(w.events.size, 1, "the same event moves; no second one");
  assert.equal(w.updates.length, 1);
  assert.match(w.updates[0]!.description ?? "", /Reschedule or cancel: /);
  assert.equal([...w.events.values()][0]!.start, Date.UTC(2026, 10, 3, 15));
});

test("flaky: the extra read fails, the event is still made with what the meeting has", async () => {
  const w = world({ info: "fails" });
  await w.sync("create");
  const ev = [...w.events.values()][0]!;
  assert.equal(ev.description, "Dana Lee (dana@acme.com) booked Intro call.\n\nNotes: Pricing for 50 seats");
});

test("flaky: a group event carries no one guest's answers or link", async () => {
  const w = world({ group: true });
  await w.sync("create");
  assert.equal([...w.events.values()][0]!.description, "");
});
