// Email templates (docs/email-plan.md Part 3.2, docs/design-system.md Part 7.6): the first 21 starting points in the
// library folders, built from blocks with one design language (library.ts adds the rest, to about 100). They set no
// colors of their own: every color is a brand variable ($text, $muted, $accent, $button-bg, $button-text, and $tint and
// $surface, which the compiler works out from them), so each template shows in the workspace's brand and changes with
// it. About half carry a photo under the header (photos.ts).
//
// The design language, in one place (six styles: letter, newsletter, announcement, event, digest, offer):
//   Header      the logo (or the brand's name) on its own, with room around it
//   Photo       a 2:1 photo with rounded corners under the header, on templates that have one
//   Eyebrow     13px, bold, spaced capitals in the accent color, above the title
//   Title       30px bold and tight; section titles 22px; card titles 18px
//   Lead        18px in the muted color under the title; body 16px with room between lines; small 14px muted
//   Buttons     one filled button for the main step; other steps are links in the accent color with an arrow
//   Cards       soft surface panels with rounded corners; event details on the brand's tint
//   Bands       the brand's button color for the moment that matters (announcements), its tint for numbers and offers
//   Footer      a hairline above, then the address and unsubscribe line

import type { EmailStyles } from "../model.ts";
import { newEmailId, readEmailDoc, type Block, type EmailDoc, type Section } from "./doc.ts";
import { EMAIL_PHOTOS, emailPhotoUrl } from "./photos.ts";
import { DARK } from "./look.ts";

export type TemplateFolder = "Newsletters" | "Product updates" | "Events and webinars" | "Welcome and onboarding" | "Nurture and win-back" | "Sales follow-up" | "Meetings and forms" | "Announcements" | "Holidays and seasons";
export const TEMPLATE_FOLDERS: TemplateFolder[] = ["Newsletters", "Product updates", "Events and webinars", "Welcome and onboarding", "Nurture and win-back", "Sales follow-up", "Meetings and forms", "Announcements", "Holidays and seasons"];
export type EmailTemplate = { key: string; name: string; group: TemplateFolder; make: () => EmailDoc; /** One line on what it's for (the gallery and the website). */ blurb?: string };

// Styles are collected while a template is made, keyed by element id, then go into the document.
type Decls = Record<string, string>;
let S: Record<string, EmailStyles> = {};
const put = (id: string, part: keyof EmailStyles, decls: Decls) => {
  const el = (S[id] ??= {});
  el[part] = { ...el[part], base: { ...el[part]?.base, ...decls } } as EmailStyles[keyof EmailStyles];
};
/** The same part's dark-mode values (mail apps that follow dark mode, and the gallery's Dark view). */
const dark = (id: string, part: keyof EmailStyles, decls: Decls) => {
  const el = (S[id] ??= {});
  const rule = (el[part] ??= {}) as Record<string, Decls>;
  rule["base:dark"] = { ...rule["base:dark"], ...decls };
};
const pad = (t: number, r: number, b: number, l: number): Decls => ({ "padding-top": `${t}px`, "padding-right": `${r}px`, "padding-bottom": `${b}px`, "padding-left": `${l}px` });
const corners = (r: number): Decls => Object.fromEntries(["top-left", "top-right", "bottom-left", "bottom-right"].map((c) => [`border-${c}-radius`, `${r}px`]));
const hairline = (side: "top" | "bottom"): Decls => ({ [`border-${side}-width`]: "1px", [`border-${side}-style`]: "solid", [`border-${side}-color`]: "$border" });
const noBorder: Decls = Object.fromEntries(["top", "right", "bottom", "left"].map((s) => [`border-${s}-width`, "0px"]));
/** The main button in dark mode: the brand's, unless it's so dark it would vanish (look.ts washes). */
const BUTTON_DARK: Decls = { "background-color": "$button-bg-dark", color: "$button-text-dark" };
/** A secondary step: a link in the accent color, no box. */
const asLink: Decls = { "background-color": "$background", color: "$accent", ...pad(12, 0, 12, 0), ...noBorder, "font-weight": "600", "font-size": "16px" };

