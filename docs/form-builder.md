# Form Builder

The full spec for module I1 in `docs/inbound.md`. A person tells an AI chat what the form should ask. Claritia reads the look of their website and builds a form that matches it. Every lead goes wherever the team wants: Claritia's own records, any CRM, Slack, a sheet or a webhook. The form hands off to routing and to meeting scheduling, either Claritia's own or the tool the team already uses.

---

## Part 1. What the customer gets

1. Type the website, then say what the form is for ("demo requests from companies over 20 people"). A form that looks like their site appears in under a minute.
2. Change it by chat ("add a phone field, only for the US", "make it two steps") or by clicking any field to edit it.
3. Pick where leads go. Every tool connects with one sign-in, and fields map by themselves.
4. Pick what happens after a fill: a thank-you, the team's router, then a meeting booked on Claritia's calendar or on Calendly, Cal.com, HubSpot Meetings, Chili Piper or SavvyCal.
5. Press Test. A fake lead runs the whole path, and every step shows green or red.
6. Paste one line on the site, or share a hosted link. Each lead's page shows exactly where it went and when.

## Part 2. The parts

```
 chat ──► form ops ──► form schema (JSON) ──► renderer (web component, hosted page, React SDK)
   ▲                         ▲
   │                         │
 brand scan (runner) ──► brand kit (tokens)
                                            submit
 visitor ──► <claritia-form> ──────────────────────► collect /f ──► submission (saved first)
                                                                         │
                         next step in under 1.5 s ◄── qualify, route ◄────┤
                         (thank-you, native calendar, or an outside       │
                          scheduler with the lead filled in)              ▼
                                                               outbox: one delivery per destination
                                                                         │ jobs queue, retries
                                  Claritia records · HubSpot · Salesforce · Pipedrive · … · Slack · Sheets · webhook
```

Four rules hold the design together:
1. **The AI edits a schema and never writes HTML or CSS.** The chat calls tools that change a JSON form schema. Claritia's own renderer turns the schema into a form. A form can't hold a script, every form passes the same accessibility checks, and every change can be undone.
2. **A lead is saved before anything else happens.** The submission row is written first. Routing, CRMs, Slack and the rest read from it. A CRM being down never loses a lead.
3. **One delivery per lead per destination.** Each delivery has its own status, retries, error and replay. The lead page shows all of them.
4. **Bookings tie back by token.** Every outside scheduler gets a tracking id for the submission. A booking is linked to its lead only by that id. A matching email alone is shown as "maybe" and starts nothing (the `CLAUDE.md` rule on wrong links).

---

## Part 3. The form schema

```ts
type Form = {
  id: string;
  version: number;
  name: string;
  steps: Step[];                        // one step is a plain form; two or more is multi-step
  rules: Rule[];                        // show, hide, require, skip to step, end
  brand: BrandKitRef & Overrides;       // which brand kit, plus any per-form changes
  layout: { width: "narrow" | "wide"; labels: "above" | "inside"; columns: 1 | 2 };
  submit: { label: string };
  after: After;                         // Part 8
  destinations: string[];               // form_destinations ids, Part 7
  enrich: { hideKnown: boolean };       // docs/inbound.md I2
  consent: { mode: "by_region" | "always" | "off"; wording: Record<string, string> };
  spam: { turnstile: boolean; honeypot: true; minSeconds: number };
};

type Field = {
  key: string;                          // a key in the field registry (src/lib/records/fields.ts) or a new custom field
  type: "text" | "email" | "phone" | "textarea" | "number" | "choice" | "multi" | "checkbox" | "country"
      | "state" | "date" | "url" | "hidden" | "consent" | "file";
  label: string;
  placeholder?: string;
  required: boolean;
  options?: { value: string; label: string }[];
  check?: "work_email" | "no_free_email" | "phone_valid" | { pattern: string; message: string };
  width?: "full" | "half";
  prefill?: "url_param" | "known_contact" | "none";
  hidden?: { from: "utm" | "referrer" | "page" | "cookie" | "param" | "static"; name?: string; value?: string };
};
```

