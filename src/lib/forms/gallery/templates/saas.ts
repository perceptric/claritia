import { agree, BUDGET, company, date, DAYPART, drop, email, file, fullName, go, HEARD, jobTitle, long, many, num, one, phone, TEAM_SIZE, text, TIMELINE, tpl, when, yesno } from "./build.ts";

const TOOLS = ["Spreadsheets", "HubSpot", "Salesforce", "An in-house tool", "Nothing yet", "Other"];

export const SAAS = [
  tpl("saas.demo-request", "saas", "Demo request", ["lead", "booking"], "Qualify demo requests and route them to a rep.", {
    featured: true,
    intro: "See it with your own data. Takes 30 minutes.",
    pages: [
      [fullName(), email(), company(undefined, { required: true, half: true }), jobTitle(undefined, { half: true })],
      {
        title: "A bit about your team",
        fields: [
          one("Team size", TEAM_SIZE, { required: true, save: "team_size" }),
          drop("What do you use today?", TOOLS, { save: "current_tool" }),
          long("What do you want to get done?", { placeholder: "The problem you'd like to solve" }),
          one("When are you hoping to start?", TIMELINE, { save: "timeline" }),
        ],
      },
    ],
    submit: "Book my demo",
    end: { title: "Pick a time", text: "Choose a slot and we'll tailor the demo to your team.", booking: true },
  }),
  tpl("saas.free-trial", "saas", "Free trial sign-up", ["registration", "lead"], "Start trials with the context sales needs later.", {
    featured: true,
    fields: [
      fullName(),
      email(),
      company(undefined, { required: true, half: true }),
      one("Team size", TEAM_SIZE, { save: "team_size", half: true }),
      jobTitle("Role"),
      agree("I agree to the terms of service."),
    ],
    submit: "Start my free trial",
    end: { title: "Your trial is ready", text: "Check your inbox for your sign-in link." },
  }),
  tpl("saas.contact-sales", "saas", "Contact sales", ["lead", "booking"], "For buyers ready to talk pricing and seats.", {
    featured: true,
    fields: [
      fullName(),
      email(),
      company(undefined, { required: true, half: true }),
      phone(undefined, { half: true }),
      num("How many seats?", { min: 1, save: "seats" }),
      one("Timeline", TIMELINE, { save: "timeline" }),
      one("Budget per year", BUDGET, { save: "budget" }),
      long("Anything else?"),
    ],
    end: { title: "Thanks, a specialist will reach out", text: "Want to talk now? Pick a time below.", booking: true },
  }),
  tpl("saas.onboarding-survey", "saas", "Onboarding survey", ["survey", "intake"], "Learn each new user's goal to personalize setup.", {
    featured: true,
    version: 2,
    pages: [
      {
        title: "Your team",
        fields: [
          fullName(),
          email("Email"),
          company(),
          one("Your role", ["Founder or exec", "Marketing", "Sales", "Product", "Engineering", "Operations", "Other"], { required: true, save: "persona" }),
          one("Team size", TEAM_SIZE, { required: true, save: "team_size" }),
        ],
      },
      {
        title: "Tools you use today",
        fields: [
          many("Tools you use", ["Slack", "Google Workspace", "Microsoft 365", "HubSpot", "Salesforce", "Notion", "Jira"]),
          one("What are you moving from?", ["Spreadsheets", "Another tool", "An in-house tool", "Nothing, we're starting fresh"], { required: true }),
          text("Which tool?", { show: when("What are you moving from?", "is", "Another tool") }),
          yesno("Do you have data to bring in?"),
          one("About how many records?", ["Under 1,000", "1,000–10,000", "10,000–100,000", "Over 100,000"], { show: when("Do you have data to bring in?", "is", true) }),
        ],
      },
      {
        title: "Goals",
        fields: [
          one("Main goal", ["Save time", "Grow revenue", "Replace a tool", "Report better", "Just exploring"], { required: true, save: "goal" }),
          many("What would you like to set up first?", ["Invite my team", "Connect my tools", "Bring in my data", "Build reports", "Set up automations"]),
          long("What would make the first month a success?"),
          one("When do you want to be up and running?", ["This week", "Within 2 weeks", "Within a month", "No rush"]),
        ],
      },
      {
        title: "Setup help",
        fields: [
          one("How comfortable is your team with new tools?", ["Very comfortable", "Fairly comfortable", "We'll need some help"]),
          one("How would you like to get set up?", ["I'll set it up myself", "A short call to get started", "Hands-on help for my team"], { required: true, save: "setup_help" }),
          one("How did you hear about us?", HEARD, { save: "heard_from" }),
        ],
        jumps: [go("How would you like to get set up?", "is", "I'll set it up myself", "end")],
      },
      {
        title: "Setup call",
        fields: [
          many("Best days for a call", ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]),
          one("Best time of day", DAYPART),
          phone(),
          text("Who else should join?"),
          long("Anything we should know before the call?"),
        ],
      },
    ],
    submit: "Finish",
    end: ["You're all set", "We'll tailor your workspace to your goal. If you asked for a call, we'll email you a time."],
  }),
  tpl("saas.pricing-lead", "saas", "Pricing calculator lead", ["lead", "request"], "Turn pricing curiosity into a qualified lead.", {
    fields: [
      num("How many seats do you need?", { required: true, min: 1, save: "seats" }),
      one("Plan", ["Starter", "Growth", "Enterprise", "Not sure"], { required: true }),
      many("Add-ons", ["Single sign-on", "Advanced reports", "Premium support", "Extra storage"]),
      one("Billing", ["Monthly", "Yearly"]),
      email(),
      company(),
    ],
    submit: "Get my price",
    end: ["Your quote is on its way", "We've emailed a full price for your setup."],
  }),
  tpl("saas.feature-request", "saas", "Feature request", ["feedback"], "Collect and rank what customers ask for.", {
    fields: [
      email("Email"),
      text("Feature in a few words", { required: true }),
      long("What problem would it solve?", { required: true }),
      one("How important is it to you?", ["Nice to have", "Important", "Blocking us"], { required: true }),
      file("Example or mockup (optional)"),
    ],
    end: ["Thanks for the request", "We'll let you know if it ships."],
  }),
  tpl("saas.bug-report", "saas", "Bug report", ["request"], "Get clear steps, screenshots and setup details.", {
    fields: [
      email("Email"),
      text("Short summary", { required: true }),
      long("Steps to reproduce", { required: true, placeholder: "1. Go to…\n2. Click…" }),
      long("What did you expect?"),
      long("What happened instead?", { required: true }),
      drop("Browser", ["Chrome", "Safari", "Firefox", "Edge", "Mobile app", "Other"]),
      one("How bad is it?", ["Minor", "Annoying", "Blocks my work"], { required: true }),
      file("Screenshot or recording"),
    ],
    end: ["Thanks, we're on it", "We'll email you when it's fixed."],
  }),
  tpl("saas.beta-program", "saas", "Beta program application", ["application"], "Pick the right testers for early features.", {
    fields: [
      fullName(),
      email(),
      company(undefined, { half: true }),
      jobTitle("Role", { half: true }),
      long("How would you use the new feature?", { required: true }),
      one("How often do you use the product?", ["Every day", "A few times a week", "Weekly", "Less often"], { required: true }),
      yesno("Can we interview you for 30 minutes?"),
    ],
    end: ["Application received", "We'll pick testers within two weeks."],
  }),
  tpl("saas.churn-survey", "saas", "Churn survey", ["survey", "feedback"], "Understand churn and offer a way back.", {
    fields: [
      email("Email"),
      one("Main reason for leaving", ["Price", "Missing a feature", "Too hard to use", "Switched tools", "Company changes", "Other"], { required: true, save: "churn_reason" }),
      text("Which tool are you switching to?", { show: when("Main reason for leaving", "is", "Switched tools") }),
      text("Which feature was missing?", { show: when("Main reason for leaving", "is", "Missing a feature") }),
      yesno("Would a discount change your mind?", { show: when("Main reason for leaving", "is", "Price") }),
      long("Anything else we should know?"),
    ],
    end: ["Thanks for your honesty", "Your account stays open until the end of your billing period."],
  }),
  tpl("saas.integration-request", "saas", "Integration request", ["request", "feedback"], "Hear which tools customers want connected.", {
    fields: [
      email("Email"),
      text("Which tool?", { required: true }),
      long("What should the integration do?", { required: true }),
      one("How often would you use it?", ["Every day", "Weekly", "Monthly", "Once to set up"]),
    ],
    end: ["Thanks", "We'll share updates as we build new integrations."],
  }),
  tpl("saas.advisory-board", "saas", "Customer advisory board", ["application"], "Invite power users to shape the roadmap.", {
    fields: [
      fullName(),
      email(),
      company(undefined, { half: true }),
      jobTitle("Role", { half: true }),
      many("Topics you'd like to weigh in on", ["Roadmap", "Pricing", "Integrations", "Reporting", "Security"], { required: true }),
      one("Availability", ["Quarterly calls", "Twice a year", "Once a year"], { required: true }),
    ],
    end: { title: "Thanks for applying", text: "We'll be in touch before the next session. Book a quick intro if you like.", booking: true },
  }),
  tpl("saas.security-review", "saas", "Security review request", ["request"], "Take in security questionnaires from buyers.", {
    fields: [fullName(), email(), company(undefined, { required: true }), file("Questionnaire", { required: true }), date("Due date", { required: true }), many("Also send", ["SOC 2 report", "Pen test summary", "Data processing agreement", "Insurance certificate"])],
    end: ["Request received", "Our security team will reply before your due date."],
  }),
  tpl("saas.pmf-survey", "saas", "Product-market fit survey", ["survey"], "Measure product-market fit the classic way.", {
    fields: [
      one("How would you feel if you could no longer use the product?", ["Very disappointed", "Somewhat disappointed", "Not disappointed"], { required: true, save: "pmf" }),
      long("What is the main benefit you get?"),
      long("What type of person would benefit most?"),
      long("How could we improve it for you?"),
      email("Email", { required: false }),
    ],
    end: ["Thank you", "Your answers shape what we build next."],
  }),
];
