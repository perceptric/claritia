// Wave 1: feedback, surveys, polls, testimonials and evaluations across industries.
import { agree, AGREE5, company, date, drop, email, file, files, fullName, HEARD, hidden, jobTitle, long, many, matrix, nps, one, rank, scale, stars, statement, text, time, tpl, url, website, when, yesno } from "./build.ts";

const RATE4 = ["Poor", "Fair", "Good", "Great"];
const WHERE = ["Fully in the office", "Mostly in the office", "Half and half", "Mostly remote", "Fully remote"];
const DISHES = ["Smoked brisket sandwich", "Roasted vegetable bowl", "Spicy chicken tacos", "Mushroom risotto", "Fish and chips"];
const SERVICE_TIMES = ["Saturday evening", "Sunday 8:00 am", "Sunday 10:00 am", "Sunday 12:00 pm", "Sunday evening", "Midweek evening"];

export const WAVE1_FEEDBACK = [
  // SaaS
  tpl("saas.in-app-nps", "saas", "In-app NPS", ["survey", "feedback"], "Ask active users the loyalty question inside your product.", {
    cats: "nps product-feedback survey",
    teams: "success product",
    added: "2026-11-03",
    mode: "screens",
    fields: [
      hidden("User ID", { key: "user_id" }),
      hidden("Plan", { key: "plan" }),
      nps("How likely are you to recommend us to a colleague?", { required: true, minLabel: "Not likely", maxLabel: "Very likely", key: "score", save: "nps" }),
      long("What do you like most?", { show: when("score", "gte", 9) }),
      long("What is one thing we could do better?", { show: when("score", "lte", 8) }),
      one("What should we focus on next?", ["Speed", "Ease of use", "More integrations", "Better reports", "Support", "Pricing"]),
      yesno("Can we contact you about your answer?"),
    ],
    submit: "Send",
    end: ["Thanks for the feedback", "It goes straight to our product team."],
  }),
  tpl("saas.feature-vote", "saas", "Feature vote", ["survey", "feedback"], "Let customers rank what you build next.", {
    cats: "poll feature-request",
    teams: "product",
    added: "2026-11-03",
    intro: "Help us pick what to build next. Takes a minute.",
    fields: [
      rank("Rank these features from most to least useful", ["Mobile app", "Custom dashboards", "Two-way calendar sync", "Bulk edit", "Audit log"], { required: true }),
      many("Which of these would you pay more for?", ["Mobile app", "Custom dashboards", "Two-way calendar sync", "Bulk edit", "Audit log", "None of them"]),
      long("What is missing from this list?"),
      one("How often do you use the product?", ["Every day", "A few times a week", "Weekly", "Less often"]),
      yesno("Want to test these features early?"),
      email("Email", { show: when("Want to test these features early?", "is", true) }),
    ],
    submit: "Send my vote",
    end: ["Your vote is in", "We share the results with everyone who voted."],
  }),
  tpl("saas.beta-feedback", "saas", "Beta feedback", ["feedback", "survey"], "Hear how a beta feature works before it ships to everyone.", {
    cats: "product-feedback bug-report feature-request",
    teams: "product support",
    added: "2026-11-03",
    fields: [
      email("Email"),
      text("Which feature are you testing?", { required: true }),
      scale("How easy was it to use?", "Very hard", "Very easy", { required: true }),
      scale("How useful is it for your work?", "Not useful", "Very useful", { required: true }),
      yesno("Did anything break or act strangely?", { required: true }),
      long("What happened?", { required: true, show: when("Did anything break or act strangely?", "is", true) }),
      file("Screenshot or recording", { show: when("Did anything break or act strangely?", "is", true) }),
      long("What would you add before launch?"),
      one("Would you keep using it after the beta?", ["Yes", "Maybe", "No"]),
    ],
    end: ["Thanks for testing", "Your notes go to the team building this feature."],
  }),

  // Ecommerce
  tpl("ecommerce.post-purchase", "ecommerce", "Post-purchase survey", ["survey", "feedback"], "Rate the order and delivery, and learn how buyers found you.", {
    cats: "csat nps market-research",
    teams: "marketing success",
    added: "2026-11-03",
    fields: [
      text("Order number", { half: true }),
      stars("How happy are you with your order?", { required: true }),
      matrix("Rate each part", ["Finding what you wanted", "Checkout", "Delivery time", "Packaging", "Product quality"], RATE4),
      nps("How likely are you to recommend our store to a friend?", { minLabel: "Not likely", maxLabel: "Very likely", save: "nps" }),
      one("How did you first hear about us?", HEARD, { save: "heard_from" }),
      one("Why did you choose us today?", ["Price", "Product range", "Fast delivery", "Reviews", "A brand I trust", "Other"]),
      long("Anything we could do better?"),
      email("Email", { required: false }),
    ],
    end: ["Thank you", "Your answers help us make the next order better."],
  }),
  tpl("ecommerce.subscription-cancel", "ecommerce", "Subscription cancellation survey", ["survey", "feedback"], "Learn why subscribers cancel and offer a pause instead.", {
    cats: "exit feedback",
    teams: "success marketing",
    added: "2026-11-03",
    fields: [
      email("Email"),
      one(
        "Main reason for canceling",
        ["Too expensive", "Too much product piling up", "Didn't like the products", "Delivery problems", "Switching to another brand", "Only needed it for a while", "Other"],
        { required: true, key: "reason", save: "cancel_reason" },
      ),
      one("Would one of these help you stay?", ["Skip the next delivery", "Ship less often", "Swap to different products", "A lower price", "No, please cancel"], {
        show: when("reason", "any", ["Too expensive", "Too much product piling up", "Didn't like the products"]),
      }),
      text("Which brand are you switching to?", { show: when("reason", "is", "Switching to another brand") }),
      long("What went wrong with delivery?", { show: when("reason", "is", "Delivery problems") }),
      stars("How would you rate the products overall?"),
      yesno("Would you come back in the future?"),
      long("Anything else we should know?"),
    ],
    submit: "Continue",
    end: ["Your answers are in", "We'll confirm any change to your subscription by email."],
  }),
  tpl("ecommerce.product-suggestion", "ecommerce", "Product suggestion", ["feedback", "survey"], "Ask shoppers what you should stock or make next.", {
    cats: "feature-request market-research",
    teams: "product marketing",
    added: "2026-11-03",
    fields: [
      text("What product would you like us to carry?", { required: true }),
      drop("Category", ["Clothing", "Home", "Beauty", "Food and drink", "Electronics", "Gifts", "Other"]),
      long("What would you use it for?"),
      one("What would you pay for it?", ["Under $25", "$25–$50", "$50–$100", "Over $100"]),
      one("How often would you buy it?", ["Once", "A few times a year", "Monthly", "Weekly"]),
      url("Link to an example"),
      yesno("Should we email you if we add it?"),
      email("Email", { show: when("Should we email you if we add it?", "is", true) }),
    ],
    end: ["Thanks for the idea", "We review every suggestion when we plan new products."],
  }),

  // Hospitality
  tpl("hospitality.mid-stay-check", "hospitality", "Mid-stay check-in", ["feedback", "survey"], "Catch problems during the stay, before they turn into a review.", {
    cats: "csat feedback",
    teams: "operations support",
    subs: "hotels",
    added: "2026-11-03",
    intro: "Tell us how your stay is going so we can fix anything right away.",
    fields: [
      text("Room number", { required: true, half: true }),
      text("Last name", { half: true }),
      scale("How is your stay so far?", "Not good", "Great", { required: true, key: "stay" }),
      many("Is anything not right?", ["Room temperature", "Noise", "Cleaning", "Wi-Fi", "Towels or supplies", "Something else", "All good"]),
      long("Tell us what we can fix", { show: when("stay", "lte", 3) }),
      yesno("Would you like the front desk to call your room?"),
      time("Best time to call", { show: when("Would you like the front desk to call your room?", "is", true) }),
    ],
    end: ["Thank you", "If you asked for a call, the front desk will reach you soon."],
  }),
  tpl("hospitality.tour-review", "hospitality", "Tour review", ["feedback"], "Collect reviews and photos from guests after each tour.", {
    cats: "testimonial feedback",
    teams: "marketing",
    subs: "tours",
    added: "2026-11-03",
    pages: [
      {
        title: "Your tour",
        fields: [
          text("Which tour did you take?", { required: true, half: true }),
          date("Tour date", { half: true }),
          stars("Overall rating", { required: true }),
          stars("How was your guide?"),
          text("Guide's name"),
          long("Your review", { required: true, placeholder: "What made the day for you?" }),
          files("Photos from the tour"),
        ],
      },
      {
        title: "Your details",
        fields: [
          fullName("Name to show with your review"),
          email("Email"),
          agree("You may share my review and photos on your website and social media."),
        ],
      },
    ],
    submit: "Send my review",
    end: ["Thanks for the review", "We'll let you know if we share it."],
  }),

  // Healthcare
  tpl("healthcare.video-visit-survey", "healthcare", "Video visit survey", ["survey", "feedback"], "Rate the tech, the wait and the time with the provider.", {
    cats: "csat survey",
    teams: "care operations",
    subs: "clinics",
    added: "2026-11-03",
    fields: [
      one("How did you join the visit?", ["Phone", "Computer", "Tablet"], { required: true }),
      scale("How easy was it to join?", "Very hard", "Very easy", { required: true }),
      matrix("How much do you agree?", ["The video and sound worked well", "I didn't wait long to be seen", "My provider listened to me", "I know what to do next"], AGREE5),
      stars("Overall, how was your visit?", { required: true }),
      yesno("Would you choose a video visit again?"),
      long("What would make video visits better?"),
    ],
    end: ["Thank you", "Your answers help us improve visits for everyone."],
  }),

  // Education
  tpl("education.teacher-evaluation", "education", "Teacher evaluation", ["survey", "feedback"], "Anonymous end-of-term feedback from students on each class.", {
    cats: "evaluation survey",
    teams: "teachers",
    subs: "schools",
    added: "2026-11-03",
    intro: "Your answers are anonymous and help your teacher improve the class.",
    fields: [
      text("Class", { required: true, half: true }),
      text("Teacher", { required: true, half: true }),
      matrix("How much do you agree?", ["The teacher explained things clearly", "I got feedback on my work in time", "I felt free to ask questions", "Grading was fair", "Class time was well used"], AGREE5, { required: true }),
      scale("How much did you learn in this class?", "Very little", "A lot", { required: true }),
      one("The pace of the class was", ["Too slow", "About right", "Too fast"]),
      long("What did the teacher do well?"),
      long("What would make this class better?"),
    ],
    end: ["Thank you", "Your teacher sees combined results, never names."],
  }),
  tpl("education.parent-survey", "education", "Parent satisfaction survey", ["survey", "feedback"], "Hear from families on teaching, safety and school updates.", {
    cats: "questionnaire survey csat",
    teams: "teachers operations",
    subs: "schools childcare",
    added: "2026-11-03",
    fields: [
      drop("Your child's grade", ["Pre-K", "Kindergarten", "Grades 1–5", "Grades 6–8", "Grades 9–12"]),
      matrix("How satisfied are you with", ["Teaching", "Updates from the school", "Safety", "Homework load", "Clubs and activities"], ["Not satisfied", "Somewhat satisfied", "Satisfied", "Very satisfied"], { required: true }),
      one("How do you like to hear from us?", ["Email", "Text message", "School app", "Notes sent home"]),
      rank("What should we improve first?", ["Updates to families", "Buildings and grounds", "After-school programs", "School meals", "Safety"]),
      yesno("Do you feel welcome at the school?"),
      long("Anything else you'd like the school to know?"),
    ],
    end: ["Thank you", "We share what we learn and what we'll change at the next family meeting."],
  }),
  tpl("education.graduate-story", "education", "Graduate success story", ["feedback"], "Gather results and quotes from course graduates for your site.", {
    cats: "testimonial",
    teams: "marketing teachers",
    subs: "online-courses",
    added: "2026-11-03",
    pages: [
      {
        title: "About you",
        fields: [
          fullName(),
          email("Email"),
        ],
      },
      {
        title: "Your story",
        fields: [
          text("Course you took", { required: true, half: true }),
          date("When did you finish?", { half: true }),
          long("Where were you before the course?", { required: true }),
          long("What changed after it?", { required: true, placeholder: "A new job, a raise, a skill you use every day" }),
        ],
      },
      {
        title: "Sharing",
        fields: [
          scale("How much did the course help?", "A little", "A lot"),
          url("LinkedIn profile"),
          file("Photo of you"),
          agree("You may use my story, name and photo in your marketing."),
        ],
      },
    ],
    submit: "Share my story",
    end: ["Thank you for sharing", "We'll send you the final version before it goes live."],
  }),

  // HR
  tpl("hr.pulse-survey", "hr", "Weekly pulse survey", ["survey"], "A short weekly check on workload, support and mood.", {
    cats: "engagement survey",
    teams: "hr",
    internal: true,
    added: "2026-11-03",
    mode: "screens",
    fields: [
      scale("How was your week?", "Rough", "Great", { required: true }),
      one("Your workload this week", ["Too light", "About right", "Too heavy"], { required: true }),
      yesno("Did you get the help you needed?", { required: true }),
      long("What got in the way?", { show: when("Did you get the help you needed?", "is", false) }),
      scale("How connected do you feel to your team?", "Not connected", "Very connected"),
      long("Anything you'd like leadership to know?"),
    ],
    end: ["Thanks", "Answers are anonymous and shared as team totals."],
  }),
  tpl("hr.enps", "hr", "Employee NPS", ["survey"], "The anonymous eNPS question, with the reasons behind each score.", {
    cats: "nps engagement",
    teams: "hr",
    internal: true,
    added: "2026-11-03",
    fields: [
      nps("How likely are you to recommend working here to a friend?", { required: true, minLabel: "Not likely", maxLabel: "Very likely", key: "enps" }),
      long("What's the main reason for your score?"),
      long("What one change would raise your score?", { show: when("enps", "lte", 8) }),
      many("What do you value most here?", ["The people", "The work", "Pay and benefits", "Flexibility", "Growth", "Our mission"]),
      drop("Your team", ["Sales", "Marketing", "Product", "Engineering", "Operations", "Customer support", "Finance", "Other"]),
      one("How long have you worked here?", ["Less than 1 year", "1–2 years", "3–5 years", "Over 5 years"]),
    ],
    end: ["Thank you", "Your answer is anonymous."],
  }),
  tpl("hr.manager-feedback", "hr", "Upward feedback for managers", ["survey", "feedback"], "Team members rate their manager, with no names attached.", {
    cats: "evaluation engagement",
    teams: "hr",
    internal: true,
    added: "2026-11-03",
    fields: [
      text("Manager's name", { required: true }),
      matrix("My manager", ["Sets clear goals", "Gives useful feedback", "Recognizes good work", "Supports my growth", "Is there when I need help"], AGREE5, { required: true }),
      stars("Overall, how would you rate your manager?", { required: true }),
      one("How often do you have one-on-ones?", ["Every week", "Every two weeks", "Monthly", "Rarely", "Never"]),
      long("What should they keep doing?"),
      long("What should they start or stop doing?"),
    ],
    end: ["Thanks", "Your feedback is combined with your team's before your manager sees it."],
  }),

  // Government
  tpl("government.budget-priorities", "government", "Community budget vote", ["survey"], "Let residents rank where public money should go next year.", {
    cats: "poll survey",
    teams: "operations",
    added: "2026-11-03",
    intro: "Help decide how next year's budget is spent. Takes three minutes.",
    fields: [
      rank("Rank these areas from most to least important", ["Roads and sidewalks", "Parks and recreation", "Public safety", "Libraries", "Housing help", "Transit"], { required: true }),
      many("Which projects should we fund first?", ["Repave main streets", "New playground", "More street lighting", "Longer library hours", "Bike lanes", "Senior center upgrades"], { required: true }),
      one("Should the city raise fees to fund more projects?", ["Yes", "No", "Not sure"]),
      long("Another project we should consider"),
      text("ZIP code", { half: true }),
      one("How long have you lived here?", ["Less than 2 years", "2–10 years", "Over 10 years"]),
      yesno("Do you want updates on the results?"),
      email("Email", { show: when("Do you want updates on the results?", "is", true) }),
    ],
    submit: "Cast my vote",
    end: ["Your vote is in", "Results go to the council before the budget vote."],
  }),

  // Media
  tpl("media.reader-survey", "media", "Reader survey", ["survey", "feedback"], "Learn who reads you, what they want more of and what they pay for.", {
    cats: "market-research questionnaire",
    teams: "marketing",
    added: "2026-11-03",
    pages: [
      {
        title: "Your reading",
        fields: [
          one("How often do you read us?", ["Every day", "A few times a week", "Weekly", "Less often"], { required: true }),
          many("How do you usually read us?", ["Website", "App", "Newsletter", "Print", "Social media", "Podcast"]),
          many("Which topics do you want more of?", ["Local news", "Business", "Politics", "Culture", "Sports", "Food", "Opinion"]),
          scale("How much do you trust our reporting?", "Not at all", "Completely"),
          nps("How likely are you to recommend us to a friend?", { minLabel: "Not likely", maxLabel: "Very likely" }),
        ],
      },
      {
        title: "About you",
        fields: [
          one("Do you pay for news today?", ["Yes, for us", "Yes, for another outlet", "No"], { key: "pays" }),
          one("What would make you subscribe?", ["Lower price", "Fewer ads", "More local stories", "A better app", "Nothing would"], { show: when("pays", "not", "Yes, for us") }),
          one("Age", ["Under 25", "25–34", "35–44", "45–54", "55–64", "65 or over"]),
          long("What should we cover that we don't?"),
          email("Email", { required: false }),
        ],
      },
    ],
    end: ["Thank you", "Your answers shape what we cover next."],
  }),

  // Retail
  tpl("retail.shopper-survey", "retail", "In-store shopper survey", ["survey", "feedback"], "Ask shoppers why they came in and how the visit went.", {
    cats: "csat market-research",
    teams: "marketing operations",
    added: "2026-11-03",
    fields: [
      one("What brought you in today?", ["Something specific", "Just browsing", "A sale or offer", "Picking up an online order", "A gift"], { required: true }),
      yesno("Did you find what you were looking for?", { required: true }),
      text("What were you looking for?", { show: when("Did you find what you were looking for?", "is", false) }),
      matrix("Rate your visit", ["Staff help", "Store layout", "Prices", "Checkout wait", "Cleanliness"], RATE4),
      stars("Overall visit", { required: true }),
      one("Where else do you shop for this?", ["Another local store", "A big-box store", "Online marketplaces", "Nowhere else"]),
      one("How often do you visit us?", ["First time", "Monthly", "Weekly", "More than weekly"]),
      email("Email", { required: false }),
    ],
    end: ["Thank you", "See you next time."],
  }),

  // Food
  tpl("food.menu-vote", "food", "New menu vote", ["survey", "feedback"], "Let guests vote on dishes before they join the menu.", {
    cats: "poll market-research",
    teams: "marketing operations",
    subs: "restaurants",
    added: "2026-11-03",
    fields: [
      rank("Rank the new dishes from your favorite down", DISHES, { required: true }),
      stars("How would you rate our current menu?"),
      one("What would you pay for a main dish?", ["Under $15", "$15–$20", "$20–$25", "Over $25"]),
      many("Dietary needs we should plan for", ["Vegetarian", "Vegan", "Gluten free", "Dairy free", "Nut free", "None"]),
      one("When do you usually visit?", ["Lunch", "Dinner", "Weekend brunch", "Takeout"]),
      text("A dish you'd love to see"),
    ],
    submit: "Send my vote",
    end: ["Thanks for voting", "The winning dishes join the menu next season."],
  }),

  // Sports
  tpl("sports.season-survey", "sports", "End-of-season survey", ["survey", "feedback"], "Players and parents rate coaches, fields and the season.", {
    cats: "nps csat evaluation",
    teams: "operations volunteers",
    added: "2026-11-03",
    fields: [
      one("You are a", ["Player", "Parent of a player", "Coach or volunteer"], { required: true }),
      drop("Team or age group", ["Under 8", "Under 10", "Under 12", "Under 14", "Under 16", "Adult"]),
      nps("How likely are you to recommend the club to a friend?", { required: true, minLabel: "Not likely", maxLabel: "Very likely", save: "nps" }),
      matrix("Rate this season", ["Coaching", "Training schedule", "Fields and equipment", "Updates from the club", "Value for the fees"], RATE4),
      stars("How would you rate your coach?"),
      one("Will you sign up next season?", ["Yes", "Maybe", "No"], { key: "next_season", save: "next_season" }),
      long("What would bring you back?", { show: when("next_season", "not", "Yes") }),
      long("What should the club change?"),
      email("Email", { required: false }),
    ],
    end: ["Thanks for a great season", "We'll share sign-up dates for next season soon."],
  }),

  // Faith
  tpl("faith.service-time-poll", "faith", "Service time poll", ["survey"], "Ask your community which service times and formats work best.", {
    cats: "poll questionnaire",
    teams: "operations volunteers",
    added: "2026-11-03",
    fields: [
      rank("Rank these service times from best to worst for you", SERVICE_TIMES, { required: true }),
      one("How do you usually join?", ["In person", "Online stream", "Both"], { required: true }),
      one("Who usually comes with you?", ["Just me", "Spouse or partner", "Family with children", "Friends"]),
      yesno("Would you use childcare during services?"),
      yesno("Would you come to a midweek gathering?"),
      long("Anything else we should consider?"),
    ],
    end: ["Thank you", "We'll share the new schedule once the results are in."],
  }),

  // Nonprofit
  tpl("nonprofit.lapsed-donor", "nonprofit", "Lapsed donor survey", ["survey", "feedback"], "Ask past donors why they stopped giving and what would help.", {
    cats: "exit survey",
    teams: "marketing",
    added: "2026-11-03",
    fields: [
      email("Email"),
      one(
        "Main reason you stopped giving",
        ["Money is tight right now", "I give to other causes now", "I wasn't sure how my gift was used", "Too many requests for money", "I forgot", "Other"],
        { required: true, save: "lapse_reason" },
      ),
      scale("How well did we show the impact of your gift?", "Not well", "Very well"),
      many("What would help you give again?", ["Updates on results", "Fewer requests", "A smaller monthly option", "Matching gifts", "Volunteering first"]),
      one("How would you like to hear from us?", ["Email", "Mail", "Phone", "Please don't contact me"], { save: "contact_pref" }),
      long("Anything else you'd like us to know?"),
    ],
    end: ["Thank you", "We're grateful for every gift you've made."],
  }),

  // IT
  tpl("it.app-issue", "it", "Internal app feedback", ["request", "feedback"], "Staff report problems or ideas for the tools they use at work.", {
    cats: "bug-report feature-request it-request",
    teams: "it support",
    internal: true,
    added: "2026-11-03",
    fields: [
      fullName("Your name"),
      drop("Which app?", ["Email and calendar", "Chat", "CRM", "HR system", "Finance system", "Intranet", "Other"], { required: true }),
      one("Is this a problem or an idea?", ["Something is broken", "An idea or request"], { required: true, key: "type" }),
      long("What happened?", { required: true, show: when("type", "is", "Something is broken") }),
      one("How much does it affect your work?", ["A little", "It slows me down", "I can't work"], { show: when("type", "is", "Something is broken") }),
      file("Screenshot", { show: when("type", "is", "Something is broken") }),
      long("What would you like it to do?", { required: true, show: when("type", "is", "An idea or request") }),
      long("How would it help your team?", { show: when("type", "is", "An idea or request") }),
    ],
    end: ["Thanks, it's logged", "IT reviews new reports every working day."],
  }),

  // General
  tpl("general.concept-test", "general", "Concept test", ["survey", "feedback"], "Test a new product idea with real buyers before you build it.", {
    cats: "market-research product-feedback",
    teams: "product marketing founders",
    added: "2026-11-03",
    fields: [
      statement("Describe your product idea here in two or three sentences."),
      scale("How appealing is this idea?", "Not appealing", "Very appealing", { required: true }),
      one("How likely would you be to buy it?", ["Definitely would", "Probably would", "Not sure", "Probably not", "Definitely not"], { required: true, save: "purchase_intent" }),
      long("What do you like most about it?"),
      long("What would stop you from buying it?"),
      one("What would you expect to pay?", ["Under $10", "$10–$25", "$25–$50", "$50–$100", "Over $100"]),
      text("What do you use today instead?"),
      yesno("Can we contact you when it launches?"),
      email("Email", { show: when("Can we contact you when it launches?", "is", true) }),
    ],
    end: ["Thanks for your thoughts", "Your answers help us decide what to build."],
  }),
  tpl("general.website-feedback", "general", "Website feedback", ["feedback", "request"], "Let visitors flag broken links, typos and pages that don't work.", {
    cats: "bug-report product-feedback feedback",
    teams: "marketing product",
    added: "2026-11-03",
    fields: [
      url("Which page?"),
      one("What kind of feedback?", ["Broken link or button", "Typo or wrong information", "Page is slow", "Hard to find something", "Idea or suggestion", "Something else"], { required: true }),
      long("Tell us more", { required: true }),
      drop("Device", ["Computer", "Phone", "Tablet"]),
      file("Screenshot"),
      scale("How easy is our site to use?", "Very hard", "Very easy"),
      email("Email", { required: false }),
    ],
    end: ["Thanks for telling us", "We check every report and fix what we can."],
  }),
  tpl("general.hybrid-work-survey", "general", "Hybrid work survey", ["survey"], "Ask staff where they work best and what the office needs.", {
    cats: "engagement questionnaire",
    teams: "hr operations",
    internal: true,
    added: "2026-11-03",
    fields: [
      one("Where do you work most weeks?", WHERE, { required: true }),
      one("Where would you prefer to work?", WHERE, { required: true }),
      many("Which days work best in the office?", ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]),
      matrix("How much do you agree?", ["I can focus at home", "I can focus in the office", "Meetings work well with remote people", "I have the tools I need at home"], AGREE5),
      rank("What would make the office better?", ["Quiet space", "Better meeting rooms", "Food and coffee", "Parking or transit help", "More team days"]),
      long("Anything else about how we work?"),
    ],
    end: ["Thank you", "We'll share the results and any changes with everyone."],
  }),
  tpl("general.case-study", "general", "Case study questionnaire", ["feedback"], "Collect results, quotes and approval for a customer story.", {
    cats: "testimonial questionnaire",
    teams: "marketing success",
    added: "2026-11-03",
    pages: [
      { title: "About you", fields: [fullName(), email(), company(undefined, { required: true, half: true }), jobTitle(undefined, { half: true }), website()] },
      {
        title: "Your story",
        fields: [
          long("What problem were you trying to solve?", { required: true }),
          text("What did you use before us?"),
          long("What results have you seen?", { required: true, placeholder: "Time saved, revenue, fewer errors" }),
          long("A quote we can use"),
          one("Can we use your company logo?", ["Yes", "No", "Ask me first"]),
          agree("I approve this story for use once I've reviewed the draft."),
        ],
      },
    ],
    submit: "Send my story",
    end: ["Thank you", "We'll send a draft for your review within two weeks."],
  }),
  tpl("general.trial-exit", "general", "Trial exit survey", ["survey", "feedback"], "Learn why trial users didn't buy and what they chose instead.", {
    cats: "exit market-research",
    teams: "sales product",
    added: "2026-11-03",
    fields: [
      email("Email"),
      one(
        "Why didn't you continue?",
        ["Price", "Missing a feature I need", "Too hard to set up", "Didn't have time to try it", "Chose another product", "Not the right time", "Other"],
        { required: true, key: "reason", save: "trial_exit_reason" },
      ),
      text("Which product did you choose?", { show: when("reason", "is", "Chose another product") }),
      text("Which feature was missing?", { show: when("reason", "is", "Missing a feature I need") }),
      yesno("Would a longer trial help?", { show: when("reason", "is", "Didn't have time to try it") }),
      scale("How close did it come to what you needed?", "Not close", "Very close"),
      yesno("Can we follow up in a few months?"),
    ],
    end: ["Thanks for trying us", "We'll use your answers to make the product better."],
  }),
];
