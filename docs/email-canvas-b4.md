# B4: drag and drop, the + panel, image resize, copy and paste

Plan, 13 November 2026. Step B4 of `docs/email-canvas-plan.md`, after B2 (picking and the panel,
`docs/email-canvas-b2.md`) and B3 (typing in place, `docs/email-canvas-b3.md`). B4 makes the canvas a place where
emails are built by hand: drag blocks and sections inside an email and between emails, add blocks from a panel on the
left, resize pictures by their corners, and copy, cut and paste anywhere on the canvas. Tia on the canvas, versions
and comments are B5.

## 1. What B4 adds

| Part | In one line |
| --- | --- |
| The canvas editor | One editor for every email on the canvas, with one undo history, so a change that touches two emails is one step |
| Drag and drop | Drag any block or section to a new place in the same email or into another email; Alt copies |
| The + panel | A panel on the left with every block, column layouts and the brand's components; click to add, or drag onto an email |
| Image resize | Corner handles on a picked picture; it keeps its shape, stops at the column's edge and shows its width |
| Copy and paste | ⌘C, ⌘X and ⌘V for blocks and sections, between emails and between browser tabs; words pasted from other apps become blocks |
| Keyboard moves | Alt+Shift+← and → move the picked block or section to the email before or after |
| Right-click menu | On any part of an email: Copy, Cut, Paste, Duplicate, Delete, Move up, Move down, Select parent |

## 2. The canvas editor

B2 gave each email its own editor and its own undo history (`useEmailDraft`). That breaks down in B4: moving a block
from one email to another changes two emails at once, and undo must put it back in both or it loses the block. B2
also left an oddity: a brand-wide change ("Every heading") changes every email but sat in one email's history.

**B4 replaces it with one editor for the whole canvas** (`useCanvasEditor`), the way a design tool keeps one history
per file:

- **One history.** Every change is one step, and a step can touch several emails and the brand's styles together. ⌘Z
  undoes the last step on the canvas, wherever it was. If that email is out of view, the canvas pans to it and picks
  what changed. Typing runs, merged field edits and Every-heading changes keep the B2 and B3 rules (one step each).
  This changes B2 section 5, which said each email has its own history.
- **Many emails open at once.** The editor holds the documents of the emails changed in this visit, over the rows
  from the database. The panel and typing work on the picked email through the same calls as before (`draft(id)`
  gives the B2 shape), so `Inspector.tsx` and `useTyping.ts` barely change.
- **Brand styles per brand kit.** A workspace can have several brand kits. The editor keeps a design draft for each
  kit it touches, so a step records which kit it changed, and undo never writes one kit's styles into another. The
  save call moves out of `useDesignDraft` into one shared function, so the Email Studio and the canvas save styles the
  same way. When someone else saved the same kit's styles first, their version comes in, the canvas says "Someone else
  changed these styles", and the undo steps for that kit are dropped (undoing them would overwrite their work).
- **Saving, safely.** Each changed email saves 800 ms after its last change, through `email_draft_save`, and all of
  them save at once before leaving the canvas or opening the Email Studio. A hiccup (timeout, network, a 5xx or 429)
  is tried again on its own up to 3 times, waiting 0.5, 1 and 2 seconds; what still fails shows in the header as one
  line, "Welcome wasn't saved", with Try again.
- **A move never loses a block.** When a step takes something out of one email and puts it into another, the email
  that gains saves first, and the email that loses saves only after that save worked. If the gaining save fails, the
  losing email doesn't save at all (the worst case is a copy in both, never a block in neither). If the gaining email
  turns out to have been sent meanwhile, the whole step is taken back on screen and the canvas says "Class reminder
  was sent, so the block stayed in Welcome."
- **Sent emails** never change: they can't be drop targets or paste targets, and dragging out of one copies.

## 3. Drag and drop on the canvas

### 3.1 What drags

