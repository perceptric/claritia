# Claritia on your site, for developers

One script puts Claritia's forms and meeting calendars on any site. The Share tab writes the code for each way;
this is what's under it, for code of your own. The same page is at https://tryclaritia.com/developers/embed
(`src/app/developers/embed/page.tsx`).

## The script

```html
<script src="https://app.tryclaritia.com/forms/v1.js" async></script>
```

### Forms

```html
<claritia-form form-id="FORM_ID"></claritia-form>
```

| Attribute | What it does |
|---|---|
| `full` | Fills the page |
| `popup="click\|delay:10\|exit"` | Over the page: opened by `<button data-claritia-open="FORM_ID">`, after N seconds, or when the visitor moves to leave |
| `size="s\|m\|l"` | The popup's width |
| `slider="left\|right"` | Full height from that side (with `popup` for how it opens) |
| `popover` `icon="chat\|calendar\|form\|logo"` `note="…"` | A round button in the corner opens it above |
| `side-tab="Contact us"` | A tab on the right edge opens it |
| `once` | A timed or exit popup doesn't open by itself again for someone who sent it |
| `mobile="keep"` | Over the page on a phone it keeps its box (it fills the screen by default) |

### Meeting calendars

```html
<claritia-book type="WORKSPACE/MEETING"></claritia-book>
<claritia-book type="WORKSPACE/MEETING" mode="button" text="Book a demo"></claritia-book>
<a href="#" data-claritia-book="WORKSPACE/MEETING">Book a demo</a>
```

## window.Claritia

```js
Claritia.open("FORM_ID", { prefill: { email: "dana@acme.com" }, size: "l" }); // a form over the page
Claritia.open("WORKSPACE/MEETING");                                          // a meeting's calendar
Claritia.close();                                                            // or close("FORM_ID")
Claritia.prefill({ email: "dana@acme.com", company: "Acme" });               // or prefill(values, "FORM_ID")
const off = Claritia.on("submitted", (d) => console.log(d.submissionId));
```

`open` with a form that's in the page (not over it) makes a popup for the call. `prefill` takes question keys
(`email`, `company`, a custom field's name, a question's own name) and only one of a list's answers; it waits for the
form to load. Calls made before the script loads run once it's there:

```html
<script>window.Claritia = window.Claritia || { q: [] }; Claritia.q.push(["prefill", { email: "dana@acme.com" }]);</script>
```

### Events

Each bubbles from its element to the document as `claritia:<name>`, with `detail`:

| Event | detail |
|---|---|
| `ready` | `formId` |
| `step` | `formId`, `step` (from 0), `of` |
| `open`, `close` | `formId` |
| `submitted` | `formId`, `submissionId` |
| `booked` | `formId` (a form's calendar) or none (a meeting's), `start`, `end` |

## npm: @claritia/embed

```bash
npm install @claritia/embed
```

```js
import { open, prefill, on } from "@claritia/embed";
on("submitted", (d) => analytics.track("Form sent", d));
open("FORM_ID");
```

```jsx
import { ClaritiaForm, ClaritiaBook } from "@claritia/embed/react";

<ClaritiaForm id="FORM_ID" mode="popover" icon="chat" note="Questions?" onSubmitted={(d) => …} />
<ClaritiaForm id="FORM_ID" mode="popup" size="l" buttonText="Talk to us" />
<ClaritiaBook type="WORKSPACE/MEETING" mode="button" text="Book a demo" onBooked={(d) => …} />
```

The package loads the same script once and writes the same attributes as the Share tab (`packages/embed`). It works
in Next.js (the components are client components) and with any bundler. `host` points it at another Claritia address.

## Tests

`tests/shareEmbed.test.ts` checks the package writes what Share writes. `scripts/embed-check.ts` runs the API, the
events, the queue and the React components in Chromium with the real script.

## Monthly cost

| Stage | Added per month |
|---|---|
| Beta (50 teams) | $0 |
| Growth (500 teams) | $0 |

The same script; the npm package is free to publish. No Claude calls.
