// Settings pages, grouped the way the Settings sidebar shows them (same layout as Arrowsterr). Sites, Identity and
// Account alerts moved to Visitors; Calendar, Calendars and Payments to Scheduling; Ideal customer and Lead scoring to
// Nurture › Lead scoring (src/lib/nav.ts forwards them).

export type SettingsTab =
  | "sources" | "imports" | "sync_log" | "data_model" | "fields" | "objects" | "sending" | "sender" | "team" | "calendars" | "sites" | "identity" | "icp" | "lead_scoring" | "account_alerts" | "workspace" | "payments" | "keys" | "profile" | "calendar";
/** `line` sits under the page title: one short line, like Twenty. */
export type SettingsGroup = { label: string; tabs: { id: SettingsTab; label: string; line: string }[] };

export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    label: "CRM",
    tabs: [
      { id: "sources", label: "Integrations", line: "The tools your contacts come from and go back to" },
      { id: "imports", label: "Imports", line: "Contacts brought in from a file" },
      { id: "sync_log", label: "Sync log", line: "Every change between Claritia and your tools" },
      { id: "data_model", label: "Data model", line: "The objects in your CRM and their fields" },
    ],
  },
  {
    label: "Email",
    tabs: [
      { id: "sending", label: "Domains", line: "The domains your emails send from" },
      { id: "sender", label: "Sender", line: "The name and address people see" },
    ],
  },
  { label: "Team", tabs: [{ id: "team", label: "Members", line: "Who works in this workspace and their role" }] },
  {
    label: "Workspace",
    tabs: [
      { id: "workspace", label: "General", line: "Your workspace's name" },
      { id: "keys", label: "API keys", line: "Keys for your own code and the CLI" },
    ],
  },
  { label: "Account", tabs: [{ id: "profile", label: "Profile", line: "Your sign-in" }] },
];

/** The page for an address: old names land on their new pages, unknown ones on the first. */
export function settingsTab(id: string): SettingsTab {
  const moved: Record<string, SettingsTab> = { suite: "sources", tools: "sources", domains: "sending", fields: "data_model", objects: "data_model" };
  const all = SETTINGS_GROUPS.flatMap((g) => g.tabs.map((t) => t.id));
  return (all as string[]).includes(id) ? (id as SettingsTab) : (moved[id] ?? "sources");
}
