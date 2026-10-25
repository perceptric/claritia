# Sending setup: what to set before email goes out

All email goes through Resend (docs/enrich-workflows-reports.md Part 0):
- Campaign and workflow email goes through its API.
- Meeting and routing email goes through its SMTP relay, because calendar invites need their own MIME part.
- Resend's signed webhook reports deliveries, bounces and complaints.

Everything here is done once by us. Customers only add their domain in Settings › Sending and add the DNS records it
shows.

The app is assumed to live at `https://app.tryclaritia.com`. If it doesn't, set `APP_URL` on `claritia-web` and
`claritia-intel`, and use that address below.

## 1. Database

Run `supabase/migrations/039_email.sql`, then `067_resend.sql` (Supabase → SQL editor). `minute_tick` picks up sends
and domain checks on its own.

## 2. Resend account

1. resend.com → the Claritia team → **Billing**.
   - Pick a plan that covers the month's email: Scale at Beta (check).
   - Each customer's sending domain counts toward the plan's domain limit, so at Growth ask for one that holds 500 or
     more (check).
2. Ask Resend support for a higher request rate if the account is at the default 2 requests a second (check). Each
   request carries up to 100 emails, so 2 a second is 200 emails a second.
3. **API Keys** → Create API key:
   - name `claritia`
   - permission **Full access** (the worker creates, checks and deletes domains)
   - copy the key straight into step 5
4. **Domains** → add `mail.tryclaritia.com` in us-east-1 and add its records at our DNS host. Meeting emails and
   alerts go from it when a workspace has no domain of its own.

## 3. Webhook

1. Resend → **Webhooks** → Add endpoint.
   - URL: `https://app.tryclaritia.com/api/email/events`
   - Events: `email.delivered`, `email.bounced`, `email.complained`, `email.delivery_delayed`, `email.failed`
2. Open the endpoint and copy its **Signing secret** (starts with `whsec_`) into step 5.

The route refuses any delivery whose Svix signature doesn't match or that is older than 5 minutes. Resend retries
anything that isn't answered with 2xx, and each event counts once (by its `svix-id`).

## 4. Turn off Resend's own tracking

Resend → Domains → each domain → Configuration:
- Click tracking: off. Our `/c/` links count clicks and filter out mail scanners.
- Open tracking: off. Opens aren't counted.

New domains start with both off (check).

## 5. Secrets

```
fly secrets set --app claritia-intel \
  RESEND_API_KEY='re_…' \
  RESEND_REGION='us-east-1' \
  MEETINGS_FROM='meetings@mail.tryclaritia.com'

fly secrets set --app claritia-web \
  RESEND_API_KEY='re_…' \
  RESEND_WEBHOOK_SECRET='whsec_…' \
  ALERTS_FROM='Claritia <alerts@mail.tryclaritia.com>'
```

`SECRETS_KEY` must already be on both apps with the same value (docs/sources-setup.md step 2). It also signs unsubscribe
and click links, so a link made by the worker opens on the web app.

Once this ships, remove the old Amazon settings:

```
fly secrets unset --app claritia-intel AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN SES_REGION SES_CONFIGURATION_SET
fly secrets unset --app claritia-web SES_SNS_TOPIC_ARN
```

| Secret | Where | Without it |
|---|---|---|
| `RESEND_API_KEY` | claritia-intel | Domains show "Resend isn't set up on the worker", and nothing sends |
| `RESEND_API_KEY` | claritia-web | Alerts and the test inbox can't send |
| `RESEND_REGION` | claritia-intel | New domains send from us-east-1 |
| `RESEND_WEBHOOK_SECRET` | claritia-web | `/api/email/events` refuses every event, so bounces and complaints don't suppress |
| `MEETINGS_FROM` | claritia-intel | Meeting emails from workspaces with no domain go from meetings@tryclaritia.com |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | claritia-intel | Optional; default to smtp.resend.com, 465, `resend` and the API key |
| `SECRETS_KEY` | both, same value | Unsubscribe and click links don't open |

## 6. Check it works

1. `fly logs --app claritia-intel` shows `intel started` with `"resend": true`, and the kinds include `send`,
   `domain_check` and `domain_remove`.
