# Email Studio: Brew-style email inside Claritia

Status: Parts 1, 3, 4 (lists), 5 (sending), 6 (automations from a sentence), 7 (results), 8 (templates), 9 (MCP) and 10 (deliverability) built, and Part 2's voice (12 November 2026, migrations 149 to 155). The rest is plan unless it says "exists" or "built".

## The idea

Brew (brew.new) is an email platform where a person types what they want and gets a finished, on-brand email, then
sends it to an audience or turns it into an automation. Claritia already does the hard half of that: it owns the forms
that capture leads and the meetings and workflows that come after. Email Studio adds the half people
see: describe an email, get it in the brand's look and voice, send it to the right people, and see what it led to.

The edge over Brew is that every email in Claritia knows about forms and meetings. A campaign's results show the
meetings it booked and the forms it filled, an automation can stop the moment someone books, and a form can start a
nurture with no glue. Brew needs Zapier or its API for any of that.

What Brew offers today (brew.new and brew.new/pricing, read 12 November 2026): email from a prompt, a brand learned from
the website, remixable templates, audiences, automations from a prompt, transactional email, its own sending with
domain checks, analytics, a REST API, webhooks and an MCP server. Growth is $99 a month for 50,000 sends and 10,000 AI
credits; Pro is $249 for 200,000 sends and 25,000 credits; Enterprise starts at $999.

## What exists today

| Piece | Where | State |
| --- | --- | --- |
| Sending domains, DNS records, checks | `sending_domains` (039), `src/lib/email/domains.ts` | Exists, live on Resend |
| Sending settings: from, address, quiet hours, rate, pause | `send_settings` (039), Settings › Sending | Exists |
| One email, one row per recipient, events | `emails`, `email_messages`, `email_events` (039) | Exists. Kinds: broadcast, journey, one_to_one, test |
| The send worker, at-most-once per message | `worker-intel/jobs/email.ts` (`send`, `sendRound`) | Exists, with flaky-case tests |
| Monthly send limits per plan, bounce and complaint pauses | 144, `plan_sends`, `send_month_room` | Exists: Free 1,000, Starter 10,000, Pro 50,000, Business 200,000 |
| Click and unsubscribe links, signed | `src/lib/email/track.ts` | Exists. No open tracking yet |
| Contacts, consent, topics, subscriptions, suppressions | 033, 034 | Exists in the database, no screens (116) |
| Segments: a rule tree compiled to safe SQL | `segments`, `segment_sql` (037) | Tables and compiler exist; refresh job and triggers removed (116) |
| Imports from Mailchimp, Klaviyo, ActiveCampaign, Brevo, Kit, MailerLite | `src/lib/sources/email.ts` | Exists |
| Email builder: blocks, styles, components, versions, checks, HTML import | `src/components/app/email/`, `src/lib/design/email/` | Exists |
| AI editing by tool calls, each op checked | `src/lib/design/email/chat.ts` | Exists, Sonnet 5.5, scripted-model tests |
| 15 built-in email designs | `src/lib/design/email/templates.ts` | Exists |
| Brand kits learned from a website | Form Studio's "Use your own brand", 107 to 113 | Exists for forms and booking pages |
| Workflows with email, wait, branch, split, Slack and more | `src/lib/workflows/types.ts` | Exists. Triggers: form, meeting, not booked, routed, clicked |
| Amazon SES as a second provider | `src/lib/email/ses.ts` and friends | Built, switched off |

So the plumbing is done. The work is the studio, audiences, campaigns, results and templates, plus putting Emails
back in the sidebar.

## Decisions before building

1. **Emails gets a sidebar item.** The sidebar becomes Forms, Meetings, Emails, Workflows, then Settings. Today the
   `emails` route only forwards to Workflows (`activeItem` in `src/lib/nav.ts`).
2. **Contacts get screens again, as Audiences.** `CLAUDE.md` says contacts have no screens. Audiences needs a list of
   people, so that line changes to "contacts show in Emails › Audiences, with no CRM fields, deals or scores". This
   stays well short of Omniscient's CRM: no companies page, no pipeline, no tasks.
3. **Open tracking on.** Opens are the number people look for first. Apple Mail opens every email by itself, so
   opens show with a note in the results only where the numbers are read, and clicks and meetings stay the main
   measure.
