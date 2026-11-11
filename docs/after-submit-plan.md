# After submit: routing and endings in one step

Status: plan, 11 November 2026. Replaces the Studio's **Booking** and **On submission** steps with one step,
**After submit**, and reworks the 740 templates to use it.

## Part 1. The problem

The Studio asks one thing twice and shows a guess.

| Today | Where | What's wrong |
|---|---|---|
| The thank-you, with the calendar under it | The **Booking** step (the last pill, `data-cl-thanks` with `data-cl-book`) | Shows one meeting (the default). The meeting a lead really gets depends on their answers |
| Which meeting | **On submission** › Route by answer (`after.routes`, `src/lib/studio/routes.ts`) | Set apart from what people see |
| Which person | The meeting's Dynamic rules (`settings.dynamic`) | Not visible from the form |
| Who books at all | The engine's `schedule.who` ("only leads that match") | Not in the Studio: a student gets a demo calendar |
| No open times | The engine's `schedule.none` (message or email times later) | Not in the Studio: the preview says "No open times right now" |
| Existing owners | The router keeps a lead with the owner they or their company have, before any rule | Never shown, so a rule can look like it routes a lead it won't |
| The preview's calendar | Picks the meeting in the browser by answers alone | Ignores owners, caps, away and the meeting's rules: can show a rep who won't get the lead |

The engine already works the way the best tools do: the form is saved, then routed on the server (spam, owners,
rules, turns, caps), then the routed rep's times show; a slow route keeps the details and still shows times
(`docs/router.md` Part 7). Only the editor is laid out wrong.

How Chili Piper's Form Concierge does it, as far as its public pages say (its help center couldn't be read; the rest
is marked): the form stays the customer's own; after the send a router routes "by any standard or custom field",
"according to account owner", with weighted round robin; its report counts "Forms submitted" and then "Calendars
displayed". That each path ends in a calendar, a redirect or a message, and that the calendar opens over the page,
is how it's widely described (check). The form builder never designs a calendar page.

## Part 2. The model: paths

A form ends in **paths**, read top to bottom; the first that matches wins. Every form has at least one.

| Part of a path | Values |
|---|---|
| **Who** | Conditions on answers, hidden fields and past fills (the editor and engine we have). The first path can be **Already has an owner** (on or off). The last is always **Everyone else** and can't be deleted, so no lead is ever lost |
| **Then** | **Book** a meeting · **Show a message** · **Go to a page** |
| **With whom** (Book) | Read from the meeting: its host, or its Dynamic rules in one line, with Edit. Unchanged: the form picks the meeting, the meeting picks the person |
| **If no one is free** (Book) | Show the message · Email times later |
| **End screen** | Its own heading, text and photo. Book paths show the calendar under it |

**Always do** (team email, Slack, CRM, follow-ups) stays one list under the paths: it runs on every path.

Everything the Studio ends in today is a path:

| Today | As paths |
|---|---|
| Show the thank-you | Everyone else → Show a message |
| Go to a page | Everyone else → Go to a page |
| Book a meeting + Route by answer rows | One Book path per row, then Everyone else → the default meeting |
| A quiz's score bands | One Show a message path per band (Score is at least 80 …) |
| `schedule.who` = match | The rules → Book; Everyone else → Show a message |

Stored as `after.paths` (`PagePath[]`), compiled by `src/lib/routing/compile.ts` as the rows are today: a path's
conditions joined with its meeting's rules, in order. A Message or Page path compiles to a rule with no rep, so the
router logs it like any route. The send's answer carries the **path id**; the live form shows that path's end screen
(`data-cl-thanks="<path id>"`; the first one with no id is the shared one, so every form made before works as it is).

## Part 3. How to show routing: the options, and the pick

Who uses it: an owner of a 2 to 50 person team, setting it up once, changing it a few times a year, and asked "why
did this lead go there?" now and then. Not a RevOps team living in it all day.

