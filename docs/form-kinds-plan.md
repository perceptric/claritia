# Every kind of form, from a small set of parts

Fillout has hundreds of templates, and they're all made from the same small set of parts. Claritia's AI builder
should know those parts and put them together for any kind of form, from what the site sells and what the person types.
Today it offers six goals (quote, assess, recommend, quiz, book, leads). This plan replaces the goals with kinds and
fills in the parts that are missing.

Status: plan only. Nothing here is built.

## 1. The parts

Every form is some mix of six parts. The table marks what Claritia has today.

| Part | Have | Missing |
| --- | --- | --- |
| **Screens**: how it looks | Classic page, one question per screen, cover, ending, HTML sections | Split screen with a picture beside the question (Fillout's look), a picture per step, step list in the builder |
| **Inputs**: what people answer | Text, email, phone, long text, number, choice cards, multi, dropdown, checkbox, country, date, URL, rating, slider, file, hidden, consent | Address, signature, scale (NPS 0 to 10, opinion 1 to 5), grid (rate each row), ranking, time and date range, repeating group ("add another"), payment |
| **Logic**: what shows when | Show rules, skip forward, `needs` | Jump to any later step by answer, end early (not a fit) |
| **Math and results** | Formulas, settings, scores, outcomes, result blocks, email my results | None |
| **Who fills it** | Email required on every fill | Email optional (polls, anonymous surveys, internal forms), prefill from the link, save and finish later |
| **After send** | Message, redirect, booking, results email, routing, contacts | Take a payment, PDF copy of the answers |

## 2. Kinds

A kind is a recipe: which parts it uses, whether it needs an email, what the end screen does and where answers go.
The AI picks the kind, then builds with its recipe.

| Kind | Examples | Parts it leans on | Email |
| --- | --- | --- | --- |
| Lead | Contact, demo, newsletter, waitlist, gated content, callback, partner | Short form, qualify, route, book | Required |
| Quote | Price quote, cost or ROI calculator | Sliders, cards, formulas, result | Required |
| Order | Product order, custom order, pre-order, donation, tickets | Cards with pictures, quantities, address, payment | Required |
| Booking | Meeting, appointment, class, table, rental | Choice, date and time, booking | Required |
| Qualify | Lead scoring, plan finder, product finder, readiness check | Scores, outcomes, result, book the right rep | Required |
| Quiz | Graded quiz, personality quiz, giveaway | One per screen, split with pictures, scores, outcome | Optional |
| Survey | NPS, CSAT, product feedback, event feedback, churn, poll, market research | Scale, grid, ranking, long text | Optional |
| Testimonial | Reviews, case study quotes | Rating, long text, photo or video upload, consent | Required |
| Registration | Event, webinar, course, membership, volunteer, client intake | Repeating group (guests), date, consent | Required |
| Application | Job, grant, scholarship, tenant, vendor, speaker | Many steps, file upload, save and finish later | Required |
| Support | Ticket, bug report, return, warranty, complaint | Choice, file upload, routing | Required |
| Consent | Photo release, waiver, NDA sign-off, patient intake | Signature, consent, PDF copy | Required |
| Internal | Daily report, time off, expense, incident, IT request, pulse survey | Date range, file, number, grid | Optional |

Industry packs (healthcare, education, real estate, food, e-commerce, agencies, nonprofits, events, legal, finance,
SaaS, home services) aren't more kinds. The AI already reads the site, so it writes each kind in that industry's words.

## 3. The AI builder

- **One box.** The goal cards go. The first screen is the website and a line: "What's it for?" ("a quote for
  kitchen remodels", "NPS for our customers", "job application for designers").
- **The AI picks the kind** from the site and the line, and shows it as a pill the person can change.
- **Questions for that kind.** A survey asks who answers and what to measure. An order form asks what's for sale
  and how they pay. A quiz asks for the outcomes.
- **Build with the recipe.** The kind's parts, the brand book's look, and the site's own pictures on split screens
  and choice cards (from the deep read's images).
- **Check against the recipe.** The check-and-fix loop also checks that the kind's must-haves are there: a payment
  on an order, a signature on a waiver, a scale on an NPS survey.

## 4. Order of work

**Step 0. The 15 Forms bugs** from the review (edits lost while the AI works, choice boxes losing focus, renamed
choices breaking rules, publish problems). Nothing new ships on top of them.

**Step 1. Kinds with the parts we have** (about 1 week)
- Kinds and recipes in `aiBuild.ts`, the one-box first screen, the kind pill.
- Email optional, by kind. Fills with no email save as submissions without a contact.
- Split screen with a picture, picture per step, and the step list in the builder.
- Jump to any later step, end early.
- Covers: Lead, Quote, Booking, Qualify, Quiz, Testimonial, Support, Registration without guests, Application without
  save and finish later.

**Step 2. The missing inputs** (about 2 weeks)
- Scale, grid, ranking, address, time and date range, repeating group, signature.
- Each one in the schema, `checkForm`, the form script, the builder panel, values on the server, and the contact
  timeline. Each one with tests.
- Covers: Survey, Consent, Internal, Registration with guests.

**Step 3. Money and paper** (about 2 weeks)
- Payment through Stripe Connect: the team connects their own Stripe account in one click, and the money goes to them.
- PDF copy of the answers, made on the runner with the browser it already has, and sent to the person and the team.
- Save and finish later: a link by email that opens the fill where it stopped.
- Covers: Order, Consent with a PDF, long Applications.

## 5. Running cost

Claude Sonnet 5.5 at $2 in and $10 out per million tokens, 10 AI-built forms a team a month.

| Item | Beta (50 teams) | Growth (500 teams) |
| --- | --- | --- |
| Claude: build a form (today, about $0.30) | $150 | $1,500 |
| Claude: pick the kind, about 3,000 in and 200 out a form | $4 | $40 |
| Stripe Connect, Standard accounts: Stripe charges the team, nothing to Claritia (check) | $0 | $0 |
| PDFs on the existing runner | $0 | $15 for a bigger runner machine (check) |
| Storage for signatures, uploads and PDFs in Supabase (check) | $0, inside the plan | about $5 |
| **Total for AI forms** | **about $154** | **about $1,560** |

Today's total is about $150 at Beta and $1,500 at Growth, so this plan adds about $4 and $60 a month.
