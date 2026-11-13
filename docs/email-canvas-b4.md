# B4: drag and drop, the + panel, image resize, copy and paste

Plan, 13 November 2026 (detailed edition). Step B4 of `docs/email-canvas-plan.md`, after B1 (the canvas,
`docs/email-canvas-b1.md`), B2 (picking and the panel, `docs/email-canvas-b2.md`) and B3 (typing in place,
`docs/email-canvas-b3.md`). B5 (Tia on the canvas, versions, comments, Campaigns views) is in `docs/email-canvas-b5.md`
and builds on what B4 makes here.

B4 makes the canvas the place where emails are built by hand. People drag blocks and sections inside an email and
between emails, add blocks from a panel on the left, resize pictures by their corners, and copy, cut and paste
anywhere on the canvas, with one undo history that covers it all.

**Contents.** 1 Goals and done. 2 Words used here. 3 Sources. 4 The canvas editor. 5 Drag and drop. 6 Image resize.
7 The + panel. 8 Copy, cut and paste. 9 Keys. 10 The right-click menu. 11 Undo and redo. 12 Screen readers and
keyboards. 13 Look. 14 Speed. 15 Code: files and functions. 16 Build order. 17 Tests. 18 Risks. 19 Not in B4.
20 Running cost.

---

## 1. Goals and what "done" means

B4 is done when all of these hold in the browser check (section 17.4) and in the app:

1. A block dragged inside an email lands where the green line showed, and one save goes out with the new order.
2. A block dragged into another email leaves the first and joins the second. One ⌘Z puts it back in both.
3. No drag, paste, cut, undo or failed save ever leaves a block in neither email.
4. A save that fails once with a hiccup is tried again on its own and nobody notices.
5. A picture resized by a corner keeps its shape, never grows past its column, and saves one width.
6. A block added from the + panel lands where the table in section 7.4 says, picked, and typing starts for text kinds.
7. A block copied with ⌘C pastes with ⌘V into any draft on any canvas in the same browser, with new ids, and a
   crafted clipboard can't put script or bad links into an email.
8. Sent emails never change.
9. Every B1, B2 and B3 check still passes, with no page errors, in light and dark, and at 390 px wide.

---

## 2. Words used here

| Word | Means |
| --- | --- |
| Email | One email on the canvas (an artboard), a row of `emails` |
| Draft | An email whose status is `draft`; the only kind that changes |
| Element | A section, a column or a block inside an email |
| Part | A styled piece of an element (B2), such as a button's `button` part |
| Slot | A place something can land: a column and an index, or a section index |
| Step | One entry in the undo history; it can change several emails and brand kits at once |
| Clip | What ⌘C puts on the clipboard: one element, its own styles and classes, where it came from |
| Kit | A brand kit; it holds the design system (styles, classes, components) emails use |
| Local px | A distance in the email's own pixels, inside its frame (screen px divided by the zoom) |
| Gainer, loser | In a move between emails: the email that gets the element, and the email it leaves |

---

## 3. Sources

