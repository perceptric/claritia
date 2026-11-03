# Pricing

Status: approved, November 3, 2026. Replaces the October draft (Free, Starter $79, Growth $299, Scale $799) and the
draft in `docs/marketing-platform.md` Part 10. The plans in `src/lib/plans.ts` are still the testing product's and
change in Part 8. The website (`claritia-site`: `/pricing`, the home pricing section and `pricing.md`) follows this file.

Competitor prices were read on each vendor's own pricing page on November 3, 2026, unless marked "check".

---

## Part 1. The market

Form tools:

| Tool | Free | Paid | Model |
|---|---|---|---|
| Typeform | Low response cap | Basic $28, Plus $56, Business $91, Growth Flow $266 a month yearly (100 to 10,000 responses). Its page shows two price sets (check) | Flat, by responses |
| Fillout | 1,000 responses, unlimited seats | Starter $15, Pro $40, Business $75 a month. Partial submissions on Business | Flat, by responses |
| Jotform | 5 forms, 100 submissions | Bronze $34, Silver $39, Gold $99 a month yearly (1,000 to 10,000 submissions). One user | Flat, by submissions |
| involve.me | 50 submissions or 500 visits | Start $29, Grow $69, Scale $139 a month yearly (3 to 25 live funnels) | Flat, by funnels |
| Heyflow | About 100 leads, 1 flow (check) | €49 to €239 a month (check, its page blocks automated reading) | Flat, by responses |

Schedulers and routing:

| Tool | Free | Cheapest plan that routes | Model |
|---|---|---|---|
| Calendly | 1 event type, 1 calendar, confirmations only | Teams $16 a seat yearly, $20 monthly. Reminders from Standard ($10 to $12) | Per seat |
| Cal.com | 1 user, unlimited events, email and SMS reminders | Teams $12 a user yearly | Per seat |
| OnceHub | 1 user, 1 calendar, 1 link | Route $19 to $23 a seat (check which is yearly) | Per seat |
| RevenueHero | None | Essentials $79 plus $25 a seat yearly, $99 plus $35 monthly | Plan fee plus seats |
| HubSpot Sales Hub | 1 meeting link | Professional $90 to $100 a seat (check which tier routes forms) | Per seat |
| Chili Piper | None | Growth $15,000 a year with 15 seats, then $45 a seat | Yearly only |
| Default | None | Growth $12,000 a year plus $540 a seat a year | Yearly only |

What the market does:
- Schedulers and routers charge per seat. Form tools charge one price and cap responses.
- Yearly billing saves 17 to 31%.
- Six of the seven form and scheduling tools have a free plan.
- Removing the badge, partial submissions, routing and Salesforce sit on the higher tiers almost everywhere.
- AI is sold on top: Calendly Plus, Cal.ai at $0.29 a minute, involve.me credits.

## Part 2. How Claritia prices

1. **A small plan price with 1 seat in it**, like Fillout's.
2. **A price for each extra seat**, like Calendly and Cal.com. A seat is a teammate people can book a meeting with. Everyone who builds forms, edits workflows or reads results is free.
3. **Monthly billing.** Yearly saves 20%.
4. **A free plan.** No card needed.

## Part 3. Plans

| | Free | Starter | Pro | Business |
|---|---|---|---|---|
| Plan price (monthly / yearly) | $0 | $15 / $12 | $39 / $31 | $79 / $63 |
| Hosts included | 1 | 1 | 1 | 1 |
| Each extra seat (monthly / yearly) | — | $8 / $6 | $15 / $12 | $25 / $20 |
| Editors | Unlimited | Unlimited | Unlimited | Unlimited |
| Forms | Unlimited | Unlimited | Unlimited | Unlimited |
| Submissions a month | 250 | 2,000 | 5,000 | Unlimited |
| AI credits a month | 100 | 500 | 2,000 | 5,000 |
| Calendars per seat | 1 | 3 | 10 | Unlimited |
| Meeting types | 1 | Unlimited | Unlimited | Unlimited |
| Branding | Claritia badge | Small badge | Removed | Removed |

### Plan rules

- **An AI credit** is one thing Tia does when asked: write a form, add questions, write a meeting's text, draft a
  follow-up. A small change is 1 credit, a whole new form is 10. A step replayed from cache uses no credits.
- **Past the submission cap** the form keeps working, every submission is saved and its deliveries and workflows run
  as usual. On Free, answers past 250 stay hidden on screen and in the CSV until the team upgrades or the month turns.
  Paid plans will pay $5 per 1,000 extra (counted now, not billed yet). A lead is never dropped. Counts reset on the 1st
  of each month for every plan.
