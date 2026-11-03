# Claritia

Claritia is Forms, Meetings and Workflows: forms that turn visitors into leads, meetings that book them with the right person, and workflows that follow up (reminders, follow-ups and the rest). Built for small teams of every kind, not only sales. There is no CRM, Enrichment, Scoring or Visitors: those were removed (`supabase/migrations/116_forms_meetings_workflows.sql`); contacts stay in the database as the person behind each fill and booking, with no screens of their own. It sits beside Arrowsterr (SEO and AI search) and Omniscient (`dev-omniscient/omniscient`, CRM and deal rooms), on the same stack and brand system. The original product, AI end-to-end testing, stays for existing workspaces and powers Funnel QA.

Setup for sending: `docs/sending-setup.md`. Setup for forms: `docs/forms-setup.md`. Setup for meetings: `docs/meetings-setup.md`. Start with `docs/inbound.md` and `docs/form-builder.md` (forms to booked meetings), `docs/studio-v2-plan.md` (Form Studio: one chat per form with Tia, the form check, blocks, industries, languages), `docs/forms.md` (the older builder and its AI), `docs/form-templates.md` (the 150 templates and 18 styles, in Forms › Templates and on the website), `docs/on-submission.md` (forms, meetings and routing: the form picks the meeting, the meeting picks the person; Route by answer, past fills, Always do), `docs/forms-plan.md` (what's next for forms), `docs/workflows.md`, `docs/design-system.md` (Webflow-level styling for forms and emails) and `docs/brand.md` (look and copy). Older docs about the CRM, Enrichment, Scoring, Visitors and identity describe removed parts. `docs/vision.md` and `docs/plan.md` describe the testing product.

The sidebar is in `src/lib/nav.ts`: Forms, Meetings, Workflows, then Settings. Routing lives in each form's On Submission and in Dynamic meetings, teams in Meetings › Availability. Workflows is folders of workflows, meeting reminders included (`docs/workflows.md`). Settings › Integrations connects the tools forms send leads to, and the form and meeting tools whose webhooks come in (Typeform, Tally, Webflow, Calendly, Cal.com). Old addresses of removed screens open Forms. One sidebar item per route; pages inside a route are tabs under its title (`Section` in `src/components/app/ui.tsx`). The app opens on Forms. Meetings (scheduler, booking pages, instant booking in forms) is in `docs/meetings-scheduler.md`. The testing screens are gone from the app. Background work goes through the jobs queue (`supabase/migrations/020_foundation.sql`, `src/lib/jobs.ts`); job kinds of removed parts are dropped on the way in (116).

## Rule: every build includes its running cost
- Every build plan, feature or milestone states what it adds to the monthly bill: servers plus every paid service, Claude tokens included. Give monthly totals at two stages: Beta (50 teams) and Growth (500 teams).
- Mark any price that couldn't be confirmed on the vendor's own page as "check".

## Rule: reliability first
- A false failure costs more than a missing feature, and a wrong link or signal costs more than a missing one. Never ship a change to the runner, healing, failure sorting, the jobs queue, the send pipeline, routing, booking or Funnel QA without a test that proves it on a flaky case.
- AI calls go through the step cache. A passing step replays from cache and never calls the model.

## Rule: no browser pop-ups or browser dropdowns
- Never use `<select>`, `window.prompt`, `window.confirm` or `window.alert`. Use the app's own `Select` and dialog helpers (same pattern as Omniscient).

## Rule: minimal copy
- Working screens hold labels, buttons and real errors only. No help text or cost notes.
- Explaining happens once, on a tool's first screen before there's data (the `ToolIntro` pattern from Omniscient).

## Rule: one brand style
- Follow `docs/brand.md` for the app, the website, emails and decks. Use the tokens in `src/app/globals.css`, never a hex.
- The same family as Omniscient and tryclaritia.com: black and white with plain grays, Inter for every word, black for the one primary action, emerald as the one signal (about 5% of a view). Big titles take two tones. Mono only for eyebrows, code, keys and ids.
- Buttons, tags and toggles are pills. Inputs 6px, cards 10px, the page panel and dialogs 16px. A state is a pill `Badge`.
- No gradients and no emoji. Cards sit flat on a hairline; shadows only on the page panel, the one frame and things that float.
- The corner bracket from the mark is Claritia's motif (the Catch in `src/components/app/Catch.tsx`).
- AI is shown with the sparkle (`src/components/app/Ai.tsx`): `AiMark` beside AI controls, `AiAvatar` where AI speaks, `AiTag` on anything AI made.
- Empty states and first screens use a drawing from `src/components/sketches`.
- Motion uses the three speeds and two curves in `docs/brand.md`, and stops under reduced motion. Every screen works in light and dark.
