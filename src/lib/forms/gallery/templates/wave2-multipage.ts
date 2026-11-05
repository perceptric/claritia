// Wave 2, multi-page (docs/multipage-forms-plan.md, Step 2): long forms for jobs that need pages, with pages skipped
// when they don't apply, paths by answer, a cover on the longest, save and finish later, and a PDF copy.
import type { FormTemplate } from "../types.ts";
import { address, agree, company, CONTACT_PREF, DAYPART, date, drop, email, email2, files, fullName, go, HEARD, long, many, matrix, money, nps, num, one, phone, phone2, range, scale, sign, stars, statement, text, tpl, when, yesno, rows } from "./build.ts";

const ADDED = "2026-11-03";
/** A price or amount worked out from earlier answers by their keys. */
const calc = (label: string, key: string, formula: string, o: { visible?: boolean } = {}) => ({ kind: "calc" as const, label, key, formula, format: "money" as const, currency: "USD", ...o });

export const WAVE2_MULTIPAGE: FormTemplate[] = [
  // Finance
  tpl("finance.mortgage-prequal", "finance", "Mortgage pre-qualification", ["application", "lead"], "Pre-qualify home buyers from income and debts, with a rough monthly budget.", {
    cats: "eligibility application calculator",
    teams: "sales finance",
    added: ADDED,
    cover: { title: "Mortgage pre-qualification", text: "About 8 minutes. Have your income and monthly debt payments handy.", button: "Start" },
    resume: true,
    copy: true,
    pages: [
      {
        title: "About you",
        fields: [
          fullName(),
          email("Email"),
          phone("Phone", { required: true }),
          one("Do you rent or own now?", ["Rent", "Own", "Live with family", "Other"]),
          yesno("Are you a first-time buyer?", { save: "first_time_buyer" }),
          yesno("Will anyone apply with you?", { required: true }),
        ],
        skip: go("Will anyone apply with you?", "is", false, "Income"),
      },
      {
        title: "Co-borrower",
        fields: [
          text("Co-borrower's name", { required: true }),
          email2("Co-borrower's email"),
          one("How are you related?", ["Spouse or partner", "Family member", "Friend", "Other"]),
          one("Co-borrower's work", ["Employed", "Self-employed", "Retired", "Not working"]),
          money("Co-borrower's yearly income before taxes", { key: "co_income" }),
        ],
      },
      {
        title: "Income",
        fields: [
          one("How do you earn your income?", ["Employed", "Self-employed", "Retired", "Other"], { required: true }),
          text("Employer", { show: when("How do you earn your income?", "is", "Employed") }),
          num("Years with this employer", { min: 0, max: 60, show: when("How do you earn your income?", "is", "Employed") }),
          money("Your yearly income before taxes", { required: true, key: "income" }),
          money("Other yearly income", { key: "other_income", placeholder: "Bonuses, rental income, support" }),
          calc("Monthly income", "monthly", "(ifempty({income}, 0) + ifempty({other_income}, 0) + ifempty({co_income}, 0)) / 12", { visible: false }),
        ],
      },
      {
        title: "Debts",
        fields: [
          money("Car loan payments a month", { key: "car" }),
          money("Student loan payments a month", { key: "student" }),
          money("Minimum card payments a month", { key: "cards" }),
          money("Other loan payments a month", { key: "other_debt" }),
          calc("Monthly debt payments", "debts", "ifempty({car}, 0) + ifempty({student}, 0) + ifempty({cards}, 0) + ifempty({other_debt}, 0)"),
          one("How would you rate your credit?", ["Excellent", "Good", "Fair", "Poor", "Not sure"], { save: "credit" }),
          yesno("Any bankruptcy or foreclosure in the last 7 years?"),
        ],
      },
      {
        title: "The home you want",
        fields: [
          one("Home type", ["Single-family house", "Townhouse", "Condo", "Multi-family", "Not sure yet"]),
          one("How will you use it?", ["Main home", "Second home", "Rental property"]),
          text("Where are you looking?", { placeholder: "City or ZIP code" }),
          money("Price you have in mind", { key: "price" }),
          money("Down payment you have saved", { key: "down" }),
          one("When do you want to buy?", ["Within 3 months", "In 3–6 months", "In 6–12 months", "Just exploring"], { save: "timeline" }),
          calc("Rough monthly home payment to aim for", "budget", "max(0, round(min({monthly} * 0.28, {monthly} * 0.36 - {debts})))"),
          calc("Loan amount you'd need", "loan", "max(0, ifempty({price}, 0) - ifempty({down}, 0))"),
        ],
      },
      {
        title: "Review and sign",
        fields: [
          one("Best way to reach you", CONTACT_PREF),
          yesno("Do you agree to a credit check when you're ready to apply?"),
          agree("The information I gave is true to the best of my knowledge."),
          agree("I understand pre-qualification is only an estimate."),
          sign("Signature"),
        ],
      },
    ],
    submit: "Send my pre-qualification",
    end: ["Thanks, we got it", "A loan officer will review your answers and reach out within one business day."],
  }),

  // Insurance
  tpl("insurance.auto-quote", "insurance", "Auto insurance quote", ["request", "lead"], "Drivers and cars for a quote, with claims asked only when there are some.", {
    cats: "quote lead-generation",
    teams: "sales",
    added: ADDED,
    pages: [
      {
        title: "About you",
        fields: [
          fullName(),
          email("Email"),
          phone(),
          date("Date of birth", { required: true }),
          address("Where the cars are kept", { required: true }),
          yesno("Do you have car insurance now?"),
          text("Current insurer", { show: when("Do you have car insurance now?", "is", true) }),
        ],
      },
      {
        title: "Drivers",
        fields: [
          num("Drivers in your home", { required: true, min: 1, max: 8, key: "drivers" }),
          one("Marital status", ["Single", "Married", "Domestic partner", "Divorced", "Widowed"]),
          num("Years you've been licensed", { min: 0, max: 80 }),
          yesno("Any tickets or violations in the last 3 years?"),
          long("Other drivers: name, birth date and years licensed", { show: when("drivers", "gte", 2) }),
        ],
      },
      {
        title: "Cars",
        fields: [
          num("Cars to insure", { required: true, min: 1, max: 8, key: "cars" }),
          text("Year, make and model", { required: true, placeholder: "2021 Toyota RAV4" }),
          text("VIN"),
          one("Do you own, lease or finance it?", ["Own", "Lease", "Finance"]),
          one("Main use", ["Commuting", "Errands and personal", "Business", "Ride share or delivery"]),
          drop("Miles a year", ["Under 5,000", "5,000–10,000", "10,000–15,000", "Over 15,000"]),
          long("Other cars: year, make and model", { show: when("cars", "gte", 2) }),
          yesno("Any claims or accidents in the last 5 years?", { required: true }),
        ],
        skip: go("Any claims or accidents in the last 5 years?", "is", false, "Coverage"),
      },
      {
        title: "Claims",
        fields: [
          num("How many claims or accidents?", { min: 1, max: 10 }),
          one("What was the most recent one?", ["Accident, at fault", "Accident, not at fault", "Theft or break-in", "Weather or flood", "Glass", "Other"]),
          date("Date of the most recent one"),
          long("What happened?"),
        ],
      },
      {
        title: "Coverage",
        fields: [
          one("Coverage level", ["State minimum", "Standard", "Full coverage", "Help me choose"], { required: true, save: "coverage_level" }),
          one("Deductible", ["$250", "$500", "$1,000", "Help me choose"]),
          many("Extras", ["Roadside help", "Rental car", "Glass", "Gap coverage"]),
          date("Start date", { required: true }),
          one("Best way to reach you", CONTACT_PREF),
        ],
      },
    ],
    submit: "Get my quote",
    end: ["Thanks, we got it", "An agent will send your quote within one business day."],
  }),
  tpl("insurance.home-quote", "insurance", "Home insurance quote", ["request", "lead"], "Home or renters insurance quotes. Renters skip the property page.", {
    cats: "quote lead-generation",
    teams: "sales",
    added: ADDED,
    pages: [
      { title: "About you", fields: [fullName(), email("Email"), phone(), address("Address to insure", { required: true })] },
      {
        title: "Own or rent",
        fields: [
          one("Do you own or rent?", ["Own", "Rent"], { required: true, save: "own_or_rent" }),
          one("Home type", ["House", "Condo", "Townhouse", "Apartment", "Mobile home"], { required: true }),
          yesno("Is this your main home?"),
          yesno("Do you have a mortgage?", { show: when("Do you own or rent?", "is", "Own") }),
        ],
        skip: go("Do you own or rent?", "is", "Rent", "Claims"),
      },
      {
        title: "Property",
        fields: [
          num("Year built", { min: 1700, max: 2030, half: true }),
          num("Square feet", { min: 100, max: 20000, half: true }),
          money("Rough home value"),
          one("Stories", ["One", "Two", "Three or more"]),
          one("Roof material", ["Asphalt shingle", "Metal", "Tile", "Slate", "Flat", "Not sure"]),
          num("Roof age (years)", { min: 0, max: 100 }),
          one("Heating", ["Gas", "Electric", "Oil", "Heat pump", "Wood", "Other"]),
          many("Safety features", ["Smoke detectors", "Monitored alarm", "Fire sprinklers", "Deadbolts"]),
          many("On the property", ["Pool", "Trampoline", "Dog", "Wood stove", "Home business"]),
        ],
      },
      {
        title: "Claims",
        fields: [
          yesno("Any home or renters claims in the last 5 years?", { required: true }),
          num("How many?", { min: 1, max: 10, show: when("Any home or renters claims in the last 5 years?", "is", true) }),
          long("What happened?", { show: when("Any home or renters claims in the last 5 years?", "is", true) }),
        ],
      },
      {
        title: "Coverage",
        fields: [
          money("Value of your belongings"),
          one("Deductible", ["$500", "$1,000", "$2,500", "Help me choose"]),
          many("Extra coverage", ["Flood", "Earthquake", "Jewelry and valuables", "Water backup", "Identity theft"]),
          date("Start date", { required: true }),
          yesno("Would you like an auto quote too?"),
          one("Best way to reach you", CONTACT_PREF),
        ],
      },
    ],
    submit: "Get my quote",
    end: ["Thanks, we got it", "An agent will send your quote within one business day."],
  }),

  // Wellness
  tpl("wellness.therapy-intake", "wellness", "Therapy intake", ["intake"], "A full therapy intake that new clients can save and finish later.", {
    cats: "patient-intake intake",
    teams: "care",
    subs: "therapy",
    added: ADDED,
    phi: true,
    resume: true,
    cover: { title: "Therapy intake", text: "About 10 minutes. You can save and come back to it.", button: "Start" },
    pages: [
      {
        title: "About you",
        fields: [
          fullName(),
          email("Email"),
          phone("Phone", { required: true }),
          date("Date of birth", { required: true }),
          text("Pronouns", { half: true }),
          address("Home address"),
          one("Session format", ["In person", "Online", "Either"], { required: true, save: "session_format" }),
          yesno("May we leave a voicemail?"),
        ],
      },
      {
        title: "What brings you in",
        fields: [
          many("What would you like help with?", ["Anxiety", "Low mood", "Stress", "Relationships", "Grief or loss", "Trauma", "Sleep", "Work or school", "Family"], { required: true, other: true }),
          long("In your own words, what brings you in now?", { required: true }),
          one("How long has this been going on?", ["Under a month", "1–6 months", "6–12 months", "Over a year"]),
          scale("How much does it affect your daily life?", "A little", "A lot"),
        ],
      },
      {
        title: "History",
        fields: [
          yesno("Have you seen a therapist or counselor before?"),
          long("What helped, and what didn't?", { show: when("Have you seen a therapist or counselor before?", "is", true) }),
          yesno("Have you ever stayed in a hospital for your mental health?"),
          yesno("Are you having thoughts of harming yourself or others?", { required: true }),
          statement("If you are in danger right now, call your local emergency number or go to the nearest emergency room.", { show: when("Are you having thoughts of harming yourself or others?", "is", true) }),
          long("Anything else from your past you'd like us to know?"),
        ],
      },
      {
        title: "Current care",
        fields: [
          yesno("Are you taking any medicines now?"),
          rows("Which medicines and doses?", ["Medicine", "Dose"], { add: "Add a medicine", show: when("Are you taking any medicines now?", "is", true) }),
          text("Primary care doctor"),
          yesno("Are you seeing a psychiatrist or another counselor now?"),
          text("Their name and practice", { show: when("Are you seeing a psychiatrist or another counselor now?", "is", true) }),
          one("How will you pay?", ["Insurance", "Self-pay", "Employee assistance program", "Not sure"], { required: true }),
          text("Insurance company and member ID", { show: when("How will you pay?", "is", "Insurance") }),
        ],
      },
      {
        title: "Your goals",
        fields: [
          long("What would you like to be different after therapy?", { required: true }),
          many("What matters to you in a therapist?", ["Gender", "Shared background or culture", "Faith-based approach", "LGBTQ+ affirming", "A language other than English", "No preference"]),
          one("How often would you like to meet?", ["Every week", "Every two weeks", "Not sure yet"]),
          many("Best times for sessions", DAYPART),
        ],
      },
      {
        title: "Consent",
        fields: [
          text("Emergency contact name and phone", { required: true }),
          agree("I have read the practice's privacy notice."),
          agree("I consent to treatment."),
          sign("Signature"),
        ],
      },
    ],
    submit: "Send my intake",
    end: ["Thank you, your intake is in", "Your therapist will read it before your first session."],
  }),

  // Fitness
  tpl("fitness.fitness-assessment", "fitness", "Fitness assessment", ["quiz", "lead"], "Score activity, strength and mobility, then book a session.", {
    cats: "scorecard quiz",
    teams: "teachers sales",
    subs: "personal-training gyms",
    added: ADDED,
    intro: "Answer honestly. Your score shows where to start.",
    pages: [
      {
        title: "About you",
        fields: [fullName(), email("Email for your results"), phone(), one("Age range", ["Under 25", "25–34", "35–44", "45–54", "55–64", "65 or older"])],
      },
      {
        title: "Activity",
        fields: [
          one("Days a week you're active for 30 minutes or more", ["None", "1–2", "3–4", "5 or more"], { required: true, points: [0, 1, 2, 3] }),
          one("How do you feel after two flights of stairs?", ["Out of breath", "A little winded", "Fine"], { required: true, points: [0, 1, 2] }),
          one("Hours you sit on a typical day", ["More than 8", "5–8", "Under 5"], { required: true, points: [0, 1, 2] }),
          one("How well do you sleep?", ["Poorly", "OK", "Well"], { required: true, points: [0, 1, 2] }),
        ],
      },
      {
        title: "Strength and mobility",
        fields: [
          one("Push-ups you can do in a row", ["None yet", "1–10", "11–25", "More than 25"], { required: true, points: [0, 1, 2, 3] }),
          one("How long can you hold a plank?", ["Under 20 seconds", "20–60 seconds", "Over a minute"], { required: true, points: [0, 1, 2] }),
          one("Can you get up from the floor without using your hands?", ["Not yet", "With some effort", "Easily"], { required: true, points: [0, 1, 2] }),
          one("Can you touch your toes with straight legs?", ["Not close", "Almost", "Yes"], { required: true, points: [0, 1, 2] }),
        ],
      },
      {
        title: "Your goals",
        fields: [
          many("What are your goals?", ["Lose weight", "Build muscle", "More energy", "Move more easily", "Train for an event", "Feel more confident"], { required: true, save: "fitness_goals" }),
          one("What has gotten in the way?", ["Time", "Motivation", "Not sure where to start", "Injury or pain", "Cost"]),
          one("How would you like to train?", ["One-on-one", "Small group", "Classes", "On my own with a plan"], { save: "training_style" }),
        ],
      },
      {
        title: "Your results",
        fields: [
          one("How should we go over your results?", ["By email", "On a call", "In person"]),
          many("Best times to train", DAYPART),
        ],
      },
    ],
    submit: "See my score",
    end: {
      title: "Your fitness score",
      text: "",
      score: [
        { min: 13, title: "Strong base", text: "You're in good shape. A coach can help you set a new goal and reach it." },
        { min: 7, title: "Building up", text: "You have a good start. A plan with a coach can help you make steady gains." },
        { min: 0, title: "Starting fresh", text: "Everyone starts somewhere. A coach can build a plan that fits where you are." },
      ],
      booking: true,
    },
  }),

  // Accounting
  tpl("accounting.bookkeeping-onboarding", "accounting", "Bookkeeping onboarding", ["intake"], "Set up new bookkeeping clients: accounts, tools, volume and access.", {
    cats: "client-onboarding intake",
    teams: "finance operations",
    added: ADDED,
    copy: true,
    pages: [
      {
        title: "Your business",
        fields: [
          fullName(),
          email("Email"),
          phone(),
          company("Business name", { required: true }),
          one("Business type", ["Sole proprietor", "LLC", "S corporation", "C corporation", "Partnership", "Nonprofit"], { required: true, save: "entity_type" }),
          text("What does the business do?"),
          text("Fiscal year end", { placeholder: "December 31" }),
        ],
      },
      {
        title: "Accounts",
        fields: [
          num("Business bank accounts", { min: 0, max: 30, half: true }),
          num("Company cards (credit or charge)", { min: 0, max: 30, half: true }),
          many("Other accounts", ["Loans", "Lines of credit", "PayPal", "Stripe", "Square", "Shopify"]),
          yesno("Do you ever pay personal costs from business accounts?"),
          one("How current are your books?", ["Up to date", "1–3 months behind", "3–12 months behind", "More than a year behind", "Never kept"], { required: true, save: "books_status" }),
        ],
      },
      {
        title: "Tools",
        fields: [
          one("Accounting software", ["QuickBooks Online", "QuickBooks Desktop", "Xero", "FreshBooks", "Wave", "Spreadsheets", "None"], { other: true }),
          one("Payroll", ["Gusto", "ADP", "QuickBooks Payroll", "Paychex", "No payroll"], { other: true }),
          many("How do customers pay you?", ["Bank transfer", "Card payments", "Checks", "Cash", "Online store"]),
          text("Bill pay or expense tools", { placeholder: "Bill.com, Expensify" }),
        ],
      },
      {
        title: "Volume",
        fields: [
          drop("Transactions a month", ["Under 100", "100–300", "300–700", "700–1,500", "Over 1,500"], { required: true, save: "monthly_transactions" }),
          num("Employees on payroll", { min: 0, half: true }),
          num("Contractors you pay", { min: 0, half: true }),
          yesno("Do you collect sales tax?"),
          text("Where do you collect it?", { show: when("Do you collect sales tax?", "is", true) }),
        ],
      },
      {
        title: "Access",
        fields: [
          one("How will you give us access?", ["Invite you as a user", "Set up a call to connect", "Not sure yet"], { required: true }),
          many("What can you send us?", ["Bank statements", "Credit card statements", "Last year's tax return", "Loan papers", "Payroll reports"]),
          files("Upload documents"),
          one("How often do you want reports?", ["Every month", "Every quarter", "Once a year"]),
          one("Best way to reach you", CONTACT_PREF),
          agree("I give permission to view my business accounts for bookkeeping."),
        ],
      },
    ],
    submit: "Finish onboarding",
    end: ["You're all set", "Your bookkeeper will reach out to start on your books."],
  }),

  // Construction
  tpl("construction.kitchen-remodel-estimate", "construction", "Kitchen remodel estimate", ["request", "lead"], "Estimate a kitchen remodel from size, finishes and appliances.", {
    cats: "estimate calculator",
    teams: "sales founders",
    added: ADDED,
    cover: { title: "Kitchen remodel estimate", text: "About 5 minutes. See a price range before we visit.", button: "Start" },
    pages: [
      {
        title: "Your kitchen",
        fields: [
          num("Kitchen size (square feet)", { required: true, min: 40, max: 1000, key: "sqft", save: "kitchen_sqft" }),
          one("How big is the job?", ["Refresh, like paint and new hardware", "New cabinets and counters", "Full remodel down to the studs"], { required: true, key: "scope", points: [40, 80, 150], save: "remodel_scope" }),
          one("Home type", ["House", "Condo", "Townhouse"]),
          files("Photos of your kitchen"),
        ],
      },
      {
        title: "Layout",
        fields: [
          one("Kitchen shape", ["Galley", "L-shaped", "U-shaped", "Open with an island", "Not sure"]),
          one("Keep the layout?", ["Keep it as is", "Small changes", "New layout"], { required: true, key: "layout", points: [0, 2500, 10000] }),
          yesno("Move plumbing or gas lines?", { key: "plumbing", points: [3000, 0] }),
          yesno("Take down or move a wall?", { key: "wall", points: [6000, 0] }),
          yesno("Add an island?", { key: "island", points: [4000, 0] }),
        ],
      },
      {
        title: "Cabinets and counters",
        fields: [
          one("Cabinets", ["Keep and refinish", "Stock", "Semi-custom", "Custom"], { required: true, key: "cabinets", points: [3000, 7000, 14000, 25000] }),
          one("Counters", ["Keep current", "Laminate", "Butcher block", "Granite", "Quartz", "Marble"], { required: true, key: "counters", points: [0, 1500, 2500, 4000, 4500, 6000] }),
          yesno("New backsplash?", { key: "backsplash", points: [1500, 0] }),
          one("Flooring", ["Keep current", "Vinyl", "Tile", "Hardwood"], { required: true, key: "floor", points: [0, 5, 12, 14] }),
          yesno("Will you get new appliances?", { required: true }),
        ],
        skip: go("Will you get new appliances?", "is", false, "Timing and budget"),
      },
      {
        title: "Appliances",
        fields: [
          one("Appliance level", ["Standard", "Mid-range", "High-end"], { required: true, key: "appliances", points: [4000, 9000, 20000] }),
          many("Which ones?", ["Fridge", "Range or cooktop", "Wall oven", "Dishwasher", "Microwave", "Range hood", "Wine fridge"]),
          one("Who buys them?", ["Your team", "I will"]),
        ],
      },
      {
        title: "Timing and budget",
        fields: [
          one("When do you want to start?", ["Within a month", "In 1–3 months", "In 3–6 months", "Just planning"], { required: true, save: "timeline" }),
          one("Budget you have in mind", ["Under $25,000", "$25,000–$50,000", "$50,000–$100,000", "Over $100,000", "Not sure yet"], { save: "budget" }),
          yesno("Will you live at home during the work?"),
          calc(
            "Rough total",
            "total",
            "{sqft} * {scope} + {layout} + ifempty({plumbing}, 0) + ifempty({wall}, 0) + ifempty({island}, 0) + {cabinets} + {counters} + ifempty({backsplash}, 0) + {sqft} * {floor} + ifempty({appliances}, 0)",
            { visible: false },
          ),
          calc("Estimate, low end", "low", "round({total} * 0.85 / 500) * 500"),
          calc("Estimate, high end", "high", "round({total} * 1.15 / 500) * 500"),
        ],
      },
      {
        title: "Contact",
        fields: [fullName(), email("Email"), phone("Phone", { required: true }), address("Project address", { required: true }), one("Best time for a visit", DAYPART)],
      },
    ],
    submit: "Send my estimate",
    end: { title: "Your estimate is saved", text: "Pick a time for an in-home visit to firm up the price.", booking: true },
  }),

  // Pets
  tpl("pets.adoption-application", "pets", "Pet adoption application", ["application"], "Screen adopters on their home, other pets, experience and references.", {
    cats: "application",
    teams: "operations volunteers",
    also: ["nonprofit"],
    added: ADDED,
    resume: true,
    cover: { title: "Pet adoption application", text: "About 10 minutes. Have two references' phone numbers ready.", button: "Start" },
    pages: [
      {
        title: "About you",
        fields: [
          fullName(),
          email("Email"),
          phone("Phone", { required: true }),
          address("Home address", { required: true }),
          yesno("Are you 18 or older?", { required: true }),
          text("Which pet are you applying for?", { placeholder: "Name or ID from the listing" }),
        ],
      },
      {
        title: "Your home",
        fields: [
          one("Home type", ["House", "Apartment or condo", "Townhouse", "Mobile home", "Other"], { required: true }),
          one("Do you own or rent?", ["Own", "Rent", "Live with family"], { required: true }),
          yesno("Does your landlord allow pets?", { show: when("Do you own or rent?", "is", "Rent") }),
          yesno("Do you have a fenced yard?"),
          num("Adults in the home", { min: 1, max: 20, half: true }),
          num("Children in the home", { min: 0, max: 20, half: true }),
          yesno("Does anyone in the home have pet allergies?"),
          yesno("Do you have other pets now?", { required: true }),
        ],
        skip: go("Do you have other pets now?", "is", false, "Experience"),
      },
      {
        title: "Your pets and vet",
        fields: [
          long("Tell us about your pets", { required: true, placeholder: "Kind, age, and whether they're spayed or neutered" }),
          yesno("Are they up to date on vaccines?"),
          text("Vet clinic"),
          phone2("Vet's phone"),
          yesno("May we call your vet?"),
        ],
      },
      {
        title: "Experience",
        fields: [
          yesno("Have you had a pet before?"),
          long("Where are your past pets now?", { show: when("Have you had a pet before?", "is", true) }),
          one("Hours a day the pet would be alone", ["Under 4", "4–6", "6–8", "Over 8"], { required: true }),
          text("Who will care for the pet when you travel?"),
          long("Why do you want to adopt?", { required: true }),
          yesno("Have you ever given up a pet?"),
          long("Tell us what happened", { show: when("Have you ever given up a pet?", "is", true) }),
        ],
      },
      {
        title: "References",
        fields: [
          text("First reference's name", { required: true, half: true }),
          phone2("First reference's phone", { required: true, half: true }),
          text("Second reference's name", { half: true }),
          phone2("Second reference's phone", { half: true }),
        ],
      },
      {
        title: "Review and sign",
        fields: [
          yesno("Do you agree to a home visit?"),
          agree("The information I gave is true."),
          agree("I understand the shelter makes the final decision."),
          sign("Signature"),
        ],
      },
    ],
    submit: "Send my application",
    end: ["Application received", "We'll call your references and be in touch about next steps."],
  }),

  // Any business
  tpl("general.franchise-inquiry", "general", "Franchise inquiry", ["lead", "application"], "Qualify franchise buyers on market, capital and experience.", {
    cats: "qualify partner lead-generation",
    teams: "sales founders",
    added: ADDED,
    pages: [
      {
        title: "About you",
        fields: [fullName(), email("Email"), phone("Phone", { required: true }), one("How did you hear about us?", HEARD)],
      },
      {
        title: "Your market",
        fields: [
          text("Where do you want to open?", { required: true, placeholder: "City, state or region", save: "target_market" }),
          num("How many locations are you thinking of?", { min: 1, max: 50 }),
          yesno("Do you have a site in mind?"),
          text("Site address or area", { show: when("Do you have a site in mind?", "is", true) }),
        ],
      },
      {
        title: "Capital",
        fields: [
          one("Cash you can invest", ["Under $50,000", "$50,000–$100,000", "$100,000–$250,000", "$250,000–$500,000", "Over $500,000"], { required: true, save: "liquid_capital" }),
          one("Net worth", ["Under $250,000", "$250,000–$500,000", "$500,000–$1 million", "Over $1 million"]),
          many("How will you fund it?", ["Savings", "Bank loan", "Retirement funds", "Partners or investors", "Home equity", "Not sure yet"]),
          yesno("Will you have a business partner?"),
        ],
        jumps: [go("Cash you can invest", "is", "Under $50,000", "end")],
      },
      {
        title: "Experience",
        fields: [
          yesno("Have you owned a business before?"),
          long("Tell us about it", { show: when("Have you owned a business before?", "is", true) }),
          yesno("Have you owned a franchise before?"),
          one("Years managing people", ["None", "Under 2", "2–5", "More than 5"]),
          text("Current job"),
          one("How involved will you be?", ["Full time", "Part time", "Investor with a manager"], { required: true }),
        ],
      },
      {
        title: "Timing",
        fields: [
          one("When do you want to open?", ["Within 6 months", "In 6–12 months", "In 1–2 years", "Just exploring"], { required: true, save: "timeline" }),
          one("Where are you in your search?", ["Just starting", "Comparing a few brands", "Ready to talk next steps"]),
          long("Questions for our team"),
          one("Best way to reach you", CONTACT_PREF),
        ],
      },
    ],
    submit: "Send my inquiry",
    end: { title: "Thanks for your interest", text: "We read every inquiry. Pick a time to talk with our franchise team.", booking: true },
  }),
  tpl("general.in-depth-feedback", "general", "Customer feedback, in depth", ["feedback", "survey"], "An NPS survey whose follow-up page changes with the score.", {
    cats: "feedback nps survey",
    teams: "success product",
    added: ADDED,
    cover: { title: "Tell us how we're doing", text: "About 4 minutes. We read every answer.", button: "Start" },
    pages: [
      {
        title: "Your score",
        fields: [
          nps("How likely are you to recommend us to a friend or colleague?", { required: true, key: "score", minLabel: "Not likely", maxLabel: "Very likely", save: "nps" }),
          long("What's the main reason for your score?"),
          one("How long have you been a customer?", ["Under 3 months", "3–12 months", "1–3 years", "Over 3 years"]),
        ],
        jumps: [go("score", "lte", 8, "What to improve")],
      },
      {
        title: "What you like",
        fields: [
          many("What do you like most?", ["Ease of use", "Quality", "Price", "Customer service", "Speed", "Reliability"], { other: true }),
          long("What would you tell a friend about us?"),
          yesno("May we share your words as a review?"),
        ],
        skip: go("score", "gte", 9, "Product"),
      },
      {
        title: "What to improve",
        fields: [
          many("What fell short?", ["Ease of use", "Quality", "Price", "Customer service", "Speed", "Reliability"], { other: true }),
          long("What's the one thing we should fix first?"),
          long("What would make it a 10?"),
          one("How likely are you to keep using us?", ["Very likely", "Somewhat likely", "Not sure", "Unlikely"]),
        ],
      },
      {
        title: "Product",
        fields: [
          matrix("How do we do on each?", ["Quality", "Ease of use", "Value for money", "Speed"], ["Poor", "Fair", "Good", "Great"]),
          one("How often do you use us?", ["Every day", "Every week", "Every month", "Less often"]),
          long("What's one thing you wish we offered?"),
        ],
      },
      {
        title: "Support",
        fields: [
          yesno("Have you contacted our support team in the last 6 months?"),
          stars("How would you rate the help you got?", { show: when("Have you contacted our support team in the last 6 months?", "is", true) }),
          one("Was your issue solved?", ["Yes, the first time", "Yes, after a few tries", "No"], { show: when("Have you contacted our support team in the last 6 months?", "is", true) }),
          long("How could our support be better?", { show: when("Have you contacted our support team in the last 6 months?", "is", true) }),
        ],
      },
      {
        title: "Anything else",
        fields: [
          long("Anything else you'd like to tell us?"),
          yesno("May we follow up with you?"),
          email("Email", { required: false, show: when("May we follow up with you?", "is", true) }),
        ],
      },
    ],
    submit: "Send my feedback",
    end: ["Thank you", "Your answers go straight to the team that can act on them."],
  }),

  // Hospitality
  tpl("hospitality.trip-planner", "hospitality", "Trip planner", ["lead", "request"], "Plan a trip from travelers, dates, budget and wish list, then book a call.", {
    cats: "quote consultation lead-generation",
    teams: "sales",
    subs: "tours",
    added: ADDED,
    pages: [
      {
        title: "Travelers",
        fields: [
          fullName(),
          email("Email"),
          phone(),
          num("Adults", { required: true, min: 1, max: 30, half: true }),
          num("Children", { min: 0, max: 20, half: true }),
          text("Children's ages", { show: when("Children", "gte", 1) }),
          one("What's the occasion?", ["Vacation", "Honeymoon", "Anniversary", "Family trip", "Birthday", "Business", "Other"]),
        ],
      },
      {
        title: "Where and when",
        fields: [
          text("Where would you like to go?", { required: true, placeholder: "Country, city or region", save: "destination" }),
          yesno("Are your dates set?"),
          range("Travel dates", { show: when("Are your dates set?", "is", true) }),
          one("When would you like to go?", ["In the next 3 months", "In 3–6 months", "In 6–12 months", "Not sure"], { show: when("Are your dates set?", "is", false) }),
          num("How many nights?", { min: 1, max: 90 }),
          text("Leaving from", { placeholder: "City or airport" }),
        ],
      },
      {
        title: "Budget",
        fields: [
          one("Budget per person", ["Under $1,000", "$1,000–$2,500", "$2,500–$5,000", "$5,000–$10,000", "Over $10,000"], { required: true, save: "trip_budget" }),
          one("Does that include flights?", ["Yes", "No", "Not sure"]),
          one("Travel style", ["Comfort on a budget", "Mid-range", "Luxury"]),
        ],
      },
      {
        title: "Stays and activities",
        fields: [
          many("Where would you like to stay?", ["Hotel", "Resort", "Vacation rental", "Small inn", "Cruise", "No preference"]),
          many("What do you enjoy?", ["Beaches", "Food and wine", "History and culture", "Hiking and outdoors", "Cities and shopping", "Wildlife", "Spa and rest", "Nightlife"]),
          one("Pace", ["Slow and relaxed", "A mix", "Packed with things to do"]),
          long("Places or experiences on your wish list"),
        ],
      },
      {
        title: "Extras",
        fields: [
          many("Want help with any of these?", ["Flights", "Airport transfers", "Car rental", "Travel insurance", "Tours and tickets", "Restaurant bookings"]),
          long("Anything we should plan around?", { placeholder: "Diet, mobility, rooms, passports" }),
          one("Best way to reach you", CONTACT_PREF),
          one("How did you hear about us?", HEARD),
        ],
      },
    ],
    submit: "Plan my trip",
    end: { title: "Thanks, we're on it", text: "Pick a time to talk through your trip with a planner.", booking: true },
  }),
];