- The schema is checked by one validator (`src/lib/forms/schema.ts`) on every save, on every AI op, and in the renderer. A form that fails the check can't be published.
- **Choice fields** render as Claritia's own listbox with full keyboard and screen reader support. No native `<select>`, same as the app rule.
- **New fields:** if the chat adds a field the registry doesn't have ("budget range"), the field is created as a custom contact field on publish, with its type and options. The person sees it in the change list first.
- **Versions:** each publish is a new `form_versions` row. Live embeds load the published version. Old submissions keep the version they were sent with, so a renamed or removed field never breaks history.

## Part 4. The AI chat

### 4.1 The first screen

A `ToolIntro` with one input: "What should this form do?" and the site address filled in from the workspace's site (M1 `sites`). Three "Try" examples: "Demo requests, work emails only", "Contact sales with a meeting", "Newsletter signup with consent". Below, the template cards (demo request, contact sales, free trial, event signup, newsletter, partner application, job application, support request).

### 4.2 How the chat works

- **Model:** Sonnet 5.5 with tools, prompt caching on the system prompt, the registry and the current schema.
- **What it reads at the start:**
  - the workspace's field registry and custom fields
  - the brand kit (Part 5)
  - forms already on their site, found by the brand scan ("Your contact page asks for name, email, company and message")
  - connected tools (so it can suggest "send to HubSpot, owner from your router")
  - the team's meeting setup (native meeting types, or outside scheduler links)
- **Tools it can call (each one a form op):**

| Tool | What it changes |
|---|---|
| `add_field`, `update_field`, `remove_field`, `move_field` | Fields |
| `add_step`, `remove_step` | Steps |
| `set_rule` | Show, hide, require, skip, end |
| `set_layout`, `set_copy` | Labels, button text, headings, width, columns |
| `set_style` | Brand kit overrides (only tokens from Part 5) |
| `set_consent`, `set_spam` | Consent and spam settings |
| `add_destination`, `set_mapping` | Where leads go (Part 7) |
| `set_after` | Thank-you, router, scheduler (Part 8) |
| `ask` | A question back with 2 to 4 choices, shown as buttons |

- **Every op is checked** by the schema validator before it applies. A bad op returns its error to the model, which fixes it in the same turn. After two failed tries the chat says what it couldn't do.
- **Undo:** each op is a row in `form_ops`. The chat shows each change as a small line ("Added Phone, US only") with an undo button. Undo is also Cmd+Z in the editor.
- **Clicks and chat share one history.** A person can drag a field or edit a label by hand, and the chat sees the change on its next turn.
- **It asks before it does three things:** sending leads to a new tool, turning off consent, and removing a field that past submissions used.
- **Copy:** labels and the button use the site's own words where the scan found them ("Talk to sales" if that's their button). Otherwise plain, short labels.
- **Field suggestions with a reason:** the chat proposes fields from the form's job and from what enrichment can fill. "Company size isn't needed. We fill it from the email." This keeps forms short.
- **Cache:** each turn goes through the step cache by (schema hash, message, registry hash). The same request on the same form replays.

### 4.3 Also from Claude and the API

The same ops are tools on the MCP server (`create_form`, `edit_form`, `publish_form`) and in the REST API, so a team can build a form from Claude or a script. Publishing from outside the app needs an owner's key.

## Part 5. Brand from the website

### 5.1 The scan

The scan runs on the existing runner (`claritia-runner`, Playwright, sleeps when idle) as a `brand_scan` job.

1. Load the homepage, then the page most likely to hold a form (contact, demo, signup, found from links). Desktop and phone widths. Wait for fonts to load.
2. Read **computed styles** from the real page. Computed styles are what the visitor sees after every stylesheet, theme and framework has run, so they are more exact than reading CSS files.

