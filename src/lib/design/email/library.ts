// The email template library (docs/email-studio-plan.md Part 8): the first 21 (templates.ts) and 79 more on the same
// blocks, about 100 in nine folders by what they're for. Every color is a brand variable, so each one arrives in the
// workspace's look. Words are short and plain; anything only the sender knows is a clear placeholder in brackets, and
// merge tags always have a fallback. Built for small teams of every kind: studios, clinics, agencies, coaches, shops,
// software and services.

import { BASE_TEMPLATES, kit, TEMPLATE_FOLDERS, type EmailTemplate, type TemplateFolder } from "./templates.ts";

export { TEMPLATE_FOLDERS, type EmailTemplate, type TemplateFolder };

const { h, t, btn, list, quote, event, card, meeting, sign, spacer, sec, cols, email, HI } = kit;

const tpl = (key: string, name: string, group: TemplateFolder, blurb: string, make: EmailTemplate["make"]): EmailTemplate => ({ key, name, group, blurb, make });

const MORE: EmailTemplate[] = [
  // Newsletters ------------------------------------------------------------------------------------------------------
  tpl("weekly_tips", "Weekly tips", "Newsletters", "Three quick tips, one link each.", email("This week", "Three quick tips for this week.", () => [
    sec("hero", t("This week", "eyebrow"), h("Three tips for this week"), t(`${HI} here's what's worked for people like you lately.`, "lead")),
    sec("close", list(["[Tip one, in one sentence]", "[Tip two, in one sentence]", "[Tip three, in one sentence]"], true), btn("Read more tips", { quiet: true })),
  ])),
  tpl("studio_news", "Studio news", "Newsletters", "What's new at your place this month.", email("News", "What's new this month.", () => [
    sec("hero", t("This month", "eyebrow"), h("What's new with us"), t("A few changes, a new face and a date to save.", "lead")),
    cols("body", [h("New this month", "card"), t("[What's new, in two sentences.]")], [h("Coming up", "card"), t("[The next date worth knowing.]")]),
    sec("close", btn("See the schedule")),
  ])),
  tpl("roundup", "Link roundup", "Newsletters", "The best reads you found, with a line on each.", email("Roundup", "The best things we read this month.", () => [
    sec("hero", h("Worth reading this month"), t("Five links we kept coming back to, with a line on why.", "lead")),
    sec("body", card("[Title of the first read]", "[Why it's worth ten minutes.]", "Read it")),
    sec("body", card("[Title of the second read]", "[Why it's worth ten minutes.]", "Read it")),
    sec("close", card("[Title of the third read]", "[Why it's worth ten minutes.]", "Read it")),
  ])),
  tpl("case_study_letter", "Behind the work", "Newsletters", "One project told from start to finish.", email("Behind the work", "How one project came together.", () => [
    sec("hero", t("Behind the work", "eyebrow"), h("How [project] came together"), t("What the client needed, what we tried and what worked.", "lead")),
    sec("body", h("The problem", "card"), t("[Two sentences on where they started.]"), h("What we did", "card"), t("[Two sentences on the approach.]"), h("What changed", "card"), t("[One result, in plain numbers if you have them.]")),
    sec("close", btn("See the full project", { quiet: true })),
  ])),
  tpl("community_news", "Community news", "Newsletters", "Members, wins and what's next.", email("Community", "Wins, faces and what's next.", () => [
    sec("hero", t("Community", "eyebrow"), h("What our members did this month")),
    sec("body", quote("[A short line from a member about their month.]", "[Member name]")),
    sec("close", t("Have a win to share? Reply to this email and tell us."), btn("Join the next meetup", { quiet: true })),
  ])),
  tpl("quarterly_letter", "Quarterly letter", "Newsletters", "A calm look back at the last three months.", email("Quarterly letter", "Our last three months, in short.", () => [
    sec("hero", h("Our last three months", "section"), spacer(4), t([HI, "Here's what we set out to do this quarter, what we did and what's next. It takes two minutes to read."])),
    sec("body", list(["[What we set out to do]", "[What we did]", "[What we learned]"])),
    sec("close", t("Thanks for being part of it."), sign()),
  ])),
  tpl("ask_me_anything", "Reader questions", "Newsletters", "Answer the questions readers sent.", email("Your questions", "Your questions, answered.", () => [
    sec("hero", t("You asked", "eyebrow"), h("Your questions, answered")),
    sec("body", h("[A question a reader asked]", "card"), t("[The answer, in three sentences or fewer.]")),
    sec("body", h("[Another question]", "card"), t("[The answer, in three sentences or fewer.]")),
    sec("close", t("Got a question for next time? Just reply.")),
  ])),
  tpl("recipe_of_month", "How-to of the month", "Newsletters", "One step-by-step guide readers can use today.", email("How-to", "A step-by-step you can use today.", () => [
    sec("hero", t("How-to", "eyebrow"), h("[What the reader will be able to do]"), t("Five steps, about ten minutes.", "lead")),
    sec("close", list(["[First step]", "[Second step]", "[Third step]", "[Fourth step]", "[Fifth step]"], true), btn("See it with pictures", { quiet: true })),
  ])),
  tpl("local_guide", "Local picks", "Newsletters", "Places and people you like in your area.", email("Local picks", "A few places we love near us.", () => [
    sec("hero", h("A few local picks"), t("Places and people near us we think you'll like.", "lead")),
    cols("body", [card("[Place one]", "[Why we like it.]", "Find it")], [card("[Place two]", "[Why we like it.]", "Find it")]),
    sec("close", t("Know a spot we should add? Reply and tell us.", "small")),
  ])),

  // Product updates --------------------------------------------------------------------------------------------------
  tpl("small_improvements", "Small improvements", "Product updates", "A short list of fixes and polish.", email("Improvements", "Small things that got better.", () => [
    sec("hero", t("Improvements", "eyebrow"), h("Small things that got better"), t("None of these need anything from you. They're just there now.", "lead")),
    sec("close", list(["[Improvement, told as what the reader can now do]", "[Improvement]", "[Improvement]", "[Improvement]"]), btn("See all changes", { quiet: true })),
  ])),
  tpl("beta_invite", "Early access", "Product updates", "Invite people to try something before it's out.", email("Early access", "You're invited to try it first.", () => [
    sec("hero", t("Early access", "eyebrow"), h("Try [feature] before anyone else"), t(`${HI} we're opening it to a small group first, and we'd like you in it.`, "lead")),
    sec("body", list(["What it does: [one sentence]", "What we ask: [ten minutes of feedback]", "When: [dates]"])),
    sec("close", btn("Join early access")),
  ])),
  tpl("pricing_change", "Pricing change", "Product updates", "Explain a price change clearly and early.", email("Pricing", "A change to our pricing, explained.", () => [
    sec("hero", h("A change to our pricing", "section"), spacer(4), t([HI, "From [date], [plan] will cost [new price]. Here's why, and what it means for you."])),
    sec("body", list(["What changes: [one line]", "When: [date]", "What stays the same: [one line]"])),
    sec("close", t("Questions? Reply and a person will answer."), sign()),
  ])),
  tpl("new_integration", "New integration", "Product updates", "Announce a new tool you work with.", email("Integrations", "Now works with [tool].", () => [
    sec("hero", t("New", "eyebrow"), h("Now works with [tool]"), t("Connect it once and [what happens on its own].", "lead")),
    sec("close", list(["[What you can do, one]", "[What you can do, two]"]), btn("Connect it")),
  ])),
  tpl("maintenance", "Planned downtime", "Product updates", "Tell people about a short break in service.", email("Service", "A short break in service on [date].", () => [
    sec("hero", h("A short break in service", "section"), t(`${HI} on [date], from [time] to [time], [service] will be unavailable while we [reason].`)),
    sec("close", t("Nothing is lost, and you don't need to do anything. We'll email again when it's back."), sign()),
  ])),
  tpl("roadmap", "What's next", "Product updates", "Share what you're working on next.", email("What's next", "What we're working on next.", () => [
    sec("hero", t("Roadmap", "eyebrow"), h("What we're working on next")),
    cols("body", [h("Now", "card"), t("[What's being built now]", "small")], [h("Next", "card"), t("[What comes after]", "small")], [h("Later", "card"), t("[What's on the list]", "small")]),
    sec("close", t("Tell us what you'd move up the list."), btn("Share an idea", { quiet: true })),
  ])),
  tpl("tip_feature", "Feature tip", "Product updates", "One feature people miss, and how to use it.", email("Tip", "A feature most people miss.", () => [
    sec("hero", t("Did you know", "eyebrow"), h("[Feature] saves you [time]"), t("Most people miss it. Here's how to use it in three steps.", "lead")),
    sec("close", list(["[Step one]", "[Step two]", "[Step three]"], true), btn("Try it now")),
  ])),

  // Events and webinars ----------------------------------------------------------------------------------------------
  tpl("workshop_invite", "Workshop invite", "Events and webinars", "A hands-on session with a date, price and sign-up.", email("Workshop", "A hands-on workshop on [date].", () => [
    sec("hero", t("Workshop", "eyebrow"), h("[Workshop name]"), t(`${HI} [two sentences on what people will do and leave with].`, "lead")),
    sec("body", event("[Workshop name]", "[Day, date, time]", "[Place or video call]", "Save my spot")),
    sec("close", t("[Price, and any early-bird date.]", "small")),
  ])),
  tpl("class_schedule", "Class schedule", "Events and webinars", "This week's or month's classes at a glance.", email("Schedule", "This week's classes.", () => [
    sec("hero", t("Schedule", "eyebrow"), h("This week's classes")),
    cols("body", [h("Monday", "card"), t("[Class, time]", "small")], [h("Wednesday", "card"), t("[Class, time]", "small")], [h("Saturday", "card"), t("[Class, time]", "small")]),
    sec("close", btn("Book a class")),
  ])),
  tpl("save_the_date", "Save the date", "Events and webinars", "An early heads-up before details are ready.", email("Save the date", "Save the date: [event].", () => [
    sec("band", t("Save the date", "eyebrow", { center: true, band: true }), h("[Event name]", "title", { center: true, band: true }), t("[Date] in [place]", "lead", { center: true, band: true })),
    sec("close", t("Details and tickets are coming soon. Put it in your calendar now so you don't miss it.", "body", { center: true }), btn("Add to calendar", { center: true, quiet: true })),
  ])),
  tpl("last_seats", "Last seats", "Events and webinars", "A short nudge when an event is almost full.", email("Last seats", "A few seats left for [event].", () => [
    sec("hero", h("A few seats left"), t(`${HI} [event] on [date] is almost full. If you'd like to come, now's the time.`, "lead")),
    sec("close", btn("Save my seat")),
  ])),
  tpl("event_tomorrow", "See you tomorrow", "Events and webinars", "What to bring and how to get there.", email("Tomorrow", "What to bring tomorrow.", () => [
    sec("hero", t("Tomorrow", "eyebrow"), h("See you tomorrow"), t("Everything you need, in one place.", "lead")),
    sec("body", list(["When: [time]", "Where: [address or link]", "Bring: [what to bring]", "Parking: [one line]"])),
    sec("close", t("Can't make it anymore? Reply and we'll give your spot to someone on the waitlist.", "small")),
  ])),
  tpl("replay_ready", "Replay is ready", "Events and webinars", "Send the recording to everyone who signed up.", email("Replay", "The recording is ready.", () => [
    sec("hero", h("The replay is ready"), t(`${HI} whether you joined live or not, here's the full recording and the slides.`, "lead")),
    sec("body", btn("Watch the replay"), btn("Get the slides", { quiet: true })),
    sec("close", t("Have a question we didn't get to? Book a short call.", "small"), meeting("Pick a time")),
  ])),
  tpl("conference_meet", "Meet us at the event", "Events and webinars", "Book time with your team at a conference.", email("Meet us", "Meet us at [conference].", () => [
    sec("hero", t("[Conference]", "eyebrow"), h("Let's meet at [conference]"), t("We'll be at [booth or place] on [dates]. Book 20 minutes and we'll save the time for you.", "lead")),
    sec("close", meeting("Book a time at the event")),
  ])),
  tpl("open_house", "Open house", "Events and webinars", "Invite people to visit, no sign-up needed.", email("Open house", "Come by on [date].", () => [
    sec("hero", t("Open house", "eyebrow"), h("Come and see us"), t("Drop in any time between [time] and [time]. Bring a friend.", "lead")),
    sec("close", event("Open house", "[Day, date, time]", "[Address]", "Get directions")),
  ])),
  tpl("course_starts", "Course starts soon", "Events and webinars", "Get people ready for the first session.", email("Course", "Your course starts [day].", () => [
    sec("hero", h("Your course starts [day]"), t(`${HI} here's how the first week works.`, "lead")),
    sec("body", list(["Session one: [date and time]", "Where: [place or link]", "Before you come: [one small task]"])),
    sec("close", btn("See the full schedule", { quiet: true })),
  ])),
  tpl("event_survey", "How was it", "Events and webinars", "Ask attendees one or two quick questions.", email("Feedback", "How was [event]?", () => [
    sec("hero", h("How was [event]?"), t("Two quick questions help us make the next one better. It takes a minute.", "lead")),
    sec("close", btn("Answer two questions"), t("Thanks for coming.", "small")),
  ])),
  tpl("waitlist_spot", "A spot opened", "Events and webinars", "Offer a freed-up place to the waitlist.", email("Waitlist", "A spot opened up for you.", () => [
    sec("hero", h("A spot opened up"), t(`${HI} someone can't make it to [event] on [date], so the spot is yours if you want it. It's held for [hours] hours.`, "lead")),
    sec("close", btn("Take the spot")),
  ])),

  // Welcome and onboarding -------------------------------------------------------------------------------------------
  tpl("welcome_member", "Welcome, new member", "Welcome and onboarding", "Say hello and point to the first step.", email("Welcome", "Welcome. Here's where to start.", () => [
    sec("hero", t("Welcome", "eyebrow"), h(`Welcome, {{first_name|friend}}`), t("We're glad you're here. Here's the one thing to do first.", "lead")),
    sec("close", btn("[First step]"), t("Questions any time: just reply.", "small")),
  ])),
  tpl("welcome_client", "Welcome, new client", "Welcome and onboarding", "Set expectations for the first weeks.", email("Welcome", "What happens in your first weeks.", () => [
    sec("hero", h("Welcome aboard"), t(`${HI} here's what happens next, so nothing is a surprise.`, "lead")),
    sec("body", list(["This week: [first step]", "Next week: [second step]", "By [date]: [first result]"], true)),
    sec("close", t("Your main contact is [name]. Book your kickoff below."), meeting("Book the kickoff"), spacer(8), sign()),
  ])),
  tpl("welcome_patient", "Welcome, new patient", "Welcome and onboarding", "What to expect at a first visit.", email("Welcome", "What to expect at your first visit.", () => [
    sec("hero", h("Your first visit"), t(`${HI} we're looking forward to meeting you. Here's what to expect.`, "lead")),
    sec("body", list(["Arrive [minutes] minutes early", "Bring: [ID, insurance card, list of medicines]", "The visit takes about [length]"])),
    sec("close", btn("Fill in your forms before you come"), t("Need to change the time? Reply or call [phone].", "small")),
  ])),
  tpl("getting_started", "Getting started guide", "Welcome and onboarding", "Three steps to get going.", email("Getting started", "Three steps to get going.", () => [
    sec("hero", t("Getting started", "eyebrow"), h("Three steps to get going")),
    sec("body", h("1. [First step]", "card"), t("[One sentence on why and how.]"), h("2. [Second step]", "card"), t("[One sentence on why and how.]"), h("3. [Third step]", "card"), t("[One sentence on why and how.]")),
    sec("close", btn("Start with step one")),
  ])),
  tpl("meet_the_team", "Meet the team", "Welcome and onboarding", "Introduce the people new customers will talk to.", email("Our team", "The people you'll work with.", () => [
    sec("hero", h("The people you'll work with")),
    cols("body", [h("[Name]", "card"), t("[Role, and one line about them]", "small")], [h("[Name]", "card"), t("[Role, and one line about them]", "small")]),
    sec("close", t("Say hi any time by replying to this email.")),
  ])),
  tpl("first_week_check", "First week check-in", "Welcome and onboarding", "Ask how the first week went.", email("Check-in", "How's your first week going?", () => [
    sec("hero", h("How's your first week going?", "section"), spacer(4), t([HI, "You've been with us a week. Is anything confusing, missing or slower than you hoped? Reply with one line and we'll help."])),
    sec("close", sign()),
  ])),
  tpl("profile_complete", "Finish your setup", "Welcome and onboarding", "Nudge someone to finish the last steps.", email("Setup", "You're almost set up.", () => [
    sec("hero", h("You're almost set up"), t("Two more steps and everything works the way it should.", "lead")),
    sec("close", list(["[Step left, one]", "[Step left, two]"]), btn("Finish setup")),
  ])),
  tpl("resources_pack", "Starter resources", "Welcome and onboarding", "The guides people ask for first.", email("Resources", "The guides people ask for first.", () => [
    sec("hero", t("Resources", "eyebrow"), h("The guides people ask for first")),
    sec("body", card("[Guide one]", "[What it helps with.]", "Read it")),
    sec("close", card("[Guide two]", "[What it helps with.]", "Read it")),
  ])),
  tpl("welcome_subscriber", "Welcome, new subscriber", "Welcome and onboarding", "Thank someone for subscribing and set the cadence.", email("Welcome", "Thanks for subscribing.", () => [
    sec("hero", h("Thanks for subscribing"), t("You'll hear from us [how often], with [what kind of emails]. Never more, and you can leave any time.", "lead")),
    sec("close", t("While you wait for the next one, here's our most-read piece."), btn("Read it", { quiet: true })),
  ])),

  // Nurture and win-back ---------------------------------------------------------------------------------------------
  tpl("still_thinking", "Still thinking it over", "Nurture and win-back", "A gentle check-in after someone showed interest.", email("Checking in", "Still thinking it over?", () => [
    sec("hero", h("Still thinking it over?", "section"), spacer(4), t([HI, "You asked about [thing] a little while ago. If you have questions, a 15-minute call usually answers them."])),
    sec("close", meeting("Pick a time"), spacer(8), sign()),
  ])),
  tpl("faq_nurture", "Common questions", "Nurture and win-back", "Answer the questions that hold people back.", email("Questions", "The questions people ask before they start.", () => [
    sec("hero", h("Questions people ask before they start")),
    sec("body", h("[Question one]", "card"), t("[Short answer.]"), h("[Question two]", "card"), t("[Short answer.]"), h("[Question three]", "card"), t("[Short answer.]")),
    sec("close", btn("Ask us something else", { quiet: true })),
  ])),
  tpl("testimonial_nurture", "What clients say", "Nurture and win-back", "Let a customer's words do the selling.", email("Clients", "In our clients' words.", () => [
    sec("hero", t("In their words", "eyebrow"), h("What clients say")),
    sec("body", quote("[A short, real quote from a client.]", "[Name, role or place]")),
    sec("close", quote("[Another short, real quote.]", "[Name, role or place]"), btn("Book a call", { quiet: true })),
  ])),
  tpl("comparison", "How we compare", "Nurture and win-back", "Show the difference plainly, without knocking others.", email("Compare", "How we're different.", () => [
    sec("hero", h("How we're different"), t("A fair look at what you get with us, side by side.", "lead")),
    cols("body", [h("With us", "card"), list(["[Difference one]", "[Difference two]"])], [h("Elsewhere", "card"), list(["[What's usual]", "[What's usual]"])]),
    sec("close", btn("See it for yourself")),
  ])),
  tpl("free_consult", "Free consultation offer", "Nurture and win-back", "Offer a no-cost first conversation.", email("Consultation", "A free first conversation.", () => [
    sec("hero", h("A free first conversation"), t(`${HI} talk through [topic] with [name] for [length]. No cost, no pressure.`, "lead")),
    sec("close", meeting("Book your free consultation")),
  ])),
  tpl("miss_you", "We miss you", "Nurture and win-back", "A warm note to someone who hasn't been back.", email("It's been a while", "It's been a while.", () => [
    sec("hero", h("It's been a while"), t(`${HI} we haven't seen you since [time]. Here's what's new, and a reason to come back.`, "lead")),
    sec("close", card("[Offer or news]", "[One line on it.]", "Come back"), t("Not interested anymore? You can unsubscribe below.", "small")),
  ])),
  tpl("abandoned_form", "Finish your request", "Nurture and win-back", "Bring back someone who started a form and left.", email("Your request", "You were almost done.", () => [
    sec("hero", h("You were almost done"), t(`${HI} you started [request] but didn't finish. It takes about a minute to wrap up.`, "lead")),
    sec("close", btn("Finish my request")),
  ])),
  tpl("renewal_reminder", "Renewal coming up", "Nurture and win-back", "Remind someone before their plan renews.", email("Renewal", "Your plan renews on [date].", () => [
    sec("hero", h("Your plan renews soon", "section"), t(`${HI} your [plan] renews on [date] for [price]. Nothing to do if you'd like to keep it.`)),
    sec("close", btn("Review my plan", { quiet: true }), t("Want to change it first? Reply and we'll help.", "small")),
  ])),
  tpl("referral_ask", "Refer a friend", "Nurture and win-back", "Ask happy customers to pass you on.", email("Refer a friend", "Know someone who'd like this?", () => [
    sec("hero", h("Know someone who'd like this?"), t(`${HI} most of our new clients come from people like you. If you know someone, we'd love an introduction.`, "lead")),
    sec("close", btn("Send a referral"), t("[Any thank-you you offer, in one line.]", "small")),
  ])),

  // Sales follow-up --------------------------------------------------------------------------------------------------
  tpl("quote_sent", "Your quote", "Sales follow-up", "Send a quote with the next step.", email("Quote", "Your quote for [job].", () => [
    sec("hero", h("Your quote for [job]"), t(`${HI} thanks for the chance to quote. Here's the summary.`, "lead")),
    sec("body", card("[Job]", "[What's included, in one or two lines.]", "See the full quote", "[Price]")),
    sec("close", t("Happy to talk it through."), meeting("Pick a time"), spacer(8), sign()),
  ])),
  tpl("quote_followup", "Quote follow-up", "Sales follow-up", "Check in a few days after sending a quote.", email("Following up", "Any questions about the quote?", () => [
    sec("hero", h("Any questions about the quote?", "section"), spacer(4), t([HI, "I sent the quote for [job] on [date]. Is there anything you'd like changed, or anything I can explain?"])),
    sec("close", sign()),
  ])),
  tpl("missed_call", "Sorry we missed you", "Sales follow-up", "Follow up after a missed call or no-show.", email("We missed you", "Sorry we missed you.", () => [
    sec("hero", h("Sorry we missed you"), t(`${HI} we had a call set for [time] but didn't connect. No problem. Pick another time that works better.`, "lead")),
    sec("close", meeting("Pick a new time")),
  ])),
  tpl("intro_email", "Introduction", "Sales follow-up", "A short first email to someone you were introduced to.", email("Hello", "A quick hello.", () => [
    sec("hero", h("A quick hello", "section"), spacer(4), t([HI, "[Name] suggested we talk. I help [kind of people] with [problem]. If that's on your mind, I'd be glad to share what's worked for others."])),
    sec("close", meeting("Pick a time"), spacer(8), sign()),
  ])),
  tpl("next_steps", "Next steps", "Sales follow-up", "Recap a call and what happens next.", email("Next steps", "What we agreed, and what's next.", () => [
    sec("hero", h("What we agreed"), t(`${HI} thanks for the time today. Here's a recap.`, "lead")),
    sec("body", list(["[What we agreed, one]", "[What we agreed, two]"]), h("Next steps", "card"), list(["[Your next step, by date]", "[Our next step, by date]"], true)),
    sec("close", sign()),
  ])),
  tpl("contract_ready", "Agreement ready", "Sales follow-up", "Let a client know the agreement is ready to sign.", email("Agreement", "Your agreement is ready.", () => [
    sec("hero", h("Your agreement is ready"), t(`${HI} everything we discussed is in it. It takes about five minutes to review and sign.`, "lead")),
    sec("close", btn("Review and sign"), t("Anything look off? Reply and we'll fix it before you sign.", "small")),
  ])),
  tpl("closing_the_loop", "Closing the loop", "Sales follow-up", "A polite last follow-up that leaves the door open.", email("Closing the loop", "Should I close your file?", () => [
    sec("hero", h("Should I close your file?", "section"), spacer(4), t([HI, "I haven't heard back, so I'll assume the timing isn't right. If that changes, just reply and we'll pick up where we left off."])),
    sec("close", sign()),
  ])),

  // Meetings and forms -----------------------------------------------------------------------------------------------
  tpl("meeting_rescheduled", "Meeting moved", "Meetings and forms", "Confirm a new time after a reschedule.", email("Meeting", "Your meeting has a new time.", () => [
    sec("hero", t("Updated", "eyebrow"), h("Your meeting has a new time")),
    sec("close", event("[Meeting name]", "[New day, date and time]", "[Place or video call]", "Add to calendar")),
  ])),
  tpl("meeting_canceled", "Meeting canceled", "Meetings and forms", "Confirm a cancellation and offer a new time.", email("Meeting", "Your meeting was canceled.", () => [
    sec("hero", h("Your meeting was canceled"), t(`${HI} [meeting] on [date] won't happen. Whenever you're ready, pick a new time.`, "lead")),
    sec("close", meeting("Pick a new time")),
  ])),
  tpl("meeting_followup", "After the meeting", "Meetings and forms", "Thank them and share notes after a call.", email("After our call", "Thanks for your time today.", () => [
    sec("hero", h("Thanks for your time today"), t(`${HI} here are the notes and links we mentioned.`, "lead")),
    sec("body", list(["[Note or link one]", "[Note or link two]", "[Note or link three]"])),
    sec("close", t("Want to keep going? Book the next call."), meeting("Book the next call")),
  ])),
  tpl("no_show_rebook", "Missed appointment", "Meetings and forms", "Kindly offer a new time after a no-show.", email("Appointment", "We missed you today.", () => [
    sec("hero", h("We missed you today"), t(`${HI} we were ready for you at [time]. Life happens. Here's a link to pick a new time.`, "lead")),
    sec("close", meeting("Pick a new time")),
  ])),
  tpl("booking_prep", "Before your appointment", "Meetings and forms", "Ask for anything you need before the visit.", email("Appointment", "Before your appointment.", () => [
    sec("hero", h("Before your appointment"), t("A few minutes now saves time when you arrive.", "lead")),
    sec("close", list(["[What to fill in or bring, one]", "[What to fill in or bring, two]"]), btn("Fill in the form")),
  ])),
  tpl("form_received_quote", "Request received", "Meetings and forms", "Confirm a quote or service request.", email("Request", "We got your request.", () => [
    sec("hero", t("Received", "eyebrow"), h("We got your request"), t("Here's what happens next and when you'll hear from us.", "lead")),
    sec("body", list(["[Within a day: we review it]", "[Then: we send a quote or call you]"], true)),
    sec("close", t("Want to talk sooner?"), meeting("Pick a time")),
  ])),
  tpl("application_received", "Application received", "Meetings and forms", "Thank an applicant and give a timeline.", email("Application", "Thanks for applying.", () => [
    sec("hero", h("Thanks for applying"), t(`${HI} we got your application for [role or program]. We read every one.`, "lead")),
    sec("close", t("You'll hear from us by [date], either way.", "body"), sign()),
  ])),
  tpl("order_confirmed", "Order confirmed", "Meetings and forms", "Confirm an order from a form.", email("Order", "Your order is confirmed.", () => [
    sec("hero", t("Confirmed", "eyebrow"), h("Your order is confirmed")),
    sec("body", card("[What they ordered]", "[Pickup or delivery details.]", "See your order", "[Total]")),
    sec("close", t("Questions about your order? Just reply.", "small")),
  ])),
  tpl("survey_invite", "Quick survey", "Meetings and forms", "Ask for a few minutes of feedback.", email("Survey", "Three minutes of your time?", () => [
    sec("hero", h("Three minutes of your time?"), t(`${HI} we're asking a few questions about [topic]. Your answers decide what we do next.`, "lead")),
    sec("close", btn("Start the survey")),
  ])),
  tpl("review_request", "Leave a review", "Meetings and forms", "Ask a happy customer for a public review.", email("Review", "Would you share a quick review?", () => [
    sec("hero", h("Would you share a quick review?"), t(`${HI} if you liked working with us, a short review helps others find us. It takes a minute.`, "lead")),
    sec("close", btn("Leave a review")),
  ])),
  tpl("intake_reminder", "Forms still needed", "Meetings and forms", "Remind someone to finish intake forms.", email("Forms", "One thing before we meet.", () => [
    sec("hero", h("One thing before we meet"), t(`${HI} we still need your [form] before [date]. It takes about [minutes] minutes.`, "lead")),
    sec("close", btn("Finish the form")),
  ])),

  // Announcements ----------------------------------------------------------------------------------------------------
  tpl("new_location", "New location", "Announcements", "Announce a new place to find you.", email("News", "We've opened a new location.", () => [
    sec("hero", t("Now open", "eyebrow"), h("We've opened in [place]"), t("Same team, same care, closer to you.", "lead")),
    sec("close", event("[New location name]", "Open from [date]", "[Address]", "Get directions")),
  ])),
  tpl("new_hours", "New hours", "Announcements", "Tell people your opening hours changed.", email("Hours", "Our hours are changing.", () => [
    sec("hero", h("Our hours are changing"), t("From [date], here's when you can find us.", "lead")),
    sec("close", list(["Monday to Friday: [hours]", "Saturday: [hours]", "Sunday: [hours]"])),
  ])),
  tpl("new_service", "New service", "Announcements", "Introduce something new you offer.", email("New", "Something new from us.", () => [
    sec("hero", t("New", "eyebrow"), h("Introducing [service]"), t("[Who it's for and what it does, in two sentences.]", "lead")),
    sec("close", btn("Learn more"), meeting("Book a time to ask about it")),
  ])),
  tpl("new_hire", "New team member", "Announcements", "Introduce someone who just joined.", email("Team", "Meet the newest member of our team.", () => [
    sec("hero", h("Meet [name]"), t("[Name] joins us as [role]. [One line about them.]", "lead")),
    sec("close", quote("[A short line from them about why they joined.]", "[Name]")),
  ])),
  tpl("milestone", "A milestone", "Announcements", "Mark an anniversary or a big number, with thanks.", email("Thank you", "A milestone, thanks to you.", () => [
    sec("band", h("[Milestone]", "title", { center: true, band: true }), t("[One line on what it means.]", "lead", { center: true, band: true })),
    sec("close", t("None of it happens without you. Thank you.", "body", { center: true }), sign()),
  ])),
  tpl("policy_update", "Policy update", "Announcements", "Explain a change to terms or policies plainly.", email("Update", "An update to our [policy].", () => [
    sec("hero", h("An update to our [policy]", "section"), t(`${HI} on [date] our [policy] changes. Here's what's different, in plain words.`)),
    sec("body", list(["[Change one]", "[Change two]"])),
    sec("close", btn("Read the full policy", { quiet: true })),
  ])),
  tpl("price_offer", "Limited-time offer", "Announcements", "One clear offer with an end date.", email("Offer", "[Offer], until [date].", () => [
    sec("hero", t("Until [date]", "eyebrow"), h("[Offer]"), t("[What's included and who it's for, in one sentence.]", "lead")),
    sec("close", btn("Claim the offer"), t("[Any fine print, in one line.]", "small")),
  ])),
  tpl("moving_notice", "We're moving", "Announcements", "Tell people about a move and the dates.", email("Moving", "We're moving on [date].", () => [
    sec("hero", h("We're moving"), t(`${HI} from [date] you'll find us at [new address]. Here's what to know.`, "lead")),
    sec("close", list(["Last day at the old place: [date]", "First day at the new place: [date]", "Anything that changes: [one line]"])),
  ])),

  // Holidays and seasons ---------------------------------------------------------------------------------------------
  tpl("holiday_hours", "Holiday hours", "Holidays and seasons", "When you're open and closed over the holidays.", email("Holidays", "Our holiday hours.", () => [
    sec("hero", h("Our holiday hours"), t("Here's when we're open over the holidays.", "lead")),
    sec("close", list(["[Date]: [hours or closed]", "[Date]: [hours or closed]", "[Date]: back to normal"])),
  ])),
  tpl("year_in_review", "Year in review", "Holidays and seasons", "Look back at the year with thanks.", email("Year in review", "Our year, and thank you.", () => [
    sec("hero", t("[Year]", "eyebrow"), h("Our year, in short")),
    cols("body", [h("[Number]", "section"), t("[What it counts]", "small")], [h("[Number]", "section"), t("[What it counts]", "small")], [h("[Number]", "section"), t("[What it counts]", "small")]),
    sec("close", t("Thank you for being part of it."), sign()),
  ])),
  tpl("seasonal_greeting", "Season's greetings", "Holidays and seasons", "A short, warm note with nothing to sell.", email("Greetings", "Warm wishes from all of us.", () => [
    sec("band", h("Warm wishes", "title", { center: true, band: true }), t("From all of us at [business]", "lead", { center: true, band: true })),
    sec("close", t("[A short, personal note of thanks.]", "body", { center: true })),
  ])),
  tpl("new_year", "New year", "Holidays and seasons", "A fresh-start note with one useful idea.", email("New year", "A good start to the year.", () => [
    sec("hero", h("A good start to [year]"), t(`${HI} one thing that helps people start the year well: [idea].`, "lead")),
    sec("close", btn("Plan your year with us", { quiet: true })),
  ])),
  tpl("spring_reset", "Spring reset", "Holidays and seasons", "A seasonal offer or class for spring.", email("Spring", "A fresh start this spring.", () => [
    sec("hero", t("Spring", "eyebrow"), h("A fresh start this spring"), t("[What you're offering this season, in one sentence.]", "lead")),
    sec("close", btn("See what's on")),
  ])),
  tpl("summer_schedule", "Summer schedule", "Holidays and seasons", "What changes over the summer.", email("Summer", "How summer works with us.", () => [
    sec("hero", h("How summer works with us")),
    sec("close", list(["[What changes, one]", "[What changes, two]", "[Dates we're closed]"]), btn("See the summer schedule", { quiet: true })),
  ])),
  tpl("back_to_school", "Back to routine", "Holidays and seasons", "Help people get back into a routine in the fall.", email("Fall", "Back to a routine.", () => [
    sec("hero", h("Back to a routine"), t("The fall is a good time to get back on track. Here's an easy way to start.", "lead")),
    sec("close", btn("Book your first session back")),
  ])),
  tpl("gift_cards", "Gift cards", "Holidays and seasons", "Offer gift cards for the season.", email("Gifts", "An easy gift this season.", () => [
    sec("hero", t("Gift cards", "eyebrow"), h("An easy gift this season"), t("[What a gift card covers and the amounts.]", "lead")),
    sec("close", btn("Buy a gift card")),
  ])),
];

