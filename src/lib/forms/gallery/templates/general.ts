import { agree, BUDGET, company, DAYPART, drop, email, email2, file, fullName, HEARD, jobTitle, long, many, nps, one, phone, scale, stars, TEAM_SIZE, text, THANKS, TIMELINE, tpl, website, when, yesno } from "./build.ts";

export const GENERAL = [
  tpl("general.contact-us", "general", "Contact us", ["lead"], "A simple way for anyone to reach your team.", {
    featured: true,
    intro: "Send us a note and the right person will reply.",
    fields: [
      fullName(),
      email("Email"),
      company("Company", { half: true }),
      phone("Phone", { half: true }),
      drop("What's this about?", ["Sales", "Support", "Partnerships", "Press", "Careers", "Something else"], { required: true }),
      long("Message", { required: true, placeholder: "How can we help?" }),
    ],
    end: THANKS(),
  }),
  tpl("general.newsletter", "general", "Newsletter sign-up", ["lead"], "Grow your list with a short, friendly sign-up.", {
    featured: true,
    intro: "One useful email a week. No spam.",
    fields: [email("Email"), text("First name", { map: "first_name", key: "first_name" }), many("What would you like to hear about?", ["Product news", "Guides and tips", "Events", "Customer stories"], { save: "interests" })],
    submit: "Subscribe",
    end: ["You're on the list", "Look out for our next email."],
  }),
  tpl("general.book-a-call", "general", "Book a call", ["booking", "lead"], "Qualify the visitor, then let them pick a time.", {
    featured: true,
    intro: "Tell us a little about you and pick a time that works.",
    fields: [
      fullName(),
      email(),
      company(undefined, { required: true, half: true }),
      one("Team size", TEAM_SIZE, { save: "team_size", required: true, half: true }),
      long("What would you like to cover?", { placeholder: "A sentence or two is plenty." }),
    ],
    submit: "Continue",
    end: { title: "Pick a time", text: "Choose a slot that suits you. You'll get an invite right away.", booking: true },
  }),
  tpl("general.customer-feedback", "general", "Customer feedback", ["feedback", "survey"], "Learn what customers love and what to fix.", {
    featured: true,
    fields: [
      stars("How would you rate your experience?", { required: true }),
      long("What went well?"),
      long("What could we do better?"),
      yesno("May we follow up with you?"),
      email("Email", { required: false, show: when("May we follow up with you?", "is", true) }),
    ],
    end: ["Thank you", "Your feedback helps us get better."],
  }),
  tpl("general.nps", "general", "NPS survey", ["survey", "feedback"], "The one-question loyalty score, with the reason behind it.", {
    featured: true,
    fields: [
      nps("How likely are you to recommend us to a friend or colleague?", { required: true, minLabel: "Not likely", maxLabel: "Very likely", save: "nps" }),
      long("What's the main reason for your score?"),
      long("What would make it a 10?", { show: when("How likely are you to recommend us to a friend or colleague?", "lte", 8) }),
      email("Email", { required: false }),
    ],
    end: ["Thanks for your score", "We read every answer."],
  }),
  tpl("general.waitlist", "general", "Waitlist", ["lead", "registration"], "Collect early interest before you launch.", {
    featured: true,
    intro: "Be first in line when we open the doors.",
    fields: [email(), company(undefined, { half: true }), jobTitle("Role", { half: true }), long("What would you use it for?"), one("How did you hear about us?", HEARD)],
    submit: "Join the waitlist",
    end: ["You're on the list", "We'll email you as soon as your spot opens."],
  }),
  tpl("general.referral", "general", "Referral", ["lead"], "Let happy customers send friends your way.", {
    pages: [
      { title: "About you", fields: [fullName("Your name"), email("Your email", { key: "email" })] },
      {
        title: "Who are you referring?",
        fields: [text("Friend's name", { required: true }), email2("Friend's email", { required: true }), text("Friend's company"), long("Anything we should know?")],
      },
    ],
    end: ["Thanks for the referral", "We'll reach out to your friend and keep you posted."],
  }),
  tpl("general.partner-application", "general", "Partner application", ["application", "lead"], "Screen agencies, resellers and tech partners.", {
    fields: [
      fullName(),
      email(),
      company(undefined, { required: true, half: true }),
      website(undefined, { required: true, half: true }),
      one("Partner type", ["Agency or consultant", "Reseller", "Technology partner", "Affiliate"], { required: true, save: "partner_type" }),
      text("Regions you serve"),
      one("How many clients do you work with?", ["1–10", "11–50", "51–200", "200+"]),
      long("Why do you want to partner with us?"),
    ],
    end: { title: "Application received", text: "Our partner team reviews applications every week. Pick a time if you'd like to talk sooner.", booking: true },
  }),
  tpl("general.quote-request", "general", "Quote request", ["request", "lead"], "Get the details you need to price a job.", {
    fields: [
      fullName(),
      email("Email"),
      company(undefined, { half: true }),
      phone(undefined, { half: true }),
      text("Service you need", { required: true }),
      one("Budget", BUDGET, { save: "budget" }),
      one("When do you need it?", TIMELINE, { save: "timeline" }),
      long("Details", { placeholder: "Size, scope, anything special" }),
      file("Attach a file"),
    ],
    end: THANKS("with a quote within two business days"),
  }),
  tpl("general.callback-request", "general", "Callback request", ["request"], "Let people ask for a call at a good time.", {
    fields: [fullName(), phone("Phone", { required: true }), email("Email", { required: false }), one("Best time to call", DAYPART, { required: true }), text("What's it about?")],
    submit: "Request a call",
    end: ["We'll call you", "Expect a call at the time you picked."],
  }),
  tpl("general.email-preferences", "general", "Email preferences", ["survey"], "Let subscribers choose what they get and how often.", {
    fields: [
      email("Email"),
      many("Topics", ["Product news", "Guides and tips", "Events and webinars", "Offers"], { save: "email_topics" }),
      one("How often?", ["Every email", "Weekly digest", "Monthly digest"], { save: "email_frequency" }),
    ],
    submit: "Save preferences",
    end: ["Preferences saved", "You'll only get what you picked."],
  }),
  tpl("general.testimonial-request", "general", "Testimonial request", ["feedback"], "Collect quotes you can use on your site.", {
    fields: [
      fullName(),
      email("Email"),
      jobTitle("Role", { half: true }),
      company(undefined, { half: true }),
      long("What would you tell a friend about us?", { required: true }),
      file("Your photo (optional)"),
      agree("You may use my words, name and photo in your marketing."),
    ],
    end: ["Thank you", "We'll send you the final version before it goes live."],
  }),
  tpl("general.cancellation-survey", "general", "Cancellation survey", ["survey", "feedback"], "Learn why customers leave and what might keep them.", {
    fields: [
      one("Why are you leaving?", ["Too expensive", "Missing features", "Hard to use", "Switching to another tool", "No longer need it", "Other"], { required: true }),
      text("Which tool are you moving to?", { show: when("Why are you leaving?", "is", "Switching to another tool") }),
      long("What would have kept you?"),
      stars("Overall, how was your experience?"),
      email("Email", { required: false }),
    ],
    end: ["Thanks for telling us", "We're sorry to see you go. Your answers help us improve."],
  }),
  tpl("general.product-feedback", "general", "Product feedback", ["feedback"], "Gather ideas and pain points by product area.", {
    fields: [
      email("Email", { required: false }),
      drop("Which part of the product?", ["Getting started", "Reports", "Integrations", "Billing", "Mobile", "Something else"], { required: true }),
      scale("How useful is it today?", "Not useful", "Very useful", { required: true }),
      long("Your idea or problem", { required: true }),
      file("Screenshot (optional)"),
    ],
    end: ["Thanks for the idea", "Our product team reads every one."],
  }),
  tpl("general.content-download", "general", "Content download", ["lead"], "Gate a guide or report behind a short form.", {
    intro: "Get the guide in your inbox.",
    fields: [fullName(), email(), company(undefined, { required: true, half: true }), jobTitle("Role", { half: true })],
    submit: "Get the guide",
    end: ["It's on its way", "Check your inbox in the next few minutes."],
  }),
  tpl("general.webinar-registration", "general", "Webinar registration", ["registration", "lead"], "Sign people up for a live session.", {
    fields: [fullName(), email(), company(undefined, { half: true }), jobTitle("Role", { half: true }), long("A question for the speaker (optional)")],
    submit: "Save my seat",
    end: ["You're registered", "We'll email the link and a reminder before we start."],
  }),
];
