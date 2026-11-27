"use client";

// The guided setup after sign-up (docs/signup.md), shown to a new workspace's owner in place of the app, like
// Omniscient's welcome flow and Arrowsterr's onboarding: name the team and give the website (its brand is read for the
// forms), connect a calendar, pick a first form that books a meeting, and invite the team. Every step but the first
// can be skipped. The step is kept on this computer, so it comes back after the calendar's sign-in page; "done" ends
// it. The rules are in src/lib/setup.ts.

import { useState } from "react";
import { templateSettings, templateById as meetingTemplate } from "@/lib/meetings/templates";
import { FIRST_FORMS, guessTeam, nextStep, parseInvites, SETUP_STEPS, type SetupStep } from "@/lib/setup";
import { Check } from "../Icons";
import { Logo } from "../Logo";
import { BrandLogo } from "./BrandLogo";
import { meetingsApi } from "./meetings/parts";
import { PROVIDERS } from "./meetings/MyCalendar";
import { connectCalendar, useCalendarAccounts } from "./scheduling/ConnectCalendar";
import { Badge, Button, ErrorNote, errorText, Field, Input, must, postJson, Spinner, type Route, type ViewProps } from "./ui";

const CALENDARS = PROVIDERS.filter((p) => p.id !== "zoom");

const key = (ws: string, part = "") => `claritia:setup:${ws}${part}`;
export function readSetup(ws: string, part = ""): string | null {
  try {
    return localStorage.getItem(key(ws, part));
  } catch {
    return null;
  }
}
function keep(ws: string, value: string, part = "") {
  try {
    localStorage.setItem(key(ws, part), value);
  } catch {}
}

/** Tries a call again after a hiccup (network, busy, a server error), with growing waits. A refusal is not tried again. */
async function retry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const text = errorText(e);
      const hiccup = /fetch|network|timeout|took too long|busy|try again|5\d\d|429/i.test(text);
      if (!hiccup || i >= tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 600 * (i + 1)));
    }
  }
}

/**
 * The note the calendar's sign-in sent back (?error=, src/app/api/calendar/callback): our own sentences read as they
 * are; the calendar's raw answer, or anything else in the address, becomes one plain line.
 */
function backError(raw: string | null): string {
  const t = (raw ?? "").trim();
  if (!t) return "";
  return t.length <= 200 && /^[A-Z][^{}<>[\]_=:;|\\]*[.!)]$/.test(t) ? t : "Couldn't connect the calendar. Try again.";
}

const big = "font-semibold tracking-[-0.02em] text-[28px] leading-tight text-ink";
const pick = "press flex min-h-11 w-full min-w-0 items-center gap-3 rounded-full bg-card px-4 text-left text-[13.5px] font-medium text-ink shadow-outline hover:bg-hover disabled:opacity-50";
const quiet = "text-sm text-muted hover:text-ink disabled:opacity-50";

type Props = Pick<ViewProps, "sb" | "session" | "navigate"> & {
  ws: ViewProps["ws"] & { named?: boolean };
  step: SetupStep;
  onStep: (s: SetupStep | null) => void;
  onNamed: (name: string) => void;
};

export function Welcome(props: Props) {
  const { sb, session, ws, step, onStep, navigate } = props;
  // Each finished or skipped step is counted once in audit_log (169_setup_steps.sql), for the sign-up funnel; "done"
  // also queues the welcome email. Counting never holds up the setup.
  const record = (name: string, data: Record<string, unknown> = {}) =>
    void retry(async () => must(await sb.rpc("setup_step", { p_ws: ws.id, p_step: name, p_data: data }))).catch(() => undefined);
  const go = (s: SetupStep | null) => {
    keep(ws.id, s ?? "done");
    onStep(s);
  };
  // The end: the form just made opens in the Studio, else Forms.
  const finish = (to?: [Route, string]) => {
    const form = readSetup(ws.id, ":form");
    if (to) record(`${step}.skip`);
    record("done", form ? { form } : {});
    go(null);
    if (to) navigate(to[0], to[1]);
    else navigate("forms", form ?? "");
  };
  const next = (skipped = false) => {
    record(skipped ? `${step}.skip` : step);
    const n = nextStep(step);
    if (n) go(n);
    else finish();
  };
  const at = SETUP_STEPS.indexOf(step);

  return (
    <main className="flex min-h-screen flex-col bg-card px-6 py-8 md:px-14">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <Logo />
        {/* Signed in with the wrong account: sign out here, before anything is set up under it. */}
        <p className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          <span className="wrap-anywhere">{session.user.email}</span>
          <button type="button" className="font-medium text-ink underline-offset-4 hover:underline" onClick={() => void sb.auth.signOut()}>
            Sign out
          </button>
        </p>
      </div>
      <div className="anim-rise my-auto w-full max-w-md space-y-6 self-center py-10">
        <div className="flex gap-1.5" role="progressbar" aria-label="Setup" aria-valuemin={1} aria-valuemax={SETUP_STEPS.length} aria-valuenow={at + 1}>
          {SETUP_STEPS.map((s, i) => (
            <span key={s} className={`h-1 flex-1 rounded-full ${i <= at ? "bg-brand" : "bg-line"}`} />
          ))}
        </div>
        {step === "team" ? <TeamStep {...props} next={next} /> : null}
        {step === "calendar" ? <CalendarStep {...props} next={next} /> : null}
        {step === "form" ? <FormStep {...props} next={next} finish={finish} /> : null}
        {step === "invite" ? <InviteStep {...props} next={next} /> : null}
      </div>
    </main>
  );
}

