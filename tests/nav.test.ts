import assert from "node:assert/strict";
import { test } from "node:test";
import {
  activeItem,
  availabilityPage,
  contactsPage,
  defaultRoute,
  emailsPage,
  enrichmentPage,
  GROUPS,
  meetingsPage,
  NAV,
  resolveRoute,
  ROUTING_TABS,
  routingPage,
  SCHEDULING_TABS,
  schedulingPage,
  scoringPage,
  visitorsPage,
} from "../src/lib/nav.ts";

test("the sidebar is CRM, Automation, Inbound and Nurture, then Settings, with at most four items a group", () => {
  assert.deepEqual(
    GROUPS.map((g) => g.key),
    ["crm", "automation", "inbound", "nurture", "settings"],
  );
  const by = (g: string) => NAV.filter((n) => n.group === g).map((n) => n.label);
  assert.deepEqual(by("crm"), ["Contacts", "Companies", "Opportunities", "Meetings"]);
  assert.deepEqual(by("automation"), ["Workflows", "Routing", "Enrichment"]);
  assert.deepEqual(by("inbound"), ["Forms", "Scheduling", "Visitors"]);
  assert.deepEqual(by("nurture"), ["Emails", "Segments", "Lead scoring"]);
  for (const g of GROUPS) assert.ok(by(g.key).length <= 4, g.key);
  assert.equal(defaultRoute, "contacts");
  assert.equal(new Set(NAV.map((n) => n.route)).size, NAV.length, "one item per route");
  assert.deepEqual(ROUTING_TABS.map((t) => t.label), ["Overview", "Rules", "Teams", "Regions", "Company types", "History", "Needs review"]);
  assert.deepEqual(SCHEDULING_TABS.map((t) => t.label), ["Meeting types", "Availability", "Links and polls", "Reminders", "Payments"]);
});

