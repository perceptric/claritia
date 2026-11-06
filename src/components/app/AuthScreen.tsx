"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SupaConfig } from "@/lib/supa";
import { useEffect, useState } from "react";
import { Logo } from "../Logo";
import { Catch } from "./Catch";
import { Button, ErrorNote, errorText } from "./ui";

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
  if (window.location.pathname.startsWith("/oauth/")) return window.location.href;
  let next = "/forms";
  try {
    const v = sessionStorage.getItem(NEXT_KEY);
    if (v && isAppPath(v.split("?")[0]!)) next = v;
  } catch {}
  return `${window.location.origin}${next}`;
};

/** Moves a signed-out visit to /signin (or keeps /signup), remembering the page it was for. */
function useAuthAddress(): "signin" | "signup" {
  const [mode, setMode] = useState<"signin" | "signup">(() => (typeof window !== "undefined" && window.location.pathname === "/signup" ? "signup" : "signin"));
  useEffect(() => {
    const { pathname, search } = window.location;
    if (pathname.startsWith("/oauth/")) return;
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
    }
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return mode;
}

/** What went wrong with a sign-in link, when Supabase sends someone back with an error; read before the address is cleaned. */
function linkError(): string {
  if (typeof window === "undefined") return "";
  const q = new URLSearchParams(window.location.search);
  const hsh = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const raw = q.get("error_description") || hsh.get("error_description") || q.get("error") || hsh.get("error") || "";
  if (!raw) return "";
  if (/verifier|code challenge|flow state/i.test(raw)) return "Open the sign-in link in the same browser you asked for it from, or send a new one here.";
  if (/expired|invalid|otp/i.test(raw)) return "That sign-in link has expired or was already used. Send a new one.";
  if (/access_denied|cancel/i.test(raw)) return "";
  return raw.replace(/\+/g, " ");
}
const ERROR_KEYS = ["error", "error_code", "error_description", "code"];
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

function message(e: unknown) {
  const text = errorText(e);
  if (/rate limit/i.test(text)) return "Too many emails were sent in a short time. Wait a minute and try again.";
  if (/provider is not enabled/i.test(text)) return "This sign-in option is not turned on yet. Use email for now.";
  if (/took too long/i.test(text)) return "This is taking longer than usual. Check your inbox; if nothing arrives in a minute, try again.";
  return text;
}

// A stuck request should never leave the button spinning forever.
function withTimeout<T>(p: Promise<T>, ms = 20000): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("The request took too long. Check your connection and try again.")), ms))]);
}

const RESEND_AFTER = 30;
type Provider = "google" | "azure" | "github";

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

function GitHubLogo() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

const ssoClass = "press flex h-11 w-full items-center justify-center gap-3 rounded-full bg-card shadow-outline text-[13.5px] font-medium text-ink hover:bg-hover disabled:opacity-50";

/** Split screen: the form on the left, and the website's Catch on the right. */
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
          <Catch className="max-w-[420px]" />
        </div>
      </div>
    </main>
  );
}

/** One screen for everyone: Google, Microsoft or GitHub first, an email link as the backup. New people get an account on first sign-in. */
export function AuthScreen({ sb, config }: { sb: SupabaseClient; config?: SupaConfig }) {
  const mode = useAuthAddress();
  const [email, setEmail] = useState("");
  // The sign-in options turned on in Supabase (its public settings); Google and GitHub until it answers.
  const [on, setOn] = useState<Record<string, boolean>>({ google: true, azure: false, github: true });
  useEffect(() => {
    if (!config) return;
    fetch(`${config.url}/auth/v1/settings`, { headers: { apikey: config.key } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { external?: Record<string, boolean> } | null) => {
        if (j?.external) setOn({ google: !!j.external.google, azure: !!j.external.azure, github: !!j.external.github });
      })
      .catch(() => undefined);
  }, [config]);
  // What's waiting: one sign-in option, or the email link. Each button says what it's doing; the rest wait.
  const [pending, setPending] = useState<null | Provider | "email">(null);
  const busy = pending !== null;
  const [error, setError] = useState(linkError);
  const [sentTo, setSentTo] = useState("");
  const [wait, setWait] = useState(0);

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
    setError("");
    try {
      // Microsoft's sign-in gives the email only when asked for it.
      const { error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo: appUrl(), ...(provider === "azure" ? { scopes: "email" } : {}) } });
      if (error) throw error;
    } catch (err) {
      setError(message(err));
      setPending(null);
    }
  }

  async function sendLink(raw: string) {
    const to = raw.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return setError("Enter your email address.");
    setPending("email");
    setError("");
    try {
      const { error } = await withTimeout(sb.auth.signInWithOtp({ email: to, options: { emailRedirectTo: appUrl() } }));
      if (error) throw error;
      setSentTo(to);
      setWait(RESEND_AFTER);
    } catch (err) {
      setError(message(err));
    } finally {
      setPending(null);
    }
  }

  if (sentTo) {
    return (
      <Frame>
        <div className="space-y-2">
          <h1 className="font-semibold tracking-[-0.02em] text-[28px] leading-tight">Check your inbox</h1>
          <p className="text-sm text-muted">
            We sent a sign-in link to <span className="font-medium text-ink">{sentTo}</span>. It works once and expires in an hour.
          </p>
        </div>
        <ErrorNote message={error} />
        <div className="flex items-center justify-between text-sm">
          <button type="button" className="text-muted hover:text-ink" onClick={() => (setSentTo(""), setError(""))}>
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
        {mode === "signup" ? (
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
        <p className="mt-1 text-sm text-muted">
          {mode === "signup" ? "Already have an account? " : "New to Claritia? "}
          <button type="button" onClick={() => go(mode === "signup" ? "signin" : "signup")} className="font-medium text-ink underline-offset-4 hover:underline">
            {mode === "signup" ? "Sign in" : "Create an account"}
          </button>
        </p>
      </div>
      <div className="space-y-2.5">
        {on.google ? (
          <button type="button" onClick={() => oauth("google")} disabled={busy} className={ssoClass}>
            <GoogleLogo />
            {pending === "google" ? "Opening Google…" : "Continue with Google"}
          </button>
        ) : null}
        {on.azure ? (
          <button type="button" onClick={() => oauth("azure")} disabled={busy} className={ssoClass}>
            <MicrosoftLogo />
            {pending === "azure" ? "Opening Microsoft…" : "Continue with Microsoft"}
          </button>
        ) : null}
        {on.github ? (
          <button type="button" onClick={() => oauth("github")} disabled={busy} className={ssoClass}>
            <GitHubLogo />
            {pending === "github" ? "Opening GitHub…" : "Continue with GitHub"}
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
          className="h-11 w-full rounded-md bg-card shadow-input px-3.5 text-[14px] outline-none focus:shadow-focus"
        />
        <Button type="submit" className="h-11 w-full" disabled={busy}>
          {pending === "email" ? "Sending…" : "Continue with email"}
        </Button>
      </form>
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
