# B2: picking inside an email, and the Element and Layout panel

Plan, 13 November 2026; built the same day (section 12). Step B2 of `docs/email-canvas-plan.md`, after B1 (`docs/email-canvas-b1.md`). B2 makes the
emails on the canvas editable by picking: click any part of an email to pick it, see and change everything about it
in a panel on the right (Element), see the email's structure as a tree (Layout), and reorder through the tree and the
keyboard. Typing in place is B3; dragging blocks on the canvas itself and the + panel are B4; Tia is B5.

## 1. Sources and what's ours

- **Brew** (the owner's screenshots; Brew's docs describe none of this): a panel with **Element** and **Layout** tabs
  and a close X. Element for an **Image**: the file and Edit, Replace, Alt text; Layout (Width, Height, Fit: Cover,
  Contain, Fill; Align: Left, Center, Right; Loading: —, Lazy, Eager); Link (Link URL, Open link in); Stroke (color,
  opacity %, width, Solid, Dashed, Dotted); Corners (None, Rounded, Round, each corner); Spacing (Padding and Margin,
  each as horizontal and vertical, with a button for each side); Center horizontally. For a **Heading**: Level (H1 to
  H6); Text (align left, center, right, justify; font; weight; size; line height; letter spacing; Format B I U S; Case;
  color with opacity and reset); Spacing; Corners. Layout is a tree: Body › Container › Section › Image, Text, Heading,
  Button, each with its kind and first words; a button shows its color. On the canvas: a small tag ("Heading",
  "Section") on the picked element, a dashed grip to its left, and the picked section's padding drawn with its numbers
  (48, 32, 24).
- **Ours already** (the full-screen Email Studio): a complete style engine (`src/lib/design/email/edit.ts`,
  `style.ts`, `props.ts`): every property is checked, written on this element, one of its classes or every email on the
  brand, at desktop or phone, plain, hover or dark, from the brand's variables, with a mark on what some mail apps
  ignore; content settings for all 17 block types (`BlockSettings.tsx`); the style sections with scrubbing numbers and
  variable pickers (`StyleSections.tsx`); the layer list; undo; components. B2 puts these behind a simpler, Brew-like
  panel and makes the canvas pick parts. Nothing new is invented below the panel.

## 2. Picking on the canvas

The rules, in one table. "Email" means the whole email; "element" means a section, a column or a block.

| Action | Does |
| --- | --- |
| Click inside any email | Picks the element under the pointer (the innermost one), and that email becomes the one being edited |
| Click an email's name above it | Picks the whole email (as in B1) |
| Hover inside an email | A thin green outline and a small tag with its kind ("Button") on the element under the pointer |
| Escape | Steps out: block → its section → the email → nothing |
| Enter | Steps in: the email → its first section → that section's first block |
| ↑ and ↓ | With an element picked: the one before or after it, in reading order, panning it into view when needed |
| ← and → | With an email picked: the email before or after (as in B1) |
| Tab and Shift+Tab | The next or previous element at the same level (blocks in a column, sections in an email) |
| Alt+Shift+↑ and ↓ | Moves the picked block or section up or down (across columns and sections at the ends) |
| Cmd/Ctrl+D | Duplicates the picked element right after it (the email, when the email is picked) |
| Delete or Backspace | Removes the picked element at once; "Deleted · Undo" shows for 5 seconds (an email still asks first) |
| Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z | Undo and redo in the email being edited (each email has its own history) |
| Double-click a text element | B3 types in place. Until then it puts the cursor in the panel's text box |

- **The picked element** gets a 2 px green outline drawn on the canvas (it keeps its thickness at every zoom), a tag
  above its top-left corner with its kind ("Heading", "Section", "Column"), and a small bar above its top-right corner:
  **Select parent** (↑ icon), **Move up**, **Move down**, **Duplicate**, **Delete**. The email's B1 toolbar stays above
  the email.
- **Padding shows** on the picked section, column or block: its padding drawn as a soft green tint inside its edges,
  each side with its number when there's room (the owner's screenshot shows 48, 32, 24). Margins aren't drawn (most
  mail apps ignore them).
- **Locked parts:** an element inside a component use that isn't being edited picks the whole component section, with
  the tag "Component: Footer"; its panel offers Edit component and Detach (as the Email Studio does today).
- **Sent emails** pick the same way, but their panel is read-only, with one line: "Sent emails can't change.
  Duplicate to edit."
- **Links** inside an email never open on the canvas.

How it works: the canvas builds each email with the builder's preview marks (`compileEmail(..., { preview: true })`
marks every element with `data-eid` and each part with a class). A press inside an email is turned into the email's
own pixels (divide by the zoom), and the frame's own `elementFromPoint` finds the element and part. The picked and
hovered elements' boxes are read from inside the frame after each change and drawn on the canvas's screen layer, so
outlines and tags stay sharp and the frame never needs pointer events.

