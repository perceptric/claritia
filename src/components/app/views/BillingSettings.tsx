"use client";

// Settings › Billing (docs/pricing.md): the plan, this month's submissions, AI credits, workflow emails and seats, and the four plans
// to move between. Free to paid goes through Stripe's checkout; paid to paid changes the subscription in place,
// prorated; cards, invoices and cancelling are on Stripe's billing page. Only the owner changes anything.

import { useEffect, useState } from "react";
import { amount, monthlyTotal, PLANS, planById, type Interval, type PlanId } from "@/lib/plans";
import { askConfirm } from "../Dialogs";
import { Badge, Button, CardHead, ErrorNote, errorText, invalidate, Loading, must, Panel, postJson, Segmented, useQuery, type Role, type ViewProps } from "../ui";

export type PlanStatus = {
  plan: PlanId;
  interval: Interval;
  status: string | null;
  period_end: string | null;
  customer: boolean;
  subscription: boolean;
  hosts: number;
  hosts_billed: number;
  submissions: number;
  submissions_cap: number | null;
  ai_credits: number;
  ai_credits_cap: number;
  /** Before 144_send_limits.sql the database sends neither. */
  sends?: number;
  sends_cap?: number;
};

export const planStatusKey = (ws: string) => `plan_status:${ws}`;

const money = (n: number) => `$${n.toLocaleString("en-US")}`;
const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

function Meter({ label, used, cap }: { label: string; used: number; cap: number | null }) {
  const share = cap ? Math.min(1, used / cap) : 0;
  const full = cap !== null && used >= cap;
  return (
    <div className="flex min-w-0 flex-col gap-1.5 px-5 py-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-[13px] text-body">{label}</span>
        <span className="text-[13px] text-ink tabular-nums">
          {used.toLocaleString("en-US")} <span className="text-muted">of {amount(cap)}</span>
        </span>
      </div>
      {cap !== null ? (
        <div className="h-1.5 overflow-hidden rounded-full bg-hover" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={cap} aria-valuenow={Math.min(used, cap)}>
          <div className={`h-full rounded-full ${full ? "bg-warning" : "bg-signal"}`} style={{ width: `${Math.max(share * 100, used > 0 ? 2 : 0)}%` }} />
        </div>
      ) : null}
    </div>
  );
}

