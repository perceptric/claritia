# Routing, by chat (plan)

Status: proposed, 29 October 2026. Replaces the screen plan in `docs/router-ux-v2.md` for how people set up routing.
The engine (`src/lib/router/engine.ts`, `server.ts`, `064_router.sql`) stays as it is.

## The idea

Nobody should build routing by hand. Routing opens on a chat. The person says how leads should be shared, in their
own words, and Claritia builds the whole setup: teams, regions, company types, rules, the backup rep and the junk
filter. It tests the setup on the team's own past leads, shows the result in a few lines, and waits for one click:
**Make live**. To change it later, they say so in the same chat.

The person thinks about one thing: who should get which leads. Claritia does the rest.

| Today | After |
|---|---|
| 7 tabs: Overview, Rules, Teams, Regions, Company types, History, Needs review | 3 tabs: **Setup**, **Leads**, **Team** |
| Build teams, regions and types first, then rules that use them | Say it in a sentence; the chat makes all of it |
| "Finish setup" errors ("Rule 1 has no queue") | The chat never leaves a setup broken; Make live only lights up when it works |
| Toggles for junk, same company, keep their rep | On by default; the chat changes them when asked |
| Try a contact, Preview on past leads, Versions as buttons | The test runs on every change, by itself |

Routing itself stays rules. AI writes the setup; it never decides where a lead goes. Every lead is still routed in
milliseconds by the same engine, with the same reason on the record.

---

## Part 1. The Setup tab

### 1.1 First visit: one box

The first screen (the `ToolIntro` pattern) is a big chat box with the two-tone title "Tell Claritia who gets which
leads. / It builds the rest." Under it, three starting chips, made from the workspace's own data:

- **Set it up for me.** No typing. Claritia reads the team and the last 90 days of leads and proposes a setup
  (Part 3b).
- **Everyone takes turns.** One team, every rep, round robin.
- **By region.** A team per region it finds in the team's leads (for example "North America, Europe").

A person can also just type: "Europe goes to Ana and Raj, companies over 500 people go to Sam, everyone else takes
turns."

### 1.2 What comes back: the plan card

The reply is one card beside the chat (under it on phones):

```
Your setup                                         Make live
──────────────────────────────────────────────────────────
1  Leads from a company you already work with go to its owner.
2  Europe goes to Ana and Raj. They take turns.
3  Companies over 500 people go to Sam.
4  Everyone else takes turns: Ana, Raj, Sam, Lena.
   Backup when no one is free: Lena.

Tested on your last 50 leads
   Ana 14   Raj 13   Sam 9   Lena 14   No one 0
   3 leads would change owner          See them
```

- Each line is the readback (`src/lib/router/readback.ts`), so it is always exactly what will run.
- Each underlined word is a picker: click "Ana and Raj" to swap people, "500" to change the number, "take turns" to
  pick "some get more" or "fewest meetings first". That is the only manual editing there is.
- **Make live** is the one black button. It is gray, with the reason as its label ("Pick who covers Europe"), until
  the setup works.

### 1.3 Changing it later

The chat stays open under the card. "Move Canada to Lena." "Lena is out until Monday." "Stop sending personal emails
to sales." Each message updates the card and shows what changed in green and red lines, with the new test numbers.
Nothing changes for real until Make live.

Questions work too: "Why did Dana go to Sam?" answers from the routing run (`explain.ts`), with a link to the lead.
"Where would a 300-person company in Spain go?" answers with a test (`testRoute`).

### 1.4 When a setup is already live

Setup opens on the plan card of the live setup, with "Live" as its state and the chat box under it. Old setups are
read into the same card, so nothing has to be rebuilt.

---

## Part 2. How the chat builds a setup safely

Same pattern as the form chat (`src/lib/forms/chat.ts`): the model only changes the setup through small tools, and
each tool is checked before it applies.

| Tool | What it does |
|---|---|
| `add_team`, `edit_team`, `remove_team` | A team, its people and how they share (turns, some get more, fewest meetings first) |
| `add_rule`, `edit_rule`, `move_rule`, `remove_rule` | A rule: conditions, then a team or a person |
| `add_region`, `add_company_type` | Made only when a rule needs one; never shown as a separate step |
| `set_backup` | Who gets a lead when no rule or team can take it |
| `set_option` | Junk filter, same company same rep, keep their rep, response times |
| `test` | Runs the draft on past leads or one made-up lead |
| `ask` | One question with choices, when the words aren't clear |

