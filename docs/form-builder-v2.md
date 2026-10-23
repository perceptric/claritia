# Form builder v2: ask, build, embed

The first builder put every tool on one screen: a chat, eight tabs and a draft that was half built. People don't
know where to start, and the chat edits a form one change at a time, which is slow and breaks. v2 starts the way
ChatGPT starts: one question at a time. You answer with clicks, the form builds itself beside the chat as you go, and
the last screen hands you a form in your brand, ready to embed. Templates and drag and drop are the other two ways in,
and all three end on the same screen.

Database, delivery, the `<claritia-form>` element, brand scan and the daily check stay as they are
(`docs/form-builder.md`). This plan changes the screens and how a form gets made.

## Part 1. The flow

```
Forms list ──► New form ──► Create screen
                              ├─ Ask me (default) ──► 8 questions ─┐
                              ├─ Templates ────────────────────────┼─► Your form (embed + publish)
                              └─ Build by hand ──► Builder ────────┘          │
                                                                              └─► Builder, Connect, Results
```

1. **Create screen.** A blank page with one large box in the middle: "What form do you need?". There are three
   ways in under it: **Ask me** (picked by default), **Templates** and **Build by hand**. If you type a sentence
   first ("demo form for the pricing page, sends to HubSpot"), it fills in the answers it can and skips those
   questions.
2. **The questions (Ask me).** A chat on the left. On the right, the real form in your brand, building itself as you
   answer. Each answer is a click, and typing is always allowed.
3. **Your form.** The finished form on a copy of your site's page colors, with the embed options beside it and one
   button: **Publish**. A box at the bottom takes changes in plain words ("make it two steps", "add phone"). Edit by
   hand opens the builder.
4. **After publishing.** The form page has three tabs: **Build** (drag and drop), **Connect** (where leads go,
   meetings, consent, spam) and **Results** (fills, deliveries, checks).

## Part 2. The questions

Each question is a card in the chat with clickable choices (square tags, per `docs/brand.md`). Number keys pick a
choice, Enter goes on, and Back goes up one. Every question has a default, so **Skip** never leaves a hole. On the
right, each answer lands in the form within 150 ms and the changed part flashes once.

| # | Question | Answer with | What it sets |
|---|---|---|---|
| 1 | What's this form for? | One of: Book a demo, Contact sales, Free trial, Newsletter, Event signup, Download (gated content), Partner, Something else | Starting fields, button text, thank-you text |
| 2 | Where will it go on your site? | One of: Hero or landing page, Pricing page, Popup, Its own page (a link), Inside a blog post | Width, labels inside or above, title and intro shown or hidden |
| 3 | What do you want to ask? | Many, pre-ticked for the goal: Work email (always on), First and last name, Full name, Company, Job title, Phone, Company size, Country, Website, Message, Budget, Timeline, How did you hear about us. Click once to add, click the small **Required** mark to require | The fields, in a sensible order |
| 4 | Anything else to ask? | Type a question or two ("Which CRM do you use?"); it picks the field type and choices. Or **No** | Custom fields (`q.*`) |
| 5 | Business emails only? | Yes (block Gmail and the like), No | `check: work_email` |
| 6 | One page or steps? | One page, Two steps (suggested when there are more than 5 fields) | Steps; email first, so a half-filled form still gives you a lead |
| 7 | What happens after they send it? | Book a meeting (Calendly, Cal.com, HubSpot meetings, any link: the logos), Show a thank-you message, Open a page | `after` |
| 8 | Where should the leads go? | Many: Claritia (always on), then each connected tool as a logo (HubSpot, Salesforce, Slack, a webhook). A tool that isn't connected gets a **Connect** button that opens its sign-in window and comes back to the question | Destinations |

- **Brand.** The brand scan starts the moment the create screen opens, on the workspace's site, so it's done by
  question 3. The right side switches from plain styles to your fonts and colors when the scan finishes. If there's
  no site yet, question 2 has a box for the address.
