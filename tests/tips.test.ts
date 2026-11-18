// Getting-started emails (170_getting_started.sql): when each one goes out, what it says, the turn-off link, and the
// sender on a flaky provider. src/lib/tips/plan.ts, mail.ts, token.ts and send.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SendError } from "../src/lib/email/provider.ts";
import { TEMPLATES } from "../src/lib/forms/gallery/catalog.ts";
import { periodOf, pickStep, sentSteps, TEMPLATE_COUNT, type TipState } from "../src/lib/tips/plan.ts";
import { awayMail, calendarMail, followupMail, formMail, helpMail, limitMail, responsesMail, shareMail, teamMail, welcomeMail } from "../src/lib/tips/mail.ts";
import { readTipsToken, tipsToken } from "../src/lib/tips/token.ts";
import { tipOne, tipsConfig, tipsCover, type Db } from "../src/lib/tips/send.ts";

const base: TipState = { ageHours: 1, setupDone: false, paid: false, forms: 0, responses: 0, calendars: 0, followups: 0, members: 1, invites: 0, monthResponses: 0, cap: 250, idleDays: 0, newSinceSeen: 0, localHour: 10, sent: new Set(), sentRecently: false };
const at = (days: number, more: Partial<TipState> = {}, sent: string[] = ["welcome"]): TipState => ({ ...base, ageHours: days * 24, sent: new Set(sent), ...more });

test("the welcome waits for the setup or an hour, goes at any hour, and never after 2 days", () => {
  assert.equal(pickStep({ ...base, ageHours: 0.1, setupDone: true }), null);
  assert.equal(pickStep({ ...base, ageHours: 0.3 }), null);
  assert.equal(pickStep({ ...base, ageHours: 0.3, setupDone: true, localHour: 3 }), "welcome");
  assert.equal(pickStep({ ...base, ageHours: 1.2, localHour: 23 }), "welcome");
  assert.notEqual(pickStep({ ...base, ageHours: 50 }), "welcome");
});

test("later emails wait for working hours and a quiet day", () => {
  assert.equal(pickStep(at(1, { localHour: 8 })), null);
  assert.equal(pickStep(at(1, { localHour: 18 })), null);
  assert.equal(pickStep(at(1, { sentRecently: true })), null);
  assert.equal(pickStep(at(1)), "form");
});

test("each setup email is skipped once its step is done", () => {
  assert.equal(pickStep(at(1, { forms: 1 })), null);
  assert.equal(pickStep(at(2, { forms: 1 })), "share");
  assert.equal(pickStep(at(2, { forms: 1, responses: 2 })), null);
  assert.equal(pickStep(at(3, { forms: 1, responses: 2 }, ["welcome", "share"])), "responses");
  assert.equal(pickStep(at(4, { forms: 1, responses: 2 }, ["welcome", "responses"])), "calendar");
  assert.equal(pickStep(at(4, { forms: 1, responses: 2, calendars: 1 }, ["welcome", "responses"])), null);
  assert.equal(pickStep(at(6, { forms: 1, calendars: 1 }, ["welcome", "share"])), "followup");
  assert.equal(pickStep(at(6, { forms: 1, calendars: 1, followups: 1 }, ["welcome", "share"])), null);
  assert.equal(pickStep(at(6, { calendars: 1 }, ["welcome", "form"])), null);
  assert.equal(pickStep(at(8, { forms: 1, calendars: 1, followups: 1 }, ["welcome", "share"])), "team");
  assert.equal(pickStep(at(8, { forms: 1, calendars: 1, followups: 1, members: 2 }, ["welcome", "share"])), null);
  assert.equal(pickStep(at(8, { forms: 1, calendars: 1, followups: 1, invites: 1 }, ["welcome", "share"])), null);
});

test("each email goes once", () => {
  assert.equal(pickStep(at(1, {}, ["welcome", "form"])), null);
  assert.equal(pickStep(at(2, { forms: 1 }, ["welcome", "share"])), null);
});

