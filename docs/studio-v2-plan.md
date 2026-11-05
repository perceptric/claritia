# Form Studio, round two: the plan

What the owner asked for after using the live Studio (Nov 2): more room, one chat per form kept in the Studio,
icons in place of words, nothing covering anything, an editor that works like Webflow or Framer right on the form,
and a Tia that stops asking setup questions once the form is built.

Since docs/form-ui-plan.md step 1, the Studio is a Studio form's Build tab under the form page's header, which shows the state, the form check and Publish (`FormHeader.tsx`); New form uses the same header. Status: Parts 1 to 5 are built (`src/components/app/forms/studio/studio.ts`, `Studio.tsx`, `Sidebar.tsx`, checked by
`scripts/studio-check.ts`). Chats and the brand's CSS are kept on the server once `supabase/migrations/112_form_chats.sql`
is applied (Supabase, SQL editor); until then they stay in the browser and move to the server by themselves after.
Part 6: step 6 is built (the form check in `src/lib/studio/check.ts`, run in the Studio and again at Publish; question
ids kept with `data-cl-id`; consent by region, the spam trap and the bot check on studio pages; tests in
`tests/studioCheck.test.ts`). Step 7 is built: Claritia blocks (file, phone, address, date, time, date range, rating,
signature, country) that Tia places with `data-cl-field` and the form script draws with its own inputs in the brand's
classes. Step 8 is built: industry recipes (`src/lib/studio/industries.ts`), read from the site with its language and
country, kept on the brand (`supabase/migrations/113_brand_profile.sql`), changed with one click, sent to Tia, and
used by the form check; the weekly 30-brand test (`scripts/studio-brands.ts`, `.github/workflows/studio-brands.yml`)
runs when the `ANTHROPIC_API_KEY` secret is set. Step 9 is built: Tia writes the form in other languages (the Languages
button in the bar), each previews and passes the check, visitors get their own language with a switch on the form,
right-to-left languages flip, contact answers get the right keyboard and autofill, errors are tied to their question
and read out, focus always shows and motion stops for people who ask for less (`tests/studioLangs.test.ts`). The plan
is built.

After launch: steps in Edit (a step bar with each step, the thank-you and All; one step at a time; tools to add, copy,
move and delete steps with Next and send kept in order; "Shown if ..." on conditional parts) and a safer brand switch
(a built form asks first, keeps its look until the new one is read, then Tia moves the words and CSS over in one
change, about $0.10 a switch: about $15 a month at Beta, $150 at Growth, Opus price "check"). A one-page form's
thank-you now takes the form's place after the send, and the consent line sits above the row of buttons.

## Part 1. Room: the sidebar and the chat fold away

- The app sidebar gets a collapse button at its foot. Collapsed, it's the icon rail it already is on mid-size
  screens (68px, `Sidebar.tsx`), on every screen size. The choice is kept per person (localStorage).
- The Studio opens with the sidebar collapsed. Leaving the Studio puts it back the way the person had it.
- The chat column folds too: a button in its bar hides it to a thin strip with Tia's face. Click the face to open.
  In Edit the chat folds by itself the first time, so the form and the panel get the room.

## Part 2. Every form is one chat, kept in the Studio

- A chat and its form are one thing. New form starts a new chat. Publishing doesn't end it: the same chat keeps
  changing the same form.
