import assert from "node:assert/strict";
import { test } from "node:test";
import {
  activeItem,
  availabilityPage,
  defaultRoute,
  EMAILS_TABS,
  GROUPS,
  meetingsPage,
  NAV,
  resolveRoute,
  ROUTING_TABS,
  routingPage,
  SCHEDULING_TABS,
  schedulingPage,
  teamsPage,
} from "../src/lib/nav.ts";

test("the sidebar is Forms, Meetings, Emails and Workflows, with Settings at the bottom", () => {
  assert.deepEqual(
    GROUPS.map((g) => g.key),
    ["main", "settings"],
  );
  const by = (g: string) => NAV.filter((n) => n.group === g).map((n) => n.label);
  assert.deepEqual(NAV.map((n) => n.label), ["Forms", "Meeting types", "Upcoming", "Availability", "Booking page", "Links and polls", "Meeting settings", "Campaigns", "Automations", "Audiences", "Templates", "Brand", "Settings"]);
  assert.deepEqual(NAV.filter((n) => n.section === "meetings").map((n) => n.page), SCHEDULING_TABS.map((t) => t.value), "every Meetings page is an item");
  assert.deepEqual(NAV.filter((n) => n.section === "emails").map((n) => n.page || "campaigns"), EMAILS_TABS.map((t) => t.value), "every Emails page is an item");
  assert.deepEqual(EMAILS_TABS.map((t) => t.label), ["Campaigns", "Automations", "Audiences", "Templates", "Brand"]);
  assert.deepEqual(by("settings"), ["Settings"]);
  // The CRM, Enrichment, Scoring, Segments and Visitors are gone: their addresses open Forms.
  for (const gone of ["contacts", "companies", "opportunities", "objects", "enrichment", "scoring", "segments", "visitors", "signals", "leads", "people", "accounts"])
    assert.deepEqual(resolveRoute(gone, "11111111-1111-4111-8111-111111111111"), { route: "forms", id: "" }, gone);
  assert.equal(defaultRoute, "forms");
  assert.equal(new Set(NAV.map((n) => `${n.route}/${n.page}`)).size, NAV.length, "one item per page");
  assert.equal(new Set(NAV.map((n) => n.key)).size, NAV.length, "keys are unique");
  assert.deepEqual(ROUTING_TABS.map((t) => t.label), ["Policies", "Teams", "Activity"]);
  assert.deepEqual(SCHEDULING_TABS.map((t) => t.label), ["Meeting types", "Upcoming", "Availability", "Booking page", "Links and polls", "Settings"]);
  assert.equal(NAV.find((n) => n.route === "scheduling")?.page, "types", "Meetings starts at Meeting types, at its old address");
});