test("Free at 80% of the month's responses gets the limit email once a month, paid plans never", () => {
  assert.equal(pickStep(at(9, { forms: 1, responses: 210, calendars: 1, followups: 1, members: 2, monthResponses: 199 })), null);
  assert.equal(pickStep(at(9, { forms: 1, responses: 210, calendars: 1, followups: 1, members: 2, monthResponses: 200 })), "limit");
  assert.equal(pickStep(at(9, { forms: 1, responses: 210, calendars: 1, followups: 1, members: 2, monthResponses: 240, paid: true, cap: 2000 })), null);
  assert.equal(pickStep(at(30, { monthResponses: 260, cap: null })), null);
  const now = new Date("2026-12-14T12:00:00Z");
  assert.equal(periodOf("limit", now), "2026-12");
  assert.deepEqual([...sentSteps([{ step: "limit", period: "2026-11", sent_at: "2026-11-20T10:00:00Z" }], now)], []);
  assert.deepEqual([...sentSteps([{ step: "limit", period: "2026-12", sent_at: "2026-12-02T10:00:00Z" }], now)], ["limit"]);
});

test("quiet people on Free get help, and news that came in while away, at most every 90 days", () => {
  const done = ["welcome", "form", "share", "responses", "calendar", "followup", "team"];
  assert.equal(pickStep(at(15, { idleDays: 9 }, done)), "help");
  assert.equal(pickStep(at(15, { idleDays: 2 }, done)), null);
  assert.equal(pickStep(at(15, { idleDays: null }, done)), "help");
  assert.equal(pickStep(at(30, { idleDays: 16, newSinceSeen: 4 }, [...done, "help"])), "away");
  assert.equal(pickStep(at(30, { idleDays: 16, newSinceSeen: 0 }, [...done, "help"])), null);
  assert.equal(pickStep(at(30, { idleDays: 10, newSinceSeen: 4 }, [...done, "help"])), null);
  const now = new Date("2027-03-01T12:00:00Z");
  assert.deepEqual([...sentSteps([{ step: "away", period: "a1", sent_at: "2026-11-20T12:00:00Z" }], now)], []);
  assert.deepEqual([...sentSteps([{ step: "away", period: "a1", sent_at: "2027-02-01T12:00:00Z" }], now)], ["away"]);
});

test("paying workspaces get the setup emails and nothing about plans, help or news", () => {
  const paid = { paid: true, cap: 2000 };
  assert.equal(pickStep(at(1, paid)), "form");
  assert.equal(pickStep(at(15, { ...paid, forms: 2, responses: 9, calendars: 1, followups: 1, members: 3, idleDays: 30 })), null);
  assert.equal(pickStep(at(30, { ...paid, forms: 2, responses: 9, calendars: 1, followups: 1, members: 3, idleDays: 30, newSinceSeen: 5 })), null);
});

test("the template count in the emails is the gallery's", () => {
  assert.equal(TEMPLATES.length, TEMPLATE_COUNT);
});

const SECRET = "x".repeat(40);
const WS = "0f8fad5b-d9cb-469f-a165-70867728950e";
const USER = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

test("the turn-off link names one person in one workspace and can't be changed", () => {
  const t = tipsToken(WS, USER, SECRET);
  assert.deepEqual(readTipsToken(t, SECRET), { workspaceId: WS, userId: USER });
  assert.equal(readTipsToken(t, "y".repeat(40)), null);
  const [b, m] = t.split(".");
  const body = Buffer.from(b!, "base64url");
  body[5] ^= 1;
  assert.equal(readTipsToken(`${body.toString("base64url")}.${m}`, SECRET), null);
  assert.equal(readTipsToken("", SECRET), null);
  assert.equal(readTipsToken(t, ""), null);
  assert.throws(() => tipsToken(WS, USER, "short"));
});