- The chat bar's title is a dropdown: every chat in the workspace, newest first, each with the brand's logo, the
  form's name and its state (Draft, Published). Search at the top, New chat at the bottom, delete on each row
  (with the app's confirm; the form stays unless they also delete it from Forms).
- Chats are saved on the server, so they follow the person to any computer and teammates see them:
  migration 112 adds `form_chats` (id, workspace_id, form_id, brand_kit_id, name, turns, log, html, css, after,
  created_by, updated_at). Saved after each Tia answer and each edit (debounced 1 second). The browser copy stays
  only as an offline backup.
- A chat without a form yet (nothing built) is a draft chat. Its form row is made on the first Publish.
- Forms › a studio form opens its chat. The Forms list shows the same chats' forms, so there's one list of forms.

## Part 3. Tia once the form is built: built is built

- Before anything is built, Tia asks at most two short questions with click answers, then builds.
- Once a form exists, Tia never asks setup questions again (what kind of form, how many steps, who it's for). Every
  message is a change request: Tia makes the change at once and says in one line what changed. Tia asks only when a
  request truly can't be done without one fact (for example "send it to our CRM" when two CRMs are connected).
- The starter ideas show only on an empty chat. On a built form the empty composer says "Ask Tia to change
  anything".
- In the prompt: a BUILT section, sent whenever the form has HTML, that says the above; and `<ask>` is refused by
  the studio when the form is built unless Tia also sent no change. Small changes go as `<patch>` and `<css_add>`
  (cheaper and faster than writing the whole form again).
- Tia can also be asked about the picked element: with something picked in Edit, the composer shows a chip
  ("Heading: How are you feeling today?") and the message is about that element.

## Part 4. The bar: icons, tooltips, nothing hidden

- Preview, Edit, Code and On submission become icon tabs (eye, cursor, code brackets, send/calendar) with the
  name as a tooltip on hover and focus. Still real tabs for keys and screen readers.
- Desktop, Tablet and Phone become three device icons (1100px, 768px, 390px frames).
- Back to step 1 becomes a restart icon with its tooltip. Open becomes a link icon. Publish stays the one black
  button with its word, on the far right of the Studio's top bar.
- The bar is one row across the whole Studio, above the canvas and the panel. The Edit panel sits below it, so it
  can never cover Publish, Open or anything else. Rule for the Studio: no panel, menu or popover ever sits over a
  control; menus open on the floating layer, panels take their own column.

## Part 5. Edit like Webflow and Framer, right on the form

On the form:
- Hover outlines an element and shows its name tag ("Heading", "Button", "Choice"). Click picks it.
- Text edits in place: click picked text again (or double-click) to type, Enter or click away to save, Esc to undo.
  Works for headings, words, labels, buttons, choices and placeholders.
- A small floating bar over the picked element: move up, move down, duplicate, delete, select parent, and Ask Tia.
  Drag the handle to move it among its siblings.
- Spacing handles: drag the padding and margin edges of the picked element, like Framer.
- Keys: Delete removes, Cmd/Ctrl+D duplicates, Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z undo and redo, arrows move between
  siblings, Esc picks the parent.

The panel on the right, short and icon-led (like Webflow's Style panel):
- Two tabs: Style and Settings. Layers is its own fold-out list on the left of the canvas (the Navigator), opened
  by an icon, so it doesn't push the style controls down.
- Style, top to bottom: the class chip and "This element / All like it" switch; Layout (display as icons: block,
  flex row, flex column, grid, none; gap; align icons); Spacing (one box drawing with margin outside and padding
  inside, each side a small number you drag or type); Size (W, H, min, max in one grid); Type (font, size, weight,
  line height, color dot, align icons, case icons); Fill (color dot); Border (width, style icons, color dot,
  radius); Effects (shadow, opacity).
- Empty boxes stay empty: the live value shows as faint placeholder text, never as a value. Units as a small
  suffix. Colors open the app's color picker with the brand's colors first.
- Settings: the question's name, required switch, placeholder, options (add, remove, reorder) for picks and lists,
  "Saves to" (Email, First name, Company and the rest, or Just this form), and Show if built with the app's own
  pickers (question, is, value) in place of typed code.
- Code stays for people who want it; nothing needs it.

Also fixed on the way: double-clicking in Edit no longer selects the Studio's own words (the green wash in the
screenshot), and the Show if box is empty until set.

## Part 6. Every industry, every edge case

The Studio has one job in every industry: a form that looks like the brand made it, works on any phone, keeps the
law, and puts the lead in the CRM with the right meeting. Tia writes the layout and the words. Claritia owns
everything that has to work the same everywhere: the hard inputs, the checks, consent, spam, the send and booking.

### 6.1 Tia knows the industry before the first question

- The site read that already gives the brand's look also gives its industry, its language and its country (from the
  page's words, its `lang`, its currency and its phone formats). Tia says it once ("A dental clinic in Canada,
  English and French") and the owner can fix it with one click. It's kept on the brand.
- Each industry has a recipe Tia follows: the usual forms, the questions that matter, what to never ask, the default
  After the send, and which checks are on. Recipes are data in one file, so a new industry is a few lines.

| Industry | Common forms | Tia adds by default | Guardrail |
| --- | --- | --- | --- |
| SaaS and B2B | Demo request, trial, contact sales | Work email, team size, routes 200+ to the enterprise meeting | Free email blocked only if the owner turns it on |
| Agencies and services | Project brief, quote request | Budget range, timeline, file upload for briefs | Budget as ranges, never an open "how much" |
| Healthcare and dental | New patient, booking, intake | Reason for visit, insurance yes or no, booking | No diagnosis, medication or record fields unless the workspace has health data turned on (needs a signed agreement first) |
| Legal | Case review, consultation | Case type, conflict check names, booking | A notice that sending the form doesn't make them a client |
| Real estate | Buyer, seller, rental, valuation | Buy, sell or rent first, area, budget, timeline | Address with country format |
| Finance and insurance | Quote, callback, application | Income and amount as ranges, callback time | Never asks for full card, bank or ID numbers in a text box |
| Education | Enrollment, open day, course interest | Student or parent first, program, start term | Under 13 asks for a parent's details and consent |
| Home services and trades | Estimate, service call | Address, service area check, photo upload, preferred time | Service area answer shown before the send |
| Hospitality and events | RSVP, booking, catering | Guest count, plus-ones as "add another", dietary needs | Guest list rows capped |
| Recruiting and HR | Job application, referral | Résumé upload, links, work rights | No age, religion, health or other protected questions |
| Retail and e-commerce | Wholesale, returns, waitlist | Order number, product picker, photo upload | Order lookups stay read-only |
| Nonprofits | Volunteer, donation, newsletter | Availability, interests, Stripe donation | Payments only through the payment block |

### 6.2 Hard inputs are Claritia's, styled by the brand

Tia's HTML handles layout and words. Anything that must work the same on every form is a Claritia block Tia drops in
as `<div data-cl-field="...">`. The form script draws it with the brand's classes, and its answer goes through the
usual send:

- File upload (résumés, photos, briefs): today a file input in a studio page turns into a text box on publish. That
  gets fixed by this block.
- Phone with country, address with the country's format, date and time pickers in the visitor's language, budget and
  range sliders, rating, signature, payment (Stripe), "add another" rows, the booking calendar, and consent.
- Each block is accessible and tested once, so every industry gets the same working parts.

### 6.3 The law and trust, built in

- Consent: studio forms publish with consent off today. That changes: the form's region setting comes back
  (by region, always, or notice), and the consent line is a block Tia places where it reads well.
- Sensitive data check at publish: questions that look like passwords, full card numbers, bank numbers, ID or tax
  numbers, or health records are stopped with a plain reason and a fix (the payment block, a range, or turning the
  question off). Tia won't write them in the first place.
- Phishing guard: a form can only wear a brand the workspace added and confirmed. A form that asks for logins or
  copies a bank's or a big company's look can't be published. A brand's site that isn't the workspace's own needs the
  owner to confirm they work for it, and the live form names the brand on its page.
- Spam: the hidden trap field and the bot check come back for studio pages (turned off today), plus the timer.
- Kids: education and events with an age question ask for a parent when the answer is under 13.

### 6.4 Every visitor: phones, languages, access

- Phone first: every build is checked at 390px wide before it shows. Inputs use the right keyboard (email, number,
  phone), browser autofill names (`autocomplete`), and taps of at least 44px. Submit stays in reach on long steps.
- Languages: Tia writes in the site's language. A form can have more languages; the visitor's browser picks, with a
  switch on the form. Right-to-left languages flip the layout. Dates, numbers, phone and address follow the country.
- Names and addresses don't assume one country: one full-name box unless the owner wants two, and no forced state
  or zip outside countries that use them.
- Access (WCAG 2.2 AA): every question has a real label, errors are tied to their question and read out, the keyboard
  reaches every choice card, focus is always visible, and motion stops when the visitor asks for less. Brand colors
  that are too light on white are darkened for text only, and Tia says so.

### 6.5 The form check: no broken form goes live

Before showing a build and again at Publish, the Studio runs one check and shows what it found in one list, each with
a Fix button (Tia fixes it as a small patch):

- Contract: every question has a unique name, steps have a way forward, the send button exists, show-if points at a
  real question and a real answer, routes point at real answers and meeting types, the booking spot exists when the
  form books a meeting.
- Layout: no sideways scroll at 390px, 768px and 1100px, nothing overlaps, no text cut off, the logo loads.
- Brand: only the brand's fonts and colors, contrast passes.
- Access and law: the list in 6.3 and 6.4.

Warnings let the owner publish; errors don't. Code edits run the same check, so hand-written HTML can't break it.

### 6.6 Edge cases in the Studio itself

| Case | What happens |
| --- | --- |
| A question is renamed after the form has answers | Its field id stays the same, so past answers, the CRM link and reports keep working. Today the id follows the name; that changes |
| An option is renamed or removed and a route or show-if used it | The check names the route or condition and offers to move it to the new option |
| A meeting type used by the form is deleted or turned off | The form falls back to its default meeting, the owner gets a note, and the check flags it |
| No meeting types yet | On submission offers "Create a meeting type" in place of the list |
| Tia stops partway or the network drops | What was written stays as a draft change with Undo; Retry sends the same ask |
| Tia's answer breaks the contract | The check runs on it before it's applied; Tia gets the problem back once and fixes it |
| Two teammates edit the same form | The second sees "Maya is editing" and a read-only copy until they take over; nothing is lost |
| Editing a live form | Changes stay a draft until Publish changes; the live form doesn't move. Each publish is a version you can restore |
| The brand's site changes or the read fails | The brand keeps its last good look. Read again shows a before and after to accept |
| A brand with no logo, or a white logo | The name shows in the brand's font; a light logo gets a dark plate behind it in light forms |
| Fonts the site uses that aren't free to embed | The closest free font is used, and Tia says which |
| A huge form (40 questions) | Tia splits it into steps and turns on save and finish later |
| A one-field form (email only) | Allowed, with no steps or progress bar |
| Embedded on another site | Sized to its content (not the full screen), works in Webflow, WordPress, Shopify and plain HTML, and the site's CSS can't reach it |
| The visitor is offline when they send | Kept in the browser and sent when they're back (today's queue) |
| Typos in email | "Did you mean gmail.com?" under the box |
| Agencies with many clients | One workspace per client, or many brands in one; the chat list filters by brand |

### 6.7 How we know it's working

- Time from New form to first publish (goal: under 5 minutes).
- Forms that pass the check with no errors at first build (goal: 9 in 10).
- How often owners undo Tia's change (a high rate means Tia misread them).
- Fill rate and drop-off by step for studio forms, the same as other forms.
- A test set of 30 brands across the 12 industries in 6.1, built by Tia every week in CI with the check run on each.

## Part 7. Build order

| Step | What | Done when |
| --- | --- | --- |
| 1 | Bar: icon tabs with tooltips, three devices, one top bar, panel below it; sidebar and chat collapse | Nothing overlaps at 1280px and 1440px wide in every tab; a browser check measures it |
| 2 | Tia: built is built (prompt, starters, composer, ask refused on built forms) | A built form plus "make the button blue" changes it with no question; tests on canned answers |
| 3 | Chats: migration 112, save and load, the chat dropdown, New chat, delete | Two forms, two chats, switching keeps each; reload and another browser show them |
| 4 | Edit on the form: hover tags, inline text, floating bar, drag to move, keys | A browser check edits a heading, moves a choice and undoes both |
| 5 | The panel: Style and Settings tabs, Navigator, spacing box, icons, the pickers for Show if | Every property sets and clears; the published form matches the Studio |
| 6 | The form check (6.5) and stable field ids (6.6); consent, trap field and bot check back on studio pages | A broken route, a renamed question and a missing consent line are each caught in tests |
| 7 | Claritia blocks in studio pages (6.2), file upload first | A résumé upload and an address send and land on the contact |
| 8 | Industry recipes and the sensitive data check (6.1, 6.3) | The 30-brand set builds with no errors and no blocked questions slip through |
| 9 | Languages, right-to-left and the access checks (6.4) | A French and an Arabic form pass the check at all three widths |

## Part 8. Running cost

Nothing new is bought. Chats are a few rows per form in the database (Supabase, already paid).

"Built is built" makes changes cheaper: a change becomes a patch of a few hundred tokens out in place of the whole
form again (about 10,000), so the first line is a ceiling. The form check, the access checks, phone and address
formats run in the browser and cost nothing. Address search is the browser's own autofill; paid address lookup
(Google Places, about $17 per 1,000 searches, check) stays off unless a workspace asks for it.

| Item | Beta (50 teams) | Growth (500 teams) |
| --- | --- | --- |
| Claude Opus (Tia), as today, at most | about $640 | about $6,400 |
| Claude Opus: Fix buttons from the form check (about 10 fixes per team a month, about $0.05 each) | about $25 | about $250 |
| Claude Opus: extra languages (about 2 per team a month, about $0.20 each) | about $20 | about $200 |
| Claude Opus: the weekly 30-brand test in CI (30 builds, about $0.90 each, 4 a month) | about $110 | about $110 |
| Chats in the database | $0 new | $0 new |
| Servers | $0 new | $0 new |
| **Total** | **about $795** | **about $6,960** |

Opus at $4 in and $20 out per million tokens: check (from this repo's price table, not confirmed on Anthropic's
page from here).

## Part 9. The no-code builder (built)

**The layout** (after Fillout): the left sidebar is the one editor, with **Build | AI** at its top. Build has Add
fields (every type as a tile, with search, click or drag) and Layers; AI is the chat with Tia (the brand row with it).
A form with nothing built opens on AI, with Start blank; a built one opens on the side used last on this computer, and
AI shows a dot when Tia changed the form while Build was open. Ask Tia about this and the form check's Fix switch to AI.
There are no Preview, Edit and On submission tabs: the Studio is always the editor, Preview sits beside Publish in the
page's header (the form on the whole Studio, with Back to editor), and On submission is the last of the steps, which
sit under the form. The panel's words are a form builder's: Field, Label, Description, Contact field, Field key,
Validation with Min and Max characters (or value), Allow Other, Randomize order, Max selections, Bulk add, Display
condition, Page skip rules, Insert field value; Theme's Customize has Brand color, Corner radius, Button style and
Form width.

Everything a form needs can be made in Edit without Tia (`src/lib/studio/builder.ts`, the builder block in
`src/components/app/forms/studio/studio.ts`):

- **Add**: a list beside the canvas (the + in the bar shows or hides it) with every question type in groups, and a
  search. Click adds under the picked question, or after the last question of the page in view; drag drops it where
  the line shows; "/" on the form opens the same list as a menu, and Enter adds the first match. A new question is
  written in the page's own classes, read from a question the page already has, and a page whose questions sit loose
  (label, box, error line) gets a plain box around it. Its name is never one the page has; the first email saves to
  the contact's email.
- **Change type**: the floating bar's first button turns a text box into another kind (short, long, email, phone,
  number) or a pick into another (choice, checkboxes, dropdown). The answer's name, id and Saves to stay.
