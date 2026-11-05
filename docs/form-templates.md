# Form templates and styles

A gallery of 435 ready forms for 38 industries, each in one of 18 styles, with menus to find them, starter kits, and
templates that come wired with their meeting and follow-up. It lives on the website (tryclaritia.com/templates,
`dev-arrowsterr/claritia-site`) and in the app (Forms › Templates). The plan behind it is
`docs/form-templates-plan.md`.

## The catalog

- Templates are data in `src/lib/forms/gallery/templates`, written with the short builders in `build.ts`. The first
  150 are in the industry files (`general.ts`, `saas.ts` and the rest); wave 1 (274 more) is in the `wave1-*.ts` files
  by kind: booking, events, feedback, home services, leads, consent and legal, money, operations, quizzes and
  applications.
- Every template has 1 to 3 categories and teams, set by hand: in `tpl()` (`cats`, `teams`, `subs`) or, for the first
  150, in `tags.ts`.
- New templates are checked before they join: `node scripts/check-templates.ts <file> <EXPORT>` runs the form check in
  several styles, the menus, the lead email rule, quiz bands, payments and repeated question lists.
- Question kinds include calculations and payments: a `calc` field works out a price from the answers (choices carry
  prices as points) and a `payment` field charges a calc or a fixed amount through the form's Stripe step.

## The menus

`src/lib/forms/gallery/taxonomy.ts` and `filter.ts`, the same on the app and the website.

| Menu | Values | Set |
| --- | --- | --- |
| Category | 85 categories in 10 groups (Leads and sales, Booking, Orders and payments, Apply and join, Events, Feedback and surveys, Quizzes and assessments, Intake and onboarding, Operations, Consent and legal) | By hand |
| Industry | 38 industries, 45 sub-industries | By hand |
| Team | 16 | By hand |
| What it does next | Books a meeting, Takes payment, Shows a price, Shows a score, Sends a follow-up, Anonymous | From the form |
| Features | Logic, Calculator, Payment, Booking, Score, File upload, Signature, Grid, Ranking, Address, Hidden fields | From the form |
| Layout | One page, Steps, One question at a time | From the form |
| Length | Under 1 minute, 1 to 3 minutes, Over 3 minutes | From the form |

A value shows once 4 templates have it (`MIN_SHOWN`). Two values in one menu widen the results; two menus narrow
them. Each count is what that pick would show.

## In the app

- **Forms › Templates** (`src/components/app/forms/templates/TemplatesPage.tsx`, `/forms/templates`): the menus on the
  side (a Sheet on small screens), picked values as tags, search, a style for every card, and sort. With nothing
  picked, the first screen shows the starter kits and what's in season. Picks stay in the address
  (`?category=waiver&team=hr`).
- A card opens the Form Studio page it becomes (the `<claritia-form>` preview) in a sheet with what it comes with
  (Form, Meeting, Follow-up) and its Look: the template's own style as its card shows it (a menu changes it), the
  workspace's brands, or Plain. A template opened from the website (`/forms/templates/<template>?theme=<style>`)
  starts in the style picked there. **Use template** makes that page and opens it in the Studio.
- **Styles are Studio stylesheets** (`src/lib/studio/styleCss.ts`): each of the 18 styles is written by code as the
  same `--brand-*` variables and classes a brand's stylesheet has, drawn as the website draws it (the stage, the card,
  the drawing across the top or beside the form, fields, choices and buttons). Its first line names the style, so the
  Studio shows "Poster style" as the form's look and keeps it until a brand is picked. The drawings load from the
  website's copy (`https://tryclaritia.com/assets/form-art`). Half-width questions share a row, as on the website.
- **Use template** (`/api/forms/templates`, `src/lib/forms/gallery/make.ts`): the form is checked before it's made and
  wears the style asked for (`theme`), a workspace brand (`kitId`), Claritia's plain look (`plain`), or else the
  template's own style. A booking template
  books the workspace's meeting when it has exactly one, never a guess. Its follow-up is a Workflows template
  (`kit.ts`) made as a draft on the new form with every email unapproved.
- **Starter kits** (`kits.ts`, `/api/forms/templates/kit`): 3 to 5 forms of one industry from different groups, made
  in one click, each in its own style. A form that fails is tried once more and never stops the rest. The website's kit pages
  link to `/forms/templates?kit=<id>`.
- **Describe the form you need**, under the grid: the words are matched to the catalog first
  (`/api/forms/templates/match`, `match.ts`). Words that hit a template match for free; the rest go to Claude Haiku
  through the step cache, and only ids in the catalog come back. **Build with AI** opens Form Studio with the words in
  its message box (`/forms/new?ask=`), unsent.

## Templates in Form Studio

Use template turns a template into a Form Studio page (`src/lib/studio/templatePage.ts`, through `convert.ts` and
`src/lib/studio/fromForm.ts`), and every page passes the Studio's own check, so it can be saved after it's edited.
Each question becomes the field the Studio's Add list makes:

