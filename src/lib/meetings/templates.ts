// Meeting type templates (Meetings › Meeting types): ready-made meetings people start from. Picking one opens the new
// meeting's panel already filled in, to check and save. Each sets the kind, lengths, place, the description, What
// we'll cover, Before the call, a few booking questions, buffers, notice and reminders. Runs in the browser.

import { DEFAULT_SETTINGS, type Kind, type TypeSettings } from "./types.ts";

export type TemplateGroup = "sales" | "success" | "hiring" | "services" | "team";

export const TEMPLATE_GROUPS: { key: TemplateGroup; label: string }[] = [
  { key: "sales", label: "Sales" },
  { key: "success", label: "Customer success" },
  { key: "hiring", label: "Hiring" },
  { key: "services", label: "Services and consulting" },
  { key: "team", label: "Team and groups" },
];

export type MeetingTemplate = {
  id: string;
  group: TemplateGroup;
  name: string;
  slug: string;
  kind: Extract<Kind, "one" | "round_robin" | "group">;
  /** One short line for the card. */
  line: string;
  /** Shown first on the empty Meeting types page. */
  featured?: boolean;
  settings: Partial<TypeSettings>;
};

type Q = TypeSettings["questions"][number];
const q = (id: string, label: string, type: Q["type"], required = false, options?: string[]): Q => ({ id, label, type, required, ...(options ? { options } : {}) });

