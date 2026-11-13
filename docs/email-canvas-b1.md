# B1: the Email Canvas surface

Plan, 13 November 2026. Step B1 of `docs/email-canvas-plan.md`. B1 builds the surface: a group's emails on one canvas
you can pan and zoom, each email picked, moved, resized, cloned, tested and sent from the canvas. Editing inside an
email (picking blocks, typing in place, dragging blocks) is B2 to B4. Until then, opening an email opens today's
Email Studio.

## 1. What Brew shows, and what is ours

Brew's public pages (docs.brew.new: Emails, The interface, Create and send, the changelog posts "Visual Email Editor",
"An Email Editor That Behaves Like Your Inbox", "Connect Your Tools", "AI Email Creation", the embedded canvas SDK)
state only these canvas facts:

- Each group is its own canvas; "Ungrouped" always exists and can't be deleted; "New canvas" makes a group.
- Emails sit side by side in a row. Brew can also lay them out "in one row per branch, or in a grid. Sizes never
  change."
- Each email's toolbar has "Add to chat", a comment icon, "More actions", and "Resize, clone, or delete".
- A version dropdown previews earlier versions.
- Click an email to pick it; click into it to edit.
- The embedded canvas has "fitView()" and "focusEmail(emailId)".
- Groups view: cards with "a thumbnail stack of its emails, who last edited it, and when."

Brew documents no zoom, pan, shortcuts, empty states or click rules. The owner's screenshots add: a dotted surface,
the email name with the brand's logo and a "LATEST" pill above each email, a floating toolbar above the picked email
(Add to chat, AI, comment, Desktop and Phone, More, Test, Send), corner handles on the picked email, a grip on its left,
a zoom control at the bottom right ("79%" with − and +) and a column of tools on the right edge.

Everything below that Brew doesn't document follows how Figma, Framer and tldraw canvases behave, so people's hands
already know it. Our choices are marked **(ours)** where it matters.

## 2. The screen

```
┌─ Sidebar ─┬─────────────────────────────────────────────────────────────────────────────────┐
│           │ Campaigns / Welcome series ✎          [Desktop|Phone]  [Add email ▾]             │  header
│ Campaigns │─────────────────────────────────────────────────────────────────────────────────│
│ ...       │  · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · ·  ┌─┐│
│           │            ┌ Open  Test  Send  ⋯ ┐                                         │↖ ││  tools:
│           │  Welcome ● Draft   Class reminder ● Draft      Monthly news ● Draft          │✋ ││  Select,
│           │  ┏━━━━━━━━━━━━━━┓  ┌──────────────┐             ┌──────────────┐            │⤢ ││  Hand,
│           │ ⋮┃              ┃  │              │             │              │            └─┘│  Fit
│           │  ┃   (email)    ┃  │   (email)    │             │   (email)    │               │
│           │  ┃              ┃◂▸│              │             │              │               │
│           │  ┗━━━━━━━━━━━━━━┛  └──────────────┘             └──────────────┘               │
│           │                                                          ┌──────────────────┐ │
│           │                                                          │ −   79%  ▾   +   │ │  zoom
└───────────┴──────────────────────────────────────────────────────────┴──────────────────┴─┘
```

