# Moving Claritia's email from Resend to Amazon SES

Status: plan, 12 November 2026.

Done so far: AWS account, SES in us-east-2 on the Essentials plan, `tryclaritia.com` verified (three DKIM records and
MAIL FROM `mail.tryclaritia.com`, added through the Hostinger DNS API), `vincent@perceptric.com` verified, production
access requested as Marketing.

## 1. Why, in numbers

| Sends a month | Resend Scale | SES Essentials ($0.16 per 1,000) | Saved |
|---|---|---|---|
| 500K (Beta, 50 teams at about 10K each) | $350 | $80 | $270 a month |
| 5M (Growth, 500 teams) | $2,300 | $800 | $1,500 a month |
| 25M (Growth, every team at a 50K allowance) | about $11,500 | about $3,800 | about $7,700 a month |

Prices read on resend.com/pricing and the SES pricing page and console on 12 November 2026. SES à la carte at $0.10
per 1,000 isn't offered in the console wizard; Essentials is the plan in use.

## 2. Everything that uses Resend today

| # | What | Where | SES replacement |
|---|---|---|---|
| 1 | Workflow and campaign sends, one batch call a second per workspace, keyed so a repeat can't send twice | `worker-intel/jobs/email.ts`, `src/lib/email/resend.ts` | SES v2 `SendEmail`, one call per email under a rate bucket |
| 2 | Customer sending domains: make, verify, check records, delete | `domain_check` and `domain_remove` jobs, `src/lib/email/domains.ts` | `CreateEmailIdentity`, `PutEmailIdentityMailFromAttributes`, `GetEmailIdentity`, `DeleteEmailIdentity` |
| 3 | Delivery, bounce and complaint events, signed webhook | `src/app/api/email/events/route.ts`, `src/lib/email/webhook.ts` | Configuration set → SNS → `/api/email/ses`, checked by `src/lib/email/sns.ts` |
| 4 | Meeting and routing email with calendar invites, over SMTP | `src/lib/email/smtp.ts`, `worker-intel/jobs/meetings.ts` | SES SMTP, `email-smtp.us-east-2.amazonaws.com:465` |
| 5 | Alerts (failures, digests) straight to Resend's API | `src/lib/alertSender.ts` | The shared sender |
| 6 | Email codes on forms | `src/lib/forms/codes.ts` | The shared sender |
| 7 | Teammate alerts on forms and routing, one batch call | `worker-intel/jobs/forms.ts`, `worker-intel/jobs/router.ts` | The shared sender, one call each under the bucket |
| 8 | Test inboxes receive mail (`inbox.tryclaritia.com`), fetched from Resend's receiving API | `src/lib/inbound.ts` | SES receiving rules → S3 → the app reads the message (region check, below) |