// Blocks ------------------------------------------------------------------------------------------------------------

const id = newEmailId;
const HI = "Hi {{first_name|there}},";
const NAME = "{{first_name|there}}";

function h(text: string, size: "title" | "section" | "card" = "title", o: { center?: boolean; band?: boolean } = {}): Block {
  const b: Block = { id: id(), type: "heading", text, level: size === "title" ? 1 : size === "section" ? 2 : 3 };
  put(b.id, "heading", {
    ...(size === "title"
      ? { "font-size": "30px", "line-height": "1.2", "font-weight": "700", "letter-spacing": "-0.6px", "margin-bottom": "12px" }
      : size === "section"
        ? { "font-size": "22px", "line-height": "1.3", "font-weight": "700", "letter-spacing": "-0.3px", "margin-bottom": "8px" }
        : { "font-size": "18px", "line-height": "1.35", "font-weight": "600", "margin-bottom": "6px" }),
    ...(o.center ? { "text-align": "center" } : {}),
    ...(o.band ? { color: "$button-text" } : {}),
  });
  if (!o.band) dark(b.id, "heading", { color: DARK.title });
  return b;
}
function t(html: string | string[], kind: "body" | "lead" | "small" | "eyebrow" = "body", o: { center?: boolean; band?: boolean; right?: boolean } = {}): Block {
  const paras = Array.isArray(html) ? html : [html];
  const b: Block = { id: id(), type: "text", html: paras.map((x) => `<p>${x}</p>`).join("") };
  put(b.id, "text", {
    ...(kind === "lead"
      ? { "font-size": "18px", "line-height": "1.6", color: "$muted", "margin-bottom": "22px" }
      : kind === "small"
        ? { "font-size": "14px", "line-height": "1.55", color: "$muted" }
        : kind === "eyebrow"
          ? { "font-size": "14px", "line-height": "1.4", "font-weight": "700", "letter-spacing": "1px", "text-transform": "uppercase", color: "$accent", "margin-bottom": "12px" }
          : { "font-size": "16px", "line-height": "1.65", "margin-bottom": "16px" }),
    ...(o.center ? { "text-align": "center" } : o.right ? { "text-align": "right" } : {}),
    ...(o.band ? { color: "$button-text" } : {}),
  });
  if (!o.band) dark(b.id, "text", { color: kind === "eyebrow" ? "$accent-dark" : kind === "body" ? DARK.text : DARK.muted });
  return b;
}
function btn(label: string, o: { center?: boolean; band?: boolean; quiet?: boolean } = {}): Block {
  const b: Block = { id: id(), type: "button", label: o.quiet ? `${label} →` : label, url: "https://", align: o.center ? "center" : "left" };
  put(b.id, "button", { ...pad(14, 28, 14, 28), "font-weight": "600", "margin-top": "6px", "margin-bottom": "10px" });
  if (!o.band && !o.quiet) dark(b.id, "button", BUTTON_DARK);
  if (o.band) put(b.id, "button", { "background-color": "$button-text", color: "$button-bg" });
  if (o.quiet) {
    put(b.id, "button", asLink);
    dark(b.id, "button", { "background-color": DARK.email, color: "$accent-dark" });
  }
  return b;
}
const list = (items: string[], ordered = false): Block => {
  const b: Block = { id: id(), type: "list", items, ordered };
  put(b.id, "list", { "font-size": "16px", "line-height": "1.7", "margin-bottom": "16px" });
  dark(b.id, "list", { color: DARK.text });
  return b;
};
const quote = (text: string, cite: string): Block => {
  const b: Block = { id: id(), type: "quote", text, cite };
  put(b.id, "quote", { "font-size": "20px", "line-height": "1.5", "font-style": "normal", color: "$text", "padding-left": "20px", "margin-top": "8px", "margin-bottom": "12px" });
  dark(b.id, "quote", { color: DARK.title, "border-left-color": "$accent-dark" });
  return b;
};
const event = (title: string, when: string, where: string, button: string): Block => {
  const b: Block = { id: id(), type: "event", title, when, where, url: "https://", button };
  put(b.id, "card", { "background-color": "$tint", ...noBorder, ...corners(14), ...pad(24, 24, 24, 24) });
  put(b.id, "button", { ...pad(12, 24, 12, 24), "font-weight": "600" });
  dark(b.id, "button", BUTTON_DARK);
  dark(b.id, "card", { "background-color": "$tint-dark" });
  dark(b.id, "card-title", { color: DARK.title });
  dark(b.id, "muted", { color: DARK.muted });
  return b;
};
const card = (title: string, text: string, button = "Read more", price?: string, image?: string): Block => {
  const b: Block = { id: id(), type: "product", title, text, url: "https://", button: button ? `${button} →` : "", ...(price ? { price } : {}), ...(image ? { image } : {}) };
  put(b.id, "card", { "background-color": "$surface", ...noBorder, ...corners(14), ...pad(22, 22, 22, 22), "margin-bottom": "12px" });
  put(b.id, "button", asLink);
  dark(b.id, "card", { "background-color": DARK.card });
  dark(b.id, "card-title", { color: DARK.title });
  dark(b.id, "text", { color: DARK.text });
  dark(b.id, "muted", { color: DARK.muted });
  dark(b.id, "button", { "background-color": DARK.card, color: "$accent-dark" });
  return b;
};
const meeting = (label = "Pick a time"): Block => {
  const b: Block = { id: id(), type: "meeting", label, url: "https://", align: "left" };
  put(b.id, "button", { ...pad(14, 28, 14, 28), "font-weight": "600", "margin-top": "6px", "margin-bottom": "10px" });
  dark(b.id, "button", BUTTON_DARK);
  return b;
};
const sign = (name = "Your name", title = "Your role"): Block => {
  const b: Block = { id: id(), type: "signature", name, title };
  dark(b.id, "text", { color: DARK.title });
  dark(b.id, "muted", { color: DARK.muted });
  return b;
};
const spacer = (height = 8): Block => ({ id: id(), type: "spacer", height });

