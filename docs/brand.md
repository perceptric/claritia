# Claritia brand

The look is **dark, wide and product-led on the marketing site**, and the **reverse — plain white paper — inside the product**. The marketing site is the reference for the aesthetic: think the `default.com` homepage (dark ground, a big product window, a logo marquee, gradient display type, rounded cards, soft glows, bento grids, thin section rails, a pill CTA). Claritia keeps its own logo, words, colors and assets; it does not copy anyone else's files, images or copy.

This file is the source of truth for the app, the website, emails and decks. Where an older rule (for example in `CLAUDE.md` or an Omniscient-derived doc) says "square, no gradients, no pills", this file wins.

---

## 1. The two surfaces

| Surface | Ground | Feel |
|---|---|---|
| **Marketing site** (`tryclaritia.com`, docs, decks, social) | **Dark.** `#0b0c0e` page, `#0e0f11`/`#121315` cards, `#1f1f21` hairlines, white text. | Wide, premium, product-led. Big product windows, glows, gradient headlines, generous space. |
| **Product / app** (`app.tryclaritia.com`) | **Light.** White paper `#ffffff`, `#fafafa` canvas, warm-gray hairlines, black ink. | Calm lab-notebook. Quiet chrome, dense tables, minimal decoration so the data reads. |

The two are the *same shape language* (radii, spacing, type), just inverted in value. A component is designed once and rendered light in the app and dark on the marketing site.

---

## 2. Design principles

1. **Product in the hero.** Lead with the real thing: a photo-accurate window of the app — sidebar, table, a live row — not an abstract illustration.
2. **One loud idea per screen.** A single gradient headline, a single glow, a single accent. Everything else is quiet.
3. **Dark and quiet, not neon.** Glows are low-opacity and diffused. Never a bright glow behind text.
4. **Rounded, but disciplined.** 16px cards, 12px inner surfaces, 10px controls, full-round pills only for buttons and the announcement bar.
5. **Hairlines over boxes.** Prefer a 1px rail at low opacity to a heavy border or a shadow. Shadows are for things that float (windows, popovers), never for resting cards.
6. **Mono for machine, display for message.** Display type for the message, Geist Mono for labels, numbers, keys and IDs.
7. **Copy is plain and short.** Sentence case, speak to the user as "you", no hype, no emoji.

---

## 3. Colour

### 3.1 Marketing (dark)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0b0c0e` | Page ground |
| `--bg-raised` | `#0e0f11` | Cards, tiles |
| `--bg-tile` | `#121315` | Nested tiles, testimonial cards |
| `--bg-input` | `#17181a` | Fields, mock surfaces |
| `--line` | `#1f1f21` | Hairlines, rails, card borders |
| `--line-strong` | `#2a2b2e` | Hover borders, focus ring base |
| `--fg` | `#ffffff` | Primary text |
| `--fg-70` | `rgba(255,255,255,0.70)` | Body |
| `--fg-50` | `rgba(255,255,255,0.50)` | Labels, meta |
| `--fg-40` | `rgba(255,255,255,0.40)` | Faint, disabled |
| `--brand` | `#3b82f6` | Accent, links, the one highlighted word |
| `--brand-strong` | `#60a5fa` | Gradient end, hover |
| `--glow` | brand at 8–16% | Radial glows behind the hero and feature art |

### 3.2 Product (light)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#ffffff` | Page ground |
| `--canvas` | `#fafafa` | Section alternation, table stripes |
| `--line` | `#eaeaea` | Hairlines |
| `--line-strong` | `#dadad6` | Hover |
| `--ink` | `#0c0c0b` | Primary text |
| `--body` | `#4a4a46` | Body |
| `--muted` | `#6f6f6b` | Labels |
| `--faint` | `#a3a39e` | Faint |
| `--brand` | `#266df0` | Accent, buttons |

### 3.3 Status tones (both surfaces)

Passed/positive `#22c55e`, failed/danger `#f87171`, warning `#f59e0b`, violet/AI `#a78bfa`, info `#60a5fa`. On dark, use the tone at ~12% as a fill and the tone itself for text (`bg: color-mix(in oklab, tone 12%, transparent)`). On light, use the soft fills from the app (`--success-soft` and friends).

---

## 4. Type

- **Geist** for everything read. **Geist Mono** for labels, keys, numbers, IDs, `//` captions.
- Display headlines are large, tight and medium-weight, with negative tracking:
  - Marketing H1: `clamp(2.75rem, 6vw, 4.75rem)`, `line-height: 1.03`, `letter-spacing: -0.035em`, weight 500.
  - Section H2: `clamp(2rem, 4vw, 3rem)`, `letter-spacing: -0.03em`.
- Body: 16–19px, `line-height: 1.6`, colour `--fg-70` on dark / `--body` on light.
- Labels (`label-mono`, `fig`): 10–12px, uppercase, `letter-spacing: 0.14em`, mono, in `--fg-50`.
- **Gradient display type:** the marketing headline may use the brand gradient (`#ffffff → #60a5fa`, 90deg) via `background-clip: text`. Maximum one gradient headline per screen; never gradient body text.

---

## 5. Shape, space, depth