Rules for the chat:

- **It never publishes.** Only the person's click on Make live does (same as the MCP tools in `src/lib/router/mcp.ts`).
- **It never leaves a broken setup.** After every turn the draft goes through `cleanBody` and the problem list
  (`check.ts`). A tool call that would add a problem is refused, and the error goes back to the model, which fixes it
  in the same turn.
- **It asks instead of guessing.** A name that matches two people, or none ("Ana"), a place it can't map, or a rule
  that would send every lead to one person gets one question with choices. Never more than one question per turn.
- **Same words, same setup.** Calls go through the step cache, so the same message on the same setup replays without
  calling the model.
- **People come from the workspace.** It can only pick real teammates (`workspace_people`); it never invents a rep.

---

## Part 3. Every rule the chat can build

The chat and the Flow editor can make anything the engine runs. This is the whole list. "New" marks what the engine
doesn't do today and this plan adds (Part 7, step 1b).

### 3.1 The steps every lead goes through, in order

| Step | What it does | Settings |
|---|---|---|
| Hold junk | Holds leads that look fake for review in Leads | Throwaway emails, blocked domains, made-up names, too many fills in an hour (the limit), personal emails |
| Allow and block lists | Domains or emails that always pass, or are always held | Two lists |
| Same company, same rep | A lead from a company you work with goes to its rep | Rep on the open deal first, or the company's owner; also make the rep the company's owner; when that rep is away: keep them, send to their backup, or route on |
| Keep their rep | A lead who already has a rep keeps them | When that rep is away: keep, backup, or route on |
| Rules | Checked top to bottom; the first that matches decides | Below |
| Everyone else | The team that gets what no rule caught | A team |
| Backup | Who gets a lead when no one else can take it | One person or a team |
| Response time | After a lead is routed, the rep has a set time to act | 5 minutes to 2 days; a nudge before; then route again without them, give it to a manager, or only tell the rep |

### 3.2 What a rule can test

Any number of conditions, joined by **all** or **any**.

| Group | Fields | Tests |
|---|---|---|
| Contact | Country, contact country, state or region, email domain, email type (work, personal, role), job title, seniority, department, lifecycle stage, lead status, **language (new)** | is, is not, is one of, is not one of, contains, starts with, is filled, is empty |
| Company | Company name, domain, country, industry, size, employees, company type, **on a named account list (new)** | The same, plus more than, less than, between for numbers |
| Source | Form, came from (form, import, CRM, API), UTM source, medium and campaign, **page they came from (new)** | The same |
| Form answers | Every question on every form (budget, team size, "what are you looking for") | Fits the question's type |
| Custom fields | Every custom field on contacts and companies | Fits the field's type |
| Score | Lead score, score band | Numbers and bands |
| **Time (new)** | Arrived on a weekday or the weekend, inside or outside business hours, on a holiday | is |

Regions ("Europe", "DACH", "US West") and company types ("Enterprise: over 1,000 people") are named lists the chat
makes when a rule needs one. People never make them first.

### 3.3 What a rule can do

| Action | Example |
|---|---|
| Send to a team | "Europe goes to Ana and Raj" |
| Send to one person | "Customers go to Priya" |
| Send to the company's owner | "Named accounts go to whoever owns them" |
| Hold for review | "Hold leads from competitors" |
| **Don't assign, start a workflow (new)** | "Scores under 20 go to the nurture emails, no rep" |
| **Also tell a channel (new)** | "Enterprise leads also post in #big-deals" |

### 3.4 How a team shares leads

