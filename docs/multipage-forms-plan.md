# Multi-page form templates: the plan

**3 November 2026.** Status: built (steps 1 to 3). Step 4 is still to do. Builds on `docs/form-templates.md` (now 435 form
templates, 18 styles).

## Where we are

Multi-page forms already work. The form engine (`src/lib/forms/schema.ts`) has steps with:

- a progress bar or dots, and a Back button;
- `skip` and `jumps`: go to another page by answer, or send the form early;
- result pages worked out live from the answers (quizzes and calculators);
- a cover screen with a Start button, and one question at a time (`mode: "screens"`);
- "Save and finish later" (`resume`), a PDF copy of the answers (`copy`), a picture beside each page (`side`).

Before this, of the 424 form templates, 111 had more than one page: 86 had 2 pages, 23 had 3 and 2 had 4. Now 132
of 435 do, 40 of them with 5 to 7 pages. The form template
format (`src/lib/forms/gallery/types.ts`) only carries pages of fields with show-if rules, so none of them can use
jumps, skips, the cover, save and finish later or the PDF copy. The gallery calls them "Steps".

## The goal

A shelf of 40 long multi-page form templates for the jobs that really need pages: applications, onboarding,
intake, quotes with many parts and registrations. Each has 4 to 8 pages and uses the engine's page features where
they help, like a page skipped when it doesn't apply or a path by answer.

## Step 1: carry the page features in the form template format

- Add to `FormPage`: `skip` and `jumps` (by field id, checked like the engine's), and `result: true`.
- Add to `FormSchema`: `cover`, `resume`, `copy` and `progress`.
- `convert.ts` maps them to the engine. `scripts/check-templates.ts` fails a template whose jump points backward or
  to a page that doesn't exist, or whose last page can't be reached.
- The website's live forms (`tools/templates.py`, `assets/forms.js`) follow jumps and skips, show the progress bar,
  and show "Save and finish later" as a preview note (nothing is saved on the website).
- Tests: each jump and skip in `tests/formGallery*.ts`, and a browser walk that fills every path to the end screen.

## Step 2: the 40 form templates (built)

29 upgrades and 11 new ones; checking the catalog showed most of the planned "new" ones already existed as short
forms, so they became upgrades. An upgrade keeps its id and address and is version 2; forms people already made from
it don't change. 26 of the 40 use skips or paths by answer. Prices in the calculators (kitchen remodel, moving, solar,
the childcare deposit) are starting figures each business sets for itself.