type StepProps = Props & { next: (skipped?: boolean) => void };

/** The team's name and website. The website's brand is read into a brand kit the first form wears. */
function TeamStep({ sb, session, ws, onNamed, next }: StepProps) {
  const guess = guessTeam(session.user.email ?? "");
  const [name, setName] = useState(ws.named === false ? guess.name : ws.name);
  const [site, setSite] = useState(guess.site);
  const [busy, setBusy] = useState<"" | "name" | "site">("");
  const [error, setError] = useState("");

  async function save() {
    const n = name.trim();
    if (!n) return setError("Enter your team's name.");
    setError("");
    setBusy("name");
    try {
      await retry(async () => must(await sb.rpc("workspace_name_set", { p_ws: ws.id, p_name: n })));
      onNamed(n);
      const url = site.trim();
      if (url) {
        setBusy("site");
        try {
          const r = await retry(() => postJson<{ kitId?: string }>(session, "/api/forms/scan", { workspaceId: ws.id, url }));
          if (r.kitId) keep(ws.id, r.kitId, ":kit");
        } catch (e) {
          const text = errorText(e);
          // A wrong address is fixed here; a site that can't be read now is read later from Email › Brand.
          if (/address|private network/i.test(text)) {
            setBusy("");
            return setError(text);
          }
        }
      }
      next();
    } catch (e) {
      setError(errorText(e));
      setBusy("");
    }
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div>
        <h1 className={big}>Set up your team</h1>
        <p className="mt-1 text-sm text-muted">Your forms and booking page use your website&apos;s logo and colors.</p>
      </div>
      <Field label="Team name">
        <Input className="h-11" value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme" autoFocus maxLength={80} />
      </Field>
      <Field label="Website">
        <Input className="h-11" value={site} onChange={(e) => setSite(e.target.value)} placeholder="acme.com" inputMode="url" autoCapitalize="none" spellCheck={false} />
      </Field>
      <ErrorNote message={error} />
      <Button type="submit" className="h-11 w-full" disabled={!!busy} busy={!!busy}>
        {busy === "site" ? "Reading your site…" : busy ? "Saving…" : "Continue"}
      </Button>
    </form>
  );
}

