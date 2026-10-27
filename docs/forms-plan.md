# Forms: the next build

Status: proposed, October 2026. Built on `main` at `6c78dcc`.

Forms already go from a fill to a lead, a qualify, a route and a booked meeting (`docs/form-builder.md`,
`docs/form-builder-v2.md`, `docs/form-studio.md`). This plan closes the gaps found in a side-by-side check against
FormAssembly. It keeps the same rule as the rest of the product: a form that loses or mangles a lead is worse than a
form that lacks a feature. So every part ships with tests on the flaky case, and every new field type passes the one
checker in `src/lib/forms/schema.ts` before it can go live.

## What's there now

| Area | Where |
|---|---|
| Schema and checker: 15 field types, 4 content blocks, rules (`is`, `is_not`, `filled`, `empty`), All/Any per field, step skips | `src/lib/forms/schema.ts` |
| The `<claritia-form>` element: steps, own listbox (no `<select>`), popup, retry queue in `localStorage` for 24 hours | `src/lib/forms/element.ts` |
| Server check of every fill, contact upsert, consent, deliveries through the jobs queue | `src/lib/forms/submit.ts`, `supabase/migrations/045_form_builder.sql` |
| Views and starts per form and day | `form_daily`, `form_seen` in `supabase/migrations/070_reports.sql` |
| Results tab: latest 100 fills, Leads, Tests and Spam, replay | `src/components/app/forms/FormFills.tsx` |
| CRM fields read live for the Data tab | `src/app/api/forms/crm-fields/route.ts`, `src/lib/sources/properties.ts` |

## What's missing

| Gap | Part |
|---|---|
| Results stop at 100 fills, with no search, columns or full-answer export | 1 |
| No numbers per field: where people stop, which checks fail, slow questions | 1 |
| Rules only compare equal or empty; no numbers, dates or text matches; no nested groups | 2 |
| No dependent dropdowns (country to region, industry to type) | 2 |
| No calculated fields (quotes, ROI, scores) | 2 |
| No file uploads | 3 |
| No save and resume for a half-filled form | 3 |
| No repeatable sections ("Add another location") | 3 |
| No review screen before the final send | 3 |
| No form languages beyond the default | 4 |
| No open and close dates or fill limits | 4 |
| No prefill of a known contact from a signed link; no dropdown options taken from the CRM | 5 |

Documents, signatures, approvals, payments, Salesforce custom objects, import from a file and offline use come later
(Part 6).

---

## Part 1. Results you can work with

### 1.1 The fills table

- **Pages.** Keyset pages of 50 on `(created_at, id)`, so a form with 100,000 fills loads as fast as one with 10. The
  count at the top comes from one `count` query, cached for a minute.
- **Search.** One box searches every answer, the email and the contact's name. A generated `tsvector` column on
  `submissions` (from `values` and `hidden`, `simple` config) with a GIN index. Filters next to it: date range,
  destination status (Sent, Failed, Waiting), booked or not, and any choice field's value.
- **Columns.** The person picks which fields show, and in what order, with the app's `Select` in a column menu. The
  set is saved on the form (`forms.results_columns text[]`), so the whole team sees the same table. Old fills from an
  older version show the label from their own version (`form_versions`), as today.
