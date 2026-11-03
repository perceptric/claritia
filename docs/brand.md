# Claritia brand

**Version 4, 3 November 2026.** The calm style, after zite.com. Replaces version 3 (flat cards on hairlines, black
primary, pill everything). The full guide, with every token, component preview and logo file, is the Claritia design
system: https://claude.ai/artifact/2ZKbX3ATfS3Fr7LnEVTUkA. tryclaritia.com follows the same guide (`claritia-site`,
its `BRAND.md`).

In short: Inter for every word, a light gray shell with a white page panel, soft ring shadows in place of borders, a
dark gray pill for the one primary action and Claritia green as the one signal.

Claritia's motif is still the **corner bracket** from its mark (the Catch in `src/components/app/Catch.tsx`).

---

## 1. Tokens

All tokens live in `src/app/globals.css` under `@theme`, with dark values under `[data-theme="dark"]`. Screens use
tokens only, never a hex. Old names still work and point at the new values.

### Color

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `paper-deep` | #f5f5f5 | #161614 | The shell and the side rail |
| `paper` | #fafafa | #1a1a18 | The work area inside the page panel, quiet wells, row hover |
| `card` | #ffffff | #1f1f1d | The page header bar, cards, inputs, menus |
| `chip` | #ededed | #2c2c29 | Gray tags |
| `ink` | #0f0f0f | #f5f5f0 | Headings and titles |
| `text` | #171717 | #e8e8e3 | Body text and table cells |
| `body` | #333333 | #d9d9d4 | Nav items, secondary text on buttons |
| `muted` | #737373 | #9a9a95 | Labels, counts, second lines |
| `faint` | #a3a3a3 | #6b6b67 | Hints and placeholders |
| `line`, `line-strong` | #ebebeb, #d4d4d4 | #2c2c29, #3d3d39 | Dividers inside cards and tables |
| `brand`, `on-brand` | #333333, #ffffff | #f5f5f0, #171717 | The primary button |
| `signal` | #0c8c5e | #0c8c5e | The mark, live lines, the open sidebar icon, focus, toggles |
| `signal-strong` | #0a7a52 | #0a7a52 | Green fills that carry white text (#0c8c5e on white is 4.3:1) |
| `signal-text`, `signal-soft` | #086444, #e3f4ec | #5fc79a, #12301f | Green text and its fill: the open tab, Live tags |

Status pairs keep their names (a soft fill and a deep text): `sage` green for live and booked, `butter` orange for
waiting and paused, `rose` red for errors, `sky` blue for kinds and information, `lilac` purple for AI and tests.

About 5% of a view is green. Other hues only mean status. No gradients.

### Type

Inter for every word. Mono only for code, keys and ids; numbers use Inter with tabular figures (`.num`).

| Role | Size and tracking | Weight |
| --- | --- | --- |
| Page title (header bar) | 15px, -0.01em | 500 |
| Greeting and card titles | 16 to 18px, -0.01em | 500 |
| First-screen title | 38px, -0.035em | 500 |
| Stat | 22px, -0.02em | 500, tabular |
| Body, cells and UI | 13 to 14px | 400 to 450 |
| Label | 12 to 13px, sentence case | 400 to 500, muted |

### Shape

| Token | Value | Use |
| --- | --- | --- |
| `rounded-full` | 9999px | Buttons, chips, toggles, avatars, segmented controls |
| `rounded-sm` | 6px | Status tags (`Badge`) |
| `rounded-md` | 8px | Inputs, tabs, small controls |
| `rounded-lg`, `rounded-xl` | 10px, 12px | Cards, tables, menus |
| `rounded-2xl` | 16px | Dialogs and first-screen frames |

### Depth

Raised things sit on a ring shadow in place of a border:

| Token | Use |
| --- | --- |
| `shadow-rest` | Cards, tables, the page panel |
| `shadow-hover` | A card under the pointer, the one frame a screen is about |
| `shadow-chip` | Tabs, the open sidebar item, search, small chips |
| `shadow-outline` | Secondary buttons |
| `shadow-input`, `shadow-input-hover` | Inputs and pickers |
| `shadow-primary` | The primary button |
| `shadow-focus` | Focus: a 1px green ring in a soft green halo |
| `shadow-menu`, `shadow-modal` | Menus, popovers and dialogs |