test("old addresses open their new home", () => {
  assert.deepEqual(resolveRoute("leads", "abc"), { route: "contacts", id: "abc" });
  assert.deepEqual(resolveRoute("accounts", "abc"), { route: "companies", id: "account/abc" });
  assert.deepEqual(resolveRoute("journeys", ""), { route: "workflows", id: "" });
  assert.deepEqual(resolveRoute("companies", "visits"), { route: "visitors", id: "visits" });
  // Signals became Visitors.
  assert.deepEqual(resolveRoute("signals", ""), { route: "visitors", id: "" });
  assert.deepEqual(resolveRoute("signals", "visitors"), { route: "visitors", id: "visits" });
  assert.deepEqual(resolveRoute("signals", "alerts"), { route: "visitors", id: "alerts" });
  assert.deepEqual(resolveRoute("visitors", "visitors"), { route: "visitors", id: "visits" });
  // Reports moved into their sections.
  assert.deepEqual(resolveRoute("reports", ""), { route: "contacts", id: "overview" });
  assert.deepEqual(resolveRoute("reports", "reps"), { route: "contacts", id: "overview" });
  assert.deepEqual(resolveRoute("reports", "speed"), { route: "routing", id: "" });
  assert.deepEqual(resolveRoute("reports", "forms"), { route: "forms", id: "" });
  assert.deepEqual(resolveRoute("reports", "email"), { route: "emails", id: "" });
  assert.deepEqual(resolveRoute("analytics", ""), { route: "emails", id: "" });
  assert.deepEqual(resolveRoute("templates", ""), { route: "emails", id: "templates" });
  // Pages and Ads are gone.
  assert.deepEqual(resolveRoute("pages", ""), { route: "contacts", id: "" });
  assert.deepEqual(resolveRoute("ads", "x"), { route: "contacts", id: "" });
  // Booking forms are forms.
  assert.deepEqual(resolveRoute("scheduling", "forms"), { route: "forms", id: "" });
  const id = "0b7c6a8e-1f2d-4c3b-9a8e-7d6c5b4a3f21";
  assert.deepEqual(resolveRoute("meetings", "types"), { route: "scheduling", id: "types" });
  assert.deepEqual(resolveRoute("meetings", `types/${id}`), { route: "scheduling", id: `types/${id}` });
  assert.deepEqual(resolveRoute("settings", "calendar"), { route: "scheduling", id: "availability/calendars" });
  assert.deepEqual(resolveRoute("settings", "calendars"), { route: "scheduling", id: "availability/team" });
  assert.deepEqual(resolveRoute("settings", "payments"), { route: "scheduling", id: "payments" });
  assert.deepEqual(resolveRoute("settings", "sites"), { route: "visitors", id: "setup" });
  assert.deepEqual(resolveRoute("settings", "identity"), { route: "visitors", id: "setup" });
  assert.deepEqual(resolveRoute("settings", "account_alerts"), { route: "visitors", id: "alerts" });
  assert.deepEqual(resolveRoute("settings", "lead_scoring"), { route: "scoring", id: "" });
  assert.deepEqual(resolveRoute("settings", "icp"), { route: "scoring", id: "ideal" });
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

test("contacts and meetings: the list, the Overview, and one record", () => {
  const id = "0b7c6a8e-1f2d-4c3b-9a8e-7d6c5b4a3f21";
  assert.deepEqual(contactsPage(""), { page: "list", id: "" });
  assert.deepEqual(contactsPage("overview"), { page: "overview", id: "overview" });
  assert.deepEqual(contactsPage(id), { page: "contact", id });
  assert.deepEqual(meetingsPage(""), { page: "list", id: "" });
  assert.deepEqual(meetingsPage(id), { page: "meeting", id });
  assert.deepEqual(meetingsPage("nope"), { page: "list", id: "" });
});

test("routing: seven tabs, a run in History, a past version, and the old tab names forward", () => {
  const run = "0b7c6a8e-1f2d-4c3b-9a8e-7d6c5b4a3f21";
  assert.deepEqual(routingPage(""), { page: "", sub: "", version: null, id: "" });
  for (const p of ["rules", "teams", "regions", "company-types", "review"] as const) assert.deepEqual(routingPage(p), { page: p, sub: "", version: null, id: p });
  assert.deepEqual(routingPage(`history/${run}`), { page: "history", sub: run, version: null, id: `history/${run}` });
  assert.deepEqual(routingPage("history/nope"), { page: "history", sub: "", version: null, id: "history" });
  assert.deepEqual(routingPage("versions/3"), { page: "", sub: "", version: 3, id: "versions/3" });
  assert.equal(routingPage("reps").id, "teams");
  assert.equal(routingPage(`log/${run}`).id, `history/${run}`);
  assert.equal(routingPage("held").id, "review");
  for (const bad of ["handoffs", "versions/0", "versions/x", "versions", "nope", "nope/1"]) assert.deepEqual(routingPage(bad), { page: "", sub: "", version: null, id: "" });
});

test("scheduling, visitors, enrichment, emails and lead scoring tabs", () => {
  const id = "0b7c6a8e-1f2d-4c3b-9a8e-7d6c5b4a3f21";
  assert.deepEqual(schedulingPage(""), { page: "types", sub: "", id: "types" });
  assert.deepEqual(schedulingPage(`types/${id}`), { page: "types", sub: id, id: `types/${id}` });
  assert.deepEqual(schedulingPage("types/new"), { page: "types", sub: "new", id: "types/new" });
  assert.deepEqual(schedulingPage("types/nope"), { page: "types", sub: "", id: "types" });
  assert.deepEqual(schedulingPage("availability/team"), { page: "availability", sub: "team", id: "availability/team" });
  assert.deepEqual(schedulingPage("availability/nope"), { page: "availability", sub: "", id: "availability" });
  assert.equal(availabilityPage(""), "schedules");
  assert.equal(availabilityPage("days-off"), "days-off");
  for (const p of ["links", "reminders", "payments"]) assert.equal(schedulingPage(p).page, p);
  for (const gone of ["forms", "ai", "notetaker"]) assert.equal(schedulingPage(gone).page, "types");
  assert.deepEqual(visitorsPage(""), { tab: "feed", id: "" });
  assert.deepEqual(visitorsPage("visits"), { tab: "visits", id: "visits" });
  assert.deepEqual(visitorsPage("alerts"), { tab: "alerts", id: "alerts" });
  assert.deepEqual(enrichmentPage("providers"), { tab: "providers", id: "providers" });
  assert.deepEqual(enrichmentPage("nope"), { tab: "overview", id: "" });
  assert.deepEqual(emailsPage(""), { tab: "emails", id: "" });
  assert.deepEqual(emailsPage("templates"), { tab: "templates", id: "templates" });
  assert.deepEqual(scoringPage(""), { tab: "score", id: "" });
  assert.deepEqual(scoringPage("ideal"), { tab: "ideal", id: "ideal" });
});

test("every page lights its one sidebar item", () => {
  assert.equal(activeItem("routing")?.label, "Routing");
  assert.equal(activeItem("scheduling")?.label, "Scheduling");
  assert.equal(activeItem("visitors")?.label, "Visitors");
  assert.equal(activeItem("emails")?.label, "Emails");
  assert.equal(activeItem("scoring")?.label, "Lead scoring");
  assert.equal(activeItem("objects"), null);
});
