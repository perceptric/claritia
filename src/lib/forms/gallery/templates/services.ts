// Agencies, consulting, legal, accounting.
import { address, agree, BUDGET, company, CONTACT_PREF, date, drop, email, file, files, fullName, go, HEARD, jobTitle, long, many, matrix, money, nps, num, one, phone, scale, sign, stars, text, THANKS, TIMELINE, tpl, when, website, yesno } from "./build.ts";

const SERVICES = ["Brand and design", "Website", "SEO", "Paid ads", "Content", "Social media", "Email marketing", "Strategy"];

export const AGENCY = [
  tpl("agency.project-inquiry", "agency", "Project inquiry", ["lead", "request"], "Qualify new projects before the first call.", {
    featured: true,
    fields: [
      fullName(),
      email(),
      company(undefined, { required: true, half: true }),
      website(undefined, { half: true }),
      many("What do you need help with?", SERVICES, { required: true, save: "services" }),
      one("Budget", BUDGET, { required: true, save: "budget" }),
      date("Ideal start date"),
      long("Goals for the project", { required: true }),
      one("How did you find us?", HEARD),
    ],
    end: { title: "Thanks, let's talk", text: "Pick a time for a 20-minute intro call.", booking: true },
  }),
  tpl("agency.client-intake", "agency", "Client intake", ["intake"], "Everything you need to kick off a new client.", {
    featured: true,
    version: 2,
    cover: { title: "Welcome aboard", text: "About 10 minutes. Have your logo and brand files nearby.", button: "Start" },
    copy: true,
    pages: [
      {
        title: "The business",
        fields: [
          fullName("Main contact"),
          email(),
          phone(),
          company("Brand name", { required: true }),
          website(undefined, { required: true }),
          long("What do you sell, in two sentences?", { required: true }),
        ],
      },
      {
        title: "The audience",
        fields: [
          long("Who is your ideal customer?", { required: true }),
          many("Where do customers find you today?", ["Search", "Social media", "Referrals", "Ads", "Events", "Partners"]),
          text("Top 3 competitors"),
          long("What makes you different?"),
        ],
      },
      {
        title: "Brand",
        fields: [
          yesno("Do you have brand guidelines?"),
          files("Brand assets (logo, guidelines)"),
          many("How should your brand sound?", ["Friendly", "Expert", "Playful", "Bold", "Calm", "Premium"]),
          text("Brands you admire"),
          long("Words, colors or styles to avoid"),
        ],
      },
      {
        title: "Goals and budget",
        fields: [
          many("Goals for the next 6 months", ["More leads", "More sales", "Brand awareness", "Launch something new", "Enter a new market"], { required: true }),
          many("What are you hiring us for?", SERVICES, { required: true, save: "services" }),
          text("How will you measure success?"),
          one("Budget", BUDGET, { save: "budget" }),
          date("Key launch or deadline"),
        ],
      },
      {
        title: "Access and assets",
        fields: [
          many("Which tools will we need access to?", ["Website", "Analytics", "Search Console", "Ad accounts", "Social accounts", "Email platform", "CRM"]),
          one("How will you share access?", ["Invite our team as users", "Through a password manager", "Set it up on the kickoff call"]),
          files("Photos, videos and past work"),
          long("Past campaigns: what worked and what didn't?"),
        ],
      },
      {
        title: "Kickoff",
        fields: [
          text("Who should join the kickoff?"),
          one("Best way to reach you day to day", ["Email", "Slack", "Phone", "Video calls"]),
          one("How often should we check in?", ["Weekly", "Every two weeks", "Monthly"]),
          long("Anything else before we start?"),
        ],
      },
    ],
    end: { title: "Intake complete", text: "Pick a time for your kickoff call.", booking: true },
  }),
  tpl("agency.creative-brief", "agency", "Creative brief", ["intake", "request"], "A brief your creative team can work from.", {
    featured: true,
    fields: [
      email("Email"),
      text("Project name", { required: true }),
      long("Who is it for?", { required: true }),
      long("The one thing it must say", { required: true }),
      many("Deliverables", ["Social posts", "Video", "Landing page", "Ads", "Print", "Email", "Other"], { required: true }),
      date("Deadline", { required: true }),
      long("Examples you like"),
      files("References"),
    ],
    end: ["Brief received", "We'll confirm scope and timing within one business day."],
  }),
  tpl("agency.seo-audit", "agency", "SEO audit request", ["lead", "request"], "Offer a free audit to start the conversation.", {
    fields: [website("Your website", { required: true }), text("Main keywords you want to rank for"), text("Top competitors"), email(), fullName("Name", { required: false })],
    submit: "Get my audit",
    end: ["Your audit is being prepared", "We'll email it within three business days."],
  }),
  tpl("agency.website-brief", "agency", "Website project brief", ["intake", "request"], "Scope a new site or redesign.", {
    fields: [
      fullName(),
      email(),
      company(),
      website("Current website"),
      num("How many pages?", { min: 1 }),
      many("Features", ["Blog", "Online store", "Booking", "Member area", "Multiple languages", "Forms", "Search"]),
      long("Sites you like, and why"),
      one("Budget", BUDGET, { save: "budget" }),
      date("Launch date"),
    ],
    end: { title: "Thanks for the brief", text: "Let's walk through it together.", booking: true },
  }),
  tpl("agency.client-checkin", "agency", "Monthly client check-in", ["feedback", "survey"], "A quick pulse on how each account feels.", {
    fields: [email("Email"), scale("How happy are you with our work this month?", "Not happy", "Very happy", { required: true }), long("What's working?"), long("What should we change?"), text("Top priority for next month")],
    end: ["Thanks", "We'll bring this to our next call."],
  }),
  tpl("agency.content-approval", "agency", "Content approval", ["request"], "Get a clear yes or change request on a piece.", {
    fields: [email("Email"), text("Which piece?", { required: true }), one("Decision", ["Approved", "Approved with small changes", "Needs changes"], { required: true }), long("Notes", { show: when("Decision", "not", "Approved") })],
    end: ["Got it", "We'll move ahead based on your decision."],
  }),
  tpl("agency.freelancer-application", "agency", "Freelancer application", ["application"], "Build a bench of reliable freelancers.", {
    fields: [
      fullName(),
      email("Email"),
      many("Skills", ["Design", "Copywriting", "Development", "Video", "Ads", "SEO", "Strategy"], { required: true }),
      website("Portfolio", { required: true, map: undefined, key: "portfolio" }),
      num("Hourly rate (USD)", { min: 0 }),
      one("Availability", ["Full time", "Part time", "Project by project"], { required: true }),
    ],
    end: ["Thanks for applying", "We'll reach out when a project fits."],
  }),
  tpl("agency.marketing-audit", "agency", "Free marketing audit", ["lead"], "Qualify leads with spend and channel data.", {
    fields: [
      website(undefined, { required: true }),
      one("Monthly ad spend", ["None", "Under $5,000", "$5,000–$25,000", "$25,000–$100,000", "Over $100,000"], { required: true, save: "ad_spend" }),
      many("Channels you use", ["Google Ads", "Meta", "LinkedIn", "SEO", "Email", "Events"]),
      one("Main goal", ["More leads", "Lower cost per lead", "More sales", "Brand awareness"], { required: true }),
      fullName(),
      email(),
    ],
    end: { title: "Thanks, your audit is next", text: "Book a time to go through it together.", booking: true },
  }),
];

