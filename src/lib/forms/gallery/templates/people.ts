// Hospitality and travel, events, nonprofits, HR and recruiting, IT services.
import { address, agree, company, date, drop, email, email2, file, files, fullName, go, jobTitle, long, many, matrix, money, nps, num, one, phone, range, phone2, scale, sign, stars, text, time, tpl, url, when, website, yesno, AGREE5 } from "./build.ts";

const DIET = ["None", "Vegetarian", "Vegan", "Gluten free", "Halal", "Kosher", "Other"];

export const HOSPITALITY = [
  tpl("hospitality.group-booking", "hospitality", "Group booking / event inquiry", ["request", "lead"], "Private events and group bookings.", {
    featured: true,
    fields: [
      drop("Type of event", ["Wedding", "Corporate", "Birthday", "Group stay", "Other"], { required: true }),
      date("Date", { required: true }),
      num("Guests", { required: true, min: 1 }),
      one("Budget", ["Under $2,000", "$2,000–$10,000", "$10,000–$50,000", "Over $50,000"], { save: "budget" }),
      fullName(),
      email("Email"),
      phone(),
      long("Tell us more"),
    ],
    end: { title: "Thanks", text: "Book a call with our events team.", booking: true },
  }),
  tpl("hospitality.catering", "food", "Catering request", ["request", "order"], "Menus, guest counts and dietary needs.", {
    fields: [date("Event date", { required: true }), time("Serving time"), num("Guests", { required: true, min: 1 }), one("Style", ["Buffet", "Plated", "Family style", "Drop-off"], { required: true }), many("Dietary needs", DIET), fullName(), email("Email"), phone()],
    end: ["Request received", "We'll send menu options and a quote."],
  }),
  tpl("hospitality.guest-feedback", "hospitality", "Guest feedback", ["feedback", "survey"], "Ratings and comments after each stay.", {
    fields: [range("Stay dates"), stars("Overall", { required: true }), matrix("Rate your stay", ["Room", "Cleanliness", "Staff", "Food", "Value"], ["Poor", "Fair", "Good", "Great"]), long("Comments"), email("Email", { required: false })],
    end: ["Thank you", "We hope to welcome you back soon."],
  }),
  tpl("hospitality.travel-inquiry", "hospitality", "Travel inquiry", ["request", "lead"], "Plan trips from dates, budget and travelers.", {
    fields: [text("Destination", { required: true }), range("Travel dates", { required: true }), num("Travelers", { required: true, min: 1 }), money("Budget per person"), many("Interests", ["Beaches", "Culture", "Food", "Adventure", "Relaxation", "Family"]), fullName(), email("Email")],
    end: { title: "Thanks", text: "Book a call to plan your trip.", booking: true },
  }),
  tpl("hospitality.reservation", "food", "Reservation request", ["booking"], "Table requests for busy nights.", {
    fields: [date("Date", { required: true }), time("Time", { required: true }), num("Party size", { required: true, min: 1, max: 30 }), fullName(), phone("Phone", { required: true }), email("Email"), text("Special requests")],
    submit: "Request table",
    end: ["Request received", "We'll confirm your table by text."],
  }),
];