- **Bulk.** Select many to replay deliveries, mark as spam or not spam, or delete (with the app's confirm dialog).
- **Export.** "Export answers" writes a CSV of every answer for the filtered set. Up to 5,000 rows it streams right
  away. Above that it runs as a job (`src/lib/jobs.ts`), writes to the private `exports` bucket and shows a link that
  works for 24 hours. One column per field across all versions, named by label, with the field id in a second header
  row for re-imports.

### 1.2 Numbers per field

The element already sends `view` and `start` beacons. It adds one more: a short summary when the visitor leaves the
page or sends the form.

- **What it sends:** form id, version, visitor id, and for each field it touched: reached, answered, error count and
  time spent. Plus the last field touched and the last step reached. Never the answers.
- **How:** `navigator.sendBeacon` on `visibilitychange` to hidden and on submit, once per session. A lost beacon
  changes no fill, because it sits on its own route (`/api/forms/[id]/seen`, extended) and the submit path never waits
  on it.
- **Stored as:** `form_field_daily (form_id, version, field_id, day, reached, answered, errors, ms_sum, left_here)`,
  rolled up in the same RPC as `form_seen`, with the same bot filter and rate limit. Kept 13 months.
- **The screen:** Results gets two views, Fills and Fields. Fields lists each question in form order with a bar from
  reached to answered, the error rate, the median time and a `Badge` on the field where most people stop. A step
  funnel sits on top for forms with steps. The date range matches the Forms report.
- **Reports:** the Forms report (`src/components/app/reports/Report.tsx`) gets a "Drop-off" column that opens this
  view.

### 1.3 Tests

- A form with 3 steps, 200 simulated sessions with lost beacons, double beacons and beacons that arrive after the
  fill: counts match the sessions that got through, and every fill is still saved once.
- Search finds a fill by an answer in a field that a later version removed.
- Export of 20,000 fills across 3 versions: every row once, labels right for each version.

---

## Part 2. A stronger form engine

### 2.1 Richer conditions

- New ops in `Rule["when"]`: `contains`, `not_contains`, `starts_with`, `ends_with`, `gt`, `gte`, `lt`, `lte`,
  `between`, `before`, `after`, `within_days`, `any_of`, `none_of`. Number ops work on numbers, ratings and calculated
  fields. Date ops work on dates.
- **Groups.** A rule can hold a group of conditions with its own All or Any, one level deep. That covers "country is
  US and (size over 50 or budget over 10k)" without a full logic tree.
- Step skips and meeting qualification use the same `whenHits`, so one function decides everywhere. The server's
  `checkAnswers` (`src/lib/forms/values.ts`) runs it again, so a field the browser hid can't be forced in.
- The rule editor in `Inspector.tsx` shows only the ops that fit the field's type.

### 2.2 Dependent dropdowns

- A choice or dropdown field can take `optionsBy: { field, map }`: for each value of a parent field, its own list.
  A built-in `country` to `region` list ships with the element (ISO 3166-2 for the 20 countries asked for most,
  loaded only when the form uses it).
- When the parent changes, the child's answer clears. The checker fails a map key that isn't one of the parent's
  values, and the server rejects a child answer that isn't in the list for the parent's answer.

### 2.3 Calculated fields

- New field type `calc` with a formula: numbers, `+ - * /`, `min`, `max`, `round`, `if`, and other fields by id.
  Choices can carry a number (`Choice.score`) so a formula can add up picks.
- Our own small parser in `src/lib/forms/formula.ts`. No `eval` and no `Function`. Formulas are checked on save for
  unknown fields, loops and division by zero.
- Shown as a read-only value (number, money or percent) and saved like any other answer. **The server works it out
  again from the answers and keeps its own result.** A value sent by the browser is ignored.
- Rules can read a calc field, so "show the booking step when the quote is over $5,000" works.

### 2.4 Chat, MCP and templates

- New ops in `src/lib/forms/ops.ts` and tools in `src/lib/forms/mcp.ts` for each new type and condition, all
  checked by `checkForm`.
- Templates get one each: Quote request uses a calc total; Partner uses country to region.

### 2.5 Tests

- A property test: 10,000 random forms and answers, the browser's rule result and the server's match every time.
- Calc fields: a tampered browser total is replaced by the server's; a formula that divides by an empty field gives
  an empty answer and no crash.
- A child answer from the wrong parent list is rejected with the field's own error.

---

## Part 3. More kinds of intake

### 3.1 File uploads

- New field type `file` with `valid: { types, maxMb, count }`. Defaults: PDF, images, Office files and CSV; 10 MB; one
  file. Hard limits: 25 MB and 5 files.
- **Flow.** The element asks `/api/forms/[id]/upload` for a signed upload address, sends the file straight to the
  private `form-files` bucket under `<workspace>/<form>/<upload id>`, and puts the upload id in the answer. On submit
  the server checks the id belongs to this form, is unclaimed, and that the stored file's real type (its first bytes)
  and size pass the field's checks. Then it links the file to the submission in the same transaction.
- **Scanning.** A job runs ClamAV on the worker (`claritia-intel`). Until it's clean, the file shows "Checking" in
  Results and goes to no destination. A file that fails is deleted and the fill gets a note.
- **Delivery.** Destinations get a signed link that works for 7 days (HubSpot and Salesforce in a text property,
  Slack and webhooks in the message). Results downloads through a fresh signed link each time.
- **Clean-up.** Uploads with no fill after 24 hours are deleted. A workspace setting deletes files after 30, 90 or 365
  days (default 365).
- Uploads have their own rate limit per address and per form.

### 3.2 Save and resume

A form setting with two choices:

- **This device.** Answers are kept in `localStorage` for that form for 30 days and filled back in on the next visit.
  Nothing goes to the server until the visitor sends the form. This is the default for forms with steps.
- **By email.** A "Finish later" button shows once the email is filled. The server saves the answers in
  `form_drafts` (form, version, answers, email, a hashed token, expires in 30 days) and sends a link through Resend
  (`docs/sending-setup.md`). The link opens the form with the answers filled in.
- If the form was published again in between, answers carry over for fields that still exist by id, and the rest
  drop.
- A draft is never a lead. The partial-lead rule stays as it is today: email first, and the form decides when an
  early email counts.

### 3.3 Repeatable sections

- New block `group` holding up to 10 fields, with `repeat: { min, max, add }` ("Add another location"). Up to 20 rows.
  Groups can't hold groups.
- Answers save as a list of rows on the submission. Webhooks get the rows as JSON. CRMs get the first row on mapped
  fields and all rows as one text field. A Results cell shows "3 rows" and opens them.
- Rules can read a group's row count. Rules inside a group read fields in the same row.

### 3.4 Review before sending

- A form setting adds a last step that lists every answer by step, each with an Edit link back to its step. The send
  button sits under it. Built from the form, so it never drifts.

### 3.5 Tests

- Uploads: the same upload id used in two fills is taken once; a file renamed from `.exe` to `.pdf` is rejected; a
  scan that times out retries and never sends an unchecked file.
- The submit path with a slow storage check still saves the fill first and retries the link.
- Resume: a draft from version 3 opened on version 5 keeps only the fields that remain; an expired token gets the
  form empty with no error page.
- Repeatable rows: 20 rows with one bad answer in row 14 points at row 14.

---

## Part 4. Languages and availability

### 4.1 Languages

- A form has a default language and up to 10 more. Every string a visitor sees has a key (field id plus part).
  Translations live in `form.locales[lang][key]`, and a missing one falls back to the default.
- **Which language shows:** the embed's `lang` attribute, then `?lang=`, then the page's `<html lang>`, then the
  browser. The hosted link gets a language switch.
- **Built-in words** (Next, Back, Required, error messages, the booking step) ship as small packs for 12 languages,
  loaded only when used.
- **Translate.** One button per language writes the first draft with Claude Sonnet through the step cache, keyed by
  the string's text, so only new or changed strings cost anything. Every string can be edited by hand. AI drafts get
  `AiTag` until someone saves them.
- **Consent** shows in the visitor's language, and the submission records the exact words shown in that language.
- Results and exports show the language of each fill.

### 4.2 Open, close and limits

- Form settings: opens at, closes at (with the workspace's time zone) and a fill limit. A closed form shows its
  closed message, which can be edited and translated.
- The limit counts fills that are neither tests nor spam. It's checked inside the submit transaction with a row lock
  on the form, so two fills at the same moment can't go over. A repeat of the same idem key counts once.
- The forms list shows Scheduled, Live, Closed or Full as a `Badge`.

### 4.3 Tests

- 50 fills sent at once on a form with a limit of 10: exactly 10 saved, and 40 get the closed message.
- A form that closes at midnight in Tokyo takes a fill at 23:59:59 and turns one away at 00:00:01.
- Every built-in pack has every key; the checker fails a form whose translation holds HTML.

---

## Part 5. Prefill and options from the CRM

- **Known contacts.** Claritia emails and the API can make a signed link per contact (`?c=<token>`, HMAC, 30 days).
  The form reads only the fields it shows, for that contact, from Claritia's record. A plain `?email=` never fills in
  anything beyond the email, so a guessed address can't show someone's data.
- **Options from the CRM.** A choice or dropdown can take its list from a CRM picklist (HubSpot or Salesforce, read
  through `src/lib/sources/properties.ts`). The list is copied when the form is published and refreshed daily by a
  job, so a visitor's page never waits on the CRM. If a refresh fails, the last good list stays and the form's
  checks show the error.
- **Salesforce.** The Data tab reads Accounts and Opportunities as well as Leads and Contacts, for mapping only.

### Tests

- A tampered or expired token fills in nothing and the form still works.
- A CRM picklist refresh that fails three days in a row keeps the old list and raises one alert.

---

## Part 6. Later, when customers ask

| Feature | Note |
|---|---|
| Saved sections | Save a block of fields (address, qualify questions) and add it to any form. Templates already cover whole forms |
| Document from answers | A branded PDF (brief, quote) made on the worker after the fill |
| Signatures | A sign step, likely through a signing service; price to check when it's planned |
| Approvals | Approve or reject a fill with a comment, as a workflow step (`src/lib/workflows/types.ts`) |
| Payments | Reuse the Stripe code from paid meetings for a pay step with a calc total |
| Salesforce objects | Create or update any object and its related records from one fill |
| Form from a file | Turn a PDF, screenshot or sheet into a draft form with Claude Sonnet and the checker |
| Offline | A saved copy of the form that sends when back online; low fit for website leads |

---

## Build order

| Step | What | Days |
|---|---|---|
| 1 | Results: pages, search, columns, bulk, full-answer export | 4 |
| 2 | Field beacon, `form_field_daily`, the Fields view, Drop-off in the Forms report | 4 |
| 3 | Richer conditions and groups, with the property test | 3 |
| 4 | Dependent dropdowns and the region lists | 2 |
| 5 | Calculated fields: parser, server work-out, editor | 3 |
| 6 | Chat ops, MCP tools and two templates for steps 3 to 5 | 1 |
| 7 | File uploads: bucket, signed uploads, scan job, delivery links, clean-up | 5 |
| 8 | Save and resume, both modes | 3 |
| 9 | Repeatable sections | 3 |
| 10 | Review before sending | 1 |
| 11 | Languages: keys, packs, the Translate button, consent per language | 5 |
| 12 | Open, close and fill limits | 2 |
| 13 | Signed prefill links and CRM picklists | 4 |
| 14 | End-to-end browser checks for each part in `scripts/screens-check.ts`, then deploy | 3 |
| | **Total** | **About 43 working days** |

Steps 1 to 6 are the first release (about 17 days). They need no new paid service.

## Monthly cost

Assumptions per team a month: 6 live forms, 3,000 form views, 300 fills, 60 uploaded files of 2 MB, 20 resume
emails, 2 extra languages on 2 forms, published 3 times each.

| Line | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Field beacons and `form_field_daily`: database writes, inside the current plan; about 1 million rows a year at Growth | $0 | $0 |
| Search index on submissions: a few hundred MB at Growth | $0 | $0 |
| Exports bucket: files kept 24 hours | $0 | $0 |
| Calc, conditions and dropdowns: code only | $0 | $0 |
| File storage on Supabase: 100 GB included, then about $0.021 a GB (check). Beta holds about 70 GB after a year; Growth about 700 GB | $0 | $13 (check) |
| File downloads: about 30% of files opened, at about $0.09 a GB past the included amount (check) | $0 | $2 (check) |
| ClamAV scans on the worker: fits on the current machine at Beta; one more small machine at Growth | $0 | $30 (check) |
| Resume emails: inside the Resend volume already planned | $0 added | $0 added |
| Translation: Claude Sonnet at $2 and $10 a million tokens in and out (`src/lib/ai/cache.ts`, check). About 1,500 in and 1,500 out per language and publish, about half replayed from cache. About $0.20 a team | $10 | $100 |
| CRM picklist refresh: one daily job per linked list, inside CRM rate limits | $0 | $0 |
| Database growth from all of the above | $0 (inside plan) | $25 (check, if a larger database is needed) |
| **Added per month** | **about $10** | **about $170** |

Step 1 to 6 alone add $0 at Beta and $0 to $25 at Growth.
