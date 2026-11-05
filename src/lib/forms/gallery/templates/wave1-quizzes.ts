// Wave 1: quizzes and assessments. Every one scores: points on the choices, three bands in end.score.
import { company, DAYPART, drop, email, fullName, jobTitle, one, phone, TEAM_SIZE, text, TIMELINE, tpl, website, when, yesno } from "./build.ts";

const ADDED = "2026-11-03";

export const WAVE1_QUIZZES = [
  // Personality

  tpl("coaching.leadership-style-quiz", "coaching", "Leadership style quiz", ["quiz", "lead"], "Show leaders their style and open a coaching conversation.", {
    cats: "personality quiz",
    teams: "marketing founders",
    added: ADDED,
    mode: "screens",
    intro: "Five quick questions about how you lead. There are no wrong answers.",
    fields: [
      one("A project is behind schedule. What do you do first?", ["Set new deadlines and check in daily", "Ask the team what's in the way and plan together", "Check how people are coping"], { required: true, points: [0, 1, 2] }),
      one("How do you make most decisions?", ["I decide, then explain", "I ask for input, then decide", "I look for a choice everyone agrees on"], { required: true, points: [0, 1, 2] }),
      one("A team member makes a mistake. What do you do?", ["Fix it fast and move on", "Talk through what happened and what to try next", "Make sure they feel supported"], { required: true, points: [0, 1, 2] }),
      one("How would your team describe you?", ["Clear and driven", "Fair and encouraging", "Warm and easy to talk to"], { required: true, points: [0, 1, 2] }),
      one("What drains you most at work?", ["Slow progress", "Unclear goals", "Conflict on the team"], { required: true, points: [0, 1, 2] }),
      one("What would you most like to get better at?", ["Delegating", "Giving feedback", "Handling conflict", "Leading through change", "Managing my time"], { save: "coaching_goal" }),
      one("How many people report to you?", ["None yet", "1–5", "6–20", "More than 20"], { save: "direct_reports" }),
      fullName(),
      email("Email for your results"),
    ],
    submit: "See my style",
    end: {
      title: "Your leadership style",
      text: "",
      score: [
        { min: 7, title: "The supporter", text: "People trust you and feel safe with you. Coaching can help you set firm goals and keep that warmth." },
        { min: 4, title: "The coach", text: "You balance results and people well. Coaching can help you stretch your team further." },
        { min: 0, title: "The driver", text: "You get results and keep things moving. Coaching can help you bring people along with you." },
      ],
      booking: true,
    },
  }),

  tpl("fitness.workout-style-quiz", "fitness", "Workout style quiz", ["quiz", "lead"], "Match new members to classes they enjoy and keep coming back to.", {
    cats: "personality quiz class",
    teams: "marketing sales",
    subs: "gyms studios",
    added: ADDED,
    mode: "screens",
    intro: "Answer five questions and we'll match you with the classes that suit you.",
    fields: [
      one("How do you want to feel after a workout?", ["Calm and stretched", "Strong and steady", "Worn out in a good way"], { required: true, points: [0, 1, 2] }),
      one("Pick your workout music", ["Quiet and soothing", "Upbeat", "Loud and fast"], { required: true, points: [0, 1, 2] }),
      one("How do you like to be coached?", ["Gently, at my own pace", "A mix of guidance and push", "Pushed hard"], { required: true, points: [0, 1, 2] }),
      one("What kind of group do you like?", ["Small and quiet", "Either is fine", "Big and high energy"], { required: true, points: [0, 1, 2] }),
      one("How active are you now?", ["Getting started", "Active a few days a week", "Training most days"], { required: true, points: [0, 1, 2] }),
      one("Best time to work out", DAYPART, { save: "preferred_time" }),
      fullName(),
      email("Email"),
      phone(),
    ],
    submit: "Find my classes",
    end: {
      title: "Your workout style",
      text: "",
      score: [
        { min: 7, title: "High intensity", text: "HIIT, boxing and bootcamp classes will give you the push you want." },
        { min: 4, title: "Strength and cardio mix", text: "Strength, cycling and circuit classes keep you moving at a steady pace." },
        { min: 0, title: "Mind and body", text: "Yoga, Pilates and stretch classes build strength without the rush." },
      ],
      booking: true,
    },
  }),

  tpl("hr.culture-fit-quiz", "hr", "Culture fit quiz", ["quiz", "application"], "Show candidates how their work style fits your team before they apply.", {
    cats: "personality quiz",
    teams: "recruiting hr",
    added: ADDED,
    mode: "screens",
    intro: "Six questions about how you like to work. There are no wrong answers.",
    fields: [
      one("How do you like to get work done?", ["Mostly on my own", "A mix of solo and team work", "With the team, side by side"], { required: true, points: [0, 1, 2] }),
      one("How do you feel about plans that change often?", ["I prefer a steady plan", "I can adjust", "I enjoy it"], { required: true, points: [0, 1, 2] }),
      one("How do you like to get feedback?", ["At yearly reviews", "Every few weeks", "Right away, in the moment"], { required: true, points: [0, 1, 2] }),
      one("You spot a problem outside your role. What do you do?", ["Leave it to the owner", "Tell the owner", "Help fix it"], { required: true, points: [0, 1, 2] }),
      one("Which pace suits you best?", ["Calm and predictable", "Busy with quiet spells", "Fast, with lots going on"], { required: true, points: [0, 1, 2] }),
      one("How do you like to share ideas?", ["In writing, once they're polished", "In small meetings", "Early and often, even rough ones"], { required: true, points: [0, 1, 2] }),
      text("Role you're interested in", { save: "role_interest" }),
      fullName(),
      email("Email"),
    ],
    submit: "See my result",
    end: {
      title: "Your work style",
      text: "",
      score: [
        { min: 9, title: "Strong fit", text: "You'd likely do well on our team. We'd like to see your application." },
        { min: 5, title: "Good fit", text: "Much of how you work matches how we work. Tell us more in your application." },
        { min: 0, title: "Different style", text: "Your style differs from how our team works today. Read about each team before you apply." },
      ],
    },
  }),

  tpl("personal.travel-style-quiz", "personal", "Travel style quiz", ["quiz"], "A quiz to share with friends before you plan a trip together.", {
    cats: "personality quiz",
    teams: "personal",
    added: ADDED,
    mode: "screens",
    intro: "Five questions. Compare your result with the people you travel with.",
    fields: [
      text("Your first name", { required: true }),
      one("What does a perfect first day of a trip look like?", ["A long rest by the pool", "A walk through the old town", "A hike before breakfast"], { required: true, points: [0, 1, 2] }),
      one("How many plans do you want each day?", ["One, or none", "Two or three", "As many as I can fit in"], { required: true, points: [0, 1, 2] }),
      one("Where would you rather stay?", ["A beach resort", "A small hotel in the city center", "A cabin or mountain hut"], { required: true, points: [0, 1, 2] }),
      one("Pick a souvenir", ["A good book I finished", "A local cookbook", "Photos from a summit"], { required: true, points: [0, 1, 2] }),
      one("How do you feel about early alarms on vacation?", ["No thanks", "For something special", "Happy to, every day"], { required: true, points: [0, 1, 2] }),
    ],
    submit: "See my travel style",
    end: {
      title: "Your travel style",
      text: "",
      score: [
        { min: 7, title: "The adventurer", text: "You travel to move. Early starts, long hikes and big views make the trip." },
        { min: 4, title: "The explorer", text: "You like a mix of sights, good food and slow afternoons." },
        { min: 0, title: "The relaxer", text: "You travel to rest. A good view and a quiet day are all you need." },
      ],
    },
  }),

  // Knowledge

  tpl("education.math-placement-quiz", "education", "Math placement quiz", ["quiz", "lead"], "Place new students in the right math level before the first lesson.", {
    cats: "knowledge quiz",
    teams: "teachers marketing",
    subs: "tutoring",
    added: ADDED,
    intro: "Eight questions. Work them out on paper, then pick the answer.",
    pages: [
      {
        title: "The questions",
        fields: [
          one("What is 3/4 + 1/8?", ["7/8", "4/12", "1/2", "5/8"], { required: true, points: [1, 0, 0, 0] }),
          one("What is 15% of 80?", ["8", "12", "15", "20"], { required: true, points: [0, 1, 0, 0] }),
          one("Solve for x: 2x + 6 = 20", ["x = 5", "x = 7", "x = 13", "x = 14"], { required: true, points: [0, 1, 0, 0] }),
          one("What is the area of a rectangle 6 cm long and 4 cm wide?", ["10 square cm", "20 square cm", "24 square cm", "48 square cm"], { required: true, points: [0, 0, 1, 0] }),
          one("Which number is the largest?", ["0.6", "0.58", "0.065", "0.605"], { required: true, points: [0, 0, 0, 1] }),
          one("What is -3 times -4?", ["-12", "-7", "7", "12"], { required: true, points: [0, 0, 0, 1] }),
          one("Simplify: 3(x + 2) - x", ["2x + 2", "2x + 6", "3x + 6", "4x + 6"], { required: true, points: [0, 1, 0, 0] }),
          one("A $40 shirt is 25% off. What is the sale price?", ["$10", "$15", "$30", "$35"], { required: true, points: [0, 0, 1, 0] }),
        ],
      },
      {
        title: "Where to send the results",
        fields: [
          drop("Student's grade", ["Grade 5", "Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10 or above", "Adult learner"], { required: true, save: "grade" }),
          fullName("Parent or student name"),
          email("Email for the results"),
        ],
      },
    ],
    submit: "See my level",
    end: {
      title: "Your math level",
      text: "",
      score: [
        { min: 7, title: "Advanced", text: "Nearly every answer was right. An advanced class will keep the work challenging." },
        { min: 4, title: "On track", text: "A solid base with a few gaps. We'll match you with a class that fills them." },
        { min: 0, title: "Building foundations", text: "A few core skills need work. A foundations class builds them step by step." },
      ],
      booking: true,
    },
  }),

  tpl("education.grammar-quiz", "education", "English grammar quiz", ["quiz"], "A short grammar check learners take before choosing a class.", {
    cats: "knowledge quiz",
    teams: "teachers",
    subs: "online-courses",
    added: ADDED,
    mode: "screens",
    intro: "Eight questions. Pick the answer that is correct in standard English.",
    fields: [
      one("Choose the right word: She ___ to school every day.", ["go", "goes", "going", "gone"], { required: true, points: [0, 1, 0, 0] }),
      one("Which sentence is correct?", ["Their going to the park.", "There going to the park.", "They're going to the park.", "Theyre going to the park."], { required: true, points: [0, 0, 1, 0] }),
      one("Choose the past tense: Yesterday we ___ a movie.", ["watch", "watches", "watched", "watching"], { required: true, points: [0, 0, 1, 0] }),
      one("Which word is an adjective in: The tall man laughed loudly.", ["man", "tall", "laughed", "loudly"], { required: true, points: [0, 1, 0, 0] }),
      one("Choose the right word: I have lived here ___ 2019.", ["for", "since", "from", "during"], { required: true, points: [0, 1, 0, 0] }),
      one("Which sentence uses a comma correctly?", ["After dinner, we went for a walk.", "After dinner we, went for a walk.", "After, dinner we went for a walk.", "After dinner we went, for a walk."], { required: true, points: [1, 0, 0, 0] }),
      one("Choose the right word: If I ___ more time, I would travel.", ["have", "had", "will have", "having"], { required: true, points: [0, 1, 0, 0] }),
      one("Choose the plural: one child, two ___", ["childs", "children", "childes", "childrens"], { required: true, points: [0, 1, 0, 0] }),
      email("Email for your results", { required: false }),
    ],
    submit: "See my level",
    end: {
      title: "Your grammar level",
      text: "",
      score: [
        { min: 7, title: "Advanced", text: "Your grammar is strong. An advanced class will polish your writing." },
        { min: 4, title: "Intermediate", text: "You know the basics well. An intermediate class will build your confidence." },
        { min: 0, title: "Beginner", text: "A beginner class will give you a strong start." },
      ],
    },
  }),

  tpl("finance.money-basics-quiz", "finance", "Money basics quiz", ["quiz", "lead"], "Test money know-how and start a planning conversation.", {
    cats: "knowledge quiz",
    teams: "marketing sales",
    added: ADDED,
    intro: "Six questions on saving, credit and investing.",
    fields: [
      one("You have $100 in savings earning 2% a year. After 5 years, how much will you have?", ["Less than $102", "Exactly $102", "More than $102"], { required: true, points: [0, 0, 1] }),
      one("Your savings earn 1% a year and prices rise 2% a year. After a year, what can your money buy?", ["More than today", "The same as today", "Less than today"], { required: true, points: [0, 0, 1] }),
      one("True or false: buying one company's stock is usually safer than buying a stock fund.", ["True", "False"], { required: true, points: [0, 1] }),
      one("What usually hurts a credit score most?", ["Checking your own score", "Paying bills late", "Having a savings account", "Paying a card off in full"], { required: true, points: [0, 1, 0, 0] }),
      one("Compared with a 30-year mortgage, what does a 15-year mortgage usually mean?", ["Lower monthly payments", "Less interest paid in total", "More interest paid in total", "No difference"], { required: true, points: [0, 1, 0, 0] }),
      one("When interest rates rise, what usually happens to bond prices?", ["They rise", "They fall", "They stay the same", "There is no link"], { required: true, points: [0, 1, 0, 0] }),
      one("What are you planning for next?", ["Buying a home", "Retirement", "Paying off debt", "Saving for college", "Growing my investments"], { save: "money_goal" }),
      fullName(),
      email("Email for your results"),
    ],
    submit: "See my score",
    end: {
      title: "Your money score",
      text: "",
      score: [
        { min: 5, title: "Money savvy", text: "You know the basics well. Let's put that knowledge to work in a plan." },
        { min: 3, title: "Good foundation", text: "You have a good start. A few key ideas could save you money." },
        { min: 0, title: "Room to learn", text: "We'll walk you through the basics and build a plan together." },
      ],
      booking: true,
    },
  }),

  tpl("it.phishing-quiz", "it", "Phishing awareness quiz", ["quiz", "lead"], "Test whether staff can spot phishing and open a training talk.", {
    cats: "knowledge quiz",
    teams: "it sales",
    added: ADDED,
    intro: "Seven questions. See how well you spot the tricks attackers use.",
    pages: [
      {
        title: "The quiz",
        fields: [
          one("An email from your bank asks you to sign in through its link to check your account. What should you do?", ["Click the link and confirm", "Reply with your password", "Go to the bank's site yourself or call them", "Forward it to a coworker"], { required: true, points: [0, 0, 1, 0] }),
          one("Which sender address is most likely fake?", ["support@yourbank.com", "support@yourbank-alerts-login.net", "news@yourbank.com", "help@yourbank.com"], { required: true, points: [0, 1, 0, 0] }),
          one("Your CEO emails asking you to buy gift cards fast and keep it quiet. What is this most likely?", ["A real request", "A scam", "A team surprise", "A test of trust"], { required: true, points: [0, 1, 0, 0] }),
          one("Before you click a link in an email, what should you check?", ["The color of the button", "Where the link really goes", "How long the email is", "The time it was sent"], { required: true, points: [0, 1, 0, 0] }),
          one("A file named invoice.pdf.exe arrives from someone you don't know. Is it safe to open?", ["Yes, it's a PDF", "Only on a phone", "No, it's a program", "Yes, if the company name looks real"], { required: true, points: [0, 0, 1, 0] }),
          one("You clicked a bad link by mistake. What should you do first?", ["Nothing, if the page closed", "Tell IT right away", "Restart your computer", "Delete the email"], { required: true, points: [0, 1, 0, 0] }),
          one("Which is the strongest sign of a phishing text message?", ["It uses your first name", "It says your account closes today unless you act", "It arrives during work hours", "It is short"], { required: true, points: [0, 1, 0, 0] }),
        ],
      },
      {
        title: "Your results",
        fields: [one("How many people work at your company?", TEAM_SIZE, { save: "team_size" }), fullName(), email(), company()],
      },
    ],
    submit: "See my score",
    end: {
      title: "Your phishing score",
      text: "",
      score: [
        { min: 6, title: "Sharp eye", text: "You spot the tricks most people miss. Make sure your whole team can too." },
        { min: 4, title: "Mostly safe", text: "You catch the obvious ones. A short training session would close the gaps." },
        { min: 0, title: "At risk", text: "Phishing is one of the most common ways attackers get in. Let's train your team." },
      ],
      booking: true,
    },
  }),

  // Scorecards

  tpl("saas.data-maturity-scorecard", "saas", "Data maturity scorecard", ["quiz", "lead"], "Score a team's data maturity and book a walkthrough of the gaps.", {
    cats: "scorecard quiz qualify",
    teams: "sales marketing",
    added: ADDED,
    intro: "Six questions. Get a score and the next step for your team.",
    pages: [
      {
        title: "Your data today",
        fields: [
          one("Where does your customer data live?", ["Spreadsheets and inboxes", "A few tools that don't connect", "Connected tools with some gaps", "One source everyone trusts"], { required: true, points: [0, 1, 2, 3] }),
          one("How do you build reports?", ["By hand, when someone asks", "By hand, on a schedule", "Dashboards that often need fixing", "Dashboards that update on their own"], { required: true, points: [0, 1, 2, 3] }),
          one("How much do leaders trust the numbers?", ["Not much", "Some of the time", "Most of the time", "Fully"], { required: true, points: [0, 1, 2, 3] }),
          one("Who owns data quality?", ["No one", "Whoever has time", "One person, part time", "A team or a named owner"], { required: true, points: [0, 1, 2, 3] }),
          one("How fast can you answer a new question with data?", ["Weeks", "Days", "Hours", "Minutes"], { required: true, points: [0, 1, 2, 3] }),
          one("Do you use data to plan ahead, not just to report?", ["No", "We've tried", "In a few areas", "Across the business"], { required: true, points: [0, 1, 2, 3] }),
        ],
      },
      {
        title: "Where to send your score",
        fields: [company(undefined, { required: true, half: true }), one("Team size", TEAM_SIZE, { save: "team_size" }), fullName(), email()],
      },
    ],
    submit: "See my score",
    end: {
      title: "Your data maturity",
      text: "",
      score: [
        { min: 13, title: "Leading", text: "Your data drives decisions. The next step is putting it to work in more places." },
        { min: 7, title: "Developing", text: "You have the pieces in place. Connecting them will save hours each week." },
        { min: 0, title: "Getting started", text: "Most work is still done by hand. A few changes will give you numbers you can trust." },
      ],
      booking: true,
    },
  }),

  tpl("agency.marketing-scorecard", "agency", "Marketing scorecard", ["quiz", "lead"], "Grade a prospect's marketing in two minutes and book the review call.", {
    cats: "scorecard quiz lead-generation",
    teams: "marketing sales",
    added: ADDED,
    intro: "Seven questions. Get your score and the first things to fix.",
    pages: [
      {
        title: "Your marketing",
        fields: [
          one("Do you have a written marketing plan for this year?", ["No", "Rough notes", "Yes, and we follow it"], { required: true, points: [0, 1, 2] }),
          one("Do you know what it costs to win a new customer?", ["No", "Roughly", "Yes, for each channel"], { required: true, points: [0, 1, 2] }),
          one("How often do you publish new content?", ["Rarely", "Once or twice a month", "Every week"], { required: true, points: [0, 1, 2] }),
          one("How do you follow up with new leads?", ["When we remember", "By hand, one email at a time", "Automated emails and calls"], { required: true, points: [0, 1, 2] }),
          one("How does your website turn visitors into leads?", ["It doesn't yet", "A contact form", "Offers, forms and booking"], { required: true, points: [0, 1, 2] }),
          one("Do you track which channels bring in revenue?", ["No", "Some of them", "All of them"], { required: true, points: [0, 1, 2] }),
          one("How often do you review your results?", ["Rarely", "Every quarter", "Every month or more"], { required: true, points: [0, 1, 2] }),
          one("Monthly marketing budget", ["Under $2,000", "$2,000–$5,000", "$5,000–$20,000", "Over $20,000"], { save: "budget" }),
        ],
      },
      {
        title: "Your details",
        fields: [company(undefined, { required: true, half: true }), website(undefined, { half: true }), fullName(), email()],
      },
    ],
    submit: "Get my score",
    end: {
      title: "Your marketing score",
      text: "",
      score: [
        { min: 11, title: "Strong", text: "Your marketing runs like a system. Let's find where to scale it." },
        { min: 6, title: "Solid base", text: "The basics are there. Tighter follow up and tracking will grow results." },
        { min: 0, title: "Room to grow", text: "There's a lot to gain. We'll show you where to start." },
      ],
      booking: true,
    },
  }),

  tpl("insurance.coverage-checkup", "insurance", "Coverage checkup", ["quiz", "lead"], "Score how well a household is covered and find the gaps.", {
    cats: "scorecard quiz",
    teams: "sales marketing",
    added: ADDED,
    intro: "Six questions. See where your coverage is strong and where it has gaps.",
    fields: [
      one("Do you own or rent your home?", ["Own", "Rent", "Live with family"], { required: true, save: "home_status" }),
      one("Would your life insurance cover at least 5 years of your income?", ["Yes", "No", "Not sure"], { required: true, points: [2, 0, 0] }),
      one("When did you last review your home or renters policy?", ["In the last year", "1–3 years ago", "Over 3 years ago", "I don't have one"], { required: true, points: [2, 1, 0, 0] }),
      one("Does your auto policy cover more than your state's minimum?", ["Yes", "No", "Not sure"], { required: true, points: [2, 0, 0] }),
      one("Do you have an umbrella policy?", ["Yes", "No", "Not sure what that is"], { required: true, points: [2, 0, 0] }),
      one("If you couldn't work for 6 months, would insurance replace your pay?", ["Yes", "Partly", "No"], { required: true, points: [2, 1, 0] }),
      one("Do you have a list of what you own, with photos?", ["Yes", "Partly", "No"], { required: true, points: [2, 1, 0] }),
      fullName(),
      email("Email"),
      phone(),
    ],
    submit: "See my score",
    end: {
      title: "Your coverage score",
      text: "",
      score: [
        { min: 10, title: "Well covered", text: "Your coverage is in good shape. A yearly review keeps it that way." },
        { min: 6, title: "A few gaps", text: "You're covered in most areas. Let's close the gaps before you need them." },
        { min: 0, title: "Underinsured", text: "Some big risks aren't covered yet. A short review will show what to fix first." },
      ],
      booking: true,
    },
  }),

  tpl("real_estate.buying-readiness", "real_estate", "Home buying readiness quiz", ["quiz", "lead"], "Score how ready a buyer is and book the first call.", {
    cats: "scorecard quiz qualify",
    teams: "sales marketing",
    subs: "residential",
    added: ADDED,
    intro: "Six questions. See how close you are to making an offer.",
    fields: [
      one("Are you pre-approved for a mortgage?", ["Yes", "I've started", "Not yet", "I'm paying cash"], { required: true, points: [4, 2, 0, 4] }),
      one("How much have you saved for the down payment and closing costs?", ["Under 3% of the price", "3% to 10%", "10% to 20%", "Over 20%"], { required: true, points: [0, 1, 2, 3] }),
      one("How would you rate your credit?", ["Not sure", "Fair", "Good", "Excellent"], { required: true, points: [0, 1, 2, 3] }),
      one("How steady is your income?", ["It may change soon", "Mostly steady", "Steady for 2 years or more"], { required: true, points: [0, 1, 2] }),
      one("When do you want to move?", TIMELINE, { required: true, points: [3, 3, 2, 1, 0], save: "timeline" }),
      one("Do you need to sell a home first?", ["No", "Yes, and it's listed", "Yes, not listed yet"], { required: true, points: [2, 1, 0] }),
      one("Price range", ["Under $300,000", "$300,000–$500,000", "$500,000–$800,000", "Over $800,000"], { save: "price_range" }),
      fullName(),
      email("Email"),
      phone(),
    ],
    submit: "See my result",
    end: {
      title: "Your buying readiness",
      text: "",
      score: [
        { min: 14, title: "Ready to buy", text: "You're in a strong spot. Let's start touring homes." },
        { min: 7, title: "Almost ready", text: "A few steps will put you in a strong spot. We'll map them out with you." },
        { min: 0, title: "Early stages", text: "Now is a good time to plan. We'll help you build a path to your first offer." },
      ],
      booking: true,
    },
  }),

  tpl("consulting.ai-readiness", "consulting", "AI readiness scorecard", ["quiz", "lead"], "Score how ready a business is to use AI and book a strategy call.", {
    cats: "scorecard quiz",
    teams: "sales founders",
    added: ADDED,
    intro: "Seven questions. Get a score and the next step for your business.",
    pages: [
      {
        title: "Where you are today",
        fields: [
          one("Do you have a clear problem you want AI to solve?", ["Not yet", "A few ideas", "Yes, with a goal we can measure"], { required: true, points: [0, 1, 2] }),
          one("Is your business data organized and easy to reach?", ["No, it's scattered", "Some of it", "Yes, most of it"], { required: true, points: [0, 1, 2] }),
          one("Do you have rules for how staff can use AI tools?", ["No", "Informal rules", "Yes, written down"], { required: true, points: [0, 1, 2] }),
          one("How do your teams use AI today?", ["Not at all", "A few people try it", "It's part of daily work"], { required: true, points: [0, 1, 2] }),
          one("Who would lead an AI project?", ["No one yet", "Someone, part time", "A named owner with time set aside"], { required: true, points: [0, 1, 2] }),
          one("Do leaders support spending on AI this year?", ["No", "Maybe", "Yes, with a budget"], { required: true, points: [0, 1, 2] }),
          one("How will you measure success?", ["We haven't decided", "Rough time saved", "Clear numbers we track"], { required: true, points: [0, 1, 2] }),
        ],
      },
      {
        title: "Where to send your score",
        fields: [company(undefined, { required: true, half: true }), jobTitle(undefined, { half: true }), fullName(), email()],
      },
    ],
    submit: "See my score",
    end: {
      title: "Your AI readiness",
      text: "",
      score: [
        { min: 11, title: "Ready to scale", text: "You have the basics. Let's pick the projects with the biggest return." },
        { min: 6, title: "Ready to start", text: "A few foundations need work. A focused pilot is the right next step." },
        { min: 0, title: "Early days", text: "Start with clear goals and organized data. We'll help you plan the first steps." },
      ],
      booking: true,
    },
  }),

  // Product finders

  tpl("ecommerce.mattress-finder", "ecommerce", "Mattress finder", ["quiz", "lead"], "Match shoppers to a firm, medium or soft mattress.", {
    cats: "product-finder quiz",
    teams: "marketing sales",
    added: ADDED,
    mode: "screens",
    intro: "Four questions about how you sleep. We'll match you with a mattress.",
    fields: [
      one("How do you usually sleep?", ["On my side", "It changes through the night", "On my back", "On my stomach"], { required: true, points: [0, 1, 2, 2], save: "sleep_position" }),
      one("How do you like a bed to feel?", ["Like sinking into a cloud", "Somewhere in between", "Flat and supportive"], { required: true, points: [0, 1, 2] }),
      one("What do you sleep on now?", ["A soft or pillow top mattress", "A medium mattress", "A firm mattress"], { required: true, points: [0, 1, 2] }),
      one("Which pillow do you like?", ["Thick and fluffy", "Medium", "Thin or none"], { required: true, points: [0, 1, 2] }),
      one("Do you sleep hot?", ["Yes", "Sometimes", "No"], { save: "sleeps_hot" }),
      drop("Mattress size", ["Twin", "Twin XL", "Full", "Queen", "King", "California king"], { save: "mattress_size" }),
      fullName(),
      email("Email for your match"),
    ],
    submit: "Find my mattress",
    end: {
      title: "Your mattress match",
      text: "",
      score: [
        { min: 6, title: "Firm", text: "Our firm mattress keeps your spine straight, the best match for back and stomach sleepers." },
        { min: 3, title: "Medium", text: "Our medium mattress gives support with a little give, a good match for most sleepers." },
        { min: 0, title: "Soft", text: "Our plush mattress cushions shoulders and hips, the best match for side sleepers." },
      ],
    },
  }),

  tpl("retail.running-shoe-finder", "retail", "Running shoe finder", ["quiz", "lead"], "Point runners to the right shoe and book a fitting in store.", {
    cats: "product-finder quiz",
    teams: "marketing sales",
    added: ADDED,
    mode: "screens",
    intro: "Three questions about how you run, then a few details for your fitting.",
    fields: [
      one("What are you training for?", ["Feeling good and staying active", "A 5K or 10K", "A race where I want a personal best"], { required: true, points: [0, 1, 2] }),
      one("How do you like a shoe to feel?", ["Soft and plush", "Balanced", "Light and close to the ground"], { required: true, points: [0, 1, 2] }),
      one("What pace are most of your runs?", ["Easy and steady", "A mix of easy and fast", "Mostly fast"], { required: true, points: [0, 1, 2] }),
      one("Where do you run most?", ["Roads", "Treadmill", "Trails", "Track"], { save: "run_surface" }),
      one("Do your ankles roll inward when you run?", ["Yes", "No", "Not sure"], { save: "ankle_roll" }),
      text("Shoe size", { half: true, save: "shoe_size" }),
      fullName(),
      email("Email"),
    ],
    submit: "Find my shoe",
    end: {
      title: "Your shoe match",
      text: "",
      score: [
        { min: 5, title: "Lightweight racer", text: "Light, fast shoes for race day and speed work. Come try a pair in store." },
        { min: 2, title: "Everyday trainer", text: "A balanced shoe for most of your miles. We'll fit you in store." },
        { min: 0, title: "Max cushion", text: "Soft, protective shoes for easy miles and comfort. We'll fit you in store." },
      ],
      booking: true,
    },
  }),

  tpl("beauty.skin-type-quiz", "beauty", "Skin type quiz", ["quiz", "lead"], "Find each client's skin type and the facial that fits it.", {
    cats: "product-finder quiz",
    teams: "marketing sales",
    subs: "spas salons",
    added: ADDED,
    mode: "screens",
    intro: "Five questions about your skin. We'll suggest a facial and a routine.",
    fields: [
      one("How does your skin feel an hour after washing?", ["Tight or flaky", "Comfortable", "Shiny all over"], { required: true, points: [0, 1, 2] }),
      one("By midday, where does your face look shiny?", ["Nowhere", "Only my forehead, nose and chin", "All over"], { required: true, points: [0, 1, 2] }),
      one("How do your pores look?", ["Small and hard to see", "Larger on my nose", "Large and easy to see"], { required: true, points: [0, 1, 2] }),
      one("How often do you get blemishes?", ["Rarely", "Now and then", "Often"], { required: true, points: [0, 1, 2] }),
      one("How does your skin take rich creams?", ["It soaks them up", "It's fine with most", "It feels greasy"], { required: true, points: [0, 1, 2] }),
      one("What's your main skin goal?", ["More moisture", "Fewer blemishes", "Even tone", "Smoother lines", "A healthy glow"], { save: "skin_goal" }),
      fullName(),
      email("Email"),
    ],
    submit: "Find my skin type",
    end: {
      title: "Your skin type",
      text: "",
      score: [
        { min: 7, title: "Oily skin", text: "A deep cleansing facial and a light, oil-free moisturizer will keep shine in check." },
        { min: 4, title: "Combination skin", text: "A balancing facial treats your T-zone and keeps your cheeks soft." },
        { min: 0, title: "Dry skin", text: "A hydrating facial and a rich cream will bring back comfort." },
      ],
      booking: true,
    },
  }),

  tpl("food.coffee-finder", "food", "Coffee finder", ["quiz", "lead"], "Match coffee drinkers to a light, medium or dark roast.", {
    cats: "product-finder quiz",
    teams: "marketing",
    added: ADDED,
    mode: "screens",
    intro: "Four questions about your taste. We'll pick a roast for you.",
    fields: [
      one("How do you take your coffee?", ["Black", "With a splash of milk", "With lots of milk or cream"], { required: true, points: [0, 1, 2] }),
      one("Which flavors do you like best?", ["Bright and fruity", "Nutty and sweet", "Rich and smoky"], { required: true, points: [0, 1, 2] }),
      one("Pick a breakfast", ["Fresh fruit and yogurt", "Toast with peanut butter", "Bacon and eggs"], { required: true, points: [0, 1, 2] }),
      one("How strong do you like it?", ["Light and smooth", "Balanced", "Bold and strong"], { required: true, points: [0, 1, 2] }),
      one("How do you brew at home?", ["Pour over", "Drip machine", "French press", "Espresso", "Pods"], { save: "brew_method" }),
      one("Whole bean or ground?", ["Whole bean", "Ground"], { save: "grind" }),
      fullName(),
      email("Email for your match"),
    ],
    submit: "Find my roast",
    end: {
      title: "Your coffee match",
      text: "",
      score: [
        { min: 6, title: "Dark roast", text: "Rich, smoky and bold. It stands up well to milk." },
        { min: 3, title: "Medium roast", text: "Smooth and sweet, with notes of nuts and caramel." },
        { min: 0, title: "Light roast", text: "Bright and fruity, best enjoyed black." },
      ],
    },
  }),

  tpl("pets.breed-finder", "pets", "Dog breed finder", ["quiz", "lead"], "Help families find a dog breed that fits their home and pace.", {
    cats: "product-finder quiz",
    teams: "marketing",
    added: ADDED,
    mode: "screens",
    intro: "Five questions about your home and routine.",
    fields: [
      one("How active is your household?", ["Mostly relaxed at home", "Daily walks", "Running, hiking and long days outside"], { required: true, points: [0, 1, 2] }),
      one("How much space do you have?", ["An apartment", "A house with a small yard", "A house with a big yard or land"], { required: true, points: [0, 1, 2] }),
      one("How much time can you give to training each day?", ["Under 15 minutes", "15 to 30 minutes", "Over 30 minutes"], { required: true, points: [0, 1, 2] }),
      one("How long would the dog be alone on a typical day?", ["Over 6 hours", "3 to 6 hours", "Under 3 hours"], { required: true, points: [0, 1, 2] }),
      one("Have you owned a dog before?", ["No", "Yes, one", "Yes, several"], { required: true, points: [0, 1, 2] }),
      one("What size dog would you like?", ["Small", "Medium", "Large", "No preference"], { save: "dog_size" }),
      yesno("Do you need a dog that sheds very little?", { save: "low_shedding" }),
      yesno("Are there children under 10 at home?"),
      fullName(),
      email("Email"),
    ],
    submit: "Find my breed",
    end: {
      title: "Your breed match",
      text: "",
      score: [
        { min: 7, title: "Active partner", text: "Herding and sporting breeds like Border Collies and Vizslas love a job and lots of exercise." },
        { min: 4, title: "Easygoing all-rounder", text: "Friendly breeds like Beagles, Cocker Spaniels and Poodles fit a busy family life." },
        { min: 0, title: "Calm companion", text: "Relaxed breeds like Cavaliers, Shih Tzus and Basset Hounds enjoy a slower pace." },
      ],
    },
  }),

  // Eligibility

  tpl("legal.divorce-eligibility", "legal", "Uncontested divorce check", ["quiz", "lead"], "See if an uncontested divorce may fit before the first consultation.", {
    cats: "eligibility quiz consultation",
    teams: "sales founders",
    subs: "family-law",
    added: ADDED,
    intro: "Seven questions. This is general information, not legal advice.",
    fields: [
      one("Have you or your spouse lived in this state for at least 6 months?", ["Yes", "No", "Not sure"], { required: true, points: [2, 0, 1] }),
      one("Do you both agree to end the marriage?", ["Yes", "Not yet", "No"], { required: true, points: [2, 1, 0] }),
      one("Do you agree on how to split property and debts?", ["Yes", "Mostly", "No"], { required: true, points: [2, 1, 0] }),
      one("If you have children under 18, do you agree on custody and support?", ["We have no children under 18", "Yes", "Mostly", "No"], { required: true, points: [2, 2, 1, 0], save: "custody_agreed" }),
      one("Is your spouse willing to sign the papers?", ["Yes", "Not sure", "No"], { required: true, points: [2, 1, 0] }),
      one("Is there a protective order between you?", ["No", "Yes", "I'd rather discuss it privately"], { required: true, points: [2, 0, 0] }),
      one("Do either of you own a business or have a pension?", ["No", "Yes"], { required: true, points: [2, 1] }),
      fullName(),
      email("Email"),
      phone(),
    ],
    submit: "See my result",
    end: {
      title: "Your result",
      text: "",
      score: [
        { min: 13, title: "Likely a good fit", text: "An uncontested divorce looks possible. Book a consultation to confirm the next steps." },
        { min: 7, title: "Possibly a fit", text: "A few points need work first. A lawyer can help you settle them." },
        { min: 0, title: "Likely contested", text: "Your case may need more support. Let's talk through your options." },
      ],
      booking: true,
    },
  }),

  tpl("solar.eligibility-check", "solar", "Solar eligibility check", ["quiz", "lead"], "Pre-qualify homeowners for solar before a site visit.", {
    cats: "eligibility quiz",
    teams: "sales marketing",
    added: ADDED,
    intro: "A few questions about your home. See if it's a fit for solar.",
    pages: [
      {
        title: "Your home",
        fields: [
          one("Do you own your home?", ["Yes", "No, I rent"], { required: true, points: [4, 0] }),
          one("What kind of home is it?", ["Single family house", "Townhouse", "Condo or apartment", "Mobile home"], { required: true, points: [3, 2, 0, 0], show: when("Do you own your home?", "is", "Yes") }),
          one("How old is your roof?", ["Under 10 years", "10 to 20 years", "Over 20 years", "Not sure"], { required: true, points: [2, 1, 0, 1], show: when("Do you own your home?", "is", "Yes") }),
          one("How much shade does your roof get?", ["Little or none", "Some", "A lot"], { required: true, points: [3, 1, 0], show: when("Do you own your home?", "is", "Yes") }),
          one("Which way does the biggest part of your roof face?", ["South", "East or west", "North", "Not sure"], { required: true, points: [3, 1, 0, 1], show: when("Do you own your home?", "is", "Yes") }),
          one("What's your average monthly electric bill?", ["Under $75", "$75–$150", "$150–$300", "Over $300"], { required: true, points: [0, 1, 2, 3], save: "electric_bill", show: when("Do you own your home?", "is", "Yes") }),
          yesno("Would you like details on community solar?", { show: when("Do you own your home?", "is", "No, I rent") }),
        ],
      },
      {
        title: "Your details",
        fields: [text("ZIP code", { required: true, half: true, save: "zip" }), fullName(), email("Email"), phone()],
      },
    ],
    submit: "Check my home",
    end: {
      title: "Your solar result",
      text: "",
      score: [
        { min: 16, title: "Great fit for solar", text: "Your home looks like a strong fit. Book a free site visit to confirm." },
        { min: 10, title: "Worth a closer look", text: "A few details need checking. A short call will tell us more." },
        { min: 0, title: "Not a fit yet", text: "Rooftop solar may be hard for this home today. We'll share other ways to save." },
      ],
      booking: true,
    },
  }),

  tpl("nonprofit.grant-eligibility", "nonprofit", "Grant eligibility check", ["quiz", "application"], "Screen applicants before they start a full grant application.", {
    cats: "eligibility grant",
    teams: "operations finance",
    added: ADDED,
    intro: "Answer a few questions to see if your organization can apply this cycle.",
    pages: [
      {
        title: "Eligibility",
        fields: [
          one("Is your organization a registered nonprofit?", ["Yes, a 501(c)(3)", "Yes, another type", "We have a fiscal sponsor", "No"], { required: true, points: [3, 1, 2, 0] }),
          one("Does your work serve people in our region?", ["All of it", "Some of it", "No"], { required: true, points: [2, 1, 0], show: when("Is your organization a registered nonprofit?", "any", ["Yes, a 501(c)(3)", "Yes, another type", "We have a fiscal sponsor"]) }),
          one("Does the project fit one of our focus areas?", ["Yes", "Partly", "No"], { required: true, points: [2, 1, 0], show: when("Does your work serve people in our region?", "any", ["All of it", "Some of it"]) }),
          one("How long has your organization been running?", ["Under 1 year", "1 to 3 years", "Over 3 years"], { required: true, points: [0, 1, 2], show: when("Does the project fit one of our focus areas?", "any", ["Yes", "Partly"]) }),
          one("What is your yearly operating budget?", ["Under $100,000", "$100,000–$500,000", "$500,000–$2 million", "Over $2 million"], { required: true, points: [2, 2, 1, 0], save: "org_budget", show: when("Does the project fit one of our focus areas?", "any", ["Yes", "Partly"]) }),
          one("Can you share last year's financial statements?", ["Yes, audited", "Yes, not audited", "No"], { required: true, points: [2, 1, 0], show: when("Does the project fit one of our focus areas?", "any", ["Yes", "Partly"]) }),
        ],
      },
      {
        title: "Your organization",
        fields: [
          one("How much would you request?", ["Under $10,000", "$10,000–$25,000", "$25,000–$50,000", "Over $50,000"], { save: "request_amount" }),
          company("Organization name", { required: true }),
          fullName("Contact name"),
          email(),
        ],
      },
    ],
    submit: "Check eligibility",
    end: {
      title: "Your eligibility",
      text: "",
      score: [
        { min: 10, title: "Eligible to apply", text: "You meet our main criteria. We'll email you the full application." },
        { min: 6, title: "Possibly eligible", text: "Some criteria need a closer look. Our team will follow up with a few questions." },
        { min: 0, title: "Not eligible this cycle", text: "Your organization doesn't meet this cycle's criteria. We'll share other funding sources." },
      ],
    },
  }),

  tpl("accounting.rd-credit-check", "accounting", "R&D tax credit check", ["quiz", "lead"], "Screen businesses for the R&D tax credit before a full review.", {
    cats: "eligibility quiz",
    teams: "sales finance",
    added: ADDED,
    intro: "Six questions about your work. See if the R&D tax credit may apply.",
    fields: [
      one("Does your company build or improve products, software or processes?", ["Yes", "No"], { required: true, points: [2, 0] }),
      one("Is the work done in the United States?", ["All of it", "Some of it", "None of it"], { required: true, points: [2, 1, 0], show: when("Does your company build or improve products, software or processes?", "is", "Yes") }),
      one("Does that work rely on engineering, science or computer science?", ["Yes", "Partly", "No"], { required: true, points: [2, 1, 0], show: when("Is the work done in the United States?", "any", ["All of it", "Some of it"]) }),
      one("Do you test options, build prototypes or try ideas that fail?", ["Often", "Sometimes", "Rarely"], { required: true, points: [2, 1, 0], show: when("Does that work rely on engineering, science or computer science?", "any", ["Yes", "Partly"]) }),
      one("At the start, were you unsure if it would work or how to build it?", ["Usually", "Sometimes", "No"], { required: true, points: [2, 1, 0], show: when("Does that work rely on engineering, science or computer science?", "any", ["Yes", "Partly"]) }),
      one("How many staff do technical or design work?", ["None", "1 to 5", "6 to 25", "More than 25"], { required: true, points: [0, 1, 2, 2], show: when("Does that work rely on engineering, science or computer science?", "any", ["Yes", "Partly"]) }),
      one("Yearly revenue", ["Under $1 million", "$1–$5 million", "$5–$50 million", "Over $50 million"], { save: "revenue" }),
      company(undefined, { required: true }),
      fullName(),
      email(),
    ],
    submit: "See my result",
    end: {
      title: "Your R&D credit result",
      text: "",
      score: [
        { min: 10, title: "Likely eligible", text: "Your work looks like it may qualify. A full review will size the credit." },
        { min: 6, title: "Possibly eligible", text: "Some of your work may qualify. Let's look at your projects in detail." },
        { min: 0, title: "Unlikely to qualify", text: "Your work may not meet the tests today. We can review again if that changes." },
      ],
      booking: true,
    },
  }),
];
