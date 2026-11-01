# Forms

How a form gets made and changed: New form, the spec, the builder and the AI behind them. This replaces the old AI
form builder docs. The live form script, the send path, delivery to CRMs, booking and routing are unchanged and stay
in `docs/form-builder.md`, `docs/form-studio.md`, `docs/forms-plan.md` and `docs/on-submission.md`.

## What was torn down

The New form and Build screens grew in eleven rounds (#74 to #87). Two form makers ran side by side (the rule-based
`interview.ts` and the AI `aiBuild.ts`), the AI route had five modes with three unused, and each answer in New form
made Claude write the whole form again, so one answer could break parts nobody asked to change.

Removed: `AiCreate.tsx`, `Build.tsx`, `Panels.tsx`, `InteractivePanels.tsx`, `FormChat.tsx`, `aiBuild.ts`,
`interview.ts`, `chat.ts`, the routes `/api/forms/ai`, `/api/forms/interview` and `/api/forms/chat`, Blank form and
their tests. The chat model's name and call shape moved to `src/lib/ai/chatModel.ts` for the email, routing, scoring
and workflow chats that used them.

## Part 1. New form

`src/components/app/forms/new/NewForm.tsx`. A full page: the steps on the left, the live preview on the right, a
progress bar with the five screens at the top.

### Screen 1. Describe and Styling

- "Let's build something exciting", the Describe your form box, and Styling: the workspace's brands by website,
  Claritia, or Learn from a website (the quick brand read, `/api/forms/scan`, then the deep read after).
- The preview shows the throbber (`Throbber.tsx`) while the brand loads: seven dots in a ring, in the brand's color,
  chasing each other, with one hopping out and back every few laps. It stands still under reduced motion.
- Continue reads the website into a short brief (`brief`), kept per site and day.

### Screen 2. One page or steps

- Claude plans the layout with thinking on. The thinking streams into the left side as it comes (`plan`, a stream of
  lines). Then: the decision, one line on why, and the rough sketch with each page numbered.
- The preview draws the sketch as cards (`Wireframe.tsx`).
- The One page / Steps switch regroups the sketch in code (`planLayout`).
- Code checks the plan against the layout rules (`checkPlan`): more than 8 questions on one page become steps; 4 or
  fewer in steps become one page.

### Screen 3. The form, then a few more questions

- Claude writes the whole form as a spec (`build`), in JSON that must match a schema. The spec checker (`lintSpec`)
  reads it. Problems go back to Claude once, in the checker's words. A second failure shows an error and nothing
  broken is ever shown.
- The layout rules run again on the result (`fitLayout`): one page over 8 questions becomes steps, a step over 6
  questions is split, and contact details go on the last step when that keeps every condition pointing back.
- The preview is the real form script with the form laid over the screens' settings.
- Then up to 3 follow-up questions, one at a time, as click answers or a box to type. Each answer goes to `edit`, which
  answers with small edits. They apply all or none, so the rest of the form can't change. A failed answer leaves the
  form as it was and shows why.

### Screen 4. Submission

Contacts in Claritia (always on), each connected CRM (on by default; a destination is made for each), Email the team
(the person making it, plus anyone added), Spam guard (Turnstile) and the Consent checkbox (shown by region).

### Screen 5. End

A thank-you (Claude wrote it in Screen 3, editable here), Go to a page, or Book a meeting (a type, or a new one: the
form then opens on Submission to make it). Then **Publish** (create, then publish and open Share) or **Create form**.

## Part 2. The spec

`src/lib/forms/spec.ts`. The small format New form, the builder and the AI work in. The saved form
(`src/lib/forms/schema.ts`) stays the one stored and run, so live forms, routing, scoring, CRM sync and the send path
didn't change.

- **Steps of fields.** Types: short text, long text, email, phone, number, link, date, country, pick one, pick many,
  dropdown, picture choice, yes or no, rating (5 stars or 0 to 10), file upload, checkbox, hidden, heading and text.
- **Logic.** A field shows when all or any of its conditions hold, each on an earlier question. A step shows on one
  condition on a question from an earlier step. Conditions only point back, so logic can't loop.
- **Saves to.** A contact field, one of the workspace's own fields, or the submission.
- **Locked fields.** Anything the spec can't edit (calculations, payments, addresses, grids and the rest) is kept as
  it is, so old forms open in the builder without losing anything.

