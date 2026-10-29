// Email templates (docs/email-plan.md Part 3.2, docs/design-system.md Part 7.6): 21 starting points in the seven
// library folders, built from blocks with one design language. They set no colors of their own: every color is a
// brand variable ($text, $muted, $accent, $border, $button-bg, $button-text), so each template shows in the
// workspace's brand and changes with it. The layout is the template's own: a type scale, spacing, hairlines, cards
// and, where it helps, one brand-colored band. Words are short and plain, with merge tags that always have a fallback.
//
// The design language, in one place:
//   Header      the logo on the left, a small label on the right, a hairline under it
//   Eyebrow     14px, bold, spaced capitals in the accent color, above the title
//   Title       34px, tight; section titles 22px; card titles 17px
//   Lead        18px under the title; body 16px; small text 14px in the muted color
//   Band        a section in the button color with button-colored text, for the one moment that matters
//   Cards       the event and product blocks, with a hairline border and soft corners
//   Footer      a hairline above, then the address and unsubscribe line

import type { EmailStyles } from "../model.ts";
import { newEmailId, readEmailDoc, type Block, type EmailDoc, type Section } from "./doc.ts";

export type TemplateFolder = "Newsletters" | "Product updates" | "Events and webinars" | "Welcome and onboarding" | "Nurture and win-back" | "Sales follow-up" | "Meetings and forms";
export const TEMPLATE_FOLDERS: TemplateFolder[] = ["Newsletters", "Product updates", "Events and webinars", "Welcome and onboarding", "Nurture and win-back", "Sales follow-up", "Meetings and forms"];
export type EmailTemplate = { key: string; name: string; group: TemplateFolder; make: () => EmailDoc };

// Styles are collected while a template is made, keyed by element id, then go into the document.
type Decls = Record<string, string>;
let S: Record<string, EmailStyles> = {};
const put = (id: string, part: keyof EmailStyles, decls: Decls) => {
  const el = (S[id] ??= {});
  el[part] = { ...el[part], base: { ...el[part]?.base, ...decls } } as EmailStyles[keyof EmailStyles];
};
const pad = (t: number, r: number, b: number, l: number): Decls => ({ "padding-top": `${t}px`, "padding-right": `${r}px`, "padding-bottom": `${b}px`, "padding-left": `${l}px` });
const corners = (r: number): Decls => Object.fromEntries(["top-left", "top-right", "bottom-left", "bottom-right"].map((c) => [`border-${c}-radius`, `${r}px`]));
const hairline = (side: "top" | "bottom"): Decls => ({ [`border-${side}-width`]: "1px", [`border-${side}-style`]: "solid", [`border-${side}-color`]: "$border" });
const boxed: Decls = { ...["top", "right", "bottom", "left"].reduce((o, s) => ({ ...o, [`border-${s}-width`]: "1px", [`border-${s}-style`]: "solid", [`border-${s}-color`]: "$border" }), {}), ...corners(12) };

// Blocks ------------------------------------------------------------------------------------------------------------

const id = newEmailId;
const HI = "Hi {{first_name|there}},";
const NAME = "{{first_name|there}}";

