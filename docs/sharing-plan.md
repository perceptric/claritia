# Sharing forms and meetings

Every way a form or a meeting gets in front of people, after Typeform and Fillout. Built in four steps, all done.

| Format | What it is | Step |
|---|---|---|
| Link | `/f/<form id>`; a meeting's `/book/<workspace>/<type>` | Built |
| Link ending | `/f/<workspace>/demo-request`; the id link always keeps working | 2, built |
| Workspace subdomain | `acme.tryclaritia.com/demo-request` | 4, built (on after setup) |
| Custom domain | `forms.acme.com/demo-request`, one DNS record, paid plans | 4, built |
| Link preview | Title, line and picture for chats and social posts | 2, built |
| QR code | PNG or SVG, always to the id link, so a printed code never breaks | 2, built |
| Email | Send the link; the first question inside an email, each answer a button | 2, built |
| In the page | `<claritia-form form-id="…">` | Built |
| Full page | `full`: the form fills the page | 1, built |
| Popup | `popup="click\|delay:N\|exit"`, `size="s\|m\|l"`, opened by `data-claritia-open` | 1, built |
| Slider | `slider="left\|right"`, full height from that side | 1, built |
| Popover | `popover`, a round button in the corner, `icon="chat\|calendar\|form\|logo"`, `note="…"` | 1, built |
| Side tab | `side-tab="Contact us"`, a tab on the right edge | 1, built |
| On phones | Over the page, each fills the screen; `mobile="keep"` keeps the box | 1, built |
| Developers | `Claritia.open()`, events, `@claritia/embed` with React components, a docs page | 3, built |

## Step 1 (built)

- The code: `src/lib/share/embed.ts` writes it for every mode (tested in `tests/shareEmbed.test.ts`). The element reads
  the attributes (`src/lib/forms/element.ts`, `put` and `launcher`); the meeting calendar is `<claritia-book>`
  (`src/lib/meetings/bookElement.ts`).
- Form › Share › Website: six tiles (In the page, Full page, Popup, Slider, Popover, Side tab), a live preview, the
  picked one's few settings, and the code with a builder dropdown (Webflow, WordPress, Framer, Squarespace, any site;
  each one's steps in the dropdown). See docs/form-ui-plan.md step 3.
- Form Studio: the form page's header (docs/form-ui-plan.md) shows Share once the form is live and unchanged.
- Meetings: Share on each meeting type's card and in its panel (`src/components/app/scheduling/ShareMeeting.tsx`):
  the link, its calendar on a website (in the page, a floating button, the site's own link or button), and for an
  email the next free times or a single-use link.
- A Form Studio page over the page used to draw in the page whatever the code said; it now opens like every form. A
  closed slide-in or popover could still show; `.pop[hidden]` now always wins.
- `scripts/embed-check.ts` runs every mode in Chromium on a desktop and a phone width, with the real script.
- The script is 38 KB gzipped at most (`scripts/build-forms.mts`).

## Step 2 (built)

Form › Share's left list is Link, On your website, Email, QR code and Your own form.

- **Link ending** (`supabase/migrations/117_form_links.sql`): `/f/<workspace>/<ending>`, the workspace's name the
  same one its meeting links use. An ending is the workspace's alone. A changed or removed one redirects to the
  current link for 90 days and no other form can take it meanwhile. Only members set one. The page:
  `src/app/f/[id]/[slug]/route.ts`.
- **Link preview**: `share { title, description, image }` on the form (`cleanShare`, the `set_share` op), written as
  `og:` and `twitter:` tags on the form's page (`src/lib/forms/formPage.ts`, `previewTags`). Form Studio keeps it on
  save.
- **QR code**: drawn in the browser (`QrCode` in `src/components/app/meetings/Share.tsx`), PNG or SVG, always to the
  id link.
- **Send the link** (`/api/forms/share-email`): up to 50 addresses, one short email from the team with the form's
  link, through the send pipeline (a verified From domain, the pause, suppressions); each address once
  (`email_queue_to`); a few sends a minute per workspace.
- **The form in an email** (`src/lib/share/emailForm.ts`): the first question when it's a pick list (10 answers at
  most) or a rating, each answer a button to `?clr_a=<field>:<answer>`. The form fills it, skips the cover and moves
  on when the first step has only that question; a Form Studio page checks it. An answer deleted since the email
  went out opens the form as it is. Copy for Gmail or Outlook (rich) or the HTML.