- **Question settings** (Settings tab): the question's words (its label, legend, or the line just before it on a
  loose page), required, help text, placeholder and Saves to. Options for choices, checkboxes and dropdowns: rename,
  move up and down, remove, Add option, Paste a list (one per line), a dropdown's empty choice, Other with a box for
  their own words, shuffle and the most picks. A renamed option whose saved value is its words (or a placeholder like
  Option 2) saves the new words, and the show-ifs, jumps and meeting routes that named it follow; a value written on
  purpose (sunny for "Sunny") stays. The answer's name is last, under Answer name.
- **Block settings**: a ranking's list, a grid's rows and columns, a payment's price or the total it charges and its
  currency, a calculation's formula, format, decimals and whether it shows, a hidden value's source.
- **Answer settings**: fewest and most letters, lowest and highest number. The form script checks them on every site (`limitMsg`, `shuffle` in `src/lib/studio/runtime.ts`).
- **Jump to a page**: on a choice or dropdown, "If the answer is X, go to page N". Kept on the question as
  `data-cl-jump` and written as show-ifs on the pages it skips, which every live form already runs; a page's own
  condition is kept apart in `data-cl-own`.
- **Answers in text**: Insert an answer puts `{name}` in a heading or text, and it shows what they answered
  (`data-cl-pipe`, also on the thank-you).
