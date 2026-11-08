# Forms with pictures and screens: the plan

Status: plan. 7 November 2026. Builds on `docs/studio-v2-plan.md` (the Form Studio), `docs/interactive-forms-plan.md`
(screens, picture cards and results in the older builder), `docs/form-templates.md` and `docs/embed.md`.

**The goal:** a Claritia form can look and feel like the best Fillout forms. It opens on a welcome screen with a
real photo beside the title. It can ask one question at a time, full height, with big type, keyboard keys and smooth
motion. Choices can be pictures. Pages and the end screen can carry a photo or a video. It goes on any site with
settings as simple as Fillout's: type, auto height, width, a desktop and phone preview, and Get the code.

**The rule that stays:** the form fills its whole box (built on 7 November). A photo is part of the form, as one
half of the box, a band across its top or the whole box behind the questions. It's never a colored stage around a
floating card.

---

## Part 1. Where Claritia stands next to Fillout

| Fillout has | Claritia today | Gap |
|---|---|---|
| Welcome screen with a photo beside it (left, right, top or behind) | Studio pages have no welcome screen; the older builder's cover picture is dropped when a form moves to the Studio (`fromForm.ts`) | Build |
| One question per screen, Enter to go on, letter keys, auto-advance, slide motion | Studio steps show one page at a time; the full-height one-question look lives only in the older builder (`element.ts`, `layout.mode: "screens"`) | Bring to Studio pages |
| A photo or video on any page, with a layout per page | `image` and `video` blocks exist; no page layouts | Build |
| Picture choice | `pictures` block exists, any https picture | Upgrade: sizes, columns, upload |
| End screens with a photo, a result or a redirect | Thank-you, results, booking and redirect exist; no photo | Small |
| A picture library: upload, stock photos, brand pictures | Logo only. Tia is told "no images other than the logo" (`prompts.ts`) | Build |
| Embed types: standard, popup, slider, full screen, popover, side tab | All six built (`src/lib/share/embed.ts`, Share › Website) | None |
| Auto-resize height | Built by default (the form is a web component, not an iframe, so it always fits) | Add the switch and a fixed height |
| Width in % or px | px only | Add % |
| Desktop and phone preview | One live preview | Add the switch |
| React library | Built (`packages/embed`) | Link it from Share |

So the work is pictures, the welcome screen, one question at a time in the Studio, page layouts and a few Share
settings. The embed itself is already there.

---

## Part 2. The picture library

Every workspace gets a library of pictures that any form can use.

| Source | How it works |
|---|---|
| Upload | Drag in JPG, PNG, WebP or GIF up to 10 MB. Checked by its bytes, like form uploads (`src/lib/forms/files.ts`). SVG is refused (it can carry script). |
| From your site | The brand scan already reads the website. It now also keeps the site's large photos (hero, team, product), at most 24, with the page they came from. |
| Stock photos | Search Pexels from the picker. A picked photo is copied into the library, so the form never links to Pexels. |
| Video | A YouTube, Vimeo or Loom link, as the `video` block reads today. |

**Storage:** a public storage bucket on the VPS, `form-media`, one folder per workspace. On upload the worker makes
three sizes (640, 1280, 1920 wide) in WebP with sharp, and keeps the original. Forms use `srcset`, so a phone loads
the small one. Pictures are cached for a year by their content hash, so a changed picture is a new address.

**Safety:**
- A form may only show pictures from the `form-media` host. The page cleaner (`cleanPageCss`, `page.ts`) refuses any
  other picture address in HTML or CSS, so a page can't load trackers or someone else's files.
- Every picture needs words for screen readers. The form check (`src/lib/studio/check.ts`) stops Publish when a
  picture that isn't decoration has none. Tia writes them; people can change them.
- A picture that fails to load leaves the form working: its box keeps the form's color and the questions still show.
- Delete works on every picture (with `askConfirm`). A picture a live form still uses says which forms first.

**Screens:** Settings › Brand gets a Pictures tab with the library as a grid (search, upload, delete, several at once).
The Studio opens the same library in a picker wherever a picture goes. No new sidebar item.

---

## Part 3. The welcome screen

A Studio page can start with a welcome screen: the logo, a title, a line or two, and a Start button.

**Layouts:**

| Layout | Desktop | Phone |
|---|---|---|
| Photo left / photo right | The box splits in two; the photo fills one half edge to edge | Photo on top, 40% of the height |
| Photo on top | A band across the top of the box | Same, shorter |
| Photo behind | The photo fills the box; the words sit on it with a shade picked so they read (checked for contrast) | Same |
| No photo | Words only | Same |

The words and the button take the style's colors. The photo is cropped by a focus point people set with one click on
the picture, so a face stays in view at every size.

In the page's HTML it's `<section data-cl-cover data-cl-media="ID" data-cl-layout="left">`. The form script and the
Studio draw it from those; the cleaner checks the ID against the workspace's library.

---

## Part 4. One question at a time

A switch in the Studio's Layout settings: **One question at a time**. Each question gets its own screen, full height,
with big type. This brings the older builder's Screens to Studio pages.

