# Brand capture

Status: built, 1 November 2026. Every form and booking page wears the customer's brand from the first minute, and the brand book follows within a minute.

## How the look is captured

1. **The quick read, on the web server, in seconds.** The moment a site is entered (onboarding's "Learn my brand",
   New form, Settings › Brand), `/api/forms/scan` reads the home page and up to six stylesheets
   (`src/lib/brand/quick.ts`, `fetchSite.ts`). It finds:
   - colors: brand colors the CSS names (`--color-primary`, `--brand`…), the filled button, links, the theme color,
     and for builder sites (Framer, Webflow, Wix) the color the page uses most in backgrounds, with builder defaults
     left out;
   - fonts: the body and heading fonts, the font the page's text uses most, and the Google Fonts link;
   - the button's text color, corners, weight and capitals, and the input corners;
   - the logo: only one named for the site, else the site's own app icon. Never a customer's logo.
   It saves the look on the kit at once (`brand_kit_quick`) and the kit is ready.
2. **The full scan, on the runner, in about a minute.** A real browser opens the site, reads computed styles and
   compares a form with the site's own (`worker/brandScan.ts`). Its look replaces the quick one. If it fails or the
   runner is down, the quick look stays and the kit is still ready.

Private addresses are refused at every redirect; each file has a size and time limit.

## The deep read and the brand book

Right after the quick read answers, the server keeps going (`after()` in the scan route, `src/lib/brand/bookServer.ts`):

1. **The rest of the site:** up to four more pages (pricing, services, product, about) and every stylesheet, ten at most.
2. **The deep read** (`src/lib/brand/deep.ts`), all from HTML and CSS:
   - every color with where it's used (backgrounds, text, fills, borders, buttons), builder defaults left out;
   - the fonts the text uses, by count, and the site's own font files (`@font-face`), plus any Google Fonts link;
   - the h1, h2, h3, h4, body and small type: family, size, weight, line height, letter spacing, capitals. A builder's
     text presets (the classes on the site's own headings) win over resets;
   - every button style: fill, gradient, label color (also when it's set on the text inside), border, corners,
     padding, weight, and the label it carries;
   - corners, shadows and gradients by use;
   - the logo: the inline SVG in the element named or classed as the logo (sprite references drawn in), cleaned to
     drawing parts only; else a picture named for the site; plus the favicon, touch icon and share picture;
   - pictures, headlines, calls to action, menu, paragraphs, social links and emails.
3. **The brand book** (`src/lib/brand/book.ts`): Claude Sonnet reads the deep read and writes colors by role (primary,
   secondary, accent, background, surface, text, muted, border, dark) with names, the heading and body type and
   scale, primary and secondary buttons (gradient kept), corners, shadow, imagery, voice (tone, words, words to
   avoid, real CTA labels) and rules. Any color or font the site doesn't use is dropped.
4. **Saved on the kit** (`108_brand_book.sql`): the book, the font files, the logo SVG, and tokens made from the book.
   The site's own fonts are served at `/api/brand/fonts/<kit>` so forms and booking pages load them like Google Fonts.
   The runner's browser scan then fills only what the book left out.

The AI form builder reads the book (and waits up to 45 seconds for one being written): it writes in the brand's voice,
uses its real button labels, and may use its button gradient in a hero. Settings › Brand shows the whole book.

## The workspace's brand

`workspaces.brand_kit_id` is the workspace's brand: the first site it reads (onboarding) unless changed in
Settings › Brand. It's used by:

| Where | Which kit |
|---|---|
| New form (AI builder) | The kit for the site typed in, read now if there isn't one; with no site, the workspace's brand |
| Blank and starter forms | The workspace's brand |
| Booking pages (public) | The form's kit when opened from a form, else the workspace's brand (`book_kit`) |
| Booking page and meeting editor in the app | The workspace's brand (`src/lib/brand/workspaceKit.ts`) |
| HTML sections the AI writes | The form's kit, through its variables (never fixed colors) |

Settings › Brand shows the brand's logo, colors, fonts and a sample button; Read again after a redesign; Use another
site; and Use as brand for any other site read before.

## Where

| Piece | Where |
|---|---|
| Reading HTML and CSS | `src/lib/brand/quick.ts` |
| Fetching the site safely | `src/lib/brand/fetchSite.ts` |
| Scan route (quick read, then the runner) | `src/app/api/forms/scan/route.ts` |
| Workspace brand, quick save, kept look on a failed scan, booking pages | `supabase/migrations/107_brand_capture.sql` |
| Settings › Brand | `src/components/app/views/BrandSettings.tsx` |
| Tests | `tests/brandQuick.test.ts`, `tests/pg/brandCapture.pg.ts` |

Checked by hand on momos.com (Framer: red #d73e33, Poppins, text #15181e), stripe.com, calendly.com, webflow.com,
framer.com, lemonade.com, notion.so and tryclaritia.com.

## Running cost

The quick and deep reads are HTTP requests from the web server. The brand book is one Claude Sonnet 5.5 call per site
read: about 6,000 tokens in and 2,000 out, so about $0.03. Sites are read at onboarding and on Read again, so about
two a team a month; the same read replays from the step cache.

| | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Claude: brand books, 2 a team a month at $0.03 | $3 | $30 |
| Web server time and bandwidth (existing machines) | $0 | $0 |
| **Added monthly** | **about $3** | **about $30** |