- Tests: `tests/shareLinks.test.ts`, `tests/pg/formLinks.pg.ts` (endings, the 90 days, members only, two saves at
  once, the email queue), `scripts/embed-check.ts` (the email's answer in a real browser).

## Step 3 (built)

The developer kit, in `docs/embed.md` and on the site at `/developers/embed` (`src/app/developers/embed/page.tsx`).

- **window.Claritia** (`src/lib/embed/api.ts`, in forms/v1.js): `open` (a form over the page, made when the page has
  none; a meeting's calendar), `close`, `prefill` (by question key, waiting for the form to load), `on`. Calls made
  before the script loads (`window.Claritia = { q: [...] }`) run once it's there.
- **Events** from `<claritia-form>`: `claritia:ready`, `:step`, `:open`, `:close`, `:submitted`, `:booked`, bubbling
  to the document; `<claritia-book>` sends `:booked`.
- **@claritia/embed** (`packages/embed`): the script loader, `open`/`close`/`prefill`/`on`, and the React
  components `<ClaritiaForm>` and `<ClaritiaBook>` with the events as props. It writes the same attributes as the
  Share tab (checked in `tests/shareEmbed.test.ts`); CI builds it (`npm run build:embed`). Publishing to npm is one
  `npm publish` from `packages/embed` with the team's npm account.
- `scripts/embed-check.ts` runs the API, the events, the queue and the React components in Chromium.
- The script is 39 KB gzipped at most.

## Step 4 (built)

Links on the workspace's own address, in Settings › Link domain (`src/components/app/views/LinkDomainSettings.tsx`).

- **What a link host serves** (`src/lib/domains/hosts.ts`, `linkPath`): `/` and `/book` the team's booking page,
  `/book/<type>` a meeting type, `/book/l|m|p/<token>` single-use, manage and poll links, `/<ending>` a form by its link
  ending. Everything else is "Page not found." The app is never served there. `src/proxy.ts` rewrites the path and
  marks the request, so a moved ending redirects to `/<ending>` on the same host and the link preview names that host.
- **Subdomain**: `<workspace>.tryclaritia.com`, the workspace's booking name. Reserved names (app, www, api, mail and
  others) are never a workspace's. Served only when `LINK_SUBDOMAINS=1`.
- **Custom domain** (`supabase/migrations/118_link_domains.sql`): one per workspace, owners only, paid plans. A
  subdomain of a domain the team owns (`forms.acme.com`), never a bare domain or ours (`src/lib/domains/hostname.ts`).
  One CNAME to the app's Fly address. Adding it asks Fly for a certificate (`src/lib/domains/fly.ts`); Check now
  looks at DNS and the certificate. It serves only while Live: DNS points at us and the certificate is issued
  (`nextState` in `src/lib/domains/check.ts`).
- **Re-check** (`worker-intel/jobs/linkDomains.ts`): every 30 minutes the worker checks domains not checked in 25
  minutes, 20 at a time, under one lock. A domain whose DNS moved away stops serving; pointed back, it serves again.
  The proxy caches each host for 60 seconds; a removed domain is forgotten at once.
- **Where the address shows**: Form › Share › Link, Meetings › Share and "Send the link" use the live custom domain,
  else the subdomain when on, else the usual link. QR codes keep the id link.
- Tests: `tests/linkDomains.test.ts` (hosts, paths, hostnames, DNS, states, Fly calls, the cache, the proxy),
  `tests/pg/linkDomains.pg.ts` (one host one workspace, only active serves, members read only, the re-check, two
  workers at once).

Setup (once):

1. Apply `118_link_domains.sql`.
2. `fly tokens create deploy -a claritia-web`, then `fly secrets set FLY_API_TOKEN=<token> -a claritia-web` so custom
   domains get certificates.
3. Subdomains: DNS `*.tryclaritia.com` CNAME to `claritia-web.fly.dev`, `fly certs add "*.tryclaritia.com" -a
   claritia-web` (it asks for one more DNS record), then `fly secrets set LINK_SUBDOMAINS=1 -a claritia-web`.

## Step 5: where each fill came from (built)

Every way Share gives a form out tags its fills, with no UTM tags to type (`src/lib/share/channels.ts`):

| Channel | How the form knows |
| --- | --- |
| Link | the hosted page (`/f/...`, marked `hosted`) |
| QR code | the code's link carries `?via=qr` |
| Email | Share's email, the form in an email and every form link in a Claritia email carry `?via=email` |
| Personal link | a personal link's token the server checked (Step 6) |
| Website, by style | the embed's own mode: in the page, full page, popup, slider, popover, side tab; the old `/f/embed.js` frame counts as in the page |
| Your own form | a form that reads the site's own form |

- The form script works it out (`channel()` in `src/lib/forms/element.ts`) and the server keeps it with the fill as
  `channel`, beside the UTM tags (`src/lib/forms/submit.ts`). "Personal link" and "Your own form" are never taken on
  the browser's word. A fill from before channels has none.
- **Submissions**: a Came from row of chips, each with its fills and the meetings they booked, and a click shows only
  those (`form_fill_channels` and the `channel` filter, 124). A fill's panel says how it came.
- **Routing**: a Form channel condition (`lead.channel`), beside the UTM ones.
- **Exports and tools**: the CSV export has a `channel` column, and a sheet, Airtable or Notion row a Came from column.

## Step 6: personal links (built)

A form link for one person, which fills in what Claritia knows about them (`src/lib/share/personal.ts`):

- **The token**: the link holds a signed token for the workspace and the contact (or, for an address with no contact
  yet, the email), good for 90 days. Never their details. A token that's been changed, is past its date, was made with
  another key or belongs to another workspace reads as none, and the form opens empty: a forwarded or edited link can't
  fill in someone else's details or send as them.
- **What's filled in**: only the contact questions the form asks (email, names, title, phone, company, website,
  country, region), from the contact and their company, still open to change (`src/lib/share/known.ts`). A deleted
  contact gives nothing. The form's answer with a token is never cached.
