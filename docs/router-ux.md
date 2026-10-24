# M3 Router: screens, workflows and how they work

Status: plan, waiting for a yes. `docs/router.md` says what the router does. This file says how people use it: every
screen and state, every workflow from start to finish, and the code behind each one. Brand and copy rules come from
`CLAUDE.md` and `docs/brand.md`.

---

## Part 1. Design goals

| Goal | What it means on screen | How we check it |
|---|---|---|
| **Working in 5 minutes** | A template opens a router that already routes. A short list says what's left (add reps, pick a fallback). | Screens check: template to first routed lead in under 5 minutes of clicks |
| **See the path** | The router is drawn as a flow. A test lead lights up the exact path it takes. Each line shows how many leads took it this week. | Usability test: a new admin answers "where does a Canadian 300-person lead go?" in 10 seconds |
| **Safe changes** | Edits go to a draft that saves itself. Test, Replay, then Publish. Roll back in one click. | No change reaches live leads without Publish |
| **Never lose a lead** | Held and Unassigned are always one click away, with a count on the tab. | Every lead ends with an owner, Held or Unassigned |
| **Explain in sentences** | Every run reads like a short story. Names are links. "Why not Ana?" has an answer. | The log answers "why" without opening settings |
| **Quiet screens** | Labels, buttons and real errors only. Explaining happens once, on the first screen. | Copy review against `CLAUDE.md` |

**Best practices used, and where:**
- *Recognition over recall:* rules show as sentences on the card ("Country is US or Canada, and size is 51 to 200").
- *Progressive disclosure:* the flow shows a summary; details open in the inspector on the right.
- *Direct manipulation:* drag rules to reorder, drag reps between queues, with Move up and Move down buttons for
  keyboard and screen readers.
- *Immediate feedback:* the test path updates as you edit (debounced 300 ms).
- *Error prevention over error messages:* Publish stays off until the draft checks out, and each problem links to
  the card it's on.
- *Undo everywhere:* Cmd+Z in the editor, Undo on every toast for bulk actions, and Roll back for versions.
- *Consistency:* the same inspector layout as the form studio and the meeting type editor, the same `Select`,
  `Popover`, `FilterEditor`, `SidePanel`, `Badge` and `Tabs` already in the app.

---

## Part 2. Who uses it

| Person | Role in the workspace | Does |
|---|---|---|
| **Ops lead** (often the founder or RevOps) | Owner | Sets up and changes the router, reviews Held, reads Replay, publishes |
| **Rep** | Member | Pauses their own leads, sets out of office, reads their own runs, asks "why did I get this?" |
| **Manager** | Owner (no separate role yet) | Watches load across reps, moves leads, handles Unassigned |

Members see the Router read-only, edit only their own row in Reps, and see every run in Log (the team already shares
contacts). Owners can do everything. This follows the roles the app already has (`is_owner`, `is_member`).

---

## Part 3. Where it lives

Sidebar: CRM › **Routing** (after Meetings). Addresses:

| Address | Screen |
|---|---|
| `/routing` | Router (the flow and inspector), or the first screen until there's a router |
| `/routing/reps` | Reps |
| `/routing/log` and `/routing/log/<run>` | Log, with one run open in the side panel |
| `/routing/held` | Held and Unassigned |
| `/routing/versions/<n>` | One past version, read-only |

Tabs at the top of the page: **Router · Reps · Log · Held** with a count `Badge` on Held when anything waits. The
sidebar item gets a small dot when Held or Unassigned has leads older than an hour.

---

## Part 4. Screens

### 4.1 First screen