| Token | Read from |
|---|---|
| Body font, size, weight, line height, color | `body`, the longest paragraph |
| Heading font and weight | `h1`, `h2` |
| Background | `body`, the main section |
| Primary button: background, text color, radius, padding, border, weight, text case | The most-used filled button, and any button with "demo", "contact", "start" or "sign up" |
| Secondary button | An outline button if there is one |
| Input: border color and width, radius, height, background, padding, focus ring color | Inputs on the form page, else the search box |
| Label: size, weight, color, position (above or inside) | Labels on the form page |
| Link color | Links in body text |
| Error color | A red from their CSS variables, else a safe default |
| Spacing between fields | Gaps between inputs on their form |
| CSS variables | Every `--*` on `:root` (most sites keep their brand colors there) |
| Logo | `header img` or `svg` with "logo" in its name |
| Dark or light | Background luminance |

3. **Check the result:**
   - Text and button colors must pass WCAG AA contrast. A failing pair is moved to the nearest passing shade, and the change is noted.
   - Fonts: Google Fonts are linked by name. A font hosted on the customer's own domain is referenced from there for the embed (it runs on their domain). The hosted page uses the font only if the font's server allows it (CORS), else the closest Google Font with a note. Font files are never copied to our servers.
   - If the page blocks the runner (bot wall, login), the chat asks for 1 to 3 colors and a font instead.
4. **Look check:** the runner renders the new form on top of a screenshot of their form page. Sonnet compares the two images and returns up to 3 token fixes ("radius is 8, theirs is 4"). The fixes are applied as ops the person can undo. One pass only, so it can't loop.

### 5.2 The brand kit

```
brand_kits (id, workspace_id, site_id, tokens jsonb, logo_path, source_url, scanned_at, notes text[])
```

- One kit per site, shared by every form, booking page and email on it. Changing the kit restyles them all.
- `tokens` is a fixed list (the table above). The renderer turns tokens into CSS variables inside the form. Nothing else from the site is copied.
- Rescan on request, and once a month with a "your site changed" note if tokens moved.

### 5.3 Two ways the form takes its look

- **Match (default):** the form uses the brand kit tokens inside a Shadow DOM. The site's own CSS can't break the form, and the form can't break the site.
- **Inherit:** for teams with a design system. The form drops the Shadow DOM, uses plain class names (`clr-field`, `clr-input`, `clr-button`), and the site's CSS styles it. The chat warns if the site's CSS makes a field hard to read (the runner checks contrast after load).

## Part 6. The renderer

| Way to place it | How |
|---|---|
| Embed | `<script src="https://f.tryclaritia.com/v1.js" async></script><claritia-form id="frm_x"></claritia-form>`. A web component, so it works in plain HTML, Webflow, Framer, WordPress, React and the rest. |
| Hosted page | `forms.tryclaritia.com/<team>/<form>`, rendered on the server, with the brand kit and logo. Custom domain later. |
| Pop-up and slide-in | The same component, opened by a button, time on page, scroll depth or exit intent |
| React SDK | `@claritia/forms`: `<ClaritiaForm id>` and a headless `useClaritiaForm(id)` that gives fields, errors and submit for teams who draw their own inputs |
| With `claritia.js` | If the site script is installed, the form uses its session, so earlier visits attach to the lead (M1) |

- **Size:** under 20 KB gzipped for the component, schema loaded with it from the edge cache. The script loads `async` and never blocks the page.
- **Accessibility:** labels tied to inputs, errors announced, full keyboard use, focus kept on step changes, respects reduced motion. Checked by axe in CI on every template.
- **Fields at work:** work email check (free mail list from `src/lib/identity/domainList.ts`), phone by country with live format, country and state lists, prefill from URL params and for known contacts (only fields the contact can already see, never enriched data).
- **Spam:** Turnstile (invisible), a honeypot field, and a minimum fill time. Spam is kept 7 days in a Spam tab and never delivered.
- **Never lose a submit:** the component saves the submit in `localStorage` with its `idem_key` and retries for 24 hours with backoff if `collect` can't be reached. `collect` treats a repeat key as the same submission.