- Radii: `--r-lg: 16px` cards, `--r-md: 10px` controls, `--r-sm: 8px` tags/inner, `9999px` pills.
- Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128.
- Marketing content column: `max-width: 1248px`.
- **Rails:** every large marketing section sits inside two 1px vertical rails at `--line`, mirroring the content column. This is the signature frame.
- **Section rhythm:** alternate `--bg` and `--bg-raised`; separate with a 1px top rail.
- **Depth:** resting cards get a 1px border and no shadow. Only floating things (product windows, popovers, dragged cards, the announcement pill) get a shadow: `0 0 0 0.5px rgba(255,255,255,0.14), 0 8px 40px rgba(0,0,0,0.32)`.

---

## 6. Components

### 6.1 Header (marketing)
- Sticky, translucent dark: `rgba(11,12,14,0.8)` + `backdrop-filter: blur(12px)`, 1px bottom rail that appears once scrolled.
- Logo left, nav centre-left (70% white, 100% on hover), right: a quiet "Sign in" plus a pill CTA.
- On the app: sticky white, same layout, ink text.

### 6.2 Buttons
- **Primary (marketing):** solid white pill, ink text. Hover: 92% white.
- **Primary (app):** solid ink (`#0c0c0b`) with `--r-md`, white text.
- **Secondary:** transparent with a `--line-strong` border, white/ink text.
- **Ghost on dark:** `rgba(255,255,255,0.08)` fill, white text.
- Sizes: `sm` 36px, `md` 40px, `lg` 48px. Pills padding `0 20px`. Arrow nudges 2px on hover.

### 6.3 The product window (the signature hero art)
A dark app window: `--r-lg`, `bg #17181a`, a 0.5px inner light ring, a top bar with three traffic dots, a collapsible sidebar with nav items, a content area with a table/chart, and 1–3 **floating cards** pinned over the edges (a record card, a terminal, an approval). It is built in HTML/CSS (sharp at any size, loads fast). On the app side the same window is drawn light.

### 6.4 Cards and bento
- Card: `--r-lg`, `--bg-raised`, 1px `--line`, padding 24–32px, no shadow. Hover lifts the border to `--line-strong` (no movement, no scale).
- Bento: a 6-column grid on desktop (wide 4, tall 2, split 3/3), tighter 8–10px gutters, every tile rounded.
- Each bento tile carries a small product mock in its lower half, bleeding to the card edge.

### 6.5 Section rails and header
- Every section: two vertical rails at the content column, `--line`.
- Eyebrow: mono label in `--fg-50` (e.g. `// How it works`).
- Optional announcement: a full-round pill, centred, translucent, with a dismiss ✕.

### 6.6 Logo marquee
A single row of monochrome logos at ~30% opacity, scrolling slowly, masked at both edges. Never colour, never boxes.

### 6.7 Tags and states
- Pill tags, `--r-sm` (8px), mono uppercase, 10px, `letter-spacing: 0.06em`.
- State = fill at 12% + tone text. Examples: `PASSED` green, `FAILED` red, `HEALED` violet, `CACHED` neutral, `RUNNING` brand, `FLAKY` amber, `NEEDS APPROVAL` amber.

### 6.8 Code and terminal
Dark code window: `#0f1113` ground, `--r-lg`, traffic dots, keys `#7fa8f7`, strings emerald, numbers amber, dim comments at 40%. The same block renders light in the app.

### 6.9 Footer
- Two rails, a hairline above the legal row.
- Left: logo + one line + a status pill + a "Summarize with AI" link row (open in ChatGPT / Claude / Perplexity).
- Right: link columns (Product, Suite, Company).
- A large, very faint brand wordmark or halftone dot field may sit at the very bottom.

---

## 7. Motion

- Fades and 12px rises on enter (`opacity` + `translateY`), 0.6s `cubic-bezier(0.22,1,0.36,1)`.
- A slow pulse on live dots; a gentle marquee on the logo row.
- Depth on scroll only for the hero window (a subtle rise), never parallax chaos.
- Always honour `prefers-reduced-motion: reduce` (kill fades, pulses and the marquee).

---

## 8. Logo

- The mark: a check inside a viewfinder (the four corner marks), white stroke on a rounded `--brand` square. Wordmark: "Claritia" in Geist 500, `-0.02em`.
- On dark, the mark may be white-on-transparent or the brand square; on light, the brand square. Never recolour to anything but brand or mono.

---

## 9. Copy voice

- Plain words, short sentences, sentence case, "you".
- Marketing leads with the outcome ("Turn website visitors into meetings"), the app leads with the label.
- No hype words, no exclamation marks, no emoji, no "revolutionary/effortless".
- Every AI claim on the marketing site is one the product can prove.

---

## 10. Do / Don't

**Do**
- Lead each surface with the product window.
- Keep one glow and one gradient headline per screen.
- Use `--r-lg`/`--r-md`/`--r-sm` and the rail frame everywhere.
- Invert cleanly: dark marketing, light app.

**Don't**
- Don't put shadows on resting cards.
- Don't use sharp 0px corners, heavy borders, or pill-shaped cards (pills are for buttons and the announcement only).
- Don't use more than one accent hue in a view.
- Don't use emoji, stock illustrations, or a second display typeface.
- Don't copy another company's files, images, logos or copy — take direction, build our own.
