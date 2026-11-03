// Construction and home services, solar and energy.
import { address, agree, company, CONTACT_PREF, date, drop, email, files, fullName, long, many, money, one, phone, sign, stars, text, TIMELINE, tpl, yesno } from "./build.ts";

const TRADES = ["Roofing", "Plumbing", "Electrical", "Heating and cooling", "Remodeling", "Landscaping", "Painting", "Flooring", "Other"];

export const CONSTRUCTION = [
  tpl("construction.free-estimate", "construction", "Free estimate", ["request", "lead"], "Estimate requests with photos and an address.", {
    featured: true,
    fields: [
      drop("Service", TRADES, { required: true, save: "service" }),
      address("Job address", { required: true }),
      long("Describe the project", { required: true }),
      files("Photos"),
      one("When do you want it done?", TIMELINE, { required: true, save: "timeline" }),
      fullName(),
      phone("Phone", { required: true }),
      email("Email"),
      one("Best way to reach you", CONTACT_PREF),
    ],
    submit: "Get my estimate",
    end: { title: "Thanks, we'll be in touch", text: "Want to lock in a site visit? Pick a time.", booking: true },
  }),
  tpl("construction.service-request", "construction", "Service request", ["request"], "Fast service calls with urgency up front.", {
    featured: true,
    fields: [
      fullName(),
      phone("Phone", { required: true }),
      email("Email", { required: false }),
      address("Service address", { required: true }),
      drop("What needs fixing?", TRADES, { required: true }),
      one("How urgent?", ["Emergency", "Today or tomorrow", "This week", "Flexible"], { required: true, save: "urgency" }),
      long("Details"),
    ],
    submit: "Request service",
    end: ["Request received", "We'll call you shortly to confirm a time."],
  }),
  tpl("construction.remodel-planner", "construction", "Remodel planner", ["intake", "lead"], "Scope a remodel by room, style and budget.", {
    pages: [
      { title: "The project", fields: [many("Rooms", ["Kitchen", "Bathroom", "Basement", "Living area", "Bedroom", "Whole home", "Outdoor"], { required: true }), one("Style", ["Modern", "Traditional", "Farmhouse", "Minimal", "Not sure yet"]), files("Photos of the space"), files("Ideas you like")] },
      { title: "Budget and timing", fields: [one("Budget", ["Under $25k", "$25k–$50k", "$50k–$100k", "$100k–$250k", "Over $250k"], { required: true, save: "budget" }), date("Ideal start date")] },
      { title: "Contact", fields: [fullName(), email("Email"), phone(), address("Project address")] },
    ],
    end: { title: "Thanks for the details", text: "Book a design consultation.", booking: true },
  }),
  tpl("construction.subcontractor", "construction", "Subcontractor application", ["application"], "Vet subs with license and insurance on file.", {
    internal: true,
    fields: [company("Company name", { required: true }), fullName("Contact name"), email("Email"), phone("Phone", { required: true }), drop("Trade", TRADES, { required: true }), text("License number", { required: true }), files("Insurance certificate", { required: true }), text("Areas served")],
    end: ["Application received", "We'll review your details and reach out."],
  }),
  tpl("construction.safety-check", "construction", "Job site safety check", ["intake"], "A daily safety walk with sign-off.", {
    internal: true,
    fields: [
      text("Site", { required: true }),
      date("Date", { required: true }),
      many("All clear", ["PPE worn", "Ladders secure", "Walkways clear", "Tools stored", "First aid kit stocked", "Fire extinguisher ready"]),
      long("Issues found"),
      files("Photos"),
      sign("Supervisor signature"),
    ],
    end: ["Saved", "Safety check recorded."],
  }),
  tpl("construction.warranty-claim", "construction", "Warranty claim", ["request"], "Take warranty claims with job details.", {
    fields: [fullName(), email("Email"), phone(), text("Job or invoice number", { required: true }), date("Install date"), long("What's wrong?", { required: true }), files("Photos")],
    end: ["Claim received", "We'll schedule an inspection."],
  }),
  tpl("construction.satisfaction", "construction", "Customer satisfaction", ["feedback", "survey"], "Ask for a rating after each job.", {
    fields: [stars("Overall rating", { required: true }), yesno("Did we arrive on time?"), yesno("Did we leave the site clean?"), yesno("Would you recommend us?"), long("Anything else?"), email("Email", { required: false })],
    end: ["Thank you", "We appreciate your business."],
  }),
];

export const SOLAR = [
  tpl("solar.savings-check", "solar", "Solar savings check", ["lead", "request"], "Qualify homeowners by bill, roof and ownership.", {
    featured: true,
    fields: [
      address("Home address", { required: true }),
      money("Average monthly power bill", { required: true, min: 0 }),
      one("Roof type", ["Asphalt shingle", "Metal", "Tile", "Flat", "Not sure"], { required: true }),
      one("Roof shade", ["No shade", "Some shade", "A lot of shade"], { required: true }),
      one("Do you own the home?", ["Own", "Rent"], { required: true }),
      fullName(),
      email("Email"),
      phone("Phone", { required: true }),
      agree("You may contact me about solar for my home."),
    ],
    submit: "See my savings",
    end: { title: "Your estimate is next", text: "Book a short call to get your savings report.", booking: true },
  }),
  tpl("solar.commercial-audit", "solar", "Commercial energy audit", ["lead", "request"], "Book energy audits for businesses.", {
    fields: [company("Business name", { required: true }), address("Site address", { required: true }), text("Building size (square feet)"), money("Monthly energy spend", { required: true }), fullName(), email(), phone()],
    end: { title: "Thanks", text: "Book your site audit.", booking: true },
  }),
  tpl("solar.ev-charger", "solar", "EV charger install", ["request", "booking"], "Quote home EV charger installs.", {
    fields: [address("Home address", { required: true }), one("Electrical panel", ["100 amp", "200 amp", "Not sure"], { required: true }), text("Vehicle make and model"), one("Parking", ["Garage", "Driveway", "Street"], { required: true }), files("Photo of your panel"), fullName(), email("Email"), phone()],
    end: { title: "Thanks", text: "Pick a time for an install visit.", booking: true },
  }),
];
