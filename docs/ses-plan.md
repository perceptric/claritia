# Amazon SES next to Resend, then in its place

Status: plan, 12 November 2026. SES account ready: region us-east-2, `tryclaritia.com` verified (DKIM, MAIL FROM
`mail.tryclaritia.com`), production access requested (Marketing).

## Why

| | Beta (about 500K sends a month) | Growth (about 5M sends a month) |
|---|---|---|
| Resend Scale (today) | $350 | $2,300 |
| SES Essentials, $0.16 per 1,000 | $80 | $800 |

## What we start from

Claritia sent on SES before it moved to Resend (commit `ef0a641`, migration `067_resend.sql`). That commit removed
three files that come back, adapted:

- `src/lib/email/sigv4.ts`: AWS signing for the SES v2 API over plain `fetch`, checked against AWS's own test suite.
- `src/lib/email/ses.ts`: domain identities (DKIM tokens, MAIL FROM) and sending.
- `src/lib/email/sns.ts`: SES events through SNS, each message checked against Amazon's signing certificate and our
  topic.

`sending_domains` still has `mail_from` and `dkim_tokens` from those days. Today's send path (`provider.ts`:
`Outgoing`, `SendError`, `outcomeOf`; `resend.ts`: `send`, `batch`, domains) is the shape SES plugs into.

## Step 1. SES for Claritia's own domain

1. **One sender shape.** `Sender` in `src/lib/email/provider.ts`: `send(out, key)`, `batch(items)`, and the domain
   calls. `resendClient` and a restored `sesClient` both fit it. `senderFor(domain)` picks one.
2. **Which domains go to SES:** `EMAIL_SES_DOMAINS` on the server (`tryclaritia.com`, later `all`). Off by default.
3. **No double sends.** SES has no idempotency key, so the send row is claimed before the call (as today), and an
   answer that never came (timeout, cut connection, 5xx) is `unknown`: never sent again, the row says so. A throttle
   (`Throttling`, `TooManyRequests`) is `later` and costs no try. A bad address is `failed` for that one email.
4. **Speed.** A token bucket at the account's send rate (`GetAccount` → `MaxSendRate`, read every hour), shared by the
   worker, so SES never throttles us on purpose.
5. **Events in.** `/api/email/ses` takes SNS: confirms the subscription once for our topic only, checks every
   signature and certificate host, and passes bounces, complaints, deliveries and rejects to the same
   `email_event_apply` Resend uses (SNS `MessageId` as the event id, so a repeat counts once). A hard bounce or a
   complaint suppresses the address for every sender.
6. **Alerts and form codes** (`alertSender.ts`, `forms/codes.ts`) follow `senderFor`.

AWS setup (done in the console once, steps in `docs/sending-setup.md`): an SNS topic `claritia-ses-events`, a
configuration set `claritia` that sends bounce, complaint, delivery, reject and delivery-delay events to it, an HTTPS
subscription to `https://app.tryclaritia.com/api/email/ses`, and an IAM user `claritia-ses` with the policy below. Its
keys go in the VPS environment as `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `SES_REGION=us-east-2`,
`SES_CONFIGURATION_SET=claritia`, `SES_SNS_TOPIC_ARN`.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": ["ses:SendEmail", "ses:SendRawEmail"], "Resource": "arn:aws:ses:us-east-2:<account-id>:*" },
    { "Effect": "Allow", "Action": ["ses:CreateEmailIdentity", "ses:GetEmailIdentity", "ses:DeleteEmailIdentity", "ses:PutEmailIdentityMailFromAttributes", "ses:ListEmailIdentities", "ses:GetAccount"], "Resource": "*" }
  ]
}
```

## Step 2. Customer domains on SES

1. `sending_domains.provider` (`resend` or `ses`, migration 144), `resend` for every row today.
2. A new domain in Settings › Sending is made on SES (`CreateEmailIdentity`, then `mail.<domain>` as MAIL FROM) once
   `EMAIL_SES_DOMAINS` is `all`. Its records: three DKIM CNAMEs and the MAIL FROM MX and TXT, checked by the same
   `checkRecords`.
3. **Moving a domain:** Settings › Sending shows "Move to the new sending" with the SES records beside the Resend ones.
   The domain keeps sending on Resend until SES says verified, then `provider` flips in one update. Nothing is lost
   or sent twice between the two.
4. A domain that never moves keeps Resend.

## Step 3. Meeting invites over SES SMTP

1. SES SMTP credentials (SES › SMTP settings) as `SES_SMTP_USER` and `SES_SMTP_PASS`; host
   `email-smtp.us-east-2.amazonaws.com`, port 465.
2. `smtpFromEnv` picks the relay by the sending domain's provider, so a moved domain's invites go through SES with
   the same calendar part.
3. When every domain is on SES, Resend's key and webhook are removed and the plan is cancelled.

## Reliability tests (CLAUDE.md: the send pipeline)

- AWS signing against AWS's test vectors (restored).
- A timeout or 5xx after the request left is `unknown` and never sent again; a throttle is `later` with no try used;
  the bucket keeps a burst under the send rate.
- SNS: a forged signature, a certificate from another host, another topic, an old message and a repeat are each
  refused or counted once; a subscription confirms only for our topic.
- A hard bounce or complaint on SES suppresses the address on Resend too.
- `senderFor` sends a domain on the provider its row names; a domain flips only after SES verifies it; a domain halfway
  through a move keeps sending on Resend.
- Meeting invites keep their calendar part over SES SMTP.

## Running cost

| Item | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| SES Essentials sends, $0.16 per 1,000 | about $80 | about $800 |
| SNS notifications to HTTPS, about one per email | about $0.30 (check) | about $3 (check) |
| Resend while domains move | $90 to $350, then $0 | $0 once moved |
| Claude tokens | none | none |

After the move, sending costs about $270 less a month at Beta and about $1,500 less at Growth than staying on
Resend.

## Build order

1. Step 1 (one release): restore and adapt the three files, `senderFor`, the bucket, `/api/email/ses`, the tests.
   Turn on for `tryclaritia.com` once AWS approves production access.
2. Step 2 (one release): migration 144, new domains on SES, Move in Settings › Sending.
3. Step 3 (small): SES SMTP for invites, then Resend off.
