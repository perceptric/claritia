"use client";

// Calendar › Settings (docs/scheduling-plan.md Part 11): the things set once, out of the way. Payments and Webhooks as
// a list on the left; the open one on the right. Reminders are a workflow now (docs/workflows.md).

import { CALENDAR_SETTINGS, type CalendarSettingsKey } from "@/lib/nav";
import { Card, Webhook } from "../../Icons";
import { Inset, Page, type ViewProps } from "../ui";
import { Payments } from "../meetings/Payments";
import { WebhooksPage } from "./WebhooksPage";

const ICONS: Record<CalendarSettingsKey, React.ReactNode> = { payments: <Card size={14} />, webhooks: <Webhook size={14} /> };

export function SettingsPage(props: ViewProps & { sub: string }) {
  const sub = (CALENDAR_SETTINGS.find((s) => s.value === props.sub)?.value ?? "payments") as CalendarSettingsKey;
  return (
    <Page title="Settings" flush>
      <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] md:grid-cols-[200px_minmax(0,1fr)] md:grid-rows-1">
        <nav aria-label="Settings" className="flex gap-0.5 overflow-x-auto border-b border-line px-2 py-2 md:flex-col md:border-r md:border-b-0 md:py-3">
          {CALENDAR_SETTINGS.map((s) => (
            <button
              key={s.value}
              type="button"
              aria-current={sub === s.value ? "page" : undefined}
              onClick={() => props.navigate("scheduling", `settings/${s.value}`)}
              className={`flex h-8 shrink-0 items-center gap-2 rounded-lg px-2.5 text-[13px] transition-colors duration-[120ms] ${sub === s.value ? "bg-paper-deep font-medium text-ink" : "text-body hover:bg-hover hover:text-ink"}`}
            >
              {ICONS[s.value]}
              {s.label}
            </button>
          ))}
        </nav>
        <div className="min-h-0 min-w-0">
          <Inset>
            {sub === "webhooks" ? (
              <WebhooksPage {...props} />
            ) : (
              <Page title="Payments">
                <div className="max-w-[720px]">
                  <Payments sb={props.sb} ws={props.ws} role={props.role} session={props.session} />
                </div>
              </Page>
            )}
          </Inset>
        </div>
      </div>
    </Page>
  );
}
