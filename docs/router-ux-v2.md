# Routing, made easy to understand (plan)

The router works, but its screens use builder words ("queue", "fallback", "strict", "weighted", "held", "replay",
"publish", "version", "SLA"). A founder opening it for the first time can't tell what any part does. This plan rewrites
every screen so a person who has never routed a lead can set it up in five minutes and explain it to their team.

How leads are routed stays the same. This plan changes the words, the layout, what you can see before going live, and
how it feels: you watch a lead travel through your setup, see turns dealt out like cards, and get a small celebration
when it goes live.

---

## Part 1. What's hard today

| Problem | Where | Why it hurts |
|---|---|---|
| Builder words everywhere | Every screen | "Queue", "fallback", "strict", "weighted", "hours only", "held", "replay" mean nothing to a sales lead |
| The flow shows steps, not a story | Router | Seven cards in a column; nothing says "a lead comes in, then this happens" in one sentence |
| Settings are toggles with no meaning | Inspector | "Keep owner: on", "When the owner is out: backup" doesn't say what will happen to a real lead |
| You can't see the result until you test | Router | The Test panel is hidden behind a button; people publish without knowing who gets what |
| "Draft" and "Publish" feel risky | Header | It isn't clear whether leads are being routed right now, or by which setup |
| Tabs named after data, not jobs | Router, Reps, Log, Held, Versions | "Held" and "Log" don't say "leads waiting for you" and "what happened" |
| Rep settings mix four ideas in one row | Reps | Pause, out of office, backup and caps sit side by side with no grouping |
| The Log reads like a database | Log | Columns "Path", "Version", "Result" and filters "Any queue / Any rule" |
| No first-time guide past the template picker | First screen | After picking a template you land in the full editor with no next step |

---

## Part 2. New words

One rule: name things by what they do for the lead, in words a sales team already uses. Every screen, the run
sentences (`src/lib/router/explain.ts`), Slack, emails, MCP and the docs use the same words.

| Today | New | Shown as |
|---|---|---|
| Router (tab) | Setup | "Lead routing setup" |
| Spam check | Filter out junk | "Hold leads that look fake" |
| Match account | Same company, same rep | "Send to whoever owns the company" |
| Keep owner | Keep their rep | "A lead who already has a rep keeps them" |
| Rules | Who gets which leads | "If a lead matches, send it to a team" |
| Rule | Rule | "If … then send to …" |
| Queue | Team | "A group of reps who take turns" |
| Round robin | Take turns | |
| Weighted | Some get more | with a "share" slider per rep: 1x to 10x |
| By load | Fewest meetings first | |
| Strict | Keep the order | "Skip only reps who are away or full" |
| Hours only | Only during work hours | |
| Fallback | Everyone else goes to | "If no rule matches" |
| Response time (SLA) | Follow-up time | "Rep must reach out within …" |
| Nudge | Reminder | |
| Route again (after miss) | Give it to someone else | |
| Held | Needs review | tab badge shows the count |
| Unassigned | No rep found | |
| Log | History | |
| Reps | Team | |
| Pause | Away | "Away until …" |
| Out of office | Away (dates) | one control with Pause |
| Backup | Covers for them | "Who covers when they're away" |
| Cap per day / week | Daily limit / Weekly limit | |
| Draft | Unsaved changes | "Changes not live yet" |
| Publish | Make live | |
| Version | Saved setup | "Setup from Oct 24, 3:10 PM" |
| Roll back | Go back to this one | |
| Test | Try a lead | |
| Replay | Preview on past leads | |
| Why not | Why not them? | |
| Taken back | Undone | |

The run sentences change to match: "Matched rule **US mid-market**. **Lee** was next in line (3 of the last 9)." →
"**US mid-market** rule matched, so it went to the **US team**. **Lee** was next in line."

---

## Part 3. The Setup screen

### 3.1 Status bar (top, always visible)

One line that answers "is this on, and what is it doing?":

- **On**: green dot, "Routing is on. 42 leads routed this week." with **Pause routing**.
- **Changes not live yet**: amber dot, "You have changes that aren't live." with **Preview on past leads** and
  **Make live**.
- **Off**: gray dot, "Routing is off. New leads keep the owner they come with." with **Turn on**.

Pause routing is new: it stops routing without deleting anything (a flag on `routers`, checked in `route()`).

### 3.2 The flow as a story

The cards stay, but read as one sentence top to bottom, with a line of plain words joining each card:

