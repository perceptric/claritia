// Wave 3, plain multi-page forms (docs/template-wave3-plan.md Part 3): 3 to 6 titled pages, no welcome screen or
// photo. Feedback, Quizzes, Intake, Operations and Consent.
import type { FormTemplate } from "../types.ts";
import { address, AGREE5, agree, company, date, email, email2, file, files, fullName, go, jobTitle, long, many, matrix, nps, one, phone, range, scale, sign, stars, TEAM_SIZE, text, time, tpl, url, website, when, yesno } from "./build.ts";

const ADDED = "2026-11-08";
const OPT_EMAIL = () => email2("Email, if you'd like a reply");

export const WAVE3_MULTIPAGE_B: FormTemplate[] = [
  // Feedback and surveys
  tpl("general.csat-survey-sections", "general", "Customer satisfaction survey in sections", ["survey", "feedback"], "Product, service and value, one section at a time.", {
    cats: "csat survey",
    teams: "success support",
    added: ADDED,
    also: ["retail", "saas"],
    pages: [
      { title: "Overall", fields: [scale("How satisfied are you overall?", "Not at all", "Very", { required: true }), one("How long have you been a customer?", ["Under 6 months", "6 to 12 months", "1 to 3 years", "Over 3 years"])] },
      { title: "Product", fields: [stars("Quality", { required: true }), stars("Ease of use"), text("What would you improve?")] },
      { title: "Service", fields: [yesno("Have you contacted us for help?", { key: "helped" }), stars("How helpful were we?", { show: when("helped", "is", true) }), stars("How fast did we answer?", { show: when("helped", "is", true) })] },
      { title: "Value", fields: [scale("Is it worth what you pay?", "No", "Yes", { required: true }), nps("How likely are you to recommend us?"), OPT_EMAIL()] },
    ],
    submit: "Send",
    end: ["Thank you", "Your answers help us get better."],
  }),
  tpl("saas.product-feedback-feature-pages", "saas", "Product feedback with feature pages", ["feedback"], "Rate each part of a product on its own page.", {
    cats: "product-feedback survey",
    teams: "product",
    added: ADDED,
    pages: [
      { title: "You", fields: [email(), one("Your role", ["Admin", "Daily user", "Now and then", "Buyer"], { required: true }), one("Team size", TEAM_SIZE)] },
      { title: "Features", fields: [matrix("How useful is each part?", ["Dashboard", "Reports", "Integrations", "Mobile app"], ["Not useful", "Somewhat", "Very useful", "Don't use"], { required: true })] },
      { title: "What's missing", fields: [long("What would you add?"), text("What would you remove?")] },
      { title: "Overall", fields: [nps("How likely are you to recommend us?", { required: true }), yesno("Would you join a 20-minute research call?")] },
    ],
    submit: "Send",
    end: ["Thank you", "The product team reads every answer."],
  }),
  tpl("saas.bug-report-steps-environment", "saas", "Bug report with steps and environment", ["request"], "What happened, steps to repeat it and the setup it happened on.", {
    cats: "bug-report request",
    teams: "support product",
    added: ADDED,
    also: ["it"],
    pages: [
      { title: "The problem", fields: [text("Short summary", { required: true }), one("How bad is it?", ["Small annoyance", "Hard to work around", "Blocks my work", "Data lost or wrong"], { required: true }), url("Page where it happened")] },
      { title: "Steps", fields: [long("Steps to make it happen", { required: true, placeholder: "1. Open...\n2. Click...\n3. See..." }), long("What did you expect?"), long("What happened instead?", { required: true })] },
      { title: "Environment", fields: [one("Device", ["Computer", "Phone", "Tablet"], { required: true }), one("Browser", ["Chrome", "Safari", "Firefox", "Edge", "The app"]), text("Version or operating system")] },
      { title: "Files and contact", fields: [files("Screenshots or video"), email(), yesno("May we follow up with questions?")] },
    ],
    submit: "Send report",
    end: ["Thanks for the report", "We'll email you when it's fixed."],
  }),
  tpl("hr.exit-interview-pages", "hr", "Exit interview in parts", ["feedback"], "Reasons, the role, the team and what would have helped.", {
    cats: "exit offboarding",
    teams: "hr",
    added: ADDED,
    internal: true,
    pages: [
      { title: "Leaving", fields: [date("Last day", { required: true }), one("Main reason", ["New job", "Pay", "Growth", "Manager", "Moving", "Other"], { required: true }), text("Where are you going, if you'd like to share?")] },
      { title: "Your role", fields: [scale("Did the job match what you were told?", "No", "Yes"), scale("Did you have what you needed?", "No", "Yes"), long("What would have kept you?")] },
      { title: "Your team", fields: [one("My manager supported me", AGREE5), one("I felt part of the team", AGREE5), long("Anything about your team we should know?")] },
      { title: "Last words", fields: [yesno("Would you come back?"), yesno("Would you recommend working here?"), long("Anything else?")] },
    ],
    submit: "Send",
    end: ["Thank you", "Your answers are kept private within HR."],
  }),
  tpl("hr.engagement-survey-parts", "hr", "Engagement survey in four parts", ["survey"], "Work, growth, team and wellbeing in four short parts.", {
    cats: "engagement survey",
    teams: "hr",
    added: ADDED,
    internal: true,
    also: ["general"],
    pages: [
      { title: "Your work", fields: [matrix("How much do you agree?", ["My work matters", "I know what's expected of me", "I have the tools I need"], AGREE5, { required: true })] },
      { title: "Growth", fields: [matrix("How much do you agree?", ["I'm learning here", "I can see a path forward", "I get useful feedback"], AGREE5, { required: true })] },
      { title: "Team", fields: [matrix("How much do you agree?", ["My team works well together", "I trust my manager", "I feel heard"], AGREE5, { required: true })] },
      { title: "Wellbeing", fields: [scale("How is your workload?", "Too light", "Too heavy"), scale("How stressed do you feel?", "Not at all", "Very"), long("One thing we should change")] },
    ],
    submit: "Send",
    end: ["Thank you", "Your answers are anonymous."],
  }),
  tpl("general.market-research-survey", "general", "Market research survey", ["survey"], "Who you are, what you use, what you'd pay.", {
    cats: "market-research survey",
    teams: "marketing founders",
    added: ADDED,
    also: ["saas", "ecommerce"],
    pages: [
      { title: "About you", fields: [one("Age", ["Under 25", "25 to 34", "35 to 49", "50 to 64", "65 or older"], { required: true }), one("Which best describes you?", ["Business owner", "Employee", "Freelancer", "Student", "Retired"]), text("Country")] },
      { title: "What you use", fields: [many("Which do you use now?", ["A paid app", "A free app", "Spreadsheets", "Pen and paper", "Nothing"], { required: true }), stars("How happy are you with it?")] },
      { title: "What you need", fields: [long("What's the hardest part today?", { required: true }), many("Must-haves", ["Low price", "Easy to learn", "Works on phone", "Good support", "Privacy"])] },
      { title: "Price", fields: [one("What would you pay a month?", ["Nothing", "Under $10", "$10 to $30", "$30 to $100", "Over $100"], { required: true }), OPT_EMAIL()] },
    ],
    submit: "Send",
    end: ["Thank you", "Your answers help us build the right thing."],
  }),

  // Quizzes and assessments
  tpl("general.personality-quiz-parts", "general", "Personality quiz in parts", ["quiz", "lead"], "Work, social and decision style in three parts.", {
    cats: "personality quiz",
    teams: "marketing hr",
    added: ADDED,
    also: ["coaching"],
    pages: [
      { title: "How you work", fields: [one("You like your day", ["Planned", "Partly planned", "Open"], { required: true, points: [0, 1, 2] }), one("A new project. You start by", ["Making a list", "Talking it over", "Diving in"], { required: true, points: [0, 1, 2] })] },
      { title: "With people", fields: [one("At a party you", ["Stay with a few friends", "Meet a few new people", "Talk to everyone"], { required: true, points: [0, 1, 2] }), one("After a long week you", ["Rest alone", "See a friend", "Go out"], { required: true, points: [0, 1, 2] })] },
      { title: "Making choices", fields: [one("Big decisions. You", ["Take your time", "Ask around", "Go with your gut"], { required: true, points: [0, 1, 2] }), one("Change makes you feel", ["Uneasy", "Curious", "Excited"], { required: true, points: [0, 1, 2] })] },
      { title: "Your result", fields: [text("First name"), email("Email")] },
    ],
    submit: "See my type",
    end: { title: "Your type", text: "", score: [{ min: 9, title: "The Spark", text: "You move fast, love new things and bring energy to a room." }, { min: 5, title: "The Bridge", text: "You balance plans and people, and you help others get along." }, { min: 0, title: "The Anchor", text: "You think things through and keep others steady." }] },
  }),
  tpl("ecommerce.product-finder-follow-up", "ecommerce", "Product finder with follow-up questions", ["quiz", "lead"], "Who it's for, how it's used and budget, with follow-ups by answer.", {
    cats: "product-finder quiz",
    teams: "sales marketing",
    added: ADDED,
    also: ["retail"],
    pages: [
      { title: "Who it's for", fields: [one("Who is it for?", ["Me", "A gift"], { required: true, key: "who" }), one("Experience", ["New to this", "Some", "A lot"], { required: true, points: [0, 1, 2] })], skip: go("who", "is", "Me", "How you'll use it") },
      { title: "The gift", fields: [text("Who's it for?"), one("Their age", ["Under 18", "18 to 34", "35 to 54", "55 or older"]), date("Needed by")] },
      { title: "How you'll use it", fields: [one("How often?", ["Now and then", "Weekly", "Every day"], { required: true, points: [0, 1, 2] }), many("Where?", ["Home", "Work", "Travel", "Outdoors"])] },
      { title: "Budget", fields: [one("Budget", ["Under $50", "$50 to $150", "Over $150"], { required: true, points: [0, 1, 2] }), email("Email")] },
    ],
    submit: "See my match",
    end: { title: "Your match", text: "", score: [{ min: 5, title: "The Pro", text: "Our top pick for daily use." }, { min: 3, title: "The Plus", text: "A step up that's easy on the budget." }, { min: 0, title: "The Starter", text: "Simple and a great place to begin." }] },
  }),

  // Intake and onboarding
  tpl("hr.employee-onboarding-packet", "hr", "Employee onboarding packet", ["intake"], "Personal details, pay, emergency contact and policies for a new hire.", {
    cats: "employee-onboarding intake",
    teams: "hr",
    added: ADDED,
    internal: true,
    also: ["general"],
    pages: [
      { title: "About you", fields: [fullName("Legal name"), text("Preferred name"), email("Personal email"), phone("Phone", { required: true }), address("Home address", { required: true })] },
      { title: "Pay", fields: [one("Pay by", ["Direct deposit", "Check"], { required: true, key: "pay" }), text("Bank name", { show: when("pay", "is", "Direct deposit") }), file("Voided check or bank letter", { show: when("pay", "is", "Direct deposit") })] },
      { title: "Emergency contact", fields: [text("Name", { required: true, key: "ec_name" }), { kind: "phone", label: "Their phone", required: true, key: "ec_phone" }, text("How are they related?")] },
      { title: "Your first day", fields: [one("Shirt size", ["S", "M", "L", "XL", "XXL"]), text("Dietary needs for team lunches"), many("Equipment", ["Laptop", "Phone", "Badge", "Parking pass"])] },
      { title: "Policies", fields: [agree("I've read the employee handbook."), agree("I agree to the code of conduct."), sign("Signature")] },
    ],
    submit: "Submit",
    end: ["Thanks", "HR will email your first-day plan."],
  }),
  tpl("hr.offboarding-handover", "hr", "Offboarding with handover", ["intake"], "Last day, open work, accounts and equipment to return.", {
    cats: "offboarding request",
    teams: "hr it",
    added: ADDED,
    internal: true,
    pages: [
      { title: "About you", fields: [fullName(), email(), text("Team"), date("Last day", { required: true })] },
      { title: "Handover", fields: [long("Open work and who takes it", { required: true }), text("Where are your files?"), text("Who should clients contact now?")] },
      { title: "Accounts", fields: [many("Accounts to close", ["Email", "Chat", "Shared drives", "Sales tools", "Admin access"]), long("Passwords or keys to hand over (where they're kept)")] },
      { title: "Equipment", fields: [many("Items to return", ["Laptop", "Phone", "Badge", "Keys", "Card"], { required: true }), one("How?", ["Drop off", "Ship it"], { required: true, key: "how" }), address("Shipping address for the box", { show: when("how", "is", "Ship it") })] },
    ],
    submit: "Submit",
    end: ["Thanks", "HR and IT will email your final steps."],
  }),
  tpl("agency.detailed-project-brief", "agency", "Detailed project brief", ["intake", "request"], "Goals, audience, scope and timing for a new project.", {
    cats: "brief intake",
    teams: "sales success",
    added: ADDED,
    also: ["creative", "media"],
    pages: [
      { title: "About you", fields: [fullName(), email(), company(), website()] },
      { title: "Goals", fields: [long("What is this project for?", { required: true }), text("How will you measure success?")] },
      { title: "Audience", fields: [long("Who is it for?", { required: true }), text("Brands or work you like")] },
      { title: "Scope", fields: [many("What do you need?", ["Strategy", "Design", "Writing", "Video", "Website", "Ads"], { required: true }), files("Files or examples")] },
      { title: "Timing and budget", fields: [date("Launch date"), one("Budget", ["Under $5,000", "$5,000 to $15,000", "$15,000 to $50,000", "Over $50,000"], { required: true }), text("Who signs off?")] },
    ],
    submit: "Send brief",
    end: ["Thanks, we got it", "We'll reply with questions or a proposal."],
  }),
  tpl("consulting.client-onboarding-access-billing", "consulting", "Client onboarding with access and billing", ["intake"], "Contacts, tool access and billing for a new client.", {
    cats: "client-onboarding intake",
    teams: "success finance",
    added: ADDED,
    also: ["agency", "accounting"],
    pages: [
      { title: "Contacts", fields: [fullName("Main contact"), email(), phone(), jobTitle(), text("Other people to include")] },
      { title: "Access", fields: [many("Tools we'll need access to", ["Website", "Analytics", "Ad accounts", "Email platform", "Shared drive"]), long("Anything we shouldn't touch?")] },
      { title: "Billing", fields: [company("Legal company name", { required: true }), address("Billing address", { required: true }), email2("Billing email", { required: true }), text("PO number")] },
      { title: "Kickoff", fields: [date("Preferred kickoff date"), long("Top goals for the first 90 days", { required: true }), agree("I agree to the service terms.")] },
    ],
    submit: "Submit",
    end: ["Welcome aboard", "We'll email to set up the kickoff."],
  }),

  // Operations
  tpl("general.incident-investigation", "general", "Incident investigation", ["request"], "What happened, who was involved, the cause and the fix.", {
    cats: "incident report",
    teams: "operations hr",
    added: ADDED,
    internal: true,
    also: ["construction", "manufacturing"],
    pages: [
      { title: "The incident", fields: [date("Date", { required: true, half: true }), time("Time", { half: true }), text("Where?", { required: true }), one("Kind", ["Injury", "Near miss", "Damage", "Security", "Other"], { required: true, key: "kind" })] },
      { title: "People", fields: [long("Who was involved?", { required: true }), long("Witnesses"), yesno("Did anyone need medical care?", { show: when("kind", "is", "Injury") })] },
      { title: "What happened", fields: [long("What happened, step by step", { required: true }), files("Photos")] },
      { title: "Cause", fields: [many("Causes", ["Equipment", "Training", "Process", "Rushing", "Weather", "Other"]), long("Root cause")] },
      { title: "Fix", fields: [long("What will change?", { required: true }), text("Owner"), date("Done by"), text("Investigated by", { required: true })] },
    ],
    submit: "Submit",
    end: ["Saved", "The report is filed."],
  }),
  tpl("hr.time-off-coverage", "hr", "Time-off request with coverage", ["request"], "Dates, type and who covers your work.", {
    cats: "time-off request",
    teams: "hr operations",
    added: ADDED,
    internal: true,
    also: ["general"],
    pages: [
      { title: "About you", fields: [fullName(), email(), text("Team"), text("Manager", { required: true })] },
      { title: "Dates", fields: [range("Dates off", { required: true }), one("Type", ["Vacation", "Sick", "Personal", "Parental", "Unpaid"], { required: true }), yesno("Half days?")] },
      { title: "Coverage", fields: [text("Who's covering?", { required: true }), long("What they need to know"), yesno("Will you check messages?")] },
    ],
    submit: "Request",
    end: ["Request sent", "Your manager will reply by email."],
  }),
  tpl("it.onboarding-request", "it", "IT onboarding request", ["request"], "Accounts, hardware and access for a new team member.", {
    cats: "it-request employee-onboarding",
    teams: "it hr",
    added: ADDED,
    internal: true,
    pages: [
      { title: "New team member", fields: [text("Name", { required: true }), jobTitle(), text("Team"), date("Start date", { required: true })] },
      { title: "Hardware", fields: [one("Laptop", ["Mac", "Windows", "None"], { required: true }), many("Extras", ["Monitor", "Headset", "Phone", "Keyboard and mouse"]), address("Ship to")] },
      { title: "Accounts", fields: [many("Accounts", ["Email", "Chat", "Video calls", "Shared drive", "Sales tools", "Code tools"], { required: true }), text("Email groups to join")] },
      { title: "Access", fields: [long("Folders or systems they need"), text("Approving manager", { required: true }), email2("Manager's email")] },
    ],
    submit: "Request",
    end: ["Request sent", "IT will email when everything is ready."],
  }),
  tpl("manufacturing.equipment-inspection-area", "manufacturing", "Equipment inspection by area", ["request"], "Check guards, power, fluids and safety one area at a time.", {
    cats: "inspection checklist",
    teams: "operations",
    added: ADDED,
    internal: true,
    also: ["construction", "logistics"],
    pages: [
      { title: "Machine", fields: [text("Machine or asset tag", { required: true }), text("Inspector", { required: true }), date("Date", { required: true })] },
      { title: "Guards and safety", fields: [one("Guards in place", ["Pass", "Fail"], { required: true }), one("Emergency stop works", ["Pass", "Fail"], { required: true }), one("Labels readable", ["Pass", "Fail"])] },
      { title: "Power and controls", fields: [one("Cords and plugs", ["Pass", "Fail"], { required: true }), one("Controls respond", ["Pass", "Fail"], { required: true })] },
      { title: "Fluids and wear", fields: [one("Leaks", ["None", "Small", "Large"], { required: true }), one("Belts and parts", ["Good", "Worn", "Replace now"])] },
      { title: "Result", fields: [one("Overall", ["OK to run", "Run with care", "Tag out"], { required: true }), files("Photos"), long("Notes")] },
    ],
    submit: "Save",
    end: ["Saved", "The inspection is logged."],
  }),

  // Consent and legal
  tpl("general.data-request-identity-check", "general", "Data request with identity check", ["request"], "The request, proof of who you are and how to send the answer.", {
    cats: "data-request request",
    teams: "support it",
    added: ADDED,
    also: ["saas", "ecommerce"],
    pages: [
      { title: "About you", fields: [fullName(), email("Email you use with us"), text("Country", { required: true }), phone()] },
      { title: "Your request", fields: [one("What would you like?", ["A copy of my data", "Delete my data", "Fix my data", "Stop selling my data"], { required: true }), long("Details")] },
      { title: "Identity check", fields: [text("Account or order number"), file("Photo ID or another proof of who you are", { required: true }), yesno("Are you asking for someone else?", { key: "other" }), file("Proof you may act for them", { show: when("other", "is", true) })] },
      { title: "Confirm", fields: [one("Send the answer by", ["Email", "Mail"], { required: true }), agree("The information I gave is true.")] },
    ],
    submit: "Send request",
    end: ["Request received", "We'll email you within 30 days."],
  }),
  tpl("general.terms-acceptance-clauses", "general", "Terms acceptance with clauses by section", ["intake"], "Read and accept each part of an agreement on its own page.", {
    cats: "terms consent",
    teams: "operations sales",
    added: ADDED,
    also: ["saas", "agency"],
    pages: [
      { title: "About you", fields: [fullName(), email("Email"), company(), jobTitle()] },
      { title: "Service", fields: [{ kind: "statement", label: "What we provide, when, and how changes are agreed." }, agree("I accept the service terms.")] },
      { title: "Payment", fields: [{ kind: "statement", label: "Fees, due dates and late payments." }, agree("I accept the payment terms.")] },
      { title: "Privacy", fields: [{ kind: "statement", label: "What data we keep and how we protect it." }, agree("I accept the privacy terms.")] },
      { title: "Sign", fields: [date("Date", { required: true }), sign("Signature")] },
    ],
    submit: "Accept and sign",
    end: ["Thank you", "We'll email a copy of what you signed."],
  }),
];

