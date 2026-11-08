# Templates with pictures: the plan

Status: plan. 7 November 2026. The engine (picture library, welcome screen, page layouts, picture choice, one
question at a time) is `docs/forms-media-plan.md`. This plan is what goes into the 435 templates
(`src/lib/forms/gallery/templates/`, `docs/form-templates.md`) once the engine is there.

**The goal:** most templates open on a welcome screen with a real photo, ask with pictures where the answer is a thing
you can see, and look finished the moment someone picks them. Today none of the 435 has a picture: 22 have a welcome
screen with words only.

---

## Part 1. What Fillout's templates do (42 looked at)

We went through the first 42 templates in Fillout's gallery, opened each live form, and noted its first two screens.

| Pattern | How many | Examples | What it looks like |
|---|---|---|---|
| Photo behind the welcome screen | 7 | Real estate inquiry, talent show, volunteer signup, Secret Santa, wedding RSVP, photo release, price quote | A full photo with the title and one button on it |
| Photo on one side (40% of the width) | 9 | Affiliate, flower order, join our community, healthy meals, referral partner, welcome offer, peer review, supplier review, sign-up sheet | Photo left or right, words and fields on the other side. The photo stays on the next pages |
| Drawing on one side | 2 | Mental health check, user persona | A flat drawing in the photo's place |
| Photo band across the top | 3 | RFP, client intake, checkout | A short band (about 25% of the height) over the fields |
| Product photo in the page | 1 | Giveaway | A photo of the prize above the fields |
| Picture or icon choices | 3 | Class poll (photo grid), daily report and self evaluation (icon cards for the department) | 3 or 4 big cards in a row |
| A color or pattern behind a floating card | 12 | Emergency contact, software request, customer profile, testimonial, time off, grant | The look we removed from Claritia on 7 November |
| Plain | 5 | Software survey, job application, newsletter | The logo and the fields |

Some forms show two patterns (a photo on the welcome screen, icon cards inside).

**What they all share:**
- A welcome screen almost every time: a logo, a short title, one or two lines, and one button with a friendly word
  ("Let's go", "Start", "I'm ready to RSVP").
- The photo sets the mood in one look: the place (a living room, a stage, a forest), the product (flowers, a meal),
  or people like the visitor.
- The photo stays in the same spot on the next pages, so the form feels like one piece.
- Internal forms (time off, daily report) keep the photo small or use icons.

**What we don't take:**
- A form card floating over a photo, a color or a pattern (12 of the 42 do this). It's the background around the
  form that we removed on 7 November. In Claritia a photo sits behind words only on
  the welcome and end screens. Question pages use the side or top layouts, and the form fills its box.
- Real people who are famous, or faces on forms about health, money trouble or the law.
- Their templates, words or photos. We take the patterns only; every template and photo is ours or licensed.

---

## Part 2. The look for each family

| Family (templates) | Welcome screen | Question pages | Choices | Photo subjects |
|---|---|---|---|---|
| Leads and sales (119) | Photo on one side, 90 templates | Same side photo | Picture cards for "What do you need?" in 25 | People at work, the product in use, the place of business |
| Booking (60) | Photo behind for hospitality, beauty, fitness; side photo for the rest, 55 templates | Side photo | Picture cards for the service or the location in 30 | The room, the chair, the court, the clinic, the car bay |
| Events (38) | Photo behind, all 38 | Top band | Picture cards for meal or session picks in 12 | The venue, the crowd, the stage, the table setting |
| Apply and join (67) | Side photo of the team or workplace, 50 templates | Side photo | Icon cards for department or role in 30 | Teams, workplaces, volunteers outdoors |
| Orders and payments (71) | Top band of the product, 40 templates | Top band | Picture cards for the product, size or package in 30 | Food, flowers, merch, print, gift boxes |
| Feedback and surveys (64) | Top band in 25 templates; the rest plain | Plain | Icon cards for "What did you use?" in 15; faces for ratings | Calm, light scenes with room for words |
| Quizzes and assessments (32) | Photo behind, all 32 | One question at a time, a picture per question in 15 | Picture answers in 15; a photo on each result | Whatever the quiz is about |
| Intake and onboarding (43) | Calm side photo, 30 templates | Side photo | Icon cards for goals in 15 | Offices, clinics, desks, hands at work, no faces in health |
| Operations (63) | Logo only | Plain | Icon cards for request type or department in 25 | None |
| Consent and legal (27) | Logo only | Plain | None | None |

**Totals:** about 360 templates get a photo, 112 get picture cards, 85 get icon cards, and 75 internal and legal ones
stay plain with the logo.

**Rules for picture choices:** picture cards only when there are 2 to 6 answers and each answer is a thing you can see
(a room, a dish, a service, a product). Answers that are ideas (a budget, a team size, a department) get icon cards
or stay as plain choices.

---

## Part 3. The photo set