/** Google Calendar or Outlook, so people only book free times. The sign-in comes back to this step. */
function CalendarStep({ sb, session, ws, next }: StepProps) {
  const accounts = useCalendarAccounts({ sb, session, ws });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState(() => (typeof window === "undefined" ? "" : backError(new URLSearchParams(window.location.search).get("error"))));
  const connected = (accounts.data ?? []).filter((a) => a.provider !== "zoom" && a.status === "ok");

  async function connect(provider: string) {
    setBusy(provider);
    setError("");
    try {
      await connectCalendar(session, ws.id, provider);
    } catch (e) {
      setError(errorText(e));
      setBusy("");
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className={big}>Connect your calendar</h1>
        <p className="mt-1 text-sm text-muted">People only book times you&apos;re free.</p>
      </div>
      {connected.length ? (
        <div className="space-y-2">
          {connected.map((a) => {
            const p = CALENDARS.find((x) => x.id === a.provider);
            return (
              <div key={a.id} className="flex min-h-11 flex-wrap items-center gap-3 rounded-xl px-4 py-2 shadow-rest">
                {p ? <BrandLogo domain={p.domain} name={p.name} size={18} /> : null}
                <span className="min-w-0 flex-1 text-[13.5px] wrap-anywhere text-ink">{a.account_email}</span>
                <Badge tone="green">Connected</Badge>
              </div>
            );
          })}
          <Button className="mt-2 h-11 w-full" onClick={() => next()}>
            Continue
          </Button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {CALENDARS.map((p) => (
            <button key={p.id} type="button" className={`${pick} justify-center`} disabled={!!busy || accounts.data === null} onClick={() => void connect(p.id)}>
              {busy === p.id ? <Spinner /> : <BrandLogo domain={p.domain} name={p.name} size={18} />}
              {busy === p.id ? `Opening ${p.name}…` : p.connect}
            </button>
          ))}
        </div>
      )}
      <ErrorNote message={error} />
      {connected.length ? null : (
        <button type="button" className={quiet} onClick={() => next(true)}>
          Skip for now
        </button>
      )}
    </div>
  );
}

/** A first form that books a meeting. The workspace's one meeting type is made from the matching template if it has none. */
function FormStep({ sb, session, ws, next, finish }: StepProps & { finish: (to?: [Route, string]) => void }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function make(f: (typeof FIRST_FORMS)[number]) {
    setBusy(f.id);
    setError("");
    try {
      const types = await retry(async () => must(await sb.from("meeting_types").select("id").eq("workspace_id", ws.id).limit(1)));
      if (!types?.length) {
        const t = meetingTemplate(f.meeting);
        if (t) {
          const me = session.user.id;
          await meetingsApi(session, ws.id, "types", { action: "save", id: null, type: { name: t.name, slug: t.slug, kind: t.kind, hosts: [{ user_id: me }], settings: templateSettings(t), secret: false, active: true, locked: [], owner_user_id: me } });
        }
      }
      // Made once: a lost answer is never sent again, so no second copy of the form appears.
      const kitId = readSetup(ws.id, ":kit") ?? undefined;
      const r = await postJson<{ id: string }>(session, "/api/forms/templates", { workspaceId: ws.id, template: f.template, ...(kitId ? { kitId } : {}) });
      keep(ws.id, r.id, ":form");
      next();
    } catch (e) {
      setError(errorText(e));
      setBusy("");
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className={big}>Pick your first form</h1>
        <p className="mt-1 text-sm text-muted">It comes with a meeting people book when they send it.</p>
      </div>
      <div className="space-y-2.5">
        {FIRST_FORMS.map((f) => (
          <button key={f.id} type="button" className={pick} disabled={!!busy} onClick={() => void make(f)}>
            {busy === f.id ? <Spinner /> : null}
            <span className="min-w-0 flex-1">{busy === f.id ? "Making your form…" : f.label}</span>
          </button>
        ))}
      </div>
      <ErrorNote message={error} />
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <button type="button" className={quiet} disabled={!!busy} onClick={() => finish(["forms", "templates"])}>
          See all templates
        </button>
        <button type="button" className={quiet} disabled={!!busy} onClick={() => finish(["forms", "new"])}>
          Start blank
        </button>
      </div>
    </div>
  );
}

/** Teammates by email; each gets an invite to this workspace. */
function InviteStep({ sb, session, ws, next }: StepProps) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<string[]>([]);

  async function send() {
    const emails = parseInvites(text, session.user.email ?? "");
    if (!emails.length) return setError("Enter one or more email addresses.");
    setBusy(true);
    setError("");
    const failed: string[] = [];
    let why: unknown = null;
    for (const email of emails) {
      try {
        await retry(async () => must(await sb.rpc("invite_member", { p_ws: ws.id, p_email: email })));
        setSent((s) => [...s, email]);
      } catch (e) {
        failed.push(email);
        why = e;
      }
    }
    setBusy(false);
    if (failed.length) {
      setText(failed.join(", "));
      return setError(`Couldn't invite ${failed.join(", ")}. ${errorText(why)}`);
    }
    next();
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <div>
        <h1 className={big}>Invite your team</h1>
        <p className="mt-1 text-sm text-muted">They get an email to join {ws.name}.</p>
      </div>
      <Field label="Emails">
        <Input className="h-11" value={text} onChange={(e) => setText(e.target.value)} placeholder="sam@acme.com, lee@acme.com" autoFocus autoCapitalize="none" spellCheck={false} />
      </Field>
      {sent.length ? (
        <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
          <Check size={14} />
          <span className="wrap-anywhere">Invited {sent.join(", ")}</span>
        </p>
      ) : null}
      <ErrorNote message={error} />
      <Button type="submit" className="h-11 w-full" disabled={busy} busy={busy}>
        {busy ? "Sending…" : "Send invites"}
      </Button>
      <button type="button" className={quiet} disabled={busy} onClick={() => next(true)}>
        Skip for now
      </button>
    </form>
  );
}