- **Header** (the page's white bar): a back crumb "Campaigns", the group's name (click to rename; "Ungrouped" can't be
  renamed), Desktop and Phone, and **Add email** (the page's one dark pill).
- **The surface** fills the rest of the page, edge to edge, on the gray shell color with a faint dot grid.
- **Tools**, a small white column at the right edge: Select (V), Hand (H), Fit (Shift+1). B4 adds Add and Undo here.
- **Zoom control** at the bottom right: −, the percent (a menu), +.
- No minimap: groups are a single row, and Fit is one key away **(ours)**.

## 3. The camera

The camera is a pan (x, y) and a zoom (z). The surface draws the world with one CSS transform; everything else is
math in `src/lib/canvas/view.ts`.

| Input | Does |
| --- | --- |
| Two-finger scroll on a trackpad, or the mouse wheel | Pans (Shift + wheel pans sideways) |
| Pinch on a trackpad, or Cmd/Ctrl + wheel | Zooms toward the pointer, smoothly (the point under the pointer stays put) |
| Space + drag, middle-button drag, or drag with the Hand tool | Pans; the cursor is a grabbing hand |
| Pinch and two-finger drag on a touch screen | Zooms and pans |
| Cmd/Ctrl + = and Cmd/Ctrl + − (also + and −) | Zoom in or out one step, toward the middle of the view |
| Shift+1 | Zoom to fit every email |
| Shift+2 | Zoom to the picked email |
| Shift+0 | 100% |
| Zoom menu | Zoom to fit, Zoom to selection, 50%, 100%, 200% |

- Zoom runs from **10% to 400%**. Steps: 10, 25, 33, 50, 67, 75, 100, 125, 150, 200, 300, 400.
- Cmd/Ctrl + = and − never zoom the browser page while the canvas has focus.
- Fit leaves 64 px around the emails and never goes past 100%, so a single email doesn't blow up **(ours)**.
- Fit, zoom-to-selection and the zoom steps glide in 220 ms with the brand's ease-out curve. With reduced motion turned
  on, they jump.
- Panning has no limit, but Fit is always there, and a "Back to emails" pill appears at the bottom when every email is
  off screen **(ours)**.
- The view (pan and zoom) is kept per group on this computer. The first visit to a group fits its emails.

## 4. The emails on the canvas (artboards)

- **Layout:** one row, left to right in the group's order (`group_position`, 158), 80 px apart, tops aligned. Each
  email is as wide as the email itself (600, 640 or 700 px; 390 px when Phone is on) and as tall as its content.
- **The label above each email** stays the same size at every zoom (12.5 px, drawn on a screen-space layer, not
  scaled): the email's name, then its status (Draft, Scheduled, Sending, Sent) as a small tag. It hides under 20%
  zoom so labels never pile up. Long names wrap to two lines, then the rest shows on hover; the label is never wider
  than its email.
- **What's inside:** the email as it would arrive, built in the brand from its blocks (drafts) or as it was sent
  (everything else), in an iframe at real size so mail-app styles stay apart from the app's. Links don't open and
  scripts don't run.
- **States:**
  - Rest: a soft ring shadow.
  - Hover: a 1 px green ring and the pointer cursor.
  - Picked: a 2 px green ring (Claritia green; Brew uses orange), the label turns ink, small square handles on the
    left and right edges for Resize, and the toolbar above.
  - Loading: a white box at the email's last known height with three gray lines.
  - Broken (the email can't be built): the box says "This email couldn't be shown" with Open.

## 5. Picking

| Action | Does |
| --- | --- |
| Click an email or its label | Picks it |
| Shift+click | Adds it to or takes it from the picked set |
| Click empty canvas, or Escape | Clears the pick |
| Double-click an email, or Enter | Opens it in the Email Studio (until B2 edits on the canvas) |
| ← and → | Picks the email before or after, and pans it into view when it's off screen |
| Tab and Shift+Tab | Move through the emails in order (each is a focusable button for screen readers: "Welcome, Draft, 1 of 3") |

## 6. The toolbar

It floats 10 px above the picked email, centered on it, at a fixed screen size. When the email's top is above the
view, the toolbar sticks to the top of the canvas so it never disappears **(ours)**.

For a **draft**: Open · Test · Send · More (⋯).
For a **sent, sending or scheduled** email: Results · Duplicate · More.
With **several picked**: "3 emails" · Move to group · Delete.

**More** holds: Rename, Duplicate (Cmd/Ctrl+D), Code, Move to group (a list of groups and New group), Take out of the
group, Delete (drafts only; asks first). Add to chat and comments come in B5.

- **Open** opens the Email Studio; Done there comes back to this canvas with this email picked.
- **Test** sends a test to you (the same path as today's Test).
- **Send** opens the Send panel built in 156 and 159 over the canvas.
- **Code** opens the code view (built in 158).
- **Duplicate** puts the copy right after the original, names it "Welcome copy", picks it, and glides to it.

## 7. Moving and resizing

- **Reorder:** drag an email by its label (or by the grip that shows on its left edge when it's picked). It lifts with a
  shadow and follows the pointer at 90% opacity; the others slide apart (220 ms) to show where it lands. Drop saves the
  order (`email_group_place`). Escape during the drag puts it back. Alt+Shift+← or → moves the picked email from the
  keyboard.
- **Resize:** drag the left or right handle of the picked email. The width snaps to 600, 640 or 700 px (the widths the
  email builder supports), shows a small tag with the width while dragging, and saves on release. The email's height
  follows its content **(ours: Brew lists Resize without saying what it resizes)**.
- **Desktop and Phone** in the header switch every email between its own width and 390 px. This only changes the view.

## 8. Adding emails

**Add email** opens a menu:

- **New email:** a blank draft (only the footer, as today), placed at the end of the row, picked, with the camera
  gliding to it.
- **From a template:** the template gallery opens as a sheet; Use template makes the draft in this group.
- **From Campaigns:** drafts and sent emails that aren't in a group, by name, newest first.

## 9. Empty, Ungrouped and sent emails

- **An empty group:** the centered first-screen pattern (a drawing, one title, the Add email choices as buttons).
- **Ungrouped** is a canvas like any other, listing every email that isn't in a group, drafts and sent alike. With
  many emails, only those near the view load their iframe; the rest show their label and a gray box at their size,
  so a row of 200 sent campaigns stays smooth.
- **Sent emails** show what went out and can't change; their toolbar offers Results and Duplicate.

## 10. Campaigns, the page before

- Group cards get a **thumbnail stack** (the first three emails, small, slightly fanned), the name, the email count and
  "Edited 2 hours ago" **(ours: who last edited comes with B5)**.
- An **Ungrouped** card comes first, always there.
- **New group** stays; it opens the new, empty canvas.

## 11. Look

- Surface: the shell color (`paper-deep`). Dots: 1 px dots every 24 world px in the `line` color, drawn with an SVG
  pattern that moves and scales with the camera (no gradients). Under 50% zoom the dots fade out so the surface stays
  calm.
- Emails sit on `shadow-rest`. The toolbar, tools and zoom control are white pills and panels on `shadow-menu`; all
  buttons are pills. The picked ring and hover ring are `signal`.
- Labels are Inter 12.5 px, `muted` at rest and `ink` when picked. Status tags use the app's `Badge`.
- Cursors: arrow (Select), hand and grabbing hand (Hand, Space), pointer over emails, east-west arrows over the
  handles, grabbing while dragging an email.
- Dark mode: the surface, dots, toolbar and labels follow the app's dark tokens; the emails themselves stay as they'd
  arrive (light), as in every email tool.
- Motion: the three speeds and two curves from `docs/brand.md`; reduced motion turns off glides and slides.
- Nothing spills out: labels wrap inside their email's width; the toolbar's buttons fit at every zoom because the
  toolbar never scales.

## 12. Phones and small screens

Under 768 px the canvas still works: pinch to zoom, drag to pan, tap to pick. The toolbar docks at the bottom of the
screen instead of floating, and the tools column hides (Fit moves into the zoom control) **(ours)**.

## 13. Speed

- 60 frames a second while panning and zooming: the camera changes one transform; labels and the toolbar move with it
  through the same frame.
- Iframes load only within one screen of the view, and unload past three screens.
- Each draft is built once per change (the same build the Email Studio uses), not per frame.

## 14. How it's built

New files:

- `src/lib/canvas/view.ts`, pure and tested: the camera type, screen to world and back, zoom at a point, the zoom
  steps, fit to a box, the row layout (rectangles from widths and heights), the drop slot for a drag, which emails are
  near the view, where the toolbar goes (including sticking to the top).
- `src/components/app/canvas/Surface.tsx`: the pannable, zoomable surface (pointer, wheel, touch and keys), the dot
  grid, the tools column, the zoom control, a world layer and a screen layer. Reusable by Automations later.
- `src/components/app/emails/canvas/EmailCanvasPage.tsx`: loads the group, its emails and the brand, builds each
  draft, picks, moves, resizes, and holds the toolbar and the Add email menu. Replaces `EmailGroup.tsx`.
- `src/components/app/emails/canvas/Artboard.tsx`: one email's iframe, its height, its label, its handles.
- `src/components/app/emails/canvas/Toolbar.tsx`: the floating toolbar and the More menu.

Reused: `SendPanel`, `CodeView`, the Test route, `TemplateGallery` (as a picker), `email_group_place`,
`email_draft_save`, `email_draft_delete`, `email_group_save`. The Email Studio's Done returns to
`/emails/campaigns/group/<id>?pick=<email>`.

Addresses: `/emails/campaigns/group/<id>` for a group, `/emails/campaigns/group/ungrouped` for Ungrouped.

No database change: the row order is `group_position`, the width is the email's own setting, and the view is kept on
this computer.

## 15. How we prove it

- `tests/canvasView.test.ts`: zooming at a point keeps that point still; steps go up and down and stop at 10% and
  400%; fit puts every email in view with the margin and never past 100%; the row layout's positions; the drop slot
  at each position; the near-view set; the toolbar sticks at the top.
- A browser check (`scripts/email-canvas-check.ts`, with a stand-in server in `scripts/email-canvas/entry.ts`, in the
  pre-installed Chromium), the same way `scripts/studio-check.ts` checks Form Studio. It checks, with screenshots:
  the first visit fits; pinch and Cmd + wheel zoom toward the pointer; Space-drag and the Hand tool pan;
  Shift+1, Shift+2 and Shift+0; click, Shift+click, Escape, arrows, Enter; the toolbar's place, sticking at the top,
  and its actions for drafts, sent emails and several emails; drag to reorder (and Escape to cancel) saves the right
  order; resize snaps to 640 and saves; Add email's three paths; Duplicate; Delete asks first; an empty group;
  Ungrouped with 200 emails stays smooth; Phone view; dark mode; reduced motion; a 390 px wide screen; no page errors.

## 16. Not in B1

Picking blocks inside an email and the Element and Layout panel (B2), typing in place (B3), dragging blocks and the +
panel (B4), Tia on the canvas, versions on the artboard, comments, and Campaigns' List view (B5). Free placement and
grids (Brew's "one row per branch") wait until groups need them.

## 17. Running cost

| | Beta (50 teams) | Growth (500 teams) |
| --- | --- | --- |
| Servers, database, Claude | $0 (the canvas runs in the browser; no new calls) | $0 |
| **Total added** | **$0 a month** | **$0 a month** |
