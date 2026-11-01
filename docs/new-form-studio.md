# New form, built live

New form is a full page: a short conversation on the left, the real form on the right (`AiCreate.tsx`).

1. **Start.** "Describe your form" and Styling: the workspace's brands by website, Claritia's look, or "Learn from a
   website". With no brand yet, the website box shows. A website already learned shows as the pick to use. Learning
   runs the quick read (`/api/forms/scan`), so the preview takes the brand in seconds; the deep read updates it after.
   Before the sketch the preview shows a placeholder in the brand, or a waiting animation with no brand.
2. **Sketch.** `mode: "sketch"` reads the site's brief and asks Claude for the kind, the whole draft and 0 to 5
   follow-up questions (`sketchForm`). The draft passes `checkForm` and the kind's must-haves before it's shown. The
   left side lists its steps with a One page / Steps switch (`toOnePage`, `toSteps`, no AI).
3. **Questions.** One at a time. Each answer goes through `mode: "refine"` (`refineForm`): Claude changes only what the
   answer calls for, the result passes the checker, and the preview updates. Skip leaves the draft as it is.
4. **After the send.** A thank-you, a page, their results by email (when the form has results), or a meeting (a type,
   or a new one: the form then opens on On Submission to make it). `applyAfter`, no AI.
5. **Create form** saves it with the brand and opens the builder.

The preview is the live form script itself (`FormPreview`), so it shows exactly what visitors get. The script's host is
a size container, so split screens and two-column rows fold to one column in a narrow preview or a phone frame.

## Running cost

Claude Sonnet 5.5 at $2 in and $10 out per million tokens, 10 forms a team a month: the sketch about $0.12 (with its
check round), about 3 answers at $0.06, no AI for the rest: about $0.30 a form, the same as before.

| Item | Beta (50 teams) | Growth (500 teams) |
| --- | --- | --- |
| Claude: sketch and answers | about $150 | about $1,500 |
| Brand quick read (web server) | $0 | $0 |
| **Total** | **about $150** | **about $1,500** |
