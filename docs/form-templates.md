# Form templates

A gallery of ready forms for every industry, like Fillout's template gallery. Click a form, try it, press **Use this form**, and it's live in the workspace and taking answers within seconds.

**Status: built.** Forms are the first slice of M6 in `docs/marketing-platform.md`: the gallery, the template catalog, the editor, hosted and embedded forms, submissions into contacts with consent, and Tailor.

---

## Part 1. How it works

1. **Gallery** (`src/components/forms/Gallery.tsx`). Forms opens on the `ToolIntro` with the gallery under it; once a workspace has forms, Forms lists them and **New form** opens the gallery at `/forms/templates`. Left rail: industries with counts, plus Popular. Top: search and use-case tags. Each card is the real form, scaled down and drawn only when it scrolls into view.
2. **Preview.** A card opens a side panel with the full form, working: pages, show-if logic, checks and the end screen. Nothing is saved. The address follows (`/forms/templates/<template>`), so a link opens the same preview.
3. **Use this form** (`createForm` in `src/lib/forms/server.ts`) does this in one call:
   - Copies the template's schema into `forms` (`form_create`, one transaction). `template_id` and `template_version` are kept, and `form_template_uses` counts the use.
   - Links answers to contact fields. Built-ins (email, name, phone, title, company, website, country, region) map directly. Custom fields (`f.<key>`) are made when missing, pick lists get missing options, and a key taken by a field of another type gets a new key (`budget_2`) so answers never land as bad data (`planFields`).
   - Runs the go-live check (`qaCheck` in `src/lib/forms/qa.ts`): the schema reads, a sample visitor can answer every required question on every path, and a sample email becomes a contact through the same code a real submission runs. Passing forms go live at once; health forms stay drafts until a BAA is confirmed.
   - Opens the form in the editor.
4. **Tailor to my business** (`src/lib/forms/tailor.ts`, `/api/forms/tailor`). Claude Haiku 5.5 rewrites the words (title, intro, labels, help, options, end screen) from a short business description. Keys, kinds, order, logic, points and contact mapping never change, and a renamed option renames the conditions that point at it. The result shows as unsaved changes to review. The same form and description replay from `form_tailor_cache` with no model call.

Templates never change a form after import.

### The editor (`src/components/app/views/FormEditor.tsx`)

- **Build:** outline of pages and questions, the live preview (click a question to pick it), and the picked question's settings: label, help, placeholder, required, half width, options, "Other", points, rows, ranges, files, **Save on the contact**, and **Show when**. The end screen has its message, booking button, redirect and score bands.
- **Share:** the link (`/f/<slug>`), the embed code and an iframe.
- **Answers:** newest first, a side panel with every answer, file downloads, where the visit came from and the contact; CSV export and delete.
- **Settings:** name, color, booking link, consent words or consent off, and the BAA confirmation for health forms.
- Saving a live form re-runs the go-live check, so an edit can't break what visitors see. Leaving with unsaved changes asks first.

### Visitors

- **Hosted:** `/f/<slug>` (`src/app/f/[slug]/page.tsx`). **Embedded:** `<script src="https://app.tryclaritia.com/forms.js" async></script>` and `<div data-claritia-form="<slug>"></div>`. The iframe grows to fit, `data-field-<key>` fills a hidden field, the page's UTM tags ride along, the div fires `claritia:submitted`, and when `claritia.js` is on the page the email ties the visit to the person.
- **Consent:** the visit's region comes from Cloudflare's country header; no country counts as strict. Strict regions show an unticked opt-in box; elsewhere a notice sits under the button. `form_submit` records the exact words. A tick always records an opt-in; a notice never lowers an earlier opt-in.
- **Spam:** a hidden box, a two-second minimum, a per-instance burst limit, 20 per network per workspace in 10 minutes (`form_can_submit`, checked before any contact is written), Cloudflare Turnstile when its keys are set, and temporary email domains refused.
- **Submitting** (`/api/forms/submit`, `src/lib/forms/submit.ts`): answers are checked again on the server, files go to the private `form-files` bucket only after the answers pass (and come back out if the save fails), the contact is written with the source `form`, then the submission, the `form.submitted` activity and the consent go in one transaction. Hiccups are retried with growing waits in the browser and on the server.

### Styles