Shown until the workspace has a router. `ToolIntro` with a new sketch, **a signpost with three arrows and a paper
plane landing on one** (added to `src/components/sketches/Sketch.tsx` in the house style).

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Routing                                                                     │
│                                                                              │
│                         [ sketch: signpost ]                                 │
│                                                                              │
│                 Send every lead to the right rep                             │
│     Spam held back, accounts kept with their owners, everyone else shared    │
│     fairly. Every lead says why it went where it went.                       │
│                                                                              │
│   ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐        │
│   │ ◯→◯◯◯             │  │ ◯→▢ ▢ ▢           │  │ ◯→★→◯◯            │        │
│   │ Round robin       │  │ Territories       │  │ Owner first       │        │
│   │ Everyone shares   │  │ A queue per region│  │ Accounts keep     │        │
│   │                   │  │                   │  │ their owner       │        │
│   └───────────────────┘  └───────────────────┘  └───────────────────┘        │
│                              Start blank                                     │
└──────────────────────────────────────────────────────────────────────────────┘
```

- Cards lift on hover. Picking one makes a draft and opens the Router with the **Finish setup** list (4.2).
- Territories asks one question in place before opening: which regions (chips: North America, EMEA, APAC, LATAM,
  DACH, UK and Ireland). It makes one rule and one empty queue per region.
- If `lead_settings` already has routing rules, a fourth card leads: **"Your current routing"**, which opens the
  moved-over version (`docs/router.md` Part 11).

### 4.2 Router

Three areas: the top bar, the flow on the left, the inspector on the right. The Test panel slides over the
inspector.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ Router · Reps · Log · Held ③                                                                 │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ (Draft) based on v7 · Saved          [Versions]  [Test]  [Replay]              [Publish]     │
├────────────────────────────────────────────────────────┬─────────────────────────────────────┤
│                                                        │  Rules › US mid-market              │
│   ● New lead                         1,204 this week   │                                     │
│   │                                                    │  Name    [US mid-market        ]    │
│   ┌──────────────────────────────┐                     │                                     │
│   │ ✓ Spam check        5 checks │ ── 12 held ─▶       │  Match   (All) Any                  │
│   └──────────────────────────────┘                     │                                     │
│   │ 1,192                                              │  [Country  ▾][is one of ▾][US ×│CA×]│
│   ┌──────────────────────────────┐                     │  [Size     ▾][between   ▾][51]–[200]│
│   │ ✓ Match account  Opp owner,  │ ── 318 matched ─▶   │  + Condition                        │
│   │   then company owner         │                     │                                     │
│   └──────────────────────────────┘                     │  Send to [US mid-market queue  ▾]   │
│   │ 874                                                │                                     │
│   ┌──────────────────────────────┐                     │  ─────────────────────────────────  │
│   │ ✓ Keep owner   If out: backup│ ── 96 kept ─▶       │  Last 7 days  241 leads             │
│   └──────────────────────────────┘                     │                                     │
│   │ 778                                                │                                     │
│   ┌──────────────────────────────┐                     │                                     │
│   │ Rules                        │                     │                                     │
│   │ ⋮⋮ 1 Enterprise        → Ent │ 88                  │                                     │
│   │ ⋮⋮ 2 US mid-market    → USMM │ 241   ◀ selected    │                                     │
│   │ ⋮⋮ 3 EMEA              → EMEA│ 302                 │                                     │
│   │ + Rule                       │                     │                                     │
│   └──────────────────────────────┘                     │                                     │
│   │ 147 no rule matched                                │                                     │
│   ┌──────────────────────────────┐                     │                                     │
│   │ Fallback          Sam Lee    │                     │                                     │
│   └──────────────────────────────┘                     │                                     │
│                                                        │                                     │
│   Queues  [Enterprise 3] [US mid-market 4] [EMEA 2]    │                                     │
└────────────────────────────────────────────────────────┴─────────────────────────────────────┘
```

**Top bar**
- A status `Badge`: **Live v7** when there's no draft; **Draft · based on v7** when there is. "Saved" fades in after
  each autosave (`calm`).
- **Publish** is the one primary button. It's off while the draft has problems, with the count on a tooltip
  ("2 to fix"). **Test**, **Replay** and **Versions** are ghost buttons.
- When the live version changed since the draft was made (someone else published), a bar says
  "v8 is live. Your draft is based on v7." with **Review changes** and **Start over from v8**.

**Flow (left)**
- Steps are cards joined by a line. Each line shows how many leads went down it in the last 7 days. Lines that end a
  route branch off to the right with their count ("12 held", "318 matched").
- A card shows its summary in one or two lines. Clicking selects it and opens it in the inspector.
- Off steps are drawn faded with an **Off** pill; a toggle on the card turns them back on.
- Rules sit inside one card as rows with a drag handle, number, name, target queue and 7-day count. Drag to reorder,
  or Move up and Move down in the row's menu. A rule that matched nothing in 30 days gets a gray **Unused** pill.
- Problems show on the card itself: a red dot and one line ("EMEA queue has no reps"). Clicking it opens the fix.
- Queues sit under the flow as pills with their rep count; clicking opens the queue in the inspector.
- **Finish setup** (only after a template): a small checklist pinned above the flow with each open item as a link
  ("Add reps to EMEA", "Pick a fallback"). It disappears when empty.

**Inspector (right)**, by step:

| Step | Fields |
|---|---|
| Spam check | Toggles per signal; Blocked list and Allow list (chip inputs that take pasted lists); limits for "too many fills" |
| Match account | Toggle "Open opportunity owner first"; which owner counts (Claritia, CRM, either) |
| Keep owner | Toggle; **When the owner is out:** `Segmented` Keep them · Backup · Route on |
| Rule | Name; **Match** All or Any; condition rows; **Send to** a queue (or "New queue…"); 7-day and 30-day counts |
| Queue | Name; **Method** `Segmented` Round robin · Weighted · By load; **Strict** toggle; **Only during working hours** toggle; members with weight steppers (Weighted only), **Add rep** (person picker), drag reps in from other queues |
| Fallback | A rep or a queue |

