# Form studio

Status: built (the parts below). See "What shipped" at the end for the gaps.

Building a form takes three moves: answer a short chat, then design it on a canvas, then decide what happens after
the submit. Each move gets one screen that does one job well.

1. **Ask.** A chat like ChatGPT asks a few simple questions. Answers are clicks: option cards, check boxes, a
   dropdown. You can always type instead.
2. **Design.** The form opens in a canvas editor like Framer. Elements drag in from the left, any field opens a
   detailed inspector on the right, and every field links to a Claritia field or a field in the connected CRM.
3. **After the submit.** A redesigned Settings tab: show a message, go to a page, or book a meeting. The meeting
   setup is built around who the lead books with.

It also fixes three things across the app: the serif font goes, AI gets a sparkle icon, and a form's name can be
changed right away.

---

## 0. App-wide fixes (first, small)

| Today | Change |
| --- | --- |
| Fraunces serif on titles and numbers | Geist everywhere. Titles 600 weight with tight tracking (−0.02em). Big numbers in Geist with tabular figures. The `serif` class is removed and Fraunces stops loading. |
| Pip, the blob face, marks AI | A **sparkle icon** (`Sparkle`: one four-point star with a small one beside it, line style like the other icons) marks AI everywhere. AI output is tagged with a lilac pill: sparkle + "AI". The AI working shows the sparkle with a soft shimmer. Pip is removed. |
| Mono labels on working screens ("Contact", "Field", "After the submit") | Section labels are Geist 12px, 500 weight, muted, sentence case. Mono stays only for code, keys and ids. |
| A form's name is set by the system ("Untitled form") | The name in the top bar is an inline input: click, type, Enter or click away saves. A new form is named from the chat's first answer ("Demo request"). Forms list rows get Rename in their menu. |

`docs/brand.md` and `CLAUDE.md` are updated to match.

---

## 1. Ask: the chat that picks the form

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│ ← Forms                                                      │
│                                                              │
│                ✦  What form do you need?                     │
│                                                              │
│   ┌────────────────────────────────────────────────────┐    │
│   │ Describe it, or answer below…                  ↵   │    │
│   └────────────────────────────────────────────────────┘    │
│      Start from a template   ·   Start blank                 │
│                                                              │
│  ✦  What's this form for?                       1 of 5       │
│     ┌───────────┐ ┌───────────┐ ┌───────────┐               │
│     │ Book demos│ │ Contact   │ │ Newsletter│  …            │
│     └───────────┘ └───────────┘ └───────────┘               │
│                                         You: Book demos  ⟲   │
│  ✦  What should it collect?                     2 of 5       │
│     ☑ Work email (required)  ☑ Full name  ☐ Company          │
│     ☐ Job title  ☐ Phone  ☐ Company size  ☐ Message          │
│                                              [ Continue ]    │
└──────────────────────────────────────────────────────────────┘
```

- One thread, centered and 680px wide, like ChatGPT. The sparkle is the assistant's avatar. Your answers show as
  right-aligned bubbles that you can click to change (⟲).
- One question at a time, five at most. Each one has a good default already picked, so Enter goes straight through.
- The composer stays at the bottom. A typed sentence fills in as many answers as it can and skips those questions.
  This uses the existing `readSentence`.
- Keys: 1 to 9 pick an option, Enter continues, ⌘Z goes back a step.

### The five questions

| # | Question | Answer control |
| --- | --- | --- |
| 1 | What's this form for? | Option cards: Book demos, Contact sales, Free trial, Newsletter, Event, Download, Other |
| 2 | What should it collect? | Check boxes, with the right ones ticked for the goal; email is always on |
| 3 | Any questions to qualify them? | Suggested check boxes (Budget, Timeline, Team size, How did you hear about us) and "Add your own" (one line, type picked for you) |
| 4 | After they send it? | Option cards: Show a message, Go to a page, Book a meeting. Book a meeting asks for the scheduler next as logo tiles |
| 5 | Where do leads go? | Check boxes of connected tools with logos (HubSpot, Salesforce, Omniscient, Slack, email); Claritia is always on |

The end is a summary card ("Demo request: 4 fields, books on Calendly, sends to HubSpot") with one button,
**Create form**. It opens the Design tab with the new form selected.

Templates and Start blank sit under the composer as two text links, not big cards.

---

## 2. Design: the canvas editor

### Layout

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ Forms / [Demo request ✎]   Draft ▾      ↶ ↷    🖥 ▭ ▯    100% ▾     Preview  Publish │
│ Design   Settings   Share   Results                                                  │
├────┬──────────────────┬──────────────────────────────────────────┬────────────────────┤
│ ＋ │ Search elements  │                                          │ Short answer    ⋯  │
│ ☰  │ Contact          │        ┌──────────────────────────┐      │ Content Style Data │
│ ◐  │ ┌────┐ ┌────┐    │        │ First name *  │ Last name│      │                    │
│    │ │ @  │ │ Aa │    │        │ [__________]  │ [_______]│      │ Label              │
│    │ │Email│ │Name│   │        │ Work email *             │      │ [First name     ]  │
│    │ └────┘ └────┘    │        │ [________________________]│     │ Placeholder        │
│    │ Questions        │        │ ┌ Company size ──────────┐│      │ [Jane           ]  │
│    │ ┌────┐ ┌────┐    │        │ │ 1–10 ▾                 ││  ←selected
│    │ │ ≡  │ │ ¶  │    │        │ └────────────────────────┘│      │ Required     [●]  │
│    │ │Short│ │Long│   │        │ [ Book a demo → ]         │      │ …                  │
│    │ └────┘ └────┘    │        └──────────────────────────┘      │                    │
│    │ Content …        │          + Add step                      │                    │
└────┴──────────────────┴──────────────────────────────────────────┴────────────────────┘
```