- **The panel's tabs** are Settings, Style, then Theme. Settings opens first; with nothing picked (a click beside the
  form) it holds the whole form's settings, starting with hidden fields from the link (`?ref=`).
- **The Theme tab**: the workspace's brands and every gallery style as small pictures; a style switches the form at
  once and undo puts it back (the look is part of each undo step), a brand on a built form asks first and Tia moves it.
  Under them, Adjust: color, font, corners, buttons, background, width and the progress bar, written into the form's
  own CSS over the theme's.
- **Pages as steps**: the bar shows the pages as numbered steps joined by a line, the thank-you last with a tick, and
  All pages as an icon; in Preview the pages already passed show done.
- **Start blank**: an email question and a send button in the brand's look, with no AI.
- **Templates on an empty form**: a new form's canvas shows every gallery template (`studioList.ts`), most used
  first, with the families as chips, search, and Start blank. Each card is drawn in its style's colors. Picking one
  makes the form the way Forms › Templates does (`/api/forms/templates`), in the chat's brand or style, or the
  template's own style; it opens in its own chat, joins the folder it was started from, and the empty chat goes. No
  brand dialog covers the templates; the brand button opens Add a brand when there are none. Adding a field to an
  empty form starts it blank first. A click on a template opens it in full first, page by page in Preview, in the look
  it will be made in, with All templates and Use this template; nothing is made or saved until Use.