- **Brew** (the owner's screenshots; Brew's pages don't describe this): "drag to reorder" on blocks, a grip on the
  left of the picked element, an add panel on the left with blocks and saved sections, corner handles on pictures.
- **How design tools behave**, so people's hands already know it: Figma and Framer drag what's picked, or the
  innermost thing under the pointer; Alt while dragging copies; a 4 px move starts a drag so clicks stay clicks; the
  canvas pans when a drag nears its edge; one undo history per file; Escape cancels a drag; ⌘C, ⌘X and ⌘V work across
  files in the same app.
- **Ours already:** the document operations (`src/lib/design/email/ops.ts`), components
  (`src/lib/design/email/components.ts`), the reader that checks every saved email (`readEmailDoc`), the B2 picking
  and overlay, the B3 typing, the B1 email drag and resize, and B3's paste rules (`typing.ts`).

---

## 4. The canvas editor

### 4.1 Why it changes

B2's editor (`useEmailDraft.ts`) holds one email at a time, with an undo history per email. Three B4 features break
that:

- A move between emails changes two emails. With two histories, undoing in one leaves the block missing from the
  other, so a block can be lost.
- A cut in one email and a paste in another are two changes people think of as one move.
- B2 already had an oddity: an "Every heading" change alters every email on the brand but sits in one email's
  history, so it can't be undone from another email.

### 4.2 What replaces it

`src/components/app/emails/canvas/useCanvasEditor.ts`: one editor for the whole canvas, with one undo history.

**State, as types:**

```ts
type EmailState = {
  id: string;
  doc: EmailDoc;            // what the canvas shows now
  subject: string;
  name: string;             // the row's name, for the "Untitled email" rule
  kitId: string | null;     // doc.kitId, or the workspace's first kit
  readOnly: boolean;        // not a draft, or found sent on save
  savedDoc: EmailDoc;       // what the server has, as far as we know
  savedSubject: string;
};
type KitState = { id: string; system: DesignSystem; rev: number; live: DesignSystem };
type Snap = { doc: EmailDoc; subject: string };
type Step = {
  key?: string; at: number;                                   // merge key and time
  emails: Record<string, { before: Snap; after: Snap }>;
  kits: Record<string, { before: DesignSystem; after: DesignSystem }>;
  label: string;                                              // "Move Heading", for screen readers
};
type Pending = { id: string; due: number; tries: number; waitFor: Set<string> };
```

- `emails` holds only the emails changed or opened in this visit; all others are read from the canvas's rows when
  needed. The first change to an email copies it in from its row.
- `kits` holds a draft for each brand kit a change touched, read from the kits query the first time.

**The editor's calls:**

| Call | Does |
| --- | --- |
| `docOf(id)` | The email's document as the canvas shows it now (local, or from its row) |
| `latest(id)` | The same, including changes made since the last render (for handlers) |
| `systemOf(kitId)` | The kit's design system as edited now |
| `change(c, o)` | Makes one change: `c = { emails?: Record<id, Partial<Snap>>, kits?: Record<kitId, DesignSystem> }`, `o = { merge?: string; label: string; order?: { gainer: string; loser: string } }`. Pushes one step, schedules saves |
| `undo()` / `redo()` | Takes back or does again the last step; returns the email ids it changed |
| `canUndo`, `canRedo` | For the header buttons |
| `draft(id)` | The B2 shape (`EmailDraft`) for one email, so `Inspector.tsx`, `useTyping.ts` and the typing code keep working |
| `flush()` | Saves everything now, in order; true when nothing is left |
| `retry()` | Tries the failed saves again |
| `status` | `{ saving: boolean; failed: { id: string; name: string; message: string }[] }` |
| `stylesChanged(kitId?)` | A kit has style changes not published yet |
| `publishStyles(kitId)` | Saves then publishes a kit's styles |
| `readOnly(id)` | Whether an email can't change |

`draft(id)` maps onto the editor like this, field by field, so the B2 and B3 code changes only at its call sites:

| `EmailDraft` field | From the editor |
| --- | --- |
| `id`, `doc`, `subject`, `readOnly` | That email's state |
| `system`, `kit`, `tokens` | Its kit's state and tokens |
| `apply(next, merge)` | `change({ emails: { [id]: { doc, subject } }, kits: system ? { [kitId]: system } : {} }, { merge, label })` |
| `latest()` | `latest(id)` |
| `undo`, `redo`, `canUndo`, `canRedo` | The canvas history (they no longer belong to one email) |
| `saving`, `error` | `status`, filtered to that email |
| `flush` | `flush()` |
| `stylesChanged`, `publishStyles` | For that email's kit |

### 4.3 History rules

- **Push:** every `change` makes one step with each touched email's before and after, and each touched kit's before
  and after. A change that alters nothing (every after equals its before) makes no step and saves nothing.
- **Merge:** a change with the same `merge` key as the last step, within 1,000 ms, joins it: the step keeps its
  befores and takes the new afters. A key starting with `~` (a typing run, B3) joins however long the pauses are.
  A change to a different email or kit than the step already holds never joins.
- **Redo** is cleared by any new step.
- **Cap:** 100 steps; the oldest goes first.
- **Undo:** puts every email and kit in the step back to its before, as one change, and schedules their saves.
  If one of those emails has turned read-only (it was sent), that email is left as it is, the others are undone, and
  the canvas says "Welcome was sent, so it stayed as it is."
- **After undo or redo:** if the first email the step touched is outside the view, the canvas pans to it at the same
  zoom (`glide`), and the element the step was about is picked when it still exists; otherwise its email is picked.
- **What isn't a step** (as in B1): making, deleting, renaming and duplicating whole emails, moving emails in the row
  or between groups, sends, tests, and publishing styles. They save at once and have their own messages.

### 4.4 Saving

- **When:** each email saves 800 ms after its last change; each kit 700 ms after its last change (as
  `useDesignDraft` does now). Everything saves at once when the canvas closes, when a campaign is opened in the Email
  Studio, when the page is hidden (`visibilitychange`), and before Send and Test.
- **How:** an email through `email_draft_save` (name, subject, preview text, document), with B2's rule that an
  "Untitled email" takes its subject as its name. A kit through the design save call (section 4.6).
- **One at a time per email:** a save for an email waits for that email's save in flight; changes made meanwhile go in
  the next save.
- **Retries:** a hiccup (a timeout after 15 seconds, a network error, a 5xx or a 429) is tried again on its own, up to
  3 more times, after 0.5, 1 and 2 seconds, each with up to 20% random extra wait. Other errors don't retry.
- **What shows:** "Saving…" in the header only while a save takes longer than 400 ms. What still fails shows as one
  line in the header, "Welcome wasn't saved", with Try again; several failures show "2 emails weren't saved".
- **Order for moves:** a `change` with `order: { gainer, loser }` gives the loser's pending save `waitFor: {gainer}`.
  The loser saves only after the gainer's save worked. If the gainer's save fails for good, the loser keeps waiting
  (shown under the gainer's failure); Try again retries both in order. The worst case is a copy in both emails, never
  a block in neither.
- **Sent meanwhile:** when a save answers "not a draft", that email turns read-only. If the failed save was a gainer's
  in a move, the whole step is taken back on screen (both emails return to their befores, the loser's waiting save is
  dropped), and the canvas says "Class reminder was sent, so the block stayed in Welcome." Otherwise the canvas says
  "This email was sent. Your last change wasn't saved." as in B2.
- **Rows:** after each save worked, the canvas's rows query is updated in place (`rows.set`) with the saved document,
  subject and name, so other parts of the page see the new content without a reload.
- **No browser pop-ups:** leaving with saves still failing doesn't show the browser's "leave site?" box (the app's rule
  against browser pop-ups). The failure line stays until it's fixed, and saves are tried again when the page is shown
  again.

### 4.5 Changes from elsewhere

The rows query reloads after B1 actions (rename, move to group, send). For an email with no local changes and no save
waiting, a newer row replaces the local copy. For an email with local changes, the local copy wins and saves; the
next row reload brings the merged result back.

### 4.6 Brand styles, per kit

- The design save moves out of `useDesignDraft.ts` into `src/components/app/forms/designSave.ts`:
  `saveDesign({ session, workspaceId, kitId, design, rev }) → { ok: true; rev } | { conflict: true; rev; design } |
  { error: string; retry: boolean }`. `useDesignDraft` uses it, so the Email Studio's behavior doesn't change.
- The canvas editor keeps one `KitState` per kit it touched, and saves each with the same retries as emails.
- **Conflict:** when someone else saved the kit first, their version comes in, the canvas says "Someone else changed
  these styles", and every undo and redo step that touches that kit is dropped (undoing them would overwrite the other
  person's work). Steps that touch only emails stay.
- **Publish styles** shows in the header when any kit has unpublished changes; with several kits it says "Publish
  styles (2 brands)" and publishes each.

### 4.7 Moving the B2 and B3 code over

- `useEmailDraft.ts` is deleted. `EmailCanvasPage.tsx` uses `useCanvasEditor` and passes `editor.draft(editId)` where
  it passed the draft before. `Inspector.tsx` takes the same `EmailDraft` shape and doesn't change.
- `useTyping.ts` keeps its `doc` and `apply` options: `doc: () => editor.latest(editId)`,
  `apply: (d, merge) => editor.change({ emails: { [editId]: { doc: d } } }, { merge, label: "Typing" })`.
- The header's Undo and Redo use the canvas history; their tooltips stay "Undo (⌘Z)" and "Redo (⇧⌘Z)".
- The B1 resize (email width) goes through `change` too, as B2 already did for the edited email.

---

## 5. Drag and drop

### 5.1 The gesture, step by step

```
idle ──press──▶ pressed ──moved 4 screen px──▶ dragging ──release over a slot──▶ drop (one change)
                  │                               │
                  └──release (no move): a click   ├──release where no slot shows──▶ cancel
                                                  ├──Escape, pointercancel, window blur──▶ cancel
```

- **Press:** a primary-button press on an email (the artboard, the grip, or a + panel tile) records the pointer id,
  its screen point, the time, and what would drag (section 5.2). Nothing changes yet; the click rules of B2 still pick.
- **Pressed → dragging:** once the pointer moves 4 screen px (any direction) with the button still down. The pointer
  is captured by the canvas (`setPointerCapture`) so moves over panels or outside the window still count.
- **While typing (B3)** nothing on the email being typed in starts a drag; the press places the caret.
- **The B1 drags stay:** pressing an email's name or its B1 grip drags the whole email in the row; its side handles
  change its width. Those starts are checked first and never become element drags.

### 5.2 What drags

| Press on | Drags |
| --- | --- |
| A point inside the picked element (block, column or section) | The picked element; a picked column drags its section |
| A point outside the picked element, inside an email | The innermost block under the pointer, which gets picked when the drag starts |
| A point inside an email on its padding, with no block under it | Nothing (a click picks the email, as in B2) |
| The grip left of the picked element | The picked element |
| A block inside a component use (locked) | The whole component section |
| Any element of a sent email | A copy of it (the chip says "Copy"; the sent email never changes) |
| A + panel tile | A new block, columns section or component (section 7.5) |

The email is the one under the press; it becomes the edited email when the drag starts (as a click would make it).

### 5.3 Finding what's under the pointer, across emails

Run once per animation frame while dragging, with the last pointer point:

```
world  = toWorld(camera, screen point)
email  = the email whose rect holds world (rowLayout rects); none → no slot
frame  = frames.get(email); none or not loaded → no slot
local  = (screen point − frame's screen rect top-left) / zoom
el     = frame.contentDocument.elementFromPoint(local)
climb el → the nearest [data-eid] that's in that email's document
          (component copies climb to their section, as in B2's hitAt)
```

The result is one of: a block, a column, a section, the email (`data-eid="email"`, the content table), or nothing
(the page around the content). Then section 5.4 turns it into a slot.

### 5.4 Where a drag lands

All distances in local px unless marked. `zone = 8 / zoom` (8 screen px).

**Dragging a block (or a new block from the + panel):**

1. **Between sections.** If the point is within `zone` of the top edge of a section's box, or of the bottom edge of
   the last section, the slot is a new section at that index (`{ section: i }`): the block lands as a section of its
   own. The line spans the email's content width.
2. **On a block** in a column: the slot is that column at the block's index, or index + 1 when the point is below the
   block's middle.
3. **On a column** (its empty space, or the dashed box of an empty column, section 7.6): the slot is that column at
   the index found by comparing the point's y with the middles of the column's blocks (`slotIndex`).
4. **On a section with several columns**, outside any block: the column whose box holds the point's x; when the
   columns are stacked (phone view), the column whose box holds the point's y; when none does, the nearest column box.
   Then as rule 3.
5. **On a section with one column:** that column, as rule 3.
6. **On a component use** (locked): the slot is a new section before the component when the point is above its
   middle, otherwise after it.
7. **On the email's own space** (the content table's padding) or the page around it: the nearest section by y, then
   rules 3 to 5.
8. **On a sent email:** no slot; the chip says "Sent".
9. **Full:** if the target email already has 200 blocks (or 40 sections for rule 1), no slot; the chip says "Full".

**Dragging a section (or columns or a component from the + panel):** the slot is a section index: before the section
under the point when the point is above its middle, otherwise after it. Over the email's own space, the nearest
boundary. A section never lands inside a column.

**Elements hidden on the current screen** (B2's Show on: desktop only, phone only) aren't drawn, so they take no
slot; a drop lands among the elements shown, and the hidden ones keep their places around it.

**No-op:** when the slot is the element's own place (before or right after itself in the same column, or its own
section index or the one after it), the line still shows, but the drop changes nothing and makes no step.

### 5.5 What shows while dragging

- **The source** stays in place at 40% (a style added to its frame: `[data-eid="<id>"]{opacity:.4}`, removed on drop
  or cancel). A drag out of a sent email leaves it at full strength.
- **The chip** follows the pointer, 12 px right and 12 px below it: the kind's icon and name ("Heading", "Section",
  "2 columns", "Footer (component)"), plus "Copy" when Alt is held or the source is sent, "Sent" or "Full" when the
  target can't take it. It never covers the line: when the line is within 24 px below the pointer, the chip goes above
  the pointer.
