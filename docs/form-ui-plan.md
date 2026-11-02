# The form page: one header, a calmer Studio, a visual Share

What's wrong today, from the live app:

- A Studio form has two headers. Form Studio has its own bar (back, 4 views, layers, 3 devices, language, undo,
  redo, Back to step 1, Open live, the check's "Ready", a note, Share, and "Published"), and Share opens the older
  form page with a second header ("Live, edited", "Saved", undo, redo, preview, "Publish changes").
- "Ready" (the form check) and "Published" (the button) sit side by side and say almost the same thing.
- From Form Studio there's no way to Submissions, Sync or Settings. They only open by typing `?tab=` in the address.
- Share holds too much text: a gray line under each way, a line under each title, a line under the code, the Seen on
  list, and the site builders as five pills.
- A missing database piece shows its raw error ("Could not find the function public.form_set_slug…").

Four steps, each its own pull request. Studio forms and older forms end up on the same page.

## Step 1: one header for every form

```
← Forms / Book a demo  (Live)     Build   Submissions 12   Share   Sync   Settings          [ Publish changes ]
```

- One row: the crumb back to Forms, the form's name (click to rename), one state pill, the five tabs, one button.
- The state pill: Draft (gray), Live (green dot), Changes not live (amber). "Saved" goes away; only "Saving" and
  "Offline" show, as a small icon by the pill.
- The one button says what to do next:
  - Draft: **Publish**. When the form check finds problems, a red number sits on it ("Publish 2"); a click opens
    the check list with Fix and Fix all (Tia), and Publish waits until they're fixed. Notes don't block it.
  - Live with changes: **Publish changes**, the same way.
  - Live, nothing changed: **Share**, opening the Share tab.
- Build is Form Studio for a Studio form and the older builder for an older form. Submissions, Sync, Settings and
  Share are the same pages for both. Every tab keeps its address (`?tab=submissions`), so Back works.
- Form Studio stops drawing its own back button, check, Share and Publish. The Studio screen tells the header its
  state (draft, live, changed, publishing, the check's problems) and the header calls the Studio's publish.
- Checks: `scripts/studio-check.ts` reaches Submissions, Sync and Settings from a Studio form and back, and the one
  button goes Publish (blocked by a problem, then fixed by Tia) → Share → Publish changes. A publish that fails
  midway keeps the old live form and says so.

## Step 2: a calmer Studio bar

Under the header, only while Build is open:

```
[Preview Edit Code After]     Form | Thank-you     [Desktop Tablet Phone]  EN  Undo Redo  ⋯
```

- Left: the four views (Preview, Edit, Code, On submission), icons with tooltips as now.
- Middle: the step pills (Form, Thank-you, steps), moved up from their own row.
- Right: the three devices, the language, undo, redo, and a ⋯ menu with Back to step 1, Open the live form and
  Layers.
- From 19 controls and a second row to 11 controls in one row.

## Step 3: Share, more pictures, less text

- **Left list**: an icon and one or two words each: Link, Website, Email, QR code, Own form. No gray lines.
- **Link**
  - One big link with its ending inside it: `app.tryclaritia.com/f/acme/` then the ending in a box, typed in place;
    Enter saves. Copy link (black) and Open beside it.
  - A ⋯ menu beside it: Copy the id link, Your own domain (to Settings › Link domain).
  - The link preview is the card itself, like it shows in Slack or iMessage: click the title or the line to change
    it, drop a picture on it or click it to upload. No separate fields.
  - Fill in from the link moves to the Settings tab, where the form's other settings live.
- **Website**
  - The six ways as picture tiles in one row of six on wide screens (two rows of three on narrow ones).
  - A big live preview under them: a plain page in a browser frame with the real form in the picked way. The
    popup opens, the slider slides in, the popover sits in the corner. It uses the real forms script.
  - The few settings of the picked way sit under the preview (opens on click, after 10 s, on exit; size; side).
  - The code box: a dropdown with the builder's logo ("Webflow ▾", the app's own `Select`, not the browser's) and
    Copy code. Each builder's one line of steps is the gray line under its name in the dropdown, so nothing sits
    under the code. "For developers" is the dropdown's last item.
  - Seen on goes away. A page not on the site list still shows where it matters: those fills land in
    Submissions › Spam, marked "Not on your site list".
- **Email**: two picture tiles, Send the link (an envelope with a link) and The form in an email (an envelope with
  answer buttons). The picked one opens under them.
- **QR code**: the code big and centered, PNG and SVG under it.
- **Own form**: the code box and the field table; the two info boxes go away.
- **No raw errors**: if a database piece isn't there yet (117 for endings, 118 for domains), that part hides.
  Real errors read like the rest of the app ("Couldn't save the ending. Try again.").
- Checks: `scripts/share-check.ts` covers the dropdown, the ending typed in place, the preview card editing, each
  way shown in the live preview at desktop and phone width, no Seen on, and a missing function hiding its part.

## Step 4: the same pieces in Meetings › Share

- The builder dropdown and Copy code from step 3.
- The live preview of the calendar in the picked way (in the page, floating button, your own button).
- Link: the same big link, QR code under it.

## Monthly cost

| Stage | Steps 1–4 |
|---|---|
| Beta (50 teams) | $0 |
| Growth (500 teams) | $0 |

No new servers, services or Claude calls. The live preview runs the forms script already served to every site.
