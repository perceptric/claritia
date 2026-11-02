// Financial services, insurance, real estate.
import { address, agree, company, CONTACT_PREF, date, DAYPART, drop, email, file, files, fullName, long, many, money, num, one, phone, sign, text, THANKS, TIMELINE, tpl, when, yesno } from "./build.ts";

const ASSETS = ["Under $100,000", "$100,000–$500,000", "$500,000–$1M", "$1M–$5M", "Over $5M"];

export const FINANCE = [
  tpl("finance.review-request", "finance", "Financial review request", ["lead", "booking"], "Book a first review with a qualified prospect.", {
    featured: true,
    fields: [
      fullName(),
      email("Email"),
      phone(),
      many("What are you planning for?", ["Retirement", "Buying a home", "Kids' education", "Growing wealth", "Selling a business", "Taxes"], { required: true, save: "goals" }),
      one("Investable assets", ASSETS, { save: "assets_range" }),
      one("When would you like to start?", TIMELINE, { save: "timeline" }),
    ],
    end: { title: "Thanks, let's meet", text: "Pick a time for your free review.", booking: true },
  }),
  tpl("finance.risk-quiz", "finance", "Risk tolerance quiz", ["quiz", "lead"], "A short quiz that scores how much risk fits.", {
    fields: [
      one("If your investments fell 20% in a month, you would…", ["Sell everything", "Sell some", "Hold", "Buy more"], { required: true, points: [0, 1, 2, 3] }),
      one("When will you need this money?", ["Within 3 years", "3–7 years", "7–15 years", "15+ years"], { required: true, points: [0, 1, 2, 3] }),
      one("Your investing experience", ["None", "Some", "A lot", "I do it for a living"], { required: true, points: [0, 1, 2, 3] }),
      one("Which matters more?", ["Protecting what I have", "A balance", "Growing as much as possible"], { required: true, points: [0, 2, 3] }),
      one("How steady is your income?", ["Not steady", "Mostly steady", "Very steady"], { required: true, points: [0, 1, 2] }),
      one("Your emergency savings cover…", ["Less than a month", "1–3 months", "3–6 months", "6+ months"], { required: true, points: [0, 1, 2, 3] }),
      email("Email for your results", { required: true }),
    ],
    submit: "See my result",
    end: {
      title: "Your result",
      text: "",
      score: [
        { min: 13, title: "Growth investor", text: "You can ride out swings for higher long-term returns." },
        { min: 8, title: "Balanced investor", text: "A mix of growth and stability fits you." },
        { min: 0, title: "Careful investor", text: "Protecting what you have matters most. Let's plan around that." },
      ],
      booking: true,
    },
  }),
  tpl("finance.loan-prequal", "finance", "Loan pre-qualification", ["application", "lead"], "Pre-qualify borrowers before a full application.", {
    fields: [
      drop("Loan type", ["Home purchase", "Refinance", "Business", "Auto", "Personal"], { required: true, save: "loan_type" }),
      money("Amount", { required: true, min: 1000 }),
      money("Yearly income", { required: true, min: 0 }),
      one("Credit score", ["Excellent (740+)", "Good (670–739)", "Fair (580–669)", "Below 580", "Not sure"], { required: true }),
      fullName(),
      email("Email"),
      phone("Phone", { required: true }),
      agree("You may contact me about this request."),
    ],
    end: ["Thanks, we're reviewing", "A loan officer will call within one business day."],
  }),
  tpl("finance.business-funding", "finance", "Business funding application", ["application"], "Collect revenue, history and need for funding.", {
    pages: [
      { title: "Business", fields: [company("Business name", { required: true }), drop("Industry", ["Retail", "Services", "Construction", "Healthcare", "Restaurant", "Tech", "Other"], { required: true }), one("Years in business", ["Under 1", "1–2", "3–5", "5+"], { required: true }), money("Yearly revenue", { required: true })] },
      { title: "Funding", fields: [money("Amount needed", { required: true }), one("Use of funds", ["Working capital", "Equipment", "Expansion", "Inventory", "Refinance debt"], { required: true }), files("Bank statements (last 3 months)")] },
      { title: "Contact", fields: [fullName(), email("Email"), phone("Phone", { required: true })] },
    ],
    end: { title: "Application received", text: "Book a call to go over your options.", booking: true },
  }),
  tpl("finance.retirement", "finance", "Retirement planning", ["lead", "intake"], "Start a retirement plan from a few numbers.", {
    fields: [num("Your age", { required: true, min: 18, max: 100 }), num("Age you'd like to retire", { required: true, min: 30, max: 100 }), one("Savings so far", ASSETS, { required: true }), long("What does retirement look like for you?"), fullName(), email("Email")],
    end: { title: "Thanks", text: "Let's map out your plan together.", booking: true },
  }),
];

