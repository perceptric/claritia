// Education and training, ecommerce and retail, manufacturing, logistics, automotive.
import { address, agree, company, date, drop, email, email2, file, files, fullName, go, HEARD, jobTitle, long, many, money, num, one, phone, phone2, scale, sign, stars, text, TIMELINE, tpl, url, website, when, yesno } from "./build.ts";

export const EDUCATION = [
  tpl("education.course-inquiry", "education", "Course inquiry", ["lead"], "Capture prospective students by program and term.", {
    featured: true,
    fields: [fullName(), email("Email"), phone(), drop("Program", ["Business", "Design", "Technology", "Health", "Languages", "Other"], { required: true, save: "program" }), one("Start term", ["Spring", "Summer", "Fall", "Not sure"], { required: true }), one("Highest education so far", ["High school", "Some college", "Bachelor's", "Master's or higher"]), long("Questions")],
    end: { title: "Thanks for your interest", text: "Book a call with an advisor.", booking: true },
  }),
  tpl("education.application", "education", "Application", ["application"], "A full application with essay and documents.", {
    featured: true,
    version: 2,
    cover: { title: "Application", text: "About 20 minutes. Have your transcripts and two references ready.", button: "Start" },
    resume: true,
    copy: true,
    pages: [
      {
        title: "Student",
        fields: [
          fullName("Student's name"),
          email("Email"),
          phone("Phone", { required: true }),
          date("Date of birth", { required: true }),
          address(),
          text("Program or grade you're applying for", { required: true }),
          yesno("Is the student under 18?", { required: true }),
        ],
        skip: go("Is the student under 18?", "is", false, "Grades"),
      },
      {
        title: "Family",
        fields: [
          text("Parent or guardian name", { required: true }),
          one("Relationship to the student", ["Parent", "Guardian", "Other"]),
          email2("Parent or guardian email", { required: true }),
          phone2("Parent or guardian phone"),
          yesno("Is there a second parent or guardian?"),
          text("Second parent or guardian name", { show: when("Is there a second parent or guardian?", "is", true) }),
          email2("Second parent or guardian email", { show: when("Is there a second parent or guardian?", "is", true) }),
        ],
      },
      {
        title: "Grades",
        fields: [
          text("Most recent school", { required: true }),
          text("Graduation year"),
          text("Grade average or GPA"),
          files("Transcripts", { required: true }),
          files("Test scores"),
        ],
      },
      {
        title: "Activities",
        fields: [
          many("Activities", ["Sports", "Music or arts", "Clubs", "Volunteering", "A job", "Other"]),
          long("Tell us about the one that matters most to you"),
          text("Awards or honors"),
          num("Hours a week on activities", { min: 0 }),
        ],
      },
      {
        title: "Essay",
        fields: [
          long("Why do you want to join this program?", { required: true }),
          long("Tell us about a challenge you faced and what you learned"),
          file("Writing sample"),
        ],
      },
      {
        title: "References",
        fields: [
          text("Reference name", { required: true }),
          email2("Reference email", { required: true }),
          text("How do they know you?"),
          text("Second reference name"),
          email2("Second reference email"),
        ],
      },
      {
        title: "Confirm",
        fields: [one("How did you hear about us?", HEARD), agree("Everything in this application is true."), sign("Signature")],
      },
    ],
    end: ["Application submitted", "We'll email you about next steps."],
  }),
  tpl("education.course-feedback", "education", "Course feedback", ["feedback", "survey"], "End-of-course feedback on content and teaching.", {
    fields: [text("Course", { required: true }), stars("Overall rating", { required: true }), scale("The instructor explained things clearly", "Disagree", "Agree"), one("Pace", ["Too slow", "About right", "Too fast"]), long("What was most useful?"), long("What should change?")],
    end: ["Thank you", "Your feedback improves the next course."],
  }),
  tpl("education.tutoring", "education", "Tutoring request", ["request", "booking"], "Match students with the right tutor.", {
    fields: [fullName("Parent or student name"), email("Email"), phone(), drop("Subject", ["Math", "Reading and writing", "Science", "Languages", "Test prep", "Other"], { required: true }), drop("Grade", ["Elementary", "Middle school", "High school", "College", "Adult"], { required: true }), long("Goals"), many("Available days", ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])],
    end: { title: "Thanks", text: "Pick a time for a free first session.", booking: true },
  }),
  tpl("education.corporate-training", "education", "Corporate training request", ["request", "lead"], "Scope training for a team.", {
    fields: [fullName(), email(), company(undefined, { required: true }), num("Team size", { min: 1, save: "team_size_num" }), text("Topic", { required: true }), one("Format", ["On site", "Online live", "Self-paced"], { required: true }), text("Preferred dates")],
    end: { title: "Thanks", text: "Book a call to plan the training.", booking: true },
  }),
  tpl("education.scholarship", "education", "Scholarship application", ["application"], "Collect need, essays and references.", {
    version: 2,
    cover: { title: "Scholarship application", text: "About 15 minutes. Have your transcript and a reference ready.", button: "Start" },
    resume: true,
    copy: true,
    pages: [
      { title: "About you", fields: [fullName(), email("Email"), phone(), date("Date of birth"), address()] },
      {
        title: "School",
        fields: [
          text("School and program", { required: true }),
          one("Year in school", ["Last year of high school", "First year", "Second year", "Third year", "Fourth year", "Graduate school"], { required: true }),
          text("Grade average or GPA"),
          text("Expected graduation year"),
          file("Transcript", { required: true }),
        ],
      },
      {
        title: "Financial need",
        fields: [
          money("Yearly household income"),
          num("People in your household", { min: 1 }),
          money("Cost of school this year"),
          yesno("Do you get other aid or scholarships?"),
          money("Other aid this year", { show: when("Do you get other aid or scholarships?", "is", true) }),
          long("Anything else about your situation we should know?"),
        ],
      },
      {
        title: "Essay",
        fields: [long("Tell us about your goals", { required: true }), long("How would this scholarship help?", { required: true }), files("Supporting documents")],
      },
      {
        title: "References",
        fields: [text("Reference name", { required: true }), email2("Reference email", { required: true }), text("How do they know you?"), file("Letter of recommendation")],
      },
      {
        title: "Certify",
        fields: [
          agree("Everything in this application is true."),
          agree("The committee may confirm my enrollment with my school."),
          sign("Signature"),
        ],
      },
    ],
    end: ["Application received", "We'll announce awards by email."],
  }),
  tpl("education.knowledge-check", "education", "Quiz / knowledge check", ["quiz"], "A scored quiz with instant results.", {
    fields: [
      one("Question 1: Which of these is a primary color?", ["Green", "Blue", "Orange", "Purple"], { required: true, points: [0, 1, 0, 0] }),
      one("Question 2: How many days are in a leap year?", ["364", "365", "366", "367"], { required: true, points: [0, 0, 1, 0] }),
      one("Question 3: Water boils at sea level at…", ["90 °C", "100 °C", "110 °C", "120 °C"], { required: true, points: [0, 1, 0, 0] }),
      email("Email for your results", { required: false }),
    ],
    submit: "See my score",
    end: {
      title: "Your score",
      text: "",
      score: [
        { min: 3, title: "Perfect score", text: "You got every question right." },
        { min: 2, title: "Nearly there", text: "Just one to review." },
        { min: 0, title: "Keep practicing", text: "Review the lesson and try again." },
      ],
    },
  }),
];

