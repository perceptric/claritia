# @claritia/embed

Claritia's forms and meeting calendars on any site, with a script loader, `window.Claritia`, and React components.

```bash
npm install @claritia/embed
```

```js
import { open, prefill, on } from "@claritia/embed";

on("submitted", (d) => console.log("sent", d.submissionId));
prefill({ email: "dana@acme.com" });
open("FORM_ID"); // a form over the page
open("acme/demo"); // a meeting's calendar
```

```jsx
import { ClaritiaForm, ClaritiaBook } from "@claritia/embed/react";

<ClaritiaForm id="FORM_ID" />                                            // in the page
<ClaritiaForm id="FORM_ID" mode="popup" size="l" buttonText="Talk to us" />
<ClaritiaForm id="FORM_ID" mode="slider" side="left" opens={10} once />
<ClaritiaForm id="FORM_ID" mode="popover" icon="chat" note="Questions?" onSubmitted={(d) => …} />
<ClaritiaForm id="FORM_ID" mode="sidetab" text="Contact us" />
<ClaritiaBook type="acme/demo" mode="button" text="Book a demo" onBooked={(d) => …} />
```

Events: `ready`, `step`, `open`, `close`, `submitted`, `booked`, as `on(name, fn)` or `onReady`, `onStep`… props.
Over the page on a phone, forms and calendars fill the screen; `phoneFull={false}` keeps the box.

Full reference: https://tryclaritia.com/developers/embed
