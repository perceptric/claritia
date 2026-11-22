// The photos Tia can put in an email: picked from the form templates' photo set (src/lib/forms/gallery/photos), each
// saved as a 1040 by 520 JPG for email (Outlook doesn't show WebP), on the website at /assets/email-photos/. The model
// picks one by its id from what the alt text says it shows, or none. scripts/email-photos.ts makes the files.

export const EMAIL_PHOTO_BASE = "https://tryclaritia.com/assets/email-photos/";

export type EmailPhoto = { name: string; alt: string };

/** By id: a few words of what it shows. */
export const EMAIL_PHOTOS: Record<string, EmailPhoto> = {
  "person-reading-open": { name: "general-newsletter-welcome", alt: "A person reading an open book" },
  "woman-laptop-cup": { name: "general-email-preferences-welcome", alt: "A woman with a laptop and a cup of coffee" },
  "designer-smiling-desk": { name: "agency-project-inquiry-welcome", alt: "A designer smiling at her desk in a studio" },
  "man-reading-tablet": { name: "general-content-download-welcome", alt: "A man reading on a tablet in an office" },
  "people-working-laptops": { name: "saas-demo-request-welcome", alt: "People working on laptops at a shared table" },
  "group-laughing-together": { name: "coaching-program-waitlist-welcome", alt: "A small group laughing together" },
  "handwritten-notes-beside": { name: "coaching-masterclass-welcome", alt: "Handwritten notes beside a coffee" },
  "smalltown-main-street": { name: "government-business-contact-welcome", alt: "A small-town main street with shops" },
  "colleagues-working-laptops": { name: "saas-partner-program-welcome", alt: "Two colleagues working on laptops together" },
  "hands-holding-phone": { name: "saas-early-access-welcome", alt: "Hands holding a phone and a coffee" },
  "laptop-plant-white": { name: "saas-quick-demo-welcome", alt: "A laptop and a plant on a white desk" },
  "planning-board-weeks": { name: "agency-marketing-scorecard-welcome", alt: "A planning board with weeks and notes" },
  "tidy-desk-laptop": { name: "finance-advisor-callback-welcome", alt: "A tidy desk with a laptop and a plant" },
  "presenter-talking-group": { name: "saas-product-webinar-welcome", alt: "A presenter talking to a small group" },
  "person-pottery-wheel": { name: "consulting-workshop-registration-welcome", alt: "A person at a pottery wheel in a workshop" },
  "yoga-class": { name: "fitness-trial-class-welcome", alt: "A small yoga class" },
  "conference-hall-stage": { name: "events-sponsor-inquiry-welcome", alt: "A conference hall with stage lights" },
  "warm-string-lights": { name: "events-venue-inquiry-welcome", alt: "Warm string lights at dusk" },
  "rows-seats-lecture": { name: "education-course-enrollment-welcome", alt: "Rows of seats in a lecture hall" },
  "people-looking-city": { name: "events-conference-registration-welcome", alt: "People looking out over a city from a high window" },
  "woman-big-smile": { name: "general-nps-welcome", alt: "A woman with a big smile" },
  "friends-smiling-together": { name: "general-referral-welcome", alt: "Two friends smiling together outdoors" },
  "people-talking-across": { name: "consulting-consultation-welcome", alt: "Two people talking across a desk" },
  "bright-quiet-room": { name: "wellness-new-patient-welcome", alt: "A bright, quiet room with a table" },
  "person-working-laptop": { name: "general-contact-us-welcome", alt: "A person working at a laptop on a bright desk" },
  "team-talking-around": { name: "agency-marketing-audit-welcome", alt: "A team talking around a table" },
  "library-shelves-books": { name: "education-course-inquiry-welcome", alt: "Library shelves full of books" },
  "cup-tea-open": { name: "healthcare-home-care-assessment-welcome", alt: "A cup of tea on an open book" },
  "printed-charts-phones": { name: "general-report-download-welcome", alt: "Printed charts and phones on a desk" },
  "people-talking-coffee": { name: "coaching-program-application-welcome", alt: "Two people talking over coffee" },
  "people-talking-busy": { name: "consulting-client-referral-welcome", alt: "People talking in a busy cafe" },
  "team-meeting-around": { name: "saas-contact-sales-welcome", alt: "A team meeting around a table with laptops" },
  "people-shaking-hands": { name: "general-partner-application-welcome", alt: "Two people shaking hands over a desk" },
  "building-plans-tools": { name: "general-quote-request-welcome", alt: "Building plans and tools on a table" },
  "printed-reports-charts": { name: "consulting-benchmark-report-welcome", alt: "Printed reports with charts on a desk" },
  "shelves-bowls-cups": { name: "ecommerce-back-in-stock-welcome", alt: "Shelves of bowls and cups in a shop" },
  "flower-shops-storefront": { name: "insurance-business-intake-welcome", alt: "A small flower shop's storefront" },
  "open-sign-shop": { name: "accounting-new-business-welcome", alt: "An Open sign in a shop window" },
  "someone-packing-moving": { name: "construction-moving-cost-calculator-welcome", alt: "Someone packing a moving box" },
  "woman-desk-phone": { name: "general-book-a-call-welcome", alt: "A woman at her desk with her phone" },
  "flowers-gift-box": { name: "personal-baby-shower-welcome", alt: "Flowers and a gift box" },
  "glasses-sparkling-wine": { name: "hospitality-group-booking-welcome", alt: "Glasses of sparkling wine raised for a toast" },
  "bunch-colorful-tulips": { name: "retail-flower-subscription-welcome", alt: "A bunch of colorful tulips" },
  "field-sunflowers": { name: "nonprofit-grant-application-welcome", alt: "A field of sunflowers" },
  "autumn-trees-neighborhood": { name: "nonprofit-community-grant-welcome", alt: "Autumn trees in a neighborhood" },
  "greeting-card-pen": { name: "food-gift-card-order-welcome", alt: "A greeting card and a pen" },
};

export const emailPhotoUrl = (p: EmailPhoto) => `${EMAIL_PHOTO_BASE}${p.name}.jpg`;
