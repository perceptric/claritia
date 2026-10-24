// Checks for what people save (docs/meetings-scheduler.md 1.2 and 1.4): a meeting type and a person's hours. The
// server runs these before every write; they return a clean copy or the problems, in plain words.

import { validZone } from "./time.ts";
import { DAYS, DEFAULT_SETTINGS, KINDS, type Availability, type Host, type Kind, type Location, type MeetingType, type Range, type TypeSettings } from "./types.ts";

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SLUG = /^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$/;
const UUID = /^[0-9a-f-]{36}$/;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const int = (v: unknown, min: number, max: number, dflt: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
};

/** A day's ranges: clock pairs in order, not overlapping. */
function ranges(raw: unknown, where: string, errors: string[]): Range[] {
  const out: Range[] = [];
  for (const r of Array.isArray(raw) ? raw.slice(0, 8) : []) {
    const [a, b] = Array.isArray(r) ? r : [];
    if (typeof a !== "string" || typeof b !== "string" || !CLOCK.test(a) || !CLOCK.test(b) || a === "24:00") {
      errors.push(`${where}: times look like 09:00.`);
      continue;
    }
    if (b <= a) {
      errors.push(`${where}: ${a} to ${b} ends before it starts.`);
      continue;
    }
    out.push([a, b]);
  }
  out.sort((x, y) => (x[0] < y[0] ? -1 : 1));
  for (let i = 1; i < out.length; i++) if (out[i]![0] < out[i - 1]![1]) errors.push(`${where}: two ranges overlap.`);
  return out;
}

export function checkAvailability(raw: unknown): { availability: Availability } | { errors: string[] } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const errors: string[] = [];
  const tz = str(r.tz, 60);
  if (!tz || !validZone(tz)) errors.push("Pick a time zone.");
  const w = (r.weekly && typeof r.weekly === "object" ? r.weekly : {}) as Record<string, unknown>;
  const weekly = Object.fromEntries(DAYS.map((d) => [d, ranges(w[d], d[0]!.toUpperCase() + d.slice(1), errors)])) as Availability["weekly"];
  const overrides: Availability["overrides"] = [];
  const seen = new Set<string>();
  for (const o of Array.isArray(r.overrides) ? r.overrides.slice(0, 200) : []) {
    const date = str((o as Record<string, unknown>)?.date, 10);
    if (!DATE.test(date) || seen.has(date)) {
      errors.push("A date change needs one date like 2026-12-24.");
      continue;
    }
    seen.add(date);
    overrides.push({ date, ranges: ranges((o as Record<string, unknown>).ranges, date, errors) });
  }
  overrides.sort((a, b) => (a.date < b.date ? -1 : 1));
  return errors.length ? { errors: [...new Set(errors)] } : { availability: { tz, weekly, overrides } };
}

function location(raw: unknown, errors: string[]): Location {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  switch (r.kind) {
    case "teams":
    case "zoom":
    case "phone_guest":
    case "google_meet":
      return { kind: r.kind };
    case "phone_host": {
      const number = str(r.number, 40);
      if (!/^\+?[\d\s().-]{6,40}$/.test(number)) errors.push("Add the phone number to call.");
      return { kind: "phone_host", number };
    }
    case "in_person": {
      const address = str(r.address, 300);
      if (!address) errors.push("Add the address.");
      return { kind: "in_person", address };
    }
    case "link": {
      const url = str(r.url, 500);
      if (!/^https:\/\/\S+$/.test(url)) errors.push("The meeting link needs https://.");
      return { kind: "link", url };
    }
    default:
      return DEFAULT_SETTINGS.location;
  }
}