const COVERAGE = ["Home", "Auto", "Life", "Health", "Business", "Renters", "Umbrella"];

export const INSURANCE = [
  tpl("insurance.quote", "insurance", "Insurance quote request", ["request", "lead"], "Quote requests with renewal dates and current carrier.", {
    featured: true,
    fields: [
      many("Coverage you need", COVERAGE, { required: true, save: "coverage" }),
      text("Current carrier"),
      date("Renewal date", { save: "renewal_date" }),
      fullName(),
      email("Email"),
      phone("Phone", { required: true }),
      text("ZIP or postal code", { required: true }),
      one("Best way to reach you", CONTACT_PREF),
    ],
    submit: "Get my quote",
    end: THANKS("with your quote within one business day"),
  }),
  tpl("insurance.claim", "insurance", "Claim report", ["request"], "Start a claim with the facts and photos.", {
    fields: [fullName(), email("Email"), phone("Phone", { required: true }), text("Policy number", { required: true }), date("Date of loss", { required: true }), long("What happened?", { required: true }), files("Photos")],
    submit: "Report claim",
    end: ["Claim received", "An adjuster will contact you within 24 hours."],
  }),
  tpl("insurance.business-intake", "insurance", "Business insurance intake", ["intake", "lead"], "Scope commercial coverage in one pass.", {
    fields: [
      company("Business name", { required: true }),
      drop("Industry", ["Construction", "Retail", "Restaurant", "Professional services", "Manufacturing", "Tech", "Other"], { required: true }),
      num("Employees", { min: 0 }),
      money("Yearly revenue"),
      many("Coverage needed", ["General liability", "Property", "Workers' comp", "Commercial auto", "Cyber", "Professional liability"], { required: true }),
      fullName(),
      email(),
      phone(),
    ],
    end: { title: "Thanks", text: "Book a call to go over coverage.", booking: true },
  }),
  tpl("insurance.policy-review", "insurance", "Policy review", ["request", "lead"], "Offer a free review of existing policies.", {
    fields: [fullName(), email("Email"), phone(), files("Current policies"), long("Any concerns?"), one("Best time to talk", DAYPART)],
    end: { title: "Thanks", text: "Pick a time for your review.", booking: true },
  }),
];