export const EVENTS = [
  tpl("events.registration", "events", "Event registration", ["registration", "lead"], "Tickets, roles and dietary needs in one form.", {
    featured: true,
    fields: [fullName(), email(), company(undefined, { half: true }), jobTitle(undefined, { half: true }), one("Ticket", ["General admission", "VIP", "Student", "Speaker"], { required: true, save: "ticket" }), drop("Dietary needs", DIET), agree("I agree to the code of conduct.")],
    submit: "Register",
    end: ["You're registered", "Your ticket is on its way by email."],
  }),
  tpl("events.speaker-application", "events", "Speaker application", ["application"], "A call for papers with abstracts and video.", {
    featured: true,
    fields: [fullName(), email(), company(), jobTitle(), text("Talk title", { required: true }), long("Abstract", { required: true }), one("Format", ["Talk", "Panel", "Workshop", "Lightning talk"], { required: true }), long("Short bio", { required: true }), url("Video of a past talk"), file("Headshot")],
    end: ["Thanks for submitting", "We'll announce speakers by email."],
  }),
  tpl("events.sponsor-inquiry", "events", "Sponsor inquiry", ["lead"], "Qualify sponsors by level and goals.", {
    fields: [fullName(), email(), company(undefined, { required: true }), website(), one("Sponsor level", ["Gold", "Silver", "Bronze", "Not sure"], { required: true }), many("Goals", ["Brand awareness", "Leads", "Hiring", "Thought leadership"]), long("Anything else?")],
    end: { title: "Thanks", text: "Book a call with our partnerships team.", booking: true },
  }),
  tpl("events.exhibitor", "events", "Exhibitor sign-up", ["registration", "order"], "Booth size, power and contacts.", {
    fields: [company(undefined, { required: true }), fullName("Booth contact"), email(), phone(), one("Booth size", ["10×10", "10×20", "20×20", "Custom"], { required: true }), yesno("Need power?"), num("Staff attending", { min: 1 })],
    end: ["You're signed up", "We'll send your exhibitor kit."],
  }),
  tpl("events.post-event", "events", "Post-event survey", ["survey", "feedback"], "What worked and what to change next time.", {
    fields: [nps("How likely are you to come again?", { required: true }), text("Best session"), matrix("Rate", ["Speakers", "Venue", "Food", "Networking", "Organization"], ["Poor", "Fair", "Good", "Great"]), long("What should we change?"), email("Email", { required: false })],
    end: ["Thank you", "See you next time."],
  }),
  tpl("events.volunteer", "events", "Volunteer sign-up", ["registration"], "Shifts, skills and shirt sizes.", {
    fields: [fullName(), email("Email"), phone(), many("Shifts", ["Setup", "Morning", "Afternoon", "Evening", "Teardown"], { required: true }), many("Skills", ["Registration desk", "Tech and AV", "Guiding guests", "Photography", "Social media"]), one("Shirt size", ["XS", "S", "M", "L", "XL", "XXL"])],
    end: ["Thanks for volunteering", "We'll send your schedule a week before."],
  }),
  tpl("events.meeting-request", "events", "Meeting request at event", ["booking", "lead"], "Book meetings at a conference.", {
    fields: [fullName(), email(), company(undefined, { required: true }), jobTitle(), text("What would you like to discuss?"), one("Preferred day", ["Day 1", "Day 2", "Day 3"])],
    end: { title: "Thanks", text: "Pick a slot at the event.", booking: true },
  }),
];