export const ECOMMERCE = [
  tpl("ecommerce.wholesale", "ecommerce", "Wholesale inquiry", ["lead", "application"], "Vet wholesale buyers before sharing prices.", {
    featured: true,
    fields: [fullName(), email(), company("Business name", { required: true }), website(), drop("Business type", ["Boutique", "Online store", "Chain", "Distributor", "Other"], { required: true }), text("Location", { required: true }), one("Typical order size", ["Under $500", "$500–$2,000", "$2,000–$10,000", "Over $10,000"], { required: true, save: "order_size" }), file("Resale certificate")],
    end: ["Thanks for applying", "We'll send our wholesale catalog once approved."],
  }),
  tpl("ecommerce.product-quiz", "ecommerce", "Product quiz", ["quiz", "lead"], "Recommend products and grow your list.", {
    fields: [
      one("Who are you shopping for?", ["Myself", "A gift", "My home"], { required: true }),
      one("Your style", ["Classic", "Bold", "Minimal", "Playful"], { required: true, save: "style" }),
      one("Budget", ["Under $50", "$50–$100", "$100–$250", "$250+"], { required: true }),
      many("What matters most?", ["Quality", "Price", "Sustainability", "Fast shipping"]),
      email("Email for your picks"),
    ],
    submit: "See my picks",
    end: ["Your picks are on the way", "Check your inbox for products chosen for you."],
  }),
  tpl("ecommerce.return", "ecommerce", "Return request", ["request"], "Start returns with order details and photos.", {
    version: 2,
    pages: [
      { title: "Your order", fields: [fullName(), email("Email"), text("Order number", { required: true }), date("Delivery date")] },
      {
        title: "The item",
        fields: [
          text("Item", { required: true }),
          text("Size or color"),
          num("How many are you returning?", { min: 1 }),
          one("Reason", ["Wrong size", "Damaged", "Wrong item sent", "Not as described", "Changed my mind", "Other"], { required: true }),
          long("Tell us more"),
        ],
        jumps: [go("Reason", "any", ["Damaged", "Wrong item sent", "Not as described"], "Photos"), go("Reason", "any", ["Changed my mind", "Other"], "Refund or exchange")],
      },
      {
        title: "Size and fit",
        fields: [text("Size you ordered", { required: true, half: true }), text("Size you need", { half: true }), one("How did it fit?", ["Too small", "Too big", "Too long", "Too short", "Other"])],
        skip: go("Reason", "is", "Wrong size", "Refund or exchange"),
      },
      {
        title: "Photos",
        fields: [
          files("Photos of the item", { required: true }),
          file("Photo of the box and label"),
          text("What did you get instead?", { show: when("Reason", "is", "Wrong item sent") }),
          yesno("Was the box damaged when it arrived?", { show: when("Reason", "is", "Damaged") }),
        ],
      },
      {
        title: "Refund or exchange",
        fields: [
          one("What would you like?", ["A refund", "An exchange", "Store credit"], { required: true }),
          text("What should we send instead?", { show: when("What would you like?", "is", "An exchange"), placeholder: "Size, color or item" }),
          one("How will you send it back?", ["Drop it off", "Schedule a pickup", "Bring it to a store"]),
          long("Anything else?"),
        ],
      },
    ],
    end: ["Return started", "We'll email your return details shortly."],
  }),
  tpl("ecommerce.back-in-stock", "ecommerce", "Back-in-stock alert", ["registration", "lead"], "Let shoppers know when an item returns.", {
    fields: [text("Product", { required: true }), text("Size or color"), email("Email")],
    submit: "Notify me",
    end: ["You're on the list", "We'll email you the moment it's back."],
  }),
  tpl("ecommerce.review", "ecommerce", "Product review", ["feedback"], "Collect reviews with photos.", {
    fields: [text("Product", { required: true }), stars("Rating", { required: true }), text("Headline"), long("Your review", { required: true }), file("Photo"), fullName("Name", { required: false }), email("Email")],
    end: ["Thanks for the review", "It will appear once approved."],
  }),
  tpl("ecommerce.influencer", "ecommerce", "Influencer application", ["application"], "Find creators for collabs.", {
    fields: [fullName(), email("Email"), text("Handle", { required: true }), many("Platforms", ["Instagram", "TikTok", "YouTube", "Pinterest", "Blog", "Other"], { required: true }), one("Followers", ["Under 10k", "10k–50k", "50k–250k", "250k+"], { required: true }), text("Niche"), url("Best post link")],
    end: ["Thanks for applying", "We'll reach out if it's a fit."],
  }),
  tpl("ecommerce.custom-order", "ecommerce", "Custom order request", ["order", "request"], "Take custom orders with specs and a date.", {
    fields: [fullName(), email("Email"), phone(), text("Item", { required: true }), long("Specs", { required: true }), num("Quantity", { required: true, min: 1 }), date("Date needed"), files("Reference images")],
    end: ["Request received", "We'll send a quote within two business days."],
  }),
];