Templates need about 700 photos: about 300 for welcome screens and pages (some shared between similar templates, never
two cards side by side in the gallery with the same photo), and about 400 for picture cards.

| Step | How |
|---|---|
| Find | A script (`scripts/template-photos.ts`) searches CC0 photos through Openverse (no key, 200 searches a day) for each slot's words, StockSnap first and the WordPress Photo Directory when StockSnap finds too few, and saves 8 options for each slot. Burst (Shopify's free photos) is tried first with BURST=1, but it turns a client away after a few searches |
| Check | Claude reads each option once and writes its alt words, its focus point, whether it's light or dark, and whether it fits the template. A failed fit is dropped |
| Choose | A contact sheet per family (like the one made for this plan) for a person to approve or swap, slot by slot |
| Store | Approved photos go to the website's `assets/form-photos/` (served at https://tryclaritia.com/assets/form-photos/) as a 1920 wide JPEG and WebP at 640, 1280 and 1920, without their metadata, with a manifest: the source, its id and page, the words for screen readers, the focus point |
| Keep | A starter photo is never deleted while a form uses it. A customer swaps any of them for their own in one click |

**License:** StockSnap's and the WordPress Photo Directory's photos are CC0, and Burst's are free for commercial use
with no credit needed (check the license pages before each new batch). StockSnap serves 960 wide copies: enough for
side photos and cards, soft as a full background. Neither allows selling a photo on its own, and a photo of a person never
suggests that person backs a product. We keep the manifest so every photo can be traced. Pexels and Unsplash were
the first choice: Pexels needs a key, and Unsplash refuses this session's network without one.

**Icons:** the icon cards use Lucide (ISC license), drawn as one SVG set inside the form script's second part, so a
form without icon cards loads nothing more. About 150 icons are enough for every template.

---

## Part 4. Photos and the 18 styles

- Each photo is marked light or dark. On a welcome screen with the photo behind, the words sit on a flat tint (black at
  45% on a light photo, the style's own dark color on a dark one), checked for 4.5 to 1 contrast in all 18 styles.
  No gradients.
- Dark styles (Midnight, Terminal, Gilded, Noir) take dark or night photos; bright styles (Poster, Sunrise, Bubblegum)
  take bright ones. A template's photo is picked to suit its own style; changing the style keeps the photo, and the
  tint keeps the words readable.
- On phones a side photo moves to the top at 40% of the height, and a photo behind keeps its focus point in view.

---

## Part 5. Where the pictures show

- **The template cards** in the Studio gallery, Forms › Templates and the website show the welcome screen with its
  photo, in the template's style, the way it will open. The first questions show when someone opens it.
- **The template's own page** on the website (`claritia-site`) shows the live form starting on its welcome screen.
- **Tia** keeps a template's photos when building from it, and swaps them for the site's own photos when the brand scan
  found good ones (`docs/forms-media-plan.md` Part 6).

---

## Part 6. Build order

| Step | What | Done when |
|---|---|---|
| 1 | The engine from `docs/forms-media-plan.md` steps 1 to 4 | Its checks pass |
| 2 | The gallery format holds pictures: `cover.media` and `cover.layout`, `pages[].media` and `layout`, `cards: "photo" \| "icon"` with an image or icon per option, `end.media`; `convert.ts` turns them into Studio pages | Every template still converts and the old ones look the same |
| 3 | The photo script, the Claude check and the contact sheets | 700 photos approved, every one with alt words and a focus point |
| 4 | Pictures added family by family, in the order of Part 2 (Leads first, Legal last) | Each family's contact sheet approved and its checks pass |
| 5 | Cards, the Studio gallery and the website show the welcome screens | Templates check and the website screenshots pass |

**Checks for every template with pictures** (`tests/formGallery.test.ts` and the templates check):
- Every photo has alt words; every picture card has a label people can read without the picture.
- Words on a photo pass 4.5 to 1 contrast in all 18 styles.
- The welcome photo is 200 KB or less at 1280 wide.
- A picture card answer sends the same value as the plain choice did, so routing, workflows and old results keep
  working (the send pipeline rule).
- A template opens and sends with every picture blocked, as on a slow or strict network.

---

## Part 7. Running cost

**Each month:**

| Item | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Storing 700 starter photos in three sizes (about 1 GB on the VPS disk, check) | $0.02 | $0.02 |
| Picture traffic | Already counted in `docs/forms-media-plan.md` ($0 / about $11) | Same |
| Claude | $0: templates are built once, and visitors never call a model | $0 |
| **Added monthly total** | **about $0.02** | **about $0.02** |

**Once, to build the set:**

| Item | Cost |
|---|---|
| Claude checking about 5,600 photo options (700 slots, 8 each; about 2,000 tokens in and 200 out each with Sonnet, check) | about $50 |
| Openverse, Burst (free, no key, check) | $0 |
| A person reviewing the contact sheets (about 10 families, 1 to 2 hours each) | Time only |