export const CONSULTING = [
  tpl("consulting.consultation", "consulting", "Consultation request", ["lead", "booking"], "Book first calls with a little context.", {
    featured: true,
    fields: [fullName(), email(), company(), jobTitle(), long("What challenge are you facing?", { required: true }), one("How urgent is it?", ["This week", "This month", "This quarter", "No rush"], { required: true, save: "urgency" })],
    end: { title: "Pick a time", text: "Choose a slot for your consultation.", booking: true },
  }),
  tpl("consulting.discovery", "consulting", "Discovery questionnaire", ["intake"], "Go into the first meeting already informed.", {
    featured: true,
    pages: [
      { title: "Today", fields: [fullName(), email(), company(undefined, { required: true }), long("Describe where things stand today", { required: true })] },
      { title: "Where you want to be", fields: [long("What does success look like in 12 months?", { required: true }), long("What's in the way?"), one("Budget", BUDGET, { save: "budget" })] },
      { title: "Decision", fields: [text("Who else is involved in the decision?"), one("When do you want to decide?", TIMELINE, { save: "timeline" })] },
    ],
    end: { title: "Thanks for the detail", text: "Book your discovery call below.", booking: true },
  }),
  tpl("consulting.proposal-request", "consulting", "Proposal request", ["request"], "Collect scope, budget and timing for a proposal.", {
    fields: [fullName(), email(), company(undefined, { required: true }), long("Scope of work", { required: true }), one("Budget", BUDGET, { save: "budget" }), date("Decision date"), file("RFP or brief")],
    end: THANKS("with a proposal or questions within three business days"),
  }),
  tpl("consulting.engagement-feedback", "consulting", "Engagement feedback", ["feedback", "survey"], "Close every engagement with a score and a quote.", {
    fields: [
      email("Email"),
      stars("Overall rating", { required: true }),
      matrix("How did we do?", ["Communication", "Quality of work", "Timeliness", "Value for money"], ["Poor", "Fair", "Good", "Great"]),
      nps("How likely are you to recommend us?"),
      long("What results did you see?"),
      yesno("May we quote you?"),
    ],
    end: ["Thank you", "It was a pleasure working with you."],
  }),
  tpl("consulting.workshop-registration", "consulting", "Workshop registration", ["registration"], "Sign people up for a workshop or training day.", {
    fields: [fullName(), email(), company(undefined, { half: true }), jobTitle("Role", { half: true }), one("Session", ["Morning session", "Afternoon session", "Online"], { required: true }), text("Dietary needs")],
    submit: "Register",
    end: ["You're registered", "We'll send the details a week before."],
  }),
  tpl("consulting.speaker-request", "consulting", "Speaker request", ["request"], "Take requests for talks and keynotes.", {
    fields: [fullName(), email(), text("Event name", { required: true }), date("Event date", { required: true }), num("Audience size", { min: 1 }), text("Topic"), one("Format", ["Keynote", "Panel", "Workshop", "Podcast or interview"]), text("Budget")],
    end: THANKS("about availability within two business days"),
  }),
];