export const NONPROFIT = [
  tpl("nonprofit.volunteer", "nonprofit", "Volunteer application", ["application", "registration"], "Recruit and screen volunteers.", {
    featured: true,
    version: 2,
    pages: [
      {
        title: "About you",
        fields: [fullName(), email("Email"), phone(), yesno("Are you 18 or older?", { required: true }), text("Emergency contact name and phone", { required: true })],
      },
      {
        title: "Interests",
        fields: [
          many("Interests", ["Events", "Mentoring", "Fundraising", "Office help", "Outreach", "Skilled work"], { required: true }),
          many("Skills you can share", ["Teaching", "Driving", "Languages", "Computers", "Cooking", "Building and repairs", "Other"]),
          long("Why do you want to volunteer?"),
          yesno("Have you volunteered before?", { required: true }),
        ],
      },
      {
        title: "Availability",
        fields: [
          many("Availability", ["Weekdays", "Evenings", "Weekends"], { required: true }),
          one("How often can you help?", ["One time", "A few times a year", "Monthly", "Weekly"], { required: true }),
          date("When can you start?"),
        ],
        skip: go("Have you volunteered before?", "is", false, "Background check"),
      },
      {
        title: "Experience",
        fields: [
          text("Where did you volunteer?", { required: true }),
          long("What did you do there?"),
          one("How long did you volunteer there?", ["Under 6 months", "6–12 months", "1–3 years", "Over 3 years"]),
          text("A reference from there (name and phone)"),
        ],
      },
      {
        title: "Background check",
        fields: [yesno("Do you agree to a background check if the role needs one?", { required: true }), agree("The information I gave is true and complete."), sign("Signature")],
      },
    ],
    end: ["Thank you", "Our volunteer team will be in touch."],
  }),
  tpl("nonprofit.donation-pledge", "nonprofit", "Donation pledge", ["order", "lead"], "Pledges with amount and dedication.", {
    fields: [money("Amount", { required: true, min: 1 }), one("How often?", ["Once", "Monthly", "Yearly"], { required: true }), yesno("Give in honor of someone?"), text("Their name", { show: when("Give in honor of someone?", "is", true) }), fullName(), email("Email")],
    submit: "Pledge",
    end: ["Thank you for your pledge", "We'll send a receipt and how to complete your gift."],
  }),
  tpl("nonprofit.grant-application", "nonprofit", "Grant application", ["application"], "Collect proposals and budgets.", {
    version: 2,
    cover: { title: "Grant application", text: "About 20 minutes. Have your budget and latest financial statement ready.", button: "Start" },
    resume: true,
    copy: true,
    pages: [
      {
        title: "Organization",
        fields: [
          company("Organization name", { required: true }),
          website(),
          one("Organization type", ["Nonprofit or charity", "School", "Faith group", "Community group", "Public agency", "Other"], { required: true }),
          text("Tax ID or registration number"),
          long("Your mission", { required: true }),
          one("What are you applying for?", ["A project grant", "General operating support"], { required: true }),
        ],
      },
      {
        title: "Contact",
        fields: [
          fullName("Contact name"),
          jobTitle(),
          email("Email"),
          phone(),
          address("Mailing address"),
          yesno("Have you had a grant from us before?"),
          text("Which grant, and when?", { show: when("Have you had a grant from us before?", "is", true) }),
        ],
        skip: go("What are you applying for?", "is", "General operating support", "Budget"),
      },
      {
        title: "Project",
        fields: [
          text("Project name", { required: true }),
          long("What will it do?", { required: true }),
          long("Who will it serve?", { required: true }),
          num("About how many people will it reach?", { min: 0 }),
          range("Project dates"),
        ],
      },
      {
        title: "Budget",
        fields: [
          money("Amount requested", { required: true }),
          money("Total budget for this work", { required: true }),
          one("Your organization's yearly budget", ["Under $100,000", "$100,000–$500,000", "$500,000–$1M", "$1M–$5M", "Over $5M"]),
          long("How will you use the money?", { required: true }),
          long("Other funding you have or have asked for"),
        ],
      },
      {
        title: "Outcomes",
        fields: [long("What will change because of this grant?", { required: true }), long("How will you measure success?", { required: true }), long("How will the work go on after the grant?")],
      },
      {
        title: "Uploads",
        fields: [files("Budget", { required: true }), file("Proof of nonprofit status"), file("Latest financial statement"), files("Letters of support")],
      },
      {
        title: "Certify",
        fields: [agree("The information in this application is true and complete."), agree("If funded, we will use the money as described."), text("Signer's name and title", { required: true }), sign("Signature")],
      },
    ],
    end: ["Application received", "We'll announce decisions by email."],
  }),
  tpl("nonprofit.program-intake", "nonprofit", "Program intake", ["intake"], "Enroll people in services.", {
    fields: [fullName(), email("Email", { required: false }), phone("Phone", { required: true }), long("What kind of help do you need?", { required: true }), num("People in household", { min: 1 }), files("Documents")],
    end: ["Received", "A caseworker will contact you."],
  }),
  tpl("nonprofit.event-rsvp", "nonprofit", "Event RSVP", ["registration"], "Simple RSVPs with guests and dietary needs.", {
    fields: [fullName(), email("Email"), one("Will you attend?", ["Yes", "No"], { required: true }), num("Guests", { min: 0, max: 10, show: when("Will you attend?", "is", "Yes") }), drop("Dietary needs", DIET, { show: when("Will you attend?", "is", "Yes") })],
    submit: "RSVP",
    end: ["Thanks for letting us know", "We'll send details before the event."],
  }),
];