export const MANUFACTURING = [
  tpl("manufacturing.rfq", "manufacturing", "RFQ (request for quote)", ["request", "lead"], "Quotes with drawings, materials and volumes.", {
    featured: true,
    pages: [
      {
        title: "About you",
        fields: [
          fullName(),
          email(),
          company(undefined, { required: true }),
          phone(),
        ],
      },
      {
        title: "The part",
        fields: [
          text("Part name or number", { required: true }),
          drop("Material", ["Aluminum", "Steel", "Stainless steel", "Plastic", "Other"], { required: true }),
          num("Quantity", { required: true, min: 1 }),
          files("Drawings (PDF, STEP, DWG)", { required: true }),
          date("Quote needed by"),
          long("Notes"),
        ],
      },
    ],
    submit: "Request quote",
    end: ["RFQ received", "Our estimators will reply within two business days."],
  }),
  tpl("manufacturing.distributor", "manufacturing", "Distributor application", ["application", "lead"], "Screen new distributors by region and volume.", {
    fields: [company(undefined, { required: true }), website(), fullName("Contact name"), email(), text("Regions covered", { required: true }), long("Lines you carry"), money("Yearly volume")],
    end: { title: "Thanks for applying", text: "Book a call with our channel team.", booking: true },
  }),
  tpl("manufacturing.sample", "manufacturing", "Sample request", ["request"], "Ship samples to qualified buyers.", {
    fields: [fullName(), email(), company(undefined, { required: true }), text("Product", { required: true }), long("Intended use", { required: true }), num("Quantity", { min: 1 }), address("Ship to", { required: true, map: undefined, key: "ship_to" })],
    end: ["Request received", "We'll confirm shipping by email."],
  }),
  tpl("manufacturing.supplier-onboarding", "manufacturing", "Supplier onboarding", ["intake", "application"], "Collect tax, certifications and insurance.", {
    internal: true,
    version: 2,
    cover: { title: "Supplier onboarding", text: "About 10 minutes. Have your tax form, insurance certificate and bank details nearby.", button: "Start" },
    copy: true,
    pages: [
      {
        title: "Company",
        fields: [
          company("Supplier name", { required: true }),
          website(),
          address("Business address", { required: true }),
          one("Business type", ["Corporation", "LLC", "Partnership", "Sole proprietor", "Other"]),
          many("What do you supply?", ["Raw materials", "Parts and components", "Packaging", "Tooling and equipment", "Services", "Other"], { required: true }),
          yesno("Do you hold any quality or industry certifications?", { required: true }),
        ],
      },
      {
        title: "Contacts",
        fields: [
          fullName("Contact name"),
          email(),
          phone(undefined, { half: true }),
          jobTitle(undefined, { half: true }),
          email2("Billing email", { required: true }),
          email2("Email for purchase orders"),
        ],
      },
      {
        title: "Banking",
        fields: [
          one("How would you like to be paid?", ["ACH transfer", "Wire transfer", "Check"], { required: true }),
          text("Bank name", { show: when("How would you like to be paid?", "not", "Check") }),
          text("Name on the account", { show: when("How would you like to be paid?", "not", "Check") }),
          text("Routing number", { show: when("How would you like to be paid?", "not", "Check"), half: true }),
          text("Account number", { show: when("How would you like to be paid?", "not", "Check"), half: true }),
          file("Voided check or bank letter", { show: when("How would you like to be paid?", "not", "Check") }),
          address("Remit-to address", { show: when("How would you like to be paid?", "is", "Check"), map: undefined, key: "remit_to" }),
        ],
      },
      {
        title: "Tax and insurance",
        fields: [text("Tax ID", { required: true }), files("W-9 or equivalent", { required: true }), files("Insurance certificate", { required: true }), date("Insurance expiry date")],
        skip: go("Do you hold any quality or industry certifications?", "is", false, "Sign"),
      },
      {
        title: "Compliance",
        fields: [
          many("Certifications", ["ISO 9001", "ISO 14001", "AS9100", "IATF 16949", "Other"], { required: true }),
          files("Certificates", { required: true }),
          date("Earliest expiry date"),
          yesno("Have you had a customer or outside audit in the last 2 years?"),
          file("Latest audit report", { show: when("Have you had a customer or outside audit in the last 2 years?", "is", true) }),
        ],
      },
      {
        title: "Sign",
        fields: [text("Signer's name and title", { required: true }), agree("The information in this form is true and complete."), sign("Signature")],
      },
    ],
    end: ["Received", "Our purchasing team will review your details."],
  }),
  tpl("manufacturing.quality-issue", "manufacturing", "Quality issue report", ["request"], "Log defects with photos and lot numbers.", {
    fields: [email("Email"), company(), text("Order or lot number", { required: true }), text("Part", { required: true }), long("Issue", { required: true }), num("Quantity affected", { min: 1 }), files("Photos")],
    end: ["Report received", "Quality will respond within one business day."],
  }),
];