- **Add page** sits in the steps bar after the pages. It adds a page after the one in view; a one-page form becomes
  pages first, with what it asks on page 1 and the send button on the new last page.
- **78 fields** in the Add list in twelve groups (docs/fields-plan.md, Built), each with its own settings: lists of
  up to 10,000 options, dependent dropdowns, picture cards, quizzes with a score, products a payment charges, codes for
  email and phone, date rules in Display condition, and a timer on a page (Steps bar).
- The form script's size limit goes from 39 to 41 KB for the rules above.

Running cost: $0 a month at Beta (50 teams) and Growth (500 teams). Nothing new is bought, and these edits make no
Claude calls.

## Tokens and files (after launch)

- The brand block (its CSS, industry recipe, meeting types and logo note) goes once per chat as a cached part of
  Tia's instructions; each message carries only the form as it is now, with the spaces between tags dropped. The
  conversation up to Tia's last answer is cached too.
- Changes to a built form run at low effort; a first build, attached files or a brand switch at medium.
- Translations send only the words (headings, labels, options, placeholders) and put them back in place, so the page
  can't change shape and the cost is a fraction of sending the page.
- The owner can attach up to 5 files a message: pictures (5 MB) and PDFs (10 MB) go to Tia as they are, text files
  (txt, csv, md, json; 200 KB) inside the words. A screenshot or PDF of a form is rebuilt in the brand's look.
