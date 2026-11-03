# Multi-page form templates: the plan

**3 November 2026.** Status: plan. Builds on `docs/form-templates.md` (424 form templates, 18 styles).

## Where we are

Multi-page forms already work. The form engine (`src/lib/forms/schema.ts`) has steps with:

- a progress bar or dots, and a Back button;
- `skip` and `jumps`: go to another page by answer, or send the form early;
- result pages worked out live from the answers (quizzes and calculators);
- a cover screen with a Start button, and one question at a time (`mode: "screens"`);
- "Save and finish later" (`resume`), a PDF copy of the answers (`copy`), a picture beside each page (`side`).

Of the 424 form templates, 111 have more than one page: 86 have 2 pages, 23 have 3 and 2 have 4. The form template
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

## Step 2: the 40 form templates

| Form template | Industry | Pages | New or upgrade | What makes it multi-page |
| --- | --- | --- | --- | --- |
| Rental application | Real estate | 6 | Upgrade `real_estate.rental-application, 4 pages` | Residence history, income, household, references, sign; save and finish later; application fee |
| Mortgage pre-qualification | Finance | 6 | New | Income and debts feed a price range; co-borrower page only if there is one |
| Business loan application | Finance | 6 | New | Owners, revenue, uploads; PDF copy |
| Auto insurance quote | Insurance | 5 | New | Drivers, cars, claims, coverage; jump past the claims page with no claims |
| Home insurance quote | Insurance | 5 | New | Property, coverage, claims; renters skip the property page |
| Full patient intake | Healthcare | 6 | Upgrade `healthcare.patient-intake, 3 pages` | Insurance page skipped for self-pay; history, medicines, consent, then book |
| Therapy intake | Wellness | 6 | New | Concerns, history, goals, consent; save and finish later |
| Nutrition intake | Wellness | 6 | New | Diet, activity, goals; result page with a starting plan |
| Fitness assessment | Fitness | 5 | New | Scores each part; result page, then book a session |
| Job application | HR | 6 | Upgrade `hr.job-application, 1 page` | Role, experience, education, questions, uploads, review |
| Employee onboarding | HR | 6 | Upgrade `hr.onboarding, 3 pages` | Pay and tax, emergency contact, equipment, policies, sign |
| Vendor onboarding | Any business | 6 | New | Company, contacts, banking, tax form upload, compliance, sign |
| Client onboarding | Agency | 6 | Upgrade `agency.client-intake, 3 pages` | Business, audience, brand, goals, access, kickoff booking |
| SaaS onboarding questionnaire | SaaS | 5 | New | Team, tools, goals; jump to a setup call for larger teams |
| Enterprise demo qualification | SaaS | 5 | New | Size, need, timing; small teams go to a self-serve end, large teams book |
| Legal case evaluation | Legal | 5 | New | One page per matter type, picked by the first answer |
| Immigration consultation intake | Legal | 6 | New | Status, family, history, documents; save and finish later |
| Tax organizer | Accounting | 7 | Upgrade `accounting.tax-intake, 3 pages` | Income, deductions, dependents, uploads; pages skipped by answer; PDF copy |
| Bookkeeping onboarding | Accounting | 5 | New | Accounts, tools, volume; price on the last page |
| Kitchen remodel estimate | Construction | 6 | New | Size, finishes, appliances; running price; book a visit |
| Solar savings quote | Solar | 5 | Upgrade `solar.savings-calculator, 2 pages` | Roof, bills, shade; savings result, then book |
| Moving quote | Construction | 5 | Upgrade `construction.moving-cost-calculator, 2 pages` | Rooms, items, dates; price result |
| Wedding planner inquiry | Events | 6 | Upgrade `events.wedding-planner-inquiry, 2 pages` | Date, guests, budget, style, vendors; book a call |
| Conference registration with guests | Events | 5 | New | Attendee, guests, sessions, tickets and payment |
| Call for speakers | Events | 5 | New | Talk, outline, experience, travel; PDF copy |
| Summer camp registration | Education | 7 | Upgrade `education.summer-camp, 2 pages` | Child, medical, consent, pickup, payment; a second child page only with a second child |
| Daycare enrollment | Education | 7 | New | Child, family, health, schedule, consent, deposit |
| School admission | Education | 7 | New | Student, grades, essay, references; save and finish later |
| Scholarship application | Education | 6 | Upgrade `education.scholarship, 1 page` | Need, grades, essay, references; save and finish later |
| Course enrollment | Education | 5 | New | Course, level check, payment |
| Grant application | Nonprofit | 7 | Upgrade `nonprofit.grant-application, 2 pages` | Organization, project, budget, outcomes, uploads; save and finish later |
| Volunteer application | Nonprofit | 5 | Upgrade `nonprofit.volunteer, 1 page` | Interests, availability, background consent |
| Pet adoption application | Pets | 6 | New | Home, other pets, experience, references; vet page only with other pets |
| Membership application | Fitness | 5 | Upgrade `fitness.membership, 1 page` | Plan, health check, waiver, payment |
| Franchise inquiry | Any business | 5 | New | Market, capital, experience; qualified leads book |
| Retreat registration | Faith | 5 | New | Room, meals, travel, payment |
| Travel booking request | Hospitality | 5 | Upgrade `hospitality.travel-inquiry, 1 page` | Trip, people, budget, extras; book a call |
| Product return | Ecommerce | 4 | New | The page after the reason changes with the reason |
| Customer feedback, in depth | Any business | 5 | New | The follow-up page changes with the score |
| Employee engagement survey | HR | 6 | New | Anonymous; one page per topic |

An upgrade keeps the form template's id and address, so links and saved forms keep working; forms people already
made from it don't change. 25 are new and 15 are upgrades. Written in two batches of 20 by parallel helpers, the way
wave 1 was, each checked by `check-templates` and the browser walk before it joins the catalog.

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
