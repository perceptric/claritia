"use client";

import { useSyncExternalStore } from "react";

// What only the guest's browser knows (time zone, 12 or 24 hours), read without an extra render pass. The server
// render uses UTC and am/pm, and `mounted` is false there, so nothing time-dependent is drawn until the browser's turn.

const never = () => () => {};

export function detectZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function prefers12h(): boolean {
  try {
    const c = new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hourCycle;
    return c === "h12" || c === "h11";
  } catch {
    return true;
  }
}

export const useMounted = () => useSyncExternalStore(never, () => true, () => false);
export const useZone = () => useSyncExternalStore(never, detectZone, () => "UTC");
export const use12h = () => useSyncExternalStore(never, prefers12h, () => true);

function sundayFirst(): boolean {
  try {
    const loc = new Intl.Locale(navigator.language) as Intl.Locale & { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } };
    const first = loc.getWeekInfo?.().firstDay ?? loc.weekInfo?.firstDay;
    return first ? first === 7 : /-(US|CA|MX|BR|JP|IL|PH)$/i.test(navigator.language);
  } catch {
    return false;
  }
}

/** Whether the guest's calendar starts weeks on Sunday. */
export const useSundayFirst = () => useSyncExternalStore(never, sundayFirst, () => false);

/** A message to the page around an embed (<claritia-book>). */
export function postToParent(msg: Record<string, unknown>) {
  try {
    if (window.parent !== window) window.parent.postMessage({ claritia: true, ...msg }, "*");
  } catch {}
}