4. **Which provider carries bulk mail at Growth.** Resend stays for now. At about 2.5 million emails a month the
   choice is Resend's custom price or turning on the SES code that's already built. Part 10 has both costs.

## Part 1. The Emails section

**What people see**

- Sidebar: **Emails**, between Meetings and Workflows, with the envelope icon.
- Tabs beside the title (`Section` in `src/components/app/ui.tsx`): **Campaigns**, **Automations**, **Audiences**,
  **Templates**, **Brand**. Each tab has its own address: `/emails/campaigns`, `/emails/automations` and so on.
- First visit, before any email exists: the `ToolIntro` screen with one drawing from `src/components/sketches`, one
  line ("Write an email by describing it") and one box to type in. Typing there starts the first email in the studio
  (Part 3). Below it, a short row: "Connect a sending domain" when none is verified, because nothing can go out
  without one.
- After that, Campaigns opens on the list of emails.

**How it fits**

- `src/lib/nav.ts`: add the item; `activeItem` stops sending `emails` to Workflows. Old addresses under `/emails`
  keep working and land on the matching tab; `/emails/journeys/...` opens Automations.
- Automations is a filtered view of Workflows: the same workflows, the ones that send email. A workflow made in
  Workflows shows in both places. Nothing is copied.
- Settings › Sending stays where it is (domains, from name, address, quiet hours). The Brand tab links to it.
- The command bar (`CommandBar.tsx`) gets "New email", "New campaign" and "Find a contact".

**Data**: no new tables. Reads in `supabase/migrations/149_emails_section.sql` (`email_campaigns`, `email_automations`,
`audience_people`, `audience_count`), each running as the caller so the tables' member rules apply.

**Built (Part 1, migration 149):** `src/components/app/emails/EmailsView.tsx`.
- Campaigns: one-off emails with sent, delivered, clicked, unsubscribed and bounced; an empty workspace sees the first
  screen with "Set up sending". "New email" arrives with the studio (Part 3).
- Automations: workflows with email steps, their trigger, email count and state; a row opens it in Workflows, "New
  automation" opens the workflow templates.
- Audiences: everyone with an email, newest first, with search and Show more (up to 200); email status is a
  suppression first (bounced, marked as spam, unsubscribed), then the latest consent, else "No consent".
- Templates: the saved email templates (`EmailTemplatesView`), with Create in the command bar's Create menu.
- Brand: the brand kits (`BrandSettings`) with a link to Settings › Sending.
- Tests: `tests/nav.test.ts` (the sidebar, tabs and old addresses), `tests/pg/emailsSection.pg.ts` (the reads).

**Running cost**: $0 at Beta and Growth.

## Part 2. Brand for email

**What people see**

