# Form templates and styles

A gallery of 424 ready forms for 38 industries, each in one of 18 styles, with menus to find them, starter kits, and
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
- A card opens the real form (the `<claritia-form>` preview) in a sheet with what it comes with (Form, Meeting,
  Follow-up) and a row of styles, the workspace's own brand kits first. **Use template** makes a draft and opens it.
- **Use template** (`/api/forms/templates`, `src/lib/forms/gallery/make.ts`): the form is checked before it's made and
  wears a style's brand kit ("Midnight style", made once per workspace) or the workspace's own. A booking template
  books the workspace's meeting when it has exactly one, never a guess. Its follow-up is a Workflows template
  (`kit.ts`) made as a draft on the new form with every email unapproved.
- **Starter kits** (`kits.ts`, `/api/forms/templates/kit`): 3 to 5 forms of one industry from different groups, made
  in one click in one style. A form that fails is tried once more and never stops the rest. The website's kit pages
  link to `/forms/templates?kit=<id>`.
- **Describe the form you need**, under the grid: the words are matched to the catalog first
  (`/api/forms/templates/match`, `match.ts`). Words that hit a template match for free; the rest go to Claude Haiku
  through the step cache, and only ids in the catalog come back. **Build with AI** opens Form Studio with the words in
  its message box (`/forms/new?ask=`), unsent.

## The website

`node scripts/export-templates.ts > ../claritia-site/tools/templates.json`, then `python3 tools/templates.py` in the
site repo. Every page is static:

- `/templates`: the gallery, the categories by group, the teams and the starter kits.
- A page per group (`/templates/group/<id>`), category (`/templates/category/<id>`), team (`/templates/team/<id>`),
  industry (`/templates/<industry>`), sub-industry (`/templates/<industry>/<sub>`), category in an industry when 3 or
  more fit (`/templates/category/<id>/<industry>`) and kit (`/templates/kits/<id>`).
- A page per template: the live form with its logic, calculations, payment amount and a sample booking step, a style
  menu, what it asks, what happens to answers, question types, steps, questions and related templates.
- **See it in your brand**: a visitor types their site and every form on the page takes its button color, font,
  corners and logo (`/api/templates/brand`, `src/lib/forms/gallery/peek.ts`). Read from the page source with no AI,
  private addresses refused, 5 a visitor a day and 2,000 a day, kept in the visitor's browser for the next pages.
- **Describe the form you need** at the end of every gallery: the closest templates on the page first, then Build
  with AI into the app.

## Not done yet

Languages, real "Most used" counts (sorting uses featured first until Use template is counted), a brand picked on the
website carried into the new workspace, and the card-on-a-page look of some styles in the app.

## Tests

- `tests/formGallery.test.ts`: every template passes `checkForm` in its own style and the demo request in all 18,
  show-if logic runs in `visibility`, question kinds map to the app's types, styles pass `cleanTokens` whole, menus use
  real ids, menus worked out from the form match its fields, filters widen and narrow with counts that match the
  results, no repeated question lists in a category, and wired templates (the meeting only when there's one, follow-ups
  as drafts on the form, every email unapproved).
- `tests/formGalleryMore.test.ts`: the brand peek (the button color, never white or gray; text that reads; a Google
  font only; nothing it can't see), the catalog match (only catalog ids), starter kits and seasons.
- `tests/formPay.test.ts`: a payment a rule hides is never charged.

## Running cost

| Item | Beta (50 teams) | Growth (500 teams) |
| --- | --- | --- |
| Templates, menus, kits and pages: data in the app, static pages on the website | $0 | $0 |
| Style fonts: Google Fonts | $0 | $0 |
| Use template and kits: no AI call | $0 | $0 |
| See it in your brand: page source read on today's servers, no AI | $0 | $0 |
| Claude Haiku: catalog match when the words hit nothing (about 20,000 and 200,000 a month, about 9,000 tokens in with the catalog cached, 60 out, repeats free) | about $5 | about $50 |
| Claude Opus: forms built from the Describe box, counted in Form Studio's bill (`docs/studio-v2-plan.md`), about 3 more a team a month at about $0.90 | about $135 | about $1,350 |
| **Total** | **about $140** | **about $1,400** |

Haiku 5.5 at $0.10 in and $0.50 out and Opus 5.5 at $4 in and $20 out per million tokens (check: from this repo's
price table in `src/lib/ai/cache.ts`, not confirmed on Anthropic's page from here).