**Condition rows** reuse the field, test and value pattern from `FilterEditor` in `src/components/app/FilterBar.tsx`:
- **Field:** `Select` with search, grouped: Contact, Company, Form answers, Source and UTM, Score, Enrichment.
- **Test:** only the tests that fit the field's type (numbers get "between", lists get "is one of").
- **Value:** the right input for the type: chips with search for countries, states and choices (a **Territory** choice
  inserts a saved list); two number boxes for "between"; a date picker for dates; free text with chips for "is one of".
- Each row has a remove button; **+ Condition** adds one; Cmd+D copies the row.

**Editing**
- Every change goes into a local history: Cmd+Z and Cmd+Shift+Z, like the form studio.
- The draft saves itself 800 ms after the last change. A failed save shows "Not saved. Retrying…" in the top bar and
  keeps trying; leaving the page while unsaved asks first (`setLeaveGuard`).

### 4.3 Test panel

Opens from **Test** (or `T`). It slides in over the inspector (`calm`, `ease-out`).

```
┌─────────────────────────────────────┐
│ Test                         [Draft│Live│Both]
│ [ dana@acme.com              ][Run] │
│  or pick a contact  [Search…     ]  │
│                                     │
│ ▸ Change fields                     │
│   Country [US ▾]  Size [51–200 ▾]   │
│   Form [Demo request ▾]             │
│                                     │
│ ── Draft ─────────────────────────  │
│  (LP) Lee Park  · US mid-market     │
│  ✓ Spam check  Passed 5 checks.     │
│  ✗ Match account  No company for    │
│    acme.com.                        │
│  – Keep owner  Dana has no owner.   │
│  ✓ Rules  "US mid-market" matched…  │
│  ✓ Queue  Lee had 3 of the last 9…  │
│                                     │
│  Why not [Ana Ruiz ▾] ?             │
│  Ana is paused until Friday.        │
│                                     │
│ ── Live ──────────────────────────  │
│  (AR) Ana Ruiz · Default            │
└─────────────────────────────────────┘
```

- Typing an email and pressing Enter runs the test. Picking a contact uses everything Claritia knows about them.
- **Change fields** lets you try "what if" values without touching the contact.
- While a test lead is set, the **flow lights up its path**: the lines it took draw in (`slow`, stroke offset), each
  card gets ✓, ✗ or –, and steps it never reached fade. Editing the draft re-runs the test after 300 ms, so the path
  moves as you change a rule.
