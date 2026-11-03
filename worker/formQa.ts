// The daily form check on the runner (docs/form-builder.md Part 10): the form_qa job. Open the form's own page in a
// real browser with the day's check token, fill every field a visitor would see the way a visitor would (typing,
// picking from the list, ticking boxes, Next through the steps), send it, then wait for the fill to reach Claritia
// and each destination. The fill is marked as a test, so it never counts as a lead.

import pw from "playwright-core";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sampleAnswers } from "../src/lib/forms/sample.ts";
import { everyOption, type Form } from "../src/lib/forms/schema.ts";
import { qaToken, type PublicForm } from "../src/lib/forms/submit.ts";
import { JobError, type Job } from "../src/lib/jobs.ts";

export type QaOpts = { appUrl: string; secret: string; chromiumPath?: string; loadMs?: number; reachMs?: number; deliverMs?: number; pollMs?: number; log?: (...a: unknown[]) => void };
type Step = { name: string; ok: boolean; detail?: string };
type Progress = { submission_id: string; deliveries: { name: string; status: string; error: string | null }[] } | null;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const OPEN = new Set(["queued", "sending", "retrying", "held"]);

async function rpc<T>(sb: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

/**
 * Fill one step's fields in the page as a visitor would: type into boxes, pick from a dropdown's list (searching a long
 * one), click the radio or check box for a pick by its label (options can be shuffled), and leave calcs alone. Only
 * fields the step shows for the answers so far, so a list that follows another field is filled after it.
 */
async function fillStep(page: pw.Page, form: Form, step: number, answers: Record<string, unknown>) {
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  const host = page.locator("claritia-form");
  for (const f of form.steps[step].fields) {
    const v = answers[f.id];
    if (v === undefined || f.type === "hidden" || f.type === "calc") continue;
    const box = page.locator(`claritia-form #clr-${f.id}`);
    const label = (x: unknown) => (f.type === "country" ? (names.of(String(x)) ?? String(x)) : (everyOption(f).find((o) => o.value === x)?.label ?? String(x)));
    if (f.type === "dropdown" || f.type === "country") {
      await box.click();
      const search = page.locator("claritia-form .ls input");
      if (await search.count()) {
        await search.fill(label(v));
        await search.press("Enter");
      } else await page.locator("claritia-form [role=option]", { hasText: label(v) }).first().click();
    } else if (f.type === "choice") await host.getByRole("radio", { name: label(v), exact: true }).check();
    else if (f.type === "multi") {
      for (const val of v as string[]) await host.getByRole("checkbox", { name: label(val), exact: true }).check();
    } else if (f.type === "rating") await host.getByRole("radio", { name: new RegExp(`^${Number(v)} of `) }).check();
    else if (f.type === "checkbox") await box.check();
    else await box.fill(String(v));
  }
}

export async function handleFormQa(sb: SupabaseClient, job: Job, o: QaOpts): Promise<"passed" | "failed" | "skipped"> {
  const formId = String(job.payload.form_id ?? "");
  if (!/^[0-9a-f-]{36}$/.test(formId)) throw new JobError("form_qa needs a form", { retry: false });
  const f = await rpc<PublicForm | null>(sb, "form_public", { p_id: formId });
  if (!f || f.status !== "live" || f.body.capture) return "skipped";
  const start = await rpc<{ id: string; domain: string | null } | null>(sb, "form_check_start", { p_form: formId });
  if (!start) return "skipped";
  const since = new Date(Date.now() - 2000).toISOString();
  const steps: Step[] = [];
  const step = (name: string, ok: boolean, detail?: string) => steps.push({ name, ok, ...(detail ? { detail: detail.slice(0, 300) } : {}) });
  let submission: string | null = null;
  const browser = await pw.chromium.launch({ headless: true, executablePath: o.chromiumPath || undefined, args: ["--disable-dev-shm-usage"] });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, locale: "en-US" });
    const token = qaToken(formId, new Date().toISOString().slice(0, 10), o.secret);
    try {
      await page.goto(`${o.appUrl.replace(/\/+$/, "")}/f/${formId}?clr_qa=${token}`, { waitUntil: "load", timeout: o.loadMs ?? 30_000 });
      await page.locator("claritia-form form").waitFor({ timeout: o.loadMs ?? 30_000 });
      step("The form loads", true);
    } catch (e) {
      step("The form loads", false, (e as Error).message);
      throw new Error("stop");
    }
    const answers = sampleAnswers(f.body, `qa+${start.id.slice(0, 8)}@${start.domain || "example.com"}`);
    try {
      for (let i = 0; i < f.body.steps.length; i++) {
        await fillStep(page, f.body, i, answers);
        if (i === f.body.steps.length - 1 && (await page.locator("claritia-form #clr-consent").count())) await page.locator("claritia-form #clr-consent").check();
        // A form with a minimum fill time: a visitor takes at least that long.
        if (i === f.body.steps.length - 1) await wait(Math.max(0, f.body.spam.minSeconds * 1000 + 300));
        await page.locator("claritia-form button[type=submit]").click();
        if (i < f.body.steps.length - 1) await page.locator("claritia-form .st", { hasText: `Step ${i + 2} of` }).waitFor({ timeout: 5000 });
      }
      await page.locator("claritia-form [role=status], claritia-form iframe[title='Book a meeting'], claritia-form .al, claritia-form .er").first().waitFor({ timeout: 20_000 });
      const problem = await page.locator("claritia-form .al, claritia-form .er").allTextContents();
      if (problem.length) throw new Error(problem.join(" "));
      step("The fill is accepted", true);
    } catch (e) {
      step("The fill is accepted", false, (e as Error).message);
      throw new Error("stop");
    }
    // The fill in Claritia, then each destination.
    let p: Progress = null;
    const until = Date.now() + (o.reachMs ?? 30_000);
    while (!p && Date.now() < until) {
      p = await rpc<Progress>(sb, "form_check_progress", { p_form: formId, p_since: since });
      if (!p) await wait(o.pollMs ?? 1000);
    }
    if (!p) {
      step("The fill reached Claritia", false, "No fill arrived within 30 seconds.");
      throw new Error("stop");
    }
    submission = p.submission_id;
    step("The fill reached Claritia", true);
    const done = Date.now() + (o.deliverMs ?? 120_000);
    while (p && p.deliveries.some((d) => OPEN.has(d.status)) && Date.now() < done) {
      await wait(o.pollMs ?? 2000);
      p = await rpc<Progress>(sb, "form_check_progress", { p_form: formId, p_since: since });
    }
    for (const d of p?.deliveries ?? []) {
      const ok = d.status === "done" || d.status === "skipped";
      step(`Sent to ${d.name}`, ok, ok ? undefined : d.status === "held" ? "Paused" : OPEN.has(d.status) ? `Still ${d.status} after 2 minutes` : (d.error ?? d.status));
    }
  } catch (e) {
    if ((e as Error).message !== "stop") step("The check ran", false, (e as Error).message);
  } finally {
    await browser.close().catch(() => undefined);
  }
  const passed = steps.length > 0 && steps.every((s) => s.ok);
  await rpc(sb, "form_check_finish", { p_id: start.id, p_status: passed ? "passed" : "failed", p_steps: steps, p_submission: submission, p_error: passed ? null : (steps.find((s) => !s.ok)?.detail ?? steps.find((s) => !s.ok)?.name ?? null) });
  o.log?.(`Form check ${formId}: ${passed ? "passed" : "failed"}`);
  return passed ? "passed" : "failed";
}

