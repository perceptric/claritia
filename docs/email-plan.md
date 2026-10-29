# Email plan

Email starts by learning the brand. On the first visit, Claritia reads the website and the emails the team already sent, and imports them into one organized system: the brand kit, the voice, and a library of templates and parts filed by purpose. The assistant then works on top of that system. It writes in the brand's voice and builds only from the library's templates and parts, so every email looks like the brand without anyone styling it.

There are no suggestion buttons anywhere. The assistant's box sits at the bottom, and people type what they want.

## Part 1. What we have now

- **Emails tab:** a report of every email sent. "New broadcast" opens a workflow.
- **Templates tab:** a flat list of `email_templates`.
- **Builder** (`src/components/app/email/`): blocks, styles, components, versions, checks, HTML import, and an AI panel with "3 versions".
- **Brand:** the site scan (`src/lib/brand/scan.ts`, `brand_scan` job) fills the brand kit's look and a written brief. Emails already take the kit's styles.
- **Imports:** lists, contacts, consent and unsubscribes from Mailchimp, Klaviyo, ActiveCampaign, Brevo, Kit and MailerLite. No templates or past emails come in.

What's missing: nothing learns the brand's voice or brings in past emails, the templates aren't organized by what they're for, and a new team starts from a blank list.

## Part 2. The first visit: learning the brand

The same pattern as Scoring and Routing: a build screen with no questions.

1. **Reads the website.** The existing scan gives logo, colors, fonts, buttons, social links and address.
2. **Reads past emails.** From the tools already connected for lists (Mailchimp campaigns, Klaviyo campaigns and templates, HubSpot marketing emails, ActiveCampaign, Brevo), up to the last 50 sent emails with their HTML, subject, send date and results.
3. **Learns the voice** from those emails and the site: how they open, how long they are, formal or casual, words they use and avoid, how they sign off, and the subject lines that got the most opens.
4. **Rebuilds each past email from blocks** (`src/lib/design/email/import.ts`, then the assistant fixes what HTML import misses), in the brand kit's styles.
5. **Files everything by purpose** into the library (Part 4) and pulls out the shared parts: header, footer, signature and buttons.

While it works, each source has its own picture: the site being scanned, past emails flying into folders, and the voice words appearing. Then what it found appears one by one, and "Open the library" takes the team there. With no tool connected, it learns from the site alone and starts the library from the 30 built-in templates in the brand's style.

## Part 3. The screens

Emails keeps its sidebar item, with three tabs: Emails, Library and Brand.

### 3.1 Emails

- Every email in one list: drafts, scheduled, sent and the emails inside workflows. Each row shows its name, status, audience, send date, opens, clicks and meetings.
- "New email" opens the editor on a blank page with the assistant's box at the bottom. The person types what the email is about. The assistant picks the right template from the library, fills it in the brand's voice, and lists what it used: "Product update template, Header, Footer, Voice".
- Sending stays where it is: pick a segment, schedule, and the domain and consent checks run before it goes.

### 3.2 Library

The organized system. Folders by purpose, each with its templates:

- **Newsletters**
- **Product updates**
- **Events and webinars**
- **Welcome and onboarding**
- **Nurture and win-back**
- **Sales follow-up**
- **Meetings and forms** (confirmations and reminders that already send)

Below the folders:

- **Parts:** header, footer, signature, buttons, testimonial and product card. Changing a part changes every email that uses it.
- **Imported:** each past email rebuilt from blocks, with its original results.

Templates and parts open in the existing builder. Folders can be renamed, added and deleted.

### 3.3 Brand

- **Look:** logo, colors, fonts, buttons and corners, from the site scan. Changing them changes every email. This is the existing kit with its publish step.
- **Voice:** a short list of rules in plain words, each one editable or removable. For example:
  - "Short sentences. Open with the reader's problem."
  - "Say 'team', not 'users'."
  - "Sign off with the sender's first name."
  - Words to use and words to avoid.
  - Best subject lines from past emails.
- **Footer:** address, legal line, unsubscribe wording and social links.
- **Senders:** from names, reply-to and the sending domain's status (`docs/sending-setup.md`).

## Part 4. How the assistant works on the system

- It reads the brand kit, the voice rules and the library before every answer. It writes the words, picks a template and fills its blocks. It never makes new colors or fonts; the existing check refuses raw colors.
- It adds parts by reference (the footer is the footer part, not a copy), so a part edited later updates the email.
- It answers in the box at the bottom, lists what it changed and what it used, and keeps each change as a version with undo. It never sends.
- When the person asks for something the library doesn't have ("an event invite with a speaker grid"), it builds it from blocks in the brand's styles and offers to save it to the right folder.

## Part 5. Data and code

- **`email_folders`:** id, workspace, name, purpose, position. Plus `email_templates.folder_id`, `kind` (template or part) and `source` (built-in, imported or made), and `email_templates.stats` for imported results.
- **`brand_voice`:** on `brand_kits`, a `voice` jsonb of rules, words to use and avoid, sign-off, best subjects, learned at, and from how many emails. People's edits are kept when the voice is learned again.
- **Import:** a `email_import` job per connected tool. It fetches the last 50 sent emails through each tool's API (Mailchimp `/campaigns` and `/campaigns/{id}/content`, Klaviyo `/campaigns` and `/templates`, HubSpot `/marketing/v3/emails`), then saves the HTML and results. It then queues `email_rebuild`, one per email, with the assistant through the step cache, and finally `email_voice`.
- **The first-visit screen** reads these jobs' progress, the same way Scoring's build screen reads its build.
- **Reliability:**
  - An email that can't be rebuilt keeps its original HTML in an "html" block and is marked for review. It is never dropped.
  - Running the import twice adds nothing new (keyed by the tool's email id).
  - Learning the voice again never overwrites rules a person edited.

## Part 6. Build order

1. Folders and parts in the library, the built-in templates filed into folders, and the three tabs.
2. The Brand tab: Voice and Footer next to the existing Look.
3. Importing past emails from Mailchimp, Klaviyo and HubSpot, rebuilt into blocks.
4. Learning the voice, and the first-visit build screen.
5. The assistant using the library and voice. "New email" with the box at the bottom. The suggestion buttons removed from the builder's assistant panel.

## Part 7. Running cost

- **Site scan:** already running on the worker. Adds nothing.
- **Importing past emails:** tool APIs are free. Rebuilding one email is about 6,000 tokens in and 3,000 out, about $0.06 on Claude Sonnet 5.5 (check). 50 emails is about $3 per team, once.
- **Learning the voice:** about 40,000 tokens in and 2,000 out, about $0.10 per team (check), once and when the team asks again.
- **Writing:** about 8,000 tokens in and 2,000 out per email, about $0.04 (check). Teams write about 20 emails a month, about $0.80 per team.
- **Storage:** imported HTML is about 50 emails × 100 KB = 5 MB per team, inside the database plan (check).
- **One-time costs, spread out:** assume about 10% of teams are new each month.

| Item | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Claude, writing emails, about 20 a team a month (check) | $40 (check) | $400 (check) |
| Claude, importing and voice for new teams, about 10% a month (check) | $16 (check) | $155 (check) |
| Worker time for imports | $0 (current worker) | $0 (current worker, check) |
| Storage for imported emails | $0 (inside plan) | $0 (inside plan, check) |
| **Total** | **about $56 a month (check)** | **about $555 a month (check)** |