// Sections ----------------------------------------------------------------------------------------------------------

type Look = "hero" | "body" | "band" | "tight" | "close" | "tint";
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
  const sides = { hero: pad(32, 40, 8, 40), body: pad(10, 40, 10, 40), band: pad(44, 40, 44, 40), tight: pad(2, 40, 2, 40), close: pad(10, 40, 36, 40), tint: pad(28, 40, 28, 40) }[look];
  put(s.id, "section", { ...sides, ...(look === "band" ? { "background-color": "$button-bg" } : look === "tint" ? { "background-color": "$tint" } : {}) });
  if (look === "tint") dark(s.id, "section", { "background-color": "$tint-dark" });
}
/** Numbers in a row on the brand's tint: [number, what it counts]. */
function stats(...items: [string, string][]): Section {
  const s = cols(
    "tint",
    ...items.map(([n, label]) => {
      const num = h(n, "section");
      put(num.id, "heading", { "font-size": "30px", color: "$accent", "margin-bottom": "2px" });
      dark(num.id, "heading", { color: "$accent-dark" });
      return [num, t(label, "small")];
    }),
  );
  return s;
}
/** The closing step on the brand's tint, centered: a title, a line and one button. */
function offer(title: string, line: string, button: string, o: { meeting?: boolean } = {}): Section {
  const b = o.meeting ? { ...meeting(button), align: "center" as const } : btn(button, { center: true });
  const s = sec("tint", h(title, "section", { center: true }), t(line, "body", { center: true }), b);
  put(s.id, "section", pad(36, 40, 36, 40));
  return s;
}
function header(): Section {
  const logo: Block = { id: id(), type: "logo", alt: "Logo", width: 120, align: "left" };
  dark(logo.id, "image", { color: DARK.title });
  const s = sec("body", logo);
  put(s.id, "section", pad(30, 40, 6, 40));
  return s;
}
function photoSection(src: string, alt: string): Section {
  const img: Block = { id: id(), type: "image", src, alt, width: 520, align: "center" };
  put(img.id, "image", corners(14));
  const s = sec("body", img);
  put(s.id, "section", pad(18, 40, 2, 40));
  return s;
}
function footer(): Section {
  const f: Block = { id: id(), type: "footer" };
  dark(f.id, "footer", { color: DARK.muted });
  const s = sec("body", f);
  put(s.id, "section", { ...pad(26, 40, 34, 40), ...hairline("top") });
  dark(s.id, "section", { "border-top-color": DARK.line });
  return s;
}

