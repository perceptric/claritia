# Forms rebuild

Forms gets rebuilt from scratch. This doc replaces the ten form docs once the rebuild ships (Part 9).

## Why

The forms code grew in eleven rounds (#74 to #87), each one stacked on the last:

- Ten plan docs that disagree with each other (`form-builder.md`, `form-builder-v2.md`, `form-studio.md`,
  `forms-plan.md`, `form-kinds-plan.md`, `interactive-forms-plan.md`, `ai-form-builder.md`, `new-form-studio.md` and more).
- Two form makers side by side: the rule-based `interview.ts` (with its own route) and the AI one in `aiBuild.ts`.
- The AI route has five modes (`read`, `ask`, `build`, `sketch`, `refine`). The New form screen calls two of them.
  The rest is dead code that still has to keep passing tests.
- One schema file of 1,500 lines with 13 form kinds, quizzes, payments, outcomes, settings and formulas, and a 2,000 line
  form script that draws all of it. Every new idea touched both.
- `refineForm` asks Claude to write the whole form again for each answer, so one answer can break parts of the form
  nobody asked to change.

The 211 form tests pass. The problems are in the flow and in a format too big to change safely.

## What stays and what goes

| Stays (works, holds customer data) | Goes (rebuilt) |
| --- | --- |
| Tables: `forms`, `form_versions`, `submissions`, `deliveries`, `form_destinations`, `form_uploads`, `form_drafts`, `form_daily`, `form_seen`, `brand_kits` | New form: `AiCreate.tsx`, `newForm.ts`, `/api/forms/ai`, `aiBuild.ts`, `interview.ts`, `/api/forms/interview`, the template gallery |
| Brand capture and Styling: `src/lib/brand/*`, `/api/forms/scan`, `/api/forms/brand`, the brand kit | The form format: `schema.ts`, `values.ts`, `formula.ts`, `ops.ts` for new forms |
| The send path on the server: idem keys, consent, contacts, uploads bucket, CRM delivery (`submit.ts`, `files.ts`, `deliveries`) | The form script `element.ts` for new forms |
| Submissions, Share and Sync tabs (they read answers through one helper, updated for v2) | The builder: `Build.tsx`, `Panels.tsx`, `InteractivePanels.tsx`, `FormCanvas.tsx`, `ConditionRows.tsx`, `controls.tsx`, `editorModel.ts`, `formModel.ts`, `FormChat.tsx`, `chat.ts` |
| Funnel QA form checks (`worker/formQa.ts`), pointed at v2 | The ten old docs |

Forms already live keep running. Each published version stores its engine number (`ENGINE` already exists). The form
script route serves the v1 script for a v1 version and the v2 script for a v2 version. v1 is frozen: no new features,
bug fixes only. Booking's routing questions (`RouteQuestions.tsx`) also read v1 types; they keep a small copy of the
types they use so v1 can be deleted later.

## Part 1. The new flow

A full page with two halves, as drawn: the conversation on the left, the live preview on the right. The preview is the
real v2 form script, so it shows exactly what visitors get. Five screens, with a progress bar at the top and Back on
each one.

### Screen 1. Describe and Styling

Left:
- Eyebrow `New form`, title "Let's build something exciting".
- "Describe your form" box.
- Styling, with the app's `Select`: the workspace's saved brands (by website), Claritia, or Learn from a website.
  Learn opens a website box and runs the quick brand read that exists today; the deep read updates it after.
- Continue.

Right: a funny throbber until the brand is in. It's the ring of dots from the sketch, in the brand's main color. The
dots chase each other around the ring, and every few laps one hops out and drops back in. Transform and opacity only.
With reduced motion it shows the dots standing still. Once the brand is in, the preview shows an empty form card in
the brand.

On Continue, the server reads the website (home plus up to 3 pages, the `readPage` and `pickPages` code that exists
today) and writes a short brief: what they sell, who buys, words they use, pictures. The brief is kept per website for
7 days, so a second form on the same site skips this.

### Screen 2. One page or steps (the thinking step)

Claude decides the layout with thinking on, and the left side shows its thinking summary as it streams (`thinking:
{type: "adaptive", display: "summarized"}`). Then the decision:

- "One page" or "Steps", with one line on why.
- The rough sketch: each page numbered 1, 2, 3, with the questions it holds in a few words.
- A One page / Steps switch. Switching regroups the fields in code, with no AI.

Right: the rough sketch drawn as a wireframe in the brand (gray bars for fields, real step titles).

The best practices Claude is given, and that code checks after:

| Rule | Check in code |
| --- | --- |
| 5 fields or fewer and no logic: one page | One page with more than 8 fields becomes steps |
| More than 7 fields, or branches, or questions that qualify before contact details: steps | Steps with 4 fields or fewer total becomes one page |
| Easy questions first, contact details last | Email and phone sit on the last step |
| 3 to 5 fields a step, 2 to 5 steps | Steps over 6 fields get split, more than 5 steps fail the check |
| A file upload gets its own step when the form has steps | Moved by code if needed |

If Claude's answer breaks a hard rule, code fixes the layout and the line on why says so.

### Screen 3. The full form, then a few more questions

Claude writes the whole form in the v2 format (Part 2) from the brief, the description and the plan from Screen 2.
It uses structured output, so the reply is always valid JSON. It picks the field types the form needs: short and long
text, email, phone, number, date, radio, checkboxes, dropdown, picture choice, yes or no, rating, file upload,
consent. It adds show and hide logic where answers change what comes next, and a file upload only when the description
or the site calls for files (a résumé, a photo, a brief).

The checker (Part 3) runs on the result. If it fails, the errors go back to Claude for one fix round. If it still
fails, the user sees the last good version and the error in plain words.

Left, under the heading "A few more questions": up to 3 questions Claude still needs ("Do you want to ask for a
budget?"), one at a time, as click answers plus a box to type. Each answer goes to an edit call that returns small
changes (add field, change field, remove field, move field, set logic). Code applies them and runs the checker. The rest
of the form can't change. Skip leaves the form as it is.

Right: the full live form. Clicking through it works, logic included.

### Screen 4. Submission

Where the answers go. No AI.

- Claritia contacts, always on. Fields map by type (email, first name, company and so on).
- The CRM, when one is connected (HubSpot, Salesforce, Omniscient), with fields mapped by name and a Change link.
- An email alert to the team, with a member picker.
- Spam guard (Turnstile), on by default.
- Consent: the form adds the unticked checkbox for strict regions, the same rule as today.

### Screen 5. End

What the visitor sees after they send.

- A thank-you screen. Claude wrote the title and line in Screen 3, in the site's words. Editable here.
- Or go to a page (a link).
- Or book a meeting: pick a meeting type, or make a new one.

Then **Create form** saves a draft and opens the form's page. **Publish** sits next to it.

## Part 2. The form format (v2)

Small on purpose. Everything a form can do fits on one screen of types.

```ts
type FormV2 = {
  v: 2;
  name: string;
  layout: "page" | "steps";
  steps: Step[];            // one step when layout is "page"
  end: End;
  submit: Submit;
  kitId: string | null;     // the brand kit
};

type Step = { id: string; title?: string; show?: When; fields: Field[] };

type Field = {
  id: string;
  type: "text" | "longtext" | "email" | "phone" | "number" | "date" | "url"
      | "radio" | "checkboxes" | "dropdown" | "pictures" | "yesno" | "rating"
      | "file" | "consent" | "hidden" | "heading" | "paragraph";
  label: string;
  required?: boolean;
  placeholder?: string;
  options?: { id: string; label: string; image?: string }[];   // radio, checkboxes, dropdown, pictures
  accept?: ("pdf" | "image" | "office")[];                     // file
  maxFiles?: number;                                           // file, 1 to 5
  min?: number; max?: number;                                  // number, rating, checkboxes
  maps?: "email" | "first_name" | "last_name" | "phone" | "company" | "title" | "website" | "country";
  show?: When;
};

type When = { match: "all" | "any"; conds: Cond[] };
type Cond = { field: string; op: "is" | "is_not" | "any_of" | "none_of" | "gt" | "lt" | "filled" | "empty"; value?: string | string[] | number };

type End = { kind: "thanks"; title: string; text?: string } | { kind: "page"; url: string } | { kind: "meeting"; typeId: string };
type Submit = { crm: { source: string; map: Record<string, string> } | null; alert: string[]; spam: boolean };
```

Logic is one idea: `show` on a field or a step. A step that's hidden is skipped. A condition can only point to a field
on an earlier step or earlier on the same step, so logic can never loop.

Later, on this same format and only when customers ask: address, signature, payment, calculator, quiz.

## Part 3. One engine, used twice

`src/lib/forms2/engine.ts`, plain functions with no browser or server code:

- `visible(form, answers)`: the steps and fields showing now.
- `check(form, answers)`: errors per field for the visible fields only. A hidden required field never blocks.
- `clean(form, answers)`: drops answers to hidden fields and unknown ids.
- `lint(form)`: the checker for Claude's output and the builder. Ids are unique, every condition points backward to a
  real field and a real option, options exist where the type needs them, limits hold (10 steps, 40 fields, 100
  options), the layout rules from Screen 2 hold, a lead form has an email field.

The form script runs `visible` and `check` as people type. The server runs `clean` and `check` again on every send
and keeps what the server works out.

## Part 4. The form script v2

A new `<claritia-form>` script built from the engine, same embed line as today. It draws one page or steps with a
progress bar, the app's own dropdown (no `<select>`), file uploads through the upload route that exists today, and the
brand kit's look. It keeps today's safety: a send that fails waits in local storage and retries for 24 hours with the
same idem key. Size limit 25 KB.

## Part 5. The builder after Create

The form's page keeps its tabs: Build, Submissions, Share, Sync, Settings. Build is rebuilt on v2:

- The middle is the live form. Click a field to pick it.
- The right panel edits the picked field: label, type, required, options, file types, logic (`show`).
- With nothing picked, the right panel holds the form: layout, steps, end, submission.
- An Otto-style bar at the bottom takes plain words and uses the same edit call as Screen 3.
- Add field, drag to move, delete with a confirm dialog.

## Part 6. AI calls

All calls go through the step cache. Model: Claude Sonnet 5.5.

| Call | When | In | Out |
| --- | --- | --- | --- |
| `brief` | Screen 1, once per website per 7 days | Site pages | Brief JSON |
| `plan` | Screen 2 | Brief, description | Thinking summary, layout, rough sketch |
| `build` | Screen 3 | Brief, description, plan | Full FormV2 plus up to 3 questions |
| `edit` | Each answer in Screen 3, each line in the builder bar | Form, the ask | List of edits |

The route is `/api/forms/create` with one handler per call. With no Claude key on the server, New form shows a real
error and the builder still works by hand.

## Part 7. Tests (reliability rule)

Each of these runs on a flaky case:

- `build` returns JSON with a condition that points forward, a duplicate id and a dropdown with no options: `lint`
  catches all three, the fix round runs, and a second bad answer shows the last good form.
- `edit` returns a change to a field that doesn't exist: nothing changes and the user sees why.
- A required field hidden by logic doesn't block the send, in the browser and on the server.
- A visitor fills a field, then changes an answer so the field hides: the server drops that answer.
- The same send twice (network drop after the server saved it): one submission.
- A file upload that drops halfway: the field shows the error, the form keeps the other answers.
- The step cache: a second run of the same `build` input replays from cache and never calls the model.
- Layout rules: 12 fields marked "page" become steps; 3 fields marked "steps" become one page.
- v1 forms still load and send after the switch (the v1 tests stay until v1 is deleted).
- Real browser (`scripts/forms2-check.ts` on Chromium): fill a steps form with logic and an upload end to end and see
  the contact appear.

## Part 8. Build order

| Step | What | Done when |
| --- | --- | --- |
| 1 | v2 format, engine, `lint`, tests | Engine tests pass, flaky cases included |
| 2 | Form script v2, hosted page, server send path for v2 | Real-browser check passes |
| 3 | Screens 1 and 2: Styling, brief, throbber, thinking plan, rough sketch | A description becomes a sketch in the brand |
| 4 | Screen 3: `build`, checker round, questions, `edit` | Full form shows with logic and uploads |
| 5 | Screens 4 and 5, Create, the Build tab on v2 | A form goes from description to published |
| 6 | Switch New form to v2, update MCP `create_form` and `edit_form`, Funnel QA on v2, delete the dead code and old docs, point `CLAUDE.md` at this doc | No import of the removed files is left |

## Part 9. What gets deleted in step 6

`AiCreate.tsx`, `newForm.ts`, `aiBuild.ts`, `interview.ts`, `templates.ts`, `chat.ts`, `FormChat.tsx`, `Build.tsx`,
`Panels.tsx`, `InteractivePanels.tsx`, `FormCanvas.tsx`, `ConditionRows.tsx`, `controls.tsx`, `editorModel.ts`,
`formModel.ts`, the routes `/api/forms/ai`, `/api/forms/interview`, `/api/forms/chat`, their tests, and the docs
`ai-form-builder.md`, `form-builder.md`, `form-builder-v2.md`, `form-studio.md`, `forms-plan.md`, `form-kinds-plan.md`,
`interactive-forms-plan.md`, `new-form-studio.md`. `schema.ts`, `values.ts` and `element.ts` stay frozen for v1 forms
until none are live, then go too.

## Part 10. Running cost

Claude Sonnet 5.5 at $2 in and $10 out per million tokens (check: the price list in this repo's docs says so, and it
couldn't be confirmed on Anthropic's page from here). 10 new forms and 20 builder edits a team a month.

Per form: `brief` about $0.03 (once per site a week), `plan` with thinking about $0.04, `build` about $0.08 with its
fix round, 3 answers about $0.07. About $0.22 a form. Each builder edit about $0.02.

| Item | Beta (50 teams) | Growth (500 teams) |
| --- | --- | --- |
| Claude: new forms | about $110 | about $1,100 |
| Claude: builder edits | about $20 | about $200 |
| Servers (the form script and send path run on the web and collect apps that exist today) | $0 | $0 |
| Turnstile | $0 (free plan, check) | $0 (free plan, check) |
| **Total** | **about $130** | **about $1,300** |

This is a little under today's New form (about $150 and $1,500), since answers send small edits in place of the whole
form.
