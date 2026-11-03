# Lead scoring plan

Scoring gives every lead a fit grade and an activity level (A1 to D4), or one score from 0 to 100. It says how ready the lead is for sales. There are no setup questions: on the first visit the assistant builds the model from the website, the CRM and the last 90 days of leads, and the team then changes anything they like. Nothing changes live scores until someone clicks Publish.

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

## Part 7. What's built

The first version follows the demo: the assistant builds the model on the first visit, and people edit it from there.

- **Build screen** (`src/components/app/scoring/Build.tsx`): no questions. The server reads the leads of the last 90 days, the forms and the site (`src/lib/scoring/build.ts`), then the assistant reviews the result through the step cache (`src/lib/scoring/ai.ts`, kind `scoring_build`). While it works, each source has its own picture: a page being scanned, customers by company size, and past leads as dots. Then each finding and each rule appear one by one, and "Review the model" opens the editor.
- **Model** (`src/components/app/scoring/Editor.tsx`): Rules and Results.
  - **Rules:** the flowchart on the dotted canvas. New lead splits into Fit and Activity, the two columns join at Points taken away, and the three statuses follow. The split and join lines come from the same grid as the columns, so each line meets the center of its column at any width.
  - **Side panel:** Model settings (grading, cut-offs, fade time, start over, capacity), a group (name, max, fit or activity, delete) or a rule (any number of conditions with All or Any, add or take away points or remove the lead, count once or every time up to a limit, its own fade, and how its past leads did). Undo and Redo, autosave after 800 ms, Publish with a confirm.
  - **Results:** the grade grid (click a grade to make it sales-ready), sales-ready leads a week against capacity with "Match my team's capacity", the share of leads that met sales that were sales-ready first, and leads by status.
  - **Assistant:** the box at the bottom (kind `scoring_chat`). It sends back a whole model, which is cleaned before it is saved.
- **Leads** (`src/components/app/scoring/Leads.tsx`): scored leads with search and status filters, fit and activity bars, and the Why panel from the reasons saved with each score.
- **Engine** (`src/lib/scoring/engine.ts`): one pure function scores a lead. Results score each past lead at its own best moment (just before it met sales, or right after its last action), with its meeting and anything after it left out, so the meeting can't make the model look better than it is.
- **Data** (`supabase/migrations/080_scoring_models.sql`): `scoring_models` and `scoring_versions`, `scoring_facts` (field values, forms, meetings, clicks, unsubscribes, and verified or asserted page views and product events), `scoring_write` (writes only what changed, so a band change adds one `lead.band` event) and `scoring_changed`. Publishing turns off the old fixed scoring in `lead_settings`.
- **Worker** (`worker-intel/jobs/scoring.ts`, job `score_refresh`): a quick pass every 5 minutes for leads that are new or did something, so Routing sees a score when a form comes in, and a full pass every 6 hours so activity points fade. Scores keep using `score`, `score_band` (hot, warm, cold, out), `fit_score` and `engagement_score`, so CRM sync, Routing and Workflows work as before; `score_grade` is new.
- **Not yet:** a second model for part of the leads, and a version history screen (versions are kept).

### Running cost of what's built

- Claude: about one build per team (cached after that) at about $0.08, plus about 20 chat messages a month at about $0.03 each (check).
- Worker: the quick pass reads only changed leads. The full pass reads every lead four times a day: at Growth, 500 teams with 20,000 leads each is about 40 million lead reads a day, a few minutes of database time each hour on the current plan (check).

| Item | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Claude Sonnet 5.5, build and chat (check) | $34 (check) | $340 (check) |
| Worker time for `score_refresh` | $0 (current worker) | $0 (current worker, check) |
| Database reads for the full pass | $0 (inside plan) | $0 (inside plan, check) |
| **Total** | **about $34 a month (check)** | **about $340 a month (check)** |
