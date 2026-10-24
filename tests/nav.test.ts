import assert from "node:assert/strict";
import { test } from "node:test";
import { activeItem, availabilityPage, defaultRoute, enrichmentPage, GROUPS, meetingsPage, NAV, resolveRoute, routingPage, schedulingPage, signalsPage } from "../src/lib/nav.ts";

test("the sidebar is CRM, Automation, Routing, Scheduling, Email, Site, Ads and Settings, CRM first", () => {
  assert.deepEqual(
    GROUPS.map((g) => g.key),
    ["crm", "automation", "routing", "scheduling", "email", "site", "ads", "settings"],
  );
  const by = (g: string) => NAV.filter((n) => n.group === g).map((n) => n.label);
  assert.deepEqual(by("crm"), ["Contacts", "Companies", "Opportunities", "Meetings"]);
  assert.deepEqual(by("automation"), ["Workflows", "Forms", "Signals", "Enrichment"]);
  assert.deepEqual(by("routing"), ["Overview", "Rules", "Teams", "Regions", "Company types", "Handoffs", "History", "Needs review"]);
  assert.deepEqual(by("scheduling"), ["Meeting types", "Availability", "Links and polls", "Booking forms", "Reminders", "Payments", "AI scheduler", "Notetaker"]);
  assert.deepEqual(by("email"), ["Segments", "Templates", "Analytics"]);
  assert.equal(defaultRoute, "contacts");
  assert.equal(new Set(NAV.map((n) => n.key)).size, NAV.length, "each item once");
  assert.deepEqual(NAV.filter((n) => n.soon).map((n) => n.label), ["Handoffs", "AI scheduler", "Notetaker"]);
});

test("old addresses open their new home", () => {
  assert.deepEqual(resolveRoute("leads", "abc"), { route: "contacts", id: "abc" });
  assert.deepEqual(resolveRoute("accounts", "abc"), { route: "companies", id: "account/abc" });
  assert.deepEqual(resolveRoute("visitors", ""), { route: "signals", id: "visitors" });
  assert.deepEqual(resolveRoute("companies", "visits"), { route: "signals", id: "visitors" });
  assert.deepEqual(resolveRoute("journeys", ""), { route: "workflows", id: "" });
  assert.deepEqual(resolveRoute("reports", ""), { route: "analytics", id: "" });
  const id = "0b7c6a8e-1f2d-4c3b-9a8e-7d6c5b4a3f21";
  assert.deepEqual(resolveRoute("meetings", "types"), { route: "scheduling", id: "types" });
  assert.deepEqual(resolveRoute("meetings", `types/${id}`), { route: "scheduling", id: `types/${id}` });
  assert.deepEqual(resolveRoute("settings", "calendar"), { route: "scheduling", id: "availability/calendars" });
  assert.deepEqual(resolveRoute("settings", "calendars"), { route: "scheduling", id: "availability/team" });
  assert.deepEqual(resolveRoute("settings", "payments"), { route: "scheduling", id: "payments" });
  assert.deepEqual(resolveRoute("settings", "sites"), { route: "signals", id: "setup" });
  assert.deepEqual(resolveRoute("settings", "identity"), { route: "signals", id: "setup" });
  assert.deepEqual(resolveRoute("settings", "account_alerts"), { route: "signals", id: "alerts" });
  assert.deepEqual(resolveRoute("settings", "team"), { route: "settings", id: "team" });
});

test("the testing screens and unknown addresses open Contacts", () => {
  for (const old of ["tests", "blocks", "map", "runs", "environments", "schedules", "approvals", "insights", "nope", ""]) assert.deepEqual(resolveRoute(old, "x"), { route: "contacts", id: "" });
});

test("current addresses keep their record", () => {
  assert.deepEqual(resolveRoute("opportunities", "abc"), { route: "opportunities", id: "abc" });
  assert.deepEqual(resolveRoute("objects", "deal/abc"), { route: "objects", id: "deal/abc" });
  assert.deepEqual(resolveRoute("forms", "abc"), { route: "forms", id: "abc" });
});