- Estimated effect on the bill (check against the step cache's usage after a week): a change about $0.05 (was about
  $0.10), a language about $0.04 (was about $0.20). Beta about $715 a month, Growth about $6,135 (was about $810 and
  $7,110 with the brand switch). Opus price "check".

## Booking (after launch)

- The Studio's preview shows the meeting type's real open times (/api/meetings/times), in the browser's time zone,
  for the meeting the answers route to. Picking a time in the preview books nothing.
- Claritia's calendar, in the Studio and live, wears the brand's own classes (.heading, .text, .label, .field, .btn
  for the picked day, .btn-secondary for the rest), so it matches the page around it.
- On submission's "Book with" offers Claritia calendar or an outside scheduler (Calendly, Cal.com, HubSpot Meetings,
  SavvyCal, any link). An outside scheduler's link is checked and opens in the form's booking spot, live and in the
  preview; routes stay with Claritia's calendar.
- In a studio page the calendar is its own design (CAL_CSS in `src/lib/studio/runtime.ts`, the same in the Studio
  preview): no second thank-you or check mark over it, the host and length on one line, day chips (weekday over date)
  that scroll in their row, up to 9 times in a grid of 3 (2 on phones) with "more times", and the zone in words
  ("Saigon (GMT+7)") with Change to open the list. It sits on the page with no box of its own. Buttons wear the
  brand's .btn and .btn-secondary; a soft outline shows when the brand has none.