- **Past the AI credit cap** Tia stops until the month resets. Forms, booking and workflows keep running.
- **Reminders** never go out for a canceled or moved meeting.

## Part 4. Every feature

"Soon" marks a feature that isn't built yet. The website shows the same tag.

**Free**
- Forms: unlimited forms and questions, multi-page forms with a progress bar, 15 field types (text, long text, email,
  phone, number, choice, picker, checkboxes, date, rating, scale, yes or no, address, file upload, consent), show-if
  logic, step skips, answer piping, calculations and prices, hidden fields (UTM tags, page, referrer), pre-fill from
  the link, checks on every field, thank-you screen, 18 form styles, 435 templates, works on phones and by keyboard
- Sharing: share link, embed by one script tag (inline or popup), QR code
- Spam and consent: Cloudflare Turnstile, a honeypot, a rate limit, disposable email blocking, consent wording by
  region saved with each fill
- Meetings: 1 calendar (Google or Outlook) connected in one click, 1 meeting type for one person, working hours,
  buffers, minimum notice, daily caps, the visitor's time zone and language, Google Meet, Teams or Zoom links,
  booking right inside the form, reschedule and cancel links
- Workflows: confirmation email with a calendar invite, email reminders a day and an hour before, emails when a
  meeting moves or is canceled
- Tia (100 credits): write a form from one sentence, add and fix questions, write a meeting's text
- Results: every fill and booking saved, repeat people merged by email, views, starts and fills for each form, CSV
  export, webhooks
- Account: 1 seat, unlimited editors, Claritia badge, help by email

**Starter**, everything in Free, plus
- 2,000 submissions and 500 AI credits a month; extra seats $8 ($6 yearly)
- Forms: signatures, payments with Stripe, custom endings by answer, redirect on completion, your logo, your colors and
  fonts, a copy of the answers emailed to the person
- Meetings: 3 calendars per seat, unlimited meeting types, group meetings with a seat limit, one-off meetings,
  single-use links, secret meeting types, meeting polls, paid meetings with Stripe, questions on the booking page,
  copy open times into an email, booking pages for each person and the team
- Workflows: your own wording and times for confirmations and reminders, a follow-up the next day until they book
- Integrations: HubSpot, Omniscient, Google Sheets, Airtable, Notion, Slack, Mailchimp, Klaviyo, ActiveCampaign,
  Brevo, Kit, MailerLite, and fills coming in from Typeform, Tally, Webflow, Calendly and Cal.com
- Small Claritia badge; help by email within one business day