export const REAL_ESTATE = [
  tpl("real_estate.home-valuation", "real_estate", "Home valuation", ["lead", "request"], "A free valuation that captures sellers early.", {
    featured: true,
    fields: [
      address("Property address", { required: true }),
      one("Bedrooms", ["1", "2", "3", "4", "5+"], { required: true, half: true }),
      one("Bathrooms", ["1", "1.5", "2", "2.5", "3+"], { required: true, half: true }),
      one("Condition", ["Needs work", "Average", "Updated", "Like new"], { required: true }),
      one("When are you thinking of selling?", ["Now", "In 3 months", "In 6–12 months", "Just curious"], { required: true, save: "sell_timeline" }),
      fullName(),
      email("Email"),
      phone(),
    ],
    submit: "Get my valuation",
    end: ["Your valuation is on its way", "A local agent will send it within one business day."],
  }),
  tpl("real_estate.buyer-inquiry", "real_estate", "Buyer inquiry", ["lead", "booking"], "Qualify buyers by budget, area and timing.", {
    featured: true,
    fields: [
      fullName(),
      email("Email"),
      phone(),
      one("Budget", ["Under $300k", "$300k–$500k", "$500k–$800k", "$800k–$1.5M", "Over $1.5M"], { required: true, save: "budget" }),
      text("Areas you like", { required: true }),
      one("Bedrooms", ["1+", "2+", "3+", "4+"]),
      one("Pre-approved for a mortgage?", ["Yes", "Not yet", "Paying cash"], { required: true }),
      date("Ideal move date"),
    ],
    end: { title: "Thanks, let's find your home", text: "Book a time with an agent.", booking: true },
  }),
  tpl("real_estate.showing-request", "real_estate", "Showing request", ["booking", "request"], "Let buyers request a viewing.", {
    fields: [text("Property address or listing", { required: true }), date("Preferred date", { required: true }), one("Preferred time", DAYPART, { required: true }), fullName(), email("Email"), phone("Phone", { required: true })],
    submit: "Request showing",
    end: ["Request sent", "We'll confirm the time by text or email."],
  }),
  tpl("real_estate.open-house", "real_estate", "Open house sign-in", ["registration", "lead"], "A tablet-friendly sign-in for open houses.", {
    fields: [fullName(), email("Email"), phone(), yesno("Are you working with an agent?", { required: true }), one("Are you looking to…", ["Buy", "Sell", "Both", "Just looking"])],
    submit: "Sign in",
    end: ["Welcome", "Enjoy the tour. We'll follow up with similar homes."],
  }),
  tpl("real_estate.rental-application", "real_estate", "Rental application", ["application"], "Screen renters with income, references and ID.", {
    pages: [
      { title: "Applicant", fields: [fullName(), email("Email"), phone("Phone", { required: true }), date("Date of birth", { required: true }), address("Current address", { required: true })] },
      { title: "Income", fields: [text("Employer", { required: true }), money("Monthly income", { required: true }), files("Proof of income")] },
      { title: "Household", fields: [num("People living in the unit", { min: 1, required: true }), yesno("Any pets?"), text("Tell us about your pets", { show: when("Any pets?", "is", true) }), long("References (name and phone)")] },
      { title: "Sign", fields: [file("Photo ID", { required: true }), agree("The information above is true."), sign("Signature")] },
    ],
    end: ["Application received", "We'll be in touch within two business days."],
  }),
  tpl("real_estate.maintenance", "real_estate", "Maintenance request", ["request"], "Tenants report issues with photos and access.", {
    fields: [fullName(), email("Email"), text("Unit", { required: true }), drop("Issue", ["Plumbing", "Electrical", "Heating or cooling", "Appliance", "Pests", "Other"], { required: true }), one("How urgent?", ["Emergency", "Within a few days", "When convenient"], { required: true }), long("Describe the issue", { required: true }), files("Photos"), yesno("May we enter if you're not home?")],
    end: ["Request received", "We'll schedule a visit and let you know."],
  }),
  tpl("real_estate.commercial-space", "real_estate", "Commercial space inquiry", ["lead"], "Qualify tenants for office, retail and industrial space.", {
    fields: [fullName(), email(), company(), one("Space type", ["Office", "Retail", "Industrial", "Flex", "Restaurant"], { required: true }), num("Square feet needed", { min: 100 }), text("Preferred location"), money("Monthly budget"), date("Move-in date")],
    end: { title: "Thanks", text: "Book a time to talk through options.", booking: true },
  }),
  tpl("real_estate.seller-intake", "real_estate", "Seller listing intake", ["intake"], "Everything you need to list a home.", {
    fields: [fullName(), email("Email"), phone(), address("Property address", { required: true }), num("Square feet", { min: 100 }), long("Recent upgrades"), money("Price you have in mind"), files("Photos")],
    end: { title: "Thanks", text: "Book your listing walkthrough.", booking: true },
  }),
];

