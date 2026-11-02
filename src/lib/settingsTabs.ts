// Settings pages, grouped the way the Settings sidebar shows them (same layout as Arrowsterr). Calendar, Calendars and
// Payments live in Meetings (src/lib/nav.ts forwards them). The CRM's pages (imports, sync log, data model), Visitors'
// (sites, identity, account alerts) and Scoring's are gone; their old addresses open Integrations.

export type SettingsTab = "sources" | "sending" | "sender" | "team" | "calendars" | "workspace" | "payments" | "keys" | "profile" | "calendar" | "brand";
/** `line` sits under the page title: one short line, like Twenty. */
export type SettingsGroup = { label: string; tabs: { id: SettingsTab; label: string; line: string }[] };

export const SETTINGS_GROUPS: SettingsGroup[] = [
  { label: "Integrations", tabs: [{ id: "sources", label: "Integrations", line: "The tools your forms send leads to" }] },
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
      { id: "brand", label: "Brand", line: "Your website's look, used by your forms and booking pages" },
      { id: "keys", label: "API keys", line: "Keys for your own code and the CLI" },
    ],
  },
  { label: "Account", tabs: [{ id: "profile", label: "Profile", line: "Your sign-in" }] },
];

/** The page for an address: old names land on their new pages, unknown ones on the first. */
export function settingsTab(id: string): SettingsTab {
  const moved: Record<string, SettingsTab> = { suite: "sources", tools: "sources", domains: "sending" };
  const all = SETTINGS_GROUPS.flatMap((g) => g.tabs.map((t) => t.id));
  return (all as string[]).includes(id) ? (id as SettingsTab) : (moved[id] ?? "sources");
}
