# Forms as chat and HTML: the plan

Forms become two things: a chat on the left and the live form on the right. Claude Opus asks what to build and builds
anything: any layout, fonts, colors, cards, steps and words. The result is saved as HTML plus CSS. The brand's look is
its own CSS section, shared by every form in that brand. Then every element can be picked and edited like Webflow.

This replaces New form, the spec and the Build tab (`docs/forms.md`). Status: plan only.

## Part 1. The screen

One screen for making and changing a form, at `/forms/<id>`.

| Left | Right |
| --- | --- |
| The chat with Claude, always open | The live form, the real thing, desktop or phone |

- **New form** opens this screen on an empty form. Claude speaks first: "What do you want to build?" There's no
  describe box, no styling picker and no steps.
- Claude decides what to ask. It may ask for the website, the goal, who fills it in, what happens after, or nothing
  more. Its questions come as cards with click answers (like today's follow-up questions), and typing always works.
- The form appears on the right as Claude writes it, streaming in, and changes as the chat goes on.
- Tabs over the right side: **Design** (the live form, plus the Webflow editor, Part 5), **Submissions**, **Share**,
  **Sync** and **Settings**. The last four are today's tabs, unchanged.
- **Publish** in the header, as today.

## Part 2. The chat

Model: Claude Opus 5.5 (`claude-opus-5-5`), adaptive thinking, streaming, with the server-side fallback. Every turn
goes through the step cache, keyed by the conversation so far and the new message.

### What Claude can do (tools)

| Tool | What it does |
| --- | --- |
| `read_site(url)` | The page source and every stylesheet (today's `sourceSkin.ts`), and the runner's measured controls and fonts when the browser read has finished (today's `skinCapture.ts`). |
| `write_form(html, css)` | Write the whole form. Streams into the preview as it arrives. |
| `edit_form(changes)` | Small changes by element id: replace an element, change its text or attributes, add or remove a CSS rule. Used for most turns after the first build, so the rest of the form stays the same. |
| `set_brand_css(css)` | Write or change the brand's CSS section (Part 4). |
| `ask(question, options)` | A question card with click answers. |
| `set_after(kind, ...)` | What happens after the send: a thank-you section, a page, or a meeting. |

The system prompt gives Claude the HTML contract (Part 3) and the brand's CSS, and tells it to design freely. It has
no recipes, kinds or layout rules.

### What the chat keeps

- Messages are saved per form (`form_chats`, Part 8), so the chat is there when the form opens again.
- Each `write_form` and `edit_form` is one undo step in the editor too.

## Part 3. The form as HTML

Claude writes plain HTML and CSS. A few `data-cl-*` attributes tell the form script what each part does. Everything
visual is free.

### The contract

| Markup | Meaning |
| --- | --- |
| `<input>`, `<textarea>`, `<select>` with a `name` | A question. `name` is its key in submissions. `required`, `type`, `min`, `max`, `pattern` and `accept` work as in HTML. Radios and checkboxes share a `name`. |
| `data-cl-save="email"` (or `first_name`, `company`, `f.<field>`...) | The contact field the answer fills. Anything without it stays on the submission. |
| `<section data-cl-step>` | A step. With none, the form is one page. |
| `data-cl-next`, `data-cl-back`, `type="submit"` | Step buttons and the send button. |
| `data-cl-show-if="team_size == 'big' and budget > 5000"` | Shows the element only when the condition holds. Operators: `==`, `!=`, `in`, `>`, `<`, `filled`, `empty`, joined by `and` / `or`. On a step, the step is skipped when it's hidden. |
| `data-cl-progress` | The form script sets `--cl-progress` (0 to 1) on it, for any progress design. |
| `data-cl-error-for="email"` | Where that question's error shows. |
| `<section data-cl-thanks>` | What shows after the send. |
| `data-cl-book` | Where the meeting calendar opens after the send. |
| `data-cl-captcha` | Where the spam check goes. |

- The form script turns `<select>` into its own list, so no browser dropdown shows.
- File inputs upload through today's upload route.
- The consent box is added by region when the form has no `data-cl-save="consent"` checkbox, the same rule as today.

### Safety

The form runs on customers' sites and on Claritia's hosted page, so nothing in it can run code.

- **HTML** is cleaned to a list of tags and attributes, the same way in the browser and on the server (today's
  `html.ts`, widened to forms, inputs, buttons, labels, SVG drawings and pictures). No `<script>`, no `on*`
  attributes, no frames and no `javascript:` links. Pictures and links must be https.
- **CSS** is cleaned with PostCSS: `url()` only for https pictures and the brand's font files; `@import` only for
  Google Fonts; no expressions. Everything else in CSS is allowed: layout, animation, `:has()`, `:checked`, gradients.
- The form draws inside its own shadow root, so its CSS can't touch the page around it, and the page's CSS can't
  break the form.
- Custom JavaScript is the one thing that isn't allowed. Steps, logic, errors, uploads and the calendar come from the
  `data-cl-*` contract, and CSS covers the rest of what a form needs to move and react.

### The server

- When a form is saved, the server reads its questions from the HTML (`name`, type, `required`, `data-cl-save`,
  `data-cl-show-if`, the steps) into the field list the send path already uses (`checkForm`'s `Form`). Submissions,
  contacts, consent, CRM sync, routing, scoring and booking keep working with no changes.
- On each send, the server checks the answers against that list with the same condition engine as the browser: a
  hidden question is never required and its answer is dropped.
- Publishing refuses a form with no email question (unless the form says it doesn't need one), two questions with the
  same `name`, or a `data-cl-show-if` that names a question that isn't there.

## Part 4. The brand's CSS section

- Each brand has one stylesheet: `brand_kits.css`. It holds the brand's fonts, colors as CSS variables, and its
  buttons, inputs, cards and headings as classes (`.btn`, `.btn-secondary`, `.field`, `.card` and the rest).
- It's written once, when a brand is learned: Claude reads the site (the page source now, the runner's measured read
  when it lands) and writes it. Today's skin code feeds it.
- Every form in that brand loads it first, then its own CSS. A change to the brand's CSS changes every form in it.
- It's editable two ways: in the chat ("make the buttons rounder"), and as code in the editor's CSS tab, with a
  preview of every form in that brand.
- Settings › Brand shows the CSS section next to the brand book, with delete as today.

## Part 5. The Webflow-style editor

The Design tab's second mode, next to the live form. It edits the HTML and CSS directly. Built from Omniscient's page
builder (`src/lib/experiences/nodes.ts`, `styles.ts`, `src/components/site/SiteBuilder.tsx`, `StylePanel.tsx`,
`NodeEditor.tsx`, about 2,000 lines on the same stack), changed to work on HTML and class-based CSS.

| Part | What it does |
| --- | --- |
| **Navigator** | The element tree. Pick, drag to move, rename, duplicate, delete. |
| **Canvas** | The live form. Click to pick an element, double-click to type its text, a blue box on the picked one. |
| **Style panel** | Webflow's model: styles live on classes. Pick a class or add one, then set layout, spacing, size, type, color, border, shadow and effects. Every change writes a rule in the form's CSS. Desktop, tablet and phone; hover, focus and checked. "All like this" edits the class everywhere. |
| **Settings panel** | The picked element's attributes. For a question: its name, type, required, where it saves, its options, and its show-if built with click rows. |
| **Add panel** | Layout (section, container, div, row, column, grid), text (heading, paragraph, link), media (picture, icon), form parts (text box, long text, email, phone, number, date, pick one, pick many, cards, dropdown, rating, file, checkbox, consent, button, step). |
| **Code** | The HTML, the form's CSS and the brand's CSS, editable as text, cleaned on save. |
| **Undo and redo** | Every edit, by hand or by Claude. |

The chat stays docked on the left in the editor too. "Change anything" works on the picked element when one is
picked.

## Part 6. What goes and what stays

| Goes | Stays |
| --- | --- |
| New form's five screens (`new/NewForm.tsx`, `BrandPicker.tsx`, `PreviewLoading.tsx`, `Wireframe.tsx`) | The send path, contacts, consent, CRM sync, routing, scoring, booking, uploads, payments |
| The spec and its AI (`spec.ts`, `specAi.ts`, `newForm.ts`, `/api/forms/new`) | Submissions, Share, Sync and Settings tabs |
| The Build tab (`build/Builder.tsx`) | The form script, extended for HTML forms (Part 7) |
| The skin route (`/api/forms/skin`), folded into the brand's CSS | The runner's browser read and `sourceSkin.ts`, feeding the brand's CSS |
| | Brand delete and Settings › Brand |

## Part 7. Old forms

- Forms made before this keep their saved format and keep running as they do now.
- Opening one shows it in the live preview with a **Turn into HTML** button. The form script draws it, and that
  markup (with the `data-cl-*` contract added) becomes its HTML. The brand's CSS and today's skin become its CSS. After
  that, it's a chat-and-HTML form like any other.
- Each published version keeps its format, so the server checks a send against the version that was shown.

## Part 8. Data (migration 112)

- `forms`: `html text`, `css text` (the draft), and `format` (`schema` or `html`).
- `form_versions.body`: for an HTML form, `{ format: "html", html, css, fields }`, where `fields` is the question list
  read from the HTML.
- `brand_kits.css text`.
- `form_chats (form_id, workspace_id, messages jsonb, updated_at)`: the chat, one row a form.
- Size limits: HTML 200 KB, CSS 100 KB a form, brand CSS 60 KB.

## Part 9. Tests (reliability rule)

- **Safety:** a list of attacks the cleaner must stop (scripts, `on*` attributes, `javascript:` and `data:` links,
  `<iframe>`, SVG with script, CSS with `expression()`, `url(javascript:)` and `@import` from other hosts), in the
  browser and on the server.
- **The contract:** questions read from HTML match what the form script sends. Show-if conditions give the same answer
  in the browser and on the server. A hidden required question never blocks the send, and its answer is dropped.
  Steps skip when hidden.
- **Flaky AI cases:** Claude writes HTML with no email, two questions with one name, a show-if on a missing question,
  or a tool call cut off halfway. Each is caught, sent back to Claude once, and the last good form stays in the
  preview.
- **Round trip:** every template turned into HTML sends the same answers as before.
- **Browser check:** a chat builds a form with steps, logic and an upload; a send reaches the contact; an editor change
  (class style, text, a moved element) shows live and saves.

## Part 10. Build order

| Step | What | Done when |
| --- | --- | --- |
| 1 | The HTML contract: cleaner, question reader, condition engine, server check | Safety and contract tests pass |
| 2 | The form script draws HTML forms: steps, show-if, errors, uploads, select lists, thanks, calendar | A browser check sends an HTML form end to end |
| 3 | The chat: Opus with the tools, streaming into the preview, saved per form | A described form builds and changes in chat |
| 4 | The brand's CSS section: written from the site, shared by forms, edited in chat and as code | Two forms in one brand change together |
| 5 | The Webflow editor, from Omniscient's builder | Pick, style by class, type, move, add and undo work on a real form |
| 6 | Old forms: Turn into HTML. Delete the old New form, spec and Build tab | Every template converts and sends the same answers |

## Part 11. Running cost

Claude Opus 5.5 at $4 in and $20 out per million tokens (check: from this repo's price table in `src/lib/ai/cache.ts`,
not confirmed on Anthropic's page from here). Cached prompt reads at a tenth of the input price.

Per new form: about 6 chat turns, 2 whole writes of HTML and CSS (about 10,000 tokens out each), the rest small edits
and questions, and the site's source read once. About $0.90 a form. A later chat change: about $0.10. A brand's CSS
section: about $0.40, once.

A team a month: 10 new forms, 30 chat changes, 2 brands.

| Item | Beta (50 teams) | Growth (500 teams) |
| --- | --- | --- |
| Claude Opus: new forms | about $450 | about $4,500 |
| Claude Opus: chat changes | about $150 | about $1,500 |
| Claude Opus: brand CSS | about $40 | about $400 |
| Servers (the runner's browser read runs on today's runner) | $0 new | $0 new |
| **Total** | **about $640** | **about $6,400** |

This is about four times today's forms bill (about $145 and $1,450), from moving to Opus and from writing whole HTML
pages.
