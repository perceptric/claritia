# B5: Tia on the canvas, versions, comments, Campaigns views

Plan, 13 November 2026. Step B5 of `docs/email-canvas-plan.md`, the last canvas step, after B4 (drag and drop, the +
panel, image resize, copy and paste, one undo history for the canvas; `docs/email-canvas-b4.md`). B5 brings Tia onto
the canvas, gives every email its versions and comments, adds Groups and List views to Campaigns, and makes the
canvas the place where campaign emails are edited, so the Email Studio is no longer needed for them.

B5 ships in five parts, each on its own:

| Part | What ships | Needs |
| --- | --- | --- |
| B5a | Tia on the canvas: the chat on the left, Add to chat, changes kept to what was added, several emails in one turn | B4's canvas editor |
| B5b | Many new emails from one prompt, landing side by side in the group | B5a |
| B5c | Versions on the artboard: the version pill, previewing, Restore, saved points for hand edits | Migration 160 |
| B5d | Comments on emails and on their parts | Migration 160 |
| B5e | Campaigns' Groups and List views; campaign drafts open on the canvas; the Email Studio stays only for automation emails and templates | B5a to B5d |

## 1. What we have to build on

- **Tia's email chat** (`src/lib/design/email/chat.ts`, `src/app/api/email/chat/route.ts`, `AiPanel.tsx`): Tia
  changes an email only through checked tools (add, change, move and remove blocks, columns, styles, classes,
  components, templates, links to forms and meetings, the subject), asks one question with choices when she needs to,
  can make 3 versions to pick from, and builds from a screenshot. Each call goes through the step cache, so the same
  request replays without calling the model. Each change saves a version.
- **Versions** (`email_versions`, migration 075): up to 50 per email, saved by the server for each Tia change and for
  the email as it was before her first one. Only the server can add one today.
- **B4's canvas editor**: one undo history for every email on the canvas, where one step can change several emails;
  safe save order and retries.
- **Brew** (the owner's screenshots and Brew's pages): each email's toolbar has "Add to chat" and a comment button; the
  chat sits on the left; a version menu above each email previews earlier versions ("LATEST" pill); one prompt makes
  several emails side by side; the Groups view shows cards with a stack of emails, who last edited them and when.

## 2. B5a: Tia on the canvas

### 2.1 The left panel

- B4's + panel becomes one tab of a left panel with two tabs: **Tia** and **Add**. The + button opens it on Add; the
  Tia button (the sparkle, `AiMark`, at the top left beside +) opens it on Tia. 340 px wide; a bottom sheet under
  1,024 px, like the right panel. Both side panels can be open together.
- The Tia tab is the Email Studio's chat (`AiPanel.tsx`), moved into the panel: the conversation, Tia's replies with
  `AiAvatar`, her change lines tagged `AiTag`, her questions with choice buttons, "3 versions", and a screenshot to
  build from. The conversation belongs to the group's canvas while it's open; leaving the canvas clears it.
- First visit: the empty Tia tab shows its drawing and one line, "Ask Tia to write or change emails in this group",
  with three example prompts as buttons. Afterwards it opens straight to the conversation.

### 2.2 Add to chat

