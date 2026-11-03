# Brand skin: forms that look like the site

A brand kit's colors and font only go so far. Many sites draw their controls with layers and states that tokens can't
describe: Duolingo's button is a `::before` layer with a 4px bottom shadow that drops when pressed, its inputs get their
box from a wrapper, its labels are small all-caps text, and its font is its own. The skin copies all of that.

1. **Read in a browser** (`src/lib/brand/skinCapture.ts`, during the runner's brand scan). On the home page, then on
   pages likely to hold a form (sign up, contact, demo, log in, then the usual addresses) until one with an input is
   found, the browser reads the site's primary and secondary buttons, an input, a checkbox, a choice card, a heading,
   body text and a label: computed styles, the layer or wrapper that draws each one's box, the changes on hover,
   pressed and focus, and a picture of each. Fonts come from the page's stylesheets and from scripts (FontFace).
2. **Written by Claude** (`src/lib/brand/skin.ts`): one stylesheet for the form's own parts (`MARKUP`), copying the
   measured values and how each control is drawn. Cleaned before it's kept: no url(), imports, @font-face, escapes or
   unknown at-rules, balanced braces, at most 40 KB. It can only style the form, which sits in its own shadow root.
3. **Saved on the kit** (`brand_kits.skin`, migration 111) with the font files it uses. The fonts are served from
   Claritia (`/api/brand/fontfile/<kit>/<n>`, only files the skin lists), since most sites don't let other sites load
   theirs.
4. **Worn everywhere**: the live form (`form_public` returns the skin), New form's preview and the builder's Preview.
   The form script puts the font rules in the page's head and the stylesheet after its own styles.

The runner needs `ANTHROPIC_API_KEY` to write skins. A kit made before this gets its skin from Read again.

Fonts are copied for the site you use as your own brand. A site's paid font may be licensed only for that site.

## Running cost

One Claude Sonnet call with the parts' pictures per site read (about 15k tokens in, 3k out: about $0.06), cached per
look. The browser pass adds about a minute on the runner already running. Font files are served from the web server.

| Item | Beta (50 teams) | Growth (500 teams) |
| --- | --- | --- |
| Claude, about 2 site reads a team a month | about $6 | about $60 |
| Runner and web server | $0 | $0 |
| **Added** | **about $6** | **about $60** |
