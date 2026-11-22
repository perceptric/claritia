// The email template library (docs/email-studio-plan.md Part 8): the first 21 (templates.ts) and 79 more on the same
// blocks, about 100 in nine folders by what they're for. Every color is a brand variable, so each one arrives in the
// workspace's look. Words are short and plain sample copy a small business could send as it is (Tia rewrites them in
// the brand's voice when a template is used); merge tags always have a fallback. Built for small teams of every kind: studios, clinics, agencies, coaches, shops,
// software and services.

import { BASE_TEMPLATES, kit, TEMPLATE_FOLDERS, type EmailTemplate, type TemplateFolder } from "./templates.ts";

export { TEMPLATE_FOLDERS, type EmailTemplate, type TemplateFolder };

const { h, t, btn, list, quote, event, card, meeting, sign, spacer, sec, cols, stats, offer, email, HI } = kit;

const tpl = (key: string, name: string, group: TemplateFolder, blurb: string, make: EmailTemplate["make"]): EmailTemplate => ({ key, name, group, blurb, make });

const MORE: EmailTemplate[] = [
  // Newsletters ------------------------------------------------------------------------------------------------------
  tpl("weekly_tips", "Weekly tips", "Newsletters", "Three quick tips, one link each.", email("This week", "Three quick tips for this week.", () => [
    sec("hero", t("This week", "eyebrow"), h("Three tips for this week"), t(`${HI} here's what's worked for people like you lately.`, "lead")),
    sec("close", list(["Block one hour on Friday to plan next week", "Answer quick questions in one batch after lunch", "End each call by agreeing on the next step"], true), btn("Read more tips", { quiet: true })),
  ])),
  tpl("studio_news", "Studio news", "Newsletters", "What's new at your place this month.", email("News", "What's new this month.", () => [
    sec("hero", t("This month", "eyebrow"), h("What's new with us"), t("A new face, longer hours on Thursdays and a date to save.", "lead")),
    cols("body", [h("New this month", "card"), t("Jordan joins the team and takes bookings from Monday.")], [h("Coming up", "card"), t("Our open evening is on the 28th, from 6 to 8 PM.")]),
    sec("close", spacer(4), btn("See the schedule")),
  ])),
  tpl("roundup", "Link roundup", "Newsletters", "The best reads you found, with a line on each.", email("Roundup", "The best things we read this month.", () => [
    sec("hero", h("Worth reading this month"), t("Three reads we kept coming back to, with a line on why.", "lead")),
    sec("tight", card("How small teams plan a week", "A simple Friday habit that makes Mondays calmer.", "Read it")),
    sec("tight", card("The two-sentence update", "Why short notes beat long meetings, with examples you can copy.", "Read it")),
    sec("close", card("Saying no, kindly", "Five ways to turn down work and keep the client.", "Read it")),
  ])),
  tpl("case_study_letter", "Behind the work", "Newsletters", "One project told from start to finish.", email("Behind the work", "How one project came together.", () => [
    sec("hero", t("Behind the work", "eyebrow"), h("How the Harbor Cafe site came together"), t("What the client needed, what we tried and what worked.", "lead")),
    sec("body", h("The problem", "card"), t("Bookings came by phone only, and Fridays were chaos. Half the calls went unanswered."), h("What we did", "card"), t("A one-page site with a booking form, and reminders the day before each table."), h("What changed", "card"), t("Missed calls fell to almost none, and Friday covers grew by a third.")),
    sec("close", btn("See the full project", { quiet: true })),
  ])),
  tpl("community_news", "Community news", "Newsletters", "Members, wins and what's next.", email("Community", "Wins, faces and what's next.", () => [
    sec("hero", t("Community", "eyebrow"), h("What our members did this month")),
    sec("body", quote("I finally launched my shop after a year of planning. The group kept me going.", "Lena, member since spring")),
    sec("close", t("Have a win to share? Reply to this email and tell us."), btn("Join the next meetup", { quiet: true })),
  ])),
  tpl("quarterly_letter", "Quarterly letter", "Newsletters", "A calm look back at the last three months.", email("Quarterly letter", "Our last three months, in short.", () => [
    sec("hero", h("Our last three months", "section"), spacer(4), t([HI, "Here's what we set out to do this quarter, what we did and what's next. It takes two minutes to read."])),
    sec("body", list(["We set out to cut waiting times in half", "We added evening slots and a second room", "We learned that reminders matter more than hours"])),
    sec("close", t("Thanks for being part of it."), sign("Sam Rivera", "Founder")),
  ])),
  tpl("ask_me_anything", "Reader questions", "Newsletters", "Answer the questions readers sent.", email("Your questions", "Your questions, answered.", () => [
    sec("hero", t("You asked", "eyebrow"), h("Your questions, answered")),
    sec("body", h("Can I change my booking online?", "card"), t("Yes. Use the link in your confirmation email, any time up to a day before.")),
    sec("body", h("Do you offer gift cards?", "card"), t("We do, in any amount from $25. They never expire.")),
    sec("close", t("Got a question for next time? Just reply.")),
  ])),
  tpl("recipe_of_month", "How-to of the month", "Newsletters", "One step-by-step guide readers can use today.", email("How-to", "A step-by-step you can use today.", () => [
    sec("hero", t("How-to", "eyebrow"), h("Plan a calm week in ten minutes"), t("Five steps, about ten minutes, every Friday.", "lead")),
    sec("close", list(["Look back: what took longer than you thought?", "Pick the three things that matter most next week", "Block time for each one in your calendar", "Move or drop one meeting you don't need", "Write a two-line note to your team"], true), btn("See it with pictures", { quiet: true })),
  ])),
  tpl("local_guide", "Local picks", "Newsletters", "Places and people you like in your area.", email("Local picks", "A few places we love near us.", () => [
    sec("hero", h("A few local picks"), t("Places near us we think you'll like.", "lead")),
    cols("body", [card("Corner Bakery", "The best morning buns in town, and they open at seven.", "Find it")], [card("Riverside Books", "A quiet shop with a reading nook and great coffee.", "Find it")]),
    sec("close", t("Know a spot we should add? Reply and tell us.", "small")),
  ])),

  // Product updates --------------------------------------------------------------------------------------------------
  tpl("small_improvements", "Small improvements", "Product updates", "A short list of fixes and polish.", email("Improvements", "Small things that got better.", () => [
    sec("hero", t("Improvements", "eyebrow"), h("Small things that got better"), t("None of these need anything from you. They're just there now.", "lead")),
    sec("close", list(["You can reschedule from your phone in two taps", "Receipts now show the full address", "Search finds names with accents", "Pages load faster on slow connections"]), btn("See all changes", { quiet: true })),
  ])),
  tpl("beta_invite", "Early access", "Product updates", "Invite people to try something before it's out.", email("Early access", "You're invited to try it first.", () => [
    sec("hero", t("Early access", "eyebrow"), h("Try shared calendars before anyone else"), t(`${HI} we're opening it to a small group first, and we'd like you in it.`, "lead")),
    sec("body", list(["What it does: your whole team's availability in one view", "What we ask: ten minutes of feedback after a week", "When: from Monday, for four weeks"])),
    offer("Twenty spots, first come", "Join now and we'll turn it on for your team on Monday.", "Join early access"),
  ])),
  tpl("pricing_change", "Pricing change", "Product updates", "Explain a price change clearly and early.", email("Pricing", "A change to our pricing, explained.", () => [
    sec("hero", h("A change to our pricing", "section"), spacer(4), t([HI, "From March 1, the Team plan will cost $39 a month. Here's why, and what it means for you."])),
    sec("body", list(["What changes: the Team plan goes from $29 to $39 a month", "When: your first bill after March 1", "What stays the same: everything you use today, plus the new reports"])),
    sec("close", t("Questions? Reply and a person will answer."), sign("Sam Rivera", "Founder")),
  ])),
  tpl("new_integration", "New integration", "Product updates", "Announce a new tool you work with.", email("Integrations", "Now works with Google Calendar.", () => [
    sec("hero", t("New", "eyebrow"), h("Now works with Google Calendar"), t("Connect it once, and every booking lands in your calendar on its own.", "lead")),
    sec("close", list(["See bookings next to the rest of your day", "Busy times are blocked so nobody double-books you"]), btn("Connect it")),
  ])),
  tpl("maintenance", "Planned downtime", "Product updates", "Tell people about a short break in service.", email("Service", "A short break in service on Sunday.", () => [
    sec("hero", h("A short break in service", "section"), t(`${HI} this Sunday, from 2 to 3 AM Eastern, online booking will be unavailable while we move to faster servers.`)),
    sec("close", t("Nothing is lost, and you don't need to do anything. We'll email again when it's back."), sign("Sam Rivera", "Support")),
  ])),
  tpl("roadmap", "What's next", "Product updates", "Share what you're working on next.", email("What's next", "What we're working on next.", () => [
    sec("hero", t("Roadmap", "eyebrow"), h("What we're working on next")),
    cols("body", [h("Now", "card"), t("Text message reminders", "small")], [h("Next", "card"), t("Group bookings", "small")], [h("Later", "card"), t("A mobile app", "small")]),
    sec("close", spacer(4), t("Tell us what you'd move up the list."), btn("Share an idea", { quiet: true })),
  ])),
  tpl("tip_feature", "Feature tip", "Product updates", "One feature people miss, and how to use it.", email("Tip", "A feature most people miss.", () => [
    sec("hero", t("Did you know", "eyebrow"), h("Saved replies save you an hour a week"), t("Most people miss it. Here's how to use it in three steps.", "lead")),
    sec("close", list(["Open any message and click Save as reply", "Give it a short name", "Type / in any message to use it"], true), btn("Try it now")),
  ])),

  // Events and webinars ----------------------------------------------------------------------------------------------
  tpl("workshop_invite", "Workshop invite", "Events and webinars", "A hands-on session with a date, price and sign-up.", email("Workshop", "A hands-on workshop on Saturday the 16th.", () => [
    sec("hero", t("Workshop", "eyebrow"), h("Beginner's wheel throwing"), t(`${HI} spend a morning at the wheel and go home with two bowls you made yourself. No experience needed.`, "lead")),
    sec("body", event("Beginner's wheel throwing", "Saturday, November 16, 10 AM to 1 PM", "The studio, 12 Mill Lane", "Save my spot")),
    sec("close", t("$85, clay and firing included. Eight spots.", "small")),
  ])),
  tpl("class_schedule", "Class schedule", "Events and webinars", "This week's or month's classes at a glance.", email("Schedule", "This week's classes.", () => [
    sec("hero", t("Schedule", "eyebrow"), h("This week's classes")),
    cols("body", [h("Monday", "card"), t("Gentle flow, 7 AM", "small")], [h("Wednesday", "card"), t("Strength, 6 PM", "small")], [h("Saturday", "card"), t("Open class, 9 AM", "small")]),
    sec("close", spacer(4), btn("Book a class")),
  ])),
  tpl("save_the_date", "Save the date", "Events and webinars", "An early heads-up before details are ready.", email("Save the date", "Save the date: our spring open day.", () => [
    sec("band", t("Save the date", "eyebrow", { center: true, band: true }), h("Spring open day", "title", { center: true, band: true }), t("Saturday, April 12, at our new space", "lead", { center: true, band: true })),
    sec("close", spacer(8), t("Details and tickets are coming soon. Put it in your calendar now so you don't miss it.", "body", { center: true }), btn("Add to calendar", { center: true, quiet: true })),
  ])),
  tpl("last_seats", "Last seats", "Events and webinars", "A short nudge when an event is almost full.", email("Last seats", "A few seats left for Thursday.", () => [
    sec("hero", h("A few seats left"), t(`${HI} Thursday's session is almost full. If you'd like to come, now's the time.`, "lead")),
    offer("Only four seats left", "Save yours now. It's free, and we'll send the link by email.", "Save my seat"),
  ])),
  tpl("event_tomorrow", "See you tomorrow", "Events and webinars", "What to bring and how to get there.", email("Tomorrow", "What to bring tomorrow.", () => [
    sec("hero", t("Tomorrow", "eyebrow"), h("See you tomorrow"), t("Everything you need, in one place.", "lead")),
    sec("body", list(["When: 10 AM, doors open at 9:45", "Where: 12 Mill Lane, second floor", "Bring: comfortable clothes and a water bottle", "Parking: free on the street after 9 AM"])),
    sec("close", t("Can't make it anymore? Reply and we'll give your spot to someone on the waitlist.", "small")),
  ])),
  tpl("replay_ready", "Replay is ready", "Events and webinars", "Send the recording to everyone who signed up.", email("Replay", "The recording is ready.", () => [
    sec("hero", h("The replay is ready"), t(`${HI} whether you joined live or not, here's the full recording and the slides.`, "lead")),
    sec("body", btn("Watch the replay")),
    sec("tight", btn("Get the slides", { quiet: true })),
    sec("close", t("Have a question we didn't get to? Book a short call.", "small"), meeting("Pick a time")),
  ])),
  tpl("conference_meet", "Meet us at the event", "Events and webinars", "Book time with your team at a conference.", email("Meet us", "Meet us at Small Business Expo.", () => [
    sec("hero", t("Small Business Expo", "eyebrow"), h("Let's meet at the Expo"), t("We'll be at booth 214 on May 6 and 7. Book 20 minutes and we'll save the time for you.", "lead")),
    sec("close", meeting("Book a time at the event")),
  ])),
  tpl("open_house", "Open house", "Events and webinars", "Invite people to visit, no sign-up needed.", email("Open house", "Come by on Saturday.", () => [
    sec("hero", t("Open house", "eyebrow"), h("Come and see us"), t("Drop in any time between 11 AM and 4 PM. Bring a friend, and there's cake.", "lead")),
    sec("close", event("Open house", "Saturday, November 23, 11 AM to 4 PM", "12 Mill Lane", "Get directions")),
  ])),
  tpl("course_starts", "Course starts soon", "Events and webinars", "Get people ready for the first session.", email("Course", "Your course starts Monday.", () => [
    sec("hero", h("Your course starts Monday"), t(`${HI} here's how the first week works.`, "lead")),
    sec("body", list(["Session one: Monday, 6 to 7:30 PM", "Where: room 3, or online with the link below", "Before you come: read the short intro we sent"])),
    sec("close", btn("See the full schedule", { quiet: true })),
  ])),
  tpl("event_survey", "How was it", "Events and webinars", "Ask attendees one or two quick questions.", email("Feedback", "How was Thursday's session?", () => [
    sec("hero", h("How was Thursday's session?"), t("Two quick questions help us make the next one better. It takes a minute.", "lead"), btn("Answer two questions")),
    sec("close", t("Thanks for coming.", "small")),
  ])),
  tpl("waitlist_spot", "A spot opened", "Events and webinars", "Offer a freed-up place to the waitlist.", email("Waitlist", "A spot opened up for you.", () => [
    sec("hero", h("A spot opened up"), t(`${HI} someone can't make it to Saturday's workshop, so the spot is yours if you want it. We'll hold it for 24 hours.`, "lead"), btn("Take the spot")),
    sec("close", t("Can't make it? No need to reply. We'll offer it to the next person.", "small")),
  ])),

  // Welcome and onboarding -------------------------------------------------------------------------------------------
  tpl("welcome_member", "Welcome, new member", "Welcome and onboarding", "Say hello and point to the first step.", email("Welcome", "Welcome. Here's where to start.", () => [
    sec("hero", t("Welcome", "eyebrow"), h("Welcome, {{first_name|friend}}"), t("We're glad you're here. Here's the one thing to do first: book your free intro session.", "lead"), btn("Book my intro session")),
    sec("close", t("Questions any time: just reply.", "small")),
  ])),
  tpl("welcome_client", "Welcome, new client", "Welcome and onboarding", "Set expectations for the first weeks.", email("Welcome", "What happens in your first weeks.", () => [
    sec("hero", h("Welcome aboard"), t(`${HI} here's what happens next, so nothing is a surprise.`, "lead")),
    sec("body", list(["This week: a kickoff call to agree on goals", "Next week: we share a first plan", "By the end of the month: your first results"], true)),
    sec("close", t("Your main contact is Sam. Book your kickoff below."), meeting("Book the kickoff"), spacer(8), sign("Sam Rivera", "Your account lead")),
  ])),
  tpl("welcome_patient", "Welcome, new patient", "Welcome and onboarding", "What to expect at a first visit.", email("Welcome", "What to expect at your first visit.", () => [
    sec("hero", h("Your first visit"), t(`${HI} we're looking forward to meeting you. Here's what to expect.`, "lead")),
    sec("body", list(["Arrive 10 minutes early", "Bring your ID, insurance card and a list of your medicines", "The visit takes about 45 minutes"])),
    sec("close", btn("Fill in your forms before you come"), t("Need to change the time? Reply or call us.", "small")),
  ])),
  tpl("getting_started", "Getting started guide", "Welcome and onboarding", "Three steps to get going.", email("Getting started", "Three steps to get going.", () => [
    sec("hero", t("Getting started", "eyebrow"), h("Three steps to get going")),
    sec("body", h("1. Add your details", "card"), t("So we can send reminders at the right time."), h("2. Pick your first session", "card"), t("Choose a time that suits your week."), h("3. Tell us your goal", "card"), t("One line is enough. We'll plan around it.")),
    sec("close", btn("Start with step one")),
  ])),
  tpl("meet_the_team", "Meet the team", "Welcome and onboarding", "Introduce the people new customers will talk to.", email("Our team", "The people you'll work with.", () => [
    sec("hero", h("The people you'll work with")),
    cols("body", [h("Sam Rivera", "card"), t("Account lead. Your first call for anything.", "small")], [h("Jordan Kim", "card"), t("Project lead. Keeps the work on time.", "small")]),
    sec("close", spacer(4), t("Say hi any time by replying to this email.")),
  ])),
  tpl("first_week_check", "First week check-in", "Welcome and onboarding", "Ask how the first week went.", email("Check-in", "How's your first week going?", () => [
    sec("hero", h("How's your first week going?", "section"), spacer(4), t([HI, "You've been with us a week. Is anything confusing, missing or slower than you hoped? Reply with one line and we'll help."])),
    sec("close", sign("Sam Rivera", "Your account lead")),
  ])),
  tpl("profile_complete", "Finish your setup", "Welcome and onboarding", "Nudge someone to finish the last steps.", email("Setup", "You're almost set up.", () => [
    sec("hero", h("You're almost set up"), t("Two more steps and everything works the way it should.", "lead")),
    sec("close", list(["Add a photo so your clients know who they're meeting", "Set your working hours"]), btn("Finish setup")),
  ])),
  tpl("resources_pack", "Starter resources", "Welcome and onboarding", "The guides people ask for first.", email("Resources", "The guides people ask for first.", () => [
    sec("hero", t("Resources", "eyebrow"), h("The guides people ask for first")),
    sec("tight", card("Your first month", "What to expect week by week, and how to get the most from it.", "Read it")),
    sec("close", card("Questions we hear most", "Short answers to the twelve things people ask first.", "Read it")),
  ])),
  tpl("welcome_subscriber", "Welcome, new subscriber", "Welcome and onboarding", "Thank someone for subscribing and set the cadence.", email("Welcome", "Thanks for subscribing.", () => [
    sec("hero", h("Thanks for subscribing"), t("You'll hear from us twice a month, with tips and news worth your time. Never more, and you can leave any time.", "lead")),
    sec("close", t("While you wait for the next one, here's our most-read piece."), btn("Read it", { quiet: true })),
  ])),

  // Nurture and win-back ---------------------------------------------------------------------------------------------
  tpl("still_thinking", "Still thinking it over", "Nurture and win-back", "A gentle check-in after someone showed interest.", email("Checking in", "Still thinking it over?", () => [
    sec("hero", h("Still thinking it over?", "section"), spacer(4), t([HI, "You asked about our services a little while ago. If you have questions, a 15-minute call usually answers them."])),
    sec("close", meeting("Pick a time"), spacer(8), sign("Sam Rivera", "Account lead")),
  ])),
  tpl("faq_nurture", "Common questions", "Nurture and win-back", "Answer the questions that hold people back.", email("Questions", "The questions people ask before they start.", () => [
    sec("hero", h("Questions people ask before they start")),
    sec("body", h("How long does it take?", "card"), t("Most people see a difference in the first two weeks."), h("Can I cancel?", "card"), t("Yes, any time, with no fee."), h("What if it's not right for me?", "card"), t("Tell us in the first month and we'll refund you in full.")),
    sec("close", btn("Ask us something else", { quiet: true })),
  ])),
  tpl("testimonial_nurture", "What clients say", "Nurture and win-back", "Let a customer's words do the selling.", email("Clients", "In our clients' words.", () => [
    sec("hero", t("In their words", "eyebrow"), h("What clients say")),
    sec("body", quote("They listened first, then fixed what actually mattered. Worth every penny.", "Marco, cafe owner")),
    sec("close", quote("I wish I'd called them a year earlier.", "Hannah, physio clinic"), btn("Book a call", { quiet: true })),
  ])),
  tpl("comparison", "How we compare", "Nurture and win-back", "Show the difference plainly, without knocking others.", email("Compare", "How we're different.", () => [
    sec("hero", h("How we're different"), t("A fair look at what you get with us, side by side.", "lead")),
    cols("body", [h("With us", "card"), list(["One person who knows your account", "A reply within a working day"])], [h("Elsewhere", "card"), list(["A new person each time", "A ticket number and a wait"])]),
    sec("close", btn("See it for yourself")),
  ])),
  tpl("free_consult", "Free consultation offer", "Nurture and win-back", "Offer a no-cost first conversation.", email("Consultation", "A free first conversation.", () => [
    sec("hero", h("A free first conversation"), t(`${HI} talk through your plans with one of our team for 30 minutes. No cost, no pressure.`, "lead")),
    offer("30 minutes, free", "Pick a time this week. Bring your questions.", "Book your free consultation", { meeting: true }),
  ])),
  tpl("miss_you", "We miss you", "Nurture and win-back", "A warm note to someone who hasn't been back.", email("It's been a while", "It's been a while.", () => [
    sec("hero", h("It's been a while"), t(`${HI} we haven't seen you since the summer. A lot has changed, and we'd love to see you again.`, "lead")),
    offer("20% off your next visit", "Book any time this month. The discount is taken off at checkout.", "Come back"),
    sec("close", spacer(8), t("Not interested anymore? You can unsubscribe below.", "small", { center: true })),
  ])),
  tpl("abandoned_form", "Finish your request", "Nurture and win-back", "Bring back someone who started a form and left.", email("Your request", "You were almost done.", () => [
    sec("hero", h("You were almost done"), t(`${HI} you started a quote request but didn't finish. It takes about a minute to wrap up, and we've kept your answers.`, "lead"), btn("Finish my request")),
  ])),
  tpl("renewal_reminder", "Renewal coming up", "Nurture and win-back", "Remind someone before their plan renews.", email("Renewal", "Your plan renews on December 1.", () => [
    sec("hero", h("Your plan renews soon", "section"), t(`${HI} your yearly plan renews on December 1 for $290. Nothing to do if you'd like to keep it.`)),
    sec("close", btn("Review my plan", { quiet: true }), t("Want to change it first? Reply and we'll help.", "small")),
  ])),
  tpl("referral_ask", "Refer a friend", "Nurture and win-back", "Ask happy customers to pass you on.", email("Refer a friend", "Know someone who'd like this?", () => [
    sec("hero", h("Know someone who'd like this?"), t(`${HI} most of our new clients come from people like you. If you know someone, we'd love an introduction.`, "lead")),
    offer("Give $25, get $25", "Your friend gets $25 off their first visit, and so do you.", "Send a referral"),
  ])),

  // Sales follow-up --------------------------------------------------------------------------------------------------
  tpl("quote_sent", "Your quote", "Sales follow-up", "Send a quote with the next step.", email("Quote", "Your quote for the kitchen refit.", () => [
    sec("hero", h("Your quote for the kitchen refit"), t(`${HI} thanks for the chance to quote. Here's the summary.`, "lead")),
    sec("body", card("Kitchen refit", "New cabinets, counters and lighting, about three weeks of work.", "See the full quote", "$14,800")),
    sec("close", t("Happy to talk it through."), meeting("Pick a time"), spacer(8), sign("Sam Rivera", "Project lead")),
  ])),
  tpl("quote_followup", "Quote follow-up", "Sales follow-up", "Check in a few days after sending a quote.", email("Following up", "Any questions about the quote?", () => [
    sec("hero", h("Any questions about the quote?", "section"), spacer(4), t([HI, "I sent the quote for your kitchen refit on Monday. Is there anything you'd like changed, or anything I can explain?"])),
    sec("close", sign("Sam Rivera", "Project lead")),
  ])),
  tpl("missed_call", "Sorry we missed you", "Sales follow-up", "Follow up after a missed call or no-show.", email("We missed you", "Sorry we missed you.", () => [
    sec("hero", h("Sorry we missed you"), t(`${HI} we had a call set for 2 PM but didn't connect. No problem. Pick another time that works better.`, "lead")),
    sec("close", meeting("Pick a new time")),
  ])),
  tpl("intro_email", "Introduction", "Sales follow-up", "A short first email to someone you were introduced to.", email("Hello", "A quick hello.", () => [
    sec("hero", h("A quick hello", "section"), spacer(4), t([HI, "Alex suggested we talk. I help small clinics fill their calendars without more ads. If that's on your mind, I'd be glad to share what's worked for others."])),
    sec("close", meeting("Pick a time"), spacer(8), sign("Sam Rivera", "Founder")),
  ])),
  tpl("next_steps", "Next steps", "Sales follow-up", "Recap a call and what happens next.", email("Next steps", "What we agreed, and what's next.", () => [
    sec("hero", h("What we agreed"), t(`${HI} thanks for the time today. Here's a recap.`, "lead")),
    sec("body", list(["Start with the booking form on your contact page", "Add reminders the day before each visit"]), h("Next steps", "card"), list(["You send your opening hours by Friday", "We share a first version by Wednesday"], true)),
    sec("close", sign("Sam Rivera", "Account lead")),
  ])),
  tpl("contract_ready", "Agreement ready", "Sales follow-up", "Let a client know the agreement is ready to sign.", email("Agreement", "Your agreement is ready.", () => [
    sec("hero", h("Your agreement is ready"), t(`${HI} everything we discussed is in it. It takes about five minutes to review and sign.`, "lead"), btn("Review and sign")),
    sec("close", t("Anything look off? Reply and we'll fix it before you sign.", "small")),
  ])),
  tpl("closing_the_loop", "Closing the loop", "Sales follow-up", "A polite last follow-up that leaves the door open.", email("Closing the loop", "Should I close your file?", () => [
    sec("hero", h("Should I close your file?", "section"), spacer(4), t([HI, "I haven't heard back, so I'll assume the timing isn't right. If that changes, just reply and we'll pick up where we left off."])),
    sec("close", sign("Sam Rivera", "Account lead")),
  ])),

  // Meetings and forms -----------------------------------------------------------------------------------------------
  tpl("meeting_rescheduled", "Meeting moved", "Meetings and forms", "Confirm a new time after a reschedule.", email("Meeting", "Your meeting has a new time.", () => [
    sec("hero", t("Updated", "eyebrow"), h("Your meeting has a new time")),
    sec("close", event("Intro call with our team", "Friday, November 15, 2:00 to 2:30 PM PT", "Video call", "Add to calendar")),
  ])),
  tpl("meeting_canceled", "Meeting canceled", "Meetings and forms", "Confirm a cancellation and offer a new time.", email("Meeting", "Your meeting was canceled.", () => [
    sec("hero", h("Your meeting was canceled"), t(`${HI} your call on Thursday won't go ahead. Whenever you're ready, pick a new time.`, "lead")),
    sec("close", meeting("Pick a new time")),
  ])),
  tpl("meeting_followup", "After the meeting", "Meetings and forms", "Thank them and share notes after a call.", email("After our call", "Thanks for your time today.", () => [
    sec("hero", h("Thanks for your time today"), t(`${HI} here are the notes and links we mentioned.`, "lead")),
    sec("body", list(["Our pricing page, with the plan we talked about", "The setup guide, about ten minutes to read", "A short video of the booking flow"])),
    sec("close", t("Want to keep going? Book the next call."), meeting("Book the next call")),
  ])),
  tpl("no_show_rebook", "Missed appointment", "Meetings and forms", "Kindly offer a new time after a no-show.", email("Appointment", "We missed you today.", () => [
    sec("hero", h("We missed you today"), t(`${HI} we were ready for you at 10 AM. Life happens. Here's a link to pick a new time.`, "lead")),
    sec("close", meeting("Pick a new time")),
  ])),
  tpl("booking_prep", "Before your appointment", "Meetings and forms", "Ask for anything you need before the visit.", email("Appointment", "Before your appointment.", () => [
    sec("hero", h("Before your appointment"), t("A few minutes now saves time when you arrive.", "lead")),
    sec("close", list(["Fill in the short health form", "Bring photos of anything you'd like us to look at"]), btn("Fill in the form")),
  ])),
  tpl("form_received_quote", "Request received", "Meetings and forms", "Confirm a quote or service request.", email("Request", "We got your request.", () => [
    sec("hero", t("Received", "eyebrow"), h("We got your request"), t("Here's what happens next and when you'll hear from us.", "lead")),
    sec("body", list(["Within a day: we review your request", "Then: we send a quote or call you to talk it through"], true)),
    sec("close", t("Want to talk sooner?"), meeting("Pick a time")),
  ])),
  tpl("application_received", "Application received", "Meetings and forms", "Thank an applicant and give a timeline.", email("Application", "Thanks for applying.", () => [
    sec("hero", h("Thanks for applying"), t(`${HI} we got your application for the spring program. We read every one.`, "lead")),
    sec("close", t("You'll hear from us by March 15, either way.", "body"), sign("Jordan Kim", "Program lead")),
  ])),
  tpl("order_confirmed", "Order confirmed", "Meetings and forms", "Confirm an order from a form.", email("Order", "Your order is confirmed.", () => [
    sec("hero", t("Confirmed", "eyebrow"), h("Your order is confirmed")),
    sec("body", card("Two ceramic mugs, sage", "Ready for pickup on Thursday after 11 AM.", "See your order", "$48.00")),
    sec("close", t("Questions about your order? Just reply.", "small")),
  ])),
  tpl("survey_invite", "Quick survey", "Meetings and forms", "Ask for a few minutes of feedback.", email("Survey", "Three minutes of your time?", () => [
    sec("hero", h("Three minutes of your time?"), t(`${HI} we're asking a few questions about our opening hours. Your answers decide what we do next.`, "lead"), btn("Start the survey")),
  ])),
  tpl("review_request", "Leave a review", "Meetings and forms", "Ask a happy customer for a public review.", email("Review", "Would you share a quick review?", () => [
    sec("hero", h("Would you share a quick review?"), t(`${HI} if you liked working with us, a short review helps others find us. It takes a minute.`, "lead"), btn("Leave a review")),
  ])),
  tpl("intake_reminder", "Forms still needed", "Meetings and forms", "Remind someone to finish intake forms.", email("Forms", "One thing before we meet.", () => [
    sec("hero", h("One thing before we meet"), t(`${HI} we still need your intake form before Thursday. It takes about five minutes.`, "lead"), btn("Finish the form")),
  ])),

  // Announcements ----------------------------------------------------------------------------------------------------
  tpl("new_location", "New location", "Announcements", "Announce a new place to find you.", email("News", "We've opened a new location.", () => [
    sec("hero", t("Now open", "eyebrow"), h("We've opened on Main Street"), t("Same team, same care, closer to you.", "lead")),
    sec("close", event("Main Street", "Open from Monday, December 2", "48 Main Street", "Get directions")),
  ])),
  tpl("new_hours", "New hours", "Announcements", "Tell people your opening hours changed.", email("Hours", "Our hours are changing.", () => [
    sec("hero", h("Our hours are changing"), t("From December 1, here's when you can find us.", "lead")),
    sec("close", list(["Monday to Friday: 8 AM to 7 PM", "Saturday: 9 AM to 3 PM", "Sunday: closed"])),
  ])),
  tpl("new_service", "New service", "Announcements", "Introduce something new you offer.", email("New", "Something new from us.", () => [
    sec("band", t("New", "eyebrow", { band: true }), h("Introducing home visits", "title", { band: true }), t("For anyone who can't easily come to us. Same care, at your door, on weekday mornings.", "lead", { band: true }), btn("Learn more", { band: true })),
    sec("close", spacer(8), t("Questions about it? Pick a time and we'll talk it through."), meeting("Book a time to ask about it")),
  ])),
  tpl("new_hire", "New team member", "Announcements", "Introduce someone who just joined.", email("Team", "Meet the newest member of our team.", () => [
    sec("hero", h("Meet Jordan"), t("Jordan joins us as our new project lead, after six years running projects for small shops.", "lead")),
    sec("close", quote("I love helping small teams get organized. I can't wait to meet you.", "Jordan Kim")),
  ])),
  tpl("milestone", "A milestone", "Announcements", "Mark an anniversary or a big number, with thanks.", email("Thank you", "A milestone, thanks to you.", () => [
    sec("band", h("Ten years today", "title", { center: true, band: true }), t("Ten years, three locations and more than 4,000 clients.", "lead", { center: true, band: true })),
    sec("close", spacer(8), t("None of it happens without you. Thank you.", "body", { center: true }), sign("Sam Rivera", "Founder")),
  ])),
  tpl("policy_update", "Policy update", "Announcements", "Explain a change to terms or policies plainly.", email("Update", "An update to our cancellation policy.", () => [
    sec("hero", h("An update to our cancellation policy", "section"), t(`${HI} from January 1, our cancellation policy changes. Here's what's different, in plain words.`)),
    sec("body", list(["You can cancel for free up to 24 hours before, instead of 48", "Late cancellations are charged half the price, not the full price"])),
    sec("close", btn("Read the full policy", { quiet: true })),
  ])),
  tpl("price_offer", "Limited-time offer", "Announcements", "One clear offer with an end date.", email("Offer", "15% off any package, until Sunday.", () => [
    sec("hero", t("Until Sunday", "eyebrow"), h("15% off any package"), t("For new and returning clients, on any package booked this week.", "lead")),
    offer("Ends Sunday at midnight", "Book now and the discount is taken off at checkout.", "Claim the offer"),
    sec("close", spacer(8), t("One offer per person. Can't be combined with other discounts.", "small", { center: true })),
  ])),
  tpl("moving_notice", "We're moving", "Announcements", "Tell people about a move and the dates.", email("Moving", "We're moving on December 2.", () => [
    sec("hero", h("We're moving"), t(`${HI} from December 2 you'll find us at 48 Main Street. Here's what to know.`, "lead")),
    sec("close", list(["Last day at the old place: November 29", "First day at the new place: December 2", "What changes: free parking right outside"])),
  ])),

  // Holidays and seasons ---------------------------------------------------------------------------------------------
  tpl("holiday_hours", "Holiday hours", "Holidays and seasons", "When you're open and closed over the holidays.", email("Holidays", "Our holiday hours.", () => [
    sec("hero", h("Our holiday hours"), t("Here's when we're open over the holidays.", "lead")),
    sec("close", list(["December 24: 9 AM to 1 PM", "December 25 and 26: closed", "January 2: back to normal hours"])),
  ])),
  tpl("year_in_review", "Year in review", "Holidays and seasons", "Look back at the year with thanks.", email("Year in review", "Our year, and thank you.", () => [
    sec("hero", t("This year", "eyebrow"), h("Our year, in short")),
    stats(["1,240", "Clients served"], ["38", "New faces on the team"], ["4.9", "Average rating"]),
    sec("close", spacer(8), t("Thank you for being part of it."), sign("Sam Rivera", "Founder")),
  ])),
  tpl("seasonal_greeting", "Season's greetings", "Holidays and seasons", "A short, warm note with nothing to sell.", email("Greetings", "Warm wishes from all of us.", () => [
    sec("band", h("Warm wishes", "title", { center: true, band: true }), t("From all of us, to you and yours", "lead", { center: true, band: true })),
    sec("close", spacer(8), t("Thank you for a wonderful year. We hope the holidays bring you rest and good company.", "body", { center: true })),
  ])),
  tpl("new_year", "New year", "Holidays and seasons", "A fresh-start note with one useful idea.", email("New year", "A good start to the year.", () => [
    sec("hero", h("A good start to the year"), t(`${HI} one thing that helps people start the year well: pick one small habit and book the time for it now.`, "lead")),
    sec("close", btn("Plan your year with us", { quiet: true })),
  ])),
  tpl("spring_reset", "Spring reset", "Holidays and seasons", "A seasonal offer or class for spring.", email("Spring", "A fresh start this spring.", () => [
    sec("hero", t("Spring", "eyebrow"), h("A fresh start this spring"), t("A four-week program to get back into a good routine, with two sessions a week.", "lead")),
    offer("Starts April 7", "Twelve spots, and early sign-ups get the first week free.", "See what's on"),
  ])),
  tpl("summer_schedule", "Summer schedule", "Holidays and seasons", "What changes over the summer.", email("Summer", "How summer works with us.", () => [
    sec("hero", h("How summer works with us")),
    sec("close", list(["Evening classes move to 7 PM", "Saturday sessions run outdoors when it's sunny", "We're closed August 12 to 18"]), btn("See the summer schedule", { quiet: true })),
  ])),
  tpl("back_to_school", "Back to routine", "Holidays and seasons", "Help people get back into a routine in the fall.", email("Fall", "Back to a routine.", () => [
    sec("hero", h("Back to a routine"), t("The fall is a good time to get back on track. Here's an easy way to start.", "lead")),
    offer("Your first session back is on us", "Book any time in September.", "Book your first session back"),
  ])),
  tpl("gift_cards", "Gift cards", "Holidays and seasons", "Offer gift cards for the season.", email("Gifts", "An easy gift this season.", () => [
    sec("hero", t("Gift cards", "eyebrow"), h("An easy gift this season"), t("Any amount from $25, good for any service, and they never expire.", "lead")),
    offer("Sent by email in seconds", "Pick an amount, add a note and choose when it arrives.", "Buy a gift card"),
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

// Each template is made with its own key, so its photo (photos.ts) comes along.
const withKey = (x: EmailTemplate): EmailTemplate => ({ ...x, make: () => (x.make as (photo?: string) => ReturnType<EmailTemplate["make"]>)(x.key) });
export const EMAIL_TEMPLATES: EmailTemplate[] = [...BASE_TEMPLATES.map((x) => ({ ...x, blurb: x.blurb ?? BASE_BLURBS[x.key] })), ...MORE].map(withKey);
export const emailTemplate = (key: string) => EMAIL_TEMPLATES.find((x) => x.key === key);
