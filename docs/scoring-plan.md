# Lead scoring plan

Scoring gives every lead a number from 0 to 100. The number says how ready the lead is for sales. It is built the same way as Forms and Routing: the assistant sets it up in a chat, the Summary reads it back in sentences, and the Editor shows it as a flowchart on the dotted canvas. Nothing changes live scores until someone clicks Publish.

## Part 1. What we have now

- `supabase/migrations/043_lead_scoring.sql` holds fixed math in SQL. Fit is the company against the ideal customer, plus the person's email and title. Activity is points for forms, meetings, email clicks and visits, which fade over time. The total mixes the two by a weight.
- `src/components/app/views/LeadScoringPanel.tsx` is one long settings form. It uses words like "Fit vs engagement" and "Activity halves in value every (days)".
- The same panel still has its own "Who gets the lead" routing. The Routing section does this job now, so the copy in Scoring is a second, older router.
- Scores reach the CRM (`score`, `score_band` in pushes), Routing (the `lead.score` condition) and Workflows (the band change event in `069_workflows.sql`). These links stay.

What's wrong: people can't tell why a lead has its score, the points can't be changed beyond a few fixed activities, and nothing shows whether the score predicts meetings.

## Part 2. The screen

Scoring keeps its sidebar item, with three tabs: Setup, Leads and Ideal customer.

### 2.1 Setup

- **First screen** (no model yet): the sketch, one title ("Set up lead scoring"), and the ask box at the bottom. The assistant asks one question at a time:
  1. Who buys from you? (company size, industry, country; this fills the ideal customer)
  2. Which job titles buy, and which never do?
  3. Which pages and actions show interest? (pricing page, demo form, booked meeting)
  4. When is a lead ready for sales? (the assistant suggests a number from past leads)
- **Summary**: the model in sentences, in two groups, with the points on the right.
  - Who they are: "Company has 51 to 500 people +20", "Title has VP or Head +15", "Personal email −10".
  - What they did: "Booked a meeting +40", "Visited pricing +15", "Unsubscribed −30".
  - One line at the bottom: "Points from activity lose half their value every 30 days. A lead with 70 or more is ready for sales."
- **Editor** (flowchart on the dotted canvas, like Routing):
  - New lead → "Who they are" card (rows of point rules) → "What they did" card (rows of point rules) → "Score" node → a split into three end chips: Ready for sales (70+), Warming up (40 to 69), Not yet (under 40).
  - Each row reads "If title contains VP → +15". Clicking a row opens it in the side panel. Conditions use the same field picker and condition engine as Routing (`src/lib/router/conditions.ts`).
  - The side panel for the Score node holds the two cut-off numbers and the fade time.
- **Top bar**: Undo, Redo, Versions, Test on past leads, Publish. This is the same bar as Routing.

### 2.2 Leads

- The list of scored leads: name, company, score, band and a small trend line for the last 30 days.
- Clicking a lead shows "Why 82": every rule that added or took away points, with the date of each action. It is built from the stored reasons, with no AI.
- Filters: band, score range, changed this week.

### 2.3 Ideal customer

The current `IcpPanel`, moved in as is. The chat in Setup can fill it.

### 2.4 Proof

Before Publish, "Test on past leads" scores the last 90 days of leads with the draft and shows:

- how many leads land in each band;
- how often each band booked a meeting and became a deal, for example "Ready for sales: 31% booked a meeting. Not yet: 2%";
- how many leads would change band compared to the live model.

After Publish, the same numbers sit at the top of Leads as one small report.

## Part 3. The assistant

- The scoring chat works like the routing chat (`src/lib/router/chat.ts`): Claude gets tools that change the draft (`add_points`, `edit_points`, `remove_points`, `set_cutoffs`, `set_fade`). Every change is checked, and it can ask one question at a time. It never publishes.
- **Suggest from my deals**: one button in the chat. It compares leads that booked meetings or became deals in the last 6 months with leads that did not, then proposes rules with the numbers behind each one ("VP titles booked 4 times as often"). The person accepts or skips each rule.
- All AI calls go through the step cache. A repeated message with the same draft replays from cache.

## Part 4. The engine

- **Model**: a `ScoreBody` in a new `scoring_models` table with a draft, live versions and a revision, the same shape as `routers`. Rules are `{ id, group: "who" | "what", conds, points, on }`. "What" rules also have an action kind and an optional page match.
- **Code**: `src/lib/scoring/engine.ts` scores one lead from its facts. It is plain TypeScript with tests. The same code runs in the worker, in "Test on past leads" and in "Why 82".
- **Runs**: a `score.refresh` job on the jobs queue (`src/lib/jobs.ts`) rescores leads with new activity right away, and everyone once a day so points can fade. It writes `score`, `score_band`, the reasons and a daily history row.
- **Safety rules** (from CLAUDE.md, reliability first):
  - a probable website visit never adds points; only verified and asserted visits count (the same as today);
  - a band change fires the Workflows event once, even when the job runs twice;
  - a draft never changes a live score;
  - rescoring the same facts twice gives the same score.
- **Moving over**: a migration turns each workspace's `lead_settings` into a first live model with the same points, so scores don't jump on the day it ships. The old "Who gets the lead" settings go to Routing's "Use my current routing". After that, the panel is removed.

## Part 5. Build order

1. Engine, model table, migration from `lead_settings`, the `score.refresh` job, and tests on flaky cases (a job run twice, a visit linked late, a contact merged mid-run).
2. Setup screen: first screen chat, Summary, Editor flowchart, Publish and Versions.
3. Test on past leads, and the proof report on Leads.
4. Leads tab with "Why 82" and the trend line.
5. Suggest from my deals.
6. Remove `LeadScoringPanel` and the old routing in it.

## Part 6. Running cost

Scoring itself makes no AI calls. Only the chat and "Suggest from my deals" call Claude.

- One chat message is about 6,000 tokens in and 800 out, about $0.03 on Claude Sonnet 5.5 with the instructions cached (check). Teams send about 20 messages a month while setting up, then a few.
- "Suggest from my deals" is about 30,000 tokens in and 2,000 out, about $0.08 a run (check), about once a month per team.
- The `score.refresh` job runs on the worker that already exists. 500 teams with 5,000 leads each rescored once a day is a few minutes of work a day.
- Daily history rows: 500 teams × 5,000 leads × 90 days is about 225 million small rows at Growth. History keeps only rows where the score changed, which cuts that to about 10 to 20 million rows, inside the current database plan (check).

| Item | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Claude Sonnet 5.5, scoring chat, about 20 messages per team a month (check) | $30 (check) | $300 (check) |
| Claude Sonnet 5.5, Suggest from my deals, one run per team a month (check) | $4 (check) | $40 (check) |
| Worker time for `score.refresh` | $0 (current worker) | $0 (current worker) |
| Score history rows in Postgres | $0 (inside plan) | $0 (inside plan, check) |
| **Total** | **about $34 a month (check)** | **about $340 a month (check)** |
