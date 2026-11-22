# Sending setup (Amazon SES)

How to turn on email sending (`docs/conversion-weeks.md` week 9). The code is in `src/lib/email/`, the jobs in `worker-intel/jobs/email.ts`, and the tables in `supabase/migrations/039_email.sql`.

## How it fits together

1. A workspace owner adds a sending domain in **Settings › Sending**. The `domain_check` job makes the domain an SES identity, sets its MAIL FROM subdomain, and makes the workspace's configuration set (`clr-<workspace id>`) with an SNS event destination.
2. The screen shows the DNS records. The job checks them every 5 minutes for 3 days, then daily once verified. A domain sends only when SES sees DKIM and the DKIM, SPF (MX and TXT) and DMARC records all pass.
3. Each email is a `send` job. The guard (`send_claim`) checks pause, domain, suppression, consent, topic, footer address and frequency cap at send time, and waits for quiet hours and rate limits.
4. SES publishes events to SNS, SNS posts them to `https://app.tryclaritia.com/api/ses`, and the `ses_event` job applies them: hard bounces and complaints suppress the address, and a complaint rate of 0.2% over 7 days (with at least 3 complaints) pauses the workspace.
5. Every email has `List-Unsubscribe` and `List-Unsubscribe-Post` headers (RFC 8058) and a footer with the postal address and an unsubscribe link. Both go to `/u/<token>`.

## AWS steps (once)

All in the SES region. The Claritia account uses **us-east-2 (Ohio)**, where `tryclaritia.com` is verified and production access is on (50,000 a day, 14 a second).

1. **SNS topic.** Create a standard topic named `claritia-ses`. Add this to its access policy so SES can publish to it:

   ```json
   {
     "Sid": "ses-publish",
     "Effect": "Allow",
     "Principal": { "Service": "ses.amazonaws.com" },
     "Action": "SNS:Publish",
     "Resource": "arn:aws:sns:us-east-2:<account id>:claritia-ses",
     "Condition": { "StringEquals": { "AWS:SourceAccount": "<account id>" } }
   }
   ```

2. **Subscription.** Add an HTTPS subscription to the topic with the endpoint `https://app.tryclaritia.com/api/ses`. Leave raw message delivery off. Set `SES_SNS_TOPIC_ARN` on the web service first: the app checks the signature and topic, then confirms the subscription by itself.

3. **IAM user** for claritia-intel, with this policy and an access key:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Action": [
         "ses:SendEmail", "ses:SendRawEmail",
         "ses:CreateEmailIdentity", "ses:GetEmailIdentity", "ses:DeleteEmailIdentity",
         "ses:PutEmailIdentityMailFromAttributes",
         "ses:CreateConfigurationSet", "ses:CreateConfigurationSetEventDestination"
       ],
       "Resource": "*"
     }]
   }
   ```

## Settings

| Setting | Where | Value |
|---|---|---|
| `AWS_SES_REGION` | claritia-intel | `us-east-2` |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | claritia-intel | The IAM user's key |
| `SES_SNS_TOPIC_ARN` | claritia-intel and the web service | `arn:aws:sns:us-east-2:<account id>:claritia-ses` |
| `SECRETS_KEY` | both (already set) | Signs unsubscribe and click links, so it must match on both |
| `APP_URL` | both, only if the app isn't at `https://app.tryclaritia.com` | The base for unsubscribe and click links |

```bash
fly secrets set --app claritia-intel AWS_SES_REGION=us-east-2 AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... SES_SNS_TOPIC_ARN=...
```

## First send

1. Settings › Sending › add a domain. Use a subdomain such as `mail.tryclaritia.com`, so marketing mail has its own reputation. Adding a domain that's already an SES identity (like `tryclaritia.com`) reuses it.
2. Add the DNS records shown. Wait for **Verified**.
3. Fill in **Footer address** under Rules. Marketing email is blocked without it (CAN-SPAM).
4. Send a test to yourself from the Test send box.

## Running cost

Assumes 50,000 emails per team per month and about 3 SES events per email (send, delivery, and a bounce, complaint or delay for some).

| Item | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| SES, $0.10 per 1,000 emails (check) | $250 | $2,500 |
| SNS HTTPS notifications, $0.60 per million after the first 100,000 (check) | $4 | $45 |
| Supabase storage for `email_messages` (about 0.5 KB a row with indexes, $0.125 per GB, check) | $0.15 a month more each month | $1.50 a month more each month |
| Servers | $0 (runs on claritia-intel and the web service) | $0 |
| Claude tokens | $0 | $0 |
| **Total added** | **about $255** | **about $2,550** |

Dedicated IPs are not part of this build.