- **Consent** isn't asked. It's set by region by default, and can be changed in Connect.
- **Name.** The form gets a name from the goal and the page ("Demo request, pricing page"), which you can rename in
  the top bar.

### Why the answers are clicks and the build is code

The questions are a fixed tree, and each answer maps to the form through checked code (`src/lib/forms/interview.ts`,
new). The same answers always build the same form, it can't come out broken, and building one costs no AI. AI does
three small jobs:

1. Reads the first sentence, if there is one, and pre-fills answers (Haiku, one call).
2. Turns typed questions into fields with a type and choices (Haiku, one call per question).
3. Writes the labels, button and thank-you text in the site's voice once, at the end (Sonnet, one call, cached by
   the answers and the site).

Each of these goes through the step cache. If a call fails, the form uses the template text, and the step stays
quiet about it.

## Part 3. Your form: preview and embed

```
┌──────────────────────────────────────────────┬──────────────────────────┐
│  [Desktop] [Phone]                           │  Embed                   │
│                                              │  [Code] [Link] [Popup]   │
│     ┌──────────────────────────────┐         │  [WordPress] [Webflow]   │
│     │  Your form, in your brand,   │         │  [Framer] [React]        │
│     │  on your site's background   │         │  ┌────────────────────┐  │
│     └──────────────────────────────┘         │  │ <script src=…>     │  │
│                                              │  └────────────────────┘  │
│  ┌──────────────────────────────────────┐    │  [Copy]                  │
│  │ Change anything… "add phone"         │    │                          │
│  └──────────────────────────────────────┘    │  [Publish]               │
└──────────────────────────────────────────────┴──────────────────────────┘
```

- **Embed options**, each with its logo, a short code block and Copy:
  - **Code:** the `<script>` and `<claritia-form>` lines.
  - **Link:** the hosted page, with a QR code.
  - **Popup:** opens on a button click, after N seconds, or on exit intent.
  - **WordPress, Webflow, Framer:** where to paste, as three short numbered steps.
  - **React:** a component snippet.
  - **Old embed:** the iframe line, for sites that have it.
- **Before publishing**, the code works and shows a "draft" ribbon. Publishing makes it live with no new code needed.
- **The change box** uses the same ops as before (undo on each), but with a short list of suggested changes as clicks
  ("Two steps", "Add phone", "Shorter", "Dark background").
- **Desktop and phone** toggle the preview width. The phone view is the real form at 375 px.

## Part 4. Build by hand (drag and drop)

```
┌────────────┬───────────────────────────────────┬───────────────┐
│ Fields     │                                   │ Field         │
│ ▸ Email    │   ┌─────────────────────────┐     │ Label         │
│ ▸ Name     │   │ ▒ Work email      ⠿     │ ◄── │ Placeholder   │
│ ▸ Company  │   │   First    Last         │     │ Required  [x] │
│ ▸ Phone    │   │   Company size ▾        │     │ Width half/full│
│ ▸ Choice   │   │   [Book a demo]         │     │ Saves to …    │
│ ▸ …        │   └─────────────────────────┘     │ Show when …   │
└────────────┴───────────────────────────────────┴───────────────┘
```

- **Left:** the fields to add, grouped (Contact, Company, Questions, Hidden). Drag a field onto the form, or click
  it to add it to the end.
- **Middle:** the real form. Click a field to select it, drag the handle to move it, and edit a label in place.
  Drop zones appear only while dragging. Moving a field between steps works the same way.
- **Right:** the selected field's settings. With nothing selected, it shows the form's settings: button, steps,
  thank-you and layout.
- Undo and redo (Ctrl+Z, Ctrl+Shift+Z), delete with Backspace, copy a field with Ctrl+D, and arrow keys move the
  selection.
- Drag and drop uses `@dnd-kit` (pointer, touch and keyboard), on top of the existing ops, so every move can be
  undone and is checked.
- The same screen is the **Build** tab of a published form.

## Part 5. Templates