const PRACTICE = ["Family", "Personal injury", "Business", "Employment", "Real estate", "Estate planning", "Immigration", "Criminal defense", "Other"];

export const LEGAL = [
  tpl("legal.case-evaluation", "legal", "Case evaluation", ["intake", "lead"], "A free case review that captures the key facts.", {
    featured: true,
    version: 2,
    pages: [
      {
        title: "About you",
        fields: [
          fullName(),
          phone("Phone", { required: true }),
          email("Email"),
          one("Best way to reach you", CONTACT_PREF),
          text("City and state"),
          drop("Type of case", PRACTICE, { required: true, save: "practice_area" }),
        ],
        jumps: [
          go("Type of case", "is", "Family", "Family matter"),
          go("Type of case", "any", ["Business", "Employment"], "Work or business"),
          go("Type of case", "any", ["Real estate", "Estate planning", "Immigration", "Criminal defense", "Other"], "Timeline and consent"),
        ],
      },
      {
        title: "Injury details",
        fields: [
          one("How were you hurt?", ["Car or truck accident", "Slip or fall", "At work", "Medical care", "Dog bite", "Other"], { required: true }),
          yesno("Did you get medical treatment?"),
          yesno("Was a police or incident report made?"),
          yesno("Have you talked to an insurance company?"),
        ],
        skip: go("Type of case", "is", "Personal injury", "Timeline and consent"),
      },
      {
        title: "Family matter",
        fields: [
          one("What is the family matter about?", ["Divorce or separation", "Child custody", "Child support", "Adoption", "Protective order", "Other"], { required: true }),
          yesno("Are there children under 18?"),
          yesno("Has anyone filed in court yet?"),
          date("Next court date", { show: when("Has anyone filed in court yet?", "is", true) }),
        ],
        skip: go("Type of case", "is", "Family", "Timeline and consent"),
      },
      {
        title: "Work or business",
        fields: [
          one("What is the work issue about?", ["Unpaid wages", "Fired or let go", "Discrimination or harassment", "Other"], { show: when("Type of case", "is", "Employment") }),
          yesno("Are you still working there?", { show: when("Type of case", "is", "Employment") }),
          one("What is the business matter about?", ["A contract", "Forming a business", "A dispute with a partner", "Collecting a debt", "Other"], { show: when("Type of case", "is", "Business") }),
          text("Employer or company name"),
          yesno("Is there a written contract or agreement?"),
        ],
      },
      {
        title: "Timeline and consent",
        fields: [
          long("Tell us what happened", { required: true }),
          date("When did it happen?"),
          text("Other people or companies involved"),
          yesno("Is there a deadline or court date coming up?"),
          yesno("Have you talked to another lawyer about this?"),
          files("Documents"),
          agree("I understand this form does not create an attorney-client relationship."),
        ],
      },
    ],
    submit: "Request my free review",
    end: { title: "We've received your case", text: "An attorney will review it and contact you within one business day.", booking: true },
  }),
  tpl("legal.new-client-intake", "legal", "New client intake", ["intake"], "Collect contact details and matter facts.", {
    pages: [
      { title: "Your details", fields: [fullName(), email("Email"), phone("Phone", { required: true }), address()] },
      { title: "The matter", fields: [drop("Matter type", PRACTICE, { required: true, save: "practice_area" }), text("Other parties involved"), long("Summary", { required: true }), files("Documents")] },
    ],
    end: ["Intake received", "We'll be in touch to schedule your first meeting."],
  }),
  tpl("legal.conflict-check", "legal", "Conflict check", ["intake"], "Clear conflicts before you take a matter.", {
    internal: true,
    fields: [text("Prospective client", { required: true }), long("Other parties", { required: true }), text("Related companies"), text("Opposing counsel"), email("Your email", { required: false, map: undefined, key: "submitter" })],
    end: ["Submitted", "The conflicts team will reply by email."],
  }),
  tpl("legal.consultation-booking", "legal", "Consultation booking", ["booking"], "Book paid or free consultations.", {
    fields: [fullName(), email("Email"), phone(), drop("Practice area", PRACTICE, { required: true, save: "practice_area" }), long("Short summary", { required: true })],
    submit: "Continue",
    end: { title: "Pick a time", text: "Choose a time for your consultation.", booking: true },
  }),
  tpl("legal.document-request", "legal", "Document request", ["request"], "Ask clients for the files you need.", {
    fields: [fullName(), email("Email"), text("Matter or case number", { required: true }), drop("Document type", ["ID", "Contract", "Financial records", "Correspondence", "Court papers", "Other"], { required: true }), files("Upload", { required: true }), long("Notes")],
    submit: "Send documents",
    end: ["Documents received", "We'll confirm once we've reviewed them."],
  }),
];