### To the saved form and back

- `toForm(spec, base)` lays a spec over a saved form. The base keeps every setting the spec doesn't show (consent,
  spam, alerts, after the send, design). Field logic becomes show rules. A step's condition becomes a path on the step
  before it that goes past the step when the condition is turned over. Only ops whose opposite is exact can be used on
  steps, and two steps in a row can't both have conditions, so the path is always exact.
- `fromForm(form)` reads a saved form back. Show rules it can say as field logic become field logic; the rest, and
  paths it didn't make, are kept on the side by step id and come back unchanged.
- Every template reads as a spec and comes back exactly the same (tested).

### Edits

`applyEdits(spec, edits)`: add, change, remove and move fields and steps, and the form's title, intro and button.
All or none: each edit must find what it names, and the result must pass the checker. Removing a question removes the
conditions that read it. The AI's edits and the builder's clicks are the same list.

## Part 3. The builder

`src/components/app/forms/build/Builder.tsx`, the form's Build tab.

- **Outline** on the left: steps and their questions, picked by click, moved by drag, with Add a question and Add a
  step. Submission sits under them.
- **The live form** in the middle: the real form script on the picked step, desktop or phone.
- **The panel** on the right: the picked question (label, type, required, placeholder, help, options, pictures, file
  kinds and size, scale, saves to, and logic), the picked step (title and its condition), Submission (what happens
  after the send, with routing, from `OnSubmission.tsx`), or, with nothing picked, the form (title, intro, button,
  one page or steps, styling).
- **The bar** under the form takes plain words and sends them to `edit`.
- Every change is one undo step; typing in one box within a second stays one step.

Submissions, Share, Sync and Settings are unchanged.

## Part 4. The AI

`src/lib/forms/specAi.ts` and `src/app/api/forms/new/route.ts`. Model: Claude Sonnet 5.5 with adaptive thinking.
Every call goes through the step cache, so the same inputs replay the saved answer and never call the model.

| Call | When | Out |
| --- | --- | --- |
| `brief` | Screen 1, once per site a day | The business brief |
| `plan` | Screen 2 | Streamed thinking, then the layout, why and the sketch |
| `build` | Screen 3 | The whole spec, a thank-you and up to 3 follow-up questions |
| `edit` | Each follow-up answer, each line in the builder's bar | Small edits, all or none, one retry |

The plan stream sends a line every 15 seconds while Claude thinks without output, so no proxy closes it. With no
Claude key on the server, New form shows a real error and the builder still works by hand.

## Part 5. Tests

`tests/formSpec.test.ts` and `tests/formSpecAi.test.ts`, with a fake model for the AI:

- A spec that passes the checker becomes a form the form checker passes, and the live form's own engine
  (`visibility`, `nextStep`, `checkAnswers`) runs its logic the way the spec says.
- Flaky cases: an answer to a question that later hides is dropped and never blocks the send; Claude's broken form is
  fixed on the second round, and broken twice gives nothing; edits that name a missing question go back once and a
  second miss changes nothing; removing the only email is refused.
- Round trips: every template, and forms with calculations, paths, hide rules and CRM links.
- The layout rules, one page and back, and keys that can't collide.

## Running cost

Claude Sonnet 5.5 at $2 in and $10 out per million tokens (check: from this repo's price table in
`src/lib/ai/cache.ts`, not confirmed on Anthropic's page from here). 10 new forms and 20 builder edits a team a month.

Per form: `brief` about $0.03 (once per site a day), `plan` with thinking about $0.04, `build` about $0.08 with its
fix round, 3 follow-up answers about $0.07. About $0.22 a form. Each builder edit about $0.02.

| Item | Beta (50 teams) | Growth (500 teams) |
| --- | --- | --- |
| Claude: new forms | about $110 | about $1,100 |
| Claude: builder edits | about $20 | about $200 |
| Servers (no new ones: the route runs on the web app) | $0 | $0 |
| Turnstile | $0 (free plan, check) | $0 (free plan, check) |
| **Total** | **about $130** | **about $1,300** |

This is a little under the old New form (about $150 and $1,500), since answers send small edits in place of the whole
form.