Dividers inside a card (table rows, a card's header) stay as `line` hairlines.

### Motion

| Token | Value |
| --- | --- |
| `quick` | 150ms, hover and color |
| `calm` | 280ms, things arriving |
| `slow` | 380ms |
| `ease-calm` | cubic-bezier(.4,0,.2,1) |
| `ease-out` | cubic-bezier(.22,1,.36,1) |

Things arrive with a short rise (opacity and 6px). Everything stops under `prefers-reduced-motion`.

---

## 2. Base parts (`src/components/app/ui.tsx`)

| Part | Look |
| --- | --- |
| `Button` | Pill, 34px (28px small). Primary: `brand` fill with `shadow-primary`. Ghost and danger: `card` with `shadow-outline`. |
| `IconButton` | 32px circle with a tooltip. |
| `Badge` | 6px tag, 20px tall, soft fill and deep text, optional dot. |
| `Input` | 36px, 8px corners, `shadow-input`; focus shows `shadow-focus`. |
| `Panel` | `card`, 12px corners, `shadow-rest`. |
| `Tabs` | Small 8px chips with `shadow-chip`; the open one is `signal-soft` with green text. Inside a section they sit beside the page title. |
| `Segmented` | Gray pill track with a white thumb on `shadow-chip`. |
| `Toggle` | Pill; green (`signal-strong`) when on. |
| `Th`, `Td` | 13px cells, ink headers, hairlines between cells. |

## 3. Shell

The gray shell (`paper-deep`) holds the side rail and the page panel (12px corners, `shadow-rest`, 8px from the
edges). Each page has a white header bar: the title, the section's tabs beside it, actions on the right; the work
area under it is `paper`, so cards read as white on light gray. The rail has no group titles: Forms, Meetings and
Workflows at the top, Settings at the very bottom above the account row. The open item is a white chip on
`shadow-chip` with a green icon. "Create" is the rail's one dark pill.

## 4. Mark and pictures

- **Mark:** a green tile (`#0C8C5E`, 6px corners at 32px) with four white corner brackets and a check
  (`src/components/Logo.tsx`). Never recolor or redraw it.
- **The Catch:** `src/components/app/Catch.tsx`, on the sign-in screen.
- **Drawings:** `src/components/sketches/Sketch.tsx` on first screens and empty states.
- **AI:** the sparkle (`src/components/app/Ai.tsx`).

## 5. Outside the app

tryclaritia.com uses the same tokens and adds the website parts: the off-white page (#fafaf5) with framed rails, the
floating pill nav, the blinking green tile field, the prompt with its green ring, and the dark bands. Forms, booking
pages and emails a customer builds use the customer's design system instead.

## 6. Rules

- Use the tokens in `src/app/globals.css`, never a hex.
- Inter for every word.
- Buttons, chips and toggles are pills. Status tags 6px, inputs 8px, cards 10 to 12px, dialogs 16px.
- Raised things use ring shadows; dividers inside them stay hairlines.
- The dark gray pill is the one primary action. Green is the signal, about 5% of a view. No gradients. No emoji.
- The sparkle marks AI. Anything AI made gets the "AI" tag.
- Nothing spills out of its box at any width: rows of buttons wrap, long words truncate (`tests/overflow.test.ts`).
- Kept: no `<select>` or browser pop-ups, minimal copy, the `ToolIntro` pattern, running cost on every build.

## 7. Running cost

| Item | Beta (50 teams) | Growth (500 teams) |
| --- | --- | --- |
| Fonts (Inter, OFL, Google Fonts) | $0 | $0 |
| Shadows, tokens and drawings (CSS and SVG in the repo) | $0 | $0 |
| Claude tokens | $0 | $0 |
| **Added per month** | **$0** | **$0** |
