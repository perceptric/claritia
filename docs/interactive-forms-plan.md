# Interactive forms: more than forms

Status: step 1 built (see "Status" at the end); the rest proposed. 1 November 2026. Builds on `docs/forms-plan.md`, `docs/form-studio.md`, `docs/form-builder-v2.md`
and `docs/on-submission.md`. Replaces the outside draft "Claritia: Static and Interactive Form Templates, revision 1",
lined up with what is in the repo today.

**The goal:** a Claritia form can be a full interactive experience, like Heyflow. A visitor taps through big picture
cards, sees a price, a score or a plan built from their answers, and books the right rep on the last screen. Every
form is on-brand from the first draft, because the brand kit is already learned from the website.

**Two kinds in one builder:**

| Kind | What it does | Examples |
|---|---|---|
| Static | Collects answers and sends them | Contact us, demo request, application |
| Interactive | Turns answers into a result: a price, a score, a plan, a match | Quote estimator, ROI calculator, assessment, quiz |

Both are the same form schema, the same `<claritia-form>` script and the same On Submission (routing, then a
meeting). "Interactive" is a form with a Results section. Any static form can gain one later without losing its
submissions.

---

## Part 1. What's already built

Most of the outside draft is already in Claritia. The plan only adds what is missing.

| Draft asks for | Claritia today | Where |
|---|---|---|
| One schema with a checker | Built. 15 field types, 4 content blocks, consent | `src/lib/forms/schema.ts` |
| Steps, branching, visibility rules | Built. Conditions with All/Any groups, step skips, lists that follow a field | `schema.ts`, `src/lib/forms/values.ts` |
| Safe formulas, never `eval` | Built. Own parser: `+ - * /`, comparisons, `and`, `or`, `min`, `max`, `round`, `abs`, `if`, `ifempty`. Empty stays empty, divide by zero is empty | `src/lib/forms/formula.ts` |
| Server works out results again | Built. The server recomputes every calc from the answers | `formula.ts`, `src/lib/forms/submit.ts` |
| Scores on choices | Built. Each choice can carry a score that formulas read | `Choice.score` in `schema.ts` |
| Brand from the website | Built. Brand kit scan, fonts, colors, corners | `src/lib/forms/brand.ts` |
| AI builds the form | Built. Interview questions, then Sonnet writes the form; the AI bar edits it with Undo | `src/lib/forms/interview.ts`, `chat.ts` |
| Templates | Built. 13 starting points plus Blank | `src/lib/forms/templates.ts` |
| Drag and drop builder, inspector | Built | `src/components/app/forms/FormCanvas.tsx`, `Build.tsx` |
| Routing then booking, owner first | Built. The form picks the meeting, the meeting picks the rep, the calendar shows in the form | `docs/on-submission.md`, `src/lib/forms/booking.ts`, `src/lib/router/` |
| Book later and no-show follow-ups | Built | `docs/meetings-scheduler.md` Part 7 |
| Team alerts, auto-reply from the rep | Built | `src/lib/forms/notify.ts`, `083_form_notify.sql` |
| Workflows after a fill | Built. Folders, waits, meeting reminders | `docs/workflows.md` |
| Submissions, search, export, drop-off per field | Built | `071_form_results.sql`, `src/lib/forms/results.ts` |
| Spam, Turnstile, allowed sites, limits | Built | `submit.ts`, `notify.ts` |
| Contacts, companies, opportunities | Built | `docs/crm.md` |
| MCP tools for forms | Built | `src/lib/forms/mcp.ts` |
| Retry queue for a fill that fails to send | Built. 24 hours in `localStorage` | `src/lib/forms/element.ts` |

**Missing:**

1. A full-screen, one-question-per-screen look (the Heyflow feel): picture cards, cover screens, motion.
2. Results screens: metric cards, price summary, score meter, outcome panel, recommendation cards, checklist.
3. Outcomes: ordered rules that pick one result, with a default.
4. Typed values: money with a currency, percent, a time period. Constants the owner sets, some kept private.
5. A price list (catalog) for quotes and configurators, with add-ons and "needs" rules.
6. Quiz answer keys graded on the server.
7. New inputs: slider, picture choice, yes/no/not sure, currency, percent, file upload, repeat rows.
8. A bigger template gallery with Static and Interactive tabs and real previews.
9. Email my results, and a result saved on the contact's timeline.
10. Result events in the funnel (result viewed, results emailed).