- A gallery of 12 cards, each showing the **real form drawn in your brand** (the element at small size, so no
  screenshots to keep up to date). Filters at the top match the goals in question 1.
- Hovering a card shows a larger preview. Clicking one opens **Your form** (Part 3) with that template, where the
  change box is ready.
- Templates: Demo request, Contact sales, Free trial, Newsletter, Event signup, Webinar, Gated download, Partner,
  Job application, Quote request, Feedback, Waitlist.

## Part 6. Fixing what's broken now

Before the new screens, one full pass over the current Forms section, in a real browser against a real database:

1. Run the app locally against all migrations, with Playwright clicking through every screen: create, edit, design,
   connect, publish, embed, fill, results. Every error, dead button and wrong state goes on a list with a screenshot.
2. Fix them, or note that a fix comes with v2 when the screen is being replaced anyway.
3. Add one end-to-end test per way in (Ask me, Templates, Build by hand). Each goes from an empty workspace to a
   published form, a fill and a lead in Claritia, and runs in `scripts/test-db.sh`.

## Part 7. UI rules this follows

- **One thing per screen.** Create asks one question at a time, Your form has one button (Publish), and the builder
  has one selection.
- **Show, don't describe.** The real form is always on screen on wide windows, and every answer shows its effect
  right away.
- **Recognition over recall.** Choices are clicks with good defaults, and typing is the option for anything else.
- **No dead ends.** Every question can be skipped, every change undone, and every way in ends on the same screen.
- **Keyboard first.** Number keys, Enter, Back, the undo keys and arrow keys all work, and focus is never lost when
  the form redraws.
- **Brand rules** (`docs/brand.md`, `CLAUDE.md`): square tags for choices, no pills or shadows, our `Select` and
  dialogs, logos for tools, and help text only on the create screen.
- **Phone.** On a narrow screen the chat and the form stack, with a "See form" switch at the top.

## Part 8. Build order

| Step | What | Days |
|---|---|---|
| 1 | Bug pass on the current screens (Part 6, steps 1 and 2) | 2 |
| 2 | Question tree and answer-to-form code (`interview.ts`) with unit tests: every path builds a form that passes `checkForm` | 2 |
| 3 | Create screen and the questions, with the live form beside them and the brand scan running from the start | 3 |
| 4 | Your form: preview on the site's background, embed options, popup mode in the element, the change box | 3 |
| 5 | Builder with drag and drop, and the three tabs (Build, Connect, Results) replacing the eight | 4 |
| 6 | Template gallery with live cards | 1 |
| 7 | End-to-end tests for the three ways in, then deploy | 2 |
| | **Total** | **About 17 working days** |

## Part 9. Monthly cost

Building a form from the questions costs almost nothing, because the build is code. AI is only for the first
sentence, typed questions, the final copy and the change box.

Per team per month, assuming 6 forms made and 30 changes typed in the change box:

| Item | Use | Per team |
|---|---|---|
| Final copy | Sonnet, 6 calls, about 4,000 tokens in and 1,200 out each | $0.12 |
| First sentence and typed questions | Haiku, about 20 calls | under $0.01 |
| Change box | Sonnet, 30 calls, about 12,000 tokens in (mostly cached) and 600 out each | $0.33 |
| Look check (existing) | Sonnet with images, 2 a month | under $0.10 |
| **Claude** | | **About $0.55** |

Claude prices from `src/lib/ai/cache.ts` (Sonnet $2 and $10, Haiku $0.10 and $0.50 per million tokens in and out,
check).

| Line | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Claude | $28 | $275 |
| Runner for brand scans and form checks (unchanged) | $25 (check) | $250 (check) |
| Edge cache for the form script (unchanged) | $0 (check) | $20 (check) |
| Supabase (unchanged) | $0 | $15 (check) |
| `@dnd-kit` (open source) | $0 | $0 |
| **Monthly total for forms** | **About $53** | **About $560** |

That's about $32 a month less at Beta and about $325 less at Growth than the first builder, because forms are built
from answers instead of from a chat.