/** A template's email. Made with the template's key, its photo (photos.ts) goes under the header, if it has one. */
function email(_label: string, preheader: string, body: () => Section[]): (photo?: string) => EmailDoc {
  return (photo?: string) => {
    S = {};
    put("email", "content", corners(16));
    dark("email", "content", { "background-color": DARK.email });
    dark("email", "body", { "background-color": DARK.page });
    const pic = photo ? EMAIL_PHOTOS[photo] : undefined;
    const sections = [header(), ...(pic ? [photoSection(emailPhotoUrl(pic), pic.alt)] : []), ...body(), footer()];
    const styles = S;
    S = {};
    return readEmailDoc({ v: 1, settings: { width: 600, align: "center", darkMode: "auto", preheader, lang: "en" }, sections, styles });
  };
}

// The templates -------------------------------------------------------------------------------------------------------

/** The first 21; the rest of the library builds on the same blocks (library.ts, where EMAIL_TEMPLATES lives). */
export const BASE_TEMPLATES: EmailTemplate[] = [
  // Newsletters
  {
    key: "newsletter",
    name: "Monthly newsletter",
    group: "Newsletters",
    make: email("The monthly letter", "Three short reads for this month.", () => [
      sec("hero", t("This month", "eyebrow"), h("Three things worth your time"), t("What we learned, what we made better and the question we heard most. Five minutes, start to finish.", "lead")),
      sec("body", h("What we learned", "card"), t("Clients who book a short call before a project finish two weeks sooner. So we made that call the first step for everyone."), btn("Read the story", { quiet: true })),
      sec("body", h("What we made better", "card"), t("You can now pick your own time for a kickoff, right from your welcome email. No back and forth."), btn("See what's new", { quiet: true })),
      sec("close", h("What you asked", "card"), t("\u201cCan I bring my team to the first meeting?\u201d Yes, please do. Bring anyone who will decide with you."), btn("Read the answer", { quiet: true })),
    ]),
  },
  {
    key: "digest",
    name: "Numbers digest",
    group: "Newsletters",
    make: email("Your month", "Your month at a glance.", () => [
      sec("hero", t("Your month", "eyebrow"), h("Here's how your month went"), t(`${HI} these numbers come from your account, up to the last day of the month.`, "lead")),
      stats(["128", "New leads"], ["34", "Meetings booked"], ["9", "Deals won"]),
      sec("close", spacer(8), t("Your best week was the second one. Most of its leads came from your pricing page."), btn("Open your report")),
    ]),
  },
  {
    key: "founder_letter",
    name: "Founder letter",
    group: "Newsletters",
    make: email("A note from us", "A short note, written by a person.", () => [
      sec("hero", h("A note from our team", "section"), spacer(4), t([HI, "This month we said yes to fewer projects so we could do each one better. It was hard, and it was right. The work we shipped is the best we've done.", "Next month we're opening two new spots for spring. If you've been waiting, now is a good time to say hello.", "Thanks for reading, and for being here."])),
      sec("close", sign("Sam Rivera", "Founder")),
    ]),
  },

  // Product updates
  {
    key: "feature_launch",
    name: "Feature launch",
    group: "Product updates",
    make: email("New", "Now live for every team.", () => [
      sec("band", t("Now live", "eyebrow", { band: true }), h("Booking is now one click", "title", { band: true }), t("Your clients can pick a time from any email we send them. No links to copy, no back and forth.", "lead", { band: true }), btn("Try it now", { band: true })),
      sec("hero", h("What it does for you", "section")),
      cols("body", [h("Faster", "card"), t("Most meetings now book in under a minute.")], [h("Clearer", "card"), t("Everyone sees the same time, in their own time zone.")], [h("Calmer", "card"), t("Double bookings are a thing of the past.")]),
      sec("close", quote("We turned it on and the whole team used it the same day.", "Dana Lee, Office manager")),
    ]),
  },
  {
    key: "release_notes",
    name: "Release notes",
    group: "Product updates",
    make: email("Release notes", "What changed this month.", () => [
      sec("hero", t("Release notes", "eyebrow"), h("What's new this month"), t("Everything we shipped, in one place. The new ones are worth a look.", "lead")),
      sec("body", h("New", "card"), list(["Share any report with one link", "Pick a time right from your welcome email", "Dark mode on every screen"])),
      sec("body", h("Better", "card"), list(["Search is twice as fast", "Exports keep your column order"])),
      sec("close", h("Fixed", "card"), list(["Dates now show in your time zone", "Long names no longer get cut off"]), btn("See all changes", { quiet: true })),
    ]),
  },
  {
    key: "product_recap",
    name: "Product recap",
    group: "Product updates",
    make: email("This quarter", "The quarter's three biggest changes.", () => [
      sec("hero", t("This quarter", "eyebrow"), h("Three changes that save you time"), t(`${HI} here are the three changes teams used most this quarter.`, "lead")),
      sec("tight", card("Book from any email", "Clients pick a time from the email itself, so meetings land faster.")),
      sec("tight", card("Shared reports", "Send a live report to anyone with one link. It stays up to date.")),
      sec("close", card("Reminders that fit", "Reminders now go out at a time that suits each client's day.")),
    ]),
  },

  // Events and webinars
  {
    key: "webinar_invite",
    name: "Webinar invite",
    group: "Events and webinars",
    make: email("Live session", "Forty minutes, three ideas, your questions.", () => [
      sec("hero", t("Live webinar", "eyebrow"), h("Win back an hour a day"), t("Forty minutes with three people who run small teams, and time for your questions.", "lead")),
      sec("body", event("Win back an hour a day", "Thursday, November 14, 10:00 AM PT", "Online, the link comes by email", "Save my seat")),
      sec("body", spacer(6), h("You'll leave with", "card"), list(["The one meeting you can drop this week", "A simple way to plan your Mondays", "A checklist you can use the next day"])),
      cols("close", [h("Maya Chen", "card"), t("Studio owner", "small")], [h("Leo Park", "card"), t("Clinic manager", "small")], [h("Ava Brooks", "card"), t("Agency lead", "small")]),
    ]),
  },
  {
    key: "event_reminder",
    name: "Event reminder",
    group: "Events and webinars",
    make: email("Starting soon", "Your link and the plan for tomorrow.", () => [
      sec("hero", t("Tomorrow", "eyebrow"), h("Your seat is saved"), t(`${HI} here's your link. We start on time, and the recording comes the day after.`, "lead")),
      sec("close", event("Win back an hour a day", "Tomorrow, 10:00 AM PT", "Online", "Join the session")),
    ]),
  },
  {
    key: "event_followup",
    name: "Event follow-up",
    group: "Events and webinars",
    make: email("Thanks for joining", "The recording, the slides and the three takeaways.", () => [
      sec("hero", t("Recording", "eyebrow"), h("Thanks for joining us"), t("Here are the recording and the slides, as promised, and the three ideas people asked about most.", "lead"), btn("Watch the recording")),
      sec("body", spacer(4), list(["Drop one recurring meeting and send a short update instead", "Plan Monday on Friday afternoon", "Keep one hour a day free of calls"], true)),
      offer("Want to try it with your team?", "Book 20 minutes and we'll set it up with you.", "Book 20 minutes", { meeting: true }),
    ]),
  },

  // Welcome and onboarding
  {
    key: "welcome",
    name: "Welcome",
    group: "Welcome and onboarding",
    make: email("Welcome", "Three steps to get going this week.", () => [
      sec("hero", t("Welcome", "eyebrow"), h("Welcome, {{first_name|friend}}"), t("Most people are up and running in a day. These three steps get you there.", "lead")),
      cols("body", [t("Step 1", "eyebrow"), h("Set up", "card"), t("Add your details. It takes about five minutes.")], [t("Step 2", "eyebrow"), h("Invite", "card"), t("Bring in the people you work with.")], [t("Step 3", "eyebrow"), h("Go", "card"), t("Book your first session with us.")]),
      sec("close", spacer(4), btn("Start step 1"), spacer(8), t("Questions? Reply to this email. A person reads every one.", "small")),
    ]),
  },
  {
    key: "onboarding_step",
    name: "Next step",
    group: "Welcome and onboarding",
    make: email("Getting started", "The one step most people miss.", () => [
      sec("hero", t("Day 2", "eyebrow"), h("The step most people miss"), t(`${HI} people who do this in their first week get twice as much from us. It takes ten minutes.`, "lead"), btn("Do it now")),
      sec("close", spacer(4), card("Tip", "Keep this email. The link brings you straight back to the step.", "Show me")),
    ]),
  },
  {
    key: "trial_ending",
    name: "Trial ending",
    group: "Welcome and onboarding",
    make: email("Your trial", "Three days left. Here's what you've built.", () => [
      sec("hero", t("3 days left", "eyebrow"), h("Keep what you've built"), t(`${HI} your trial ends on Friday. Pick a plan to keep everything your team set up.`, "lead")),
      stats(["4", "Teammates invited"], ["12", "Workflows running"], ["86", "Hours saved"]),
      sec("tight", spacer(12), btn("Choose a plan")),
      sec("close", t("Not sure which plan fits? Book 15 minutes and we'll help you pick.", "small"), meeting("Talk to us")),
    ]),
  },

  // Nurture and win-back
  {
    key: "customer_story",
    name: "Customer story",
    group: "Nurture and win-back",
    make: email("Customer story", "How one team did it, in three steps.", () => [
      sec("hero", t("Customer story", "eyebrow"), quote("We stopped losing leads between our website and our team in the first week.", "Priya Shah, owner of Northside Dental")),
      stats(["40%", "More bookings"], ["2 days", "To go live"], ["0", "Leads lost"]),
      sec("close", spacer(8), t("Before, new patients filled in a form and waited for a call. Now they book a visit on the spot, and the front desk sees it at once."), btn("Read the story")),
    ]),
  },
  {
    key: "resource",
    name: "Guide",
    group: "Nurture and win-back",
    make: email("A guide for you", "A guide people like you use.", () => [
      sec("hero", t("Guide", "eyebrow"), h("The guide our clients ask for first"), t(`${HI} we put what we learned from hundreds of projects into one short guide.`, "lead")),
      sec("tight", card("What's inside", "Five chapters, each one a change you can make in an afternoon.", "")),
      offer("Free, and about 15 minutes to read", "No sign-up. It's yours to keep and share.", "Get the guide"),
    ]),
  },
  {
    key: "winback",
    name: "Win-back",
    group: "Nurture and win-back",
    make: email("What's new", "A lot has changed since your last visit.", () => [
      sec("hero", h("A lot has changed since your last visit", "section"), spacer(4), t([HI, "Here are the three changes people tell us they like most."])),
      sec("body", list(["Booking takes one click", "Reminders arrive when they suit you", "Your history is all in one place"])),
      sec("close", btn("Take a look"), spacer(8), t("Not the right time? You can change how often you hear from us.", "small")),
    ]),
  },

  // Sales follow-up
  {
    key: "after_demo",
    name: "After the demo",
    group: "Sales follow-up",
    make: email("Notes from our call", "What we covered and what comes next.", () => [
      sec("hero", h("Thanks for your time today", "section"), spacer(4), t([HI, "Here's what we covered, so it's easy to share with your team."])),
      sec("body", h("What we covered", "card"), list(["What your team needs most", "How it fits what you use today", "What a first month looks like"])),
      sec("body", h("Next steps", "card"), list(["We send the plan by Thursday", "You share it with your team", "We meet again next week"], true)),
      sec("close", meeting("Pick a time for next week"), spacer(8), sign("Sam Rivera", "Account lead")),
    ]),
  },
  {
    key: "plain_followup",
    name: "Plain follow-up",
    group: "Sales follow-up",
    make: email("", "A short note.", () => [
      sec("hero", t([HI, "I wanted to follow up on my last note. Most people start with one small change, and it's often the one that matters most.", "Would 20 minutes next week help?"])),
      sec("close", meeting(), spacer(8), sign("Sam Rivera", "Account lead")),
    ]),
  },
  {
    key: "proposal",
    name: "Proposal",
    group: "Sales follow-up",
    make: email("Your proposal", "Your plan, the price and the next step.", () => [
      sec("hero", t("Proposal", "eyebrow"), h("Your plan for {{company|your team}}"), t("Everything we talked about, on one page you can share.", "lead")),
      sec("body", card("The plan we suggest", "Setup, training for five people and three months of support, starting the first week of next month.", "Review the proposal", "$1,200 a month")),
      sec("close", t("Questions before you decide? Reply here or pick a time."), meeting("Pick a time"), spacer(8), sign("Sam Rivera", "Account lead")),
    ]),
  },

  // Meetings and forms
  {
    key: "meeting_confirmed",
    name: "Meeting confirmed",
    group: "Meetings and forms",
    make: email("Meeting", "You're booked. Here are the details.", () => [
      sec("hero", t("Confirmed", "eyebrow"), h("You're booked"), t(`${HI} we're looking forward to it. The invite is in your calendar.`, "lead")),
      sec("close", event("Intro call with our team", "Thursday, November 14, 10:00 to 10:30 AM PT", "Video call", "Add to calendar")),
    ]),
  },
  {
    key: "meeting_reminder",
    name: "Meeting reminder",
    group: "Meetings and forms",
    make: email("Meeting", "Tomorrow, and how to get the most from it.", () => [
      sec("hero", t("Tomorrow", "eyebrow"), h("See you tomorrow"), t("Three things that make the call more useful for you:", "lead")),
      sec("body", list(["Bring one problem you'd like solved", "Invite anyone who'd decide with you", "Have your current setup open"])),
      sec("close", event("Intro call with our team", "Tomorrow, 10:00 AM PT", "Video call", "Join the call")),
    ]),
  },
  {
    key: "form_thanks",
    name: "Form thank you",
    group: "Meetings and forms",
    make: email("Thanks", "We got your note.", () => [
      sec("hero", t("Received", "eyebrow"), h("Thanks, we got your note"), t("Someone from our team will reply within one working day.", "lead")),
      offer("Want to skip the wait?", "Pick a time that suits you and we'll call you then.", "Pick a time now", { meeting: true }),
      sec("close", spacer(8), t("You're getting this because you filled in a form on our site.", "small", { center: true })),
    ]),
  },
];

/** The blocks and sections, for the rest of the library (library.ts). */
export const kit = { h, t, btn, list, quote, event, card, meeting, sign, spacer, sec, cols, stats, offer, email, HI, NAME };
