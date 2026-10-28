# Design system: Webflow-level styling for forms and emails

Status: proposed, October 2026. Nothing here is built yet.

Brew lets a marketer style an email down to a single button state and keeps every email on brand. Claritia should go
further: one design system for a workspace, shared by its forms, its emails and its booking pages, and styled like
Webflow. Any part can be clicked and given any supported style, per screen size and per state. Styles can be saved as
classes that many emails and forms reuse. Brand values live in variables, so changing a color in one place changes it
everywhere it's used.

This plan covers the design system, the style engine, the form and email renderers, the editor, the AI, imports and
the tests. Landing pages (`docs/lock-in-plan.md` week 5) will use the same system later; nothing here blocks them.

---

## Part 0. Where we start

### What Claritia has today

| Area | Today | Where |
|---|---|---|
| Form tokens | 22 tokens: two fonts, three sizes, label weight, nine colors, border, corners, field height, gap, button corners, weight and case | `src/lib/forms/brand.ts:5-54` |
| Form CSS | One fixed stylesheet in the form's shadow root, driven by `--clr-*` variables. Heading sizes, paddings, hover and breakpoints are hard-coded | `src/lib/forms/element.ts:33-116` |
| Brand kits | One table of tokens, logo and notes per kit; scanned from the site with Playwright, checked by Claude against screenshots | `045_form_builder.sql:16`, `src/lib/brand/scan.ts`, `src/lib/brand/look.ts` |
| Form design UI | Theme panel (kit, 4 presets, fonts, 7 colors, field and button shape). Per field: width, size, label position, hide label, hide on phone | `FormDesign.tsx`, `Inspector.tsx:406-464` |
| Form canvas | A second renderer in React with inline styles, kept in step with the real form by hand | `FormCanvas.tsx:123-223` |
| Emails | Stored as finished HTML. One fixed layout: paragraphs and one button, system font, white page, no brand | `039_email.sql:69`, `src/lib/nurture/email.ts` |
| Email editor | A text box (a blank line starts a paragraph), merge tags, button label and link, Write with AI. No preview | `workflows/Inspector.tsx:284-409` |
| Email footer | Fixed gray footer with address and unsubscribe for marketing mail | `src/lib/email/render.ts:52-58` |
| Booking pages | Use the form tokens, logo, derived shades and 4 breakpoints | `src/components/book/theme.ts`, `styles.ts` |

What a user can't do today: style one field or one part differently, set hover or focus looks, change padding or
margins, set heading sizes, add shadows or background images, change anything per screen size, or give an email any
brand at all.

### What we can take from Omniscient

The Deal Room builder (`dev-omniscient/omniscient`) already has a Webflow-style panel. Its parts are worth porting;
its gaps are what this plan fixes.

| Omniscient piece | Port as is | Change for Claritia |
|---|---|---|
| `cleanProp`, `cleanValue` safety checks (`src/lib/experiences/styles.ts:40-72`) | Yes, as the safety floor | Add typed checks per property on top (Part 2.3). Omniscient accepts any safe value on any property |
| Design shape: part → state → property (`styles.ts:35`) | The idea | Add classes, variables and email states (Part 2) |
| `designCss` compiler with container queries (`styles.ts:133`) | The web half | New email compiler (Part 4) |
| `StylePanel` groups and the `Commit` input (`StylePanel.tsx`, 231 lines) | The groups list | Box model widget, unit scrubbing, token picker, inherited values from every level, client support marks (Part 5) |
| Click a part to pick it (`partAt`, `styles.ts:163`) | Yes | Same, on the real renderer |
| Undo merge keys, 80 steps (`SiteBuilder.tsx:262`) | Yes | Forms already have the same pattern |
| Design check with rules (`design.ts`) and one fix pass by the AI | The pattern | Email and form rules (Part 7.4) |
| Tests that prove 14 CSS attacks fail (`tests/styles.test.ts`) | Yes | Plus email client tests |

Missing in Omniscient and needed here: named classes, user variables, a style guide page, inherited value display
across levels, typed values, email output and dark mode.

### What Brew does, and where we go further

From Brew's docs and site: it reads a brand's site into an editable brand brief (`email-design.md`) that the AI reads;
emails are made by chat, from templates (5,100 real emails) or imported (HTML, MJML, EML, React Email, Figma,
screenshots); hand edits change text, links, buttons and images in place; every AI edit is a version; variants sit
side by side; tests go to real inboxes; export to other email tools. Its docs don't describe a style panel, so the
hand editor is compared from what we've seen in the product, and the plan doesn't depend on copying it.

Where Claritia goes further: the same system styles forms, booking pages and emails; classes and variables like
Webflow; per-client support marks while styling; checks for contrast and email size before send; and the brand brief
plus tokens both feed the AI.

---

## Part 1. The pieces, in one picture

```
                     ┌──────────────────────── Design system (one per brand) ───────────────────────┐
                     │ Variables: colors, fonts, type scale, spacing, corners, shadows, light/dark   │
                     │ Global styles: Body, H1–H3, Link, Button, Input, Label…                      │
                     │ Classes: "Button / Primary", "Card", "Card is-dark"…                          │
                     │ Components: Header, Footer, Product card…                                    │
                     │ Brand brief (prose for the AI), logos, assets                                │
                     └──────────────┬───────────────────────────────┬───────────────────────────────┘
                                    │                               │
                       Form doc (schema + style layer)      Email doc (sections → columns → blocks)
                                    │                               │
                    ┌───────────────┴──────────┐        ┌───────────┴──────────────┐
                    │ Web compiler             │        │ Email compiler           │
                    │ scoped CSS, variables,   │        │ tables, inline styles,   │
                    │ container queries,       │        │ phone and dark rules in  │
                    │ states                   │        │ <style>, Outlook markup  │
                    └───────────────┬──────────┘        └───────────┬──────────────┘
                                    │                               │
                    <claritia-form> and booking pages     HTML frozen per send, plain text
```

