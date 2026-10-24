# Routing, made easy to understand (plan)

The router works, but its screens use builder words ("queue", "fallback", "strict", "weighted", "held", "replay",
"publish", "version", "SLA"). A founder opening it for the first time can't tell what any part does. This plan rewrites
every screen so a person who has never routed a lead can set it up in five minutes and explain it to their team.

Nothing about how leads are routed changes. This is words, layout, guidance and previews.

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

## Part 10. Build order (1 week)

| Day | Work | Done when |
|---|---|---|
| 1 | New words in one file (`src/lib/router/words.ts`), sentences in `explain.ts`, diff, Slack and emails | Tests read the new sentences |
| 2 | Status bar with Pause routing, flow as a story, card lines, Skipped state | A test lead's path reads top to bottom |
| 3 | Rules as sentences with in-place pickers and starters; Teams cards with "Next in line" | A rule is built without the side panel |
| 4 | Questions panel with real-name examples; Try a lead panel always open; Who gets what | Every choice shows its example |
| 5 | Team, Needs review, History, Saved setups; first-time four steps and Guide me | `scripts/screens-check.ts` runs the four steps in light and dark |

Tests: unit tests for the new words and sentences, the editor model tests updated, `tests/routingScreens.test.ts`
for each renamed screen, and a database test that Pause routing leaves new leads with the owner they came with.

---

## Part 11. Running cost

No new services and no Claude tokens. The always-open Try a lead panel adds one `router_facts` read per lead tried and
the "Who gets what" bars read `router_stats`, both inside the database plan.

| Item | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Extra database reads (Try a lead, Who gets what) | $0 | $0 |
| Claude tokens | $0 | $0 |
| **Added per month** | **$0** | **$0** |