const foot = { unsubscribe: "https://app.tryclaritia.com/api/email/tips?t=x", settings: "https://app.tryclaritia.com/settings/profile" };
const url = "https://app.tryclaritia.com/forms";
const all = {
  welcome: welcomeMail({ name: "Ana Lima", workspace: "Acme", steps: [{ title: "Set up your workspace", done: true }, { title: "Build your first form", done: false }], url }, foot),
  form: formMail({ templates: 840, url, templatesUrl: `${url}/templates` }, foot),
  share: shareMail({ form: "Demo request", live: true, link: "https://app.tryclaritia.com/f/acme/demo", url }, foot),
  responses: responsesMail({ responses: 1, meetings: 0, live: 1, latest: [{ form: "Demo request", when: "Tue 3:12 PM" }], url }, foot),
  calendar: calendarMail({ day: "Tuesday, Nov 24", url }, foot),
  followup: followupMail({ ready: ["Form not booked"], url }, foot),
  team: teamMail({ you: "Ana Lima", workspace: "Acme", perks: [{ main: "Build and edit forms together", plan: "Free" }], url }, foot),
  limit: limitMail({ used: 212, cap: 250, resets: "Dec 1", cols: ["Free", "Starter", "Pro"], rows: [{ label: "Responses a month", values: ["250", "2,000", "5,000"] }], pick: 1, price: 15, yearlyOff: 20, url }, foot),
  help: helpMail({ url, sign: { name: "Ana Lima", role: "Founder" } }, foot),
  away: awayMail({ responses: 14, meetings: 3, upcoming: 2, since: "Nov 2", latest: [], url }, foot),
};