```
A new lead comes in
  ↓  first
[ Filter out junk ]             Hold leads that look fake          → 3 this week need review
  ↓  then
[ Same company, same rep ]      Send to whoever owns the company   → 12 went to their company's rep
  ↓  if no company rep
[ Keep their rep ]              A lead who already has a rep keeps them
  ↓  otherwise
[ Who gets which leads ]        1. Enterprise → Enterprise team
                                2. North America, 51 to 200 people → US team
  ↓  if no rule matches
[ Everyone else goes to ]       Sam Lee
  ↓  after a rep gets the lead
[ Follow-up time ]              Reach out within 1 hour, or it goes to someone else
```

- Each card has its one-line meaning under the title (the line in the table above). This is the only help text on the
  screen, the same exception Omniscient makes for settings pages; CLAUDE.md's minimal-copy rule gets that one line
  added for Routing.
- The joining words ("first", "then", "if no company rep", "otherwise", "if no rule matches") are part of the drawing.
- A card that's off reads "Skipped" in gray, with its line struck through, so it's clear the lead passes by it.
- Counts move to the right of each card as a result: "12 went to their company's rep", never a bare number.

### 3.3 Rules as sentences

A rule card reads like speech and is edited in place:

> **If** country is **United States** or **Canada** **and** company size is **51 to 200**, **send to** **US team**.

- Every bold part is a button that opens a small picker (field, test, value, team). No separate inspector form for
  rules.
- "and" / "or" is one click on the word itself.
- **Add a rule** offers six starters: by country or region, by company size, by form, by an answer on the form, by
  lead score, by job title. Each fills a sentence with blanks.
- Drag to reorder, with "Checked first" on top and "Checked last" at the bottom of the list.

### 3.4 Teams (today's queues)

Teams sit in their own row under the flow as cards: name, reps' faces, and how they share: "Take turns", "Some get
more", "Fewest meetings first". Opening one shows:

- Reps with a share slider when "Some get more" (1x to 10x, shown as "gets twice as many").
- **Only during work hours** and **Keep the order** as plain switches, each with one line.
- "Next in line: **Ana**" at the top, worked out from the last 30 days, so people see how turns work.

### 3.5 Questions in place of toggles

The side panel asks questions with the answer as the choice:

| Card | Question | Choices |
|---|---|---|
| Filter out junk | Which leads should wait for review? | Throwaway emails, Made-up names, Too many forms from one person, Personal emails (Gmail and others) |
| Same company, same rep | Who owns the company? | Opportunity owner first, then company owner / Company owner only |
| Same company, same rep | Also make the rep the company owner when it has none? | Yes / No |
| Keep their rep | If their rep is away, what happens? | Wait for them / Give it to whoever covers for them / Send it on to a team |
| Everyone else goes to | Who gets leads no rule matched? | A person / A team |
| Follow-up time | How fast must a rep reach out? | 5 min … 2 days |
| Follow-up time | Send a reminder? | No / At half the time / At a set time |
| Follow-up time | If they don't, what happens? | Give it to someone else / Give it to a manager / Just remind them |

Each choice shows a one-line example with a real name from the workspace: "Dana from Acme goes to **Lee**, who owns
Acme."

### 3.6 Try a lead, always open

The Test panel becomes a panel on the right that's always there on wide screens (folds to a button under 1,280 px):

- **Try a lead**: pick a recent lead or type an email. The flow lights up the path, and the panel says, in one line,
  "Dana Lee would go to **Lee Park**, because she matches **US mid-market** and Lee is next in line."
- **Who gets what this week**: a small bar per rep from the last 7 days, with today's setup compared to the unsaved
  one when there are changes.
- **Why not them?**: pick a rep to see the one sentence why they didn't get it.

### 3.7 Make live

The publish dialog becomes a short review:

- "What changes": the signed sentences, in the new words.
- "On last month's leads": 312 leads, 41 would go to a different rep, 3 would wait for review; one click opens the
  full preview.
- A note field ("What changed and why") and **Make live**.

---

## Part 4. Team (today's Reps)

One row per rep with three plain columns and a side panel for the rest:

| Column | Shows |
|---|---|
| Status | "Taking leads", "Away until Friday", "Full for today (10 of 10)" as a pill |
| This week | "14 leads, 6 meetings" |
| Follow-up | "Reached out in 22 min on average, 1 missed" (from `router_sla_stats`) |

The side panel groups settings under three headings: **Away** (until a date, or set dates, one control), **Who
covers for them**, **Limits** (daily and weekly). Teams they're in show as chips with a link to the Setup card.

---

## Part 5. Needs review (today's Held and Unassigned)