- **What it is:** chips above the message box that say what Tia may change. "Add to chat" puts one there.
- **Where it is:** on the email toolbar (Brew's place), on the element bar (the sparkle), in the right-click menu, in
  the Layout tree's menu, and ⌘L for whatever is picked.
- **The chips:** an email shows as its name ("Welcome"); a part shows as the email and the part ("Welcome › Heading:
  Three things worth your time", the words wrap and are never cut short). Each chip has an X. Up to 5 emails a
  message; a sixth says "Tia works on up to 5 emails at a time".
- **With no chip:** Tia works on the picked email. With nothing picked, she works on the group: she can write new
  emails (B5b) or asks which email to change.

### 2.3 What Tia may change

The server enforces this inside the tools, so it holds whatever the model tries. A refused tool call goes back to
Tia with the reason, and she adjusts or says what she couldn't do.

| Chips | Tia may change |
| --- | --- |
| A part (block or section) | That part's words, links, pictures and its own styles. Adding, moving or removing blocks is refused |
| An email | Anything inside that email, and its subject and preview text |
| Several emails | Anything inside each of them; each gets its own turn (below) |
| Any | Brand-wide changes (a class, "Every heading", a component, the brand's styles) only after she asks and the person says yes |

### 2.4 One turn, several emails

- Each email in the turn gets its own call (in parallel, at most 3 at a time), with the same message and a short
  note naming the other emails in the turn, so they match in tone. A part chip narrows that email's call to the part.
- **While Tia works**, each email in the turn shows a small "Tia is writing" chip above it (`AiAvatar` and the
  four-square loader), and it can't be edited (its panel is read-only with one line, "Tia is changing this email").
  Other emails stay editable. Stop ends the turn; emails already done keep their changes.
- **When she's done**, all her changes land as **one undo step** (B4's history), so one ⌘Z takes back her whole turn
  across every email. Each changed email flashes a soft green ring once (no motion under reduced motion). Her reply
  lists what changed, by email, and each line picks that part on the canvas when clicked.
- **Versions:** each changed email saves a version (as the Studio's chat does today), with the email as it was before
  her first change.
- **If an email changed anyway** while she worked (another tab, another person), her change for that email isn't
  applied; the chat says "Welcome changed while Tia worked" with Apply anyway and Skip.
- **Errors:** a model hiccup is tried again on its own (the route's existing retry); what still fails shows as one
  line in the chat with Try again, per email.

## 3. B5b: Many new emails from one prompt

- **Asking:** with nothing picked and no chips, a prompt like "Write a 3-email welcome series for new students" starts
  a plan. Tia answers with a plan card: each email's name, subject and one line on what it says, in order, at most 10.
  The card has **Write them** and **Change** (a reply changes the plan).
- **Writing:** Write them puts a placeholder artboard for each email at the end of the group's row (600 px wide, its
  name above, the four-square loader inside), and the canvas fits them in view. Tia writes them in parallel, at most 3
  at a time, each from the best template for its job and in the brand's styles. Each one replaces its placeholder as
  soon as it's done: a new draft in this group, in the planned order.
- **Saving:** the server builds each email and sends it back; the browser saves it through `email_draft_save` and
  places it with `email_group_place`, the same two calls Add email makes. One write path, one set of checks.
- **Partly done:** an email that fails shows its placeholder with "Couldn't write this one" and Try again; the others
  stay.
- **Undo:** new emails aren't undo steps (as with Add email in B1); each can be deleted, one or several at once.
- In Ungrouped, the new emails land there; a group name in the prompt doesn't make a group (Move to group does).

## 4. B5c: Versions on the artboard

- **The pill:** above each email, beside its name and status, a small pill says **Latest**; when an earlier version is
  showing it says that version's time ("Today 2:14 PM"). Clicking it opens the versions menu.
- **The menu:** the newest first, up to 50: each with its time, who made it (Tia with `AiTag`, or a person's name),
  and its note (Tia's prompt, "Restored from 2:14 PM", "Before Tia", or "Edited"). Hovering one shows it on the
  artboard at once.
- **Viewing a version:** picking one shows it on the artboard in place, read-only, with a bar above the email:
  "Version from 2:14 PM", **Restore**, **Back to latest**. Escape goes back to latest. The rest of the canvas keeps
  working.
- **Restore** makes that version the email's newest content as one undo step, saves, and adds a version noted
  "Restored from 2:14 PM". It's never offered on a sent email (sent emails show their versions read-only, so people
  can see how it was made).
- **Saved points for hand edits:** today only Tia's changes save versions. B5 also saves one when someone finishes
  editing an email by hand: when the pick leaves that email after changes, when the canvas closes, and every 10
  minutes during long edits. Each is noted "Edited" with the person's name. Saves with no change since the last
  version are skipped.
- **Who can add a version:** a new function, `email_version_save(p_ws, p_email, p_note)`, lets a member save a
  version of an email's saved content. It reads the email from the database itself, so a browser can never store a
  version of something that wasn't saved; Tia's versions keep going through the server.

## 5. B5d: Comments

- **Leaving one:** the comment button on the email toolbar, "Comment" in the right-click menu, or C then a click on
  any part of an email. A small box opens at that spot: write, then Comment (⌘Enter). A comment belongs to the email
  and, when one was clicked, to that part.
- **Seeing them:** each thread shows as a round pin with the first commenter's initials at the top right of its part
  (or of the email). Pins keep their place at every zoom and follow the part when it moves; a thread whose part was
  deleted moves to the email's top right. The email's name shows a count when it has open threads.
- **A thread:** clicking a pin opens it beside the pin: each comment with its author, time and words, a reply box,
  **Resolve**, and on your own comments **Delete** (with a confirm). Owners and admins can delete any comment.
  Resolved threads hide; "Show resolved" in the toolbar's More menu brings them back, grayed.
- **Sent emails** take comments too (notes on how it went).
- **Not in B5:** mentions, notifications by email, and live updates while someone else comments (a thread refreshes
  when opened).

## 6. B5e: Campaigns views, and the canvas replaces the Studio for campaigns

### 6.1 Groups and List

- Campaigns gets a switch beside its title: **Groups** and **List**, remembered on this computer.
- **Groups:** B1's cards (Ungrouped first, then each group), now with who last edited it as well as when ("Vincent,
  2 h ago"). Emails record who saved them last (migration 160).
- **List:** today's table of every campaign (status, sent, opened, clicked, meetings, forms, unsubscribed), with a
  Group column. Clicking a row opens a sent campaign's results, or a draft on its canvas with it picked.

### 6.2 Campaign drafts open on the canvas

- Every way of opening a campaign draft (Campaigns' List, a link, the email's Open) opens its group's canvas (or
  Ungrouped) with the email picked and in view.
- **What the canvas still lacks from the Email Studio, and gets in B5e:**
  - **Check:** the email toolbar gets a Check button with a count when the email has problems (a button with no link,
    a picture with no alt text, an empty subject), the same notes the Studio's check list shows. Clicking one picks
    the part it's about.
  - **Light and Dark:** the email toolbar gets a Light and Dark switch that shows the picked email as dark-mode mail
    apps show it.
- **The Email Studio stays** for emails outside Campaigns: the emails inside automations (Emails › Automations) and
  templates (Emails › Templates). Those aren't on any canvas. Its "Open in Studio" item leaves the canvas's More menu.

## 7. Migration 160

- `emails.updated_by` (uuid, the person who saved last), set by `email_draft_save`.
- `email_version_save(p_ws, p_email, p_note)`: members only; saves a version from the email's saved row; skips it
  when the last version has the same content; keeps 50.
- `email_comments`: `id`, `workspace_id`, `email_id`, `element_id` (nullable), `thread_id` (the first comment's id),
  `author`, `body` (1 to 2,000 characters), `created_at`, `resolved_at`, `resolved_by`. Members read; adding,
  replying, resolving and deleting go through `email_comment_add`, `email_comment_resolve` and
  `email_comment_delete`, which check membership and that only the author (or an owner or admin) deletes. Deleting the
  email deletes its comments.

## 8. How it's built

New:

- `src/lib/design/email/scope.ts` (pure, tested): what a turn may change from its chips, and the check every Tia tool
  runs before it changes anything.
- `src/lib/design/email/series.ts` (pure parts tested): the plan tool (`plan_emails`: names, subjects, one line each,
  at most 10) and building one email of a plan through the existing chat.
- `src/app/api/email/series/route.ts`: plans and builds, through the step cache.
- `src/components/app/emails/canvas/LeftPanel.tsx`: the Tia and Add tabs.
- `src/components/app/emails/canvas/CanvasChat.tsx`: the chat with chips, several emails a turn, locks, the plan
  card and placeholders.
- `src/components/app/emails/canvas/VersionPill.tsx`, `Comments.tsx`, `CheckButton.tsx`.
- `supabase/migrations/160_canvas_versions_comments.sql`.

Changed:

- `chat.ts`: tools take a scope and refuse what's outside it; a turn can name the other emails in it.
- `src/app/api/email/chat/route.ts`: takes `scope` and `turnWith`; saves versions under `em:<id>` for canvas turns.
- `AiPanel.tsx`: its parts move into `CanvasChat.tsx` and stay shared with the Studio.
- `EmailCanvasPage.tsx`, `Artboard.tsx`, `Overlay.tsx`: placeholders, the Tia chip, the green ring, version viewing,
  comment pins.
- `EmailsView.tsx`: Groups and List; drafts open on the canvas.
- `GroupCards.tsx`: who last edited.

## 9. How we prove it

- `tests/emailScope.test.ts`: a part chip lets Tia change its words and styles and refuses adding, moving or removing
  blocks and changes to any other part; an email chip refuses changes to other emails; brand-wide changes need the
  yes.
- `tests/emailChatScope.test.ts`, with a scripted model (a stand-in that returns set tool calls): a part-scoped turn
  where the model tries to delete another block gets the refusal back and the email keeps that block; a 3-email turn
  makes 3 calls, each naming the others; a replayed turn comes from the step cache and calls no model.
- `tests/emailSeries.test.ts`, scripted model: a plan of 3 comes back in order; more than 10 is cut to 10; each built
  email reads back through `readEmailDoc`; one failing email doesn't stop the others.
- `tests/pg/canvasVersions.pg.ts`: `email_version_save` saves from the row, skips an unchanged save, keeps 50, refuses
  non-members; comments: members add, reply and resolve, only the author or an owner deletes, non-members see nothing,
  deleting the email deletes its comments; `email_draft_save` records who saved.
- `scripts/email-canvas-check.ts` part B5, with stand-in chat and series answers:
  - Add to chat on a heading, ask to change it: only the heading changes; the chip and the reply's change lines work;
  - a 2-email turn: both lock while Tia writes, both change, one ⌘Z takes back both;
  - "Welcome changed while Tia worked" shows when the email changed mid-turn;
  - a 3-email plan: Write them shows 3 placeholders, they fill in order, the drafts save into the group; one failing
    shows Try again;
  - the version pill: hover previews, Restore brings it back as one undo step, Back to latest;
  - a hand edit then picking another email saves an "Edited" version;
  - a comment on a part: the pin, a reply, Resolve hides it, Show resolved, Delete asks first;
  - Campaigns' Groups and List switch; a draft row opens the canvas with it picked;
  - Check lists the problems and picks the part; Light and Dark;
  - B1 to B4 checks still pass; no page errors, light and dark, 390 px wide.

## 10. Not in B5

Mentions and comment notifications; live updates of other people's edits and comments (one person edits an email at
a time); Tia writing whole automations (Emails › Automations has its own "Describe an automation"); A/B tests on the
canvas; picking several parts inside an email for one chat chip.

## 11. Running cost

Tia on the canvas uses the same model and calls as the Studio's chat (Claude Sonnet 5.5 at $2 a million input and
$10 a million output tokens, cached input at a tenth of the input price; all "check"). A turn on one email is about
2,000 new input tokens, 10,000 cached and 3,000 output: about $0.04. A plan is about $0.01; each email written from a
plan is about 2,000 new input, 10,000 cached and 4,000 output: about $0.05. Replays from the step cache are free.

Assumed use per team a month: 45 email changes on the canvas, and 2 plans of 4 new emails.

| | Beta (50 teams) | Growth (500 teams) |
| --- | --- | --- |
| Claude, changes on the canvas (45 × $0.04 a team) | about $80 (check) | about $800 (check) |
| Claude, new emails from prompts (2 plans of 4 a team) | about $20 (check) | about $200 (check) |
| Database (versions and comments, a few KB each) | $0 | about $1 (check) |
| Servers | $0 (it runs in the browser and the existing web app) | $0 |
| **Total added** | **about $100 a month (check)** | **about $1,000 a month (check)** |

Some of this replaces chat use in the Email Studio, which campaign drafts no longer open, so the real increase is
lower.
