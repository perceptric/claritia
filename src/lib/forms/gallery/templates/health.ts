// Healthcare, dental and wellness, fitness and beauty. Forms that collect health details carry phi and stay drafts
// until the workspace confirms a BAA (docs/form-templates.md, Healthcare).
import { address, agree, date, DAYPART, drop, email, file, fullName, go, long, many, matrix, one, phone, phone2, scale, sign, stars, text, tpl, when, yesno, rows } from "./build.ts";

export const HEALTHCARE = [
  tpl("healthcare.appointment", "healthcare", "Appointment request", ["booking", "request"], "Let patients ask for an appointment.", {
    featured: true,
    fields: [
      fullName(),
      phone("Phone", { required: true }),
      email("Email"),
      one("Are you a new or returning patient?", ["New", "Returning"], { required: true }),
      drop("Reason for visit", ["Checkup", "New problem", "Follow-up", "Vaccine", "Other"], { required: true }),
      date("Preferred date"),
      one("Preferred time", DAYPART),
    ],
    submit: "Request appointment",
    end: ["Request received", "Our front desk will confirm your time."],
  }),
  tpl("healthcare.patient-intake", "healthcare", "New patient intake", ["intake"], "Medical history before the first visit.", {
    phi: true,
    version: 2,
    cover: { title: "New patient intake", text: "About 10 minutes. Have your insurance card and medicine list ready.", button: "Start" },
    resume: true,
    copy: true,
    pages: [
      {
        title: "About you",
        fields: [
          fullName(),
          date("Date of birth", { required: true }),
          email("Email"),
          phone("Phone", { required: true }),
          address(),
          text("Emergency contact name", { required: true }),
          phone2("Emergency contact phone", { required: true }),
          one("How will you pay for your visits?", ["Insurance", "Self-pay"], { required: true }),
        ],
        skip: go("How will you pay for your visits?", "is", "Self-pay", "Your visit"),
      },
      {
        title: "Insurance",
        fields: [
          text("Insurance provider", { required: true }),
          text("Member ID", { required: true }),
          text("Group number"),
          one("Who is the policy holder?", ["Me", "My spouse or partner", "My parent", "Someone else"], { required: true }),
          text("Policy holder's name", { show: when("Who is the policy holder?", "not", "Me") }),
          date("Policy holder's date of birth", { show: when("Who is the policy holder?", "not", "Me") }),
          file("Insurance card (front)"),
          file("Insurance card (back)"),
        ],
      },
      {
        title: "Your visit",
        fields: [
          drop("Reason for visit", ["Checkup", "New problem", "Ongoing condition", "Follow-up", "Other"], { required: true }),
          long("Tell us more about why you're coming in"),
          yesno("Did another doctor refer you?"),
          text("Referring doctor", { show: when("Did another doctor refer you?", "is", true) }),
        ],
      },
      {
        title: "Health history",
        fields: [
          many("Do you have or have you had any of these?", ["Diabetes", "High blood pressure", "Asthma", "Heart disease", "Cancer", "Depression or anxiety", "None of these"]),
          long("Past surgeries and hospital stays"),
          many("Family history", ["Diabetes", "Heart disease", "Cancer", "Stroke", "High blood pressure", "None that I know of"]),
          one("Do you smoke or vape?", ["Never", "In the past", "Yes, now"]),
          one("How often do you drink alcohol?", ["Never", "Monthly or less", "Weekly", "Most days"]),
        ],
      },
      {
        title: "Medicines and allergies",
        fields: [
          yesno("Do you take any medicines?", { required: true }),
          rows("Medicines and doses", ["Medicine", "Dose"], { help: "Include vitamins and supplements.", add: "Add a medicine", show: when("Do you take any medicines?", "is", true) }),
          yesno("Do you have any allergies?", { required: true }),
          long("What are you allergic to, and what happens?", { show: when("Do you have any allergies?", "is", true) }),
          text("Preferred pharmacy"),
        ],
      },
      {
        title: "Consent",
        fields: [agree("The information above is true and complete."), agree("I agree to be treated by this practice."), agree("I have read the privacy notice."), sign("Signature")],
      },
    ],
    end: ["Intake complete", "Thank you. We'll see you at your visit."],
  }),
  tpl("healthcare.patient-feedback", "healthcare", "Patient feedback", ["feedback", "survey"], "Hear how each visit went.", {
    fields: [stars("Overall experience", { required: true }), matrix("Rate your visit", ["Booking", "Wait time", "Staff", "Doctor", "Cleanliness"], ["Poor", "Fair", "Good", "Great"]), long("Comments"), email("Email", { required: false })],
    end: ["Thank you", "Your feedback helps us care for you better."],
  }),
  tpl("healthcare.provider-referral", "healthcare", "Referral from provider", ["request", "intake"], "Take referrals from other providers.", {
    phi: true,
    fields: [text("Referring provider", { required: true }), email("Provider email"), text("Patient name", { required: true }), date("Patient date of birth", { required: true }), long("Reason for referral", { required: true }), one("Urgency", ["Routine", "Soon", "Urgent"], { required: true }), file("Records")],
    end: ["Referral received", "We'll contact the patient to schedule."],
  }),
  tpl("healthcare.telehealth", "healthcare", "Telehealth check-in", ["intake", "booking"], "A short check-in before an online visit.", {
    phi: true,
    fields: [fullName(), email("Email"), long("What symptoms do you have?", { required: true }), date("Since when?"), scale("How bad is it?", "Mild", "Severe", { required: true })],
    end: { title: "Thanks", text: "Pick a time for your online visit.", booking: true },
  }),
];

