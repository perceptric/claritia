// Wave 1, orders and payments: orders, price calculators, payments, deposits, donations, subscriptions and
// sponsorships across food, retail, ecommerce, nonprofits, home services, solar, SaaS, farms, sports, faith and media.
import type { Cond } from "../types.ts";
import { address, agree, company, date, drop, email, email2, file, fullName, go, jobTitle, long, many, money, num, one, phone, phone2, range, sign, text, TIMELINE, tpl, website, when, yesno } from "./build.ts";

/** A calculation that reads earlier answers by key. Money in USD unless the format says otherwise. */
const calc = (label: string, key: string, formula: string, format: "money" | "number" | "percent" = "money", o: { visible?: boolean } = {}) => ({
  kind: "calc" as const,
  label,
  key,
  formula,
  format,
  ...(format === "money" ? { currency: "USD" } : {}),
  ...o,
});
/** A payment that charges a calculation. */
const pay = (label: string, from: string, o: { show?: Cond } = {}) => ({ kind: "payment" as const, label, from, currency: "USD", ...o });

const ADDED = "2026-11-03";

// Choices more than one field reads.
const FULL_SUN = "Full sun most of the day";
const CAMP_GRADES = ["Kindergarten", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];
const CAMP_WEEKS = ["Week 1", "Week 2", "Week 3", "Week 4", "Week 5", "Week 6"];
const CAMP_DAYS = ["Half day, $180 a week", "Full day, $295 a week"];

