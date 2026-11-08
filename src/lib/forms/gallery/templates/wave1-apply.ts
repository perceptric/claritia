// Wave 1, apply and join: memberships, enrollment, volunteers, grants, tenants, vendors, job applications, patient
// intake, project briefs and client onboarding, across coaching, creative, architecture, media, education, health,
// legal, faith, sports, government, security, agriculture and real estate.
import { address, agree, BUDGET, company, CONTACT_PREF, country, DAYPART, date, drop, email, file, files, fullName, go, HEARD, jobTitle, long, many, money, num, one, phone, phone2, range, rank, scale, sign, text, time, TIMELINE, tpl, url, website, when, yesno } from "./build.ts";

const ADDED = "2026-11-03";

const CARE_PROGRAMS = ["Infant", "Toddler", "Preschool", "Before and after school"];
const IMMIGRATION_HISTORY = ["Denied a visa or entry to the US", "Stayed past the date on a visa", "Been in immigration court or deported", "Been arrested or charged with a crime", "None of these"];

export const WAVE1_APPLY = [
  // Coaching
  tpl("coaching.new-client-intake", "coaching", "New client intake", ["intake"], "Goals, history and logistics before the first coaching session.", {
    cats: "client-onboarding intake",
    teams: "founders operations",
    added: ADDED,
    intro: "A few questions so our first session can start with you.",
    pages: [
      { title: "About you", fields: [fullName(), email("Email"), phone(), jobTitle("What do you do for work?")] },
      {
        title: "Your goals",
        fields: [
          long("What do you want to change in the next 6 months?", { required: true }),
          many("Areas to focus on", ["Career", "Leadership", "Business", "Health and energy", "Relationships", "Money", "Confidence"], { required: true, save: "focus_areas" }),
          long("What has gotten in the way so far?"),
          yesno("Have you worked with a coach before?"),
          long("What worked and what didn't?", { show: when("Have you worked with a coach before?", "is", true) }),
          scale("How ready are you to make changes now?", "Not yet", "Fully ready"),
          one("Session format", ["Video call", "Phone", "In person"], { save: "session_format" }),
          many("Best times for sessions", DAYPART),
        ],
      },
    ],
    submit: "Send my intake",
    end: ["Thanks, you're all set", "Your coach will read this before your first session."],
  }),
  tpl("coaching.program-application", "coaching", "Coaching program application", ["application", "lead"], "Screen applicants for a coaching program before the first call.", {
    cats: "application enrollment qualify",
    teams: "sales founders",
    added: ADDED,
    intro: "Tell us where you are and where you want to go. It takes about five minutes.",
    fields: [
      fullName(),
      email("Email"),
      phone(),
      one("What best describes you?", ["Employee", "Manager or leader", "Business owner", "Freelancer", "Between roles"], { required: true, save: "client_type" }),
      long("Where are you now, and where do you want to be in a year?", { required: true }),
      one("Biggest challenge right now", ["Clarity on direction", "Time and focus", "Growing a business", "Leading a team", "Confidence", "Other"], { required: true }),
      yesno("Can you commit about 2 hours a week?", { required: true }),
      one("How soon do you want to start?", ["This month", "Within 3 months", "Later this year"], { save: "timeline" }),
      one("Investment you're ready to make", ["Under $1,000", "$1,000–$3,000", "$3,000–$7,500", "Over $7,500"], { save: "budget" }),
    ],
    submit: "Apply",
    end: { title: "Thanks for applying", text: "Pick a time for a short call to see if the program fits.", booking: true },
  }),

  // Creative
  tpl("creative.video-brief", "creative", "Video project brief", ["request", "intake"], "Scope a video project: purpose, length, extras and deadline.", {
    cats: "brief quote",
    teams: "sales operations",
    subs: "video",
    added: ADDED,
    pages: [
      {
        title: "The project",
        fields: [
          fullName(),
          email("Email"),
          company(),
          one("Type of video", ["Brand film", "Product video", "Testimonial", "Event coverage", "Social clips", "Training", "Other"], { required: true, save: "video_type" }),
          long("What should viewers do or feel after watching?", { required: true }),
          many("Where will it be shown?", ["Website", "Social media", "Paid ads", "TV", "Internal", "Event screen"]),
        ],
      },
      {
        title: "Details",
        fields: [
          one("Final length", ["Under 30 seconds", "30 to 90 seconds", "2 to 5 minutes", "Longer"]),
          many("Extras needed", ["Script writing", "Actors or voiceover", "Drone shots", "Music licensing", "Subtitles", "Motion graphics"]),
          date("Delivery deadline", { required: true }),
          one("Budget", ["Under $2,500", "$2,500–$10,000", "$10,000–$25,000", "Over $25,000"], { save: "budget" }),
          files("Reference videos or brand files"),
        ],
      },
    ],
    submit: "Send brief",
    end: ["Thanks for the brief", "We'll send a quote and a rough plan within two business days."],
  }),

  // Architecture and design
  tpl("architecture.design-brief", "architecture", "Home design brief", ["intake", "request"], "Rooms, style and priorities for a new home or remodel.", {
    cats: "brief questionnaire",
    teams: "operations founders",
    added: ADDED,
    pages: [
      {
        title: "The project",
        fields: [
          fullName(),
          email("Email"),
          one("Project type", ["New home", "Addition", "Full remodel", "Kitchen or bath", "Outdoor space"], { required: true, save: "project_type" }),
          num("Bedrooms you need", { min: 0, half: true }),
          num("Bathrooms you need", { min: 0, half: true }),
          many("Rooms and spaces you want", ["Home office", "Open kitchen", "Mudroom", "Guest suite", "Gym", "Media room", "Workshop", "Covered patio"]),
        ],
      },
      {
        title: "Style and priorities",
        fields: [
          many("Styles you like", ["Modern", "Farmhouse", "Traditional", "Mid-century", "Craftsman", "Minimal", "Not sure"]),
          rank("Rank your priorities", ["Natural light", "Storage", "Energy efficiency", "Low upkeep", "Room for guests", "Outdoor living"]),
          long("What don't you like about your current home?"),
          files("Photos or sketches you like"),
        ],
      },
    ],
    end: ["Brief received", "Your architect will review it before your first design meeting."],
  }),
  tpl("architecture.project-intake", "architecture", "Architecture project intake", ["lead", "intake"], "Qualify new projects by site, scope, budget and timing.", {
    cats: "intake client-onboarding brief",
    teams: "sales founders",
    added: ADDED,
    pages: [
      { title: "Contact", fields: [fullName(), email("Email"), phone(), company("Company (if any)")] },
      {
        title: "Project",
        fields: [
          one("Project type", ["Residential", "Commercial", "Mixed use", "Interior only", "Landscape"], { required: true, save: "project_type" }),
          address("Site address"),
          yesno("Do you own the site?"),
          num("Approximate size (square feet)", { min: 0 }),
          many("Services needed", ["Design", "Permit drawings", "Interior design", "Construction oversight", "Feasibility study"], { save: "services" }),
          one("Construction budget", ["Under $250,000", "$250,000–$750,000", "$750,000–$2 million", "Over $2 million", "Not sure yet"], { save: "budget" }),
          one("When do you want to start building?", TIMELINE, { save: "timeline" }),
          long("Tell us about the project"),
        ],
      },
    ],
    end: { title: "Thanks", text: "Pick a time for a first call with our team.", booking: true },
  }),

  // Media
  tpl("media.contributor-application", "media", "Contributor application", ["application"], "Find freelance writers by beat, samples and a first pitch.", {
    cats: "job-application application vendor",
    teams: "operations recruiting",
    added: ADDED,
    fields: [
      fullName(),
      email("Email"),
      url("Portfolio or clips page"),
      many("Topics you cover", ["News", "Business", "Technology", "Culture", "Food", "Travel", "Health", "Sports", "Opinion"], { required: true, save: "beats" }),
      many("Formats", ["Articles", "Reported features", "Newsletters", "Podcasts", "Video", "Photography"]),
      one("Years of experience", ["Under 1", "1 to 3", "4 to 7", "8 or more"]),
      one("How often could you contribute?", ["Weekly", "A few times a month", "Monthly", "Now and then"]),
      files("Two or three writing samples", { required: true }),
      long("Pitch us one story", { required: true }),
    ],
    submit: "Apply",
    end: ["Application received", "Our editors review new contributors every two weeks."],
  }),
  tpl("media.advertiser-brief", "media", "Advertiser brief", ["request", "lead"], "Take sponsor briefs with goals, audience, run dates and budget.", {
    cats: "brief sponsorship",
    teams: "sales",
    added: ADDED,
    pages: [
      {
        title: "About you",
        fields: [
          fullName(),
          email(),
          company(undefined, { required: true, half: true }),
          website(undefined, { half: true }),
        ],
      },
      {
        title: "Your campaign",
        fields: [
          many("Placements you want", ["Newsletter sponsorship", "Sponsored article", "Podcast ad", "Display ads", "Social posts", "Event sponsorship"], { required: true, save: "placements" }),
          one("Main goal", ["Brand awareness", "Website visits", "Sign-ups or leads", "Sales", "Event attendance"], { required: true }),
          long("Who do you want to reach?"),
          range("Run dates", { required: true }),
          one("Budget", BUDGET, { save: "budget" }),
          files("Brand guidelines or creative"),
        ],
      },
    ],
    end: { title: "Thanks for the brief", text: "Book a call to plan the campaign with our ad team.", booking: true },
  }),

  // Education
  tpl("education.childcare-enrollment", "education", "Childcare enrollment", ["application", "registration"], "Enroll children with schedules, contacts and care needs.", {
    version: 2,
    phi: true,
    cats: "enrollment application",
    teams: "teachers operations",
    subs: "childcare",
    added: ADDED,
    cover: { title: "Enroll your child", text: "About 10 minutes. Have your child's doctor and immunization details ready.", button: "Start" },
    resume: true,
    copy: true,
    pages: [
      {
        title: "Your child",
        fields: [
          text("Child's full name", { required: true }),
          date("Child's date of birth", { required: true }),
          one("Program", CARE_PROGRAMS, { required: true, save: "program" }),
          one("How many children are you enrolling?", ["1", "2", "3 or more"], { required: true, key: "children", points: [1, 2, 3] }),
        ],
      },
      {
        title: "Parents",
        fields: [
          fullName("Parent or guardian name"),
          email("Email"),
          phone("Phone", { required: true }),
          address("Home address", { required: true }),
          one("Relationship to the child", ["Mother", "Father", "Guardian", "Other"]),
          text("Second parent or guardian name"),
          phone2("Second parent or guardian phone"),
        ],
        skip: go("children", "is", "1", "Health and allergies"),
      },
      {
        title: "Second child",
        fields: [
          text("Second child's full name", { required: true }),
          date("Second child's date of birth", { required: true }),
          one("Second child's program", CARE_PROGRAMS, { required: true }),
          long("Other children's names, birth dates and programs", { show: when("children", "is", "3 or more") }),
        ],
      },
      {
        title: "Health and allergies",
        fields: [
          yesno("Any allergies?", { required: true }),
          long("Allergies and what to do if there's a reaction", { required: true, show: when("Any allergies?", "is", true) }),
          long("Medical conditions or daily medicines"),
          text("Doctor's name and phone"),
          yesno("Are immunizations up to date?"),
          file("Immunization record"),
        ],
      },
      {
        title: "Schedule",
        fields: [
          many("Days needed", ["Mon", "Tue", "Wed", "Thu", "Fri"], { required: true }),
          one("Schedule", ["Full day", "Half day mornings", "Half day afternoons"], { required: true }),
          date("Start date", { required: true }),
          time("Usual drop-off time", { half: true }),
          time("Usual pickup time", { half: true }),
        ],
      },
      {
        title: "Pickup and consent",
        fields: [
          long("Other people allowed to pick up", { placeholder: "Name, relationship and phone for each" }),
          text("Emergency contact name", { required: true, half: true }),
          phone2("Emergency contact phone", { required: true, half: true }),
          yesno("May we include your child in photos we share with families?"),
          agree("If I can't be reached, staff may get emergency medical care for my child."),
          agree("I've read the parent handbook and agree to its policies."),
          sign("Parent or guardian signature"),
        ],
      },
      {
        title: "Deposit",
        fields: [
          one("How would you like to be billed?", ["Weekly", "Every two weeks", "Monthly"], { required: true }),
          { kind: "calc", label: "Deposit today, $100 a child", key: "deposit", formula: "{children} * 100", format: "money", currency: "USD" },
          { kind: "payment", label: "Pay the deposit", from: "deposit", currency: "USD" },
        ],
      },
    ],
    submit: "Send and pay the deposit",
    end: ["Application received", "We'll confirm a spot or add you to the waitlist within a week."],
  }),
  tpl("education.course-enrollment", "education", "Course enrollment", ["registration", "order"], "Enroll students in a course and take payment in one step.", {
    version: 2,
    cats: "enrollment registration payment",
    teams: "teachers operations",
    subs: "online-courses",
    added: ADDED,
    pages: [
      {
        title: "Course",
        fields: [
          one("Course", ["Beginner course ($199)", "Intermediate course ($299)", "Advanced course ($399)"], { required: true, key: "course", points: [199, 299, 399], save: "course" }),
          one("Format", ["Live online", "Self-paced"], { required: true }),
          long("What do you hope to get from the course?"),
        ],
      },
      {
        title: "Level check",
        fields: [
          one("Experience with the subject", ["None", "Some", "A lot"], { required: true }),
          yesno("Have you taken a course like this before?"),
          scale("How sure are you of the basics?", "Not at all", "Very sure"),
          num("Hours a week you can study", { min: 1, max: 40 }),
        ],
      },
      {
        title: "About you",
        fields: [fullName(), email("Email"), phone(), company("Company or school"), drop("How did you hear about us?", HEARD)],
        skip: go("Format", "is", "Self-paced", "Payment"),
      },
      {
        title: "Schedule",
        fields: [
          many("Class times that work for you", ["Weekday mornings", "Weekday evenings", "Saturdays"], { required: true }),
          text("Your time zone", { required: true, placeholder: "Eastern Time" }),
          long("Class dates you know you'll miss"),
        ],
      },
      {
        title: "Payment",
        fields: [
          many("Add-ons", ["One-on-one coaching session ($75)", "Printed workbook ($25)", "Certificate of completion ($15)"], { key: "addons", points: [75, 25, 15] }),
          { kind: "calc", label: "Total", key: "total", formula: "ifempty({course}, 0) + ifempty({addons}, 0)", format: "money", currency: "USD" },
          agree("I agree to the course terms and refund policy."),
          { kind: "payment", label: "Pay for the course", from: "total", currency: "USD" },
        ],
      },
    ],
    submit: "Enroll",
    end: ["You're enrolled", "Your receipt and course access are on the way by email."],
  }),

  // Healthcare
  tpl("healthcare.pediatric-intake", "healthcare", "Pediatric patient intake", ["intake"], "Health history for a new child patient, filled in by a parent.", {
    phi: true,
    cats: "patient-intake intake",
    teams: "care operations",
    subs: "clinics",
    added: ADDED,
    pages: [
      { title: "Child and parent", fields: [text("Child's name", { required: true }), date("Child's date of birth", { required: true }), fullName("Parent or guardian"), email("Email"), phone("Phone", { required: true })] },
      {
        title: "Health history",
        fields: [
          long("Current medicines"),
          long("Allergies"),
          yesno("Are vaccines up to date?", { required: true }),
          many("Has your child had any of these?", ["Asthma", "Ear infections", "Eczema", "Seizures", "Heart problems", "None of these"]),
          file("Vaccine record"),
        ],
      },
      { title: "Consent", fields: [agree("I am this child's parent or legal guardian."), sign("Signature")] },
    ],
    end: ["Intake complete", "Thank you. We'll see you and your child at the visit."],
  }),
  tpl("healthcare.physical-therapy-intake", "healthcare", "Physical therapy intake", ["intake"], "Pain, injury details and goals before the first therapy visit.", {
    phi: true,
    cats: "patient-intake intake",
    teams: "care",
    subs: "physical-therapy",
    added: ADDED,
    pages: [
      { title: "About you", fields: [fullName(), date("Date of birth", { required: true }), email("Email"), phone("Phone", { required: true })] },
      {
        title: "Your injury",
        fields: [
          many("Where is the pain?", ["Neck", "Shoulder", "Back", "Hip", "Knee", "Ankle or foot", "Wrist or hand", "Other"], { required: true }),
          one("How did it start?", ["Injury or fall", "Sports", "After surgery", "Slowly over time", "Not sure"], { required: true }),
          date("When did it start?"),
          scale("Pain on a bad day", "No pain", "Worst pain", { required: true, max: 10 }),
          yesno("Did a doctor refer you?"),
          text("Referring doctor", { show: when("Did a doctor refer you?", "is", true) }),
          many("What is hard to do right now?", ["Walking", "Stairs", "Sleeping", "Lifting", "Sitting", "Work tasks", "Sports"]),
          long("What do you want to get back to doing?"),
        ],
      },
    ],
    end: ["Intake complete", "Your therapist will review this before your first visit."],
  }),
  tpl("healthcare.home-care-assessment", "healthcare", "Home care needs assessment", ["intake", "lead"], "Learn a loved one's care needs before a home visit.", {
    phi: true,
    cats: "patient-intake intake consultation",
    teams: "care sales",
    subs: "home-care",
    added: ADDED,
    pages: [
      {
        title: "About you",
        fields: [fullName("Your name"), email("Email"), phone("Phone", { required: true }), one("Who needs care?", ["Myself", "A parent", "A spouse or partner", "Another family member", "A client"], { required: true })],
      },
      {
        title: "Care needs",
        fields: [
          text("Name of the person who needs care", { show: when("Who needs care?", "not", "Myself") }),
          many("Help needed with", ["Bathing and dressing", "Meals", "Medicines", "Getting around", "Housekeeping", "Rides to appointments", "Company", "Memory care"], { required: true, save: "care_needs" }),
          long("Health conditions we should know about"),
          one("Hours of care per week", ["Under 10", "10 to 20", "20 to 40", "Over 40", "Live-in"], { required: true, save: "care_hours" }),
          date("When should care start?"),
          address("Where will care take place?"),
        ],
      },
    ],
    end: { title: "Thank you", text: "Pick a time for a free in-home assessment.", booking: true },
  }),

  // Dental and wellness
  tpl("wellness.dental-history", "wellness", "Dental health history", ["intake"], "Medical and dental history from new patients before the visit.", {
    phi: true,
    cats: "patient-intake intake",
    teams: "care operations",
    subs: "dental",
    added: ADDED,
    pages: [
      { title: "About you", fields: [fullName(), date("Date of birth", { required: true }), email("Email"), phone("Phone", { required: true })] },
      {
        title: "Dental history",
        fields: [date("Date of your last dental visit"), many("Any of these now?", ["Tooth pain", "Bleeding gums", "Sensitivity to hot or cold", "Jaw pain", "Dry mouth", "None"])],
      },
      {
        title: "Medical history",
        fields: [
          many("Do you have any of these?", ["Heart condition", "Diabetes", "High blood pressure", "Bleeding problems", "Joint replacement", "None of these"], { required: true }),
          long("Medicines you take"),
          many("Allergies", ["Penicillin", "Latex", "Local anesthetic", "Aspirin", "None"]),
          yesno("Are you pregnant or could you be?"),
          agree("The information above is true and complete."),
          sign("Signature"),
        ],
      },
    ],
    end: ["Thank you", "Your history is on file. We'll see you at your visit."],
  }),
  tpl("wellness.chiropractic-intake", "wellness", "Chiropractic intake", ["intake"], "Pain areas, causes and insurance for new chiropractic patients.", {
    phi: true,
    cats: "patient-intake intake",
    teams: "care",
    subs: "chiropractic",
    added: ADDED,
    pages: [
      { title: "About you", fields: [fullName(), email("Email"), phone("Phone", { required: true }), date("Date of birth", { required: true })] },
      {
        title: "Your visit",
        fields: [
          long("Main reason for your visit", { required: true }),
          many("Where do you feel it?", ["Neck", "Upper back", "Lower back", "Shoulders", "Hips", "Headaches", "Arms or hands", "Legs or feet"], { required: true }),
          one("How often?", ["All the time", "Every day", "A few times a week", "Now and then"], { required: true }),
          scale("How bad is it today?", "Mild", "Severe", { required: true }),
          yesno("Was this caused by a car accident or work injury?"),
          text("Claim or case number", { show: when("Was this caused by a car accident or work injury?", "is", true) }),
          yesno("Have you seen a chiropractor before?"),
          text("Insurance provider"),
        ],
      },
    ],
    end: ["Intake complete", "Thanks. We'll go over this with you at your first visit."],
  }),
  tpl("wellness.nutrition-intake", "wellness", "Nutrition client intake", ["intake"], "Eating habits, health goals and diet before a nutrition consult.", {
    version: 2,
    phi: true,
    cats: "client-onboarding intake",
    teams: "care",
    subs: "nutrition",
    added: ADDED,
    cover: { title: "Nutrition intake", text: "About 8 minutes. Your dietitian reads this before your first session.", button: "Start" },
    pages: [
      { title: "About you", fields: [fullName(), email("Email"), phone(), date("Date of birth"), one("Best way to reach you", CONTACT_PREF)] },
      {
        title: "Your diet",
        fields: [
          many("Diet you follow", ["No special diet", "Vegetarian", "Vegan", "Gluten free", "Dairy free", "Low carb", "Other"]),
          long("Food allergies or foods you avoid"),
          long("What does a usual day of eating look like?", { placeholder: "Breakfast, lunch, dinner and snacks" }),
          one("Meals you cook at home each week", ["0 to 3", "4 to 7", "8 to 14", "15 or more"]),
          one("Meals you eat out or order in each week", ["0 to 2", "3 to 5", "6 to 10", "More than 10"]),
          one("Water most days", ["Under 4 cups", "4 to 8 cups", "Over 8 cups"]),
        ],
      },
      {
        title: "Activity",
        fields: [
          one("How active are you most days?", ["Mostly sitting", "Lightly active", "Active", "Very active"]),
          many("Exercise you do", ["Walking", "Running", "Strength training", "Cycling", "Swimming", "Yoga", "Team sports", "None right now"]),
          one("Sleep most nights", ["Under 6 hours", "6 to 7 hours", "7 to 8 hours", "Over 8 hours"]),
          scale("How is your energy most days?", "Very low", "Very high"),
          scale("How stressed do you feel most days?", "Not at all", "Very"),
        ],
      },
      {
        title: "Health",
        fields: [
          text("Height", { half: true }),
          text("Weight", { half: true }),
          many("Do any of these apply to you?", ["Diabetes or prediabetes", "High blood pressure", "High cholesterol", "Digestive problems", "Pregnant or breastfeeding", "History of an eating disorder", "None of these"]),
          long("Health conditions and medicines"),
          long("Vitamins or supplements you take"),
          yesno("Did a doctor refer you to us?"),
          text("Doctor's name and phone", { show: when("Did a doctor refer you to us?", "is", true) }),
        ],
      },
      {
        title: "Goals",
        fields: [
          many("Main goals", ["Lose weight", "Gain weight", "More energy", "Manage blood sugar", "Gut health", "Sports performance", "Eat healthier as a family"], { required: true, save: "nutrition_goals" }),
          long("What would you like to be different in 3 months?"),
          one("What gets in the way most?", ["Time", "Cost", "Cravings", "Family meals", "Not knowing what to eat", "Other"]),
          scale("How ready do you feel to make changes?", "Not yet", "Very ready"),
        ],
      },
      {
        title: "Your first session",
        fields: [
          one("How would you like to meet?", ["In person", "Video call", "Phone"], { required: true }),
          long("Anything else your dietitian should know?"),
          drop("How did you hear about us?", HEARD),
          agree("My dietitian may use these answers to plan my care."),
        ],
      },
    ],
    end: { title: "Thanks, you're all set", text: "Pick a time for your first session, or we'll reach out to set one up.", booking: true },
  }),

  // Legal
  tpl("legal.family-law-intake", "legal", "Family law intake", ["intake", "lead"], "Divorce, custody and support details before a consultation.", {
    cats: "client-onboarding intake consultation",
    teams: "operations founders",
    subs: "family-law",
    added: ADDED,
    pages: [
      {
        title: "About you",
        fields: [fullName(), email("Email"), phone("Phone", { required: true }), one("Best way to reach you", CONTACT_PREF), yesno("Is it safe to leave messages at this number?", { required: true })],
      },
      {
        title: "Your matter",
        fields: [
          one("What do you need help with?", ["Divorce", "Child custody", "Child support", "Spousal support", "Adoption", "Protective order", "Other"], { required: true, save: "matter_type" }),
          text("Other party's full name", { required: true }),
          num("Children under 18", { min: 0 }),
          yesno("Has a case already been filed?"),
          text("Court and case number", { show: when("Has a case already been filed?", "is", true) }),
          long("Briefly, what is happening?", { required: true }),
        ],
      },
    ],
    end: { title: "Thank you", text: "Pick a time for your consultation.", booking: true },
  }),
  tpl("legal.immigration-intake", "legal", "Immigration intake", ["intake", "lead"], "Status, goals and key dates for new immigration clients.", {
    version: 2,
    cats: "client-onboarding intake",
    teams: "operations",
    subs: "immigration",
    added: ADDED,
    cover: { title: "Immigration intake", text: "About 10 minutes. Have your passport and any letters from immigration nearby.", button: "Start" },
    resume: true,
    copy: true,
    pages: [
      {
        title: "About you",
        fields: [
          fullName(),
          email("Email"),
          phone("Phone", { required: true }),
          yesno("Is it safe to leave messages at this number?"),
          date("Date of birth", { required: true }),
          country("Country of citizenship", { required: true }),
          drop("Preferred language", ["English", "Spanish", "Chinese", "Hindi", "Arabic", "French", "Portuguese", "Other"]),
        ],
      },
      {
        title: "Your status",
        fields: [
          one("What do you need help with?", ["Family visa", "Work visa", "Green card", "Citizenship", "Asylum", "Student visa", "Removal defense", "Other"], { required: true, save: "case_type" }),
          one("Current status in the US", ["Visitor", "Student", "Work visa", "Green card holder", "No current status", "Outside the US"], { required: true }),
          date("When does your current status end?", { show: when("Current status in the US", "any", ["Visitor", "Student", "Work visa"]) }),
          date("Date of your last entry to the US", { show: when("Current status in the US", "not", "Outside the US") }),
          yesno("Do you have a court date?", { required: true }),
          date("Court date", { show: when("Do you have a court date?", "is", true) }),
        ],
      },
      {
        title: "Family",
        fields: [
          one("Marital status", ["Single", "Married", "Divorced", "Widowed"], { required: true }),
          text("Spouse's full name", { show: when("Marital status", "is", "Married") }),
          drop("Spouse's status", ["US citizen", "Green card holder", "Visa holder", "No current status", "Lives outside the US"], { show: when("Marital status", "is", "Married") }),
          num("Number of children", { min: 0, max: 20 }),
          long("Children's names, birth dates and where they live", { show: when("Number of children", "gte", 1) }),
          long("Parents, children or siblings who are US citizens or green card holders"),
        ],
      },
      {
        title: "History",
        fields: [
          many("Has any of this happened to you?", IMMIGRATION_HISTORY, { required: true }),
          long("Tell us what happened and when", { show: when("Has any of this happened to you?", "any", IMMIGRATION_HISTORY.slice(0, -1)) }),
          long("Visas or green cards you've applied for before"),
        ],
      },
      {
        title: "Documents",
        fields: [
          files("Passport and visa pages"),
          files("Letters or notices from immigration or the court"),
          files("Other documents about your case"),
          long("Anything else we should know?"),
        ],
      },
      {
        title: "Consent",
        fields: [
          agree("The information I've given is true to the best of my knowledge."),
          agree("I understand that sending this form doesn't make me a client of the firm."),
          sign("Signature"),
        ],
      },
    ],
    end: { title: "Thank you", text: "Pick a time to talk with an attorney about your case.", booking: true },
  }),

  // Faith communities
  tpl("faith.membership", "faith", "Membership form", ["registration"], "Welcome new members with family details and ways to serve.", {
    cats: "membership volunteer",
    teams: "volunteers operations",
    added: ADDED,
    pages: [
      {
        title: "About you",
        fields: [
          fullName(),
          email("Email"),
          phone(),
          address(),
        ],
      },
      {
        title: "Joining",
        fields: [
          num("Family members joining with you", { min: 0 }),
          text("Their names", { show: when("Family members joining with you", "gte", 1) }),
          one("How are you joining?", ["New to the faith", "Moving from another congregation", "Returning", "Other"]),
          one("How long have you been attending?", ["Under 6 months", "6 to 12 months", "1 to 3 years", "Over 3 years"]),
          many("Ways you'd like to serve", ["Greeting", "Music", "Children and youth", "Meals", "Outreach", "Tech and media", "Prayer team", "Facilities"], { save: "serve_areas" }),
          yesno("Would you like a call from a leader?"),
        ],
      },
    ],
    submit: "Become a member",
    end: ["Welcome", "Someone from our team will reach out this week."],
  }),

  // Sports clubs
  tpl("sports.club-membership", "sports", "Club membership", ["registration", "order"], "Sign up club members, pick a plan and pay dues online.", {
    cats: "membership registration payment",
    teams: "operations volunteers",
    added: ADDED,
    pages: [
      {
        title: "Member",
        fields: [
          fullName(),
          email("Email"),
          phone("Phone", { required: true }),
          date("Date of birth", { required: true }),
          one("Playing level", ["New to the sport", "Recreational", "Competitive"]),
          text("Emergency contact name and phone", { required: true }),
        ],
      },
      {
        title: "Plan and dues",
        fields: [
          one("Membership", ["Adult ($180 a year)", "Junior under 18 ($90 a year)", "Family ($320 a year)", "Social ($60 a year)"], { required: true, key: "plan", points: [180, 90, 320, 60], save: "membership_plan" }),
          text("Family members to include", { show: when("plan", "is", "Family ($320 a year)") }),
          many("Add-ons", ["Locker ($40)", "Club shirt ($25)", "Coaching clinic pass ($60)"], { key: "addons", points: [40, 25, 60] }),
          { kind: "calc", label: "Total due", key: "total", formula: "ifempty({plan}, 0) + ifempty({addons}, 0)", format: "money", currency: "USD" },
          agree("I agree to the club rules and code of conduct."),
          { kind: "payment", label: "Pay your dues", from: "total", currency: "USD" },
        ],
      },
    ],
    submit: "Join and pay",
    end: ["Welcome to the club", "Your receipt and member details are on the way by email."],
  }),
  tpl("sports.coach-application", "sports", "Coach application", ["application"], "Recruit paid and volunteer coaches with experience and checks.", {
    cats: "job-application volunteer application",
    teams: "volunteers recruiting",
    added: ADDED,
    pages: [
      {
        title: "Your details",
        fields: [
          fullName(),
          email("Email"),
          phone("Phone", { required: true }),
        ],
      },
      {
        title: "Coaching",
        fields: [
          one("Role", ["Head coach", "Assistant coach", "Team manager"], { required: true }),
          one("Paid or volunteer?", ["Paid", "Volunteer", "Either"], { required: true }),
          many("Age groups you'd coach", ["Under 8", "8 to 11", "12 to 14", "15 to 18", "Adults"], { required: true }),
          long("Coaching and playing experience", { required: true }),
          many("Certificates you hold", ["First aid and CPR", "Safeguarding", "Coaching license", "Concussion training", "None yet"]),
          many("Days you're free", ["Weekday evenings", "Saturdays", "Sundays"]),
          agree("I agree to a background check."),
        ],
      },
    ],
    submit: "Apply",
    end: ["Application received", "Our coaching director will be in touch within a week."],
  }),
  tpl("sports.fee-assistance", "sports", "Player fee assistance", ["application"], "Let families ask for help with registration fees, in private.", {
    cats: "grant application",
    teams: "volunteers finance",
    added: ADDED,
    fields: [
      fullName("Parent or guardian name"),
      email("Email"),
      phone(),
      text("Player's name", { required: true }),
      one("Program", ["Recreational", "Travel team", "Camp or clinic"], { required: true }),
      num("Players in your family registering", { min: 1 }),
      one("Help requested", ["Full fee", "Half the fee", "A payment plan"], { required: true, save: "aid_requested" }),
      many("Does your family get any of these?", ["Free or reduced school lunch", "Food assistance", "Housing assistance", "None of these"]),
      long("Anything else you'd like us to know?"),
    ],
    submit: "Send request",
    end: ["Request received", "Requests stay private. We'll reply before registration closes."],
  }),

  // Government
  tpl("government.vendor-permit", "government", "Street vendor permit application", ["application", "order"], "License street and event vendors, with documents and the fee.", {
    cats: "application vendor payment",
    teams: "operations",
    added: ADDED,
    pages: [
      {
        title: "Applicant",
        fields: [fullName("Applicant name"), email("Email"), phone("Phone", { required: true }), company("Business name"), address("Mailing address", { required: true })],
      },
      {
        title: "Permit",
        fields: [
          one("Permit type", ["Food cart or truck", "Goods and crafts", "Flowers", "Services", "Event only"], { required: true, save: "permit_type" }),
          one("Permit length", ["One day", "30 days", "One year"], { required: true }),
          text("Where do you plan to sell?"),
          files("Photo ID, health permit and tax certificate", { required: true }),
        ],
      },
      {
        title: "Sign and pay",
        fields: [agree("I will follow all city vending rules."), sign("Signature"), { kind: "payment", label: "Pay the $50 application fee", amount: 50, currency: "USD" }],
      },
    ],
    submit: "Submit application",
    end: ["Application received", "We'll review it within 10 business days and email your permit or next steps."],
  }),
  tpl("government.small-business-grant", "government", "Small business grant application", ["application"], "Take local business grant applications with plans and records.", {
    cats: "grant application eligibility",
    teams: "operations finance",
    added: ADDED,
    pages: [
      {
        title: "Business",
        fields: [
          fullName("Owner name"),
          email("Email"),
          phone("Phone", { required: true }),
          company("Business name", { required: true }),
          address("Business address", { required: true }),
          num("Employees", { min: 0 }),
          one("Years in business", ["Under 1", "1 to 3", "3 to 10", "Over 10"], { required: true }),
        ],
      },
      {
        title: "Request",
        fields: [
          money("Amount requested", { required: true, min: 1, save: "grant_amount" }),
          many("How will you use the grant?", ["Equipment", "Storefront repairs", "Hiring", "Marketing", "Rent support", "Training"], { required: true }),
          long("How will this grant help your business grow?", { required: true }),
          files("Recent tax return or financial statement", { required: true }),
          agree("I confirm the business is located in the city and in good standing."),
        ],
      },
    ],
    end: ["Application received", "We'll email you when the review panel has made its decision."],
  }),

  // Security
  tpl("security.guard-application", "security", "Security officer application", ["application"], "Hire security officers by license, shifts and experience.", {
    cats: "job-application application",
    teams: "recruiting operations",
    added: ADDED,
    pages: [
      { title: "About you", fields: [fullName(), email("Email"), phone("Phone", { required: true }), text("City you live in"), file("Resume")] },
      {
        title: "License and experience",
        fields: [
          yesno("Do you hold a current guard license?", { required: true }),
          text("License number and state", { show: when("Do you hold a current guard license?", "is", true) }),
          num("Years of security experience", { min: 0 }),
          many("Experience in", ["Retail", "Office buildings", "Events", "Hospitals", "Schools", "Construction sites", "Patrol"]),
          many("Shifts you can work", ["Days", "Nights", "Overnight", "Weekends"], { required: true }),
          yesno("Do you have a driver's license and a car?"),
          agree("I agree to a background check and drug test."),
        ],
      },
    ],
    submit: "Apply",
    end: ["Application received", "If you're a fit, we'll call to set up an interview."],
  }),

  // Agriculture
  tpl("agriculture.market-vendor", "agriculture", "Farmers market vendor application", ["application"], "Review market vendors by products, farm practices and stall needs.", {
    cats: "vendor application",
    teams: "operations",
    added: ADDED,
    pages: [
      { title: "Your business", fields: [fullName("Contact name"), email("Email"), phone("Phone", { required: true }), company("Farm or business name", { required: true })] },
      {
        title: "What you sell",
        fields: [
          many("Products", ["Vegetables", "Fruit", "Eggs", "Meat", "Dairy", "Baked goods", "Flowers and plants", "Honey and preserves", "Crafts"], { required: true, save: "products" }),
          yesno("Do you grow or make everything you sell?", { required: true }),
          long("What do you resell, and where is it from?", { show: when("Do you grow or make everything you sell?", "is", false) }),
          many("Farm practices", ["Certified organic", "No spray", "Pasture raised", "Conventional"]),
          files("Licenses and insurance"),
        ],
      },
      {
        title: "Stall",
        fields: [
          one("Stall size", ["10×10 ft ($30 a market)", "10×20 ft ($50 a market)"], { required: true, key: "stall", points: [30, 50] }),
          num("Market days you want", { required: true, min: 1, max: 30, key: "days" }),
          yesno("Need electricity? ($10 a market)", { key: "power", options: ["Yes", "No"], points: [10, 0] }),
          { kind: "calc", label: "Season fee", key: "fee", formula: "(ifempty({stall}, 0) + ifempty({power}, 0)) * ifempty({days}, 0)", format: "money", currency: "USD" },
        ],
      },
    ],
    end: ["Application received", "The market committee reviews vendors each month. We'll email you the decision."],
  }),

  // Real estate
  tpl("real_estate.commercial-lease", "real_estate", "Commercial lease application", ["application"], "Screen business tenants by use, terms and financials.", {
    cats: "tenant application",
    teams: "operations sales",
    subs: "commercial",
    added: ADDED,
    pages: [
      {
        title: "Business",
        fields: [
          fullName("Contact name"),
          email(),
          phone("Phone", { required: true }),
          company("Legal business name", { required: true }),
          one("Business type", ["Retail", "Restaurant", "Office", "Medical", "Industrial", "Other"], { required: true }),
        ],
      },
      {
        title: "Space and terms",
        fields: [
          text("Property or listing", { required: true }),
          one("Lease length", ["1 year", "3 years", "5 years", "10 years or more"], { required: true, save: "lease_length" }),
          date("Move-in date"),
          long("How will you use the space?", { required: true }),
        ],
      },
      {
        title: "Financials",
        fields: [
          files("Last two years of tax returns or financial statements", { required: true }),
          yesno("Will an owner sign a personal guarantee?"),
          agree("You may check business and personal credit."),
        ],
      },
    ],
    end: ["Application received", "We'll review it and reply within three business days."],
  }),
  tpl("real_estate.coworking-membership", "real_estate", "Coworking membership", ["registration", "order"], "Sign up coworking members with a plan, add-ons and a monthly price.", {
    cats: "membership tenant calculator",
    teams: "sales operations",
    subs: "commercial",
    added: ADDED,
    pages: [
      {
        title: "About you",
        fields: [
          fullName(),
          email("Email"),
          phone(),
          company(),
        ],
      },
      {
        title: "Your plan",
        fields: [
          one("Plan", ["10 day passes ($99 per member)", "Hot desk ($249 per member)", "Dedicated desk ($399 per member)", "Private office ($650 per seat)"], { required: true, key: "plan", points: [99, 249, 399, 650], save: "plan" }),
          num("Members or seats", { required: true, min: 1, max: 50, key: "people" }),
          many("Add-ons", ["Business mailing address ($50)", "Parking spot ($100)", "Locker ($25)", "Meeting room hours ($75)"], { key: "addons", points: [50, 100, 25, 75] }),
          { kind: "calc", label: "Monthly price", key: "monthly", formula: "ifempty({plan}, 0) * ifempty({people}, 1) + ifempty({addons}, 0)", format: "money", currency: "USD" },
          date("Start date", { required: true }),
          agree("I agree to the membership terms and house rules."),
        ],
      },
    ],
    submit: "Become a member",
    end: { title: "Thanks", text: "We'll email your agreement to sign. Book a tour in the meantime.", booking: true },
  }),
  tpl("real_estate.guarantor-form", "real_estate", "Rental guarantor form", ["application"], "Collect a co-signer's income, consent and signature for a rental.", {
    cats: "tenant application",
    teams: "operations",
    subs: "property-management",
    added: ADDED,
    pages: [
      {
        title: "Guarantor",
        fields: [fullName(), email("Email"), phone("Phone", { required: true }), address("Current address", { required: true }), text("Relationship to the renter", { required: true })],
      },
      { title: "Rental", fields: [text("Renter's name", { required: true }), text("Property address and unit", { required: true })] },
      {
        title: "Income and consent",
        fields: [
          text("Employer"),
          money("Yearly income", { required: true }),
          files("Proof of income", { required: true }),
          agree("I agree to a credit check and to be responsible for the lease if the renter does not pay."),
          sign("Signature"),
        ],
      },
    ],
    end: ["Form received", "We'll let you and the renter know once the application is reviewed."],
  }),

  // Nonprofits
  tpl("nonprofit.association-membership", "nonprofit", "Association membership", ["registration"], "Grow your member base and find people for committees.", {
    cats: "membership volunteer",
    teams: "volunteers operations",
    added: ADDED,
    fields: [
      fullName(),
      email("Email"),
      phone(),
      one("Membership type", ["Individual", "Household", "Business", "Student or senior"], { required: true, save: "member_type" }),
      text("Others in your household", { show: when("Membership type", "is", "Household") }),
      many("Committees you'd like to join", ["Events", "Fundraising", "Membership", "Communications", "Advocacy", "Welcome team"], { save: "committees" }),
      one("How much time could you give?", ["An hour or two a month", "A few hours a month", "Weekly", "Not right now"]),
      many("Skills you could share", ["Writing", "Design", "Finance", "Legal", "Tech", "Event planning", "Teaching"]),
      one("How did you hear about us?", HEARD, { save: "heard_from" }),
    ],
    submit: "Join",
    end: ["Welcome aboard", "Your member welcome pack is on its way by email."],
  }),
  tpl("nonprofit.community-grant", "nonprofit", "Community grant application", ["application"], "Fund small community projects with a simple plan and budget.", {
    cats: "grant application",
    teams: "operations finance",
    added: ADDED,
    pages: [
      {
        title: "Applicant",
        fields: [
          fullName(),
          email("Email"),
          phone(),
          one("Applying as", ["Individual", "Community group", "Registered nonprofit", "School or club"], { required: true }),
          company("Group name", { show: when("Applying as", "not", "Individual") }),
        ],
      },
      {
        title: "Project",
        fields: [
          text("Project name", { required: true }),
          long("What will you do, and who will it help?", { required: true }),
          text("Neighborhood or area served"),
          date("Start date"),
          money("Amount requested", { required: true, min: 1, save: "grant_amount" }),
          long("How will you spend the money?", { required: true }),
          files("Budget or quotes"),
        ],
      },
    ],
    end: ["Application received", "The grants panel meets monthly. We'll email you the decision."],
  }),

  // HR and recruiting
  tpl("hr.internship-application", "hr", "Internship application", ["application"], "Recruit interns with school, major, term and a short essay.", {
    cats: "job-application application",
    teams: "recruiting hr",
    added: ADDED,
    pages: [
      {
        title: "About you",
        fields: [
          fullName(),
          email("Email"),
          phone(),
          text("School", { required: true, half: true }),
          text("Major or field of study", { required: true, half: true }),
          one("Year in school", ["First year", "Second year", "Third year", "Final year", "Graduate student", "Recent graduate"], { required: true }),
        ],
      },
      {
        title: "The internship",
        fields: [
          many("Teams you're interested in", ["Marketing", "Sales", "Engineering", "Design", "Finance", "Operations", "People"], { required: true }),
          one("Term", ["Summer", "Fall", "Spring", "Part-time all year"], { required: true }),
          file("Resume", { required: true }),
          url("LinkedIn or portfolio"),
          long("Why do you want to intern with us?"),
        ],
      },
    ],
    submit: "Apply",
    end: ["Application received", "We review internship applications every two weeks."],
  }),
  tpl("hr.benefits-enrollment", "hr", "Benefits enrollment", ["registration"], "Employees pick medical, dental, vision and retirement plans.", {
    internal: true,
    cats: "enrollment employee-onboarding",
    teams: "hr finance",
    added: ADDED,
    pages: [
      {
        title: "You",
        fields: [
          fullName("Employee name"),
          text("Employee ID", { required: true }),
          one("Coverage for", ["Just me", "Me and spouse or partner", "Me and children", "Whole family"], { required: true }),
        ],
      },
      {
        title: "Plans",
        fields: [
          one("Medical plan", ["Basic", "Standard", "Premium", "Waive coverage"], { required: true }),
          one("Dental plan", ["Basic", "Plus", "Waive coverage"], { required: true }),
          one("Vision plan", ["Enroll", "Waive coverage"], { required: true }),
          num("Retirement savings (percent of pay)", { min: 0, max: 100 }),
        ],
      },
      {
        title: "Dependents and signature",
        fields: [
          long("Dependents (name, date of birth, relationship)", { show: when("Coverage for", "not", "Just me") }),
          agree("I have read the plan summaries."),
          sign("Signature"),
        ],
      },
    ],
    end: ["Enrollment saved", "HR will confirm your plans before coverage starts."],
  }),
];