Changes to the outside draft so it fits Claritia:

- `AGENTS.md` is `CLAUDE.md` here. The routing contract it names is `docs/routing-workflow.md` and
  `docs/on-submission.md`.
- No new sidebar items. Everything lives in Forms.
- Charts: no new chart library. Bars and meters are plain SVG with a number beside them.
- A form's score stays separate from lead scoring (`docs/scoring-plan.md`). It reaches lead scoring only through a
  field mapping the owner picks.
- Result emails go through the existing notify job and Resend, not a new sender.
- 24 templates, of which 11 exist today and get upgraded, so the work is 13 new ones plus the engine.

---

## Part 2. The Heyflow layer: screens

A new layout mode in `layout`: `mode: "page" | "screens"`. Page is today's form. Screens shows one step at a time,
full height, with big type. Interactive templates start in Screens.

| Piece | Behavior |
|---|---|
| Cover screen | First screen with a title, one line, a picture or the brand's mark, and Start |
| One step per screen | Big question, big answers, keyboard Enter to go on, Back always there |
| Picture cards | Choice options with an image or an icon from the icon set, 2, 3 or 4 across, one column on phones |
| Auto-advance | A single-choice step moves on when a card is picked (can be turned off) |
| Progress | Bar at the top, counting only the steps this visitor will see |
| Motion | Slide and fade between screens with the brand's `calm` speed and `ease-out` curve; off under reduced motion |
| Result screen | Full width, the result elements from Part 4, then the booking calendar |
| Embed | Inline, full page (hosted), or popup, same as today |

The form script stays one file. The 23 KB gzipped limit (`scripts/build-forms.mts`) rises to 32 KB for the screens
and result elements. Booking already loads on demand, so it doesn't count.

---

## Part 3. The engine

### 3.1 New inputs

| Input | Notes |
|---|---|
| Slider | With a number box beside it; keyboard steps; min, max, step, unit |
| Currency | Amount plus a fixed currency; money math in cents |
| Percent | Typed 0 to 100, read as 0 to 100 in formulas (no hidden divide by 100) |
| Picture choice | Single or multi choice with images; alt text required |
| Yes / No / Not sure | Not sure is its own value, never counted as No or empty |
| Quantity stepper | Number with − and + buttons |
| File upload | From `docs/forms-plan.md` 3.1: private bucket, size and type limits, signed links for the team only |
| Repeat rows | From `docs/forms-plan.md` 3.3: "Add another" for line items and project tasks |

### 3.2 Values and formulas

- **Types on calcs:** `number`, `money` (with currency), `percent`, `duration`. A calc can't add monthly money to
  yearly money; the checker says so in plain words.
- **Period label:** money can carry `per: "month" | "year" | "once"` for display.
- **Constants:** the owner sets named values (hourly cost, base fee). Each is **public** (sent to the browser so
  results update as the visitor types) or **private** (kept on the server; the result for that number shows after
  submit, or through a rate-limited result call).
- **New functions:** `sum`, `ceil`, `floor`. Nothing else until a template needs it.
- **Dependency check:** the checker already reads refs. Add a cycle check and a "used by" list, so deleting a field
  shows every formula, rule, result and mapping that uses it before it goes.
- **Hidden answers count as empty.** A step the visitor skipped adds nothing to a price, a score or routing.
- **Rounding:** only for display. Formulas keep full numbers.

### 3.3 Outcomes

A Results section on the form:

```
results: {
  outcomes: [{ id, title, when: Cond, elements: ResultElement[], meeting?: MeetingTypeId }],
  default: OutcomeId,
  show: "instant" | "after_contact" | "summary_then_contact"
}
```

- Outcomes are checked top to bottom; the first match wins, else the default.
- `when` uses today's condition groups, plus number comparisons on calcs.
- An outcome can pick the meeting type for On Submission. Which rep still comes from the meeting's own rules, so
  routing keeps one owner of the decision.
- `show` decides when the result appears: right away with an optional "Email my results", only after contact details,
  or a summary first and the full result after contact details. Instant is the default for calculators.