## 3. The panel

A white panel docked on the right of the canvas, 320 px wide, under the page header. It shows when an email or an
element is picked and hides with its X (it comes back with the next pick). Two tabs: **Element** and **Layout**.
Under 1,024 px wide it becomes a sheet from the bottom over the canvas.

### 3.1 The top of the Element tab

```
┌─────────────────────────────────────────────┐
│ [Element] [Layout]                        ✕ │
│ T  Heading  in Section 2                    │  kind, icon, where it is (click "Section 2" to pick it)
│ Style for  [This heading ▾]   Desktop|Phone │  the level, and which screen the styles are for
└─────────────────────────────────────────────┘
```

- **Style for** picks where a change goes: **This heading** (the default), one of its **classes**, or **Every
  heading** (every email on the brand). The last two show a line under the menu: "Changes every email that uses it."
  This is the engine's element, class and global levels, named for people.
- **Desktop | Phone** follows the canvas's Desktop and Phone switch. With Phone on, changes are written for phones
  only, and the panel says so in the switch itself (green "Phone"). Values set only on desktop show gray on phone.
- **Hover** and **Dark**: a small menu on the right with **Plain**, **Hover** (buttons and links) and **Dark** (when
  the email has dark mode on). The canvas shows the picked email in that state while it's chosen.

### 3.2 Groups

Each group is a row that opens and closes (it remembers per kind of element); a green dot shows when this level sets
something in it, and the group's "Reset" (↺) clears just those. Which groups show depends on what's picked:

| Group | Heading | Text, list, quote | Button, meeting | Image, logo | Divider | Spacer | Section | Column | Email |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Content | Level, text | Text | Label, link, full width | Picture, alt, link | | Height | Layout (columns) | | Subject, preview text |
| Text | ● | ● | ● | | | | | | |
| Layout | Align | Align | Align, width | Width, height, fit, align, loading | Width, align | | Stack on phones | Vertical align | Width, align |
| Fill | | | ● | | | | ● | ● | ● (email and page) |
| Stroke | | | ● | ● | ● (the line) | | ● | ● | ● |
| Corners | | | ● | ● | | | ● | ● | ● |
| Spacing | ● | ● | ● | ● | ● | | ● | ● | ● |
| Visibility | ● | ● | ● | ● | ● | ● | ● | | |
| All styles | ● | ● | ● | ● | ● | | ● | ● | ● |

The other blocks (social links, video, product, event, signature, footer, HTML) get their Content from the Email
Studio's settings today, plus the groups that fit their main part.

### 3.3 Each control

- **Content:** the block's own fields from `BlockSettings.tsx` (moved into small per-kind pieces so the panel and the
  Email Studio share them): text, label, link (with the forms and meetings picker), picture (Replace, the media
  library), alt text, list items, columns. **Level** is H1 to H6 (the document allows 1 to 3 today; B2 allows 4 to 6).
- **Text:** a 4-way align segment (left, center, right, justify); **Font** (the brand's heading and body fonts first,
  then the font list, each shown in its own face); **Weight** (named: Regular, Medium, Semibold, Bold); **Size**, **Line
  height**, **Letter spacing** as number fields that scrub when you drag their label and take arithmetic ("16*1.5");
  **Format** B, I, U, S as toggles (bold sets weight 700, italic the font style, underline and strike the decoration);
  **Case** (Default, UPPERCASE, lowercase, Title Case); **Color**.
- **Color** (everywhere): a swatch, the hex, an opacity percent, and a ◇ button for the brand's color variables
  ("Accent", "Text"…). A value from a variable shows the variable's name, not its hex. Opacity writes an `rgba` color.