function h(text: string, size: "title" | "section" | "card" = "title", o: { center?: boolean; band?: boolean } = {}): Block {
  const b: Block = { id: id(), type: "heading", text, level: size === "title" ? 1 : size === "section" ? 2 : 3 };
  put(b.id, "heading", {
    ...(size === "title" ? { "font-size": "34px", "line-height": "1.15", "letter-spacing": "-0.5px", "margin-bottom": "14px" } : size === "section" ? { "font-size": "22px", "line-height": "1.25", "letter-spacing": "-0.2px", "margin-bottom": "10px" } : { "font-size": "17px", "line-height": "1.3", "margin-bottom": "6px" }),
    ...(o.center ? { "text-align": "center" } : {}),
    ...(o.band ? { color: "$button-text" } : {}),
  });
  return b;
}
function t(html: string | string[], kind: "body" | "lead" | "small" | "eyebrow" = "body", o: { center?: boolean; band?: boolean; right?: boolean } = {}): Block {
  const paras = Array.isArray(html) ? html : [html];
  const b: Block = { id: id(), type: "text", html: paras.map((x) => `<p>${x}</p>`).join("") };
  put(b.id, "text", {
    ...(kind === "lead" ? { "font-size": "18px", "line-height": "1.55", "margin-bottom": "24px" } : kind === "small" ? { "font-size": "14px", "line-height": "1.5", color: "$muted" } : kind === "eyebrow" ? { "font-size": "14px", "line-height": "1.4", "font-weight": "700", "letter-spacing": "1px", "text-transform": "uppercase", color: "$accent", "margin-bottom": "10px" } : { "margin-bottom": "18px" }),
    ...(o.center ? { "text-align": "center" } : o.right ? { "text-align": "right" } : {}),
    ...(o.band ? { color: "$button-text" } : {}),
  });
  return b;
}
function btn(label: string, o: { center?: boolean; band?: boolean; quiet?: boolean } = {}): Block {
  const b: Block = { id: id(), type: "button", label, url: "https://", align: o.center ? "center" : "left" };
  put(b.id, "button", { "margin-bottom": "16px" });
  if (o.band) put(b.id, "button", { "background-color": "$button-text", color: "$button-bg" });
  if (o.quiet) put(b.id, "button", { "background-color": "$background", color: "$text", ...["top", "right", "bottom", "left"].reduce((x, s) => ({ ...x, [`border-${s}-width`]: "1px", [`border-${s}-style`]: "solid", [`border-${s}-color`]: "$border" }), {}) });
  return b;
}
const list = (items: string[], ordered = false): Block => {
  const b: Block = { id: id(), type: "list", items, ordered };
  put(b.id, "list", { "margin-bottom": "18px" });
  return b;
};
const quote = (text: string, cite: string): Block => {
  const b: Block = { id: id(), type: "quote", text, cite };
  put(b.id, "quote", { "font-size": "20px", "line-height": "1.45", "font-style": "normal", "margin-top": "8px", "margin-bottom": "8px" });
  return b;
};
const event = (title: string, when: string, where: string, button: string): Block => {
  const b: Block = { id: id(), type: "event", title, when, where, url: "https://", button };
  put(b.id, "card", { ...boxed, ...pad(22, 22, 22, 22) });
  return b;
};
const card = (title: string, text: string, button = "Read more", price?: string): Block => {
  const b: Block = { id: id(), type: "product", title, text, url: "https://", button, ...(price ? { price } : {}) };
  put(b.id, "card", { ...boxed, ...pad(20, 20, 20, 20) });
  put(b.id, "button", { "background-color": "$background", color: "$text", ...["top", "right", "bottom", "left"].reduce((x, s) => ({ ...x, [`border-${s}-width`]: "1px", [`border-${s}-style`]: "solid", [`border-${s}-color`]: "$border" }), {}) });
  return b;
};
const meeting = (label = "Pick a time"): Block => {
  const b: Block = { id: id(), type: "meeting", label, url: "https://", align: "left" };
  put(b.id, "button", { "margin-bottom": "16px" });
  return b;
};
const sign = (name = "Your name", title = "Your role"): Block => ({ id: id(), type: "signature", name, title });
const spacer = (height = 8): Block => ({ id: id(), type: "spacer", height });

// Sections ----------------------------------------------------------------------------------------------------------

type Look = "hero" | "body" | "band" | "tight" | "close";
function sec(look: Look, ...blocks: Block[]): Section {
  const s: Section = { id: id(), stackOnPhone: true, columns: [{ id: id(), width: 100, blocks }] };
  style(s, look);
  return s;
}
function cols(look: Look, ...columns: Block[][]): Section {
  const n = columns.length;
  const s: Section = { id: id(), stackOnPhone: true, columns: columns.map((blocks, i) => ({ id: id(), width: i === n - 1 ? 100 - Math.round(100 / n) * (n - 1) : Math.round(100 / n), blocks })) };
  style(s, look);
  return s;
}
function style(s: Section, look: Look) {
  const sides = { hero: pad(40, 40, 12, 40), body: pad(12, 40, 12, 40), band: pad(36, 40, 36, 40), tight: pad(4, 40, 4, 40), close: pad(12, 40, 36, 40) }[look];
  put(s.id, "section", { ...sides, ...(look === "band" ? { "background-color": "$button-bg" } : {}) });
}
function header(label: string): Section {
  const logo: Block = { id: id(), type: "logo", alt: "Logo", width: 112, align: "left" };
  const s = cols("body", [logo], [t(label, "small", { right: true })]);
  put(s.id, "section", { ...pad(26, 40, 22, 40), ...hairline("bottom") });
  return s;
}
function footer(): Section {
  const s = sec("body", { id: id(), type: "footer" });
  put(s.id, "section", { ...pad(24, 40, 32, 40), ...hairline("top") });
  return s;
}

