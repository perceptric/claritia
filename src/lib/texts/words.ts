// Text messages' words (docs/integrations-plan.md, Next step 3): merge fields, the opt-out line, segment counts and
// the reply keywords. Runs anywhere (the workflow editor counts segments as you type).

/** {{first_name|there}}: the value, else the word after the bar, else nothing. */
export function fillText(text: string, vars: Record<string, string | null | undefined>): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*(?:\|([^}]*))?\}\}/g, (_m, k: string, alt?: string) => {
    const v = vars[k];
    return v != null && v !== "" ? String(v) : (alt ?? "").trim();
  });
}

/** The words beside a Text consent box, kept with the consent. */
export const SMS_WORDING = "Text me about my booking. Message and data rates may apply. Reply STOP to opt out.";

/** Every text says how to stop them, unless it already does. */
export const STOP_LINE = "Reply STOP to opt out.";
export const withStop = (text: string) => (/\bSTOP\b/.test(text) ? text : `${text.trimEnd()}\n${STOP_LINE}`);

const GSM = new Set(
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà^{}\\[~]|€",
);
const DOUBLE = new Set("^{}\\[~]|€");

/** How many messages a text takes: 160 plain characters (153 each when split), 70 with any other (67 each). */
export function segments(text: string): { count: number; unicode: boolean; chars: number } {
  const chars = [...text];
  const unicode = chars.some((c) => !GSM.has(c));
  if (unicode) return { unicode, chars: chars.length, count: chars.length <= 70 ? 1 : Math.ceil(chars.length / 67) };
  const n = chars.reduce((a, c) => a + (DOUBLE.has(c) ? 2 : 1), 0);
  return { unicode, chars: n, count: n <= 160 ? 1 : Math.ceil(n / 153) };
}

/** The most a step's text may be: three messages. */
export const TEXT_MAX = 459;

const STOP = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "OPTOUT", "REVOKE"]);
const START = new Set(["START", "UNSTOP", "YES", "OPTIN"]);
const HELP = new Set(["HELP", "INFO"]);

/** A reply's keyword: the whole message, ignoring case and punctuation around it. */
export function keywordOf(body: string): "stop" | "start" | "help" | null {
  const w = body.trim().toUpperCase().replace(/[^A-Z]/g, "");
  return STOP.has(w) ? "stop" : START.has(w) ? "start" : HELP.has(w) ? "help" : null;
}

/** A WhatsApp template's Content SID. */
export const isContentSid = (v: string) => /^HX[0-9a-f]{32}$/.test(v);