- **Layout:** **Width** in px or % with Auto (images: the picture's own width up to the column); **Height** in px or
  Auto; **Fit** (Cover, Contain, Fill), shown only when a height is set (it does nothing with Auto); **Align** (left,
  center, right; this is the block's alignment, which every mail app honors, so there is no separate "Center
  horizontally" **(ours)**); **Loading** (Default, Lazy, Eager; a new image setting, written as the image's `loading`
  attribute).
- **Fill:** background color; for sections, also a background picture, with Size and Position.
- **Stroke:** color, width and style (Solid, Dashed, Dotted) on all sides at once, or **Each side**.
- **Corners:** None (0), Rounded (the brand's radius variable), Round (999 px), or a number; **Each corner** splits
  it in four.
- **Spacing:** Padding as **Across** and **Up and down** (two linked numbers), or **Each side** (four); Margin the
  same, marked "Outlook ignores this" as the style engine does today.
- **Visibility:** Show on (Desktop and phone, Desktop only, Phone only) and **Show when** (a condition on first name,
  last name, company or job title), from today's settings.
- **All styles:** opens the full style sections for this part and its other parts (a button's text, a card's title),
  for anything the groups above don't cover (shadows, min and max sizes, line styles per side). Nothing is lost by
  the simpler panel.

Every value field shows where its value comes from by its label's color, as the Email Studio does: ink when set here,
green when it comes from a class, gray when it's the brand's or the default. Hovering a gray label says where it comes
from ("From Every heading").

### 3.4 The Email tab (nothing inside picked)

With the whole email picked, Element shows the email: **Subject** and **Preview text** (with the merge-value picker,
as in the Send panel), **Width** (600, 640, 700), **Align** (Center, Left), **Dark mode** (Auto, Off), **Language**,
**Brand** (when the workspace has several kits), then Fill, Stroke, Corners and Spacing for the email and the page
behind it.

## 4. The Layout tab: the tree

```
▾ Body
  ▾ Container
    ▾ Section                       ← a component shows its name: "Footer (component)"
        ▣ Image      logo.png
        ≡ Text       Welcome to Perceptric
        T Heading    Inbound that turns into pipeline
        ◉ Button     Book a discovery call   ●
    ▾ Section · 2 columns
      ▾ Column 1
          ≡ Text     01
          T Heading  Read the B2B SaaS SEO guide
      ▸ Column 2
```

- Each row: an icon, the kind, its first words (or the picture's file name), and for a button a dot in its fill color.
  Rows never cut a word short: a long first line wraps once, then the rest shows on hover.
- **Click** picks it on the canvas (and pans it into view); **hover** outlines it on the canvas.
- **Drag** a row to reorder it, or into another section or column; a green line shows where it lands; sections only
  move among sections. Escape cancels.
- **Keys** (when the tree has focus): ↑ and ↓ move through rows, ← and → close and open, Enter picks, Alt+Shift+↑ and ↓
  move, Delete removes. It's a real tree for screen readers (`role="tree"`).
- **Right-click** (or the row's ⋯) offers Duplicate, Delete, Hide on phones, Hide on desktop.
- Hidden rows (desktop only or phone only, or with a condition) show a small eye-off or "If" mark.

## 5. Editing, saving and undo

- One editor per email being edited, built like the Email Studio's: the document, the brand's design draft (for class
  and Every-heading changes), and one undo history for both, with typing in a field merged into one step. It lives in
  a new hook, `useEmailDraft` (`src/components/app/emails/canvas/useEmailDraft.ts`), so the canvas and the Email Studio
  can share it (the Email Studio moves onto it in B4, when the canvas replaces it).
- **Autosave:** 800 ms after the last change, through `email_draft_save`; leaving the canvas, opening the Email Studio
  or switching to another email saves first. The header shows "Saving…" only while it saves, and a real error if a save
  fails (with Try again).
- **Brand-wide changes** (a class, or Every heading) save to the brand's design draft as the Email Studio does, and the
  header shows **Publish styles** until they're published.
- **The canvas updates in place:** a change rebuilds that email and writes the new HTML into its frame without
  reloading it, so nothing flashes and the outlines stay.
- **A draft that was sent meanwhile** (by someone else) can't save; the canvas says "This email was sent. Your last
  change wasn't saved." and turns read-only.

## 6. The header and the canvas during editing

- The page header gains **Undo** and **Redo** (for the email being edited) and **Publish styles** when needed.
- **Desktop and Phone** in the header now also decide which screen the styles are for (section 3.1).
- The email being edited is the only one that shows hover outlines; picking inside another email switches to it.

## 7. Look

- Panel: white, `shadow-rest` hairline on its left, 320 px; tabs are the app's pill tabs; groups have 12.5 px medium
  titles with a chevron and 12 px padding; fields are 32 px tall, 8 px corners, `shadow-input`; segments are pills;
  number fields put their unit inside on the right; labels are 12 px muted (colored by origin as above).
- Canvas: the picked outline 2 px `signal`; the hover outline 1 px `signal`; the kind tag 11.5 px white on `signal`,
  6 px corners; the element bar is a white pill on `shadow-float` with 28 px icon buttons; padding tint is `signal` at
  12% with 11 px numbers.
- Dark mode, reduced motion and phones follow B1's rules; nothing in the panel cuts text short, and every row of
  controls wraps.

## 8. How it's built

New:

- `src/lib/design/email/tree.ts` (pure, tested): the layer tree from a document (nodes, kinds, first words, hidden
  marks), reading order for ↑ and ↓, step out and step in, siblings for Tab, and where a dragged row may land.
- `src/lib/design/email/pick.ts` (pure, tested): the part from a class list (`c<id>-<part>`), and padding zones from
  computed styles.
- `src/components/app/emails/canvas/useEmailDraft.ts`: the editor (section 5).
- `src/components/app/emails/canvas/Inspector.tsx`: the panel shell, tabs, the top line, Style for, Desktop and Phone,
  states.
- `src/components/app/emails/canvas/groups/*.tsx`: one file per group (Content, Text, Layout, Fill, Stroke, Corners,
  Spacing, Visibility), each writing through `setEmailProp` and the document operations in `ops.ts`.
- `src/components/app/emails/canvas/LayerTree.tsx`: the tree (section 4).
- `src/components/app/emails/canvas/Overlay.tsx`: outlines, the kind tag, the element bar and padding zones.

Changed:

- `Artboard.tsx`: builds with preview marks; exposes `hit(x, y)`, `boxOf(id)` and `paddingOf(id, part)`; writes new
  HTML into its frame instead of reloading it.
- `EmailCanvasPage.tsx`: the picking rules, the keys, the panel, the per-email editors.
- `BlockSettings.tsx`: its per-kind content fields move into exported pieces the panel reuses (no change to the Email
  Studio's screens).
- `doc.ts` and `compile.ts`: heading levels 4 to 6; the image `loading` setting.

No database change.

## 9. How we prove it

- `tests/emailTree.test.ts`: the tree for a document with columns, components and hidden blocks; reading order; step
  out and in; Tab siblings; allowed drops (a section never lands inside a column).
- `tests/emailPick.test.ts`: parts from class lists; padding zones.
- `tests/email.test.ts` additions: heading levels 4 to 6 read and build; `loading` reads and builds; an image with a
  height and Fit gets `object-fit`; Stroke and Corners presets build on images, buttons and sections.
- `scripts/email-canvas-check.ts` grows a B2 part, in Chromium with the stand-in database:
  - a click inside an email picks the innermost element (outline, tag, element bar, panel shows its kind);
  - hover shows the outline and tag; Escape steps out three levels; Enter steps in; ↑ and ↓ follow reading order;
  - the panel: change a heading's size, its color from a variable, Format Bold, Case; the frame shows it at once and
    one save goes out after typing stops, with the style in the saved document;
  - Phone on: a change saves under the phone styles only;
  - corners Round on a button, Fit on an image with a height, padding Each side, Stroke Dashed;
  - Style for: Every heading changes another email's heading too and shows Publish styles;
  - the tree: click picks, drag reorders and saves, keys move through rows;
  - Alt+Shift+↓ moves a block, Cmd+D duplicates, Delete removes and Cmd+Z brings it back;
  - a sent email's panel is read-only;
  - no page errors, in light and dark, and at 390 px wide (the panel as a bottom sheet).

## 10. Not in B2

Typing in place and the format bar on the canvas (B3); dragging blocks on the canvas, the + panel, image corner
resize, copy and paste between emails (B4); Tia on the canvas, versions on the artboard, comments (B5). "Open link in"
from Brew's panel is left out: mail apps decide where links open, so the setting would do nothing **(ours)**.

## 11. Running cost

| | Beta (50 teams) | Growth (500 teams) |
| --- | --- | --- |
| Servers, database, Claude | $0 (it runs in the browser; saves are the same calls the Email Studio makes) | $0 |
| **Total added** | **$0 a month** | **$0 a month** |

## 12. As built

- **Files:** `src/lib/design/email/tree.ts` and `pick.ts` (tested in `tests/emailTree.test.ts`);
  `src/components/app/emails/canvas/useEmailDraft.ts`, `Inspector.tsx`, `LayerTree.tsx`, `Overlay.tsx`; changes to
  `Artboard.tsx` (registers its frame, writes new HTML into it), `preview.ts` (builds with marks, from the live draft),
  `EmailCanvasPage.tsx`, `EmailStyle.tsx` (`emailStyleCtx`, shared by both panels) and `StyleSections.tsx` (`PropRow`
  exported). Heading levels 4 to 6 and the image `loading` setting are in `doc.ts`, `compile.ts` and
  `BlockSettings.tsx`. The groups live in `Inspector.tsx` instead of one file each.
- **Content** is the Email Studio's own `BlockSettings`, so Align, Loading, Show on, Show when and Stack on phones
  stay where the Email Studio has them (in Content) instead of in Layout and Visibility.
- **Enter** now steps into the picked email (its first section); a double-click on the email's name opens it in the
  Email Studio. Steps in go through a Column when a section has several (email › section › column › block).
- **⌘D and Delete** act on the picked element; with the whole email picked (click its name, or Escape out) they act
  on the email as in B1.
- **Sent emails** show what was sent; one sent before marks existed (only its HTML) picks as a whole email.
- **Undo** covers the document and the brand's draft styles together; resizing the email being edited goes through
  its editor too, so Undo takes it back.
- On a phone the panel is a sheet over the lower half of the canvas, and the email toolbar moves to the top while it's
  open.
- **Proof:** `scripts/email-canvas-check.ts` part B2 (checks 14 to 22) and the B1 checks updated for Enter and the
  sheet.