export const WAVE1_MONEY = [
  // Food
  tpl("food.custom-cake-order", "food", "Custom cake order", ["order", "request"], "Take custom cake orders with a deposit and a live price.", {
    cats: "order deposit calculator",
    teams: "sales operations",
    subs: "bakeries",
    added: ADDED,
    intro: "Tell us about your cake. We confirm every order within one business day.",
    pages: [
      {
        title: "Your cake",
        fields: [
          one("Size", ["6 inch, serves 8 to 10, $45", "8 inch, serves 14 to 18, $65", "10 inch, serves 24 to 30, $90", "Two tiers, serves 40 to 50, $180"], {
            required: true,
            key: "size",
            points: [45, 65, 90, 180],
            save: "cake_size",
          }),
          drop("Flavor", ["Vanilla", "Chocolate", "Red velvet", "Lemon", "Carrot", "Marble"], { required: true }),
          drop("Filling", ["Buttercream", "Chocolate ganache", "Raspberry", "Lemon curd", "Cream cheese"]),
          many("Extras", ["Fresh flowers, $25", "Custom topper, $20", "Printed photo, $15", "Gold leaf, $15"], { key: "extras", points: [25, 20, 15, 15] }),
          text("Message on the cake", { placeholder: "Happy birthday, Maya" }),
          file("Inspiration photo"),
        ],
      },
      {
        title: "Pickup or delivery",
        fields: [
          date("Date you need it", { required: true }),
          one("Pickup or delivery", ["Pickup", "Delivery, $20"], { required: true, key: "handoff", points: [0, 20] }),
          address("Delivery address", { required: true, show: when("handoff", "is", "Delivery, $20") }),
          fullName(),
          email("Email"),
          phone("Phone", { required: true }),
          calc("Estimated total", "total", "{size} + ifempty({extras}, 0) + {handoff}"),
          calc("Deposit due today", "deposit", "round({total} / 2)"),
          pay("Pay the deposit", "deposit"),
        ],
      },
    ],
    submit: "Place my order",
    end: ["Thanks, your order is in", "We'll confirm the details within one business day."],
  }),
  tpl("food.catering-calculator", "food", "Catering price calculator", ["order", "request"], "Price a catered event per guest and hold the date with a deposit.", {
    cats: "calculator order deposit",
    teams: "sales operations",
    subs: "catering",
    added: ADDED,
    intro: "Build your menu and see an estimate right away.",
    pages: [
      {
        title: "Your event",
        fields: [
          date("Event date", { required: true }),
          num("Number of guests", { required: true, min: 10, max: 1000, key: "guests", save: "guest_count" }),
          one("Menu", ["Boxed lunches, $16 per guest", "Hot buffet, $26 per guest", "Plated dinner, $42 per guest"], { required: true, key: "menu", points: [16, 26, 42], save: "menu" }),
          many("Add for every guest", ["Appetizers, $6", "Dessert, $5", "Drinks, $3"], { key: "addons", points: [6, 5, 3] }),
          one("Service", ["Drop-off", "Setup and cleanup, $150", "Full staff, $450"], { required: true, key: "service", points: [0, 150, 450], save: "service_type" }),
          many("Dietary needs", ["Vegetarian", "Vegan", "Gluten free", "Nut allergy", "Halal", "Kosher"]),
          address("Event address"),
        ],
      },
      {
        title: "Your estimate",
        fields: [
          fullName(),
          email("Email"),
          phone("Phone", { required: true }),
          calc("Estimated total", "total", "{guests} * ({menu} + ifempty({addons}, 0)) + {service}"),
          calc("Deposit to hold your date", "deposit", "round({total} * 0.25)"),
          pay("Pay the deposit", "deposit"),
        ],
      },
    ],
    submit: "Hold my date",
    end: ["Your date is on hold", "We'll send your menu and final quote within one business day."],
  }),
  tpl("food.gift-card-order", "food", "Gift card order", ["order"], "Sell restaurant gift cards by email or mail.", {
    cats: "order payment",
    teams: "sales marketing",
    subs: "restaurants",
    added: ADDED,
    pages: [
      {
        title: "Your gift card",
        fields: [
          one("Card amount", ["$25", "$50", "$100", "$150"], { required: true, key: "amount", points: [25, 50, 100, 150] }),
          num("How many cards?", { required: true, min: 1, max: 20, key: "qty" }),
          one("How should we send it?", ["Email it to them", "Mail a printed card, $3"], { required: true, key: "send", points: [0, 3] }),
        ],
      },
      {
        title: "The recipient",
        fields: [
          text("Recipient name", { required: true }),
          email2("Recipient email", { required: true, show: when("send", "is", "Email it to them") }),
          address("Mailing address", { required: true, show: when("send", "is", "Mail a printed card, $3") }),
          long("Gift message"),
        ],
      },
      {
        title: "Your details",
        fields: [
          fullName("Your name"),
          email("Your email"),
          calc("Total", "total", "{amount} * {qty} + {send}"),
          pay("Pay now", "total"),
        ],
      },
    ],
    submit: "Buy gift card",
    end: ["Thanks for your order", "The gift card goes out within one business day. Your receipt is in your inbox."],
  }),

  // Retail
  tpl("retail.layaway-plan", "retail", "Layaway plan", ["order"], "Hold an item with a down payment and set weekly payments.", {
    cats: "deposit payment calculator",
    teams: "sales finance operations",
    added: ADDED,
    intro: "Hold an item with a down payment and pay the rest over time.",
    pages: [
      {
        title: "The item",
        fields: [
          text("Item", { required: true, placeholder: "Item name or tag number" }),
          money("Price on the tag", { required: true, min: 1, key: "price" }),
          one("Pay it off over", ["4 weeks", "8 weeks", "12 weeks"], { required: true, key: "weeks", points: [4, 8, 12], save: "layaway_term" }),
          calc("Down payment today", "down", "max(round({price} * 0.2), 10)"),
          calc("Each weekly payment", "weekly", "ceil(({price} - {down}) / {weeks})"),
        ],
      },
      {
        title: "Your details",
        fields: [
          fullName(),
          email("Email"),
          phone("Phone", { required: true }),
          agree("I agree to the layaway terms."),
          pay("Pay the down payment", "down"),
        ],
      },
    ],
    submit: "Hold my item",
    end: ["Your item is on hold", "We'll email your payment schedule and remind you before each payment."],
  }),
  tpl("retail.flower-subscription", "retail", "Flower subscription", ["order", "registration"], "Sign up flower club members and take the first month.", {
    cats: "subscription order payment",
    teams: "sales operations",
    added: ADDED,
    intro: "Fresh flowers on your schedule. Change or pause anytime.",
    pages: [
      {
        title: "Your bouquet",
        fields: [
          one("Bouquet size", ["Petite, $35", "Classic, $55", "Grand, $85"], { required: true, key: "bouquet", points: [35, 55, 85], save: "bouquet_size" }),
          one("How often?", ["Every week", "Every two weeks", "Every month"], { required: true, key: "often", points: [4, 2, 1], save: "frequency" }),
          one("Pickup or delivery", ["Pickup in store", "Delivery, $8 each time"], { required: true, key: "handoff", points: [0, 8] }),
          address("Delivery address", { required: true, show: when("handoff", "is", "Delivery, $8 each time") }),
        ],
      },
      {
        title: "Your flowers",
        fields: [
          many("Flowers you love", ["Roses", "Tulips", "Peonies", "Lilies", "Seasonal mix"]),
          text("Anything to leave out?", { placeholder: "Allergies or flowers you don't like" }),
          date("First delivery date", { required: true }),
        ],
      },
      {
        title: "Your details",
        fields: [
          fullName(),
          email("Email"),
          phone(),
          calc("Monthly price", "monthly", "({bouquet} + {handoff}) * {often}"),
          pay("Pay the first month", "monthly"),
        ],
      },
    ],
    submit: "Start my subscription",
    end: ["You're subscribed", "We'll confirm your first delivery by email."],
  }),

  // Ecommerce
  tpl("ecommerce.subscribe-and-save", "ecommerce", "Subscribe and save", ["order", "registration"], "Start box subscriptions with prepay discounts.", {
    cats: "subscription order payment",
    teams: "marketing operations",
    added: ADDED,
    intro: "Pick your box and how often. Prepay for more boxes and save.",
    fields: [
      one("Box", ["Starter box, $29", "Family box, $49", "Deluxe box, $79"], { required: true, key: "box", points: [29, 49, 79], save: "box_size" }),
      one("Deliver every", ["Month", "Two months"], { required: true, save: "frequency" }),
      one("Prepay", ["1 box", "3 boxes, save 10%", "6 boxes, save 15%"], { required: true, key: "boxes", points: [1, 3, 6] }),
      many("Add to each box", ["Gift wrap, $5", "Sample pack, $7"], { key: "extras", points: [5, 7] }),
      address("Shipping address", { required: true }),
      fullName(),
      email("Email"),
      calc("Due today", "due", "round(({box} + ifempty({extras}, 0)) * {boxes} * if({boxes} >= 6, 0.85, if({boxes} >= 3, 0.9, 1)))"),
      pay("Pay and subscribe", "due"),
    ],
    submit: "Start my subscription",
    end: ["Your subscription has started", "Your first box ships within three business days."],
  }),
  tpl("ecommerce.custom-merch-order", "ecommerce", "Custom merch order", ["order", "request", "lead"], "Price printed merch by item, quantity and colors.", {
    cats: "order calculator",
    teams: "sales operations",
    added: ADDED,
    intro: "See your price as you go. Bigger orders cost less per item.",
    pages: [
      {
        title: "Your order",
        fields: [
          one("Product", ["T-shirt, $12", "Hoodie, $28", "Cap, $14", "Tote bag, $9", "Mug, $8"], { required: true, key: "item", points: [12, 28, 14, 9, 8], save: "product" }),
          num("Quantity", { required: true, min: 12, max: 5000, key: "qty", help: "12 or more. 50 or more saves 8%, 100 or more saves 15%." }),
          one("Print", ["Front only", "Front and back, $4 more each"], { required: true, key: "print", points: [0, 4] }),
          num("Colors in the design", { required: true, min: 1, max: 6, key: "colors", help: "Setup is $25 per color." }),
          many("Sizes needed", ["XS", "S", "M", "L", "XL", "XXL"], { show: when("item", "any", ["T-shirt, $12", "Hoodie, $28"]) }),
          file("Artwork"),
          date("Date you need it by", { required: true }),
          calc("Estimated total", "total", "round(({item} + {print}) * {qty} * if({qty} >= 100, 0.85, if({qty} >= 50, 0.92, 1)) + {colors} * 25)"),
        ],
      },
      { title: "Your details", fields: [fullName(), email("Email"), company("Team or company"), phone()] },
    ],
    submit: "Request my order",
    end: ["Order request received", "We'll send a proof and final price within one business day."],
  }),

  // Nonprofits
  tpl("nonprofit.online-donation", "nonprofit", "Online donation", ["order"], "Take one-time and monthly gifts with an option to cover fees.", {
    cats: "donation payment",
    teams: "marketing finance founders",
    added: ADDED,
    intro: "Your gift goes straight to our programs.",
    pages: [
      {
        title: "Your gift",
        fields: [
          one("How often?", ["One time", "Every month"], { required: true, save: "gift_frequency" }),
          one("Amount", ["$25", "$50", "$100", "$250", "Other amount"], { required: true, key: "amount", points: [25, 50, 100, 250, 0] }),
          money("Other amount", { required: true, min: 5, key: "other_amount", show: when("amount", "is", "Other amount") }),
          yesno("Add $3 to cover card fees?", { key: "fees", points: [3, 0] }),
          yesno("Is this gift in honor or memory of someone?", { key: "tribute" }),
          text("Their name", { required: true, show: when("tribute", "is", "Yes") }),
        ],
      },
      {
        title: "Your details",
        fields: [
          fullName(),
          email("Email"),
          address("Address for your tax receipt"),
          calc("Total", "total", "round({amount} + ifempty({other_amount}, 0) + ifempty({fees}, 0), 2)", "number", { visible: false }),
          pay("Your gift", "total"),
        ],
      },
    ],
    submit: "Give",
    end: ["Thank you for your gift", "Your receipt is on its way by email."],
  }),
  tpl("nonprofit.student-sponsorship", "nonprofit", "Student sponsorship", ["order", "registration"], "Sign up monthly sponsors who cover a student's school costs.", {
    cats: "sponsorship donation subscription",
    teams: "marketing finance",
    added: ADDED,
    intro: "Cover a student's school costs each month. You'll get updates through the year.",
    pages: [
      {
        title: "Your sponsorship",
        fields: [
          one("Monthly amount per student", ["$30, school supplies", "$50, supplies and meals", "$80, a full school year"], { required: true, key: "level", points: [30, 50, 80], save: "sponsor_level" }),
          num("How many students?", { required: true, min: 1, max: 10, key: "students" }),
          one("Age group", ["No preference", "Primary school", "Secondary school"]),
          one("How would you like updates?", ["Email", "Mail", "Both"]),
          yesno("Would you like to write to your student?"),
        ],
      },
      {
        title: "Your details",
        fields: [
          fullName(),
          email("Email"),
          phone(),
          calc("Monthly total", "monthly", "{level} * {students}"),
          pay("Pay the first month", "monthly"),
        ],
      },
    ],
    submit: "Sponsor",
    end: ["Thank you for sponsoring", "We'll introduce your student by email within two weeks."],
  }),
  tpl("nonprofit.gala-sponsorship", "nonprofit", "Gala sponsorship", ["order", "lead"], "Sell gala sponsor levels and extra tickets, by card or invoice.", {
    cats: "sponsorship donation",
    teams: "events marketing finance",
    added: ADDED,
    intro: "Support our annual gala and put your name in front of our guests.",
    pages: [
      {
        title: "Your sponsorship",
        fields: [
          one("Sponsor level", ["Presenting, $10,000", "Gold, $5,000", "Silver, $2,500", "Table host, $1,500"], { required: true, key: "level", points: [10000, 5000, 2500, 1500], save: "sponsor_level" }),
          num("Extra tickets at $150 each", { min: 0, max: 20, key: "tickets" }),
          text("Name as it should appear", { required: true, placeholder: "Company or family name" }),
          file("Logo"),
          calc("Total", "total", "{level} + ifempty({tickets}, 0) * 150"),
        ],
      },
      {
        title: "Contact and payment",
        fields: [
          fullName(),
          email(),
          company("Company or organization"),
          phone(),
          one("How would you like to pay?", ["Card now", "Send an invoice", "Check"], { required: true, key: "pay_by", points: [1, 0, 0] }),
          calc("Due by card", "card_due", "{total} * {pay_by}", "money", { visible: false }),
          pay("Pay by card", "card_due", { show: when("pay_by", "is", "Card now") }),
        ],
      },
    ],
    submit: "Confirm sponsorship",
    end: ["Thank you for your support", "We'll confirm your sponsorship and send your benefits within two business days."],
  }),

  // Photography and creative
  tpl("creative.wedding-photo-package", "creative", "Wedding photography package", ["order", "booking"], "Let couples build a wedding package and pay a retainer.", {
    cats: "deposit calculator payment",
    teams: "sales founders",
    subs: "photography",
    added: ADDED,
    intro: "Build your wedding package and hold your date with a retainer.",
    pages: [
      {
        title: "Your wedding",
        fields: [
          date("Wedding date", { required: true }),
          text("Venue and city", { required: true }),
          one("Coverage", ["4 hours, $1,800", "6 hours, $2,600", "8 hours, $3,200", "Full day, 10 hours, $3,900"], { required: true, key: "coverage", points: [1800, 2600, 3200, 3900], save: "coverage" }),
          yesno("Add a second photographer for $500?", { required: true, key: "second", points: [500, 0] }),
          many("Add-ons", ["Engagement session, $400", "Rehearsal dinner, $600", "Printed album, $750", "Parent albums, $350", "Next-day preview, $150"], { key: "addons", points: [400, 600, 750, 350, 150] }),
          num("Guest count", { min: 0, max: 1000 }),
          long("Anything we should know?"),
        ],
      },
      {
        title: "Hold your date",
        fields: [
          fullName(),
          text("Partner's name"),
          email("Email"),
          phone(),
          calc("Package total", "total", "{coverage} + {second} + ifempty({addons}, 0)"),
          calc("Retainer to hold your date", "retainer", "round({total} * 0.3)"),
          pay("Pay the retainer", "retainer"),
        ],
      },
    ],
    submit: "Hold my date",
    end: ["Your date is held", "We'll send your contract and a planning guide within two business days."],
  }),

  // Construction and home services
  tpl("construction.carpet-cleaning-order", "construction", "Carpet cleaning order", ["order", "booking"], "Price carpet cleaning by room and take payment when it's booked.", {
    cats: "order payment calculator",
    teams: "sales operations",
    subs: "cleaning",
    added: ADDED,
    intro: "Price your carpet cleaning and book it in one go.",
    pages: [
      {
        title: "What we're cleaning",
        fields: [
          num("Rooms", { required: true, min: 1, max: 20, key: "rooms", help: "$45 a room, up to 250 square feet. Larger rooms count as two. $120 minimum." }),
          many("Add to every room", ["Pet odor treatment, $15", "Stain protector, $10"], { key: "treat", points: [15, 10] }),
          num("Staircases, $30 each", { min: 0, max: 5, key: "stairs" }),
          num("Area rugs, $40 each", { min: 0, max: 10, key: "rugs" }),
          calc("Total", "total", "max({rooms} * (45 + ifempty({treat}, 0)) + ifempty({stairs}, 0) * 30 + ifempty({rugs}, 0) * 40, 120)"),
        ],
      },
      {
        title: "Book it",
        fields: [
          date("Preferred date", { required: true }),
          one("Arrival window", ["Morning", "Afternoon"], { required: true }),
          address("Address", { required: true }),
          fullName(),
          email("Email"),
          phone("Phone", { required: true }),
          pay("Pay now", "total"),
        ],
      },
    ],
    submit: "Book my cleaning",
    end: ["Your cleaning is booked", "We'll text you the day before with your arrival time."],
  }),
  tpl("construction.roofing-approval", "construction", "Roofing estimate approval", ["order"], "Get estimates signed, colors picked and the deposit paid.", {
    cats: "deposit payment",
    teams: "sales operations finance",
    subs: "roofing",
    added: ADDED,
    intro: "Approve your estimate, pick your colors and pay the deposit to get on the schedule.",
    pages: [
      {
        title: "Your project",
        fields: [
          text("Estimate number", { required: true }),
          address("Property address", { required: true }),
          money("Estimate total", { required: true, min: 100, key: "estimate" }),
          drop("Roof color", ["Charcoal", "Weathered wood", "Slate gray", "Desert tan", "Black", "Other"], { required: true, save: "roof_color" }),
          drop("Trim and drip edge color", ["White", "Black", "Brown", "Bronze", "Match the roof"]),
          one("When would you like us to start?", ["As soon as possible", "On a specific date"], { required: true, key: "start" }),
          date("Start date", { required: true, show: when("start", "is", "On a specific date") }),
        ],
      },
      {
        title: "Approve and pay",
        fields: [
          fullName(),
          email("Email"),
          phone("Phone", { required: true }),
          agree("I approve the estimate and the contract terms."),
          sign("Signature"),
          calc("Deposit", "deposit", "round({estimate} * 0.1, 2)", "number", { visible: false }),
          pay("Deposit, 10% of the estimate", "deposit"),
        ],
      },
    ],
    submit: "Approve and pay",
    end: ["You're on the schedule", "We'll confirm your start date and order materials within two business days."],
  }),
  tpl("construction.mulch-stone-order", "construction", "Mulch and stone order", ["order"], "Work out cubic yards from the area and sell mulch, soil and stone.", {
    cats: "order calculator payment",
    teams: "sales operations",
    subs: "landscaping",
    added: ADDED,
    intro: "Tell us the area and we'll work out how much you need.",
    pages: [
      {
        title: "Your order",
        fields: [
          one("Material", ["Brown mulch, $38 a yard", "Black mulch, $40 a yard", "Topsoil, $32 a yard", "Pea gravel, $55 a yard", "River rock, $85 a yard"], { required: true, key: "material", points: [38, 40, 32, 55, 85], save: "material" }),
          num("Area to cover in square feet", { required: true, min: 10, max: 50000, key: "area" }),
          one("Depth", ["2 inches", "3 inches", "4 inches"], { required: true, key: "depth", points: [2, 3, 4] }),
          calc("Cubic yards you need", "yards", "ceil({area} * {depth} / 324)", "number"),
          one("Pickup or delivery", ["Pickup at our yard", "Delivery, $65"], { required: true, key: "handoff", points: [0, 65] }),
          address("Delivery address", { required: true, show: when("handoff", "is", "Delivery, $65") }),
          text("Where should we leave it?", { placeholder: "Left side of the driveway", show: when("handoff", "is", "Delivery, $65") }),
          date("Date you'd like it", { required: true }),
          calc("Total", "total", "{yards} * {material} + {handoff}"),
        ],
      },
      { title: "Your details", fields: [fullName(), email("Email"), phone("Phone", { required: true }), pay("Pay now", "total")] },
    ],
    submit: "Place my order",
    end: ["Your order is in", "We'll confirm the delivery window by text the day before."],
  }),

  // Solar
  tpl("solar.savings-calculator", "solar", "Solar savings calculator", ["lead", "request"], "Show yearly solar savings and system size from one bill.", {
    version: 2,
    cats: "calculator lead-generation",
    teams: "marketing sales",
    added: ADDED,
    intro: "See what solar could save you. Takes about 3 minutes.",
    pages: [
      {
        title: "Your home",
        fields: [
          fullName(),
          email("Email"),
          phone(),
          address("Home address", { required: true }),
          one("Type of home", ["Single-family house", "Townhouse", "Condo", "Mobile home"], { required: true }),
        ],
      },
      {
        title: "Your roof",
        fields: [
          yesno("Do you own the home?", { required: true }),
          one("Roof age", ["Under 10 years", "10 to 20 years", "Over 20 years", "Not sure"], { show: when("Do you own the home?", "is", true) }),
          one("Roof material", ["Asphalt shingles", "Metal", "Tile", "Wood shakes", "Not sure"], { show: when("Do you own the home?", "is", true) }),
          one("Which way does most of your roof face?", ["South", "East or west", "North", "It's flat", "Not sure"], { required: true, key: "facing", points: [1, 0.85, 0.7, 0.9, 0.85], show: when("Do you own the home?", "is", true) }),
        ],
        jumps: [go("Do you own the home?", "is", false, "end")],
      },
      {
        title: "Your bills",
        fields: [
          money("Average monthly electric bill", { required: true, min: 20, key: "bill", save: "electric_bill" }),
          text("Electric company"),
          one("How much of your bill should solar cover?", ["All of it", "About three quarters", "About half"], { required: true, key: "cover", points: [1, 0.75, 0.5] }),
          many("Plans that will add to your power use", ["Electric car", "Heat pump", "Pool or hot tub", "Home addition", "None"]),
          file("A recent electric bill"),
        ],
      },
      {
        title: "Shade and timing",
        fields: [
          one("How much sun does your roof get?", [FULL_SUN, "Some shade", "Lots of shade", "Not sure"], { required: true, key: "sun", points: [1, 0.85, 0.65, 0.85] }),
          many("What shades your roof?", ["Trees", "Nearby buildings", "Chimneys or vents"], { show: when("sun", "not", FULL_SUN) }),
          one("When would you like to go solar?", TIMELINE),
          yesno("Interested in a home battery?"),
        ],
      },
      {
        title: "Your savings",
        fields: [
          calc("System size you'd need, in kW", "system", "round({bill} * {cover} / 0.16 / 120, 1)", "number"),
          calc("Estimated yearly savings", "yearly", "round({bill} * 12 * {cover} * 0.8 * {sun} * {facing})"),
          calc("Estimated savings over 25 years", "lifetime", "{yearly} * 25"),
          calc("Estimated monthly bill after solar", "new_bill", "round(max({bill} - {yearly} / 12, 0))"),
          one("Best time for a call", ["Morning", "Afternoon", "Evening"]),
        ],
      },
    ],
    submit: "Get my report",
    end: { title: "Thanks, we have your details", text: "Pick a time for a free design call. We'll go over exact numbers and your options.", booking: true },
  }),

  // SaaS
  tpl("saas.roi-calculator", "saas", "ROI calculator", ["lead"], "Show the return on your product and capture the buyer.", {
    cats: "calculator qualify",
    teams: "marketing sales",
    added: ADDED,
    intro: "See how much time and money your team could get back.",
    pages: [
      {
        title: "Your team",
        fields: [
          num("People on the team", { required: true, min: 1, max: 10000, key: "people", save: "seats" }),
          num("Hours each person spends on manual work each week", { required: true, min: 1, max: 40, key: "hours" }),
          money("Average hourly cost per person", { required: true, min: 1, key: "rate", help: "Pay plus benefits, divided by hours worked." }),
          one("How much of that work could be automated?", ["About a quarter", "About half", "Most of it"], { required: true, key: "share", points: [0.25, 0.5, 0.75] }),
          calc("Hours saved per year", "hours_saved", "round({people} * {hours} * {share} * 48)", "number"),
          calc("Value of time saved per year", "value", "{hours_saved} * {rate}"),
          calc("Yearly cost at $25 per seat", "cost", "{people} * 25 * 12"),
          calc("Return on investment", "roi", "round(({value} - {cost}) / {cost} * 100)", "percent"),
        ],
      },
      { title: "Get the full report", fields: [fullName(), email(), company(undefined, { required: true }), jobTitle()] },
    ],
    submit: "Send my report",
    end: { title: "Your report is on its way", text: "Want to walk through it? Pick a time with our team.", booking: true },
  }),

  // Agriculture
  tpl("agriculture.csa-share", "agriculture", "CSA farm share", ["order", "registration"], "Sell farm shares for the season with add-ons and pay plans.", {
    cats: "subscription order payment",
    teams: "sales operations founders",
    added: ADDED,
    intro: "Fresh produce from our farm every week of the season.",
    pages: [
      {
        title: "Your share",
        fields: [
          one("Share size", ["Half share, $22 a week", "Full share, $38 a week"], { required: true, key: "share", points: [22, 38], save: "share_size" }),
          one("Season", ["Summer, 20 weeks", "Fall, 10 weeks", "Summer and fall, 30 weeks"], { required: true, key: "weeks", points: [20, 10, 30], save: "season" }),
          many("Weekly add-ons", ["Eggs, $6", "Bread, $7", "Flowers, $8", "Cheese, $9"], { key: "addons", points: [6, 7, 8, 9] }),
          drop("Pickup spot", ["At the farm, Saturday", "Farmers market, Sunday", "Downtown, Wednesday", "Home delivery, $5 a week"], { required: true, key: "pickup", points: [0, 0, 0, 5] }),
          address("Delivery address", { required: true, show: when("pickup", "is", "Home delivery, $5 a week") }),
          one("Payment plan", ["Pay in full", "Pay half now and half at midseason"], { required: true, key: "plan", points: [1, 0.5] }),
        ],
      },
      {
        title: "Your details",
        fields: [
          fullName(),
          email("Email"),
          phone(),
          calc("Season total", "season_total", "({share} + ifempty({addons}, 0) + {pickup}) * {weeks}"),
          calc("Due today", "due", "round({season_total} * {plan})"),
          pay("Pay now", "due"),
        ],
      },
    ],
    submit: "Join the farm",
    end: ["Welcome to the farm", "We'll email your pickup details before the first week."],
  }),

  // Sports
  tpl("sports.season-registration", "sports", "Season registration and fees", ["registration", "order"], "Register players and collect season fees with sibling discounts.", {
    cats: "registration payment calculator",
    teams: "operations finance volunteers",
    added: ADDED,
    intro: "Register your players and pay the season fees in one step.",
    pages: [
      {
        title: "Players",
        fields: [
          one("Program", ["Recreational league, $120", "Travel team, $350", "Skills clinic, $95"], { required: true, key: "program", points: [120, 350, 95], save: "program" }),
          num("How many players are you registering?", { required: true, min: 1, max: 6, key: "players", help: "Each extra player gets $20 off." }),
          long("Player names and birth dates", { required: true, placeholder: "One player per line" }),
          yesno("Uniform kit for each player, $45?", { required: true, key: "uniform", points: [45, 0] }),
          calc("Season fees", "fees", "({program} + {uniform}) * {players} - ({players} - 1) * 20"),
        ],
      },
      {
        title: "Parent or guardian",
        fields: [
          fullName("Parent or guardian name"),
          email("Email"),
          phone("Phone", { required: true }),
          text("Emergency contact name and phone", { required: true }),
          agree("I agree to the club's code of conduct and refund policy."),
          pay("Pay season fees", "fees"),
        ],
      },
    ],
    submit: "Register",
    end: ["Your players are registered", "We'll email team placements and the schedule before the season starts."],
  }),
  tpl("sports.sponsor-signup", "sports", "Club sponsor sign-up", ["order", "lead"], "Sell jersey, banner and program sponsorships to local businesses.", {
    cats: "sponsorship payment",
    teams: "sales marketing volunteers",
    added: ADDED,
    intro: "Back our club and put your business in front of local families.",
    pages: [
      {
        title: "Your package",
        fields: [
          one("Package", ["Jersey sponsor, $2,500", "Field banner, $800", "Program ad, $250", "Team supporter, $100"], { required: true, key: "package", points: [2500, 800, 250, 100], save: "sponsor_level" }),
          many("Add-ons", ["Social media thank-you post, $50", "Booth at tournament day, $150"], { key: "addons", points: [50, 150] }),
        ],
      },
      {
        title: "Your business",
        fields: [
          company("Business name", { required: true }),
          website(),
          file("Logo", { show: when("package", "not", "Team supporter, $100") }),
        ],
      },
      {
        title: "Your details",
        fields: [
          fullName(),
          email(),
          phone(),
          calc("Total", "total", "{package} + ifempty({addons}, 0)"),
          pay("Pay now", "total"),
        ],
      },
    ],
    submit: "Become a sponsor",
    end: ["Thank you for supporting the club", "We'll confirm where your logo goes and send a receipt."],
  }),

  // Faith communities
  tpl("faith.online-giving", "faith", "Online giving", ["order"], "Take tithes and offerings by fund, once or on a schedule.", {
    cats: "donation payment",
    teams: "finance operations volunteers",
    added: ADDED,
    mode: "screens",
    intro: "Thank you for your generosity.",
    fields: [
      drop("Fund", ["General offering", "Tithe", "Building fund", "Missions", "Benevolence"], { required: true, save: "giving_fund" }),
      money("Amount", { required: true, min: 1, key: "gift" }),
      one("How often?", ["One time", "Every week", "Every month"], { required: true, save: "giving_frequency" }),
      yesno("Add 3% to cover processing fees?", { key: "cover", points: [1, 0] }),
      fullName(),
      email("Email"),
      text("Giving number", { placeholder: "If you have one" }),
      calc("Total gift", "total", "round({gift} * (1 + 0.03 * ifempty({cover}, 0)), 2)", "number", { visible: false }),
      pay("Your gift", "total"),
    ],
    submit: "Give",
    end: ["Thank you for your gift", "A receipt is on its way to your email."],
  }),

  // Media and publishing
  tpl("media.subscription-signup", "media", "Publication subscription", ["order", "registration"], "Sell digital and print subscriptions, gifts included.", {
    cats: "subscription payment",
    teams: "marketing operations",
    added: ADDED,
    intro: "Local news you can count on. Cancel anytime.",
    pages: [
      {
        title: "Your plan",
        fields: [
          one("Plan", ["Digital, $8 a month", "Weekend print and digital, $12 a month", "Print and digital, $18 a month"], { required: true, key: "plan", points: [8, 12, 18], save: "plan" }),
          one("Billing", ["Every month", "Every year, 2 months free"], { required: true, key: "term", points: [1, 10], save: "billing" }),
          address("Delivery address", { required: true, show: when("plan", "not", "Digital, $8 a month") }),
        ],
      },
      {
        title: "Gifts and newsletters",
        fields: [
          yesno("Is this a gift?", { key: "gift" }),
          text("Recipient name", { required: true, show: when("gift", "is", "Yes") }),
          email2("Recipient email", { required: true, show: when("gift", "is", "Yes") }),
          many("Newsletters", ["Morning briefing", "Local sports", "Food and dining", "Weekend events"]),
        ],
      },
      {
        title: "Your details",
        fields: [
          fullName(),
          email("Email"),
          calc("Due today", "due", "{plan} * {term}"),
          pay("Subscribe", "due"),
        ],
      },
    ],
    submit: "Subscribe",
    end: ["You're subscribed", "Check your email to set up your account and start reading."],
  }),

  // Events
  tpl("events.sponsorship-builder", "events", "Sponsorship package builder", ["order", "lead", "request"], "Let sponsors build a package and see the price.", {
    cats: "sponsorship calculator order",
    teams: "events sales",
    subs: "conferences",
    added: ADDED,
    intro: "Build your package and see the price. We'll send a contract to sign.",
    pages: [
      {
        title: "Your package",
        fields: [
          one("Level", ["Title, $20,000", "Gold, $10,000", "Silver, $5,000", "Bronze, $2,500", "No level, add-ons only"], { required: true, key: "level", points: [20000, 10000, 5000, 2500, 0], save: "sponsor_level" }),
          many("Add-ons", ["Exhibit booth, $3,000", "Lunch sponsor, $4,000", "Coffee bar, $2,500", "Lanyards, $2,000", "Ad in the program, $750"], { key: "addons", points: [3000, 4000, 2500, 2000, 750] }),
          num("Extra full passes, $400 each", { min: 0, max: 50, key: "passes" }),
          many("Goals", ["Brand awareness", "Leads", "Hiring", "Product launch", "Thought leadership"]),
          calc("Package total", "total", "{level} + ifempty({addons}, 0) + ifempty({passes}, 0) * 400"),
        ],
      },
      { title: "Your details", fields: [fullName(), email(), company(undefined, { required: true }), jobTitle(), phone(), long("Anything else?")] },
    ],
    submit: "Save my package",
    end: { title: "Thanks, your package is saved", text: "Pick a time with our partnerships team to finalize it.", booking: true },
  }),

  // Hospitality
  tpl("hospitality.rental-deposit", "hospitality", "Vacation rental booking", ["booking", "order"], "Price a stay and hold the dates with a deposit.", {
    cats: "deposit reservation calculator",
    teams: "operations sales",
    subs: "vacation-rentals",
    added: ADDED,
    intro: "Check the price and hold your dates with a deposit.",
    pages: [
      {
        title: "Your stay",
        fields: [
          range("Dates", { required: true }),
          num("Nights", { required: true, min: 2, max: 30, key: "nights" }),
          one("Place", ["Garden studio, $140 a night", "Two bedroom cottage, $220 a night", "Lake house, $380 a night"], { required: true, key: "unit", points: [140, 220, 380], save: "rental_unit" }),
          num("Guests", { required: true, min: 1, max: 12 }),
          one("Pets", ["No pets", "One pet, $50", "Two pets, $90"], { required: true, key: "pets", points: [0, 50, 90] }),
          calc("Stay total with $95 cleaning", "total", "{nights} * {unit} + 95 + {pets}"),
          calc("Deposit today", "deposit", "round({total} * 0.3)"),
        ],
      },
      {
        title: "Reserve",
        fields: [
          fullName(),
          email("Email"),
          phone("Phone", { required: true }),
          text("Special requests"),
          agree("I agree to the house rules and cancellation policy."),
          pay("Pay the deposit", "deposit"),
        ],
      },
    ],
    submit: "Hold my dates",
    end: ["Your dates are on hold", "We'll confirm your stay and send check-in details a week before you arrive."],
  }),

  // Fitness
  tpl("fitness.gym-membership", "fitness", "Gym membership sign-up", ["registration", "order"], "Sign up members online and take the first payment.", {
    cats: "subscription payment",
    teams: "sales operations",
    subs: "gyms",
    added: ADDED,
    intro: "Join online. Your first payment covers your first month.",
    pages: [
      {
        title: "Your membership",
        fields: [
          one("Membership", ["Off-peak, $29 a month", "Standard, $45 a month", "All access with classes, $69 a month"], { required: true, key: "plan", points: [29, 45, 69], save: "membership" }),
          one("Commitment", ["Month to month, $49 joining fee", "12 months, no joining fee"], { required: true, key: "commit", points: [49, 0], save: "commitment" }),
          many("Add-ons", ["Towel service, $8 a month", "Locker, $12 a month", "Four personal training sessions, $160 a month"], { key: "addons", points: [8, 12, 160] }),
          date("Start date", { required: true }),
          calc("Due today", "due", "{plan} + {commit} + ifempty({addons}, 0)"),
        ],
      },
      {
        title: "Your details",
        fields: [
          fullName(),
          email("Email"),
          phone("Phone", { required: true }),
          date("Date of birth", { required: true }),
          text("Emergency contact name and phone", { required: true }),
          agree("I agree to the membership terms."),
          sign("Signature"),
          pay("Pay and join", "due"),
        ],
      },
    ],
    submit: "Join",
    end: ["Welcome to the gym", "Your membership card and first visit details are in your inbox."],
  }),

  // Any business
  tpl("general.invoice-payment", "general", "Invoice payment", ["order"], "Let clients pay an invoice by card.", {
    cats: "payment",
    teams: "finance operations founders",
    added: ADDED,
    intro: "Pay an invoice by card.",
    fields: [
      text("Invoice number", { required: true }),
      money("Amount", { required: true, min: 1, key: "amount" }),
      fullName(),
      email("Email"),
      company(),
      long("Notes"),
      calc("Amount due", "due", "round({amount}, 2)", "number", { visible: false }),
      pay("Pay invoice", "due"),
    ],
    submit: "Pay",
    end: ["Thank you", "A receipt is on its way to your email."],
  }),

  // Education
  tpl("education.summer-camp", "education", "Summer camp sign-up", ["registration", "order"], "Sign campers up by the week and take a deposit.", {
    version: 2,
    cats: "deposit payment calculator",
    teams: "operations teachers finance",
    subs: "childcare",
    added: ADDED,
    cover: { title: "Summer camp sign-up", text: "About 8 minutes. Pick your weeks, then hold your spot with a deposit.", button: "Start" },
    resume: true,
    copy: true,
    pages: [
      {
        title: "Camper",
        fields: [
          text("Camper's name", { required: true }),
          date("Camper's date of birth", { required: true }),
          drop("Grade this fall", CAMP_GRADES, { required: true }),
          many("Weeks", CAMP_WEEKS, { required: true, key: "weeks", points: [1, 1, 1, 1, 1, 1] }),
          one("Day", CAMP_DAYS, { required: true, key: "day", points: [180, 295], save: "camp_day" }),
          yesno("Add after care until 6 pm, $60 a week?", { required: true, key: "after", points: [60, 0] }),
          one("How many campers are you signing up?", ["One", "Two"], { required: true, key: "campers", points: [1, 2] }),
        ],
        skip: go("campers", "is", "One", "Parent or guardian"),
      },
      {
        title: "Second camper",
        fields: [
          text("Second camper's name", { required: true }),
          date("Second camper's date of birth", { required: true }),
          drop("Second camper's grade this fall", CAMP_GRADES, { required: true }),
          many("Weeks for the second camper", CAMP_WEEKS, { required: true, key: "weeks_two", points: [1, 1, 1, 1, 1, 1] }),
          one("Day for the second camper", CAMP_DAYS, { required: true, key: "day_two", points: [180, 295] }),
          yesno("After care for the second camper, $60 a week?", { required: true, key: "after_two", points: [60, 0] }),
        ],
      },
      {
        title: "Parent or guardian",
        fields: [
          fullName("Parent or guardian name"),
          email("Email"),
          phone("Phone", { required: true }),
          address("Home address"),
          text("Second parent or guardian name"),
          phone2("Second parent or guardian phone"),
        ],
      },
      {
        title: "Medical",
        fields: [
          long("Allergies and what to do if there's a reaction"),
          long("Medicines to take at camp"),
          long("Health conditions staff should know about"),
          text("Doctor's name and phone"),
          file("Camp health form"),
        ],
      },
      {
        title: "Pickup",
        fields: [
          one("How will your camper get home?", ["A parent picks up", "Someone on the pickup list", "Walks or bikes home"], { required: true }),
          long("Other people allowed to pick up", { placeholder: "Name, relationship and phone for each" }),
          text("Emergency contact name", { required: true, half: true }),
          phone2("Emergency contact phone", { required: true, half: true }),
        ],
      },
      {
        title: "Consent",
        fields: [
          agree("My camper may take part in all camp activities, including swimming and field trips."),
          agree("If I can't be reached, staff may get emergency medical care for my camper."),
          yesno("May we use photos of your camper in camp emails and social media?"),
          sign("Parent or guardian signature"),
        ],
      },
      {
        title: "Payment",
        fields: [
          // The second camper counts only while two are signed up, so answers left on a skipped page never add to the bill.
          calc("Camp total", "total", "{weeks} * ({day} + {after}) + ({campers} == 2) * ifempty({weeks_two} * ({day_two} + {after_two}), 0)"),
          calc("Deposit today, $50 a week", "deposit", "({weeks} + ({campers} == 2) * ifempty({weeks_two}, 0)) * 50"),
          agree("I understand the rest of the camp fee is due before camp starts."),
          pay("Pay the deposit", "deposit"),
        ],
      },
    ],
    submit: "Hold my spot",
    end: ["Your spot is held", "We'll email your camp packet and when the balance is due."],
  }),
];
