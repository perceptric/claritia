// Email templates (docs/design-system.md Part 7.6): 30 starting points built from blocks. They set no colors or
// fonts of their own, so each one shows in the workspace's brand (its design system) and changes with it; that is
// the remix. Words are short and plain, with merge tags that always have a fallback.

import { newEmailId, readEmailDoc, type Block, type EmailDoc, type Section } from "./doc.ts";

export type EmailTemplate = { key: string; name: string; group: "Welcome" | "News" | "Events" | "Sales" | "Customers"; make: () => EmailDoc };

// Small makers, so each template reads like its email.
const id = newEmailId;
const h = (text: string, level: 1 | 2 | 3 = 1): Block => ({ id: id(), type: "heading", text, level });
const p = (...paras: string[]): Block => ({ id: id(), type: "text", html: paras.map((x) => `<p>${x}</p>`).join("") });
const btn = (label: string, url = "https://", align: "left" | "center" = "left"): Block => ({ id: id(), type: "button", label, url, align });
const list = (items: string[], ordered = false): Block => ({ id: id(), type: "list", items, ordered });
const logo = (): Block => ({ id: id(), type: "logo", alt: "Logo", width: 120, align: "left" });
const divider = (): Block => ({ id: id(), type: "divider" });
const quote = (text: string, cite: string): Block => ({ id: id(), type: "quote", text, cite });
const event = (title: string, when: string, where: string, button: string): Block => ({ id: id(), type: "event", title, when, where, url: "https://", button });
const product = (title: string, text: string, button = "Learn more"): Block => ({ id: id(), type: "product", title, text, url: "https://", button });
const meeting = (label = "Book a time"): Block => ({ id: id(), type: "meeting", label, url: "https://", align: "left" });
const sign = (): Block => ({ id: id(), type: "signature", name: "Your name", title: "Your title" });
const footer = (): Block => ({ id: id(), type: "footer" });
const sec = (...blocks: Block[]): Section => ({ id: id(), stackOnPhone: true, columns: [{ id: id(), width: 100, blocks }] });
const cols = (...columns: Block[][]): Section => ({ id: id(), stackOnPhone: true, columns: columns.map((blocks) => ({ id: id(), width: Math.round(100 / columns.length), blocks })) });
const mk = (preheader: string, ...sections: Section[]) => () => readEmailDoc({ v: 1, settings: { width: 600, align: "center", darkMode: "auto", preheader, lang: "en" }, sections: [sec(logo()), ...sections, sec(footer())] });