- **The line:** 2 px, `signal`, with a 6 px dot at each end. For a column slot it spans the column's inner width, at
  the middle of the gap between the two blocks (or 2 px inside the column's top or bottom edge at the ends). For a
  section slot it spans the email's content width at the boundary. It's drawn on the screen layer, so it keeps its
  thickness at every zoom.
- **The pointer** shows the grabbing hand over the canvas, and "not allowed" where no slot shows.
- **Hover outlines, the element bar, the format bar and the panel's edits** pause while dragging; the right panel
  stays open and shows the dragged element.

### 5.6 Auto-pan

- When the pointer is within 48 screen px of an edge of the canvas, the canvas pans that way each frame by
  `speed = 4 + 16 × (1 − distance / 48)` screen px (4 at the zone's inner edge, 20 at the canvas's edge), on both axes
  at a corner.
- The pan goes through a new Surface call, `nudge(dx, dy)`, which moves the camera without easing and keeps the
  frames that load near the view up to date (B1's `onView`).
- Section 5.3 runs again after each pan with the last pointer point, so the line follows what's now under it.
- Auto-pan stops when the pointer leaves the zone, the drag ends, or the canvas reaches 3 screens past the last email.
- With reduced motion it still pans (it's what the person's hand asks for), at the same speeds.

### 5.7 The drop

| Case | Change (one step) | After |
| --- | --- | --- |
| A block to another place in its email | `moveBlock(doc, id, slot)`; to a new section: `moveToNewSection(doc, id, i)` | The block stays picked |
| A section to another place | `moveSection(doc, id, i)` | The section stays picked |
| Into another email | `transferEl(from, to, id, slot, rules)`, saved gainer first (section 4.4) | The other email is edited; the element is picked there |
| Alt held, or from a sent email | `copyElTo(from, to, id, slot, rules)` (same email or another) | The copy is picked |
| A + panel tile | Section 7.5 | The new element is picked |

- **Rules for another email** (`rules` in `transferEl` and `copyElTo`): the element keeps its own styles. Its classes
  come along when both emails use the same kit; otherwise classes the target kit doesn't have are left off. A
  component use comes along when the target kit has that component; otherwise it arrives detached (its last copy of
  blocks, as plain blocks). Merge tags, links and pictures come along as they are.
- **Labels for the step** (and screen readers): "Move Heading", "Move Heading to Class reminder", "Copy Section".
- A screen reader hears the result through a polite live region: "Heading moved to Class reminder".
- **Cancel** removes the 40% style, the line and the chip; nothing changes and nothing saves.

### 5.8 Touch screens

A finger on an email pans (B1). An element drags on touch from its grip only; the grip shows on the picked block or
section. The same lines, chip and auto-pan apply.

---

## 6. Image resize

### 6.1 The handles

- A picked Image or Logo block shows four handles on the corners of the picture itself (the element with the class
  `c<id>-image`, read from the frame like B2's boxes), in Desktop view only. Phones show pictures at full width, so
  the handles hide in Phone view.
- No handles on sent emails, on pictures inside component uses, or while typing.

### 6.2 The math

Let `w0` be the picture's width when the press began (local px), `dx` the pointer's move along x in local px
(screen px divided by the zoom), and `align` the block's alignment.

- **Which way grows:** a right corner grows with `+dx`, a left corner with `−dx`.
- **Alignment:** left-aligned pictures grow from their left edge; right-aligned from their right edge; centered from
  both sides, so the width changes by twice the pointer's move: `w = w0 + 2 × d`; otherwise `w = w0 + d`, where `d` is
  the signed move from the rule above.
- **Limits:** `min` is 24 (logo 40); `max` is the column's inner width (logo: the smaller of that and 400). `w` is
  clamped to `[min, max]` and rounded to whole px.
- **Snapping** (`resizeWidth`): the candidates are `max` (the column's width) and the picture's own width (its
  `naturalWidth`, when smaller than `max`). When `|w − candidate| ≤ 6 / zoom`, `w` becomes that candidate. Holding
  Shift turns snapping off.
- **Height** follows by itself (the picture keeps its shape). A picture whose height was set in the B2 panel keeps
  that height, so only its width changes (it's then cropped by its Fit setting, as the panel shows).

### 6.3 While dragging and after

- **Live:** each frame sets the picture's own `width` and `max-width` in the frame (`img.style`), so it changes size
  at once without a rebuild; B2's boxes are read again, so the outline and handles follow. A green tag above the
  picture shows "320 px" (and "Column width" or "Own size" when snapped).
- **Release:** one change, label "Resize Image":
  - `updateBlock(doc, id, { width })`, written as the picture's `width` attribute (Outlook reads it). When `w` equals
    the column's width, an Image's `width` is removed instead, so the picture stays full width if the column grows.
    A Logo always keeps a width (its document requires one, 40 to 400).
  - This picture's own `width` and `max-width` styles (from the B2 panel, Desktop, Plain) are removed, so they don't
    hide the new width. When a class or "Every image" sets a width, the resize also writes this picture's own `width`
    style as `Npx`, so it wins.
- **Escape** while dragging puts the picture back at `w0` and changes nothing.
- **No change** (released at `w0`): no step, no save.

### 6.4 Double-click a picture

Opens the media library to replace it: the right panel shows the Element tab with Content open, and the picture
field's library opens (`ImagePicker` gets an `openLibrary` signal, a number that opens it when it changes). Picking a
picture replaces it as one step. A new Image block from the + panel opens it the same way (section 7.4).

---

## 7. The + panel

### 7.1 Opening and closing

- A round + button floats at the top left of the canvas (12 px from the edges), labeled "Add a block". Pressing A
  (with nothing being typed and no text box in focus) opens it too.
- The panel docks on the left of the canvas, 264 px wide, under the page header, with a close X. Under 1,024 px wide it
  becomes a sheet from the bottom, up to 55% of the canvas's height, like the right panel. Escape closes it when focus
  is inside it.
- Whether it's open is remembered on this computer per canvas (`localStorage`, read and written inside try and
  catch).
- The left and right panels can be open together; the canvas between them keeps working, and its tools and zoom
  control stay inside it.

### 7.2 What's in it

Tiles, two per row, each with an icon above its name. Group labels are small gray words.

| Group | Tiles |
| --- | --- |
| Basics | Heading, Text, Button, Image, List, Quote, Divider, Spacer |
| Columns | 2 columns, 3 columns, 1:2, 2:1 |
| More | Logo, Social links, Video, Product, Event, Meeting link, Signature, Footer, HTML |
| Components | The brand's saved components by name (only when the edited email's kit has some) |

Names show in full and wrap; a long component name takes two lines. Icons that `src/components/Icons.tsx` doesn't
have yet are added there in its style (stroke 1.8, 24 px grid): Image, Columns, Quote, Spacer, Footer, Logo, Video.

### 7.3 Which email it adds to

The email being edited. With no email picked, the first email in view (the one whose center is nearest the canvas's
center) is picked first. With only sent emails in view, the tiles stay enabled and a click says "Sent emails can't
change. Duplicate to edit."

### 7.4 Click a tile: where it lands

| Picked | A block lands | Columns or a component lands |
| --- | --- | --- |
| A block | Right after it, in its column | After its section |
| A column | At the end of that column | After its section |
| A section | At the end of its first column (a component use: after the section) | Right after it |
| The email, or nothing inside it | Before the footer's section, as a new section; with no footer, at the end | Before the footer's section, or at the end |

- **Then:** the new element is picked and scrolled into view (the canvas pans only when it's out of view).
  A Heading, Text, Button, List or Quote starts typing at once with its starting words selected, so typing replaces
  them (B3). An Image opens the media library (section 6.4). A Social links block starts with the links the brand
  scan found (`kit.social`), as in the Email Studio.
- **Columns:** a new section with that many empty columns (widths 50/50, 33/34/33, 33/67, 67/33), made by
  `newSection([])` then `setColumns`.
- **Components:** `insertComponent(doc, system, componentId, index)`, as the Email Studio does.
- **Full:** at 200 blocks or 40 sections the click says "This email is full." and nothing changes.

### 7.5 Drag a tile

The same gesture as section 5 with a new element as the source. Blocks follow the block rules of section 5.4;
Columns and components follow the section rules. On drop, the element is made and placed as one step, labeled "Add
Heading", and the same "then" rules as a click apply. Dropping where no line shows adds nothing.

### 7.6 Empty columns and empty emails on the canvas

So they can take a drop, the canvas's own build (`compileEmail(..., { preview: true })`, the build with B2's marks)
draws:

- in an empty column, a box 48 px tall, 1 px dashed, 8 px corners, inside the column's `data-eid` element;
- in an email with no sections, a box 120 px tall inside the content table, marked as the email.

Emails that go out (`preview` off) never have them; a test proves it (section 17.1). The boxes use a fixed neutral
gray (the email build has no app tokens); they show only on the canvas.

### 7.7 Keys inside the panel

Tab moves through the tiles; Enter or Space adds the focused tile (the click rules); Escape closes the panel and gives
focus back to the canvas.

---

## 8. Copy, cut and paste

### 8.1 When the keys work

⌘C, ⌘X and ⌘V act on the canvas when all of these hold: the canvas page is open, no text box or editable text has
focus, no dialog or menu is open, nothing is being typed (B3 keeps its own paste rules while typing), and no drag or
resize is going on. They listen to the browser's own `copy`, `cut` and `paste` events on the document, so the
clipboard is written and read inside the event (the only place browsers allow both without asking).

### 8.2 What's copied

The picked block or section (a picked column copies its section). Copying the whole email isn't in B4 (⌘D duplicates
an email).

**The clip**, version 1:

```json
{
  "claritia": "email-clip",
  "v": 1,
  "kind": "block" | "section",
  "el": { ... the block or section as in the document ... },
  "styles": { "<id>": { ... } },        // the element's own styles and those of its columns and blocks
  "classes": { "<id>": ["<classId>"] },
  "kit": "<kit id or null>",
  "ws": "<workspace id>",
  "from": "<email id>"
}
```

**On the clipboard**, three ways at once, so it survives every browser:

1. `application/x-claritia-email+json`: the clip as JSON (Chrome, Edge and Firefox keep custom types between pages
   and tabs).
2. `text/html`: readable HTML of the element for other apps, wrapped as
   `<div data-claritia-clip="<base64 of the clip>">…</div>` (Safari keeps only standard types; this one survives).
3. `text/plain`: the element's words, from the email's plain-text build (`blockText`, exported from `compile.ts`).

The canvas also keeps the last clip in memory with its plain words, for a browser that keeps none of the above.

### 8.3 Cut

⌘X copies, then removes the element (`removeEl`) as one step labeled "Cut Heading". The B2 "Deleted · Undo" note
shows, saying "Cut".

### 8.4 Paste: reading the clipboard

In this order:

1. `application/x-claritia-email+json`, if present.
2. Otherwise a `data-claritia-clip` marker inside `text/html`.
3. Otherwise the in-memory clip, when the clipboard's plain words equal its plain words (so a copy from another app
   since then wins).
4. Otherwise words from another app (section 8.7).

A clip over 1 MB, of a newer version, or that doesn't parse is ignored, and the paste falls to the next way.

### 8.5 Paste: checking it

A pasted clip is never trusted. Before anything lands:

1. The element is wrapped in a one-section document and read with `readEmailDoc(..., { allowHtml: true })`: rich text
   and HTML go through the allow lists, links must be safe, sizes and counts are cut to the limits, unknown block
   kinds are dropped, and ids that aren't valid are replaced.
2. Styles are kept only for ids that exist in the element, and read through the same checks as a saved email's styles.
3. Classes are kept only when `kit` equals the target email's kit and the class exists in that kit.
4. A component use is kept only when the target kit has that component; otherwise it's detached.
5. Every id gets a new one (`fresh` in `ops.ts`, made public as `freshEl`), so pasting twice gives two copies that
   never share styles.

If nothing is left after the checks, the paste does nothing.

### 8.6 Paste: where it lands

In the email being edited, by the same table as the + panel (section 7.4), with "a copied block" and "a copied
section" in place of a block and columns. Then the pasted element is picked. Pasting into a sent email says "Sent
emails can't change. Duplicate to edit." A full email says "This email is full." With no email picked, the first email
in view is used (section 7.3).

### 8.7 Words from other apps

With no clip found, words pasted on the canvas become blocks after the picked element, by B3's rules (`typing.ts`):
Markdown headings and lists become Heading and List blocks (`markdownBlocks`), other words become one Text block
(`plainToRich`), and rich text keeps bold, italic, underline, strike, links and lists (`cleanTyped`). One step,
labeled "Paste". A pasted picture file is not in B4 (it needs uploading, section 19).

### 8.8 Menus

The right-click menu (section 10) and the Layout tree's menu gain Copy, Cut and Paste. Menu paste can't read the
clipboard (browsers allow that only in a paste event), so menu Paste uses the in-memory clip, and the item is grayed
when there's none, with the hint "⌘V".

---

## 9. Keys

**Who gets a key first**, top to bottom:

1. Text being typed in an email (B3): every key, except that Escape ends typing.
2. A dialog, a menu or a text box with focus: their own keys.
3. A drag or resize going on: Escape cancels it; Alt and Shift change it; everything else waits.
4. The canvas page's keys (below and B1 to B3).
5. The Surface's keys (Space, V, H, zoom keys).

**Keys new in B4:**

| Key | Does |
| --- | --- |
| ⌘C, ⌘X, ⌘V | Copy, cut, paste (section 8) |
| Alt+Shift+← and → | Block or section picked: moves it to the email before or after in the row, before that email's footer section, as one step; it stays picked and the canvas pans to it. Email picked: moves the email in the row (B1). Into a sent email: "Sent emails can't change." |
| Alt (held while dragging) | Copy instead of move |
| Shift (held while resizing) | No snapping |
| A | Opens the + panel |
| Shift+F10 or the menu key | Opens the right-click menu for the picked element |
| Escape | Cancels a drag or resize first; then closes the + panel when focus is in it; then steps out as in B2 |
| ⌘Z, ⇧⌘Z | Undo and redo on the canvas (section 4.3) |

Every key keeps its B1 to B3 meaning otherwise.

---

## 10. The right-click menu

- **Opening:** right-click a part of an email (it's picked first, by B2's rules), or Shift+F10 for the picked element.
  The menu opens at the pointer (or at the element's top left for Shift+F10), on the app's own `Popover`, never the
  browser's menu.
- **Items** for a draft, each with its key on the right:

  | Item | Key | Grayed when |
  | --- | --- | --- |
  | Copy | ⌘C | Never |
  | Cut | ⌘X | Inside a component use |
  | Paste | ⌘V | No clip in memory |
  | Duplicate | ⌘D | Inside a component use |
  | Delete | ⌫ | Inside a component use |
  | Move up | ⌥⇧↑ | Already first |
  | Move down | ⌥⇧↓ | Already last |
  | Select parent | Esc | The email is picked |

- **On a sent email:** Copy, and Duplicate email (B1's duplicate).
- **The Layout tree's menu** (B2) gains Copy, Cut and Paste with the same rules.
- Right-click on the canvas's empty space keeps the browser's own behavior off and shows nothing.

---

## 11. Undo and redo, all together

- One history for the canvas (section 4.3): ⌘Z undoes the last step wherever it was.
- A move between emails, a cut and paste done as one move, a + panel add, a resize, Tia's changes (B5) and a typing
  run are each one step.
- A cut in one email and a paste in another are two steps (cut, then paste), as in any app.
- The header's Undo and Redo buttons show their step's label in the tooltip: "Undo Move Heading (⌘Z)".

---

## 12. Screen readers and keyboards

- Everything a drag does can be done without one: Alt+Shift+arrows move within and between emails; ⌘X and ⌘V move
  anywhere; the Layout tree (B2) moves with its own keys; + panel tiles add with Enter.
- A polite live region announces each step's result: "Heading moved to Class reminder", "Image 320 px wide",
  "Heading added", "Section pasted", "Undone: Move Heading".
- The + panel is a list of buttons with names; the grip and the handles have names ("Drag Heading", "Resize Image from
  the top right corner") but are reached by keyboard only through the moves above (handles aren't in the tab order).

---

## 13. Look

| Thing | Look |
| --- | --- |
| Grip | 16 × 28 px white pill, `shadow-chip`, the dotted grip icon in `muted`, 6 px left of the picked outline, top-aligned |
| Drag chip | White pill, `shadow-float`, 12.5 px medium `ink`, icon 13 px, "Copy" in `signal-text`, "Sent" and "Full" in `muted` |
| Drop line | 2 px `signal`, 6 px dots at the ends, rounded |
| Source while dragging | 40% opacity |
| Image handles | 10 px white squares, 2 px corners, 1.5 px `signal` ring (B1's resize handles) |
| Width tag | 11.5 px white on `signal`, 6 px corners, above the picture's top center |
| + button | 36 px round, white, `shadow-float`, the Plus icon |
| + panel | White, `shadow-rest` hairline on its right, 12 px padding; group labels 12 px `muted`; tiles 72 px tall, 10 px corners, `shadow-rest`, `hover` fill on hover, `shadow-focus` on focus; icon 18 px over a 12.5 px name |
| Empty column box | 48 px, 1 px dashed gray, 8 px corners (in the email build) |
| Right-click menu | The app's menu look (B1's menus) |

Dark mode uses the app's dark tokens for everything drawn by the app; the emails themselves look as they'd arrive.
With reduced motion, the chip and line appear without easing and panel sheets open without sliding. Nothing is cut
short; every row of controls wraps.

---

## 14. Speed

- **While dragging:** one hit test per animation frame (section 5.3), under 2 ms with 60 emails on the canvas; no
  email is rebuilt until the drop.
- **While resizing:** the frame's picture changes size directly; no rebuild until release.
- **After a change:** only the changed emails rebuild (B2's in-place frame update); emails on the same kit rebuild only
  when the kit's styles changed.
- **History:** steps hold whole documents (a few KB each); 100 steps across a canvas stay under a few MB.
- **Saves:** one per changed email after it settles; a move is two.

---

## 15. Code: files and functions

### 15.1 New pure modules (run in the browser and on the server, tested)

`src/lib/canvas/history.ts`:

```ts
export type Snap = { doc: EmailDoc; subject: string };
export type Step = { key?: string; at: number; label: string; emails: Record<string, { before: Snap; after: Snap }>; kits: Record<string, { before: DesignSystem; after: DesignSystem }> };
export type History = { past: Step[]; future: Step[] };
export function push(h: History, step: Step, now: number): History;          // merge rules, cap 100, clears future
export function undo(h: History): { h: History; restore: Pick<Step, "emails" | "kits"> & { label: string } } | null;
export function redo(h: History): { h: History; restore: Pick<Step, "emails" | "kits"> & { label: string } } | null;
export function dropKit(h: History, kitId: string): History;                 // after a style conflict
export function isEmpty(step: Step): boolean;                                // every after equals its before
```

`src/lib/design/email/clip.ts`:

```ts
export type Clip = { claritia: "email-clip"; v: 1; kind: "block" | "section"; el: Block | Section; styles: Record<string, unknown>; classes: Record<string, string[]>; kit: string | null; ws: string; from: string };
export function makeClip(doc: EmailDoc, id: string, ctx: { kit: string | null; ws: string; from: string }): Clip | null;
export function clipToClipboard(clip: Clip, words: string): { json: string; html: string; text: string };
export function clipFromClipboard(data: { json?: string; html?: string }): Clip | null;   // size, version, parse
export type PutRules = { kitId: string | null; classIds: Set<string>; componentIds: Set<string> };
export function putClip(doc: EmailDoc, clip: Clip, at: Place, rules: PutRules): { doc: EmailDoc; id: string } | { error: "full" | "empty" };
export function transferEl(from: EmailDoc, to: EmailDoc, id: string, at: Place, rules: PutRules): { from: EmailDoc; to: EmailDoc; id: string } | { error: "full" | "missing" };
export function copyElTo(from: EmailDoc, to: EmailDoc, id: string, at: Place, rules: PutRules): { to: EmailDoc; id: string } | { error: "full" | "missing" };
export type PasteTarget = { picked: string | null };   // a block, column or section id, or null for the email
export function pastePlace(doc: EmailDoc, picked: string | null, kind: "block" | "section"): Place;  // the table in 7.4 and 8.6
```

`src/lib/design/email/drop.ts`:

```ts
export type Box = { x: number; y: number; w: number; h: number };
export function slotIndex(mids: number[], y: number): number;                  // blocks' middles in a column
export function columnAt(cols: { id: string; box: Box }[], x: number, y: number): string;   // x, then y when stacked, then nearest
export function blockSlot(hit: Hit, geom: Geometry, point: { x: number; y: number }, zone: number): Drop | null;
export function sectionSlot(sections: Box[], point: { y: number }): number;
export function isNoop(doc: EmailDoc, id: string, drop: Drop): boolean;
export function lineFor(drop: Drop, geom: Geometry): { x: number; y: number; w: number };
export function resizeWidth(o: { w0: number; dx: number; corner: "tl" | "tr" | "bl" | "br"; align: Align; min: number; max: number; natural?: number; zoom: number; snap: boolean }): { w: number; snapped: "column" | "own" | null };
```

`Hit` and `Geometry` are plain data read from the frame by the page (element ids, kinds and boxes), so `drop.ts`
never touches the DOM and is tested with numbers.

`src/lib/design/email/ops.ts` additions: `moveToNewSection(doc, id, index)` (a block out of its column into a new
section of its own), and `freshEl` (the existing private `fresh`, made public for paste).

`src/lib/design/email/compile.ts`: exports `blockText`; draws the empty boxes of section 7.6 when `preview` is on.

### 15.2 New browser code

| File | Holds |
| --- | --- |
| `canvas/useCanvasEditor.ts` | The editor (section 4): emails, kits, history, saves, retries, order, conflicts, `draft(id)` |
| `canvas/useCanvasDrag.ts` | The gesture (5.1), what drags (5.2), hit testing across frames (5.3), slots via `drop.ts`, the source style, auto-pan, the drop |
| `canvas/useImageResize.ts` | The handles' gesture, live sizing in the frame, the release change |
| `canvas/useCanvasClipboard.ts` | The copy, cut and paste events, the three clipboard ways, the in-memory clip, paste place and checks |
| `canvas/AddPanel.tsx` | The + button and panel (section 7) |
| `canvas/CanvasMenu.tsx` | The right-click menu (section 10) |
| `canvas/DragLayer.tsx` | The chip and the drop line on the screen layer |
| `src/components/app/forms/designSave.ts` | The design save call (section 4.6) |

All paths under `src/components/app/emails/` unless shown.

### 15.3 Changed

| File | Change |
| --- | --- |
| `EmailCanvasPage.tsx` | Uses the editor and the four hooks; renders the left panel, menu and drag layer; new keys. It's 1,090 lines now; the hooks above take the new logic so it doesn't grow much |
| `Overlay.tsx` | The grip, the image handles, the width tag |
| `Artboard.tsx` | Lets the page add and remove the 40% style and set a picture's width in its frame |
| `LayerTree.tsx` | Copy, Cut and Paste in its menu |
| `Inspector.tsx` | Unchanged API; the Content group passes `openLibrary` to the picture field |
| `email/ImagePicker.tsx` | `openLibrary?: number` |
| `canvas/Surface.tsx` | `nudge(dx, dy)` in its API |
| `forms/useDesignDraft.ts` | Uses `designSave.ts` |
| `Icons.tsx` | Image, Columns, Quote, Spacer, Footer, Logo, Video icons |
| `canvas/useEmailDraft.ts` | Deleted |
| `scripts/email-canvas/entry.tsx` | A second brand kit, a saved component, and the failure switches of section 17.3 |
| `scripts/email-canvas-check.ts` | Part B4 |

No database change.

### 15.4 Left out on purpose

B2 planned to move the Email Studio onto the canvas's editor in B4. Nobody can edit an email in both at once (opening
the Studio saves and leaves the canvas), so it would change nothing people see and would risk the Studio, which
automation emails and templates still use (B5e). The Studio keeps its own editor.

---

## 16. Build order

Each step ends with the unit tests and browser checks so far passing, and can be committed on its own.

| # | Step | Proven by |
| --- | --- | --- |
| 1 | `history.ts`, `clip.ts`, `drop.ts`, the `ops.ts` and `compile.ts` additions | Their unit tests (17.1) |
| 2 | `designSave.ts`; `useDesignDraft` on it | `scripts/studio-check.ts` still passes |
| 3 | `useCanvasEditor`; the page, `Inspector` and `useTyping` on it; `useEmailDraft` deleted | Every B1 to B3 browser check still passes |
| 4 | Retries, save order and "sent meanwhile" | Browser checks with the failure switches (17.4, items 6 and 7) |
| 5 | Drag and drop inside one email, the grip, the line, the chip | Browser checks 1 to 3 |
| 6 | Between emails, Alt copy, sent sources, auto-pan | Browser checks 4 to 9 |
| 7 | Image resize and double-click to replace | Browser checks 10 to 13 |
| 8 | The + panel, empty boxes | Browser checks 14 to 18 |
| 9 | Copy, cut, paste, words from other apps | Browser checks 19 to 23 |
| 10 | Alt+Shift+← and →, the right-click menu, Shift+F10, announcements | Browser checks 24 to 27 |
| 11 | Docs (this file's "As built", the plan table, CLAUDE.md), the demo page, the PR | Everything above |

---

## 17. Tests

### 17.1 Unit tests

`tests/canvasHistory.test.ts`:

1. A step over two emails undoes both and redoes both.
2. A step over an email and a kit undoes both.
3. The same key within 1,000 ms joins; at 1,001 ms it doesn't.
4. A `~` key joins after 10 seconds.
5. A different email never joins, even with the same key.
6. An empty step isn't pushed.
7. A new step clears redo.
8. The 101st step drops the first.
9. `dropKit` removes steps that touch the kit and keeps email-only steps.

`tests/emailClip.test.ts`:

1. Copy then paste a block: new id, same content, its styles under the new id.
2. Copy then paste a section with two columns: every id new, styles of the section, columns and blocks carried.
3. Pasting twice gives two copies with different ids.
4. Same kit keeps classes; another kit leaves them off; a class missing from the same kit is left off.
5. A component use is kept when the target kit has it, detached (plain blocks) when it doesn't.
6. A crafted clip: script in rich text is removed; a `javascript:` link is removed; an unknown block kind is dropped;
   10,000 blocks are cut to the limit; a 2 MB clip is ignored; version 2 is ignored; bad JSON is ignored.
7. The `text/html` marker round-trips; a marker with bad base64 is ignored.
8. A full email refuses with `full`; a clip with nothing left after checks gives `empty`.
9. Every row of the place table (7.4 and 8.6), for a block and a section, including a component use and an email
   with no footer.
10. `transferEl`: the element leaves `from`, joins `to` at the slot, `to`'s other blocks stay in order, styles move,
    and nothing with the old id is left in either.
11. `copyElTo` into the same email puts a copy at the slot and leaves the original.

`tests/emailDrop.test.ts`:

1. `slotIndex`: above the first middle is 0; between middles; below the last is the count; an empty column is 0.
2. `columnAt`: by x side by side; by y when stacked; the nearest when neither holds the point.
3. The new-section zone at zoom 1 and 0.5 (8 and 16 local px).
4. A component section gives a section slot before or after.
5. `sectionSlot` by middles.
6. `isNoop`: before itself, right after itself, its own section index and the next.
7. `lineFor`: a column slot's line spans the column; a section slot's spans the email.
8. `resizeWidth`: right and left corners; left, right and centered alignment (centered doubles); min and max;
   snapping to the column and to the picture's own width within 6 screen px at zoom 1 and 0.5; Shift turns it off.

`tests/emailOps.test.ts` (new): `moveToNewSection` (the block leaves its column, a new section holds only it, at the
index; styles stay), and `freshEl` gives new ids for a section and its columns and blocks.

`tests/email.test.ts` additions: an empty column draws its box only with `preview`; an email with no sections draws
its box only with `preview`; a send build of the same document has neither.

### 17.2 Database tests

None: no database change.

### 17.3 The stand-in for the browser check

`scripts/email-canvas/entry.tsx` gains:

- a second brand kit (`k2`) with one class, and the first kit gains a saved component ("Footer block");
- "Monthly news" moves to kit `k2`, so moves between kits are tested;
- `window.failNext = { fn, email, kind }`: the next matching call answers `kind`, one of `"503"` (a hiccup, retried),
  `"not a draft"` (the email was sent) or `"hang"` (no answer for 20 seconds, to test the 15-second timeout);
- a call log with the order of saves (already `window.calls`).

### 17.4 Browser check, part B4

Run with `node scripts/email-canvas-check.ts`, after parts B1 to B3:

1. Drag "Welcome"'s first heading below the next block: the line shows between them while dragging, the heading is at
   40%, the chip says "Heading"; on release one save has the new order.
2. Start the same drag and press Escape: nothing changes, no save.
3. Drag a block within 8 screen px of the line between two sections: the line spans the email; the drop makes a new
   section holding only that block.
4. Drag a block from "Welcome" into "Class reminder": it leaves one and joins the other; the gainer's save comes first
   in the call log, then the loser's.
5. ⌘Z: the block is back in "Welcome" and gone from "Class reminder"; two saves.
6. **A flaky save:** set `failNext` to a 503 on the gainer, drag a block across: the gainer's save is tried again on
   its own, then the loser saves; no error line stays; both emails end right.
7. **Sent meanwhile:** set `failNext` to "not a draft" on the gainer, drag a block across: the move is taken back on
   screen, the message names both emails, and the loser never saves.
8. Alt-drag a block into another email: a copy lands with a new id, the original stays; drag from a sent email
   copies and the sent email's row is unchanged.
9. Hold a drag 10 px from the canvas's right edge for half a second: the camera moves right.
10. Pick a picture, drag its right corner 40 screen px: the width tag shows; release saves the new width once.
11. Drag a corner near the column's width: it snaps (the tag says "Column width"); with Shift it doesn't.
12. A centered picture grows by twice the pointer's move.
13. Double-click a picture: the panel's picture library opens.
14. The + button opens the panel; A opens it too; at 390 px it's a sheet.
15. With a block picked, click Heading: it lands right after, is picked, and typing starts with its words selected.
16. Drag "2 columns" between two sections: a section with two empty columns lands; its dashed boxes show on the canvas
    and are absent from the send build (`sourceHtml`).
17. Drag a Text tile into an empty column's box: it lands in that column.
18. Click the "Footer block" component: a component use lands after the picked section.
19. ⌘C on a section in "Welcome", pick "Class reminder", ⌘V: the copy lands after the picked section with new ids.
20. ⌘X a block, ⌘V elsewhere: it's gone from the first place and lands in the second; two steps.
21. Paste a crafted clip (script in rich text, a `javascript:` link) through a paste event: it lands without either.
22. Paste words with a Markdown heading and a list: a Heading and a List block land after the picked block.
23. Paste a clip from kit `k1` into "Monthly news" (kit `k2`): the class is left off.
24. Alt+Shift+→ on a block: it moves into the next email before its footer, stays picked, the canvas pans.
25. Right-click a part: it's picked and the menu opens; Copy then the menu's Paste works; Delete removes it.
26. Shift+F10 opens the menu for the picked element.
27. Change an email, pan it out of view, ⌘Z: the canvas pans back to it.
28. B1, B2 and B3 checks still pass; no page errors; light and dark; 390 px wide.

### 17.5 Demo

The demo page (the real canvas with the stand-in, as for B3) is republished with B4 so the owner can try drags,
the + panel, resize and copy and paste.

---

## 18. Risks and how each is handled

| Risk | Handling |
| --- | --- |
| A move loses a block | Gainer saves first, loser waits (4.4); "sent meanwhile" takes the step back; unit test 10 and browser checks 4 to 7 |
| One history surprises people used to B2 | Undo pans to what it changed and announces the step's label (4.3, 12) |
| A crafted clipboard injects script | Every paste goes through `readEmailDoc` and new ids (8.5); unit test 6, browser check 21 |
| Two kits on one canvas mix styles | Steps record kits; classes and components follow the kit rules (4.6, 5.7) |
| Dragging feels slow with many emails | One hit test per frame, no rebuild until drop (14) |
| Frames far away aren't loaded, so they can't take a drop | Auto-pan updates the loaded frames (5.6); a drop only targets loaded frames |
| Browser clipboard rules differ | Three clipboard ways plus memory (8.2, 8.4) |
| The page file grows too big to follow | New logic lives in four hooks and three components (15.2) |
| The Email Studio breaks | It keeps its editor; `designSave.ts` keeps its behavior, proven by `studio-check.ts` (16, step 2) |
| Typing and dragging collide | Nothing drags while typing (5.1); keys go to typing first (9) |

---

## 19. Not in B4

- Tia on the canvas, versions, comments, Campaigns views (B5, `docs/email-canvas-b5.md`).
- Picking several blocks inside an email (Shift+click) and dragging or copying them together.
- Copying a whole email with ⌘C (⌘D duplicates).
- Pasting a picture file from the clipboard or dropping one from the computer (it needs the upload flow on the canvas).
- Section templates in the + panel ("Hero", "Feature row").
- Resizing columns by dragging the line between them.
- Moving the Email Studio onto the canvas's editor (15.4).

---

## 20. Running cost

| | Beta (50 teams) | Growth (500 teams) |
| --- | --- | --- |
| Servers and database | $0 (everything runs in the browser; saves are the same `email_draft_save` and design save calls; a move is two saves) | $0 |
| Claude | $0 (no AI in B4) | $0 |
| **Total added** | **$0 a month** | **$0 a month** |
