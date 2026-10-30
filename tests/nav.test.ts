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
  repsPage,
  resolveRoute,
  ROUTING_TABS,
  routingPage,
  SCHEDULING_TABS,
  schedulingPage,
  scoringPage,
} from "../src/lib/nav.ts";

test("the sidebar is Inbound, CRM and Nurture, then Settings, with at most five items a group", () => {
  assert.deepEqual(
    GROUPS.map((g) => g.key),
    ["inbound", "crm", "nurture", "settings"],
  );
  const by = (g: string) => NAV.filter((n) => n.group === g).map((n) => n.label);
  assert.deepEqual(by("crm"), ["Contacts", "Companies", "Opportunities"]);
  assert.deepEqual(by("inbound"), ["Forms", "Meetings", "Routing", "Scoring"]);
  assert.deepEqual(by("nurture"), ["Emails", "Segments"]);
  for (const g of GROUPS) assert.ok(by(g.key).length <= 5, g.key);
  assert.equal(defaultRoute, "contacts");
  assert.equal(new Set(NAV.map((n) => n.route)).size, NAV.length, "one item per route");
  assert.deepEqual(ROUTING_TABS.map((t) => t.label), ["Assignment", "Sales reps", "History"]);
  assert.deepEqual(SCHEDULING_TABS.map((t) => t.label), ["Meetings", "Upcoming", "Booking page", "Links and polls", "Settings"]);
  assert.equal(NAV.find((n) => n.route === "scheduling")?.label, "Meetings", "Calendar is now Meetings, at its old address");
});

test("old addresses open their new home", () => {
  assert.deepEqual(resolveRoute("leads", "abc"), { route: "contacts", id: "abc" });
  assert.deepEqual(resolveRoute("accounts", "abc"), { route: "companies", id: "account/abc" });
  assert.deepEqual(resolveRoute("journeys", ""), { route: "emails", id: "" });
  assert.deepEqual(resolveRoute("workflows", ""), { route: "emails", id: "" });
  assert.deepEqual(resolveRoute("workflows", "11111111-1111-4111-8111-111111111111"), { route: "emails", id: "journeys/11111111-1111-4111-8111-111111111111" });
  assert.deepEqual(resolveRoute("workflows", "new"), { route: "workflows", id: "new" });
  assert.deepEqual(resolveRoute("companies", "visits"), { route: "companies", id: "" });
  // Visitors (once Signals) was removed: its addresses open Contacts.
  assert.deepEqual(resolveRoute("signals", ""), { route: "contacts", id: "" });
  assert.deepEqual(resolveRoute("visitors", ""), { route: "contacts", id: "" });
  assert.deepEqual(resolveRoute("visitors", "setup"), { route: "contacts", id: "" });
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
  assert.deepEqual(resolveRoute("settings", "calendar"), { route: "routing", id: "reps/availability/calendars" });
  assert.deepEqual(resolveRoute("settings", "calendars"), { route: "routing", id: "reps/availability/team" });
  assert.deepEqual(resolveRoute("settings", "payments"), { route: "scheduling", id: "settings/payments" });
  assert.deepEqual(resolveRoute("settings", "lead_scoring"), { route: "scoring", id: "" });
  assert.deepEqual(resolveRoute("settings", "icp"), { route: "scoring", id: "ideal" });
  assert.deepEqual(resolveRoute("settings", "team"), { route: "settings", id: "team" });
});