test("old addresses open their new home", () => {
  assert.deepEqual(resolveRoute("journeys", ""), { route: "emails", id: "automations" });
  assert.deepEqual(resolveRoute("workflows", ""), { route: "emails", id: "automations" }, "Workflows moved into Emails › Automations");
  assert.deepEqual(resolveRoute("workflows", "11111111-1111-4111-8111-111111111111"), { route: "emails", id: "automations/11111111-1111-4111-8111-111111111111" });
  assert.deepEqual(resolveRoute("workflows", "new"), { route: "emails", id: "automations/new" });
  assert.deepEqual(resolveRoute("workflows", "nope"), { route: "emails", id: "automations" });
  assert.deepEqual(resolveRoute("emails", "automations/11111111-1111-4111-8111-111111111111"), { route: "emails", id: "automations/11111111-1111-4111-8111-111111111111" });
  assert.deepEqual(resolveRoute("emails", "automations/new"), { route: "emails", id: "automations/new" });
  // Emails is its own section: its tabs by name, the old ones forwarded, one journey as that workflow.
  assert.deepEqual(resolveRoute("emails", ""), { route: "emails", id: "" });
  assert.deepEqual(resolveRoute("emails", "audiences"), { route: "emails", id: "audiences" });
  assert.deepEqual(resolveRoute("emails", "library"), { route: "emails", id: "templates" });
  assert.deepEqual(resolveRoute("emails", "journeys"), { route: "emails", id: "automations" });
  assert.deepEqual(resolveRoute("emails", "nope"), { route: "emails", id: "" });
  assert.deepEqual(resolveRoute("emails", "campaigns/11111111-1111-4111-8111-111111111111"), { route: "emails", id: "campaigns/11111111-1111-4111-8111-111111111111" });
  assert.deepEqual(resolveRoute("emails", "campaigns/nope"), { route: "emails", id: "" });
  assert.deepEqual(resolveRoute("emails", "campaigns/group/11111111-1111-4111-8111-111111111111"), { route: "emails", id: "campaigns/group/11111111-1111-4111-8111-111111111111" });
  assert.deepEqual(resolveRoute("emails", "campaigns/group/nope"), { route: "emails", id: "" });
  assert.deepEqual(resolveRoute("emails", "journeys/11111111-1111-4111-8111-111111111111"), { route: "emails", id: "automations/11111111-1111-4111-8111-111111111111" });
  // Reports moved into their sections.
  assert.deepEqual(resolveRoute("reports", ""), { route: "forms", id: "" });
  assert.deepEqual(resolveRoute("reports", "reps"), { route: "forms", id: "" });
  assert.deepEqual(resolveRoute("reports", "speed"), { route: "scheduling", id: "upcoming" });
  assert.deepEqual(resolveRoute("reports", "forms"), { route: "forms", id: "" });
  assert.deepEqual(resolveRoute("reports", "email"), { route: "emails", id: "" });
  assert.deepEqual(resolveRoute("analytics", ""), { route: "emails", id: "" });
  assert.deepEqual(resolveRoute("templates", ""), { route: "emails", id: "templates" });
  // Pages and Ads are gone.
  assert.deepEqual(resolveRoute("pages", ""), { route: "forms", id: "" });
  assert.deepEqual(resolveRoute("ads", "x"), { route: "forms", id: "" });
  // Booking forms are forms.
  assert.deepEqual(resolveRoute("scheduling", "forms"), { route: "forms", id: "" });
  const id = "0b7c6a8e-1f2d-4c3b-9a8e-7d6c5b4a3f21";
  assert.deepEqual(resolveRoute("meetings", "types"), { route: "scheduling", id: "types" });
  assert.deepEqual(resolveRoute("meetings", `types/${id}`), { route: "scheduling", id: `types/${id}` });
  assert.deepEqual(resolveRoute("settings", "calendar"), { route: "scheduling", id: "availability/calendars" });
  assert.deepEqual(resolveRoute("settings", "calendars"), { route: "scheduling", id: "availability/team" });
  assert.deepEqual(resolveRoute("settings", "payments"), { route: "scheduling", id: "settings/payments" });
  assert.deepEqual(resolveRoute("settings", "lead_scoring"), { route: "settings", id: "lead_scoring" }, "Settings opens Integrations for it");
  assert.deepEqual(resolveRoute("settings", "team"), { route: "settings", id: "team" });
});

