import { agree, BUDGET, company, date, drop, email, file, fullName, HEARD, jobTitle, long, many, num, one, phone, TEAM_SIZE, text, TIMELINE, tpl, when, yesno } from "./build.ts";

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
    fields: [
      email("Email"),
      one("Your role", ["Founder or exec", "Marketing", "Sales", "Product", "Engineering", "Operations", "Other"], { required: true, save: "persona" }),
      one("Main goal", ["Save time", "Grow revenue", "Replace a tool", "Report better", "Just exploring"], { required: true, save: "goal" }),
      one("Team size", TEAM_SIZE, { save: "team_size" }),
      many("Tools you use", ["Slack", "Google Workspace", "Microsoft 365", "HubSpot", "Salesforce", "Notion", "Jira"]),
      one("How did you hear about us?", HEARD, { save: "heard_from" }),
    ],
    submit: "Finish",
    end: ["You're all set", "We'll tailor your workspace to your goal."],
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