- **Where they come from**: Share › Personal link makes one for an email (`/api/forms/personal-link`). And every link
  to one of the workspace's forms in a Claritia email (workflows, Share's email) opens as the reader's personal link:
  the click redirect adds the token for that message's contact (`src/app/c/[token]/route.ts`). Anything that goes wrong
  there sends them to the plain link.
- **The fill**: counts as Personal link, or as Email when it came by email (marked as personal too). The answer always
  decides the contact: someone who types another email is that other person.

## Step 7: Share after Fillout (built)

- **Share's list**: Link, Website, Embed HTML (Studio pages), Email and QR code. Personal link and Own form are off
  the list. Personal links still work underneath: every form link in a Claritia email opens as the reader's own, and
  forms that already read a site's own form keep doing so.
- **Website**: In the page takes a width (fill the space, or fixed, never past the space it's in) and a height (fit
  the form, or fixed with the form scrolling inside). The site builders are Webflow, WordPress, Framer, Squarespace
  (an Embed block, any plan), Shopify and any site, each with numbered steps under the code, and the site's footer
  code for the ones over the page. A box that sizes to fit what's in it (Framer's Fit) keeps the form 640 px wide.
- **Embed HTML**: HTML + CSS in one block (the brand's stylesheet, the form's, then its HTML), or HTML, CSS or Brand
  CSS alone.
- **Email** (`src/components/app/forms/SendEmail.tsx`, `src/lib/share/people.ts`): To is chips. People Claritia
  knows are suggested as you type; Add people adds everyone who filled this form, a meeting type's guests, a CSV or a
  pasted list (the addresses are picked out of any text). From is you (your name on the team's address) or the team,
  then Subject and Message, up to 200 people a send. Each send remembers its form (`125_share_sends.sql`), and the
  last sends show each person as Not started, In progress (opened the link), Finished (sent the form after the email)
  or Not delivered (bounced, refused or skipped).
- **Settings › Access** (`src/lib/forms/access.ts`): Pause the form, Opens on, Closes on, Stop after this many fills
  (real fills, spam and tests aside) and the closed message, which a paused form shows too. The form read says it's
  closed; the send checks again, so a page loaded before the close can't slip a fill in. A fill count that can't be
  read leaves the form open, and a Funnel QA test still goes through.

## The screens (after the four steps)

- A form's Share tab opens on Link: the link in full (the ending link when there is one) with Copy link and Open,
  the ending in one box after its address (Enter saves, Escape puts it back), the id link, Your own domain (owners,
  until one is live, to Settings › Link domain), Fill in from the link, and the link preview drawn as a chat shows it
  while it's typed.
- Code to paste sits in a box with its own bar: the site builders on the left, Copy code on the right, so the button
  never covers the code (`src/components/app/SharePieces.tsx`).
- Email names an address that isn't one and counts the rest; Send waits until they're all good.
- A meeting's Share: Link has its QR code (PNG or SVG); In an email adds the signature line.
- Settings › Link domain: when it was last checked, and a copy on the record's name and value.
- `scripts/share-check.ts` runs it all in Chromium on a desktop and a phone width.

## Monthly cost

| Stage | Steps 1–3 | Step 4 (domains) | Total |
|---|---|---|---|
| Beta (50 teams) | $0 | about $1: a wildcard certificate, about 10 custom domains on Fly, first 10 free then $0.10 each (check) | about $1 |
| Growth (500 teams) | about $1 for "Email the link" sends on Resend, inside the current plan (check) | about $10, about 100 custom domains (check) | about $11 |

No Claude calls. QR codes and email HTML are made in the browser.

Step 7 adds $0 a month at Beta (50 teams) and Growth (500 teams): the emails go through the current sender (Resend,
inside the current plan, check), the people lists are reads the VPS database already serves, and a form with a fill limit
counts its fills once per read and send. No Claude calls.

Steps 5 and 6 add $0 a month at Beta (50 teams) and Growth (500 teams): one more value on each fill, a signed token
made with the key the server already has, and a lookup of one contact when a personal link opens. No Claude calls.