## Part 7. Where leads go

### 7.1 Destinations

A destination is a connected tool plus a field map and a mode. Connections are the same `sources` rows built in weeks 3 to 7, so a HubSpot connected once works as a source and a destination.

| Group | Tools | Status |
|---|---|---|
| Claritia | Contacts and Leads (always on) | Built (`contacts_upsert`) |
| CRMs with two-way sync | HubSpot, Salesforce, Omniscient | Built, push extended for forms |
| CRMs, push added | Pipedrive, Attio, Close (pull already built) | Week 11 |
| CRMs, new | Zoho CRM, Microsoft Dynamics 365, Copper, Freshsales, monday CRM, Folk, Twenty, Affinity, Keap | Week 11 and after, one sign-in app each |
| Marketing tools | Mailchimp, Klaviyo, ActiveCampaign, Brevo, Kit, MailerLite (pull built), Loops, Customer.io | Week 11 and after |
| Alerts | Slack, Microsoft Teams, email | Week 9 |
| Tables | Google Sheets, Airtable, Notion | Week 9 (Sheets), later (others) |
| Anything else | Signed webhook (HMAC, retries), Zapier, Make and n8n apps | Week 9 (webhook), later (apps) |

### 7.2 How a delivery works

- **Contract:** a destination uses the connector's existing `push` (`src/lib/sources/types.ts`). A change with no `externalId` is a create. Forms add one optional method, `find(ctx, email)`, so a connector can look for an existing record before it creates one.
- **Modes per destination:** create or update (default), create only, update only. Plus the object: lead or contact (Salesforce), contact or deal (HubSpot), person or person plus deal (Pipedrive).
- **No doubles:**
  1. use the tool's upsert by email when it has one (HubSpot batch upsert by `email`, check);
  2. else `find` then create;
  3. the external id is saved on `source_links` the moment the tool answers, so a retry after a timeout updates the record it made.
- **HubSpot form submit option:** a HubSpot destination can also send the fill to HubSpot's form submission API with the `hutk` cookie, so HubSpot's own form reports and workflows still fire (check endpoint and limits).
- **Salesforce:** creates Leads or Contacts, can add the lead to a Campaign, and can ask Salesforce to run its own assignment rules (the `Sforce-Auto-Assign` header, check).
- **Owner:** if Claritia's router picked an owner (Part 8), the owner is written to the tool's owner field. People are matched to CRM owners by email in Settings › Team (`owner_map`). An owner with no match goes in as the tool's default, and the lead page says so.
- **Field map:** Haiku suggests a map from the form's fields to the tool's fields once, when a destination is added. The person confirms it. After that the map is fixed data, and no AI runs per lead.
- **Order:** Claritia records first, then the rest at once. A destination can wait for another one ("Slack after HubSpot, with the HubSpot link").
- **Retries:** the jobs queue backoff (1, 5, 30 minutes, then 2 and 6 hours). After the last retry the delivery is marked failed, the owner gets one alert, and a Replay button sends it again with the current map.
- **Pause:** a paused destination holds its deliveries and sends them in order when it's turned back on.

### 7.3 The lead page and the delivery log

Each submission shows its values, the form version, the page and UTMs, earlier visits, the router's log, the meeting, and one line per destination: status tag, time, the external id as a link ("Open in HubSpot"), and the error if any. Settings › Form deliveries lists every delivery with filters and bulk replay.

## Part 8. After the submit

The `after` part of the schema runs in this order:

```ts
type After = {
  router: "claritia" | "crm" | "none";      // who picks the owner
  routerId?: string;                         // a Claritia router (docs/inbound.md I3, I4)
  schedule: Schedule | null;
  end: { kind: "message" | "redirect"; text?: string; url?: string };
  perOutcome?: Record<string, Partial<After>>;   // e.g. "not_a_fit" → message, no scheduler
};
```