test("Inbound's old addresses open their new home", () => {
  const id = "0b7c6a8e-1f2d-4c3b-9a8e-7d6c5b4a3f21";
  // CRM › Meetings is Meetings › Upcoming; one meeting keeps its page.
  assert.deepEqual(resolveRoute("meetings", ""), { route: "scheduling", id: "upcoming" });
  assert.deepEqual(resolveRoute("meetings", "nope"), { route: "scheduling", id: "upcoming" });
  assert.deepEqual(resolveRoute("meetings", id), { route: "meetings", id });
  assert.equal(activeItem("meetings")?.label, "Meetings", "one meeting lights Inbound › Meetings");
  // Calendar (scheduling) keeps its address and tabs; Availability moved to Routing › Sales reps.
  assert.deepEqual(resolveRoute("scheduling", "types"), { route: "scheduling", id: "types" });
  assert.deepEqual(resolveRoute("scheduling", "availability"), { route: "routing", id: "reps/availability" });
  assert.deepEqual(resolveRoute("scheduling", "availability/calendars"), { route: "routing", id: "reps/availability/calendars" });
  assert.deepEqual(resolveRoute("scheduling", "availability/team"), { route: "routing", id: "reps/availability/team" });
  assert.deepEqual(resolveRoute("scheduling", "availability/days-off"), { route: "routing", id: "reps/availability/days-off" });
  assert.deepEqual(resolveRoute("availability", "team"), { route: "routing", id: "reps/availability/team" });
  // The Reps page is Routing › Sales reps; its availability editor came with it.
  assert.deepEqual(resolveRoute("reps", ""), { route: "routing", id: "reps" });
  assert.deepEqual(resolveRoute("reps", "availability"), { route: "routing", id: "reps/availability" });
  assert.deepEqual(resolveRoute("reps", "availability/calendars"), { route: "routing", id: "reps/availability/calendars" });
  assert.equal(routingPage(resolveRoute("reps", "availability/days-off").id).id, "reps/availability/days-off");
  assert.equal(routingPage(resolveRoute("reps", "nope").id).id, "reps");
  assert.deepEqual(resolveRoute("routing", "reps"), { route: "routing", id: "reps" });
  // Routing's old tabs forward inside Routing.
  for (const old of ["setup", "rules"]) assert.equal(routingPage(old).id, "");
  for (const old of ["team", "teams"]) assert.equal(routingPage(old).id, "reps");
  assert.equal(routingPage("leads").id, "history");
  assert.equal(routingPage(`leads/${id}`).id, `history/${id}`);
  assert.equal(routingPage("leads/review").id, "history/review");
  assert.deepEqual(routingPage("reps/availability"), { page: "reps", sub: "availability", version: null, id: "reps/availability" });
  assert.deepEqual(routingPage("reps/availability/team"), { page: "reps", sub: "availability/team", version: null, id: "reps/availability/team" });
  assert.deepEqual(routingPage("reps/availability/nope"), { page: "reps", sub: "availability", version: null, id: "reps/availability" });
  assert.deepEqual(routingPage("teams/availability"), { page: "reps", sub: "", version: null, id: "reps" });
  assert.deepEqual(repsPage(""), { page: "list", sub: "" });
  assert.deepEqual(repsPage("availability"), { page: "availability", sub: "" });
  assert.deepEqual(repsPage("availability/days-off"), { page: "availability", sub: "days-off" });
  assert.deepEqual(repsPage("availability/nope"), { page: "availability", sub: "" });
  assert.deepEqual(repsPage("nope"), { page: "list", sub: "" });
  assert.deepEqual(schedulingPage("upcoming"), { page: "upcoming", sub: "", id: "upcoming" });
  assert.equal(schedulingPage("availability").page, "types", "Availability isn't a Meetings tab any more");
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

test("routing: three tabs, a run in History, the review list, a past version, and the old tab names forward", () => {
  const run = "0b7c6a8e-1f2d-4c3b-9a8e-7d6c5b4a3f21";
  assert.deepEqual(routingPage(""), { page: "", sub: "", version: null, id: "" });
  assert.deepEqual(routingPage("history"), { page: "history", sub: "", version: null, id: "history" });
  assert.deepEqual(routingPage("reps"), { page: "reps", sub: "", version: null, id: "reps" });
  assert.deepEqual(routingPage("teams"), { page: "reps", sub: "", version: null, id: "reps" });
  assert.deepEqual(routingPage(`history/${run}`), { page: "history", sub: run, version: null, id: `history/${run}` });
  assert.deepEqual(routingPage("history/nope"), { page: "history", sub: "", version: null, id: "history" });
  assert.deepEqual(routingPage("history/review"), { page: "history", sub: "review", version: null, id: "history/review" });
  assert.deepEqual(routingPage("versions/3"), { page: "", sub: "", version: 3, id: "versions/3" });
  assert.deepEqual(routingPage("flow"), { page: "", sub: "flow", version: null, id: "flow" });
  for (const old of ["setup", "rules", "overview", "regions", "company-types"]) assert.equal(routingPage(old).id, "");
  assert.equal(routingPage("team").id, "reps");
  assert.equal(routingPage(`leads/${run}`).id, `history/${run}`);
  assert.equal(routingPage(`log/${run}`).id, `history/${run}`);
  for (const old of ["review", "held", "leads/review"]) assert.equal(routingPage(old).id, "history/review");
  for (const bad of ["handoffs", "versions/0", "versions/x", "versions", "nope", "nope/1"]) assert.deepEqual(routingPage(bad), { page: "", sub: "", version: null, id: "" });
});

test("scheduling, enrichment, emails and lead scoring tabs", () => {
  const id = "0b7c6a8e-1f2d-4c3b-9a8e-7d6c5b4a3f21";
  assert.deepEqual(schedulingPage(""), { page: "types", sub: "", id: "types" });
  assert.deepEqual(schedulingPage(`types/${id}`), { page: "types", sub: id, id: `types/${id}` });
  assert.deepEqual(schedulingPage("types/new"), { page: "types", sub: "new", id: "types/new" });
  assert.deepEqual(schedulingPage("types/nope"), { page: "types", sub: "", id: "types" });
  assert.equal(availabilityPage(""), "schedules");
  assert.equal(availabilityPage("days-off"), "days-off");
  assert.deepEqual(schedulingPage(`types/${id}/all`), { page: "types", sub: `${id}/all`, id: `types/${id}/all` }, "the full editor");
  assert.deepEqual(schedulingPage("types/new/all"), { page: "types", sub: "new", id: "types/new" });
  for (const p of ["booking", "links", "upcoming"]) assert.equal(schedulingPage(p).page, p);
  assert.ok(SCHEDULING_TABS.every((t) => t.icon), "every tab has its icon");
  // Reminders, Payments and Webhooks moved into Settings; their old addresses open there.
  assert.deepEqual(schedulingPage("settings"), { page: "settings", sub: "reminders", id: "settings" });
  assert.deepEqual(schedulingPage("settings/nope"), { page: "settings", sub: "reminders", id: "settings" });
  for (const p of ["reminders", "payments", "webhooks"]) {
    assert.deepEqual(schedulingPage(p), { page: "settings", sub: p, id: `settings/${p}` });
    assert.deepEqual(schedulingPage(`settings/${p}`), { page: "settings", sub: p, id: `settings/${p}` });
  }
  for (const gone of ["forms", "ai", "notetaker"]) assert.equal(schedulingPage(gone).page, "types");
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
  assert.equal(activeItem("scheduling")?.label, "Meetings");
  assert.equal(activeItem("emails")?.label, "Emails");
  assert.equal(activeItem("scoring")?.label, "Scoring");
  assert.equal(activeItem("enrichment"), null, "off the sidebar, still at its address");
  assert.equal(activeItem("objects"), null);
});