| Setting | Choices |
|---|---|
| How | Take turns, some get more (a weight per person), fewest meetings first |
| Order | Flexible (skips anyone who can't take a lead now) or strict (keeps the turn) |
| Working hours | Only give leads to reps inside their hours, or anytime |
| **Matching language (new)** | Prefer a rep who speaks the lead's language |

### 3.5 Each rep (Team tab)

Working hours and time zone (from their calendar), away until (from their calendar or set by hand), paused, a daily
and weekly cap, a backup person, and **languages (new)**.

### 3.6 Phrases the chat must handle

The test fixtures (Part 8) include at least one message for every row above, for example:

- "Spanish speakers go to Ana." (language)
- "Leads after 6 pm and on weekends go to Lena." (time)
- "Our 40 target accounts go to their owners; everyone else at those companies too." (named accounts)
- "Anyone from the partner form goes to Raj." (form)
- "Google Ads leads with a score over 70 go to the AEs; the rest go to the SDRs." (source and score, two teams)
- "Customers go to Priya, not sales." (lifecycle)
- "VPs and C-level at companies over 500 go to Sam." (seniority and size)
- "Hold anyone from gmail." (personal emails)
- "Scores under 20 get the nurture emails instead of a rep." (no rep, workflow)
- "If no one answers in 15 minutes, give it to the next person." (response time)
- "Sam takes at most 10 a day." (cap)
- "Lena is out next week." (away)

---

## Part 3b. "Set it up for me"

With no words at all, Claritia proposes a setup from what it can see:

- **Who sells:** members with a calendar connected, or who own contacts.
- **Where leads come from:** countries and company sizes in the last 90 days of contacts.
- **What exists:** companies that already have an owner (turns on "same company, same rep").

It picks the simplest setup that fits: one team taking turns when leads are mixed, a team per region when most leads
cluster in two or three regions. The card says what it looked at in one line ("Based on 412 leads and 4 reps").

---

## Part 4. The Leads tab

History and Needs review become one list: every lead the router saw, newest first, with who got it and the one-line
reason. A filter on top: **All**, **Needs a look** (held as junk or no one to send to), **Changed by hand**.
"Let through" and "Pick a rep" stay as buttons on the rows that need them. Clicking a lead opens it in the side
sheet with the reason, step by step.

## Part 5. The Team tab

The reps' table stays (status, today, this week, backup), plus "Away until" in one click. Teams themselves live in the
plan card; this tab is about people.

## Part 6. What goes away

- The Rules, Teams, Regions and Company types tabs, and their "New ..." buttons.
- The "Finish setup" box and red rule errors.
- Versions, Try a contact and Preview on past leads as separate buttons. The card's test does all three; past versions
  move into a "History of changes" line under the card.
- The flow diagram of steps. The numbered readback replaces it.
- Overview: its numbers move to the top of the Leads tab.

The data stays the same (`router_versions`, `RouterBody`), so nothing is migrated.

---

## Part 7. Build order (about 2.5 weeks)

| Step | Work | Time |
|---|---|---|
| 1 | Router ops: each tool as a checked op on `RouterBody`, with tests | 2 days |
| 1b | Engine additions from Part 3: language on leads and reps, time conditions with holidays per region, named account lists, page they came from, the "no rep, start a workflow" and "also tell a channel" actions | 3 days |
| 2 | The chat: system prompt, tools, step cache, one question at a time (`src/lib/router/chat.ts`, `/api/routing/chat`) | 2 days |
| 3 | The plan card: readback lines with pickers, test numbers, changed leads, Make live with its reason | 2 days |
| 4 | "Set it up for me" from the workspace's data | 1 day |
| 5 | Leads tab (History and Needs review merged), Team tab trimmed | 1.5 days |
| 6 | Remove the old tabs, forward their addresses to Setup, update `src/lib/nav.ts` | 0.5 day |
| 7 | Tests and screens check | 1.5 days |

## Part 8. Tests

Per the reliability rule (routing is on the list), every part ships with a test on a flaky case:

- 60 example messages, at least one for every row in Part 3, each with the setup it should make (fixtures). Each runs twice: the second time comes from the
  cache with no model call.
- No message can produce a setup with problems: a property test feeds broken tool calls and checks every turn ends
  with zero problems or a question.
- A name that matches two teammates always asks. A name that matches no one always asks.
- The chat can't publish: no tool reaches `router_publish`.
- The card's test numbers equal what the engine gives on the same leads (`decide` on the same facts).
- An old setup reads into the card and back to the same `RouterBody`.

## Part 9. Running cost

Routing itself adds nothing: the engine has no AI calls, and the Part 3 additions (language, time, account lists) run in the same database query. Only chat messages call Claude.

One message is about 6,000 tokens in (the setup, reps, fields and the cached instructions) and 800 out. With the
instructions cached, that is about $0.03 a message on Claude Sonnet 5.5 (check). Most teams send about 20 messages a
month while setting up, then a few.

| Item | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Claude Sonnet 5.5 for the routing chat, about 20 messages per team a month (check) | $30 (check) | $300 (check) |
| Step cache rows in Postgres | $0 (inside plan) | $0 (inside plan) |
| Servers | $0 (no new service) | $0 (no new service) |
| **Added per month** | **about $30 (check)** | **about $300 (check)** |

Repeated messages replay from the cache, so the real bill should be lower.
