# Claritia brand

The look: a warm paper background, Geist for every word, black pill buttons, soft round cards, and calm motion. AI is marked with a sparkle. Hand-drawn sketches fill first screens and empty states.

The idea in one line: **a sketchbook that works**. Every screen should feel like a page from a designer's notebook where the drawings move.

---

## 1. Tokens

All tokens live in `src/app/globals.css` under `@theme`, with the dark values under `[data-theme="dark"]`. Screens use tokens only, never a hex. The app picks light or dark from the computer and saves a choice made with the moon button or ⌘K (`claritia:theme`).

The v1 names still work and point at the new values, so older screens follow along: `panel` is `card`, `canvas` is `paper`, `side` is `paper-deep`, `brand` and `fire` are `clay`, `success` is `sage`, `warning` is `butter`, `danger` is `rose`, `violet` is `lilac`. Use the new names in new code.

### Color

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `paper` | #f2f1ed | #141413 | Page background |
| `paper-deep` | #e9e7e0 | #1c1c1a | Shell, side rail, sunk wells |
| `card` | #fbfaf7 | #1f1f1d | Raised cards |
| `ink` | #121211 | #f2f1ed | Headings, primary button |
| `body` | #4a4944 | #c9c7bf | Body text |
| `muted` | #7a7870 | #8f8d85 | Labels, captions |
| `line` | ink at 10% | paper at 10% | Hairlines and dividers |
| `line-strong` | ink at 18% | paper at 18% | Inputs, hover outlines |
| `hover` | ink at 4% | paper at 6% | Row and button hover |

Accent colors come in pairs: a soft wash for fills and a deep tone for text and strokes. Each one has a job.

| Pair | Wash | Deep | Job |
| --- | --- | --- | --- |
| `clay` | #f4d9c6 | #b5532a | Forms, the brand warm color |
| `sage` | #d8e4d0 | #3f6b3a | Success, won, booked |
| `sky` | #d6e3f0 | #2f5d8a | Links in sketches, contacts |
| `lilac` | #e3dcf0 | #5b4a8f | AI: the sparkle and the "AI" tag |
| `butter` | #f5e8bf | #8a6a12 | Warnings, "check" prices |
| `rose` | #f3d4d4 | #a33a3a | Errors, lost |

Gradients come back, only as soft washes: two neighbor washes blended on a large area (hero, the testimonial band, empty states). Never on buttons or text.

### Type

| Role | Font | Size / tracking | Weight |
| --- | --- | --- | --- |
| Page title | Geist | 20 / -0.02em | 600 |
| First-screen title | Geist | 36 / -0.02em | 600 |
| Card title | Geist | 18 / -0.02em | 600 |
| Stat | Geist | 26 to 34 / -0.03em | 600, tabular |
| Body | Geist | 14 / -0.005em | 400 |
| UI | Geist | 13.5 | 500 |
| Label | Geist | 12 / 0, sentence case | 500, muted |
| Code, keys, ids | Geist Mono | 11.5 to 12.5 | 400 |

One family for every word. Big first-screen titles take two tones: a line break in a `ToolIntro` title turns the rest gray.

### Shape

| Token | Value | Use |
| --- | --- | --- |
| `rounded-full` | 9999px | Buttons, tags, toggles, avatars, chat bubbles' tail end |
| `rounded-sm`, `rounded-md` | 8px | Inputs, small menus |
| `rounded-lg` | 16px | Popovers, list cards |
| `rounded-2xl` | 24px | Feature cards, dialogs |
| `rounded-3xl` | 32px | Page panel, hero frames, bento tiles |

Organic shapes join the set: blobs (SVG paths with 6 to 8 soft points), circles, arcs, and a hand-drawn stroke style.

### Depth

- `shadow-soft`: one wide, faint shadow (0 1px 2px ink 4%, 0 12px 32px -12px ink 10%) for cards that lift on hover.
- `shadow-float`: menus, dialogs, drag ghosts.
- Cards at rest sit flat on `paper` with a `line` border. They lift on hover.
- Paper grain: a faint noise texture (`.grain`, an inline SVG tile) on the page, so it feels like paper.

### Motion

| Token | Value | Use |
| --- | --- | --- |
| `quick` | 140ms | Hover, press |
| `calm` | 320ms | Opening, sliding, tabs |
| `slow` | 700ms | Reveals, drawing lines, numbers counting |
| `ease-out` | cubic-bezier(.2,.8,.2,1) | Things arriving |
| `ease-spring` | cubic-bezier(.34,1.56,.64,1) | Toys, drops |

Only transform, opacity and SVG stroke offset are animated. Everything stops under `prefers-reduced-motion`, and toys show their end state.

---

## 2. Base parts