test("meetings: the list and one meeting", () => {
  const id = "0b7c6a8e-1f2d-4c3b-9a8e-7d6c5b4a3f21";
  assert.deepEqual(meetingsPage(""), { page: "list", id: "" });
  assert.deepEqual(meetingsPage(id), { page: "meeting", id });
  assert.deepEqual(meetingsPage("nope"), { page: "list", id: "" });
});

test("routing: eight pages, a run in History, a saved setup, and the old tab names forward", () => {
  const run = "0b7c6a8e-1f2d-4c3b-9a8e-7d6c5b4a3f21";
  assert.deepEqual(routingPage(""), { page: "", sub: "", version: null, id: "" });
  for (const p of ["rules", "teams", "regions", "company-types", "handoffs", "review"] as const) assert.deepEqual(routingPage(p), { page: p, sub: "", version: null, id: p });
  assert.deepEqual(routingPage(`history/${run}`), { page: "history", sub: run, version: null, id: `history/${run}` });
  assert.deepEqual(routingPage("history/nope"), { page: "history", sub: "", version: null, id: "history" });
  assert.deepEqual(routingPage("versions/3"), { page: "", sub: "", version: 3, id: "versions/3" });
  assert.equal(routingPage("reps").id, "teams");
  assert.equal(routingPage(`log/${run}`).id, `history/${run}`);
  assert.equal(routingPage("held").id, "review");
  for (const bad of ["versions/0", "versions/x", "versions", "nope", "nope/1"]) assert.deepEqual(routingPage(bad), { page: "", sub: "", version: null, id: "" });
});

test("scheduling, signals and enrichment pages", () => {
  const id = "0b7c6a8e-1f2d-4c3b-9a8e-7d6c5b4a3f21";
  assert.deepEqual(schedulingPage(""), { page: "types", sub: "", id: "types" });
  assert.deepEqual(schedulingPage(`types/${id}`), { page: "types", sub: id, id: `types/${id}` });
  assert.deepEqual(schedulingPage("types/new"), { page: "types", sub: "new", id: "types/new" });
  assert.deepEqual(schedulingPage("types/nope"), { page: "types", sub: "", id: "types" });
  assert.deepEqual(schedulingPage("availability/team"), { page: "availability", sub: "team", id: "availability/team" });
  assert.deepEqual(schedulingPage("availability/nope"), { page: "availability", sub: "", id: "availability" });
  assert.equal(availabilityPage(""), "schedules");
  assert.equal(availabilityPage("days-off"), "days-off");
  for (const p of ["links", "forms", "reminders", "payments", "ai", "notetaker"]) assert.equal(schedulingPage(p).page, p);
  assert.deepEqual(signalsPage(""), { tab: "feed", id: "" });
  assert.deepEqual(signalsPage("alerts"), { tab: "alerts", id: "alerts" });
  assert.deepEqual(enrichmentPage("providers"), { tab: "providers", id: "providers" });
  assert.deepEqual(enrichmentPage("rules"), { tab: "overview", id: "" });
});

test("the open page lights its sidebar item", () => {
  const run = "0b7c6a8e-1f2d-4c3b-9a8e-7d6c5b4a3f21";
  assert.equal(activeItem("routing", "")?.label, "Overview");
  assert.equal(activeItem("routing", "versions/2")?.label, "Overview");
  assert.equal(activeItem("routing", `history/${run}`)?.label, "History");
  assert.equal(activeItem("scheduling", `types/${run}`)?.label, "Meeting types");
  assert.equal(activeItem("scheduling", "availability/team")?.label, "Availability");
  assert.equal(activeItem("meetings", run)?.label, "Meetings");
  assert.equal(activeItem("signals", "alerts")?.label, "Signals");
});