- **Brand tab**: the logo, colors, fonts and button style, shown on a sample email in the brand's look; the voice,
  shown as a short card ("Warm and direct. Short sentences. Signs off with the founder's first name. Avoids hype
  words."); and the shared parts: header, footer and signature, each opening in the builder.
- One brand for everything. The kit a form uses is the same kit the emails use, so a form, its booking page and its
  follow-up email look like one company. A workspace with several kits (an agency) picks the kit per email.
- First visit: if a kit exists from Form Studio, it's already there. If not, "Learn from your website" runs the same
  scan Form Studio uses, with the same stages on screen.

**Voice**

- Learned once from the website text and, when a tool is connected for lists (Mailchimp, Klaviyo), the last 20 sent
  emails. Stored as a short brief: tone, sentence length, words used and avoided, greeting and sign-off, and three
  sample lines.
- The person can change it by typing ("less formal", "never say 'synergy'"). The brief is plain text they can read.
- Every AI write in Part 3 gets the brief.

**How it fits**

- Brand kits are `brand_kits` (107 to 113). The email side reads the kit's tokens through `EmailCtx.tokens`, as
  `chat.ts` already does. The voice is a new field on the kit (`voice text`), so forms can use it too (Tia's form
  copy can match the emails).
- Header, footer and signature are email components (`src/lib/design/email/components.ts`) saved on the kit, so
  changing the footer once changes every email that uses it, drafts included, and never a sent one.

**Data**: `brand_kits.voice` (text, up to 2,000 characters) and `brand_kits.email_parts` (jsonb: header, footer,
signature component ids).

**Built (Part 2, voice; migration 153):** Emails › Brand opens with **Voice**: the brand kit's written brief, which
every AI email (the studio's chat) and every automation from a sentence writes from, now changed by hand there
(`brand_brief_save`, any member, up to 2,000 characters, saved on leaving the box). Learning the voice from past
emails and the shared header, footer and signature are not built yet.

**Running cost**: one voice read per team, about 15,000 tokens in and 1,000 out on Sonnet 5.5, about $0.06 (check).
About 10% of teams are new each month: Beta $0.30, Growth $3 (check).

## Part 3. Write with Tia (the Email Studio)

The heart of it: one chat per email, like Form Studio's one chat per form (`docs/studio-v2-plan.md`).

**What people see**

- A three-part screen: the chat on the left with Tia (`AiAvatar`), the email in the middle at true size, and the
  settings on the right (subject, preview text, from name, reply-to, audience, schedule).
- The person types "Announce our spring workshop on April 12, early-bird price until March 31, button to the
  registration form". Tia picks the closest template from the library, fills it in the brand's voice, links the
  button to the form, and lists what it used: "Event template, your header and footer, your voice".
- Changes are typed too: "make the title shorter", "add a photo of the venue", "move the price above the button".
  Each change is a step in the chat and can be undone.
- Direct edits still work: click any text to type in it, drag blocks, change a style. The builder that exists today
  is the middle pane.
- Above the email: Desktop, Mobile and Dark previews, and "Send a test" to any team member's address.
- Subject lines: Tia writes three when asked ("give me subject options") and the person picks one. No suggestion
  buttons; the box is the only way in.
- Merge tags (`{{first_name|there}}`) show as chips. An email can't be sent with a tag missing its fallback.
- Every email made or changed by AI carries the `AiTag` until a person edits or approves it.

**Links into the rest of Claritia**

- A **Form** block: a button or an inline card that opens one of the workspace's forms, with the person's email
  filled in. Fills from it count toward the email's results.
- A **Book a meeting** block: the meeting's next few times as buttons, each opening the booking page on that time,
  for the person the email went to. Bookings count toward the email's results.
- An **Event** block for meetings with seats (webinars, workshops), showing seats left at send time.

**How it fits**

- The chat reuses `chat.ts`: Claude changes the email only through ops (`addBlock`, `updateBlock`, `setProp` and the
  rest), each checked; a refused op goes back with the reason. New tools: `pick_template`, `use_part` (header, footer,
  signature), `link_form`, `link_meeting` and `write_subjects`.
- Every model call goes through the step cache (`src/lib/ai/cache.ts`): reopening an email or replaying a step never
  calls the model again.
- The design check (`checkEmailDesign`) runs after each turn, and the model gets one pass to fix what it caused, as
  today.
- Versions (075) keep every saved state; a sent email is frozen.
- The Studio shell (panels, chat list, undo) is shared with Form Studio where it can be, so both feel the same.

**Data**: `emails.chat` (jsonb, the turns, like form chats), `emails.ai` (boolean, made by AI and not yet approved).

**Tests**: scripted-model tests for every new tool, including a refused op that the model fixes; a form link and a
meeting link that point at a deleted form or meeting are caught by the check before send.

**Built (Part 3, migration 150):** New email on Campaigns makes a draft (`emails` with `doc`, a draft may have no
subject; `email_draft_save`, `email_draft_delete`) and opens it at `/emails/campaigns/<id>` in the email builder, on the
AI tab when it's new, with the subject typed in the top bar. Changes save 800 ms after the last one and on leaving; the
name follows the subject until it has its own. Tia's versions are kept under `em:<id>`; Send a test, the Desktop,
Phone and Dark previews and the design check are the builder's. New tool **link_to**: a Button or Meeting link block
points at one of the workspace's live forms or active meeting types by id, with the address from the server's list
(never from the model). Drafts open from Campaigns and delete with a confirm; a draft that sent anything stays.
Tests: `tests/email-chat.test.ts` (link_to), `tests/pg/campaignDrafts.pg.ts`.
Not yet: `write_subjects`, `use_part`, the Form block with the person's email filled in, the Event block's seats, the
`AiTag` on unapproved AI emails, and a three-pane studio shell shared with Form Studio; the builder's AI tab stands in
for the chat column.

**Running cost**: a new email is about 12,000 tokens in and 2,500 out across a few tool rounds, about $0.07; an edit
is about $0.02 (check, Sonnet 5.5, with prompt caching). At 8 new emails and 25 edits a team each month, about $1.10
a team: Beta $55, Growth $550 (check).

## Part 4. Audiences

**What people see**

- **Audiences tab** with three views (a `Select`, no pills): **Everyone**, **Lists** and **Segments**.
- **Everyone**: one table of people with name, email, status (subscribed, unsubscribed, bounced, complained), where
  they came from (a form, a booking, an import, added by hand), when they joined, and their last email activity.
  Search, filters and a bulk bar (add to list, remove from list, unsubscribe, delete). Long emails wrap; nothing is
  cut short except long values in the table, with the full text on hover.
- **One person**: a side sheet with their details, consent and its source, their topics, the forms they filled, the
  meetings they booked and the emails they got, with opens and clicks. No deal, no score, no owner field: that's
  Omniscient's job.
- **Lists**: hand-made groups ("Workshop waitlist", "Customers 2026"). Add by import, by hand, from a form's Ending
  ("Add to list"), or from a workflow step.
- **Segments from words**: the person types "people who filled the demo form in the last 30 days and haven't booked".
  Tia turns it into a segment's rule tree, shows the rules in plain words and the live count, and the person saves
  it. The rules can be edited directly too.
- **Imports**: CSV, and the existing connections (Mailchimp, Klaviyo and the rest), with consent and unsubscribes
  carried over.

**How it fits**

- People come from what Claritia already does: every form fill and every booking makes or updates a contact. So a
  new team's Audiences fills up from day one, with consent recorded at the form.
- Segments use the compiler that exists (`segment_sql`, 037), so nothing a person types becomes SQL. The rule kinds
  are trimmed to what Claritia still has: contact fields, form answers, forms filled, meetings booked or missed,
  email activity, lists, topics, consent, source. Rules about scores, companies and website visits are gone (116).
- The segment refresh job comes back, hourly and when saved, so workflows can start on "joined a segment".
- Topics (033) are what people subscribe to: "Product news", "Events". Each campaign picks a topic, the unsubscribe
  page lets people leave one topic or all, and transactional emails (confirmations, reminders) ignore topics.
- Suppressions (034) win over everything: a bounced or complained address is never sent to, whatever list it's on.

**Data**: `lists` and `list_members` (new), `segments` (exists, with `words text` for the typed description),
`segment_members` (exists), the refresh job kind `segment_refresh` back on the allowed list.

**Tests**: a segment refresh that runs twice at once makes one membership change each; a contact who unsubscribes
mid-send gets nothing after the unsubscribe lands; an import that fails halfway leaves no half-added list.

**Built (Part 4, lists; migration 151):** `lists` and `list_members`, with the CRM's old static lists brought over.
Audiences has a Show dropdown (Everyone, then each list with its count), New list, Rename and Delete (the people stay),
check boxes with a bulk bar (Add to a list, Remove from list), and Import on a list: pasted people, one a line, through
`/api/emails/import` (`contacts_upsert`), with "They agreed to get email from us" giving opt-in consent. Without it,
consent isn't touched: someone who agreed stays agreed, and a new person has no basis, so marketing email skips them.
Tests: `tests/emailsPeople.test.ts`, the import case in `tests/pg/campaignSend.pg.ts`. Segments from words, topics in
the unsubscribe page and the segment refresh job are not built yet.

**Running cost**: segment-from-words is one small model call (Haiku 5.5, about 3,000 tokens) per segment, a fraction
of a cent (check). The hourly refresh is a database query inside the VPS. Beta and Growth: under $1 (check).

## Part 5. Campaigns

**What people see**

- **Campaigns tab**: every one-off email with its name, status (Draft, Scheduled, Sending, Sent, Paused), audience,
  send time, and results (delivered, opens, clicks, meetings booked, forms filled, unsubscribes).
- **New campaign** opens the studio (Part 3). The right panel holds: audience (lists, segments, or both, minus any
  to leave out), topic, from, reply-to, and when: now, a set time, or each person's best hour (send-time picking from
  their past opens and clicks, falling back to the team's set time).
- **A/B test**: two subject lines (or two versions) to a share of the audience, then the winner by opens or clicks
  goes to the rest after a set wait.
- **Before it sends**, one checklist that must be clear: a verified domain, an address in the footer, an unsubscribe
  link, no merge tag without a fallback, every link working, the plan's monthly room for the audience size, and the
  audience count after suppressions. A real problem stops the send with one short line saying what to fix.
- **Sending**: a progress line (sent of total), Pause and Resume. A paused campaign picks up where it stopped and
  never sends twice.
- **Cancel** before the send time; after it starts, Pause.

**How it fits**

- A campaign is an `emails` row of kind `broadcast` (exists). The audience is frozen into `email_messages` rows at
  send time (`email_queue`, exists), so a person who joins the segment a minute later isn't added halfway.
- The send worker, rates, quiet hours, monthly room, and bounce and complaint pauses all exist and apply as they are.
- Scheduling uses the jobs queue (`run_after`), and the send-time pick spreads rows over the day with per-row
  `send_at`.
- Meetings booked and forms filled count toward a campaign when the person came from one of its links in the last 7
  days (the link token names the message, `track.ts`).

**Data**: `emails.audience` (jsonb: lists, segments, exclusions, topic), `emails.send_at`, `emails.ab` (jsonb: the
variants, the share, the wait and the winner), `email_messages.send_at`, `email_messages.variant`.

**Tests**: a scheduled send that the worker picks up twice sends once; Pause during a round leaves no message both
paused and sent; an A/B winner picked twice picks once; a send at the plan's limit holds the rest until the month turns
or the plan changes (exists, extended to campaigns).

**Built (Part 5, migration 151):** Send in the Email Studio's top bar opens the send panel: who gets it (Everyone or a
list), the topic, and Now or Later (a day and a time). The count is who it reaches now, by the rules each message
passes when it goes (`email_audience_preview` mirrors `email_guard`: suppressions, consent, outside-US basis, topic),
with who's left out and why, and how many wait for next month's room. `/api/emails/send` makes the HTML from the
draft's blocks, checks sending is ready, and calls `email_campaign_send`, which in one transaction makes the draft the
email that goes, freezes the audience into messages at the send time and queues the send job; a repeat or a double
click answers what the first queued. Campaigns shows Scheduled (with the time), Sending and Paused (with how many are
left), Pause and Resume (waiting messages move to `send_after = infinity` and back), and Cancel while nothing has gone
(back to a draft). A/B tests and send-time picking are not built yet. Tests: `tests/pg/campaignSend.pg.ts` through
the real send worker: the preview's count is exactly who gets it, two sends at once queue once, joining a list after
the send adds nobody, an unsubscribe after the send stops that message, nothing goes before its time, Pause holds and
Resume sends, Cancel only before anything went, and refused sends leave the draft as it was.

**Running cost**: sending costs are in Part 10. The worker and queue are inside the VPS: $0.

## Part 6. Automations from a prompt

**What people see**

- **Automations tab**: the workflows that send email, by kind (Welcome, Nurture, Event, Win-back, Meeting follow-up),
  each with its live state and results.
- **New automation** is one box: "When someone fills the demo form and doesn't book in two days, send two emails a
  few days apart, stop if they book." Tia builds a draft workflow: the trigger, the waits, the emails written in the
  brand's voice from the library, and the stop rule. Each email opens in the studio.
- Everything starts as a draft and each email unapproved, so nothing sends until a person reads it and turns the
  automation on (the same rule as lifecycle journeys today).

**How it fits**

- Built on Workflows (`docs/workflows.md`), the same engine that runs everything else. The workflow editor stays the place to change
  structure; the studio is where each email is written.
- New triggers: **Joined a list**, **Joined a segment**, **Date field** (birthday, renewal, trial end), **Tag added**.
  Existing ones stay: Form submitted, Meeting event, No booking after form, Lead routed, Email clicked.
- New goal: **Filled a form** next to **Meeting booked**, so a nurture stops when its goal happens.
- The form's Ending gets "Start an automation" next to its follow-up email, listing the team's automations. The
  meeting type gets the same for after the meeting.
- The old lifecycle journeys (Part 8 of `docs/email-plan.md`) become ready-made automation recipes; the one that
  started on a lead score is dropped, since scoring is gone.

**Data**: new trigger kinds in `src/lib/workflows/types.ts` and their checks; `workflows.prompt` (the words that made
it).

**Tests**: a contact who joins a segment twice in one refresh enters once (entry mode "once" exists); a goal reached
during a wait stops the next email; an automation turned off mid-run sends nothing more.

**Built (Part 6, migration 153):** Automations opens with **Describe an automation**: the words go to
`/api/emails/automation`, which gives Tia the workspace's forms, meeting types and lists by id (forms' and meetings'
public addresses from the server) and the brand's voice, through the step cache (`automation_build`, 2 credits). Tia
answers with one tool call (`make_automation`, `src/lib/workflows/fromWords.ts`): a trigger, a column of emails and
delays, and whether it stops on a booking. The answer is checked (`cleanBody`): unknown ids drop out, a button goes
only to a listed form or meeting or to an address the person typed, every email starts unapproved and marked as AI's,
a trailing delay goes. The person's own client saves it as a draft workflow and it opens in Workflows. New trigger
**Joined a list** (`{ kind: "list", lists }`): a trigger on `list_members` leaves a `list.joined` contact event
however someone joins, and `workflow_scan` starts the workflow once per join. Branches, date triggers and the "Filled
a form" goal are not built yet. Tests: `tests/automationFromWords.test.ts`, `tests/pg/listTrigger.pg.ts`.

