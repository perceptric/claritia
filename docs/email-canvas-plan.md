# Flat sidebar and the Email Canvas

Plan, 13 November 2026. Two changes the owner asked for:

1. Every tab in Meetings and Emails becomes its own sidebar item.
2. Emails get a real canvas, like Brew's: a group's emails on one surface you can pan and zoom, each email editable in
   place, with blocks you can drag, and an Element and Layout panel on the right.

Sources: Brew's docs (docs.brew.new: Emails, The interface, Create and send, Send options, Merge tags, Comments,
Templates, Preview in real inboxes, the embedded canvas SDK, and the changelog posts "Visual Email Editor" and "An
Email Editor That Behaves Like Your Inbox") and the owner's screenshots of Brew's editor. Brew's docs don't describe
zoom, pan, the layer tree or the property lists; those come from the screenshots and from how design tools work.

## Part A. A flat sidebar

Built 13 November 2026 (`src/lib/nav.ts`, `src/components/app/Sidebar.tsx`; tests in `tests/nav.test.ts`).

### What people see

```
Forms

MEETINGS
  Meeting types
  Upcoming
  Availability
  Booking page
  Links and polls
  Meeting settings

EMAILS
  Campaigns
  Automations
  Audiences
  Templates
  Brand

Settings            (at the bottom, as now)
```

- Each item opens its page directly. The tab rows under "Meetings" and "Emails" go away; each page's header shows only
  its own title and its own actions.
- "Meetings" and "Emails" become small gray labels above their items, so twelve items still read as two groups. This
  replaces the rule "no group titles" in CLAUDE.md.
- Meetings' "Settings" tab (payments, webhooks) is named **Meeting settings** in the sidebar, so it can't be mixed up
  with the app's Settings at the bottom.
- Folded sidebar (icons only): each item gets its own icon, and the group labels become a thin divider.
- Phones: the row of items scrolls sideways, as it does now.

### How it's built

- `src/lib/nav.ts`: `NAV` gets one item per page. `NavItem` already has `page`, so each item is `{ route, page }`:
  `scheduling/types`, `scheduling/upcoming`, ..., `emails/` (Campaigns), `emails/automations`, and so on. A new
  `section` field ("meetings" or "emails") draws the labels. `activeItem(route, id)` picks the item from the route and
  the first part of the page, so a meeting type's page lights "Meeting types" and a workflow lights "Automations".
- Addresses don't change: `/scheduling/types`, `/emails/automations/<id>` and every old address keep working.
- `Section` in `src/components/app/ui.tsx` stops drawing tabs; `SchedulingView` and `EmailsView` render the picked
  page with its own title.
- Counts and dots move to the item they belong to (today's meetings on Upcoming, Routing's amber dot on Meeting
  types).
- The ⌘K menu lists every item by its name.
- Tests: `tests/nav.test.ts` (the items, their order, the lit item for each address, old addresses), the overflow
  test for the longer list.

Running cost: none.

## Part B. The Email Canvas

### What people see

**The canvas.** A campaign group (or "Ungrouped", which every workspace has and can't delete) opens as one canvas:

- An endless gray surface with the group's emails on it as artboards, side by side in one row, at their real width
  (600 px by default; 390 px when "Phone" is on). Each artboard shows its name and status above it.
- **Pan:** two-finger scroll, Space and drag, the middle mouse button, or the Hand tool (H).
- **Zoom:** Cmd/Ctrl and scroll or pinch, toward the pointer; the − and + buttons and the percent menu at the bottom
  right (Zoom to fit Shift+1, 100% Shift+0, Zoom to selection Shift+2, 25 to 200%).
- **Select tool (V):** click an email's name or empty space in it to pick the whole email; click inside it to pick a
  block. Escape steps out one level (block, then section, then email, then nothing).
- **Move emails:** drag an artboard by its name to reorder it in the row. The order is the group's order (158).
- **The email toolbar** floats above the picked email: Add to chat, Desktop or Phone, Light or Dark, More (Rename,
  Duplicate, Code, Versions, Move to group, Delete), Test, and Send. Send opens the Send panel built in 156 and 159.

**Editing in place.**

- **Text:** double-click any heading, text, list or button label to type in place. A small format bar floats above it:
  Bold, Italic, Underline, Strike, Link, Merge value, Clear. Cmd/Ctrl+B, I, U and K work. Typing saves as you go.
- **Paste:** pasted text keeps bold, italic and links; Cmd/Ctrl+Shift+V pastes plain text; pasted Markdown comes in as
  headings, lists and links.
- **Images:** drag a corner to resize. The image keeps its shape and stops at the edge of its column; the width shows
  while dragging. Double-click to replace it.
- **Sections:** the picked section shows a grip on its left. Drag it up or down and the others move aside. Alt+Shift+↑
  or ↓ moves it from the keyboard. Cmd/Ctrl+D duplicates it; Delete removes it.
- **Blocks:** drag a block to another place in the same email or into another email on the canvas. A green line shows
  where it lands.
- **Add:** the + panel on the left lists the blocks (Heading, Text, Button, Image, Divider, Spacer, Columns, Social,
  Product, Event, Meeting, Signature, Footer, HTML) and the brand's saved components. Drag one onto an email, or click
  it to add it after the picked block.
- **Copy and paste** blocks and sections, within an email or between emails. Undo and redo (Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z)
  per email.

**The panel on the right**, with two tabs, as in Brew:

- **Element:** the picked thing's settings, in groups that open and close. For an **Image**: the picture (Replace,
  Edit), Alt text; Layout (Width, Height, Fit: Cover, Contain or Fill, Align, Loading: Lazy or Eager); Link (Link URL,
  Open link in); Stroke (color, opacity, width, Solid, Dashed or Dotted); Corners (None, Rounded, Round, or each corner);
  Spacing (Padding and Margin, each across and up-down, or each side; Center horizontally). For a **Heading**: Level
  (H1 to H6), Text (align, font, weight, size, line height, letter spacing, Format, Case, color); Spacing; Corners.
  Buttons, sections and the body get their own sets. The style values come from the brand's variables first, as today.
