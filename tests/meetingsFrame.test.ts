// One frame for every Meetings tab (src/components/app/scheduling/frame.tsx): each tab's body starts at the tabs' left
// edge and runs full width, so no tab centers a narrower column of its own; dates use the app's picker, never the
// browser's; each tab has at most one primary button in its header.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (f: string) => readFileSync(new URL(`../src/components/app/${f}`, import.meta.url), "utf8");
const TABS = ["meetings/Calendar.tsx", "scheduling/LinksPage.tsx", "scheduling/TypesPage.tsx", "scheduling/AvailabilityPage.tsx", "scheduling/BookingPage.tsx", "scheduling/WebhooksPage.tsx"];

test("no Meetings tab centers its own narrower column", () => {
  for (const f of TABS) assert.ok(!/mx-auto[^"`]*max-w-|max-w-[^"`]*mx-auto/.test(read(f)), `${f} centers a column`);
});

test("list tabs use the shared tab body, so they start where the tabs start", () => {
  for (const f of ["meetings/Calendar.tsx", "scheduling/LinksPage.tsx"]) assert.match(read(f), /<TabBody>/, f);
  assert.match(read("scheduling/TypesPage.tsx"), /\$\{TAB_X\}/);
  assert.match(read("scheduling/frame.tsx"), /export const TAB_X = "px-5"/);
});

test("dates are picked with the app's own picker in Meetings", () => {
  for (const f of [...TABS, "meetings/TeamCalendars.tsx"]) assert.ok(!/type="date"/.test(read(f)), `${f} uses the browser's date box`);
});

test("one primary button per tab header", () => {
  // Upcoming has none; Links and polls has one New with a menu; Meeting types has New meeting type.
  const upcoming = read("meetings/Calendar.tsx");
  assert.ok(!/<Page[^>]*actions=/.test(upcoming.slice(upcoming.indexOf('<Page title="Meetings" flush>'))), "Upcoming's header stays empty");
  const links = read("scheduling/LinksPage.tsx");
  assert.ok(!/New poll/.test(links), "one New button, with Poll in its menu");
  assert.match(read("scheduling/TypesPage.tsx"), /New meeting type/);
});

test("working hours shown before any are saved save themselves", () => {
  // The page shows 9 to 5 to someone with no hours yet; unsaved, the booking engine says "Set your hours first."
  const page = read("scheduling/AvailabilityPage.tsx");
  assert.match(page, /useState\(\(\) => \(saved \? JSON\.stringify\(saved\) : ""\)\)/);
});