export function BillingSettings({ sb, session, ws, role }: Pick<ViewProps, "sb" | "session" | "ws"> & { role: Role }) {
  const q = useQuery(planStatusKey(ws.id), async () => must(await sb.rpc("plan_status", { p_ws: ws.id })) as PlanStatus, { staleMs: 0 });
  const [picked, setPeriod] = useState<Interval | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const owner = role === "owner";
  const s = q.data;
  // A paying workspace opens on the period it pays by.
  const interval: Interval = picked ?? (s && s.plan !== "free" ? s.interval : "month");

  // Back from Stripe's checkout: the webhook may land a moment after the page, so read again shortly.
  useEffect(() => {
    if (typeof window === "undefined" || !new URLSearchParams(window.location.search).has("billing")) return;
    const t = setTimeout(() => invalidate(planStatusKey(ws.id)), 2500);
    return () => clearTimeout(t);
  }, [ws.id]);

  const go = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy("");
    }
  };
  const openUrl = async (path: string, body: object) => {
    const { url } = await postJson<{ url: string }>(session, path, body);
    window.location.assign(url);
  };
  const pick = (id: PlanId) =>
    go(id, async () => {
      if (!s) return;
      if (id === "free") return openUrl("/api/billing/portal", { workspaceId: ws.id });
      if (s.plan === "free" || !s.subscription) return openUrl("/api/billing/checkout", { workspaceId: ws.id, plan: id, interval });
      const next = planById(id);
      const total = monthlyTotal(next, interval, s.hosts);
      const ok = await askConfirm(`Move to ${next.name}?`, {
        body: `${money(total)}/month${interval === "year" ? ", billed yearly" : ""} for ${s.hosts} ${s.hosts === 1 ? "seat" : "seats"}. The difference is prorated.`,
        ok: `Move to ${next.name}`,
      });
      if (!ok) return;
      await postJson(session, "/api/billing/change", { workspaceId: ws.id, plan: id, interval });
      invalidate(planStatusKey(ws.id));
    });

  if (q.error) return <ErrorNote message={errorText(q.error)} />;
  if (!s) return <Loading />;
  const current = planById(s.plan);
  const hostsShown = Math.max(1, s.hosts);

  return (
    <div className="flex flex-col gap-5">
      <ErrorNote message={error} />
      <Panel>
        <CardHead label="Plan">
          {owner && s.customer ? (
            <Button variant="plain" className="h-7 px-2" disabled={!!busy} onClick={() => go("portal", () => openUrl("/api/billing/portal", { workspaceId: ws.id }))}>
              Manage billing
            </Button>
          ) : null}
        </CardHead>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-4">
          <span className="text-[15px] font-medium text-ink">{current.name}</span>
          {s.plan !== "free" ? <Badge>{s.interval === "year" ? "Yearly" : "Monthly"}</Badge> : null}
          {s.status === "past_due" ? <Badge tone="red">Payment due</Badge> : null}
          <span className="text-[13px] text-muted">
            {money(monthlyTotal(current, s.interval, s.plan === "free" ? 1 : s.hosts_billed))}/month
            {s.period_end && s.plan !== "free" ? `, renews ${DATE.format(new Date(s.period_end))}` : ""}
          </span>
        </div>
      </Panel>

      <Panel>
        <CardHead label="This month" />
        <div className="flex flex-col divide-y divide-line">
          <Meter label="Submissions" used={s.submissions} cap={s.submissions_cap} />
          <Meter label="AI credits" used={s.ai_credits} cap={s.ai_credits_cap} />
          {s.sends_cap !== undefined ? <Meter label="Workflow emails" used={s.sends ?? 0} cap={s.sends_cap} /> : null}
          <Meter label="Seats" used={s.hosts} cap={s.plan === "free" ? 1 : null} />
        </div>
      </Panel>

      <Panel>
        <CardHead label="Plans">
          <Segmented
            size="sm"
            label="Billing period"
            value={interval}
            onChange={setPeriod}
            options={[
              { value: "month", label: "Monthly" },
              { value: "year", label: "Yearly, save 20%" },
            ]}
          />
        </CardHead>
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
          {PLANS.map((p) => {
            const on = p.id === s.plan && (p.id === "free" || interval === s.interval);
            const total = monthlyTotal(p, interval, p.id === "free" ? 1 : hostsShown);
            return (
              <div key={p.id} className={`flex min-w-0 flex-col gap-3 rounded-lg p-4 ${on ? "shadow-focus" : "shadow-rest"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[14px] font-medium text-ink">{p.name}</span>
                  {on ? <Badge tone="green">Current</Badge> : null}
                </div>
                <div className="flex flex-wrap items-baseline gap-1.5">
                  <span className="text-[24px] leading-none font-semibold tracking-[-0.02em] text-ink">{money(interval === "year" ? p.yearly : p.monthly)}</span>
                  <span className="text-[12.5px] text-muted">{p.id === "free" ? "/month" : "/seat/month"}</span>
                </div>
                <div className="flex flex-col gap-1 text-[12.5px] text-body">
                  <span>{p.id === "free" ? "1 seat" : "Unlimited seats"}</span>
                  <span>{amount(p.submissions)} submissions/month</span>
                  <span>{amount(p.aiCredits)} AI credits/month</span>
                  <span>{amount(p.sends)} workflow emails/month</span>
                  {p.id !== "free" && hostsShown > 1 ? (
                    <span className="text-ink">
                      {money(total)} for {hostsShown} seats
                    </span>
                  ) : null}
                </div>
                {owner ? (
                  <Button className="mt-auto w-full" variant={on ? "ghost" : p.id === "free" ? "ghost" : "primary"} disabled={on || !!busy || (p.id === "free" && !s.customer)} onClick={() => pick(p.id)}>
                    {on ? "Current plan" : busy === p.id ? "Opening" : p.id === "free" ? "Move to Free" : s.plan === "free" ? `Choose ${p.name}` : `Move to ${p.name}`}
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