// One line each for the first 21, for the gallery and the website.
const BASE_BLURBS: Record<string, string> = {
  newsletter: "Three short reads: what you learned, shipped and were asked.",
  digest: "A month in numbers, with the best week called out.",
  founder_letter: "A short note written like a letter to a colleague.",
  feature_launch: "Announce one new feature and what it lets people do.",
  release_notes: "A tidy list of what changed this release.",
  product_recap: "Everything new this month, in cards.",
  webinar_invite: "Invite people to a live session, with the date and sign-up.",
  event_reminder: "A reminder before an event, with the join link.",
  event_followup: "Thanks for coming, the replay and a next step.",
  welcome: "Say hello to someone new and show the first step.",
  onboarding_step: "Nudge people to the next step of getting set up.",
  trial_ending: "A heads-up before a trial ends, with the plans.",
  customer_story: "One customer's story, told in their words.",
  resource: "Share a guide people can use right away.",
  winback: "Bring back someone who's gone quiet, with a reason to return.",
  after_demo: "Follow up after a demo with notes and the next step.",
  plain_followup: "A short, plain follow-up that reads like a person wrote it.",
  proposal: "Send a proposal with the plan and a time to talk.",
  meeting_confirmed: "Confirm a booked meeting with its details.",
  meeting_reminder: "Remind someone the day before, with tips to prepare.",
  form_thanks: "Thank someone for a form and offer to book now.",
};

export const EMAIL_TEMPLATES: EmailTemplate[] = [...BASE_TEMPLATES.map((x) => ({ ...x, blurb: x.blurb ?? BASE_BLURBS[x.key] })), ...MORE];
export const emailTemplate = (key: string) => EMAIL_TEMPLATES.find((x) => x.key === key);