export const LOGISTICS = [
  tpl("logistics.freight-quote", "logistics", "Freight quote", ["request", "lead"], "Lane, weight and date for a fast quote.", {
    featured: true,
    fields: [
      text("Pickup city or ZIP", { required: true, half: true }),
      text("Delivery city or ZIP", { required: true, half: true }),
      one("Mode", ["Full truckload", "Less than truckload", "Intermodal", "Air", "Ocean"], { required: true }),
      num("Weight (lb)", { required: true, min: 1, half: true }),
      num("Pallets", { min: 0, half: true }),
      date("Ship date", { required: true }),
      fullName(),
      email(),
      company(),
    ],
    submit: "Get a quote",
    end: ["Quote request received", "We'll send rates within a few hours."],
  }),
  tpl("logistics.carrier-onboarding", "logistics", "Carrier onboarding", ["application", "intake"], "Onboard carriers with authority and insurance.", {
    internal: true,
    fields: [company("Carrier name", { required: true }), text("MC number", { required: true, half: true }), text("DOT number", { required: true, half: true }), fullName("Dispatch contact"), email(), phone(), files("Insurance certificate", { required: true }), text("Preferred lanes")],
    end: ["Received", "We'll confirm setup within one business day."],
  }),
  tpl("logistics.warehouse", "logistics", "Warehouse space inquiry", ["lead"], "Size storage needs and services.", {
    fields: [fullName(), email(), company(), num("Pallet positions", { required: true, min: 1 }), one("How long?", ["Under 3 months", "3–12 months", "12+ months"], { required: true }), many("Services", ["Pick and pack", "Cross-dock", "Kitting", "Cold storage", "Returns"]), text("Location")],
    end: { title: "Thanks", text: "Book a call to go over pricing.", booking: true },
  }),
  tpl("logistics.driver-application", "logistics", "Driver application", ["application"], "Hire drivers with license and experience.", {
    fields: [fullName(), email("Email"), phone("Phone", { required: true }), one("License class", ["Class A", "Class B", "Class C", "None"], { required: true }), num("Years of experience", { required: true, min: 0 }), many("Endorsements", ["Hazmat", "Tanker", "Doubles/triples", "Passenger"]), file("License (front)")],
    end: ["Application received", "Our recruiter will call you."],
  }),
];