One style engine (`src/lib/design/`) holds the model, the checks and the cascade. Two compilers turn it into output.
The editor (Part 5) is one set of panels used by both the form and the email builder.

---

## Part 2. The style model

### 2.1 Variables (tokens)

Variables are the brand's named values. Every style can point at a variable instead of a raw value, and the panel
shows the variable's name as a chip.

| Group | Variables | Notes |
|---|---|---|
| Colors | A palette of named swatches (Brand, Ink, Paper, Sand…), up to 40 | Each has a light value and an optional dark value |
| Color roles | Text, Muted, Background, Surface, Border, Primary, On primary, Accent, Link, Error, Success | Roles point at swatches. Styles use roles first, so a theme swap is one change |
| Fonts | Heading font, Body font, Mono font, each with a fallback stack | Google Fonts or uploaded `.woff2`. Email keeps the fallback stack for clients without web fonts |
| Type scale | Display, H1, H2, H3, Body, Small, Label, Button | Each: font, size, weight, line height, letter spacing, case. Optional phone size |
| Spacing | 0, 2, 4, 8, 12, 16, 24, 32, 48, 64, 96 | Names like `space-4` (16px). Editable |
| Corners | None, Small, Medium, Large, Pill | |
| Borders | Hairline, Thin, Thick | Width and color role |
| Shadows | None, Small, Medium, Large | Email drops shadows where unsupported and says so (Part 4.4) |
| Sizes | Content width (forms 480/720, email 600), Field height, Button height | |

Variables have **modes**: Light and Dark. Forms and booking pages use Light unless the page around them is dark
(already detected in `src/components/book/theme.ts`). Emails use both: Dark values go into the email's dark mode
rules.

Today's 22 form tokens map one to one into these variables, so every existing form keeps its look on day one
(Part 9.1).

### 2.2 Styles: global, class, element

A style is a set of properties for one target, per **breakpoint** and per **state**:

```ts
type StyleRule = {
  base?: Decls;                      // desktop
  tablet?: Decls;                    // forms and booking pages
  phone?: Decls;                     // forms, booking pages, emails
  hover?: Decls; focus?: Decls; pressed?: Decls;      // web; email hover for Apple Mail only
  invalid?: Decls; disabled?: Decls; checked?: Decls; // form fields
  dark?: Decls;                      // emails (and forms on a dark page)
};
type Decls = Partial<Record<Prop, Value>>;    // Prop from the allow list (2.3), Value typed
type Value = { token: string } | { raw: string };
```

States combine with breakpoints the Webflow way: a state's values apply at the breakpoint picked when they were set,
and smaller breakpoints inherit from larger ones (desktop → tablet → phone).

Three levels, applied in this order, later wins:

1. **Global styles** (tags). One per kind of thing: Body, Heading 1–3, Paragraph, Link, Button, Secondary button,
   Label, Input, Choice, Help text, Error text, Divider, Image, Card, Section. Set once in the design system and used
   everywhere.
2. **Classes.** Named, reusable, like Webflow classes. An element can have one class plus **combo classes**
   ("Button" + "is-large"), and a combo's styles only apply when all its classes are on the element. Classes live in
   the design system, so "Card" means the same in a form and an email.
3. **Element styles.** Set on one element only ("This element only" in the panel). Kept small on purpose: the panel
   offers "Save as class" when an element gets more than 6 of its own properties.

**Parts.** A form field or an email block has parts that can be styled separately: a field has Label, Input,
Placeholder, Help, Error, Required mark; a choice has Option, Option box, Option checked; a button has Label and Icon.
A style rule targets an element and one of its parts. The parts list per element type is fixed in code
(`src/lib/design/parts.ts`), so the compilers know the selector or table cell each part becomes.

### 2.3 Properties and how values are checked

Omniscient blocks bad values but takes any value on any property. Here every property has a type, and a value must
fit it before it's saved. The safety checks from Omniscient run first on every raw value.

| Group | Properties | Value types |
|---|---|---|
| Layout | display (block, flex, grid, none), direction, wrap, justify, align, gap, grid columns, column span, order | keywords, length |
| Spacing | margin and padding, each side | length, `auto` for margin, token `space-*` |
| Size | width, min/max width, height, min/max height, aspect ratio, object fit | length, %, `auto`, ratio |
| Position (forms only) | position (relative, sticky), top/right/bottom/left, z-index | keywords, length, integer |
| Typography | font family, weight, size, line height, letter spacing, color, align, transform, decoration, style, white space, text shadow | font token, number 100–900, length, color, keywords |
| Backgrounds | color, image (https only), size, position, repeat, gradient (linear or radial, up to 4 stops) | color, url, keywords, gradient |
| Borders | width, style, color, each side; corner radius, each corner | length, keywords, color |
| Effects | opacity, box shadow (up to 2), cursor, transition (forms), transform (forms: scale, translate only) | number 0–1, shadow, keywords |
| Custom | any other property from a longer allow list (about 120 properties), with typed values | as listed |

Value types:
- **Length:** a number with `px`, `em`, `rem`, `%`, `vw` (forms) or `px`, `%` (email). A bare number gets `px`.
  Limits per property (font size 8–160px, padding 0–400px…).
