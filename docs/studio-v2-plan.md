# Form Studio, round two: the plan

What the owner asked for after using the live Studio (Nov 2): more room, one chat per form kept in the Studio,
icons in place of words, nothing covering anything, an editor that works like Webflow or Framer right on the form,
and a Tia that stops asking setup questions once the form is built. Status: plan only.

## Part 1. Room: the sidebar and the chat fold away

- The app sidebar gets a collapse button at its foot. Collapsed, it's the icon rail it already is on mid-size
  screens (68px, `Sidebar.tsx`), on every screen size. The choice is kept per person (localStorage).
- The Studio opens with the sidebar collapsed. Leaving the Studio puts it back the way the person had it.
- The chat column folds too: a button in its bar hides it to a thin strip with Tia's face. Click the face to open.
  In Edit the chat folds by itself the first time, so the form and the panel get the room.

## Part 2. Every form is one chat, kept in the Studio

- A chat and its form are one thing. New form starts a new chat. Publishing doesn't end it: the same chat keeps
  changing the same form.
- The chat bar's title is a dropdown: every chat in the workspace, newest first, each with the brand's logo, the
  form's name and its state (Draft, Published). Search at the top, New chat at the bottom, delete on each row
  (with the app's confirm; the form stays unless they also delete it from Forms).
- Chats are saved on the server, so they follow the person to any computer and teammates see them:
  migration 112 adds `form_chats` (id, workspace_id, form_id, brand_kit_id, name, turns, log, html, css, after,
  created_by, updated_at). Saved after each Tia answer and each edit (debounced 1 second). The browser copy stays
  only as an offline backup.
- A chat without a form yet (nothing built) is a draft chat. Its form row is made on the first Publish.
- Forms › a studio form opens its chat. The Forms list shows the same chats' forms, so there's one list of forms.

## Part 3. Tia once the form is built: built is built

- Before anything is built, Tia asks at most two short questions with click answers, then builds.
- Once a form exists, Tia never asks setup questions again (what kind of form, how many steps, who it's for). Every
  message is a change request: Tia makes the change at once and says in one line what changed. Tia asks only when a
  request truly can't be done without one fact (for example "send it to our CRM" when two CRMs are connected).
- The starter ideas show only on an empty chat. On a built form the empty composer says "Ask Tia to change
  anything".
- In the prompt: a BUILT section, sent whenever the form has HTML, that says the above; and `<ask>` is refused by
  the studio when the form is built unless Tia also sent no change. Small changes go as `<patch>` and `<css_add>`
  (cheaper and faster than writing the whole form again).
- Tia can also be asked about the picked element: with something picked in Edit, the composer shows a chip
  ("Heading: How are you feeling today?") and the message is about that element.

## Part 4. The bar: icons, tooltips, nothing hidden

- Preview, Edit, Code and On submission become icon tabs (eye, cursor, code brackets, send/calendar) with the
  name as a tooltip on hover and focus. Still real tabs for keys and screen readers.
- Desktop, Tablet and Phone become three device icons (1100px, 768px, 390px frames).
- Back to step 1 becomes a restart icon with its tooltip. Open becomes a link icon. Publish stays the one black
  button with its word, on the far right of the Studio's top bar.
- The bar is one row across the whole Studio, above the canvas and the panel. The Edit panel sits below it, so it
  can never cover Publish, Open or anything else. Rule for the Studio: no panel, menu or popover ever sits over a
  control; menus open on the floating layer, panels take their own column.

## Part 5. Edit like Webflow and Framer, right on the form

On the form:
- Hover outlines an element and shows its name tag ("Heading", "Button", "Choice"). Click picks it.
- Text edits in place: click picked text again (or double-click) to type, Enter or click away to save, Esc to undo.
  Works for headings, words, labels, buttons, choices and placeholders.
- A small floating bar over the picked element: move up, move down, duplicate, delete, select parent, and Ask Tia.
  Drag the handle to move it among its siblings.
- Spacing handles: drag the padding and margin edges of the picked element, like Framer.
- Keys: Delete removes, Cmd/Ctrl+D duplicates, Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z undo and redo, arrows move between
  siblings, Esc picks the parent.

The panel on the right, short and icon-led (like Webflow's Style panel):
- Two tabs: Style and Settings. Layers is its own fold-out list on the left of the canvas (the Navigator), opened
  by an icon, so it doesn't push the style controls down.
- Style, top to bottom: the class chip and "This element / All like it" switch; Layout (display as icons: block,
  flex row, flex column, grid, none; gap; align icons); Spacing (one box drawing with margin outside and padding
  inside, each side a small number you drag or type); Size (W, H, min, max in one grid); Type (font, size, weight,
  line height, color dot, align icons, case icons); Fill (color dot); Border (width, style icons, color dot,
  radius); Effects (shadow, opacity).
- Empty boxes stay empty: the live value shows as faint placeholder text, never as a value. Units as a small
  suffix. Colors open the app's color picker with the brand's colors first.
- Settings: the question's name, required switch, placeholder, options (add, remove, reorder) for picks and lists,
  "Saves to" (Email, First name, Company and the rest, or Just this form), and Show if built with the app's own
  pickers (question, is, value) in place of typed code.
- Code stays for people who want it; nothing needs it.

Also fixed on the way: double-clicking in Edit no longer selects the Studio's own words (the green wash in the
screenshot), and the Show if box is empty until set.

## Part 6. Build order

| Step | What | Done when |
| --- | --- | --- |
| 1 | Bar: icon tabs with tooltips, three devices, one top bar, panel below it; sidebar and chat collapse | Nothing overlaps at 1280px and 1440px wide in every tab; a browser check measures it |
| 2 | Tia: built is built (prompt, starters, composer, ask refused on built forms) | A built form plus "make the button blue" changes it with no question; tests on canned answers |
| 3 | Chats: migration 112, save and load, the chat dropdown, New chat, delete | Two forms, two chats, switching keeps each; reload and another browser show them |
| 4 | Edit on the form: hover tags, inline text, floating bar, drag to move, keys | A browser check edits a heading, moves a choice and undoes both |
| 5 | The panel: Style and Settings tabs, Navigator, spacing box, icons, the pickers for Show if | Every property sets and clears; the published form matches the Studio |

## Part 7. Running cost

Nothing new is bought. Chats are a few rows per form in the database (Supabase, already paid).

"Built is built" makes changes cheaper: a change becomes a patch of a few hundred tokens out in place of the whole
form again (about 10,000). Today's Studio estimate stays as the ceiling.

| Item | Beta (50 teams) | Growth (500 teams) |
| --- | --- | --- |
| Claude Opus (Tia), as today, at most | about $640 | about $6,400 |
| Chats in the database | $0 new | $0 new |
| Servers | $0 new | $0 new |
| **Total** | **about $640 or less** | **about $6,400 or less** |

Opus at $4 in and $20 out per million tokens: check (from this repo's price table, not confirmed on Anthropic's
page from here).