export const AUTOMOTIVE = [
  tpl("automotive.test-drive", "automotive", "Test drive booking", ["booking", "lead"], "Book test drives by model and time.", {
    featured: true,
    fields: [text("Model", { required: true }), date("Date", { required: true }), one("Time", ["Morning", "Afternoon", "Evening"], { required: true }), fullName(), email("Email"), phone("Phone", { required: true }), yesno("Do you have a trade-in?")],
    submit: "Book test drive",
    end: ["You're booked", "We'll have the car ready."],
  }),
  tpl("automotive.trade-in", "automotive", "Trade-in value", ["request", "lead"], "Estimate trade-ins with photos.", {
    fields: [num("Year", { required: true, min: 1950, max: 2030, half: true }), text("Make", { required: true, half: true }), text("Model", { required: true }), num("Mileage", { required: true, min: 0 }), one("Condition", ["Rough", "Fair", "Good", "Excellent"], { required: true }), files("Photos"), fullName(), email("Email"), phone()],
    end: ["Thanks", "We'll send your trade-in value shortly."],
  }),
  tpl("automotive.service", "automotive", "Service appointment", ["booking", "request"], "Book service by vehicle and job.", {
    fields: [text("Vehicle (year, make, model)", { required: true }), many("Service", ["Oil change", "Brakes", "Tires", "Inspection", "Check engine light", "Other"], { required: true }), date("Preferred date", { required: true }), fullName(), phone("Phone", { required: true }), email("Email")],
    end: ["Request received", "We'll confirm your appointment."],
  }),
  tpl("automotive.fleet", "automotive", "Fleet inquiry", ["lead"], "Qualify fleet buyers.", {
    fields: [fullName(), email(), company(undefined, { required: true }), jobTitle(), num("Vehicles needed", { required: true, min: 1 }), text("Main use"), one("Timeline", TIMELINE, { save: "timeline" })],
    end: { title: "Thanks", text: "Book a call with our fleet team.", booking: true },
  }),
];
