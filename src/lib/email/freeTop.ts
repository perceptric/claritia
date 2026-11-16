// The free email providers most people use, small enough to ship in the form script: a work email field refuses
// them on the page they're typed on, before Next. The server still checks the full list (free-email-domains in
// address.ts) when the form is sent, so a rarer free provider is caught there.

export const FREE_TOP = new Set(
  "gmail googlemail yahoo ymail hotmail outlook live msn icloud me mac aol proton.me protonmail gmx mail yandex qq 163 126 naver"
    .split(" ")
    .map((d) => (d.includes(".") ? d : `${d}.com`)),
);

/** Whether an email is at one of the common free providers (its domain, lower case). */
export const isFreeTop = (email: string) => FREE_TOP.has(email.trim().toLowerCase().split("@").pop() ?? "");