function email(label: string, preheader: string, body: () => Section[]): () => EmailDoc {
  return () => {
    S = {};
    put("email", "content", corners(14));
    const sections = [header(label), ...body(), footer()];
    const styles = S;
    S = {};
    return readEmailDoc({ v: 1, settings: { width: 600, align: "center", darkMode: "auto", preheader, lang: "en" }, sections, styles });
  };
}

// The templates -------------------------------------------------------------------------------------------------------

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  // Newsletters
  {
    key: "newsletter",
    name: "Monthly newsletter",
    group: "Newsletters",
    make: email("The monthly letter", "Three short reads for this month.", () => [
      sec("hero", t("This month", "eyebrow"), h("Three things worth your time"), t("A short letter with what we learned, what we shipped and what teams like yours are asking.", "lead")),
      sec("body", h("What we learned", "card"), t("One idea from this month, in two or three sentences. Say what changed and why it matters to the reader."), btn("Read the story", { quiet: true })),
      sec("body", h("What we shipped", "card"), t("One improvement, told as what the reader can now do. Keep it to one paragraph."), btn("See what's new", { quiet: true })),
      sec("close", h("What you asked", "card"), t("A question a customer asked, and the answer. Readers like hearing from their peers."), btn("Read the answer", { quiet: true })),
    ]),
  },
  {
    key: "digest",
    name: "Numbers digest",
    group: "Newsletters",
    make: email("Your month", "Your month at a glance.", () => [
      sec("hero", t("Your month", "eyebrow"), h("Here is how your month went"), t(`${HI} the numbers below come from your account, as of the last day of the month.`, "lead")),
      cols("body", [h("128", "section"), t("New leads", "small")], [h("34", "section"), t("Meetings booked", "small")], [h("9", "section"), t("Deals won", "small")]),
      sec("close", t("Your best week was the second one. Most of its leads came from your pricing page."), btn("Open your report")),
    ]),
  },
  {
    key: "founder_letter",
    name: "Founder letter",
    group: "Newsletters",
    make: email("A note from us", "A short note, written by a person.", () => [
      sec("hero", h("A note from our team", "section"), spacer(4), t([HI, "Write this one like a letter to a colleague. Say what happened, what you learned and what comes next.", "Keep it under 200 words. One link at most, and only if it helps."])),
      sec("close", sign()),
    ]),
  },

  // Product updates
  {
    key: "feature_launch",
    name: "Feature launch",
    group: "Product updates",
    make: email("New", "Now live for every team.", () => [
      sec("band", t("Now live", "eyebrow", { band: true }), h("Meet the new feature", "title", { band: true }), t("One sentence on what it lets your team do that they couldn't before.", "lead", { band: true }), btn("Try it now", { band: true })),
      sec("hero", h("What it does for you", "section")),
      cols("body", [h("Faster", "card"), t("Say how much time it saves, in plain words.")], [h("Clearer", "card"), t("Say what people can now see that they couldn't.")], [h("Safer", "card"), t("Say what can no longer go wrong.")]),
      sec("close", quote("We turned it on and the whole team used it the same day.", "A customer, their role")),
    ]),
  },
  {
    key: "release_notes",
    name: "Release notes",
    group: "Product updates",
    make: email("Release notes", "What changed this month.", () => [
      sec("hero", t("Release notes", "eyebrow"), h("What's new this month"), t("Everything we shipped, in one place. The ones marked new are worth a look.", "lead")),
      sec("body", h("New", "card"), list(["A new way to do the main thing", "A shortcut people asked for", "A report you can share with one link"])),
      sec("body", h("Better", "card"), list(["Search is twice as fast", "Exports keep your column order"])),
      sec("close", h("Fixed", "card"), list(["Dates now show in your time zone", "Long names no longer cut off"]), btn("See all changes", { quiet: true })),
    ]),
  },
  {
    key: "product_recap",
    name: "Product recap",
    group: "Product updates",
    make: email("This quarter", "The quarter's three biggest changes.", () => [
      sec("hero", t("This quarter", "eyebrow"), h("Three changes that save you time"), t(`${HI} here are the three changes teams used most this quarter.`, "lead")),
      sec("tight", card("The first change", "One sentence on what it does and who it helps.")),
      sec("tight", card("The second change", "One sentence on what it does and who it helps.")),
      sec("close", card("The third change", "One sentence on what it does and who it helps.")),
    ]),
  },

  // Events and webinars
  {
    key: "webinar_invite",
    name: "Webinar invite",
    group: "Events and webinars",
    make: email("Live session", "Forty minutes, three ideas, your questions.", () => [
      sec("hero", t("Live webinar", "eyebrow"), h("The title of your session"), t("Forty minutes with three people who do this every day, and time for your questions.", "lead")),
      sec("body", event("The title of your session", "Thursday, November 14, 10:00 AM PT", "Online, the link comes by email", "Save my seat")),
      sec("body", h("You'll leave with", "card"), list(["The first idea, in one line", "The second idea, in one line", "A checklist you can use the next day"])),
      cols("close", [h("First speaker", "card"), t("Role, company", "small")], [h("Second speaker", "card"), t("Role, company", "small")], [h("Third speaker", "card"), t("Role, company", "small")]),
    ]),
  },
  {
    key: "event_reminder",
    name: "Event reminder",
    group: "Events and webinars",
    make: email("Starting soon", "Your link and the plan for tomorrow.", () => [
      sec("hero", t("Tomorrow", "eyebrow"), h("Your seat is saved"), t(`${HI} here is your link. We start on time and the recording comes the day after.`, "lead")),
      sec("close", event("The title of your session", "Tomorrow, 10:00 AM PT", "Online", "Join the session")),
    ]),
  },
  {
    key: "event_followup",
    name: "Event follow-up",
    group: "Events and webinars",
    make: email("Thanks for joining", "The recording, the slides and the three takeaways.", () => [
      sec("hero", t("Recording", "eyebrow"), h("Thanks for joining us"), t("Here are the recording and the slides, as promised, and the three ideas people asked about most.", "lead"), btn("Watch the recording")),
      sec("body", list(["The first takeaway, in one line", "The second takeaway, in one line", "The third takeaway, in one line"], true)),
      sec("close", t("Want to see how it would work for your team?"), meeting("Book 20 minutes")),
    ]),
  },

  // Welcome and onboarding
  {
    key: "welcome",
    name: "Welcome",
    group: "Welcome and onboarding",
    make: email("Welcome", "Three steps to get going this week.", () => [
      sec("hero", t("Welcome", "eyebrow"), h(`Welcome, ${NAME}`), t("Most teams are up and running in a day. These three steps get you there.", "lead")),
      cols("body", [t("Step 1", "eyebrow"), h("Connect", "card"), t("Bring in what you already use. It takes about five minutes.")], [t("Step 2", "eyebrow"), h("Invite", "card"), t("Add your team so everyone works from the same place.")], [t("Step 3", "eyebrow"), h("Go live", "card"), t("Turn on the first thing that saves you time.")]),
      sec("close", btn("Start step 1"), spacer(12), t("Questions? Reply to this email. A person reads every one.", "small")),
    ]),
  },
  {
    key: "onboarding_step",
    name: "Next step",
    group: "Welcome and onboarding",
    make: email("Getting started", "The one step most teams miss.", () => [
      sec("hero", t("Day 2", "eyebrow"), h("The step most teams miss"), t(`${HI} teams that do this in their first week get twice as much from us. It takes ten minutes.`, "lead"), btn("Do it now")),
      sec("close", card("Tip", "A short tip that makes the step easier, with where to find it.", "Show me")),
    ]),
  },
  {
    key: "trial_ending",
    name: "Trial ending",
    group: "Welcome and onboarding",
    make: email("Your trial", "Three days left. Here is what you've built.", () => [
      sec("hero", t("3 days left", "eyebrow"), h("Keep what you've built"), t(`${HI} your trial ends on Friday. Pick a plan to keep everything your team set up.`, "lead")),
      cols("body", [h("4", "section"), t("Teammates invited", "small")], [h("12", "section"), t("Workflows running", "small")], [h("86", "section"), t("Hours saved", "small")]),
      sec("tight", btn("Choose a plan")),
      sec("close", t("Not sure which plan fits? Book 15 minutes and we'll help you pick.", "small"), meeting("Talk to us")),
    ]),
  },

  // Nurture and win-back
  {
    key: "customer_story",
    name: "Customer story",
    group: "Nurture and win-back",
    make: email("Customer story", "How one team did it, in three steps.", () => [
      sec("hero", t("Customer story", "eyebrow"), quote("We stopped losing leads between our forms and our reps in the first week.", "Name, role at Company")),
      cols("body", [h("40%", "section"), t("More meetings", "small")], [h("2 days", "section"), t("To go live", "small")], [h("0", "section"), t("Leads lost", "small")]),
      sec("close", t("What they changed, in three short sentences. Say what was hard before and what's easy now."), btn("Read the story")),
    ]),
  },
  {
    key: "resource",
    name: "Guide",
    group: "Nurture and win-back",
    make: email("A guide for you", "A guide teams like yours use.", () => [
      sec("hero", t("Guide", "eyebrow"), h("The guide teams like yours use"), t(`${HI} we put what we learned from hundreds of teams into one short guide.`, "lead")),
      sec("tight", card("What's inside", "Five chapters, each one a change you can make in an afternoon.", "Get the guide")),
      sec("close", t("It takes about 15 minutes to read.", "small")),
    ]),
  },
  {
    key: "winback",
    name: "Win-back",
    group: "Nurture and win-back",
    make: email("What's new", "A lot has changed since your last visit.", () => [
      sec("hero", h("A lot has changed since your last visit", "section"), spacer(4), t([HI, "Here are the three changes people tell us they like most."])),
      sec("body", list(["The first change, in one line", "The second change, in one line", "The third change, in one line"])),
      sec("close", btn("Take a look"), spacer(12), t("Not the right time? You can change how often you hear from us.", "small")),
    ]),
  },

  // Sales follow-up
  {
    key: "after_demo",
    name: "After the demo",
    group: "Sales follow-up",
    make: email("Notes from our call", "What we covered and what comes next.", () => [
      sec("hero", h("Thanks for your time today", "section"), spacer(4), t([HI, "Here is what we covered, so it's easy to share with your team."])),
      sec("body", h("What we covered", "card"), list(["What your team needs most", "How it fits what you use today", "What a first month looks like"])),
      sec("body", h("Next steps", "card"), list(["We send the plan by Thursday", "You share it with your team", "We meet again next week"], true)),
      sec("close", meeting("Pick a time for next week"), spacer(8), sign()),
    ]),
  },
  {
    key: "plain_followup",
    name: "Plain follow-up",
    group: "Sales follow-up",
    make: email("", "A short note.", () => [
      sec("hero", t([HI, "I wanted to follow up on my last note. Teams like yours usually start with one small change, and it's often the one that matters most.", "Would 20 minutes next week help?"])),
      sec("close", meeting(), spacer(8), sign()),
    ]),
  },
  {
    key: "proposal",
    name: "Proposal",
    group: "Sales follow-up",
    make: email("Your proposal", "Your plan, the price and the next step.", () => [
      sec("hero", t("Proposal", "eyebrow"), h("Your plan for {{company|your team}}"), t("Everything we talked about, in one page you can share.", "lead")),
      sec("body", card("The plan we suggest", "What's included, for how many people, and when it starts.", "Review the proposal", "Price per month")),
      sec("close", t("Questions before you decide? Reply here or pick a time."), meeting("Pick a time"), spacer(8), sign()),
    ]),
  },

  // Meetings and forms
  {
    key: "meeting_confirmed",
    name: "Meeting confirmed",
    group: "Meetings and forms",
    make: email("Meeting", "You're booked. Here are the details.", () => [
      sec("hero", t("Confirmed", "eyebrow"), h("You're booked"), t(`${HI} we look forward to it. The invite is in your calendar.`, "lead")),
      sec("close", event("Meeting with our team", "Thursday, November 14, 10:00 to 10:30 AM PT", "Video call", "Add to calendar")),
    ]),
  },
  {
    key: "meeting_reminder",
    name: "Meeting reminder",
    group: "Meetings and forms",
    make: email("Meeting", "Tomorrow, and how to get the most from it.", () => [
      sec("hero", t("Tomorrow", "eyebrow"), h("See you tomorrow"), t("Three things that make the call more useful for you:", "lead")),
      sec("body", list(["Bring one problem you'd like solved", "Invite anyone who'd decide with you", "Have your current setup open"])),
      sec("close", event("Meeting with our team", "Tomorrow, 10:00 AM PT", "Video call", "Join the call")),
    ]),
  },
  {
    key: "form_thanks",
    name: "Form thank you",
    group: "Meetings and forms",
    make: email("Thanks", "We got your note.", () => [
      sec("hero", t("Received", "eyebrow"), h("Thanks, we got your note"), t("Someone from our team will reply within one working day.", "lead")),
      sec("close", t("Want to skip the wait?"), meeting("Pick a time now"), spacer(12), t("You're getting this because you filled in a form on our site.", "small")),
    ]),
  },
];

export const emailTemplate = (key: string) => EMAIL_TEMPLATES.find((t) => t.key === key);
