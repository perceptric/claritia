"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { Logo } from "../Logo";
import { Sketch } from "../sketches/Sketch";
import { Pip, type PipMood } from "./Pip";
import { Button, ErrorNote, errorText } from "./ui";

// Where people land after signing in.
const appUrl = () => `${window.location.origin}${window.location.pathname === "/" ? "/tests" : window.location.pathname}`;

function message(e: unknown) {
  const text = errorText(e);
  if (/rate limit/i.test(text)) return "Too many emails were sent in a short time. Wait a minute and try again.";
  if (/provider is not enabled/i.test(text)) return "This sign-in option is not turned on yet. Use email for now.";
  return text;
}

// A stuck request should never leave the button spinning forever.
function withTimeout<T>(p: Promise<T>, ms = 20000): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("The request took too long. Check your connection and try again.")), ms))]);
}

const RESEND_AFTER = 30;

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

function GitHubLogo() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

const ssoClass = "press flex h-11 w-full items-center justify-center gap-3 rounded-full border border-line-strong bg-card text-[13.5px] font-medium text-ink hover:bg-paper disabled:opacity-50";

/** Split screen: the form on the left, a drawn funnel on the right that fills as you type. */
function Frame({ typed = 0, mood = "idle", children }: { typed?: number; mood?: PipMood; children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen bg-paper md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col px-6 py-8 md:px-14">
        <a href="https://tryclaritia.com" aria-label="Claritia home" className="self-start">
          <Logo />
        </a>
        <div className="anim-rise my-auto w-full max-w-sm space-y-6 self-center py-10">{children}</div>
      </div>
      <div className="relative m-3 hidden overflow-hidden rounded-3xl bg-paper-deep md:block">
        <div className="wash absolute inset-0 opacity-80" />
        <div className="relative flex h-full flex-col items-center justify-center gap-10 p-10">
          <p className="serif max-w-md text-center text-[44px] leading-[1.05] text-ink">
            Visitors in.
            <span className="text-muted"> Meetings out.</span>
          </p>
          <div className="relative">
            <Sketch name="funnel" size={340} />
            {/* Each letter typed drops a visitor into the funnel. */}
            {Array.from({ length: Math.min(typed, 14) }, (_, i) => (
              <span key={i} className="anim-pop absolute size-2 rounded-full bg-sky" style={{ left: `${36 + ((i * 37) % 30)}%`, top: `${30 + ((i * 13) % 14)}%` }} />
            ))}
            <span className="absolute -right-6 -bottom-4">
              <Pip size={72} mood={mood} follow />
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}

/** One screen for everyone: Google or GitHub first, an email link as the backup. New people get an account on first sign-in. */
export function AuthScreen({ sb }: { sb: SupabaseClient }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function oauth(provider: "google" | "github") {
    setBusy(true);
    setError("");
    try {
      const { error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo: appUrl() } });
      if (error) throw error;
    } catch (err) {
      setError(message(err));
      setBusy(false);
    }
  }

  async function sendLink(to: string) {
    setBusy(true);
    setError("");
    try {
      const { error } = await withTimeout(sb.auth.signInWithOtp({ email: to, options: { emailRedirectTo: appUrl() } }));
      if (error) throw error;
      setSentTo(to);
      setWait(RESEND_AFTER);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <Frame typed={14} mood="done">
        <div className="space-y-2">
          <h1 className="serif text-[36px] leading-tight">Check your inbox</h1>
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
            {busy ? "Sending…" : wait > 0 ? `Send again in ${wait}s` : "Send again"}
          </button>
        </div>
      </Frame>
    );
  }

  return (
    <Frame typed={email.length} mood={busy ? "thinking" : email ? "writing" : "idle"}>
      <div>
        <h1 className="serif text-[40px] leading-[1.05]">
          Welcome
          <span className="text-muted"> to Claritia</span>
        </h1>
        <p className="mt-1 text-sm text-muted">Sign in or create your account.</p>
      </div>
      <div className="space-y-2.5">
        <button type="button" onClick={() => oauth("google")} disabled={busy} className={ssoClass}>
          <GoogleLogo />
          Continue with Google
        </button>
        <button type="button" onClick={() => oauth("github")} disabled={busy} className={ssoClass}>
          <GitHubLogo />
          Continue with GitHub
        </button>
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
          className="h-11 w-full rounded-sm border border-line-strong bg-card px-3.5 text-[14px] outline-none focus:border-ink focus:ring-1 focus:ring-ink"
        />
        <Button type="submit" className="h-11 w-full" disabled={busy}>
          {busy ? "Sending…" : "Continue with email"}
        </Button>
      </form>
      <ErrorNote message={error} />
    </Frame>
  );
}