export const MEETING_TEMPLATES: MeetingTemplate[] = [
  // Sales
  {
    id: "quick-chat",
    group: "sales",
    name: "Quick chat",
    slug: "quick-chat",
    kind: "one",
    line: "A short call to answer one question.",
    featured: true,
    settings: {
      lengths: [15],
      notice: 60,
      step: 15,
      description: "A short call to answer a question or see if we should talk longer.",
      questions: [q("topic", "What would you like to ask?", "textarea")],
      reminders: [60],
    },
  },
  {
    id: "intro-call",
    group: "sales",
    name: "Intro call",
    slug: "intro-call",
    kind: "one",
    line: "Meet, learn the basics and agree on next steps.",
    featured: true,
    settings: {
      lengths: [30],
      bufferAfter: 5,
      description: "A first call to get to know each other and see how we can help.",
      agenda: ["Your goals and what you need", "How we work", "Next steps"],
      prep: ["Think about what a good result looks like for you"],
      questions: [q("company", "Company", "text", true), q("goal", "What would you like to get out of this call?", "textarea")],
    },
  },
  {
    id: "discovery-call",
    group: "sales",
    name: "Discovery call",
    slug: "discovery-call",
    kind: "one",
    line: "Dig into needs, timing and who decides.",
    settings: {
      lengths: [45],
      bufferAfter: 10,
      description: "We learn about your team, what you use today and what needs to change.",
      agenda: ["Where things stand today", "What needs to change and by when", "Who else is involved", "Next steps"],
      prep: ["Bring anyone who will help decide", "Have your current tools in mind"],
      questions: [
        q("company", "Company", "text", true),
        q("size", "Team size", "choice", true, ["1 to 10", "11 to 50", "51 to 200", "201 to 1,000", "More than 1,000"]),
        q("timing", "When do you hope to start?", "choice", false, ["This month", "Next 3 months", "Later this year", "Just looking"]),
      ],
    },
  },
  {
    id: "product-demo",
    group: "sales",
    name: "Product demo",
    slug: "product-demo",
    kind: "one",
    line: "A live walkthrough built around their needs.",
    featured: true,
    settings: {
      lengths: [45],
      bufferBefore: 5,
      bufferAfter: 10,
      description: "A live walkthrough of the product, shaped around what you want to do.",
      agenda: ["A short look at your goals", "Live demo", "Questions and answers", "Pricing and next steps"],
      prep: ["Write down the three things you most want to see", "Invite teammates who will use it"],
      questions: [
        q("company", "Company", "text", true),
        q("website", "Company website", "url"),
        q("focus", "What do you most want to see?", "textarea"),
      ],
    },
  },
  {
    id: "sales-round-robin",
    group: "sales",
    name: "Talk to sales",
    slug: "talk-to-sales",
    kind: "round_robin",
    line: "Leads book the next free person on your sales team.",
    featured: true,
    settings: {
      lengths: [30],
      bufferAfter: 5,
      notice: 120,
      description: "Book a call with the next free person on our sales team.",
      agenda: ["What you need", "How we can help", "Next steps"],
      questions: [q("company", "Company", "text", true), q("size", "Team size", "choice", false, ["1 to 10", "11 to 50", "51 to 200", "More than 200"])],
    },
  },

  // Customer success
  {
    id: "onboarding-kickoff",
    group: "success",
    name: "Onboarding kickoff",
    slug: "onboarding-kickoff",
    kind: "one",
    line: "Set goals and a plan for the first weeks.",
    featured: true,
    settings: {
      lengths: [60],
      bufferAfter: 15,
      notice: 1440,
      window: 30,
      description: "We set goals, agree on a plan and get your team set up.",
      agenda: ["Goals for the first 90 days", "Setup and access", "Who does what", "Dates for the next check-ins"],
      prep: ["Invite the people who will run the setup", "Have admin access ready"],
      questions: [q("company", "Company", "text", true), q("goals", "What should be working in 90 days?", "textarea")],
    },
  },
  {
    id: "check-in",
    group: "success",
    name: "Quarterly check-in",
    slug: "check-in",
    kind: "one",
    line: "Review results and plan the next quarter.",
    settings: {
      lengths: [30, 45],
      window: 30,
      description: "A look back at the last quarter and a plan for the next one.",
      agenda: ["What went well", "What we can improve", "Plans for next quarter"],
      prep: ["Note any wins or problems since we last met"],
      questions: [q("topics", "Anything you want to cover?", "textarea")],
    },
  },
  {
    id: "support-call",
    group: "success",
    name: "Support call",
    slug: "support-call",
    kind: "round_robin",
    line: "Screen share to fix a problem with the next free person.",
    settings: {
      lengths: [30],
      notice: 60,
      window: 7,
      step: 15,
      description: "A screen share with our team to fix a problem together.",
      prep: ["Have the problem ready to show on your screen"],
      questions: [
        q("issue", "What's going wrong?", "textarea", true),
        q("urgency", "How urgent is it?", "choice", true, ["Blocking our work", "Slowing us down", "A question"]),
      ],
      reminders: [60],
    },
  },

  // Hiring
  {
    id: "phone-screen",
    group: "hiring",
    name: "Phone screen",
    slug: "phone-screen",
    kind: "one",
    line: "A first call with a candidate, by phone.",
    settings: {
      lengths: [20],
      location: { kind: "phone_guest" },
      bufferAfter: 10,
      notice: 1440,
      description: "A short first call to learn about you and share more about the role.",
      agenda: ["Your background", "The role and the team", "Your questions"],
      questions: [q("role", "Role you applied for", "text", true), q("resume", "Link to your resume or profile", "url")],
    },
  },
  {
    id: "panel-interview",
    group: "hiring",
    name: "Panel interview",
    slug: "panel-interview",
    kind: "round_robin",
    line: "A longer interview with people from the team.",
    settings: {
      lengths: [60],
      bufferBefore: 10,
      bufferAfter: 15,
      notice: 2880,
      window: 21,
      description: "A longer conversation with people you would work with.",
      agenda: ["Introductions", "Questions about your work", "Your questions for us"],
      prep: ["Test your camera and sound", "Have examples of your work ready"],
      questions: [q("role", "Role you applied for", "text", true)],
    },
  },

  // Services and consulting
  {
    id: "consultation",
    group: "services",
    name: "Free consultation",
    slug: "consultation",
    kind: "one",
    line: "A first talk to see if you're a good fit.",
    featured: true,
    settings: {
      lengths: [30],
      bufferAfter: 10,
      description: "A free first talk about what you need and how we could help.",
      agenda: ["What you need help with", "How we would approach it", "Price and timing"],
      questions: [
        q("phone", "Phone", "phone"),
        q("need", "What do you need help with?", "textarea", true),
        q("budget", "Budget", "choice", false, ["Under $1,000", "$1,000 to $5,000", "$5,000 to $20,000", "More than $20,000", "Not sure yet"]),
      ],
    },
  },
  {
    id: "strategy-session",
    group: "services",
    name: "Strategy session",
    slug: "strategy-session",
    kind: "one",
    line: "A deep work session to build a plan.",
    settings: {
      lengths: [60, 90],
      bufferBefore: 10,
      bufferAfter: 15,
      notice: 1440,
      window: 30,
      perDay: 2,
      description: "A focused session where we build a clear plan together.",
      agenda: ["Where you are now", "Where you want to be", "The plan to get there", "First steps"],
      prep: ["Share any documents or numbers we should look at", "Pick one main goal for the session"],
      questions: [q("company", "Company", "text"), q("goal", "The main goal for this session", "textarea", true), q("files", "Link to any documents", "url")],
    },
  },
  {
    id: "coffee-chat",
    group: "services",
    name: "Coffee chat",
    slug: "coffee-chat",
    kind: "one",
    line: "A relaxed talk to stay in touch.",
    settings: {
      lengths: [20],
      notice: 1440,
      description: "A relaxed talk to catch up and share ideas.",
      questions: [q("topic", "Anything you'd like to talk about?", "text")],
      reminders: [60],
    },
  },
  {
    id: "partner-call",
    group: "services",
    name: "Partner call",
    slug: "partner-call",
    kind: "one",
    line: "Explore working together with another company.",
    settings: {
      lengths: [30],
      bufferAfter: 5,
      description: "A call to explore how our companies could work together.",
      agenda: ["About each company", "Ideas for working together", "Next steps"],
      questions: [q("company", "Company", "text", true), q("website", "Company website", "url"), q("idea", "What do you have in mind?", "textarea")],
    },
  },

  // Team and groups
  {
    id: "office-hours",
    group: "team",
    name: "Office hours",
    slug: "office-hours",
    kind: "group",
    line: "Open time anyone can join with questions.",
    settings: {
      lengths: [60],
      seats: 10,
      step: 60,
      notice: 60,
      description: "Open time to bring your questions. Others may join too.",
      questions: [q("question", "What would you like to ask?", "textarea")],
      reminders: [60],
    },
  },
  {
    id: "workshop",
    group: "team",
    name: "Workshop",
    slug: "workshop",
    kind: "group",
    line: "A hands-on group session with limited seats.",
    settings: {
      lengths: [90],
      seats: 20,
      step: 60,
      bufferBefore: 15,
      notice: 1440,
      window: 30,
      description: "A hands-on session in a small group. Seats are limited.",
      agenda: ["Welcome", "Hands-on exercises", "Questions and answers"],
      prep: ["Join from a computer", "Test your camera and sound"],
      questions: [q("company", "Company", "text"), q("level", "How well do you know the topic?", "choice", false, ["New to it", "Some experience", "Experienced"])],
    },
  },
];

export const templateById = (id: string | null | undefined): MeetingTemplate | null => MEETING_TEMPLATES.find((t) => t.id === id) ?? null;

/** A template's full settings: the defaults with the template's own on top. */
export const templateSettings = (t: MeetingTemplate): TypeSettings => ({ ...DEFAULT_SETTINGS, ...t.settings, questions: (t.settings.questions ?? []).map((x) => ({ ...x })) });
