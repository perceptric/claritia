# Claritia

The agentic marketing platform: Claritia turns website visitors into leads and leads into meetings, with AI agents running the journeys, writing the emails, building the pages and proving what made revenue. Built for small teams who find HubSpot too heavy, after Default: its CRM plus forms, enrichment, qualification, routing and meeting scheduling (`docs/inbound.md`). It sits between Arrowsterr (SEO and AI search) and Omniscient (`dev-omniscient/omniscient`, CRM and deal rooms), on the same stack and brand system. The original product, AI end-to-end testing, stays for existing workspaces and powers Funnel QA.

Setup for imports, sources and warehouses: `docs/sources-setup.md`, then `docs/connect-guide.md` for each tool. Setup for sending: `docs/sending-setup.md`. Setup for forms: `docs/forms-setup.md`. Setup for meetings: `docs/meetings-setup.md`. Start with `docs/enrich-workflows-reports.md` (what's next: Resend, Enrichment, Workflows, Reports), `docs/lock-in-plan.md` (the next six weeks), `docs/inbound.md` and `docs/form-builder.md` (forms to booked meetings), `docs/marketing-platform.md` (the full plan), `docs/m1-website-intelligence.md` (the module being built), `docs/identity.md` and `docs/account-intelligence.md` (specs), and `docs/brand.md` (look and copy). `docs/vision.md` and `docs/plan.md` describe the testing product.

The sidebar is in `src/lib/nav.ts` (`docs/app-structure.md`): CRM (Contacts, Companies, Opportunities, Meetings), Automation (Workflows, Forms, Signals, Enrichment), Routing, Scheduling, Reports (Funnel, Speed to lead, Reps, Forms, Email), Email (Segments, Templates), Site (Pages), Ads, Settings. The app opens on Contacts. The CRM is in `docs/crm.md`; Meetings (scheduler, booking pages, instant booking in forms) in `docs/meetings-scheduler.md`. The testing screens are gone from the app. Background work goes through the jobs queue (`supabase/migrations/020_foundation.sql`, `src/lib/jobs.ts`).

## Rule: every build includes its running cost
- Every build plan, feature or milestone states what it adds to the monthly bill: servers plus every paid service, Claude tokens included. Give monthly totals at two stages: Beta (50 teams) and Growth (500 teams).
- Mark any price that couldn't be confirmed on the vendor's own page as "check".

## Rule: reliability first
- A false failure costs more than a missing feature, and a wrong link or signal costs more than a missing one. Never ship a change to the runner, healing, failure sorting, the jobs queue, identity, the send pipeline, routing, booking or Funnel QA without a test that proves it on a flaky case.
- AI calls go through the step cache. A passing step replays from cache and never calls the model.

## Rule: no browser pop-ups or browser dropdowns
- Never use `<select>`, `window.prompt`, `window.confirm` or `window.alert`. Use the app's own `Select` and dialog helpers (same pattern as Omniscient).

## Rule: minimal copy
- Working screens hold labels, buttons and real errors only. No help text or cost notes.
- Explaining happens once, on a tool's first screen before there's data (the `ToolIntro` pattern from Omniscient).

## Rule: one brand style
- Follow `docs/brand.md` for the app, the website, emails and decks. Use the tokens in `src/app/globals.css`, never a hex.
- Warm paper and Geist for every word: titles 600 weight with tight tracking. Labels are Geist 12px, sentence case; mono only for code, keys and ids.
- Buttons, tags and toggles are pills. Inputs 8px, cards 16 to 24px, the page panel 32px. A state is a pill `Badge`.
- Soft washes are allowed on large areas. No gradients on buttons or text. No emoji.
- Cards sit flat and lift on hover; shadows only on lifted and floating things.
- AI is shown with the sparkle (`src/components/app/Ai.tsx`): `AiMark` beside AI controls, `AiAvatar` where AI speaks, `AiTag` on anything AI made.
- Empty states and first screens use a sketch from `src/components/sketches`.
- Motion uses the three speeds and two curves in `docs/brand.md`, and stops under reduced motion. Every screen works in light and dark.