test("every email has the hero, one button, a plain-text copy and a way to turn it off", () => {
  for (const [name, m] of Object.entries(all)) {
    assert.ok(m.subject.length > 10 && m.subject.length < 80 && !/[\r\n]/.test(m.subject), name);
    assert.match(m.html, /bgcolor="#f4f4ef" style="background:#f4f4ef;border-radius:12px/, `${name} hero`);
    assert.match(m.html, /https:\/\/tryclaritia\.com\/assets\/email\/logo\.png/, `${name} logo`);
    assert.equal((m.html.match(/bgcolor="#333333"/g) ?? []).length, 1, `${name} one button`);
    assert.match(m.text, /Turn them off: https:\/\/app\.tryclaritia\.com\/api\/email\/tips/, `${name} text footer`);
    assert.match(m.html, /Turn them off<\/a>/, `${name} html footer`);
    assert.doesNotMatch(m.html + m.text + m.subject, /·|&middot;|gradient|undefined|NaN|null/, name);
  }
});

test("the emails carry the workspace's real numbers and escape what people typed", () => {
  assert.match(all.welcome.html, /Welcome, Ana\. Here&#39;s your first week\./);
  assert.match(all.welcome.html, /1 of 2 done/);
  assert.match(all.welcome.text, /\[x\] Set up your workspace/);
  assert.match(all.form.html, /all 840 templates/);
  assert.equal(all.responses.subject, "Your first response came in");
  assert.match(all.responses.text, /- Demo request, Tue 3:12 PM/);
  assert.match(all.limit.subject, /212 of 250/);
  assert.match(all.limit.html, /Get Starter, \$15 a seat/);
  assert.match(all.away.subject, /14 new responses since you were last here/);
  assert.match(all.help.html, />AL</);
  const x = shareMail({ form: "<b>Hi</b>", live: false, link: "https://app.tryclaritia.com/f/x", url }, foot);
  assert.doesNotMatch(x.html, /<b>Hi/);
  assert.match(x.subject, /^Put <b>Hi<\/b> live$/);
});

// ─────────────── the sender ───────────────

type Row = Record<string, unknown>;
function fakeDb(o: { state?: Partial<Row>; log?: Row[]; taken?: boolean } = {}) {
  const claims: string[] = [];
  const given: string[] = [];
  const db: Db = {
    async query(sql, params = []) {
      if (/^select step, period/.test(sql.trim())) return { rows: o.log ?? [] };
      if (/setup_done/.test(sql)) return { rows: [{ setup_done: true, plan: "free", booking_slug: "acme", forms: 0, live: 0, responses: 0, meetings: 0, calendars: 0, followups: 0, members: 1, invites: 0, month_responses: 0, last_seen: new Date().toISOString(), tz: "UTC", ...o.state }] };
      if (/insert into public\.tips_log/.test(sql)) {
        if (o.taken) return { rows: [] };
        claims.push(String(params[2]));
        return { rows: [{ step: params[2] }] };
      }
      if (/delete from public\.tips_log/.test(sql)) {
        given.push(String(params[2]));
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
  return { db, claims, given };
}
const who = { id: WS, name: "Acme", created_at: new Date(Date.now() - 2 * 36e5).toISOString(), user_id: USER, email: "ana@acme.com", person: "Ana Lima" };
const opts = (mailer: { send: (m: { raw: string }) => Promise<string> }) => ({ mailer, base: "https://app.tryclaritia.com", secret: SECRET, cfg: tipsConfig({}), wait: async () => {} });

test("a send is claimed first, a hiccup is tried again, and the email goes once", async () => {
  const { db, claims, given } = fakeDb();
  let tries = 0;
  const sent: string[] = [];
  const r = await tipOne(db, who, opts({ send: async (m) => {
    if (++tries < 3) throw new SendError("busy", { later: true });
    sent.push(m.raw);
    return "id";
  } }));
  assert.equal(r, "sent");
  assert.deepEqual(claims, ["welcome"]);
  assert.deepEqual(given, []);
  assert.equal(sent.length, 1);
  assert.match(sent[0]!, /List-Unsubscribe: <https:\/\/app\.tryclaritia\.com\/api\/email\/tips\?t=/);
  assert.match(sent[0]!, /List-Unsubscribe-Post: List-Unsubscribe=One-Click/);
  assert.match(sent[0]!, /Subject: Your first week with Claritia/);
});

test("a send that keeps failing gives its claim back so a later run tries again", async () => {
  const { db, given } = fakeDb();
  let tries = 0;
  const r = await tipOne(db, who, opts({ send: async () => {
    tries++;
    throw new SendError("busy", { retry: true });
  } }));
  assert.equal(r, "failed");
  assert.equal(tries, 3);
  assert.deepEqual(given, ["welcome"]);
  const hard = fakeDb();
  assert.equal(await tipOne(hard.db, who, opts({ send: async () => { throw new SendError("bad", {}); } })), "failed");
  assert.deepEqual(hard.given, ["welcome"]);
});

test("a send with no clear answer keeps its claim, so nobody gets it twice", async () => {
  const { db, given } = fakeDb();
  assert.equal(await tipOne(db, who, opts({ send: async () => { throw new SendError("timeout", { unknown: true }); } })), "unknown");
  assert.deepEqual(given, []);
});

test("an email another worker already claimed isn't sent", async () => {
  const { db } = fakeDb({ taken: true });
  let sends = 0;
  assert.equal(await tipOne(db, who, opts({ send: async () => (sends++, "id") })), "skipped");
  assert.equal(sends, 0);
});

test("nothing goes when nothing is due", async () => {
  const { db, claims } = fakeDb({ log: [{ step: "welcome", period: "once", sent_at: new Date().toISOString() }] });
  assert.equal(await tipOne(db, who, opts({ send: async () => "id" })), "skipped");
  assert.deepEqual(claims, []);
});

test("the setup's welcome stays quiet only when the getting-started emails cover the workspace", async () => {
  const yes: Db = { query: async () => ({ rows: [{ id: WS }] }) };
  const no: Db = { query: async () => ({ rows: [] }) };
  const broken: Db = { query: async () => { throw new Error('column "tips" does not exist'); } };
  assert.equal(await tipsCover(yes, WS, {}), true);
  assert.equal(await tipsCover(no, WS, {}), false);
  assert.equal(await tipsCover(broken, WS, {}), false);
  assert.equal(await tipsCover(yes, WS, { TIPS_OFF: "1" }), false);
  assert.equal(await tipsCover(yes, "nope", {}), false);
});
