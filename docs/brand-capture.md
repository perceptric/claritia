# Brand capture

Status: built, 1 November 2026. Every form and booking page wears the customer's brand from the first minute.

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

No model calls. The quick read is a few HTTP requests from the web server per site read (once at onboarding, then
only on Read again or a new site).

| | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Web server time and bandwidth (existing machines) | $0 | $0 |
| **Added monthly** | **$0** | **$0** |