**Top bar**
- Inline form name. Draft/Live as one status menu, undo and redo, device switch (desktop, tablet, phone), zoom,
  Preview (opens the real form full screen with a working submit in test mode), and Publish.

**Left rail, three panels**
- **＋ Elements**: a search box, then tiles (icon above name) in groups. Click a tile to add it under the selected
  field, or drag it onto the canvas.
  - Contact: Email, First name, Last name, Full name, Phone, Company, Job title, Website, Country, State
  - Questions: Short answer, Long answer, Dropdown, Single choice, Multiple choice, Checkbox, Number, Date, Rating,
    Link
  - Content: Heading, Text, Divider, Image
  - Advanced: Hidden field, Consent box
- **☰ Layers**: an outline of steps and fields. Drag to reorder or move between steps, with eye, duplicate and
  delete on hover. Multi-select with Shift.
- **◐ Theme**: the form's look (section 2.3).

**Canvas**
- The real form, drawn by the same renderer visitors get, at the chosen device width on a gray stage.
- Hover shows a thin outline. Click selects: a 2px accent outline, the field's name tag on the top-left, and a
  floating toolbar (move up, move down, duplicate, width, delete).
- Double-click edits the label in place.
- Drag shows an insertion line and the gap opens. Two fields dropped side by side become a row (half and half,
  thirds).
- Steps show as stacked pages with a header ("Step 1 of 2"). Add step sits under the last one.
- Keys: ⌫ delete, ⌘D duplicate, ⌘↑ and ⌘↓ move, Esc deselects, ⌘Z and ⌘⇧Z.

### 2.1 Inspector: a field selected

Four tabs. Every control saves at once and goes on the undo stack.

**Content**
- Label. "Hide label" (keeps it for screen readers).
- Placeholder, help text, default value.
- Required toggle, with a custom "required" message.
- Options (Dropdown, Single choice, Multiple choice):
  - a list with drag handles and inline edit
  - bulk paste (one per line) and a preset list (countries, US states, company sizes, industries)
  - "Other, please say" and shuffle order
  - min and max picks for Multiple choice
- Rating: scale 3 to 10, stars or numbers, low and high labels.

**Validation**
- Text: min and max characters.
- Number: min, max and step.
- Email: work email only, with an "allow these domains" list.
- Phone: country default and format check.
- Link: must be https.
- Date: earliest, latest and no weekends.
- Custom error message for each check.

**Style**
- Width: full, ½, ⅓, ⅔.
- Label position: inherit, above or inside.
- Size: small, medium or large. Alignment for content blocks. Hide on phone.

**Data (Saves to)**
- One searchable picker, grouped, with each tool's logo:
  - **Contact** (built-in): email, names, phone, company, title, website, country, region
  - **Custom contact fields**, with **+ New field** inline (name and type, created on save)
  - **Company** fields
  - **HubSpot / Salesforce / Omniscient** properties from each connected CRM, read live from its API and cached
    for 10 minutes. Each one shows its type, and fields of the wrong type are grayed out with the reason.
  - **Only on this submission**: the answer is kept with the fill and sent to every destination.