| Template | Studio page |
| --- | --- |
| A cover (title, line, Start) | The first page, with the form's one title; the first page of questions has Back |
| Money | Currency: cents, never below zero unless the template says, the number keypad on phones |
| A date asking for a birthday | Date of birth: the browser's own date box, which it can fill in |
| Agree | Agreement: a boxed choice that says Yes when ticked |
| Country (`country()`) | The Country list, saved to the contact's country |
| A list of people or things (`rows()`) | Repeating group: a row of small questions and Add another, up to `max` rows |
| Hidden | A hidden value with its label |
| "Email a PDF copy" (`copy`) | Kept on the form; the page's thank-you shows Download a copy |

Lists that are one thing per row (medicines, guests, children, dependents) are `rows()`; notes that mix several
things (allergies and medicines together) stay a long answer. Templates never ask for bank or routing numbers, tax or
ID numbers, card details or passwords in a box: a file upload (a voided check, a W-9, proof of status) asks instead.

13 health templates ask about medicines, allergies or medical history. The Studio holds those questions until the
workspace has health data turned on (`docs/studio-v2-plan.md`), so those pages can be used but not saved until then.

## The website

`node scripts/export-templates.ts > ../claritia-site/tools/templates.json`, then `python3 tools/templates.py` in the
site repo. Every page is static:

- `/templates`: the gallery, the categories by group, the teams and the starter kits.
- A page per group (`/templates/group/<id>`), category (`/templates/category/<id>`), team (`/templates/team/<id>`),
  industry (`/templates/<industry>`), sub-industry (`/templates/<industry>/<sub>`), category in an industry when 3 or
  more fit (`/templates/category/<id>/<industry>`) and kit (`/templates/kits/<id>`).
- A page per template: the live form with its logic, calculations, payment amount and a sample booking step, a style
  menu, what it asks, what happens to answers, question types, steps, questions and related templates.
- **Describe the form you need** at the end of every gallery: the closest templates on the page first, then Build
  with AI into the app.

## Not done yet

Languages, real "Most used" counts (sorting uses featured first until Use template is counted), a brand picked on the
website carried into the new workspace.

## Tests

- `tests/formGallery.test.ts`: every template passes `checkForm` in its own style and the demo request in all 18,
  show-if logic runs in `visibility`, question kinds map to the app's types, styles pass `cleanTokens` whole, menus use
  real ids, menus worked out from the form match its fields, filters widen and narrow with counts that match the
  results, no repeated question lists in a category, and wired templates (the meeting only when there's one, follow-ups
  as drafts on the form, every email unapproved).
- `tests/formGalleryMore.test.ts`: the brand peek (the button color, never white or gray; text that reads; a Google
  font only; nothing it can't see), the catalog match (only catalog ids), starter kits and seasons.
- `tests/formPay.test.ts`: a payment a rule hides is never charged.
- `tests/templateStudioFit.test.ts`: every template's page passes the Studio's check (health records aside), a
  check box question with three or more choices is one question while a real repeat is still caught, a cover is the
  first page with its title once, the PDF copy is kept, and money, dates of birth, agreements, countries, hidden values
  and lists use the Studio's fields.
- `scripts/template-studio-check.ts` (browser): a template opens on its cover, Start and Back, an Agreement shows what
  it unlocks, a repeating group sends two rows, and the thank-you shows Download a copy once; the first send failing,
  and a copy link the server didn't make, are the flaky cases.
- `tests/studioStyle.test.ts`: every style survives the page's CSS cleaner whole and is known again by its first
  line; Use template makes the style asked for, the template's own, a brand or plain.
- `scripts/studio-blocks-check.ts` (browser): Poster's stage, frames and buttons, Grove's drawing beside the form and
  across the top on a phone, half-width questions on one row. `scripts/templates-check.ts` (browser): the website's
  style carried in, the style menu, a brand, Plain, a card's own style, and what Use template asks for.
  `scripts/formpage-check.ts`: a styled form opens in the Studio with its style and its chat keeps it.

## Running cost

| Item | Beta (50 teams) | Growth (500 teams) |
| --- | --- | --- |
| Templates, menus, kits and pages: data in the app, static pages on the website | $0 | $0 |
| Templates as Studio fields (covers, Currency, Date of birth, Agreement, Country, Repeating group, the PDF copy): code only | $0 | $0 |
| Style fonts: Google Fonts | $0 | $0 |
| Use template and kits: no AI call; styles are stylesheets written by code | $0 | $0 |
| Claude Haiku: catalog match when the words hit nothing (about 20,000 and 200,000 a month, about 9,000 tokens in with the catalog cached, 60 out, repeats free) | about $5 | about $50 |
| Claude Opus: forms built from the Describe box, counted in Form Studio's bill (`docs/studio-v2-plan.md`), about 3 more a team a month at about $0.90 | about $135 | about $1,350 |
| **Total** | **about $140** | **about $1,400** |

Haiku 5.5 at $0.10 in and $0.50 out and Opus 5.5 at $4 in and $20 out per million tokens (check: from this repo's
price table in `src/lib/ai/cache.ts`, not confirmed on Anthropic's page from here).