### 8.1 Routing

| Choice | What happens |
|---|---|
| Claritia router | Qualify and route run during the submit (budget 1.5 s p95). The owner and outcome decide the next step: which calendar, or which end for not a fit. |
| The CRM decides | Claritia creates the record and lets the CRM's own rules assign it (Salesforce assignment rules, HubSpot workflows). The owner is read back on the next sync. No in-form calendar for the owner in this mode, since the owner isn't known in time. |
| None | Straight to the end or a fixed scheduler link |

If the router runs out of time, the form shows the end message and emails the lead a booking link for the routed owner a moment later. The lead is never stuck on a spinner.

### 8.2 Scheduling

```ts
type Schedule =
  | { tool: "claritia"; meetingTypeId: string }                       // docs/inbound.md I5
  | { tool: "calendly" | "calcom" | "hubspot_meetings" | "savvycal" | "chilipiper" | "google_appointments" | "ms_bookings" | "link";
      links: "per_owner" | "fixed"; fixedUrl?: string };
```

- **Claritia's own calendar:** the routed owner's open times show inside the form. Booking follows the hold and recheck in `docs/inbound.md` I5.
- **An outside tool:** each person's link is saved once in Settings › Team (their Calendly, Cal.com or HubSpot Meetings link). After routing, the form opens the owner's link inside the form with the lead's name and email filled in and a tracking id for the submission.

| Tool | Opens in the form | Name and email filled in | Tracking id passed | Booking comes back | Notes |
|---|---|---|---|---|---|
| Calendly | Inline embed | Yes | A `utm_content` or `salesforce_uuid` param, returned in the webhook (check) | Webhook, built | Booking tied by the tracking id in the webhook |
| Cal.com | Inline embed | Yes | `metadata[clr]` param (check) | Webhook, built | Same |
| HubSpot Meetings | Inline embed | Yes, by URL params (check) | Check | Meeting on the HubSpot contact, read by sync | Tie by HubSpot contact id from the delivery |
| SavvyCal | Inline embed | Yes (check) | Metadata param (check) | Webhook (check) | Connector to build |
| Chili Piper | Its own Concierge pop-up, started with the lead's data | Yes | Its own lead id (check) | Webhook (check) | Chili Piper does its own routing here, so Claritia's router is skipped or only qualifies |
| Google appointment schedules, Microsoft Bookings, any link | New tab or embed | Where the tool reads URL params | No | Seen only if the host's calendar is connected | Shown as "booked, maybe" until confirmed |

- A booking that comes back with the tracking id is linked to the submission and its contact for sure. One that matches by email only is linked as "maybe" and starts nothing until a person confirms it.
- **Booked, then what:** the meeting goes on the lead page, to the CRM as an activity, and to Slack. The router's SLA timer stops.

## Part 9. Capturing forms a team already has

For teams who keep their HubSpot, Webflow, Marketo or Framer forms:

- **Today's rule:** `claritia.js` reads only the email from a form (`docs/identity.md` 5.4). That rule stays for every form a team hasn't set up in Claritia.
- **Set up a captured form:** in Forms › Capture, the team points at a form on their site (the runner lists the forms it finds, with a screenshot). The chat maps its fields to the registry. Only then does `claritia.js` read that form's mapped fields, on that page, and nothing else. Password, card and `data-clr-ignore` fields are never read.
- **Named adapters** listen to each tool's own success event (HubSpot `onFormSubmitted`, Marketo `onSuccess`, Webflow's success block, Typeform's embed event; check each), so a fill is sent only when the tool accepted it.
- A captured form gets the same router, scheduler and destinations as a built one. Its native destination keeps working as before.

## Part 10. Testing a form

