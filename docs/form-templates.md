# Form templates and styles

A gallery of 150 ready forms for 24 industries, each in one of 18 styles, like a template gallery on a forms site. It
lives on the website (tryclaritia.com/templates, `dev-arrowsterr/claritia-site`) and in the app (Forms › Templates).

## In the app

- **Forms › Templates** (`src/components/app/forms/templates/TemplatesPage.tsx`, `/forms/templates`): industries on
  the side, search and use cases on top, a card per template drawn in its style. A card opens the real form (the
  `<claritia-form>` preview) in a sheet with a row of the 18 styles. **Use template** makes a draft and opens it in the
  builder.
- The website links to `/forms/templates/<template>?theme=<style>`, so the style picked there is the one used.
- **Use template** (`/api/forms/templates`): the template becomes a saved form (`src/lib/forms/gallery/convert.ts`),
  checked by `checkForm` before it's made. The style becomes a brand kit named "<Style> style" (noted `style:<id>`),
  made once per workspace and reused, with `fixContrast` on its colors. Styles with a drawing put it beside the form
  (`layout.side`, served from `public/form-art`).
- Templates are data in `src/lib/forms/gallery/templates`, written with the short builders in `build.ts`. Each
  template's style comes from its industry, in turn, so neighbors differ (`catalog.ts`, `themes.ts`).

## The website

`node scripts/export-templates.ts > ../claritia-site/tools/templates.json`, then `python3 tools/templates.py` in the
site repo. The site's pages are static: the gallery, a page per industry and a page per template with the live form,
a style menu, question types, steps, questions and related templates.

## Not carried into the app yet

Quiz score bands (the points are kept on each choice; the end screen lists the bands as text), and the card-on-a-page
look of some styles (the app's forms take the style's colors, fonts, corners and drawing).

## Tests

`tests/formGallery.test.ts`: all 150 templates pass `checkForm` in their own style and the demo request in all 18,
show-if logic runs in `visibility`, question kinds map to the app's types, every style passes `cleanTokens` whole and
its drawing is served, and neighbors in an industry never share a style.

## Running cost

| Item | Beta (50 teams) | Growth (500 teams) |
| --- | --- | --- |
| Templates and styles: data in the app, static pages on the website | $0 | $0 |
| Style fonts: Google Fonts | $0 | $0 |
| Use template: no AI call, one brand kit per style used | $0 | $0 |
| **Total** | **$0** | **$0** |
