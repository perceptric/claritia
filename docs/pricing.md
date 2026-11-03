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

Changed November 3, 2026, the same day: from a plan price with 1 seat in it plus a price for each extra seat, to one
price per seat, so the website reads like Calendly and Cal.com.

1. **One price per seat**, like Calendly and Cal.com. A seat is a teammate people can book a meeting with. Everyone
   who builds forms, edits workflows or reads results is free.
2. **Monthly billing.** Yearly saves 20%.
3. **A free plan** for 1 seat. No card needed.

## Part 3. Plans

| | Free | Starter | Pro | Business |
|---|---|---|---|---|
| Price per seat/month (monthly / yearly) | $0 | $15 / $12 | $39 / $31 | $79 / $63 |
| Seats | 1 | Unlimited | Unlimited | Unlimited |
| Editors | Unlimited | Unlimited | Unlimited | Unlimited |
| Forms | Unlimited | Unlimited | Unlimited | Unlimited |
| Submissions/month | 250 | 2,000 | 5,000 | Unlimited |
| Additional form submissions | — | $5 per 1,000 | $5 per 1,000 | — |
| AI credits/month | 100 | 500 | 2,000 | 5,000 |
| Calendars per seat | 1 | 6 | 6 | 6 |
| Meeting types | 1 | Unlimited | Unlimited | Unlimited |
| Claritia branding | Badge | Small badge | Removed | Removed |

Calendars per seat count one person's own calendar accounts (a work Google Calendar and a personal Outlook, say), as
Calendly's do: 1 on Free and 6 on every paid plan. They never add people to book. Everyone in a round robin, team pool
or owner-first meeting is a host on that meeting type, and every host is a seat.

### Plan rules

- **An AI credit** is one thing Tia does when asked: write a form, add questions, write a meeting's text, draft a
  follow-up. A small change is 1 credit, a whole new form is 10. A step replayed from cache uses no credits.
- **Past the submission cap** the form keeps working, every submission is saved and its deliveries and workflows run
  as usual. On Free, submissions past 250 stay hidden on screen and in the CSV until the team upgrades or the month
  turns. Paid plans will pay $5 per 1,000 extra (counted now, not billed yet). A lead is never dropped. Counts reset on
  the 1st of each month for every plan.
- **Past the AI credit cap** Tia stops until the month resets. Forms, booking and workflows keep running.
- **Reminders** never go out for a canceled or moved meeting.

## Part 4. Every feature

The website's pricing page, in the owner's words (`claritia-site`, `tools/pricing.py`). "Soon" marks a feature that
isn't built yet.

**Free**
- Forms: Unlimited forms, Multi-page forms + progress bar, 15 field types, File uploads, Conditional logic and step skips, Calculations and formulas, Hidden fields (UTM tags, page, referrer), Pre-fill from the link, Checks on every field, Thank-you screen, 18 form styles, 435 form templates, Works on phones and by keyboard
- Meetings: Calendars per seat (1), Meeting types (1), Google Calendar and Outlook, Google Meet, Teams and Zoom links, Meeting booking inside forms, Working hours, buffers, notice and daily caps, The visitor's time zone and language, Reschedule and cancel links
- Sharing: Share form by link, Embed form with one script tag, Popup embed, QR code
- Automation workflows: Confirmation email with a calendar invite, Email reminders a day and an hour before, Emails when a meeting moves or is canceled
- Tia, the AI form builder: Build a form from plain language sentence, Add and fix questions, Write a meeting's text
- Integrations: Webhooks, CSV export
- Security & Compliance: Cloudflare spam protection, Honeypot and rate limit, Disposable email blocking, GDPR wording
- Results: Every answer and booking saved, Repeat people merged by email, Views, starts and answers for each form
- Help: Help center, Email help

**Starter**, everything in Free, plus
- Forms: e-Signatures, Stripe payment, Redirect on completion, Custom brand
- Meetings: Calendars per seat (6), Meeting types (Unlimited), Booking pages for each person and the team, Group meetings with a guest limit, One-off meetings and single-use links, Secret meeting types, Meeting polls, Paid meetings with Stripe, Questions on the booking page, Copy open times into an email
- Automation workflows: Your own wording and times, Follow-up the next day until they book
- Integrations: HubSpot, Omniscient, Slack, Google Sheets, Airtable and Notion, Mailchimp, Klaviyo, ActiveCampaign, Brevo, Kit and MailerLite, Answers and bookings from Typeform, Tally, Webflow, Calendly and Cal.com
- Help: Email help (Within 1 business day)

**Pro**, everything in Starter, plus
- Forms: Follow-up emails from your own domain, Form translation (Soon), Block duplicate answers (Soon)
- Meetings: Round robin with weights and priority, Meetings with everyone free, Team pools, Daily and weekly limits for each person, Away days
- Sharing: Remove Claritia branding
- Automation workflows: Thank-you after a held meeting, No-show follow-up with the reschedule link, SMS reminders (100/month) (Soon)
- Routing: Route by any answer to a meeting and a person, Route by past answers, Routing log
- Help: Email help (Priority)