18 form styles in `src/lib/forms/themes.ts`, each with its own colors, fonts (Google Fonts), corners, field look (boxed, filled or a single line), shadow and layout (a card, a drawing across the top, a drawing beside the form, or no card), and for six of them a flat drawing. Each template gets a style that suits its industry, in turn, so the gallery looks varied. Forms keep their style in `settings.theme`; Settings in the editor has a style picker and a button color on top. The template preview in the app has a style row, and a link from the website (`?theme=`) keeps the style picked there. `ThemedFrame` draws the page, card and drawing; the form itself reads the style's CSS variables.

### Website

The gallery lives on the live site, tryclaritia.com (`dev-arrowsterr/claritia-site`): `/templates`, a page per industry and a page per template, where people can try the form in any of the 18 styles (a style menu and Shuffle) and press **Use template**, which opens it in the app at `/forms/templates/<template>`. The pages are static, written by `tools/templates.py` there from the data this repo exports (`node scripts/export-templates.ts > ../claritia-site/tools/templates.json`). `/templates` on the app sends people to the website.

---

## Part 2. Template format

Templates are typed data in `src/lib/forms/templates/*.ts`, written with the short builders in `build.ts` (keys come from labels; `save` maps to a custom contact field; `when` refers to an earlier question). `src/lib/forms/catalog.ts` lists them. Forms and templates share one shape (`src/lib/forms/types.ts`):

```ts
type FormSchema = {
  v: 1;
  title: string;
  intro?: string;
  pages: { title?: string; fields: FormField[] }[];
  submit: string;
  end: { title: string; text: string; redirect?: string; booking?: boolean; score?: { min: number; title: string; text: string }[] };
};
type FormField = { key: string; kind: FieldKind; label: string; help?; placeholder?; required?; options?; rows?; points?; other?; min?; max?; minLabel?; maxLabel?; currency?; maxFiles?; map?: string; show?: Cond; half?: boolean };
```