### 3.4 Price list

For the quote estimator and configurator: `catalog: [{ id, name, price, per, needs?: id[], excludes?: id[], min?, max? }]`.
The formula `price()` sums what is picked. Removing an item also removes items that need it, with one line saying why.
A price the owner hasn't set blocks that estimate instead of counting as free.

### 3.5 Quizzes

Correct answers live in a private constant set. The browser never gets them before the reveal. The server grades on
submit and returns the score, then each answer's explanation.

### 3.6 Server is the judge

The browser shows live results. On submit the server reads only the answers, works out every calc, score, price and
outcome again from the published version, and stores those. A faked price or score from the browser is ignored.
Routing and the meeting choice read the server's values.

---

## Part 4. Result elements

New content blocks, shown only on result screens:

| Element | Shows |
|---|---|
| Metric card | One calc with label, unit and a line of explanation |
| Price summary | Picked items, add-ons, adjustments, total, period |
| Score meter | Score out of max, the outcome label, the number in text too |
| Dimension scores | Separate scores per group of questions |
| Bar compare | Two to five values as plain SVG bars, with a table version |
| Outcome panel | The outcome's title, text and next steps |
| Recommendation card | A catalog item or plan with "Why this fits" lines |
| Checklist | Met, not met and unknown items |
| Breakdown table | How the total was worked out |
| Assumptions | The constants used, so the result is honest |
| Email my results | Sends the stored result to the visitor through the notify job |
| CTA | Book a meeting (On Submission), open a link, or restart |

Text in result elements can use `{calc}` tags, the same merge tags as alerts today.

---

## Part 5. Gallery and AI

### 5.1 Gallery