- **Test button:** sends a fake lead (`test+<id>@<their domain>`) through the whole path: submit, router, scheduler (a hold that's released), every destination. Each step shows green or red with the error. Records made in outside tools by a test are deleted afterward where the tool allows it, and tagged "Claritia test" where it doesn't.
- **Funnel QA:** every published form is filled in a real browser each day on the live page (existing runner). Checks: the form loads on the page, the brand still matches the kit, the submit lands, each destination received it, the scheduler opens. A failure alerts the owner (alerts, built).
- **Before publish:** schema check, axe accessibility check, contrast check, and a Test run that passed in the last hour.

## Part 11. Database: `039_forms.sql`

```
brand_kits        (id, workspace_id, site_id, tokens jsonb, logo_path, source_url, scanned_at, notes text[])
forms             (id, workspace_id, name, status, draft jsonb, version int, brand_kit_id, published_at, created_by)
form_versions     (form_id, version, body jsonb, published_by, at)
form_ops          (id, form_id, op jsonb, by text,                 -- 'chat' or a user id
                   undone bool, at)
form_chats        (id, form_id, messages jsonb, at)
captured_forms    (id, workspace_id, site_id, url_pattern, selector, adapter, field_map jsonb, form_id)
form_destinations (id, form_id, source_id, mode, object, field_map jsonb, after_id, paused bool)
owner_map         (workspace_id, user_id, source_id, external_owner_id, scheduler jsonb)   -- CRM owner and booking links per person
submissions       (id, workspace_id, form_id, form_version, captured_form_id, contact_id, session_id,
                   values jsonb, hidden jsonb, consent_id, router_run_id, meeting_id, spam bool, test bool,
                   idem_key unique, at)
deliveries        (id, workspace_id, submission_id, destination_id, status, attempts int, external_id,
                   error text, next_at, done_at, unique (submission_id, destination_id))
```

RLS on every table, members read, server writes. Each goes in `tests/db/leaks.sql`. Submissions follow the contact through merges and erasure.

**Jobs:** `brand_scan` (runner, key: site), `deliver` (intel, key: submission plus destination), `form_qa` (runner, daily), `booking_link_email` (intel).

**Code:**
```
src/lib/forms/       schema.ts, ops.ts, chat.ts (tools and prompt), rules.ts, after.ts, adapters/
src/lib/brand/       scan.ts (runs in the runner), tokens.ts, contrast.ts
src/lib/delivery/    outbox.ts, map.ts, destinations.ts (Slack, Sheets, webhook; CRMs reuse src/lib/sources)
collect/forms/       /f submit, /x before-submit lookup, the edge-cached schema
packages/forms/      the web component and the React SDK
worker/jobs/brand.ts, worker-intel/jobs/deliver.ts
```

**Screens:** Forms (templates first), the builder (chat on the left, live form on the right, tabs for Design, Logic, Destinations, After submit, Share), Submissions, Capture, Settings › Brand, Settings › Team (owners and booking links), Settings › Form deliveries.

## Part 12. Tests (flaky cases)

| Case | Proves |
|---|---|
| The same submit sent 3 times, and once more from `localStorage` after a day | One submission, one contact, one delivery each |
| HubSpot answers 500 twice, then times out after creating the record | One HubSpot contact, the external id kept, no double |
| Slack down for 2 hours | Deliveries wait and land in order, nothing lost |
| A destination paused, then turned on | Held deliveries go out once, in order |
| 50 bad AI ops in a row (unknown field types, broken rules) | Each refused by the validator, the form unchanged |
| A schema with a `<script>` in a label | Rendered as text |
| The brand scan on 20 recorded sites (Webflow, Framer, WordPress, Next.js, a dark site, a site with a bot wall) | Tokens within a set tolerance of hand-picked ones, contrast passes, the bot wall falls back to asking |
| A Calendly booking with the tracking id, and one with the same email and no id | The first links for sure, the second is "maybe" and starts nothing |
| The router takes 3 seconds | The visitor sees the end message, and the booking link email goes out once |
| A captured HubSpot form that fails HubSpot's own check | Nothing is sent to Claritia |
| A field removed from the form after 1,000 submissions | Old submissions still show it |

Each week ends with `npm test`, `npm run test:db`, typecheck, lint and build green, then a push.

## Part 13. Build order

Forms take three weeks in place of one. `docs/inbound.md` Part 8 is updated to match.

| Week | Build | Done when |
|---|---|---|
| 9 | `039_forms.sql`, schema and validator, ops with undo, the web component and hosted page, manual builder, consent, spam, submissions, the outbox, destinations: Claritia, HubSpot, Salesforce, Omniscient, Slack, Google Sheets, webhook; delivery log and replay | A form built by hand lands in HubSpot and Slack once, through a HubSpot outage test |
| 10 | Brand scan on the runner, brand kits, contrast and look check, the AI chat with every tool, templates, the Test button, MCP form tools | From a site address and one sentence, a form that matches the site is live in under a minute on 5 of 5 test sites |
| 11 | After submit: router hook, in-form native calendar slot, outside schedulers (Calendly, Cal.com, HubSpot Meetings, SavvyCal, Chili Piper) with tracking ids; push for Pipedrive, Attio, Close; Zoho and Dynamics; captured forms with adapters; React SDK; Funnel QA for forms | A Calendly booking from the form ties to its lead by id; a captured HubSpot form routes and books |

The native calendar inside the form needs `docs/inbound.md` I5. Until I5 lands, week 11 ships the slot with a test calendar, and it goes live with I5.

## Part 14. Monthly cost

### 14.1 Per team per month

Assumptions: 4 forms built or edited by chat a month (about 15 turns each), 1 brand scan and 1 rescan, 500 submissions with 3 destinations each, daily Funnel QA on 3 forms.

| Item | Use | Per team |
|---|---|---|
| Chat builder | Sonnet, about 60 turns, about 12,000 tokens in (mostly cached) and 800 out each | $1 |
| Look check | Sonnet with 2 images, 2 a month | under $0.10 |
| Field map suggestions | Haiku, a few a month | under $0.10 |
| **Claude subtotal** | | **About $1.20** |
| Brand scans | Runner, about 2 minutes each | under $0.10 |
| Form Funnel QA | Runner, 3 forms a day, about 30 seconds each | about $0.50 (check) |
| Deliveries | 1,500 jobs on `claritia-intel` | within current machines |
| Turnstile | Free tier | $0 (check) |

Claude prices from `docs/marketing-platform.md` Part 11.

### 14.2 Added to the monthly bill

These lines come on top of `docs/inbound.md` Part 10, which already counts `collect` for submits.

| Line | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Claude ($1.20 per team) | $60 | $600 |
| Runner time for brand scans and form QA | $25 (check) | $250 (check) |
| Edge cache for the form script and schemas (Cloudflare in front of `collect`) | $0 (free plan, check) | $20 (check) |
| Supabase: submissions, deliveries and ops | $0 (within plan) | $15 (check) |
| Sign-in apps for new CRMs (Zoho, Dynamics and the rest) | $0 | $0 |
| **Added by the form builder** | **About $85** | **About $885** |
| **Per team** | **About $1.70** | **About $1.77** |

## Part 15. Open checks

| Check | Owner |
|---|---|
| Each outside scheduler's prefill, tracking param and webhook fields (Part 8 table) on a real account | Build |
| HubSpot upsert by email and the form submission API limits | Build |
| Salesforce `Sforce-Auto-Assign` on the REST API | Build |
| Zoho, Dynamics, Copper, Freshsales, monday CRM sign-in apps | Founder, one per week ahead of its build |
| Licenses for referencing customer-hosted fonts from the hosted page | Lawyer |
| Each named form adapter's success event (HubSpot, Marketo, Webflow, Typeform) | Build |
| `f.tryclaritia.com` and `forms.tryclaritia.com` DNS and certificates | Founder |
