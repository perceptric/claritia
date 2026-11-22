// An email as Tia writes it (compose_email): for tests that need a real, styled email.
import { composeEmail, type ComposeSpec } from "../../src/lib/design/email/compose.ts";

export const SAMPLE_SPEC: ComposeSpec = {
  preheader: "Three things worth your time.",
  parts: [
    { kind: "hero", eyebrow: "This month", title: "Three things worth your time", lead: "What we learned, what we made better and the question we heard most." },
    { kind: "photo", photo: "person-reading-open" },
    { kind: "text", heading: "What we learned", paragraphs: ["Clients who book a short call before a project finish two weeks sooner."], link: "Read the story" },
    { kind: "button", label: "Book a call" },
    { kind: "sign", text: "See you next month.", name: "Sam Rivera", title: "Founder" },
  ],
};

export const sampleEmail = () => composeEmail(SAMPLE_SPEC);