- **Layout:** the layer tree: Body › Container › Section › blocks, with each layer's kind and its first words. Click to
  pick (the canvas scrolls to it), drag to reorder or move into another section, hover to highlight on the canvas.

**Tia on the canvas.** The chat opens on the left. "Add to chat" on an email (or a picked block) points Tia at it; her
edits change only that email and save a new version. Many emails from one prompt land side by side. Versions show in
the email's More menu; picking one previews it and Restore makes it the newest version.

### What we keep and what's new

Kept: the email document (`src/lib/design/email/doc.ts`) and its edit operations (`ops.ts`, `edit.ts`); the compiler
and its preview marks; the style panel's sections (`StyleSections.tsx`: Spacing, Size, Borders, Corners, Typography,
Backgrounds, Effects); block settings (`BlockSettings.tsx`); Tia's email chat; versions; the send check; groups (158);
the Send panel. The full-screen Email Studio stays as the one-email view (opened from the toolbar's More menu or a
double-click on the artboard's name) until the canvas does everything it does, then it goes.

New:

1. **`src/components/app/canvas/`**, a small pan and zoom surface: one transformed "world" layer, pointer and wheel
   handling, the zoom menu, fit and zoom-to-selection math. Pure math in `src/lib/canvas/view.ts` with tests.
2. **Artboards that edit in place.** Each email renders its compiled preview in an iframe at real size inside the
   world, so mail-app styles stay apart from the app's. The preview marks every element (`data-eid`), so picking,
   hover outlines, the section grip and image handles are drawn on an overlay above the iframe in world space. Inline
   text editing turns on `contenteditable` for the one element being typed in; its HTML is cleaned (`cleanHtml`) and
   written back to the block on each pause. Far zoomed out (under 35%), artboards that aren't picked show a still
   picture so dozens of emails stay smooth.
3. **Drag and drop** with pointer events and no library: sections and blocks (a ghost follows the pointer, a green
   line marks the drop), artboards in the row, layers in the tree, and new blocks from the + panel. Every drop runs one
   operation from `ops.ts` (new ones: `moveBlockTo(otherEmail)`, `duplicateEl`, `pasteEl`), so undo, autosave and
   versions work the same for mouse, keyboard and Tia.
4. **The Element and Layout panel**, rebuilt from `BlockSettings` and `StyleSections` with the groups above. New
   properties: image Fit and Loading (`object-fit` and `loading` on the image), Stroke style and opacity, heading levels
   H4 to H6, Case, Center horizontally. Each needs the compiler to write it and a design-check rule where mail apps
   ignore it (Outlook ignores `object-fit`, so the check notes it).
5. **Where things sit:** `emails.canvas_x` and `canvas_y` (migration 160) for artboards moved off the row, and the
   view (pan and zoom) kept per group on this computer.
6. **Campaigns** gets Brew's two views: Groups (cards with a stack of thumbnails, last edited, by whom) and List (every
   email in sections by group; drag an email between sections to move it). "New canvas" makes a group.

Not in this plan: live multiplayer (Brew shows who's looking; one person edits an email at a time), comments,
previews in real inboxes (a paid rendering service, about 10 credits a run at Brew; check), and Figma import.

### Build order

Each step is its own PR with its tests and its cost line.

| Step | What ships | Proof it works |
| --- | --- | --- |
| A | Flat sidebar | `tests/nav.test.ts`, overflow test |
| B1 (built, `docs/email-canvas-b1.md`) | The canvas: pan, zoom, fit, artboards of a group and Ungrouped, picking an email, the email toolbar, reorder by drag | `tests/canvasView.test.ts` (zoom toward a point, fit, clamps); a browser check |
| B2 (built, `docs/email-canvas-b2.md`) | Picking blocks on the canvas, the Element and Layout panel with the full property sets, the layer tree | compiler tests for each new property; browser check |
| B3 (built, `docs/email-canvas-b3.md`) | Typing in place, the format bar, paste rules | browser check (type, bold, link, plain paste, Markdown paste) |
| B4 (built, `docs/email-canvas-b4.md`) | Dragging sections and blocks (within and between emails), image corner resize, the + panel, copy and paste, keyboard moves, undo | `tests/emailOps.test.ts` for each operation; browser check |
| B5 (plan, `docs/email-canvas-b5.md`) | Tia on the canvas (Add to chat, scoped edits, many emails from one prompt), versions on the artboard, comments, Campaigns' Groups and List views, campaign drafts open on the canvas | chat tests with a scripted model; browser check |

The browser checks run like `scripts/studio-check.ts`: the canvas with a stand-in server
(`scripts/email-canvas/entry.ts`) in the pre-installed Chromium, since the whole app can't run in a session here.

### Running cost

| | Beta (50 teams) | Growth (500 teams) |
| --- | --- | --- |
| Servers | $0 (it runs in the browser) | $0 |
| Database (positions and versions, a few KB an email) | $0 | about $1 (check) |
| Claude (Tia's edits on the canvas, the same calls as the Email Studio's chat) | no change | no change |
| **Total added** | **$0 a month** | **about $1 a month (check)** |