**Business**, everything in Pro, plus
- Forms: Partial answers, Drop-off by question, A/B testing (Soon), Ad pixels (Soon), Your own domain for forms and booking pages
- Meetings: Owner first (the person's owner in your CRM), Double round robin (one from each of two teams)
- Automation workflows: SMS reminders (300/month) (Soon)
- Integrations: Salesforce
- Help: Chat help

Built and still in the app, no longer listed on the pricing page: answer piping, custom endings by answer, a copy of
the answers emailed to the person, full style control, your site's look copied in, and Tia's brief before each call.

## Part 5. Side by side

A team with 10 seats, per month (monthly / yearly billing):

| Tool | Cost |
|---|---|
| Calendly Standard | $120 / $100 |
| Cal.com Teams | $120 (yearly) |
| Claritia Starter | $150 / $120 |
| Calendly Teams | $200 / $160 |
| OnceHub Route | $230 / $190 (check) |
| **Claritia Pro** | **$390 / $310** |
| RevenueHero Essentials | $449 / $329 |
| **Claritia Business** | **$790 / $630** |
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
| **Gross margin, 1 seat, monthly price** | — | 88% | 86% | 84% |

## Part 7. Running cost of this change

Mix assumed, with 3 seats on each paid team:
- Beta: 20 Free, 15 Starter, 10 Pro and 5 Business teams, about $3,030 a month in revenue.
- Growth: 200 Free, 150 Starter, 100 Pro and 50 Business teams, about $30,300 a month.

| Item | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Teams on their plans, used to the limit (Part 6) | $182 | $1,823 |
| Stripe Billing, 0.7% of billing (check) | $21 | $212 |
| Card fees, 2.9% plus $0.30 a charge (check) | $97 | $969 |
| **Added per month** | **About $300** | **About $3,004** |

That keeps about 90% of revenue at both stages. Claude tokens are inside the first line. Per-seat pricing raises the
revenue in this mix by about two thirds; the Stripe and card fees grow with it, and nothing else changes.

## Part 8. Built (November 3, 2026)

| Part | Where |
|---|---|
| The plan list: prices per seat, limits, which plan has each feature, AI credits per Tia step | `src/lib/plans.ts` |
| Plan ids (Team became Pro), interval and seats billed; caps; this month's usage; the submission counter and the hidden flag; credits taken and given back; seats; the meeting type and calendar checks; what Billing reads | `supabase/migrations/120_plans.sql`, `121_seat_words.sql`, `122_seat_pricing.sql` (6 calendars per seat on every paid plan) |
| Stripe: products made once, one seat line priced from the plan list with the seats as its quantity, monthly or yearly; plan changes in place, prorated; the seat count kept in step after each meeting type save and before each renewal (`invoice.upcoming`). A subscription from before per-seat pricing (a plan line with 1 seat in it and an extra-seat line) still reads with every seat, and the next seat sync folds the two into one seat line in a single prorated update | `src/lib/billing.ts`, `src/lib/billingHosts.ts`, `src/app/api/billing/` |
| Settings › Billing: the plan, this month's submissions, AI credits and seats, the four plans monthly or yearly | `src/components/app/views/BillingSettings.tsx` |
| Tia steps charged before the model runs; a cached step, unasked work and a failed call cost nothing | `src/lib/ai/cache.ts` |
| Limits enforced: meeting kinds by plan, Free's 1 meeting type, 1 seat, paid meetings on Starter and up, calendars per seat, branded booking pages on Starter and up, the link domain on Business, Left early (partial fills) on Business, hidden submissions past Free's cap | `src/app/api/meetings/_lib/seat.ts`, `src/lib/meetings/providers/connect.ts`, `src/app/api/link-domain/route.ts`, `src/components/app/forms/Submissions.tsx` |
| Tests: the plan list, seat prices, the checkout line, subscriptions old and new, seat sync, folding an old extra-seat line in one update (and a retry changing nothing), plan changes, the webhook, AI credits, hidden fills; on Postgres, two fills racing for Free's last slot, twenty at once, repeats and spam, two Tia steps racing for the last credits, the meeting type and calendar checks (the 7th calendar on a paid plan refused) | `tests/billing.test.ts`, `tests/planCredits.test.ts`, `tests/pg/plans.pg.ts` |

Not held back yet, so open on every plan for now: polls, one-off and single-use links, signatures and payments on
forms, routing by answer, the small badge on Starter and the badge on Free forms, Salesforce on Business, and billing
for extra submissions. Each is listed in `FEATURES` in `src/lib/plans.ts` and needs its check where it's saved.

### Running cost of this build

Nothing new on the bill beyond Part 7. Stripe products, prices and webhooks cost nothing; the extra calls are a few
Stripe API requests a day per paying team (free), and folding an old subscription into one seat line is one more call,
once. The usage counters are one small row a workspace a month.

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