- "When the contact already has a value": Overwrite, Only fill if empty, or Never. The default is Only fill if
  empty, except email and names.
- For a Dropdown linked to a CRM picklist, the options come from the CRM and stay in sync, with a value map shown
  when labels differ.
- Hidden fields: source (URL parameter, page URL, referrer, fixed value) and the parameter name. Fill from the URL
  for any field.

**Logic**
- "Show this field": Always, or When (a rule builder: field, is / is not / is filled / is empty, value). Rules can
  be All or Any.
- "Require when", and "Skip to step" for step headers.

### 2.2 Inspector: nothing selected

Form settings: title and intro text, submit button text, labels above or inside, width (narrow, wide or custom px),
and step progress (bar, dots or none).

### 2.3 Theme panel

Framer-style controls with live preview:
- Font from Google Fonts with search, plus a heading font and base size.
- Colors (text, muted, background, input, border, accent, button, error) with swatches and hex input. Each color
  shows a contrast check.
- Corners: input radius and button radius sliders.
- Input height, border width and spacing between fields.
- Button: fill, text, weight, case and full width.
- Presets: Clean, Rounded, Bold, Minimal, plus "Match my site", which runs the existing brand scan.
- Save as kit, which is shared by the site's forms (today's behavior), or Just this form.

### 2.4 Schema changes

`Field` gains:
- `validation` (min, max, step, pattern preset, allow domains, messages)
- `default` and `hideLabel`
- `width` (full, half, third, two thirds)
- `size`
- `overwrite` (always, if_empty, never)
- `crm` (`{ source, property }`)
- `optionsFrom` (a CRM picklist)
- rating settings

New element types: `heading`, `text`, `divider`, `image` (content, saves nothing) and `rating`. `checkForm`, the
renderer (`render.ts`, `forms/v1.js`), the submit path and the chat tools all learn them. Old forms read as before.

---

## 3. Settings: after the submit, and Book a meeting

The Connect tab becomes **Settings**, with a left list of sections: After submit, Notifications, Destinations,
Consent, Spam. Each section is one card, and a live preview of the after-submit screen sits on the right.

### After submit

Three large option cards: **Show a message**, **Go to a page**, **Book a meeting**.

### Book a meeting

```
┌ Book a meeting ───────────────────────────────────────────┬─ Preview ───────────────┐
│ Scheduler                                                 │  ┌───────────────────┐  │
│ [Calendly ✓] [Cal.com] [HubSpot] [SavvyCal] [Other]       │  │ Thanks, Jane.     │  │
│                                                           │  │ Pick a time with  │  │
│ Who do they book with?                                    │  │ our team          │  │
│ ◉ One team link    [https://calendly.com/acme/demo   ✓]   │  │ ┌───────────────┐ │  │
│ ○ The contact's owner, else the team link                 │  │ │  Calendly     │ │  │
│    Owner        Link                              Status  │  │ │  Oct 24 25 26 │ │  │
│    ◯ Maya Chen  [calendly.com/maya          ]     ✓ works │  │ └───────────────┘ │  │
│    ◯ Leo Park   [ add link                  ]     —       │  └───────────────────┘  │
│                                                           │                         │
│ Who sees it?                                              │                         │
│ ◉ Everyone   ○ Only leads that match   [ + rule ]         │                         │
│    Others see: [ the message ▾ ]                          │                         │
│                                                           │                         │
│ Above the calendar   [ Pick a time with our team ]        │                         │
│ ☑ Fill in name and email   ☑ Track the booking            │                         │
└───────────────────────────────────────────────────────────┴─────────────────────────┘
```

- Scheduler tiles with logos. The link field checks as you type (green check or the exact problem, from
  `linkProblem`).
- **Who they book with**: one team link (round robin lives in the scheduler), or the contact's owner. The owner
  view is a table of teammates with each one's link and a live check.
- **Who sees it**: everyone, or only leads that match rules (work email, company size, a field answer). Everyone
  else sees the message or a page. This is the "qualified leads book, others get a thank-you" setup.
- The text above the calendar is editable. Prefill and tracking are on by default.
- The preview shows the real scheduler embed in the device frame.