test("Inbound's old addresses open their new home", () => {
  const id = "0b7c6a8e-1f2d-4c3b-9a8e-7d6c5b4a3f21";
  // CRM › Meetings is Meetings › Upcoming; one meeting keeps its page.
  assert.deepEqual(resolveRoute("meetings", ""), { route: "scheduling", id: "upcoming" });
  assert.deepEqual(resolveRoute("meetings", "nope"), { route: "scheduling", id: "upcoming" });
  assert.deepEqual(resolveRoute("meetings", id), { route: "meetings", id });
  assert.equal(activeItem("meetings", "11111111-1111-4111-8111-111111111111")?.label, "Upcoming", "one meeting lights Upcoming");
  // Calendar (scheduling) keeps its address and tabs; Availability is a Meetings tab again (it was Routing › Teams').
  assert.deepEqual(resolveRoute("scheduling", "types"), { route: "scheduling", id: "types" });
  assert.deepEqual(resolveRoute("scheduling", "availability"), { route: "scheduling", id: "availability" });
  assert.deepEqual(schedulingPage("availability/calendars"), { page: "availability", sub: "calendars", id: "availability/calendars" });
  assert.deepEqual(schedulingPage("availability/team"), { page: "availability", sub: "team", id: "availability/team" });
  assert.deepEqual(schedulingPage("availability/nope"), { page: "availability", sub: "", id: "availability" });
  assert.deepEqual(resolveRoute("availability", "team"), { route: "scheduling", id: "availability/team" });
  assert.deepEqual(resolveRoute("routing", "teams/availability"), { route: "scheduling", id: "availability" });
  assert.deepEqual(resolveRoute("routing", "teams/availability/days-off"), { route: "scheduling", id: "availability/days-off" });
  // The Reps page, then Routing › Sales reps, is Routing › Teams; its availability editor is in Meetings.
  assert.deepEqual(resolveRoute("reps", ""), { route: "scheduling", id: "availability/team" });
  assert.deepEqual(resolveRoute("reps", "availability"), { route: "scheduling", id: "availability" });
  assert.deepEqual(resolveRoute("reps", "availability/calendars"), { route: "scheduling", id: "availability/calendars" });
  assert.deepEqual(resolveRoute("reps", "nope"), { route: "scheduling", id: "availability/team" });
  // Routing's parts moved: policies are meetings, teams are in Availability; one policy and the activity log stay.
  assert.deepEqual(resolveRoute("routing", ""), { route: "scheduling", id: "types" });
  assert.deepEqual(resolveRoute("routing", "setup"), { route: "scheduling", id: "types" });
  assert.deepEqual(resolveRoute("routing", "teams"), { route: "scheduling", id: "availability/team" });
  assert.deepEqual(resolveRoute("routing", `teams/${id}`), { route: "scheduling", id: "availability/team" });
  assert.deepEqual(resolveRoute("routing", `policies/${id}`), { route: "routing", id: `policies/${id}` });
  assert.deepEqual(resolveRoute("routing", "activity/review"), { route: "routing", id: "activity/review" });
  // Routing's old tabs forward inside Routing: Assignment to Policies, Sales reps to Teams, History to Activity.
  for (const old of ["setup", "rules", "flow", "versions/3"]) assert.equal(routingPage(old).id, "");
  for (const old of ["reps", "team", "teams"]) assert.equal(routingPage(old).id, "teams");
  assert.equal(routingPage("leads").id, "activity");
  assert.equal(routingPage(`leads/${id}`).id, `activity/${id}`);
  assert.equal(routingPage("leads/review").id, "activity/review");
  assert.deepEqual(routingPage("reps/availability"), { page: "teams", sub: "availability", id: "teams/availability" });
  assert.deepEqual(routingPage("reps/availability/team"), { page: "teams", sub: "availability/team", id: "teams/availability/team" });
  assert.deepEqual(routingPage("teams/availability/nope"), { page: "teams", sub: "availability", id: "teams/availability" });
  assert.deepEqual(teamsPage(""), { page: "list", sub: "" });
  assert.deepEqual(teamsPage(id), { page: "team", sub: id });
  assert.deepEqual(teamsPage("availability"), { page: "availability", sub: "" });
  assert.deepEqual(teamsPage("availability/days-off"), { page: "availability", sub: "days-off" });
  assert.deepEqual(teamsPage("availability/nope"), { page: "availability", sub: "" });
  assert.deepEqual(teamsPage("nope"), { page: "list", sub: "" });
  assert.deepEqual(schedulingPage("upcoming"), { page: "upcoming", sub: "", id: "upcoming" });
  assert.equal(schedulingPage("availability").page, "availability", "Availability is a Meetings tab");
});

test("the testing screens and unknown addresses open Forms, where the app starts", () => {
  for (const old of ["tests", "blocks", "map", "runs", "environments", "schedules", "approvals", "insights", "nope", ""]) assert.deepEqual(resolveRoute(old, "x"), { route: "forms", id: "" });
});

test("current addresses keep their record", () => {
  assert.deepEqual(resolveRoute("forms", "abc"), { route: "forms", id: "abc" });
});

test("meetings: the list and one meeting", () => {
  const id = "0b7c6a8e-1f2d-4c3b-9a8e-7d6c5b4a3f21";
  assert.deepEqual(meetingsPage(""), { page: "list", id: "" });
  assert.deepEqual(meetingsPage(id), { page: "meeting", id });
  assert.deepEqual(meetingsPage("nope"), { page: "list", id: "" });
});