| Part | Look |
| --- | --- |
| `Button` | Pill, 40px tall (32px small). Primary: `ink` fill, `paper` text. Secondary: `card` fill, `line` border. Ghost: text only. Press shrinks to 98%. |
| `IconButton` | 32px circle, tooltip on hover. |
| `Tag` | Pill, wash fill, deep text, 22px tall, optional dot. Replaces square tags. |
| `Input` | 40px, `rounded-sm`, `card` fill; focus draws a 2px `ink` ring. |
| `Select` | Same as Input, opens a `rounded-lg` floating menu. Still no `<select>`. |
| `Segmented` | Pill track with a sliding pill thumb. |
| `Toggle` | Pill switch, thumb springs across. |
| `Card` | `card` fill, `rounded-2xl`, `line` border, lifts on hover. |
| `Dialog` | `rounded-2xl`, `shadow-float`, slides up 8px and fades in. |
| `Tabs` | Text tabs with a sliding ink underline that stretches as it moves. |
| `Stat` | Big Geist number, a label under it, a tiny sparkline beside it. |
| `Accordion` | Round + button that turns into ×, row opens with a growing progress line on the left. |
| `Avatar` | Circle; groups overlap with a `paper` ring. |
| `Loader` | Three dots bouncing. Skeletons are soft `paper-deep` blobs with a slow shimmer. |
| `Toast` | Pill at the bottom. |

---

## 3. AI

AI is shown with one mark, the sparkle (`Sparkle` in `src/components/Icons.tsx`), in `lilac`. File: `src/components/app/Ai.tsx`.

- `AiMark`: the sparkle beside AI controls (the "change anything" box, write and rewrite buttons). `working` makes it shimmer while AI writes.
- `AiAvatar`: the sparkle in a round `lilac-wash` chip, where AI speaks in a chat.
- `AiTag`: a lilac pill with the sparkle and "AI" on anything AI made.
- `Dots`: three dots bouncing, the loader everywhere.

## 4. Sketch library

Hand-drawn SVGs in one stroke style: 1.5px `ink` line, round caps, a slight wobble (made once with a seeded jitter, then saved as static SVG), and one wash color fill offset by 3px like a print that slipped. Lines draw themselves in on first view.

| Sketch | Where |
| --- | --- |
| A form on a clipboard with a pencil | Forms first screen |
| A funnel catching paper planes (visitors) that come out as envelopes (leads) | Marketing hero, Analytics empty |
| A card file with a magnifying glass | Contacts and Companies empty |
| A road of milestones ending at a flag | Opportunities empty |
| A paper plane trailing a dotted path | Email Workflows empty |
| A stack of envelopes with a wax seal | Templates empty |
| A browser window with a ruler and a paint swatch | Pages empty |
| A megaphone with sound arcs | Ads empty |
| A gear made of puzzle pieces | Settings first screen |
| A calendar page with a hand placing a pin | Booking |
| Arrows, circles, underlines, stars, "look here" scribbles | Notes on marketing pages and first screens |

File: `src/components/sketches/Sketch.tsx`: `<Sketch name tone draw size />` and `<Scribble kind tone />`. Empty states pass one to `Empty` with `sketch`; first screens pass a name to `ToolIntro` with `sketch`.

---

## 5. Modules

Each module is a reusable piece. Many are "toys": they react to the mouse, to scroll or to clicks, and they show the product doing its job.

### Marketing site

1. **Living hero.** Big two-tone line, two pill buttons, and a canvas behind it: soft `clay`, `sky` and `lilac` orbs drifting, pushed gently away by the cursor.
2. **Visitor stream.** A row of small dots (website visitors) flows left to right; some get caught by a form, turn into named avatars, and drop into a calendar. The core story told in 6 seconds.
3. **Logo marquee.** Looping logos with faded edges, pauses on hover.
4. **Feature row with accordion.** Pill tag, headline, three bullets; the open bullet has a progress line that fills over 5s, then moves on. The picture on the right swaps with it.
5. **Form playground.** A real Claritia form you can fill in on the homepage; as you type, a mini CRM card fills in beside it and the AI scores the lead live.
6. **Stat trio.** Three huge numbers that count up, with short captions and a hand-drawn underline.
7. **Bento grid.** 3fr/2fr tiles, each a small live demo: drag a field into a form, a workflow line drawing itself, an email typing, a calendar slot getting booked.
8. **Steps.** Serif "1." "2." "3." on a dotted path that draws as you scroll.
9. **Quote band.** Soft `clay` to `butter` wash, a large quote, avatar, and a carousel with round arrow buttons.
10. **Before / after slider.** Drag a handle across a messy spreadsheet to reveal a clean Claritia pipeline.
11. **FAQ.** Accordion with round + buttons.
12. **Closing card.** A big `ink` card with a paper plane that flies off when you hover the button.
13. **Theme switch.** Sun and moon toggle that saves the choice.

### App shell

14. **Shell.** `paper-deep` shell with the white-ish `card` page panel inset, `rounded-3xl`. The side rail has pill nav items; the current one is a filled `ink` pill. Groups fold and each has a small color tile (CRM sky, Automation clay, Inbound sage, Nurture butter). Summary numbers sit in flat stat cards that count up once.
15. **Command bar.** ⌘K opens a floating pill search; results slide in.
16. **Page header.** An editable title, a breadcrumb, one primary pill button.
17. **First screens (ToolIntro).** Serif title, short lead, "Try" chips as pills, a big sketch that draws in, and three feature cards with mini animated previews.