- **Both** shows Draft and Live side by side; when they differ, a `Badge` says **Different**.
- **Why not…?** picks any rep and answers in one sentence from the same facts ("Ana is paused until Friday", "Raj is
  at his daily cap of 8", "Ana isn't in the US mid-market queue").
- Results are read out to screen readers (`aria-live="polite"`).

### 4.4 Replay

Opens from **Replay** as a wide panel. It runs the draft against past leads and compares.

```
┌───────────────────────────────────────────────────────────────────────────┐
│ Replay draft                                    [Last 30 days ▾]  [Run]   │
│                                                                           │
│  ███████████████████░░░░░  312 of 412                                     │
│                                                                           │
│   412 leads      371 same      41 change      8 now held      0 unassigned│
│                                                                           │
│  Change                                  Leads                            │
│  Ana Ruiz → Lee Park   (new rule EMEA)     33   ›                         │
│  Lee Park → Held       (blocked domain)     8   ›                         │
│                                                                           │
│                                        [Close]          [Publish draft]   │
└───────────────────────────────────────────────────────────────────────────┘
```

- Up to 500 leads run in the browser's request; more go to a job with a progress bar that keeps updating if the
  panel is closed and reopened.
- Numbers count up as results arrive (`slow`, skipped under reduced motion).
- Each change row opens the leads in it; each lead opens **Before** and **After** logs side by side, with the lines
  that differ marked.
- Replay uses the facts each lead had when it was routed (saved on the run), so the comparison is fair, and it
  shares turns the way the queue would have, in order.
- **Publish draft** goes straight to the publish dialog with the replay summary already attached.

### 4.5 Publish

`askConfirm`-style dialog built from the app's dialog helpers:

```
┌──────────────────────────────────────────────┐
│ Publish v8                                   │
│                                              │
│ Changes                                      │
│  + Rule "EMEA" (3rd)                         │
│  ~ Lee Park weight 1 → 2 in US mid-market    │
│  + Blocked domain competitor.io              │
│                                              │
│ Replay  41 of 412 change           [Open]    │
│                                              │
│ Note  [ Split EMEA from US              ]    │
│                                              │
│                      [Cancel]   [Publish]    │
└──────────────────────────────────────────────┘
```

- **Changes** are written by comparing the draft and live bodies (`src/lib/router/diff.ts`), as sentences.
- If Replay wasn't run, the Replay line says **Not run** with **Run now**. Publishing without it is allowed.
- After publishing, a toast says "v8 is live" with **Undo** for 10 seconds (Undo is a roll back to v7).

### 4.6 Versions

A drawer from the right: every version with number, who published, when, note and lead count. Clicking one opens it
read-only in the same flow view (top bar says **v5 · read-only**) with **Roll back to v5** and **Compare with live**.
Roll back asks first (`askConfirm`) and publishes a copy as a new version.

### 4.7 Reps

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ [Search reps]                                                   [Pause selected]             │
├──────┬──────────────┬──────────────────┬────────────┬────────────┬──────────────┬────────────┤
│  ☐   │ Rep          │ Status           │ Today      │ This week  │ Queues       │ Backup     │
├──────┼──────────────┼──────────────────┼────────────┼────────────┼──────────────┼────────────┤
│  ☐   │ (LP) Lee Park│ ● In             │ ▓▓▓░ 6/8   │ ▓▓░░ 21/40 │ USMM  Ent    │ Ana Ruiz   │
│  ☐   │ (AR) Ana Ruiz│ ● Paused · Fri   │ ░░░░ 0/8   │ ▓░░░ 9/40  │ USMM         │ Lee Park   │
│  ☐   │ (RS) Raj Shah│ ● Out · Oct 28–31│ —          │ —          │ EMEA         │ —          │
│  ☐   │ (SK) Sam Kim │ ● In  ⚠ No cal.  │ ▓░░░ 2/—   │ ▓░░░ 5/—   │ —            │ —          │
└──────┴──────────────┴──────────────────┴────────────┴────────────┴──────────────┴────────────┘
```

- **Status** is a pill (green In, amber Paused, gray Out). Clicking it opens a `Popover`: **Pause for** 1 hour, Rest
  of today, Until a date, Until I turn it back on; **Out of office** with a date range; **Back in**.
- Out of office from the calendar shows with a small calendar icon and its dates; it can't be edited here (it comes
  from their calendar), but a manual one can be added on top.
- **Today** and **This week** are small meters against the caps; clicking a meter edits the cap in place (number
  input, Enter to save, Escape to cancel). A blank cap shows "—".
- Warnings sit on the row as icons with a tooltip: no calendar connected, not in any queue, no working hours.
- Bulk: select rows, then **Pause selected** or **Set caps**; a toast offers **Undo**.
- A rep sees only their own row as editable. Their status also lives in two other places: the account menu
  (**Pause my new leads**) and the command bar (`⌘K` › "Pause my new leads").

### 4.8 Log

A table like Contacts, with the `FilterBar` (saved views work the same way).

| Column | Shows |
|---|---|
| When | Relative time, exact time on hover |
| Lead | Name, email, company logo and name |
| From | Form name, "Import", "HubSpot", "API" or "Route again" |
| Result | Owner avatar and name, or a **Held** or **Unassigned** pill |
| Path | The deciding step as a short phrase: "Matched Acme", "Rule: EMEA → round robin", "Kept owner" |
| Version | v7 |
| Time | 38 ms |

- Filters: owner, queue, rule, result, source, version, date. Search by name, email or domain.
- New runs appear at the top with a short rise (`calm`); the list checks for new ones every 10 seconds while the tab
  is open and visible.
- Clicking a row opens the run in the `SidePanel` (from `src/components/app/records/SidePanel.tsx`):

```
┌──────────────────────────────────────────┐
│ Dana Lee · Acme                     [×]  │
│ Demo request · 2:14 PM · v7 · 38 ms      │
│                                          │
│ ✓ Spam check    Passed 5 checks.         │
│ ✓ Match account Acme is owned by Sam Lee.│
│ ✗               Sam is out until Monday. │
│                 → Route on.              │
│ – Keep owner    Dana had no owner.       │
│ ✓ Rules         US mid-market matched:   │
│                 country is US, size is   │
│                 51 to 200.               │
│                 ▸ 1 rule skipped         │
│ ✓ Queue         Lee had 3 of the last 9. │
│                 ▸ Others                 │
│                                          │
│ Owner  (LP) Lee Park                     │
│                                          │
│ [Open contact] [Route again] [Test draft]│
└──────────────────────────────────────────┘
```

- Names in sentences (Sam Lee, Acme, US mid-market) are links to the rep, company and rule.
- **▸ 1 rule skipped** and **▸ Others** open the extra detail (the rule's failed condition; each other rep's count
  and status).
- **Route again** asks first, then runs a new route with reason "Route again"; the panel shows the new run.
- **Test draft** opens the Router with this lead in the Test panel.

### 4.9 Held and Unassigned

One tab, two lists with a `Segmented` switch: **Held ③ · Unassigned ①**.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ (Held 3) Unassigned 1                     [Let through] [Spam] [Allow domain]│
├───┬──────────────────────────┬─────────────────────────────┬────────┬────────┤
│ ☐ │ asdf asdf · x@mail.tm    │ Throwaway domain · Fake name│ 2m ago │  ⋯     │
│ ☐ │ Al Wu · al@initech.io    │ Too many fills (6 in 1h)    │ 1h ago │  ⋯     │
│ ☐ │ Test · qa@competitor.io  │ Blocked domain              │ 3h ago │  ⋯     │
└───┴──────────────────────────┴─────────────────────────────┴────────┴────────┘
```

- Reasons are pills, so the cause is clear at a glance.
- **Let through** routes the lead at once and shows its new owner in the row before it slides out.
- **Spam** marks the contact; a follow-up choice in the toast offers **Block initech.io too**.
- **Allow domain** adds the domain to the allow list and lets through every held lead from it.
- Keyboard: `J` and `K` move, `X` selects, `L` lets through, `S` marks spam.
- **Unassigned** rows have **Assign** (person picker) and **Route again**.
- Empty state: `Empty` with the signpost sketch and "Nothing held".

### 4.10 In the rest of the app

| Place | What changes |
|---|---|
| Contact page, Owner field | "Routed by US mid-market" under the owner, with **Why?** opening the run's side panel |
| Contact timeline | "Routed to Lee Park by US mid-market (round robin)" with a link to the run |
| Contact menu and bulk actions | **Route again** for one or many contacts |
| Form studio › Settings › Book a meeting | **With** `Segmented`: A meeting type · The routed rep. With no router yet, the second option links to **Set up routing** |
| Forms list card | A small route icon when the form books with the routed rep |
| Import, last step | Toggle **Route new contacts** |
| Settings › Sources (each CRM) | Toggle **Route new contacts with no owner** (off by default) and **CRM owners** (link each CRM owner to a teammate) |
| Command bar (`⌘K`) | "Test a route", "Open routing log", "Pause my new leads", "Held leads" |
| Slack (router channel) | "New lead for Lee Park: Dana Lee, Acme (51 to 200, US) from Demo request. Why: US mid-market, round robin." with **Open in Claritia** |

---

## Part 5. Workflows, end to end

### W1. First setup (the ops lead, about 5 minutes)

1. Opens **Routing**. Sees the first screen with three templates.
2. Picks **Territories**, ticks North America and EMEA. The Router opens with a draft: spam check, match account,
   keep owner, two rules, two empty queues, no fallback. **Finish setup** lists three items.
3. Clicks "Add reps to North America": the queue opens in the inspector; adds Lee and Ana. Same for EMEA with Raj.
4. Clicks "Pick a fallback": picks Sam. The list empties and **Publish** turns on.
5. Presses **Test**, types a real lead's email. The path lights up through North America to Lee.
6. Presses **Publish**. The dialog lists the changes; adds a note; publishes. Toast: "v1 is live".
7. Opens **Form studio** › Demo request › Settings › Book a meeting › **With: The routed rep**.

*Behind it:* the template is a body from `src/lib/router/templates.ts`; the draft saves to `router_versions` with
`status = 'draft'`; Publish calls `POST /api/routing/publish`, which runs `check()` on the server again and swaps the
live pointer in one transaction.

### W2. A lead fills the form (under 1 second end to end)

1. Dana sends the Demo request form.
2. `acceptFill` saves the fill (`form_submit`), then calls `route()` with the fill id as its key.
3. `route()` reads the facts in one call (`router_facts`), runs the engine in memory, and writes the owner and run in
   one call (`router_commit`). Typical time: 30 to 60 ms.
4. The form's booking uses Lee as owner for an "Owner first" type: Lee's times show in the form.
5. Dana books. The meeting has Lee as host and links to the fill.
6. Jobs follow: Slack alert to the router channel, the CRM push with Lee's CRM owner id.

*If the router fails or takes longer than 300 ms:* the fill is already saved; the form shows the meeting type's own
times (round robin across its hosts) so Dana still books; a `route` job routes the lead again in the background with
the same key; the run's log says "Routed after the form, the router was slow."

### W3. A rep goes on vacation

1. Raj marks a week out of office in Google Calendar. The next calendar sync (push or the 10-minute refresh) brings it
   in as an out-of-office block.
2. On Reps, Raj's status turns to **Out · Oct 28–31** with a calendar icon. No one had to do anything.
3. New EMEA leads skip Raj. Leads for accounts Raj owns follow the **When the owner is out** setting (his backup, Ana).
4. The log shows "Raj is out of office until Oct 31. → Backup: Ana Ruiz."
5. Raj comes back; status turns **In** on its own at midnight in his time zone.

### W4. Changing territories safely

1. The ops lead adds a rule **DACH** above EMEA in the draft.
2. The Test panel, still holding last week's German lead, moves its path to the new rule as soon as the conditions
   are filled.
3. **Replay** over 30 days: 52 change from Raj to the new DACH rep; 0 held; 0 unassigned.
4. Opens one change to check Before and After side by side. Publishes with a note.
5. Watches **Log** filtered by rule DACH for the next hour.
6. Something's off: **Undo** on the toast within 10 seconds, or later **Versions › Roll back to v7**.

### W5. Daily look at Held (2 minutes)

1. The Held tab shows ③ and the sidebar dot is on.
2. Two rows are clear spam: select both, press `S`. The toast offers **Block mail.tm too**; accepts.
3. One is a real lead with a short name: press `L`. It routes to Lee; the row shows "→ Lee Park" and slides out.

### W6. "Why did I get this lead?" and "Why not me?"

1. Lee opens the contact. Under Owner: "Routed by US mid-market · **Why?**". The run opens in the side panel.
2. Ana asks why she got none today. The ops lead opens **Test**, picks the contact, sets **Why not Ana Ruiz**:
   "Ana is paused until Friday." Ana forgot she'd paused; she turns it off from the account menu.

### W7. A rep leaves the company

1. The owner removes Sam from the workspace.
2. The Router shows a red dot on each queue Sam was in and on the fallback if it was Sam; Publish turns off for the
   draft until fixed. The live version keeps running and skips Sam (the log says so).
3. Contacts owned by Sam: Contacts › filter Owner is Sam › select all › **Route again**. A job routes them; a toast
   shows progress and the result ("212 routed: Lee 71, Ana 70, Raj 71").

### W8. New leads from the CRM

1. On Settings › Sources › HubSpot, the ops lead links each HubSpot owner to a teammate under **CRM owners**, then
   turns on **Route new contacts with no owner**.
2. The next pull finds 14 new contacts with no owner and queues a `route` job for them.
3. Each gets an owner; the owner goes back to HubSpot with the next push.

### W9. An import

1. On the import's last step, the person turns on **Route new contacts**.
2. After the import, a job routes the new contacts in batches of 200, in the order of the file.
3. The import's summary shows "640 routed" with a link to the Log filtered by this import.

### W10. Asking Claude for a change

1. In Claude with Claritia's MCP server: "Leads from Canada should go to Ana."
2. Claude calls `route_test` on a few Canadian leads, then `route_suggest`. It replies with the change and a link.
3. The link opens the Router with the change in a draft and Replay already started. A person publishes; Claude can't.

### W11. Nobody can take a lead

1. Every rep in the queue is at their cap, and the fallback, Sam, is paused.
2. The lead goes to **Unassigned**; an alert goes to the router's Slack channel and the workspace owners' email once.
3. The manager opens Held › Unassigned, presses **Assign**, picks Lee. The log adds "Assigned by hand by Mia."

---

## Part 6. States, copy and access

### 6.1 Every screen's states

| Screen | Loading | Empty | Error |
|---|---|---|---|
| Router | Skeleton cards in the flow shape | First screen (4.1) | `ErrorNote` with Try again; the last saved draft stays |
| Test | The result area pulses its skeleton for at most 1 s | Nothing until the first run | "Couldn't run the test." with Try again |
| Replay | Progress bar | "No leads in this range." | "Replay stopped. 312 of 412 done." with Resume |
| Reps | Skeleton rows | "No teammates yet" with **Invite** | Inline under the row that failed |
| Log | Skeleton rows | `Empty` with the signpost sketch and "No leads routed yet" | `ErrorNote` |
| Held | Skeleton rows | "Nothing held" / "Nothing unassigned" | `ErrorNote` |

Loading uses the app's `Loading` and skeletons, never a spinner with words.

### 6.2 Copy

- Working screens hold labels, buttons and real errors only (`CLAUDE.md`). The explaining is on the first screen.
- Errors say what to do: "EMEA queue has no reps", "Pick a fallback", "This rule has no conditions".
- Sentences in logs use names, not ids, and numbers with their meaning ("3 of the last 9", "cap of 8").

### 6.3 Access

- Every action works by keyboard: Tab order follows the flow top to bottom, then the inspector; Enter opens a card;
  Escape closes panels and returns focus to what opened them.
- Drag has a keyboard twin (Move up, Move down, Move to queue…) in each row's menu.
- Status is never shown by color alone: pills carry words, steps carry ✓, ✗ and –.
- Test results and toasts are announced (`aria-live`).
- Contrast meets WCAG AA in light and dark (checked with the tokens).

### 6.4 Sizes

- The Router editor needs 1,024 px or wider. Narrower, it shows the flow read-only with Test, and a note on the
  publish button's tooltip.
- Reps, Log and Held work down to phone width: a rep can pause their leads from a phone.

### 6.5 Motion

| Moment | Motion |
|---|---|
| Card select, hover | `quick`, `ease-out` |
| Inspector and panels | `calm` slide and fade |
| Test path lighting up | `slow` stroke draw along the lines |
| Replay counts | `slow` count-up |
| New log rows, rows leaving Held | `calm` rise or slide |

Only transform, opacity and stroke offset animate. All of it stops under reduced motion and shows the end state.

---

## Part 7. How it works

### 7.1 Code layout

| Path | What |
|---|---|
| `src/lib/router/types.ts` | `RouterBody` (steps, rules, conditions, queues, territories, settings), `Facts`, `Run`, `StepResult` |
| `src/lib/router/check.ts` | `checkRouter(body, members, fields)`: problems with the card each one belongs to; used in the browser and on the server |
| `src/lib/router/engine.ts` | `decide(body, facts, turns, now)`: pure, no I/O, returns the path and the pick |
| `src/lib/router/spam.ts` | One small function per signal, each with tests |
| `src/lib/router/conditions.ts` | Field lookup and tests, shared with the condition editor so what you see is what runs |
| `src/lib/router/explain.ts` | `explain(run)` to sentence parts (text plus links); `plain(run)` for Slack, email and MCP |
| `src/lib/router/diff.ts` | Two bodies to change sentences for Publish and Compare |
| `src/lib/router/templates.ts` | The three templates and the `lead_settings` move |
| `src/lib/router/server.ts` | `route(rpc, {contact, key, reason})`, `test(...)`, `replayBatch(...)` |
| `src/app/api/routing/*` | The routes in 7.3 |
| `worker-intel/jobs/router.ts` | `route` (background routes, Route again for many), `router_replay`, `router_alert` |
| `src/components/app/routing/` | `RoutingView` (tabs and addresses), `RouterEditor`, `Flow`, `StepCard`, `Inspector/*`, `RuleEditor`, `QueueEditor`, `TestPanel`, `ReplayPanel`, `PublishDialog`, `VersionsDrawer`, `RepsTable`, `RunLog`, `RunPanel`, `HeldList` |

### 7.2 The editor's state

- One `useReducer` holds the draft body and an undo stack (the same pattern as the form studio's editor).
- `checkRouter` runs on every change in the browser (it's fast and pure), so problems show on cards at once.
- Autosave: 800 ms after the last change, `PUT /api/routing/draft` with the body and the draft's `revision`. If the
  revision moved (another owner saved), the reply is a conflict and the top bar offers **Load theirs** or
  **Keep mine** (which saves over with the new revision).
- The flow's 7-day counts come from `router_stats` (7.5), loaded once with the page.

### 7.3 Routes

| Route | Does | Who |
|---|---|---|
| `GET /api/routing` | Live and draft bodies, revision, members, fields, territories, stats | Members |
| `PUT /api/routing/draft` | Save the draft (checked; revision for conflicts) | Owners |
| `POST /api/routing/publish` | Check again, make the draft live as a new version, keep the note | Owners |
| `POST /api/routing/rollback` | Copy an old version as a new live one | Owners |
| `POST /api/routing/test` | Facts for an email or contact (plus changed fields), then `decide` for draft and live; writes nothing | Members |
| `POST /api/routing/replay` | Up to 500 leads in the reply; more start a `router_replay` job and return its id | Owners |
| `GET /api/routing/replay/<id>` | Progress and results | Owners |
| `POST /api/routing/route` | Route one contact now, or queue many | Owners; members for their own contacts |
| `PATCH /api/routing/reps/<user>` | Pause, out of office, caps, backup | The rep for themselves; owners for anyone |
| `POST /api/routing/held` | Let through, spam, allow domain, assign (one or many) | Owners |
| `POST /api/route` (public API) | Route a lead from the team's own systems, with an idempotency key | API key |

Reads that members can do straight from the database (Log, Reps, Held) use Supabase with row security, like the
rest of the app.

### 7.4 The hot path

```
acceptFill ─► form_submit (saved) ─► route() ─► router_facts (1 read) ─► decide() ─► router_commit (1 write) ─► offerForFill(owner)
                                        │
                                        └─ over 300 ms or an error ─► the meeting type's own times; `route` job with the same key
```

- `router_facts(contact, key)` returns, in one call: the contact and company fields, answers, owners (Claritia and
  CRM, mapped), the open opportunity's owner, each queue member's state (paused, out of office now in their zone,
  today's and this week's counts, meetings this week, working hours), the queues' 30-day counts, and any run that
  already has this key.
- `decide()` is pure TypeScript. Same facts, same answer, every time.
- `router_commit(run, pick, key)` takes an advisory lock on the queue (`hashtextextended('router-queue:' || ws ||
  queue)`), checks the pick still holds (member, not paused, under caps), writes the owner, the company owner when
  set, the run, the timeline line and the jobs, and returns. If the pick no longer holds, it returns `stale` with
  fresh state, and `route()` runs `decide()` once more. A second `stale` goes to the next rep in the queue's order.
- A key seen before returns the first run's result without writing.

### 7.5 Data

Tables from `docs/router.md` Part 10, plus:

| Table | Why |
|---|---|
| `routers.draft_revision` | Conflicts between two owners editing (7.2) |
| `router_runs.facts` | The facts the lead had, compact (about 1 KB), so the log reads right later and Replay is fair |
| `router_replays` | A replay's progress and results, kept 7 days |
| `router_stats` | Per version, per step and rule, counts for the last 7 and 30 days; refreshed by `pg_cron` every 5 minutes from `router_runs` |

Row security: members read `routers`, `router_versions`, `router_reps`, `router_runs`, `router_stats`; writes go
through the server with the service role, after the checks above.

### 7.6 Turning facts into sentences

Each step's result is data, for example
`{ step: "queue", ok: true, queue: "q1", method: "rr", picked: "u2", others: [{ user: "u3", why: "paused", until: "2026-10-31" }], counts: { u2: 3, u3: 3 }, window: 9 }`.
`explain()` turns it into parts like `["Lee Park" link:user/u2, " had 3 of the last 9."]`. The screen renders links;
Slack and email use `plain()`. Old runs keep their own rule names and values inside `facts`, so they never change
meaning when the rules do.

### 7.7 Replay

- Reads up to 5,000 runs from the chosen range in time order, with their saved facts.
- Runs `decide()` on the draft in that order, keeping turn counts in memory as the queue would have.
- Compares with each run's real result and groups changes by (from, to, deciding step).
- In the browser for up to 500; above that, a `router_replay` job writes progress every 200 leads.
- Writes nothing outside `router_replays`.

### 7.8 Watching it in production

- Each run saves its time taken. `router_stats` keeps the 95th percentile; over 150 ms for an hour posts to the
  team's error channel.
- Counts of Held and Unassigned older than an hour drive the sidebar dot and the alert.

---

## Part 8. Tests for the screens

Added to `scripts/screens-check.ts`:

1. First screen → Territories → add reps → fallback → Publish: the live version has 2 rules and 2 queues.
2. Test panel with an email: the path cards show ✓ and the owner's name; changing a rule's country moves the result.
3. A form fill with **The routed rep**: the contact's owner is the routed rep and their times show.
4. Held: a fill from a blocked domain is held; **Let through** routes it.
5. Reps: pause a rep; the next test skips them and **Why not** says so.
6. Light and dark screenshots of the Router, Test, Replay, Reps, Log, run panel and Held.

Unit tests cover `check`, `engine`, `spam`, `explain`, `diff` and the editor's reducer. Database tests cover the
cases in `docs/router.md` Part 12.

---

## Part 9. Build order (3 weeks)

| Days | Ships |
|---|---|
| 1 to 3 | Types, check, conditions, engine, spam, explain, diff, templates, with unit tests |
| 4 to 5 | `064_router.sql`, facts and commit, `route()`, keys, the `lead_settings` move, database tests |
| 6 | The form send hook, The routed rep in the form studio, CRM owners, alerts, timeline line |
| 7 to 9 | First screen, Router editor (flow, inspector, conditions, queues), autosave, undo, publish, versions |
| 10 to 11 | Test panel with the lit path and Why not, Replay with the job |
| 12 to 13 | Reps, Log with the run panel, Held and Unassigned, contact page and command bar entries |
| 14 to 15 | Screens check, screenshots in light and dark, access pass, docs |

---

## Part 10. Running cost

This replaces the totals in `docs/router.md` Part 14 (runs now keep their facts, which doubles the stored size).

| Item | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Database: runs with facts at about 2 KB each, kept 13 months (about 1.3 GB at Beta, 26 GB at Growth) | $0 (inside plan) | $50 (check) |
| `router_stats` refresh every 5 minutes (database time) | $0 | $0 |
| Replay jobs on the existing worker | $0 | $0 |
| Rep alerts by email when there's no Slack (about half the runs, SES $0.10 per 1,000) | $3 (check) | $50 (check) |
| Slack alerts (incoming webhooks) | $0 | $0 |
| Claude tokens (none: rules and the MCP tools run on the team's own Claude) | $0 | $0 |
| **Added per month** | **about $3** | **about $100** |
