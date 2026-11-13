# B3: typing in place, the format bar, paste rules

Plan, 13 November 2026; built the same day (section 9). Step B3 of `docs/email-canvas-plan.md`, after B2 (`docs/email-canvas-b2.md`). B3 lets people
type straight into an email on the canvas. Dragging blocks on the canvas, the + panel, image corner resize and copy
and paste between emails are B4; Tia is B5.

## 1. What types in place

| Block | How it types | Enter |
| --- | --- | --- |
| Heading | Plain words on one line | Ends typing |
| Text | Rich: bold, italic, underline, strike, links, paragraphs | A new paragraph |
| Button, Meeting button | The label, plain, one line | Ends typing |
| List | One item per line | A new item |
| Quote | Plain words; Shift+Enter breaks a line | A new line |

Other blocks (product, event, signature, footer, social, HTML) keep their words in the panel's Content group.

## 2. Starting and ending

- **Start:** double-click a typable block in the email being edited, or press Enter with one picked (Enter still steps
  into sections and columns). The caret goes where the double-click landed, or at the end.
- **While typing:** the block shows its words as written, with merge tags as `{{first_name}}` (the rest of the canvas
  shows their fallback, as in B1). The picked outline stays; the element bar gives way to the format bar. The canvas
  keeps panning and zooming with the wheel, even over the email.
- **End:** Escape, Enter on a one-line block, a click anywhere outside the block (a click on another part of the same
  email picks that part), or picking something else. The block stays picked.

## 3. The format bar

A white pill above the block (below it when the block is at the email's top), `shadow-float`, 28 px icon buttons:

- **Text:** Bold, Italic, Underline, Strike, Link, Merge value, Clear formatting.
- **Heading, button, list, quote:** Merge value only.
- Bold, Italic, Underline and Strike show pressed when the selection has them.
- **Keys:** ⌘/Ctrl+B, I, U, ⇧⌘X (strike), ⌘K (link). ⌘Z inside the block undoes typing; after typing ends, ⌘Z
  undoes the whole typing run as one step.
- **Link** asks for the address in the app's own dialog (https, http, mailto, tel or a merge tag); on a link it offers
  the current address and Remove.
- **Merge value** opens a short menu: First name, Last name, Company, Job title. It puts `{{first_name}}` at the caret.

## 4. Paste rules

- **Rich paste** (text and HTML on the clipboard) into a text block keeps bold, italic, underline, strike, links,
  paragraphs and lists; everything else goes (`cleanHtml`, the Text block's allow list).
- **⌘/Ctrl+Shift+V** pastes plain words.
- **Markdown** (plain text that has `#` headings, `-`, `*` or `1.` lists, `**bold**`, `*italic*`, `~~strike~~` or
  `[links](https://...)`):
  - one paragraph of Markdown goes in where the caret is, formatted;
  - several parts with headings or lists become blocks: what's before the caret stays, then a Heading block for each
    heading, a List block for each list, a Text block for each run of paragraphs, right after this block. Typing ends
    and the last new block is picked.
- **One-line blocks** (heading, button) take the paste as plain words on one line.

## 5. Saving and undo

Typing writes back to the block 300 ms after each pause, and once more when typing ends, through the editor from B2
(`useEmailDraft`), so autosave (800 ms) and the header's Saving work as before. A typing run is one undo step. The
frame isn't rebuilt while typing (that would lose the caret); it rebuilds once when typing ends, so style changes made
in the panel during typing show then.

## 6. How it's built

- `src/lib/design/email/typing.ts` (pure, tested in `tests/emailTyping.test.ts`): which kinds type and how, the words
  put into the block when typing starts, the block change from what was typed (HTML cleaned to the allow list,
  Chromium's `div` and `strike` turned into `p` and `s`), Markdown to blocks and to inline HTML, and plain text to
  paragraphs.
- `src/components/app/emails/canvas/useTyping.ts`: starts and ends typing in the frame (`contenteditable` on the one
  part), listens to keys, input, paste, selection and clicks inside the frame, forwards the wheel to the canvas, and
  writes back.
- `src/components/app/emails/canvas/FormatBar.tsx`: the bar.
- `Artboard.tsx`: takes the pointer while its email is being typed in. `EmailCanvasPage.tsx`: Enter and double-click
  start typing, the frame's HTML is held while typing, the format bar replaces the element bar.
- `useEmailDraft.ts`: a typing run's changes join one undo step.

No database change.

## 7. How we prove it

- `tests/emailTyping.test.ts`: sources and patches for each kind; cleaning (div to p, strike to s, scripts and styles
  gone, unsafe links dropped); Markdown detection, blocks and inline; plain paragraphs.
- `scripts/email-canvas-check.ts` part B3, in Chromium:
  - double-click a heading, type, Escape: the heading shows the words and one save has them;
  - Enter on a picked text block starts typing; ⌘B makes bold; ⌘K adds a link through the dialog; the saved HTML has
    `<b>` and the link;
  - Merge value puts `{{first_name}}` in;
  - a rich paste keeps bold and drops a script; ⌘⇧V pastes plain; a Markdown paste with a heading and a list adds a
    Heading and a List block after the text;
  - a button label types and Enter ends;
  - a click on another part of the email ends typing and picks it; the wheel still pans over the email;
  - after typing, ⌘Z takes the whole run back in one step;
  - no page errors.

## 8. Running cost

| | Beta (50 teams) | Growth (500 teams) |
| --- | --- | --- |
| Servers, database, Claude | $0 (in the browser; saves are the same calls as B2) | $0 |
| **Total added** | **$0 a month** | **$0 a month** |

## 9. As built

- **Files:** `src/lib/design/email/typing.ts` (tested in `tests/emailTyping.test.ts`),
  `src/components/app/emails/canvas/useTyping.ts` and `FormatBar.tsx`; changes to `Artboard.tsx` (takes the pointer
  while typed in), `EmailCanvasPage.tsx`, `Overlay.tsx` (no kind tag while typing, so the bar has room) and
  `useEmailDraft.ts` (`latest()`, and a merge key starting with "~" joins one undo step however long the pauses).
- **Ending:** a press anywhere outside the frame ends typing, except on the format bar, its menu and dialogs (the link
  dialog). After typing ends the canvas takes the keys again, so ⌘Z works at once.
- **The caret:** the bar's buttons never take focus; when the selection was lost (a dialog), it comes back before the
  command runs.
- **Bold** follows the block's own look: in text that's already bold (a template's small caps line), ⌘B turns it off.
- **Proof:** `scripts/email-canvas-check.ts` part B3 (checks 23 to 29); 90 checks in all.