const HI = "Hi {{first_name|there}},";

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  // Welcome
  { key: "welcome", name: "Welcome", group: "Welcome", make: mk("Glad you're here.", sec(h("Welcome aboard"), p(HI, "Thanks for joining. Here's the fastest way to get value in your first week."), list(["Set up your account", "Invite your team", "Try your first project"]), btn("Get started"))) },
  { key: "onboarding_1", name: "Onboarding, day 1", group: "Welcome", make: mk("One step to start.", sec(h("Your first step"), p(HI, "Most teams start by connecting their data. It takes about five minutes."), btn("Connect now"), p("Questions? Reply to this email and we'll help."))) },
  { key: "onboarding_tips", name: "Onboarding tips", group: "Welcome", make: mk("Three tips from teams like yours.", sec(h("Three tips for this week"), list(["Save time with templates", "Share your work with one link", "Check your weekly report every Monday"], true), btn("See all tips"))) },
  { key: "trial_started", name: "Trial started", group: "Welcome", make: mk("Your trial is on.", sec(h("Your trial has started"), p(HI, "You have 14 days with every feature. Here's what to try first."), list(["Build your first workflow", "Invite a teammate", "Book a setup call"]), meeting("Book a setup call"))) },
  { key: "trial_ending", name: "Trial ending", group: "Welcome", make: mk("A few days left.", sec(h("Your trial ends soon"), p(HI, "Your trial ends in three days. Pick a plan to keep everything you've set up."), btn("Choose a plan"), p("Not sure which plan fits? Book 15 minutes with us."), meeting("Talk to us"))) },

  // News
  { key: "newsletter", name: "Newsletter", group: "News", make: mk("What's new this month.", sec(h("This month"), p(HI, "Here's what we've been working on, and what's coming next.")), cols([h("New feature", 3), p("A short line about it."), btn("Read more")], [h("From the blog", 3), p("A short line about it."), btn("Read more")]), sec(divider(), h("One more thing", 2), p("Something worth knowing before next month."))) },
  { key: "product_update", name: "Product update", group: "News", make: mk("What changed and why.", sec(h("What's new"), p(HI, "We shipped a few things this week that save you time."), list(["Faster search", "New export options", "Fixes you asked for"]), btn("See what's new"))) },
  { key: "feature_launch", name: "Feature launch", group: "News", make: mk("Now live for everyone.", sec(h("Meet the new feature"), p("It does one thing well: it saves you an hour every week."), btn("Try it now")), sec(quote("We switched it on and never looked back.", "A happy customer"))) },
  { key: "monthly_digest", name: "Monthly digest", group: "News", make: mk("Your month in numbers.", sec(h("Your month at a glance"), p(HI, "Here's how your team did this month.")), cols([h("120", 2), p("New leads")], [h("34", 2), p("Meetings booked")], [h("9", 2), p("Deals won")]), sec(btn("Open your report"))) },
  { key: "company_news", name: "Company news", group: "News", make: mk("A note from the team.", sec(h("A note from our team"), p(HI, "A quick update on where we're headed this year, and how it helps you."), btn("Read the full note")), sec(sign())) },
  { key: "case_study", name: "Case study", group: "News", make: mk("How one team did it.", sec(h("How Acme grew 40%"), p("One team, one quarter, and the three changes that made the difference."), quote("It changed how our whole team works.", "Head of growth, Acme"), btn("Read the story"))) },
  { key: "price_change", name: "Price change", group: "News", make: mk("A change to your plan.", sec(h("A change to our prices"), p(HI, "From next month, prices change. Here's what it means for you, and what stays the same."), list(["Your plan keeps every feature", "The new price starts at your next renewal", "You can switch plans any time"]), btn("See the details"))) },

  // Events
  { key: "event_invite", name: "Event invite", group: "Events", make: mk("Save your seat.", sec(h("You're invited"), p(HI, "Join us for an hour of practical ideas from teams like yours."), event("Growth meetup", "Thursday, 10am", "Online", "Save my seat"))) },
  { key: "webinar_invite", name: "Webinar invite", group: "Events", make: mk("Live, then on demand.", sec(h("Live webinar"), p("Forty minutes, three ideas, and time for your questions."), event("Webinar title", "Tuesday, 2pm", "Online", "Register")), sec(sign())) },
  { key: "event_reminder", name: "Event reminder", group: "Events", make: mk("Starting soon.", sec(h("Starting tomorrow"), p(HI, "A quick reminder about tomorrow. Here's your link."), event("Event name", "Tomorrow, 10am", "Online", "Join"))) },
  { key: "webinar_followup", name: "Webinar follow-up", group: "Events", make: mk("The recording and slides.", sec(h("Thanks for joining"), p(HI, "Here's the recording and the slides, as promised."), btn("Watch the recording"), p("Want to see how it works for your team?"), meeting("Book a demo"))) },
  { key: "event_recap", name: "Event recap", group: "Events", make: mk("What we covered.", sec(h("What we covered"), list(["The first idea, in one line", "The second idea, in one line", "The third idea, in one line"], true), btn("See the highlights"))) },

  // Sales
  { key: "follow_up", name: "Sales follow-up", group: "Sales", make: mk("Following up.", sec(p(HI, "I wanted to follow up on my last note. Would a short call next week help?"), meeting(), sign())) },
  { key: "meeting_recap", name: "Meeting recap", group: "Sales", make: mk("Notes from our call.", sec(h("Thanks for your time", 2), p(HI, "Here's what we covered, and the next steps."), list(["What we agreed", "What we'll send", "When we'll talk next"]), sign())) },
  { key: "demo_confirm", name: "Demo confirmed", group: "Sales", make: mk("See you soon.", sec(h("Your demo is booked"), p(HI, "We'll show you the parts that matter most to your team. Bring your questions."), list(["How it fits your setup", "What teams like yours do first", "Pricing and next steps"]), sign())) },
  { key: "not_booked", name: "Didn't book yet", group: "Sales", make: mk("Pick a time that works.", sec(h("Pick a time that works", 2), p(HI, "Thanks for your interest. Choose a time below and we'll take it from there."), meeting(), sign())) },
  { key: "plain_note", name: "Plain note", group: "Sales", make: mk("", sec(p(HI, "A short, personal note. Write it the way you'd write to a colleague."), sign())) },
  { key: "partner_intro", name: "Partner intro", group: "Sales", make: mk("An introduction.", sec(p(HI, "I'd like to introduce you to a partner who helps teams like yours."), product("Partner name", "One line about what they do and why it matters."), sign())) },
  { key: "offer", name: "Offer", group: "Sales", make: mk("For a short time.", sec(h("A little something for you"), p("For the next two weeks, get your first month free on any plan."), btn("Claim the offer", "https://", "center"))) },

  // Customers
  { key: "thank_you", name: "Thank you", group: "Customers", make: mk("Thank you.", sec(h("Thank you"), p(HI, "Thanks for being with us. We're glad to have you."), sign())) },
  { key: "renewal", name: "Renewal reminder", group: "Customers", make: mk("Your plan renews soon.", sec(h("Your plan renews soon"), p(HI, "Your plan renews next month. No action needed; here's a summary."), list(["Plan: your plan", "Renews on: the date", "Billing: the card on file"]), btn("Review your plan"))) },
  { key: "feedback", name: "Feedback request", group: "Customers", make: mk("Two minutes of your time.", sec(h("How are we doing?"), p(HI, "Two minutes of your time helps us build what you need."), btn("Share feedback"))) },
  { key: "review_request", name: "Review request", group: "Customers", make: mk("Would you share a review?", sec(h("Would you leave a review?", 2), p(HI, "If we've helped, a short review helps other teams find us."), btn("Leave a review"))) },
  { key: "referral", name: "Referral ask", group: "Customers", make: mk("Know a team who'd like this?", sec(h("Know a team who'd like this?"), p("Share your link. When they join, you both get a month free."), btn("Share your link"))) },
  { key: "reengage", name: "Re-engagement", group: "Customers", make: mk("It's been a while.", sec(h("It's been a while"), p(HI, "A lot has changed since you last logged in. Here are the highlights."), list(["Something new", "Something faster", "Something easier"]), btn("Take a look"))) },
];

export const emailTemplate = (key: string) => EMAIL_TEMPLATES.find((t) => t.key === key);