- One tab, two sections: "Looks like junk" and "No rep found", each with its count in the tab badge.
- Each row says why in plain words ("Throwaway email address", "Everyone on the US team was away") and has the two
  likely buttons as words: **Send to a rep** / **It's junk**, and **Always allow acme.com** where it fits.
- Empty state: "Nothing needs review" with the sketch.

---

## Part 6. History (today's Log)

- Columns: **Lead**, **Went to**, **Why** (the one sentence), **From** (form, import, CRM), **When**.
- Filters as words: "Any rep", "Any rule", "Anywhere", "Last 7 days". Version and queue filters move into "More".
- The side panel reads as a short story, step by step, with the same joining words as the flow, and buttons **Send
  to someone else**, **Open lead** and **Try with my changes**.
- Follow-up shows on each row as a small pill: "Reached out in 12 min", "Waiting, 40 min left", "Missed".

---

## Part 7. Saved setups (today's Versions)

- A simple list: "Setup from Oct 24, 3:10 PM by Vincent, 'Added Canada to US team'", with **See changes** and **Go
  back to this one**.
- The live one is marked "Live now".

---

## Part 8. First time

1. **Pick how you want to start** (today's templates, renamed): "Everyone takes turns", "By region", "By company
   size", "Big accounts to senior reps", "Keep my current setup" when lead settings exist.
2. **Who's on the team?** Pick reps from the workspace, in the same screen.
3. **Try a lead.** A recent real lead runs through it, with the one-line answer.
4. **Make live.**

A short ToolIntro sits above step 1 explaining routing once: "Every new lead gets the right rep in under a second.
Set it up once; it runs for forms, imports and your CRM." After step 4 the four steps fold into a "Setup complete"
line that can be opened again.

A **Guide me** link in the status bar replays the four steps on an existing setup.

---

## Part 9. Small things that add up

- Every count is a sentence ("12 went to their company's rep"), never a bare number on a line.
- Hover on any rep's face shows their status ("Away until Friday").
- Problems read as tasks: "Add reps to the US team", "Pick who gets leads no rule matched", each one click to fix.
- Undo and redo stay; the toast after each change says what changed in the new words.
- Keyboard: `T` try a lead, `N` new rule, `⌘S` save, `⌘↵` make live.
- Dark mode, reduced motion and phone widths follow `docs/brand.md`; under 1,024 px the Setup screen is read-only with
  "Edit on a larger screen".
- Slack messages, emails and the contact page use the new words ("Reach out by 3:40 PM").

---

## Part 10. Watch it work (the moving lead)

The signature moment. When you **Try a lead**, a small round chip with the lead's initials drops in at the top of the
flow and travels down the line:

1. It slides along the line to each card (`calm`, `ease-out`), and the line behind it draws in ink (`slow`).
2. At each card it stops for a beat. A card that let it pass gets a small gray "–" stamp; the card that decides gets a
   green check that pops (`quick`, `ease-spring`).
3. On a rule, the matching words in the sentence light up one by one ("United States" ✓, "51 to 200" ✓).
4. In a team, the reps' faces sit in a row with a small pointer over "next in line". The pointer hops along the row,
   skipping faces that are away (they're dimmed with a moon), and lands on the rep who gets it.
5. The chip flies into that rep's face, which does a small bounce, and the answer sentence types in under the flow.

Held leads stop at "Filter out junk" and the chip turns amber with a small shake (two 4px moves, `quick`). No rep
found: the chip ends in a dashed circle at the bottom with "No rep found".

**Live traffic.** With the setup open, real leads routed in the last minute travel as tiny dots along the lines
(`docs/brand.md` item 29), at most one every 2 seconds, so the screen shows the router is working without a refresh.

Reduced motion: the chip appears at its end place, the path is drawn at once, and the answer shows in full.

---

## Part 11. Deal 20 leads (see how turns work)

A button on every team card: **Deal 20 leads**. It runs 20 made-up leads through the team in memory (the same
`pickInQueue` with counts going up after each pick), and shows it as dealing cards:

- 20 small cards fly from a deck to the reps' faces in turn order, 60 ms apart (`calm`, `ease-spring`), and each
  rep's pile shows its count.
- "Take turns": piles end even. "Some get more": Ana at 2x ends with twice the pile. "Fewest meetings first": reps with
  full calendars get fewer.
- Changing a setting deals again, so the difference shows in two seconds.

Nothing is written; it's a preview. This one control explains "Take turns", "Some get more" and "Keep the order"
better than any line of text.

---

## Part 12. Your setup in plain words

A **Read it back** button in the status bar turns the whole setup into a short paragraph, made from the setup itself
(no AI, so it's always exact):

> Leads that look fake wait for you to review. A lead from a company you already work with goes to that company's rep.
> Enterprise leads (over 1,000 people) go to Sam. Leads from North America with 51 to 200 people go to the US team,
> who take turns. Everyone else goes to Sam. Reps must reach out within 1 hour, or the lead goes to someone else.

It's also the text used in "What changes" on Make live (before and after), and copied to Slack with one click to
tell the team.

---

## Part 13. Describe it, and Claude builds it

At the top of the first screen and in the status bar, with the sparkle (`AiMark`):

> **Describe how you route leads** "Europe goes to Ana and Raj, companies over 500 people go to Sam, everyone else
> takes turns"

- Claude turns it into a setup (rules, teams, everything else) using the reps' real names, and shows it as **changes
  not live yet**, with the moving-lead preview on three recent leads. Nothing goes live without **Make live**.
- Names it can't match ("Raj" when there are two) come back as one question with faces to pick from.
- Anything Claude made carries `AiTag` until a person edits it.
- The call goes through the step cache; the same words give the same setup.

---

## Part 14. Small delights

| Moment | What happens | Motion |
|---|---|---|
| Rule sentence edited | The changed word swaps with a short slide up | `quick`, `ease-out` |
| Rep dragged onto a team | The face lifts with a shadow, the team card opens a gap, the face drops in | `calm`, `ease-spring` |
| Rule dragged to a new place | Other rules slide out of the way | `calm`, `ease-out` |
| Counts change | Numbers count up | `slow`, `ease-out` |
| Make live, first time | A short burst of small round dots in the brand washes from the status dot, then "Routing is on" | `slow`, `ease-spring`, once per workspace |
| Make live, later | The status dot pulses green once | `calm` |
| First real lead routed | A toast with the rep's face: "Your first lead went to Lee" | `calm`, `ease-spring` |
| Follow-up time running | A thin ring around the rep's face empties as time passes, turning amber in the last 15 minutes | steady, no loop under reduced motion |
| Mark contacted | The ring fills and turns green with a check | `calm`, `ease-spring` |
| Needs review emptied | The sketch of a clear desk draws in, "All clear" | `slow` |
| Problem fixed | The task in the setup list ticks and slides away | `calm`, `ease-out` |

Every animation uses the three speeds and two curves in `docs/brand.md`, moves only transform, opacity and SVG stroke,
and shows its end state under reduced motion. Nothing loops except the live-traffic dots, which stop when the tab is
hidden.

---

## Part 15. Easier to use

- **Faces everywhere.** Reps are shown as faces with a status ring: green taking leads, amber full for today, gray
  away (with a small moon). Hover shows "Away until Friday".
- **Words that explain themselves.** Terms in the side panel have a dotted underline; hovering shows a small card with
  a two-line meaning and a tiny drawing (a deck for "Take turns", a scale for "Some get more"). Shown on hover only,
  so working screens stay clean.
- **Setup check.** A short list at the top while anything is missing, as tasks with one-click fixes: "Add reps to the
  US team", "Pick who gets leads no rule matched". It ticks off as you go and folds away when done.
- **One undo for everything**, with a toast in the new words: "Removed Ana from US team. Undo".
- **Safe by default.** Make live always shows the before and after paragraph and the effect on last month's leads.
  Go back to any saved setup in one click.
- **Keyboard.** `T` try a lead, `D` deal 20 leads, `N` new rule, `⌘Z` undo, `⌘S` save, `⌘↵` make live.

---

## Part 16. What we take from Default

Default (the tool Claritia follows for inbound, `docs/inbound.md`) splits routing into small pages a team can learn one
at a time, opens each page on a few numbers that say how things are going, and builds routing from three named blocks:
places (territories), kinds of company (segments) and groups of people (queues). We take the structure and keep our
plain words.

### 16.1 Routing gets its own group in the sidebar

Today Routing is one item with tabs. It becomes a group, like Default's, with one page per job:

| Page | What it's for | Default's name |
|---|---|---|
| **Overview** | How routing is doing, with the setup flow below | — |
| **Teams** | The groups of reps who take turns, with faces, limits and who's away | Queues |
| **Regions** | Named places: "North America", "DACH", "US West", by country, state or zip | Territories |
| **Company types** | Named kinds of company: "Enterprise: over 1,000 people", "Startups: under 50 and funded" | Segments |
| **Handoffs** | An SDR books a meeting for an AE from a lead, Slack or the extension (M4, next) | Handoffs |
| **History** | Every lead routed and why, with saved views | Assignments |
| **Needs review** | Junk and leads with no rep, with a count badge | — |

Each item gets a small colored icon tile, one hue for the whole group (sage for Routing), the way Default colors each
group. The tile uses the brand's wash and step colors, so it follows `docs/brand.md`; the rest of the sidebar keeps its
plain icons until the same change is made app-wide.

### 16.2 Rules built from named blocks

Regions and Company types are made once and reused in rules, so a rule reads "**North America** and **Mid-market** →
**US team**" in place of a list of countries and numbers. Changing "Mid-market" from 51–200 to 51–500 updates every rule
that uses it, and Make live shows which rules that touches. Today's territories become Regions; Company types are new
and stored in the setup next to them.

### 16.3 Two ways a team shares leads

Default names these "max fairness" and "max availability". In our words, on each team card:

- **Fair turns**: everyone ends up with the same number over 30 days (today's round robin; "Some get more" adds shares).
- **First free rep**: whoever can take it right now, picking the one who waited longest. Best with instant booking,
  where the lead wants a time today.

"Fewest meetings first" stays as a third choice. Deal 20 leads (Part 11) shows the difference on the card.

### 16.4 Every page opens on a few numbers

Like Default's "Total records / Incomplete / Unassigned" cards, each page starts with three or four stat cards whose
small line is a sentence, then one chart, then the list:

| Page | Cards | Chart |
|---|---|---|
| Overview | Leads routed this week (vs last week), Reached out on time (92%), No rep found (0), Waiting for review (3) | Leads routed per day, bars, with a range picker; "Where leads came from" with logos (Forms, HubSpot, Salesforce, imports) |
| Teams | Reps taking leads, Away today, Full for today | Leads per rep this week, as bars with faces |
| History | Routed, Moved after a missed follow-up, Undone | Median time to reach out, per day |

Numbers count up on load (`slow`). An empty page shows the sketch and one button instead of zeros.

### 16.5 Saved views of History

History gets views like Default's list: "All leads", "Mine", "Missed follow-ups", "From the pricing form", each with
an owner and a count, and any filter can be saved as a view.

### 16.6 Hover cards for people and leads

Hovering a rep or a lead anywhere in Routing shows a small floating card (as Default does for a person): face, name,
email, then the facts routing used for leads (job title, company size, industry, country) or the status, limits and
follow-up time for reps.

---

## Part 17. Build order (2 weeks and 2 days)

| Day | Work | Done when |
|---|---|---|
| 1 | New words in one place (`src/lib/router/words.ts`), sentences in `explain.ts`, diff, Slack and emails | Tests read the new sentences |
| 2 | Status bar with Pause routing, Read it back paragraph | Pause leaves new leads with their owner (database test) |
| 3 | Flow as a story: joining words, card lines, Skipped state, counts as sentences | The story reads top to bottom in light and dark |
| 4 | Rules as sentences with in-place pickers and six starters | A rule is built without the side panel |
| 5 | Teams with faces, status rings, next-in-line pointer, drag a face onto a team | Drag and drop works with mouse and keyboard |
| 6 | Questions panel with real-name examples, hover meanings | Every choice shows its example |
| 7 | Try a lead panel and the moving lead | The chip's path matches the run's lines in tests |
| 8 | Deal 20 leads, live-traffic dots | Dealing matches `pickInQueue` counts in tests |
| 9 | Describe it with Claude, step cache, name questions | The same words give the same setup twice |
| 10 | Sidebar group with icon tiles, Overview page with stat cards and charts, hover cards | Overview numbers match `router_stats` in tests |
| 11 | Regions and Company types as named blocks in rules, First free rep, saved History views | Changing a block shows every rule it touches on Make live |
| 12 | Team, Needs review, History, Saved setups; first-time four steps; delights table; screens check run with screenshots | `scripts/screens-check.ts` runs the four steps and Try a lead in light and dark, with reduced motion |

Tests: unit tests for words, the paragraph, the deal and the chip path; editor model tests updated;
`tests/routingScreens.test.ts` for each renamed screen; a database test for Pause routing; an AI test that a cached
description replays without calling the model.

---

## Part 18. Running cost

Only "Describe it" calls Claude. One description is about 4,000 tokens in (the setup format, reps' names and fields)
and 1,500 out. Assumes 20 descriptions a team a month at Beta (1,000) and 10 at Growth (5,000), with about a third
served from the step cache.

| Item | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Claude Sonnet for Describe it, about $0.035 each (check) | $25 (check) | $120 (check) |
| Try a lead, Deal 20 leads, Read it back, live dots (database reads and the browser) | $0 | $0 |
| **Added per month** | **about $25** | **about $120** |