`Schedule` gains `who` (`all` or `match`), `rules`, `heading` and `fallback`. Booking and routing are covered by the
reliability rule. The "match" check and the owner pick get tests with flaky cases: owner missing, link dead, rule on
a field left empty.

---

## 4. Build order

Each step ships on its own, checked with `npm test`, `npm run test:db` and `scripts/screens-check.ts` (updated for
the new flow).

1. App-wide fixes: Geist titles, sparkle icon for AI, labels, inline form name. (1 to 2 days)
2. Ask: the new chat on the existing interview logic. (2 days)
3. Schema: new field settings and element types, `checkForm`, renderer, submit. (3 days)
4. Design editor: three panels, canvas selection and drag, layers, keys. (5 days)
5. Inspector: Content, Validation, Style, Logic. (3 days)
6. Data tab: Claritia fields, inline new field, CRM properties (HubSpot, Salesforce, Omniscient), overwrite rules
   and picklists, with tests on the sync path. (4 days)
7. Theme panel. (2 days)
8. Settings tab and Book a meeting: owner links, match rules, preview, with tests. (3 days)

About five weeks for one engineer.

---

## 5. Running cost

| Item | Beta (50 teams) | Growth (500 teams) |
| --- | --- | --- |
| Servers (same Render and Fly plans) | $0 | $0 |
| CRM property reads (HubSpot, Salesforce, Omniscient APIs, cached 10 min) | $0 | $0 |
| Google Fonts in the theme panel | $0 | $0 |
| Claude tokens: same calls as today (one copy call per new form, plus "change anything" edits) | $0 added | $0 added |
| **Added per month** | **$0** | **$0** |

For scale, today's form AI spend is about 500 new forms a month at Beta and 5,000 at Growth. At about 4k input and
1.5k output tokens on Sonnet each, that comes to roughly $18 and $175 a month (Sonnet price: check). This plan
doesn't add model calls: the chat questions are fixed, and typed answers are read by the existing local parser.

---

## What shipped

- App-wide: Geist for every word, the sparkle for AI (`src/components/app/Ai.tsx`), sans labels, rename a form in
  its title or from the list (`form_rename`, migration 050).
- Schema (`src/lib/forms/schema.ts`, `values.ts`, `ops.ts`, `schedule.ts`): every field setting in 2.1 and 2.4, plus
  All/Any conditions per field (`logic`), skip to a later step (`Step.skip`, followed by the form and the server),
  https-only links and a full-width button. Tests: `tests/formStudio.test.ts`.
- Ask (`FormCreate.tsx`, `interview.ts`): the five questions, the composer, the summary card; new forms, templates
  and Start blank open on Design (`?tab=design`).
- Design (`FormsView.tsx`, `Editor.tsx`, `FormCanvas.tsx`, `Elements.tsx`, `Layers.tsx`, `Inspector.tsx`,
  `FormDesign.tsx`, `PreviewOverlay.tsx`): the editor in Part 2. Tests: `tests/formEditor.test.ts`.
- Data (`SavesTo.tsx`, `src/lib/sources/properties.ts`, `/api/forms/crm-fields`, `overwrite.ts`, migration 051):
  Claritia and CRM field links, overwrite rules on the contact and on the CRM push. Tests: `tests/formData.test.ts`,
  `tests/pg/formData.pg.ts`.
- Settings and Book a meeting (`SettingsTab.tsx`, `Meeting.tsx`, `FormSettings.tsx`, `FormDestinations.tsx`,
  `meeting.ts`, migration 052): Part 3. Tests: `tests/meeting.test.ts`, `tests/pg/meetings.pg.ts`.
- The visitor form (`element.ts`) draws all of it; the server only returns a booking link to leads that match.
  Tests: `tests/formRuntime.test.ts`. `scripts/screens-check.ts` walks Ask, Design, rename and Start blank.

Gaps:
- The Consent box stays a form setting (Settings → Consent), not an element.
- Omniscient's API doesn't list contact custom fields, so only Name, Title and Phone show for it in Saves to.
- "Never overwrite" on a CRM can skip a value once when a delivery creates the record and then fails partway.
- Single choice now draws as radio buttons (Dropdown is its own type), so live forms with single-choice questions
  look different; their answers don't change.
- Default overwrite is "only fill if empty" for everything but email and names, so forms no longer replace a title,
  phone or custom value that came from an import.