export const ACCOUNTING = [
  tpl("accounting.tax-intake", "accounting", "Tax prep intake", ["intake"], "Gather what you need to file a return.", {
    featured: true,
    version: 2,
    cover: { title: "Tax prep intake", text: "About 10 minutes. Have your tax forms and last year's return nearby.", button: "Start" },
    resume: true,
    copy: true,
    pages: [
      {
        title: "About you",
        fields: [
          fullName(),
          email("Email"),
          phone(),
          address(),
          one("Filing status", ["Single", "Married filing jointly", "Married filing separately", "Head of household", "Not sure"], { required: true }),
          text("Spouse's name", { show: when("Filing status", "any", ["Married filing jointly", "Married filing separately"]) }),
          yesno("Do you have dependents?", { required: true }),
        ],
        skip: go("Do you have dependents?", "is", false, "Income"),
      },
      {
        title: "Dependents",
        fields: [
          num("How many dependents?", { min: 1, required: true }),
          long("Names, birth dates and how they're related to you", { required: true }),
          yesno("Did you pay for child care?"),
          money("Child care paid this year", { show: when("Did you pay for child care?", "is", true) }),
        ],
      },
      {
        title: "Income",
        fields: [
          many("Income this year", ["Wages (W-2)", "Self-employment or business", "Rental", "Investments", "Retirement", "Unemployment", "Other"], { required: true }),
          yesno("Did you sell stocks, crypto or property?"),
          yesno("Any big changes this year?"),
          long("What changed?", { show: when("Any big changes this year?", "is", true), placeholder: "A move, a new job, a marriage, a new baby" }),
        ],
      },
      {
        title: "Deductions",
        fields: [
          many("Did you pay any of these?", ["Mortgage interest", "Property taxes", "Student loan interest", "Medical bills", "Charitable gifts", "Education costs", "None of these"]),
          money("Total charitable gifts", { show: when("Did you pay any of these?", "is", "Charitable gifts") }),
          yesno("Did you put money into a retirement account or HSA?"),
          long("Other costs we should know about"),
        ],
        skip: go("Income this year", "not", "Self-employment or business", "Uploads"),
      },
      {
        title: "Business income",
        fields: [
          text("Business name or type", { required: true }),
          money("Business income this year"),
          money("Business expenses this year"),
          yesno("Do you use part of your home for work?"),
          yesno("Did you buy equipment or a vehicle for the business?"),
          yesno("Did you make estimated tax payments?"),
        ],
      },
      {
        title: "Uploads",
        fields: [
          files("Tax forms (W-2, 1099 and others)", { required: true }),
          file("Last year's tax return"),
          files("Receipts and statements"),
          long("Questions for us"),
        ],
      },
      {
        title: "Review and sign",
        fields: [
          one("How would you like to go over your return?", ["By email", "On a call", "In person"]),
          agree("The information I gave is true and complete as far as I know."),
          sign("Signature"),
        ],
      },
    ],
    end: ["We have everything", "We'll reach out if anything is missing."],
  }),
  tpl("accounting.bookkeeping-quote", "accounting", "Bookkeeping quote", ["request", "lead"], "Price monthly bookkeeping from a few answers.", {
    fields: [
      fullName(),
      email(),
      company("Business name", { required: true }),
      drop("Business type", ["Services", "Retail", "Ecommerce", "Restaurant", "Construction", "Nonprofit", "Other"], { required: true }),
      one("Transactions per month", ["Under 100", "100–300", "300–1,000", "Over 1,000"], { required: true }),
      num("Bank and card accounts", { min: 0 }),
      drop("Accounting software", ["QuickBooks", "Xero", "FreshBooks", "Spreadsheets", "None"]),
    ],
    end: { title: "Thanks, here's what's next", text: "Book a 15-minute call and we'll send your quote.", booking: true },
  }),
  tpl("accounting.new-business", "accounting", "New business setup", ["intake", "lead"], "Help founders pick and form the right entity.", {
    fields: [fullName(), email(), one("Entity type", ["LLC", "S corp", "C corp", "Sole proprietor", "Not sure"], { required: true }), text("State"), num("Number of owners", { min: 1 }), date("Planned start date")],
    end: { title: "Thanks", text: "Let's talk through the setup.", booking: true },
  }),
  tpl("accounting.year-end", "accounting", "Year-end checklist", ["intake"], "Close the books with every document in hand.", {
    fields: [email("Email"), company("Business name"), files("Statements and receipts", { required: true }), many("Changes this year", ["New hires", "New equipment", "New location", "Loans", "None"]), long("Questions")],
    end: ["Received", "We'll start your year-end work this week."],
  }),
];