**Field kinds (26):** short text, long text, email, phone, website, number, money, pick one, pick many, dropdown (the form's own, never a browser `<select>`), yes or no, checkbox, stars, NPS 0–10, opinion scale, ranking, matrix, date, time, date range, full name, address, file upload, signature, statement, hidden.

**Checks:** `tests/forms.test.ts` runs every template through `checkSchema` and `qaCheck`, the answer checks for every kind, logic chains, scores, contact mapping, consent, field planning and Tailor. `tests/pg/forms.pg.ts` runs import, submit, consent, rate limits and closed forms on a real database. `tests/db/leaks.sql` checks members only reach their own forms, answers and files.

**Not built yet:** picture choice, payment, calculator, progressive profiling, A/B tests, journeys starting from a form, routing to an owner at submit (booking uses the form's booking link for now), and a browser-run Funnel QA check (M9; the go-live check runs the same code path on the server instead).

### Setup

| Setting | Where | What it does |
|---|---|---|
| Migration `039_forms.sql` | Supabase | Tables, functions and the `form-files` bucket |
| `ANTHROPIC_API_KEY` | Render | Tailor. Without it, Tailor says it isn't set up |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET` | Render | Bot check on forms. Optional |
| Cloudflare in front of the app | Cloudflare | Sends `cf-ipcountry`, which picks the consent block. Without it every visitor gets the opt-in box |

---

## Part 3. The catalog

150 forms over 24 industries. Key fields only; every form also gets the hidden fields and consent block on import. ★ marks the 39 that ship first (Part 5).

### 1. Any business (general)

| Form | Key fields | After submit |
|---|---|---|
| ★ Contact us | name, email, company, topic, message | thanks |
| ★ Newsletter sign-up | email, first name, interests | thanks |
| ★ Book a call | name, email, company, team size, reason | booking |
| ★ Customer feedback | rating, what went well, what to fix | thanks |
| ★ NPS survey | NPS 0–10, why, may we follow up | thanks |
| ★ Waitlist | email, company, role, use case | thanks |
| Referral | your name, your email, friend's name, friend's email, note | thanks |
| Partner application | company, website, partner type, region, client count | booking |
| Quote request | name, email, company, service, budget, timeline, details | thanks |
| Callback request | name, phone, best time, topic | thanks |
| Email preferences | email, topics, frequency | thanks |
| Testimonial request | name, role, company, quote, photo, permission | thanks |
| Cancellation survey | reason, what would keep you, rating | thanks |
| Product feedback | feature area, rating, idea, file | thanks |
| Content download (gated) | name, work email, company, role | redirect |
| Webinar registration | name, email, company, role, question for speaker | thanks |

### 2. SaaS and software

| Form | Key fields | After submit |
|---|---|---|
| ★ Demo request | work email, company, team size, current tool, use case | booking |
| ★ Free trial sign-up | work email, company, role, team size | redirect |
| ★ Contact sales | name, work email, company, seats, timeline, budget | booking |
| ★ Onboarding survey | role, goal, team size, tools used, how you heard | thanks |
| Pricing calculator lead | seats, plan, add-ons, work email | thanks |
| Feature request | email, feature, problem it solves, priority | thanks |
| Bug report | email, steps, expected, actual, browser, file | thanks |
| Beta program application | company, role, use case, weekly usage, consent to interview | thanks |
| Churn survey | reason, switching to, could we win you back | thanks |
| Integration request | tool name, use case, how often, email | thanks |
| Customer advisory board | name, company, role, topics, availability | booking |
| Security review request | company, contact, questionnaire file, deadline | thanks |
| Product-market fit survey | how disappointed without us, main benefit, who it's for | thanks |

### 3. Agencies and marketing services

| Form | Key fields | After submit |
|---|---|---|
| ★ Project inquiry | name, email, company, service, budget, start date, goals | booking |
| ★ Client intake | brand, website, audience, competitors, goals, assets upload | thanks |
| ★ Creative brief | project, audience, message, deliverables, deadline, references | thanks |
| SEO audit request | website, main keywords, competitors, email | thanks |
| Website project brief | pages, features, examples you like, budget, launch date | booking |
| Monthly client check-in | rating, what's working, what to change, next priority | thanks |
| Content approval | piece, approve or change, notes | thanks |
| Freelancer application | name, skills, portfolio, rate, availability | thanks |
| Free marketing audit | website, ad spend, channels, goal | booking |

### 4. Consulting and professional services

| Form | Key fields | After submit |
|---|---|---|
| ★ Consultation request | name, email, company, challenge, urgency | booking |
| ★ Discovery questionnaire | current state, goals, blockers, budget, decision makers | booking |
| Proposal request | scope, timeline, budget, decision date, file | thanks |
| Engagement feedback | rating, results, would recommend, comments | thanks |
| Workshop registration | name, email, company, session, dietary needs | thanks |
| Speaker request | event, date, audience size, topic, budget | thanks |

### 5. Legal

| Form | Key fields | After submit |
|---|---|---|
| ★ Case evaluation | name, phone, email, case type, what happened, date | booking |
| New client intake | contact, matter type, other parties, documents | thanks |
| Conflict check | client name, other parties, related companies | thanks |
| Consultation booking | name, email, practice area, short summary | booking |
| Document request | matter, document type, deadline, file | thanks |

### 6. Accounting, tax and bookkeeping

| Form | Key fields | After submit |
|---|---|---|
| ★ Tax prep intake | filing status, income types, dependents, documents | thanks |
| Bookkeeping quote | business type, monthly transactions, accounts, software | booking |
| New business setup | entity type, state, owners, start date | booking |
| Year-end checklist | documents upload, changes this year, questions | thanks |

### 7. Financial services and wealth

| Form | Key fields | After submit |
|---|---|---|
| ★ Financial review request | name, email, goals, assets range, timeline | booking |
| Risk tolerance quiz | 8 scenario questions, score | thanks (score) |
| Loan pre-qualification | loan type, amount, income, credit range, contact | thanks |
| Business funding application | company, revenue, years in business, amount, use | booking |
| Retirement planning | age, target age, savings range, goals | booking |

### 8. Insurance

| Form | Key fields | After submit |
|---|---|---|
| ★ Quote request | coverage type, current carrier, renewal date, contact | thanks |
| Claim report | policy number, date, what happened, photos | thanks |
| Business insurance intake | industry, employees, revenue, coverages needed | booking |
| Policy review | current policies upload, concerns, contact | booking |

### 9. Real estate

| Form | Key fields | After submit |
|---|---|---|
| ★ Home valuation | address, beds, baths, condition, timeline, contact | thanks |
| ★ Buyer inquiry | budget, areas, beds, pre-approved, move date | booking |
| Showing request | property, preferred times, contact | booking |
| Open house sign-in | name, email, phone, working with an agent | thanks |
| Rental application | applicant, income, employer, references, pets, ID upload | thanks |
| Maintenance request | unit, issue, urgency, photos, entry permission | thanks |
| Commercial space inquiry | space type, size, location, budget, move date | booking |
| Seller listing intake | property details, upgrades, price idea, photos | booking |

### 10. Construction and home services

| Form | Key fields | After submit |
|---|---|---|
| ★ Free estimate | service, address, project details, photos, timeline | booking |
| ★ Service request | name, phone, address, issue, urgency | thanks |
| Remodel planner | rooms, style, budget, start date, photos | booking |
| Subcontractor application | trade, license, insurance upload, areas served | thanks |
| Job site safety check | site, date, checklist, issues, signature | thanks |
| Warranty claim | job, install date, issue, photos | thanks |
| Customer satisfaction | rating, on time, clean, would recommend | thanks |

### 11. Solar and energy

| Form | Key fields | After submit |
|---|---|---|
| ★ Solar savings check | address, monthly bill, roof type, own or rent, contact | booking |
| Commercial energy audit | site, square feet, monthly spend, contact | booking |
| EV charger install | address, panel size, vehicle, parking | booking |

### 12. Healthcare and clinics

| Form | Key fields | After submit |
|---|---|---|
| ★ Appointment request | name, phone, reason, preferred times, new or returning | booking |
| New patient intake | contact, history, medicines, allergies, insurance | thanks |
| Patient feedback | rating, wait time, staff, comments | thanks |
| Referral from provider | provider, patient, reason, urgency, file | thanks |
| Telehealth check-in | symptoms, since when, severity | booking |

Healthcare templates carry a `phi` flag. Importing one asks the workspace to confirm it has a signed BAA on file before publishing. Until then the form stays a draft. (HIPAA hosting is not in Claritia's plan yet. Check before sale.)

### 13. Dental, wellness and therapy

| Form | Key fields | After submit |
|---|---|---|
| ★ New patient booking | name, contact, reason, insurance, preferred times | booking |
| Therapy consultation | concerns, goals, in person or online, availability | booking |
| Wellness assessment | sleep, stress, energy, goals | thanks (score) |
| Consent and waiver | name, date, terms, signature | thanks |

### 14. Fitness and beauty

| Form | Key fields | After submit |
|---|---|---|
| ★ Free trial class | name, contact, class, preferred day | booking |
| Personal training intake | goals, injuries, experience, schedule | booking |
| Membership sign-up | plan, start date, contact, signature | thanks |
| Salon booking | service, stylist, date, contact | booking |
| Liability waiver | name, emergency contact, signature | thanks |

### 15. Education and training

| Form | Key fields | After submit |
|---|---|---|
| ★ Course inquiry | program, start term, contact, background | booking |
| ★ Application | personal details, education, essay, documents | thanks |
| Course feedback | rating, instructor, pace, comments | thanks |
| Tutoring request | subject, grade, goals, schedule | booking |
| Corporate training request | company, team size, topic, format, dates | booking |
| Scholarship application | details, need, essay, references | thanks |
| Quiz / knowledge check | questions, score | thanks (score) |

### 16. Ecommerce and retail

| Form | Key fields | After submit |
|---|---|---|
| ★ Wholesale inquiry | business name, type, location, order size, resale ID | booking |
| Product quiz | 5 preference questions, email | redirect (picks) |
| Return request | order number, item, reason, photos | thanks |
| Pre-order / back-in-stock | product, size, email | thanks |
| Product review | product, rating, review, photo | thanks |
| Influencer application | handle, platforms, followers, niche | thanks |
| Custom order request | item, specs, quantity, date needed | thanks |

### 17. Manufacturing and industrial

| Form | Key fields | After submit |
|---|---|---|
| ★ RFQ (request for quote) | part, material, quantity, drawings upload, due date | thanks |
| Distributor application | company, region, lines carried, annual volume | booking |
| Sample request | product, use, quantity, ship to | thanks |
| Supplier onboarding | company, tax ID, certifications, insurance upload | thanks |
| Quality issue report | order, part, issue, photos, quantity affected | thanks |

### 18. Logistics and transport

| Form | Key fields | After submit |
|---|---|---|
| ★ Freight quote | origin, destination, weight, dimensions, ship date | thanks |
| Carrier onboarding | company, MC/DOT, insurance, lanes | thanks |
| Warehouse space inquiry | pallets, duration, services, location | booking |
| Driver application | contact, license class, experience, endorsements | thanks |

### 19. Automotive

| Form | Key fields | After submit |
|---|---|---|
| ★ Test drive booking | model, date, contact | booking |
| Trade-in value | year, make, model, mileage, condition, photos | thanks |
| Service appointment | vehicle, service, date, contact | booking |
| Fleet inquiry | company, vehicles, use, timeline | booking |

### 20. Hospitality, travel and restaurants

| Form | Key fields | After submit |
|---|---|---|
| ★ Group booking / event inquiry | event type, date, guests, budget, contact | booking |
| Catering request | date, guests, menu style, dietary needs | thanks |
| Guest feedback | stay dates, rating, comments | thanks |
| Travel inquiry | destination, dates, travelers, budget | booking |
| Reservation request | date, time, party size, contact | thanks |

### 21. Events and conferences

| Form | Key fields | After submit |
|---|---|---|
| ★ Event registration | name, email, company, ticket type, dietary needs | thanks |
| ★ Speaker application | name, talk title, abstract, bio, video link | thanks |
| Sponsor inquiry | company, level, budget, goals | booking |
| Exhibitor sign-up | company, booth size, power, contact | thanks |
| Post-event survey | rating, best session, what to change | thanks |
| Volunteer sign-up | name, shifts, skills, shirt size | thanks |
| Meeting request at event | name, company, topic, preferred slot | booking |

### 22. Nonprofits

| Form | Key fields | After submit |
|---|---|---|
| ★ Volunteer application | contact, interests, availability, background check consent | thanks |
| Donation pledge | amount, frequency, dedication, contact | thanks |
| Grant application | organization, project, amount, budget upload | thanks |
| Program intake | applicant, need, household, documents | thanks |
| Event RSVP | name, guests, dietary needs | thanks |

### 23. HR and recruiting (any industry)

| Form | Key fields | After submit |
|---|---|---|
| ★ Job application | name, email, phone, role, resume, LinkedIn, start date | thanks |
| Employee onboarding | personal details, tax form, bank, emergency contact | thanks |
| Employee engagement survey | 10 scale questions, comments (anonymous) | thanks |
| Exit interview | reason, manager rating, would return | thanks |
| Time-off request | dates, type, reason | thanks |
| 360 feedback | person, strengths, growth areas, ratings | thanks |
| Interview feedback | candidate, role, scores, hire or not | thanks |
| Referral program | candidate, role, how you know them, resume | thanks |

### 24. IT services, MSPs and cybersecurity

| Form | Key fields | After submit |
|---|---|---|
| ★ IT assessment request | company, users, sites, current provider, pain points | booking |
| Support ticket | name, company, device, issue, urgency, screenshot | thanks |
| Security readiness quiz | 10 yes/no questions, score, email | booking (score) |
| Cloud migration intake | current setup, apps, data size, deadline | booking |

### Also planned (round 2)

Media and creators (sponsorship inquiry, guest pitch, listener survey), agriculture (equipment quote, supplier sign-up), government and public sector (permit request, public comment, service request), religious groups (prayer request, small group sign-up), pet services (boarding booking, adoption application), photography (shoot inquiry, model release), and childcare (enrollment, pickup authorization).

---

## Part 4. Data

Migration `039_forms.sql`:

- `forms`: name, slug (title plus six random letters), status (draft, live, closed), schema, settings, template id and version, the health flag and BAA date, the answer count.
- `form_submissions`: answers, score, meta (UTM tags, page, referrer, country, policy, browser), a keyed hash of the network for the rate limit, and the contact.
- `form_template_uses`, and `form_tailor_cache` (server only).
- Functions: `form_create`, `form_save` and `form_fields_apply` (forms and their contact fields together), `form_can_submit`, `form_submit`. All server only.
- Members read their own workspace's rows and files; every write goes through the server.

---

## Part 5. Running cost

What forms add to the monthly bill. Forms run on the existing `claritia-web` service and Supabase project.

| Item | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Servers: hosted forms, the embed script and submits on `claritia-web` | $0 | $0 |
| Database rows (forms and answers, about 200 answers per team a month) | $0, inside the current Supabase plan | $0, inside the current Supabase plan |
| File storage (about 1 GB a month at Beta, 10 GB at Growth) | $0, inside the plan's included storage (check) | $0, inside the plan's included storage (check) |
| Cloudflare Turnstile | $0 (free tier, check) | $0 (free tier, check) |
| Tailor, Claude Haiku 5.5: about 10 runs per team a month, ~3k tokens in and ~2k out; repeats replay from the cache (price check) | ~$5 | ~$50 |
| The 150 template pages and 18 styles on the website: static; fonts from Google Fonts (free) | $0 | $0 |
| **Total** | **~$5/mo** | **~$50/mo** |