| Piece | How it works |
|---|---|
| Moving on | OK button under each answer; Enter goes on (Shift+Enter makes a new line in long text) |
| Choices | Letter keys (A, B, C) pick; a single pick moves on by itself after 300 ms |
| Back | An arrow in the corner and the browser's Back key |
| Progress | A thin bar at the top, from the style |
| Motion | The next question slides up with the brand's normal speed; none under reduced motion |
| Pages with a layout | A question can carry its own photo (Part 5) |
| Show-if and jumps | Run between screens as they do between pages today |
| Prefilled answers | Skipped, with Back still able to reach them |

**In an embed:** one question at a time wants a steady height. The Share code gives it a fixed height (600 by
default) instead of growing with each screen, so the site's page doesn't jump.

**Reliability (the send pipeline):** a test for each of these runs in a real browser before it ships:
- Enter pressed twice fast moves on once, never skips a required question.
- A fast double tap on a choice that moves on by itself moves once.
- Back after an auto move shows the answer still picked; a changed answer that hides later questions drops their
  answers before the send (`shownValues`).
- A required question left empty stays put with its error, and the screen reader hears it.
- The form sends once, with the same answers as the same form shown all at once.

---

## Part 5. Pictures in questions and pages

- **Page layouts:** any page (or any screen in one question at a time) can take a photo on the left, the right, the
  top or behind, like the welcome screen.
- **A picture with a question:** a picture above the question's label, for "Which of these looks like your room?"
- **Picture choice, upgraded:** pictures from the library, 2, 3 or 4 across, square or wide, with the label under
  each; on phones 2 across. Keyboard picks still work.
- **Image and video blocks:** pick from the library or paste a video link. GIFs play once and stop under reduced
  motion.
- **End screen:** a photo, the thank-you words, the result and the booking calendar as today.

---

## Part 6. Tia builds with pictures

- Tia may now place pictures, but only from the workspace's library, by ID. It never writes a picture address.
- A new form starts with the site's own photos when the scan found any. Tia picks the one that fits the form (a team
  photo for a careers form, a product shot for a demo request) and writes its words for screen readers.
- "Use a stock photo" in the chat searches Pexels, shows four to click, and copies the picked one in.
- "Make it one question at a time" and "add a welcome screen with a photo" work as chat requests and as Studio
  controls.
- Every pick goes through the step cache, so a form built twice from the same request doesn't call the model again.

---

## Part 7. Share settings like Fillout's

Share › Website keeps its six ways and live preview, and adds:

| Setting | What it does |
|---|---|
| Desktop / Phone | Switches the preview between a desktop width and a 390 px phone |
| Auto height | On by default: the form grows with its questions. Off: a fixed height in px, the form scrolls inside |
| Width | A number with % or px (today px only); 100% by default |
| Get the code | One primary button opens the code with Copy, plus the steps for Webflow, Framer, WordPress and plain HTML (built) |
| React library | A link under the button to the `@claritia/embed` page |

Every setting uses the app's own `Select`, `Switch` and inputs. No browser dropdowns.

---

## Part 8. Templates

- 60 of the 435 templates get a welcome screen with a stock photo from the library's starter set (copied into each
  workspace that uses one): the most used ones in Leads and sales, Booking, Events, Apply and join.
- Quizzes, assessments and the NPS survey start in one question at a time.
- Booking and product templates get picture choice where it helps (room type, service, plan).
- The website's template pages (`claritia-site`) show the same: the welcome screen first, then Start.

---

## Part 9. Build order

| Step | What | Done when |
|---|---|---|
| 1 | Picture library: bucket, upload, sizes, delete, the cleaner's host rule | A picture uploads, shows in three sizes, and an outside picture address is refused |
| 2 | Welcome screen in the Studio and the form script, four layouts, focus point | Each layout looks right at 390, 768 and 1280 wide, light and dark styles |
| 3 | One question at a time in Studio pages, with the reliability tests in Part 4 | All Part 4 tests pass three runs in a row |
| 4 | Page layouts, picture with a question, picture choice upgrade, end screen photo | Studio check and embed check pass |
| 5 | Share settings: Desktop / Phone, Auto height, Width in % | Embed check covers each |
| 6 | Tia with pictures, site photos from the brand scan, Pexels search | Tia never writes a picture address (test) |
| 7 | 60 templates with photos, quizzes in one question at a time, the website's template pages | Templates check passes |

The form script stays under its 32 KB gzipped limit: the welcome screen and one question at a time load with the
script's second part (`/forms/x1.js`) only on forms that use them.

---

## Part 10. Running cost

What this adds to the monthly bill. Guesses per team: 30 pictures stored (about 25 MB with their sizes), 5,000 form
views a month with about 150 KB of pictures each, 20 picture picks by Tia a month.

| Item | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Picture storage (1.25 GB / 12.5 GB, VPS disk, check) | $0.03 | $0.26 |
| Picture traffic (37 GB / 375 GB, VPS bandwidth, check) | $0 | $11 |
| Pexels API (free, check) | $0 | $0 |
| Resizing with sharp on the existing worker machines | $0 | $0 |
| Claude: Tia's picture picks and alt words (Sonnet, about 3,000 tokens in and 300 out each, about $0.014, check) | $14 | $140 |
| **Added monthly total** | **about $14** | **about $151** |

Visitors never call a model, so traffic only moves the picture traffic line. If that line grows, a Cloudflare cache
in front of the bucket (free plan, check) brings it back near $0.