### Forms

18. **Interview chat.** A ChatGPT-style thread with the sparkle as the asker; answers are option cards and check boxes (docs/form-studio.md).
19. **Form canvas.** Fields are soft cards; dragging lifts them with a shadow and a slight tilt, and the drop spot opens like a gap in a line of people.
20. **Device stage.** The preview sits in a drawn phone or laptop frame; switching devices morphs the frame.
21. **Embed picker.** Eight embed types as small illustrated cards (inline, popup, slide-in, full page and others), each showing a tiny animated website.
22. **Results.** Funnel of steps as stacked soft bars that narrow, with drop-off shown as falling dots; responses as a card stack you can flip.

### CRM

23. **Record table.** Stays a table for speed, restyled: taller rows, pill tags, round avatars, `rounded-2xl` frame, sticky header with a soft fade.
24. **Board view.** Opportunity stages as columns of soft cards; dragging a card to Won bursts a few `sage` confetti squares (big moments only).
25. **Record page header.** Big avatar or company logo, name, a row of pill tags, and a "health ring" (a circle that fills by engagement).
26. **Timeline.** A vertical line with round nodes per event (form filled, email opened, meeting booked); each node has a tiny icon and the line draws as you scroll.
27. **Relationship map.** Company in the middle, contacts orbiting as avatars on rings by role; hover to see the link.
28. **Notes.** Notes look like sticky cards with a slight rotation; tasks are a checklist where ticking draws a hand-drawn check.

### Email

29. **Workflow canvas.** Steps as round-cornered nodes linked by curved lines; a dot travels the line to show live traffic.
30. **Template gallery.** Envelopes that open on hover to show the email inside.
31. **Analytics.** Serif stats, a soft area chart with a hand-drawn annotation ("launch day" with an arrow), and a sent-to-booked river chart.

### Everywhere

32. **Empty states.** Sketch, one line, one pill button.
33. **Success moments.** Paper plane, check draw or confetti, used for form published, first lead, first meeting.
34. **Hover cards.** People and companies show a floating `rounded-lg` card on hover.
35. **Scroll reveals.** Sections rise 12px and fade in once.

---

## 6. Per screen

| Screen | Changes |
| --- | --- |
| Marketing home | Modules 1 to 13 |
| Auth | Split screen: form on the left, a drawn funnel scene on the right that animates as you type |
| Forms list | Cards with a mini form thumbnail, response count as a big number, state tag |
| Form create | Modules 18, 20 |
| Form page | Modules 19 to 22 |
| Contacts / Companies | Modules 23, 25 to 28 |
| Opportunities | Module 24 as the default view, table as the second |
| Email | Modules 29 to 31 |
| Settings | Cards on `paper`, one short line under each section title |

---

## 7. Rules

- Use the tokens in `src/app/globals.css`, never a hex.
- Warm paper and Geist for every word. First-screen titles take two tones: a line break in a `ToolIntro` title turns the rest gray.
- Buttons, tags and toggles are pills. Inputs 8px, cards 16 to 24px, the page panel 32px.
- Soft washes only on large areas. No gradients on buttons or text. No emoji.
- Cards sit flat and lift on hover; shadows only on lifted and floating things.
- The sparkle marks AI. Anything AI made gets the "AI" tag.
- Empty states and first screens use a sketch from `src/components/sketches`.
- Motion uses the three speeds and two curves above, and stops under reduced motion.
- Kept from v1: no `<select>` or browser pop-ups, minimal copy, the `ToolIntro` pattern, running cost on every build.

## 8. What's built

- Tokens, fonts, paper grain, light and dark.
- Base parts in `ui.tsx` (`Button`, `IconButton`, `Badge`, `Input`, `Segmented`, `Toggle`, `Panel`, `Tabs`, `Stat`, `Avatar`, `Loading`, `Empty`), `Select` and `Dialogs`.
- The sparkle marks for AI and the loader.
- Shell with the side rail, page header, ⌘K command bar and the theme switch.
- Sketch library, first screens and empty states.
- Sign-in, Forms, CRM, Email and Settings screens.

Still to build: the marketing site modules (1 to 13), the Forms results funnel (22), the relationship map (27), the email template gallery (30) and analytics charts (31), which wait on their screens.

## 9. Running cost

| Item | Beta (50 teams) | Growth (500 teams) |
| --- | --- | --- |
| Fonts (Geist, OFL) | $0 | $0 |
| Sketches and the sparkle (SVG in the repo) | $0 | $0 |
| Animation (CSS and SVG, no paid library) | $0 | $0 |
| Extra page weight (about 120 KB of fonts, cached) on Render bandwidth | $0 (inside plan) | $0 (inside plan, check) |
| Claude tokens | $0 | $0 |
| **Added per month** | **$0** | **$0** |

Total monthly bill stays where it is today.