**Pro**, everything in Starter, plus
- 5,000 submissions and 2,000 AI credits a month; extra seats $15 ($12 yearly)
- Forms: no Claritia branding, full style control (corners, spacing, buttons, your site's look copied in), emails from
  your own domain, form languages (Soon), prevent duplicate fills (Soon)
- Meetings: 10 calendars per seat, round robin (weights, priority, flexible or strict), collective meetings
  (everyone free), team pools, caps per seat for a day and a week, away days
- Routing: route by any answer to a meeting and a person, route by past fills, a log of why each lead went where
- Workflows: thank-you after a held meeting, no-show follow-up with the reschedule link, SMS reminders
  (100 a month, Soon)
- Tia: a short brief of the answers before each call
- Priority help by email

**Business**, everything in Pro, plus
- Unlimited submissions and 5,000 AI credits a month; extra seats $25 ($20 yearly)
- Meetings: unlimited calendars, owner first (the person's owner in your CRM, else the pool), double round robin (one
  from each of two teams)
- Integrations: Salesforce
- Forms: partial submissions (Soon), drop-off by question (Soon), A/B tests (Soon), ad pixels (Soon), custom domain
  (Soon)
- Workflows: SMS reminders (300 a month, Soon)
- Priority chat help

## Part 5. Side by side

A team with 10 seats, per month (monthly / yearly billing):

| Tool | Cost |
|---|---|
| Claritia Starter | $87 / $66 |
| Calendly Standard | $120 / $100 |
| Cal.com Teams | $120 (yearly) |
| **Claritia Pro** | **$174 / $139** |
| Calendly Teams | $200 / $160 |
| OnceHub Route | $230 / $190 (check) |
| **Claritia Business** | **$304 / $243** |
| RevenueHero Essentials | $449 / $329 |
| HubSpot Sales Hub Pro | $900 to $1,000 (check) |
| Chili Piper Growth | $1,250 (yearly only) |
| Default Growth | $1,450 (yearly only) |

## Part 6. Margin

What one team costs Claritia on each plan, used to the limit:

| Cost a team a month | Free | Starter | Pro | Business |
|---|---|---|---|---|
| Tia credits (about $0.0015 each at worst, mostly Haiku) | $0.15 | $0.75 | $3 | $7.50 |
| Email on SES, about $0.10 per 1,000 (check) | $0.05 | $0.20 | $0.50 | $1 |
| SMS on Twilio, about $0.01 with fees (check, once built) | — | — | $1 | $3 |
| Storage, intake and hosting share (check) | $0.10 | $0.30 | $0.50 | $1 |
| **Cost** | **About $0.30** | **About $1.25** | **About $5** | **About $12.50** |
| Each seat (calendar sync, reminders) | — | $0.50 | $0.50 | $0.50 |
| **Gross margin, plan alone, monthly price** | — | 92% | 87% | 84% |

## Part 7. Running cost of this change

Mix assumed, with 3 seats on each paid team:
- Beta: 20 Free, 15 Starter, 10 Pro and 5 Business teams, about $1,800 a month in revenue.
- Growth: 200 Free, 150 Starter, 100 Pro and 50 Business teams, about $18,000 a month.

| Item | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Teams on their plans, used to the limit (Part 6) | $182 | $1,823 |
| Stripe Billing, 0.7% of billing (check) | $13 | $126 |
| Card fees, 2.9% plus $0.30 a charge (check) | $61 | $612 |
| **Added per month** | **About $256** | **About $2,561** |

That keeps about 86% of revenue at both stages. Claude tokens are inside the first line.

## Part 8. Built (November 3, 2026)

| Part | Where |
|---|---|
| The plan list: prices, seats, limits, which plan has each feature, AI credits per Tia step | `src/lib/plans.ts` |
| Plan ids (Team became Pro), interval and seats billed; caps; this month's usage; the submission counter and the hidden flag; credits taken and given back; seats; the meeting type and calendar checks; what Billing reads | `supabase/migrations/120_plans.sql` |
| Stripe: products made once, a plan line and an extra-seat line priced from the plan list, monthly or yearly; plan changes in place, prorated; the seat count kept in step after each meeting type save and before each renewal (`invoice.upcoming`) | `src/lib/billing.ts`, `src/lib/billingHosts.ts`, `src/app/api/billing/` |
| Settings › Billing: the plan, this month's submissions, AI credits and seats, the four plans monthly or yearly | `src/components/app/views/BillingSettings.tsx` |
| Tia steps charged before the model runs; a cached step, unasked work and a failed call cost nothing | `src/lib/ai/cache.ts` |
| Limits enforced: meeting kinds by plan, Free's 1 meeting type, 1 seat, paid meetings on Starter and up, calendars per seat, branded booking pages on Starter and up, the link domain on Business, Left early (partial fills) on Business, hidden answers past Free's cap | `src/app/api/meetings/_lib/seat.ts`, `src/lib/meetings/providers/connect.ts`, `src/app/api/link-domain/route.ts`, `src/components/app/forms/Submissions.tsx` |
| Tests: the plan list, Stripe lines, subscriptions, seat sync, plan changes, the webhook, AI credits, hidden fills; on Postgres, two fills racing for Free's last slot, twenty at once, repeats and spam, two Tia steps racing for the last credits, the meeting type and calendar checks | `tests/billing.test.ts`, `tests/planCredits.test.ts`, `tests/pg/plans.pg.ts` |

Not held back yet, so open on every plan for now: polls, one-off and single-use links, signatures and payments on
forms, routing by answer, the small badge on Starter and the badge on Free forms, Salesforce on Business, and billing
for extra submissions. Each is listed in `FEATURES` in `src/lib/plans.ts` and needs its check where it's saved.

### Running cost of this build

Nothing new on the bill beyond Part 7. Stripe products, prices and webhooks cost nothing; the extra calls are a few
Stripe API requests a day per paying team (free). The usage counters are one small row a workspace a month.

| | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Added by this build | $0 | $0 |

---

## Sources

- [Calendly](https://calendly.com/pricing), [Cal.com](https://cal.com/pricing), [Cal.ai](https://cal.com/ai)
- [Typeform](https://www.typeform.com/pricing), [Fillout](https://www.fillout.com/pricing),
  [Jotform](https://www.jotform.com/pricing/), [involve.me](https://www.involve.me/pricing)
- Heyflow: [Capterra](https://www.capterra.com/p/212782/heyflow/pricing/), [Toolradar](https://toolradar.com/tools/heyflow/pricing)
- [OnceHub](https://www.oncehub.com/pricing), [RevenueHero](https://www.revenuehero.io/pricing),
  [HubSpot Sales Hub](https://www.hubspot.com/pricing/sales), [Chili Piper](https://www.chilipiper.com/pricing),
  [Default](https://www.default.com/pricing)