- **Color:** hex, rgb(a), hsl(a), a named swatch or role, `transparent`, `currentColor`.
- **Keyword:** from the property's own list.
- **url():** `https://` only, from our asset host or an allowed host list; data URIs only for small images in forms.
- **No** `expression`, `javascript:`, `@import`, comments, braces, semicolons, backslashes (Omniscient's list).

The checks live in one pure module (`src/lib/design/values.ts`) that runs in the browser while typing and again on
the server on every save and publish. A form or email with a value that fails can't be saved; the panel shows the red
border Omniscient uses.

### 2.4 Components

A component is a saved piece (an email header, a footer, a product card, a form step with consent) that can be placed
in many emails or forms.

- **Instances follow the original.** Editing the component updates every draft that uses it; live forms and queued
  emails change only when republished (Part 8.3).
- **Props.** A component marks which parts can change per use: text, image, link, button label, show or hide. An
  instance can override those and nothing else, so the brand parts stay fixed.
- **Locked components.** An owner can lock a component (the email footer with the legal address, say); members can
  place it but not detach or edit it.
- **Detach.** Turns an instance into plain elements, for one-off changes.

### 2.5 The brand brief

Next to the variables, each design system keeps a short prose brief, like Brew's `email-design.md`: voice, rules
("one primary button per email", "no stock photos of people"), approved assets, and what to avoid. The AI reads it
with the variables and classes (Part 7). People edit it as text. Uploaded brand guidelines (PDF) are read into it and
win over what the site scan found.

---

## Part 3. Forms on the new system

### 3.1 What changes in the form

The form schema (`src/lib/forms/schema.ts`) keeps steps, fields, rules and logic. A new `design` layer sits beside it:

```ts
type FormDesign = {
  systemId: string;                         // the design system (today's brand_kit_id)
  classes: Record<string, string[]>;        // element id → class names
  styles: Record<string, Partial<Record<Part, StyleRule>>>;  // element id → part → rule
  form?: Partial<Record<FormPart, StyleRule>>;               // the whole form: frame, title, intro, progress, steps
};
```

Every field type gets its parts (Part 2.2). The form itself gets: Frame, Title, Intro, Progress bar, Progress dots,
Step title, Back button, Submit button, Consent, Thank-you screen, Calendar (the booking step), Popup overlay, Popup
box, Close button.

New form-only states: invalid, disabled, checked, focus within. A field with an error shows its Invalid look; the
panel's state menu shows a field in that state on the canvas.

### 3.2 The web compiler

`compileWeb(system, design, scope)` returns one CSS string:

- Variables become `--c-*`, `--f-*`, `--s-*` custom properties on the form's host.
- Global styles become rules on stable part classes (the element's terse classes get readable names: `.clr-label`,
  `.clr-input`… the plan in `docs/form-builder.md:162-166` for Inherit mode).
- Classes become `.c-<slug>` rules; combos become `.c-a.c-b`.
- Element styles become `[data-id="<id>"] .clr-input` rules.
- Breakpoints are container queries on the form's own width (forms are often in narrow columns): tablet below 720px,
  phone below 480px, editable per design system.
- States become `:hover`, `:focus-visible`, `[aria-invalid=true]`, `:disabled`, `:checked`, `:focus-within`.
- Everything is scoped inside the shadow root, so a form can't change the page around it, and the page can't break the
  form.

The compiler runs on the server when a form is published. `form_public` returns the compiled CSS with the form, so
the form script only places it. That keeps the script under its 23 KB limit (`scripts/build-forms.mts`).

The fixed stylesheet in `element.ts` becomes the global defaults of a new design system, written as data, so today's
look is just the starting values.

### 3.3 One renderer in the builder

Today the builder draws forms with its own React copy (`FormCanvas.tsx`). With hundreds of style options, two renderers
can't stay in step. The builder canvas will host the real `<claritia-form>` in preview mode (the Share tab and
`FormPreview` already do), and draw selection and hover outlines in an overlay on top:

