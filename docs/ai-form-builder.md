# AI form builder

Status: built, 1 November 2026. Replaces the template gallery from `docs/interactive-forms-plan.md` Part 5 and 6:
there are no templates in New form. The form engine from that plan (screens, settings, calculations, results,
outcomes, uploads) is what the AI builds with.

## The flow

1. **What should it do?** Six goals: Give a price, Score or assess, Recommend, Quiz, Book a meeting, Capture leads.
   The workspace's website is filled in; an optional note says what it must include. The first screen's box ("A demo
   request for work emails…") opens this with the note filled.
2. **Reading the site.** The home page and up to four more (pricing, services, product, about) are read on the
   server, refusing private addresses at every redirect, 8 seconds and 1.5 MB a page. Claude writes a business brief:
   name, offer, audience, services, prices exactly as stated, proof as stated, tone, and up to four of the site's own
   pictures. Nothing the pages don't say.
3. **A few questions.** Claude asks 3 to 5 questions for this business and goal (what drives the price, which plans
   to compare, what happens at the end), as choices or text. Without a model, set questions per goal.
4. **Build.** Claude writes the whole form as JSON in our format: an HTML hero and sections, native questions
   (picture cards, sliders, numbers), settings, calculations, a result screen, outcomes and the contact step. The
   draft goes through `checkForm`; its problems go back to Claude, up to twice. Only a form that passes is saved.
5. **Opens in the builder** with a note once: what to replace before publishing and what it assumed. Prices the
   site doesn't show are blank settings, so the form can't go live until they're set.

Everything stays editable: questions, sliders, cards and results in their panels, sections in the Section panel
(the HTML), and anything at all through the AI bar.

## HTML sections

A new content block, `html`, holds a full-width section. `src/lib/forms/html.ts` cleans it to a short list of tags
(section, div, headings, paragraphs, lists, quotes, figures, https pictures and links) and style properties (layout,
spacing, type, color). Scripts, frames, inputs, event handlers, `javascript:` and `data:` links, `url()` in styles and
private addresses never pass. The checker cleans it on save, the form script cleans it again in the browser, and the
builder's canvas shows the same cleaned HTML. Questions are never HTML, so every answer is still checked on the
server and every calculation is still worked out there.

## Where

| Piece | Where |
|---|---|
| Reading pages, the brief, the questions, build and fix | `src/lib/forms/aiBuild.ts` |
| The route (read, ask, build), through the step cache | `src/app/api/forms/ai/route.ts` |
| HTML sections | `src/lib/forms/html.ts`, `html` in `schema.ts`, `element.ts`, `Build.tsx`, `HtmlSection` in `InteractivePanels.tsx` |
| New form screens | `src/components/app/forms/AiCreate.tsx`, `FormHome.tsx` |
| The once-only summary | `FormsView.tsx` |
| Tests | `tests/formAiBuild.test.ts`, `tests/formHtml.test.ts` |

Removed: the gallery screen and the 24 templates (`FormGallery.tsx`, `gallery.ts`). The AI bar and MCP keep the
older starting points for "replace the whole form".

Not built yet: generated pictures (sections use the site's own pictures, or none), icons drawn for picture cards,
and a streamed progress line from the server (the screen shows steps on a timer).

## Running cost

Per form built, with Claude Sonnet 5.5 at $2 in and $10 out per million tokens:

| Step | Tokens | Cost |
|---|---|---|
| Brief: about 20,000 in, 800 out | | $0.05 |
| Questions: about 2,000 in, 500 out | | $0.01 |
| Build: about 6,000 in, 10,000 out; a fix round adds about the same | | $0.11 to $0.33 |
| **A form** | | **about $0.20, up to $0.40** |

The system prompt is cached, and the same inputs replay from the step cache at no cost.

| | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Claude, 10 forms a team a month at $0.30 | $150 | $1,500 |
| Server time reading sites (existing machines) | $0 | $0 |
| **Added monthly** | **about $150** | **about $1,500** |

Builds can be limited per plan (for example 3 a month on Free) to hold this.
