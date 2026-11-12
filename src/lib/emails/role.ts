// Shared inboxes (info@, sales@): a team reads them, so nobody in particular agreed to the email, and they complain
// and bounce more. Imports mark them and Audiences shows them (docs/email-studio-plan.md Part 10).

export const ROLE_NAMES = new Set(
  "sales info hello contact team support admin billing marketing office hr jobs careers press noreply no-reply accounts finance".split(" "),
);

export const isRoleAddress = (email: string) => ROLE_NAMES.has(email.slice(0, email.lastIndexOf("@")).toLowerCase().split("+")[0]!);
