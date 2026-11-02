# Form templates

A gallery of ready forms for every industry, like Fillout's template gallery. Click a form, see it live, press **Use this form**, and it's in the workspace and taking submissions within seconds.

Forms themselves are M6 in `docs/marketing-platform.md`. This plan adds the gallery, the template format, the import step and the full catalog.

---

## Part 1. How it works

1. **Gallery.** Forms opens on the `ToolIntro` screen with the gallery under it. Left rail: industries. Top: a search box and use-case tags (Lead capture, Booking, Survey, Application, Order, Registration, Feedback, Quiz). Each card is a live mini render of the form (same renderer as the real form, scaled down), the name and the field count.
2. **Preview.** Click a card and a `Sheet` opens with the full form. It can be filled in and clicked through, page by page, with logic working. Nothing is saved.
3. **Use this form.** One click does all of this:
   - Copies the template into `forms` and `form_fields` with new ids. `template_id` and `template_version` are kept.
   - Maps each field to a contact or account property. Missing custom fields are made on the spot (`contact_fields`), with the type from the template.
   - Applies the workspace brand (colors, font, logo) from the Brand Brain.
   - Adds the consent block for the workspace's regions (`docs/marketing-platform.md` M6).
   - Sets the after-submit default: thank-you screen, the matching journey trigger if one exists, and routing to an owner where the template has a booking step.
   - Runs the Funnel QA form check (M9). If it passes, the form is published at `forms.tryclaritia.com/<team>/<slug>` and the embed script is ready. If it fails, the form stays a draft with the one-line error.
   - Opens the form in the editor, live.
4. **Tailor (optional).** A button in the editor: **Tailor to my business**. Claude rewrites labels, options and the thank-you text to fit the workspace's offer from the Brand Brain. Field types and logic don't change. Goes through the step cache.

Templates never change a form after import. A newer template version shows as a small `UPDATE` tag on the form, and nothing more.

---

## Part 2. Template format

Templates live in the repo as typed files, one per form, and are checked in CI.

```
src/lib/forms/templates/
  index.ts               catalog: id, industry, tags, name, version
  types.ts               FormTemplate, TemplateField, Logic
  general/contact-us.ts
  saas/demo-request.ts
  ...
```

```ts
type FormTemplate = {
  id: string;                 // "saas.demo-request"
  version: number;
  industry: Industry;
  tags: UseCase[];
  name: string;
  pages: { title?: string; fields: TemplateField[] }[];
  logic: Logic[];             // show/hide, skip to page, score, route
  maps: Record<string, string>; // field key → contact or account property
  after: { kind: "thanks" | "redirect" | "booking"; text?: string };
  scoring?: { field: string; points: Record<string, number> }[];
};
```

**Field types needed** (all built with the app's own `Select`, never a browser dropdown):

| Group | Types |
|---|---|
| Text | short text, long text, email, phone, website, number, money |
| Choice | single choice, multi choice, dropdown, yes/no, picture choice |
| Scale | rating (stars), NPS 0–10, opinion scale, ranking, matrix |
| Date | date, time, date range |
| People | name, address, company (filled from the email domain by account intelligence) |
| Files | file upload, signature |
| Flow | page break, statement, hidden field (UTM, page, segment), consent, meeting booker |
| Later | payment (Stripe), calculator |

**CI checks** (`tests/form-templates.test.ts`): every template renders, every `maps` target exists or is a valid custom field, every logic rule points at a real field, no `<select>` in output, and an import then submit round trip lands a contact.

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

Migration `039_form_templates.sql` (runs after the M6 forms tables exist):

```sql
alter table forms add column template_id text, add column template_version int;
create table form_template_uses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  template_id text not null,
  form_id uuid references forms(id) on delete set null,
  at timestamptz not null default now()
);
```

The catalog itself stays in code. `form_template_uses` feeds a "Most used" sort in the gallery and tells us which templates to improve.

---

## Part 5. Build order

| Week | Work |
|---|---|
| 1 | Template format, field types, renderer support for all Part 2 types except payment and calculator |
| 2 | Gallery (`ToolIntro` + grid + search + tags), preview `Sheet`, import step with field mapping and brand |
| 3 | First 39 templates (★), CI checks, Funnel QA on import |
| 4 | Tailor to my business, remaining 111 templates, `UPDATE` tag |
| Later | Payment and calculator fields, round 2 industries |

Templates are written by us with Claude in the repo, then reviewed by hand. That's a one-time build cost with nothing added to the monthly bill.

**Tests** (reliability rule, on top of the CI checks in Part 2):
- Import twice in a row gives two separate forms with no shared ids.
- An import whose Funnel QA check fails leaves a draft and publishes nothing.
- A field mapped to an existing custom field of a different type gets a new field instead of writing bad data.
- Tailor never changes field types, keys or logic (checked field by field after the call).
- A second Tailor on the same template and brand replays from the step cache with no model call.
- A form imported in a `strict` region shows the unticked opt-in box.

---

## Part 6. Running cost

What this adds to the monthly bill on top of M6 forms:

| Item | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Servers | $0 (gallery and previews run on `claritia-web`; catalog is static code) | $0 |
| Storage (`form_template_uses`, a few thousand rows) | $0 | $0 |
| Funnel QA check on import (about 10 imports per team a month, ~20 s of browser time each, on the existing runner) | ~$1 | ~$8 |
| Tailor to my business, Claude Haiku 5.5 (about 10 calls per team a month, ~3k tokens in, ~2k out; step cache cuts repeats; price check) | ~$5 | ~$50 |
| **Total** | **~$6/mo** | **~$58/mo** |

Haiku 5.5 price per token: check on the vendor page before launch. Funnel QA browser time uses the M9 runner's rate; check once M9's cost is final.
