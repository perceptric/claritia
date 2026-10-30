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

test("the sidebar is Inbound, CRM and Nurture, then Settings, with at most five items a group", () => {
  assert.deepEqual(
    GROUPS.map((g) => g.key),
    ["inbound", "crm", "nurture", "settings"],
  );
  const by = (g: string) => NAV.filter((n) => n.group === g).map((n) => n.label);
  assert.deepEqual(by("crm"), ["Contacts", "Companies", "Opportunities", "Meetings"]);
  assert.deepEqual(by("inbound"), ["Forms", "Calendar", "Routing", "Scoring", "Visitors"]);
  assert.deepEqual(by("nurture"), ["Emails", "Segments"]);
  for (const g of GROUPS) assert.ok(by(g.key).length <= 5, g.key);
  assert.equal(defaultRoute, "contacts");
  assert.equal(new Set(NAV.map((n) => n.route)).size, NAV.length, "one item per route");
  assert.deepEqual(ROUTING_TABS.map((t) => t.label), ["Setup", "Leads", "Team"]);
  assert.deepEqual(SCHEDULING_TABS.map((t) => t.label), ["Meeting types", "Booking page", "Availability", "Links and polls", "Reminders", "Payments", "Webhooks"]);
});

test("old addresses open their new home", () => {
  assert.deepEqual(resolveRoute("leads", "abc"), { route: "contacts", id: "abc" });
  assert.deepEqual(resolveRoute("accounts", "abc"), { route: "companies", id: "account/abc" });
  assert.deepEqual(resolveRoute("journeys", ""), { route: "emails", id: "" });
  assert.deepEqual(resolveRoute("workflows", ""), { route: "emails", id: "" });
  assert.deepEqual(resolveRoute("workflows", "11111111-1111-4111-8111-111111111111"), { route: "emails", id: "journeys/11111111-1111-4111-8111-111111111111" });
  assert.deepEqual(resolveRoute("workflows", "new"), { route: "workflows", id: "new" });
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

test("routing: three tabs, a run in Leads, the review list, a past version, and the old tab names forward", () => {
  const run = "0b7c6a8e-1f2d-4c3b-9a8e-7d6c5b4a3f21";
  assert.deepEqual(routingPage(""), { page: "", sub: "", version: null, id: "" });
  assert.deepEqual(routingPage("leads"), { page: "leads", sub: "", version: null, id: "leads" });
  assert.deepEqual(routingPage("team"), { page: "team", sub: "", version: null, id: "team" });
  assert.deepEqual(routingPage(`leads/${run}`), { page: "leads", sub: run, version: null, id: `leads/${run}` });
  assert.deepEqual(routingPage("leads/nope"), { page: "leads", sub: "", version: null, id: "leads" });
  assert.deepEqual(routingPage("leads/review"), { page: "leads", sub: "review", version: null, id: "leads/review" });
  assert.deepEqual(routingPage("versions/3"), { page: "", sub: "", version: 3, id: "versions/3" });
  for (const old of ["rules", "overview", "regions", "company-types"]) assert.equal(routingPage(old).id, "");
  for (const old of ["teams", "reps"]) assert.equal(routingPage(old).id, "team");
  assert.equal(routingPage(`history/${run}`).id, `leads/${run}`);
  assert.equal(routingPage(`log/${run}`).id, `leads/${run}`);
  for (const old of ["review", "held"]) assert.equal(routingPage(old).id, "leads/review");
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
  for (const p of ["booking", "links", "reminders", "payments", "webhooks"]) assert.equal(schedulingPage(p).page, p);
  for (const gone of ["forms", "ai", "notetaker"]) assert.equal(schedulingPage(gone).page, "types");
  assert.deepEqual(visitorsPage(""), { tab: "feed", id: "" });
  assert.deepEqual(visitorsPage("visits"), { tab: "visits", id: "visits" });
  assert.deepEqual(visitorsPage("alerts"), { tab: "alerts", id: "alerts" });
  assert.deepEqual(enrichmentPage("providers"), { tab: "providers", id: "providers" });
  assert.deepEqual(enrichmentPage("nope"), { tab: "overview", id: "" });
  assert.deepEqual(emailsPage(""), { tab: "journeys", sub: "", id: "" });
  assert.deepEqual(emailsPage("emails"), { tab: "emails", sub: "", id: "emails" });
  assert.deepEqual(emailsPage("templates"), { tab: "library", sub: "", id: "library" }, "the old Templates tab opens the Library");
  assert.deepEqual(emailsPage("journeys/123e4567-e89b-12d3-a456-426614174000"), { tab: "journeys", sub: "123e4567-e89b-12d3-a456-426614174000", id: "journeys/123e4567-e89b-12d3-a456-426614174000" });
  assert.deepEqual(emailsPage("journeys/nope"), { tab: "journeys", sub: "", id: "" });
  assert.deepEqual(scoringPage(""), { tab: "model", id: "" });
  assert.deepEqual(scoringPage("leads"), { tab: "leads", id: "leads" });
  assert.deepEqual(scoringPage("ideal"), { tab: "ideal", id: "ideal" });
});

test("every page lights its one sidebar item", () => {
  assert.equal(activeItem("routing")?.label, "Routing");
  assert.equal(activeItem("scheduling")?.label, "Calendar");
  assert.equal(activeItem("visitors")?.label, "Visitors");
  assert.equal(activeItem("emails")?.label, "Emails");
  assert.equal(activeItem("scoring")?.label, "Scoring");
  assert.equal(activeItem("enrichment"), null, "off the sidebar, still at its address");
  assert.equal(activeItem("objects"), null);
});