**Running cost**: building an automation is one planning call plus the emails' writes, about $0.20 (check). At 2 a team
each month: Beta $20, Growth $200 (check).

## Part 7. Results

**What people see**

- Each campaign and each automation email has a results page: delivered, opened, clicked, unsubscribed, bounced,
  complained, and the two numbers Brew can't show, **meetings booked** and **forms filled**, each a list of people.
- A link map: the email with each link's clicks on it.
- Over time: the Campaigns tab's header shows the last 30 days in four numbers, using `StatCards`.
- An Apple Mail note sits next to opens: Apple opens emails on its own, so opens read high.

**How it fits**

- Opens: a 1-pixel image per message on the tracking host, signed like click links, logged once per message in
  `email_events` (new kind `opened`). Resend's own open events aren't used, so SES gives the same numbers if it's
  turned on.
- Clicks, unsubscribes, bounces and complaints already land in `email_events`.
- Meetings and forms: a booking or fill whose page was opened from an email link carries the message id, and the
  `meetings` and `submissions` rows store it (`from_message`).

**Data**: `email_events.kind` gains `opened`; `meetings.from_message` and `submissions.from_message` (uuid, null when
not from an email); a daily rollup table `email_stats` so result pages stay fast.

**Built (Part 7, migration 152):** a 1-pixel image at the end of every marketing email (not tests) at `/o/<token>`,
signed like click links (kind `open`, added at the end of the token kinds so old tokens read the same), calls
`email_open`: the message's first open and one `opened` event, never before it's sent. Meetings booked and forms
filled count toward an email when the same person made them within 7 days after first clicking it (`email_led_to`);
nothing in booking or forms changed, and spam fills don't count. Campaigns shows Opened, Clicked, Meetings and Forms;
any campaign that went opens its results page (`email_campaign_results`): the counts, who booked a meeting and who
filled a form (with the meeting type or form), and people per link with mail filters left out. The daily rollup table
is not built; results are counted when read. Tests: `tests/email.test.ts` (the pixel), `tests/pg/emailResults.pg.ts`.