2. Settings › Sending → add a domain you control (for example `news.tryclaritia.com`). Within a minute the records
   table fills in with Resend's DKIM TXT, the MX and SPF TXT on `send.`, and DMARC.
3. Add the records at your DNS host. Each turns from Waiting to Verified as Resend sees it (minutes to a few hours).
   Wrong means the record holds a different value, shown under it.
4. Fill in the Sender form: From address on the verified domain, and a physical address. Save.
5. Recent sends → **Send test**. The email reaches your sign-in address within a minute. The row goes Sent, then
   Delivered once Resend reports it.
6. In Gmail, the email shows an "Unsubscribe" button next to the sender. Pressing it marks the row's unsubscribe
   (tests never suppress your own address).
7. Send a test to `bounced@resend.dev` from a contact. The row goes Bounced and the address is suppressed.
8. Book a test meeting. The confirmation arrives with the invite, and "Add to calendar" works in Gmail and Outlook.

## What's built and what's left

| Built | Where |
|---|---|
| Domains, settings, emails, one row per message, events, the guard at send time | `039_email.sql`, `067_resend.sql` |
| Resend client: single sends and batches of 100, each keyed; domains | `src/lib/email/resend.ts` |
| The answer rules shared by every sender | `src/lib/email/provider.ts` |
| SMTP relay for raw mail with calendar invites | `src/lib/email/smtp.ts`, `smtpMailer` in `worker-intel/jobs/meetings.ts` |
| DNS records and checks | `src/lib/email/domains.ts` |
| Webhook signature check and event parsing | `src/lib/email/webhook.ts`, `src/app/api/email/events/route.ts` |
| Click and unsubscribe tokens, link rewriting, scanner filter | `src/lib/email/track.ts` |
| Footer, preheader, one-click unsubscribe headers (RFC 8058) | `src/lib/email/render.ts` |
| Unsubscribe page and one-click endpoint; click redirect | `src/app/u/[token]/route.ts`, `src/app/c/[token]/route.ts` |
| `send`, `domain_check`, `domain_remove` jobs | `worker-intel/jobs/email.ts` |
| Settings › Sending | `src/components/app/views/SendingSettings.tsx` |
| Tests | `tests/email.test.ts`, `tests/pg/email.pg.ts`, `tests/pg/meetingLifecycle.pg.ts`, sending block in `tests/db/leaks.sql` |

**Flaky and hostile cases tested:**
- **Rate limits:** a rate limit on a batch sends nothing, costs no try, and waits as long as Resend said.
- **Refused batches:** a batch Resend refuses for one bad address is sent one by one, so only that one fails.
- **Lost answers:**
  - a single send that timed out after Resend took it goes again with the same key and makes one email
  - a batch with no clear answer is never sent again
  - a worker killed mid-send leaves the message `unknown` with no second send
- **Suppression:** an address suppressed while its message waits is never sent.
- **Webhooks:**
  - a webhook with a bad or old signature is refused, and one delivered twice counts once
  - a "delivered" that arrives after a bounce leaves the message bounced
- **SMTP:** an SMTP connection dropped after the message's last line is unknown and never resent; one dropped before
  it is tried again.
- **Meeting email bounces:** a bounce on a meeting email whose SMTP answer had no id is matched by address only when
  one workspace sent it.
- **Complaints:** 2 complaints in 600 sends pause the workspace, and queued mail waits until the owner resumes.

**Left for later:**
- **Branded link host (`t.<domain>`):** links use the app's address until per-domain certificates are set up on Fly.
- **Dedicated IPs (Growth).**
- **Activity on send:** posting activity to Omniscient on send, and the email link token (`clr`) for identity.

## Running cost

| Item | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Resend plan with rate raise, 50,000 emails a team a month (check) | $1,150 | $5,000 (custom quote) |
| Resend dedicated IPs (Growth only, check) | $0 | $250 |
| Amazon SES and SNS (removed) | −$253 | −$2,780 |
| Claude tokens | $0 | $0 |
| Servers: sends run on `claritia-intel` and the web app as they are | $0 | $0 |
| **Total added** | **about $897** | **about $2,470** |