| Press and drag | Moves |
| --- | --- |
| On the picked element (or anywhere inside it) | The picked element: a block, or a whole section when a section is picked |
| On any other part of an email | The innermost block under the pointer (it gets picked) |
| On the grip left of the picked element | The picked element (the grip is the way to drag on touch screens) |
| On a part inside a component use | The whole component section |
| On a sent email | A copy (the sent email doesn't change) |

A drag starts after the pointer moves 4 px with the button down, so a click still picks. While typing (B3) nothing
drags; the press places the caret. The B1 drags stay as they were: an email by its name or grip, its width by its side
handles.

### 3.2 While dragging

- The element stays in place at 40% so you can see where it came from. A small white chip follows the pointer with
  its kind ("Heading"); with Alt held it adds "Copy".
- **The green line** shows where it lands, recomputed on each move (once per frame):
  - **a block** lands between blocks in a column. Over a block, the top half puts it before, the bottom half after.
    Over an empty column, it goes in that column. Over a section with several columns, the column under the pointer
    decides. Within 8 px of the line between two sections, the line spans the whole email: the block lands as a new
    section of its own there. A component use takes no blocks inside it; the line goes before or after it.
  - **a section** lands between sections: the line spans the email's width, before or after the section under the
    pointer, by its middle.
- **Into another email:** move the pointer over any other email on the canvas; its line shows the same way. Sent
  emails show no line, and the chip says "Sent".
- **Near an edge of the canvas** (48 px), the canvas pans that way, faster the closer the pointer is, so a block can
  travel to an email far along the row at any zoom.
- **Escape** cancels; so does dropping where no line shows. Nothing changes and nothing saves.

### 3.3 After the drop

- Inside one email: one move (`moveBlock` or `moveSection`). The element stays picked in its new place.
- Into another email: the element leaves the first email and joins the second as one step, keeping its own styles. Its
  classes come along when both emails use the same brand kit; with different kits, classes that kit doesn't have are
  left off. A component use comes along when the other email's kit has that component; otherwise it arrives as plain
  blocks (detached). The other email becomes the one being edited, with the element picked.
- With Alt: a copy lands, with new ids; the original stays.
- A screen reader hears the result ("Heading moved to Class reminder").
- Dropping in the same place changes nothing and makes no undo step.

## 4. Image resize

- A picked Image or Logo shows four small square handles on the picture's corners (the picture itself, not the
  block's padding), in Desktop view only. Phones show pictures at full width, so handles hide in Phone view.
- **Dragging a corner** changes the width; the height follows, so the picture keeps its shape. A picture aligned left
  grows from its left edge, aligned right from its right, centered from both sides (so it grows twice the pointer's
  move). Dragging a left corner toward the left grows it, and so on, as in any design tool.
- **Limits:** at least 24 px wide (a logo at least 40), at most the column's inner width (a logo at most 400). It snaps
  to the column's width and to the picture's own width when within 6 screen px of them; holding Shift turns snapping
  off. A green tag shows the width ("320 px") while dragging.
- **Live:** while dragging, the picture in the frame changes size directly (no rebuild). On release, one change saves:
  the block's width (written as the `width` attribute Outlook uses). At the column's full width the width setting is
  cleared, so the picture stays full width if the column grows. If this image's own Width style (from the B2 panel)
  was set, it's cleared so the drag shows; if a class or Every image sets a width, the drag writes this image's own
  width too, so it wins.
- **Double-click a picture** opens the media library in the panel's Content group, to replace it.

## 5. The + panel

- **Opening:** a round + button at the top left of the canvas ("Add a block"), or pressing A when nothing is being
  typed. A white panel, 264 px wide, opens docked on the left of the canvas, with a close X; under 1,024 px wide it's
  a sheet from the bottom, like the right panel.
- **What's in it**, as tiles with an icon and a name, in groups:
  - **Basics:** Heading, Text, Button, Image, List, Quote, Divider, Spacer.
  - **Columns:** 2 columns, 3 columns, 1:2, 2:1 (a new section with empty columns).
  - **More:** Logo, Social links, Video, Product, Event, Meeting link, Signature, Footer, HTML.
  - **Components:** the brand's saved components, by name (names wrap, never cut short). This group shows only when
    the brand has some.
- **Click a tile:** the block goes after the picked block (or at the end of the picked column or section, or before
  the footer when the email is picked; into the email being edited). It's picked at once, and a Heading, Text,
  Button, List or Quote starts typing with its words selected; an Image opens the media library. A Social links block
  starts with the links the brand scan found, as in the Email Studio. With no email picked, a click picks the first
  email in view and adds there.
- **Drag a tile** onto any email: the same green line as section 3. Columns and components land only between
  sections.
- **Empty columns and empty emails** show a soft dashed box on the canvas so they can take a drop. It's drawn only in
  the canvas's own build (the preview marks); emails that go out never have it.
- The + panel and the right panel can be open together; the canvas between them keeps working.

## 6. Copy, cut and paste

- **⌘C** copies the picked block or section; **⌘X** copies it and removes it (one step); **⌘V** pastes. They act on
  the canvas whenever no text box has focus and nothing is being typed (typing keeps B3's own paste rules).
- **Where a paste lands** (in the email being edited):

  | Picked | A copied block lands | A copied section lands |
  | --- | --- | --- |
  | A block | Right after it | After its section |
  | A column | At the end of that column | After its section |
  | A section | At the end of its first column | Right after it |
  | The email | Before the footer, in a new section | Before the footer |
  | Nothing | In the first email in view, before the footer | The same |

  The pasted element is picked. Pasting into a sent email says "Sent emails can't change. Duplicate to edit."
- **Between emails, groups and browser tabs:** the copy goes on the system clipboard in Claritia's own format, beside
  plain words for other apps. A paste in another group's canvas, or another tab of the same browser, works the same.
  An in-memory copy covers browsers that refuse the custom format.
- **What a paste brings:** new ids every time (pasting twice gives two copies), the element's own styles, and its
  classes and component use under the same rules as a drop into another email (section 3.3).
- **Safety:** a paste is never trusted. The copied element is read through the same checks a saved email goes through
  (`readEmailDoc`: the allow list for rich text and HTML, safe links, sizes), so a crafted clipboard can't put script
  or bad links into an email. An email that would pass 200 blocks or 40 sections refuses the paste with "This email is
  full."
- **From other apps:** words pasted on the canvas (not into a text box) become blocks after the picked one, by B3's
  rules: Markdown headings and lists become Heading and List blocks, other words become a Text block, and pasted rich
  text keeps bold, italic and links.

## 7. Keys

New in B4, beside B2 and B3's keys:

| Key | Does |
| --- | --- |
| ⌘C, ⌘X, ⌘V | Copy, cut, paste (section 6) |
| Alt+Shift+← and → | With a block or section picked: moves it to the email before or after, before that email's footer; it stays picked and the canvas pans to it. With an email picked: moves the email in the row, as in B1 |
| Alt (held during a drag) | Copies instead of moving |
| Shift (held during a resize) | No snapping |
| A | Opens the + panel |
| Escape | Cancels a drag or a resize first; then steps out as in B2 |
| ⌘Z, ⇧⌘Z | Undo and redo on the canvas (section 2) |

## 8. The right-click menu

Right-click any part of an email: it's picked and a menu opens there with Copy, Cut, Paste, Duplicate, Delete, Move
up, Move down and Select parent, each with its key. On a sent email: Copy and Duplicate email. The Layout tree's own
menu gains Copy, Cut and Paste. The menus are the app's own (`Popover`), never the browser's.

## 9. Look

- **Grip:** a 16 × 28 px white pill on `shadow-chip`, 6 px left of the picked element's outline, with the dotted grip
  icon; it shows on the picked block or section only.
- **Drag chip:** white, `shadow-float`, 12.5 px medium, 10 px from the pointer.
- **Drop line:** 2 px `signal`, with a 6 px dot at each end; a new-section line spans the email.
- **Image handles:** 10 px white squares, 2 px corners, a 1.5 px `signal` ring (the B1 resize handles' look).
- **Width tag:** as B1's: 11.5 px white on `signal`, 6 px corners.
- **+ panel:** white, `shadow-rest` hairline on its right; tiles 2 per row, 72 px tall, 10 px corners, `shadow-rest`,
  icon over the name; group labels 12 px muted.
- **Empty column box:** 48 px tall, 1 px dashed `line-strong`, 8 px corners.
- Dark mode, reduced motion (no auto-pan easing, no lift animation) and phones as in B1; nothing cut short, and every
  row of controls wraps.

## 10. How it's built

New:

- `src/lib/canvas/history.ts` (pure, tested): the canvas history. A step holds, for each email it touched, the
  document and subject before and after, and for each brand kit, the styles before and after. Push (with merge keys:
  the same key within a second joins, a key starting with "~" always joins), undo and redo return what to put back.
  At most 100 steps.
- `src/lib/design/email/clip.ts` (pure, tested): what a copy holds (the element, its own styles and classes, its kit
  and workspace), writing and reading it (with every check in section 6), and putting it into a document with new
  ids, keeping or dropping classes and component uses (`putClip`). It also takes an element out of one document and
  into another (`transferEl`), and says where a paste lands (`pastePlace`, the table in section 6).
- `src/lib/design/email/drop.ts` (pure, tested): where a dragged thing lands from sibling boxes and a pointer point
  (`slotIndex`, the 8 px new-section zone, columns by x), and the resize math (`resizeWidth`: sides by alignment,
  limits, snapping).
- `src/components/app/emails/canvas/useCanvasEditor.ts`: the editor (section 2), replacing `useEmailDraft.ts`.
- `src/components/app/emails/canvas/useCanvasDrag.ts`: dragging elements and + panel tiles across frames, the line,
  the chip and auto-pan.
- `src/components/app/emails/canvas/AddPanel.tsx`: the + panel.
- `src/components/app/forms/designSave.ts`: the design save call, shared by `useDesignDraft` and the canvas editor.

Changed:

- `EmailCanvasPage.tsx`: the editor, drags, resize, the + panel, copy and paste, the right-click menu, the new keys.
- `Overlay.tsx`: the grip, image handles, the width tag, the drop line and the chip.
- `LayerTree.tsx`: Copy, Cut and Paste in its menu.
- `ImagePicker.tsx`: can open its library from outside (double-click a picture, a new Image block).
- `compile.ts`: the empty column and empty email boxes, in previews only.
- `useDesignDraft.ts`: uses `designSave.ts`.
- `scripts/email-canvas/entry.tsx`: a second brand kit and a component, and a switch that makes a save fail once or
  answer "not a draft", for the checks below.

Left out on purpose: B2 planned to move the Email Studio onto the canvas's editor in B4. Nobody can edit an email in
both at once (opening the Studio leaves the canvas and saves first), so sharing the editor would change nothing
people see and would risk the Studio. The Studio keeps its own editor until the canvas does everything it does, then
it goes (after B5).

No database change.

## 11. How we prove it

- `tests/canvasHistory.test.ts`: steps over several emails and kits; undo and redo put back every email in a step;
  merging (same key within a second, "~" always); a new change clears redo; the 100-step cap; dropping one kit's steps.
- `tests/emailClip.test.ts`: a copy and paste gives new ids and keeps styles; classes kept with the same kit and left
  off with another; a component use kept or detached; a crafted clipboard (script in rich text, a `javascript:` link,
  an unknown block type, 10,000 blocks) is cleaned or refused; full emails refuse; every row of the paste-place table;
  `transferEl` leaves no copy behind and keeps the target's other blocks.
- `tests/emailDrop.test.ts`: slots by halves, empty columns, columns by x, the new-section zone, component sections,
  section slots; resize by alignment and corner, limits, snapping and Shift.
- `tests/email.test.ts` addition: empty column boxes appear in previews and never in a send build.
- `scripts/email-canvas-check.ts` part B4, in Chromium with the stand-in database:
  - drag a heading below the next block: one save with the new order; Escape mid-drag changes nothing;
  - drag a block into the second email: it leaves the first and joins the second, the gaining email saves first, and
    one ⌘Z puts it back in both (two saves);
  - Alt-drag copies; a drag from a sent email copies and the sent email doesn't change;
  - **a flaky save:** the gaining email's first save fails with a 503; it's tried again on its own, then the losing
    email saves; nothing is lost and no error stays;
  - **sent meanwhile:** the gaining email answers "not a draft"; the move is taken back on screen, the message shows,
    and the losing email never saves;
  - drag a section to a new place; drag a block next to a section line to make a new section;
  - auto-pan: holding a drag near the right edge moves the canvas;
  - resize a picture by its right corner: the width tag, snapping to the column, one save with the width; Shift
    turns snapping off; centered pictures grow from both sides;
  - the + panel: click Heading adds it after the picked block and starts typing; drag 2 columns between two sections;
    a component lands as a use; the panel works as a sheet at 390 px;
  - ⌘C then ⌘V in the second email pastes with new ids; ⌘X removes and ⌘V brings it back; a crafted clipboard with a
    script pastes without it; words with a Markdown heading paste as blocks;
  - Alt+Shift+→ moves a block to the next email;
  - the right-click menu opens on a part and its Copy and Delete work;
  - after ⌘Z of a change in an email out of view, the canvas pans to it;
  - B1, B2 and B3 checks still pass; no page errors, in light and dark.

## 12. Not in B4

Tia on the canvas, versions on the artboard and comments (B5). Picking several blocks at once (Shift+click inside an
email) and dragging them together. Pasting a picture file from the clipboard (it needs the upload flow on the canvas).
Section templates in the + panel ("Hero", "Feature row"). Resizing columns by dragging the line between them. Moving
the Email Studio onto the canvas's editor (section 10).

## 13. Running cost

| | Beta (50 teams) | Growth (500 teams) |
| --- | --- | --- |
| Servers and database | $0 (it runs in the browser; saves are the same `email_draft_save` calls, a move is two of them) | $0 |
| Claude | $0 (no AI in B4) | $0 |
| **Total added** | **$0 a month** | **$0 a month** |
