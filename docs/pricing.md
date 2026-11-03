# Pricing

Status: proposed, October 2026. This replaces the draft in `docs/marketing-platform.md` Part 10. The plans in
`src/lib/plans.ts` are still the testing product's and change when this is approved.

Competitor prices come from third-party write-ups found by search in October 2026. The vendors' own pages couldn't be
loaded from here, so every competitor price is marked "check". Sources are at the end.

---

## Part 1. The market

| Product | What it is | Price (check) | Billing |
|---|---|---|---|
| Chili Piper | Instant booking on forms, routing, handoff | About $30 a user a month per product, plus a platform fee of $150 to $1,000 a month by lead volume; newer bundles start near $1,250 a month | Annual |
| Default | Forms, enrichment, routing, scheduling, workflows | Growth about $1,250 a month ($15,000 a year), plus $45 a month for each person who takes meetings | Annual |
| RevenueHero | Instant booking and routing | $79 a month platform fee plus $25 a user (annual), or $99 plus $35 a user (monthly) | Monthly or annual |
| Calendly | Scheduling | Standard $10, Teams $16 a seat a month (annual); Enterprise from about $15,000 a year | Monthly or annual |
| Cal.com | Scheduling | Teams $12, Organizations $28 a user a month (annual) | Monthly or annual |
| HubSpot Marketing Hub Pro | Marketing suite | About $890 a month with 3 seats and 2,000 contacts, plus about $3,000 onboarding | Annual |
| Conversion | AI marketing automation | Sales quote; one review says from about $900 a month | Annual |

What the buyers dislike, from the same write-ups: annual contracts, platform fees on top of seats, paying for
people who only edit, and onboarding fees.

## Part 2. How Claritia prices

1. **Monthly billing.** Annual is optional and gives 2 months free.
2. **No platform fee and no onboarding fee.** One plan price.
3. **Only people who take meetings count as hosts.** Everyone else who edits is free.
4. **Hosts are included.** Each plan has hosts in its price, and more hosts cost less than a competitor's seat.
5. **A free plan and a 14-day Growth trial.** Default and Chili Piper have neither (check).

## Part 3. Plans

| | Free | Starter | Growth | Scale |
|---|---|---|---|---|
| Price a month (monthly) | $0 | $79 | $299 | $799 |
| Price a month (annual) | $0 | $66 | $249 | $666 |
| Hosts included | 1 | 3 | 10 | 25 |
| Each extra host | — | $15 | $20 | $25 |
| Editors | Unlimited | Unlimited | Unlimited | Unlimited |
| Contacts | 500 | 2,500 | 10,000 | 50,000 |
| Emails a month | 500 | 5,000 | 25,000 | 100,000 |
| Enrichment credits a month | — | 250 | 2,000 | 5,000 |
| Forms and booking pages | 1 form, 1 meeting type, Claritia badge | Unlimited | Unlimited | Unlimited |
| Meeting types | One person | Round robin, everyone, group, polls, one-off links | Owner first, two teams, paid types | Everything |
| Instant booking in forms | — | Yes | Yes | Yes |
| Book later and not-booked | — | Yes | Yes, with Slack | Yes, with Slack |
| Routing | — | Round robin | Rules, territories, owner lookup | Everything, with queues |
| CRM sync | — | HubSpot | HubSpot, Salesforce, Omniscient | All, two-way |
| AI qualify and meeting briefs | — | — | Yes | Yes |
| Website Intelligence | — | — | Company reveal | Full, with account alerts |
| Journeys and AI email writing | — | — | 3 journeys | Unlimited, with agents |
| SSO, audit log, priority support | — | — | — | Yes |

**Overages:** $10 per 1,000 contacts, $1 per 1,000 emails, $50 per 1,000 enrichment credits.

**Suite bundle:** 20% off when a team also runs Arrowsterr or Omniscient (`docs/marketing-platform.md`).

## Part 4. Side by side (check)

The monthly price for the same team, at each competitor's lowest plan that books from a form.

| Hosts | Claritia | RevenueHero | Chili Piper | Default | Calendly Teams |
|---|---|---|---|---|---|
| 3 | **$79** (Starter) | $154 | About $240 | About $1,385 | $48 |
| 10 | **$299** (Growth) | $329 | About $450 to $700 | About $1,700 | $160 |
| 25 | **$599** (Growth + 15 hosts) | $704 | About $900 to $1,150 | About $2,375 | $400 |