Claritia ran on SES before Resend. Commit `ef0a641` removed `src/lib/email/sigv4.ts` (AWS signing, tested against
AWS's own examples), `src/lib/email/ses.ts` (identities and sending) and `src/lib/email/sns.ts` (SNS checks). They come
back, fitted to today's `provider.ts`. `sending_domains` still has `mail_from` and `dkim_tokens`.

## 3. How it fits together

- **One sender shape**, `Sender` in `src/lib/email/provider.ts`: `send(out, key)`, `sendMany(items)`, and the domain
  calls. `resendClient` and `sesClient` both fit it.
- **Each domain names its provider**: `sending_domains.provider` (`resend` or `ses`, migration 144), plus
  `EMAIL_SES_DOMAINS` on the server for Claritia's own domains (`tryclaritia.com`, then `all`). `senderFor(domain)`
  picks the sender; places 5 to 7 above use it too, so nothing calls a provider's address directly anymore.
- **No double sends.** SES has no idempotency key. The send row is claimed before the call (as today); an answer that
  never came back (timeout, cut connection, 5xx) is `unknown` and never sent again; a throttle is `later` and uses no
  try; a refused address fails that one email only.
- **Speed.** A token bucket at the account's `MaxSendRate` (read from `GetAccount` every hour), shared across the
  worker, plus each workspace's own rate as today.
- **Events.** `/api/email/ses` confirms the SNS subscription once, for our topic only, checks each message's signature
  and certificate host, and passes it to the same `email_event_apply` Resend uses. The SNS `MessageId` is the event
  id, so a repeat counts once. A hard bounce or a complaint suppresses the address for every provider.
- **Customer MAIL FROM** is `bounce.<domain>`, since `mail.<domain>` is often a customer's own mail server. Claritia's
  own stays `mail.tryclaritia.com`. Records live on a subdomain, so a customer never edits their root SPF.
- **Both sets of records can live side by side.** Resend's (`resend._domainkey`, `send.`) and SES's (three
  `._domainkey` tokens, `bounce.`) don't clash, so a domain can switch back in one update until Resend is turned off.

## 4. The steps

### Step 0. AWS ready (you, in the console, about an hour)

1. Production access approved. If AWS asks questions, answer with the use case in `docs/sending-setup.md`.
2. Raise limits when approved: ask for 200,000 a day and 50 a second (Service Quotas › SES).
3. SNS topic `claritia-ses-events`, with a delivery policy that retries for 24 hours.
4. Configuration set `claritia`: event destination SNS for Bounce, Complaint, Delivery, Reject, DeliveryDelay and
   RenderingFailure. Engagement tracking off (Claritia tracks clicks itself).
5. Account settings: account-level suppression list on for bounces and complaints; Auto Validation off.
6. IAM user `claritia-ses` with the policy in section 7, one access key.
7. SES › SMTP settings: SMTP credentials (for Step 5).
8. CloudWatch alarms: `Reputation.BounceRate` at 4% and `Reputation.ComplaintRate` at 0.08%, to SNS and the team's
   email. AWS reviews an account at 5% and 0.1% and can pause it at 10% and 0.5% (check).
9. Budgets: a monthly alert at $50.
10. Keys on the VPS yourself (Hostinger › Docker Manager › claritia › Environment), never in chat:
    `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `SES_REGION=us-east-2`, `SES_CONFIGURATION_SET=claritia`,
    `SES_SNS_TOPIC_ARN`, later `SES_SMTP_USER`, `SES_SMTP_PASS`.

### Step 1. The code, switched off (one release)

Restore and fit the three files, `Sender` and `senderFor`, the bucket, `/api/email/ses`, places 5 to 7 on the shared
sender, migration 144, the tests in section 6. `EMAIL_SES_DOMAINS` empty: nothing changes for anyone.
Done when: every test passes, a test send from the app reaches a verified inbox through SES in sandbox.

### Step 2. Claritia's own mail on SES (one week of watching)

`EMAIL_SES_DOMAINS=tryclaritia.com`: alerts, form codes, teammate alerts and Claritia's own workflows go through
SES.
Done when: a week with bounces under 2%, complaints under 0.05%, no `unknown` sends, events arriving for every
delivery.
Back out: empty the variable.

### Step 3. New customer domains on SES (one release)

`EMAIL_SES_DOMAINS=all` for new domains: Settings › Sending makes them on SES and shows five records (three DKIM
CNAMEs, MX and TXT on `bounce.<domain>`), checked by `checkRecords` every few minutes until verified.

### Step 4. Moving existing domains (two to four weeks)

1. Settings › Sending shows "Move to the new sending" with the five SES records beside the Resend ones, and the owner
   gets one email with the same records.
2. The domain keeps sending on Resend until SES verifies all five, then `provider` flips in one update.
3. Reminders at 7 and 14 days; a domain still on Resend after 30 days keeps working on Resend.
4. Bounces and unsubscribes already in Claritia carry over, since suppression is ours, not the provider's. Resend's own
   suppression list is exported once and added to ours.

### Step 5. Meeting invites over SES SMTP (small)

`smtpFromEnv` picks the relay by the sending domain's provider. Invites keep their calendar part; meeting bounces keep
matching by address when the SMTP answer has no id (067).

### Step 6. Test inboxes (only if Funnel QA still uses them)

SES receiving rule on `inbox.tryclaritia.com` that stores each message in S3; `src/lib/inbound.ts` reads it from S3
instead of Resend. SES receives mail only in some regions; us-east-2 support is "check". If it isn't there, the rule
runs in us-east-1 and only the MX record changes.

### Step 7. Resend off

When every domain is on SES and a week has passed with Resend unused: remove `RESEND_API_KEY`, the webhook and
Resend's DNS records (`resend._domainkey`, `send`, `rsend`), then cancel the plan.

## 5. Watching it

- Settings › Sending shows each domain's provider and status.
- An internal page lists each workspace's bounce and complaint rate over 7 days; a workspace over 5% bounces or 0.1%
  complaints is paused and its owner told, so one bad list never puts the account at risk.
- Virtual Deliverability Manager (on, included in Essentials) for inbox placement by mailbox provider.
- The CloudWatch alarms from Step 0.

## 6. Reliability tests (CLAUDE.md: the send pipeline)

- AWS signing matches AWS's test examples (restored).
- A timeout or 5xx after the request left is `unknown` and never sent again; a throttle is `later` with no try used; a
  burst stays under the send rate.
- SNS: a forged signature, a certificate from another host, another topic, an old message and a repeated one are each
  refused or counted once; the subscription confirms only for our topic.
- A hard bounce or complaint from SES suppresses the address on Resend too, and the other way round.
- `senderFor` follows the row; a domain flips only after SES verifies all five records; a domain halfway through a move
  keeps sending on Resend; switching back is one update.
- Places 5 to 7 send through the shared sender on both providers.
- Meeting invites keep their calendar part over SES SMTP.

## 7. IAM policy for `claritia-ses`

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": ["ses:SendEmail", "ses:SendRawEmail"], "Resource": "arn:aws:ses:us-east-2:<account-id>:*" },
    { "Effect": "Allow", "Action": ["ses:CreateEmailIdentity", "ses:GetEmailIdentity", "ses:DeleteEmailIdentity", "ses:PutEmailIdentityMailFromAttributes", "ses:ListEmailIdentities", "ses:GetAccount"], "Resource": "*" }
  ]
}
```

Step 6 adds `s3:GetObject` on the inbox bucket only.

## 8. Risks

| Risk | What we do |
|---|---|
| AWS turns down production access | Stay on Resend; nothing in Steps 1 to 7 is switched on |
| One customer's list hurts the whole account | The pause in section 5; later, customer sending in its own AWS account under AWS Organizations |
| SNS can't reach us for a while | The 24-hour retry policy; the app is behind Traefik with automatic restarts |
| A customer never adds the records | Their domain keeps working on Resend until Step 7, and Step 7 waits for them |
| SES's limits are lower than Resend's at first | The bucket keeps us under them; ask AWS to raise them as volume grows |

## 9. Running cost

| Item | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| SES Essentials sends, $0.16 per 1,000 | about $80 | about $800 |
| SNS to HTTPS, about one notice per email | under $1 (check) | about $3 (check) |
| S3 for test inboxes (Step 6) | under $1 (check) | about $1 (check) |
| CloudWatch alarms | about $0.20 (check) | about $0.20 (check) |
| Resend while domains move | $90 to $350, then $0 | $0 once moved |
| Claude tokens | none | none |
| **Total after the move** | **about $82** | **about $805** |

## 10. Order and timing

| Step | Who | Time |
|---|---|---|
| 0. AWS ready | You (console) | About an hour, plus AWS's answer (usually a day) |
| 1. The code, switched off | Claude | One release |
| 2. Claritia's own mail on SES | Switch | One week of watching |
| 3. New domains on SES | Claude | One release |
| 4. Moving existing domains | Customers | Two to four weeks |
| 5. Invites over SES SMTP | Claude | Small |
| 6. Test inboxes | Claude | Small, only if still used |
| 7. Resend off | You and Claude | One day |
