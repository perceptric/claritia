// The leads templates' starter photos (docs/template-pictures-plan.md), written by scripts/template-photos.ts.
// Each template's welcome photo and, by question, a photo per answer for picture cards.
import type { TemplatePhotos } from "./index.ts";

export const PHOTOS: TemplatePhotos = {
  "general.contact-us": {
    "cover": {
      "name": "general-contact-us-welcome",
      "alt": "A person working at a laptop on a bright desk",
      "layout": "right"
    }
  },
  "general.newsletter": {
    "cover": {
      "name": "general-newsletter-welcome",
      "alt": "A person reading an open book",
      "layout": "left"
    }
  },
  "general.book-a-call": {
    "cover": {
      "name": "general-book-a-call-welcome",
      "alt": "A woman at her desk with her phone",
      "layout": "right"
    }
  },
  "general.waitlist": {
    "cover": {
      "name": "general-waitlist-welcome",
      "alt": "A person checking their phone by a sunny window",
      "layout": "right"
    }
  },
  "general.referral": {
    "cover": {
      "name": "general-referral-welcome",
      "alt": "Two friends smiling together outdoors",
      "layout": "left"
    }
  },
  "general.partner-application": {
    "cover": {
      "name": "general-partner-application-welcome",
      "alt": "Two people shaking hands over a desk",
      "layout": "right"
    }
  },
  "general.quote-request": {
    "cover": {
      "name": "general-quote-request-welcome",
      "alt": "Building plans and tools on a table",
      "layout": "right"
    }
  },
  "general.callback-request": {
    "cover": {
      "name": "general-callback-request-welcome",
      "alt": "A hand holding a pair of headphones",
      "layout": "left"
    }
  },
  "general.email-preferences": {
    "cover": {
      "name": "general-email-preferences-welcome",
      "alt": "A woman with a laptop and a cup of coffee",
      "layout": "right"
    }
  },
  "general.content-download": {
    "cover": {
      "name": "general-content-download-welcome",
      "alt": "A man reading on a tablet in an office",
      "layout": "right"
    }
  },
  "saas.demo-request": {
    "cover": {
      "name": "saas-demo-request-welcome",
      "alt": "People working on laptops at a shared table",
      "layout": "left"
    }
  },
  "saas.contact-sales": {
    "cover": {
      "name": "saas-contact-sales-welcome",
      "alt": "A team meeting around a table with laptops",
      "layout": "right"
    }
  },
  "saas.pricing-lead": {
    "cover": {
      "name": "saas-pricing-lead-welcome",
      "alt": "A team planning with notes on a table",
      "layout": "right"
    }
  },
  "agency.project-inquiry": {
    "cover": {
      "name": "agency-project-inquiry-welcome",
      "alt": "A designer smiling at her desk in a studio",
      "layout": "left"
    }
  },
  "agency.seo-audit": {
    "cover": {
      "name": "agency-seo-audit-welcome",
      "alt": "A computer showing charts on a white desk",
      "layout": "right"
    }
  },
  "agency.website-brief": {
    "cover": {
      "name": "agency-website-brief-welcome",
      "alt": "Hands sketching a website layout on paper",
      "layout": "right"
    }
  },
  "agency.marketing-audit": {
    "cover": {
      "name": "agency-marketing-audit-welcome",
      "alt": "A team talking around a table",
      "layout": "left"
    }
  },
  "consulting.consultation": {
    "cover": {
      "name": "consulting-consultation-welcome",
      "alt": "Two people talking across a desk",
      "layout": "right"
    }
  },
  "consulting.proposal-request": {
    "cover": {
      "name": "consulting-proposal-request-welcome",
      "alt": "A signed document and a pen on a table",
      "layout": "right"
    }
  },
  "legal.case-evaluation": {
    "cover": {
      "name": "legal-case-evaluation-welcome",
      "alt": "Shelves full of books",
      "layout": "left"
    }
  },
  "legal.consultation-booking": {
    "cover": {
      "name": "legal-consultation-booking-welcome",
      "alt": "An empty office with tall windows",
      "layout": "right"
    }
  },
  "accounting.bookkeeping-quote": {
    "cover": {
      "name": "accounting-bookkeeping-quote-welcome",
      "alt": "Hands working through numbers with a calculator",
      "layout": "right"
    }
  },
  "accounting.new-business": {
    "cover": {
      "name": "accounting-new-business-welcome",
      "alt": "An Open sign in a shop window",
      "layout": "left"
    }
  },
  "finance.review-request": {
    "cover": {
      "name": "finance-review-request-welcome",
      "alt": "A notebook, a pen and a calculator",
      "layout": "right"
    }
  },
  "finance.retirement": {
    "cover": {
      "name": "finance-retirement-welcome",
      "alt": "An older couple walking along the shore",
      "layout": "right"
    }
  },
  "insurance.quote": {
    "cover": {
      "name": "insurance-quote-welcome",
      "alt": "A family playing together at home",
      "layout": "left"
    }
  },
  "insurance.business-intake": {
    "cover": {
      "name": "insurance-business-intake-welcome",
      "alt": "A small flower shop's storefront",
      "layout": "right"
    }
  },
  "insurance.policy-review": {
    "cover": {
      "name": "insurance-policy-review-welcome",
      "alt": "A document and a pen on a table",
      "layout": "right"
    }
  },
  "real_estate.home-valuation": {
    "cover": {
      "name": "real-estate-home-valuation-welcome",
      "alt": "A house with a front yard",
      "layout": "left"
    }
  },
  "real_estate.buyer-inquiry": {
    "cover": {
      "name": "real-estate-buyer-inquiry-welcome",
      "alt": "A couple relaxing at home",
      "layout": "right"
    }
  },
  "real_estate.commercial-space": {
    "cover": {
      "name": "real-estate-commercial-space-welcome",
      "alt": "A bright, empty room with white walls",
      "layout": "right"
    },
    "images": {
      "Space type": [
        "real-estate-commercial-space-space-type-0",
        "real-estate-commercial-space-space-type-1",
        "real-estate-commercial-space-space-type-2",
        "real-estate-commercial-space-space-type-3",
        "real-estate-commercial-space-space-type-4"
      ]
    }
  },
  "construction.free-estimate": {
    "cover": {
      "name": "construction-free-estimate-welcome",
      "alt": "A builder looking at a new house",
      "layout": "left"
    }
  },
  "construction.remodel-planner": {
    "cover": {
      "name": "construction-remodel-planner-welcome",
      "alt": "A bright living room with a white sofa",
      "layout": "right"
    }
  },
  "solar.savings-check": {
    "cover": {
      "name": "solar-savings-check-welcome",
      "alt": "Solar panels under a blue sky",
      "layout": "right"
    }
  },
  "solar.commercial-audit": {
    "cover": {
      "name": "solar-commercial-audit-welcome",
      "alt": "A glass office building",
      "layout": "left"
    }
  },
  "healthcare.provider-referral": {
    "cover": {
      "name": "healthcare-provider-referral-welcome",
      "alt": "A stethoscope on a desk",
      "layout": "right"
    }
  },
  "wellness.therapy-consultation": {
    "cover": {
      "name": "wellness-therapy-consultation-welcome",
      "alt": "A yellow armchair in a quiet room",
      "layout": "left"
    }
  },
  "education.course-inquiry": {
    "cover": {
      "name": "education-course-inquiry-welcome",
      "alt": "Library shelves full of books",
      "layout": "right"
    }
  },
  "education.corporate-training": {
    "cover": {
      "name": "education-corporate-training-welcome",
      "alt": "An open notebook and a pen",
      "layout": "right"
    }
  },
  "ecommerce.wholesale": {
    "cover": {
      "name": "ecommerce-wholesale-welcome",
      "alt": "Wrapped parcels on a table",
      "layout": "left"
    }
  },
  "ecommerce.back-in-stock": {
    "cover": {
      "name": "ecommerce-back-in-stock-welcome",
      "alt": "Shelves of bowls and cups in a shop",
      "layout": "right"
    }
  },
  "ecommerce.influencer": {
    "cover": {
      "name": "ecommerce-influencer-welcome",
      "alt": "A creator filming with a camera",
      "layout": "right"
    }
  },
  "manufacturing.rfq": {
    "cover": {
      "name": "manufacturing-rfq-welcome",
      "alt": "Close-up of metal machine parts",
      "layout": "left"
    }
  },
  "logistics.freight-quote": {
    "cover": {
      "name": "logistics-freight-quote-welcome",
      "alt": "A truck on the highway",
      "layout": "right"
    }
  },
  "automotive.trade-in": {
    "cover": {
      "name": "automotive-trade-in-welcome",
      "alt": "A car parked in a sunny field",
      "layout": "right"
    }
  },
  "automotive.fleet": {
    "cover": {
      "name": "automotive-fleet-welcome",
      "alt": "A van parked in front of a house",
      "layout": "right"
    }
  },
  "hospitality.travel-inquiry": {
    "cover": {
      "name": "hospitality-travel-inquiry-welcome",
      "alt": "A green coastline with a waterfall",
      "layout": "left"
    },
    "images": {
      "Interests": [
        "hospitality-travel-inquiry-interests-0",
        "hospitality-travel-inquiry-interests-1",
        "hospitality-travel-inquiry-interests-2",
        "hospitality-travel-inquiry-interests-3",
        "hospitality-travel-inquiry-interests-4",
        "hospitality-travel-inquiry-interests-5"
      ]
    }
  },
  "events.sponsor-inquiry": {
    "cover": {
      "name": "events-sponsor-inquiry-welcome",
      "alt": "A conference hall with stage lights",
      "layout": "right"
    }
  },
  "it.assessment": {
    "cover": {
      "name": "it-assessment-welcome",
      "alt": "Close-up of a computer circuit board",
      "layout": "right"
    }
  },
  "beauty.color-consultation": {
    "cover": {
      "name": "beauty-color-consultation-welcome",
      "alt": "Chairs and mirrors in a hair salon",
      "layout": "left"
    }
  },
  "beauty.tattoo-consultation": {
    "cover": {
      "name": "beauty-tattoo-consultation-welcome",
      "alt": "A colorful tattoo on an arm",
      "layout": "right"
    }
  },
  "hospitality.group-rate-callback": {
    "cover": {
      "name": "hospitality-group-rate-callback-welcome",
      "alt": "The front of a grand hotel",
      "layout": "right"
    }
  },
  "fitness.trainer-callback": {
    "cover": {
      "name": "fitness-trainer-callback-welcome",
      "alt": "A trainer going over a plan with a client",
      "layout": "left"
    }
  },
  "events.venue-tour": {
    "cover": {
      "name": "events-venue-tour-welcome",
      "alt": "A long hall set with tables for an event",
      "layout": "right"
    },
    "images": {
      "Spaces you'd like to see": [
        "events-venue-tour-spaces-you-d-like-to-see-0",
        "events-venue-tour-spaces-you-d-like-to-see-1",
        "events-venue-tour-spaces-you-d-like-to-see-2",
        "events-venue-tour-spaces-you-d-like-to-see-3"
      ]
    }
  },
  "finance.advisor-callback": {
    "cover": {
      "name": "finance-advisor-callback-welcome",
      "alt": "A tidy desk with a laptop and a plant",
      "layout": "right"
    }
  },
  "events.wedding-planner-inquiry": {
    "cover": {
      "name": "events-wedding-planner-inquiry-welcome",
      "alt": "A wedding table with flowers",
      "layout": "left"
    }
  },
  "events.venue-inquiry": {
    "cover": {
      "name": "events-venue-inquiry-welcome",
      "alt": "Warm string lights at dusk",
      "layout": "right"
    },
    "images": {
      "Spaces you'd like to see": [
        "events-venue-inquiry-spaces-you-d-like-to-see-0",
        "events-venue-inquiry-spaces-you-d-like-to-see-1",
        "events-venue-inquiry-spaces-you-d-like-to-see-2",
        "events-venue-inquiry-spaces-you-d-like-to-see-3",
        "events-venue-inquiry-spaces-you-d-like-to-see-4"
      ]
    }
  },
  "education.info-session": {
    "cover": {
      "name": "education-info-session-welcome",
      "alt": "A student at a laptop by a window",
      "layout": "right"
    }
  },
  "saas.product-webinar": {
    "cover": {
      "name": "saas-product-webinar-welcome",
      "alt": "A presenter talking to a small group",
      "layout": "left"
    }
  },
  "coaching.masterclass": {
    "cover": {
      "name": "coaching-masterclass-welcome",
      "alt": "Handwritten notes beside a coffee",
      "layout": "right"
    }
  },
  "construction.house-cleaning-price": {
    "cover": {
      "name": "construction-house-cleaning-price-welcome",
      "alt": "A clean, bright kitchen",
      "layout": "right"
    }
  },
  "construction.office-cleaning-quote": {
    "cover": {
      "name": "construction-office-cleaning-quote-welcome",
      "alt": "A clean white desk with a plant",
      "layout": "left"
    }
  },
  "construction.water-heater-quote": {
    "cover": {
      "name": "construction-water-heater-quote-welcome",
      "alt": "A plumber at work on pipes",
      "layout": "right"
    }
  },
  "construction.roof-inspection": {
    "cover": {
      "name": "construction-roof-inspection-welcome",
      "alt": "A house with a dark pitched roof",
      "layout": "left"
    }
  },
  "construction.roof-cost-calculator": {
    "cover": {
      "name": "construction-roof-cost-calculator-welcome",
      "alt": "A tiled roof with a small window",
      "layout": "right"
    },
    "images": {
      "Material": [
        "construction-roof-cost-calculator-material-0",
        "construction-roof-cost-calculator-material-1",
        "construction-roof-cost-calculator-material-2",
        "construction-roof-cost-calculator-material-3"
      ]
    }
  },
  "construction.landscape-design": {
    "cover": {
      "name": "construction-landscape-design-welcome",
      "alt": "Two garden chairs on a patio",
      "layout": "right"
    }
  },
  "construction.panel-upgrade-estimate": {
    "cover": {
      "name": "construction-panel-upgrade-estimate-welcome",
      "alt": "An electrician wiring a breaker panel",
      "layout": "left"
    }
  },
  "construction.lighting-install-price": {
    "cover": {
      "name": "construction-lighting-install-price-welcome",
      "alt": "A single bulb hanging in a dark room",
      "layout": "right"
    }
  },
  "construction.moving-cost-calculator": {
    "cover": {
      "name": "construction-moving-cost-calculator-welcome",
      "alt": "Someone packing a moving box",
      "layout": "right"
    }
  },
  "general.email-digest": {
    "cover": {
      "name": "general-email-digest-welcome",
      "alt": "Hands holding a phone next to a coffee",
      "layout": "left"
    }
  },
  "general.report-download": {
    "cover": {
      "name": "general-report-download-welcome",
      "alt": "Printed charts and phones on a desk",
      "layout": "right"
    }
  },
  "saas.enterprise-demo": {
    "cover": {
      "name": "saas-enterprise-demo-welcome",
      "alt": "A man standing in a boardroom",
      "layout": "right"
    }
  },
  "saas.quick-demo": {
    "cover": {
      "name": "saas-quick-demo-welcome",
      "alt": "A laptop and a plant on a white desk",
      "layout": "left"
    }
  },
  "saas.partner-program": {
    "cover": {
      "name": "saas-partner-program-welcome",
      "alt": "Two colleagues working on laptops together",
      "layout": "right"
    }
  },
  "saas.early-access": {
    "cover": {
      "name": "saas-early-access-welcome",
      "alt": "Hands holding a phone and a coffee",
      "layout": "right"
    }
  },
  "agency.growth-call": {
    "cover": {
      "name": "agency-growth-call-welcome",
      "alt": "A team meeting in an office",
      "layout": "left"
    }
  },
  "agency.referral-partner": {
    "cover": {
      "name": "agency-referral-partner-welcome",
      "alt": "A bright desk by a window",
      "layout": "right"
    }
  },
  "consulting.client-referral": {
    "cover": {
      "name": "consulting-client-referral-welcome",
      "alt": "People talking in a busy cafe",
      "layout": "right"
    }
  },
  "consulting.benchmark-report": {
    "cover": {
      "name": "consulting-benchmark-report-welcome",
      "alt": "Printed reports with charts on a desk",
      "layout": "left"
    }
  },
  "it.managed-it-quote": {
    "cover": {
      "name": "it-managed-it-quote-welcome",
      "alt": "A laptop with code on screen beside a coffee",
      "layout": "right"
    }
  },
  "coaching.discovery-call": {
    "cover": {
      "name": "coaching-discovery-call-welcome",
      "alt": "A coach working with a client outdoors",
      "layout": "right"
    }
  },
  "coaching.program-waitlist": {
    "cover": {
      "name": "coaching-program-waitlist-welcome",
      "alt": "A small group laughing together",
      "layout": "left"
    }
  },
  "creative.photography-inquiry": {
    "cover": {
      "name": "creative-photography-inquiry-welcome",
      "alt": "Close-up of a camera lens",
      "layout": "right"
    }
  },
  "creative.video-quote": {
    "cover": {
      "name": "creative-video-quote-welcome",
      "alt": "A film clapperboard on set",
      "layout": "right"
    }
  },
  "architecture.project-consultation": {
    "cover": {
      "name": "architecture-project-consultation-welcome",
      "alt": "A bright, modern living room",
      "layout": "left"
    }
  },
  "architecture.fee-estimate": {
    "cover": {
      "name": "architecture-fee-estimate-welcome",
      "alt": "An architect's sketch on paper",
      "layout": "right"
    },
    "images": {
      "Project type": [
        "architecture-fee-estimate-project-type-0",
        "architecture-fee-estimate-project-type-1",
        "architecture-fee-estimate-project-type-2",
        "architecture-fee-estimate-project-type-3"
      ]
    }
  },
  "architecture.planning-guide": {
    "cover": {
      "name": "architecture-planning-guide-welcome",
      "alt": "The roofline of a modern house against the sky",
      "layout": "right"
    }
  },
  "security.system-quote": {
    "cover": {
      "name": "security-system-quote-welcome",
      "alt": "Security cameras on a wall",
      "layout": "left"
    }
  },
  "security.guard-services": {
    "cover": {
      "name": "security-guard-services-welcome",
      "alt": "A bright lobby with stairs",
      "layout": "right"
    }
  },
  "security.camera-demo": {
    "cover": {
      "name": "security-camera-demo-welcome",
      "alt": "Two security cameras against a blue sky",
      "layout": "right"
    }
  },
  "agriculture.equipment-demo": {
    "cover": {
      "name": "agriculture-equipment-demo-welcome",
      "alt": "A tractor working a green field",
      "layout": "left"
    },
    "images": {
      "Where would you like the demo?": [
        "agriculture-equipment-demo-where-would-you-like-the-demo-0",
        "agriculture-equipment-demo-where-would-you-like-the-demo-1",
        "agriculture-equipment-demo-where-would-you-like-the-demo-2"
      ]
    }
  },
  "agriculture.market-report": {
    "cover": {
      "name": "agriculture-market-report-welcome",
      "alt": "A field of ripe wheat",
      "layout": "right"
    }
  },
  "media.advertising-inquiry": {
    "cover": {
      "name": "media-advertising-inquiry-welcome",
      "alt": "Open magazines on a table",
      "layout": "right"
    }
  },
  "government.business-contact": {
    "cover": {
      "name": "government-business-contact-welcome",
      "alt": "A small-town main street with shops",
      "layout": "left"
    }
  },
  "retail.vip-list": {
    "cover": {
      "name": "retail-vip-list-welcome",
      "alt": "A woman browsing a clothing rack",
      "layout": "right"
    },
    "images": {
      "What do you shop for?": [
        "retail-vip-list-what-do-you-shop-for-0",
        "retail-vip-list-what-do-you-shop-for-1",
        "retail-vip-list-what-do-you-shop-for-2",
        "retail-vip-list-what-do-you-shop-for-3",
        "retail-vip-list-what-do-you-shop-for-4",
        "retail-vip-list-what-do-you-shop-for-5"
      ]
    }
  },
  "pets.puppy-waitlist": {
    "cover": {
      "name": "pets-puppy-waitlist-welcome",
      "alt": "A puppy sitting on a white floor",
      "layout": "right"
    },
    "images": {
      "Your home": [
        "pets-puppy-waitlist-your-home-0",
        "pets-puppy-waitlist-your-home-1",
        "pets-puppy-waitlist-your-home-2",
        "pets-puppy-waitlist-your-home-3"
      ]
    }
  },
  "sports.club-sponsorship": {
    "cover": {
      "name": "sports-club-sponsorship-welcome",
      "alt": "A soccer stadium on a bright day",
      "layout": "left"
    }
  },
  "faith.contact-us": {
    "cover": {
      "name": "faith-contact-us-welcome",
      "alt": "People gathered around a table talking",
      "layout": "right"
    }
  },
  "food.wholesale-inquiry": {
    "cover": {
      "name": "food-wholesale-inquiry-welcome",
      "alt": "Fresh pastries on a bakery counter",
      "layout": "right"
    },
    "images": {
      "Products you're interested in": [
        "food-wholesale-inquiry-products-you-re-interested-in-0",
        "food-wholesale-inquiry-products-you-re-interested-in-1",
        "food-wholesale-inquiry-products-you-re-interested-in-2",
        "food-wholesale-inquiry-products-you-re-interested-in-3",
        "food-wholesale-inquiry-products-you-re-interested-in-4",
        "food-wholesale-inquiry-products-you-re-interested-in-5"
      ]
    }
  },
  "saas.data-maturity-scorecard": {
    "cover": {
      "name": "saas-data-maturity-scorecard-welcome",
      "alt": "Charts and a tablet on a desk",
      "layout": "left"
    }
  },
  "agency.marketing-scorecard": {
    "cover": {
      "name": "agency-marketing-scorecard-welcome",
      "alt": "A planning board with weeks and notes",
      "layout": "right"
    }
  },
  "real_estate.buying-readiness": {
    "cover": {
      "name": "real-estate-buying-readiness-welcome",
      "alt": "Someone browsing homes on a laptop",
      "layout": "right"
    }
  },
  "legal.divorce-eligibility": {
    "cover": {
      "name": "legal-divorce-eligibility-welcome",
      "alt": "A quiet desk in a white room",
      "layout": "left"
    }
  },
  "coaching.program-application": {
    "cover": {
      "name": "coaching-program-application-welcome",
      "alt": "Two people talking over coffee",
      "layout": "right"
    }
  },
  "creative.video-brief": {
    "cover": {
      "name": "creative-video-brief-welcome",
      "alt": "Someone editing a video at a desk",
      "layout": "right"
    }
  },
  "healthcare.home-care-assessment": {
    "cover": {
      "name": "healthcare-home-care-assessment-welcome",
      "alt": "A cup of tea on an open book",
      "layout": "left"
    }
  },
  "legal.family-law-intake": {
    "cover": {
      "name": "legal-family-law-intake-welcome",
      "alt": "An office with tall windows",
      "layout": "right"
    }
  },
  "solar.savings-calculator": {
    "cover": {
      "name": "solar-savings-calculator-welcome",
      "alt": "Rows of solar panels on a hillside",
      "layout": "right"
    },
    "images": {
      "Type of home": [
        "solar-savings-calculator-type-of-home-0",
        "solar-savings-calculator-type-of-home-1",
        "solar-savings-calculator-type-of-home-2",
        "solar-savings-calculator-type-of-home-3"
      ]
    }
  },
  "saas.roi-calculator": {
    "cover": {
      "name": "saas-roi-calculator-welcome",
      "alt": "A calculator and a pencil on a desk",
      "layout": "left"
    }
  },
  "insurance.auto-quote": {
    "cover": {
      "name": "insurance-auto-quote-welcome",
      "alt": "A winding road through green hills",
      "layout": "right"
    }
  },
  "insurance.home-quote": {
    "cover": {
      "name": "insurance-home-quote-welcome",
      "alt": "A house with its lights on at dusk",
      "layout": "right"
    }
  },
  "construction.kitchen-remodel-estimate": {
    "cover": {
      "name": "construction-kitchen-remodel-estimate-welcome",
      "alt": "A bright white kitchen",
      "layout": "left"
    },
    "images": {
      "Home type": [
        "construction-kitchen-remodel-estimate-home-type-0",
        "construction-kitchen-remodel-estimate-home-type-1",
        "construction-kitchen-remodel-estimate-home-type-2"
      ]
    }
  },
  "general.franchise-inquiry": {
    "cover": {
      "name": "general-franchise-inquiry-welcome",
      "alt": "A busy cafe counter",
      "layout": "right"
    }
  },
  "hospitality.trip-planner": {
    "cover": {
      "name": "hospitality-trip-planner-welcome",
      "alt": "A hand pointing at a map",
      "layout": "right"
    }
  },
  "solar.ev-charger": {
    "images": {
      "Parking": [
        "solar-ev-charger-parking-0",
        "solar-ev-charger-parking-1",
        "solar-ev-charger-parking-2"
      ]
    }
  }
};
