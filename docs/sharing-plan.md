# Sharing forms and meetings

Every way a form or a meeting gets in front of people, after Typeform and Fillout. Built in four steps; step 1 is
done.

| Format | What it is | Step |
|---|---|---|
| Link | `/f/<form id>`; a meeting's `/book/<workspace>/<type>` | Built |
| Custom ending | `/f/demo-request`; the id link always keeps working | 2 |
| Workspace subdomain | `acme.tryclaritia.com/demo-request` | 4 |
| Custom domain | `forms.acme.com/demo-request`, one DNS record, paid plans | 4 |
| QR code | PNG or SVG, always to the id link, so a printed code never breaks | 2 |
| Email | Send the link; the first question inside an email, each answer a button | 2 |
| In the page | `<claritia-form form-id="…">` | Built |
| Full page | `full`: the form fills the page | 1, built |
| Popup | `popup="click\|delay:N\|exit"`, `size="s\|m\|l"`, opened by `data-claritia-open` | 1, built |
| Slider | `slider="left\|right"`, full height from that side | 1, built |
| Popover | `popover`, a round button in the corner, `icon="chat\|calendar\|form\|logo"`, `note="…"` | 1, built |
| Side tab | `side-tab="Contact us"`, a tab on the right edge | 1, built |
| On phones | Over the page, each fills the screen; `mobile="keep"` keeps the box | 1, built |
| Developers | `Claritia.open()`, events, `@claritia/embed` with React components, a docs page | 3 |

## Step 1 (built)

- The code: `src/lib/share/embed.ts` writes it for every mode (tested in `tests/shareEmbed.test.ts`). The element reads
  the attributes (`src/lib/forms/element.ts`, `put` and `launcher`); the meeting calendar is `<claritia-book>`
  (`src/lib/meetings/bookElement.ts`).
- Form › Share › On your website: six tiles (In the page, Full page, Popup, Slider, Popover, Side tab), the picked
  one's few settings, the code, and steps for Webflow, WordPress, Framer, Squarespace and any site.
- Form Studio: Share beside Publish, once published, opens the form's Share tab.
- Meetings: Share on each meeting type's card and in its panel (`src/components/app/scheduling/ShareMeeting.tsx`):
  the link, its calendar on a website (in the page, a floating button, the site's own link or button), and for an
  email the next free times or a single-use link.
- A Form Studio page over the page used to draw in the page whatever the code said; it now opens like every form. A
  closed slide-in or popover could still show; `.pop[hidden]` now always wins.
- `scripts/embed-check.ts` runs every mode in Chromium on a desktop and a phone width, with the real script.
- The script is 38 KB gzipped at most (`scripts/build-forms.mts`).

## Monthly cost

| Stage | Steps 1–3 | Step 4 (domains) | Total |
|---|---|---|---|
| Beta (50 teams) | $0 | about $1: a wildcard certificate, about 10 custom domains on Fly, first 10 free then $0.10 each (check) | about $1 |
| Growth (500 teams) | about $1 for "Email the link" sends on Resend, inside the current plan (check) | about $10, about 100 custom domains (check) | about $11 |

No Claude calls. QR codes and email HTML are made in the browser.