| Form template | Industry | Pages | New or upgrade | Page features |
| --- | --- | --- | --- | --- |
| Rental application | Real estate | 6 | Upgrade | Pets detail only with pets; cover, save and finish later, PDF copy |
| Patient intake | Healthcare | 6 | Upgrade | Self-pay skips Insurance; cover, save and finish later, PDF copy |
| Membership sign-up | Fitness | 5 | Upgrade | No health conditions skips the health check; joining fee |
| Business funding | Financial services | 6 | Upgrade | Cover, save and finish later, PDF copy; booking end |
| Job application | HR | 6 | Upgrade | No experience yet skips Experience; cover, save and finish later, PDF copy |
| Employee onboarding | HR | 6 | Upgrade | Internal; cover, save and finish later, PDF copy |
| Engagement survey | HR | 6 | Upgrade | Anonymous; no manager skips Manager |
| Grant application | Nonprofits | 7 | Upgrade | Operating support skips Project; cover, save and finish later, PDF copy |
| Volunteer application | Nonprofits | 5 | Upgrade | First-time volunteers skip Experience |
| Onboarding survey | SaaS | 5 | Upgrade | Self-serve answer ends the form |
| Tax intake | Accounting | 7 | Upgrade | Skips Dependents and Business income; cover, save and finish later, PDF copy |
| Client intake | Agencies | 6 | Upgrade | Kickoff booking; cover, PDF copy |
| Case evaluation | Legal | 5 | Upgrade | A details page by case type |
| Return request | Ecommerce | 5 | Upgrade | The next page follows the reason |
| School application | Education | 7 | Upgrade | Adults skip Family; cover, save and finish later, PDF copy |
| Scholarship application | Education | 6 | Upgrade | Cover, save and finish later, PDF copy |
| Supplier onboarding | Manufacturing | 6 | Upgrade | Not certified skips Compliance; cover, PDF copy |
| Enterprise demo | SaaS | 5 | Upgrade | Small teams end with a self-serve note; booking end |
| Childcare enrollment | Education | 7 | Upgrade | One child skips Second child; deposit; cover, save and finish later, PDF copy |
| Course enrollment | Education | 5 | Upgrade | Self-paced skips Schedule; payment |
| Immigration intake | Legal | 6 | Upgrade | Cover, save and finish later, PDF copy; booking end |
| Nutrition intake | Wellness | 6 | Upgrade | Cover; booking end |
| Call for proposals | Events | 5 | Upgrade | First-time speakers skip Past talks; PDF copy |
| Conference registration | Events | 5 | Upgrade | Coming alone skips Guests; pass times people plus add-ons |
| Wedding planner inquiry | Events | 6 | Upgrade | Cover; booking end |
| Retreat registration | Faith communities | 5 | Upgrade | Payment |
| Moving cost calculator | Construction | 5 | Upgrade | Price follows stairs and load |
| Summer camp registration | Education | 7 | Upgrade | One camper skips Second camper; payment; cover, save and finish later, PDF copy |
| Solar savings calculator | Solar | 5 | Upgrade | Renters end after the roof page; savings follow direction and coverage |
| Mortgage pre-qualification | Financial services | 6 | New | No co-borrower skips that page; a budget range; cover, save and finish later, PDF copy |
| Auto insurance quote | Insurance | 5 | New | No claims skips Claims |
| Home insurance quote | Insurance | 5 | New | Renters skip Property |
| Therapy intake | Wellness | 6 | New | Cover, save and finish later |
| Fitness assessment | Fitness | 5 | New | A score with bands; booking end |
| Bookkeeping onboarding | Accounting | 5 | New | PDF copy |
| Kitchen remodel estimate | Construction | 6 | New | Skips Appliances; a low and high estimate; booking end |
| Pet adoption application | Pets | 6 | New | No other pets skips the vet page; cover, save and finish later |
| Franchise inquiry | Any business | 5 | New | Capital under the lowest band ends the form; booking end |
| Customer feedback, in depth | Any business | 6 | New | The score picks What you like or What to improve; cover |
| Trip planner | Hospitality | 5 | New | Booking end |

Written by four parallel helpers in `templates/wave2-multipage.ts` (the new ones) and in place in their files (the
upgrades). Each passes `scripts/check-templates.ts`, which now runs `paths.ts`, and a browser walk fills each one's
website demo page by page to its end screen.

## Step 3: show them

- Rename the "Steps" chip to **Multi-page**, on the website and in the app, and add a "Multi-page" list page
  (`/templates/layout/multi-page`).
- Cards show the page count ("6 pages").
- On a form template page, "What it asks" groups the questions by page, and the live form shows the progress bar.
- A "Multi-page" shelf near the top of the gallery, in the app's Forms › Templates too.

## Step 4: the 2-page ones

Look at the 86 two-page form templates. Where the second page only holds contact details, fold it into one page;
where a jump or skip fits, add it. Every change passes the same checks.

## Running cost

These are static form templates: no new service and no AI call when people use them.

| Item | Beta (50 teams) | Growth (500 teams) |
| --- | --- | --- |
| 40 more form templates, pages, jumps and skips | $0 | $0 |
| 40 more website pages (static, on today's host) | $0 | $0 |
| Claude tokens | $0 | $0 |
| **Added per month** | **$0** | **$0** |

Writing the 40 form templates is a one-time build cost, not a monthly one.