export const WELLNESS = [
  tpl("wellness.new-patient", "wellness", "New patient booking", ["booking", "lead"], "Book new dental or wellness patients.", {
    featured: true,
    fields: [fullName(), email("Email"), phone("Phone", { required: true }), drop("Reason for visit", ["Cleaning and checkup", "Tooth pain", "Cosmetic", "Second opinion", "Other"], { required: true }), text("Insurance provider"), one("Preferred time", DAYPART)],
    end: { title: "Thanks", text: "Pick a time for your first visit.", booking: true },
  }),
  tpl("wellness.therapy-consultation", "wellness", "Therapy consultation", ["booking", "intake"], "A gentle first step for new therapy clients.", {
    phi: true,
    fields: [fullName(), email("Email"), phone(), many("What would you like help with?", ["Stress", "Anxiety", "Low mood", "Relationships", "Work", "Grief", "Other"], { required: true }), long("Anything you'd like us to know?"), one("Session type", ["In person", "Online", "Either"], { required: true })],
    end: { title: "Thank you for reaching out", text: "Pick a time for a free 15-minute call.", booking: true },
  }),
  tpl("wellness.assessment", "wellness", "Wellness assessment", ["quiz", "lead"], "A quick score that starts a conversation.", {
    fields: [
      one("How well do you sleep?", ["Poorly", "OK", "Well"], { required: true, points: [0, 1, 2] }),
      one("How stressed do you feel most days?", ["Very", "Somewhat", "Rarely"], { required: true, points: [0, 1, 2] }),
      one("How is your energy?", ["Low", "Up and down", "High"], { required: true, points: [0, 1, 2] }),
      one("How often do you move your body?", ["Rarely", "1–2 days a week", "3+ days a week"], { required: true, points: [0, 1, 2] }),
      email("Email for your results"),
    ],
    submit: "See my score",
    end: {
      title: "Your wellness score",
      text: "",
      score: [
        { min: 6, title: "Thriving", text: "You've built strong habits. Let's keep them going." },
        { min: 3, title: "Room to grow", text: "A few small changes could make a big difference." },
        { min: 0, title: "Time to recharge", text: "Let's find a plan that fits your life." },
      ],
      booking: true,
    },
  }),
  tpl("wellness.consent-waiver", "wellness", "Consent and waiver", ["intake"], "Signed consent before treatment.", {
    fields: [fullName(), email("Email"), date("Date", { required: true }), long("Terms", { required: false, placeholder: "Paste or summarize your terms here" }), agree("I have read and accept the terms."), sign("Signature")],
    end: ["Signed", "A copy is on file. Thank you."],
  }),
];

