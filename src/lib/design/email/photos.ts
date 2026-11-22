// The email templates' photos: picked from the form templates' photo set (src/lib/forms/gallery/photos), each saved
// as a 1040 by 520 JPG for email (Outlook doesn't show WebP), on the website at /assets/email-photos/. About half the
// library has one; letters, number digests and short notes stay without. scripts/email-photos.ts makes the files.

export const EMAIL_PHOTO_BASE = "https://tryclaritia.com/assets/email-photos/";

export type EmailPhoto = { name: string; alt: string };

/** By template key. */
export const EMAIL_PHOTOS: Record<string, EmailPhoto> = {
  // Newsletters
  newsletter: { name: "general-newsletter-welcome", alt: "A person reading an open book" },
  weekly_tips: { name: "general-email-preferences-welcome", alt: "A woman with a laptop and a cup of coffee" },
  studio_news: { name: "agency-project-inquiry-welcome", alt: "A designer smiling at her desk in a studio" },
  roundup: { name: "general-content-download-welcome", alt: "A man reading on a tablet in an office" },
  case_study_letter: { name: "saas-demo-request-welcome", alt: "People working on laptops at a shared table" },
  community_news: { name: "coaching-program-waitlist-welcome", alt: "A small group laughing together" },
  recipe_of_month: { name: "coaching-masterclass-welcome", alt: "Handwritten notes beside a coffee" },
  local_guide: { name: "government-business-contact-welcome", alt: "A small-town main street with shops" },
  // Product updates
  product_recap: { name: "saas-partner-program-welcome", alt: "Two colleagues working on laptops together" },
  beta_invite: { name: "saas-early-access-welcome", alt: "Hands holding a phone and a coffee" },
  new_integration: { name: "saas-quick-demo-welcome", alt: "A laptop and a plant on a white desk" },
  roadmap: { name: "agency-marketing-scorecard-welcome", alt: "A planning board with weeks and notes" },
  tip_feature: { name: "finance-advisor-callback-welcome", alt: "A tidy desk with a laptop and a plant" },
  // Events and webinars
  webinar_invite: { name: "saas-product-webinar-welcome", alt: "A presenter talking to a small group" },
  workshop_invite: { name: "consulting-workshop-registration-welcome", alt: "A person at a pottery wheel in a workshop" },
  class_schedule: { name: "fitness-trial-class-welcome", alt: "A small yoga class" },
  conference_meet: { name: "events-sponsor-inquiry-welcome", alt: "A conference hall with stage lights" },
  open_house: { name: "events-venue-inquiry-welcome", alt: "Warm string lights at dusk" },
  course_starts: { name: "education-course-enrollment-welcome", alt: "Rows of seats in a lecture hall" },
  event_followup: { name: "events-conference-registration-welcome", alt: "People looking out over a city from a high window" },
  // Welcome and onboarding
  welcome: { name: "general-nps-welcome", alt: "A woman with a big smile" },
  welcome_member: { name: "general-referral-welcome", alt: "Two friends smiling together outdoors" },
  welcome_client: { name: "consulting-consultation-welcome", alt: "Two people talking across a desk" },
  welcome_patient: { name: "wellness-new-patient-welcome", alt: "A bright, quiet room with a table" },
  getting_started: { name: "general-contact-us-welcome", alt: "A person working at a laptop on a bright desk" },
  meet_the_team: { name: "agency-marketing-audit-welcome", alt: "A team talking around a table" },
  resources_pack: { name: "education-course-inquiry-welcome", alt: "Library shelves full of books" },
  welcome_subscriber: { name: "healthcare-home-care-assessment-welcome", alt: "A cup of tea on an open book" },
  // Nurture and win-back
  resource: { name: "general-report-download-welcome", alt: "Printed charts and phones on a desk" },
  free_consult: { name: "coaching-program-application-welcome", alt: "Two people talking over coffee" },
  miss_you: { name: "consulting-client-referral-welcome", alt: "People talking in a busy cafe" },
  testimonial_nurture: { name: "saas-contact-sales-welcome", alt: "A team meeting around a table with laptops" },
  referral_ask: { name: "general-partner-application-welcome", alt: "Two people shaking hands over a desk" },
  // Sales follow-up
  quote_sent: { name: "general-quote-request-welcome", alt: "Building plans and tools on a table" },
  proposal: { name: "consulting-benchmark-report-welcome", alt: "Printed reports with charts on a desk" },
  // Meetings and forms
  order_confirmed: { name: "ecommerce-back-in-stock-welcome", alt: "Shelves of bowls and cups in a shop" },
  // Announcements
  new_location: { name: "insurance-business-intake-welcome", alt: "A small flower shop's storefront" },
  new_hours: { name: "accounting-new-business-welcome", alt: "An Open sign in a shop window" },
  moving_notice: { name: "construction-moving-cost-calculator-welcome", alt: "Someone packing a moving box" },
  new_hire: { name: "general-book-a-call-welcome", alt: "A woman at her desk with her phone" },
  // Holidays and seasons
  holiday_hours: { name: "personal-baby-shower-welcome", alt: "Flowers and a gift box" },
  new_year: { name: "hospitality-group-booking-welcome", alt: "Glasses of sparkling wine raised for a toast" },
  spring_reset: { name: "retail-flower-subscription-welcome", alt: "A bunch of colorful tulips" },
  summer_schedule: { name: "nonprofit-grant-application-welcome", alt: "A field of sunflowers" },
  back_to_school: { name: "nonprofit-community-grant-welcome", alt: "Autumn trees in a neighborhood" },
  gift_cards: { name: "food-gift-card-order-welcome", alt: "A greeting card and a pen" },
};

export const emailPhotoUrl = (p: EmailPhoto) => `${EMAIL_PHOTO_BASE}${p.name}.jpg`;
