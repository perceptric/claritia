# Fields plan: every field a form can ask

Goal: the Add list in Form Studio holds every field people use on Typeform, Tally, Jotform, Fillout and Google Forms,
plus the ones only a forms-to-meetings product needs. Each field works the same in five places: the Add list (and
the "/" menu), the form script on live sites, the fills table and exports, integrations and workflows, and Tia.

## What's there now

The Add list has 21 types in five groups (`QGROUPS` in `src/lib/studio/builder.ts`): Short answer, Long answer,
Email, Phone number, Address, Multiple choice, Checkboxes, Dropdown, Yes / No, Ranking, Rating, Opinion scale,
Number, Payment, Date picker, Time picker, File upload, Signature, Heading, Paragraph, Divider.

The form script already runs more blocks than the Add list shows (`BLOCKS` in `src/lib/studio/page.ts`): Date range,
Country, Calculation, Result (score, meter, summary, outcome), Grid (matrix) and Hidden field. Tia and templates use
them; people can't add them by hand yet.

## Built: 40 fields in the Add list

Contact: Short answer, Long answer, Email, Phone number, Full name, Company, Job title, Website, Address, Country,
Date of birth. Choices: Multiple choice, Checkboxes, Dropdown, Yes / No, Ranking, Matrix, Likert scale, Agreement.
Ratings and numbers: Rating, Opinion scale, Net Promoter Score (0 to 10 with words at each end), Slider, Number,
Currency, Percentage, Payment. Date, time and files: Date picker, Time picker, Date and time, Month, Date range, File
upload, Image upload, Signature. Advanced: Color picker, Hidden field. Display: Heading, Paragraph, Divider. Full name,
Company, Job title, Website and Country save to the contact the first time they're on a form. The rest of Part 1 and
Part 2 below is next.

## Part 1. Show what already runs (code only)

Add these to the Add list with their settings panels: Date range, Country, Matrix (one answer or many per row),
Calculation, Score result, Hidden field (it already lives in Form settings), Website, Full name (first and last),
Consent checkbox, Image, Video embed.

## Part 2. New fields with no outside service (code only)

| Group | Fields |
|---|---|
| Contact | Full name, Company, Job title, Website, Language, Time zone, Birthday, Social profile link |
| Text and numbers | Currency amount, Percentage, Slider, Range slider (min and max), Pattern input (ZIP, ID numbers, with a format), Rich text answer, Number with unit |
| Choices | Picture choice (options with images), Multi-select dropdown, Searchable long list (up to 10,000 options, pasted or uploaded as CSV), Dependent dropdown (country then state, make then model), Toggle, Terms checkbox with a link, Color picker |
| Ratings | Net Promoter Score (0 to 10 with labels), Likert (Strongly disagree to Strongly agree), Smiley scale (drawn faces, no emoji), Thumbs up or down, Constant sum (spread 100 points), Semantic scale (two opposite words) |
| Date and time | Date and time, Month and year, Duration, Availability grid (pick the hours that work, like a group poll) |
| Files and drawing | Image upload with crop, Camera photo (on phones), Drawing |
| Quiz | Question with a right answer and points, Timer for a page, Answer review at the end |
| Structure | Section (a group with its own show-if), Repeating group (Add another: guests, kids, vehicles), Table input (rows and columns to fill), Review page before sending, Progress bar, Image, Video embed, Spam check (Cloudflare Turnstile) |
| Workspace | Meeting type picker, Team member picker, Location picker (from Meetings › Locations) |

Conditions and routing learn the new answers: dates get "is before", "is after" and "is within N days"; ranges and
sums get number rules; picture choices work like choices.

## Part 3. Fields that use an outside service

| Field | Service | Why |
|---|---|---|
| Address autocomplete | Mapbox Search (check) | Type a few letters, pick the address; it fills street, city, ZIP and country |
| Map pin | MapLibre with Mapbox tiles (check) | Drop a pin for a job site, delivery or event spot |
| Current location | The browser's own location | One tap on phones; no service |
| Email code | Resend (already paid) | Sends a 6-digit code to prove the email is real before the form sends |
| SMS code | Twilio Verify (check) | The same for phone numbers; an add-on teams turn on |
| Audio and video answer | Supabase Storage | Record a short answer in the browser, up to 2 minutes |
| Product picker with quantity, coupon, donation amounts, tips | Stripe (already wired for Payment) | Order forms and donations; fees are the team's own Stripe fees |

## How each field is built

1. `QGROUPS` and `questionHtml` in `builder.ts` write it in the page's own classes.
2. The form script draws it. New fields load as their own small files only on forms that use them, so `v1.js`
   stays under its 41 KB size check (`scripts/build-forms.mts`). Phone formatting and long lists load the same way.
3. The Studio panel gets its settings (required, limits, options, format), with professional labels.
4. Fills table, CSV export, integrations and workflow fields get its answer in a plain shape (text, number, list,
   file link, or a small object for address and name).
5. Tia's prompt lists it with one example, inside the cached part of the prompt.
6. Tests: `tests/studioBuilder.test.ts` reads each one back; `scripts/studio-check.ts` adds it, fills it on the live
   form, and checks a flaky case (slow upload, lost network, an address service that times out falls back to plain
   inputs).

## Build order

1. Part 1 (about 3 days): the blocks that already run.
2. Part 2 Contact, Choices and Ratings (about 1 week).
3. Part 2 Date and time, Structure and Quiz (about 1 week). Repeating group and Review page come with fills table
   support for lists.
4. Part 3 Address autocomplete, Map pin and Current location (about 4 days).
5. Part 3 Email code and SMS code (about 3 days).
6. Part 3 Audio and video, then the order fields (about 1 week).

## Monthly cost

Assumptions per team a month: 300 fills and 1,000 form views. Address autocomplete on 30% of teams, about 4
lookups per fill. Map pin on 10% of teams. Email code on 10% of teams. SMS code on 5% of teams. Audio or video on
5% of teams, 100 recordings of 20 MB.

| Line | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Part 1 and Part 2 fields: code only | $0 | $0 |
| Spam check: Cloudflare Turnstile, free (check) | $0 | $0 |
| Address autocomplete: Mapbox, 100,000 requests a month free, then about $0.75 per 1,000 (check). About 18,000 and 180,000 requests | $0 | about $60 (check) |
| Map pin: Mapbox, 50,000 map loads a month free, then about $5 per 1,000 (check). About 5,000 and 50,000 loads | $0 | $0 (check) |
| Email code: inside the Resend volume already planned. About 1,500 and 15,000 emails | $0 | $0 to $15 (check) |
| SMS code: Twilio Verify, about $0.05 a check plus about $0.008 a text in the US (check). About 750 and 7,500 checks | about $45 (check) | about $435 (check) |
| Audio and video storage: Supabase, 100 GB included, then about $0.021 a GB, plus downloads at about $0.09 a GB (check). About 5 GB and 50 GB more a month | $0 | about $20 (check) |
| Tia knowing the new fields: about 1,500 more prompt tokens, read from the prompt cache (check) | about $2 | about $20 |
| **Added per month** | **about $47** | **about $550** |

Without SMS code (or with SMS code sold as a paid add-on), the added cost is about $2 at Beta and about $115 at
Growth.