export const FITNESS = [
  tpl("fitness.trial-class", "fitness", "Free trial class", ["booking", "lead"], "Turn curious visitors into first-time members.", {
    featured: true,
    fields: [fullName(), email("Email"), phone(), drop("Class", ["Strength", "Yoga", "HIIT", "Spin", "Pilates", "Not sure"], { required: true }), drop("Preferred day", ["Weekday morning", "Weekday evening", "Weekend"], { required: true }), one("Fitness level", ["Beginner", "Some experience", "Advanced"])],
    submit: "Claim my free class",
    end: ["You're booked in", "We'll confirm your class by email."],
  }),
  tpl("fitness.pt-intake", "fitness", "Personal training intake", ["intake", "lead"], "Goals, injuries and schedule for new clients.", {
    phi: true,
    fields: [fullName(), email("Email"), phone(), many("Goals", ["Lose weight", "Build strength", "Improve fitness", "Train for an event", "Recover from injury"], { required: true }), yesno("Any injuries?"), long("Tell us about them", { show: when("Any injuries?", "is", true) }), one("Experience", ["New to training", "Some", "A lot"]), many("Days you can train", ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])],
    end: { title: "Thanks", text: "Book your first session.", booking: true },
  }),
  tpl("fitness.membership", "fitness", "Membership sign-up", ["registration", "order"], "Sign up members with a plan and signature.", {
    version: 2,
    copy: true,
    pages: [
      {
        title: "Plan",
        fields: [
          one("Plan", ["Monthly", "Yearly", "Class pack", "Student"], { required: true, save: "plan" }),
          date("Start date", { required: true }),
          file("Student ID", { required: true, show: when("Plan", "is", "Student") }),
          many("What are you most interested in?", ["Gym floor", "Group classes", "Personal training", "Pool", "Kids' programs"]),
        ],
      },
      {
        title: "About you",
        fields: [
          fullName(),
          email("Email"),
          phone("Phone", { required: true }),
          date("Date of birth", { required: true }),
          address(),
          text("Emergency contact name", { required: true }),
          phone2("Emergency contact phone", { required: true }),
          yesno("Do you have any health conditions or injuries that affect exercise?", { required: true }),
        ],
        skip: go("Do you have any health conditions or injuries that affect exercise?", "is", false, "Waiver"),
      },
      {
        title: "Health check",
        fields: [
          many("Which of these apply to you?", ["Heart condition", "High blood pressure", "Joint or back problems", "Asthma", "Recent surgery", "Pregnancy", "Other"], { required: true }),
          long("Tell us more so we can help you train safely"),
          yesno("Has a doctor told you to limit exercise?"),
          file("Note from your doctor", { show: when("Has a doctor told you to limit exercise?", "is", true) }),
        ],
      },
      {
        title: "Waiver",
        fields: [agree("I agree to the membership terms."), agree("I understand the risks of exercise and release the gym from liability."), sign("Signature")],
      },
      {
        title: "Payment",
        fields: [
          one("How should we bill your plan?", ["Card", "Bank debit", "At the front desk"], { required: true }),
          text("Promo code"),
          { kind: "payment", label: "Pay the joining fee", amount: 50, currency: "USD" },
        ],
      },
    ],
    submit: "Join",
    end: ["Welcome", "Your membership starts on the date you picked."],
  }),
  tpl("fitness.salon-booking", "beauty", "Salon booking", ["booking"], "Book services with a stylist.", {
    fields: [drop("Service", ["Haircut", "Color", "Blowout", "Nails", "Facial", "Waxing"], { required: true }), text("Stylist (optional)"), date("Date", { required: true }), one("Time", DAYPART, { required: true }), fullName(), phone("Phone", { required: true }), email("Email")],
    submit: "Request booking",
    end: ["Request received", "We'll confirm your time by text."],
  }),
  tpl("fitness.waiver", "fitness", "Liability waiver", ["intake"], "Signed waivers before anyone trains.", {
    fields: [fullName(), email("Email"), date("Date of birth", { required: true }), text("Emergency contact name and phone", { required: true }), agree("I understand the risks and release the gym from liability."), sign("Signature")],
    end: ["Signed", "You're ready to train."],
  }),
];