export const HR = [
  tpl("hr.job-application", "hr", "Job application", ["application"], "Collect resumes and the basics for any role.", {
    featured: true,
    version: 2,
    cover: { title: "Job application", text: "About 10 minutes. Have your resume ready.", button: "Start" },
    resume: true,
    copy: true,
    pages: [
      {
        title: "About you",
        fields: [fullName(), email("Email"), phone("Phone", { required: true }), text("Where are you based?", { placeholder: "City and country" }), url("LinkedIn profile"), url("Portfolio or website")],
      },
      {
        title: "The role",
        fields: [
          text("Role applying for", { required: true }),
          one("Type of work", ["Full-time", "Part-time", "Contract", "Internship"], { required: true }),
          one("Where would you like to work?", ["In the office", "Remote", "Hybrid", "Any of these"]),
          date("Earliest start date"),
          text("Pay you're looking for"),
          one("Years of experience in this kind of work", ["None yet", "Under 1 year", "1–3 years", "3–5 years", "5–10 years", "Over 10 years"], { required: true }),
        ],
        skip: go("Years of experience in this kind of work", "is", "None yet", "Education"),
      },
      {
        title: "Experience",
        fields: [
          text("Current or most recent employer", { required: true }),
          text("Your job title there"),
          yesno("Do you work there now?"),
          long("What did you do there?"),
          long("Other experience that fits this role"),
        ],
      },
      {
        title: "Education",
        fields: [
          one("Highest level of education", ["High school or equivalent", "Some college", "Associate degree", "Bachelor's degree", "Master's degree", "Doctorate", "Other"]),
          text("School"),
          text("Field of study"),
          text("Licenses or certifications"),
        ],
      },
      {
        title: "A few questions",
        fields: [
          long("Why this role?", { required: true }),
          long("What work are you most proud of?"),
          yesno("Are you allowed to work in this country?", { required: true }),
          yesno("Will you need visa sponsorship?"),
        ],
      },
      {
        title: "Uploads and consent",
        fields: [
          file("Resume", { required: true }),
          file("Cover letter"),
          files("Work samples"),
          agree("The information I gave is true and complete."),
          agree("You may keep my application on file for other roles.", { required: false }),
        ],
      },
    ],
    submit: "Apply",
    end: ["Application received", "We'll be in touch about next steps."],
  }),
  tpl("hr.onboarding", "hr", "Employee onboarding", ["intake"], "New-hire details before day one.", {
    internal: true,
    version: 2,
    cover: { title: "Welcome aboard", text: "About 10 minutes. Have your tax form and bank details ready.", button: "Start" },
    resume: true,
    copy: true,
    pages: [
      {
        title: "You",
        fields: [fullName(), text("Name you go by"), email("Personal email"), phone(), date("Date of birth", { required: true }), address("Home address", { required: true })],
      },
      {
        title: "Pay and tax",
        fields: [
          files("Tax form", { required: true }),
          one("How would you like to be paid?", ["Direct deposit", "Paper check"], { required: true }),
          text("Bank name", { show: when("How would you like to be paid?", "is", "Direct deposit") }),
          files("Direct deposit form", { show: when("How would you like to be paid?", "is", "Direct deposit") }),
        ],
      },
      {
        title: "Emergency contact",
        fields: [text("Name", { required: true }), text("How are they related to you?"), phone2("Their phone", { required: true }), email2("Their email")],
      },
      {
        title: "Equipment and access",
        fields: [
          one("Where will you work?", ["Office", "Remote", "Hybrid"], { required: true }),
          { kind: "address", label: "Where should we ship your equipment?", show: when("Where will you work?", "any", ["Remote", "Hybrid"]) },
          one("Computer you'd like", ["Mac", "Windows", "No preference"]),
          long("Tools or accounts you'll need"),
          one("Shirt size", ["XS", "S", "M", "L", "XL", "XXL"]),
        ],
      },
      {
        title: "Policies",
        fields: [
          agree("I have read the employee handbook."),
          agree("I have read the code of conduct."),
          agree("I have read the IT and security policy."),
          yesno("May we share your photo and name on our team page?"),
        ],
      },
      {
        title: "Sign",
        fields: [agree("The information I gave is true and complete."), sign("Signature"), date("Today's date", { required: true })],
      },
    ],
    end: ["All set", "See you on your first day."],
  }),
  tpl("hr.engagement", "hr", "Employee engagement survey", ["survey"], "An anonymous pulse on how people feel.", {
    internal: true,
    version: 2,
    cover: { title: "Employee engagement survey", text: "About 5 minutes. Your answers are anonymous.", button: "Start" },
    pages: [
      {
        title: "Work",
        fields: [
          matrix("Your work", ["I know what's expected of me", "I have what I need to do my job", "My work feels meaningful", "My workload is manageable"], AGREE5, { required: true }),
          scale("How happy are you at work?", "Not happy", "Very happy", { required: true }),
          long("What gets in the way of your work?"),
        ],
      },
      {
        title: "Team",
        fields: [
          matrix("Your team", ["People on my team help each other", "I can speak up without worry", "We share information openly", "I feel respected"], AGREE5, { required: true }),
          long("What would help your team work better together?"),
          yesno("Do you report to a manager?", { required: true }),
        ],
        skip: go("Do you report to a manager?", "is", false, "Growth"),
      },
      {
        title: "Manager",
        fields: [
          matrix("Your manager", ["My manager supports me", "I get useful feedback", "My manager notices good work", "I can bring problems to my manager"], AGREE5, { required: true }),
          one("How often do you meet one to one?", ["Weekly", "Every two weeks", "Monthly", "Rarely", "Never"]),
          long("What should your manager keep doing or change?"),
        ],
      },
      {
        title: "Growth",
        fields: [
          matrix("Your growth", ["I'm learning new skills", "I see a future here", "I know how to move up", "I get the training I need"], AGREE5, { required: true }),
          yesno("Have you talked about your goals with someone here this year?"),
          long("What would help you grow here?"),
        ],
      },
      {
        title: "Wellbeing",
        fields: [
          matrix("Your wellbeing", ["I can balance work and life", "My stress at work is manageable", "I can take time off when I need it"], AGREE5, { required: true }),
          one("How often do you work past your usual hours?", ["Rarely", "Sometimes", "Often", "Almost always"]),
          long("What would help your wellbeing at work?"),
        ],
      },
      {
        title: "Comments",
        fields: [nps("How likely are you to recommend working here?", { required: true }), long("What would make work better?"), long("Anything else you'd like to share?")],
      },
    ],
    end: ["Thank you", "Your answers are anonymous."],
  }),
  tpl("hr.exit-interview", "hr", "Exit interview", ["survey", "feedback"], "Learn why people leave.", {
    internal: true,
    fields: [one("Main reason for leaving", ["Pay", "Growth", "Manager", "Workload", "Relocation", "Other"], { required: true }), stars("Rate your manager"), yesno("Would you work here again?"), long("What should we change?")],
    end: ["Thank you", "We wish you the best."],
  }),
  tpl("hr.time-off", "hr", "Time-off request", ["request"], "Simple leave requests.", {
    internal: true,
    fields: [fullName(), email("Email"), range("Dates", { required: true }), one("Type", ["Vacation", "Sick", "Personal", "Parental", "Other"], { required: true }), text("Notes")],
    end: ["Request sent", "Your manager will reply."],
  }),
  tpl("hr.360-feedback", "hr", "360 feedback", ["survey", "feedback"], "Peer feedback on strengths and growth.", {
    internal: true,
    fields: [text("Who is this about?", { required: true }), matrix("Rate", ["Communication", "Quality of work", "Teamwork", "Ownership"], ["Needs work", "Meets", "Exceeds"], { required: true }), long("Strengths"), long("Areas to grow")],
    end: ["Thanks", "Your feedback is shared without your name."],
  }),
  tpl("hr.interview-feedback", "hr", "Interview feedback", ["survey"], "Structured scorecards after interviews.", {
    internal: true,
    fields: [text("Candidate", { required: true }), text("Role", { required: true }), matrix("Scores", ["Skills", "Experience", "Communication", "Culture add"], ["1", "2", "3", "4", "5"], { required: true }), one("Decision", ["Strong yes", "Yes", "No", "Strong no"], { required: true }), long("Notes")],
    end: ["Saved", "Thanks for the scorecard."],
  }),
  tpl("hr.referral", "hr", "Employee referral", ["application"], "Let your team refer candidates.", {
    internal: true,
    fields: [fullName("Your name"), email("Your email"), text("Candidate name", { required: true }), text("Role", { required: true }), long("How do you know them?"), file("Resume")],
    end: ["Thanks for the referral", "Recruiting will reach out to the candidate."],
  }),
];