| Option | Looks like | Good at | Bad at | Verdict |
|---|---|---|---|---|
| A. Rule list | Chili Piper, Default, HubSpot: numbered rows of if → then | Compact; order is clear | Reads like code; the outcome is at the end of a long row; no feel for who lands where | The base, rewritten as sentences |
| B. Flow chart | Nodes and lines (Zapier, Default's builder) | Shows the shape at a glance | Fiddly to build, breaks down past five rules, scary for small teams, needs a big screen | No |
| C. Outcome cards | One card per path, written as a sentence, its end screen beside it | Plain English; the end screen and the route are one thing; matches how people think ("big teams talk to sales") | Overlap between paths is hidden unless shown | **Pick, with A's order** |
| D. Decision table | Rows of paths, a column per question | Territories (country × size) | Mixed rules leave most cells empty | Later, as an import for territory lists |

**The pick: a numbered stack of path cards, each a sentence, with the end screen on the canvas.**

### The right panel: After submit

```
Before any path                                   ⓘ hover: what each one does
  ☑ Spam check          ☑ Keep existing owners
──────────────────────────────────────────────
1  Already a customer
   People who already have an owner
   → book Check-in with their owner                        12 last 30 days
──────────────────────────────────────────────
2  Big teams                                               ⋮ drag
   Team size is 51 or more
   → book Enterprise demo · Enterprise team takes turns    31
   If no one is free: email times later
──────────────────────────────────────────────
3  Not a fit
   Work email is a free address, or Role is Student
   → show a message                                        48
──────────────────────────────────────────────
   Everyone else
   → book Intro call · anyone on the team                  203
   If no one is free: show the message
──────────────────────────────────────────────
+ Add a path        ✦ Describe it to Tia
──────────────────────────────────────────────
Always do: Email the team · Slack #leads · HubSpot
```

Rules that make it trustworthy:

1. **Sentences, not fields.** Each card reads as one line: who, then what. Editing opens the condition editor we have
   inside the card.
2. **Order you can see and change.** Numbers and drag. Under a card that can never be reached (an earlier path catches
   everyone it would), a warning line: "Never reached: everyone here matches Big teams first." Same for a condition
   on a question that's gone (the form check already blocks Publish on those).
3. **Everyone else is fixed at the bottom** and can't be deleted. "Before any path" is fixed at the top. So the panel
   always shows the whole route, in run order, start to end.
4. **Counts from real leads.** Each card shows how many leads took it in the last 30 days (the routing log), and
   clicking the number lists them with "why" (the log's sentences). A new form shows nothing there.
5. **Who books it, in one line, with Edit.** The meeting's own routing, read-only here, so a meeting used by a form
   and by its booking link has one set of rules.
6. **Tia builds it.** "Big companies to the sales team, students get our free guide, everyone else books an intro" →
   paths, shown as a draft to accept (Tia's usual confirm). Chili Piper's "Chili AI" builds rules from prompts too.

### The canvas: Preview as

Above the form, a row of chips, one per path: **Already a customer · Big teams · Not a fit · Everyone else**.

- Picking a chip shows that path's end screen: its heading and text (edit in place), and for a Book path the
  calendar in the form's style with **real times from the server**, routed the way a lead on that path would be
  ("Try a lead" on `rt_test` with answers that match the path). Under it: "Books with Maya (Enterprise team, her
  turn next)."
- Picking a card in the panel picks its chip, and back.
- In **Preview**, as answers are typed, the path the lead would take lights up in the panel (the same compiled
  conditions, run in the browser for the light; the server decides for real on send). That's the "test a lead"
  most tools hide in a separate dialog.

### The step bar

`Welcome — 1 Contact — 2 Your team — ◆ After submit`. One end step. Booking and On submission go.

### How the calendar opens

A form setting: **In the form** (today) or **Over the page** (a popup above the site, for small embeds like a
sidebar form). Chili Piper is known for the popup (check).

### First screen

A form with one path shows four starting points (the `ToolIntro` pattern), each a set of paths to accept:
**Everyone books** · **Only qualified leads book** · **Big teams to sales** · **Customers to their owner**.

## Part 4. Rework the 740 templates

Today: 620 end in one message, 120 show a booking button, none route, 32 quizzes have score bands.

The template format (`src/lib/forms/gallery/types.ts`) gets `ends: TemplateEnd[]` in place of `end`:
`{ id, when?: Cond, then: "message" | "page" | "book", meeting?: string, title, text, photo? }`, the last with no
`when`. `meeting` names a role ("Sales demo", "Intro call", "Consultation"); using the template maps each role to one
of the workspace's meetings (the first one by default), and the Studio shows an unmapped role the way it shows an
unset constant, blocking Publish until it's picked. Old `end` reads as one end, so nothing breaks while the rest move.

What each kind gets:

| Kind (count) | Paths |
|---|---|
| Lead, demo, consultation (≈110) | Not a fit (free email when the form asks for a work email, or a student / job seeker answer) → message with a resource; Big (team or budget past the form's own threshold) → book Sales; Everyone else → book Intro call |
| Appointment, booking (≈57) | New vs returning (when the form asks) → different meetings; Everyone else → book |
| Quote, request, calculator (≈106) | Above a budget or total line → book a call; under → message with the estimate (the calc) |
| Quiz (32) | Score bands → one message path each |
| Survey, feedback (≈46) | A low score (NPS 0–6, rating 1–2) → message with "book a call to fix it"; a high one → message with a review link |
| Application, order, registration, the rest | One message, as today |

How:

1. A script reads every template and proposes paths from its own fields (a size, budget, role, email or score
   question and its options), with Claude Sonnet writing the end screens' words in the template's voice, through the
   step cache.
2. A person reviews the proposals in a list (template, its paths as sentences, its end screens) before they're kept.
3. Checks, in `tests/formTemplates*.test.ts`: every template passes the form check; every path's condition reads a
   question and answer the template has; no path is unreachable; the last path has no condition; every Book path has
   a role; walk-forms (`claritia-site/tools/walk-forms.js`) reaches every end screen.
4. The website gallery (`tools/templates.py`) shows a template's paths under its preview ("3 paths: Big teams book
   Sales, …").

## Part 5. Build order

1. The model and the engine: `after.paths`, carrying today's rows, score bands and `who` over; compile; the path id
   on the send's answer. Tests on the flaky cases: an unreachable path, a meeting deleted under a path, a path whose
   question was deleted, a slow route, a lead already owned, a no-times path.
2. The live form: end screens per path; the booking and end-screen code moves to the second script (`x1.js`),
   since `v1.js` is 18 bytes under its limit (`scripts/build-forms.mts`).
3. The Studio: the After submit step, the path cards, Preview as with real times, counts, the reachability warning.
4. Templates: the format, the proposals, review, the checks, the website.
5. Tia building paths; In the form / Over the page; the four starting points.

## Running cost

| | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Servers | $0: the same engine and VPS | $0 |
| Preview as (one routing test per preview) | $0: on the web app | $0 |
| Path counts (one indexed read per open panel) | $0 | $0 |
| Tia building paths (a few Sonnet calls when asked, from AI credits) | under $5 (check) | under $40 (check) |
| **Monthly total** | **under $5** | **under $40** |

One-off: rewriting the 740 templates' end screens with Sonnet, about 2 to 3 million tokens through the step cache,
about $10 to $20 (check).