export function checkSettings(raw: unknown, kind: Kind): { settings: TypeSettings; errors: string[] } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const errors: string[] = [];
  const d = DEFAULT_SETTINGS;
  const lengths = [...new Set((Array.isArray(r.lengths) ? r.lengths : d.lengths).map((x) => Math.round(Number(x))).filter((x) => x >= 5 && x <= 480))].sort((a, b) => a - b).slice(0, 6);
  if (!lengths.length) errors.push("Pick at least one length.");
  const reminders = [...new Set((Array.isArray(r.reminders) ? r.reminders : d.reminders).map((x) => Math.round(Number(x))).filter((x) => x >= 5 && x <= 10_080))].sort((a, b) => b - a).slice(0, 4);
  const c = (r.confirmation && typeof r.confirmation === "object" ? r.confirmation : {}) as Record<string, unknown>;
  let confirmation: TypeSettings["confirmation"] = { kind: "message", ...(str(c.text, 500) ? { text: str(c.text, 500) } : {}) };
  if (c.kind === "redirect") {
    const url = str(c.url, 1000);
    if (!/^https:\/\/\S+$/.test(url)) errors.push("The page after booking needs https://.");
    confirmation = { kind: "redirect", url };
  }
  let price: TypeSettings["price"];
  const p = r.price as Record<string, unknown> | undefined;
  if (p && typeof p === "object" && Number(p.amount) > 0) {
    const currency = str(p.currency, 3).toLowerCase();
    if (!/^[a-z]{3}$/.test(currency)) errors.push("Pick the currency for the price.");
    price = { amount: int(p.amount, 50, 10_000_000, 0), currency };
  }
  const questions: TypeSettings["questions"] = [];
  for (const q of Array.isArray(r.questions) ? r.questions.slice(0, 10) : []) {
    const qo = (q && typeof q === "object" ? q : {}) as Record<string, unknown>;
    const label = str(qo.label, 200);
    const type = ["text", "textarea", "phone", "choice"].includes(qo.type as string) ? (qo.type as TypeSettings["questions"][number]["type"]) : "text";
    if (!label) {
      errors.push("Every question needs a label.");
      continue;
    }
    const options = type === "choice" ? (Array.isArray(qo.options) ? qo.options : []).map((o) => str(o, 100)).filter(Boolean).slice(0, 30) : undefined;
    if (type === "choice" && !options?.length) errors.push(`${label} needs choices.`);
    questions.push({ id: /^[a-z0-9]{1,24}$/.test(str(qo.id, 24)) ? str(qo.id, 24) : Math.random().toString(36).slice(2, 10), label, type, required: qo.required === true, ...(options ? { options } : {}) });
  }
  const settings: TypeSettings = {
    lengths: lengths.length ? lengths : d.lengths,
    location: location(r.location, errors),
    bufferBefore: int(r.bufferBefore, 0, 240, d.bufferBefore),
    bufferAfter: int(r.bufferAfter, 0, 240, d.bufferAfter),
    notice: int(r.notice, 0, 43_200, d.notice),
    window: int(r.window, 1, 365, d.window),
    perDay: int(r.perDay, 0, 50, d.perDay),
    perWeek: int(r.perWeek, 0, 250, d.perWeek),
    step: [5, 10, 15, 20, 30, 60].includes(Number(r.step)) ? Number(r.step) : d.step,
    rrMode: r.rrMode === "strict" ? "strict" : "flexible",
    seats: kind === "group" ? int(r.seats, 2, 500, 10) : 1,
    reschedule: r.reschedule === "pool" ? "pool" : "same_host",
    reminders,
    noShowFollowUp: r.noShowFollowUp !== false,
    confirmation,
    ...(price ? { price } : {}),
    ...(str(r.schedule, 60) ? { schedule: str(r.schedule, 60) } : {}),
    questions,
  };
  return { settings, errors };
}

/** A meeting type as saved: name, slug, kind, hosts and settings, with the rules each kind needs. */
export function checkType(raw: unknown, members: Set<string>): { type: Pick<MeetingType, "name" | "slug" | "kind" | "hosts" | "settings" | "secret" | "active" | "owner_user_id" | "locked"> } | { errors: string[] } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const errors: string[] = [];
  const name = str(r.name, 120);
  if (!name) errors.push("Name the meeting type.");
  const slug = str(r.slug, 60).toLowerCase();
  if (!SLUG.test(slug)) errors.push("The link name uses letters, numbers and dashes, like intro-call.");
  const kind = (KINDS.some((k) => k.value === r.kind) ? r.kind : "one") as Kind;
  const hosts: Host[] = [];
  const seen = new Set<string>();
  for (const h of Array.isArray(r.hosts) ? r.hosts.slice(0, 50) : []) {
    const ho = (h && typeof h === "object" ? h : {}) as Record<string, unknown>;
    const id = str(ho.user_id, 36);
    if (!UUID.test(id) || !members.has(id)) {
      errors.push("A host isn't in this workspace.");
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    hosts.push({ user_id: id, ...(kind === "round_robin" || kind === "owner_first" || kind === "double" ? { weight: int(ho.weight, 1, 10, 1), tier: int(ho.tier, 0, 9, 0) } : {}), ...(kind === "double" ? { pool: ho.pool === "b" ? "b" : "a" } : {}) });
  }
  if (!hosts.length) errors.push("Add a host.");
  if ((kind === "one" || kind === "group") && hosts.length > 1) errors.push(kind === "one" ? "A one-person type has one host." : "A group type has one host.");
  if (kind === "collective" && hosts.length < 2) errors.push("Everyone needs two or more hosts.");
  if (kind === "double" && !(hosts.some((h) => h.pool !== "b") && hosts.some((h) => h.pool === "b"))) errors.push("Two teams need a host in each team.");
  const { settings, errors: more } = checkSettings(r.settings, kind);
  errors.push(...more);
  const owner = str(r.owner_user_id, 36);
  const locked = (Array.isArray(r.locked) ? r.locked : []).filter((k): k is MeetingType["locked"][number] => typeof k === "string" && (k === "name" || k === "kind" || k in DEFAULT_SETTINGS));
  return errors.length
    ? { errors: [...new Set(errors)] }
    : { type: { name, slug, kind, hosts, settings, secret: r.secret === true, active: r.active !== false, owner_user_id: UUID.test(owner) && members.has(owner) ? owner : null, locked } };
}