- The form script marks every part with `data-id` and `data-part`.
- A click finds the nearest marked part (Omniscient's `partAt`) and selects that element and part.
- The overlay draws the selected outline, the hovered part's name tag, and padding and margin areas on hover.
- Drag and drop moves fields through the existing ops (`src/lib/forms/ops.ts`).

`FormCanvas.tsx` is removed once the overlay matches its features (drop zones, inline label edit, multi-select).

### 3.4 Inherit mode

A form set to Inherit drops the design system and uses plain class names in the page's own DOM (no shadow root), so a
team's site CSS styles it. Planned since `docs/form-builder.md`; built here because the class names come from the same
parts list.

### 3.5 Booking pages

Booking pages (`src/components/book/`) move onto the same variables and global styles, with their own parts (Day,
Time, Selected time, Host card). Their four breakpoints stay.

---

## Part 4. Emails on the new system

### 4.1 The email document

Emails stop being stored as finished HTML. A new document holds the structure, and HTML is made from it:

```ts
type EmailDoc = {
  v: 1;
  systemId: string;
  settings: { width: 600 | 640 | 700; background: Value; contentBackground: Value; align: "center" | "left";
              darkMode: "auto" | "off"; preheader: string; lang: string };
  sections: Section[];
};
type Section = { id: string; component?: { id: string; props: Record<string, unknown> };
                 classes: string[]; style?: StyleRule; columns: Column[];
                 stackOnPhone: boolean; hideOn?: "phone" | "desktop"; showIf?: Cond };
type Column = { id: string; width: number /* % */; style?: StyleRule; blocks: Block[] };
type Block = { id: string; type: BlockType; classes: string[]; style?: Partial<Record<Part, StyleRule>>;
               content: ...; showIf?: Cond };
```

**Blocks (18):** Heading, Text (rich: bold, italic, link, lists, merge tags), Button, Image (with link), Logo,
Divider, Spacer, Columns (inside a section), List (icon or number), Quote, Social links, Video (a thumbnail with a
play mark that links out), Product card, Event card, Meeting link (from Claritia meetings), Signature (from the sender),
Footer (address, unsubscribe, preferences; required for marketing mail), HTML (owners only, cleaned, Part 10).

**Conditional content:** a section or block can show only when a contact field matches (`showIf`), using the same
conditions as forms (`Cond` in `src/lib/forms/schema.ts`). Merge tags keep the `{{first_name}}` form used today
(`src/lib/email/render.ts`), with fallbacks (`{{first_name | there}}`).

Old emails (plain HTML) open as one HTML block, so nothing breaks; "Convert" turns them into blocks (Part 7.5).

### 4.2 The email compiler

`compileEmail(system, doc, opts)` returns `{ html, text, size, notes }`. It writes the markup email clients need,
which is far from what the panel shows:

- **Tables for layout.** Sections and columns become nested tables with `role="presentation"`. Columns use ghost tables
  in `<!--[if mso]>` for Outlook on Windows and inline-block divs for everyone else, so columns stack on phones
  without media query support.
- **Inline styles.** Every element gets its final computed style inline (global → classes → element, flattened), since
  Gmail and others drop or limit `<style>`. Variables are written as their values; CSS variables don't work in Gmail
  or Outlook.
- **A `<style>` block** for what can't be inline: phone rules in `@media (max-width: 480px)`, hover (Apple Mail),
  and dark mode in `@media (prefers-color-scheme: dark)` plus `[data-ogsc]` and `[data-ogsb]` selectors for
  Outlook.com. Classes in it use `!important` to beat the inline values.
- **Margins become padding.** Outlook ignores margins on most elements, so the compiler turns a block's margin into
  padding on its wrapper cell, and spacers into fixed-height rows.
- **Buttons are bulletproof.** A padded link inside a table cell, plus a VML round-rect for Outlook on Windows, so
  corners, color and size match.
- **Background images** get a VML fill for Outlook and a background color fallback.
- **Fonts:** the design system's font with its fallback stack; a `<link>` to Google Fonts for clients that load web
  fonts (Apple Mail, iOS, Outlook for Mac, Samsung). Gmail shows the fallback.
- **Images:** absolute https on our asset host, `width` and `height` set, 2x files for sharp screens, `alt` required,
  `display:block` to stop gaps.
- **Dark mode:** logos can have a dark version (swapped by class in dark mode); colors from the variables' dark values.
- **Plain text** from the same doc: headings, paragraphs, links as `text (url)`, buttons as `Label: url`.
- **Size guard:** Gmail cuts emails over 102 KB. The compiler reports the size, and the send check (Part 8.2) blocks
  sends over 95 KB.
- **Tracking and footer** stay where they are: `rewriteLinks` and the unsubscribe headers in `src/lib/email/render.ts`
  run on the compiled HTML. The fixed gray footer goes away once the Footer block is required for marketing mail.

### 4.3 Writing our own compiler

MJML and React Email both make solid email markup. Neither takes free styles on any part with classes and states,
which is what this plan needs; both would mean converting our model into theirs and fighting the result. The compiler
is our own, about 1,500 lines, built on the known patterns above, and tested against real clients (Part 11). MJML
import is still supported (Part 7.5).

### 4.4 What each email client supports

The style panel knows which clients ignore a property and marks it while styling (Part 5.4). The table below is from
caniemail.com and must be checked property by property before building (check):

| Property | Gmail (web, app) | Outlook Windows | Outlook.com | Apple Mail, iOS | Yahoo |
|---|---|---|---|---|---|
| `<style>` and media queries | Yes, with limits | No media queries | Yes | Yes | Yes |
| Margin | Yes | Partly | Yes | Yes | Yes |
| Padding on links | Yes | No | Yes | Yes | Yes |
| border-radius | Yes | No (VML for buttons) | Yes | Yes | Yes |
| background-image | Yes | VML only | Yes | Yes | Yes |
| box-shadow | No | No | Partly | Yes | No |
| Web fonts | No | No | No | Yes | No |
| max-width | Yes | No (ghost tables) | Yes | Yes | Yes |
| flex, grid | No | No | No | Partly | No |
| Dark mode rules | No (forced colors in app) | No | `[data-ogsc]` | `prefers-color-scheme` | No |
| CSS variables | No | No | No | Yes | No |

The compiler never relies on a property a client lacks for layout; unsupported looks fall back to the nearest one
that works (no shadow, square corners, the fallback font).

### 4.5 Sends are frozen

When a broadcast or a journey step sends, the compiled HTML and text are saved with the send, and every message uses
them. A later change to the design system, a class or the email never changes mail already queued. The send pipeline
is under the reliability rule (Part 11.3).

---

## Part 5. The editor

One editor, used by the form builder (its Design tab) and the new email builder. It follows the app's brand rules
(`docs/brand.md`): the app's own `Select`, pills for buttons, the floating layer for menus, no browser dropdowns or
pop-ups. Customer designs can use anything the style model allows; the app's rules apply to the app.

### 5.1 Layout

```
┌───────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ← Emails   Welcome email ▾        [Desktop|Phone]  [Light|Dark]   [None ▾ state]  100% ▾   ↶ ↷   Test  Send │
├──────────┬───────────────────────────────────────────────────────────────────────┬────────────────────────┤
│ Add      │                                                                       │ Style  Settings  ✦ AI  │
│ Layers   │                ┌──────────────────────────────┐                       │ ┌────────────────────┐ │
│ Styles   │                │  [logo]                      │                       │ │ Button × is-large ×│ │
│ Variables│                │  Hello {{first_name}}        │                       │ │ + class            │ │
│ Comps    │                │  ┌────────────┐              │ ◄── selected: Button  │ └────────────────────┘ │
│ Assets   │                │  │ Book a demo│ Button       │                       │ ▸ Layout               │
│ Brief    │                │  └────────────┘              │                       │ ▾ Spacing  ┌────────┐  │
│          │                │  Footer · Unsubscribe        │                       │            │ margin │  │
│          │                └──────────────────────────────┘                       │            │┌padding┐│ │
│          │  Body › Section 2 › Column › Button › Label                           │ ▾ Typography …         │
└──────────┴───────────────────────────────────────────────────────────────────────┴────────────────────────┘
```

- **Left rail:** Add (blocks or fields, by click or drag), Layers (the tree, drag to reorder, rename, hide, lock),
  Styles (every class with its uses, rename, find unused, delete), Variables (Part 5.5), Components, Assets (uploaded
  images and logos), Brief (the brand brief, as text).
- **Top bar:** breakpoint (Desktop, Tablet for forms, Phone), Light or Dark (emails), the state to style, zoom, undo
  and redo, Test send (emails) or Test (forms), Publish or Send.
- **Canvas:** the real renderer. Emails show the compiled HTML in a frame at the chosen width, so the canvas is what
  Gmail on a desktop gets; phone and dark show the matching rules. A breadcrumb bar at the bottom shows the selected
  element's parents (Body › Section › Column › Button › Label) and selects any of them.
- **Right panel:** Style (Part 5.2), Settings (content: link, alt text, image, merge tags, conditions, field settings
  from today's inspector), AI (Part 7).

### 5.2 The Style panel

Top of the panel, the **selector**: the selected element's classes as chips, "+ class" to add one, and a switch for
"This element only". What the panel edits is always the rightmost choice. Above the chips: the part (Button ›
Label), and the breakpoint and state being edited.

Sections, folded when empty, with a dot when set:

| Section | Controls |
|---|---|
| Layout | Display as segmented icons; for flex: direction, wrap, justify, align, gap; for grid: columns and gap. Emails: column widths, stack on phone, vertical align |
| Spacing | A box model widget: margin outside, padding inside. Drag a side to change it, click to type, Alt-drag for both sides, Shift-Alt for all four. Values snap to the spacing variables |
| Size | Width, height, min and max of each, with a unit menu (px, %, auto, em, vw) |
| Position | Forms only: relative or sticky, offsets, z-index |
| Typography | Font (the design system's fonts first), weight, size, line height, letter spacing, color, align, case, decoration, italic |
| Backgrounds | Color, image (from Assets), size, position, repeat, gradient editor with stops |
| Borders | Width, style, color per side (linked or apart); corner radius per corner (linked or apart) |
| Effects | Opacity, shadows (list), transition (forms), cursor |
| More | Any other allowed property, typed, with search |

### 5.3 How every input behaves

- **Number inputs** scrub: drag the label left or right; arrow keys add 1, Shift adds 10, Alt adds 0.1; typing
  `16+8` sets 24. A unit menu sits at the end of the box.
- **Variables first:** every color, size, spacing and font input opens a picker with the design system's variables at
  the top. A value set from a variable shows as a chip with its name; "Detach" turns it into the raw value.
- **Where a value comes from:** each property's label is colored by its source, like Webflow:
  - ink with a dot: set here, at this breakpoint and state
  - clay: inherited from a larger breakpoint or the base state
  - sky: from a class or a combo
  - gray: from a global style or the default
  Hovering the label names the source ("From class Button, Desktop") and offers "Reset" and "Go to source".
- **Reset** per property, per section and per part.
- **Copy and paste styles** between elements (Cmd+Alt+C, Cmd+Alt+V), and "Paste as class".
- **Undo** merges typing in one box into one step (the forms `mergeKey` pattern); 100 steps.

### 5.4 Client support marks (emails)

A property a client ignores shows a small mark beside it, with the clients by logo in its tooltip ("Outlook for
Windows ignores this. Corners come out square."). The marks come from the support table (Part 4.4) in code, and they're
real state, so they fit the minimal copy rule. A "Client view" switch in the top bar shows the canvas as Outlook for
Windows would draw it (the compiler's Outlook output with the unsupported looks removed).

### 5.5 Variables panel and the style guide

- **Variables:** groups as in Part 2.1, each a list with its value and, for colors, its dark value. Edit in place;
  rename keeps every use; delete asks to pick a replacement when the variable is used.
- **Style guide:** a page that draws every variable, global style, class and component in the brand, like Webflow's
  style guide page. Editing a global style there changes it everywhere. It's the first screen of a new design system.
- **Many design systems:** a workspace has one by default; agencies and companies with several brands add more.
  Forms, emails and booking pages each pick one (Brew's brand switcher, per item).

### 5.6 Keys

Cmd+Z and Cmd+Shift+Z undo and redo; Cmd+D duplicate; Delete removes; Cmd+C and Cmd+V copy elements; Up and Down
move between siblings; Enter goes into the first child; Escape goes to the parent; 1, 2, 3 switch breakpoints; Cmd+K
searches elements, classes and variables.

---

## Part 6. Assets

- Uploaded images, logos and fonts live in a public bucket on a CDN, one folder per workspace.
- Uploads are checked by type (their first bytes), resized to the sizes used (1x and 2x of the width placed), and
  stripped of location data.
- Emails must point at our CDN (or a host on the workspace's allowed list); the send check blocks `http:` images.
- Logos have a light and an optional dark version, and an icon version for small spots.

---

## Part 7. AI and imports

### 7.1 Brand setup

"Set up your brand" takes the site address:

1. The scan (`src/lib/brand/scan.ts`) grows from 22 tokens to the full variable set: the palette (colors weighted by
   area on the page), heading and body fonts with their fallbacks, the type scale from H1 to body, corners from
   buttons and inputs, shadows, the logo (SVG or PNG, light and dark), social links, and the company address for the
   footer.
2. Claude (Sonnet, through the step cache) names the swatches, assigns roles, and writes the brand brief from the
   page text and screenshots.
3. The look check (`src/lib/brand/look.ts`) compares a sample form and a sample email in the brand with the site's
   screenshots and suggests up to 3 fixes.
4. The person reviews the style guide and changes anything. Uploaded brand guidelines (PDF) are read into the brief
   and win over the scan.

### 7.2 Making and changing emails with AI

The AI works through ops, the same way the form chat does (`src/lib/forms/ops.ts`, `chat.ts`): `add_section`,
`set_content`, `add_class`, `set_style`, `use_component`, `move`, `remove`. Every op is checked; a refused op returns
the reason to the model, which fixes it in the same turn.

- **Variables and classes first.** By default the AI may only use the design system's variables, classes and
  components; raw values only when the person asks for something the system lacks, and then it says which.
- **Versions:** every AI change is a new version; hand edits save into the current one (Brew's model). The version
  menu restores any.
- **Variants:** "Make 3 versions" puts them side by side for an A/B send.

### 7.3 Forms with AI

The form chat gets `set_style` and `add_class` ops on the same rules. "Make it look like my site" runs the look check
on the form and applies its fixes as ops.

### 7.4 The design check

A deterministic check (no AI) runs on every save and before every send or publish, like Omniscient's `checkElement`:

| Check | Emails | Forms |
|---|---|---|
| Text contrast below 4.5:1 (3:1 for large text), in light and dark | Yes | Yes |
| Image without alt text | Yes | Yes |
| More than one primary button per section | Yes | — |
| Body text under 14px on phone | Yes | Yes |
| Tap target under 44px on phone | Yes | Yes |
| Size over 95 KB (Gmail clips at 102 KB) | Blocks the send | — |
| Images over 1 MB, or more than 40% of the email as image | Yes | — |
| Marketing email without the Footer block | Blocks the send | — |
| A link to `http:`, or a link with no text | Yes | Yes |
| Merge tag without a fallback | Yes | — |
| Raw values where a variable is within 2% (suggest the variable) | Yes | Yes |

The AI runs the check after its ops and gets one pass to fix what it caused (the Omniscient pattern).

### 7.5 Imports

| From | How |
|---|---|
| HTML or EML file, or pasted source | Parsed on the server: tables become sections and columns, text, images, links and buttons become blocks, inline styles become element styles, repeated styles become class suggestions. Anything unknown stays an HTML block |
| MJML | MJML's tags map one to one to sections, columns and blocks |
| A screenshot | Claude (Sonnet, vision) reads the layout into ops on the brand's variables |
| A forwarded email | An inbox address per workspace (reuses `inbox.tryclaritia.com`); arrives in Templates |
| Figma | Later: frames to sections through the Figma API |

### 7.6 Templates

30 email templates (welcome, newsletter, product update, event invite, webinar follow-up, meeting recap, renewal,
re-engagement…) and the 12 form templates, all built from components and drawn in the workspace's brand. "Remix"
keeps the layout and swaps in the brand.

---

## Part 8. Data and publishing

### 8.1 Tables (`072_design_system.sql`)

| Table | Columns |
|---|---|
| `design_systems` | id, workspace_id, name, `variables jsonb` (≤64 KB), `globals jsonb`, `classes jsonb` (≤256 KB), `brief text` (≤20 KB), `logos jsonb`, `version int`, `published jsonb` (the last published copy), status, timestamps |
| `design_components` | id, workspace_id, system_id, kind (email, form, any), name, `doc jsonb` (≤128 KB), `props jsonb`, locked, version, thumb_url |
| `design_assets` | id, workspace_id, path, kind (image, logo, font), width, height, bytes, sizes jsonb |
| `emails` (changed) | add `doc jsonb`, `system_id`, `system_version`; `html` and `text` stay as the compiled output |
| `email_sends` (changed) | the compiled `html` and `text` frozen per send |
| `forms` (changed) | `brand_kit_id` becomes `system_id`; the form's draft gets its `design` layer |

`brand_kits` rows are copied into `design_systems` by the migration (Part 9.1); the old table stays readable for a
release, then goes.

All writes go through functions that check membership and run the same checks as the browser (the forms pattern).

### 8.2 Before a send

1. Compile with the design system as published.
2. Run the design check; anything marked "Blocks the send" stops it with the reason.
3. Freeze the HTML and text with the send.
4. Rewrite links for tracking and add the unsubscribe headers (`src/lib/email/track.ts`, `render.ts`).

### 8.3 Publishing design changes

Changing a variable, global style, class or component edits a draft of the design system. "Publish styles" shows
what it changes ("4 live forms, 2 journeys, 1 scheduled broadcast"), with a before and after of each, then publishes.
Live forms recompile on publish. Journeys and scheduled broadcasts pick up the change on their next send; sends
already queued keep their frozen HTML.

---

## Part 9. Moving what exists

### 9.1 Forms

- Each brand kit becomes a design system: the 22 tokens become variables, `element.ts`'s fixed stylesheet becomes the
  global styles, and each field's `size`, `width`, `labels` and `hideOnPhone` become element styles.
- A test renders every template and 50 saved test forms in the old and new renderers and compares screenshots; any
  pixel difference over 0.5% fails (Part 11.2).
- The Theme panel (`FormDesign.tsx`) becomes the Variables panel; its presets (Clean, Rounded, Bold, Minimal) become
  starting design systems.

### 9.2 Emails

- Each existing email (fixed HTML from `src/lib/nurture/email.ts`) opens as one HTML block and sends exactly as before.
- "Convert to blocks" runs the HTML import (Part 7.5) on it; the converted version is a new version.
- Journey emails stored as `EmailBody` JSON (`src/lib/workflows/types.ts:24`) convert to docs directly: subject,
  preheader, paragraphs as Text blocks, the call to action as a Button.

---

## Part 10. Safety

- **Styles:** typed values plus Omniscient's safety checks (Part 2.3), in the browser and again on the server; every
  compiled rule is scoped (forms) or inline (emails).
- **HTML block:** owners only; cleaned on the server with an allow list of tags and attributes (no script, iframe,
  form, object, event handlers, `javascript:` links); flagged by the design check.
- **Imports:** parsed on the server; files up to 5 MB; images copied to our CDN.
- **Fonts:** Google Fonts by name, or uploaded `.woff2` checked by its header.
- **Assets:** type checked by content, never by name.
- **Limits:** 40 swatches, 300 classes, 100 components, 200 blocks per email, 80 properties per rule.

---

## Part 11. Tests

### 11.1 Unit

- Values: every property's type takes good values and refuses bad ones; Omniscient's 14 CSS attacks plus email ones
  (`mso-` properties outside the allow list, VML injection, `</style>` in a value).
- Cascade: global → class → combo → element, desktop → tablet → phone, base → state; a property test over 10,000
  random designs checks that the web compiler and the panel's "where it comes from" agree on every value.
- Email compiler: snapshots of every block in every state; every inline style matches the computed value; the
  compiled HTML parses, has no unknown tags, and stays under 95 KB for every template.

### 11.2 Visual

- Forms: Playwright screenshots of every template and part state (Chromium in CI, WebKit and Firefox weekly), old
  renderer against new during the move (Part 9.1).
- Emails: Playwright screenshots of every template at desktop and phone width, light and dark.
- Real inboxes: every email template sent weekly to a set of test accounts (Gmail, Outlook.com, Yahoo, iCloud) and
  through a rendering service for Outlook for Windows (Part 13). A failed render opens an issue with the screenshot.

### 11.3 The flaky cases (reliability rule)

- A variable changes while a broadcast is sending: every message keeps the HTML frozen at the send's start.
- Two people edit the same class at once: the second save sees the first (a version check, like `draft_rev` on forms)
  and merges or asks.
- An image on the CDN is slow or missing: the email still sends, with its alt text and background color in place.
- A component used in a scheduled broadcast is deleted: the broadcast keeps its frozen copy; drafts show the last
  version with a mark.
- The compiler throws on one email in a journey: that send fails with the reason and is retried after a fix; the rest
  of the journey continues.

---

## Part 12. Build order

| Step | What | Days |
|---|---|---|
| 1 | Style engine: model, typed values, safety checks, cascade, parts lists (`src/lib/design/`) | 5 |
| 2 | Web compiler with variables, classes, breakpoints and states; tests | 3 |
| 3 | `072_design_system.sql`, brand kits moved in, save and publish functions | 3 |
| 4 | Forms: parts marked in the form script, compiled CSS in `form_public`, old and new screenshots match | 4 |
| 5 | Builder canvas on the real form with the selection overlay; `FormCanvas.tsx` removed | 5 |
| 6 | Style panel: selector, sections, box model widget, unit scrubbing, variable picker, source colors | 8 |
| 7 | Variables panel, Styles (classes) panel, style guide page | 4 |
| 8 | Email doc, 18 blocks, conditional content, plain text | 4 |
| 9 | Email compiler: tables, inline, phone, dark, Outlook markup, size guard; tests | 8 |
| 10 | Email builder on the shared editor; Test send; send freezing; journeys and broadcasts on docs | 6 |
| 11 | Client support marks and Client view | 2 |
| 12 | Components with props, locks and detach | 4 |
| 13 | Assets: uploads, resizing, CDN | 2 |
| 14 | Design check for emails and forms | 2 |
| 15 | Brand setup: full scan, brief, look check on the new variables | 3 |
| 16 | AI ops for emails and forms, versions and variants | 4 |
| 17 | Imports: HTML, EML, MJML, screenshot, forwarding | 5 |
| 18 | 30 email templates and remix | 4 |
| 19 | Booking pages on the design system | 2 |
| 20 | Real inbox tests, visual tests, then deploy | 3 |
| | **Total** | **About 82 working days** |

Releases:
- **Release 1 (steps 1–7, about 32 days):** forms get the full design system, classes and the style panel.
- **Release 2 (steps 8–14, about 28 days):** emails get blocks, the compiler and the same editor.
- **Release 3 (steps 15–20, about 21 days):** brand setup, AI, imports, templates and booking pages.

---

## Part 13. Monthly cost

Assumptions per team a month: 1 design system, 8 emails made or changed with AI, 2 imports by screenshot, 20,000
emails sent with about 150 KB of images each, 30% of them opened with images loaded, 50 MB of new assets.

| Line | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Brand setup: Sonnet, once per brand, about 30,000 tokens in and 4,000 out ($0.10), spread over a year | $1 | $5 |
| AI email changes: Sonnet at $2 and $10 a million tokens in and out (`src/lib/ai/cache.ts`, check), about 12,000 in (mostly cached) and 3,000 out each, 8 a team | $15 | $150 |
| Screenshot imports: Sonnet with an image, about 3,000 in and 4,000 out, 2 a team | $5 | $45 |
| Look check on new emails (exists for forms) | $3 | $25 |
| Asset storage: 50 MB a team a month, kept | $0 (inside plan) | $1 (check) |
| Image delivery from opened emails: about 45 GB at Beta and 450 GB at Growth. Supabase includes 250 GB, then about $0.09 a GB (check) | $0 (inside plan) | $18 (check) |
| Image resizing: on the worker we already run | $0 | $0 |
| Real inbox test accounts (Gmail, Outlook.com, Yahoo, iCloud) | $0 | $0 |
| Rendering service for Outlook for Windows tests, weekly in CI: Email on Acid or Litmus, one seat (check) | $99 (check) | $99 (check) |
| Database growth: docs, classes and frozen sends | $0 (inside plan) | $25 (check) |
| **Added per month** | **about $123** | **about $368** |

Notes:
- Most of the Growth AI line is people asking the AI to change emails; it moves with use.
- Real-inbox previews for customers (Brew's "Preview in real inboxes") would need a rendering service's API at
  roughly $0.10 to $0.50 a test (check). At 4 tests a team a month that's about $20 to $100 at Beta and $200 to
  $1,000 at Growth. It's left out of the totals and could be a paid add-on.
- Image delivery grows with sends. Past about 2 TB a month, Cloudflare R2 (no egress fee, check) would cost less
  than Supabase.

---

## Part 14. Decisions to make

| Question | Options | Suggestion |
|---|---|---|
| Image host | Supabase storage with its CDN, or Cloudflare R2 | Supabase now; move to R2 past about 2 TB a month (Part 13) |
| Customer inbox previews | Leave out, include, or paid add-on | Paid add-on after Release 2 |
| Old `brand_kits` table | Keep as a view for a release, or drop with the migration | Keep for one release |
| Tablet breakpoint in emails | Add, or keep desktop and phone | Keep two; email clients don't need a third |
| Who edits locked components and the style guide | Owners only, or a new Designer role | Owners only at first |

---

## Part 15. Status

### Release 1 (steps 1 to 7): built

| Step | Where |
|---|---|
| 1. Style engine | `src/lib/design/` (`props.ts`, `values.ts`, `model.ts`, `parts.ts`, `cascade.ts`) |
| 2. Web compiler | `src/lib/design/web.ts`, `form.ts` |
| 3. Storage | `supabase/migrations/072_design_system.sql`, `src/app/api/design/save/route.ts` |
| 4. Forms on it | `src/lib/forms/element.ts` (compiled CSS above its own stylesheet), `src/app/api/forms/[id]/route.ts` |
| 5. Canvas on the real form | `src/components/app/forms/FormCanvas.tsx` |
| 6. Style panel | `src/components/app/forms/StylePanel.tsx`, `src/lib/design/edit.ts` |
| 7. Styles, Variables, style guide, Publish styles | `DesignPanels.tsx`, `StyleGuide.tsx`, `useDesignDraft.ts` |

Tests: `tests/design.test.ts` (values, attacks, cascade, compiler, edits), `tests/pg/design.pg.ts` (two saves at once,
publishing), `scripts/design-check.ts` (random designs drawn in Chromium match the panel at every breakpoint and on
hover; edit mode; forced states) and `scripts/canvas-check.ts` (the editing layer sits on the real fields at any zoom,
clicks pick parts and never reach the form, the Style panel's edits show at once, one undo step each).

Running cost of Release 1: nothing new. No AI calls, no new services; the designs are a few KB per brand kit in the
database. Beta (50 teams): $0. Growth (500 teams): $0.

Changes from the plan:
- **Brand kits grow in place.** `brand_kits` gets `design` (the draft), `design_live` (published) and `design_rev`
  instead of a new `design_systems` table, so every form keeps its `brand_kit_id` and nothing is copied.
- **Cascade layers.** Each level is a CSS cascade layer (`base`, `g`, one per class, `e`), so the compiled CSS and the
  panel's "where it comes from" agree by construction. The form's old stylesheet is the `base` layer, so forms with
  no design look exactly as before.
- **Breakpoints are media queries** on the page width (991px and 479px by default); the builder's device frames get
  each breakpoint's rules written in directly, so a frame shows its size whatever the window is.
- **Forced states.** The builder shows the state being styled on the picked part with a `clr-force-<state>` class.
- **Fonts** picked in a style load from the page (`fonts` beside `css` in the public form), since fonts don't load
  from inside a shadow root.
- **Publish styles** lists the live forms it changes; the before and after pictures come with Release 2's visual
  tests.
- **Deleting a variable** asks what its uses become (another variable or a value), and fills in its own value by
  default.
- Migrations 071 and 072 still need running on the production database.