**Tests**: an open pixel fetched ten times counts once; a forged pixel or link token is refused; a booking from an
email link counts toward that email and no other.

**Running cost**: event rows grow with volume (about 3 rows per message). At Growth (2.5 million messages a month)
that's about 7.5 million rows a month; raw events older than 13 months are rolled up and dropped. Disk on the VPS:
about 2 GB a month at Growth before rollup (check the plan's disk). $0 extra at Beta; at Growth possibly a larger VPS
disk, about $10 a month (check).

## Part 8. Email templates

**What people see**

- **Templates tab**: folders by purpose: Newsletters, Product updates, Events and webinars, Welcome and onboarding,
  Nurture and win-back, Sales follow-up, Meetings and forms, Announcements, Holidays. Each previews in the team's brand.
- About 100 templates at launch, built from the 15 designs in `templates.ts` so they share one design language, each
  written for a job ("Workshop reminder, 24 hours before", "We'd love your feedback after the meeting").
- "Use template" opens it in the studio with the brand applied; Tia fills it when the person types what it's for.
- The team's own saved emails sit in the same folders, marked as theirs.
- On the website, like the form gallery: `/email-templates`, a page per template with a live preview and "Use this
  template", which opens the app with it. The form template pages get "Pairs with" links to the email that follows
  them up (a workshop sign-up form and its reminder email).

**How it fits**

- Templates are data, written with a short builder like the form gallery (`src/lib/forms/gallery/templates/build.ts`),
  checked by a script before they join, and exported to the site with the forms.
- Forms' wired templates (they come with a meeting and a follow-up) take their follow-up from this library.

**Data**: templates are code; `email_templates.folder` for the team's own.

**Built (Part 8):** 100 templates in nine folders (Newsletters, Product updates, Events and webinars, Welcome and
onboarding, Nurture and win-back, Sales follow-up, Meetings and forms, Announcements, Holidays and seasons): the first
21 in `templates.ts` and 79 more in `library.ts` on the same blocks, every color a brand variable, every one with a
one-line blurb, placeholders in brackets and merge tags with fallbacks. Emails › Templates shows them by folder in the
workspace's brand (`TemplateGallery.tsx`); Use template makes a campaign draft from it and opens the studio. Tia's
`use_template` tool knows all 100. On the website, `/email-templates` and a page per template (claritia-site,
`tools/email_templates.py` from `scripts/export-email-templates.ts`), each with the email itself in a frame and Use
this template, which opens the app at `/emails/templates?use=<template>`. Form templates pointing to their follow-up
email ("Pairs with") is not built yet. Tests: `tests/email-design.test.ts` (100, nine folders, the design check,
no raw colors, blurbs, fallbacks, footers).

**Running cost**: $0 (data and static pages).

## Part 9. For agents: MCP and API

**What people see**: in ChatGPT or Claude, "Write and schedule our April newsletter to the Customers list" works
through Claritia's MCP, the same way forms do today.

**How it fits**: new tools on the existing MCP server (`src/lib/forms/mcp.ts`): `create_email` (from words),
`change_email`, `send_test`, `list_audiences`, `schedule_campaign` and `email_results`. Scheduling through MCP always
needs a person to confirm in the app when the audience is over 500 people.

**Running cost**: the same model costs as Part 3 per email made; nothing else.

**Built (Part 9, migration 154):** seven tools on the MCP server (`src/lib/emails/mcp.ts`, registered in
`src/lib/mcpTools.ts`): `list_emails`, `list_audiences`, `create_email` (blank or one of the 100 templates, then Tia
writes it in the brand through the step cache, same as the studio's chat), `change_email` (drafts only), `send_test`
(to the key's maker, through the real test path), `schedule_campaign` and `email_results`. The studio's chat and the
send route share their parts with the tools (`src/lib/emails/server.ts`). `schedule_campaign` needs a key made by a
workspace owner, sends as that person, and refuses an audience of more than 500 ready people with the studio link to
confirm it there (`src/lib/emails/guard.ts`). Agents count the audience with `email_audience_counts` (154), the same
count the app's preview shows, and the send goes through `email_campaign_send` and every check a send from the app
passes. Tests: `tests/emailsMcp.test.ts`, `tests/emailsGuard.test.ts` and `tests/pg/campaignSend.pg.ts`.

## Part 10. Deliverability and safety

- **New domains warm up**: a newly verified domain sends at most 500 a day the first week, then doubles weekly; a big
  first campaign is spread over days, with the dates shown before it sends.
- **Bulk sender rules** (Gmail and Yahoo): one-click unsubscribe headers (`List-Unsubscribe` and
  `List-Unsubscribe-Post`), DMARC on the domain (the domain check warns without it), and complaint rates kept under
  0.3% (the pause at 144 already acts sooner).
- **List checks on import**: disposable addresses (`src/lib/email/lists/disposable.txt`), role addresses (info@,
  sales@) marked, and an import with no consent source is held for the owner to confirm.
- **Content check before send**: missing alt text, image-only emails, very large emails (Gmail clips at 102 KB),
  broken links and missing fallbacks.
- **Suppressions** shared across campaigns and automations.

**Built (Part 10, migration 155):**
- **Warm-up**: `domain_warm_cap` gives a domain 500 a day from when it was verified, doubling each week, with no cap
  from week 8. `send_claim` holds campaign messages over the day's room and tries them again an hour later (never
  skipped). Meeting, workflow and other emails are never held, go before campaign messages, and count toward the day.
  Claims for one workspace take turns (an advisory lock), so claims at once can't go over. The Send panel and
  `schedule_campaign` show the days a big first campaign takes (`src/lib/emails/warm.ts`, the same rule).
- **Send check** (`src/lib/emails/sendCheck.ts`): a placeholder left in ("[date]") or a button or link with no working
  address stops the send, in the panel and on the server; an email that is mostly pictures, images without alt text
  and merge tags without a fallback are listed to look at. Size and the footer were already checked when built.
- **Imports**: addresses are cleaned the way forms clean them, throwaway domains are left out, and shared inboxes
  (info@, sales@) are kept with their class and tagged "Shared inbox" in Audiences. Without consent, only an owner
  adds people at once; anyone else's import waits in `contact_imports` for an owner to add or discard it.
- Already in place: one-click unsubscribe headers, DMARC before a domain counts as verified, the complaint and bounce
  pauses (144), and suppressions shared by campaigns and automations.
- Tests: `tests/pg/warmup.pg.ts` (five claims at once, meeting emails first, the weeks), `tests/sendCheck.test.ts`,
  `tests/warm.test.ts`, `tests/emailsPeople.test.ts`, `tests/pg/campaignSend.pg.ts`.
- Running cost: nothing new; it runs in the database and the app.

**Sending cost** (both providers; Claritia already limits each plan per month):

| Volume | Resend | SES (built, off) |
| --- | --- | --- |
| Beta: 50 teams × about 5,000 a month = 250,000 | Scale plan about $90 for 100,000, more above that (check) | about $25 at $0.10 per 1,000 |
| Growth: 500 teams × about 5,000 = 2,500,000 | Custom price (check) | about $250 |

## After Part 10: what Brew does that we didn't (13 November 2026)

Demo: https://claude.ai/artifact/XsYmLtATFuauKPPvgNgcnq. Four steps, each its own PR with no new services ($0 a month
at Beta and Growth):

1. **Send panel** (built, migration 156): the domain (any verified one, with what's left today while it warms up),
   From name, From address, reply-to, subject and preview text with a merge-value picker, how it shows in an inbox, and
   Send now, Schedule or Gradual Send (spread evenly over 2 to 72 hours; Pause and Resume keep it spread). The From
   address must be on a verified domain (`email_campaign_send` checks). Each campaign message now carries the person's
   first name, last name, company and title: before 156 campaigns had no merge values, so `{{first_name|there}}`
   always read "there". Tests: `tests/pg/campaignSend.pg.ts`.
2. **Lists that fill from forms** ("Add to a list" in On Submission) and **CSV upload** with column matching and an
   import history.
3. **Email groups on one canvas**, and a code view of the whole email.
4. **Intelligent Send**: each person at the hour they usually open, within 24 hours.

## Build order

| Milestone | What ships | Depends on |
| --- | --- | --- |
| M1 | Part 1 (Emails section), Part 3 (studio) for one-off emails, test sends, the template folders with the 15 designs | Nothing |
| M2 | Part 4 (Audiences) and Part 5 (Campaigns) with checks, scheduling and Pause | Decision 2 |
| M3 | Part 7 (Results) with opens, meetings and forms | M2 |
| M4 | Part 2 (voice and shared parts) and Part 6 (Automations from a prompt) | M1 |
| M5 | Part 8 (100 templates, website pages) and Part 9 (MCP) | M1 |
| M6 | Part 10 extras (warm-up, import checks), A/B tests and send-time picking | M2 |

Each milestone is its own PR with its migration, tests and the cost line, as usual.

## Running cost, all parts

Estimates. Model prices are Sonnet 5.5 at about $3 per million tokens in and $15 out, and Haiku 5.5 for small calls
(check both).

| Item | Beta (50 teams) | Growth (500 teams) |
| --- | --- | --- |
| Claude: writing and editing emails (Part 3) | $55 (check) | $550 (check) |
| Claude: automations from a prompt (Part 6) | $20 (check) | $200 (check) |
| Claude: voice reads and segments from words (Parts 2, 4) | $1 (check) | $5 (check) |
| Sending on Resend (Part 10) | about $90 and up (check) | custom price (check) |
| Or sending on SES instead | about $25 | about $250 |
| VPS disk for email events (Part 7) | $0 | about $10 (check) |
| **Total added, on Resend** | **about $166 a month (check)** | **about $765 a month plus Resend's custom price (check)** |
| **Total added, on SES** | **about $101 a month (check)** | **about $1,015 a month (check)** |

For scale: Brew charges $99 a month for one team's 50,000 sends. At Growth, Claritia's whole email bill is about $2 per
team a month.