export const IT = [
  tpl("it.assessment", "it", "IT assessment request", ["lead", "request"], "Qualify businesses for managed IT.", {
    featured: true,
    fields: [fullName(), email(), company(undefined, { required: true }), phone(), num("Users", { required: true, min: 1, save: "users" }), num("Locations", { min: 1 }), text("Current IT provider"), many("Biggest issues", ["Slow computers", "Security worries", "Downtime", "Backups", "Email problems", "Cost"])],
    end: { title: "Thanks", text: "Book your free assessment.", booking: true },
  }),
  tpl("it.support-ticket", "it", "Support ticket", ["request"], "Clear tickets with device and urgency.", {
    fields: [fullName(), email("Email"), company(), drop("Device", ["Windows PC", "Mac", "Phone", "Printer", "Network", "Other"], { required: true }), long("Issue", { required: true }), one("Urgency", ["Low", "Normal", "High", "Everything is down"], { required: true }), file("Screenshot")],
    end: ["Ticket created", "A technician will respond shortly."],
  }),
  tpl("it.security-quiz", "it", "Security readiness quiz", ["quiz", "lead"], "A scored quiz that opens security conversations.", {
    fields: [
      yesno("Do all staff use multi-factor sign-in?", { required: true, points: [1, 0], options: ["Yes", "No"] }),
      yesno("Are backups tested every month?", { required: true, points: [1, 0], options: ["Yes", "No"] }),
      yesno("Do you train staff to spot phishing?", { required: true, points: [1, 0], options: ["Yes", "No"] }),
      yesno("Are computers updated automatically?", { required: true, points: [1, 0], options: ["Yes", "No"] }),
      yesno("Do you have a written incident plan?", { required: true, points: [1, 0], options: ["Yes", "No"] }),
      email(),
      company(),
    ],
    submit: "See my score",
    end: {
      title: "Your security score",
      text: "",
      score: [
        { min: 5, title: "Well protected", text: "You've covered the basics. Let's look at the next layer." },
        { min: 3, title: "Some gaps", text: "A few fixes would cut your risk a lot." },
        { min: 0, title: "At risk", text: "Let's close the biggest gaps first." },
      ],
      booking: true,
    },
  }),
  tpl("it.cloud-migration", "it", "Cloud migration intake", ["intake", "lead"], "Scope a move to the cloud.", {
    fields: [fullName(), email(), company(undefined, { required: true }), long("Current setup", { required: true }), text("Main apps"), one("Data size", ["Under 1 TB", "1–10 TB", "10–100 TB", "Over 100 TB"]), date("Deadline")],
    end: { title: "Thanks", text: "Book a planning call.", booking: true },
  }),
];
