# Claritia brand

**Version 3, 29 October 2026.** Replaces the warm paper, Geist and sketchbook look of version 2. The app and
tryclaritia.com now share one look, in the same family as Omniscient: black and white with plain grays, Inter, black
for the one primary action, and emerald as the one signal.

Claritia's own motif is the **corner bracket** from its mark. Things that get caught (a lead, a form, the product)
sit inside four brackets. The website's hero picture, the Catch, shows it: visitors drift in, one lead runs the four
corners (Capture, Know, Route, Book) and a check draws.

---

## 1. Tokens

All tokens live in `src/app/globals.css` under `@theme`, with dark values under `[data-theme="dark"]`. Screens use
tokens only, never a hex. The old names still work and point at the new values, so older screens follow along.

### Color

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `paper-deep` | #f2f2f0 | #0a0a0a | The shell and the side rail |
| `paper` | #f7f7f5 | #111111 | Quiet bands, sunk wells, row hover, the open row |
| `card` | #ffffff | #161616 | The page panel and cards |
| `ink` | #0a0a0a | #fafafa | Headings, the primary button, links, focus |
| `body` | #404040 | #d4d4d4 | Body text |
| `muted` | #6b6b6b | #a3a3a3 | Labels and second lines |
| `faint` | #a3a3a3 | #737373 | Hints, the gray half of a two-tone title |
| `line`, `line-strong` | #e7e7e4, #d4d4d0 | #262626, #333333 | Hairlines, inputs |
| `signal` | #0c8c5e | #18e299 | The mark, live lines, scores, booked |
| `signal-text`, `signal-soft` | #0a7a52, #e8f5ef | #3ddca4, #0f2a20 | Green text and its tag fill |

Status pairs keep their names (a step 3 fill and a step 11 text): `sage` green for done and booked, `butter` orange
for waiting, `rose` red for errors, `sky` blue for information, `lilac` purple for AI. `clay` now points at emerald.

About 5% of a view is emerald. Other hues only mean status. No gradients anywhere.

### Type

Inter for every word, Geist Mono for eyebrows, keys, ids and numbers in tables.

| Role | Size and tracking | Weight |
| --- | --- | --- |
| Page title | 20px, -0.02em | 600 |
| First-screen title | 38px, -0.035em | 500, two tones |
| Card title | 14 to 16px | 500 to 600 |
| Stat | 30px, -0.04em | 500, tabular |
| Body and UI | 13 to 14px | 400 to 500 |
| Label | 12px, sentence case | 500, muted |
| Eyebrow | Geist Mono 11.5px, uppercase, 0.08em | 500, muted |

Big headings take two tones: a line break in a `ToolIntro` title puts the rest on its own line in `faint`.

### Shape

| Token | Value | Use |
| --- | --- | --- |
| `rounded-full` | 9999px | Buttons, tags, toggles, avatars, segmented controls |
| `rounded-sm`, `rounded-md` | 6px | Inputs and small controls |
| `rounded-lg` | 10px | Cards and menus |
| `rounded-2xl`, `rounded-3xl` | 16px | The page panel, first-screen frames, dialogs |

### Depth

Cards sit flat on a hairline, and the hairline darkens on hover. Shadows only on the page panel (`shadow-xs`), the
one frame a screen is about (`frame`, `shadow-heavy`) and things that float (`shadow-float`).

### Motion

| Token | Value |
| --- | --- |
| `quick` | 120ms |
| `calm` | 200ms |
| `slow` | 320ms |
| `ease-out` | cubic-bezier(.22,1,.36,1) |
| `ease-spring` | cubic-bezier(.34,1.56,.64,1) |

Only transform, opacity and stroke offset move. Everything stops under `prefers-reduced-motion` and shows its last
frame.

---

## 2. Base parts

| Part | Look |
| --- | --- |
| `Button` | Pill, 36px (32px small). Primary: `ink` fill. Ghost: `card` with `line-strong`. Press shrinks a little. |
| `IconButton` | 32px circle with a tooltip. |
| `Badge` | Pill, step 3 fill and step 11 text, optional dot. |
| `Input` | 40px, 6px corners, `line-strong`; focus turns the border `ink` with a soft ring. |
| `Panel` | `card`, 10px corners, `line` border, flat. |
| `Tabs` | Text tabs with a sliding `ink` underline. |
| `Segmented` | Gray pill track with a black thumb. |
| `Avatar` | Gray circle with dark initials. |
| `Loading` | Dots over gray rows that shimmer. |

## 3. Shell

A white panel (`card`, 16px, a hairline and `shadow-xs`) inset on the gray shell (`paper-deep`). The side rail has
plain icons and quiet gray labels. The open item is a white chip with a hairline and a faint shadow, like Omniscient.
Counts are small gray pills. "Create" is the rail's one black button.

## 3a. CRM screens, copied from Omniscient

- **Page header:** a 48px bar with a breadcrumb ("Contacts / Emma Lopez") at 13px, the page icon, actions on the right.
  A section's tabs sit in a 40px bar under it with a black underline.
- **Lists:** the table runs edge to edge under one filter bar. 40px rows, 12px gray headers, hairlines between cells,
  a 22px avatar and the name in the first column, the page count in the footer.
- **Records** (`src/components/app/records/RecordLayout.tsx`): at most 6xl wide. The main column has the picture,
  name and tags, "Title at Company", a strip of key numbers, the stages as one path of arrows like Salesforce
  (`StagePath`: done steps green with a check, the current one black, won green, lost red), then tabs (Timeline, Notes, Tasks,
  Changes and the rest). The 360px right rail holds the fields in folding groups (`FieldGroup`), each row a 132px
  label and the value with its source, then short lists of related records (`RelatedList`).

## 4. Mark and pictures

- **Mark:** an emerald tile (`#0C8C5E`, 6px corners at 32px) with four white corner brackets and a check
  (`src/components/Logo.tsx`). Never recolor it.
- **The Catch:** `src/components/app/Catch.tsx`, the website's hero picture, on the sign-in screen.
- **Drawings:** `src/components/sketches/Sketch.tsx`. A thin black line, a plain gray fill, emerald for the part
  that moves. They draw themselves in on first view. Used on first screens and empty states.
- **AI:** the sparkle in `lilac` (`src/components/app/Ai.tsx`).

## 5. Outside the app

The same colors and Inter are used on tryclaritia.com (the `claritia-site` repo, its `BRAND.md`), the plain HTML
pages (`src/app/u/[token]`, the meeting outcome page) and Claritia's own emails (`src/lib/meetings/emails.ts`,
`src/lib/alerts.ts`). Forms, booking pages and emails a customer builds use the customer's design system instead.

## 6. Rules

- Use the tokens in `src/app/globals.css`, never a hex.
- Inter for every word. Titles tight; big headings in two tones.
- Buttons, tags and toggles are pills. Inputs 6px, cards 10px, the page panel and dialogs 16px.
- Black is the one primary action. Emerald is the signal, about 5% of a view. No gradients. No emoji.
- Cards sit flat; shadows only on the page panel, the one frame and floating things.
- The sparkle marks AI. Anything AI made gets the "AI" tag.
- Kept: no `<select>` or browser pop-ups, minimal copy, the `ToolIntro` pattern, running cost on every build.

## 7. Running cost

| Item | Beta (50 teams) | Growth (500 teams) |
| --- | --- | --- |
| Fonts (Inter and Geist Mono, OFL, Google Fonts) | $0 | $0 |
| Drawings and the Catch (SVG and CSS in the repo) | $0 | $0 |
| Claude tokens | $0 | $0 |
| **Added per month** | **$0** | **$0** |