Opens from Forms › New form as a full-page sheet (`Sheet` in the app's overlays). Header "Create a form", the AI box
("Describe the form, calculator or quiz you want"), tabs **All / Static / Interactive**, search, and goal filters:
Capture leads, Estimate price, Recommend, Assess, Feedback, Book meetings. **Blank** is its own button.

Each card shows a small live render of the template (inputs on calculators, a score on assessments, a price on
configurators), its name, one line, and square tags for what it does: Price, Score, Match, Booking, Uploads.

Picking a card opens a preview with Desktop and Phone views and Try it. The preview runs the real form script with
example answers and a banner "Example. Nothing is saved." **Use template** makes one draft (a request key stops double
clicks), applies the brand kit, and opens the builder.

### 5.2 AI building

The interview (`interview.ts`) gains the interactive families: calculator, estimator, recommender, assessment, quiz,
eligibility, planner. The model writes the same schema a person would, which goes through the same checker. It never
invents prices, thresholds or benchmarks: it leaves them as constants marked **Set before publishing**, and Publish
stays off until the owner sets them. Results are worked out by the formula engine, never by the model.

The AI bar keeps working on interactive forms: "add a rush fee of 25%", "make the score out of 100".

---

## Part 6. The 24 templates

Static (12). "Upgrade" means the template exists and gets the new look and fields.

| ID | Template | Today | Done when |
|---|---|---|---|
| S01 | Contact us | Upgrade | A Partnership topic routes to its meeting; a retry makes one submission |
| S02 | Request a demo | Upgrade | Lead stays saved and routed when the visitor leaves the calendar |
| S03 | Book a consultation | New | Two visitors on the last slot: one books, the other sees fresh times and keeps their answers |
| S04 | Request a quote | Upgrade | "Not sure" budget kept; no price shown |
| S05 | Newsletter | Upgrade | Signing up twice keeps one contact and doesn't undo an unsubscribe |
| S06 | Download a resource | Upgrade (Gated download) | Needs a real file to publish; the download link works only for this fill |
| S07 | Event registration | Upgrade (Event signup) | Session saved; a full session offers the waitlist |
| S08 | Application | Upgrade (Partner, Job) | Required uploads checked; held for review |
| S09 | Client intake | New | Signed link prefill shows only this contact's data |
| S10 | Feedback | Upgrade | Works with no email; "No follow-up" sends nothing |
| S11 | Waitlist | Upgrade | Same email twice keeps one entry |
| S12 | Refer someone | New | Referrer and referred kept apart; the referred person is never subscribed |

Interactive (12). All new. The numbers are test examples, never real benchmarks.

| ID | Template | Test example |
|---|---|---|
| I01 | ROI and savings calculator | 50 people × 5 h × $30, 40% less, $500/mo, $2,000 setup → $3,000/mo, $28,000 first-year net, 350%, 0.8 months to pay back |
| I02 | Instant quote | $100 base + 20 × $15 + 25% rush → $500; without rush $400 |
| I03 | Plan finder | 5 users needing routing → Team; 20 → Business; 100 → "Talk to us" |
| I04 | Readiness assessment | Scores 3, 2, 1, 2 of 4 each → 50%, Developing |
| I05 | Find the bottleneck | 2,000 visits, 0.5% conversion → Website conversion; unknown traffic → Need more information |
| I06 | Eligibility checker | 20 staff in Region A → Eligible; 80 → Not eligible; unknown → Needs review |
| I07 | Product configurator | $200 + A $80 + B $40 + 10 seats × $10 → $420/mo; without B $380; B needs A |
| I08 | Knowledge quiz | 3 of 5 right → 60%, with each explanation |
| I09 | Self-audit | 6 Yes, 4 No → 60%, 4 gaps; one Not sure hides the percent |
| I10 | Benchmark check | 150 leads / 10,000 visits = 1.5% vs 2% → −0.5 points, −25%; needs a source to publish |
| I11 | Project planner | 100 h at 25 h/week → 4 weeks; a 2-week target is flagged |
| I12 | Guided booking | Onboarding → onboarding meeting; Demo → demo meeting; host is the routed rep |

Every interactive template ends with a Book step that uses On Submission. Booking stays optional on every template.

---

## Part 6b. Editing

Owners change interactive forms without touching code (shown in the Forms demo):

| Way | What it does |
|---|---|
| Click to edit | Click a title, question, card or result text on the canvas and type; the side panel holds a card's image, score and price |
| Flow map | Screens as cards on the dotted canvas with arrows (`FlowLines.tsx`); drag an arrow to make a skip; outcomes are cards in order |
| Numbers tab | Settings and the price list as tables; Private is a switch; a blank value is marked Set before publishing |
| Formula chips | A formula is built by picking questions and settings; Show formula opens the text for power users |
| Try each outcome | Fills answers that reach each outcome, so every result is checked in a few clicks |
| AI bar | "Make the rush fee 30%" changes the form, says what changed, and offers Undo |
| Safety | Deleting a field lists what uses it first; live forms keep the published version while the draft changes |

Adds about 6 days to Part 9 (flow map 3, Numbers tab 2, Try each outcome 1) and $0 a month.

---

## Part 7. Data

| Migration | Adds |
|---|---|
| `103_form_results.sql` | `results`, `constants` (public and private), `catalog` in the form JSON checker; `form_versions.evaluator` (engine version); private constants in their own table, never sent by the public form route |
| `104_form_result_snapshots.sql` | `submission_results`: outcome, every calc, price lines, score, constants used, form and engine version. One row per submission, never rewritten |
| `105_form_uploads.sql` | Private `form-uploads` bucket, `submission_files`, size and type limits, signed links for workspace members |
| `106_form_events.sql` | `result_viewed`, `results_emailed`, `booking_shown` in `form_field_sessions` and `form_daily` |
| `107_form_templates.sql` | `form_templates` registry (id, kind, tags, schema seed, example answers, expected results) so templates can be updated without a deploy |

Old forms have no `results` section and render as they do today. Field ids and CRM mappings stay the same.

The contact timeline gets "Completed ROI calculator" with the stored result. Mapping a result to a contact field is
picked in the form's Data tab, like any other field.

---

## Part 8. Tests (reliability rule)

- **Formula and outcome engine:** every test example in Part 6 as a unit test; empty vs zero vs Not sure; divide by
  zero; cycles; monthly plus yearly refused; the 10,000-form property test extended with calcs and outcomes.
- **Browser and server match:** the same answers give the same result in the form script and on the server, for all
  24 templates.
- **Tampering:** a posted price, score or outcome is ignored; routing reads the server's value.
- **Retries:** the same submission sent three times makes one submission, one contact update, one routing run.
- **Booking:** last-slot race, calendar disconnected, visitor leaves the calendar. The lead and the rep stay.
- **Versions:** a result made on version 1 still reads right after version 2 changes prices.
- **Preview:** gallery and builder previews make no submissions, emails, routing runs or meetings.
- **Screens:** `scripts/screens-check.ts` runs one static and one interactive template from gallery to booked meeting.
- **Flaky case:** the daily form check (`worker/formQa.ts`) fills interactive forms by label, with the step cache, and
  checks the result screen shows the expected outcome.

---

## Part 9. Build order

| Step | What | Days |
|---|---|---|
| 1 | Schema: types on calcs, constants, outcomes, `sum` `ceil` `floor`, cycle check, "used by" | 4 |
| 2 | Server results and snapshots (103, 104), tampering and retry tests | 3 |
| 3 | Screens layout, cover, picture cards, auto-advance, motion | 5 |
| 4 | Result elements and the result screen | 5 |
| 5 | **First slice:** S01 Contact us and I02 Instant quote from gallery to booked meeting | 3 |
| 6 | Slider, currency, percent, Yes/No/Not sure, stepper; price list | 4 |
| 7 | Gallery sheet, previews, template registry (107) | 4 |
| 8 | Uploads and repeat rows (105) | 4 |
| 9 | The other 10 static templates | 4 |
| 10 | The other 11 interactive templates, quiz grading | 8 |
| 11 | AI interview for interactive families; AI bar on results | 3 |
| 12 | Email my results, timeline entry, funnel events (106) | 3 |
| 13 | Screens check, form QA on interactive forms, phone and dark checks | 3 |
| | **Total** | **about 53 days** |

Later: PDF of results, payments on a quote, live benchmark feeds, AI-written advice on a result.

---

## Part 10. Pricing gates

| ClariForm plan | Gets |
|---|---|
| Free | Every static template, 3 interactive forms, screens look, results, Claritia badge |
| Starter | No badge, unlimited interactive forms, Email my results, uploads |
| Pro | Private constants, price lists, quizzes, results on the contact timeline |
| Business | Booking and routing from results, custom domain, abandoned-form follow-up |

---

## Part 11. Running cost

| Item | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Claude: AI builds and AI bar on interactive forms (Sonnet, about 10 builds a team a month at $0.15) | $75 | $750 |
| Upload storage (about 2 GB a team, Supabase Storage at $0.021/GB, check) | $2 | $21 |
| Result emails (inside Resend, already paid for alerts, check) | $0 | $0 |
| Server results and the bigger form script (existing Fly machines and edge cache) | $0 | $0 |
| Database rows for snapshots and events (check) | $0 | $25 |
| **Added monthly total** | **about $77** | **about $796** |

Results never call a model per visitor, so costs don't grow with traffic.

---

## Status

### Step 1 built: settings, new functions and outcomes

| Piece | Where |
|---|---|
| `sum`, `ceil`, `floor`; settings read as `{@name}` | `src/lib/forms/formula.ts` |
| `constants` and `results` on the form, cleaned by the checker: unknown settings, two with one name, bad numbers, one default outcome last, conditions on real fields | `cleanConstants`, `cleanResults` in `src/lib/forms/schema.ts` |
| Calcs read settings; a setting not set leaves the result empty | `calcs` in `schema.ts` |
| `pickOutcome`: first match wins, else the default; a hidden answer never picks a result; browser and server run the same function | `schema.ts` |
| Private settings stripped from the public form | `publicForm` in `schema.ts`, `src/app/api/forms/[id]/route.ts` |
| Publish refuses a form with a setting not set, in the app and over MCP | `src/app/api/forms/publish/route.ts`, `src/lib/forms/mcp.ts` |
| Tests: the I02 quote ($500 and $400, server ignores a posted total), I02 outcomes, private settings, I04 readiness (50%, Developing; unfinished stays unfinished), old forms unchanged | `tests/interactiveForms.test.ts` |

Not yet: the "used by" list before a delete, types on calcs (money with a period), the result screen in the form
script, and storing the outcome with each submission (step 2). The form script is 23,116 bytes gzipped of its 23,552
limit, so step 3 raises the limit as planned.

Running cost of step 1: $0 at Beta and Growth (no new service, no model calls).
