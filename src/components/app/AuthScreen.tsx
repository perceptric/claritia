"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SupaConfig } from "@/lib/supa";
import { useCallback, useEffect, useState } from "react";
import { authMessage, linkLine } from "@/lib/authLimits";
import { suggestEmail } from "@/lib/emailTypos";
import { Logo } from "../Logo";
import { FlowDemo } from "./FlowDemo";
import { Turnstile } from "./Turnstile";
import { Badge, Button, ErrorNote, errorText } from "./ui";

// Signed out, the screen has its own address: /signin, or /signup from "Start free". The page someone first opened is
// kept for after signing in; an app's sign-in (/oauth/authorize) keeps its own address and request.
const NEXT_KEY = "claritia:next";
export const isAuthPath = (p: string) => p === "/signin" || p === "/signup";
const isAppPath = (p: string) => p !== "/" && !isAuthPath(p) && /^\/[a-z0-9/_-]*$/i.test(p);

/** The page to open after signing in, once. */
export function takeNext(): string {
  let next = "/forms";
  try {
    const v = sessionStorage.getItem(NEXT_KEY);
    if (v && isAppPath(v.split("?")[0]!)) next = v;
    sessionStorage.removeItem(NEXT_KEY);
  } catch {}
  return next;
}

const appUrl = () => {
  if (/^\/(oauth|claim)\//.test(window.location.pathname)) return window.location.href;
  let next = "/forms";
  try {
    const v = sessionStorage.getItem(NEXT_KEY);
    if (v && isAppPath(v.split("?")[0]!)) next = v;
  } catch {}
  return `${window.location.origin}${next}`;
};

/** Moves a signed-out visit to /signin (or keeps /signup), remembering the page it was for. */
function useAuthAddress(): "signin" | "signup" {
  const [mode, setMode] = useState<"signin" | "signup">(() => (typeof window !== "undefined" && /^\/(signup$|claim\/)/.test(window.location.pathname) ? "signup" : "signin"));
  useEffect(() => {
    const { pathname, search } = window.location;
    if (/^\/(oauth|claim)\//.test(pathname)) return;
    if (isAppPath(pathname)) {
      try {
        sessionStorage.setItem(NEXT_KEY, pathname + cleanSearch(search));
      } catch {}
    }
    // From the website (a template's "Use this form template", say): a new account is the likely ask.
    const fromSite = /^https:\/\/(www\.)?tryclaritia\.com\//.test(document.referrer);
    const onPop = () => setMode(window.location.pathname === "/signup" ? "signup" : "signin");
    window.addEventListener("popstate", onPop);
    if (!isAuthPath(pathname)) {
      window.history.replaceState(null, "", fromSite ? "/signup" : "/signin");
      window.dispatchEvent(new PopStateEvent("popstate"));
    } else if (cleanSearch(search) !== search || window.location.hash) {
      // What a link left on /signin or /signup comes off, so a reload doesn't say it again.
      window.history.replaceState(null, "", pathname + cleanSearch(search));
    }
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return mode;
}

/** What a sign-in link that came back here couldn't do (src/lib/authLimits.ts); read before the address is cleaned. */
const readLinkLine = () => (typeof window === "undefined" ? null : linkLine(window.location.search, window.location.hash));
const ERROR_KEYS = ["error", "error_code", "error_description", "code", "sb_flow_id"];
/** The address without what a failed sign-in left on it. */
const cleanSearch = (search: string) => {
  const q = new URLSearchParams(search);
  for (const k of ERROR_KEYS) q.delete(k);
  const out = q.toString();
  return out ? `?${out}` : "";
};

/** Between /signin and /signup without a reload. */
function go(to: "signin" | "signup") {
  window.history.pushState(null, "", `/${to}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

const message = (e: unknown) => authMessage(errorText(e));

/**
 * Asks the server whether this address and IP may get another sign-in email (src/app/api/auth/link). The wait to show
 * when they can't, or "" when they can. A hiccup is tried again; if the server still can't answer, the link goes
 * ahead, since the sign-in service keeps its own limits.
 */
async function linkWait(email: string): Promise<string> {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch("/api/auth/link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }), signal: AbortSignal.timeout(8000) });
      if (res.status === 429 || res.status === 400) return String(((await res.json().catch(() => ({}))) as { error?: unknown }).error ?? "Too many sign-in emails. Try again later.");
      if (res.ok) return "";
    } catch {
      // A network hiccup: try again.
    }
    await new Promise((r) => setTimeout(r, 400 * (i + 1)));
  }
  return "";
}

// The way someone signed in last on this computer, tagged "Last used" on /signin.
const LAST_KEY = "claritia:last-signin";
type Method = "google" | "azure" | "email";
const readLast = (): Method | null => {
  try {
    const v = localStorage.getItem(LAST_KEY);
    return v === "google" || v === "azure" || v === "email" ? v : null;
  } catch {
    return null;
  }
};
const saveLast = (m: Method) => {
  try {
    localStorage.setItem(LAST_KEY, m);
  } catch {}
};

type Invite = { workspace: string; inviter: string | null; email: string };
/** The invite this page is for (/signup?invite=<id> from the invite email), or null for plain sign-up. */
function useInvite(onFound: (i: Invite) => void): Invite | null {
  const [invite, setInvite] = useState<Invite | null>(null);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("invite");
    if (!id) return;
    let live = true;
    (async () => {
      for (let i = 0; i < 3 && live; i++) {
        try {
          const r = await fetch(`/api/auth/invite?${new URLSearchParams({ id })}`, { signal: AbortSignal.timeout(6000) });
          if (r.status === 404) return;
          if (r.ok) {
            const j = (await r.json()) as Invite;
            if (live && j.workspace) {
              setInvite(j);
              onFound(j);
            }
            return;
          }
        } catch {
          // A hiccup: try again.
        }
        await new Promise((res) => setTimeout(res, 500 * (i + 1)));
      }
    })();
    return () => {
      live = false;
    };
  }, [onFound]);
  return invite;
}

/** A sign-up form on the website can send the email along (/signup?email=...). */
const emailFromAddress = () => (typeof window === "undefined" ? "" : (new URLSearchParams(window.location.search).get("email") ?? "").trim().slice(0, 254));

// A stuck request should never leave the button spinning forever.
function withTimeout<T>(p: Promise<T>, ms = 20000): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("The request took too long. Check your connection and try again.")), ms))]);
}

const RESEND_AFTER = 30;
type Provider = "google" | "azure";

function GoogleLogo() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function MicrosoftLogo() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 23 23">
      <path fill="#F25022" d="M1 1h10v10H1z" />
      <path fill="#7FBA00" d="M12 1h10v10H12z" />
      <path fill="#00A4EF" d="M1 12h10v10H1z" />
      <path fill="#FFB900" d="M12 12h10v10H12z" />
    </svg>
  );
}

const ssoClass = "press flex h-11 w-full items-center justify-center gap-3 rounded-full bg-card shadow-outline text-[13.5px] font-medium text-ink hover:bg-hover disabled:opacity-50";
// Open Gmail and Open Outlook on the Check your inbox screen.
const mailLink = "press flex h-10 min-w-0 items-center justify-center rounded-full bg-card px-4 text-center text-[13px] font-medium text-ink shadow-outline hover:bg-hover";

/** Split screen: the form on the left, and Claritia's flow (form, meeting, follow-up emails) on the right. */
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen bg-card md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col px-6 py-8 md:px-14">
        <a href="https://tryclaritia.com" aria-label="Claritia home" className="self-start">
          <Logo />
        </a>
        <div className="anim-rise my-auto w-full max-w-sm space-y-6 self-center py-10">{children}</div>
      </div>
      <div className="relative m-2 hidden overflow-hidden rounded-2xl border border-line bg-paper md:block">
        <div className="relative flex h-full flex-col items-center justify-center gap-8 p-10">
          <p className="max-w-md text-center text-[36px] leading-[1.05] font-medium tracking-[-0.04em] text-ink">
            Catch every lead.
            <span className="block text-faint">Book the meeting.</span>
          </p>
          <FlowDemo className="max-w-[440px]" />
        </div>
      </div>
    </main>
  );
}

/** One screen for everyone: Google or Microsoft first, an email link as the backup. New people get an account on first sign-in. */
export function AuthScreen({ sb, config, turnstileSiteKey = null }: { sb: SupabaseClient; config?: SupaConfig; turnstileSiteKey?: string | null }) {
  const mode = useAuthAddress();
  const [email, setEmail] = useState(emailFromAddress);
  const invite = useInvite(useCallback((i: Invite) => setEmail((e) => e || i.email), []));
  const [last] = useState(readLast);
  const lastTag = (m: Method) =>
    mode === "signin" && !invite && last === m ? (
      <span className="inline-flex sm:absolute sm:right-3">
        <Badge>Last used</Badge>
      </span>
    ) : null;
  const typo = suggestEmail(email);
  // The sign-in options turned on in Supabase (its public settings); Google until it answers.
  const [on, setOn] = useState<Record<string, boolean>>({ google: true, azure: false });
  useEffect(() => {
    if (!config) return;
    fetch(`${config.url}/auth/v1/settings`, { headers: { apikey: config.key } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { external?: Record<string, boolean> } | null) => {
        if (j?.external) setOn({ google: !!j.external.google, azure: !!j.external.azure });
      })
      .catch(() => undefined);
  }, [config]);
  // What's waiting: one sign-in option, or the email link. Each button says what it's doing; the rest wait.
  const [pending, setPending] = useState<null | Provider | "email" | "code">(null);
  const busy = pending !== null;
  const [link] = useState(readLinkLine);
  const [error, setError] = useState(link?.tone === "error" ? link.message : "");
  // A link opened in another browser: one line on how to get in here, until they send a new one.
  const [note, setNote] = useState(link?.tone === "note" ? link.message : "");
  const [sentTo, setSentTo] = useState("");
  const [wait, setWait] = useState(0);
  // The 6-digit code from the same email, for when the link opens in another browser or a mail scanner used it up.
  const [code, setCode] = useState("");
  // The bot check's one-time token. Each email sent spends it, so the next round fetches a new one.
  const [captcha, setCaptcha] = useState("");
  const [round, setRound] = useState(0);
  const onToken = useCallback((t: string) => setCaptcha(t), []);
  const check = turnstileSiteKey ? <Turnstile siteKey={turnstileSiteKey} round={round} onToken={onToken} /> : null;

  // Back from Google or Microsoft without signing in: the browser shows this page as it was left, still waiting.
  // Coming back unlocks it; so does a sign-in page that never opened.
  useEffect(() => {
    const back = (e: PageTransitionEvent) => {
      if (e.persisted) setPending(null);
    };
    window.addEventListener("pageshow", back);
    return () => window.removeEventListener("pageshow", back);
  }, []);
  useEffect(() => {
    if (pending === null || pending === "email") return;
    const t = setTimeout(() => setPending(null), 15000);
    return () => clearTimeout(t);
  }, [pending]);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function oauth(provider: Provider) {
    setPending(provider);
    saveLast(provider);
    setError("");
    try {
      // Microsoft's sign-in gives the email only when asked for it. Google shows its account picker every time, so
      // someone signed in to more than one account picks the right one.
      const extra = provider === "azure" ? { scopes: "email" } : provider === "google" ? { queryParams: { prompt: "select_account" } } : {};
      const { error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo: appUrl(), ...extra } });
      if (error) throw error;
    } catch (err) {
      setError(message(err));
      setPending(null);
    }
  }

  async function sendLink(raw: string) {
    const to = raw.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return setError("Enter your email address.");
    if (turnstileSiteKey && !captcha) return setError("Wait for the security check to finish, then try again.");
    setPending("email");
    setError("");
    setNote("");
    try {
      const limited = await linkWait(to);
      if (limited) return setError(limited);
      const { error } = await withTimeout(sb.auth.signInWithOtp({ email: to, options: { emailRedirectTo: appUrl(), captchaToken: captcha || undefined } }));
      if (turnstileSiteKey) {
        setCaptcha("");
        setRound((r) => r + 1);
      }
      if (error) throw error;
      saveLast("email");
      setSentTo(to);
      setCode("");
      setWait(RESEND_AFTER);
    } catch (err) {
      setError(message(err));
    } finally {
      setPending(null);
    }
  }

  // Signs in with the code from the email. The app opens on its own once the session arrives.
  async function verifyCode() {
    const token = code.replace(/\D/g, "");
    if (token.length < 6) return;
    setPending("code");
    setError("");
    try {
      const { error } = await withTimeout(sb.auth.verifyOtp({ email: sentTo, token, type: "email" }));
      if (error) throw error;
    } catch (err) {
      setError(message(err));
      setCode("");
      setPending(null);
    }
  }

  if (sentTo) {
    return (
      <Frame>
        <div className="space-y-2">
          <h1 className="font-semibold tracking-[-0.02em] text-[28px] leading-tight">Check your inbox</h1>
          <p className="text-sm text-muted">
            We sent a sign-in link and code to <span className="font-medium wrap-anywhere text-ink">{sentTo}</span>. Click the link, or type the code here.
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void verifyCode();
          }}
          className="flex gap-2"
        >
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 10))}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            placeholder="Code"
            aria-label="Sign-in code"
            className="h-11 min-w-0 flex-1 rounded-md bg-card px-3 text-center text-[16px] tracking-[0.3em] tabular-nums shadow-input outline-none placeholder:tracking-normal"
          />
          <Button type="submit" className="h-11 shrink-0" disabled={busy || code.length < 6}>
            {pending === "code" ? "Checking…" : "Sign in"}
          </Button>
        </form>
        <div className="grid grid-cols-2 gap-2">
          <a href="https://mail.google.com/mail/u/0/#search/from%3Atryclaritia.com" target="_blank" rel="noopener noreferrer" className={mailLink}>
            Open Gmail
          </a>
          <a href="https://outlook.office.com/mail/" target="_blank" rel="noopener noreferrer" className={mailLink}>
            Open Outlook
          </a>
        </div>
        {check}
        <ErrorNote message={error} />
        <div className="flex items-center justify-between text-sm">
          <button type="button" className="text-muted hover:text-ink" onClick={() => (setSentTo(""), setError(""), setCode(""))}>
            Use a different email
          </button>
          <button type="button" className="font-medium text-ink underline-offset-4 hover:underline disabled:text-muted disabled:no-underline" disabled={busy || wait > 0} onClick={() => sendLink(sentTo)}>
            {pending === "email" ? "Sending…" : wait > 0 ? `Send again in ${wait}s` : "Send again"}
          </button>
        </div>
      </Frame>
    );
  }

  return (
    <Frame>
      <div>
        {invite ? (
          <>
            <h1 className="font-semibold tracking-[-0.02em] text-[31px] leading-[1.05] wrap-break-word">
              Join {invite.workspace}
              <span className="text-muted"> on Claritia</span>
            </h1>
            <p className="mt-2 text-sm text-ink">
              {invite.inviter ? `${invite.inviter} invited you. ` : ""}Use <span className="font-medium wrap-anywhere">{invite.email}</span> to join.
            </p>
          </>
        ) : mode === "signup" ? (
          <h1 className="font-semibold tracking-[-0.02em] text-[31px] leading-[1.05]">
            Create
            <span className="text-muted"> your account</span>
          </h1>
        ) : (
          <h1 className="font-semibold tracking-[-0.02em] text-[31px] leading-[1.05]">
            Welcome
            <span className="text-muted"> back</span>
          </h1>
        )}
        {mode === "signup" && !invite ? <p className="mt-2 text-sm text-ink">Free for one seat. No card needed.</p> : null}
        <p className={`mt-1 text-sm text-muted ${invite ? "hidden" : ""}`}>
          {mode === "signup" ? "Already have an account? " : "New to Claritia? "}
          <button type="button" onClick={() => go(mode === "signup" ? "signin" : "signup")} className="font-medium text-ink underline-offset-4 hover:underline">
            {mode === "signup" ? "Sign in" : "Create an account"}
          </button>
        </p>
      </div>
      <div className="space-y-2.5">
        {on.google ? (
          <button type="button" onClick={() => oauth("google")} disabled={busy} className={`relative ${ssoClass}`}>
            <GoogleLogo />
            {pending === "google" ? "Opening Google…" : "Continue with Google"}
            {lastTag("google")}
          </button>
        ) : null}
        {on.azure ? (
          <button type="button" onClick={() => oauth("azure")} disabled={busy} className={`relative ${ssoClass}`}>
            <MicrosoftLogo />
            {pending === "azure" ? "Opening Microsoft…" : "Continue with Microsoft"}
            {lastTag("azure")}
          </button>
        ) : null}
      </div>
      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-line" />
        or use your email
        <span className="h-px flex-1 bg-line" />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendLink(email.trim());
        }}
        className="space-y-3"
      >
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          aria-label="Email"
          className="h-11 w-full rounded-md bg-card shadow-input px-3.5 text-[14px] outline-none"
        />
        {typo ? (
          <p className="text-sm text-muted">
            Did you mean{" "}
            <button type="button" className="font-medium wrap-anywhere text-ink underline-offset-4 hover:underline" onClick={() => setEmail(typo)}>
              {typo}
            </button>
            ?
          </p>
        ) : null}
        <Button type="submit" className="relative h-11 w-full" disabled={busy}>
          {pending === "email" ? "Sending…" : "Continue with email"}
          {lastTag("email")}
        </Button>
      </form>
      {check}
      {note ? (
        <p role="status" className="rounded-lg bg-signal-pale px-3.5 py-2.5 text-[13px] text-signal-text">
          {note}
        </p>
      ) : null}
      <ErrorNote message={error} />
      <p className="text-center text-xs leading-relaxed text-muted">
        By continuing, you agree to the{" "}
        <a href="https://tryclaritia.com/terms" className="text-ink underline-offset-4 hover:underline">
          Terms
        </a>{" "}
        and{" "}
        <a href="https://tryclaritia.com/privacy" className="text-ink underline-offset-4 hover:underline">
          Privacy Policy
        </a>
        .
      </p>
    </Frame>
  );
}