test("routing: Policies with one policy open, Teams with one team, Activity with a run, the review list and errors", () => {
  const run = "0b7c6a8e-1f2d-4c3b-9a8e-7d6c5b4a3f21";
  assert.deepEqual(routingPage(""), { page: "", sub: "", id: "" });
  assert.deepEqual(routingPage(`policies/${run}`), { page: "", sub: run, id: `policies/${run}` });
  assert.deepEqual(routingPage("policies/nope"), { page: "", sub: "", id: "" });
  assert.deepEqual(routingPage("teams"), { page: "teams", sub: "", id: "teams" });
  assert.deepEqual(routingPage(`teams/${run}`), { page: "teams", sub: run, id: `teams/${run}` });
  assert.deepEqual(routingPage("activity"), { page: "activity", sub: "", id: "activity" });
  assert.deepEqual(routingPage(`activity/${run}`), { page: "activity", sub: run, id: `activity/${run}` });
  assert.deepEqual(routingPage("activity/nope"), { page: "activity", sub: "", id: "activity" });
  assert.deepEqual(routingPage("activity/review"), { page: "activity", sub: "review", id: "activity/review" });
  assert.deepEqual(routingPage("activity/errors"), { page: "activity", sub: "errors", id: "activity/errors" });
  // History's old addresses.
  assert.deepEqual(routingPage("history"), { page: "activity", sub: "", id: "activity" });
  assert.equal(routingPage(`history/${run}`).id, `activity/${run}`);
  assert.equal(routingPage(`log/${run}`).id, `activity/${run}`);
  for (const old of ["review", "held", "leads/review", "history/review"]) assert.equal(routingPage(old).id, "activity/review");
  for (const old of ["setup", "rules", "overview", "regions", "company-types", "flow", "versions/3"]) assert.equal(routingPage(old).id, "");
  for (const bad of ["handoffs", "versions/0", "versions", "nope", "nope/1"]) assert.deepEqual(routingPage(bad), { page: "", sub: "", id: "" });
});

test("scheduling tabs", () => {
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
  // Payments and Webhooks moved into Settings; their old addresses open there. Reminders are a workflow now.
  assert.deepEqual(schedulingPage("settings"), { page: "settings", sub: "payments", id: "settings" });
  assert.deepEqual(schedulingPage("settings/nope"), { page: "settings", sub: "payments", id: "settings" });
  assert.deepEqual(resolveRoute("scheduling", "settings/reminders"), { route: "emails", id: "automations" });
  assert.deepEqual(resolveRoute("scheduling", "reminders"), { route: "emails", id: "automations" });
  for (const p of ["payments", "webhooks"]) {
    assert.deepEqual(schedulingPage(p), { page: "settings", sub: p, id: `settings/${p}` });
    assert.deepEqual(schedulingPage(`settings/${p}`), { page: "settings", sub: p, id: `settings/${p}` });
  }
  for (const gone of ["forms", "ai", "notetaker"]) assert.equal(schedulingPage(gone).page, "types");
});

test("every page lights its one sidebar item", () => {
  assert.equal(activeItem("routing")?.label, "Meeting types", "a policy or the activity log lights Meeting types");
  assert.equal(activeItem("scheduling", "")?.label, "Meeting types");
  assert.equal(activeItem("scheduling", "types/11111111-1111-4111-8111-111111111111/all")?.label, "Meeting types");
  assert.equal(activeItem("scheduling", "availability/team")?.label, "Availability");
  assert.equal(activeItem("scheduling", "settings/webhooks")?.label, "Meeting settings");
  assert.equal(activeItem("scheduling", "links")?.label, "Links and polls");
  assert.equal(activeItem("emails", "")?.label, "Campaigns");
  assert.equal(activeItem("emails", "campaigns/group/11111111-1111-4111-8111-111111111111")?.label, "Campaigns");
  assert.equal(activeItem("emails", "automations/11111111-1111-4111-8111-111111111111")?.label, "Automations");
  assert.equal(activeItem("emails", "audiences")?.label, "Audiences");
  assert.equal(activeItem("workflows")?.label, "Automations", "a workflow lights Automations");
  assert.equal(activeItem("settings", "team")?.label, "Settings");
  assert.equal(activeItem("forms")?.label, "Forms");
});