- Claritia is below every instant-booking tool at each size, billed monthly, and also includes the CRM, email and
  forms they don't.
- Calendly and Cal.com cost less a seat, but they don't book inside the team's own forms, route by rules, or keep
  the lead in a CRM. Starter is priced against them for small teams who want that.
- Against HubSpot Marketing Pro (about $890 plus $3,000 onboarding), Growth is about a third of the price with no
  onboarding fee.

## Part 5. Margin

What one team costs Claritia on each plan, used to the limit. Costs come from `docs/marketing-platform.md` Part 11,
`docs/inbound.md` Part 10 and `docs/meetings-setup.md`.

| Cost a team a month | Free | Starter | Growth | Scale |
|---|---|---|---|---|
| Servers and database share | $0.50 | $3 | $5 | $8 |
| Email on SES ($0.10 per 1,000, check) | $0.05 | $0.50 | $2.50 | $10 |
| Claude tokens (qualify, briefs, journeys, agents) | $0 | $0 | $9 | $60 |
| Enrichment (about $0.03 a match, check) | $0 | $7.50 | $60 | $150 |
| Website Intelligence (Coresignal and IPinfo share, check) | $0 | $0 | $35 | $35 |
| **Cost** | **about $0.55** | **about $11** | **about $112** | **about $263** |
| **Gross margin at the monthly price** | — | **86%** | **63%** | **67%** |

Margins rise at Growth stage, when the Website Intelligence share falls to about $12 a team.

## Part 6. Running cost of this change

Pricing adds two lines to the monthly bill: Stripe's fees on what customers pay, and the free plan.

Mix assumed: Beta is 10 Free, 25 Starter, 12 Growth and 3 Scale teams (about $8,000 a month). Growth is 100 Free,
220 Starter, 150 Growth and 30 Scale teams (about $86,000 a month).

| Item | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Stripe Billing, 0.7% of billing (check) | $56 | $600 |
| Card fees, 2.9% plus $0.30 a charge (check) | $243 | $2,620 |
| Free plan teams (about $0.55 each) | $6 | $55 |
| Claude tokens | $0 | $0 |
| **Added per month** | **about $305** | **about $3,300** |

## Part 7. To build when approved

1. `src/lib/plans.ts`: Free, Starter, Growth and Scale with host counts, limits and extra-host prices.
2. `plan_limits` in a new migration: hosts, contacts, emails, enrichment credits; a host is anyone in a meeting type.
3. Stripe: one price per plan (monthly and annual) plus a per-host price, with the quantity kept in step with hosts.
4. Settings › Billing: plan, hosts used, usage against limits, and change plan.
5. The pricing page on the website (`claritia-site`).

---

## Sources

- Chili Piper: [Docket pricing](https://www.docket.io/resources/research/chilipiper-pricing), [Docket review](https://www.docket.io/resources/research/chilipiper-review), [Knock](https://www.knock-ai.com/blog/chili-piper-pricing), [MarketBetter](https://marketbetter.ai/blog/chili-piper-pricing-breakdown-2026/), [Software Finder](https://softwarefinder.com/sales-tools/chili-piper)
- Default: [Knock](https://www.knock-ai.com/blog/default-pricing), [SyncGTM](https://www.syncgtm.com/blog/default-review), [Phi Consulting](https://phi.consulting/tools/default), [ZoomInfo](https://pipeline.zoominfo.com/sales/default-com-pricing)
- RevenueHero: [Rework](https://resources.rework.com/tools/lead-management/chili-piper-vs-revenuehero), [MarketBetter](https://marketbetter.ai/blog/revenuehero-pricing-breakdown-2026/), [Vendr](https://vendr.com/marketplace/revenuehero)
- Calendly: [Knock](https://www.knock-ai.com/blog/calendly-pricing), [SchedulingKit](https://schedulingkit.com/pricing-guides/calendly-pricing), [Automation Atlas](https://automationatlas.io/tools/calendly/)
- Cal.com: [Koalendar](https://koalendar.com/blog/cal-com-pricing), [Knock](https://www.knock-ai.com/blog/cal-com-pricing)
- HubSpot: [SendX](https://www.sendx.io/blog/hubspot-pricing), [Chatarmin](https://chatarmin.com/en/blog/hubspot-pricing), [HubSpot DE blog](https://blog.hubspot.de/marketing/hubspot-marketing-hub-pricing)
- Conversion: [MarTech Radar](https://martechradar.ai/tools/conversion/), [AI-CMO](https://ai-cmo.net/tools/convert)
